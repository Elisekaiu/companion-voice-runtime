import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeVoiceTone, describeVoiceTone, voiceToneContext } from '../src/call/voice-tone.mjs';

test('voice tone payload is bounded before reaching the model',()=>{
  const clean=sanitizeVoiceTone({activeDurationMs:1200,pitchMedianHz:9999,pauseRatio:-2,charsPerSecond:999,relative:{volumeDb:-99,rateRatio:99}});
  assert.equal(clean.pitchMedianHz,600);
  assert.equal(clean.pauseRatio,0);
  assert.equal(clean.charsPerSecond,20);
  assert.equal(clean.relative.volumeDb,-30);
  assert.equal(clean.relative.rateRatio,5);
});

test('personal relative tone produces facts but only a weak mood hypothesis',()=>{
  const input={
    activeDurationMs:1800,baselineCount:12,charsPerSecond:1.5,pauseRatio:0.35,pitchMedianHz:180,
    pitchVariationSemitones:0.8,pitchEndingSemitones:-3,pitchSamples:30,
    relative:{volumeDb:-7,rateRatio:0.65,pauseDelta:0.18,variationRatio:0.5,pitchSemitones:-1}
  };
  const described=describeVoiceTone(input);
  assert.match(described.facts.join(' '),/声音比她平时明显轻/);
  assert.match(described.facts.join(' '),/语速比她平时慢/);
  assert.match(described.weakInference,/有时/);
  const context=voiceToneContext(input);
  assert.match(context,/只是可能性，不是情绪事实/);
  assert.match(context,/不要把语气分析当成心理诊断/);
});

test('tone context does not invent a mood when cues are weak',()=>{
  const context=voiceToneContext({activeDurationMs:900,baselineCount:0,charsPerSecond:3,pauseRatio:0.1,pitchMedianHz:200,pitchVariationSemitones:2,pitchEndingSemitones:0,pitchSamples:20});
  assert.match(context,/没有足够依据从声音单独推断她的心情/);
});
