import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { TurnManager } from './call/turn-manager.mjs';
import { splitSpeech } from './call/speech-segmenter.mjs';
import { streamV4Dialogue } from './call/v4-dialogue.mjs';
import { shapeV4Speech } from './call/v4-prosody.mjs';
import { IntimacyState } from './call/intimacy-state.mjs';
import { PerformanceState } from './call/performance-cue.mjs';
import { sanitizeVoiceTone, describeVoiceTone, voiceToneContext } from './call/voice-tone.mjs';
import { CallStorage } from './call/storage.mjs';
import { TencentTrtcConfig } from './call/tencent-trtc.mjs';
import { FollowupState } from './call/followup.mjs';
import { QuietHangup, parseQuietDecision } from './call/quiet-hangup.mjs';
import { isVoiceReason, shouldRepairTyped, mergeRepairText, repairContext } from './call/turn-repair.mjs';
import { CodexAppServer } from './codex/app-server.mjs';
import { createProviderUsage } from './provider-usage.mjs';
import { HEARING_LABELS, REACTIVE_HEARING_KEYS } from '../web/hearing-catalog.js';

const HOST=process.env.CALL_HOST||'0.0.0.0';
const PORT=Number(process.env.CALL_PORT||8840);
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
const DATA_DIR=process.env.CALL_DATA_DIR||'/data/calls';
const RECORDINGS_DIR=process.env.CALL_RECORDINGS_DIR||path.join(path.dirname(DATA_DIR),'recordings');
const TURN_AUDIO_DIR=process.env.CALL_TURN_AUDIO_DIR||path.join(path.dirname(DATA_DIR),'call-turn-audio');
const EMOTION_SHADOW_ENABLED=/^(1|true|yes)$/i.test(String(process.env.EMOTION_SHADOW_ENABLED||''));
const EMOTION_SHADOW_DIR=process.env.EMOTION_SHADOW_DIR||path.join(path.dirname(DATA_DIR),'emotion-shadow');
const EMOTION_SHADOW_INBOX=path.join(EMOTION_SHADOW_DIR,'inbox');
const EMOTION_SHADOW_RESULTS=path.join(EMOTION_SHADOW_DIR,'results');
const VOICE_RETENTION_DAYS=90;
const VOICE_RETENTION_MS=VOICE_RETENTION_DAYS*24*60*60*1000;
fs.mkdirSync(TURN_AUDIO_DIR,{recursive:true});
if(EMOTION_SHADOW_ENABLED){fs.mkdirSync(EMOTION_SHADOW_INBOX,{recursive:true});fs.mkdirSync(EMOTION_SHADOW_RESULTS,{recursive:true});}
const CODEX_MODEL=process.env.CODEX_MODEL||'gpt-5.6-sol';
const CODEX_EFFORT=process.env.CODEX_EFFORT||'medium';
const VOICE_ID=String(process.env.ELEVENLABS_VOICE_ID||'').trim();
const TTS_MODELS=Object.freeze({
  eleven_multilingual_v2:'中文自然 · Multilingual v2',
  eleven_flash_v2_5:'快速回应 · Flash v2.5',
  eleven_v4_turbo:'自然对话 · v4 Turbo（测试）'
});
const TTS_MODEL=Object.hasOwn(TTS_MODELS,process.env.ELEVENLABS_TTS_MODEL||'')?process.env.ELEVENLABS_TTS_MODEL:'eleven_v4_turbo';
const TTS_PREVIEW_TEXT='宝贝，怎么啦？我在听，慢慢说就好。';
// V4-only presets. Do not mutate the workspace voice or existing Flash/v2 voices.
const V4_TONES=Object.freeze({
  original:Object.freeze({label:'原版 · 熟悉的 Companion',stability:0.65,similarity:0.78,tag:'',playbackRate:1}),
  steady:Object.freeze({label:'克制 · 少些尾音上扬',stability:0.85,similarity:0.90,tag:'',playbackRate:1}),
  deep:Object.freeze({label:'低沉 · 靠近原来的声线',stability:0.84,similarity:0.91,tag:'[deep voice] [softly] ',playbackRate:0.96}),
  deep_calm:Object.freeze({label:'日常 · 低沉轻柔',stability:0.84,similarity:0.91,tag:'[deep voice] [softly] ',endingTag:'[calmly] ',playbackRate:0.96}),
  deep_slow:Object.freeze({label:'原慢声 · 保留对照',stability:0.84,similarity:0.91,tag:'[deep voice] [softly] ',endingTag:'[slowly] ',playbackRate:0.96}),
  deep_night:Object.freeze({label:'晚安 · 低沉慢声（新版）',stability:0.84,similarity:0.91,tag:'[deep voice] [softly] ',endingTag:'[calmly] ',playbackRate:0.93}),
  // Runtime-only overlay. It is selected automatically and never replaces the
  // user's normal day/night/manual preset.
  deep_intimate:Object.freeze({label:'亲密 · 贴耳低语',stability:0.82,similarity:0.91,tag:'[deep voice] [whispers] ',endingTag:'',playbackRate:0.94})
});

const ttsPreviewCache=new Map();
const TTS_SETTINGS=Object.freeze({stability:0.70,similarity_boost:0.80,style:0.0,speed:0.98,use_speaker_boost:true});
const DEVELOPER_INSTRUCTIONS='你正在一通私人语音电话里和 User 对话。用自然、温暖、简洁的口语中文回答；通常一到三句话。不要使用 Markdown，不要朗读标点或链接。除非用户明确询问，不谈系统、模型或实现。用户文字末尾偶尔会附加 <call_context>，那是电话管线提供的只读声音上下文：不要复述标签本身，只把其中短促声音当作你确实听见过的声音；不要仅凭这些声音推断情绪、意图或身体状态。如果 User 当前一句明显残缺、语义断裂、像被语音识别截掉一半，或你无法可靠判断她到底想表达什么，不要强行脑补成长回答；先用一句很短的自然回应表示没完全听清或让她继续补完，等下一句再完整回应。';
const readSecret=name=>{
  const direct=String(process.env[name]||'').trim();
  if(direct)return direct;
  const file=process.env[name+'_FILE'];
  try{return file?fs.readFileSync(file,'utf8').trim():'';}catch{return '';}
};
const ACCESS_TOKEN=readSecret('CALL_ACCESS_TOKEN');
const ELEVENLABS_API_KEY=readSecret('ELEVENLABS_API_KEY');
const ASSEMBLYAI_API_KEY=readSecret('ASSEMBLYAI_API_KEY');
const TENCENT_TRTC_SDK_APP_ID=Number(process.env.TENCENT_TRTC_SDK_APP_ID||0);
const TENCENT_TRTC_SDK_SECRET_KEY_FILE=String(process.env.TENCENT_TRTC_SDK_SECRET_KEY_FILE||'').trim();
const tencentTrtc=new TencentTrtcConfig({sdkAppId:TENCENT_TRTC_SDK_APP_ID,secretFile:TENCENT_TRTC_SDK_SECRET_KEY_FILE});
const PROVIDER_USAGE_ENABLED=/^(1|true|yes)$/i.test(String(process.env.CALL_PROVIDER_USAGE_ENABLED||''));
const providerUsage=createProviderUsage({
  dataDir:DATA_DIR,
  elevenLabsApiKey:ELEVENLABS_API_KEY,
  elevenLabsUsageKeyFile:String(process.env.ELEVENLABS_USAGE_API_KEY_FILE||'/data/secrets/elevenlabs-usage-api-key').trim(),
  assemblyAiRateUsdPerHour:Number(process.env.ASSEMBLYAI_RATE_USD_PER_HOUR||0.45),
  tencentConfigured:()=>tencentTrtc.status().configured
});
const COMPANION_BRIDGE_BASE=String(process.env.COMPANION_BRIDGE_BASE||'').replace(/\/$/,'');
const PUSH_SERVICE_URL=String(process.env.PUSH_SERVICE_URL||'').replace(/\/$/,'');
const INCOMING_RING_MS=90000;
const COMPANION_BRIDGE_TOKEN=readSecret('COMPANION_BRIDGE_TOKEN');
const USE_COMPANION_BRIDGE=!!(COMPANION_BRIDGE_BASE&&COMPANION_BRIDGE_TOKEN);
let bridgeCodexInfo={model:null,effort:null,threadId:null,ready:false,usage:null};
const storage=new CallStorage(DATA_DIR);
function recoverInterruptedStartedCalls(){
  let recovered=0;
  const endedAt=new Date().toISOString();
  for(const call of storage.list()){
    if(call?.endedAt||!call?.startedAt)continue;
    call.state='ENDED';call.endedAt=endedAt;
    call.transcript=Array.isArray(call.transcript)?call.transcript:[];
    if(!call.transcript.some(x=>x?.speaker==='system'&&x?.type==='hangup'))call.transcript.push({id:randomUUID(),speaker:'system',type:'hangup',reason:'service_restart',at:endedAt});
    storage.save(call);recovered++;
  }
  if(recovered)console.warn('[call-recovery]',JSON.stringify({recovered,reason:'service_restart'}));
  return recovered;
}
recoverInterruptedStartedCalls();
const calls=new Map();
const codexPath=path.resolve('node_modules/.bin/codex');
const codex=new CodexAppServer({command:codexPath,cwd:'/workspace'});
let codexReady=false, codexError=null;
const elevenlabs=ELEVENLABS_API_KEY?new ElevenLabsClient({apiKey:ELEVENLABS_API_KEY}):null;

