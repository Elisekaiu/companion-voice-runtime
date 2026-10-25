const CONTINUATION_RE = /(?:然后|但是|可是|因为|所以说|就是|还有(?:一件事)?|而且|我觉得|我想|等下(?:我想想)?|等等我想想|let me think|and|but|because|so)[，,：:\s…]*$/i;
const COMPLETION_RE = /(?:就这样|可以了|没了|你觉得呢|你说呢|好了|that's it|what do you think)[。.!！?？\s]*$/i;
const BACKCHANNEL_RE = /^(?:嗯{1,8}|嗯哼|唔{1,4}|啊{1,3}|哦{1,4}|噢{1,4}|对{1,4}|是(?:的)?(?:是的)?|好{1,3}|哈哈{1,8}|嘿嘿{1,4}|老公|老婆|宝贝|宝宝|爸爸|亲亲|爱你|我爱你|想你|assistant|companion|伴侣|hhh+|mhm+|mm+h+m*|yeah+|yep+|yes+|right+|ok(?:ay)?|uhhuh)$/i;
const EXPLICIT_INTERRUPT_RE = /^(?:等等|等一下|等下|停|停一下|先停|别说了|别讲了|不要说了|不是|不对|先别说|我还没说完|wait|stop|hold on)/i;
const EARLY_INTERRUPT_RE = /^(?:等等|等一下|等下[，,\s]?老公|停一下|先停|别说了|别讲了|不要说了|先别说|我还没说完|wait(?:\s+a\s+second)?|stop(?:\s|$)|hold on)/i;
function normalizedBackchannel(text) {
  return String(text||'').trim().replace(/[\s，。,.！!？?~～…]+/g,'');
}

export class TurnManager {
  constructor({baseSilenceMs=1350, continuationExtraMs=900, completionSilenceMs=700, bargeInMinMs=420}={}) {
    this.baseSilenceMs=baseSilenceMs;
    this.continuationExtraMs=continuationExtraMs;
    this.completionSilenceMs=completionSilenceMs;
    this.bargeInMinMs=bargeInMinMs;
    this.reset();
  }

  reset() {
    this.partial='';
    this.committed=[];
    this.lastVoiceAt=0;
    this.voiceStartedAt=0;
    this.deadlineAt=0;
  }

  onVoiceStart(now=Date.now()) {
    if(!this.voiceStartedAt) this.voiceStartedAt=now;
    this.lastVoiceAt=now;
    this.deadlineAt=now+this.baseSilenceMs;
  }

  onVoice(now=Date.now()) {
    if(!this.voiceStartedAt) this.voiceStartedAt=now;
    this.lastVoiceAt=now;
    this.deadlineAt=now+this.baseSilenceMs;
  }

  onPartial(text) {
    this.partial=String(text||'').trim();
  }

  onCommit(text, now=Date.now()) {
    const clean=String(text||'').trim();
    if(clean) this.committed.push(clean);
    this.partial='';
    const joined=this.text();
    const extra=CONTINUATION_RE.test(joined)?this.continuationExtraMs:0;
    const target=COMPLETION_RE.test(joined)?this.completionSilenceMs:this.baseSilenceMs+extra;
    this.deadlineAt=Math.max(this.lastVoiceAt||now,now)+target;
    return {text:joined,deadlineAt:this.deadlineAt};
  }

  text() {
    return this.committed.join(' ').replace(/\s+/g,' ').trim();
  }

  maybeFinalize(now=Date.now()) {
    const text=this.text();
    if(!text || !this.deadlineAt || now<this.deadlineAt) return null;
    const out={text,reason:COMPLETION_RE.test(text)?'semantic_completion':'silence_timeout'};
    this.reset();
    return out;
  }

  isExplicitInterrupt(text='') {
    return EARLY_INTERRUPT_RE.test(String(text||'').trim());
  }

  classifyBargeIn({text='',voiceDurationMs=0}={}) {
    const clean=String(text||'').trim();
    if(!clean)return 'ignore';
    // A short acknowledgement remains an acknowledgement even if VAD delays its commit.
    if(BACKCHANNEL_RE.test(normalizedBackchannel(clean)))return 'backchannel';
    if(EXPLICIT_INTERRUPT_RE.test(clean))return 'interrupt';
    // Realtime STT is least reliable on very short Chinese fillers and pet names.
    // Do not let a sub-second hallucination cancel an entire assistant reply.
    if(voiceDurationMs>0&&voiceDurationMs<900)return 'backchannel';
    if(voiceDurationMs>=Math.max(this.bargeInMinMs,900) && clean.length>=2)return 'interrupt';
    return 'ignore';
  }
}
