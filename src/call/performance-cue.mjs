const KISS_INTENT_RE=/(?:亲亲|亲我|亲你|亲一下|亲一口|再亲|多亲|吻一下|想亲|给我亲|啵一下|啵啵|kiss me)/i;
const KISS_SEQUENCE_RE=/(?:多亲|一直亲|亲久|再亲|亲好多|连续亲|多亲几下|keep kissing)/i;

const RHYTHM_START_RE=/(?:开始节奏|跟着节奏|保持这个节奏|来点节奏|start rhythm|keep the rhythm)/i;
const RHYTHM_CONTINUE_RE=/(?:继续|还要|再来|别停|不要停|不停|就这样|保持|这样就好|对就这样|再一下|再多一点)/i;
const RHYTHM_STOP_RE=/(?:停|停下|先停|别动|等等|等一下|慢下来停|stop)/i;
const RHYTHM_MEDIUM_RE=/(?:慢点|慢一点|轻点|轻一点|慢慢|缓一点|温柔一点)/i;
const RHYTHM_FASTEST_RE=/(?:最快|再快|更快|加到最快|fastest)/i;
const RHYTHM_FASTER_RE=/(?:快点|快一点|加速|再快一点|faster)/i;
const HIGH_INTENSITY_RE=/(?:更强一点|再强一点|更快|再快|别停|不要停|stronger|more intense)/i;

const BREATHLIKE_RE=/(?:持续人声|呼吸声|急促吸气|vocalization|breathing|gasp)/i;
const RHYTHMLIKE_RE=/(?:拍击声|拍打声|slap|thump)/i;
const IRRELEVANT_BODY_RE=/(?:水声|液体声|震动声|液体\/摩擦声|water|vibration|buzz|liquid|splash|slosh|squish)/i;

function rhythmVariant(text,current='fast'){
  if(RHYTHM_MEDIUM_RE.test(text))return 'medium';
  if(RHYTHM_FASTEST_RE.test(text))return 'fastest';
  if(RHYTHM_FASTER_RE.test(text))return current==='fastest'?'fastest':'faster';
  return current||'fast';
}
function heardKinds(items=[]){
  const values=Array.isArray(items)?items.map(String):[];
  return {
    breathlike:values.some(x=>BREATHLIKE_RE.test(x)),
    rhythmic:values.some(x=>RHYTHMLIKE_RE.test(x)),
    irrelevant:values.some(x=>IRRELEVANT_BODY_RE.test(x))
  };
}

export class PerformanceState{
  constructor(){
    this.level=0;this.lastCueTurn=0;this.lastCueType=null;
    this.rhythmActive=false;this.rhythmVariant='fast';this.rhythmHold=0;
    this.lastBreathTurn=0;
  }
  reset(){
    this.level=0;this.lastCueTurn=0;this.lastCueType=null;
    this.rhythmActive=false;this.rhythmVariant='fast';this.rhythmHold=0;
    this.lastBreathTurn=0;
  }
  plan({text='',intimate=false,turnId=0,heardNonverbals=[]}={}){
    const spoken=String(text||'').trim(),turn=Math.abs(Number(turnId)||0);
    const heard=heardKinds(heardNonverbals);

    if(KISS_INTENT_RE.test(spoken)){
      const sequence=KISS_SEQUENCE_RE.test(spoken);
      this.level=Math.max(this.level,intimate?2:1);
      this.lastCueTurn=turn;this.lastCueType='kiss';
      return {type:'kiss',variant:sequence?'sequence':'single',placement:'tail',intensity:sequence?0.74:0.48,level:this.level};
    }

    if(!intimate){
      this.level=Math.max(0,this.level-2);
      this.rhythmActive=false;this.rhythmHold=0;
      return null;
    }

    if(RHYTHM_STOP_RE.test(spoken)){
      this.rhythmActive=false;this.rhythmHold=0;
    }

    if(this.level===0)this.level=1;
    if(HIGH_INTENSITY_RE.test(spoken))this.level=3;
    else if(RHYTHM_START_RE.test(spoken))this.level=Math.max(this.level,2);
    else if(heard.breathlike||heard.rhythmic)this.level=Math.min(3,this.level+1);
    else if(turn-this.lastCueTurn>2)this.level=Math.max(1,this.level-1);

    const startsRhythm=RHYTHM_START_RE.test(spoken);
    const continuesRhythm=this.rhythmActive&&RHYTHM_CONTINUE_RE.test(spoken);
    const changesPace=this.rhythmActive&&(RHYTHM_MEDIUM_RE.test(spoken)||RHYTHM_FASTER_RE.test(spoken)||RHYTHM_FASTEST_RE.test(spoken));
    const reinforcesRhythm=this.rhythmActive&&heard.rhythmic;
    if(startsRhythm||continuesRhythm||changesPace||reinforcesRhythm){
      this.rhythmActive=true;
      this.rhythmVariant=rhythmVariant(spoken,this.rhythmVariant);
      this.rhythmHold=startsRhythm?3:Math.max(this.rhythmHold,2);
      const intensity={medium:0.46,fast:0.61,faster:0.76,fastest:0.91}[this.rhythmVariant];
      this.lastCueTurn=turn;this.lastCueType='rhythm';
      return {type:'rhythm',variant:this.rhythmVariant,placement:'underlay',intensity,level:this.level,continuation:!startsRhythm};
    }

    if(this.rhythmActive&&this.rhythmHold>0&&!RHYTHM_STOP_RE.test(spoken)){
      this.rhythmHold-=1;
      const affirming=/^(?:(?:嗯|啊|哦|噢|唔){1,10}|好+|对+|喜欢|还要|继续)[。！!？?…~～]*$/i.test(spoken);
      if(affirming&&turn-this.lastCueTurn>=1){
        const intensity={medium:0.42,fast:0.56,faster:0.69,fastest:0.82}[this.rhythmVariant];
        this.lastCueTurn=turn;this.lastCueType='rhythm';
        return {type:'rhythm',variant:this.rhythmVariant,placement:'underlay',intensity,level:this.level,continuation:true};
      }
    }else if(this.rhythmHold<=0){
      this.rhythmActive=false;
    }

    // Detected sound classes stay observations. Water/liquid/vibration never
    // imply a body state and never directly trigger a breath cue.
    if(heard.breathlike&&turn-this.lastBreathTurn>=1){
      const variant=this.level>=3?'strong':'restrained';
      this.lastCueTurn=turn;this.lastCueType='breath';this.lastBreathTurn=turn;
      return {type:'breath',variant,placement:this.level>=3?'between':'tail',intensity:this.level>=3?0.76:0.50,level:this.level};
    }

    if(heard.irrelevant||this.lastCueTurn===turn-1)return null;
    const pattern=this.level>=3?[0,1,0,0,1,0,0,0]:this.level===2?[0,0,1,0,0,0,1,0]:[0,0,0,1,0,0,0,0];
    if(!pattern[turn%pattern.length])return null;
    const variant=this.level>=3?'strong':this.level===2?'restrained':'soft';
    this.lastCueTurn=turn;this.lastCueType='breath';this.lastBreathTurn=turn;
    return {type:'breath',variant,placement:this.level>=3?'between':'tail',intensity:this.level>=3?0.68:this.level===2?0.46:0.30,level:this.level};
  }
}

export function planPerformanceCue(args){return new PerformanceState().plan(args);}
