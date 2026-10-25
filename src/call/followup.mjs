export const DEFAULT_FOLLOWUP_DELAYS_MS=Object.freeze([18000,35000]);

export class FollowupState {
  constructor({delays=DEFAULT_FOLLOWUP_DELAYS_MS}={}){
    this.delays=[...delays];
    this.count=0;
    this.clientVisible=true;
    this.clientMuted=false;
    this.lastActivityAt=Date.now();
  }
  resetByUser(now=Date.now()){
    this.count=0;
    this.lastActivityAt=now;
  }
  pause(now=Date.now()){
    this.lastActivityAt=now;
  }
  markPlaybackEnd(now=Date.now()){
    this.lastActivityAt=now;
  }
  nextDelayMs(){
    return Number.isFinite(this.delays[this.count])?this.delays[this.count]:null;
  }
  markTriggered(now=Date.now()){
    this.count+=1;
    this.lastActivityAt=now;
    return this.count;
  }
  setPresence({visible=this.clientVisible,muted=this.clientMuted}={},now=Date.now()){
    const resumed=(!this.clientVisible||this.clientMuted)&&!!visible&&!muted;
    this.clientVisible=!!visible;
    this.clientMuted=!!muted;
    if(!this.clientVisible||this.clientMuted||resumed)this.lastActivityAt=now;
    return {resumed,eligible:this.clientVisible&&!this.clientMuted};
  }
  get eligible(){return this.clientVisible&&!this.clientMuted&&this.nextDelayMs()!==null;}
}
