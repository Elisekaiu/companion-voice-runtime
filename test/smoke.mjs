import fs from 'node:fs';
import assert from 'node:assert/strict';

const base=process.env.CODEX_CALL_BASE||'http://127.0.0.1:8848/call';
const browserUA=process.env.CODEX_CALL_BROWSER_UA||'';
const maybeUA=browserUA?{'user-agent':browserUA}:{};
const denied=await fetch(base+'/api/calls',{method:'POST',headers:{'content-type':'application/json',...maybeUA},body:'{}'});
assert.equal(denied.status,401);
const token=fs.readFileSync('data/secrets/call-access-token','utf8').trim();
const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json',...maybeUA},body:JSON.stringify({token})});
assert.equal(auth.status,200);
const cookie=auth.headers.get('set-cookie').split(';')[0];
const request=async(path,body={})=>{
  const res=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',cookie,...maybeUA},body:JSON.stringify(body)});
  if(!res.ok)throw new Error(path+' failed: '+await res.text());
  return res.json();
};
const created=await request('/api/calls',{direction:'outgoing'}),id=created.call.id;
await request('/api/calls/'+id+'/answer');
const stream=await fetch(base+'/api/calls/'+id+'/events',{headers:{cookie,...maybeUA}});
const reader=stream.body.getReader();let buffer='',done=false,deltaSeen=false,answer='';
const timeout=setTimeout(()=>reader.cancel(),90000);
const read=(async()=>{while(!done){const part=await reader.read();if(part.done)break;buffer+=new TextDecoder().decode(part.value);
  let index;while((index=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,index);buffer=buffer.slice(index+2);
    const event=block.match(/^event: (.+)$/m)?.[1],data=block.match(/^data: (.+)$/m)?.[1];if(!data)continue;const value=JSON.parse(data);
    if(event==='assistant_delta')deltaSeen=deltaSeen||!!value.delta;
    if(event==='assistant_done'){answer=value.text;done=true;break;}
    if(event==='error')throw new Error(value.code);
  }
}})();
await request('/api/calls/'+id+'/stt',{type:'voice_start'});
await request('/api/calls/'+id+'/stt',{type:'committed',text:'这是部署连通性测试。请只回复：通话测试成功。',voiceDurationMs:1600});
await read;clearTimeout(timeout);await reader.cancel();
assert.ok(deltaSeen,'no streamed model delta');
assert.match(answer,/通话测试成功/);
await request('/api/calls/'+id+'/hangup',{reason:'smoke_complete'});
console.log(JSON.stringify({ok:true,callId:id,unauthorizedRejected:true,streamedText:true,answer,persistedFile:'data/calls/'+id+'.json'}));
process.exit(0);
