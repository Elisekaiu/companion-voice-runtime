function clampInt(value,min,max,fallback){
  const n=Math.round(Number(value));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

export function defaultWakePolicy(sourceText='',recentText=''){
  const text=(String(sourceText||'')+' '+String(recentText||'')).toLowerCase();
  const strict=/(考试|上课|上班|面试|会议|预约|航班|飞机|火车|高铁|deadline|截止|一定要|必须|不能迟到|别让我赖|不要让我赖|不许赖|一定叫醒|继续叫我)/i.test(text);
  if(strict)return {urgency:'strict',maxSnoozeMinutes:0,reminderIntervalSeconds:25,maxReminders:3};
  const flexible=/(午睡|小睡|眯一会|眯一下|补觉|休息一下|太困|困死|随便睡|没急事)/i.test(text);
  if(flexible)return {urgency:'flexible',maxSnoozeMinutes:20,reminderIntervalSeconds:45,maxReminders:1};
  return {urgency:'normal',maxSnoozeMinutes:10,reminderIntervalSeconds:35,maxReminders:2};
}

export function parseWakePolicy(raw,fallback=defaultWakePolicy()){
  let value=null;
  try{
    const text=String(raw||'').trim();
    const match=text.match(/\{[\s\S]*\}/);
    value=JSON.parse(match?match[0]:text);
  }catch{return fallback;}
  const proposedUrgency=['flexible','normal','strict'].includes(value?.urgency)?value.urgency:fallback.urgency;
  const hardStrict=fallback?.urgency==='strict';
  return {
    urgency:hardStrict?'strict':proposedUrgency,
    maxSnoozeMinutes:hardStrict?0:clampInt(value?.max_snooze_minutes,0,60,fallback.maxSnoozeMinutes),
    reminderIntervalSeconds:clampInt(value?.reminder_interval_seconds,20,90,fallback.reminderIntervalSeconds),
    maxReminders:clampInt(value?.max_reminders,1,4,fallback.maxReminders)
  };
}

export function parseWakeDecision(raw,{requestedMinutes=10,policy=defaultWakePolicy()}={}){
  let value=null;
  try{
    const text=String(raw||'').trim();
    const match=text.match(/\{[\s\S]*\}/);
    value=JSON.parse(match?match[0]:text);
  }catch{return null;}
  if(value?.action==='allow_snooze'){
    const minutes=clampInt(value.minutes,1,60,requestedMinutes);
    const max=Math.max(0,Number(policy?.maxSnoozeMinutes)||0);
    if(policy?.urgency==='strict'||!max||minutes>max)return null;
    return {action:'allow_snooze',minutes,message:String(value.message||'').trim().slice(0,240)};
  }
  if(value?.action==='insist'){
    return {
      action:'insist',
      message:String(value.message||'').trim().slice(0,240),
      recheckAfterSeconds:clampInt(value.recheck_after_seconds,20,90,Number(policy?.reminderIntervalSeconds)||35)
    };
  }
  return null;
}

export function fallbackWakeDecision({requestedMinutes=10,policy=defaultWakePolicy()}={}){
  const max=Math.max(0,Number(policy?.maxSnoozeMinutes)||0);
  if(policy?.urgency!=='strict'&&max>0&&requestedMinutes<=max){
    return {action:'allow_snooze',minutes:requestedMinutes,message:'好，再给你一点时间。睡吧，到点我再叫你。'};
  }
  return {action:'insist',message:'这次不能继续赖了，起来吧。',recheckAfterSeconds:Number(policy?.reminderIntervalSeconds)||35};
}

export function wakeSessionPublic(value){
  if(!value?.active)return null;
  return {
    active:true,
    phase:String(value.phase||'listening'),
    startedAt:String(value.startedAt||''),
    reminderCount:Math.max(0,Number(value.reminderCount)||0),
    maxReminders:Math.max(0,Number(value.policy?.maxReminders)||0),
    urgency:String(value.policy?.urgency||'normal')
  };
}