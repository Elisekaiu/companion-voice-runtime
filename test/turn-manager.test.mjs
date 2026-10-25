import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnManager } from '../src/call/turn-manager.mjs';

test('thinking pause does not finish too early', () => {
  const t=new TurnManager({baseSilenceMs:1300});
  t.onVoiceStart(1000);
  t.onCommit('老公我觉得这个',1000);
  assert.equal(t.maybeFinalize(1900),null);
});

test('continuation language extends the turn', () => {
  const t=new TurnManager({baseSilenceMs:1000,continuationExtraMs:900});
  t.onVoiceStart(1000);
  const r=t.onCommit('还有一件事',1000);
  assert.ok(r.deadlineAt>=2900);
  assert.equal(t.maybeFinalize(2500),null);
});

test('explicit completion may finish sooner', () => {
  const t=new TurnManager({completionSilenceMs:600});
  t.onVoiceStart(1000);
  t.onCommit('就这样。',1000);
  assert.equal(t.maybeFinalize(1500),null);
  assert.equal(t.maybeFinalize(1700).text,'就这样。');
});

test('short acknowledgement is a backchannel', () => {
  const t=new TurnManager();
  assert.equal(t.classifyBargeIn({text:'嗯嗯',voiceDurationMs:500}),'backchannel');
});

test('explicit interruption interrupts', () => {
  const t=new TurnManager();
  assert.equal(t.classifyBargeIn({text:'等等老公',voiceDurationMs:200}),'interrupt');
});

test('backchannel tolerates delayed VAD and punctuation', () => {
  const t=new TurnManager();
  for(const text of ['嗯嗯。','嗯～','对，对','哦哦','好好','yeah!','mhm']) {
    assert.equal(t.classifyBargeIn({text,voiceDurationMs:2400}),'backchannel',text);
  }
});

test('early explicit stop works before committed transcript', () => {
  const t=new TurnManager();
  assert.equal(t.isExplicitInterrupt('等等老公，我有话说'),true);
  assert.equal(t.isExplicitInterrupt('我还没说完'),true);
  assert.equal(t.isExplicitInterrupt('我觉得我们'),false);
  assert.equal(t.isExplicitInterrupt('嗯嗯'),false);
});

test('substantive overlapping speech interrupts', () => {
  const t=new TurnManager({bargeInMinMs:420});
  assert.equal(t.classifyBargeIn({text:'我有新的想法',voiceDurationMs:900}),'interrupt');
  assert.equal(t.classifyBargeIn({text:'不是那个意思',voiceDurationMs:50}),'interrupt');
  assert.equal(t.classifyBargeIn({text:'嗯嗯',voiceDurationMs:900}),'backchannel');
});

test('very short mistranscription cannot cancel a whole assistant reply', () => {
  const t=new TurnManager();
  assert.equal(t.classifyBargeIn({text:'今天我们去东京塔吧',voiceDurationMs:520}),'backchannel');
  assert.equal(t.classifyBargeIn({text:'老公',voiceDurationMs:420}),'backchannel');
  assert.equal(t.classifyBargeIn({text:'我爱你',voiceDurationMs:780}),'backchannel');
});

test('short explicit stop still interrupts immediately', () => {
  const t=new TurnManager();
  for(const text of ['停一下','先停','别说了','不要说了']) {
    assert.equal(t.classifyBargeIn({text,voiceDurationMs:320}),'interrupt',text);
  }
});
