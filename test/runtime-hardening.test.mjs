import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('web/app.js','utf8');
const server=fs.readFileSync('src/server.mjs','utf8');

test('hybrid idle sleep keeps Tencent awake while AssemblyAI sleeps',()=>{
  assert.ok(app.includes('ASSEMBLY_IDLE_SLEEP_MS=30000'));
  assert.ok(app.includes("closeCloud({sleeping:true,keepTencent:true})"));
  assert.ok(app.includes("maybeWake('tencent')"));
  assert.ok(app.includes('||!tencentSidecar)return;'));
});

test('AssemblyAI abnormal exits still report local usage',()=>{
  assert.ok(app.includes("window.addEventListener('pagehide',flushAssemblyUsage)"));
  assert.ok(app.includes('recordAssemblyUsage(usage)'));
  assert.ok(app.includes('audioSeconds+=buffer.byteLength/32000'));
});

test('saved call preferences are restored',()=>{
  for(const key of ['companion-voice-runtime.stt-provider','companion-voice-runtime.tts-model','companion-voice-runtime.tts-tone-mode','companion-voice-runtime.binaural-mode']){
    assert.ok(app.includes("localStorage.getItem('"+key+"')"),key);
  }
  assert.ok(app.includes('toneSelect.append(option)'));
});

test('active call recovery and duplicate guard stay enabled',()=>{
  assert.ok(app.includes('resumeActiveCall({quiet:true})'));
  assert.ok(app.includes("api('/api/active-call'"));
  assert.ok(server.includes('function currentActiveCall()'));
  assert.ok(server.includes("error:'active_call_exists'"));
});

test('browser speech constraints keep echo cancellation and noise suppression on',()=>{
  assert.ok(app.includes('SPEECH_AUDIO_CONSTRAINTS={channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}'));
  assert.equal(app.includes('noiseSuppression:!bodyHearingEnabled'),false);
});
