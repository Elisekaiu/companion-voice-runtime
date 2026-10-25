import { createRoom } from './room.js';
import { localClock, resolveToneSelection } from './voice-schedule.js';
import { REAL_SFX_GROUPS } from './real-sfx-catalog.js';
import { baselineComparison, updateProsodyBaseline } from './voice-prosody-core.js';
import { hasCjk, chooseHybridTranscript } from './stt-arbiter.js';

const BASE='/call';
const STT_KEYTERMS=['老公','老婆','宝宝','宝贝','爸爸','亲亲','我爱你','爱你','想你','Companion','伴侣','嗯','嗯嗯','嗯哼','啊','哦','噢','好呀','不要','等等','停一下'];
const ASSEMBLY_INITIAL_CONTEXT='This is a private multilingual Chinese-and-English phone conversation between User and Companion. User may use very short affectionate Chinese utterances and fillers such as 老公、亲亲、嗯、啊、哦、我爱你. Preserve short replies as faithfully as possible and use the conversation context to disambiguate them.';
let callId=null,scribe=null,tencentStt=null,startedAt=0,timer=null,voiceStartedAt=0,muted=false,providersLoaded=false,providersLoadPromise=null,pendingTypedText='',micReconnectPromise=null,lastCallSurfaceHiddenAt=0;
let tencentSttConfigured=false,tencentSttStatusLoaded=false;
let audioGeneration=0,audioQueue=Promise.resolve(),eventStream=null;
const turnHeardCues=new Map();
let audioCtx=null,currentSource=null,audioFetches=new Set(),pendingAudioSegments=0,assistantFinished=false,seenAudioSegments=new Set(),pcmWorkletLoadPromise=null;
let bodyHearingWorker=null,bodyHearingReady=false,bodyHearingLoading=false,bodyHearingEnabled=false;
let voiceToneWorker=null,voiceToneReady=false,voiceToneLoading=false,voiceToneEnabled=true,voiceToneBaseline=null,voiceToneRequestSeq=0;
const voiceTonePending=new Map();
let sfxBus=null,activeSfxSources=new Set();
let binauralHrirBuffer=null,binauralLoadPromise=null;
let realSfxBuffer=null,realSfxLoadPromise=null,realSfxRecent=[],realSfxClipPeaks=new Map();
let historyPlayback=null,historyPlaybackToken=0,pendingIncomingId=new URLSearchParams(location.search).get('incoming')||null,incomingLoadPromise=null;
let currentCallPlaybackRate=1,v4PlaybackRates={original:1,steady:1,deep:0.96,deep_calm:0.96,deep_slow:0.96,deep_night:0.93};
const embeddedCall=new URLSearchParams(location.search).get('embedded')==='1';
let callSurfaceVisible=!embeddedCall&&!document.hidden;
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const room=createRoom({api,isActive:()=>!!callId});
let historyAll=false,historyItems=[],currentHistoryItem=null,titleEditItem=null,activeHistorySwipe=null,dialing=false,ending=false,historyReturnMode=null;

async function api(path,body,method='POST'){
  const res=await fetch(BASE+path,{method,headers:{'content-type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body||{}),credentials:'same-origin'});
  if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||('HTTP '+res.status));
  return res.headers.get('content-type')?.includes('json')?res.json():res;
}
function formatDuration(ms){
  if(!Number.isFinite(ms)||ms<0)return '—';const total=Math.round(ms/1000),m=Math.floor(total/60),s=total%60;return m+':'+String(s).padStart(2,'0');
}
function formatCallDate(value){
  try{return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return ''}
}
async function loadCallHistory(){
  try{
    let items=[],offset=0;
    if(!historyAll){
      const data=await api('/api/history?limit=3&offset=0',{},'GET');items=data.items||[];
    }else{
      do{const data=await api('/api/history?limit=100&offset='+offset,{},'GET');items.push(...(data.items||[]));if(!data.hasMore)break;offset+=100;}while(true);
    }
    historyItems=items.filter(x=>x.endedAt);
    renderHistoryRows($('history-list'),historyItems.slice(0,3));
    if(historyAll)renderHistoryRows($('history-conversation'),historyItems);
  }catch{room.toast('通话记录暂时加载失败，请稍后再试。');}
}
function closeHistorySwipe(row=activeHistorySwipe){
  if(!row)return;
  row.classList.remove('swipe-open');
  row.querySelector('.history-row-content')?.style.removeProperty('transform');
  if(activeHistorySwipe===row)activeHistorySwipe=null;
}
function openTitleEditor(item){
  closeHistorySwipe();titleEditItem=item;
  $('title-input').value=item.customTitle?String(item.title||''):'';
  $('title-sheet').showModal();setTimeout(()=>$('title-input').focus(),50);
}
function wireHistorySwipe(row,content){
  let startX=0,startY=0,base=0,dragging=false,moved=false;
  const width=112;
  row.addEventListener('touchstart',event=>{
    if(event.touches.length!==1)return;
    if(activeHistorySwipe&&activeHistorySwipe!==row)closeHistorySwipe(activeHistorySwipe);
    startX=event.touches[0].clientX;startY=event.touches[0].clientY;base=row.classList.contains('swipe-open')?-width:0;dragging=false;moved=false;
  },{passive:true});
  row.addEventListener('touchmove',event=>{
    if(event.touches.length!==1)return;
    const dx=event.touches[0].clientX-startX,dy=event.touches[0].clientY-startY;
    if(!dragging){if(Math.abs(dx)<7)return;if(Math.abs(dy)>Math.abs(dx))return;dragging=true;}
    event.preventDefault();moved=true;
    const x=Math.max(-width,Math.min(0,base+dx));content.style.transform='translate3d('+x+'px,0,0)';
  },{passive:false});
  row.addEventListener('touchend',event=>{
    if(!dragging)return;
    const dx=(event.changedTouches[0]?.clientX||startX)-startX,target=base+dx;
    const open=target<-width*.36;
    content.style.removeProperty('transform');row.classList.toggle('swipe-open',open);activeHistorySwipe=open?row:null;
    if(moved){row.dataset.justSwiped='1';setTimeout(()=>delete row.dataset.justSwiped,80);}
  },{passive:true});
}
function renderHistoryRows(list,items){
  if(activeHistorySwipe)closeHistorySwipe();
  list.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='history-empty';p.textContent='还没有通话记录。';list.append(p);return;}
  for(const item of items){
    const row=document.createElement('div');row.className='history-row';row.dataset.callId=item.id;
    const actions=document.createElement('div');actions.className='history-actions';
    const rename=document.createElement('button');rename.type='button';rename.className='history-action rename';rename.textContent='改名';
    rename.addEventListener('click',()=>openTitleEditor(item));
    const del=document.createElement('button');del.type='button';del.className='history-action delete';del.textContent='删除';
    del.addEventListener('click',async()=>{
      if(await room.ask('delete-sheet')!=='delete')return;room.haptic();del.disabled=true;
      try{await api('/api/history/'+item.id,{},'DELETE');row.classList.add('removing');await sleep(360);await loadCallHistory();}
      catch{del.disabled=false;room.toast('这通电话暂时没能删除，请再试一次。');}
    });
    actions.append(rename,del);

    const content=document.createElement('div');content.className='history-row-content';
    const open=document.createElement('button');open.type='button';open.className='history-entry';
    const main=document.createElement('div');main.className='history-mainline';
    const title=document.createElement('strong');title.className='history-call-title';title.textContent=item.title||'和老公的电话';
    const duration=document.createElement('span');duration.className='history-duration';duration.textContent=formatDuration(item.durationMs);
    main.append(title,duration);
    const meta=document.createElement('div');meta.className='history-call-meta';const badge=item.direction==='incoming'?(item.outcome==='missed_call'?'未接':item.outcome==='declined_call'?'已拒绝':'来电'):'';meta.textContent=[badge,formatCallDate(item.startedAt||item.createdAt)].filter(Boolean).join(' · ');
    const preview=document.createElement('div');preview.className='history-preview';preview.textContent=item.customTitle&&item.preview?item.preview:'';
    open.append(main,meta);if(preview.textContent)open.append(preview);
    open.addEventListener('click',event=>{
      if(row.dataset.justSwiped){event.preventDefault();return;}
      if(row.classList.contains('swipe-open')){closeHistorySwipe(row);return;}
      openHistoryDetail(item);
    });
    content.append(open);row.append(actions,content);wireHistorySwipe(row,content);list.append(row);
  }
}
function stopHistoryVoice(){
  historyPlaybackToken++;
  historyPlayback?.cancel?.();
  if(historyPlayback?.audio){try{historyPlayback.audio.pause();historyPlayback.audio.src='';}catch{}}
  if(historyPlayback?.button){historyPlayback.button.classList.remove('playing');historyPlayback.button.setAttribute('aria-pressed','false');historyPlayback.button.querySelector('.voice-label').textContent='听这句';}
  historyPlayback=null;
}
async function playHistoryVoice(button,callId,segments){
  if(historyPlayback?.button===button){stopHistoryVoice();return;}
  stopHistoryVoice();
  const token=historyPlaybackToken,ordered=[...segments].sort((a,b)=>(a.order??0)-(b.order??0));
  historyPlayback={button,audio:null};button.classList.add('playing');button.setAttribute('aria-pressed','true');button.querySelector('.voice-label').textContent='正在听 · 停止';
  try{
    for(const segment of ordered){
      if(token!==historyPlaybackToken)break;
      const audio=new Audio(BASE+'/api/history/'+callId+'/audio/'+segment.segmentId);historyPlayback.audio=audio;
      audio.preload='auto';audio.playbackRate=Number(segment.playbackRate)||1;
      await new Promise((resolve,reject)=>{historyPlayback.cancel=resolve;audio.addEventListener('ended',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error('audio_unavailable')),{once:true});audio.play().catch(reject);});
    }
  }catch{if(token===historyPlaybackToken)room.toast('这句声音暂时无法播放');}
  if(token===historyPlaybackToken)stopHistoryVoice();
}
function formatFavoriteDate(value){
  try{return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Hong_Kong',month:'numeric',day:'numeric'}).format(new Date(value));}catch{return ''}
}
function favoriteVoiceButton(){
  const voice=document.createElement('button');voice.type='button';voice.className='turn-voice favorite-play';voice.setAttribute('aria-pressed','false');
  voice.innerHTML='<span class="voice-play">▶</span><span class="voice-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="voice-label">听这句</span>';
  return voice;
}
async function loadVoiceFavorites(){
  const conversation=$('history-conversation');
  conversation.innerHTML='<p class="history-empty">正在把收藏的声音拿出来…</p>';
  try{
    const data=await api('/api/favorites?limit=200&offset=0',{},'GET');
    renderVoiceFavorites(conversation,data.items||[]);
    $('history-detail-meta').textContent=data.total?('˚.✦ ݁ '+data.total+' 句收在这里'):'˚.✦ ݁ 还没有收藏';
  }catch{
    conversation.innerHTML='<p class="history-empty">收藏的声音暂时打不开。</p>';
  }
}
function renderVoiceFavorites(list,items){
  stopHistoryVoice();list.replaceChildren();
  if(!items.length){
    const empty=document.createElement('div');empty.className='favorites-empty';
    empty.innerHTML='<span class="favorites-empty-mark">˚.✦ ݁</span><p>还没有收起来的声音。</p><small>哪一句想反复听，就在通话记录里点一下收藏。</small>';
    list.append(empty);return;
  }
  for(const item of items){
    const card=document.createElement('article');card.className='favorite-voice-card';card.dataset.callId=item.callId;card.dataset.turnId=String(item.turnId);
    const origin=document.createElement('button');origin.type='button';origin.className='favorite-voice-origin';
    const date=document.createElement('span');date.className='favorite-origin-date';date.textContent=formatFavoriteDate(item.callStartedAt);
    const title=document.createElement('span');title.className='favorite-origin-title';title.textContent=item.callTitle||'和老公的电话';
    const arrow=document.createElement('span');arrow.className='favorite-origin-arrow';arrow.textContent='›';
    origin.append(date,document.createTextNode(' · '),title,arrow);
    origin.addEventListener('click',()=>openHistoryDetail({id:item.callId,title:item.callTitle||'和老公的电话',startedAt:item.callStartedAt,createdAt:item.callStartedAt,endedAt:item.callEndedAt,durationMs:item.durationMs},{returnTo:'favorites'}));
    const text=document.createElement('div');text.className='favorite-voice-text';text.textContent=String(item.text||'');
    const controls=document.createElement('div');controls.className='favorite-voice-controls';
    const voice=favoriteVoiceButton();voice.addEventListener('click',()=>playHistoryVoice(voice,item.callId,item.segments||[]));
    const favorite=document.createElement('button');favorite.type='button';favorite.className='voice-favorite favorite-layer-star';favorite.setAttribute('aria-pressed','true');favorite.setAttribute('aria-label','取消收藏这句声音');favorite.textContent='˚.✦ ݁';
    favorite.addEventListener('click',async()=>{
      favorite.disabled=true;
      try{
        await api('/api/history/'+item.callId+'/voice/'+item.turnId+'/favorite',{favorite:false});
        room.haptic();stopHistoryVoice();
        card.classList.add('removing');await sleep(280);card.remove();
        const remaining=list.querySelectorAll('.favorite-voice-card').length;
        $('history-detail-meta').textContent=remaining?('˚.✦ ݁ '+remaining+' 句收在这里'):'˚.✦ ݁ 还没有收藏';
        if(!remaining)renderVoiceFavorites(list,[]);
        loadCallHistory().catch(()=>{});
      }catch{favorite.disabled=false;room.toast('刚才没能取消这个收藏。');}
    });
    controls.append(voice,favorite);card.append(origin,text,controls);list.append(card);
  }
}
function openVoiceFavorites(){
  historyAll=false;currentHistoryItem=null;historyReturnMode=null;stopHistoryVoice();
  $('phone').classList.add('history-open','favorites-open');$('history-detail').classList.remove('hidden');
  $('history-detail-title').textContent='收藏语音';
  $('history-detail-meta').textContent='˚.✦ ݁ 收起来的声音';
  loadVoiceFavorites();
}

async function openHistoryDetail(item,{returnTo=null}={}){
  historyAll=false;stopHistoryVoice();currentHistoryItem=item;historyReturnMode=returnTo;$('phone').classList.remove('favorites-open');
  const detail=$('history-detail'),conversation=$('history-conversation');
  $('history-detail-title').textContent=formatCallDate(item.startedAt||item.createdAt);
  $('history-detail-meta').textContent=formatDuration(item.durationMs)+' · 和 Companion';
  conversation.innerHTML='<p class="history-empty">正在打开这通电话…</p>';
  $('phone').classList.add('history-open');detail.classList.remove('hidden');
  try{
    const data=await api('/api/history/'+item.id,{},'GET'),call=data.call||{},byTurn=new Map();
    currentHistoryItem={...item,...call};
    for(const seg of call.audioSegments||[]){if(!byTurn.has(seg.turnId))byTurn.set(seg.turnId,[]);byTurn.get(seg.turnId).push(seg);}
    conversation.innerHTML='';
    let previousSpeaker='';
    for(const turn of call.transcript||[]){
      if(turn.speaker!=='user'&&turn.speaker!=='assistant')continue;
      const row=document.createElement('article');row.className='memory-msg '+turn.speaker;
      if(previousSpeaker===turn.speaker)row.classList.add('continuation');
      previousSpeaker=turn.speaker;
      const who=document.createElement('div');who.className='memory-who';who.textContent=turn.speaker==='user'?'User':'Companion';
      const stack=document.createElement('div');stack.className='memory-bubble-stack';
      const bubbles=splitCallBubbles(String(turn.text||''),turn.speaker==='assistant'?'Companion':'User');
      for(const part of bubbles){
        const words=document.createElement('div');words.className='memory-words';renderNaturalBubbleText(words,part);stack.append(words);
      }
      row.append(who,stack);
      if(turn.speaker==='assistant'&&turn.heardCues)renderHeardCues(row,turn.heardCues,{history:true});
      const segments=turn.speaker==='assistant'?(byTurn.get(turn.turnId)||[]):[];
      if(segments.length){
        const voiceRow=document.createElement('div');voiceRow.className='turn-voice-row';
        const voice=document.createElement('button');voice.type='button';voice.className='turn-voice';voice.setAttribute('aria-pressed','false');voice.innerHTML='<span class="voice-play">▶</span><span class="voice-wave"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="voice-label">听这句</span>';
        voice.addEventListener('click',()=>playHistoryVoice(voice,item.id,segments));
        const favorite=document.createElement('button');favorite.type='button';favorite.className='voice-favorite';
        const isFavorite=segments.some(x=>x.favorite);favorite.setAttribute('aria-pressed',String(isFavorite));favorite.setAttribute('aria-label',isFavorite?'取消收藏这句声音':'收藏这句声音');favorite.textContent='˚.✦ ݁';
        favorite.addEventListener('click',async()=>{
          const next=favorite.getAttribute('aria-pressed')!=='true';favorite.disabled=true;
          try{
            await api('/api/history/'+item.id+'/voice/'+turn.turnId+'/favorite',{favorite:next});
            for(const segment of segments)segment.favorite=next;
            favorite.setAttribute('aria-pressed',String(next));favorite.setAttribute('aria-label',next?'取消收藏这句声音':'收藏这句声音');favorite.textContent='˚.✦ ݁';
            room.haptic();room.toast(next?'这句声音收藏好了。':'已取消收藏；超过 90 天后会自动清理。');
          }catch{room.toast('刚才没能保存这个收藏。');}
          finally{favorite.disabled=false;}
        });
        voiceRow.append(voice,favorite);row.append(voiceRow);
      }
      conversation.append(row);
    }
    if(!conversation.children.length)conversation.innerHTML='<p class="history-empty">这一通没有留下文字。</p>';
    conversation.scrollTop=0;
  }catch{conversation.innerHTML='<p class="history-empty">这一通暂时打不开。</p>';}
}
function closeHistoryDetail(){
  const returnTo=historyReturnMode;historyReturnMode=null;historyAll=false;currentHistoryItem=null;stopHistoryVoice();
  if(returnTo==='favorites'){openVoiceFavorites();return;}
  $('phone').classList.remove('history-open','favorites-open');$('history-detail').classList.add('hidden');$('history-conversation').innerHTML='';
}
$('history-back')?.addEventListener('click',closeHistoryDetail);
$('title-cancel')?.addEventListener('click',()=>{titleEditItem=null;$('title-sheet').close('cancel');});
$('title-form')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!titleEditItem)return;
  const item=titleEditItem,title=String($('title-input').value||'').trim(),button=event.submitter;button.disabled=true;
  try{
    const result=await api('/api/history/'+item.id+'/title',{title});
    item.title=result.title;item.customTitle=result.customTitle;titleEditItem=null;
    $('title-sheet').close('saved');await loadCallHistory();room.toast(title?'标题已经改好了。':'已经恢复自动标题。');
  }catch{room.toast('标题刚才没能保存。');}
  finally{button.disabled=false;}
});
$('voice-favorites-open')?.addEventListener('click',openVoiceFavorites);
$('history-all').addEventListener('click',()=>{historyReturnMode=null;historyAll=true;currentHistoryItem=null;stopHistoryVoice();$('phone').classList.remove('favorites-open');$('phone').classList.add('history-open');$('history-detail').classList.remove('hidden');$('history-detail-title').textContent='和老公';$('history-detail-meta').textContent='留在这里的声音';renderHistoryRows($('history-conversation'),historyItems);loadCallHistory();});
function showLogin(){
  $('phone').classList.add('hidden');$('login').classList.remove('hidden');
}
let lightBootStarted=false;
function runWhenIdle(fn,timeout=900){
  if('requestIdleCallback' in window)return requestIdleCallback(()=>fn(),{timeout});
  return setTimeout(fn,120);
}
function showPhone(){
  $('login').classList.add('hidden');$('phone').classList.remove('hidden');
  initBinauralPicker();setMutedState(false);syncBodyHearingUi();syncVoiceToneUi();
  if(pendingIncomingId)queueMicrotask(()=>prepareIncomingCall(pendingIncomingId).catch(()=>{}));
  if(lightBootStarted)return;lightBootStarted=true;
  requestAnimationFrame(()=>{runWhenIdle(()=>loadCallHistory().catch(()=>{}),420);runWhenIdle(()=>{if(voiceToneEnabled)ensureVoiceToneWorker().catch(()=>{});},520);runWhenIdle(()=>{if(bodyHearingEnabled)ensureBodyHearingWorker().catch(()=>{});},640);runWhenIdle(()=>loadTencentSttStatus().catch(()=>{}),760);runWhenIdle(()=>loadSttProviders().catch(()=>{}),1100);});
}
$('room-more')?.addEventListener('click',()=>{
  if(voiceToneEnabled)ensureVoiceToneWorker().catch(()=>{});
  if(bodyHearingEnabled)ensureBodyHearingWorker().catch(()=>{});
  loadSttProviders().catch(()=>{});loadTencentSttStatus().catch(()=>{});loadTtsModels().catch(()=>{});checkRealSfxCache().catch(()=>{});
});
async function loadTencentSttStatus(){
  try{
    const data=await api('/api/trtc/status',{},'GET');
    tencentSttStatusLoaded=true;tencentSttConfigured=!!data.configured;
    const status=$('tencent-stt-status'),setup=$('tencent-stt-setup');
    if(status)status.textContent=tencentSttConfigured?'已就绪 · 中文 + 混合语音':'需要 SDKSecretKey · 仅需设置一次';
    setup?.classList.toggle('hidden',tencentSttConfigured);
    return data;
  }catch{
    const status=$('tencent-stt-status');if(status)status.textContent='Unavailable';
    return null;
  }
}
$('tencent-stt-save')?.addEventListener('click',async()=>{
  const input=$('tencent-stt-secret'),button=$('tencent-stt-save');
  const sdkSecretKey=String(input?.value||'').trim();
  if(!sdkSecretKey){room.toast('先粘贴 SDKSecretKey');return;}
  button.disabled=true;
  try{
    const data=await api('/api/trtc/configure',{sdkSecretKey});
    if(input)input.value='';
    tencentSttConfigured=!!data.configured;tencentSttStatusLoaded=true;
    await loadTencentSttStatus();
    room.toast('腾讯中文 STT 已连接');
  }catch(error){
    room.toast('连接失败：'+String(error?.message||error));
  }finally{button.disabled=false;}
});

