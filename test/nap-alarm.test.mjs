import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNapCommand} from '../src/call/nap-alarm.mjs';
const now=Date.parse('2026-10-26T11:08:00Z');
test('nap parser handles relative and clock time',()=>{const a=parseNapCommand('20分钟后叫我起床',{now});assert.equal(a.action,'set');assert.equal(a.minutes,20);const b=parseNapCommand('晚上8点半叫我',{now});assert.equal(new Date(b.wakeAt).toISOString(),'2026-10-26T12:30:00.000Z');});
test('nap parser ignores unrelated duration',()=>{assert.equal(parseNapCommand('我刚刚写作业写了20分钟',{now}),null);});
test('snooze and cancel require active nap',()=>{assert.deepEqual(parseNapCommand('再睡十分钟',{now,active:true}),{action:'snooze',minutes:10,wakeAt:now+10*60000});assert.deepEqual(parseNapCommand('我醒了，取消闹钟',{now,active:true}),{action:'cancel'});assert.equal(parseNapCommand('我醒了',{now,active:false}),null);});