import fs from 'node:fs';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const key=fs.readFileSync('data/secrets/elevenlabs-api-key','utf8').trim();
if(!key)throw new Error('api_key_missing');
const client=new ElevenLabsClient({apiKey:key});
try{
  const result=await client.tokens.singleUse.create('realtime_scribe');
  if(typeof (typeof result==='string'?result:result?.token)!=='string')throw new Error('token_response_invalid');
  console.log('scribe_token: issued');
}catch(e){
  console.log('scribe_token: failed',String(e?.statusCode||e?.status||e?.name||'unknown'));
  process.exitCode=1;
}
