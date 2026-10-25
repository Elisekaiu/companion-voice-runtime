import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeV4Speech } from '../src/call/v4-prosody.mjs';

const deep='[deep voice] [softly] ';
test('original deep delivery is completely unchanged',()=>{
  assert.equal(shapeV4Speech('宝贝，怎么啦？我在听，慢慢说就好。',deep),deep+'宝贝，怎么啦？我在听，慢慢说就好。');
});
test('short beloved opening does not get extra tail control',()=>{
  assert.equal(shapeV4Speech('宝贝，怎么啦？',deep,'[slowly] '),deep+'宝贝，怎么啦？');
});
test('gentle tail only affects final clause after comma',()=>{
  assert.equal(shapeV4Speech('宝贝，怎么啦？我在听，慢慢说就好。',deep,'[calmly] '),deep+'宝贝，怎么啦？我在听， [calmly] 慢慢说就好。');
});
test('only long enough final clauses receive a tag',()=>{
  assert.equal(shapeV4Speech('好吗？嗯，哦。',deep,'[calmly] '),deep+'好吗？嗯，哦。');
  assert.equal(shapeV4Speech('老婆，我在这。',deep,'[calmly] '),deep+'老婆，我在这。');
});
