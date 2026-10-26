import TRTC from 'trtc-sdk-v5';
import RealtimeTranscriber from 'trtc-sdk-v5/plugins/realtime-transcriber';

export async function startTencentTranscriber({
  sdkAppId,
  userId,
  userSig,
  roomId,
  audioTrack,
  onMessage=()=>{},
  onState=()=>{},
  onError=()=>{}
}={}){
  if(!sdkAppId||!userId||!userSig||!roomId||!audioTrack)throw new Error('tencent_stt_missing_config');

  const trtc=TRTC.create({plugins:[RealtimeTranscriber]});
  const ownedTrack=audioTrack.clone();
  let robotId=null;
  let closed=false;

  const handleMessage=event=>{
    try{
      if(event?.speakerUserId&&event.speakerUserId!==userId)return;
      const text=String(event?.sourceText||'').trim();
      if(!text)return;
      onMessage({
        text,
        completed:!!event.isCompleted,
        segmentId:String(event.segmentId||''),
        timestamp:Number(event.timestamp)||Date.now(),
        robotId:String(event.robotId||robotId||'')
      });
    }catch(error){onError(error);}
  };
  const handleState=event=>{
    try{
      onState({
        state:String(event?.state||''),
        roomId:String(event?.roomId||roomId),
        robotId:String(event?.transcriberRobotId||robotId||''),
        sourceLanguage:String(event?.sourceLanguage||'zh'),
        error:Number(event?.error)||0,
        extraCode:Number(event?.extraCode)||0,
        errorMessage:String(event?.errorMessage||'')
      });
    }catch(error){onError(error);}
  };
  const handleError=event=>{
    try{
      const error=new Error(String(event?.message||event?.errorMessage||'Tencent TRTC error'));
      error.code=Number(event?.code)||0;
      error.extraCode=Number(event?.extraCode)||0;
      error.data=event?.data||null;
      onError(error);
    }catch(error){onError(error);}
  };

  trtc.on(TRTC.EVENT.REALTIME_TRANSCRIBER_MESSAGE,handleMessage);
  trtc.on(TRTC.EVENT.REALTIME_TRANSCRIBER_STATE_CHANGED,handleState);
  trtc.on(TRTC.EVENT.ERROR,handleError);

  try{
    await trtc.enterRoom({
      sdkAppId:Number(sdkAppId),
      userId,
      userSig,
      strRoomId:roomId,
      scene:TRTC.TYPE.SCENE_RTC,
      autoReceiveAudio:false,
      autoReceiveVideo:false,
      enableAutoPlayDialog:false
    });
    await trtc.startLocalAudio({
      publish:true,
      option:{
        audioTrack:ownedTrack,
        profile:TRTC.TYPE.AUDIO_PROFILE_STANDARD
      }
    });
    robotId=await trtc.startPlugin('RealtimeTranscriber',{
      sourceLanguage:'zh',
      userIdsToTranscribe:[userId],
      transcriberRobotId:'tx_'+userId,
      enableCloudRecording:false,
      enableSpeakerDiarization:false
    });
    onState({state:'started',roomId,robotId,sourceLanguage:'zh',error:0,errorMessage:''});
  }catch(error){
    try{ownedTrack.stop();}catch{}
    try{await trtc.stopLocalAudio();}catch{}
    try{await trtc.exitRoom();}catch{}
    try{trtc.destroy();}catch{}
    throw error;
  }

  return {
    get robotId(){return robotId;},
    setMuted(value){ownedTrack.enabled=!value;},
    async close(){
      if(closed)return;
      closed=true;
      // Stop capturing immediately; remote plugin cleanup can take a network round trip.
      try{ownedTrack.stop();}catch{}
      try{if(robotId)await trtc.stopPlugin('RealtimeTranscriber',{transcriberRobotId:robotId});}catch{}
      try{await trtc.stopLocalAudio();}catch{}
      try{await trtc.exitRoom();}catch{}
      try{ownedTrack.stop();}catch{}
      try{trtc.destroy();}catch{}
    }
  };
}