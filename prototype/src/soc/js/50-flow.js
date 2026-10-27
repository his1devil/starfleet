// ═════════════════════════ flows: where every block meets the loop, the network paths, the context model ═════════════════════════
// where each block's spoke leaves it (on the block edge that faces the loop)
const PORT_AT = {
  sram: [-231, -98], rb: [-139, -98], sampler: [-100, -98], compact: [-315, -98], prefix: [-357, -98],
  acp: [-322, -74], queue: [-322, -37], rem: [-322, -1], skills: [-322, 37],
  turn: [-300, -18], loop: [-200, -70], gates: [-100, -18],
  stream: [-80, -66], tools: [-80, 9],
  mcp: [-347, 60], mem: [-296, 60], runtime: [-213, 60], hooks: [-129, 60], perm: [-86, 60],
  sub: [-62, 76], bg: [-62, 111],
};
for (const id in PORT_AT) port(id, ...PORT_AT[id]);

// the paths off the loop: out through the PHY, over the network, through the remote package and back
function buildPaths() {
  const y = MET_Y, yi = INT_Y + 0.35, ys = SUB_Y + 2.5, L = LOCAL.sub[2], Rm = REMOTE.sub[0];
  path('samp_out', [[-34, y, -112], [-20, y, -112], [-13, y, -108], [-5, yi, -100], [8, ys, -86], [L + 1, ys, -81]]);
  path('local_in', [[L + 1, ys, -75], [8, ys, -80], [-5, yi, -94], [-13, y, -102], [-20, y, -104], [-34, y, -104]]);
  path('remote_in', [[Rm - 1, ys, -81], [Rm + 10, ys, -86], [FRONT.x0 - 3, yi, -112], [FRONT.x0 + 3, y, -118], [FRONT.x0 + 30, y, -118]]);
  path('remote_out', [[FRONT.x0 + 30, y, -104], [FRONT.x0 + 3, y, -104], [FRONT.x0 - 3, yi, -96], [Rm + 10, ys, -80], [Rm - 1, ys, -75]]);
  path('front_lm', [[FRONT.x0 + 30, y, -118], [FRONT.x1 - 3, y, -118], [FRONT.x1 + 6, yi, -106], [LM.x0 - 5, yi, -44], [LM.x0 + 3, y, -40], [PE.x0 + 6, y, -40]]);
  path('lm_out', [[SAMP.x, y, SAMP.z - 13], [SAMP.x, y, LM.z0 + 2], [SAMP.x - 8, yi, LM.z0 - 8], [FRONT.x1 + 6, yi, -98], [FRONT.x1 - 3, y, -104], [FRONT.x0 + 30, y, -104]]);
  path('pe_pidx', [[PE.x0 + 12, y, PE.z0 + PE.n * PE.p + 2], [PE.x0 + 12, y, PIDX.z0 + 2]]);
  path('pe_samp', [[PE.x0 + PE.n * PE.p + 2, y, -36], [SAMP.x - 12, y, -36]]);
  for (const [i, H] of HBM.entries()) path('hbm' + i, [[H.x < LM.x0 ? LM.x0 + 3 : LM.x1 - 3, y, H.z * 0.5], [H.x + (H.x < LM.x0 ? KVP.w / 2 : -KVP.w / 2), INT_Y + 14, H.z]]);
  path('samp_stream', [[-58, y, -98], [-58, y, -92]]);
  path('store_in', [[-231, MET_Y, 130], [-231, yi, 140], [-231, SUB_Y + 3.6, STORE.z0 + 2]]);
}
// the request's full journey and the stream's way back, assembled once the paths exist
let JOURNEY = null;
function buildJourneys() {
  JOURNEY = {
    out: chain(route('rb', 'sampler', 0), BUS.samp_out, BUS.net_tx, BUS.remote_in, BUS.front_lm),
    back: chain(BUS.pe_samp, BUS.lm_out, BUS.remote_out, BUS.net_rx, BUS.local_in),
  };
}
// a pulse from block a to block b round the loop
function flow(a, b, hex, o = {}) { const r = route(a, b, o.lane); if (r) fx.pulses.emit(r, hex, { speed: o.speed ?? 170, r: o.r ?? 1.05, stretch: o.stretch ?? 2.4, lift: o.lift ?? 0.9, onEnd: o.onEnd }); }
function flows(a, b, hex, n = 3, gap = 0.09, o = {}) { for (let i = 0; i < n; i++) after(i * gap, () => flow(a, b, hex, { ...o, onEnd: i === n - 1 ? o.onEnd : undefined })); }

