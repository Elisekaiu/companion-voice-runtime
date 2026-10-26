import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultWakePolicy,parseWakePolicy,parseWakeDecision,fallbackWakeDecision,wakeSessionPublic} from '../src/call/wake-negotiation.mjs';

test('urgent commitments default to strict wake policy',()=>{
  const p=defaultWakePolicy('九点考试，八点一定叫我，别让我赖床');
  assert.equal(p.urgency,'strict');
  assert.equal(p.maxSnoozeMinutes,0);
  assert.equal(p.maxReminders,3);
});

test('ordinary nap defaults to flexible wake policy',()=>{
  const p=defaultWakePolicy('我太困了，小睡二十分钟');
  assert.equal(p.urgency,'flexible');
  assert.ok(p.maxSnoozeMinutes>=10);
});

test('model policy is bounded',()=>{
  const p=parseWakePolicy('{"urgency":"strict","max_snooze_minutes":999,"reminder_interval_seconds":3,"max_reminders":99}');
  assert.deepEqual(p,{urgency:'strict',maxSnoozeMinutes:60,reminderIntervalSeconds:20,maxReminders:4});
});

test('strict policy cannot be bypassed by an allow-snooze model answer',()=>{
  const policy={urgency:'strict',maxSnoozeMinutes:0,reminderIntervalSeconds:25,maxReminders:3};
  assert.equal(parseWakeDecision('{"action":"allow_snooze","minutes":10,"message":"睡吧"}',{requestedMinutes:10,policy}),null);
  assert.equal(fallbackWakeDecision({requestedMinutes:10,policy}).action,'insist');
});

test('flexible policy can approve requested snooze',()=>{
  const policy={urgency:'flexible',maxSnoozeMinutes:20,reminderIntervalSeconds:45,maxReminders:1};
  const d=parseWakeDecision('{"action":"allow_snooze","minutes":10,"message":"再睡十分钟，到点我再叫你。"}',{requestedMinutes:10,policy});
  assert.equal(d.action,'allow_snooze');assert.equal(d.minutes,10);
});

test('public wake state exposes only bounded control metadata',()=>{
  const out=wakeSessionPublic({active:true,phase:'listening',startedAt:'x',reminderCount:1,policy:{urgency:'strict',maxReminders:3},alarmSource:'private'});
  assert.equal(out.urgency,'strict');assert.equal(out.maxReminders,3);assert.equal('alarmSource' in out,false);
});


test('hard strict floor survives a permissive model policy',()=>{
  const fallback=defaultWakePolicy('九点考试，八点叫我，别让我赖床');
  const out=parseWakePolicy('{\"urgency\":\"flexible\",\"max_snooze_minutes\":30,\"reminder_interval_seconds\":60,\"max_reminders\":1}',fallback);
  assert.equal(out.urgency,'strict');
  assert.equal(out.maxSnoozeMinutes,0);
});