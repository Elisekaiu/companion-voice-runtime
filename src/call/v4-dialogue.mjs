// Eleven v4 Turbo requires the Text-to-Dialogue WebSocket, not the legacy
// Text-to-Speech REST or stream-input endpoint. Runs SERVER-SIDE only.
export function streamV4Dialogue({text,voiceId,apiKey,signal,voiceSettings={stability:0.65,similarity_boost:0.78},timeoutMs=35000}){
  if(!text||!voiceId||!apiKey)throw new Error('v4_required_input_missing');
  const url='wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=eleven_v4_turbo&output_format=mp3_44100_128';
  let socket=null,settled=false,timeout=null,aborted=false,ctrl=null;
  function dispose(){
    clearTimeout(timeout);signal?.removeEventListener('abort',abort);
    try{if(socket && socket.readyState<2)socket.close();}catch{}
  }
  function finish(){
    if(settled)return;settled=true;dispose();
    try{ctrl?.close();}catch{}
  }
  function fail(error){
    if(settled)return;settled=true;dispose();
    try{ctrl?.error(error instanceof Error?error:new Error(String(error)));}catch{}
  }
  function abort(){
    aborted=true;fail(Object.assign(new Error('tts_aborted'),{name:'AbortError'}));
  }
  const body=new ReadableStream({
    start(controller){
      ctrl=controller;
      if(signal?.aborted){abort();return;}
      signal?.addEventListener('abort',abort,{once:true});
      timeout=setTimeout(()=>fail(new Error('tts_v4_timeout')),timeoutMs);
      try{socket=new WebSocket(url);}catch(error){fail(error);return;}
      socket.addEventListener('open',()=>{
        if(settled)return;
        socket.send(JSON.stringify({
          voices:[voiceId],xi_api_key:apiKey,
          voice_settings:{stability:voiceSettings.stability,similarity_boost:voiceSettings.similarity_boost}
        }));
        socket.send(JSON.stringify({inputs:[{text,voice_id:voiceId,new_turn:false}]}));
        // Short conversational replies need a flush; close_socket also emits final.
        socket.send(JSON.stringify({close_socket:true}));
      });
      socket.addEventListener('message',({data})=>{
        if(settled)return;
        let packet;try{packet=JSON.parse(String(data));}catch{return;}
        if(packet.error){
          const errorCode=typeof packet.error==='string'?packet.error:packet.error?.code||'provider_rejected';
          fail(new Error('tts_v4_'+String(errorCode).slice(0,90)));
          return;
        }
        if(typeof packet.audio==='string' && packet.audio){
          const bytes=Buffer.from(packet.audio,'base64');
          if(bytes.length)controller.enqueue(new Uint8Array(bytes));
        }
        if(packet.is_final)finish();
      });
      socket.addEventListener('error',()=>fail(new Error('tts_v4_socket_error')));
      socket.addEventListener('close',()=>{if(!settled&&!aborted)fail(new Error('tts_v4_early_close'));});
    },
    cancel(){if(!settled){settled=true;dispose();}}
  });
  return new Response(body,{headers:{'content-type':'audio/mpeg'}});
}