async function loadSttProviders(){
  if(providersLoaded)return;
  if(providersLoadPromise)return providersLoadPromise;
  providersLoadPromise=(async()=>{
    const select=$('stt-provider');if(!select)return;
    const data=await api('/api/stt/providers',{},'GET');
    const available=data.providers||{};
    for(const option of select.options)option.disabled=!available[option.value];
    let desired=available.assemblyai?'assemblyai':(available.scribe?'scribe':(data.default||'scribe'));
    if(available[desired])select.value=desired;
    providersLoaded=true;
  })().finally(()=>{providersLoadPromise=null;});
  return providersLoadPromise;
}
async function loadTtsModels(){
  const select=$('tts-model');if(!select)return;
  const data=await api('/api/tts/models',{},'GET');
  const available=new Set((data.models||[]).map(x=>x.id));
  for(const option of select.options)option.disabled=!available.has(option.value);
  let selected=available.has('eleven_v4_turbo')?'eleven_v4_turbo':(data.default||'eleven_multilingual_v2');
  if(available.has(selected))select.value=selected;
  const tones=Array.isArray(data.v4Tones)?data.v4Tones:[];
  for(const tone of tones){
    if(Number.isFinite(tone.playbackRate))v4PlaybackRates[tone.id]=tone.playbackRate;
  }
  // New users and previous test users start in auto. A deliberate selection
  // made in THIS version is persisted as a manual override.
  $('tts-tone').value='auto';
  updateToneVisibility();
}
function updateToneVisibility(){
  const isV4=$('tts-model').value==='eleven_v4_turbo';
  $('tts-tone-picker').style.display=isV4?'flex':'none';
  updateVoiceScheduleNote();
}
function selectedTone(at=new Date()){
  return resolveToneSelection($('tts-model').value,$('tts-tone').value,at);
}
function updateVoiceScheduleNote(){
  const note=$('tts-auto-note');if(!note)return;
  if($('tts-model').value!=='eleven_v4_turbo'){note.textContent='';return;}
  const mode=$('tts-tone').value;
  if(mode!=='auto'){
    note.textContent='已手动选择音色；通话中不会自动切换。';
    return;
  }
  const clock=localClock();
  const selected=selectedTone();
  const zone=clock.timeZone?' · '+clock.timeZone:' · local time';
  note.textContent=clock.display+zone+' · '+(selected==='deep_night'?'Night voice':'Day voice')+' (22:00–07:59 night, 08:00–21:59 day)';
}
$('tts-model').addEventListener('change',updateToneVisibility);
$('tts-tone').addEventListener('change',()=>{
  try{localStorage.setItem('companion-voice-runtime.tts-tone-mode',$('tts-tone').value);}catch{}
  updateVoiceScheduleNote();
});
function syncCallPresence(){
  if(!callId)return Promise.resolve();
  return api('/api/calls/'+callId+'/presence',{visible:callSurfaceVisible&&!document.hidden,muted}).catch(()=>{});
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(callId)lastCallSurfaceHiddenAt=Date.now();syncCallPresence();return;}
  if(!callId){updateVoiceScheduleNote();return;}
  audioCtx?.resume().catch(()=>{});syncCallPresence();
  const awayFor=Date.now()-lastCallSurfaceHiddenAt;
  if(callSurfaceVisible&&!muted&&(scribe?.needsReconnect?.()||(awayFor>1400&&!scribe?.isSleeping?.())))setTimeout(()=>reconnectMicrophone({force:true,quiet:true}),160);
});
window.addEventListener('focus',()=>{if(!callId)updateVoiceScheduleNote();});
function splitLongCallBubble(text,max=76){
  const source=String(text||'').trim();if(!source)return[];
  if(Array.from(source).length<=max)return[source];
  const out=[];let rest=source;
  while(Array.from(rest).length>max){
    const chars=Array.from(rest),windowText=chars.slice(0,max+1).join('');
    let cut=Math.max(windowText.lastIndexOf('，'),windowText.lastIndexOf(','),windowText.lastIndexOf('；'),windowText.lastIndexOf(';'),windowText.lastIndexOf('、'));
    if(cut<Math.floor(max*.45))cut=chars.slice(0,max).join('').lastIndexOf(' ');
    if(cut<Math.floor(max*.4))cut=max-1;
    const part=chars.slice(0,cut+1).join('').trim();if(part)out.push(part);
    rest=chars.slice(cut+1).join('').trim();
  }
  if(rest)out.push(rest);return out;
}
function splitCallBubbles(text,who='Companion'){
  const source=String(text||'').replace(/\r/g,'').trim();if(!source)return[];
  const out=[];
  for(const paragraph of source.split(/\n+/).map(x=>x.trim()).filter(Boolean)){
    const sentences=paragraph.match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g)||[paragraph];
    for(const sentence of sentences){
      const clean=sentence.trim();if(!clean)continue;
      const isCjk=/[㐀-鿿]/.test(clean);
      const max=who==='User'?(isCjk?76:130):(isCjk?70:120);
      out.push(...splitLongCallBubble(clean,max));
    }
  }
  return out.length?out:[source];
}
function renderCallBubbles(row,who,text){
  const words=row.querySelector('.words');if(!words)return;
  const pieces=splitCallBubbles(text,who);words.replaceChildren();
  for(const piece of pieces){
    const bubble=document.createElement('div');bubble.className='call-bubble';renderNaturalBubbleText(bubble,piece);words.append(bubble);
  }
}
const zhWordSegmenter=typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'
  ?new Intl.Segmenter('zh',{granularity:'word'}):null;
