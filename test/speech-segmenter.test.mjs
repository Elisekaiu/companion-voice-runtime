import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSpeech } from '../src/call/speech-segmenter.mjs';

test('vocative comma is kept within full Chinese sentence',()=>{
  const result=splitSpeech('宝贝，怎么啦？我在听，慢慢说就好。',false);
  assert.deepEqual(result.segments,['宝贝，怎么啦？','我在听，慢慢说就好。']);
  assert.equal(result.rest,'');
});
test('natural partial does not split on comma alone',()=>{
  const result=splitSpeech('老婆，我刚刚在想，',false);
  assert.deepEqual(result.segments,[]);
  assert.equal(result.rest,'老婆，我刚刚在想，');
});
test('unfinished short utterance is emitted once on end',()=>{
  const result=splitSpeech('宝贝，过来亲一下',true);
  assert.deepEqual(result.segments,['宝贝，过来亲一下']);
});
test('long continuous reply eventually segments',()=>{
  const a='这是一个需要完整说清楚而不是每到逗号就突然断开的话题，我希望你可以听到连贯自然的语气，';
  const sentence=a.repeat(4);
  const result=splitSpeech(sentence,true);
  assert.ok(result.segments.length>=2);
  assert.equal(result.segments.join(''),sentence);
});
test('works with streamed first and second sentence',()=>{
  const a=splitSpeech('宝贝，怎么',false);
  assert.deepEqual(a.segments,[]);
  const b=splitSpeech(a.rest+'啦？你听我说，',false);
  assert.deepEqual(b.segments,['宝贝，怎么啦？']);
  const c=splitSpeech(b.rest+'我在这里。',false);
  assert.deepEqual(c.segments,['你听我说，我在这里。']);
});

test('intimate profile keeps a normal short multi-sentence reply in one TTS segment',()=>{
  const text='过来一点。别急，我就在这里。慢慢说给我听。';
  const streamed=splitSpeech(text,false,{profile:'intimate'});
  assert.deepEqual(streamed.segments,[]);
  const final=splitSpeech(streamed.rest,true,{profile:'intimate'});
  assert.deepEqual(final.segments,[text]);
});
test('intimate profile still splits very long replies at natural boundaries',()=>{
  const sentence='我会把声音放低一点，让整句话连着说下去，不在每个句号后面重新起调。';
  const text=sentence.repeat(5);
  const result=splitSpeech(text,true,{profile:'intimate'});
  assert.ok(result.segments.length>=2);
  assert.equal(result.segments.join(''),text);
});