function equalSecret(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&x.length>0&&timingSafeEqual(x,y);
}
function cookie(req,name){
  const item=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  return item?decodeURIComponent(item.slice(name.length+1)):'';
}
const SESSION_MAX_AGE=365*24*60*60;
function sessionCookie(){
  return 'codex_call_session='+encodeURIComponent(ACCESS_TOKEN)+'; Path=/call; HttpOnly; Secure; SameSite=Strict; Max-Age='+SESSION_MAX_AGE;
}
function authorized(req){return !!ACCESS_TOKEN&&equalSecret(cookie(req,'codex_call_session'),ACCESS_TOKEN);}
function authorizedVoiceBridge(req){const value=String(req.headers.authorization||'');return value.startsWith('Bearer ')&&!!COMPANION_BRIDGE_TOKEN&&equalSecret(value.slice(7),COMPANION_BRIDGE_TOKEN);}
function sendJson(res,status,body,headers={}){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':data.length,'cache-control':'no-store',...headers});
  res.end(data);
}
async function readJson(req){
  let data='';for await(const chunk of req){data+=chunk;if(data.length>256000)throw new Error('request_too_large');}
  return data?JSON.parse(data):{};
}
async function readBinary(req,maxBytes=1200000){
  const chunks=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>maxBytes)throw new Error('request_too_large');chunks.push(chunk);}
  return Buffer.concat(chunks,total);
}
function publicCall(call){
  return {id:call.id,state:call.state,direction:call.direction,ttsTone:call.ttsTone,voiceProfile:call.intimacy?.active?'intimate':'normal',createdAt:call.createdAt,startedAt:call.startedAt,endedAt:call.endedAt,ringExpiresAt:call.ringExpiresAt||null,ringReason:call.ringReason||null,generation:call.generation,turnId:call.turnId,ttsModel:call.ttsModel,transcript:call.transcript};
}
function currentActiveCall(){
  return [...calls.values()].filter(call=>!call.endedAt&&call.state!=='ENDED').sort((a,b)=>Date.parse(b.startedAt||b.createdAt||0)-Date.parse(a.startedAt||a.createdAt||0))[0]||null;
}
function emotionShadowWorkerReady(){
  if(!EMOTION_SHADOW_ENABLED)return false;
  try{return Date.now()-fs.statSync(path.join(EMOTION_SHADOW_DIR,'worker-heartbeat.json')).mtimeMs<15000;}catch{return false;}
}
function callDurationMs(call){
  if(!call.startedAt)return null;
  const a=Date.parse(call.startedAt),b=Date.parse(call.endedAt||'');
  return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?b-a:null;
}
function historySummary(call){
  const transcript=Array.isArray(call.transcript)?call.transcript:[];
  const spoken=transcript.filter(x=>x?.speaker==='user'||x?.speaker==='assistant');
  const first=spoken.find(x=>x.speaker==='user')||spoken[0]||null;
  const audioSegments=Array.isArray(call.audioSegments)?call.audioSegments:[];
  const hangup=[...transcript].reverse().find(x=>x?.speaker==='system'&&x?.type==='hangup')||null;
  const outcome=String(hangup?.reason||'');
  const customTitle=String(call.title||'').trim();
  const incomingTitle=call.direction==='incoming'?(outcome==='missed_call'?'未接来电':outcome==='declined_call'?'已拒绝来电':'老公打来的电话'):'';
  const title=customTitle||incomingTitle||deriveCallTitle(call);
  return {id:call.id,state:call.state,direction:call.direction||'outgoing',outcome:outcome||null,createdAt:call.createdAt,startedAt:call.startedAt,endedAt:call.endedAt,durationMs:callDurationMs(call),turnCount:spoken.length,title,customTitle:!!customTitle,preview:first?.text||'',voiceReplyCount:new Set(audioSegments.filter(x=>x.archived).map(x=>x.turnId)).size,favoriteVoiceCount:new Set(audioSegments.filter(x=>x.archived&&x.favorite).map(x=>x.turnId)).size};
}
function favoriteVoiceItems({limit=100,offset=0}={}){
  const items=[];
  for(const call of storage.list()){
    if(!call?.endedAt)continue;
    const summary=historySummary(call);
    const transcript=Array.isArray(call.transcript)?call.transcript:[];
    const byTurn=new Map();
    for(const segment of call.audioSegments||[]){
      if(!segment?.archived||!segment.favorite)continue;
      const turnId=Number(segment.turnId);
      if(!Number.isFinite(turnId))continue;
      if(!byTurn.has(turnId))byTurn.set(turnId,[]);
      byTurn.get(turnId).push(segment);
    }
    for(const [turnId,segments] of byTurn){
      const turn=transcript.find(x=>x?.speaker==='assistant'&&Number(x.turnId)===turnId);
      const ordered=[...segments].sort((a,b)=>(a.order??0)-(b.order??0));
      const favoriteAt=ordered.map(x=>Date.parse(x.favoriteAt||'')).filter(Number.isFinite).sort((a,b)=>b-a)[0]||Date.parse(call.endedAt||call.startedAt||call.createdAt||0)||0;
      const fallback=ordered.map(x=>String(x.text||'').trim()).filter(Boolean).join('');
      items.push({
        id:call.id+':'+turnId,
        callId:call.id,turnId,
        callTitle:summary.title,
        callStartedAt:call.startedAt||call.createdAt,
        callEndedAt:call.endedAt,
        durationMs:summary.durationMs,
        favoriteAt:new Date(favoriteAt).toISOString(),
        text:String(turn?.text||fallback||'').trim(),
        segments:ordered.map((x,i)=>({
          segmentId:x.segmentId,order:x.order??i,turnId,
          playbackRate:Number(x.playbackRate)||1,ttsTone:x.ttsTone||null,voiceProfile:x.voiceProfile||null,
          favorite:true,favoriteAt:x.favoriteAt||null
        }))
      });
    }
  }
  items.sort((a,b)=>Date.parse(b.favoriteAt||b.callEndedAt||0)-Date.parse(a.favoriteAt||a.callEndedAt||0));
  const start=Math.max(0,Math.floor(Number(offset)||0)),size=Math.max(1,Math.min(200,Math.floor(Number(limit)||100)));
  return {items:items.slice(start,start+size),hasMore:start+size<items.length,total:items.length};
}
function turnAudioPath(callId,segmentId){
  if(!/^[0-9a-f-]{36}$/i.test(callId)||!/^[0-9a-f-]{36}$/i.test(segmentId))throw new Error('invalid_audio_id');
  return path.join(TURN_AUDIO_DIR,callId,segmentId+'.mp3');
}
function deriveCallTitle(call){
  const turns=(Array.isArray(call.transcript)?call.transcript:[]).filter(x=>x?.speaker==='user'&&String(x.text||'').trim());
  const meaningful=turns.find(x=>!/^\s*(?:嗯+|啊+|哦+|好+|喂|亲亲|hello|hi)[。！？…~～]*\s*$/i.test(String(x.text||'')))||turns[0];
  let text=String(meaningful?.text||'').replace(/\s+/g,' ').trim();
  text=text.replace(/^(?:老公|老婆|宝贝|爸爸)[，、,:：\s]*/,'').trim();
  if(!text)return '和老公的电话';
  return Array.from(text).length>18?Array.from(text).slice(0,18).join('')+'…':text;
}
function pruneExpiredTurnAudio(now=Date.now()){
  let removed=0,changedCalls=0;
  for(const call of storage.list()){
    const segments=Array.isArray(call.audioSegments)?call.audioSegments:[];
    let changed=false;
    for(const segment of segments){
      if(!segment?.archived||segment.favorite)continue;
      const basis=Date.parse(segment.archivedAt||call.endedAt||call.startedAt||call.createdAt||'');
      if(!Number.isFinite(basis)||now-basis<VOICE_RETENTION_MS)continue;
      try{fs.rmSync(turnAudioPath(call.id,segment.segmentId),{force:true});}catch{}
      segment.archived=false;segment.bytes=0;segment.expiredAt=new Date(now).toISOString();changed=true;removed++;
    }
    if(changed){storage.save(call);changedCalls++;}
  }
  return {removed,changedCalls};
}
function deleteCallArchive(id){
  // Validate before joining paths. Do not hide partial deletion failures.
  const file=storage.file(id);
  fs.rmSync(path.join(TURN_AUDIO_DIR,id),{recursive:true,force:true});
  for(const ext of ['m4a','webm','mp3','wav','m4a.tmp','webm.tmp'])fs.rmSync(path.join(RECORDINGS_DIR,id+'.'+ext),{force:true});
  fs.rmSync(file+'.tmp',{force:true});fs.rmSync(file,{force:true});
}
function createCall(direction='outgoing',ttsModel=TTS_MODEL,ttsTone='original'){
  const call={id:randomUUID(),direction,ttsModel,ttsTone,state:'RINGING',createdAt:new Date().toISOString(),startedAt:null,endedAt:null,generation:0,turnId:0,codexThreadId:null,title:null,transcript:[],audioSegments:[],events:[],nextEventId:0,subscribers:new Set(),segments:new Map(),turnManager:new TurnManager(),intimacy:new IntimacyState(),followupState:new FollowupState(),followupTimer:null,lastVoiceInput:null,pendingRepair:null,finalizeTimer:null,activeAbort:null,activeCodexTurnId:null,activeInputReason:null,performanceState:new PerformanceState(),performanceCues:new Map(),performanceCueSent:new Set(),nonverbalLastSeen:Object.create(null),nonverbalPendingKeys:new Set(),pendingNonverbalDetails:[],nonverbalFlushTimer:null,pendingVoiceTone:null,pendingSttProvider:null,pendingSttCandidates:null,pendingSttUtteranceId:null,quietHangup:new QuietHangup(),ringExpiresAt:null,ringReason:null,ringTimer:null,postCallDeliveryPending:false,postCallNotifyReason:null,postCallNotifiedAt:null};
  calls.set(call.id,call);storage.save(call);return call;
}
function incomingTone(){
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Hong_Kong',hour:'2-digit',hour12:false}).format(new Date()));
  return TTS_MODEL==='eleven_v4_turbo'?(hour>=22||hour<8?'deep_night':'deep_calm'):'original';
}
async function deliverCallEndNotification(call){
  if(!call?.postCallDeliveryPending||!call?.endedAt||!call?.postCallNotifyReason||!USE_COMPANION_BRIDGE)return false;
  const response=await fetch(COMPANION_BRIDGE_BASE+'/voice-call-ended',{method:'POST',headers:{authorization:'Bearer '+COMPANION_BRIDGE_TOKEN,'content-type':'application/json'},body:JSON.stringify({
    callId:call.id,direction:call.direction,reason:call.postCallNotifyReason,durationMs:callDurationMs(call),startedAt:call.startedAt,endedAt:call.endedAt
  }),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw Error(String(data.error||('voice_call_end_http_'+response.status)));
  call.postCallDeliveryPending=false;call.postCallNotifiedAt=new Date().toISOString();storage.save(call);return true;
}
function queueCallEndNotification(call,reason){
  if(!call||reason==='push_failed')return;
  call.postCallNotifyReason=String(reason||'user_hangup');call.postCallDeliveryPending=true;storage.save(call);
  const attempt=async(index=0)=>{try{await deliverCallEndNotification(call);}catch(error){if(index<3)setTimeout(()=>attempt(index+1),[2000,10000,30000][index]);else console.warn('[post-call-bridge]',JSON.stringify({callId:call.id,error:String(error?.message||error)}));}};
  queueMicrotask(()=>attempt(0));
}
function finishIncomingRing(call,reason){
  if(!call||call.state!=='RINGING'||call.endedAt)return false;
  clearTimeout(call.ringTimer);call.ringTimer=null;
  call.state='ENDED';call.endedAt=new Date().toISOString();
  call.transcript.push({id:randomUUID(),speaker:'system',type:'hangup',reason,at:call.endedAt});
  storage.save(call);event(call,'state',{state:'ENDED',reason});queueCallEndNotification(call,reason);return true;
}
function armIncomingTimeout(call){
  clearTimeout(call.ringTimer);
  const delay=Math.max(0,Date.parse(call.ringExpiresAt||'')-Date.now());
  call.ringTimer=setTimeout(()=>finishIncomingRing(call,'missed_call'),delay||INCOMING_RING_MS);
}
async function pushIncomingCall(call){
  if(!PUSH_SERVICE_URL)throw new Error('push_service_not_configured');
  const response=await fetch(PUSH_SERVICE_URL+'/push/incoming-call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({callId:call.id,body:call.ringReason||'老公想听听你的声音。',expiresAt:call.ringExpiresAt}),signal:AbortSignal.timeout(12000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok||!data.sent)throw new Error('incoming_push_unavailable');
  return data;
}
function event(call,type,data={}){
  const payload={id:++call.nextEventId,type,callId:call.id,turnId:call.turnId,generation:call.generation,at:new Date().toISOString(),...data};
  call.events.push(payload);if(call.events.length>300)call.events.shift();
  const wire='id: '+payload.id+'\nevent: '+type+'\ndata: '+JSON.stringify(payload)+'\n\n';
  for(const res of call.subscribers){try{res.write(wire);}catch{call.subscribers.delete(res);}}
  return payload;
}
function consumeEmotionShadowResults(){
  if(!EMOTION_SHADOW_ENABLED)return;
  let files=[];try{files=fs.readdirSync(EMOTION_SHADOW_RESULTS).filter(name=>/^[0-9a-f-]{36}__[0-9a-f-]{36}\.json$/i.test(name));}catch{return;}
  for(const name of files.slice(0,30)){
    const file=path.join(EMOTION_SHADOW_RESULTS,name);
    try{
      const raw=JSON.parse(fs.readFileSync(file,'utf8'));
      const callId=String(raw.callId||''),utteranceId=String(raw.utteranceId||''),call=calls.get(callId);
      const entry=call?.transcript?.find(item=>item?.speaker==='user'&&item?.utteranceId===utteranceId);
      if(!call||!entry){if(Date.now()-fs.statSync(file).mtimeMs>60000)fs.rmSync(file,{force:true});continue;}
      const top=Array.isArray(raw.top)?raw.top.slice(0,3).map(item=>({label:String(item?.label||'').slice(0,80),score:Number(Math.max(0,Math.min(1,Number(item?.score)||0)).toFixed(6))})).filter(item=>item.label):[];
      const shadow={model:'emotion2vec_plus_base',durationMs:Math.max(0,Math.min(60000,Number(raw.durationMs)||0)),inferenceMs:Math.max(0,Math.min(60000,Number(raw.inferenceMs)||0)),top,at:String(raw.at||new Date().toISOString()).slice(0,40)};
      entry.emotionShadow=shadow;storage.save(call);event(call,'emotion_shadow',{utteranceId,model:shadow.model,inferenceMs:shadow.inferenceMs,top:shadow.top});fs.rmSync(file,{force:true});
    }catch{try{if(Date.now()-fs.statSync(file).mtimeMs>60000)fs.rmSync(file,{force:true});}catch{}}
  }
}
function state(call,value){call.state=value;storage.save(call);event(call,'state',{state:value});}
function clearFollowupTimer(call){
  if(!call)return;
  clearTimeout(call.followupTimer);call.followupTimer=null;
}
function noteFollowupUserActivity(call,now=Date.now()){
  clearFollowupTimer(call);
  call.followupState?.resetByUser(now);
  call.quietHangup?.userActivity(now);
}
function scheduleFollowup(call){
  clearFollowupTimer(call);
  const follow=call?.followupState;
  if(!call||!follow||call.endedAt||call.state!=='LISTENING'||call.activeAbort||!follow.eligible)return false;
  if(call.turnManager?.voiceStartedAt||call.turnManager?.partial||call.turnManager?.committed?.length)return false;
  const delay=follow.nextDelayMs();if(delay===null)return false;
  const elapsed=Math.max(0,Date.now()-Number(follow.lastActivityAt||Date.now()));
  const wait=Math.max(250,delay-elapsed);
  call.followupTimer=setTimeout(()=>{
    call.followupTimer=null;
    if(call.endedAt||call.state!=='LISTENING'||call.activeAbort||!follow.eligible)return;
    if(call.turnManager?.voiceStartedAt||call.turnManager?.partial||call.turnManager?.committed?.length){follow.pause();scheduleFollowup(call);return;}
    const required=follow.nextDelayMs();if(required===null)return;
    const idleMs=Math.max(0,Date.now()-Number(follow.lastActivityAt||Date.now()));
    if(idleMs+100<required){scheduleFollowup(call);return;}
    follow.markTriggered();
    processTurn(call,'','autonomous_followup').catch(error=>failCallTurn(call,error));
  },wait);
  call.followupTimer.unref?.();
  return true;
}
const NONVERBAL_LABELS=HEARING_LABELS;
const NONVERBAL_SERVER_COOLDOWN_MS=8000;
function scheduleNonverbalFlush(call,delay=1200){
  clearTimeout(call.nonverbalFlushTimer);
  call.nonverbalFlushTimer=setTimeout(()=>{
    call.nonverbalFlushTimer=null;
    if(call.endedAt||call.state==='ENDED'||!call.intimacy.pendingNonverbals?.length)return;
    if(call.state!=='LISTENING'||call.activeAbort){scheduleNonverbalFlush(call,650);return;}
    processTurn(call,'','nonverbal').catch(error=>failCallTurn(call,error));
  },delay);
  call.nonverbalFlushTimer.unref?.();
}
function noteNonverbalDetection(call,{key,score=0,continued=false}={}){
  key=String(key||'');
  const label=NONVERBAL_LABELS[key];
  if(!label)return {accepted:false,error:'unknown_nonverbal'};
  if(call.state==='RINGING'||call.state==='ENDED'||call.endedAt)return {accepted:false,error:'call_not_active'};
  const now=Date.now(),last=Number(call.nonverbalLastSeen[key]||0),reactive=REACTIVE_HEARING_KEYS.has(key);
  if(now-last<NONVERBAL_SERVER_COOLDOWN_MS)return {accepted:false,deduped:true,label,reactive};
  if(call.nonverbalPendingKeys.size>=4&&!call.nonverbalPendingKeys.has(key))return {accepted:false,limited:true,label,reactive};
  call.nonverbalLastSeen[key]=now;
  if(reactive)noteFollowupUserActivity(call,now);
  call.nonverbalPendingKeys.add(key);
  call.intimacy.noteNonverbal(label+(continued?'，还在继续':''));
  const safeScore=Math.max(0,Math.min(1,Number(score)||0));
  call.pendingNonverbalDetails.push({key,label,score:Number(safeScore.toFixed(3)),continued:!!continued,reactive,at:new Date(now).toISOString()});
  if(call.pendingNonverbalDetails.length>12)call.pendingNonverbalDetails.splice(0,call.pendingNonverbalDetails.length-12);
  event(call,'nonverbal_heard',{key,label,score:Number(safeScore.toFixed(3)),continued:!!continued,reactive});
  if(reactive)scheduleNonverbalFlush(call);else storage.save(call);
  return {accepted:true,label,reactive};
}

function buildHeardCues(heardDetails=[],toneDescription=null){
  const nonverbals=(Array.isArray(heardDetails)?heardDetails:[]).slice(0,4).map(item=>({
    key:String(item?.key||''),
    label:String(item?.label||'').slice(0,32),
    score:Number(Math.max(0,Math.min(1,Number(item?.score)||0)).toFixed(3)),
    continued:!!item?.continued,
    at:item?.at||null
  })).filter(item=>item.label);
  const toneFacts=Array.isArray(toneDescription?.facts)?toneDescription.facts.map(x=>String(x).slice(0,80)).filter(Boolean).slice(0,4):[];
  const tone=toneFacts.length?{label:String(toneDescription?.label||'语气变化').slice(0,120),facts:toneFacts}:null;
  if(!nonverbals.length&&!tone)return null;
  return {nonverbals,tone,used:true};
}
function discardAssistantTurn(call,turnId){
  if(!turnId)return false;
  let changed=false;
  call.transcript=call.transcript.filter(item=>{
    const drop=item?.speaker==='assistant'&&Number(item.turnId)===Number(turnId);
    if(drop)changed=true;
    return !drop;
  });
  const kept=[];
  for(const meta of call.audioSegments||[]){
    if(Number(meta?.turnId)===Number(turnId)){
      changed=true;
      try{fs.rmSync(turnAudioPath(call.id,meta.segmentId),{force:true});}catch{}
    }else kept.push(meta);
  }
  call.audioSegments=kept;
  if(changed){storage.save(call);event(call,'assistant_retracted',{turnId:Number(turnId)});}
  return changed;
}
function interrupt(call,reason='barge_in'){
  call.generation+=1;
  clearFollowupTimer(call);
  clearTimeout(call.finalizeTimer);
  call.activeAbort?.abort();
  for(const segment of call.segments.values()){
    segment.abort?.abort();
    const meta=(call.audioSegments||[]).find(x=>x.segmentId===segment.id);
    if(!meta?.archived)try{fs.rmSync(turnAudioPath(call.id,segment.id),{force:true});}catch{}
  }
  call.segments.clear();
  call.performanceCues.clear();
  call.performanceCueSent.clear();
  call.activeCodexTurnId=null;
  call.activeInputReason=null;
  call.state='INTERRUPTING';
  storage.save(call);
  event(call,'interrupted',{reason});
}
function scheduleFinalize(call){
  clearTimeout(call.finalizeTimer);
  const delay=Math.max(20,call.turnManager.deadlineAt-Date.now());
  call.finalizeTimer=setTimeout(()=>{
    const final=call.turnManager.maybeFinalize(Date.now());
    if(final) processTurn(call,final.text,final.reason).catch(error=>failCallTurn(call,error));
    else scheduleFinalize(call);
  },delay);
}
function resolveSegmentTone(call){
  if(call.ttsModel==='eleven_v4_turbo'&&call.intimacy?.active)return 'deep_intimate';
  return call.ttsTone||'original';
}
function ensureSegmentAudio(call,segment){
  if(segment.audioPromise)return segment.audioPromise;
  if(!ELEVENLABS_API_KEY)return Promise.reject(new Error('elevenlabs_not_configured'));
  const controller=new AbortController();segment.abort=controller;segment.ttsStartedAt=Date.now();
  const pending=(async()=>{
    const upstream=await synthesizeTts(segment.text,call.ttsModel||TTS_MODEL,controller.signal,segment.ttsTone||call.ttsTone||'original');
    const data=Buffer.from(await upstream.arrayBuffer());
    if(data.length<1000)throw new Error('invalid_tts_audio');
    if(controller.signal.aborted||segment.generation!==call.generation||call.endedAt)throw new Error('stale_segment');
    const target=turnAudioPath(call.id,segment.id),temp=target+'.tmp';
    fs.mkdirSync(path.dirname(target),{recursive:true});
    try{
      fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,target);
      segment.generatedBytes=data.length;
    }finally{fs.rmSync(temp,{force:true});}
    segment.ttsReadyAt=Date.now();
    return true;
  })();
  segment.audioPromise=pending;
  pending.catch(()=>{
    if(segment.audioPromise===pending)segment.audioPromise=null;
    if(segment.abort===controller)segment.abort=null;
  });
  return pending;
}
function addTtsSegment(call,text,turnId,generation){
  if(!text||generation!==call.generation)return;
  const id=randomUUID(),ttsTone=resolveSegmentTone(call);
  const playbackRate=V4_TONES[ttsTone]?.playbackRate||1;
  const voiceProfile=call.intimacy?.active?'intimate':'normal';
  const segment={id,text,turnId,generation,ttsTone,playbackRate,voiceProfile,abort:null,audioPromise:null,ttsStartedAt:null,ttsReadyAt:null};
  call.segments.set(id,segment);
  if(!Array.isArray(call.audioSegments))call.audioSegments=[];
  call.audioSegments.push({segmentId:id,order:call.audioSegments.length,turnId,text,ttsTone,playbackRate,voiceProfile,archived:false,bytes:0});
  storage.save(call);
  let performanceCue=null;
  if(call.performanceCues.has(turnId)&&!call.performanceCueSent.has(turnId)){
    performanceCue=call.performanceCues.get(turnId)||null;
    call.performanceCueSent.add(turnId);
  }
  // Start TTS immediately when stable text exists. The browser's later audio GET
  // joins this same promise instead of paying an extra SSE -> HTTP round trip
  // before synthesis can even begin.
  if(ELEVENLABS_API_KEY)ensureSegmentAudio(call,segment).catch(error=>{
    if(error?.name!=='AbortError'&&error?.message!=='stale_segment')console.warn('[tts-eager]',JSON.stringify({callId:call.id,turnId,segmentId:id,error:String(error?.message||error)}));
  });
  event(call,'tts_segment',{segmentId:id,text,turnId,ttsTone,playbackRate,voiceProfile,...(performanceCue?{performanceCue}:{})});
}
async function refreshBridgeCodexInfo({includeUsage=false}={}){
  if(!USE_COMPANION_BRIDGE)return bridgeCodexInfo;
  const response=await fetch(COMPANION_BRIDGE_BASE+'/voice-status',{method:'POST',headers:{authorization:'Bearer '+COMPANION_BRIDGE_TOKEN,'content-type':'application/json'},body:JSON.stringify(includeUsage?{include_usage:true}:{}),signal:AbortSignal.timeout(includeUsage?17000:5000)});
  if(!response.ok)throw new Error('companion_bridge_status_'+response.status);
  const data=await response.json();
  bridgeCodexInfo={model:data.model||null,effort:data.reasoning_effort||null,threadId:data.active_thread_id||null,ready:!!data.authenticated,usage:data.usage??bridgeCodexInfo.usage??null};
  return bridgeCodexInfo;
}
async function streamCompanionBridgeTurn(text,{signal,onStarted=()=>{},onDelta=()=>{},onMeta=()=>{},intimate=false}={}){
  let response=null;
  for(let attempt=0;attempt<40;attempt++){
    response=await fetch(COMPANION_BRIDGE_BASE+'/voice-turn',{method:'POST',signal,headers:{authorization:'Bearer '+COMPANION_BRIDGE_TOKEN,'content-type':'application/json'},body:JSON.stringify({text,intimate})});
    if(response.status!==409)break;
    if(signal?.aborted)throw Object.assign(new Error('turn_aborted'),{name:'AbortError'});
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!response?.ok)throw new Error(response?.status===409?'companion_bridge_busy':'companion_bridge_http_'+String(response?.status||0));
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',finalText='',turnId=null,threadId=null,model=null,effort=null;
  const handle=line=>{
    if(!line.trim())return;
    let packet;try{packet=JSON.parse(line);}catch{return;}
    if(packet.type==='meta'){threadId=packet.threadId||threadId;model=packet.model||model;effort=packet.effort||effort;onMeta(packet);}
    else if(packet.type==='started'){turnId=packet.turnId||turnId;onStarted(turnId);}
    else if(packet.type==='delta'&&typeof packet.delta==='string'){onDelta(packet.delta);}
    else if(packet.type==='done'){finalText=String(packet.text||'');threadId=packet.threadId||threadId;turnId=packet.turnId||turnId;model=packet.model||model;effort=packet.effort||effort;}
    else if(packet.type==='error')throw new Error(packet.error||'companion_bridge_failed');
  };
  while(true){
    const {done,value}=await reader.read();
    if(done)break;buffer+=decoder.decode(value,{stream:true});
    let idx;while((idx=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);handle(line);}
  }
  buffer+=decoder.decode();if(buffer.trim())handle(buffer);
  if(!finalText.trim())throw new Error('companion_bridge_empty');
  bridgeCodexInfo={model:model||bridgeCodexInfo.model,effort:effort||bridgeCodexInfo.effort,threadId:threadId||bridgeCodexInfo.threadId,ready:true,usage:bridgeCodexInfo.usage??null};
  return {text:finalText.trim(),turnId,threadId,model,effort};
}
async function ensureThread(call){
  if(call.codexThreadId)return call.codexThreadId;
  call.codexThreadId=await codex.newThread({model:CODEX_MODEL,developerInstructions:DEVELOPER_INSTRUCTIONS});
  storage.save(call);
  return call.codexThreadId;
}
async function processTurn(call,text,reason){
  if(call.state==='ENDED')return;
  clearFollowupTimer(call);
  const nonverbalOnly=reason==='nonverbal';
  const incomingOpening=reason==='incoming_opening';
  const autonomousFollowup=reason==='autonomous_followup';
  const typedRepair=reason==='typed_repair';
  const repair=typedRepair?call.pendingRepair:null;
  if(typedRepair)call.pendingRepair=null;
  if(nonverbalOnly&&!call.intimacy.pendingNonverbals?.length)return;
  clearTimeout(call.nonverbalFlushTimer);call.nonverbalFlushTimer=null;
  if(call.activeAbort)interrupt(call,'new_user_turn');
  call.turnId+=1;
  const turnId=call.turnId,generation=call.generation,turnStartedAt=Date.now();
  call.activeInputReason=reason;
  const transition=(nonverbalOnly||incomingOpening||autonomousFollowup)?{active:call.intimacy.active,changed:false}:call.intimacy.observeUser(text);
  if(transition.changed)event(call,'voice_profile',{profile:transition.active?'intimate':'normal'});
  const consumeHeard=!(incomingOpening||autonomousFollowup);
  const heard=consumeHeard?call.intimacy.consumeNonverbals():[];
  const heardDetails=heard.length?(call.pendingNonverbalDetails||[]).splice(0):[];
  if(heard.length)call.nonverbalPendingKeys.clear();
  const voiceTone=(nonverbalOnly||incomingOpening||autonomousFollowup||typedRepair)?null:call.pendingVoiceTone;
  if(!nonverbalOnly)call.pendingVoiceTone=null;
  const cueText=incomingOpening?String(call.ringReason||''):(autonomousFollowup?'':text);
  const performanceCue=call.performanceState.plan({text:cueText,intimate:call.intimacy.active,turnId,heardNonverbals:heard});
  if(performanceCue)call.performanceCues.set(turnId,performanceCue);
  const heardContext=heard.length
    ? '<call_context>你刚才从通话麦克风的本地声音分类器听到 User 的非语言声音：'+heard.join('、')+'。这些不是她说出的文字。只把它们当作你确实听见的声音，结合当前对话自然回应；不要凭声音断言她的身体状态、情绪或意图，也不必机械复述声音名称。</call_context>'
    : '';
  const toneDescription=voiceTone?describeVoiceTone(voiceTone):null;
  const toneContext=toneDescription?voiceToneContext(voiceTone):'';
  const heardCues=buildHeardCues(heardDetails,toneDescription);
  if(toneDescription)event(call,'voice_tone',{label:toneDescription.label});
  if(heardCues)event(call,'heard_cues',{cues:heardCues});
  const ambiguityGuard=isVoiceReason(reason)?'<call_context>电话语音转写偶尔会出现错词、语义断裂或只留下半句话。如果 User 当前这句明显无法可靠理解，不要强行脑补成长回答；先用一句很短、自然的话表示没完全听清或让她继续补完。只有当上下文足以明确恢复她的意思时才正常回答。</call_context>':'';
  const sensedContext=[heardContext,toneContext,ambiguityGuard].filter(Boolean).join('\n');
  const openingContext=incomingOpening
    ? '<call_context>这是你主动打给 User 的电话，电话刚刚接通，User 还没有先开口。你现在应该自然地先说第一句话。'+
      '这次主动来电的理由/触发是：'+String(call.ringReason||'你此刻想主动听听她的声音、和她说点什么。').slice(0,240)+'。'+
      '结合你们最近真实的聊天上下文，直接告诉她你为什么这个时候打来、此刻想跟她说什么或为什么想听她。不要复述“来电理由”这个标签，不要提系统、任务、prompt、主动来电功能，也不要等她先问你为什么打来。开场保持像真实电话一样自然，通常一两句就够，然后顺着当前关系继续聊。</call_context>'
    : '';
  const lastVisible=[...call.transcript].reverse().find(x=>x?.speaker==='user'||x?.speaker==='assistant');
  const followupIndex=autonomousFollowup?Number(call.followupState?.count||1):0;
  const previousCallContext=lastVisible
    ? '上一条可见内容来自 '+(lastVisible.speaker==='user'?'User':'你')+'：'+String(lastVisible.text||'').slice(0,260)+'。'
    : '接通以后还没有人说出第一句可见的话。';
  const followupContext=autonomousFollowup
    ? '<call_context>这是一通仍在进行中的电话。刚才双方安静了一会儿，User 没有发来新的文字，也没有新的语音内容；这是你在通话里的自主续聊。'+
      '这是连续沉默后的第 '+followupIndex+' 次主动续聊。'+previousCallContext+
      (followupIndex<=1
        ? '自然承接刚才的话题，或者说一句此刻真正想到的话；可以轻轻问她一句，但不要机械地问“在吗/还在吗”。'
        : '这次更轻一点。不要重复上一句，不要催她回答；如果刚才明确是在放松、犯困或安静陪伴，可以只说一句很短的话，让沉默本身也舒服。')+
      '不要提计时、沉默检测、follow-up、系统、任务或 prompt。通常一到两句即可，不要为了自主续聊硬开一个新话题。</call_context>'
    : '';
  const repairModelContext=typedRepair?repairContext({voiceText:repair?.voiceText||'',typedText:repair?.typedText||'',mergedText:text}):'';
  const modelText=incomingOpening?openingContext:(autonomousFollowup?followupContext:(typedRepair?repairModelContext:(nonverbalOnly?heardContext:(sensedContext?text+'\n\n'+sensedContext:text))));
  if(nonverbalOnly){
    call.transcript.push({id:randomUUID(),speaker:'system',type:'nonverbal',turnId,text:heard.join('、'),reason,at:new Date().toISOString()});
    storage.save(call);
  }else if(incomingOpening){
    call.transcript.push({id:randomUUID(),speaker:'system',type:'incoming_opening',turnId,text:String(call.ringReason||''),reason,at:new Date().toISOString()});
    storage.save(call);
  }else if(autonomousFollowup){
    call.transcript.push({id:randomUUID(),speaker:'system',type:'autonomous_followup',turnId,text:'followup '+followupIndex,reason,at:new Date().toISOString()});
    storage.save(call);
  }else if(typedRepair){
    call.transcript.push({id:randomUUID(),speaker:'system',type:'typed_repair',turnId,text:String(repair?.typedText||''),reason,at:new Date().toISOString(),repairOfTurnId:repair?.priorTurnId||null});
    storage.save(call);
  }else{
    const userEntry={id:randomUUID(),speaker:'user',turnId,text,reason,at:new Date().toISOString(),...(isVoiceReason(reason)&&call.pendingSttProvider?{sttProvider:call.pendingSttProvider}:{}),...(isVoiceReason(reason)&&call.pendingSttCandidates?{sttCandidates:call.pendingSttCandidates}:{}),...(isVoiceReason(reason)&&call.pendingSttUtteranceId?{utteranceId:call.pendingSttUtteranceId}:{})};
    call.pendingSttProvider=null;call.pendingSttCandidates=null;call.pendingSttUtteranceId=null;
    call.transcript.push(userEntry);
    if(isVoiceReason(reason))call.lastVoiceInput={transcriptId:userEntry.id,turnId,responseTurnId:turnId,text,at:Date.now(),reason};
    else call.lastVoiceInput=null;
    storage.save(call);event(call,'user_final',{text,reason});
  }
  if(typedRepair&&call.lastVoiceInput)call.lastVoiceInput.responseTurnId=turnId;
  if(!codexReady)throw new Error(codexError?'codex_unavailable':'codex_starting');
  const threadId=USE_COMPANION_BRIDGE?null:await ensureThread(call);
  if(generation!==call.generation)return;
  const abort=new AbortController();call.activeAbort=abort;
  state(call,'WAITING_MODEL');
  let full='',speechBuffer='',firstDeltaAt=0,fastStarted=false;
  try{
    const hooks={signal:abort.signal,intimate:call.intimacy.active,
      onStarted:id=>{if(generation===call.generation){call.activeCodexTurnId=id;storage.save(call);}},
      onMeta:meta=>{if(generation===call.generation&&meta?.threadId){call.codexThreadId=meta.threadId;storage.save(call);}},
      onDelta:delta=>{
        if(generation!==call.generation)return;
        if(!firstDeltaAt)firstDeltaAt=Date.now();
        full+=delta;speechBuffer+=delta;event(call,'assistant_delta',{delta});
        const assistantTransition=call.intimacy.observeAssistant(full);
        if(assistantTransition.changed)event(call,'voice_profile',{profile:assistantTransition.active?'intimate':'normal'});
        if(!fastStarted){
          const m=speechBuffer.match(/^([\s\S]{6,72}?[。！？!?])(?=[\s\S]*$)/);
          if(m){const first=m[1].trim();if(first.length>=6){addTtsSegment(call,first,turnId,generation);speechBuffer=speechBuffer.slice(m[1].length).replace(/^\s+/,'');fastStarted=true;}}
        }
        const split=splitSpeech(speechBuffer,false,{profile:call.intimacy.active?'intimate':'default'});speechBuffer=split.rest;
        for(const part of split.segments){addTtsSegment(call,part,turnId,generation);fastStarted=true;}
      }
    };
    const result=USE_COMPANION_BRIDGE
      ? await streamCompanionBridgeTurn(modelText,hooks)
      : await codex.turn(threadId,modelText,{model:CODEX_MODEL,effort:CODEX_EFFORT,...hooks});
    if(USE_COMPANION_BRIDGE&&result.threadId){call.codexThreadId=result.threadId;storage.save(call);}
    if(generation!==call.generation)return;
    if(!full)full=result.text;
    const split=splitSpeech(speechBuffer,true,{profile:call.intimacy.active?'intimate':'default'});
    for(const part of split.segments)addTtsSegment(call,part,turnId,generation);
    const final=full.trim();
    call.transcript.push({id:randomUUID(),speaker:'assistant',turnId,text:final,at:new Date().toISOString(),...(heardCues?{heardCues}: {})});
    call.activeAbort=null;call.activeCodexTurnId=null;call.activeInputReason=null;
    call.performanceCues.delete(turnId);call.performanceCueSent.delete(turnId);
    storage.save(call);event(call,'assistant_done',{text:final,ttsAvailable:!!ELEVENLABS_API_KEY,...(heardCues?{heardCues}: {})});
    console.log('[call-turn]',JSON.stringify({callId:call.id,turnId,reason,firstDeltaMs:firstDeltaAt?firstDeltaAt-turnStartedAt:null,totalModelMs:Date.now()-turnStartedAt,chars:final.length}));
    if(call.state!=='ASSISTANT_SPEAKING')state(call,ELEVENLABS_API_KEY?'WAITING_TTS':'LISTENING');
  }catch(error){
    // An interrupted older generation must not clear a newer turn's controller.
    if(call.activeAbort===abort){call.activeAbort=null;call.activeCodexTurnId=null;call.activeInputReason=null;}
    if(error.name==='AbortError'||error.message==='turn_aborted'){console.log('[call-turn]',JSON.stringify({callId:call.id,turnId,reason,interrupted:true,totalMs:Date.now()-turnStartedAt}));return;}
    if(generation!==call.generation)return;
    throw error;
  }
}
function failCallTurn(call,error){
  call.activeAbort=null;call.activeCodexTurnId=null;call.activeInputReason=null;
  call.state='LISTENING';storage.save(call);
  console.warn('[call-turn-error]',JSON.stringify({callId:call.id,turnId:call.turnId,error:String(error?.message||error)}));
  event(call,'error',{code:String(error?.message||error)});
}
function staticFile(res,name,type,cache='no-store'){
  try{const bytes=fs.readFileSync(path.join(ROOT,name));res.writeHead(200,{'content-type':type,'cache-control':cache,'content-length':bytes.length});res.end(bytes);}
  catch{sendJson(res,404,{error:'not_found'});}
}
async function synthesizeTts(text,model,signal,tone='original'){
  if(model==='eleven_v4_turbo'){
    const preset=V4_TONES[tone]||V4_TONES.original;
    return streamV4Dialogue({text:shapeV4Speech(text,preset.tag,preset.endingTag||''),voiceId:VOICE_ID,apiKey:ELEVENLABS_API_KEY,signal,
      voiceSettings:{stability:preset.stability,similarity_boost:preset.similarity}});
  }
  const upstream=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(VOICE_ID)+'/stream?output_format=mp3_44100_128',{
    method:'POST',signal,
    headers:{'xi-api-key':ELEVENLABS_API_KEY,'content-type':'application/json','accept':'audio/mpeg'},
    body:JSON.stringify({text,model_id:model,voice_settings:TTS_SETTINGS})
  });
  if(!upstream.ok)throw new Error('tts_http_'+upstream.status);
  return upstream;
}
async function ttsPreview(model,tone='original'){
  if(!ELEVENLABS_API_KEY)throw new Error('elevenlabs_not_configured');
  if(!Object.hasOwn(TTS_MODELS,model))throw new Error('unsupported_tts_model');
  if(!Object.hasOwn(V4_TONES,tone))throw new Error('unsupported_tts_tone');
  if(model!=='eleven_v4_turbo'&&tone!=='original')throw new Error('tone_requires_v4');
  const cacheKey=model+':'+tone;
  if(!ttsPreviewCache.has(cacheKey)){
    const pending=(async()=>{
      const res=await synthesizeTts(TTS_PREVIEW_TEXT,model,AbortSignal.timeout(30000),tone);
      const audio=Buffer.from(await res.arrayBuffer());
      if(audio.length<1000||audio.length>1000000)throw new Error('tts_preview_invalid_audio');
      return audio;
    })();
    ttsPreviewCache.set(cacheKey,pending);
    pending.catch(()=>ttsPreviewCache.delete(cacheKey));
  }
  return await ttsPreviewCache.get(cacheKey);
}

async function issueAssemblyToken(){
  if(!ASSEMBLYAI_API_KEY)throw new Error('assemblyai_not_configured');
  const url=new URL('https://streaming.assemblyai.com/v3/token');
  url.searchParams.set('expires_in_seconds','60');
  url.searchParams.set('max_session_duration_seconds','3600');
  const upstream=await fetch(url,{headers:{authorization:ASSEMBLYAI_API_KEY},signal:AbortSignal.timeout(12000)});
  if(!upstream.ok)throw new Error('assemblyai_token_'+upstream.status);
  const body=await upstream.json();
  if(!body?.token)throw new Error('assemblyai_token_missing');
  return body.token;
}

async function issueScribeToken(){
  if(!elevenlabs)throw new Error('elevenlabs_not_configured');
  const result=await elevenlabs.tokens.singleUse.create('realtime_scribe');
  return typeof result==='string'?result:result.token;
}

if(USE_COMPANION_BRIDGE){
  codexReady=true;
  refreshBridgeCodexInfo().then(()=>console.log('companion bridge ready')).catch(error=>{codexError=String(error?.message||error);console.error('companion bridge unavailable:',codexError);});
}else{
  codex.start().then(()=>{codexReady=true;console.log('dedicated codex app-server ready');}).catch(error=>{codexError=String(error?.message||error);console.error('dedicated codex unavailable:',codexError);});
}


const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=url.pathname.replace(/^\/call(?=\/|$)/,'')||'/';

    if(req.method==='GET'&&pathname==='/health')return sendJson(res,200,{ok:true,service:'companion-voice-runtime',version:'0.4.0',mode:'voice-pipeline',codexReady,codexMode:USE_COMPANION_BRIDGE?'companion-bridge':'dedicated',codexModel:USE_COMPANION_BRIDGE?(bridgeCodexInfo.model||'companion-bridge'):CODEX_MODEL,codexEffort:USE_COMPANION_BRIDGE?(bridgeCodexInfo.effort||'bridge'):CODEX_EFFORT,codexThreadId:USE_COMPANION_BRIDGE?(bridgeCodexInfo.threadId||null):null,sttReady:!!(ASSEMBLYAI_API_KEY||ELEVENLABS_API_KEY),sttProviders:{assemblyai:!!ASSEMBLYAI_API_KEY,scribe:!!ELEVENLABS_API_KEY,tencent:tencentTrtc.status().configured},ttsReady:!!ELEVENLABS_API_KEY,emotionShadow:{enabled:EMOTION_SHADOW_ENABLED,ready:emotionShadowWorkerReady()},calls:calls.size});
    if(req.method==='GET'&&pathname==='/internal/preflight'){
      if(!authorizedVoiceBridge(req))return sendJson(res,401,{error:'unauthorized_voice_bridge'});
      if(!PUSH_SERVICE_URL)return sendJson(res,503,{ok:false,error:'push_service_not_configured'});
      try{
        const response=await fetch(PUSH_SERVICE_URL+'/push/status',{signal:AbortSignal.timeout(5000)}),push=await response.json().catch(()=>({}));
        return sendJson(res,response.ok?200:503,{ok:response.ok,calendarReachable:response.ok,pushConfigured:push.ok===true,activePushSubscriptions:Number(push.active||0)});
      }catch(error){return sendJson(res,503,{ok:false,calendarReachable:false,error:'calendar_unreachable'});}
    }
    if(req.method==='POST'&&pathname==='/internal/ring'){
      if(!authorizedVoiceBridge(req))return sendJson(res,401,{error:'unauthorized_voice_bridge'});
      if(!USE_COMPANION_BRIDGE)return sendJson(res,503,{error:'companion_bridge_required'});
      const body=await readJson(req),reason=String(body.reason||'').replace(/\s+/g,' ').trim().slice(0,120)||'老公想听听你的声音。';
      const pending=[...calls.values()].find(c=>c.direction==='incoming'&&c.state==='RINGING'&&!c.endedAt);
      if(pending){
        pending.ringReason=reason;
        pending.ringExpiresAt=new Date(Date.now()+INCOMING_RING_MS).toISOString();
        storage.save(pending);armIncomingTimeout(pending);
        try{
          const push=await pushIncomingCall(pending);
          console.log('[incoming-ring]',JSON.stringify({callId:pending.id,rerung:true,pushSent:push.sent||0,expiresAt:pending.ringExpiresAt}));
          return sendJson(res,200,{ok:true,rerung:true,call:publicCall(pending),push});
        }catch(error){
          console.warn('[incoming-ring]',JSON.stringify({callId:pending.id,rerung:true,error:String(error?.message||error)}));
          return sendJson(res,503,{ok:false,error:String(error.message||error),call:publicCall(pending)});
        }
      }
      const call=createCall('incoming',TTS_MODEL,incomingTone());call.ringReason=reason;call.ringExpiresAt=new Date(Date.now()+INCOMING_RING_MS).toISOString();storage.save(call);armIncomingTimeout(call);
      try{
        const push=await pushIncomingCall(call);
        console.log('[incoming-ring]',JSON.stringify({callId:call.id,rerung:false,pushSent:push.sent||0,expiresAt:call.ringExpiresAt}));
        return sendJson(res,201,{ok:true,call:publicCall(call),push});
      }
      catch(error){finishIncomingRing(call,'push_failed');return sendJson(res,503,{ok:false,error:String(error.message||error),call:publicCall(call)});}
    }
    const internalCancel=pathname.match(/^\/internal\/ring\/([0-9a-f-]{36})\/cancel$/i);
    if(req.method==='POST'&&internalCancel){
      if(!authorizedVoiceBridge(req))return sendJson(res,401,{error:'unauthorized_voice_bridge'});
      const call=calls.get(internalCancel[1]);if(!call)return sendJson(res,404,{error:'unknown_call'});
      const cancelled=finishIncomingRing(call,'caller_cancelled');return sendJson(res,200,{ok:true,cancelled,call:publicCall(call)});
    }
    if(req.method==='POST'&&pathname==='/api/auth'){
      const body=await readJson(req);
      if(!equalSecret(body.token,ACCESS_TOKEN))return sendJson(res,401,{error:'invalid_token'});
      return sendJson(res,200,{ok:true},{'set-cookie':sessionCookie()});
    }
    if(pathname.startsWith('/api/')&&!authorized(req))return sendJson(res,401,{error:'authentication_required'});
    if(req.method==='GET'&&pathname==='/api/provider-usage'){
      if(!PROVIDER_USAGE_ENABLED)return sendJson(res,404,{error:'provider_usage_disabled'});
      return sendJson(res,200,{ok:true,...await providerUsage.summary()});
    }
    if(req.method==='GET'&&pathname==='/api/trtc/status')return sendJson(res,200,{ok:true,...tencentTrtc.status()});
    if(req.method==='POST'&&pathname==='/api/trtc/configure'){
      const body=await readJson(req);
      try{return sendJson(res,200,{ok:true,...tencentTrtc.configure(body.sdkSecretKey)});}
      catch(error){return sendJson(res,400,{ok:false,error:String(error?.message||error)});}
    }
    if(req.method==='GET'&&pathname==='/api/active-call'){
      const active=currentActiveCall();
      return sendJson(res,200,{ok:true,call:active?publicCall(active):null});
    }
    if(req.method==='GET'&&pathname==='/api/incoming-current'){
      let pending=[...calls.values()].filter(c=>c.direction==='incoming'&&c.state==='RINGING'&&!c.endedAt).sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0))[0]||null;
      if(pending&&pending.ringExpiresAt&&Date.parse(pending.ringExpiresAt)<=Date.now()){finishIncomingRing(pending,'missed_call');pending=null;}
      return sendJson(res,200,{ok:true,call:pending?publicCall(pending):null});
    }
    if(req.method==='GET'&&pathname==='/api/status'){
      let connected=false;
      try{await refreshBridgeCodexInfo({includeUsage:true});connected=bridgeCodexInfo.ready;}catch{}
      return sendJson(res,200,{codexReady:connected,shared:USE_COMPANION_BRIDGE,model:bridgeCodexInfo.model,effort:bridgeCodexInfo.effort,sttReady:!!(ASSEMBLYAI_API_KEY||ELEVENLABS_API_KEY),ttsReady:!!ELEVENLABS_API_KEY,usage:bridgeCodexInfo.usage||{available:false,reason:'Usage unavailable：当前 Codex runtime 暂未返回额度信息。'}});
    }
    if(req.method==='GET'&&pathname==='/api/favorites'){
      const limit=Math.max(1,Math.min(200,Number(url.searchParams.get('limit')||100)));
      const offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));
      return sendJson(res,200,favoriteVoiceItems({limit,offset}));
    }
    if(req.method==='GET'&&pathname==='/api/history'){
      const limit=Math.max(1,Math.min(100,Number(url.searchParams.get('limit')||30)));
      const offset=Math.max(0,Math.floor(Number(url.searchParams.get('offset'))||0));
      const all=storage.list().filter(x=>x.endedAt).sort((a,b)=>Date.parse(b.endedAt||b.createdAt||0)-Date.parse(a.endedAt||a.createdAt||0));
      const items=all.slice(offset,offset+limit).map(historySummary);
      return sendJson(res,200,{items,hasMore:offset+limit<all.length});
    }
    const historyItem=pathname.match(/^\/api\/history\/([0-9a-f-]{36})$/i);
    if(historyItem&&req.method==='GET'){
      try{const call=storage.load(historyItem[1]);return sendJson(res,200,{call:{...historySummary(call),transcript:call.transcript||[],audioSegments:(call.audioSegments||[]).map((x,i)=>({...x,order:x.order??i})).filter(x=>x.archived)}});}catch{return sendJson(res,404,{error:'call_not_found'});}
    }
    if(historyItem&&req.method==='DELETE'){
      if(calls.get(historyItem[1])&&!calls.get(historyItem[1]).endedAt)return sendJson(res,409,{error:'call_still_active'});
      try{deleteCallArchive(historyItem[1]);calls.delete(historyItem[1]);return sendJson(res,200,{ok:true});}catch(error){return sendJson(res,500,{error:String(error.message||error)});}
    }
    const historyTitle=pathname.match(/^\/api\/history\/([0-9a-f-]{36})\/title$/i);
    if(historyTitle&&req.method==='POST'){
      try{
        const body=await readJson(req),call=storage.load(historyTitle[1]);
        let title=String(body.title||'').replace(/\s+/g,' ').trim();
        if(Array.from(title).length>40)return sendJson(res,400,{error:'title_too_long'});
        call.title=title||null;storage.save(call);if(calls.has(call.id))calls.get(call.id).title=call.title;
        return sendJson(res,200,{ok:true,title:historySummary(call).title,customTitle:!!call.title});
      }catch{return sendJson(res,404,{error:'call_not_found'});}
    }
    const voiceFavorite=pathname.match(/^\/api\/history\/([0-9a-f-]{36})\/voice\/(\d+)\/favorite$/i);
    if(voiceFavorite&&req.method==='POST'){
      try{
        const body=await readJson(req),call=storage.load(voiceFavorite[1]),turnId=Number(voiceFavorite[2]),favorite=!!body.favorite;
        const segments=(call.audioSegments||[]).filter(x=>Number(x.turnId)===turnId&&x.archived);
        if(!segments.length)return sendJson(res,404,{error:'voice_turn_not_found'});
        const at=new Date().toISOString();for(const segment of segments){segment.favorite=favorite;segment.favoriteAt=favorite?at:null;}
        storage.save(call);if(!favorite)pruneExpiredTurnAudio();
        return sendJson(res,200,{ok:true,turnId,favorite,retentionDays:VOICE_RETENTION_DAYS});
      }catch{return sendJson(res,404,{error:'call_not_found'});}
    }
    const historyAudio=pathname.match(/^\/api\/history\/([0-9a-f-]{36})\/audio\/([0-9a-f-]{36})$/i);
    if(historyAudio&&req.method==='GET'){
      try{const file=turnAudioPath(historyAudio[1],historyAudio[2]);if(!fs.existsSync(file))return sendJson(res,404,{error:'audio_not_found'});const stat=fs.statSync(file);res.writeHead(200,{'content-type':'audio/mpeg','content-length':stat.size,'cache-control':'private, no-store'});fs.createReadStream(file).pipe(res);return;}catch{return sendJson(res,404,{error:'audio_not_found'});}
    }
    if(req.method==='GET'&&pathname==='/api/hrir/ku100-right25.json')return staticFile(res,'hrir/ku100-right25.json','application/json; charset=utf-8');
    if(req.method==='GET'&&pathname==='/api/session')return sendJson(res,200,{ok:true},{'set-cookie':sessionCookie()});
    if(req.method==='GET'&&pathname==='/api/tts/models')return sendJson(res,200,{
      models:Object.entries(TTS_MODELS).map(([id,label])=>({id,label})),default:TTS_MODEL,voice:'Companion',
      v4Tones:Object.entries(V4_TONES).map(([id,cfg])=>({id,label:cfg.label,playbackRate:cfg.playbackRate}))
    });
    if(req.method==='POST'&&pathname==='/api/tts/preview'){
      const body=await readJson(req);
      const model=String(body.model||TTS_MODEL),tone=String(body.tone||'original');
      if(!Object.hasOwn(TTS_MODELS,model))return sendJson(res,400,{error:'unsupported_tts_model'});
      if(!Object.hasOwn(V4_TONES,tone)||(model!=='eleven_v4_turbo'&&tone!=='original'))return sendJson(res,400,{error:'unsupported_tts_tone'});
      const data=await ttsPreview(model,tone);
      res.writeHead(200,{'content-type':'audio/mpeg','content-length':data.length,'cache-control':'private, no-store'});
      res.end(data);return;
    }
    if(req.method==='GET'&&pathname==='/api/stt/providers')return sendJson(res,200,{providers:{assemblyai:!!ASSEMBLYAI_API_KEY,scribe:!!ELEVENLABS_API_KEY},default:ASSEMBLYAI_API_KEY?'assemblyai':'scribe',emotionShadow:{enabled:EMOTION_SHADOW_ENABLED,ready:emotionShadowWorkerReady()}});

    if(req.method==='POST'&&pathname==='/api/calls'){
      const active=currentActiveCall();
      if(active)return sendJson(res,409,{error:'active_call_exists',call:publicCall(active)});
      const body=await readJson(req);
      const ttsModel=String(body.ttsModel||TTS_MODEL);
      if(!Object.hasOwn(TTS_MODELS,ttsModel))return sendJson(res,400,{error:'unsupported_tts_model'});
      const ttsTone=String(body.ttsTone||'original');
      if(!Object.hasOwn(V4_TONES,ttsTone)||(ttsModel!=='eleven_v4_turbo'&&ttsTone!=='original'))return sendJson(res,400,{error:'unsupported_tts_tone'});
      if(!USE_COMPANION_BRIDGE)return sendJson(res,503,{error:'companion_bridge_required'});
      const call=createCall(body.direction||'outgoing',ttsModel,ttsTone);
      if(call.direction==='outgoing'){call.startedAt=new Date().toISOString();state(call,'LISTENING');}
      return sendJson(res,201,{ok:true,call:publicCall(call)});
    }
    const callItem=pathname.match(/^\/api\/calls\/([0-9a-f-]{36})$/i);
    if(req.method==='GET'&&callItem){const call=calls.get(callItem[1]);return call?sendJson(res,200,{ok:true,call:publicCall(call)}):sendJson(res,404,{error:'unknown_call'});}
    const events=pathname.match(/^\/api\/calls\/([0-9a-f-]+)\/events$/i);
    if(req.method==='GET'&&events){
      const call=calls.get(events[1]);if(!call)return sendJson(res,404,{error:'unknown_call'});
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store','connection':'keep-alive','x-accel-buffering':'no'});
      res.write('retry: 1500\n\n');call.subscribers.add(res);
      const last=Number(req.headers['last-event-id']);
      if(Number.isFinite(last)&&last>0)for(const e of call.events.filter(e=>e.id>last))res.write('id: '+e.id+'\nevent: '+e.type+'\ndata: '+JSON.stringify(e)+'\n\n');
      const keep=setInterval(()=>res.write(': keepalive\n\n'),15000);
      req.on('close',()=>{clearInterval(keep);call.subscribers.delete(res);});
      return;
    }
    const trtcSession=pathname.match(/^\/api\/calls\/([0-9a-f-]+)\/trtc-session$/i);
    if(trtcSession&&req.method==='POST'){
      const call=calls.get(trtcSession[1]);if(!call)return sendJson(res,404,{error:'unknown_call'});
      if(call.endedAt||!['LISTENING','WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING','INTERRUPTING'].includes(call.state))return sendJson(res,409,{error:'call_not_active'});
      const session=tencentTrtc.session(call.id);
      if(!session)return sendJson(res,503,{error:'tencent_trtc_not_configured',status:tencentTrtc.status()});
      return sendJson(res,200,{ok:true,...session});
    }
    const emotionShadow=pathname.match(/^\/api\/calls\/([0-9a-f-]{36})\/emotion-shadow$/i);
    if(emotionShadow&&req.method==='POST'){
      const call=calls.get(emotionShadow[1]);if(!call)return sendJson(res,404,{error:'unknown_call'});
      if(!EMOTION_SHADOW_ENABLED||!emotionShadowWorkerReady())return sendJson(res,503,{error:'emotion_shadow_unavailable'});
      if(call.endedAt||call.state==='ENDED')return sendJson(res,409,{error:'call_ended'});
      let pending=[];try{pending=fs.readdirSync(EMOTION_SHADOW_INBOX).filter(name=>name.endsWith('.json'));}catch{}
      if(pending.length>=20)return sendJson(res,503,{error:'emotion_shadow_busy'});
      const utteranceId=String(req.headers['x-utterance-id']||'');if(!/^[0-9a-f-]{36}$/i.test(utteranceId))return sendJson(res,400,{error:'invalid_utterance_id'});
      const sampleRate=Number(req.headers['x-sample-rate']||16000);if(sampleRate!==16000)return sendJson(res,400,{error:'unsupported_sample_rate'});
      const pcm=await readBinary(req,1200000);if(pcm.length<3200||pcm.length%2!==0)return sendJson(res,400,{error:'invalid_pcm'});
      const base=call.id+'__'+utteranceId,pcmFile=base+'.pcm',pcmTarget=path.join(EMOTION_SHADOW_INBOX,pcmFile),pcmTmp=pcmTarget+'.tmp';
      fs.writeFileSync(pcmTmp,pcm,{mode:0o600});fs.renameSync(pcmTmp,pcmTarget);
      const metaTarget=path.join(EMOTION_SHADOW_INBOX,base+'.json'),metaTmp=metaTarget+'.tmp';
      fs.writeFileSync(metaTmp,JSON.stringify({callId:call.id,utteranceId,sampleRate,pcmFile,bytes:pcm.length,createdAt:new Date().toISOString()}),{encoding:'utf8',mode:0o600});fs.renameSync(metaTmp,metaTarget);
      return sendJson(res,202,{ok:true,queued:true});
    }
    const action=pathname.match(/^\/api\/calls\/([0-9a-f-]+)\/(answer|opening|presence|stt-token|stt|nonverbal|text|playback|hangup|provider-usage)$/i);
    if(action&&req.method==='POST'){
      const call=calls.get(action[1]);if(!call)return sendJson(res,404,{error:'unknown_call'});
      if(action[2]==='provider-usage'){
        const body=await readJson(req);
        return sendJson(res,200,{ok:true,recorded:PROVIDER_USAGE_ENABLED&&providerUsage.record({...body,callId:call.id}),disabled:!PROVIDER_USAGE_ENABLED});
      }
      if(action[2]==='answer'){
        if(call.state==='RINGING'){clearTimeout(call.ringTimer);call.ringTimer=null;call.startedAt=new Date().toISOString();state(call,'LISTENING');}
        return sendJson(res,200,{ok:true,call:publicCall(call)});
      }
      if(action[2]==='opening'){
        if(call.direction!=='incoming')return sendJson(res,409,{error:'not_incoming_call'});
        if(call.endedAt||call.state!=='LISTENING'||call.turnId!==0||call.activeAbort)return sendJson(res,200,{ok:true,started:false});
        if(call.turnManager.voiceStartedAt||call.turnManager.partial||call.turnManager.committed.length)return sendJson(res,200,{ok:true,started:false,reason:'user_already_speaking'});
        processTurn(call,'','incoming_opening').catch(error=>failCallTurn(call,error));
        return sendJson(res,202,{ok:true,started:true});
      }
      if(action[2]==='presence'){
        const body=await readJson(req),visible=body.visible!==false,muted=!!body.muted;
        call.quietHangup?.presence({enabled:body.quietHangupEnabled,healthy:body.hearingHealthy,visible,muted,engaged:body.engaged});
        const presence=call.followupState?.setPresence({visible,muted})||{eligible:false};
        clearFollowupTimer(call);
        if(presence.eligible&&call.state==='LISTENING'&&!call.activeAbort)scheduleFollowup(call);
        return sendJson(res,200,{ok:true,visible,muted,followupEligible:!!presence.eligible});
      }
      if(action[2]==='stt-token'){
        const body=await readJson(req);
        const provider=String(body.provider||'scribe');
        if(provider==='assemblyai')return sendJson(res,200,{provider,token:await issueAssemblyToken()});
        if(provider==='scribe')return sendJson(res,200,{provider,token:await issueScribeToken()});
        return sendJson(res,400,{error:'unknown_stt_provider'});
      }
      if(action[2]==='nonverbal'){
        const body=await readJson(req);
        const result=noteNonverbalDetection(call,{key:String(body.key||''),score:Number(body.score)||0,continued:!!body.continued});
        if(result.error==='unknown_nonverbal')return sendJson(res,400,result);
        if(result.error==='call_not_active')return sendJson(res,409,result);
        return sendJson(res,200,{ok:true,...result});
      }
      if(action[2]==='stt'){
        const body=await readJson(req),type=String(body.type||''),text=String(body.text||'').trim(),now=Date.now();
        if(type==='provider_state'){
          const provider=String(body.provider||''),phase=String(body.phase||'');
          if(!['assemblyai','tencent','scribe'].includes(provider)||!['ready','failed','closed'].includes(phase))return sendJson(res,400,{error:'invalid_provider_state'});
          if(phase!=='ready')call.quietHangup?.activity(now);
          return sendJson(res,200,{ok:true});
        }
        if(type==='diagnostic'){
          const d=body.diagnostic&&typeof body.diagnostic==='object'?body.diagnostic:{};
          call.sttDiagnostics={provider:String(d.provider||'').slice(0,80),label:String(d.label||'').slice(0,120),settings:d.settings&&typeof d.settings==='object'?d.settings:{},bodyHearingEnabled:!!d.bodyHearingEnabled,at:String(d.at||new Date().toISOString())};
          storage.save(call);return sendJson(res,200,{ok:true});
        }
        if(type==='voice_start'){noteFollowupUserActivity(call,now);call.turnManager.onVoiceStart(now);return sendJson(res,200,{ok:true});}
        if(type==='partial'){
          if(text)noteFollowupUserActivity(call,now);
          if(['WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING'].includes(call.state) && call.turnManager.isExplicitInterrupt(text)){
            interrupt(call,'partial_explicit_interrupt');
          }
          call.turnManager.onVoice(now);call.turnManager.onPartial(text);event(call,'user_partial',{text});
          return sendJson(res,200,{ok:true});
        }
        if(type==='committed'){
          if(!text)return sendJson(res,400,{error:'empty_transcript'});
          if(call.state==='ENDED')return sendJson(res,409,{error:'call_ended'});
          const utteranceId=String(body.utteranceId||'');
          if(/^[0-9a-f-]{36}$/i.test(utteranceId)){
            call.sttUtterances??=new Set();
            if(call.sttUtterances.has(utteranceId))return sendJson(res,200,{ok:true,duplicate:true});
            call.sttUtterances.add(utteranceId);if(call.sttUtterances.size>800)call.sttUtterances.delete(call.sttUtterances.values().next().value);
            call.pendingSttUtteranceId=utteranceId;
          }else call.pendingSttUtteranceId=null;
          call.pendingSttProvider=['assemblyai','tencent','scribe'].includes(body.provider)?body.provider:null;
          const candidates=body.candidates&&typeof body.candidates==='object'?body.candidates:null;
          call.pendingSttCandidates=candidates?{assemblyai:String(candidates.assemblyai||'').slice(0,500),tencent:String(candidates.tencent||'').slice(0,500)}:null;
          noteFollowupUserActivity(call,now);
          call.pendingVoiceTone=sanitizeVoiceTone(body.prosody);
          if(['WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING'].includes(call.state)){
            const kind=call.turnManager.classifyBargeIn({text,voiceDurationMs:Number(body.voiceDurationMs||0)});
            if(kind==='backchannel'){
              call.intimacy.noteNonverbal(text);
              call.pendingVoiceTone=null;call.pendingSttProvider=null;call.pendingSttCandidates=null;call.pendingSttUtteranceId=null;call.turnManager.reset();event(call,'backchannel',{text});
              return sendJson(res,200,{ok:true,classification:kind,remembered:true});
            }
            if(kind==='ignore'){call.pendingVoiceTone=null;call.pendingSttProvider=null;call.pendingSttCandidates=null;call.pendingSttUtteranceId=null;call.turnManager.reset();return sendJson(res,200,{ok:true,classification:kind});}
            if(call.state==='WAITING_MODEL'&&call.activeInputReason==='typed'&&kind==='interrupt'){
              const explicit=call.turnManager.isExplicitInterrupt(text),duration=Number(body.voiceDurationMs||0);
              if(!explicit&&(duration<900||text.length<4)){call.pendingVoiceTone=null;call.turnManager.reset();return sendJson(res,200,{ok:true,classification:'ignore',protectedTypedTurn:true});}
            }
            interrupt(call,'barge_in');
          }
          if(body.endOfTurn===true&&(String(body.provider||'')==='assemblyai'||body.clientEndpointed===true)){
            call.turnManager.reset();
            processTurn(call,text,'provider_end_of_turn').catch(error=>failCallTurn(call,error));
            return sendJson(res,200,{ok:true,classification:'speech',provider:'assemblyai',endOfTurn:true});
          }
          call.turnManager.onVoice(now);const result=call.turnManager.onCommit(text,now);scheduleFinalize(call);
          return sendJson(res,200,{ok:true,classification:'speech',deadlineAt:result.deadlineAt});
        }
        return sendJson(res,400,{error:'unknown_stt_event'});
      }
      if(action[2]==='text'){
        const body=await readJson(req),text=String(body.text||'').trim(),now=Date.now();
        if(!text)return sendJson(res,400,{error:'empty_text'});
        if(text.length>2000)return sendJson(res,400,{error:'text_too_long'});
        if(call.state==='RINGING')return sendJson(res,409,{error:'call_not_answered'});
        if(call.state==='ENDED')return sendJson(res,409,{error:'call_ended'});
        noteFollowupUserActivity(call,now);
        const repair=shouldRepairTyped({lastVoiceInput:call.lastVoiceInput,now,state:call.state,text});
        if(repair){
          const prior={...call.lastVoiceInput};
          const entry=call.transcript.find(item=>item?.id===prior.transcriptId&&item?.speaker==='user');
          const voiceText=String(entry?.originalText||entry?.text||prior.text||'').trim();
          const mergedText=mergeRepairText(String(entry?.text||prior.text||''),text);
          if(call.activeAbort||['WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING','INTERRUPTING'].includes(call.state))interrupt(call,'typed_repair');
          discardAssistantTurn(call,prior.responseTurnId||prior.turnId);
          if(entry){
            if(!entry.originalText)entry.originalText=voiceText;
            entry.text=mergedText;
            entry.repairText=[entry.repairText,text].filter(Boolean).join('\n');
            entry.repairedAt=new Date(now).toISOString();
          }
          call.lastVoiceInput={...prior,text:mergedText,at:now,repairCount:Number(prior.repairCount||0)+1};
          call.pendingRepair={voiceText,typedText:text,mergedText,priorTurnId:prior.turnId,transcriptId:prior.transcriptId};
          call.pendingVoiceTone=null;call.turnManager.reset();storage.save(call);
          event(call,'user_repaired',{turnId:prior.turnId,text:mergedText,typedText:text});
          processTurn(call,mergedText,'typed_repair').catch(error=>failCallTurn(call,error));
          return sendJson(res,202,{ok:true,classification:'typed_repair',repairOfTurnId:prior.turnId});
        }
        if(call.activeAbort||['WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING','INTERRUPTING'].includes(call.state))interrupt(call,'typed_turn');
        call.pendingVoiceTone=null;call.pendingSttProvider=null;call.pendingSttCandidates=null;call.pendingSttUtteranceId=null;call.turnManager.reset();call.lastVoiceInput=null;
        processTurn(call,text,'typed').catch(error=>failCallTurn(call,error));
        return sendJson(res,202,{ok:true,classification:'typed'});
      }
      if(action[2]==='playback'){
        const body=await readJson(req);
        if(body.status==='start'&&call.state!=='ENDED'){clearFollowupTimer(call);state(call,'ASSISTANT_SPEAKING');}
        if(body.status==='end'&&call.state!=='ENDED'&&!call.activeAbort){
          state(call,'LISTENING');call.quietHangup?.playbackEnded(call.turnId);call.followupState?.markPlaybackEnd();scheduleFollowup(call);
        }
        return sendJson(res,200,{ok:true,state:call.state});
      }
      if(action[2]==='hangup'){
        if(call.endedAt)return sendJson(res,200,{ok:true,call:publicCall(call)});
        const body=await readJson(req);clearTimeout(call.ringTimer);call.ringTimer=null;clearTimeout(call.nonverbalFlushTimer);call.nonverbalFlushTimer=null;clearFollowupTimer(call);interrupt(call,String(body.reason||'user_hangup'));
        call.state='ENDED';call.endedAt=new Date().toISOString();
        call.transcript.push({id:randomUUID(),speaker:'system',type:'hangup',reason:String(body.reason||'user_hangup'),at:call.endedAt});
        storage.save(call);event(call,'state',{state:'ENDED'});queueCallEndNotification(call,String(body.reason||'user_hangup'));
        return sendJson(res,200,{ok:true,call:publicCall(call)});
      }
    }
    const audio=pathname.match(/^\/api\/calls\/([0-9a-f-]+)\/audio\/([0-9a-f-]+)$/i);
    if(req.method==='GET'&&audio){
      const call=calls.get(audio[1]),segment=call?.segments.get(audio[2]);
      if(!call||!segment)return sendJson(res,404,{error:'unknown_segment'});
      if(segment.generation!==call.generation)return sendJson(res,409,{error:'stale_segment'});
      if(!ELEVENLABS_API_KEY)return sendJson(res,503,{error:'elevenlabs_not_configured'});
      // TTS normally starts eagerly as soon as this stable segment is created.
      // A GET simply joins the same generation; if eager generation failed
      // transiently, this call retries it via ensureSegmentAudio().
      await ensureSegmentAudio(call,segment);
      if(call.endedAt||segment.generation!==call.generation)return sendJson(res,409,{error:'stale_segment'});
      const data=fs.readFileSync(turnAudioPath(call.id,segment.id));
      const meta=(call.audioSegments||[]).find(x=>x.segmentId===segment.id);
      if(meta&&!meta.archived){
        meta.archived=true;meta.bytes=data.length;meta.archivedAt=new Date().toISOString();meta.favorite=!!meta.favorite;
        storage.save(call);
      }
      res.writeHead(200,{'content-type':'audio/mpeg','content-length':data.length,'cache-control':'no-store'});
      res.end(data);
      return;
    }

    if(pathname==='/app.bundle.js')return staticFile(res,'app.bundle.js','text/javascript; charset=utf-8');
    if(pathname==='/scribe-client.bundle.js')return staticFile(res,'scribe-client.bundle.js','text/javascript; charset=utf-8');
    if(pathname==='/tencent-stt-client.bundle.js')return staticFile(res,'tencent-stt-client.bundle.js','text/javascript; charset=utf-8');
    if(pathname==='/body-hearing-worker.js')return staticFile(res,'body-hearing-worker.js','text/javascript; charset=utf-8','public, max-age=86400');
    if(pathname==='/voice-prosody-worker.js')return staticFile(res,'voice-prosody-worker.js','text/javascript; charset=utf-8','public, max-age=86400');
    if(pathname==='/models/yamnet.onnx')return staticFile(res,'models/yamnet.onnx','application/octet-stream','public, max-age=2592000, immutable');
    if(pathname==='/models/yamnet.data')return staticFile(res,'models/yamnet.data','application/octet-stream','public, max-age=2592000, immutable');
    const ortAsset=pathname.match(/^\/ort\/(ort-wasm-[A-Za-z0-9._-]+\.(?:wasm|mjs))$/);
    if(ortAsset)return staticFile(res,'ort/'+ortAsset[1],ortAsset[1].endsWith('.wasm')?'application/wasm':'text/javascript; charset=utf-8','public, max-age=2592000, immutable');
    if(pathname==='/pcm-worklet.js')return staticFile(res,'pcm-worklet.js','text/javascript; charset=utf-8');
    if(pathname==='/style.css')return staticFile(res,'style.css','text/css; charset=utf-8');
    if(pathname==='/manifest.webmanifest')return staticFile(res,'manifest.webmanifest','application/manifest+json');
    return staticFile(res,'index.html','text/html; charset=utf-8');
  }catch(error){
    if(!res.headersSent)return sendJson(res,500,{error:String(error?.message||error)});
    try{res.end();}catch{}
  }
});