const CJK_CLOSE_PUNCT=/^[，。！？、；：）》」』】〕…~～,.!?;:]+$/;
const CJK_OPEN_PUNCT=/^[“‘（《「『【〔]+$/;
const CJK_ORDINAL=/^第[一二三四五六七八九十百千万两〇零0-9]+$/;
const CJK_ORDINAL_UNIT=/^(?:题|章|节|页|步|条|句|段|轮|次|回|个)$/;
function naturalCjkTokens(text){
  const source=String(text||'');if(!zhWordSegmenter||!/[㐀-鿿]/.test(source))return null;
  const raw=Array.from(zhWordSegmenter.segment(source),part=>String(part.segment||'')).filter(Boolean);
  const out=[];let opener='';
  for(const piece of raw){
    if(CJK_OPEN_PUNCT.test(piece)){opener+=piece;continue;}
    if(CJK_CLOSE_PUNCT.test(piece)){
      if(out.length)out[out.length-1]+=piece;else opener+=piece;
      continue;
    }
    const token=opener+piece;opener='';
    if(out.length&&CJK_ORDINAL.test(out[out.length-1])&&CJK_ORDINAL_UNIT.test(piece)){out[out.length-1]+=piece;continue;}
    if(out.length&&/^(?:着|了|过)$/.test(piece)&&/[㐀-鿿]$/.test(out[out.length-1])){out[out.length-1]+=piece;continue;}
    out.push(token);
  }
  if(opener){if(out.length)out[out.length-1]+=opener;else out.push(opener);}
  return out;
}
function renderNaturalBubbleText(el,text){
  const source=String(text||'');const tokens=naturalCjkTokens(source);
  if(!tokens){el.textContent=source;return;}
  el.replaceChildren();
  for(const token of tokens){
    const span=document.createElement('span');span.className='cjk-word';span.textContent=token;el.append(span);
  }
}
function heardConfidence(score){
  const value=Math.max(0,Math.min(1,Number(score)||0));
  const pct=Math.round(value*100);
  const word=value>=.78?'很清楚':value>=.60?'有听见':'很轻';
  return pct+'% · '+word;
}
function renderHeardCues(row,cues,{history=false}={}){
  if(!row)return;
  const nonverbals=Array.isArray(cues?.nonverbals)?cues.nonverbals.filter(x=>x?.label):[];
  const toneFacts=Array.isArray(cues?.tone?.facts)?cues.tone.facts.filter(Boolean):[];
  const existing=Array.from(row.children||[]).find(el=>el.classList?.contains('heard-cues'));
  if(!nonverbals.length&&!toneFacts.length){existing?.remove();return;}
  const signature=JSON.stringify({nonverbals,toneFacts});
  if(existing?.dataset.signature===signature)return;
  const wasOpen=!!existing?.open;existing?.remove();
  const details=document.createElement('details');details.className='heard-cues';details.dataset.signature=signature;
  if(wasOpen)details.open=true;
  const summary=document.createElement('summary');summary.innerHTML='<span class="heard-cues-arrow" aria-hidden="true">▸</span><span>Heard cues</span>';
  const panel=document.createElement('div');panel.className='heard-cues-panel';
  if(nonverbals.length){
    const section=document.createElement('section');section.className='heard-cues-section';
    const title=document.createElement('div');title.className='heard-cues-kicker';title.textContent='声音线索';section.append(title);
    for(const cue of nonverbals){
      const item=document.createElement('div');item.className='heard-cue-item';
      const name=document.createElement('span');name.className='heard-cue-name';name.textContent=String(cue.label)+(cue.continued?' · 还在继续':'');
      const confidence=document.createElement('span');confidence.className='heard-cue-confidence';confidence.textContent=heardConfidence(cue.score);
      item.append(name,confidence);section.append(item);
    }
    panel.append(section);
  }
  if(toneFacts.length){
    const section=document.createElement('section');section.className='heard-cues-section';
    const title=document.createElement('div');title.className='heard-cues-kicker';title.textContent='语气线索';section.append(title);
    for(const fact of toneFacts){
      const item=document.createElement('div');item.className='heard-cue-fact';item.textContent=String(fact);section.append(item);
    }
    panel.append(section);
  }
  const foot=document.createElement('div');foot.className='heard-cues-foot';foot.textContent='这些线索参与了这一句的理解。';panel.append(foot);
  details.append(summary,panel);
  const anchor=history?row.querySelector('.memory-bubble-stack'):row.querySelector('.words');
  if(anchor)row.insertBefore(details,anchor);else row.append(details);
}
function addHeardLine(text){
  const row=document.createElement('div');row.className='line heard';
  const words=document.createElement('div');words.className='words';words.textContent='〔'+text+'〕';
  row.append(words);$('transcript').append(row);
  if(!$('transcript').dataset.reading)$('transcript').scrollTop=$('transcript').scrollHeight;
}
function addLine(who,text,id){
  let row=id?document.getElementById(id):null;
  if(!row){
    row=document.createElement('div');row.className='line';row.dataset.speaker=who.toLowerCase();
    if(id)row.id=id;
    const previous=$('transcript').lastElementChild;
    if(previous?.classList.contains('line')&&!previous.classList.contains('heard')&&previous.dataset.speaker===row.dataset.speaker)row.classList.add('continuation');
    row.innerHTML='<div class="who"></div><div class="words"></div>';$('transcript').append(row);
  }
  row.dataset.speaker=who.toLowerCase();row.classList.toggle('user',who==='User');row.classList.toggle('assistant',who==='Companion');row.querySelector('.who').textContent=who;
  renderCallBubbles(row,who,text);
  if(!$('transcript').dataset.reading)$('transcript').scrollTop=$('transcript').scrollHeight;return row;
}
function setStatus(text){if(/HTTP|assemblyai|elevenlabs|codex_|tts_|stt_|AssemblyAI|Scribe|密钥|接口/.test(text)){audioNote(text);text='声音连接暂时遇到问题，可以稍后再试。';}$('status').textContent=text;}
$('transcript').addEventListener('scroll',()=>{const el=$('transcript');if(el.scrollHeight-el.scrollTop-el.clientHeight>70)el.dataset.reading='true';else delete el.dataset.reading;});
function audioNote(text){const el=$('audio-diagnostic');if(el)el.textContent=text;}
function binauralNote(text){const el=$('binaural-diagnostic');if(el)el.textContent=text;}
function bodyHearingNote(text){const el=$('body-hearing-status');if(el)el.textContent=text;}
function syncBodyHearingUi(){
  const toggle=$('body-hearing-toggle');if(toggle)toggle.checked=bodyHearingEnabled;
  bodyHearingNote(bodyHearingEnabled?(bodyHearingReady?'本机处理 · 已就绪':'本机处理 · 加载中…'):'本机处理 · 已关闭');
}
function ensureBodyHearingWorker(){
  if(bodyHearingWorker&&bodyHearingReady){
    if(bodyHearingEnabled)bodyHearingWorker.postMessage({type:'enable'});
    return Promise.resolve(bodyHearingWorker);
  }
  if(bodyHearingWorker&&!bodyHearingReady&&!bodyHearingLoading){try{bodyHearingWorker.terminate();}catch{}bodyHearingWorker=null;}
  if(bodyHearingLoading)return bodyHearingLoading;
  bodyHearingLoading=new Promise((resolve,reject)=>{
    const worker=new Worker(BASE+'/body-hearing-worker.js?v=body-hearing-5',{type:'module'});
    let settled=false;
    const timeout=setTimeout(()=>{if(!settled){settled=true;bodyHearingReady=false;bodyHearingNote('本机处理 · 不可用 · 超时');try{worker.terminate();}catch{}if(bodyHearingWorker===worker)bodyHearingWorker=null;reject(new Error('body_hearing_load_timeout'));}},30000);
    worker.onmessage=event=>{
      const data=event.data||{};
      if(data.type==='ready'){
        bodyHearingReady=true;bodyHearingNote('本机处理 · 已就绪');
        if(!settled){settled=true;clearTimeout(timeout);resolve(worker);}
        return;
      }
      if(data.type==='heard'){
        const id=callId;
        if(!id||muted||!bodyHearingEnabled)return;
        api('/api/calls/'+id+'/nonverbal',{key:data.key,score:Number(data.score)||0,continued:!!data.continued}).catch(()=>{});
        return;
      }
      if(data.type==='error'){
        bodyHearingReady=false;bodyHearingNote('本机处理 · 不可用 · '+String(data.message||'model error').slice(0,42));
        if(!settled){settled=true;clearTimeout(timeout);try{worker.terminate();}catch{}if(bodyHearingWorker===worker)bodyHearingWorker=null;reject(new Error(String(data.message||'body_hearing_error')));}
      }
    };
    worker.onerror=event=>{
      bodyHearingReady=false;bodyHearingNote('本机处理 · 不可用 · '+String(event?.message||'worker error').slice(0,42));
      if(!settled){settled=true;clearTimeout(timeout);try{worker.terminate();}catch{}if(bodyHearingWorker===worker)bodyHearingWorker=null;reject(new Error('body_hearing_worker_error'));}
    };
    bodyHearingWorker=worker;
    worker.postMessage({type:bodyHearingEnabled?'enable':'disable'});
  }).finally(()=>{bodyHearingLoading=false;});
  return bodyHearingLoading;
}
function setBodyHearingEnabled(value,{persist=true}={}){
  bodyHearingEnabled=!!value;
  if(persist)try{localStorage.setItem('companion-voice-runtime.body-hearing',bodyHearingEnabled?'1':'0');}catch{}
  syncBodyHearingUi();
  if(bodyHearingEnabled)ensureBodyHearingWorker().catch(()=>{});
  else bodyHearingWorker?.postMessage({type:'disable'});
}
function resetBodyHearing(){bodyHearingWorker?.postMessage({type:'reset'});}
function feedBodyHearing(buffer){
  if(!bodyHearingEnabled||muted||!buffer?.byteLength)return;
  if(!bodyHearingWorker){ensureBodyHearingWorker().catch(()=>{});return;}
  if(!bodyHearingReady)return;
  const copy=buffer.slice(0);
  bodyHearingWorker.postMessage({type:'pcm',buffer:copy},[copy]);
}
try{bodyHearingEnabled=localStorage.getItem('companion-voice-runtime.body-hearing')==='1';}catch{}
function loadVoiceToneBaseline(){
  try{
    const raw=localStorage.getItem('companion-voice-runtime.voice-tone-baseline');
    voiceToneBaseline=raw?JSON.parse(raw):null;
  }catch{voiceToneBaseline=null;}
}
function saveVoiceToneBaseline(){
  try{
    if(voiceToneBaseline)localStorage.setItem('companion-voice-runtime.voice-tone-baseline',JSON.stringify(voiceToneBaseline));
    else localStorage.removeItem('companion-voice-runtime.voice-tone-baseline');
  }catch{}
}
function voiceToneNote(text){const el=$('voice-tone-status');if(el)el.textContent=text;}
function syncVoiceToneUi(){
  const toggle=$('voice-tone-toggle');if(toggle)toggle.checked=voiceToneEnabled;
  const count=Number(voiceToneBaseline?.count||0);
  if(!voiceToneEnabled)return voiceToneNote('本机处理 · 已关闭');
  if(!voiceToneReady)return voiceToneNote('本机处理 · 启动中…');
  voiceToneNote(count>=5?'本机处理 · 个人基线已就绪':'本机处理 · 学习中 '+count+'/5');
}
function ensureVoiceToneWorker(){
  if(voiceToneWorker&&voiceToneReady){
    voiceToneWorker.postMessage({type:voiceToneEnabled?'enable':'disable'});
    return Promise.resolve(voiceToneWorker);
  }
  if(voiceToneWorker&&!voiceToneReady&&!voiceToneLoading){try{voiceToneWorker.terminate();}catch{}voiceToneWorker=null;}
  if(voiceToneLoading)return voiceToneLoading;
  voiceToneLoading=new Promise((resolve,reject)=>{
    const worker=new Worker(BASE+'/voice-prosody-worker.js?v=voice-tone-3',{type:'module'});
    let settled=false;
    const timeout=setTimeout(()=>{if(!settled){settled=true;voiceToneReady=false;voiceToneNote('本机处理 · 不可用 · 超时');try{worker.terminate();}catch{}if(voiceToneWorker===worker)voiceToneWorker=null;reject(new Error('voice_tone_load_timeout'));}},5000);
    worker.onmessage=event=>{
      const data=event.data||{};
      if(data.type==='ready'){
        voiceToneReady=true;syncVoiceToneUi();
        if(!settled){settled=true;clearTimeout(timeout);resolve(worker);}
        return;
      }
      if(data.type==='summary'){
        const pending=voiceTonePending.get(data.requestId);
        if(pending){voiceTonePending.delete(data.requestId);pending.resolve(data.summary||null);}
        return;
      }
      if(data.type==='error'){
        voiceToneReady=false;voiceToneNote('本机处理 · 不可用 · '+String(data.message||'worker error').slice(0,42));
        const pending=[...voiceTonePending.values()];voiceTonePending.clear();
        for(const item of pending)item.resolve(null);
        if(!settled){settled=true;clearTimeout(timeout);try{worker.terminate();}catch{}if(voiceToneWorker===worker)voiceToneWorker=null;reject(new Error(String(data.message||'voice_tone_error')));}
      }
    };
    worker.onerror=event=>{
      voiceToneReady=false;voiceToneNote('本机处理 · 不可用 · '+String(event?.message||'worker error').slice(0,42));
      if(!settled){settled=true;clearTimeout(timeout);try{worker.terminate();}catch{}if(voiceToneWorker===worker)voiceToneWorker=null;reject(new Error('voice_tone_worker_error'));}
      const pending=[...voiceTonePending.values()];voiceTonePending.clear();
      for(const item of pending)item.resolve(null);
    };
    voiceToneWorker=worker;
    worker.postMessage({type:voiceToneEnabled?'enable':'disable'});
  }).finally(()=>{voiceToneLoading=false;});
  return voiceToneLoading;
}
function setVoiceToneEnabled(value,{persist=true}={}){
  voiceToneEnabled=!!value;
  if(persist)try{localStorage.setItem('companion-voice-runtime.voice-tone',voiceToneEnabled?'1':'0');}catch{}
  syncVoiceToneUi();
  if(voiceToneEnabled)ensureVoiceToneWorker().catch(()=>{});
  else voiceToneWorker?.postMessage({type:'disable'});
}
function feedVoiceTone(buffer){
  if(!voiceToneEnabled||muted||!buffer?.byteLength)return;
  if(!voiceToneWorker){ensureVoiceToneWorker().catch(()=>{});return;}
  if(!voiceToneReady)return;
  const copy=buffer.slice(0);
  voiceToneWorker.postMessage({type:'pcm',buffer:copy},[copy]);
}
function startVoiceToneTurn(){
  if(!voiceToneEnabled||muted)return;
  ensureVoiceToneWorker().then(worker=>worker.postMessage({type:'start'})).catch(()=>{});
}
function resetVoiceToneTurn(){voiceToneWorker?.postMessage({type:'reset'});}
function countSpeechChars(text){return Array.from(String(text||'').replace(/[\s，。！？、,.!?…~～"'“”‘’：:；;（）()\[\]{}]/g,'')).length;}
async function finishVoiceToneTurn(text,voiceDurationMs=0){
  if(!voiceToneEnabled||!voiceToneWorker||!voiceToneReady)return null;
  const requestId=++voiceToneRequestSeq;
  const raw=await new Promise(resolve=>{
    const timer=setTimeout(()=>{voiceTonePending.delete(requestId);resolve(null);},650);
    voiceTonePending.set(requestId,{resolve:value=>{clearTimeout(timer);resolve(value);}});
    voiceToneWorker.postMessage({type:'finish',requestId});
  });
  if(!raw)return null;
  const chars=countSpeechChars(text);
  const seconds=Math.max(0.35,Number(raw.voicedDurationMs||voiceDurationMs||raw.activeDurationMs||0)/1000);
  const summary={...raw,charsPerSecond:Number((chars/seconds).toFixed(3)),transcriptChars:chars};
  const baselineBefore=voiceToneBaseline;
  const relative=baselineComparison(summary,baselineBefore);
  const baselineCount=Number(baselineBefore?.count||0);
  if(chars>=2&&Number(summary.activeDurationMs||0)>=450){
    voiceToneBaseline=updateProsodyBaseline(baselineBefore,summary);
    saveVoiceToneBaseline();syncVoiceToneUi();
  }
  return {...summary,baselineCount,relative};
}
function clearVoiceToneBaseline(){
  voiceToneBaseline=null;saveVoiceToneBaseline();syncVoiceToneUi();room.toast('语音基线已清除 · 重新学习中');
}
loadVoiceToneBaseline();
try{
  const saved=localStorage.getItem('companion-voice-runtime.voice-tone');
  voiceToneEnabled=saved===null?true:saved==='1';
}catch{voiceToneEnabled=true;}
$('voice-tone-toggle')?.addEventListener('change',event=>{setVoiceToneEnabled(!!event.currentTarget.checked);room.haptic();});
$('voice-tone-reset')?.addEventListener('click',()=>{clearVoiceToneBaseline();room.haptic();});
function selectedBinauralMode(){return $('binaural-mode')?.value||'off';}
function initBinauralPicker(){
  const select=$('binaural-mode');if(!select)return;
  select.value='ku100-right25';
  binauralNote(select.value==='ku100-right25'?'贴耳声线会套 KU100 25cm 右耳近场':'贴耳声线保持原声');
}
$('body-hearing-toggle')?.addEventListener('change',event=>{setBodyHearingEnabled(!!event.currentTarget.checked);room.haptic();});
$('binaural-mode')?.addEventListener('change',()=>{
  try{localStorage.setItem('companion-voice-runtime.binaural-mode',selectedBinauralMode());}catch{}
  binauralNote(selectedBinauralMode()==='ku100-right25'?'KU100 25cm 将从下一句贴耳语音生效':'A/B 已切回原声；下一句生效');
  if(selectedBinauralMode()==='ku100-right25'&&audioCtx)loadBinauralHrir().catch(()=>{});
});
// iOS Safari restricts playback started after async network/model work.
// Unlock a persistent Web Audio context synchronously on the user's tap.

function realSfxNote(text){const el=$('real-sfx-status');if(el)el.textContent=text;}
function openRealSfxDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('companion-voice-runtime-assets',1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('assets'))req.result.createObjectStore('assets');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB 打不开'));
  });
}
async function checkRealSfxCache(){
  const db=await openRealSfxDb();
  const value=await new Promise((resolve,reject)=>{const req=db.transaction('assets').objectStore('assets').get('custom-sfx-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  db.close();realSfxNote(value?'Custom SFX cached · loads after dialing':'未配置自定义 SFX');return value;
}
async function cacheRealSfx(bytes){
  const db=await openRealSfxDb();
  await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put(bytes,'custom-sfx-v1');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();
}
async function loadCachedRealSfx(){
  if(!audioCtx)return null;if(realSfxBuffer)return realSfxBuffer;if(realSfxLoadPromise)return realSfxLoadPromise;
  realSfxLoadPromise=(async()=>{
    const db=await openRealSfxDb();
    const bytes=await new Promise((resolve,reject)=>{const req=db.transaction('assets').objectStore('assets').get('custom-sfx-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    db.close();if(!bytes){realSfxNote('未配置自定义 SFX');return null;}
    const buffer=await audioCtx.decodeAudioData(bytes.slice(0));
    if(!Number.isFinite(buffer.duration)||buffer.duration<0.2)throw new Error('音频文件为空');
    realSfxBuffer=buffer;realSfxClipPeaks.clear();realSfxNote('自定义 SFX 已就绪');return buffer;
  })().catch(error=>{realSfxLoadPromise=null;realSfxNote('自定义 SFX 加载失败：'+String(error?.message||error));throw error;});
  return realSfxLoadPromise;
}
function pickRealSfx(pool,targetIntensity=0.5){
  const items=REAL_SFX_GROUPS[pool]||[];if(!items.length)return null;
  const fresh=items.filter(item=>!realSfxRecent.includes(item.id)),source=fresh.length?fresh:items;
  const ranked=[...source].sort((a,b)=>Math.abs(a.intensity-targetIntensity)-Math.abs(b.intensity-targetIntensity));
  const top=ranked.slice(0,Math.min(3,ranked.length)),item=top[Math.floor(Math.random()*top.length)]||ranked[0];
  realSfxRecent.push(item.id);if(realSfxRecent.length>10)realSfxRecent.shift();return item;
}
function realClipPeak(offset,duration){
  if(!realSfxBuffer)return 1;
  const key=offset.toFixed(4)+':'+duration.toFixed(4);
  if(realSfxClipPeaks.has(key))return realSfxClipPeaks.get(key);
  const rate=realSfxBuffer.sampleRate,start=Math.max(0,Math.floor(offset*rate)),stop=Math.min(realSfxBuffer.length,Math.ceil((offset+duration)*rate));
  const span=Math.max(1,stop-start),step=Math.max(1,Math.floor(span/9000));let peak=0;
  for(let c=0;c<realSfxBuffer.numberOfChannels;c++){
    const data=realSfxBuffer.getChannelData(c);
    for(let i=start;i<stop;i+=step)peak=Math.max(peak,Math.abs(data[i]||0));
  }
  peak=Math.max(0.03,peak);realSfxClipPeaks.set(key,peak);return peak;
}
function duckVoiceForCue(voiceGain,start,end,depth=0.78){
  if(!voiceGain||!audioCtx)return;
  const g=voiceGain.gain,down=Math.max(start,audioCtx.currentTime),up=Math.max(down+0.04,end);
  try{
    g.cancelScheduledValues(down);
    g.setValueAtTime(g.value,down);
    g.linearRampToValueAtTime(depth,down+0.035);
    g.setValueAtTime(depth,Math.max(down+0.04,up-0.035));
    g.linearRampToValueAtTime(1,up+0.045);
  }catch{}
}
function playRealSfx(pool,{delay=0,targetPeak=0.15,maxDuration=null,fadeIn=0.045,fadeOut=0.16,voiceGain=null,duckDepth=0.78,cueIntensity=0.5}={}){
  const item=pickRealSfx(pool,cueIntensity),bus=ensureSfxBus();if(!item||!realSfxBuffer||!bus||!audioCtx||audioCtx.state!=='running')return Promise.resolve(false);
  const offset=item.offset,clipDuration=item.duration,wanted=Math.max(0.05,Math.min(clipDuration,maxDuration??clipDuration));
  const source=audioCtx.createBufferSource(),gain=audioCtx.createGain(),start=audioCtx.currentTime+Math.max(0,delay),end=start+wanted;
  const peak=realClipPeak(offset,wanted),amp=Math.max(0.025,Math.min(0.95,targetPeak/peak));
  source.buffer=realSfxBuffer;
  gain.gain.setValueAtTime(0.001,start);
  gain.gain.linearRampToValueAtTime(amp,start+Math.min(fadeIn,wanted*0.28));
  gain.gain.setValueAtTime(amp,Math.max(start+0.035,end-Math.min(fadeOut,wanted*0.45)));
  gain.gain.exponentialRampToValueAtTime(0.001,end);
  let output=source,convolver=null;
  if(selectedBinauralMode()==='ku100-right25'&&binauralHrirBuffer){
    convolver=audioCtx.createConvolver();convolver.normalize=false;convolver.buffer=binauralHrirBuffer;
    source.connect(convolver);output=convolver;
  }
  output.connect(gain);gain.connect(bus);duckVoiceForCue(voiceGain,start,end,duckDepth);
  activeSfxSources.add(source);
  return new Promise(resolve=>{
    source.onended=()=>{activeSfxSources.delete(source);try{source.disconnect();convolver?.disconnect();gain.disconnect();}catch{}resolve(true);};
    try{source.start(start,offset,wanted);}catch{resolve(false);}
  });
}
function playPerformanceCue(cue,{voiceDuration=1,voiceGain=null}={}){
  if(!cue||!realSfxBuffer)return Promise.resolve(false);
  const intensity=Math.max(0,Math.min(1,Number(cue.intensity)||0.5));
  if(cue.type==='kiss'){
    const sequence=cue.variant==='sequence',overlap=sequence?0.09:0.055;
    return playRealSfx(sequence?'kiss_sequence':'kiss_single',{
      delay:Math.max(0.08,voiceDuration-overlap),targetPeak:0.13+intensity*0.055,maxDuration:sequence?2.6:0.74,
      fadeIn:0.025,fadeOut:sequence?0.22:0.12,voiceGain,duckDepth:sequence?0.66:0.72,cueIntensity:intensity
    });
  }
  if(cue.type==='breath'){
    const strong=cue.variant==='strong',restrained=cue.variant==='restrained';
    const pool=strong?'breath_strong':restrained?'breath_restrained':'breath_soft';
    const delay=strong?Math.max(0.12,voiceDuration*0.62):Math.max(0.10,voiceDuration-0.04);
    return playRealSfx(pool,{
      delay,targetPeak:strong?0.12+intensity*0.045:restrained?0.105+intensity*0.035:0.085+intensity*0.03,
      maxDuration:strong?1.48:restrained?1.50:1.82,fadeIn:strong?0.055:0.075,fadeOut:0.22,
      voiceGain,duckDepth:strong?0.76:restrained?0.82:0.88,cueIntensity:intensity
    });
  }
  if(cue.type==='rhythm'){
    const variant=['medium','fast','faster','fastest'].includes(cue.variant)?cue.variant:'fast';
    const delay=Math.min(0.72,Math.max(0.18,voiceDuration*0.26));
    const peak={medium:0.075,fast:0.088,faster:0.098,fastest:0.108}[variant]+intensity*0.012;
    return playRealSfx('rhythm_'+variant,{
      delay,targetPeak:peak,maxDuration:variant==='medium'?2.65:2.35,fadeIn:0.16,fadeOut:0.30,
      voiceGain,duckDepth:0.90,cueIntensity:intensity
    });
  }
  return Promise.resolve(false);
}

$('real-sfx-import')?.addEventListener('click',()=>$('real-sfx-file')?.click());
$('real-sfx-file')?.addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    activateAudio();realSfxNote('正在导入自定义 SFX…');const bytes=await file.arrayBuffer();
    const buffer=await audioCtx.decodeAudioData(bytes.slice(0));if(!Number.isFinite(buffer.duration)||buffer.duration<0.2)throw new Error('请选择有效的音频文件');
    await cacheRealSfx(bytes);realSfxBuffer=buffer;realSfxLoadPromise=Promise.resolve(buffer);realSfxRecent=[];realSfxClipPeaks.clear();realSfxNote('自定义 SFX 已就绪');
  }catch(error){realSfxNote('导入失败：'+String(error?.message||error));}
  event.target.value='';
});
async function loadBinauralHrir(){
  if(!audioCtx)return null;
  if(binauralHrirBuffer)return binauralHrirBuffer;
  if(binauralLoadPromise)return binauralLoadPromise;
  binauralNote('KU100 25cm HRIR 加载中…');
  binauralLoadPromise=(async()=>{
    const response=await fetch(BASE+'/api/hrir/ku100-right25.json?v=binaural-ku100-1',{credentials:'same-origin',cache:'reload',headers:{'cache-control':'no-cache'}});
    if(!response.ok){const detail=await response.text().catch(()=>'');throw new Error('HRIR '+response.status+(detail?' · '+detail.slice(0,80):''));}
    const data=await response.json();
    if(!Array.isArray(data.left)||!Array.isArray(data.right)||data.left.length!==data.right.length||data.left.length<16)throw new Error('HRIR 数据无效');
    const buffer=audioCtx.createBuffer(2,data.left.length,Number(data.sampleRate)||48000);
    buffer.copyToChannel(Float32Array.from(data.left),0);buffer.copyToChannel(Float32Array.from(data.right),1);
    binauralHrirBuffer=buffer;
    binauralNote('KU100 · 右耳 25cm 已就绪（仅耳机）');
    return buffer;
  })().catch(error=>{binauralLoadPromise=null;binauralNote('KU100 加载失败：'+String(error?.message||error));throw error;});
  return binauralLoadPromise;
}
function ensurePcmWorklet(){
  if(!audioCtx?.audioWorklet||!window.AudioWorkletNode)return Promise.resolve(false);
  if(pcmWorkletLoadPromise)return pcmWorkletLoadPromise;
  pcmWorkletLoadPromise=audioCtx.audioWorklet.addModule(BASE+'/pcm-worklet.js?v=companion-room-14').then(()=>true).catch(error=>{pcmWorkletLoadPromise=null;throw error;});
  return pcmWorkletLoadPromise;
}
function activateAudio(){
  const AudioContextCtor=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextCtor)throw new Error('此浏览器不支持音频播放');
  if(!audioCtx||audioCtx.state==='closed')audioCtx=new AudioContextCtor();
  audioCtx.resume().catch(()=>{});
  // A zero-amplitude buffer source is started during the trusted click.
  const silence=audioCtx.createBuffer(1,1,audioCtx.sampleRate);
  const source=audioCtx.createBufferSource();
  source.buffer=silence;source.connect(audioCtx.destination);source.start();
  ensurePcmWorklet().catch(()=>{});
}
function ensureSfxBus(){
  if(!audioCtx)return null;
  if(sfxBus&&sfxBus.context===audioCtx)return sfxBus;
  sfxBus=audioCtx.createGain();sfxBus.gain.value=1;sfxBus.connect(audioCtx.destination);return sfxBus;
}
function stopSfx(){
  for(const source of activeSfxSources){try{source.stop();}catch{} try{source.disconnect();}catch{}}
  activeSfxSources.clear();
}

function testSpeaker(){
  try{
    activateAudio();
    const now=audioCtx.currentTime;
    const tone=audioCtx.createOscillator(),gain=audioCtx.createGain();
    tone.type='sine';tone.frequency.value=660;
    gain.gain.setValueAtTime(0.001,now);
    gain.gain.exponentialRampToValueAtTime(0.085,now+0.04);
    gain.gain.exponentialRampToValueAtTime(0.001,now+0.30);
    tone.connect(gain);gain.connect(audioCtx.destination);
    tone.start(now);tone.stop(now+0.31);
    setStatus('试听中：应该听到一声短提示音');audioNote('此提示音不消耗 ElevenLabs 积分');
  }catch(error){audioNote('扬声器测试失败：'+String(error.message||error));}
}
function stopAudio(){
  audioGeneration++;
  for(const controller of audioFetches)controller.abort();
  audioFetches.clear();
  stopSfx();
  if(currentSource){
    try{currentSource.stop();}catch{}
    try{currentSource.disconnect();}catch{}
    currentSource=null;
  }
  pendingAudioSegments=0;assistantFinished=false;
  audioQueue=Promise.resolve();
}

// Start downloading and decoding the NEXT phrase before the current one stops speaking.
// Playback order remains strict; one failure cannot reorder sentences.
async function prepareAudio(segmentId,generation,playbackRate=currentCallPlaybackRate,voiceProfile='normal',text='',turnId=null,performanceCue=null){
  if(generation!==audioGeneration||!callId)return null;
  if(!audioCtx)throw new Error('音频尚未解锁，请点击试听');
  const id=callId,controller=new AbortController();
  audioFetches.add(controller);
  try{
    let lastError=null;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const response=await fetch(BASE+'/api/calls/'+id+'/audio/'+segmentId,{
          credentials:'same-origin',signal:controller.signal,cache:'no-store'
        });
        if(!response.ok)throw new Error('音频接口 '+response.status);
        const bytes=await response.arrayBuffer();
        if(generation!==audioGeneration)return null;
        const buffer=await audioCtx.decodeAudioData(bytes.slice(0));
        if(generation!==audioGeneration)return null;
        return {buffer,id,playbackRate,voiceProfile,text,turnId,performanceCue};
      }catch(error){
        lastError=error;
        if(error?.name==='AbortError'||generation!==audioGeneration||attempt===2)throw error;
        await sleep(160*(attempt+1));
      }
    }
    throw lastError||new Error('audio_prepare_failed');
  }finally{audioFetches.delete(controller);}
}
async function playPreparedAudio(prepared,generation){
  const data=await prepared;
  if(!data||generation!==audioGeneration)return;
  await audioCtx.resume();
  if(generation!==audioGeneration)return;
  if(audioCtx.state!=='running')throw new Error('iPhone 暂停了声音，请点试听');
  const source=audioCtx.createBufferSource();
  source.buffer=data.buffer;source.playbackRate.value=Number.isFinite(data.playbackRate)?data.playbackRate:currentCallPlaybackRate;
  let finalNode=source,cleanupNodes=[];
  if(data.voiceProfile==='intimate'){
    const gain=audioCtx.createGain(),compressor=audioCtx.createDynamicsCompressor();
    const useKu100=selectedBinauralMode()==='ku100-right25'&&binauralHrirBuffer;
    gain.gain.value=useKu100?0.78:1.03;
    compressor.threshold.value=-22;
    compressor.knee.value=12;
    compressor.ratio.value=3;
    compressor.attack.value=0.008;
    compressor.release.value=0.18;
    if(useKu100){
      const convolver=audioCtx.createConvolver();convolver.normalize=false;convolver.buffer=binauralHrirBuffer;
      source.connect(convolver);convolver.connect(gain);cleanupNodes.push(convolver);
    }else source.connect(gain);
    gain.connect(compressor);finalNode=compressor;cleanupNodes.push(gain,compressor);
  }
  const voiceMix=audioCtx.createGain();voiceMix.gain.value=1;finalNode.connect(voiceMix);voiceMix.connect(audioCtx.destination);cleanupNodes.push(voiceMix);
  const stopMeter=room.measure(voiceMix,'assistant');cleanupNodes.push({disconnect:stopMeter});currentSource=source;
  // Do not delay playback for a network round trip just to report the playback state.
  api('/api/calls/'+data.id+'/playback',{status:'start'}).catch(()=>{});
  audioNote('语音播放中…');
  let cuePlayback=Promise.resolve(false);
  const voiceDuration=data.buffer.duration/(Number.isFinite(data.playbackRate)?data.playbackRate:1);
  await new Promise((resolve,reject)=>{
    source.onended=()=>{stopMeter();resolve();};
    try{
      source.start(0);
      if(data.performanceCue)cuePlayback=playPerformanceCue(data.performanceCue,{voiceDuration,voiceGain:voiceMix});
    }catch(error){reject(error);}
  });
  await cuePlayback.catch(()=>false);
  if(currentSource===source){
    currentSource=null;try{source.disconnect();}catch{} for(const node of cleanupNodes)try{node.disconnect();}catch{}
    audioNote('语音播放结束');
  }
}
function maybeFinishPlayback(generation){
  if(generation===audioGeneration && assistantFinished && pendingAudioSegments===0 && callId){
    api('/api/calls/'+callId+'/playback',{status:'end'}).catch(()=>{});
  }
}
function enqueueAudio(segmentId,playbackRate=currentCallPlaybackRate,voiceProfile='normal',text='',turnId=null,performanceCue=null){
  if(!segmentId||seenAudioSegments.has(segmentId))return;
  seenAudioSegments.add(segmentId);
  const generation=audioGeneration;
  pendingAudioSegments++;
  // Preload immediately in parallel with current speech.
  const prepared=prepareAudio(segmentId,generation,playbackRate,voiceProfile,text,turnId,performanceCue);
  prepared.catch(()=>{}); // Prevent unhandled rejection if hangup occurs before its turn.
  audioQueue=audioQueue.then(()=>playPreparedAudio(prepared,generation))
    .catch(error=>{
      if(generation===audioGeneration&&error?.name!=='AbortError'){
        audioNote('播放失败：'+String(error?.message||error));
        setStatus('语音播放遇到问题');
      }
    }).finally(()=>{
      if(generation!==audioGeneration)return;
      pendingAudioSegments=Math.max(0,pendingAudioSegments-1);
      maybeFinishPlayback(generation);
    });
}

$('speaker-test').onclick=testSpeaker;
$('tts-preview').onclick=async()=>{
  if(callId)return;
  const button=$('tts-preview');
  try{activateAudio();}catch(error){audioNote('音频引擎不可用：'+error.message);return;}
  stopAudio();button.disabled=true;
  const model=$('tts-model').value,tone=selectedTone();
  try{
    audioNote('正在准备 Companion 的中文试听'+
      (model==='eleven_v4_turbo'&&$('tts-tone').value==='auto'?'（'+(tone==='deep_night'?'晚安':'日常')+'）':'')+'…');
    const response=await fetch(BASE+'/api/tts/preview',{
      method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
      body:JSON.stringify({model,tone})
    });
    if(!response.ok)throw new Error('HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const buffer=await audioCtx.decodeAudioData(bytes.slice(0));
    await audioCtx.resume();
    const source=audioCtx.createBufferSource();source.buffer=buffer;source.playbackRate.value=model==='eleven_v4_turbo'?(v4PlaybackRates[tone]||1):1;
    source.connect(audioCtx.destination);currentSource=source;
    audioNote('正在试听：'+({eleven_multilingual_v2:'Multilingual v2',eleven_flash_v2_5:'Flash v2.5',eleven_v4_turbo:'v4 Turbo · '+({original:'原版',steady:'稳重',deep:'低沉',deep_calm:'日常·轻柔',deep_slow:'旧版·慢声',deep_night:'晚安·慢声'}[tone]||tone)}[model]||model));
    await new Promise((resolve,reject)=>{
      source.onended=resolve;
      try{source.start();}catch(error){reject(error);}
    });
    if(currentSource===source){currentSource=null;source.disconnect();}
    audioNote('试听完成，可以切到另一个模型对比');
  }catch(error){audioNote('试听失败：'+String(error.message||error));}
  finally{button.disabled=false;}
};

function subscribe(){
  eventStream?.close();
  const stream=new EventSource(BASE+'/api/calls/'+callId+'/events',{withCredentials:true});
  eventStream=stream;
  let assistant='';
  stream.addEventListener('state',e=>{const d=JSON.parse(e.data);if(d.state==='ENDED'&&$('phone').dataset.phase==='incoming'){const missed=d.reason==='missed_call';eventStream?.close();eventStream=null;callId=null;room.foyer();setStatus(missed?'刚刚错过了老公的来电。':'这通来电结束了。');loadCallHistory().catch(()=>{});return;}const names={LISTENING:'',WAITING_MODEL:'陪你待一会儿…',WAITING_TTS:'',ASSISTANT_SPEAKING:'',INTERRUPTING:'听你说…',ENDED:'和 Companion 的通话结束了'};if(!dialing)setStatus(names[d.state]||'');});
  stream.addEventListener('user_partial',e=>{$('partial').textContent=JSON.parse(e.data).text;});
  stream.addEventListener('user_final',e=>{const d=JSON.parse(e.data);$('partial').textContent='';addLine('User',d.text,'user-turn-'+d.turnId);assistant='';assistantFinished=false;});
  stream.addEventListener('user_repaired',e=>{const d=JSON.parse(e.data);$('partial').textContent='';addLine('User',d.text,'user-turn-'+d.turnId);assistant='';assistantFinished=false;});
  stream.addEventListener('heard_cues',e=>{const d=JSON.parse(e.data),turn=Number(d.turnId)||0;if(!turn||!d.cues)return;turnHeardCues.set(turn,d.cues);const live=document.getElementById('assistant-live');if(live&&Number(live.dataset.turnId)===turn)renderHeardCues(live,d.cues);});
  stream.addEventListener('assistant_delta',e=>{const d=JSON.parse(e.data);assistant+=d.delta;const row=addLine('Companion',assistant,'assistant-live');row.dataset.turnId=String(d.turnId||'');const cues=turnHeardCues.get(Number(d.turnId));if(cues)renderHeardCues(row,cues);});
  stream.addEventListener('assistant_done',e=>{const d=JSON.parse(e.data);const row=addLine('Companion',d.text,'assistant-live');row.removeAttribute('id');row.id='assistant-turn-'+d.turnId;row.dataset.turnId=String(d.turnId||'');const cues=d.heardCues||turnHeardCues.get(Number(d.turnId));if(cues){turnHeardCues.set(Number(d.turnId),cues);renderHeardCues(row,cues);}assistantFinished=true;pendingTypedText='';scribe?.updateContext?.(d.text);maybeFinishPlayback(audioGeneration);});
  stream.addEventListener('assistant_retracted',e=>{const d=JSON.parse(e.data);turnHeardCues.delete(Number(d.turnId));document.getElementById('assistant-turn-'+d.turnId)?.remove();const live=document.getElementById('assistant-live');if(live&&Number(live.dataset.turnId)===Number(d.turnId))live.remove();});
  stream.addEventListener('tts_segment',e=>{const d=JSON.parse(e.data);enqueueAudio(d.segmentId,Number.isFinite(d.playbackRate)?d.playbackRate:currentCallPlaybackRate,d.voiceProfile||'normal',d.text||'',d.turnId||null,d.performanceCue||null);});
  stream.addEventListener('interrupted',e=>{const d=JSON.parse(e.data);stopAudio();const live=document.getElementById('assistant-live');if(d.reason==='typed_repair')live?.remove();else live?.removeAttribute('id');assistant='';setStatus('听你说…');});
  stream.addEventListener('backchannel',e=>addLine('User',JSON.parse(e.data).text+'（附和）'));
  // Raw detector events stay silent in the transcript. Only cues actually
  // consumed by a Companion turn appear in its expandable “Heard cues” detail.
  stream.addEventListener('nonverbal_heard',()=>{});
  stream.addEventListener('voice_tone',()=>{});
  stream.addEventListener('error',e=>{if(e.data){const d=JSON.parse(e.data);audioNote(d.code);if(pendingTypedText&&$('typed-input')&&!$('typed-input').value){$('typed-input').value=pendingTypedText;pendingTypedText='';}setStatus('刚才这句没有送到老公这里，已经放回输入框。');}});
}
async function startScribe(){
  const [{Scribe,RealtimeEvents,CommitStrategy,AudioFormat},{token},stream]=await Promise.all([
    import('/call/scribe-client.bundle.js'),
    api('/api/calls/'+callId+'/stt-token',{provider:'scribe'}),
    navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:!bodyHearingEnabled,autoGainControl:true}})
  ]);
  let connection=null,opened=false,source=null,node=null,silentGain=null,processor=null,closed=false,stopMeter=null,micInterrupted=false;
  const micTrack=stream.getAudioTracks()[0];
  micTrack?.addEventListener('mute',()=>{micInterrupted=true;});
  micTrack?.addEventListener('ended',()=>{micInterrupted=true;});
  const toBase64=buffer=>{
    const bytes=new Uint8Array(buffer);let binary='';
    for(let i=0;i<bytes.length;i+=0x4000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x4000)));
    return btoa(binary);
  };
  const sendAudio=buffer=>{
    if(muted||!buffer?.byteLength)return;
    feedBodyHearing(buffer);feedVoiceTone(buffer);
    if(!opened||!connection)return;
    try{connection.send({audioBase64:toBase64(buffer),sampleRate:16000});}catch{}
  };
  const cleanup=()=>{
    if(closed)return;closed=true;stopMeter?.();
    try{source?.disconnect();}catch{} try{node?.disconnect();}catch{} try{processor?.disconnect();}catch{} try{silentGain?.disconnect();}catch{}
    for(const track of stream.getTracks())track.stop();
  };
  try{
    if(audioCtx.audioWorklet&&window.AudioWorkletNode){
      await ensurePcmWorklet();
      source=audioCtx.createMediaStreamSource(stream);
      node=new AudioWorkletNode(audioCtx,'pcm16-capture');
      silentGain=audioCtx.createGain();silentGain.gain.value=0;
      node.port.onmessage=e=>sendAudio(e.data);
      source.connect(node);node.connect(silentGain);silentGain.connect(audioCtx.destination);
    }else{
      source=audioCtx.createMediaStreamSource(stream);
      processor=audioCtx.createScriptProcessor(4096,1,1);
      silentGain=audioCtx.createGain();silentGain.gain.value=0;
      processor.onaudioprocess=e=>sendAudio(downsamplePCM16(e.inputBuffer.getChannelData(0),audioCtx.sampleRate));
      source.connect(processor);processor.connect(silentGain);silentGain.connect(audioCtx.destination);
    }
    stopMeter=room.measure(source,'user');
    connection=Scribe.connect({
      token,modelId:'scribe_v2_realtime',commitStrategy:CommitStrategy.VAD,
      audioFormat:AudioFormat.PCM_16000,sampleRate:16000,
      vadSilenceThresholdSecs:0.55,vadThreshold:0.30,minSpeechDurationMs:80,minSilenceDurationMs:180,
      languageCode:'zh',secondaryLanguages:['en'],
      keyterms:STT_KEYTERMS,
      noVerbatim:false
    });
  }catch(error){cleanup();try{connection?.close();}catch{}throw error;}
  connection.on(RealtimeEvents.OPEN,()=>{opened=true;setStatus('');});
  connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT,data=>{
    if(muted)return;
    if(!voiceStartedAt){voiceStartedAt=Date.now();startVoiceToneTurn();api('/api/calls/'+callId+'/stt',{type:'voice_start'}).catch(()=>{});}
    api('/api/calls/'+callId+'/stt',{type:'partial',text:data.text,provider:'scribe'}).catch(()=>{});
  });
  connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT,async data=>{
    if(muted)return;
    const duration=voiceStartedAt?Date.now()-voiceStartedAt:0;voiceStartedAt=0;
    const prosody=await finishVoiceToneTurn(data.text,duration);
    api('/api/calls/'+callId+'/stt',{type:'committed',text:data.text,voiceDurationMs:duration,provider:'scribe',prosody}).catch(error=>setStatus(error.message));
  });
  connection.on(RealtimeEvents.ERROR,error=>setStatus('听写错误：'+(error?.error||'连接失败')));
  connection.on(RealtimeEvents.CLOSE,()=>{opened=false;cleanup();if(callId&&!micReconnectPromise)setStatus('听写已断开');});
  scribe={
    setMuted(value){for(const track of stream.getAudioTracks())track.enabled=!value;if(value){resetBodyHearing();resetVoiceToneTurn();}},
    updateContext(){},
    needsReconnect(){return micInterrupted||closed||!opened||stream.getAudioTracks().some(track=>track.readyState!=='live'||track.muted);},
    disconnect(){cleanup();try{connection.close();}catch{}}
  };
}
function downsamplePCM16(input,sourceRate,targetRate=16000){
  if(sourceRate===targetRate){
    const out=new Int16Array(input.length);
    for(let i=0;i<input.length;i++){const v=Math.max(-1,Math.min(1,input[i]));out[i]=v<0?v*0x8000:v*0x7fff;}
    return out.buffer;
  }
  const ratio=sourceRate/targetRate,count=Math.max(1,Math.floor(input.length/ratio)),out=new Int16Array(count);
  for(let i=0;i<count;i++){const v=Math.max(-1,Math.min(1,input[Math.min(input.length-1,Math.floor(i*ratio))]||0));out[i]=v<0?v*0x8000:v*0x7fff;}
  return out.buffer;
}

