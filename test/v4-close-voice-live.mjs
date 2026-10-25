import fs from 'node:fs';
const voiceId='test_voice_id';
const secret=fs.readFileSync('data/secrets/elevenlabs-api-key','utf8').trim();
const url='wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=eleven_v4_turbo&output_format=mp3_44100_128';
const ws=new WebSocket(url);
let bytes=0,chunks=0,final=false,firstAudioAt=0;
const started=Date.now();
await new Promise((resolve,reject)=>{
  const t=setTimeout(()=>{try{ws.close()}catch{};reject(new Error('v4_timeout'));},30000);
  ws.addEventListener('open',()=>{
    ws.send(JSON.stringify({voices:[voiceId],xi_api_key:secret,voice_settings:{stability:0.60,similarity_boost:0.91}}));
    ws.send(JSON.stringify({inputs:[{text:"[low, close-mic whisper, speaking very close to the listener's ear] 再靠近一点……我就贴着你耳边轻轻说，[softer and closer] 慢慢听。",voice_id:voiceId,new_turn:false}]}));
    ws.send(JSON.stringify({close_socket:true}));
  });
  ws.addEventListener('message',({data})=>{
    let packet;try{packet=JSON.parse(String(data));}catch{return;}
    if(packet.error){clearTimeout(t);reject(new Error('provider_error:'+String(typeof packet.error==='string'?packet.error:packet.error?.code||'unknown').slice(0,120)));try{ws.close()}catch{};return;}
    if(packet.audio){if(!firstAudioAt)firstAudioAt=Date.now();chunks++;bytes+=Buffer.from(packet.audio,'base64').length;}
    if(packet.is_final){final=true;clearTimeout(t);resolve();try{ws.close()}catch{}}
  });
  ws.addEventListener('error',()=>{clearTimeout(t);reject(new Error('ws_error'));});
  ws.addEventListener('close',()=>{if(!final){clearTimeout(t);reject(new Error('closed_before_final'));}});
});
console.log('v4_close_voice_ws',true,'first_audio_ms',firstAudioAt-started,'total_ms',Date.now()-started,'audio_chunks',chunks,'audio_bytes',bytes);
