import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync('src/server.mjs','utf8');
const app=fs.readFileSync('web/app.js','utf8');
const html=fs.readFileSync('web/index.html','utf8');
const nap=fs.readFileSync('src/call/nap-alarm.mjs','utf8');

test('nap mode shuts down cloud listening and blocks automatic reconnect',()=>{
  assert.ok(app.includes('const previous=scribe;scribe=null;tencentStt=null;'));
  assert.ok(app.includes('previous?.disconnect?.()'));
  assert.ok(app.includes('async function startSTT(){\n  if(napMode)return false;'));
  assert.ok(app.includes('async function reconnectMicrophone({force=false,quiet=false}={}){\n  if(napMode)return false;'));
  assert.ok(app.includes('callSurfaceVisible&&!napMode&&!muted'));
});

test('nap mode has an explicit early-wake control and survives active-call recovery',()=>{
  assert.ok(html.includes('id="nap-wake-now"'));
  assert.ok(app.includes("api('/api/calls/'+callId+'/nap',{action:'cancel',reason:'manual_wake'})"));
  assert.ok(app.includes("if(call.napAlarm?.active)enterNapMode(call.napAlarm);"));
  assert.ok(app.includes("if(!call.napAlarm?.active)await startSTT();"));
});

test('server suppresses autonomous activity during a nap',()=>{
  assert.ok(server.includes("call.activeAbort||call.napAlarm?.active||call.wakeSession?.active||!follow.eligible"));
  assert.ok(server.includes("call.state==='ENDED'||call.napAlarm?.active||call.wakeSession?.active||!call.intimacy.pendingNonverbals?.length"));
  assert.ok(server.includes("call.state==='RINGING'||call.napAlarm?.active||call.wakeSession?.active)continue"));
});

test('wake turn is server-driven, with playback-gated STT resume and push fallback',()=>{
  assert.ok(server.includes("await processTurn(call,'','nap_alarm')"));
  assert.ok(server.includes("call.napAlarm.phase='playing';clearNapPushTimer(call)"));
  assert.ok(server.includes("if(finishedNapWake)beginWakeSession(call)"));
  assert.ok(server.includes("call.napPushTimer=setTimeout"));
  assert.ok(server.includes("pushNapAlarmNotification(call)"));
});

test('public call state exposes only bounded nap metadata',()=>{
  assert.ok(server.includes('napAlarm:napAlarmPublic(call.napAlarm)'));
  assert.ok(nap.includes("sourceText:String(value.sourceText||'').slice(0,240)"));
});

test('wake negotiation executes approved snooze only after the reply finishes playing',()=>{
  assert.ok(server.includes("wake.pendingSnooze=decision.action==='allow_snooze'?{minutes:decision.minutes}:null"));
  assert.ok(server.includes("const finishedWakeReply=!!(call.wakeSession?.active&&call.wakeSession.phase==='replying'"));
  assert.ok(server.includes("else if(finishedWakeReply)completeWakeReply(call,call.turnId)"));
  assert.ok(server.includes("endWakeSession(call,'snooze_approved')"));
  assert.ok(server.includes("mode:'snooze',policy"));
});

test('wake negotiation can insist and schedules bounded reminders',()=>{
  assert.ok(server.includes("wake.pendingSnooze=decision.action==='allow_snooze'?{minutes:decision.minutes}:null"));
  assert.ok(server.includes("wake.reminderCount=Number(wake.reminderCount||0)+1"));
  assert.ok(server.includes("if(Number(wake.reminderCount||0)>=max)"));
  assert.ok(server.includes("event(call,'wake_mode',{active:true,phase:'exhausted'"));
});