async function startTencentSttForStream(stream,onMessage){
  if(!tencentSttStatusLoaded)await loadTencentSttStatus().catch(()=>null);
  if(!tencentSttConfigured)return null;
  const track=stream?.getAudioTracks?.()[0];
  if(!track)return null;
  const status=$('tencent-stt-status');
  if(status)status.textContent='正在连接…';
  try{
    const session=await api('/api/calls/'+callId+'/trtc-session',{});
    const {startTencentTranscriber}=await import('/call/tencent-stt-client.bundle.js?v=tencent-stt-1');
    const client=await startTencentTranscriber({
      ...session,
      audioTrack:track,
      onMessage,
      onState:event=>{
        if(!status)return;
        if(event?.error)status.textContent='Fallback · '+(event.errorMessage||('error '+event.error));
        else if(event?.state==='started')status.textContent='运行中 · 中文 + 混合语音';
        else if(event?.state==='stopped')status.textContent='已就绪 · 中文 + 混合语音';
      },
      onError:error=>{if(status)status.textContent='Fallback · '+String(error?.message||error);}
    });
    tencentStt=client;
    if(status)status.textContent='运行中 · 中文 + 混合语音';
    return client;
  }catch(error){
    if(status){
      const message=String(error?.message||error);
      status.textContent=/2026|not.?enabled/i.test(message)?'需要先启用 Speech AI':'Fallback · 仅 AssemblyAI';
    }
    return null;
  }
}

