import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {acceptPlaybackReport} from '../src/call/playback-report.mjs';
const source=fs.readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
function load(names,extra={}){
 const tasks=new Map();let seq=0;
 const ctx=vm.createContext({Date,Number,Math,JSON,AbortController,AbortSignal,console,storage:{save(){}},event(){},state(c,s){c.state=s;},setTimeout(fn){const h={id:++seq,unref(){}};tasks.set(h,fn);return h;},clearTimeout(h){tasks.delete(h);},...extra});
 for(const name of names){const start=source.indexOf('function '+name+'(');let end=source.indexOf('\n}',start)+2;const async=source.slice(start-6,start)==='async ';vm.runInContext((async?'async ':'')+source.slice(start,end),ctx);}return {ctx,tasks};
}
test('Nap/Wake playback requires exact turn/generation; late and duplicate reports cannot rearm snooze',()=>{
 const call={turnId:7,generation:3,napAlarm:{active:true}};
 assert.equal(acceptPlaybackReport(call,{status:'end'}),false);
 assert.equal(acceptPlaybackReport(call,{status:'end',turnId:6,generation:3,completed:true}),false);
 assert.equal(acceptPlaybackReport(call,{status:'start',turnId:7,generation:2}),false);
 assert.equal(acceptPlaybackReport(call,{status:'end',turnId:7,generation:3,completed:false}),false);
 assert.equal(acceptPlaybackReport(call,{status:'end',turnId:7,generation:3,completed:true}),true,'actual completion survives lost start report');
 call.playbackEndedTurn=7;assert.equal(acceptPlaybackReport(call,{status:'start',turnId:7,generation:3}),false);
});
test('new voice activity revokes pending snooze and invalidates queued reminder',()=>{
 const {ctx}=load(['clearWakeTimer','noteWakeUserActivity']);const call={wakeSession:{active:true,pendingSnooze:{minutes:10},lastTurnId:3,nextReminderAt:'old'}};
 ctx.noteWakeUserActivity(call);assert.equal(call.wakeSession.pendingSnooze,null);assert.equal(call.wakeSession.lastTurnId,null);assert.equal(call.wakeSession.nextReminderAt,null);
});
test('strict floor is rechecked at actual snooze execution; duplicate completion is inert',()=>{
 let armed=0;const {ctx}=load(['completeWakeReply'],{scheduleWakeReminder(){},endWakeSession(c){c.wakeSession=null;},armNapAlarm(){armed++;}});
 const call={wakeSession:{active:true,phase:'replying',lastTurnId:3,pendingSnooze:{minutes:10},policy:{urgency:'strict',maxSnoozeMinutes:0}}};
 ctx.completeWakeReply(call,3);assert.equal(armed,0);assert.equal(ctx.completeWakeReply(call,3),false);
 call.wakeSession={active:true,phase:'replying',lastTurnId:4,pendingSnooze:{minutes:5},policy:{urgency:'flexible',maxSnoozeMinutes:10}};
 ctx.completeWakeReply(call,4);ctx.completeWakeReply(call,4);assert.equal(armed,1);
});
test('concurrent incoming push attempts share one request and expiry forbids new sends',async()=>{
 let sends=0,release;const {ctx}=load(['shouldRetryIncomingPush','pushIncomingCall'],{PUSH_SERVICE_URL:'http://push.test',fetch:()=>{sends++;return new Promise(r=>release=()=>r({ok:true,json:async()=>({ok:true,sent:1})}));}});
 const call={id:'test',direction:'incoming',state:'RINGING',ringExpiresAt:new Date(Date.now()+30000).toISOString()};
 const first=ctx.pushIncomingCall(call);await ctx.pushIncomingCall(call);assert.equal(sends,1);release();await first;
 call.ringExpiresAt=new Date(Date.now()-1).toISOString();await ctx.pushIncomingCall(call);assert.equal(sends,1);
});
test('ACK cancels retry timer and aborts an in-flight push',()=>{
 const {ctx,tasks}=load(['clearIncomingPushRetry','acknowledgeIncomingRing']);const abort=new AbortController();const call={id:'test',direction:'incoming',state:'RINGING',ringPushAbort:abort,ringPushTimer:ctx.setTimeout(()=>{})};
 assert.equal(ctx.acknowledgeIncomingRing(call),true);assert.equal(tasks.size,0);assert.equal(abort.signal.aborted,true);
});
test('duplicate alarm callback after wake has begun does not start another model turn',async()=>{
 const {ctx}=load(['triggerNapAlarm']);assert.equal(await ctx.triggerNapAlarm({napAlarm:{active:true,phase:'waking'}}),false);
});
const app=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function browserFunction(name,globals){const start=app.indexOf('async function '+name+'('),end=app.indexOf('\n}',start)+2;const ctx=vm.createContext(globals);vm.runInContext(app.slice(start,end),ctx);return ctx;}
test('microphone permission resolved after Nap stops the stream without starting recognizers',async()=>{
 let release,stopped=0;const ctx=browserFunction('startAssemblyAI',{callId:'same',sttEpoch:0,napMode:false,performance:{now:()=>0},SPEECH_AUDIO_CONSTRAINTS:{},ensurePcmWorklet:async()=>true,navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>release=r)}}});
 const pending=ctx.startAssemblyAI();ctx.napMode=true;ctx.sttEpoch++;release({getTracks:()=>[{stop(){stopped++;}}]});await assert.rejects(pending,/call_cancelled/);assert.equal(stopped,1);
});
test('Nap during provider discovery cannot start either STT client',async()=>{
 let release,starts=0;const ctx=browserFunction('startSTT',{callId:'same',sttEpoch:0,napMode:false,providersLoaded:false,loadSttProviders:()=>new Promise(r=>release=r),startAssemblyAI:()=>starts++,startScribe:()=>starts++});
 const pending=ctx.startSTT();ctx.napMode=true;ctx.sttEpoch++;release();assert.equal(await pending,false);assert.equal(starts,0);
});
test('Nap invalidates a pending Tencent session before SDK microphone clone starts',async()=>{
 let release,starts=0;const track={readyState:'live'};const ctx=browserFunction('startTencentSttForStream',{callId:'same',napMode:false,muted:false,tencentSttStatusLoaded:true,tencentSttConfigured:true,$:()=>({}),api:()=>new Promise(r=>release=r),loadTencentClient:async()=>({startTencentTranscriber:()=>starts++})});
 const pending=ctx.startTencentSttForStream({getAudioTracks:()=>[track]},()=>{});ctx.napMode=true;release({});assert.equal(await pending,null);assert.equal(starts,0);
});