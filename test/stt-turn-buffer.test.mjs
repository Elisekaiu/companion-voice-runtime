import test from 'node:test';
import assert from 'node:assert/strict';
import { SttTurnBuffer } from '../web/stt-turn-buffer.js';

test('short conversational pauses do not end the turn',()=>{
  const buffer=new SttTurnBuffer({silenceMs:1600,partialTimeoutMs:4200});
  buffer.speech(0);
  buffer.update('tencent',{id:'a',text:'我刚刚',final:true},100);
  assert.equal(buffer.take(460),null);
  buffer.speech(500);
  buffer.update('tencent',{id:'b',text:'还没说完',final:true},700);
  assert.equal(buffer.take(1700),null);
  const out=buffer.take(2401);
  assert.equal(out.text,'我刚刚 还没说完');
  assert.equal(out.provider,'tencent');
});

test('continued speech cancels an early endpoint',()=>{
  const buffer=new SttTurnBuffer({silenceMs:1000});
  buffer.update('assemblyai',{id:'1',text:'first part',final:true},100);
  buffer.speech(900);
  assert.equal(buffer.take(1200),null);
  buffer.update('assemblyai',{id:'2',text:'second part',final:true},1000);
  assert.equal(buffer.take(1800),null);
  assert.equal(buffer.take(2001).text,'first part second part');
});

test('duplicate provider finals are emitted once',()=>{
  const buffer=new SttTurnBuffer({silenceMs:500});
  assert.equal(buffer.update('assemblyai',{id:'7',text:'hello',final:true},0),true);
  assert.equal(buffer.update('assemblyai',{id:'7',text:'hello',final:true},100),false);
  const first=buffer.take(600);
  assert.equal(first.text,'hello');
  assert.equal(buffer.update('assemblyai',{id:'7',text:'hello',final:true},700),false);
});

test('candidate provenance is retained for diagnostics',()=>{
  const buffer=new SttTurnBuffer({silenceMs:500});
  buffer.update('assemblyai',{id:'a',text:'Quiet',final:true},0);
  buffer.update('tencent',{id:'t',text:'快一点',final:true},20);
  const out=buffer.take(600);
  assert.equal(out.text,'快一点');
  assert.deepEqual(out.candidates,{assemblyai:'Quiet',tencent:'快一点'});
});