// ── the context model: the conversation as segments [kind, tokens, turn, label] ──
// The real composition comes from chat_history.jsonl; within a turn, segments are taken off that
// turn's list as the matching events arrive, so the array grows in step with the replay.
const CTX = { segs: [], pending: new Map(), toolsTok: 0 };
function ctxReset(turnN) {
  const all = TRACE.context?.segments || [];
  CTX.toolsTok = TRACE.context?.toolsTok || 0;
  // replay what came before this turn, applying compactions as they happened
  let segs = [];
  for (const s of all) {
    if (s[2] >= turnN && s[2] !== -1) continue;
    if (s[0] === 'summary') segs = segs.filter(x => x[2] === -1);
    segs.push(s.slice());
  }
  CTX.segs = segs;
  CTX.pending = new Map();
  for (const s of all) if (s[2] === turnN) { if (!CTX.pending.has(s[0])) CTX.pending.set(s[0], []); CTX.pending.get(s[0]).push(s.slice()); }
  // reminders and stand-ins for older history are in place the moment the turn starts
  for (const k of ['rem', 'older']) for (const s of CTX.pending.get(k) || []) CTX.segs.push(s);
  CTX.pending.delete('rem'); CTX.pending.delete('older');
}
// take the next real segment of a kind for the current turn, or make one up from a size
function ctxTake(kind, fallbackTok, label) {
  const q = CTX.pending.get(kind);
  const s = q && q.length ? q.shift() : [kind, Math.max(1, Math.round(fallbackTok)), S_.turn ?? 0, label || kind];
  CTX.segs.push(s); return s;
}
const ctxTokens = () => CTX.segs.reduce((a, s) => a + s[1], 0);
// a request in token order: system prompt, tool definitions, then the rest of the conversation
function requestLayout() {
  const out = [];
  for (const s of CTX.segs) if (s[0] === 'sys') out.push(['sys', s[1]]);
  if (CTX.toolsTok) out.push(['tools', CTX.toolsTok]);
  for (const s of CTX.segs) if (s[0] !== 'sys') out.push([s[0], s[1]]);
  return out;
}
// the request as cars: one per cache block (or per few blocks when the request is long)
function requestCars(input, maxCars = 64) {
  const lay = requestLayout(), tot = lay.reduce((a, s) => a + s[1], 0) || 1, k = (input || tot) / tot;
  const blocks = Math.max(1, Math.ceil((input || tot) / BLOCK_TOK)), per = Math.max(1, Math.ceil(blocks / maxCars)), n = Math.ceil(blocks / per), cars = [];
  for (let j = 0; j < n; j++) {
    const mid = (j + 0.5) * per * BLOCK_TOK / k; let acc = 0, kind = lay[lay.length - 1]?.[0] || 'older';
    for (const [kd, tok] of lay) { acc += tok; if (acc >= mid) { kind = kd; break; } }
    cars.push(segHex(kind));
  }
  return { cars, per, blocks };
}
// paint the conversation array: cells in order, coloured by kind, fresh ones flashing
let sramShown = 0;
function paintSram(flashNew = true) {
  const R = ST.sram.refs, tot = ctxTokens();
  let per = 32; while (tot / per > R.N * 0.94) per *= 2;
  R.per = per; let i = 0;
  const prev = R.hex.slice();
  R.hex.fill(null);
  for (const s of CTX.segs) { const n = Math.max(1, Math.round(s[1] / per)); for (let j = 0; j < n && i < R.N; j++, i++) R.hex[i] = segHex(s[0]); }
  if (flashNew) for (let j = 0; j < i; j++) if (prev[j] !== R.hex[j]) R.fresh[j] = 1;
  sramShown = i; R.dirty = true;
  R.scr.paint({ t: `${fmtK(tot)} tok · 1 格 = ${per} tok` });
  paintComposition();
}
// the HUD's stacked bar of the context by kind
function paintComposition() {
  const by = {}; for (const [k, tok] of requestLayout()) by[k] = (by[k] || 0) + tok;
  const order = ['sys', 'tools', 'info', 'rem', 'older', 'summary', 'user', 'think', 'text', 'call', 'result'];
  const bar = $('#comp-bar'), leg = $('#comp-legend'); if (!bar) return;
  const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1;
  bar.innerHTML = order.filter(k => by[k]).map(k => `<i style="--c:${SEG[k].css};flex-grow:${by[k]}" title="${SEG[k].name} · ${fmtK(by[k])}"></i>`).join('');
  leg.innerHTML = order.filter(k => by[k] && by[k] / tot > 0.012).map(k => `<span><i style="background:${SEG[k].css}"></i>${SEG[k].name} ${Math.round((100 * by[k]) / tot)}%</span>`).join('');
  $('#comp-note').textContent = `${fmtK(tot)} tok${CTX.toolsTok ? ' · 含工具定义' : ''}`;
}
// the HUD's block bar of the last request: one square per cache block, cached ones cyan
function paintRequestBar(input, cached, per) {
  const el = $('#req-bar'); if (!el) return;
  const blocks = Math.ceil(input / BLOCK_TOK), hit = Math.floor(cached / BLOCK_TOK), p = Math.max(1, Math.ceil(blocks / 160)), n = Math.ceil(blocks / p);
  el.innerHTML = Array.from({ length: n }, (_, j) => `<i style="--c:${j * p < hit ? '#18c4dc' : '#1fa58e'};background:var(--c)"></i>`).join('');
  $('#req-note').textContent = `${fmtK(input)} tok · 命中 ${fmtK(cached)}（${input ? Math.round((100 * cached) / input) : 0}%）`;
  $('#req-sub').textContent = `${blocks} 块 × 256 tok${p > 1 ? ` · 每格 ${p} 块` : ''}：青色命中缓存，蓝绿重新预填`;
}
