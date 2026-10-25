export function hasCjk(text=''){
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(String(text||''));
}

export function normalizeTranscript(text=''){
  return String(text||'').replace(/\s+/g,' ').trim();
}

export function chooseHybridTranscript({assemblyText='',tencentText='',tencentCompleted=false}={}){
  const assembly=normalizeTranscript(assemblyText);
  const tencent=normalizeTranscript(tencentText);
  if(!assembly)return tencent?{text:tencent,provider:'tencent'}:{text:'',provider:null};
  if(!hasCjk(assembly))return {text:assembly,provider:'assemblyai'};
  if(!tencent||!hasCjk(tencent))return {text:assembly,provider:'assemblyai'};
  const aLen=Array.from(assembly).length,tLen=Array.from(tencent).length;
  const completeEnough=tencentCompleted||aLen<=8||tLen>=Math.max(1,Math.floor(aLen*0.65));
  return completeEnough?{text:tencent,provider:'tencent'}:{text:assembly,provider:'assemblyai'};
}
