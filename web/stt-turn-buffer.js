import {chooseHybridTranscript} from './stt-arbiter.js';

// Provider-level "final" segments are not always the end of the user's thought.
// This buffer waits for conversational silence, combines late provider results,
// and emits one committed turn.
export class SttTurnBuffer {
  constructor({silenceMs=1600,partialTimeoutMs=4200}={}){
    this.silenceMs=silenceMs;
    this.partialTimeoutMs=partialTimeoutMs;
    this.seen=new Set();
    this.lastSpeechAt=0;
    this.reset();
  }

  reset(){
    this.segments={assemblyai:new Map(),tencent:new Map()};
    this.startedAt=0;
    this.updatedAt=0;
  }

  speech(now=Date.now()){this.lastSpeechAt=now;}

  update(provider,{id,text,final=false},now=Date.now()){
    text=String(text||'').trim();
    if(!text||!this.segments[provider])return false;
    const key=provider+':'+id;
    if(this.seen.has(key))return false;
    const prior=this.segments[provider].get(id);
    if(prior?.final&&!final)return false;
    if(prior?.text===text&&prior?.final===final)return false;
    if(!this.startedAt)this.startedAt=now;
    this.updatedAt=now;
    this.segments[provider].set(id,{text,final,key});
    return true;
  }

  get pending(){return this.segments.assemblyai.size+this.segments.tencent.size>0;}

  take(now=Date.now()){
    if(!this.pending||now-Math.max(this.updatedAt,this.lastSpeechAt)<this.silenceMs)return null;
    const tx=[...this.segments.tencent.values()];
    const aa=[...this.segments.assemblyai.values()];
    const all=[...aa,...tx];
    if(all.some(segment=>!segment.final)&&now-this.updatedAt<this.partialTimeoutMs)return null;

    const join=items=>items.map(item=>item.text).join(' ').trim();
    const assemblyText=join(aa),tencentText=join(tx);
    const choice=chooseHybridTranscript({
      assemblyText,
      tencentText,
      tencentCompleted:tx.length>0&&tx.every(item=>item.final)
    });
    if(!choice.text)return null;

    const out={
      ...choice,
      durationMs:Math.max(0,now-this.startedAt),
      segmentCount:all.length,
      candidates:{assemblyai:assemblyText,tencent:tencentText}
    };

    for(const segment of all)this.seen.add(segment.key);
    while(this.seen.size>800)this.seen.delete(this.seen.values().next().value);
    this.reset();
    return out;
  }
}
