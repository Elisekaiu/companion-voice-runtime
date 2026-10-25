import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProsody, updateProsodyBaseline, baselineComparison } from '../web/voice-prosody-core.js';

const SR=16000;
function sine(freq=220,amp=0.1,seconds=1.2){
  const out=new Float32Array(Math.floor(SR*seconds));
  for(let i=0;i<out.length;i++)out[i]=amp*Math.sin(2*Math.PI*freq*i/SR);
  return out;
}
function concat(...parts){
  const total=parts.reduce((n,p)=>n+p.length,0),out=new Float32Array(total);
  let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
}
function silence(seconds){
  return new Float32Array(Math.floor(SR*seconds));
}

test('prosody analyzer finds voice level and approximate pitch',()=>{
  const summary=analyzeProsody(sine(220,0.12,1.2));
  assert.ok(summary);
  assert.ok(Math.abs(summary.pitchMedianHz-220)<15,summary.pitchMedianHz);
  assert.ok(summary.loudnessRms>0.07);
  assert.ok(summary.pauseRatio<0.05);
});

test('prosody analyzer sees an internal pause',()=>{
  const summary=analyzeProsody(concat(sine(210,0.1,0.55),silence(0.45),sine(210,0.1,0.55)));
  assert.ok(summary);
  assert.ok(summary.pauseRatio>0.20,summary.pauseRatio);
});

test('personal baseline comparison is withheld until enough samples',()=>{
  const sample={loudnessRms:0.08,charsPerSecond:3,pauseRatio:0.1,pitchMedianHz:200,pitchVariationSemitones:2};
  let baseline=null;
  for(let i=0;i<4;i++)baseline=updateProsodyBaseline(baseline,sample);
  assert.equal(baselineComparison({...sample,loudnessRms:0.04},baseline),null);
  baseline=updateProsodyBaseline(baseline,sample);
  const compared=baselineComparison({...sample,loudnessRms:0.04,charsPerSecond:1.5,pauseRatio:0.3},baseline);
  assert.ok(compared);
  assert.ok(compared.volumeDb<-5);
  assert.ok(compared.rateRatio<0.6);
  assert.ok(compared.pauseDelta>0.15);
});
