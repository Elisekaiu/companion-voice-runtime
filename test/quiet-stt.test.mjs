import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../web/app.js',import.meta.url),'utf8');

test('idle STT light sleep and wake remain present',()=>{
  assert.ok(source.includes('ASSEMBLY_IDLE_SLEEP_MS=30000'));
  assert.ok(source.includes('const PRE_ROLL_CHUNKS=60'));
  assert.ok(source.includes("closeCloud({sleeping:true,keepTencent:true})"));
  assert.ok(source.includes("maybeWake('tencent')"));
  assert.ok(source.includes('isSleeping(){return cloudSleeping;}'));
});
