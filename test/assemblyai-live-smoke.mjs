import fs from 'node:fs';
const base = 'http://127.0.0.1:8848/call';
const access = fs.readFileSync('data/secrets/call-access-token','utf8').trim();
const authorization = await fetch(base+'/api/auth',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({token:access}),signal:AbortSignal.timeout(9000)
});
if(!authorization.ok)throw new Error('local_login_http_'+authorization.status);
const cookie=authorization.headers.get('set-cookie')?.split(';')[0];
if(!cookie)throw new Error('missing_auth_cookie');
const config=await fetch(base+'/api/stt/providers',{headers:{cookie},signal:AbortSignal.timeout(9000)});
if(!config.ok)throw new Error('providers_http_'+config.status);
const providers=await config.json();
console.log('providers',JSON.stringify(providers));
const callRes=await fetch(base+'/api/calls',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{"direction":"outgoing"}',signal:AbortSignal.timeout(9000)});
if(!callRes.ok)throw new Error('create_call_http_'+callRes.status);
const {call}=await callRes.json();
try {
  const response=await fetch(base+'/api/calls/'+call.id+'/stt-token',{
    method:'POST',headers:{cookie,'content-type':'application/json'},
    body:JSON.stringify({provider:'assemblyai'}),signal:AbortSignal.timeout(14000)
  });
  if(!response.ok) {
    const d=await response.json().catch(()=>({}));
    console.log('temporary_token_issue_failed','http',response.status,'code',String(d.error||'unknown').slice(0,120));
    process.exitCode=1;
  } else {
    const {token,provider}=await response.json();
    if(!token||token.length<8)throw new Error('token_invalid');
    console.log('temporary_token_issue','ok',provider);
    const url=new URL('wss://streaming.assemblyai.com/v3/ws');
    url.searchParams.set('speech_model','universal-3-6-pro');
    url.searchParams.set('encoding','pcm_s16le');
    url.searchParams.set('sample_rate','16000');
    url.searchParams.set('mode','balanced');
    url.searchParams.set('min_turn_silence','320');
    url.searchParams.set('max_turn_silence','1600');
    url.searchParams.set('token',token);
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket(url);
      let begin=false;
      const timeout=setTimeout(()=>{try{ws.close();}catch{}reject(new Error('websocket_begin_timeout'));},18000);
      ws.onopen=()=>console.log('websocket_open','ok');
      ws.onmessage=(e)=>{
        try {
          const d=JSON.parse(e.data);
          if(d.type==='Begin') {
            begin=true;
            console.log('server_begin','ok');
            try{ws.send(new Int16Array(1600).buffer);}catch{}
            setTimeout(()=>{try{ws.send(JSON.stringify({type:'Terminate'}));ws.close();}catch{}},250);
          } else if(d.type==='Termination'){console.log('server_termination','ok');}
          else if(d.type==='Error')console.log('server_error',String(d.error||d.message||'unknown').slice(0,100));
        }catch{}
      };
      ws.onerror=()=>{clearTimeout(timeout);reject(new Error('websocket_error'));};
      ws.onclose=e=>{clearTimeout(timeout);if(begin){console.log('websocket_close',e.code);resolve();}else reject(new Error('websocket_close_before_begin_'+e.code));};
    });
  }
}finally{
  await fetch(base+'/api/calls/'+call.id+'/hangup',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{"reason":"assemblyai_smoke"}',signal:AbortSignal.timeout(6000)}).catch(()=>{});
}
