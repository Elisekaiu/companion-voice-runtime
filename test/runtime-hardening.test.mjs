import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('web/app.js','utf8');
const server=fs.readFileSync('src/server.mjs','utf8');

test('hybrid idle sleep keeps Tencent awake while AssemblyAI sleeps',()=>{
  assert.ok(app.includes('ASSEMBLY_IDLE_SLEEP_MS=30000'));
  assert.ok(app.includes("closeCloud({sleeping:true,keepTencent:true})"));
  assert.ok(app.includes("maybeWake('tencent')"));
});

test('Tencent failure wakes AssemblyAI, retries Tencent, then permits light sleep after stability',()=>{
  assert.ok(app.includes("if(phase==='failed'){scribe?.noteTencentFailed?.();scribe?.recoverRecognition?.();scribe?.recoverTencent?.();}"));
  assert.ok(app.includes("else if(event?.state==='started'){reportSttState('tencent','ready')"));
  assert.ok(app.includes('FALLBACK_KEEP_AWAKE_MS=90000'));
  assert.ok(app.includes('TENCENT_STABLE_BEFORE_SLEEP_MS=30000'));
  assert.ok(app.includes('scheduleTencentRetry'));
  assert.ok(app.includes('restartTencentSidecar'));
  assert.ok(app.includes('now<assemblyKeepAwakeUntil'));
  assert.ok(app.includes('now-tencentHealthySince<TENCENT_STABLE_BEFORE_SLEEP_MS'));
});

test('fallback pre-roll keeps about six seconds of microphone audio',()=>{
  assert.ok(app.includes('const PRE_ROLL_CHUNKS=60'));
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

test('quiet hangup is model-advised but server-authorized',()=>{
  assert.ok(server.includes('stay_until_activity'));
  assert.ok(server.includes('recheck_after_minutes'));
  assert.ok(server.includes("guard.defer({untilActivity:true})"));
  assert.ok(server.includes("reason:'companion_quiet_hangup'"));
});
