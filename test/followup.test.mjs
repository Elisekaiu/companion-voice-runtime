import test from 'node:test';
import assert from 'node:assert/strict';
import { FollowupState, DEFAULT_FOLLOWUP_DELAYS_MS } from '../src/call/followup.mjs';

test('follow-up cadence stops after two autonomous turns',()=>{
  const f=new FollowupState();
  assert.equal(f.nextDelayMs(),18000);
  assert.equal(f.markTriggered(1000),1);
  assert.equal(f.nextDelayMs(),35000);
  assert.equal(f.markTriggered(2000),2);
  assert.equal(f.nextDelayMs(),null);
  assert.equal(f.eligible,false);
});

test('real user activity resets autonomous follow-up cadence',()=>{
  const f=new FollowupState();
  f.markTriggered(1000);f.markTriggered(2000);
  f.resetByUser(3000);
  assert.equal(f.count,0);
  assert.equal(f.lastActivityAt,3000);
  assert.equal(f.nextDelayMs(),DEFAULT_FOLLOWUP_DELAYS_MS[0]);
});

test('hidden or muted calls pause follow-up and resume from now',()=>{
  const f=new FollowupState();
  let p=f.setPresence({visible:false,muted:false},5000);
  assert.equal(p.eligible,false);
  assert.equal(f.eligible,false);
  p=f.setPresence({visible:true,muted:false},9000);
  assert.equal(p.resumed,true);
  assert.equal(f.eligible,true);
  assert.equal(f.lastActivityAt,9000);
  p=f.setPresence({visible:true,muted:true},12000);
  assert.equal(p.eligible,false);
  assert.equal(f.lastActivityAt,12000);
  p=f.setPresence({visible:true,muted:false},15000);
  assert.equal(p.resumed,true);
  assert.equal(f.lastActivityAt,15000);
});
