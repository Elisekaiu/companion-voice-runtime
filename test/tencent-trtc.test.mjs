import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TencentTrtcConfig } from '../src/call/tencent-trtc.mjs';

test('Tencent TRTC config stays unavailable until the SDK secret is stored',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-trtc-'));
  const file=path.join(dir,'sdk-secret');
  const config=new TencentTrtcConfig({sdkAppId:123456789,secretFile:file});
  assert.equal(config.status().configured,false);
  assert.equal(config.session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),null);
  config.configure('0123456789abcdef0123456789abcdef');
  assert.equal(config.status().configured,true);
  assert.equal(fs.statSync(file).mode & 0o777,0o600);
  const session=config.session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(session.sdkAppId,123456789);
  assert.match(session.roomId,/^companion_[A-Za-z0-9_-]+$/);
  assert.match(session.userId,/^user_[A-Za-z0-9_-]+$/);
  assert.ok(session.userSig.length>100);
  assert.equal(Object.hasOwn(session,'secret'),false);
  fs.rmSync(dir,{recursive:true,force:true});
});

test('Tencent TRTC rejects malformed SDK secrets',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-trtc-'));
  const config=new TencentTrtcConfig({sdkAppId:123456789,secretFile:path.join(dir,'sdk-secret')});
  assert.throws(()=>config.configure('too short'),/invalid_tencent_trtc_sdk_secret/);
  fs.rmSync(dir,{recursive:true,force:true});
});
