import fs from 'node:fs';
const base=process.env.CALL_BASE||'http://127.0.0.1:18120/call';
const token=fs.readFileSync('data/secrets/call-access-token','utf8').trim();
const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(12000)});
if(!auth.ok)throw new Error('auth_status_'+auth.status);
const cookie=auth.headers.get('set-cookie')?.split(';')[0];
const get=async(path)=>{const r=await fetch(base+path,{headers:{cookie},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(path+'_http_'+r.status);return r.json();};
const post=async(path,body)=>fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
const opts=await get('/api/tts/models');
console.log('v4_tones',JSON.stringify(opts.v4Tones));
for(const tone of ['deep','deep_calm','deep_slow']){
  const resp=await post('/api/tts/preview',{model:'eleven_v4_turbo',tone});
  if(!resp.ok){console.log('preview',tone,'http',resp.status);process.exitCode=1;continue;}
  const audio=Buffer.from(await resp.arrayBuffer());
  const isMp3=audio.subarray(0,3).toString()==='ID3'||audio[0]===255;
  console.log('preview',tone,'http',resp.status,'size',audio.length,'mp3',isMp3);
  if(audio.length<1200||!isMp3)process.exitCode=1;
}
const result=await post('/api/calls',{direction:'outgoing',ttsModel:'eleven_v4_turbo',ttsTone:'deep'});
if(!result.ok)throw new Error('deep_call_failed_'+result.status);
const {call}=await result.json();
console.log('call_preset',call.ttsModel,call.ttsTone);
await post('/api/calls/'+call.id+'/hangup',{reason:'tone_test'});
