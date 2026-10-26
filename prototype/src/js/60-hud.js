// ═════════════════════════ HUD: notebook, instruments, pins, inspector ═════════════════════════
const feedEl = $('#feed');
let feedCount = 0;
function feed(cls, tag, text, ev, meta, demo = false) {
  const li = document.createElement('li');
  li.className = `t-${cls}${demo || ev?.demo ? ' demo' : ''} new`; li.tabIndex = 0;
  const when = ev?.real && !ev.demo ? clockTxt(ev.real) : ev?.demo ? '演示' : '';
  li.innerHTML = `<time>${when}</time><span class="tag">${esc(tag)}</span><p>${esc(oneLine(text))}${meta ? ` <small>${esc(meta)}</small>` : ''}</p>`;
  if (ev) { li.addEventListener('click', () => inspectEvent(ev)); li.addEventListener('keydown', k => { if (k.key === 'Enter') inspectEvent(ev); }); }
  feedEl.prepend(li); feedCount++; $('#feed-count').textContent = `${feedCount} 条`;
  setTimeout(() => li.classList.remove('new'), 700);
  while (feedEl.children.length > 160) feedEl.lastElementChild.remove();
}
const toastsEl = $('#toasts');
function toast(kind, text, warn = false) {
  const el = document.createElement('div'); el.className = 'toast' + (warn ? ' warn' : '');
  el.innerHTML = `<b>${esc(kind)}</b><span>${esc(text)}</span>`; toastsEl.append(el);
  while (toastsEl.children.length > 3) toastsEl.firstElementChild.remove();
  setTimeout(() => el.classList.add('out'), 3800); setTimeout(() => el.remove(), 4400);
}
const stats = { turns: [], ttft: [], ok: 0, err: 0, calls: 0, tps: 0 };
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hud = {
  phase(p) { document.querySelectorAll('#proto li').forEach(li => li.classList.toggle('on', li.dataset.phase === p)); },
  run(t, l) { $('#runline').textContent = `回合 ${t ?? '—'}${SESSION.turnCount ? ' / ' + SESSION.turnCount : ''} · 请求 ${l ?? '—'}`; },
  ctx(tokens, demo) {
    const r = tokens / WINDOW_TOKENS;
    $('#ctx-gauge i').style.width = clamp(r * 100, 0.4, 100) + '%';
    $('#ctx-gauge').classList.toggle('hot', r >= 0.85);
    $('#ctx-pct').textContent = (r * 100).toFixed(1) + '%';
    $('#ctx-num').textContent = demo ? `演示 · ${fmtK(tokens)} / ${fmtK(WINDOW_TOKENS)}` : `${fmtK(tokens)} / ${fmtK(WINDOW_TOKENS)} token`;
  },
  stats() {
    const t = stats.turns, last = t[t.length - 1], tt = stats.ttft;
    $('#st-ttft').textContent = tt.length ? fmtMs(tt[tt.length - 1]) : '—';
    $('#st-ttft-sub').textContent = tt.length ? `均值 ${fmtMs(tt.reduce((a, b) => a + b, 0) / tt.length)} · ${tt.length} 次` : '每次请求的首 token';
    $('#st-tps').textContent = last && last.api ? String(Math.round(last.output / (last.api / 1000))) : '—';
    $('#st-tps-sub').textContent = last ? `回合 ${last.n} · 输出 ${fmtK(last.output)}` : '上一回合输出速率';
    const totIn = t.reduce((s, x) => s + x.input, 0), totC = t.reduce((s, x) => s + x.cached, 0);
    $('#st-cache').textContent = totIn ? Math.round((100 * totC) / totIn) + '%' : '—';
    $('#st-cache-sub').textContent = totIn ? `${fmtK(totC)} / ${fmtK(totIn)}` : '缓存读取占输入';
    const n = stats.ok + stats.err;
    $('#st-tools').textContent = n ? Math.round((100 * stats.ok) / n) + '%' : '—';
    $('#st-tools-sub').textContent = `${stats.calls} 次 · ${stats.err} 失败`;
    $('#in-max').textContent = drawBars('#ch-in', t.map(x => [x.cached, Math.max(0, x.input - x.cached)]), ['--teal-f', '--teal-f'], [0.42, 1]);
    $('#out-max').textContent = drawBars('#ch-out', t.map(x => [x.reasoning, Math.max(0, x.output - x.reasoning)]), ['--violet-f', '--blue-f'], [1, 1]);
  },
  archive() {
    const n = ARCHIVE.turns, cells = 100, el = $('#archive');
    if (el.children.length !== cells) el.innerHTML = Array.from({ length: cells }, () => '<span></span>').join('');
    [...el.children].forEach((c, i) => { c.className = i < n ? (i >= ARCHIVE.base ? 'on new' : 'on') : ''; });
    $('#arc-count').textContent = `${n} 瓶`;
    $('#arc-note').textContent = `累计 ${fmtK(ARCHIVE.tokens)} token · 本机 ${LONG.sessions ?? '—'} 个会话 · 回放新增 ${n - ARCHIVE.base}`;
  },
};
// ink-style bars: thin columns on a faint grid, the newest one underlined
function drawBars(sel, rows, vars, alphas) {
  const cv = $(sel), w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return '';
  const dpr = window.devicePixelRatio || 1; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.strokeStyle = cssVar('--rule'); g.lineWidth = 1;
  for (let i = 0; i <= (rows.length ? 3 : 0); i++) { const y = Math.round(h - 1 - (i / 3) * (h - 6)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  if (!rows.length) { g.fillStyle = cssVar('--muted'); g.font = `11px ${FONT_SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('第一个回合完成后出现', w / 2, h / 2 - 4); return ''; }
  const max = Math.max(1, ...rows.map(r => r[0] + r[1])), slots = Math.max(10, rows.length), bw = w / slots;
  rows.forEach((r, i) => {
    let y = h - 1;
    r.forEach((v, k) => { const bh = (v / max) * (h - 8); g.globalAlpha = alphas[k]; g.fillStyle = cssVar(vars[k]); g.fillRect(i * bw + bw * 0.22, y - bh, Math.max(1, bw * 0.56), bh); y -= bh; });
    g.globalAlpha = 1;
    if (i === rows.length - 1) { g.fillStyle = cssVar('--ink'); g.fillRect(i * bw + bw * 0.12, h - 1.5, bw * 0.76, 1.5); }
  });
  return `峰值 ${fmtK(max)}`;
}

// ── pins: numbered markers on the stations, the active one carries its name ──
const pinsEl = $('#pins');
const PINS = ST_LIST.map(S => {
  const el = document.createElement('div');
  el.className = 'pin';
  el.innerHTML = `<span class="n">${S.n}</span><span class="t">${esc(S.name)}<em></em></span>`;
  el.addEventListener('click', () => { inspectStation(S.id); focusStation(S.id, true); });
  pinsEl.append(el);
  return { S, el, em: el.querySelector('em'), last: '' };
});
const pv = V();
function updatePins() {
  const w = innerWidth, h = innerHeight;
  for (const P of PINS) {
    pv.copy(P.S.pin).project(camera);
    const x = (pv.x * 0.5 + 0.5) * w, y = (-pv.y * 0.5 + 0.5) * h;
    const off = x < -40 || x > w + 40 || y < -40 || y > h + 40;
    if (off) { if (P.el.style.display !== 'none') P.el.style.display = 'none'; continue; }
    if (P.el.style.display === 'none') P.el.style.display = '';
    P.el.style.transform = `translate(${(x - 9).toFixed(1)}px, ${(y - 9).toFixed(1)}px)`;
    const st = P.S.state, cls = `pin${P.S.lit > 0.5 || st === 'busy' ? ' on' : ''}${st === 'wait' ? ' wait' : ''}${st === 'error' ? ' err' : ''}`;
    if (P.el.className !== cls) P.el.className = cls;
    if (P.last !== P.S.status) { P.last = P.S.status; P.em.textContent = P.S.status; }
  }
}
function setStatus(id, text) { const S = ST[id]; if (S) S.status = text || ''; }

// ── the stations legend in the instruments panel ──
function renderStations() {
  const used = new Set([...(LONG.toolsUsed || [])].map(stationForTool));
  $('#stations').innerHTML = ST_LIST.map(S => `<li data-id="${S.id}" class="${S.state !== 'idle' || S.lit > 0.5 ? 'on' : ''}${S.uses || used.has(S.id) ? ' used' : ''}" tabindex="0"><span class="n">${S.n}</span><span><b>${esc(S.name)}</b><small>${esc(S.role)}</small></span><em>${S.uses ? S.uses + ' 次' : ''}</em></li>`).join('');
  $('#st-used').textContent = `${ST_LIST.filter(S => S.uses || used.has(S.id)).length} / ${ST_LIST.length} 用过`;
}
$('#stations').addEventListener('click', ev => { const li = ev.target.closest('li[data-id]'); if (li) { inspectStation(li.dataset.id); focusStation(li.dataset.id, true); } });
$('#stations').addEventListener('keydown', ev => { const li = ev.target.closest('li[data-id]'); if (li && ev.key === 'Enter') { inspectStation(li.dataset.id); focusStation(li.dataset.id, true); } });

// ── inspector ──
const insEl = $('#inspector');
function openInspector(title, html, bind) { $('#ins-title').textContent = title; $('#ins-body').innerHTML = html; insEl.hidden = false; if (bind) bind($('#ins-body')); }
$('#ins-close').addEventListener('click', () => { insEl.hidden = true; });
addEventListener('keydown', k => { if (k.key === 'Escape') { insEl.hidden = true; $('#demo-pop').hidden = true; $('#demo-btn').setAttribute('aria-expanded', 'false'); } });
function evSummary(e) {
  const d = e.d || {};
  switch (e.type) {
    case 'user.message': case 'stream.thought': case 'stream.text': return oneLine(d.text).slice(0, 60);
    case 'tool.call': return d.name; case 'tool.update': return `${d.name || ''} ${d.status || d.title || ''}`;
    case 'permission.request': return d.name; case 'permission.resolve': return `${d.name} · ${d.decision}`;
    case 'hook': return d.event; case 'loop.start': return `第 ${d.i + 1} 次请求`; case 'turn.completed': return d.stop;
    case 'mcp.connected': return `${d.server} · ${d.tools} 工具`; default: return e.demo ? (d.sessionUpdate || e.type) : '';
  }
}
function inspectEvent(ev) {
  if (!ev) return;
  const origin = ev.demo ? '演示事件 · 按 grok-build 源码里的真实 schema 构造' : ORIGIN[ev.type] || '';
  const when = ev.real && !ev.demo ? new Date(ev.real).toLocaleString('zh-CN', { hour12: false }) : '刚刚';
  openInspector(ev.demo ? ev.type : TYPE_NAME[ev.type] || ev.type,
    `<p class="sub">${esc(origin)}</p><dl><dt>时间</dt><dd>${esc(when)}</dd><dt>回合</dt><dd>${ev.n ?? '—'}</dd><dt>统一类型</dt><dd><code>${esc(ev.type)}</code></dd></dl><pre>${esc(JSON.stringify(ev.d, null, 2))}</pre>`);
}
function inspectStation(id) {
  const S = ST[id]; if (!S) return;
  const evs = S.events.slice(-10).reverse();
  openInspector(`${S.n} · ${S.name}`, `<p class="sub">${esc(S.role)}</p><p>${esc(S.desc)}</p>
    <dl><dt>状态</dt><dd>${STATE_TXT[S.state] || S.state}</dd>${S.status ? `<dt>最近</dt><dd>${esc(S.status)}</dd>` : ''}<dt>本次回放</dt><dd>${S.uses} 次</dd></dl>
    <h4>最近事件</h4><ol class="evlist">${evs.map((e, k) => `<li data-k="${k}" tabindex="0">${esc(e.demo ? e.type : TYPE_NAME[e.type] || e.type)} · ${esc(evSummary(e))}</li>`).join('') || '<li class="empty">还没有事件</li>'}</ol>`,
    root => root.querySelectorAll('.evlist li[data-k]').forEach(li => li.addEventListener('click', () => inspectEvent(evs[+li.dataset.k]))));
}
function inspectRobot() {
  openInspector('龙门机器人 · agent', `<p>机器人就是正在干活的 agent：从反应釜（模型）取出工单，经安全联锁送到对应仪器，再把结果倒回储液塔（上下文）。它的指示环：灰色待命，青色忙碌，黄色闪烁是在等你，红色是出错。</p><dl><dt>当前</dt><dd>${esc(ROBOT.text)}</dd><dt>排队</dt><dd>${ROBOT.tasks.length} 项</dd><dt>位置</dt><dd>${ROBOT.at ? esc(ST[ROBOT.at]?.name || ROBOT.at) : '—'}</dd></dl>`);
}
function readout() {
  const pct = (S_.ctx / WINDOW_TOKENS) * 100;
  $('#readout').innerHTML = `回合 <b>${S_.turn ?? '—'}</b> · 请求 <b>${S_.loop != null ? S_.loop + 1 : '—'}</b> · 上下文 <b>${pct.toFixed(1)}%</b> · <b>${Math.round(stats.tps)}</b> tok/s`;
}