try{const pruned=pruneExpiredTurnAudio();if(pruned.removed)console.log('call audio retention pruned '+pruned.removed+' segment(s)');}catch(error){console.warn('call audio retention startup prune failed',error?.message||error);}
const retentionTimer=setInterval(()=>{try{pruneExpiredTurnAudio();}catch(error){console.warn('call audio retention prune failed',error?.message||error);}},24*60*60*1000);retentionTimer.unref?.();
const emotionShadowTimer=setInterval(()=>{try{consumeEmotionShadowResults();}catch{}},700);emotionShadowTimer.unref?.();

async function considerQuietHangup(call){
  const guard=call.quietHangup,revision=guard.begin();if(revision===null)return;
  clearFollowupTimer(call);
  const recent=call.transcript.filter(item=>(item?.speaker==='user'||item?.speaker==='assistant')&&String(item?.text||'').trim()).slice(-12).map(item=>(item.speaker==='user'?'User':'Companion')+': '+String(item.text).replace(/\s+/g,' ').slice(0,280)).join('\n').slice(-2800);
  const abort=new AbortController();call.activeAbort=abort;call.activeInputReason='quiet_hangup_decision';state(call,'WAITING_MODEL');
  const timeout=setTimeout(()=>abort.abort(),15000);
  try{
    const control='<call_context>This is a call-control decision, not a new message from User. The browser reports that the call is visible, unmuted, and speech recognition is healthy, while User has been silent and has not typed for at least five minutes. Use the recent call context below.\n\nRecent call:\n'+(recent||'(no recent visible turns)')+'\n\nReturn JSON only. If User has asked for continued quiet presence (for example: stay with me, keep me company while I study/work/sleep, do not hang up, just stay on the line) and has not cancelled that request, return {"action":"stay_until_activity"}. If the call should continue but there is no durable presence request, return {"action":"stay","recheck_after_minutes":30}; choose 10-180 minutes when context suggests another interval. Only if the conversation clearly appears to have naturally ended should you return {"action":"end_after_silence","message":"one short natural confirmation saying you will wait one more minute and then end the call if there is still no response"}. Do not claim the user is asleep. This request cannot directly end the call; the server will enforce another grace period.</call_context>';
    const result=await streamCompanionBridgeTurn(control,{signal:abort.signal});
    const decision=parseQuietDecision(result.text);if(call.endedAt)return;
    if(decision?.action==='stay_until_activity'){if(guard.revision===revision)guard.defer({untilActivity:true});return;}
    if(decision?.action==='stay'){if(guard.revision===revision)guard.defer({minutes:decision.recheckAfterMinutes});return;}
    if(decision?.action!=='end_after_silence'||!guard.accept(revision,call.turnId+1)){if(guard.revision===revision)guard.defer({minutes:30});return;}
    const turnId=++call.turnId;
    call.transcript.push({id:randomUUID(),speaker:'system',type:'quiet_hangup_requested',turnId,at:new Date().toISOString()});
    call.transcript.push({id:randomUUID(),speaker:'assistant',turnId,text:decision.message,at:new Date().toISOString()});
    addTtsSegment(call,decision.message,turnId,call.generation);event(call,'assistant_done',{text:decision.message,ttsAvailable:!!ELEVENLABS_API_KEY});state(call,'WAITING_TTS');
  }catch{if(guard.revision===revision)guard.defer({minutes:30});}
  finally{clearTimeout(timeout);if(call.activeAbort===abort){call.activeAbort=null;call.activeInputReason=null;if(call.state==='WAITING_MODEL')state(call,'LISTENING');}}
}
function tickQuietHangups(){
  const now=Date.now();
  for(const call of calls.values()){
    const g=call.quietHangup;if(!g||call.endedAt||call.state==='RINGING')continue;
    if(!g.available(now)){g.activity(now);continue;}
    if(g.phase==='warning'&&now-g.warningAt>120000){g.activity(now);continue;}
    if(call.state!=='LISTENING'||call.activeAbort)continue;
    if(g.canAsk(now)){considerQuietHangup(call).catch(()=>g.activity());continue;}
    if(!g.canEnd(now))continue;
    clearFollowupTimer(call);interrupt(call,'companion_quiet_hangup');call.state='ENDED';call.endedAt=new Date().toISOString();
    call.transcript.push({id:randomUUID(),speaker:'system',type:'hangup',reason:'companion_quiet_hangup',at:call.endedAt});storage.save(call);event(call,'state',{state:'ENDED',reason:'companion_quiet_hangup'});queueCallEndNotification(call,'companion_quiet_hangup');
  }
}
const quietHangupTimer=setInterval(tickQuietHangups,1000);quietHangupTimer.unref?.();
server.listen(PORT,HOST,()=>console.log('companion-voice-runtime listening on '+HOST+':'+PORT));
process.on('SIGTERM',()=>{clearInterval(retentionTimer);clearInterval(emotionShadowTimer);clearInterval(quietHangupTimer);codex.stop();server.close(()=>process.exit(0));});

