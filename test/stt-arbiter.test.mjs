import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCjk, chooseHybridTranscript } from '../web/stt-arbiter.js';

test('pure English stays on the primary recognizer when Tencent is not finalized',()=>{
  assert.equal(hasCjk('I will call you later'),false);
  assert.deepEqual(
    chooseHybridTranscript({assemblyText:'I will call you later',tencentText:'我晚点打给你',tencentCompleted:false}),
    {text:'I will call you later',provider:'assemblyai'}
  );
});

test('finalized Chinese specialist result can beat a short English hallucination',()=>{
  assert.deepEqual(
    chooseHybridTranscript({assemblyText:'Quiet',tencentText:'快一点',tencentCompleted:true}),
    {text:'快一点',provider:'tencent'}
  );
});

test('Chinese prefers a sufficiently complete finalized Tencent transcript',()=>{
  assert.deepEqual(
    chooseHybridTranscript({assemblyText:'我今天想去散步',tencentText:'我今天想出去散步',tencentCompleted:true}),
    {text:'我今天想出去散步',provider:'tencent'}
  );
});

test('an incomplete Tencent partial does not replace a longer Chinese primary result',()=>{
  assert.deepEqual(
    chooseHybridTranscript({assemblyText:'我今天下班以后想出去散步',tencentText:'我今天',tencentCompleted:false}),
    {text:'我今天下班以后想出去散步',provider:'assemblyai'}
  );
});

test('Tencent can supply a turn when the primary recognizer has no transcript',()=>{
  assert.deepEqual(chooseHybridTranscript({assemblyText:'',tencentText:'嗯',tencentCompleted:true}),{text:'嗯',provider:'tencent'});
});
