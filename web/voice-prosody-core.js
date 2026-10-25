const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;
function percentile(values,p){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=clamp((sorted.length-1)*p,0,sorted.length-1);
  const lo=Math.floor(index),hi=Math.ceil(index);
  if(lo===hi)return sorted[lo];
  const t=index-lo;
  return sorted[lo]*(1-t)+sorted[hi]*t;
}
function median(values){return percentile(values,0.5);}
function semitoneDelta(a,b){
  if(!(a>0&&b>0))return 0;
  return 12*Math.log2(a/b);
}

function frameRms(samples,start,length){
  let sum=0;
  const end=Math.min(samples.length,start+length);
  if(end<=start)return 0;
  for(let i=start;i<end;i++){const value=samples[i];sum+=value*value;}
  return Math.sqrt(sum/(end-start));
}

function estimatePitch(samples,start,length,sampleRate){
  const end=Math.min(samples.length,start+length);
  const count=end-start;
  if(count<320)return null;
  let avg=0;
  for(let i=start;i<end;i++)avg+=samples[i];
  avg/=count;
  const minLag=Math.max(2,Math.floor(sampleRate/450));
  const maxLag=Math.min(count-8,Math.ceil(sampleRate/70));
  let bestLag=0,bestCorrelation=0;
  const correlations=new Float32Array(maxLag+1);
  for(let lag=minLag;lag<=maxLag;lag++){
    let numerator=0,leftEnergy=0,rightEnergy=0;
    const stop=end-lag;
    for(let i=start;i<stop;i++){
      const left=samples[i]-avg,right=samples[i+lag]-avg;
      numerator+=left*right;leftEnergy+=left*left;rightEnergy+=right*right;
    }
    const denom=Math.sqrt(leftEnergy*rightEnergy);
    if(denom<=1e-9)continue;
    const correlation=numerator/denom;
    correlations[lag]=correlation;
    if(correlation>bestCorrelation){bestCorrelation=correlation;bestLag=lag;}
  }
  if(bestCorrelation<0.58||!bestLag)return null;
  // Autocorrelation often gives almost identical peaks at 1x/2x/3x the true
  // period. Prefer the earliest strong peak so a 220 Hz voice is not mistaken
  // for its ~73 Hz subharmonic.
  const strongThreshold=Math.max(0.58,bestCorrelation*0.985);
  for(let lag=minLag;lag<bestLag;lag++)if(correlations[lag]>=strongThreshold){bestLag=lag;break;}
  const hz=sampleRate/bestLag;
  if(hz<70||hz>450)return null;
  return {hz,confidence:bestCorrelation};
}

