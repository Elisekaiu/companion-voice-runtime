import fs from 'node:fs';
import path from 'node:path';
import tls from 'tls-sig-api-v2';

function cleanId(value,max=64){
  return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,max);
}

export class TencentTrtcConfig {
  constructor({sdkAppId=0,secretFile=''}={}){
    this.sdkAppId=Number(sdkAppId)||0;
    this.secretFile=String(secretFile||'').trim();
  }

  readSecret(){
    if(!this.secretFile)return '';
    try{return fs.readFileSync(this.secretFile,'utf8').trim();}catch{return '';}
  }

  status(){
    const configured=!!(this.sdkAppId&&this.readSecret());
    return {
      available:!!this.sdkAppId,
      configured,
      sdkAppId:this.sdkAppId||null,
      mode:'trtc-web-realtime-transcriber',
      sourceLanguage:'zh'
    };
  }

  configure(secret){
    const value=String(secret||'').trim();
    if(!this.sdkAppId)throw new Error('tencent_trtc_sdk_app_id_missing');
    if(!this.secretFile)throw new Error('tencent_trtc_secret_file_missing');
    if(value.length<16||value.length>256||/\s/.test(value))throw new Error('invalid_tencent_trtc_sdk_secret');
    fs.mkdirSync(path.dirname(this.secretFile),{recursive:true});
    fs.writeFileSync(this.secretFile,value,{encoding:'utf8',mode:0o600});
    try{fs.chmodSync(this.secretFile,0o600);}catch{}
    return this.status();
  }

  session(callId,{expiresIn=3600}={}){
    const secret=this.readSecret();
    if(!this.sdkAppId||!secret)return null;
    const callToken=cleanId(String(callId||'').replace(/-/g,''),40);
    if(!callToken)throw new Error('invalid_call_id');
    const roomId=cleanId('companion_'+callToken,64);
    const userId=cleanId('user_'+callToken.slice(0,20),32);
    const api=new tls.Api(this.sdkAppId,secret);
    const userSig=api.genUserSig(userId,Math.max(600,Math.min(Number(expiresIn)||3600,86400)));
    return {
      sdkAppId:this.sdkAppId,
      roomId,
      userId,
      userSig,
      sourceLanguage:'zh',
      expiresIn:Math.max(600,Math.min(Number(expiresIn)||3600,86400))
    };
  }
}
