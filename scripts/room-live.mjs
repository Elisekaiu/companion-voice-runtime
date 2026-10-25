import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolveScheduledTone} from '../web/voice-schedule.js';
const base='http://127.0.0.1:8848/call';
const token=fs.readFileSync('data/secrets/call-access-token','utf8').trim();
const headers={cookie:'codex_call_session='+encodeURIComponent(token),'content-type':'application/json'};
async function req(p,body,method=body===undefined?'GET':'POST'){const r=await fetch(base+p,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});assert.ok(r.ok,p+': '+r.status);return r;}
const health=await fetch('http://127.0.0.1:8848/health').then(r=>r.json());
assert.equal(health.codexMode,'wechat-shared-thread');assert.equal(health.codexModel,'gpt-5.6-sol');assert.equal(health.codexEffort,'medium');
const {call}=await (await req('/api/calls',{direction:'outgoing',ttsModel:'eleven_v4_turbo',ttsTone:resolveScheduledTone()})).json();const cp='/api/calls/'+call.id,hp='/api/history/'+call.id;
let archived=[];
try{
 await req(cp+'/answer',{});
 const stt=await (await req(cp+'/stt-token',{provider:'assemblyai'})).json();
 const url=new URL('wss://streaming.assemblyai.com/v3/ws');for(const [k,v] of Object.entries({speech_model:'universal-3-6-pro',encoding:'pcm_s16le',sample_rate:'16000',token:stt.token}))url.searchParams.set(k,v);
 await new Promise((resolve,reject)=>{const socket=new WebSocket(url);const timeout=setTimeout(()=>{socket.close();reject(new Error('STT handshake timeout'));},12000);socket.addEventListener('message',e=>{let d;try{d=JSON.parse(String(e.data));}catch{return;}if(d.type==='Begin'){clearTimeout(timeout);socket.send(JSON.stringify({type:'Terminate'}));socket.close();resolve();}});socket.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('STT handshake failed'));});});
 console.log('AssemblyAI live handshake passed');
 for(const [endpoint,body] of [['text',{text:'电话重构验收测试，不是日常聊天。请只回复「我在，听得到。」。'}],['stt',{type:'committed',text:'继续电话工程验收，请只回复「好，慢慢说。」。',provider:'assemblyai',voiceDurationMs:1800,endOfTurn:true}]]){
  const response=await req(cp+'/events'),reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',complete=false,segments=[];
  const watch=(async()=>{const timeout=setTimeout(()=>reader.cancel(),55000);try{while(!complete){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const type=block.match(/^event: (.+)$/m)?.[1],raw=block.match(/^data: (.+)$/m)?.[1];if(!raw)continue;const event=JSON.parse(raw);if(type==='tts_segment')segments.push(event);if(type==='assistant_done')complete=true;if(type==='error')throw new Error('model turn failed: '+String(event.code||'unknown').slice(0,100));}}}finally{clearTimeout(timeout);await reader.cancel().catch(()=>{});}assert.ok(complete,'model completed');})();
  await req(cp+'/'+endpoint,body);await watch;assert.ok(segments.length);
  for(const segment of segments){const r=await req(cp+'/audio/'+segment.segmentId);assert.equal(r.headers.get('content-type'),'audio/mpeg');const audio=Buffer.from(await r.arrayBuffer());assert.ok(audio.length>=1000);const disk=fs.readFileSync('data/call-turn-audio/'+call.id+'/'+segment.segmentId+'.mp3');assert.deepEqual(audio,disk);archived.push({...segment,bytes:audio.length});}
  console.log(endpoint+' shared turn and v4 audio archive passed',segments.length);
 }
 await req(cp+'/hangup',{});
 const {call:memory}=await (await req(hp)).json();const raw=JSON.parse(fs.readFileSync('data/calls/'+call.id+'.json'));
 assert.equal(raw.codexThreadId,health.codexThreadId,'same active WeChat thread');assert.equal(memory.transcript.filter(x=>x.speaker==='assistant').length,2);
 assert.equal(memory.audioSegments.length,archived.length);
 for(const seg of memory.audioSegments){assert.ok(seg.archived&&seg.bytes>=1000);assert.ok(Number.isFinite(seg.order)&&seg.playbackRate>0);const r=await req(hp+'/audio/'+seg.segmentId);assert.equal((await r.arrayBuffer()).byteLength,seg.bytes);}
 console.log('Memory persisted, shared thread confirmed, original-rate archive playback endpoints passed',memory.audioSegments.map(s=>({order:s.order,bytes:s.bytes,playbackRate:s.playbackRate})));
}finally{
 await req(cp+'/hangup',{}).catch(()=>{});
 await req(hp,{},'DELETE');assert.equal(fs.existsSync('data/calls/'+call.id+'.json'),false);assert.equal(fs.existsSync('data/call-turn-audio/'+call.id),false);
 console.log('Deleted only this generated acceptance call; transcript and audio removed');
}
