import test from 'node:test';
import assert from 'node:assert/strict';
import { isVoiceReason, shouldRepairTyped, mergeRepairText, repairContext } from '../src/call/turn-repair.mjs';

test('voice-originated turn reasons are recognized',()=>{
  assert.equal(isVoiceReason('provider_end_of_turn'),true);
  assert.equal(isVoiceReason('silence_timeout'),true);
  assert.equal(isVoiceReason('semantic_completion'),true);
  assert.equal(isVoiceReason('typed'),false);
});

test('typing while assistant is responding repairs a recent voice turn',()=>{
  const lastVoiceInput={at:1000,text:'老公我刚刚想说'};
  for(const state of ['WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING','INTERRUPTING']){
    assert.equal(shouldRepairTyped({lastVoiceInput,now:7000,state,text:'其实是明天'}),true,state);
  }
});

test('ordinary later typed message does not get silently merged',()=>{
  const lastVoiceInput={at:1000,text:'老公我刚刚想说'};
  assert.equal(shouldRepairTyped({lastVoiceInput,now:7000,state:'LISTENING',text:'我们去吃饭吧'}),false);
  assert.equal(shouldRepairTyped({lastVoiceInput,now:14001,state:'ASSISTANT_SPEAKING',text:'补充一下'}),false);
});

test('explicit correction can repair just after playback ends',()=>{
  const lastVoiceInput={at:1000,text:'明天去东京'};
  assert.equal(shouldRepairTyped({lastVoiceInput,now:6500,state:'LISTENING',text:'不是，我说的是今天'}),true);
  assert.equal(shouldRepairTyped({lastVoiceInput,now:6500,state:'LISTENING',text:'还有，我刚刚漏了一句'}),true);
});

test('repair text stays one user turn but keeps both pieces',()=>{
  assert.equal(mergeRepairText('老公我说的是明天','不是，是今天'),'老公我说的是明天\n不是，是今天');
  assert.equal(mergeRepairText('亲亲','亲亲'),'亲亲');
});

test('repair context makes typed text authoritative',()=>{
  const ctx=repairContext({voiceText:'明天去',typedText:'不是，是今天',mergedText:'明天去\n不是，是今天'});
  assert.match(ctx,/同一个用户回合/);
  assert.match(ctx,/以她亲手打出的文字为准/);
  assert.match(ctx,/不是，是今天/);
});
