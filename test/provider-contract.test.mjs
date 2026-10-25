import test from 'node:test';
import assert from 'node:assert/strict';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

test('installed ElevenLabs SDK exposes single-use Scribe token API',()=>{
  const client=new ElevenLabsClient({apiKey:'contract-only'});
  assert.equal(typeof client.tokens?.singleUse?.create,'function');
});
