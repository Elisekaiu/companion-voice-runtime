export function recentWakeContext(call){
  return (call?.transcript||[]).filter(item=>(item?.speaker==='user'||item?.speaker==='assistant')&&String(item?.text||'').trim()).slice(-12).map(item=>(item.speaker==='user'?'User':'Companion')+': '+String(item.text).replace(/\s+/g,' ').slice(0,280)).join('\n').slice(-3000);
}

import {defaultWakePolicy,parseWakePolicy,parseWakeDecision,fallbackWakeDecision} from './wake-negotiation.mjs';

export function makeWakePolicyPrompt(call,alarm){
  const recent=recentWakeContext(call);
  const fallback=defaultWakePolicy(alarm?.sourceText,recent);
  const prompt='<call_context>这是一个只用于到点后该多坚定地叫醒的控制判断，不是用户的新发言。请根据设置闹钟的原话和近期上下文判断这次赖床可以有多大弹性。不要做医疗判断，也不要制造不存在的紧急事项。\n\n闹钟原话：'+String(alarm?.sourceText||'').slice(0,300)+'\n\n近期通话：\n'+(recent||'(无)')+'\n\n只返回 JSON：urgency 只能是 flexible、normal 或 strict；max_snooze_minutes 为 0 到 60；reminder_interval_seconds 为 20 到 90；max_reminders 为 1 到 4。明确有考试、上班、面试、航班、预约、截止时间、不能迟到、或用户明确要求别让我赖床等约束时可用 strict；普通小睡通常 flexible 或 normal。</call_context>';
  return {prompt,fallback};
}

export function applyWakePolicy(raw,fallback){return parseWakePolicy(raw,fallback);}

export function makeSnoozeDecisionPrompt(call,wake,minutes){
  return '<call_context>这是叫醒后的赖床协商控制，不是普通闲聊。用户刚刚要求再睡 '+minutes+' 分钟。你要结合原闹钟理由、近期上下文和已有 policy 决定是否允许。不要为了扮演强势而凭空制造紧急性，也不要在明确有考试、上班、航班、预约、截止时间或用户此前明确要求别让我赖床时轻易放行。\n\n原闹钟：'+String(wake?.alarmSource||'').slice(0,300)+'\n当前 policy：'+JSON.stringify(wake?.policy||{})+'\n近期通话：\n'+recentWakeContext(call)+'\n\n只返回 JSON：action 只能是 allow_snooze 或 insist。allow_snooze 还要给 minutes 和一句自然答应继续睡的话 message；insist 要给一句明确但自然地催起来的话 message，以及 20 到 90 秒的 recheck_after_seconds。不要提 policy、系统、JSON、timer 或 STT。</call_context>';
}

export function decideSnooze(raw,{minutes,policy}){
  return parseWakeDecision(raw,{requestedMinutes:minutes,policy})||fallbackWakeDecision({requestedMinutes:minutes,policy});
}