async function startAssemblyAI(){
  const mediaPromise=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:!bodyHearingEnabled,autoGainControl:true}});
  const workletPromise=ensurePcmWorklet().catch(()=>false);
  const [stream]=await Promise.all([mediaPromise,workletPromise]);
  const usageCallId=callId;
  const SLEEP_AFTER_MS=30000;
  const PRE_ROLL_CHUNKS=30; // ~3 seconds at the 100 ms PCM worklet cadence.
  let socket=null,cloudReady=false,cloudSleeping=false,cloudConnectPromise=null,cloudGeneration=0;
  let source=null,node=null,silentGain=null,processor=null,closed=false,stopMeter=null,tencentSidecar=null,micInterrupted=false;
  let latestTencent=null,tencentSeq=0,activeHybridTurn=null,lastHybridCommitAt=0;
  let agentContext=ASSEMBLY_INITIAL_CONTEXT,lastVoiceActivityAt=Date.now(),noiseFloor=.0035,voiceHits=0;
  let preRoll=[],inactivityTimer=null;
  const intentionalSockets=new WeakSet();
  const micTrack=stream.getAudioTracks()[0];
  micTrack?.addEventListener('mute',()=>{micInterrupted=true;});
  micTrack?.addEventListener('ended',()=>{micInterrupted=true;});

  const pcmRms=buffer=>{
    try{
      const pcm=new Int16Array(buffer);if(!pcm.length)return 0;
      let sum=0,count=0;
      for(let i=0;i<pcm.length;i+=4){const v=pcm[i]/32768;sum+=v*v;count++;}
      return count?Math.sqrt(sum/count):0;
    }catch{return 0;}
  };
  const localSpeech=buffer=>{
    const level=pcmRms(buffer);
    const threshold=Math.max(.011,noiseFloor*3.1);
    const speech=level>=threshold;
    if(!speech&&level<Math.max(.018,noiseFloor*1.8))noiseFloor=noiseFloor*.97+level*.03;
    voiceHits=speech?Math.min(6,voiceHits+1):Math.max(0,voiceHits-1);
    return voiceHits>=2;
  };
  const rememberPreRoll=buffer=>{
    try{preRoll.push(buffer.slice(0));}catch{return;}
    if(preRoll.length>PRE_ROLL_CHUNKS)preRoll.splice(0,preRoll.length-PRE_ROLL_CHUNKS);
  };
  const beginHybridTurn=(provider='assemblyai')=>{
    if(!activeHybridTurn||activeHybridTurn.committed){
      activeHybridTurn={startedAt:Date.now(),tencentSeqAtStart:Math.max(0,tencentSeq-1),committed:false,finishing:false,voiceStartSent:false,fallbackTimer:null};
    }
    if(!voiceStartedAt){voiceStartedAt=activeHybridTurn.startedAt;startVoiceToneTurn();}
    if(!activeHybridTurn.voiceStartSent){
      activeHybridTurn.voiceStartSent=true;
      api('/api/calls/'+callId+'/stt',{type:'voice_start',provider}).catch(()=>{});
    }
    return activeHybridTurn;
  };
  const finishHybridTurn=async({assemblyText='',tencentText='',tencentCompleted=false,providerHint='assemblyai'}={})=>{
    const turn=activeHybridTurn||beginHybridTurn(providerHint);
    if(turn.committed||turn.finishing)return;
    turn.finishing=true;
    try{
      if(assemblyText&&hasCjk(assemblyText)&&tencentSidecar)await sleep(280);
      const candidate=latestTencent&&latestTencent.seq>turn.tencentSeqAtStart&&latestTencent.at>=turn.startedAt-450&&Date.now()-latestTencent.at<2800?latestTencent:null;
      const choice=assemblyText
        ? chooseHybridTranscript({assemblyText,tencentText:tencentText||candidate?.text||'',tencentCompleted:tencentCompleted||!!candidate?.completed})
        : chooseHybridTranscript({tencentText:tencentText||candidate?.text||'',tencentCompleted:true});
      if(!choice.text){turn.finishing=false;return;}
      turn.committed=true;
      if(turn.fallbackTimer){clearTimeout(turn.fallbackTimer);turn.fallbackTimer=null;}
      const duration=Math.max(0,Date.now()-turn.startedAt);
      voiceStartedAt=0;
      const prosody=await finishVoiceToneTurn(choice.text,duration);
      await api('/api/calls/'+callId+'/stt',{type:'committed',text:choice.text,voiceDurationMs:duration,provider:choice.provider||providerHint,endOfTurn:true,prosody}).catch(error=>setStatus(error.message));
      lastHybridCommitAt=Date.now();
    }finally{turn.finishing=false;}
  };
  const onTencentMessage=message=>{
    if(muted||!message?.text)return;
    tencentSeq++;
    latestTencent={...message,seq:tencentSeq,at:Date.now()};
    if(activeHybridTurn?.committed&&Date.now()-lastHybridCommitAt<1800)return;
    if(!message.completed||!hasCjk(message.text))return;
    const turn=beginHybridTurn('tencent');
    if(turn.committed)return;
    if(turn.fallbackTimer)clearTimeout(turn.fallbackTimer);
    turn.fallbackTimer=setTimeout(()=>{finishHybridTurn({tencentText:message.text,tencentCompleted:true,providerHint:'tencent'}).catch(()=>{});},360);
  };
  const recordAssemblyTermination=(data,sessionId)=>{
    if(!usageCallId||!sessionId)return;
    api('/api/calls/'+usageCallId+'/provider-usage',{
      provider:'assemblyai',sessionId,
      sessionDurationSeconds:Number(data?.session_duration_seconds)||0,
      audioDurationSeconds:Number(data?.audio_duration_seconds)||0
    }).catch(()=>{});
  };
  const closeTencent=()=>{
    const sidecar=tencentSidecar||tencentStt;tencentSidecar=null;
    if(sidecar){sidecar.close().catch(()=>{});if(tencentStt===sidecar)tencentStt=null;}
  };
  const closeCloud=({sleeping=true}={})=>{
    cloudGeneration++;
    cloudReady=false;cloudSleeping=!!sleeping;
    closeTencent();
    const ws=socket;socket=null;
    if(ws){
      intentionalSockets.add(ws);
      if(ws.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({type:'Terminate'}));}catch{}}
      setTimeout(()=>{try{if(ws.readyState<2)ws.close();}catch{}},700);
    }
    if(sleeping&&!closed&&!muted)setStatus('STT · 休眠中');
  };
  const connectCloud=async({reason='wake'}={})=>{
    if(closed||muted||cloudReady)return true;
    if(cloudConnectPromise)return cloudConnectPromise;
    const generation=++cloudGeneration;
    cloudSleeping=false;
    cloudConnectPromise=(async()=>{
      const {token}=await api('/api/calls/'+usageCallId+'/stt-token',{provider:'assemblyai'});
      if(closed||muted||generation!==cloudGeneration)return false;
      const url=new URL('wss://streaming.assemblyai.com/v3/ws');
      url.searchParams.set('speech_model','universal-3-6-pro');
      url.searchParams.set('encoding','pcm_s16le');
      url.searchParams.set('sample_rate','16000');
      url.searchParams.set('mode','balanced');
      url.searchParams.set('min_turn_silence','320');
      url.searchParams.set('max_turn_silence','1600');
      url.searchParams.set('token',token);
      const ws=new WebSocket(url);ws.binaryType='arraybuffer';socket=ws;
      let sessionId='';
      const beginPromise=new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('AssemblyAI 连接超时')),12000);
        ws.addEventListener('message',event=>{let d;try{d=JSON.parse(event.data);}catch{return;}if(d.type==='Begin'){clearTimeout(timeout);resolve(d);}}, {once:false});
        ws.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('AssemblyAI 连接失败'));},{once:true});
      });
      ws.onmessage=async event=>{
        let data;try{data=JSON.parse(event.data);}catch{return;}
        if(data.type==='Begin'){
          sessionId=String(data.id||sessionId||'');
          try{ws.send(JSON.stringify({type:'UpdateConfiguration',keyterms:STT_KEYTERMS,agent_context:agentContext}));}catch{}
          return;
        }
        if(data.type==='Termination'){recordAssemblyTermination(data,sessionId);return;}
        if(muted)return;
        if(data.type==='SpeechStarted'){lastVoiceActivityAt=Date.now();beginHybridTurn('assemblyai');return;}
        if(data.type==='Turn'){
          const text=String(data.transcript||'').trim();if(!text)return;
          const turn=beginHybridTurn('assemblyai');
          if(data.end_of_turn){
            if(turn.fallbackTimer){clearTimeout(turn.fallbackTimer);turn.fallbackTimer=null;}
            await finishHybridTurn({assemblyText:text,providerHint:'assemblyai'});
          }else api('/api/calls/'+callId+'/stt',{type:'partial',text,provider:'assemblyai'}).catch(()=>{});
        }
      };
      ws.onerror=()=>{};
      ws.onclose=()=>{
        if(socket===ws){socket=null;cloudReady=false;}
        if(closed||intentionalSockets.has(ws)||generation!==cloudGeneration)return;
        cloudSleeping=true;
        if(callId&&!muted&&!micReconnectPromise)setStatus('STT · 休眠中');
      };
      await beginPromise;
      if(closed||muted||generation!==cloudGeneration){intentionalSockets.add(ws);try{ws.send(JSON.stringify({type:'Terminate'}));}catch{};setTimeout(()=>{try{ws.close();}catch{}},500);return false;}
      cloudReady=true;cloudSleeping=false;lastVoiceActivityAt=Date.now();
      const buffered=preRoll.slice();
      for(const chunk of buffered){if(ws.readyState===WebSocket.OPEN)try{ws.send(chunk);}catch{}}
      const client=await startTencentSttForStream(stream,onTencentMessage).catch(()=>null);
      if(client){
        if(closed||muted||generation!==cloudGeneration||cloudSleeping){client.close().catch(()=>{});if(tencentStt===client)tencentStt=null;}
        else tencentSidecar=client;
      }
      if(!closed&&!muted)setStatus('');
      return true;
    })().catch(error=>{
      if(!closed&&!muted){cloudSleeping=true;setStatus(reason==='initial'?'声音连接中断了，可以先打字。':'STT · 休眠中');}
      return false;
    }).finally(()=>{cloudConnectPromise=null;});
    return cloudConnectPromise;
  };
  const maybeWake=()=>{
    if(closed||muted||!cloudSleeping||cloudConnectPromise)return;
    connectCloud({reason:'voice'}).catch(()=>{});
  };
  const sendAudio=buffer=>{
    if(!buffer?.byteLength)return;
    feedBodyHearing(buffer);feedVoiceTone(buffer);rememberPreRoll(buffer);
    if(!muted&&localSpeech(buffer)){lastVoiceActivityAt=Date.now();maybeWake();}
    if(!muted&&cloudReady&&socket?.readyState===WebSocket.OPEN)try{socket.send(buffer);}catch{}
  };
  try{
    if(audioCtx.audioWorklet&&window.AudioWorkletNode){
      await ensurePcmWorklet();source=audioCtx.createMediaStreamSource(stream);node=new AudioWorkletNode(audioCtx,'pcm16-capture');silentGain=audioCtx.createGain();silentGain.gain.value=0;node.port.onmessage=e=>sendAudio(e.data);source.connect(node);node.connect(silentGain);silentGain.connect(audioCtx.destination);
    }else{
      source=audioCtx.createMediaStreamSource(stream);processor=audioCtx.createScriptProcessor(4096,1,1);silentGain=audioCtx.createGain();silentGain.gain.value=0;processor.onaudioprocess=e=>sendAudio(downsamplePCM16(e.inputBuffer.getChannelData(0),audioCtx.sampleRate));source.connect(processor);processor.connect(silentGain);silentGain.connect(audioCtx.destination);
    }
  }catch(error){for(const track of stream.getTracks())track.stop();try{source?.disconnect();node?.disconnect();processor?.disconnect();silentGain?.disconnect();}catch{}throw error;}
  stopMeter=room.measure(source,'user');
  inactivityTimer=setInterval(()=>{
    if(closed||muted||cloudSleeping||cloudConnectPromise||!cloudReady)return;
    if(activeHybridTurn&&!activeHybridTurn.committed)return;
    if(lastHybridCommitAt&&Date.now()-lastHybridCommitAt<2500)return;
    if(Date.now()-lastVoiceActivityAt>=SLEEP_AFTER_MS)closeCloud({sleeping:true});
  },1000);
  scribe={
    setMuted(value){
      for(const track of stream.getAudioTracks())track.enabled=!value;
      if(value){resetBodyHearing();resetVoiceToneTurn();closeCloud({sleeping:true});}
      else{micInterrupted=false;lastVoiceActivityAt=Date.now();cloudSleeping=true;setStatus('STT · 休眠中');}
    },
    updateContext(text){
      if(text)agentContext=String(text).slice(0,2000);
      if(cloudReady&&socket?.readyState===WebSocket.OPEN&&text)try{socket.send(JSON.stringify({type:'UpdateConfiguration',agent_context:agentContext,keyterms:STT_KEYTERMS}));}catch{}
    },
    needsReconnect(){return micInterrupted||closed||stream.getAudioTracks().some(track=>track.readyState!=='live');},
    isSleeping(){return cloudSleeping;},
    disconnect(){
      if(closed)return;closed=true;clearInterval(inactivityTimer);inactivityTimer=null;
      closeCloud({sleeping:false});
      if(activeHybridTurn?.fallbackTimer)clearTimeout(activeHybridTurn.fallbackTimer);
      stopMeter?.();
      try{source?.disconnect();}catch{} try{node?.disconnect();}catch{} try{processor?.disconnect();}catch{} try{silentGain?.disconnect();}catch{}
      for(const track of stream.getTracks())track.stop();
    }
  };
  const initial=await connectCloud({reason:'initial'});
  if(!initial&&!closed){scribe.disconnect();scribe=null;throw new Error('AssemblyAI 连接失败');}
  setStatus('');
}

