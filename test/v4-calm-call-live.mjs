import fs from 'node:fs';
const base=process.env.CALL_BASE||'http://127.0.0.1:18120/call';
const token=fs.readFileSync('data/secrets/call-access-token','utf8').trim();
const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
if(!auth.ok)throw new Error('auth:'+auth.status);
const cookie=auth.headers.get('set-cookie').split(';')[0];
async function post(path,body={}) {
 const r=await fetch(base+path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw new Error(path+':'+r.status);
 return r.json();
}
const {call}=await post('/api/calls',{direction:'outgoing',ttsModel:'eleven_v4_turbo',ttsTone:'deep_calm'});
const id=call.id;
try {
 await post('/api/calls/'+id+'/answer');
 const events=await fetch(base+'/api/calls/'+id+'/events',{headers:{cookie}});
 if(!events.ok)throw new Error('events:'+events.status);
 const reader=events.body.getReader(); const decoder=new TextDecoder();let buffer='',segment=null,done=false;
 const watch=(async()=>{
  const timeout=setTimeout(()=>reader.cancel(),50000);
  try{while(!done) {
   const r=await reader.read();if(r.done)break;buffer+=decoder.decode(r.value,{stream:true});
   let end;while((end=buffer.indexOf('\n\n'))>=0){
    const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
    const event=block.match(/^event: (.+)$/m)?.[1],data=block.match(/^data: (.+)$/m)?.[1];
    if(!data)continue;const value=JSON.parse(data);
    if(event==='tts_segment'&&!segment)segment=value.segmentId;
    if(event==='assistant_done')done=true;
    if(event==='error')throw new Error('model_event_error');
   }
  }}finally{clearTimeout(timeout);await reader.cancel().catch(()=>{});}
 })();
 await post('/api/calls/'+id+'/stt',{type:'voice_start'});
 await post('/api/calls/'+id+'/stt',{type:'committed',text:'这是一项音频接口测试，请只回复：你好。',voiceDurationMs:1500});
 await watch;
 console.log('streaming_tts_segment:',!!segment);
 if(!segment)throw new Error('no_tts_segment');
 const output=await fetch(base+'/api/calls/'+id+'/audio/'+segment,{headers:{cookie}});
 console.log('audio_status:',output.status,'audio_type:',output.headers.get('content-type'));
 if(!output.ok)throw new Error('audio_http_'+output.status);
 const bytes=Buffer.from(await output.arrayBuffer());
 console.log('audio_bytes:',bytes.length,'mp3_header:',bytes.slice(0,3).toString('hex'));
 if(bytes.length<1000)process.exitCode=1;
}catch(e){console.log('audio_smoke_error:',e?.message||'unknown');process.exitCode=1;}
finally{await post('/api/calls/'+id+'/hangup',{reason:'audio_smoke'}).catch(()=>{});}
