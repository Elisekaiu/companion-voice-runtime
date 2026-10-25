import { analyzeProsody } from './voice-prosody-core.js';

const SAMPLE_RATE=16000;
const PRE_ROLL_SAMPLES=8000;
const MAX_TURN_SAMPLES=SAMPLE_RATE*30;

let enabled=true;
let active=false;
let turnChunks=[];
let turnSamples=0;
const preRoll=new Int16Array(PRE_ROLL_SAMPLES);
let preIndex=0,preCount=0;

function pushPreRoll(pcm){
  for(let i=0;i<pcm.length;i++){
    preRoll[preIndex]=pcm[i];
    preIndex=(preIndex+1)%PRE_ROLL_SAMPLES;
    if(preCount<PRE_ROLL_SAMPLES)preCount++;
  }
}
function snapshotPreRoll(){
  const out=new Int16Array(preCount);
  if(!preCount)return out;
  const start=(preIndex-preCount+PRE_ROLL_SAMPLES)%PRE_ROLL_SAMPLES;
  for(let i=0;i<preCount;i++)out[i]=preRoll[(start+i)%PRE_ROLL_SAMPLES];
  return out;
}
function resetTurn(){
  active=false;
  turnChunks=[];
  turnSamples=0;
}
function startTurn(){
  if(!enabled||active)return;
  active=true;
  turnChunks=[];
  turnSamples=0;
  const pre=snapshotPreRoll();
  if(pre.length){turnChunks.push(pre);turnSamples+=pre.length;}
}
function appendTurn(pcm){
  if(!active||!pcm.length)return;
  const copy=new Int16Array(pcm);
  turnChunks.push(copy);
  turnSamples+=copy.length;
  while(turnSamples>MAX_TURN_SAMPLES&&turnChunks.length>1){
    const removed=turnChunks.shift();
    turnSamples-=removed.length;
  }
}
function finishTurn(requestId){
  if(!active||!turnSamples){
    resetTurn();
    postMessage({type:'summary',requestId,summary:null});
    return;
  }
  const merged=new Int16Array(turnSamples);
  let offset=0;
  for(const chunk of turnChunks){merged.set(chunk,offset);offset+=chunk.length;}
  const floats=new Float32Array(merged.length);
  for(let i=0;i<merged.length;i++)floats[i]=merged[i]/32768;
  let summary=null;
  try{summary=analyzeProsody(floats,{sampleRate:SAMPLE_RATE});}
  catch(error){postMessage({type:'error',message:String(error?.message||error)});}
  resetTurn();
  postMessage({type:'summary',requestId,summary});
}

self.onmessage=event=>{
  const data=event.data||{};
  if(data.type==='enable'){enabled=true;postMessage({type:'ready'});return;}
  if(data.type==='disable'){enabled=false;resetTurn();return;}
  if(data.type==='start'){startTurn();return;}
  if(data.type==='reset'){resetTurn();return;}
  if(data.type==='finish'){finishTurn(data.requestId);return;}
  if(data.type==='pcm'&&enabled&&data.buffer){
    const pcm=new Int16Array(data.buffer);
    pushPreRoll(pcm);
    appendTurn(pcm);
  }
};
postMessage({type:'ready'});
