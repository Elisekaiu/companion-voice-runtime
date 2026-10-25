import { localClock } from './voice-schedule.js';
import { ensureProviderUsageSection } from './provider-usage-ui.js';
export function createRoom({api,isActive}) {
  const $=id=>document.getElementById(id);
  let toastTimer,frame=0,assistantMeter=null,userMeter=null,voice=0,user=0;
  const meters=new WeakMap();
  const haptic=()=>{try{navigator.vibrate?.(12);}catch{}};
  function toast(text){clearTimeout(toastTimer);$('room-toast').textContent=text;$('room-toast').classList.add('visible');toastTimer=setTimeout(()=>$('room-toast').classList.remove('visible'),2600);}
  function phase(name){$('phone').dataset.phase=name;window.parent!==window&&window.parent.postMessage({type:'companion-voice-state',active:name==='incoming'||name==='calling'||name==='active'||name==='ending'},location.origin);}
  function foyer(){const h=localClock().hour;$('foyer-copy').textContent=h>=22||h<8?'Quiet hours. Start whenever you like.':'Ready when you are.';phase('foyer');}
  function ask(id){const dialog=$(id);if(dialog.open)return Promise.resolve(false);return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});dialog.returnValue='cancel';dialog.showModal();});}
  function measure(node,kind){const meter=node.context.createAnalyser();meter.fftSize=256;node.connect(meter);meters.set(meter,new Float32Array(256));if(kind==='assistant')assistantMeter=meter;else userMeter=meter;return ()=>{try{node.disconnect(meter);meter.disconnect();}catch{}if(assistantMeter===meter)assistantMeter=null;if(userMeter===meter)userMeter=null;};}
  function rms(meter){if(!meter)return 0;const data=meters.get(meter);meter.getFloatTimeDomainData(data);return Math.min(1,Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length)*5);}
  function animate(){voice=voice*.92+rms(assistantMeter)*.08;user=user*.94+rms(userMeter)*.06;$('voice-aura').style.setProperty('--voice',voice.toFixed(3));$('voice-aura').style.setProperty('--user',user.toFixed(3));frame=requestAnimationFrame(animate);}
  animate();
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);if(!document.hidden){animate();if(isActive())toast('回来了。若声音暂停，请轻点通话区域。');}});
  function viewport(){const height=window.visualViewport?.height||window.innerHeight;document.documentElement.style.setProperty('--room-height',height+'px');}
  window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);viewport();
  function usageWindowLabel(window){
    const mins=Number(window?.window_duration_mins);
    if(mins===300)return '5-Hour';
    if(mins===10080)return 'Weekly';
    if(Number.isFinite(mins)&&mins>0)return mins>=1440?Math.round(mins/1440)+'-Day':Math.round(mins/60)+'-Hour';
    return 'Usage';
  }
  let roomUsageCodex='Codex —',roomUsageEleven='';
  function syncRoomUsageSummary(){const el=$('usage-room-summary');if(el)el.textContent=[roomUsageCodex,roomUsageEleven].filter(Boolean).join(' · ');}
  function compactCredits(value){const n=Math.max(0,Number(value)||0);return n>=1000?(n/1000).toFixed(1).replace(/\.0$/,'')+'k':Math.round(n).toLocaleString();}
  function renderUsage(usage){
    const detail=$('usage-detail');
    if(!usage?.available){$('usage-label').textContent='Unavailable';roomUsageCodex='Codex unavailable';syncRoomUsageSummary();detail.innerHTML='<div class="usage-loading">Unavailable</div>';return;}
    const bucket=(usage.buckets||[]).find(x=>x.id==='codex'||x.limit_id==='codex')||(usage.buckets||[])[0];
    if(!bucket){$('usage-label').textContent='Unavailable';roomUsageCodex='Codex unavailable';syncRoomUsageSummary();detail.innerHTML='<div class="usage-loading">Unavailable</div>';return;}
    const windows=[bucket.primary,bucket.secondary].filter(Boolean);
    const roomWindow=windows.find(w=>usageWindowLabel(w)==='Weekly')||windows[0];
    if(roomWindow){const remaining=Math.max(0,Math.min(100,Number(roomWindow.remaining_percent)||0)),name=usageWindowLabel(roomWindow);roomUsageCodex='Codex '+(name==='Weekly'?'Week':name==='5-Hour'?'5h':name)+' '+remaining+'%';syncRoomUsageSummary();}
    const short=[];detail.replaceChildren();
    for(const w of windows){
      const remaining=Math.max(0,Math.min(100,Number(w.remaining_percent)||0)),name=usageWindowLabel(w);
      short.push((name==='5-Hour'?'5h':name==='Weekly'?'Week':name)+' '+remaining+'%');
      const row=document.createElement('div');row.className='usage-meter';
      const head=document.createElement('div');head.className='usage-meter-head';
      const label=document.createElement('span');label.className='usage-meter-label';label.textContent=name;
      const value=document.createElement('span');value.className='usage-meter-value';value.textContent=remaining+'% left';
      const track=document.createElement('div');track.className='usage-meter-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label',name+' usage remaining');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(remaining));
      const fill=document.createElement('i');fill.className='usage-meter-fill';fill.style.width=remaining+'%';track.append(fill);head.append(label,value);row.append(head,track);detail.append(row);
    }
    $('usage-label').textContent=short.join(' · ')||'Available';
  }
  function formatProviderSeconds(seconds){
    const value=Math.max(0,Number(seconds)||0);
    if(value<60)return Math.round(value)+'s';
    const hours=Math.floor(value/3600),minutes=Math.floor((value%3600)/60);
    return hours?hours+'h '+minutes+'m':minutes+'m';
  }
  function renderProviderUsage(data){
    const eleven=data?.elevenlabs||{},assembly=data?.assemblyai||{},tencent=data?.tencent||{};
    const elevenSetup=$('usage-eleven-setup'),elevenBar=$('usage-eleven-bar');
    if(eleven.available){
      const remaining=Math.max(0,Number(eleven.remaining)||0),limit=Math.max(0,Number(eleven.limit)||0),used=Math.max(0,Number(eleven.used)||0);
      const remainingPct=limit?Math.max(0,Math.min(100,remaining/limit*100)):0;
      $('usage-eleven-main').textContent=remaining.toLocaleString()+' credits left';
      elevenBar.style.width=remainingPct+'%';
      const reset=eleven.resetAt?new Date(eleven.resetAt).toLocaleDateString([], {month:'short',day:'numeric'}):'reset unavailable';
      $('usage-eleven-note').textContent=used.toLocaleString()+' / '+limit.toLocaleString()+' used · '+reset;
      roomUsageEleven='ElevenLabs '+compactCredits(remaining)+' left';syncRoomUsageSummary();
      elevenSetup.classList.add('hidden');
    }else{
      roomUsageEleven='ElevenLabs —';syncRoomUsageSummary();
      elevenBar.style.width='0%';
      $('usage-eleven-main').textContent=eleven.needsUserRead?'Permission needed':'Usage unavailable';
      $('usage-eleven-note').textContent=eleven.needsUserRead?'Add a backend-only ElevenLabs key with user_read permission.':'ElevenLabs usage could not be read.';
      elevenSetup.classList.toggle('hidden',!eleven.needsUserRead&&!['missing_key'].includes(eleven.reason));
    }
    const seconds=Math.max(0,Number(assembly.sessionSeconds)||0);
    $('usage-assembly-main').textContent=seconds?formatProviderSeconds(seconds)+' · ~$'+Number(assembly.estimatedUsd||0).toFixed(2):'Tracking starts next call';
    $('usage-assembly-note').textContent='This deployment · '+(assembly.model||'universal-3-6-pro')+' · ~$'+Number(assembly.rateUsdPerHour||0.45).toFixed(2)+'/h. Local session-duration estimate.';
    $('usage-tencent-main').textContent=tencent.trtcConfigured?'TRTC connected':'TRTC not connected';
    $('usage-tencent-note').textContent=tencent.trtcConfigured?'Speech works. Billing/package usage needs separate Tencent Cloud API credentials.':'Connect Tencent STT first; billing credentials are separate.';
  }
  let statusRefreshPromise=null,usagePollTimer=null;
  async function refreshStatus(){
    if(statusRefreshPromise)return statusRefreshPromise;
    statusRefreshPromise=(async()=>{
      const [statusResult,providerResult]=await Promise.allSettled([
        api('/api/status',{},'GET'),api('/api/provider-usage',{},'GET')
      ]);
      if(statusResult.status==='fulfilled'){
        const d=statusResult.value;$('runtime-status').textContent=[d.codexReady?'Codex connected':'Codex unavailable',d.model||'Model unavailable',d.effort||'Effort unavailable',d.shared?'Shared thread':'Shared connection unavailable',d.sttReady?'STT ready':'STT unavailable',d.ttsReady?'TTS ready':'TTS unavailable'].join(' · ');renderUsage(d.usage);
      }else{$('runtime-status').textContent='Status unavailable';$('usage-label').textContent='Unavailable';}
      let providerSection=document.querySelector('.provider-usage-section');
      if(providerResult.status==='fulfilled'){
        providerSection=providerSection||ensureProviderUsageSection({refresh:refreshStatus});
        if(providerSection){providerSection.classList.remove('hidden');renderProviderUsage(providerResult.value);}
      }else providerSection?.classList.add('hidden');
    })().finally(()=>{statusRefreshPromise=null;});
    return statusRefreshPromise;
  }
  function startUsagePolling(){
    clearInterval(usagePollTimer);refreshStatus();usagePollTimer=setInterval(()=>{if($('usage-sheet').open&&!document.hidden)refreshStatus();},60000);
  }
  function stopUsagePolling(){clearInterval(usagePollTimer);usagePollTimer=null;}
  $('room-more').onclick=()=>{$('settings-sheet').showModal();refreshStatus();};
  $('usage-room-open').onclick=()=>{$('settings-sheet').close();$('usage-sheet').showModal();startUsagePolling();};
  $('usage-open').onclick=()=>{$('usage-sheet').showModal();startUsagePolling();};
  if($('provider-usage-refresh'))$('provider-usage-refresh').onclick=()=>refreshStatus();
  $('usage-sheet').addEventListener('close',stopUsagePolling);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('usage-sheet').open)refreshStatus();});
  // Separate database: never migrate or clear the existing real-SFX asset cache.
  const dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('companion-voice-room',1);req.onupgradeneeded=()=>req.result.createObjectStore('media');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  dbPromise.catch(()=>{});
  async function media(key,value){const db=await dbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction('media',value===undefined?'readonly':'readwrite'),store=tx.objectStore('media');const req=value===undefined?store.get(key):value===null?store.delete(key):store.put(value,key);tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);});}
  const urls={};let selected='night';try{selected=localStorage.getItem('companion.voice.background')||'night';}catch{}
  function background(name){selected=name;document.body.dataset.background=name;$('room-background').style.backgroundImage=name==='custom'&&urls.background?'url("'+urls.background+'")':'';document.querySelectorAll('[data-background]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.background===name)));try{localStorage.setItem('companion.voice.background',name);}catch{}}
  function showMedia(key,blob){if(urls[key])URL.revokeObjectURL(urls[key]);urls[key]=blob?URL.createObjectURL(blob):null;if(key==='avatar'){const el=$('assistant-avatar');el.replaceChildren();if(blob){const img=new Image();img.alt='Companion';img.src=urls[key];el.append(img);}else el.textContent='C';}else background(selected);}
  document.querySelectorAll('[data-background]').forEach(b=>b.onclick=()=>background(b.dataset.background));
  for(const key of ['avatar','background']){
    media(key).then(blob=>{if(blob)showMedia(key,blob);}).catch(()=>{});
    $(key+'-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new Error('请选择 8 MB 以内的 JPG、PNG 或 WebP 图片');const probe=new Image(),url=URL.createObjectURL(file);try{probe.src=url;await probe.decode();}finally{URL.revokeObjectURL(url);}await media(key,file);if(key==='background')selected='custom';showMedia(key,file);toast('已经换好了');}catch(error){toast(error.message||'图片未能保存');}finally{e.target.value='';}};
  }
  $('avatar-reset').onclick=async()=>{try{await media('avatar',null);showMedia('avatar',null);}catch{toast('头像暂时无法更新');}};
  background(selected);foyer();
  for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close('cancel');}});
  return {haptic,toast,phase,foyer,ask,measure,refreshStatus};
}
