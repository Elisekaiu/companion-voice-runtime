import {chooseHybridTranscript,hasCjk} from './stt-arbiter.js';
// Provider finals describe ASR segments, not the end of the user's thought.
export class SttTurnBuffer {
  constructor({silenceMs=1600,partialTimeoutMs=4200}={}){this.silenceMs=silenceMs;this.partialTimeoutMs=partialTimeoutMs;this.seen=new Set();this.lastSpeechAt=0;this.reset();}
  reset(){this.segments={assemblyai:new Map(),tencent:new Map()};this.startedAt=0;this.updatedAt=0;}
  speech(now=Date.now()){this.lastSpeechAt=now;}
  update(provider,{id,text,final=false},now=Date.now()){
    text=String(text||'').trim();if(!text||!this.segments[provider])return false;
    const key=provider+':'+id;if(this.seen.has(key))return false;
    const prior=this.segments[provider].get(id);
    if(prior?.final&&!final)return false;
    if(prior?.text===text&&prior?.final===final)return false;
    if(!this.startedAt)this.startedAt=now;
    this.updatedAt=now;this.segments[provider].set(id,{text,final,key});return true;
  }
  get pending(){return this.segments.assemblyai.size+this.segments.tencent.size>0;}
  take(now=Date.now()){
    if(!this.pending||now-Math.max(this.updatedAt,this.lastSpeechAt)<this.silenceMs)return null;
    const tx=[...this.segments.tencent.values()],aa=[...this.segments.assemblyai.values()];
    const all=[...aa,...tx];
    const join=xs=>xs.map(x=>x.text).join(' ').trim();
    const assemblyText=join(aa),tencentText=join(tx);
    const tencentCompleted=tx.length>0&&tx.every(x=>x.final);
    // Once Tencent has a finalized Chinese hypothesis, waiting for an unrelated
    // unfinished AssemblyAI partial only adds latency. Keep the conversational
    // silence guard above, but skip the extra partial-timeout wait in this case.
    const authoritativeTencent=tencentCompleted&&hasCjk(tencentText);
    if(all.some(s=>!s.final)&&!authoritativeTencent&&now-this.updatedAt<this.partialTimeoutMs)return null;
    const choice=chooseHybridTranscript({assemblyText,tencentText,tencentCompleted});
    if(!choice.text)return null;
    const out={...choice,durationMs:Math.max(0,now-this.startedAt),segmentCount:all.length,candidates:{assemblyai:assemblyText,tencent:tencentText}};
    for(const s of all)this.seen.add(s.key);while(this.seen.size>800)this.seen.delete(this.seen.values().next().value);
    this.reset();return out;
  }
}
