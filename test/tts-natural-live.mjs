import fs from 'node:fs';
const base=process.env.CALL_BASE||'http://127.0.0.1:8848/call';
const access=fs.readFileSync('data/secrets/call-access-token','utf8').trim();
const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:access})});
if(!auth.ok)throw new Error('private auth failed '+auth.status);
const cookie=auth.headers.get('set-cookie')?.split(';')[0];
if(!cookie)throw new Error('no session cookie');
async function get(route){
 const r=await fetch(base+route,{headers:{cookie}});if(!r.ok)throw new Error(route+' HTTP '+r.status);return r.json();
}
async function post(route,obj){
 const r=await fetch(base+route,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(obj)});
 return r;
}
const catalog=await get('/api/tts/models');
console.log('tts_catalog',catalog.models.map(x=>x.id).join(','),'default',catalog.default,'voice',catalog.voice);
for(const model of ['eleven_flash_v2_5','eleven_multilingual_v2']){
 const r=await post('/api/tts/preview',{model});
 if(!r.ok){console.log('preview',model,'HTTP',r.status);process.exitCode=1;continue;}
 const bytes=Buffer.from(await r.arrayBuffer());
 const valid=bytes.length>2500&&(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===0xff);
 console.log('preview',model,'HTTP',r.status,'audio_bytes',bytes.length,'mpeg_valid',valid);
 if(!valid)process.exitCode=1;
}
const call=await post('/api/calls',{direction:'outgoing',ttsModel:'eleven_multilingual_v2'});
if(!call.ok)throw new Error('call model failed '+call.status);
const callData=(await call.json()).call;
console.log('new_call_tts_model',callData.ttsModel);
await post('/api/calls/'+callData.id+'/hangup',{reason:'tts_model_smoke'});
