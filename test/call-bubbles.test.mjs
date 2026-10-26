import test from 'node:test';
import assert from 'node:assert/strict';
import {splitCallBubbles} from '../web/call-bubbles.js';
test('short acknowledgements retain punctuation for both participants',()=>{
 for(const role of ['User','Companion'])assert.deepEqual(splitCallBubbles('嗯。',role),['嗯。']);
});
test('closing quotes stay attached and invisible or punctuation-only text makes no bubble',()=>{
 assert.deepEqual(splitCallBubbles('他说：“我在。”\n后来我们又聊了一会儿。'),['他说：“我在。”','后来我们又聊了一会儿。']);
 for(const text of ['', '  ', '\u200b\ufeff', '”'])assert.deepEqual(splitCallBubbles(text),[]);
});
test('streaming revisions keep all text while sentence grouping stays bounded at boundaries',()=>{
 const text='这是一句完整的话。'.repeat(30);
 const parts=splitCallBubbles(text);assert.equal(parts.join(''),text);assert.ok(parts.length>1);assert.ok(parts.every(p=>p.length<=100));
});
