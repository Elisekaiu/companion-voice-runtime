import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProviderUsage } from '../src/provider-usage.mjs';

test('provider usage locally tracks AssemblyAI session duration without claiming account balance', async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'companion-usage-'));
  try{
    const usage=createProviderUsage({
      dataDir:path.join(root,'calls'),
      assemblyAiRateUsdPerHour:0.45,
      tencentConfigured:()=>true
    });
    assert.equal(usage.record({
      provider:'assemblyai',
      sessionId:'session-a',
      sessionDurationSeconds:600,
      audioDurationSeconds:90,
      callId:'call-a'
    }),true);
    assert.equal(usage.record({
      provider:'assemblyai',
      sessionId:'session-a',
      sessionDurationSeconds:600,
      audioDurationSeconds:90,
      callId:'call-a'
    }),false);

    const summary=await usage.summary();
    assert.equal(summary.assemblyai.kind,'local');
    assert.equal(summary.assemblyai.sessionSeconds,600);
    assert.equal(summary.assemblyai.sessions,1);
    assert.equal(summary.assemblyai.estimatedUsd,0.075);
    assert.equal(summary.elevenlabs.available,false);
    assert.equal(summary.elevenlabs.reason,'missing_key');
    assert.equal(summary.tencent.trtcConfigured,true);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
