export function acceptPlaybackReport(call,body){
  if(call.endedAt||call.state==='ENDED')return false;
  const guarded=!!(call.napAlarm?.active||call.wakeSession?.active);
  if(guarded&&(body.turnId==null||body.generation==null))return false;
  if(body.turnId!=null&&Number(body.turnId)!==call.turnId)return false;
  if(body.generation!=null&&Number(body.generation)!==call.generation)return false;
  if(Number(call.playbackEndedTurn)===call.turnId)return false;
  if(body.status==='end'&&guarded&&body.completed!==true)return false;
  return ['start','end','failed'].includes(body.status);
}