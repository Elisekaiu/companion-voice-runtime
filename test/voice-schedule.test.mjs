import test from 'node:test';
import assert from 'node:assert/strict';
import { localClock, resolveScheduledTone, resolveToneSelection } from '../web/voice-schedule.js';

test('scheduled voice uses 08:00–21:59 day and 22:00–07:59 night in the selected time zone',()=>{
  const cases=[
    ['2026-10-18T21:59:00Z','deep_calm','21:59'],
    ['2026-10-18T22:00:00Z','deep_night','22:00'],
    ['2026-10-19T02:35:00Z','deep_night','02:35'],
    ['2026-10-19T07:59:00Z','deep_night','07:59'],
    ['2026-10-19T08:00:00Z','deep_calm','08:00'],
    ['2026-10-19T14:05:00Z','deep_calm','14:05']
  ];
  for(const [iso,tone,time] of cases){
    const d=new Date(iso);
    assert.equal(resolveScheduledTone(d,'UTC'),tone,iso);
    assert.equal(localClock(d,'UTC').display,time,iso);
  }
});

test('manual tone overrides the scheduled voice',()=>{
  const night=new Date('2026-10-18T22:35:00Z');
  assert.equal(resolveToneSelection('eleven_v4_turbo','auto',night,'UTC'),'deep_night');
  assert.equal(resolveToneSelection('eleven_v4_turbo','deep_calm',night,'UTC'),'deep_calm');
  assert.equal(resolveToneSelection('eleven_v4_turbo','deep',night,'UTC'),'deep');
  assert.equal(resolveToneSelection('eleven_multilingual_v2','auto',night,'UTC'),'original');
});
