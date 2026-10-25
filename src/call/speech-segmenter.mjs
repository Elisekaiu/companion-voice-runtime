// Chinese conversational prosody: do not synthesize "宝贝，" or "老婆，" as isolated clips.
// Prefer an entire grammatical sentence, and only break long sentences at clause boundaries.
const END_MARKS=/[。！？!?；;]/g;
const CLAUSE_MARKS=/[，,、]/g;

function splitIntimate(rest,force){
  const segments=[];
  while(rest.trim()){
    if(force){
      // Keep a normal 1-3 sentence intimate reply in one breath. Only very long
      // turns are split, and then at the latest natural boundary we can find.
      if(rest.length<=150){
        segments.push(rest.trim());
        rest='';
        break;
      }
    }else if(rest.length<90){
      break;
    }

    const max=Math.min(rest.length,145);
    let candidate=-1,match;
    END_MARKS.lastIndex=0;
    while((match=END_MARKS.exec(rest))!==null){
      const cut=match.index+match[0].length;
      if(cut>=55&&cut<=max)candidate=cut;
      if(cut>max)break;
    }
    if(candidate<0){
      CLAUSE_MARKS.lastIndex=0;
      while((match=CLAUSE_MARKS.exec(rest))!==null){
        const cut=match.index+match[0].length;
        if(cut>=80&&cut<=max)candidate=cut;
        if(cut>max)break;
      }
    }
    if(candidate<0){
      if(!force&&rest.length<145)break;
      candidate=max;
    }
    const part=rest.slice(0,candidate).trim();
    if(part)segments.push(part);
    rest=rest.slice(candidate);
  }
  if(force&&rest.trim()){segments.push(rest.trim());rest='';}
  return {segments,rest};
}

export function splitSpeech(buffer,force=false,{profile='default'}={}){
  let rest=String(buffer||''),segments=[];
  if(profile==='intimate')return splitIntimate(rest,force);

  while(rest.trim()){
    END_MARKS.lastIndex=0;
    const full=END_MARKS.exec(rest);
    if(full && full.index<175){
      const cut=full.index+full[0].length;
      const part=rest.slice(0,cut).trim();
      if(part)segments.push(part);
      rest=rest.slice(cut);
      continue;
    }
    if(rest.length<150)break;
    CLAUSE_MARKS.lastIndex=0;
    let candidate=-1,match;
    while((match=CLAUSE_MARKS.exec(rest))!==null){
      const cut=match.index+match[0].length;
      if(cut>=65 && cut<=140)candidate=cut;
      if(cut>140)break;
    }
    if(candidate<0){
      const whitespace=rest.slice(65,140).lastIndexOf(' ');
      if(whitespace>=0)candidate=65+whitespace+1;
    }
    if(candidate<0)candidate=140;
    const part=rest.slice(0,candidate).trim();
    if(part)segments.push(part);
    rest=rest.slice(candidate);
  }
  if(force && rest.trim()){segments.push(rest.trim());rest='';}
  return {segments,rest};
}
