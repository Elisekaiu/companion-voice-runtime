import test from 'node:test';
import assert from 'node:assert/strict';
import { HEARING_GROUPS, HEARING_LABELS, REACTIVE_HEARING_KEYS } from '../web/hearing-catalog.js';

test('hearing v2 covers broad daily environment groups',()=>{
  assert.ok(HEARING_GROUPS.length>=40);
  for(const key of ['music','rain','wind','typing','door','doorbell','knock','dog','cat','bird','traffic','train','aircraft','dishes','vacuum','siren','cough','laughter']){
    assert.ok(HEARING_LABELS[key],key);
  }
});

test('hearing catalog keys are unique and all YAMNet indices are valid',()=>{
  const keys=new Set();
  for(const group of HEARING_GROUPS){
    assert.ok(group.key&&group.label);
    assert.equal(keys.has(group.key),false,'duplicate '+group.key);
    keys.add(group.key);
    assert.ok(['ambient','reactive'].includes(group.kind));
    assert.ok(Array.isArray(group.members)&&group.members.length>0);
    for(const member of group.members){
      assert.ok(Number.isInteger(member.index)&&member.index>=0&&member.index<521);
      assert.ok(member.threshold>0&&member.threshold<=1);
    }
  }
});

test('only salient sounds are configured to auto-react',()=>{
  assert.equal(REACTIVE_HEARING_KEYS.has('doorbell'),true);
  assert.equal(REACTIVE_HEARING_KEYS.has('cough'),true);
  assert.equal(REACTIVE_HEARING_KEYS.has('siren'),true);
  assert.equal(REACTIVE_HEARING_KEYS.has('music'),false);
  assert.equal(REACTIVE_HEARING_KEYS.has('rain'),false);
  assert.equal(REACTIVE_HEARING_KEYS.has('typing'),false);
});
