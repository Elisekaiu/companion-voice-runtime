import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCjk, chooseHybridTranscript } from '../web/stt-arbiter.js';

test('pure English stays on AssemblyAI without waiting for Tencent',()=>{
  assert.equal(hasCjk('I really miss you'),false);
  assert.deepEqual(chooseHybridTranscript({assemblyText:'I really miss you',tencentText:'我真的很想你'}),{text:'I really miss you',provider:'assemblyai'});
});

test('Chinese prefers a sufficiently complete Tencent transcript',()=>{
  assert.deepEqual(
    chooseHybridTranscript({assemblyText:'老公我好像真的很想你',tencentText:'老公，我真的好想你',tencentCompleted:true}),
    {text:'老公，我真的好想你',provider:'tencent'}
  );
});

test('an incomplete Tencent partial does not replace a longer Chinese Assembly result',()=>{
  assert.deepEqual(
    chooseHybridTranscript({assemblyText:'老公我今天真的特别特别想你',tencentText:'老公我',tencentCompleted:false}),
    {text:'老公我今天真的特别特别想你',provider:'assemblyai'}
  );
});

test('Tencent can supply a turn when AssemblyAI has no transcript',()=>{
  assert.deepEqual(chooseHybridTranscript({assemblyText:'',tencentText:'嗯',tencentCompleted:true}),{text:'嗯',provider:'tencent'});
});
