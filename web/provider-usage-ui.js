const CSS=`
.usage-section+.usage-section{margin-top:24px;padding-top:22px;border-top:1px solid var(--line)}
.usage-section-head{display:flex;align-items:center;justify-content:space-between;gap:14px}
.usage-section-head>strong{font-size:12px;font-weight:500;letter-spacing:.03em}
.usage-section-head>small{font-size:10px;color:var(--muted)}
.usage-section-head>button{min-height:32px;min-width:32px;padding:4px 8px;color:var(--muted);font-size:18px}
.provider-usage-grid{display:grid;gap:8px;margin-top:14px}
.provider-usage-card{padding:10px 14px 9px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.022)}
.provider-usage-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.provider-usage-top strong{font-size:12px;font-weight:500}
.usage-badge{padding:3px 7px;border-radius:999px;background:rgba(190,164,188,.09);color:rgba(210,194,209,.62);font-size:9px;letter-spacing:.05em;text-transform:uppercase}
.provider-usage-main{margin-top:6px;font-size:18px;line-height:1.25;font-weight:500;font-variant-numeric:tabular-nums}
.provider-usage-note{display:block;margin-top:4px;color:var(--muted);opacity:.72;font-size:10px;line-height:1.55}
.provider-usage-track{margin-top:6px}
.provider-usage-footnote{margin:8px 1px 0!important;font-size:9px!important;line-height:1.55!important;opacity:.52!important}
`;

function ensureStyle(root=document){
  if(root.getElementById('provider-usage-style'))return;
  const style=document.createElement('style');style.id='provider-usage-style';style.textContent=CSS;
  document.head.append(style);
}

export function ensureProviderUsageSection({root=document,refresh=()=>{}}={}){
  let section=root.querySelector('.provider-usage-section');
  if(section)return section;
  const body=root.querySelector('#usage-sheet .sheet-body');
  if(!body)return null;
  ensureStyle(root);
  section=document.createElement('section');
  section.className='usage-section provider-usage-section';
  section.innerHTML=[
    '<div class="usage-section-head"><strong>语音 Provider</strong><button id="provider-usage-refresh" type="button" aria-label="刷新 Provider 用量">↻</button></div>',
    '<div class="provider-usage-grid">',
      '<article class="provider-usage-card"><div class="provider-usage-top"><strong>ElevenLabs</strong><span class="usage-badge">精确</span></div><div id="usage-eleven-main" class="provider-usage-main">检查中…</div><div class="usage-meter-track provider-usage-track"><i id="usage-eleven-bar" class="usage-meter-fill"></i></div><small id="usage-eleven-note" class="provider-usage-note"></small><div id="usage-eleven-setup" class="hidden"></div></article>',
      '<article class="provider-usage-card"><div class="provider-usage-top"><strong>AssemblyAI</strong><span class="usage-badge local">本地</span></div><div id="usage-assembly-main" class="provider-usage-main">检查中…</div><small id="usage-assembly-note" class="provider-usage-note"></small></article>',
      '<article class="provider-usage-card"><div class="provider-usage-top"><strong>Tencent</strong><span class="usage-badge provider">Provider</span></div><div id="usage-tencent-main" class="provider-usage-main">检查中…</div><small id="usage-tencent-note" class="provider-usage-note"></small></article>',
    '</div>',
    '<p class="provider-usage-footnote">“精确”由 provider 返回；“本地”由当前部署统计；“Provider”表示账单需要额外云端 adapter。</p>'
  ].join('');
  body.append(section);
  section.querySelector('#provider-usage-refresh')?.addEventListener('click',refresh);
  return section;
}
