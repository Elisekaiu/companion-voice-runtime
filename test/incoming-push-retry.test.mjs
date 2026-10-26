import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync('src/server.mjs','utf8');
const app=fs.readFileSync('web/app.js','utf8');

test('incoming ring uses a 30 second window with about three second push retries',()=>{
  assert.ok(server.includes('const INCOMING_RING_MS=30000;'));
  assert.ok(server.includes('const INCOMING_PUSH_RETRY_MS=3000;'));
  assert.ok(server.includes('scheduleIncomingPushRetry(call)'));
  assert.ok(server.includes("call.ringTimer=setTimeout(()=>finishIncomingRing(call,'missed_call'),delay)"));
});

test('push retry stops once the incoming surface acknowledges the call',()=>{
  assert.ok(server.includes('call.ringAcknowledgedAt'));
  assert.ok(server.includes('function acknowledgeIncomingRing'));
  assert.ok(server.includes("if(action[2]==='ring-ack')"));
  assert.ok(server.includes('clearIncomingPushRetry(call);storage.save(call)'));
  assert.ok(app.includes("api('/api/calls/'+value+'/ring-ack',{state:'visible'})"));
});

test('answer and hangup paths clear push retry state',()=>{
  assert.ok(server.includes("clearIncomingPushRetry(call);call.ringPushInFlight=false;call.startedAt"));
  assert.ok(server.includes("clearWakeTimer(call);clearIncomingPushRetry(call);call.ringPushInFlight=false;interrupt(call"));
  assert.ok(server.includes("clearTimeout(call.ringTimer);call.ringTimer=null;clearIncomingPushRetry(call)"));
});

test('first push failure no longer immediately ends an incoming call',()=>{
  assert.equal(server.includes("finishIncomingRing(call,'push_failed')"),false);
  assert.ok(server.includes('pushError=String(error?.message||error)'));
  assert.ok(server.includes('return sendJson(res,201,{ok:true,retrying:shouldRetryIncomingPush(call)'));
});

test('rerung pending call does not extend a still-valid expiry or restart after acknowledgement',()=>{
  assert.ok(server.includes("const existingExpiry=Date.parse(pending.ringExpiresAt||'')"));
  assert.ok(server.includes("if(!Number.isFinite(existingExpiry)||existingExpiry<=Date.now()){finishIncomingRing(pending,'missed_call')"));
  assert.ok(server.includes('if(!pending.ringAcknowledgedAt){'));
});

test('frontend closes the matching visible notification after it presents the call',()=>{
  assert.ok(app.includes('getNotifications?.()'));
  assert.ok(app.includes('item?.data?.callId===value'));
  assert.ok(app.includes('item=>item.close()'));
});