import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';

test('shared typed turn archives once; ordered memory survives restart; delete removes all owned files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'companion-room-'));
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 let child;
 const base='http://127.0.0.1:'+port;
 const request=(p,{method='GET',body}={})=>fetch(base+p,{method,headers:{cookie:'codex_call_session=test-access','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const start=async()=>{
  child=spawn(process.execPath,['--import','./test/fixtures/room-upstreams.mjs','src/server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,CALL_HOST:'127.0.0.1',CALL_PORT:String(port),CALL_DATA_DIR:path.join(dir,'calls'),CALL_ACCESS_TOKEN:'test-access',ELEVENLABS_API_KEY:'test-only',COMPANION_BRIDGE_BASE:'http://room-runtime.test',COMPANION_BRIDGE_TOKEN:'test-only'},stdio:['ignore','pipe','pipe']});
  let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',()=>{});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}if(child.exitCode!==null)throw new Error('server exited '+out);await new Promise(r=>setTimeout(r,30));}throw new Error('server timeout');
 };
 const stop=async()=>{if(child?.exitCode===null){child.kill();await once(child,'exit');}};
 try{
  await start();
  const {call}=await (await request('/api/calls',{method:'POST',body:{ttsModel:'eleven_multilingual_v2'}})).json();
  const cp='/api/calls/'+call.id,hp='/api/history/'+call.id;
  await request(cp+'/answer',{method:'POST',body:{}});
  assert.equal((await request(hp,{method:'DELETE'})).status,409);
  assert.equal((await request(cp+'/text',{method:'POST',body:{text:'你好'}})).status,202);
  let saved;
  for(let i=0;i<100;i++){saved=JSON.parse(fs.readFileSync(path.join(dir,'calls',call.id+'.json')));if(saved.transcript.some(x=>x.speaker==='assistant'))break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(saved.codexThreadId,'shared-test-thread');assert.ok(saved.transcript.some(x=>x.reason==='typed'));
  const segment=saved.audioSegments[0];assert.equal(segment.order,0);
  const audio=cp+'/audio/'+segment.segmentId;
  const pair=await Promise.all([request(audio),request(audio)]);const bytes=await Promise.all(pair.map(r=>r.arrayBuffer()));
  assert.deepEqual(Buffer.from(bytes[0]),Buffer.from(bytes[1]));assert.equal(new Uint8Array(bytes[0])[3],1,'concurrent GETs only synthesized once');
  const retry=await (await request(audio)).arrayBuffer();assert.equal(new Uint8Array(retry)[3],1,'retry is the same synthesis');
  assert.equal((await request(cp+'/text',{method:'POST',body:{text:'再说一句'}})).status,202);
  let saved2;for(let i=0;i<100;i++){saved2=JSON.parse(fs.readFileSync(path.join(dir,'calls',call.id+'.json')));if(saved2.audioSegments.length>=2&&saved2.transcript.filter(x=>x.speaker==='assistant').length>=2)break;await new Promise(r=>setTimeout(r,20));}
  const segment2=saved2.audioSegments[1],audio2=cp+'/audio/'+segment2.segmentId;assert.equal((await request(audio2)).status,200);
  await request(cp+'/hangup',{method:'POST',body:{}});
  assert.equal((await request(hp+'/title',{method:'POST',body:{title:'夜里说了很多话'}})).status,200);
  assert.equal((await request(hp+'/voice/'+segment.turnId+'/favorite',{method:'POST',body:{favorite:true}})).status,200);
  let history=await (await request(hp)).json();assert.equal(history.call.title,'夜里说了很多话');assert.equal(history.call.customTitle,true);assert.equal(history.call.audioSegments.find(x=>x.segmentId===segment.segmentId).favorite,true);
  assert.equal(history.call.audioSegments[0].archived,true);assert.equal(history.call.audioSegments[0].bytes,2048);assert.equal(history.call.audioSegments[0].playbackRate,1);
  await stop();
  const old=new Date(Date.now()-100*24*60*60*1000).toISOString(),callFile=path.join(dir,'calls',call.id+'.json'),aged=JSON.parse(fs.readFileSync(callFile));aged.endedAt=old;for(const x of aged.audioSegments)x.archivedAt=old;fs.writeFileSync(callFile,JSON.stringify(aged,null,2));
  await start();
  history=await (await request(hp)).json();assert.equal(history.call.title,'夜里说了很多话');assert.ok(history.call.transcript.length);assert.ok(history.call.audioSegments.some(x=>x.segmentId===segment.segmentId&&x.favorite),'favorite voice survives 90-day prune');assert.equal(history.call.audioSegments.some(x=>x.segmentId===segment2.segmentId),false,'unfavorite voice expires after 90 days');
  const archived=await (await request(hp+'/audio/'+segment.segmentId)).arrayBuffer();assert.deepEqual(Buffer.from(archived),Buffer.from(bytes[0]));assert.equal((await request(hp+'/audio/'+segment2.segmentId)).status,404);
  fs.mkdirSync(path.join(dir,'recordings'));for(const ext of ['webm','m4a','m4a.tmp'])fs.writeFileSync(path.join(dir,'recordings',call.id+'.'+ext),'fixture');
  assert.equal((await request(hp,{method:'DELETE'})).status,200);
  assert.equal(fs.existsSync(path.join(dir,'calls',call.id+'.json')),false);assert.equal(fs.existsSync(path.join(dir,'call-turn-audio',call.id)),false);assert.deepEqual(fs.readdirSync(path.join(dir,'recordings')),[]);
  assert.equal((await request(hp)).status,404);assert.equal((await request(hp+'/audio/'+segment.segmentId)).status,404);
  const usage=await (await request('/api/status')).json();assert.equal(usage.usage.available,false);assert.equal(usage.model,'gpt-5.6-sol');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
