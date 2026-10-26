const DIGITS=Object.freeze({零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9});

function cnNumber(value){
  const text=String(value||'').trim();
  if(!text)return null;
  if(/^\d+$/.test(text))return Number(text);
  if(text==='十')return 10;
  if(text.includes('十')){
    const [a,b]=text.split('十');
    const tens=a?DIGITS[a]:1,ones=b?DIGITS[b]:0;
    return Number.isFinite(tens)&&Number.isFinite(ones)?tens*10+ones:null;
  }
  if(text.length===1&&Object.hasOwn(DIGITS,text))return DIGITS[text];
  return null;
}

function durationMinutes(text){
  const value=String(text||'').replace(/\s+/g,'');
  if(/半个?小时/.test(value)&&!/([\d一二两三四五六七八九十]+)个?半小时/.test(value))return 30;
  let total=0,matched=false;
  const hourHalf=value.match(/([\d一二两三四五六七八九十]+)(?:个半小时|小时半)/);
  if(hourHalf){
    const hours=cnNumber(hourHalf[1]);if(hours!==null){total+=hours*60+30;matched=true;}
  }else{
    const hour=value.match(/([\d一二两三四五六七八九十]+)个?(?:小时|钟头)/);
    if(hour){const hours=cnNumber(hour[1]);if(hours!==null){total+=hours*60;matched=true;}}
  }
  const minute=value.match(/([\d一二两三四五六七八九十]+)(?:分钟|分)(?:钟)?/);
  if(minute){const minutes=cnNumber(minute[1]);if(minutes!==null){total+=minutes;matched=true;}}
  return matched?total:null;
}

function hkClock(now){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Hong_Kong',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'
  }).formatToParts(new Date(now)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {hour:Number(parts.hour)%24,minute:Number(parts.minute),second:Number(parts.second)};
}

function absoluteWakeAt(text,now){
  const value=String(text||'').replace(/\s+/g,'');
  const m=value.match(/(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上)?([\d一二两三四五六七八九十]+)点(?:(半)|([\d一二两三四五六七八九十]+)分?)?/);
  if(!m)return null;
  let hour=cnNumber(m[2]);if(hour===null||hour>23)return null;
  const minute=m[3]?30:(m[4]?cnNumber(m[4]):0);
  if(minute===null||minute>59)return null;
  const part=m[1]||'';
  if(/下午|傍晚|晚上/.test(part)&&hour<12)hour+=12;
  if(/凌晨/.test(part)&&hour===12)hour=0;
  if(/早上|早晨|上午/.test(part)&&hour===12)hour=0;
  if(part==='中午'&&hour<11)hour+=12;
  const current=hkClock(now);
  let delta=(hour*60+minute)-(current.hour*60+current.minute)-current.second/60;
  if(delta<=0)delta+=24*60;
  return now+Math.round(delta*60000);
}

export function parseNapCommand(text,{now=Date.now(),active=false}={}){
  const raw=String(text||'').trim();
  const compact=raw.replace(/[，。！？!?、,.\s]/g,'');
  if(!compact)return null;

  if(/(?:取消|关掉|不要|不用).{0,6}(?:闹钟|叫醒|叫我)|(?:不睡了|我醒了|已经醒了|醒啦|醒了|我起来了|起来了|我起了|马上起|这就起)/.test(compact)){
    return active?{action:'cancel'}:null;
  }

  const minutes=durationMinutes(compact);
  const snooze=/(?:再睡|再让我睡|再眯|延后|推迟|晚一点|多睡)/.test(compact);
  if(active&&snooze&&minutes!==null&&minutes>=1&&minutes<=1440){
    return {action:'snooze',minutes,wakeAt:now+minutes*60000};
  }

  const wakeIntent=/(?:叫我|叫醒我|喊我|提醒我|闹钟|叫我起床|喊我起床|让我睡|睡.{0,8}(?:后|再)|小睡|眯.{0,6}(?:后|一会))/.test(compact);
  if(!wakeIntent)return null;

  if(minutes!==null&&minutes>=1&&minutes<=1440){
    return {action:'set',minutes,wakeAt:now+minutes*60000};
  }

  const wakeAt=absoluteWakeAt(compact,now);
  if(wakeAt!==null&&wakeAt-now>=30000&&wakeAt-now<=24*60*60*1000){
    return {action:'set',minutes:Math.max(1,Math.round((wakeAt-now)/60000)),wakeAt};
  }
  return null;
}

export function napAlarmPublic(value){
  if(!value?.active)return null;
  return {
    active:true,
    phase:String(value.phase||'sleeping'),
    wakeAt:String(value.wakeAt||''),
    createdAt:String(value.createdAt||''),
    sourceText:String(value.sourceText||'').slice(0,240),
    wakeTurnId:Number(value.wakeTurnId)||null
  };
}