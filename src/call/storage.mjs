import fs from 'node:fs';
import path from 'node:path';

export class CallStorage {
  constructor(dir){this.dir=dir;fs.mkdirSync(dir,{recursive:true});}
  file(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('invalid_call_id');return path.join(this.dir,id+'.json');}
  save(call){
    const data=JSON.stringify({
      schema:2,id:call.id,direction:call.direction,state:call.state,createdAt:call.createdAt,
      startedAt:call.startedAt,endedAt:call.endedAt,generation:call.generation,turnId:call.turnId,
      ttsModel:call.ttsModel||null,ttsTone:call.ttsTone||null,ringExpiresAt:call.ringExpiresAt||null,ringReason:call.ringReason||null,
      codexThreadId:call.codexThreadId||null,title:call.title||null,transcript:call.transcript,audioSegments:Array.isArray(call.audioSegments)?call.audioSegments:[]
    },null,2);
    const target=this.file(call.id), temp=target+'.tmp';
    fs.writeFileSync(temp,data,{mode:0o600}); fs.renameSync(temp,target);
  }
  load(id){return JSON.parse(fs.readFileSync(this.file(id),'utf8'));}
  list(){return fs.readdirSync(this.dir).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(this.dir,x),'utf8')));}
}
