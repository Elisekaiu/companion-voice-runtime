// Gentle V4 prosody tests. Keep the chosen Companion deep-voice prefix untouched.
// Only hint the LAST clause of a multi-clause sentence; never add pronunciation
// control after short calls like "宝贝，怎么啦？".
export function shapeV4Speech(text,prefix='',endingTag=''){
  if(!endingTag)return prefix+text;
  const input=String(text||'');
  const lastComma=Math.max(input.lastIndexOf('，'),input.lastIndexOf(','));
  if(lastComma<0)return prefix+input;
  const head=input.slice(0,lastComma),tail=input.slice(lastComma+1);
  const sentenceBoundary=Math.max(head.lastIndexOf('。'),head.lastIndexOf('？'),head.lastIndexOf('！'),head.lastIndexOf('?'),head.lastIndexOf('!'),head.lastIndexOf('；'),head.lastIndexOf(';'));
  const clauseBefore=head.slice(sentenceBoundary+1).replace(/[^\u3400-\u9fff]/g,'');
  const clauseAfter=tail.replace(/[^\u3400-\u9fff]/g,'');
  if(clauseBefore.length<3||clauseAfter.length<3||clauseAfter.length>30)return prefix+input;
  return prefix+input.slice(0,lastComma+1)+' '+endingTag+tail.trimStart();
}
