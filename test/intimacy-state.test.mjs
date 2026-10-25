import test from 'node:test';
import assert from 'node:assert/strict';
import { IntimacyState } from '../src/call/intimacy-state.mjs';

test('explicit close-voice request enters and neutral turns decay out',()=>{
  const s=new IntimacyState({holdTurns:2});
  assert.equal(s.observeUser('靠近一点，耳边说').active,true);
  assert.equal(s.observeUser('嗯嗯').active,true);
  assert.equal(s.observeUser('继续聊刚才的事').active,false);
});

test('English whisper request also enters close delivery',()=>{
  const s=new IntimacyState();
  assert.equal(s.observeUser('whisper a little closer').active,true);
});

test('ordinary affection alone does not flip the close voice',()=>{
  const s=new IntimacyState();
  assert.equal(s.observeUser('今天好想你').active,false);
  assert.equal(s.observeUser('抱抱我').active,false);
});

test('explicit exit immediately restores the normal voice',()=>{
  const s=new IntimacyState();
  s.observeUser('亲密一点，小声说');
  const r=s.observeUser('恢复正常说话');
  assert.equal(r.active,false);
  assert.equal(r.changed,true);
});

test('nonverbal observations are bounded and consumed once',()=>{
  const s=new IntimacyState({maxNonverbals:2});
  s.noteNonverbal('水声');s.noteNonverbal('呼吸声');s.noteNonverbal('拍击声');
  assert.deepEqual(s.consumeNonverbals(),['呼吸声','拍击声']);
  assert.deepEqual(s.consumeNonverbals(),[]);
});
