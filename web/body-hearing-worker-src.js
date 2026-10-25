import * as ort from 'onnxruntime-web/wasm';
import {HEARING_GROUPS} from './hearing-catalog.js';

// Hearing v2: YAMNet (Google, Apache-2.0) runs fully on-device.
// Input is 16 kHz mono float PCM. We keep the native 0.96 s window for
// low-latency transient sounds and use overlapping hops for continuity.
const SAMPLE_RATE=16000;
const WINDOW_SAMPLES=15360; // 0.96 s
const HOP_SAMPLES=7680;     // 0.48 s

// minStreak=1 is reserved for short/transient events and paired with a
// higher singleThreshold to avoid noisy one-frame false positives.
// Ambient sounds generally need two consecutive windows.
const WATCH=HEARING_GROUPS;

ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths='/call/ort/';

let session=null;
let enabled=false;
let loading=null;
let pumping=false;
let queue=new Float32Array(48000);
let queueLength=0;
const streak=Object.create(null);
const lastEmit=Object.create(null);
const continuous=Object.create(null);

async function ensureSession(){
  if(session)return session;
  if(loading)return loading;
  loading=(async()=>{
    session=await ort.InferenceSession.create('/call/models/yamnet.onnx',{
      executionProviders:['wasm'],
      graphOptimizationLevel:'all'
    });
    if(!session.inputNames.includes('waveform'))throw new Error('yamnet_waveform_input_missing');
    postMessage({type:'ready',groups:WATCH.length});
    return session;
  })().catch(error=>{
    loading=null;
    postMessage({type:'error',message:String(error?.message||error)});
    throw error;
  });
  return loading;
}

function resetDetections(){
  queueLength=0;
  for(const key of Object.keys(streak))delete streak[key];
  for(const key of Object.keys(continuous))delete continuous[key];
}

function appendPcm(buffer){
  const pcm=new Int16Array(buffer);
  if(!pcm.length)return;
  if(queueLength+pcm.length>queue.length){
    const keep=Math.min(queueLength,WINDOW_SAMPLES);
    if(keep)queue.copyWithin(0,queueLength-keep,queueLength);
    queueLength=keep;
  }
  const room=queue.length-queueLength;
  const count=Math.min(room,pcm.length);
  for(let i=0;i<count;i++)queue[queueLength++]=pcm[i]/32768;
}

function scoreTargets(scores){
  const hits=[];
  for(const group of WATCH){
    let best=0,above=false;
    for(const member of group.members){
      const value=Number(scores[member.index]||0);
      if(value>best)best=value;
      if(value>=member.threshold)above=true;
    }
    if(above){
      streak[group.key]=(streak[group.key]||0)+1;
      const instant=Number.isFinite(group.singleThreshold)&&best>=group.singleThreshold;
      if(streak[group.key]>=Number(group.minStreak||2)||instant)hits.push({group,score:best});
    }else{
      streak[group.key]=0;
      continuous[group.key]=false;
    }
  }

  hits.sort((a,b)=>b.score-a.score);
  const now=Date.now();
  for(const {group,score} of hits.slice(0,3)){
    const cooldown=Number(group.cooldownMs||10000);
    if(now-(lastEmit[group.key]||0)<cooldown)continue;
    const continued=!!continuous[group.key];
    lastEmit[group.key]=now;
    continuous[group.key]=true;
    postMessage({type:'heard',key:group.key,label:group.label,kind:group.kind||'ambient',score,continued});
  }
}

async function classify(wave){
  const model=await ensureSession();
  const input=new ort.Tensor('float32',wave,[wave.length]);
  const result=await model.run({waveform:input});
  const output=result.output_0||result[model.outputNames[0]];
  const scores=output?.data;
  if(!scores||scores.length<521)throw new Error('yamnet_scores_missing');
  scoreTargets(scores);
}

async function pump(){
  if(pumping||!enabled)return;
  pumping=true;
  try{
    while(enabled&&queueLength>=WINDOW_SAMPLES){
      const wave=new Float32Array(WINDOW_SAMPLES);
      wave.set(queue.subarray(0,WINDOW_SAMPLES));
      queue.copyWithin(0,HOP_SAMPLES,queueLength);
      queueLength-=HOP_SAMPLES;
      await classify(wave);
    }
  }catch(error){
    postMessage({type:'error',message:String(error?.message||error)});
  }finally{
    pumping=false;
    if(enabled&&queueLength>=WINDOW_SAMPLES)queueMicrotask(pump);
  }
}

self.onmessage=event=>{
  const data=event.data||{};
  if(data.type==='enable'){
    enabled=true;
    ensureSession().catch(()=>{});
    return;
  }
  if(data.type==='disable'){
    enabled=false;
    resetDetections();
    return;
  }
  if(data.type==='reset'){
    resetDetections();
    return;
  }
  if(data.type==='pcm'&&enabled&&data.buffer){
    appendPcm(data.buffer);
    pump();
  }
};
