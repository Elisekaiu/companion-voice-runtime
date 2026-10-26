import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('web/app.js','utf8');
const css=fs.readFileSync('web/style.css','utf8');
const html=fs.readFileSync('web/index.html','utf8');
const tx=fs.readFileSync('web/tencent-stt-client.js','utf8');

test('nap mode exposes a visible status pill during an active call',()=>{
  assert.ok(app.includes("classList.add('is-nap')"));
  assert.ok(app.includes("classList.remove('is-nap')"));
  assert.ok(css.includes('.phone[data-phase="active"].is-nap #status'));
  assert.ok(css.includes('display:block!important'));
  assert.ok(app.includes("'Nap · '+remaining+' · 双 STT 已关闭'"));
});

test('early wake control is compact and keeps an accessible label',()=>{
  assert.ok(html.includes('id="nap-wake-now"'));
  assert.ok(html.includes('aria-label="提前醒来">醒了</button>'));
  assert.ok(css.includes('.controls .nap-wake-now{min-width:0!important'));
  assert.ok(css.includes('min-height:34px!important'));
});

test('wake negotiation remains internal and removes the nap status pill',()=>{
  assert.ok(app.includes("classList.remove('is-wake','is-nap')"));
  assert.ok(app.includes("classList.remove('is-wake')"));
  assert.equal(css.includes('.phone[data-phase="active"].is-wake #status'),false);
});

test('Tencent client captures TRTC error extraCode for diagnostics',()=>{
  assert.ok(tx.includes('trtc.on(TRTC.EVENT.ERROR,handleError)'));
  assert.ok(tx.includes('error.extraCode=Number(event?.extraCode)||0'));
  assert.ok(app.includes("event.extraCode?(event.error+'.'+event.extraCode):event.error"));
  assert.ok(app.includes("error?.extraCode?((error?.code||'error')+'.'+error.extraCode)"));
});

test('Tencent retry backoff resets only after a stable window',()=>{
  assert.ok(app.includes('if(tencentRetryAttempt)tencentRetryAttempt=0;'));
  assert.ok(app.includes('now-tencentHealthySince<TENCENT_STABLE_BEFORE_SLEEP_MS'));
  assert.ok(app.includes('noteTencentReady(){tencentHealthySince=Date.now();clearTimeout(tencentRetryTimer)'));
  assert.equal(app.includes('noteTencentReady(){tencentHealthySince=Date.now();tencentRetryAttempt=0'),false);
  assert.equal(app.includes('if(client){tencentSidecar=client;tencentRetryAttempt=0'),false);
});


test('wake negotiation hides the technical nap status pill',()=>{
  assert.ok(app.includes("classList.remove('is-wake','is-nap')"));
  assert.equal(css.includes('.is-wake #status'),false);
});