export function analyzeProsody(input,{sampleRate=16000}={}){
  const samples=input instanceof Float32Array?input:Float32Array.from(input||[],value=>Number(value)||0);
  if(samples.length<Math.floor(sampleRate*0.22))return null;

  const rmsFrame=Math.max(80,Math.floor(sampleRate*0.02));
  const rmsHop=Math.max(40,Math.floor(sampleRate*0.01));
  const frames=[];
  for(let start=0;start+rmsFrame<=samples.length;start+=rmsHop)frames.push({start,rms:frameRms(samples,start,rmsFrame)});
  if(!frames.length)return null;

  const rmsValues=frames.map(frame=>frame.rms);
  const noiseFloor=percentile(rmsValues,0.20);
  const highLevel=percentile(rmsValues,0.90);
  // If the utterance has real quiet frames, estimate a noise floor from them.
  // For continuous speech with no quiet frames, fall back to a fraction of the
  // utterance level instead of treating the voice itself as background noise.
  const voicedThreshold=noiseFloor<highLevel*0.55
    ? Math.max(0.0065,noiseFloor*2.6)
    : Math.max(0.0065,highLevel*0.35);
  const voicedIndices=[];
  for(let i=0;i<frames.length;i++)if(frames[i].rms>=voicedThreshold)voicedIndices.push(i);
  if(voicedIndices.length<3)return null;

  const firstIndex=voicedIndices[0],lastIndex=voicedIndices[voicedIndices.length-1];
  const spanFrames=frames.slice(firstIndex,lastIndex+1);
  const voicedFrames=spanFrames.filter(frame=>frame.rms>=voicedThreshold);
  const firstSample=frames[firstIndex].start;
  const lastSample=Math.min(samples.length,frames[lastIndex].start+rmsFrame);
  const activeDurationMs=(lastSample-firstSample)/sampleRate*1000;
  if(activeDurationMs<180)return null;

  const pauseRatio=clamp(1-voicedFrames.length/Math.max(1,spanFrames.length),0,1);
  const voicedRatio=clamp(voicedFrames.length/Math.max(1,spanFrames.length),0,1);
  const loudnessRms=mean(voicedFrames.map(frame=>frame.rms));
  const peakRms=Math.max(...voicedFrames.map(frame=>frame.rms));

  const pitchWindow=Math.floor(sampleRate*0.04);
  const pitchHop=Math.max(Math.floor(sampleRate*0.04),Math.floor((lastSample-firstSample)/140));
  const pitches=[];
  for(let start=firstSample;start+pitchWindow<=lastSample;start+=pitchHop){
    const localRms=frameRms(samples,start,pitchWindow);
    if(localRms<voicedThreshold*0.9)continue;
    const estimate=estimatePitch(samples,start,pitchWindow,sampleRate);
    if(estimate)pitches.push({at:start, ...estimate});
  }
  const pitchValues=pitches.map(item=>item.hz);
  const pitchMedianHz=pitchValues.length?median(pitchValues):null;
  const pitchP10=pitchValues.length?percentile(pitchValues,0.10):null;
  const pitchP90=pitchValues.length?percentile(pitchValues,0.90):null;
  const pitchRangeSemitones=pitchP10&&pitchP90?Math.abs(semitoneDelta(pitchP90,pitchP10)):null;
  let pitchVariationSemitones=null;
  if(pitchMedianHz&&pitchValues.length>=3){
    const semitones=pitchValues.map(value=>semitoneDelta(value,pitchMedianHz));
    const avg=mean(semitones);
    pitchVariationSemitones=Math.sqrt(mean(semitones.map(value=>(value-avg)**2)));
  }

  let pitchEndingSemitones=null;
  if(pitches.length>=6){
    const span=Math.max(1,lastSample-firstSample);
    const first=pitches.filter(item=>(item.at-firstSample)/span<=0.38).map(item=>item.hz);
    const last=pitches.filter(item=>(item.at-firstSample)/span>=0.62).map(item=>item.hz);
    if(first.length>=2&&last.length>=2)pitchEndingSemitones=semitoneDelta(median(last),median(first));
  }

  return {
    sampleRate,
    durationMs:Number((samples.length/sampleRate*1000).toFixed(1)),
    activeDurationMs:Number(activeDurationMs.toFixed(1)),
    voicedDurationMs:Number((voicedFrames.length*rmsHop/sampleRate*1000).toFixed(1)),
    voicedRatio:Number(voicedRatio.toFixed(4)),
    pauseRatio:Number(pauseRatio.toFixed(4)),
    loudnessRms:Number(loudnessRms.toFixed(6)),
    peakRms:Number(peakRms.toFixed(6)),
    noiseFloor:Number(noiseFloor.toFixed(6)),
    pitchMedianHz:pitchMedianHz?Number(pitchMedianHz.toFixed(2)):null,
    pitchRangeSemitones:pitchRangeSemitones==null?null:Number(pitchRangeSemitones.toFixed(3)),
    pitchVariationSemitones:pitchVariationSemitones==null?null:Number(pitchVariationSemitones.toFixed(3)),
    pitchEndingSemitones:pitchEndingSemitones==null?null:Number(pitchEndingSemitones.toFixed(3)),
    pitchSamples:pitches.length
  };
}

export function baselineComparison(summary,baseline){
  if(!summary||!baseline||Number(baseline.count||0)<5)return null;
  const relative={};
  if(summary.loudnessRms>0&&baseline.loudnessRms>0)relative.volumeDb=20*Math.log10(summary.loudnessRms/baseline.loudnessRms);
  if(summary.charsPerSecond>0&&baseline.charsPerSecond>0)relative.rateRatio=summary.charsPerSecond/baseline.charsPerSecond;
  if(summary.pitchMedianHz>0&&baseline.pitchMedianHz>0)relative.pitchSemitones=semitoneDelta(summary.pitchMedianHz,baseline.pitchMedianHz);
  if(summary.pitchVariationSemitones!=null&&baseline.pitchVariationSemitones>0.15)relative.variationRatio=summary.pitchVariationSemitones/baseline.pitchVariationSemitones;
  if(Number.isFinite(summary.pauseRatio)&&Number.isFinite(baseline.pauseRatio))relative.pauseDelta=summary.pauseRatio-baseline.pauseRatio;
  return relative;
}

export function updateProsodyBaseline(previous,summary){
  const base=previous&&typeof previous==='object'?{...previous}:{count:0};
  const nextCount=Math.min(10000,Number(base.count||0)+1);
  const alpha=Number(base.count||0)<5?1/nextCount:0.12;
  const update=(key,value)=>{
    if(!Number.isFinite(value))return;
    const old=Number(base[key]);
    base[key]=Number.isFinite(old)?old+(value-old)*alpha:value;
  };
  update('loudnessRms',summary?.loudnessRms);
  update('charsPerSecond',summary?.charsPerSecond);
  update('pauseRatio',summary?.pauseRatio);
  update('pitchMedianHz',summary?.pitchMedianHz);
  update('pitchVariationSemitones',summary?.pitchVariationSemitones);
  base.count=nextCount;
  return base;
}
