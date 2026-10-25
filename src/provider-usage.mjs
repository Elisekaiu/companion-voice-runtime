import fs from 'node:fs';
import path from 'node:path';

export function createProviderUsage({
  dataDir,
  elevenLabsApiKey='',
  elevenLabsUsageKeyFile='',
  assemblyAiRateUsdPerHour=0.45,
  tencentConfigured=()=>false
}={}){
  const usageFile=path.join(path.dirname(dataDir),'provider-usage.json');
  const rate=Math.max(0,Number(assemblyAiRateUsdPerHour)||0.45);

  function readLedger(){
    try{
      const value=JSON.parse(fs.readFileSync(usageFile,'utf8'));
      return value&&Array.isArray(value.sessions)?value:{sessions:[]};
    }catch{return {sessions:[]};}
  }
  function writeLedger(value){
    fs.mkdirSync(path.dirname(usageFile),{recursive:true});
    const tmp=usageFile+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600});
    try{fs.chmodSync(tmp,0o600);}catch{}
    fs.renameSync(tmp,usageFile);
  }
  function record({provider,sessionId,sessionDurationSeconds,audioDurationSeconds,callId}={}){
    const p=String(provider||'').toLowerCase(),id=String(sessionId||'').trim();
    const seconds=Math.max(0,Math.min(10800,Number(sessionDurationSeconds)||0));
    if(p!=='assemblyai'||!id||!seconds)return false;
    const ledger=readLedger();
    if(ledger.sessions.some(x=>x.provider===p&&x.sessionId===id))return false;
    ledger.sessions.push({
      provider:p,sessionId:id,callId:String(callId||''),
      sessionDurationSeconds:seconds,
      audioDurationSeconds:Math.max(0,Math.min(10800,Number(audioDurationSeconds)||0)),
      at:new Date().toISOString()
    });
    if(ledger.sessions.length>5000)ledger.sessions=ledger.sessions.slice(-5000);
    writeLedger(ledger);
    return true;
  }
  function assemblyAi(){
    const sessions=readLedger().sessions.filter(x=>x.provider==='assemblyai');
    const seconds=sessions.reduce((sum,x)=>sum+(Number(x.sessionDurationSeconds)||0),0);
    return {
      available:true,kind:'local',trackedSince:sessions[0]?.at||null,sessions:sessions.length,
      sessionSeconds:Math.round(seconds),
      estimatedUsd:Number((seconds/3600*rate).toFixed(4)),
      rateUsdPerHour:rate,
      model:'universal-3-6-pro',
      note:'Local session-duration estimate for this deployment; not an AssemblyAI account balance.'
    };
  }
  function usageKey(){
    try{
      const key=elevenLabsUsageKeyFile?fs.readFileSync(elevenLabsUsageKeyFile,'utf8').trim():'';
      if(key)return key;
    }catch{}
    return String(elevenLabsApiKey||'').trim();
  }
  async function elevenLabs(){
    const key=usageKey();
    if(!key)return {available:false,kind:'exact',configured:false,reason:'missing_key'};
    try{
      const response=await fetch('https://api.elevenlabs.io/v1/user/subscription',{
        headers:{'xi-api-key':key},signal:AbortSignal.timeout(8000)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        const detail=data?.detail||{};
        const needsUserRead=detail?.status==='missing_permissions'||/permission/i.test(String(detail?.message||''));
        return {available:false,kind:'exact',configured:true,needsUserRead,status:response.status,reason:needsUserRead?'user_read_required':'provider_error'};
      }
      const used=Math.max(0,Number(data.character_count)||0),limit=Math.max(0,Number(data.character_limit)||0);
      return {
        available:true,kind:'exact',configured:true,
        tier:String(data.tier||''),status:String(data.status||''),
        used,limit,remaining:Math.max(0,limit-used),
        percent:limit?Math.max(0,Math.min(100,used/limit*100)):null,
        resetAt:data.next_character_count_reset_unix?new Date(Number(data.next_character_count_reset_unix)*1000).toISOString():null
      };
    }catch(error){
      return {available:false,kind:'exact',configured:true,reason:'network_error',error:String(error?.message||error)};
    }
  }
  async function summary(){
    return {
      updatedAt:new Date().toISOString(),
      elevenlabs:await elevenLabs(),
      assemblyai:assemblyAi(),
      tencent:{
        available:false,kind:'provider',trtcConfigured:!!tencentConfigured(),
        reason:'cloud_billing_credentials_required',
        note:'TRTC transcription credentials do not by themselves expose Tencent Cloud billing/package usage.'
      }
    };
  }
  return {record,summary};
}
