const ACTIVE_REPAIR_STATES=new Set(['WAITING_MODEL','WAITING_TTS','ASSISTANT_SPEAKING','INTERRUPTING']);
const CORRECTION_RE=/^(?:不是|不对|我是说|我的意思是|刚刚是|应该是|其实是|补充|还有|漏了|更正|打错|识别错|你听错|就是|是说|以及|对了还有|i mean|no[ ,]|actually\b)/i;

export function isVoiceReason(reason=''){
  return reason==='provider_end_of_turn'||reason==='silence_timeout'||reason==='semantic_completion';
}

export function shouldRepairTyped({lastVoiceInput,now=Date.now(),state='',text=''}={}){
  if(!lastVoiceInput||!String(text||'').trim())return false;
  const age=now-Number(lastVoiceInput.at||0);
  if(!Number.isFinite(age)||age<0||age>12000)return false;
  if(ACTIVE_REPAIR_STATES.has(String(state||'')))return true;
  return age<=6000&&CORRECTION_RE.test(String(text||'').trim());
}

export function mergeRepairText(voiceText='',typedText=''){
  const voice=String(voiceText||'').trim(),typed=String(typedText||'').trim();
  if(!voice)return typed;if(!typed)return voice;
  if(voice===typed||voice.endsWith(typed))return voice;
  return voice+'\n'+typed;
}

export function repairContext({voiceText='',typedText='',mergedText=''}={}){
  return '<call_context>User 刚才的语音转写可能不完整或有识别错误。她现在立即打字，是在修正或补充刚才同一个用户回合，不是开启第二个独立话题。'+
    '刚才的语音转写是：'+String(voiceText||'').slice(0,500)+'。'+
    '她刚打字补充/修正的是：'+String(typedText||'').slice(0,500)+'。'+
    '把她真正想表达的完整回合理解为：'+String(mergedText||typedText||voiceText).slice(0,900)+'。'+
    '如果两者冲突，以她亲手打出的文字为准。忽略你刚才基于错误转写产生的未完成解释，只针对修正后的完整意思回答一次。不要主动提识别错误、repair、turn 或系统机制。</call_context>';
}
