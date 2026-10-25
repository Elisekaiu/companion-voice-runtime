// This is deliberately NOT an emotion/body-state classifier.
// It only decides whether TTS delivery should temporarily use a closer voice preset.
// Public defaults stay general; deployments can extend the vocabulary privately.
const STRONG_INTIMATE_RE=/(?:亲密一点|贴近一点|靠近一点|耳边说|贴着耳边|小声一点|轻声一点|低声一点|再近一点|whisper|close voice|intimate voice|closer voice)/i;
const EXIT_RE=/(?:恢复正常|正常说|不用耳语|别小声了|别贴耳了|回到正常|normal voice|stop whispering)/i;

function cleanNonverbal(text=''){
  return String(text).trim().replace(/\s+/g,' ').slice(0,24);
}

export class IntimacyState {
  constructor({holdTurns=3,maxNonverbals=4}={}){
    this.holdTurns=holdTurns;
    this.maxNonverbals=maxNonverbals;
    this.active=false;
    this.remaining=0;
    this.pendingNonverbals=[];
  }

  observeUser(text=''){
    const before=this.active;
    const value=String(text||'');
    if(EXIT_RE.test(value)){
      this.active=false;
      this.remaining=0;
    }else if(STRONG_INTIMATE_RE.test(value)){
      this.active=true;
      this.remaining=this.holdTurns;
    }else if(this.active){
      this.remaining=Math.max(0,this.remaining-1);
      if(this.remaining===0)this.active=false;
    }
    return {active:this.active,changed:this.active!==before};
  }

  observeAssistant(text=''){
    const before=this.active;
    if(STRONG_INTIMATE_RE.test(String(text||''))){
      this.active=true;
      this.remaining=Math.max(this.remaining,2);
    }
    return {active:this.active,changed:this.active!==before};
  }

  noteNonverbal(text=''){
    const value=cleanNonverbal(text);
    if(!value)return;
    this.pendingNonverbals.push(value);
    if(this.pendingNonverbals.length>this.maxNonverbals){
      this.pendingNonverbals.splice(0,this.pendingNonverbals.length-this.maxNonverbals);
    }
  }

  consumeNonverbals(){
    const items=this.pendingNonverbals.slice();
    this.pendingNonverbals.length=0;
    return items;
  }
}
