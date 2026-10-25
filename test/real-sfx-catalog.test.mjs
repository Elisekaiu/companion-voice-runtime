import test from 'node:test';
import assert from 'node:assert/strict';
import {REAL_SFX_CATALOG,REAL_SFX_GROUPS} from '../web/real-sfx-catalog.js';

test('public release does not ship a private SFX clip map',()=>{
  assert.equal(REAL_SFX_CATALOG.length,0);
});

test('performance groups remain available for bring-your-own-audio configuration',()=>{
  const expected=[
    'kiss_single','kiss_sequence',
    'breath_soft','breath_restrained','breath_strong',
    'rhythm_medium','rhythm_fast','rhythm_faster','rhythm_fastest'
  ];
  assert.deepEqual(Object.keys(REAL_SFX_GROUPS),expected);
  for(const items of Object.values(REAL_SFX_GROUPS))assert.ok(Array.isArray(items));
});
