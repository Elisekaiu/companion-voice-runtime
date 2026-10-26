import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
test('TTS configuration is shared across concurrent and subsequent dial requests',async()=>{
 let loads=0,release;
 const context=vm.createContext({loadTtsModelsOnce:()=>{loads++;return new Promise(r=>release=r);}});
 vm.runInContext(extract('let ttsModelsLoaded=false','async function loadTtsModelsOnce'),context);
 const first=context.loadTtsModels(),second=context.loadTtsModels();assert.equal(loads,1);release();await Promise.all([first,second]);await context.loadTtsModels();assert.equal(loads,1);
});
test('failed TTS configuration load can retry',async()=>{
 let loads=0;const context=vm.createContext({loadTtsModelsOnce:async()=>{if(++loads===1)throw Error('offline');}});
 vm.runInContext(extract('let ttsModelsLoaded=false','async function loadTtsModelsOnce'),context);
 await assert.rejects(context.loadTtsModels());await context.loadTtsModels();assert.equal(loads,2);
});
test('early recognizer close rejects immediately and removes handshake listeners',async()=>{
 const ws=new EventTarget();let timers=new Set();const context=vm.createContext({ws,JSON,Error,setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)});
 vm.runInContext(extract('      const beginPromise=new Promise','      ws.onmessage=')+'\nglobalThis.ready=beginPromise;',context);
 ws.dispatchEvent(new Event('close'));await assert.rejects(context.ready,/connection closed/);assert.equal(timers.size,0);
});
test('interrupted speech disconnects its gain and analyser even after current source changes',async()=>{
 let disconnected=0,meterStopped=0;
 const audioSource={playbackRate:{},connect(){},disconnect(){disconnected++;},start(){context.currentSource=null;queueMicrotask(()=>this.onended());}};
 const context=vm.createContext({audioGeneration:1,currentSource:null,currentCallPlaybackRate:1,playbackTurn:null,playbackStarted:false,api:async()=>{},audioNote(){},room:{measure:()=>()=>meterStopped++},audioCtx:{state:'running',resume:async()=>{},createBufferSource:()=>audioSource,createGain:()=>({gain:{},connect(){},disconnect(){disconnected++;}})},playPerformanceCue:async()=>false});
 vm.runInContext(extract('async function playPreparedAudio','function maybeFinishPlayback'),context);
 await context.playPreparedAudio(Promise.resolve({buffer:{duration:1},playbackRate:1,voiceProfile:'normal',id:'test'}),1);
 assert.ok(disconnected>=2);assert.ok(meterStopped>=1);
});