async function startSTT(){
  if(!providersLoaded)await loadSttProviders();
  const select=$('stt-provider');
  const provider=select?.value||'scribe';
  try{localStorage.setItem('companion-voice-runtime.stt-provider',provider);}catch{}
  if(provider==='assemblyai')return startAssemblyAI();
  return startScribe();
}

async function reconnectMicrophone({force=false,quiet=false}={}){
  if(!callId||$('phone').dataset.phase!=='active'){
    if(!quiet)room.toast('接通电话后才能重新打开麦克风。');
    return false;
  }
  if(muted&&!force){if(!quiet)room.toast('现在是静音状态，先取消静音就好。');return false;}
  if(micReconnectPromise)return micReconnectPromise;
  if(!force&&scribe&&!scribe.needsReconnect?.())return false;
  const button=$('reconnect-mic');
  micReconnectPromise=(async()=>{
    if(button){button.disabled=true;button.textContent='正在重新连接…';}
    try{
      const previous=scribe;scribe=null;
      try{previous?.disconnect?.();}catch{}
      tencentStt=null;voiceStartedAt=0;resetBodyHearing();resetVoiceToneTurn();
      activateAudio();await audioCtx?.resume?.();
      await startSTT();
      setMutedState(false);await syncCallPresence();setStatus('');
      if(!quiet)room.toast('麦克风重新连上了。');
      return true;
    }catch(error){
      audioNote('Microphone reconnect: '+String(error?.message||error));
      setStatus('麦克风没有重新连上，可以再点一次重连。');
      if(!quiet)room.toast('麦克风还没重新连上。');
      return false;
    }finally{
      if(button){button.disabled=false;button.textContent='重新连接麦克风';}
      micReconnectPromise=null;
    }
  })();
  return micReconnectPromise;
}

