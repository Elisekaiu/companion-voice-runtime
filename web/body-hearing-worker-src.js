import * as ort from 'onnxruntime-web/wasm';

// YAMNet (Google, Apache-2.0) converted to ONNX with the original
// waveform frontend baked into the graph. Input is 16 kHz mono float PCM.
const SAMPLE_RATE=16000;
const WINDOW_SAMPLES=15360; // 0.96 s, one native YAMNet frame
const HOP_SAMPLES=7680;     // 0.48 s
const LOCAL_COOLDOWN_MS=4000;

const WATCH=[
  {key:'vocalization',label:'持续人声',members:[{index:22,threshold:0.30},{index:33,threshold:0.30}]},
  {key:'breathing',label:'呼吸声',members:[{index:40,threshold:0.35},{index:36,threshold:0.55}]},
  {key:'gasp',label:'急促吸气',members:[{index:39,threshold:0.40}]},
  {key:'vibration',label:'震动声',singleThreshold:0.68,members:[
    {index:517,threshold:0.35},{index:125,threshold:0.40},
    {index:370,threshold:0.45},{index:376,threshold:0.45},{index:490,threshold:0.45}
  ]},
  {key:'water',label:'水声',singleThreshold:0.62,members:[
    {index:282,threshold:0.35},{index:438,threshold:0.35},{index:439,threshold:0.35},
    {index:291,threshold:0.38},{index:364,threshold:0.40},{index:442,threshold:0.35},
    {index:443,threshold:0.30},{index:444,threshold:0.30},{index:446,threshold:0.35}
  ]},
  {key:'wet',label:'液体/摩擦声',singleThreshold:0.58,members:[{index:441,threshold:0.28},{index:440,threshold:0.30}]},
  {key:'slap',label:'拍击声',singleThreshold:0.64,members:[{index:461,threshold:0.32},{index:454,threshold:0.42},{index:58,threshold:0.45}]}
];

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
    postMessage({type:'ready'});
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
      if(streak[group.key]>=2||instant)hits.push({group,score:best});
    }else{
      streak[group.key]=0;
      continuous[group.key]=false;
    }
  }

  hits.sort((a,b)=>b.score-a.score);
  const now=Date.now();
  for(const {group,score} of hits.slice(0,2)){
    if(now-(lastEmit[group.key]||0)<LOCAL_COOLDOWN_MS)continue;
    const continued=!!continuous[group.key];
    lastEmit[group.key]=now;
    continuous[group.key]=true;
    postMessage({type:'heard',key:group.key,label:group.label,score,continued});
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