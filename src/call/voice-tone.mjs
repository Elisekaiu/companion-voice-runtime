const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,min,max)=>{
  const number=Number(value);
  return Number.isFinite(number)?clamp(number,min,max):null;
};

export function sanitizeVoiceTone(input){
  if(!input||typeof input!=='object')return null;
  const relativeInput=input.relative&&typeof input.relative==='object'?input.relative:null;
  const out={
    durationMs:finite(input.durationMs,0,60000),
    activeDurationMs:finite(input.activeDurationMs,0,60000),
    voicedDurationMs:finite(input.voicedDurationMs,0,60000),
    pauseRatio:finite(input.pauseRatio,0,1),
    loudnessRms:finite(input.loudnessRms,0,1),
    peakRms:finite(input.peakRms,0,1),
    pitchMedianHz:finite(input.pitchMedianHz,50,600),
    pitchRangeSemitones:finite(input.pitchRangeSemitones,0,36),
    pitchVariationSemitones:finite(input.pitchVariationSemitones,0,18),
    pitchEndingSemitones:finite(input.pitchEndingSemitones,-18,18),
    pitchSamples:finite(input.pitchSamples,0,5000),
    charsPerSecond:finite(input.charsPerSecond,0,20),
    transcriptChars:finite(input.transcriptChars,0,2000),
    baselineCount:finite(input.baselineCount,0,10000),
    relative:relativeInput?{
      volumeDb:finite(relativeInput.volumeDb,-30,30),
      rateRatio:finite(relativeInput.rateRatio,0.1,5),
      pitchSemitones:finite(relativeInput.pitchSemitones,-18,18),
      variationRatio:finite(relativeInput.variationRatio,0.1,8),
      pauseDelta:finite(relativeInput.pauseDelta,-1,1)
    }:null
  };
  if((out.activeDurationMs||0)<180)return null;
  return out;
}

export function describeVoiceTone(raw){
  const tone=sanitizeVoiceTone(raw);
  if(!tone)return null;
  const facts=[];
  const relativeFacts=[];
  const rel=tone.baselineCount>=5?tone.relative:null;

  if(rel){
    if(rel.volumeDb!=null&&rel.volumeDb<=-4)relativeFacts.push('声音比她平时明显轻');
    else if(rel.volumeDb!=null&&rel.volumeDb>=4)relativeFacts.push('声音比她平时明显响');
    if(rel.rateRatio!=null&&rel.rateRatio<=0.78)relativeFacts.push('语速比她平时慢');
    else if(rel.rateRatio!=null&&rel.rateRatio>=1.28)relativeFacts.push('语速比她平时快');
    if(rel.pauseDelta!=null&&rel.pauseDelta>=0.12)relativeFacts.push('停顿比她平时多');
    else if(rel.pauseDelta!=null&&rel.pauseDelta<=-0.12)relativeFacts.push('停顿比她平时少');
    if(rel.variationRatio!=null&&rel.variationRatio>=1.55)relativeFacts.push('音高起伏比她平时更大');
    else if(rel.variationRatio!=null&&rel.variationRatio<=0.62)relativeFacts.push('音高起伏比她平时更平');
    if(rel.pitchSemitones!=null&&rel.pitchSemitones>=2.5)relativeFacts.push('整体音调比她平时高');
    else if(rel.pitchSemitones!=null&&rel.pitchSemitones<=-2.5)relativeFacts.push('整体音调比她平时低');
  }

  facts.push(...relativeFacts);
  if(!relativeFacts.length){
    if(tone.charsPerSecond!=null&&tone.charsPerSecond<=1.7)facts.push('这一句说得比较慢');
    else if(tone.charsPerSecond!=null&&tone.charsPerSecond>=5.2)facts.push('这一句说得比较快');
    if(tone.pauseRatio!=null&&tone.pauseRatio>=0.30)facts.push('句中停顿比较多');
    if(tone.pitchVariationSemitones!=null&&tone.pitchVariationSemitones>=4.2)facts.push('音高起伏比较明显');
    else if(tone.pitchVariationSemitones!=null&&tone.pitchVariationSemitones<=1.1&&tone.pitchSamples>=6)facts.push('音高起伏比较平');
  }

  if(tone.pitchEndingSemitones!=null&&tone.pitchEndingSemitones>=2.5)facts.push('句尾有明显上扬');
  else if(tone.pitchEndingSemitones!=null&&tone.pitchEndingSemitones<=-2.5)facts.push('句尾有明显下降');

  let weakInference='';
  const quiet=rel?.volumeDb!=null&&rel.volumeDb<=-4;
  const loud=rel?.volumeDb!=null&&rel.volumeDb>=4;
  const slow=(rel?.rateRatio!=null&&rel.rateRatio<=0.78)||(tone.charsPerSecond!=null&&tone.charsPerSecond<=1.7);
  const fast=(rel?.rateRatio!=null&&rel.rateRatio>=1.28)||(tone.charsPerSecond!=null&&tone.charsPerSecond>=5.2);
  const morePauses=(rel?.pauseDelta!=null&&rel.pauseDelta>=0.12)||(tone.pauseRatio!=null&&tone.pauseRatio>=0.30);
  const animated=(rel?.variationRatio!=null&&rel.variationRatio>=1.55)||(tone.pitchVariationSemitones!=null&&tone.pitchVariationSemitones>=4.2);
  const flat=(rel?.variationRatio!=null&&rel.variationRatio<=0.62)||(tone.pitchVariationSemitones!=null&&tone.pitchVariationSemitones<=1.1&&tone.pitchSamples>=6);

  if((quiet&&slow)||(slow&&morePauses&&flat))weakInference='这种声音组合有时会出现在疲惫、低落、犹豫或刻意放轻声音时';
  else if((loud&&fast)||(fast&&animated))weakInference='这种声音组合有时会出现在兴奋、激动、紧张或急切时';
  else if(slow&&flat&&!morePauses)weakInference='这种声音组合有时会显得平静、认真或疲惫';

  const label=(facts.length?facts.slice(0,3):['语气变化不明显']).map(item=>item.replace(/^声音|^这一句|^句中|^整体/,'')).join(' · ');
  return {tone,facts:facts.slice(0,6),weakInference,label};
}

export function voiceToneContext(raw){
  const described=describeVoiceTone(raw);
  if(!described)return '';
  const factual=described.facts.length?described.facts.join('；'):'这句没有检测到足够明显的语气变化';
  const inference=described.weakInference
    ? '弱提示：'+described.weakInference+'。这只是可能性，不是情绪事实。'
    : '没有足够依据从声音单独推断她的心情。';
  return '<voice_context>本地语气分析得到的客观线索：'+factual+'。'+inference+' 请把这些线索与她实际说的话和当前上下文一起理解；不要把语气分析当成心理诊断，也不要直接宣称她一定是什么情绪。如果她的文字与声音有轻微矛盾，可以自然表现出你注意到了，但不要机械复述这些指标。</voice_context>';
}
