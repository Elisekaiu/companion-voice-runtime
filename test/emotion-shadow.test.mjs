import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('web/app.js','utf8');
const worker=fs.readFileSync('web/voice-prosody-worker-src.js','utf8');
const server=fs.readFileSync('src/server.mjs','utf8');

test('prosody worker transfers per-turn PCM without persisting it in the browser',()=>{
  assert.ok(worker.includes("postMessage({type:'summary',requestId,summary,pcmBuffer},[pcmBuffer])"));
});

test('emotion shadow upload is fire-and-forget and stays outside the committed prompt payload',()=>{
  assert.ok(app.includes("submitEmotionShadow(shadowCallId,utteranceId,envelope.pcmBuffer)"));
  assert.ok(app.includes('if(!emotionShadowEnabled||!id||!utteranceId||!pcmBuffer?.byteLength)return;'));
  assert.ok(app.includes("'/emotion-shadow'"));
  assert.ok(app.includes("stream.addEventListener('emotion_shadow'"));
});

test('server accepts shadow PCM only when explicitly enabled and worker heartbeat is fresh',()=>{
  assert.ok(server.includes("EMOTION_SHADOW_ENABLED"));
  assert.ok(server.includes('function emotionShadowWorkerReady()'));
  assert.ok(server.includes("error:'emotion_shadow_unavailable'"));
  assert.ok(server.includes("error:'emotion_shadow_busy'"));
});

test('shadow result is attached by utterance id and emitted separately from model context',()=>{
  assert.ok(server.includes('pendingSttUtteranceId'));
  assert.ok(server.includes('entry.emotionShadow=shadow'));
  assert.ok(server.includes("event(call,'emotion_shadow'"));
  assert.equal(server.includes('<emotion_shadow>'),false);
});
