import fs from 'node:fs';
const key=fs.readFileSync('data/secrets/elevenlabs-api-key','utf8').trim();
if(!key)throw new Error('api_key_missing');
try {
  const response=await fetch('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=mp3_44100_128',{
    method:'POST',
    headers:{'xi-api-key':key,'content-type':'application/json','accept':'audio/mpeg'},
    body:JSON.stringify({text:'你好，电话测试。',model_id:'eleven_flash_v2_5'}),
    signal:AbortSignal.timeout(25000)
  });
  if(!response.ok) { console.log('tts: failed',response.status);process.exitCode=1; }
  else { const bytes=Buffer.from(await response.arrayBuffer()); console.log('tts: success','audio_bytes:',bytes.length,'audio_mpeg:',response.headers.get('content-type')?.includes('audio'));if(bytes.length<200)process.exitCode=1; }
} catch(error) { console.log('tts: error',error?.name||'unknown');process.exitCode=1; }
