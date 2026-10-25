import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

export class CodexAppServer extends EventEmitter {
  constructor({command,cwd='/workspace',env=process.env,requestTimeout=60000}={}) {
    super();
    this.command=command;
    this.cwd=cwd;
    this.env=env;
    this.requestTimeout=requestTimeout;
    this.pending=new Map();
    this.nextId=0;
    this.closed=false;
  }

  async start() {
    this.child=spawn(this.command,['app-server','--listen','stdio://',
      '-c','features.shell_tool=false',
      '-c','sandbox_mode="read-only"'
    ],{cwd:this.cwd,env:this.env,stdio:['pipe','pipe','pipe']});
    let buffer='';
    this.child.stdout.on('data',chunk=>{
      buffer+=chunk.toString();
      if(buffer.length>32*1024*1024){ this.child.kill(); return; }
      let index;
      while((index=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,index); buffer=buffer.slice(index+1);
        try{ this.receive(JSON.parse(line)); }catch{}
      }
    });
    this.child.stderr.on('data',chunk=>this.emit('diagnostic',String(chunk).slice(0,1000)));
    this.child.on('error',error=>this.closePending(error));
    this.child.on('exit',()=>this.closePending(new Error('codex_disconnected')));
    await this.request('initialize',{clientInfo:{name:'codex_call_vps',title:'Private Codex Call',version:'0.2.0'},capabilities:{experimentalApi:false}});
    this.notify('initialized',{});
    const account=await this.request('account/read',{refreshToken:false});
    if(!account.account) throw new Error('codex_login_required');
    const models=await this.request('model/list',{});
    this.models=(models.data||[]).filter(m=>!m.hidden);
    return {models:this.models};
  }

  receive(message) {
    if(message.method && message.id!==undefined){
      const result=message.method==='item/commandExecution/requestApproval'||message.method==='item/fileChange/requestApproval'
        ? {decision:'decline'} : message.method==='item/permissions/requestApproval' ? {permissions:{},scope:'turn'} : null;
      this.write(result?{id:message.id,result}:{id:message.id,error:{code:-32601,message:'Interactive tools are disabled for calls'}});
      return;
    }
    if(message.id!==undefined){
      const pending=this.pending.get(message.id); if(!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if(message.error) pending.reject(Object.assign(new Error('codex_rpc_error'),{details:message.error}));
      else pending.resolve(message.result);
      return;
    }
    if(message.method) this.emit('notification',message.method,message.params||{});
  }

  write(message) {
    if(this.closed) throw new Error('codex_disconnected');
    this.child.stdin.write(JSON.stringify(message)+'\n');
  }
  notify(method,params){ this.write({method,params}); }
  request(method,params={},timeout=this.requestTimeout) {
    if(this.closed) return Promise.reject(new Error('codex_disconnected'));
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id); reject(new Error('codex_request_timeout'));},timeout);
      this.pending.set(id,{resolve,reject,timer});
      try{this.write({id,method,params});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }

  async newThread({model,developerInstructions}={}) {
    const result=await this.request('thread/start',{
      cwd:this.cwd,
      sandbox:'read-only',
      approvalPolicy:'never',
      serviceName:'codex_call_vps',
      ...(model?{model}:{}),
      ...(developerInstructions?{developerInstructions}:{})
    });
    if(!result.thread?.id) throw new Error('codex_thread_id_missing');
    return result.thread.id;
  }

  async turn(threadId,text,{model,effort='low',onStarted=()=>{},onDelta=()=>{},signal,timeout=300000}={}) {
    let turnId=null, finish, fail, finalText='';
    const done=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
    done.catch(()=>{});
    const listener=(method,params)=>{
      if(params.threadId!==threadId) return;
      if(turnId&&params.turnId&&params.turnId!==turnId) return;
      if(method==='item/agentMessage/delta'){
        const delta=typeof params.delta==='string'?params.delta:(params.delta?.text||'');
        if(delta){ finalText+=delta; onDelta(delta); }
      }
      if(method==='item/completed'&&params.item?.type==='agentMessage'&&params.item?.phase==='final_answer'&&!finalText){
        finalText=params.item.text||'';
        if(finalText) onDelta(finalText);
      }
      if(method==='turn/completed'&&(!turnId||params.turn?.id===turnId)){
        params.turn?.status==='completed'?finish():fail(new Error('codex_turn_'+(params.turn?.status||'failed')));
      }
    };
    const disconnected=()=>fail(new Error('codex_disconnected'));
    const aborted=()=>fail(Object.assign(new Error('turn_aborted'),{name:'AbortError'}));
    this.on('notification',listener); this.on('disconnected',disconnected);
    signal?.addEventListener('abort',aborted,{once:true});
    const timer=setTimeout(()=>fail(new Error('codex_turn_timeout')),timeout);
    try{
      const result=await this.request('turn/start',{threadId,input:[{type:'text',text}],...(model?{model}:{}),effort,sandboxPolicy:{type:'readOnly'}});
      turnId=result.turn?.id;
      if(!turnId) throw new Error('codex_turn_id_missing');
      onStarted(turnId);
      await done;
      return {text:finalText.trim(),turnId};
    } catch(error) {
      if(turnId&&!this.closed) await this.request('turn/interrupt',{threadId,turnId},10000).catch(()=>{});
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort',aborted);
      this.off('notification',listener); this.off('disconnected',disconnected);
    }
  }

  closePending(error=new Error('codex_disconnected')) {
    if(this.closed) return;
    this.closed=true;
    for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(error);}
    this.pending.clear();
    this.emit('disconnected');
  }
  stop(){this.child?.kill('SIGTERM');}
}
