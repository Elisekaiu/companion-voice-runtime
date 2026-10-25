import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CallStorage } from '../src/call/storage.mjs';

test('call transcript persists atomically without audio',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-voice-runtime-'));
  try{
    const store=new CallStorage(dir);
    const call={id:'11111111-1111-4111-8111-111111111111',direction:'outgoing',state:'ENDED',createdAt:'2026-01-01T00:00:00.000Z',startedAt:null,endedAt:null,generation:2,turnId:1,codexThreadId:'thread-test',transcript:[{speaker:'user',text:'hello'}]};
    store.save(call);
    const saved=store.load(call.id);
    assert.equal(saved.codexThreadId,'thread-test');
    assert.deepEqual(saved.transcript,call.transcript);
    assert.equal(Object.hasOwn(saved,'audio'),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
