import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceState, planPerformanceCue } from '../src/call/performance-cue.mjs';

test('explicit kiss intent gets a kiss cue outside close mode',()=>{
  assert.deepEqual(planPerformanceCue({text:'亲一下',intimate:false,turnId:2}),{type:'kiss',variant:'single',placement:'tail',intensity:0.48,level:1});
});

test('longer affectionate kiss intent selects a sequence',()=>{
  assert.equal(planPerformanceCue({text:'再多亲几下',intimate:true,turnId:3})?.variant,'sequence');
});

test('ordinary turns get no performance cue',()=>{
  assert.equal(planPerformanceCue({text:'今天吃什么',intimate:false,turnId:1}),null);
});

test('explicit rhythm request starts and neutral continuation keeps it briefly',()=>{
  const s=new PerformanceState();
  const a=s.plan({text:'保持这个节奏',intimate:true,turnId:1});
  assert.equal(a?.type,'rhythm');
  const b=s.plan({text:'继续',intimate:true,turnId:2});
  assert.equal(b?.type,'rhythm');assert.equal(b?.continuation,true);
});

test('pace changes modify an active rhythm',()=>{
  const s=new PerformanceState();
  s.plan({text:'开始节奏',intimate:true,turnId:1});
  assert.equal(s.plan({text:'慢一点',intimate:true,turnId:2})?.variant,'medium');
  assert.equal(s.plan({text:'快一点',intimate:true,turnId:3})?.variant,'faster');
  assert.equal(s.plan({text:'再快一点',intimate:true,turnId:4})?.variant,'fastest');
});

test('explicit stop clears rhythm carry-over',()=>{
  const s=new PerformanceState();
  s.plan({text:'开始节奏',intimate:true,turnId:1});
  assert.equal(s.plan({text:'先停一下',intimate:true,turnId:2}),null);
  assert.notEqual(s.plan({text:'嗯',intimate:true,turnId:3})?.type,'rhythm');
});

test('breath-like detector hits can provoke breath without inventing state',()=>{
  const s=new PerformanceState();
  assert.equal(s.plan({text:'嗯',intimate:true,turnId:1,heardNonverbals:['呼吸声']})?.type,'breath');
  assert.equal(s.plan({text:'继续',intimate:true,turnId:2,heardNonverbals:['急促吸气']})?.type,'breath');
});

test('water liquid and vibration observations never directly provoke breath',()=>{
  for(const heard of [['水声'],['震动声'],['液体/摩擦声']]){
    const s=new PerformanceState();
    assert.equal(s.plan({text:'嗯',intimate:true,turnId:1,heardNonverbals:heard}),null,heard[0]);
  }
});

test('rhythmic detector evidence only reinforces an already active rhythm',()=>{
  const s=new PerformanceState();
  assert.equal(s.plan({text:'嗯',intimate:true,turnId:1,heardNonverbals:['拍击声']}),null);
  s.plan({text:'开始节奏',intimate:true,turnId:2});
  assert.equal(s.plan({text:'嗯',intimate:true,turnId:3,heardNonverbals:['拍击声']})?.type,'rhythm');
});

test('ambient breath remains sparse',()=>{
  const s=new PerformanceState(),fired=[];
  for(let turn=1;turn<=12;turn++)if(s.plan({text:'嗯',intimate:true,turnId:turn}))fired.push(turn);
  assert.ok(fired.length<6);
});
