export const NIGHT_START_HOUR=22;
export const DAY_START_HOUR=8;

export function configuredTimeZone(){
  try{
    const value=globalThis.localStorage?.getItem('companion.voice.time-zone');
    return value?String(value).trim():null;
  }catch{return null;}
}

function zonedParts(at,timeZone){
  if(!timeZone)return {hour:at.getHours(),minute:at.getMinutes()};
  try{
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(at);
    const hour=Number(parts.find(x=>x.type==='hour')?.value);
    const minute=Number(parts.find(x=>x.type==='minute')?.value);
    if(Number.isFinite(hour)&&Number.isFinite(minute))return {hour,minute};
  }catch{}
  return {hour:at.getHours(),minute:at.getMinutes()};
}

export function localClock(at=new Date(),timeZone=configuredTimeZone()){
  const {hour,minute}=zonedParts(at,timeZone);
  return {
    hour,
    minute,
    timeZone:timeZone||null,
    display:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')
  };
}

export function resolveScheduledTone(at=new Date(),timeZone=configuredTimeZone()){
  const {hour}=localClock(at,timeZone);
  return hour>=NIGHT_START_HOUR||hour<DAY_START_HOUR?'deep_night':'deep_calm';
}

export function resolveToneSelection(model,mode,at=new Date(),timeZone=configuredTimeZone()){
  if(model!=='eleven_v4_turbo')return 'original';
  return mode==='auto'?resolveScheduledTone(at,timeZone):mode;
}
