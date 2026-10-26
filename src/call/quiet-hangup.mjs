// Model requests are advisory. Only this server-side guard authorizes an end.
export class QuietHangup {
 constructor({idleMs=300000,graceMs=60000,now=Date.now()}={}){
  this.idleMs=idleMs;this.graceMs=graceMs;this.heartbeatAt=0;this.healthy=false;this.enabled=false;
  this.suppressUntilActivity=false;this.decisionNotBefore=0;this.activity(now);
 }
 activity(now=Date.now()){
  this.lastActivityAt=now;this.revision=(this.revision||0)+1;this.phase='idle';this.deadline=0;this.warningTurn=null;
 }
 userActivity(now=Date.now()){
  this.suppressUntilActivity=false;this.decisionNotBefore=0;this.activity(now);
 }
 defer({minutes=30,untilActivity=false}={},now=Date.now()){
  this.revision=(this.revision||0)+1;this.phase='idle';this.deadline=0;this.warningTurn=null;
  if(untilActivity){this.suppressUntilActivity=true;this.decisionNotBefore=0;return;}
  this.suppressUntilActivity=false;
  const bounded=Math.max(10,Math.min(180,Number(minutes)||30));
  this.decisionNotBefore=now+bounded*60*1000;
 }
 presence({enabled,healthy,visible,muted,engaged},now=Date.now()){
  this.enabled=!!enabled;this.healthy=!!healthy&&!!visible&&!muted;this.heartbeatAt=now;
  if(!this.enabled||!this.healthy)this.activity(now);
  else if(engaged)this.userActivity(now);
 }
 available(now=Date.now()){return this.enabled&&this.healthy&&now-this.heartbeatAt<25000;}
 canAsk(now=Date.now()){
  return this.available(now)&&!this.suppressUntilActivity&&now>=this.decisionNotBefore&&this.phase==='idle'&&now-this.lastActivityAt>=this.idleMs;
 }
 begin(now=Date.now()){if(!this.canAsk(now))return null;this.phase='deciding';return this.revision;}
 accept(revision,turnId,now=Date.now()){if(revision!==this.revision||!this.available(now)||this.phase!=='deciding')return false;this.phase='warning';this.warningTurn=turnId;this.warningAt=now;return true;}
 playbackEnded(turnId,now=Date.now()){if(this.phase==='warning'&&turnId===this.warningTurn&&this.available(now)){this.phase='grace';this.deadline=now+this.graceMs;return true;}return false;}
 canEnd(now=Date.now()){return this.available(now)&&this.phase==='grace'&&now>=this.deadline;}
}
export function parseQuietDecision(text){
 try{
  const v=JSON.parse(String(text).trim());
  if(v.action==='stay_until_activity')return {action:'stay_until_activity'};
  if(v.action==='stay'){
   const minutes=Math.max(10,Math.min(180,Number(v.recheck_after_minutes)||30));
   return {action:'stay',recheckAfterMinutes:minutes};
  }
  if(v.action!=='end_after_silence')return null;
  const message=String(v.message||'').trim();
  return message&&message.length<=180?{action:v.action,message}:null;
 }catch{return null;}
}
