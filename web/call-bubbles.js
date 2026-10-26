// Keep punctuation/closing quotes with the sentence. Short turns stay together.
export function splitCallBubbles(text,who='Companion'){
 const source=String(text||'').replace(/\r/g,'').replace(/[\u200b\ufeff]/g,'').trim();
 if(!/[\p{L}\p{N}]/u.test(source))return [];
 const max=who==='User'?110:100,out=[];
 for(const paragraph of source.split(/\n+/).map(x=>x.trim()).filter(Boolean)){
  const pieces=paragraph.match(/[^。！？!?]+(?:[。！？!?]+[”’」』）】]*)|[^。！？!?]+$/gu)||[paragraph];
  let buffer='';
  for(const part of pieces){const p=part.trim();if(!p)continue;
   if(!/[\p{L}\p{N}]/u.test(p)){if(buffer)buffer+=p;else if(out.length)out[out.length-1]+=p;continue;}
   if(buffer&&Array.from(buffer+p).length>max){out.push(buffer);buffer='';}
   buffer+=p;
  }
  if(buffer)out.push(buffer);
 }
 return out;
}

