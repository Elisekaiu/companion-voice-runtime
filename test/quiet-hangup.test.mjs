import test from 'node:test';
import assert from 'node:assert/strict';
import {QuietHangup,parseQuietDecision} from '../src/call/quiet-hangup.mjs';

const ready=(g,now)=>g.presence({enabled:true,healthy:true,visible:true,muted:false,engaged:false},now);

test('minimum silence, advisory decision, played warning, then grace are all required',()=>{
  const g=new QuietHangup({now:100});ready(g,300000);assert.equal(g.canAsk(300000),false);ready(g,300101);
  const r=g.begin(300101);assert.equal(g.canEnd(300102),false);assert.ok(g.accept(r,4,300102));
  ready(g,310000);assert.equal(g.canEnd(310000),false);g.playbackEnded(4,310000);ready(g,369999);
  assert.equal(g.canEnd(369999),false);ready(g,370001);assert.equal(g.canEnd(370001),true);
});

test('new user activity invalidates an in-flight decision or countdown',()=>{
  const g=new QuietHangup({now:0});ready(g,300001);const r=g.begin(300001);g.userActivity(300002);
  assert.equal(g.accept(r,1,300003),false);assert.equal(g.canEnd(999999),false);
});

test('stay decision can defer the next model check',()=>{
  const g=new QuietHangup({now:0});ready(g,300001);assert.ok(g.begin(300001)!==null);
  g.defer({minutes:30},300002);
  ready(g,900000);assert.equal(g.canAsk(900000),false);
  ready(g,2100003);assert.equal(g.canAsk(2100003),true);
});

test('stay until activity suppresses periodic checks until the user speaks or types',()=>{
  const g=new QuietHangup({now:0});ready(g,300001);assert.ok(g.begin(300001)!==null);
  g.defer({untilActivity:true},300002);
  ready(g,4*60*60*1000);assert.equal(g.canAsk(4*60*60*1000),false);
  g.userActivity(4*60*60*1000+1);
  ready(g,4*60*60*1000+300002);
  assert.equal(g.canAsk(4*60*60*1000+300002),true);
});

test('hidden, muted, disconnected or stale presence cannot authorize a hangup',()=>{
  for(const change of [{healthy:false},{muted:true},{visible:false},{enabled:false},{engaged:true}]){
    const g=new QuietHangup({now:0});ready(g,300001);const r=g.begin(300001);g.accept(r,1,300001);g.playbackEnded(1,300001);
    g.presence({enabled:true,healthy:true,visible:true,muted:false,engaged:false,...change},360002);
    assert.equal(g.canEnd(360002),false);
  }
  const g=new QuietHangup({now:0});ready(g,300001);assert.equal(g.canAsk(330002),false);
});

test('parser supports bounded stay modes and rejects direct end-now control',()=>{
  assert.equal(parseQuietDecision('plain text'),null);
  assert.equal(parseQuietDecision('{"action":"end_now"}'),null);
  assert.deepEqual(parseQuietDecision('{"action":"stay_until_activity"}'),{action:'stay_until_activity'});
  assert.deepEqual(parseQuietDecision('{"action":"stay","recheck_after_minutes":45}'),{action:'stay',recheckAfterMinutes:45});
  assert.deepEqual(parseQuietDecision('{"action":"stay","recheck_after_minutes":2}'),{action:'stay',recheckAfterMinutes:10});
  assert.ok(parseQuietDecision('{"action":"end_after_silence","message":"I will wait one more minute, then end the call if you are still away."}'));
});