function setMutedState(value){
  muted=!!value;scribe?.setMuted?.(muted);if(muted){resetBodyHearing();resetVoiceToneTurn();}$('mute').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM6 10v1a6 6 0 0 0 12 0v-1M12 17v4M9 21h6"/>'+(muted?'<path d="m3 3 18 18"/>':'')+'</svg><span>'+(muted?'取消静音':'静音')+'</span>';
  $('mute').setAttribute('aria-pressed',String(muted));$('phone').classList.toggle('is-muted',muted);syncCallPresence();
}
async function sendTypedTurn(){
  if(!callId)return;
  const input=$('typed-input'),button=$('typed-send'),text=String(input?.value||'').trim();
  if(!text)return;
  input.disabled=true;button.disabled=true;pendingTypedText=text;
  try{
    stopAudio();
    await api('/api/calls/'+callId+'/text',{text});
    input.value='';setStatus('正在想…');
  }catch(error){pendingTypedText='';setStatus('发送失败：'+String(error?.message||error));}
  finally{if(callId){input.disabled=false;button.disabled=false;input.focus();}}
}
$('typed-form')?.addEventListener('submit',event=>{event.preventDefault();sendTypedTurn();});
$('unlock').onclick=async()=>{
  try{await api('/api/auth',{token:$('token').value});$('token').value='';showPhone();}
  catch{$('loginError').textContent='口令不正确';}
};
function applyIncomingVoice(call){
  currentCallPlaybackRate=call?.ttsModel==='eleven_v4_turbo'?(v4PlaybackRates[call.ttsTone]||1):1;
  if($('tts-model')&&call?.ttsModel)$('tts-model').value=call.ttsModel;
}
async function fetchIncomingCall(value){
  let lastError=null;
  for(let attempt=0;attempt<6;attempt++){
    try{return await api('/api/calls/'+value,{},'GET');}
    catch(error){
      lastError=error;
      if(String(error?.message||error).includes('authentication'))throw error;
      if(attempt<5)await sleep(Math.min(900,180+attempt*160));
    }
  }
  throw lastError||new Error('incoming_call_unavailable');
}
function ackIncoming(value,state='ready'){
  if(window.parent!==window)window.parent.postMessage({type:'companion-incoming-consumed',callId:value,state},location.origin);
}
async function prepareIncomingCall(id){
  const value=String(id||'').trim();if(!/^[0-9a-f-]{36}$/i.test(value))return false;
  pendingIncomingId=value;
  if(callId===value&&$('phone').dataset.phase==='incoming'){ackIncoming(value);return true;}
  if(incomingLoadPromise)return incomingLoadPromise;
  incomingLoadPromise=(async()=>{
    const data=await fetchIncomingCall(value),call=data.call;
    if(!call||call.direction!=='incoming')throw new Error('not_an_incoming_call');
    if(call.state!=='RINGING'){
      pendingIncomingId=null;ackIncoming(value,call.state);room.foyer();setStatus(call.state==='ENDED'?'刚刚错过了老公的来电。':'这通来电已经接通过了。');loadCallHistory().catch(()=>{});return false;
    }
    if(callId&&callId!==value){room.toast('已经有一通电话在这里了。');return false;}
    stopHistoryVoice();callId=value;pendingIncomingId=null;seenAudioSegments=new Set();turnHeardCues.clear();realSfxRecent=[];$('transcript').innerHTML='';applyIncomingVoice(call);subscribe();
    $('foyer-copy').textContent='来电';setStatus(call.ringReason||'老公想听听你的声音。');room.phase('incoming');ackIncoming(value);
    return true;
  })().catch(error=>{if(String(error?.message||error).includes('authentication'))pendingIncomingId=value;else{pendingIncomingId=value;setStatus('来电连接有点慢，正在等老公这边…');}return false;}).finally(()=>{incomingLoadPromise=null;});
  return incomingLoadPromise;
}
async function acceptIncomingCall(){
  if(!callId||$('phone').dataset.phase!=='incoming'||dialing)return;dialing=true;room.haptic();
  try{
    activateAudio();if(bodyHearingEnabled)ensureBodyHearingWorker().catch(()=>{});if(voiceToneEnabled)ensureVoiceToneWorker().catch(()=>{});if(selectedBinauralMode()==='ku100-right25')loadBinauralHrir().catch(()=>{});
    await loadSttProviders().catch(()=>{});
    const answered=await api('/api/calls/'+callId+'/answer',{});
    if(answered.call?.state!=='LISTENING')throw new Error('incoming_call_expired');
    await startSTT();startedAt=Date.parse(answered.call.startedAt)||Date.now();
    clearInterval(timer);timer=setInterval(()=>{const sec=Math.max(0,Math.floor((Date.now()-startedAt)/1000));$('timer').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');},1000);
    room.phase('active');setStatus('已接通');callSurfaceVisible=true;syncCallPresence();
    // Incoming calls are Companion's initiative: once audio + STT are genuinely
    // ready, explicitly hand him the opening instead of waiting for User.
    api('/api/calls/'+callId+'/opening',{}).catch(()=>{});
    setTimeout(()=>{if(callId&&$('status').textContent==='已接通')setStatus('');},1400);
    $('call').disabled=true;$('stt-provider').disabled=true;$('tts-model').disabled=true;$('tts-tone').disabled=true;$('tts-preview').disabled=true;$('typed-input').disabled=false;$('typed-send').disabled=false;
    setTimeout(()=>{if(callId)loadCachedRealSfx().catch(()=>{});},500);
  }catch(error){
    audioNote(String(error?.message||error));eventStream?.close();eventStream=null;callId=null;room.foyer();setStatus(String(error?.message||'').includes('expired')?'刚刚错过了老公的来电。':'这次没有接起来。');
  }finally{dialing=false;}
}
async function declineIncomingCall(){
  if(!callId||$('phone').dataset.phase!=='incoming'||ending)return;ending=true;const id=callId;room.haptic();eventStream?.close();eventStream=null;callId=null;
  try{await api('/api/calls/'+id+'/hangup',{reason:'declined_call'});}catch{}
  room.foyer();setStatus('这通电话没有接。');ending=false;loadCallHistory().catch(()=>{});
}
$('incoming-accept')?.addEventListener('click',acceptIncomingCall);
$('incoming-decline')?.addEventListener('click',declineIncomingCall);
$('call').onclick=async()=>{
  if(callId||dialing||ending)return;dialing=true;stopHistoryVoice();$('call').disabled=true;room.haptic();room.phase('calling');setStatus('正在呼叫 Companion…');
  // Do this before the first await while the user gesture is still active.
  try{activateAudio();if(bodyHearingEnabled)ensureBodyHearingWorker().catch(()=>{});if(voiceToneEnabled)ensureVoiceToneWorker().catch(()=>{});}catch(error){dialing=false;$('call').disabled=false;room.foyer();setStatus('声音还没准备好，请再试一次。');return;}
  try{
    const ttsModel=$('tts-model').value,ttsTone=selectedTone(new Date());
    if(selectedBinauralMode()==='ku100-right25')loadBinauralHrir().catch(()=>{});
    currentCallPlaybackRate=ttsModel==='eleven_v4_turbo'?(v4PlaybackRates[ttsTone]||1):1;
    try{
      localStorage.setItem('companion-voice-runtime.tts-model',ttsModel);
      localStorage.setItem('companion-voice-runtime.tts-tone-mode',$('tts-tone').value);
      localStorage.setItem('companion-voice-runtime.tts-tone',ttsTone);
      localStorage.setItem('companion-voice-runtime.binaural-mode',selectedBinauralMode());
    }catch{}
    audioNote(ttsModel==='eleven_v4_turbo'&&$('tts-tone').value==='auto'?
      'Scheduled voice locked for this call: '+(ttsTone==='deep_night'?'Night':'Day'):'正在使用选定的声线配置');
    const out=await api('/api/calls',{direction:'outgoing',ttsModel,ttsTone});seenAudioSegments=new Set();turnHeardCues.clear();realSfxRecent=[];callId=out.call.id;$('transcript').innerHTML='';subscribe();
    await Promise.all([api('/api/calls/'+callId+'/answer',{}),startSTT()]);startedAt=Date.now();
    timer=setInterval(()=>{const s=Math.floor((Date.now()-startedAt)/1000);$('timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');},1000);
    room.phase('active');room.haptic();setStatus('已接通');callSurfaceVisible=true;syncCallPresence();setTimeout(()=>{if(callId&&$('status').textContent==='已接通')setStatus('');},1600);$('call').disabled=true;$('stt-provider').disabled=true;$('tts-model').disabled=true;$('tts-tone').disabled=true;$('tts-preview').disabled=true;$('typed-input').disabled=false;$('typed-send').disabled=false;
    setTimeout(()=>{if(callId)loadCachedRealSfx().catch(()=>{});},650);
  }catch(error){audioNote(String(error.message||error));await finishCall({failed:true});setStatus('这次没能接通，稍后再试试。');}
  finally{dialing=false;if(!callId)$('call').disabled=false;}
};
$('mute').onclick=()=>{if(!callId)return;setMutedState(!muted);room.haptic();room.toast(muted?'麦克风已静音':'我听得到你了');};
$('reconnect-mic')?.addEventListener('click',()=>{room.haptic();reconnectMicrophone({force:true,quiet:false});});
async function finishCall({failed=false}={}){
  if(ending)return;ending=true;
  const id=callId;room.phase('ending');setStatus('和 Companion 的通话结束了');
  callId=null;scribe?.disconnect?.();scribe=null;eventStream?.close();eventStream=null;
  stopAudio();clearInterval(timer);currentCallPlaybackRate=1;seenAudioSegments=new Set();turnHeardCues.clear();realSfxRecent=[];resetBodyHearing();resetVoiceToneTurn();setMutedState(false);
  $('typed-input').disabled=true;$('typed-send').disabled=true;$('typed-input').value='';
  let saved=true;
  if(id)try{await api('/api/calls/'+id+'/hangup',{reason:failed?'connection_failed':'user_hangup'});}catch{saved=false;room.toast('通话已在本机停止，结束记录尚未同步。');}
  if(!failed)await sleep(1100);
  for(const key of ['call','stt-provider','tts-model','tts-tone','tts-preview'])$(key).disabled=false;
  room.foyer();$('timer').textContent='00:00';setStatus(saved?'':'结束记录尚未同步，请稍后检查最近通话。');
  ending=false;await loadCallHistory().catch(()=>{});updateVoiceScheduleNote();
}
$('hangup').onclick=async()=>{if(!callId||ending)return;room.haptic();$('hangup').disabled=true;try{await finishCall();}finally{$('hangup').disabled=false;}};
async function leaveRoom(){
  if(dialing||ending)return;
  if(callId&&await room.ask('leave-sheet')!=='leave')return;
  stopHistoryVoice();
  if(window.self!==window.top)window.parent.postMessage({type:'mind-call-exit',active:!!callId},location.origin);
  else if(callId)room.toast('独立页面通话期间请保持此页打开。');else location.assign('/');
}
$('call-exit').addEventListener('click',leaveRoom);
if(window.self!==window.top){
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent)return;
    if(event.data?.type==='companion-voice-safe-area'){for(const key of ['top','bottom']){const value=Number(event.data[key]);if(Number.isFinite(value)&&value>=0&&value<=150)document.documentElement.style.setProperty('--safe-'+key,value+'px');}}
    if(event.data?.type==='companion-voice-back'){
      if(!$('history-detail').classList.contains('hidden'))closeHistoryDetail();else leaveRoom();
    }
    if(event.data?.type==='companion-voice-visible'){
      const awayFor=Date.now()-lastCallSurfaceHiddenAt;callSurfaceVisible=true;
      if(callId){audioCtx?.resume().catch(()=>{});syncCallPresence();if(!muted&&(scribe?.needsReconnect?.()||(awayFor>1400&&!scribe?.isSleeping?.())))setTimeout(()=>reconnectMicrophone({force:true,quiet:true}),120);}
    }
    if(event.data?.type==='companion-voice-hidden'){callSurfaceVisible=false;if(callId)lastCallSurfaceHiddenAt=Date.now();syncCallPresence();}
    if(event.data?.type==='companion-incoming-call'&&/^[0-9a-f-]{36}$/i.test(String(event.data.callId||''))){pendingIncomingId=String(event.data.callId);prepareIncomingCall(pendingIncomingId).catch(()=>{});}
  });
}
window.addEventListener('beforeunload',event=>{if(callId){event.preventDefault();event.returnValue='';}});
document.addEventListener('pointerdown',()=>{if(callId&&audioCtx?.state==='suspended')audioCtx.resume().catch(()=>{});});
if(window.self!==window.top)showPhone();
api('/api/session',{},'GET').then(showPhone).catch(showLogin);
