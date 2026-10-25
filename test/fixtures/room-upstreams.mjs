// Isolated contract tests only. No production provider or shared thread is used.
const realFetch=globalThis.fetch;let syntheses=0;
globalThis.fetch=async(url,options)=>{
 const u=String(url);
 if(u.startsWith('http://room-runtime.test/voice-status'))return Response.json({authenticated:true,model:'gpt-5.6-sol',reasoning_effort:'medium',active_thread_id:'shared-test-thread'});
 if(u.startsWith('http://room-runtime.test/voice-turn')){
  const packets=[{type:'meta',threadId:'shared-test-thread',model:'gpt-5.6-sol',effort:'medium'},{type:'started',turnId:'test-turn'},{type:'delta',delta:'我在，慢慢说。'},{type:'done',text:'我在，慢慢说。',threadId:'shared-test-thread'}];
  return new Response(packets.map(p=>JSON.stringify(p)).join('\n')+'\n');
 }
 if(u.startsWith('https://api.elevenlabs.io/')){syntheses++;await new Promise(r=>setTimeout(r,100));const bytes=new Uint8Array(2048);bytes.set([73,68,51,syntheses]);return new Response(bytes,{headers:{'content-type':'audio/mpeg'}});}
 return realFetch(url,options);
};
