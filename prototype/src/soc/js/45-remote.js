// ═════════════════════════ the remote package: the inference service ═════════════════════════
// None of this runs on the user's machine: the harness only sees it through the API — the bill
// (input / cached / output tokens), the timing (TTFT, stream rate) and the errors (429s, retries).
// The drawing follows how inference servers generally work: a front end that tokenises and
// batches, a model die that prefills and decodes, KV-cache pages in HBM, and a prefix index that
// lets a request reuse the pages of an earlier one. Cached reads in grok's usage arrive in whole
// 256-token blocks, so one page here is one 256-token block.
const FRONT = { x0: 118, x1: 180, z0: -142, z1: -90 };
const PE = { x0: 202, z0: -50, n: 20, p: 3.4 };                 // the compute array on the model die
const PIDX = { x0: 202, x1: 304, z0: 26, z1: 52 };              // the prefix index (prompt cache)
const SAMP = { x: 292, z: -36 };
const KVP = { cols: 8, rows: 10, w: 40, d: 52 };                // pages per HBM stack: 8 × 10
const KV_PAGES = HBM.length * KVP.cols * KVP.rows;
const BLOCK_TOK = 256;
// the page grid: page i in stack s
const pagePos = i => { const s = Math.floor(i / (KVP.cols * KVP.rows)) % HBM.length, j = i % (KVP.cols * KVP.rows), H = HBM[s]; return V(H.x - KVP.w / 2 + 3.4 + (j % KVP.cols) * 4.6, DIE_Y + 13.4, H.z - KVP.d / 2 + 4 + Math.floor(j / KVP.cols) * 4.9); };

station('front', {
  name: '推理前端', role: '分词 · 排队 · 限流 · retry_state', color: FLUID.context,
  desc: '请求越过网络先到推理服务的前端：分词、排进批次、检查配额。限流（HTTP 429）、服务过载、超时都从这里返回，harness 那边看到的就是 retry_state 和自救。前端也把模型吐出的 token 解码成文字，顺着 SSE 流送回本机。',
  work: [(FRONT.x0 + FRONT.x1) / 2, DIE_Y + 30, -70], pin: [FRONT.x0 + 6, DIE_Y + 18, (FRONT.z0 + FRONT.z1) / 2],
  build(S, g) {
    const D = { x0: FRONT.x0, x1: FRONT.x1, z0: FRONT.z0, z1: FRONT.z1 };
    buildDie(D, { name: 'FRONTEND  推理前端', size: 2.4, parent: g, color: 0xcdc9d8 });
    const k = new Kit({ tone: 0.5 });
    block(k, 'tok', D.x0 + 3, D.z0 + 4, D.x0 + 30, D.z1 - 4, { tex: 'logic', label: 'TOKENIZER', sub: 'bytes ⇄ tokens' });
    block(k, 'batch', D.x0 + 33, D.z0 + 4, D.x1 - 3, D.z1 - 18, { tex: 'grid', pitch: 2.2, label: 'BATCHER', sub: '连续批处理' });
    block(k, 'quota', D.x0 + 33, D.z1 - 15, D.x1 - 3, D.z1 - 4, { tex: 'logic', label: 'QUOTA', labelSize: 1.9 });
    phyPads(k, D.x0, D.z0, D.x1, D.z1, 'w');
    k.finish(g);
    // the batch slots: ours glows, other people's requests come and go
    const slots = [];
    for (let i = 0; i < 6; i++) slots.push(lampMesh(g, [D.x0 + 37 + (i % 3) * 7.5, DIE_Y + 1.6, D.z0 + 14 + Math.floor(i / 3) * 8], 1.3, i === 0 ? FLUID.context : 0xb9b4a8));
    const quota = lampMesh(g, [D.x1 - 8, DIE_Y + 1.4, D.z1 - 9], 1.2, FLUID.ok);
    return { slots, quota, busy: 0, err: 0, others: [0, 0, 0, 0, 0, 0] };
  },
  update(S, t, dt) {
    const R = S.refs; R.busy = Math.max(0, R.busy - dt); R.err = Math.max(0, R.err - dt);
    R.slots.forEach((m, i) => {
      if (i === 0) setLamp(m, R.busy > 0 ? 0.8 : 0.12, R.err > 0 ? FLUID.err : FLUID.context);
      else { R.others[i] = Math.max(0, R.others[i] - dt); if (R.others[i] <= 0 && Math.random() < dt * 0.25) R.others[i] = 2 + Math.random() * 5; setLamp(m, R.others[i] > 0 ? 0.45 : 0.04, 0xb9b4a8); }
    });
    setLamp(R.quota, R.err > 0 ? (Math.sin(t * 12) > 0 ? 1 : 0.2) : 0.3, R.err > 0 ? FLUID.err : FLUID.ok);
  },
});

station('lm', {
  name: '模型', role: '预填 · 解码 · 采样 · first_token', color: FLUID.reason,
  desc: '模型芯片中间是计算阵列：预填（prefill）时一道波前斜着扫过整片阵列，把这次没命中缓存的块算出 KV；之后每生成一个 token 就有一条窄带掠过（decode）。右上角的采样器在一圈 logits 里挑出下一个 token：紫色是推理，蓝色是正文，琥珀色是工具调用的参数。第一个 token 出来的时刻就是 TTFT。',
  work: [LM.x0 + 50, DIE_Y + 40, LM.z1 + 30], pin: [LM.x0 + 8, DIE_Y + 22, LM.z0 + 8],
  build(S, g) {
    buildDie(LM, { name: 'MODEL  模型 · ' + (SESSION.model || 'grok'), size: 3, parent: g, color: 0xcdc9d8 });
    const k = new Kit({ tone: 0.5 });
    // the compute array sits on a block; HBM PHYs along both sides; the sampler in the corner
    const arr = block(k, 'pe', PE.x0 - 2, PE.z0 - 2, PE.x0 + PE.n * PE.p + 2, PE.z0 + PE.n * PE.p + 2, { color: MAT.siDark, h: 0.4 });
    block(k, 'hbmphy_w', LM.x0 + 1.5, LM.z0 + 4, LM.x0 + 6, LM.z1 - 4, { tex: 'grid', pitch: 1.4 });
    block(k, 'hbmphy_e', LM.x1 - 6, LM.z0 + 4, LM.x1 - 1.5, LM.z1 - 4, { tex: 'grid', pitch: 1.4 });
    block(k, 'samp', SAMP.x - 11, SAMP.z - 13, SAMP.x + 11, SAMP.z + 13, { label: 'SAMPLER', labelSize: 1.8 });
    block(k, 'pidx', PIDX.x0, PIDX.z0, PIDX.x1, PIDX.z1, { label: 'PREFIX INDEX · PROMPT CACHE', sub: '256-token 块 · 前缀匹配', labelSize: 2 });
    for (const sx of [-1, 1]) spiral(k, sx < 0 ? LM.x0 + 14 : LM.x1 - 30, LM.z1 - 10, DIE_Y + 0.6, 1, 4.2, 4);
    k.finish(g);
    const cells = new THREE.InstancedMesh(slabGeo(PE.p - 0.6, 0.5, PE.p - 0.6, 0, 0.12), fluidMat(0xffffff), PE.n * PE.n);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < PE.n; i++) for (let j = 0; j < PE.n; j++) { m4.makeTranslation(PE.x0 + (i + 0.5) * PE.p, arr.y, PE.z0 + (j + 0.5) * PE.p); cells.setMatrixAt(i * PE.n + j, m4); cells.setColorAt(i * PE.n + j, col.set(0xd6d3de)); }
    cells.castShadow = false; cells.userData.tone = 0.3; g.add(cells);
    // the sampler: sixteen logit bars and a pointer
    const bars = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, b = mesh(slabGeo(0.9, 1, 3.4, 0, 0.15), solid(MAT.paper, { glow: 0, glowColor: FLUID.text }), g, [SAMP.x + Math.cos(a) * 5.4, DIE_Y + 0.9, SAMP.z + 2 + Math.sin(a) * 5.4], [0, Math.PI / 2 - a, 0], { tone: 0.75 }); b.scale.y = 0.5; bars.push(b); }
    const piv = group(g, [SAMP.x, DIE_Y + 0.9, SAMP.z + 2]);
    const kp = new Kit({ tone: 0.9 }); kp.cyl(1.6, 1.4, { color: MAT.graphite, seg: 16 }); kp.box(0.6, 0.5, 6.4, { p: [0, 1.4, 3.2], color: MAT.redlamp, paint: 1 }); kp.finish(piv);
    const halo = glow(g, FLUID.reason, 60, [PE.x0 + PE.n * PE.p / 2, DIE_Y + 6, PE.z0 + PE.n * PE.p / 2]);
    return { cells, col, bars, piv, halo, heat: new Float32Array(PE.n * PE.n), hue: new Array(PE.n * PE.n).fill(FLUID.context), waves: [], barH: new Array(16).fill(0.5), barGoal: new Array(16).fill(0.5), sel: 0, flash: 0, pick: 0, pickGoal: 0, err: 0, mode: null };
  },
  update(S, t, dt) {
    const R = S.refs, N = PE.n;
    // waves: a prefill front sweeps the array diagonally, a decode pulse is a thin band
    for (let i = R.waves.length - 1; i >= 0; i--) {
      const w = R.waves[i]; w.u += dt / w.dur;
      const front = w.u * (2 * N + 6) - 3;
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) { const d = a + b - front; if (d > -w.band && d < 0.6) { const k = a * N + b; R.heat[k] = Math.max(R.heat[k], 1 - Math.abs(d) / (w.band + 0.6)); R.hue[k] = w.hex; } }
      if (w.u >= 1) R.waves.splice(i, 1);
    }
    const idle = THEME === 'dark' ? 0x34333c : 0xd6d3de, tmp = R.tmp ?? (R.tmp = new THREE.Color());
    for (let k = 0; k < N * N; k++) { R.heat[k] = Math.max(0, R.heat[k] - dt * 2.4); R.cells.setColorAt(k, R.heat[k] > 0.02 ? R.col.set(idle).lerp(tmp.set(R.hue[k]), Math.min(1, R.heat[k] * 1.3)) : R.col.set(idle)); }
    R.cells.instanceColor.needsUpdate = true;
    R.err = Math.max(0, R.err - dt);
    const live = R.mode === 'r' ? FLUID.reason : R.mode === 't' ? FLUID.text : R.mode === 'c' ? FLUID.tool : FLUID.context;
    R.halo.userData.set(R.err > 0 ? 0.5 + 0.3 * Math.sin(t * 14) : R.waves.length ? 0.35 : 0, R.err > 0 ? FLUID.err : live);
    R.flash = Math.max(0, R.flash - dt * 3);
    R.bars.forEach((b, i) => { R.barH[i] = damp(R.barH[i], R.barGoal[i], 12, dt); b.scale.y = R.barH[i]; setLamp(b, i === R.sel ? R.flash * 0.95 : 0, live); });
    let d = R.pickGoal - R.pick; d = Math.atan2(Math.sin(d), Math.cos(d)); R.pick += d * (1 - Math.exp(-14 * dt)); R.piv.rotation.y = Math.PI / 2 - R.pick;
  },
});
// a forward pass across the compute array: prefill is a wide slow front, decode a quick narrow one
function lmWave(hex, prefill) { const R = ST.lm.refs; R.waves.push({ u: 0, dur: prefill ? 1.1 : 0.32, band: prefill ? 6 : 1.4, hex }); if (R.waves.length > 4) R.waves.shift(); }
function lmSample(hex) {
  const R = ST.lm.refs, r = Math.random, sel = Math.floor(r() * 16);
  for (let i = 0; i < 16; i++) R.barGoal[i] = 0.35 + r() * r() * 2.4;
  R.barGoal[sel] = 3.2 + r(); R.sel = sel; R.pickGoal = (sel / 16) * TAU; R.flash = 1;
  lmWave(hex, false);
}

station('hbm', {
  name: 'KV 缓存', role: 'KV 页 · HBM', color: FLUID.cache,
  desc: '六个 HBM 堆叠里放着 KV 缓存，一格是一页、装 256 个 token 在所有层上的 key / value。这次请求命中前缀的页亮青色（直接复用），预填新算出来的页是蓝绿色，解码时追加的页是紫色或蓝色；灰色暖调的页属于同一台服务器上别人的会话。会话闲置太久，属于它的页会被回收，下一次请求就得从头预填。',
  work: [HBM[1].x, DIE_Y + 40, HBM[1].z + 30], pin: [HBM[1].x + 14, DIE_Y + 26, HBM[1].z - 20],
  build(S, g) {
    const k = new Kit({ tone: 0.5 });
    for (const H of HBM) {
      k.box(KVP.w + 2, 1.2, KVP.d + 2, { p: [H.x, INT_Y, H.z], color: MAT.siDark, tone: 0.4 });
      for (let i = 0; i < 8; i++) k.box(KVP.w, 1.3, KVP.d, { p: [H.x, INT_Y + 1.2 + i * 1.5, H.z], b: 0.12, color: i % 2 ? MAT.graphite : 0x6a6c72, tone: 0.5 });
      k.box(KVP.w, 0.6, KVP.d, { p: [H.x, INT_Y + 13.2, H.z], b: 0.2, color: MAT.alu, tone: 0.6 });
      // the short wide link to the model die
      const toward = H.x < LM.x0 ? 1 : -1;
      for (let j = 0; j < 9; j++) k.line([[H.x + toward * (KVP.w / 2 + 1), INT_Y + 0.05, H.z - 16 + j * 4], [toward > 0 ? LM.x0 - 1 : LM.x1 + 1, INT_Y + 0.05, H.z * 0.5 - 8 + j * 2]], 'lo');
    }
    k.finish(g);
    silk('HBM · KV PAGES', HBM[1].x, HBM[1].z + KVP.d / 2 + 5, { y: INT_Y + 0.1, size: 2.2 });
    const pages = new THREE.InstancedMesh(slabGeo(3.8, 0.35, 4.1, 0, 0.1), fluidMat(0xffffff), KV_PAGES);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < KV_PAGES; i++) { m4.makeTranslation(...pagePos(i).toArray()); pages.setMatrixAt(i, m4); pages.setColorAt(i, col.set(0xcfcdd6)); }
    pages.castShadow = false; pages.userData.tone = 0.3; g.add(pages);
    // other tenants hold scattered pages; ours are allocated from the start of the free list
    const r = mulberry32(31), owner = new Array(KV_PAGES).fill(null);
    for (let i = 0; i < KV_PAGES; i++) if (r() < 0.34) owner[i] = 'other';
    return { pages, col, owner, hex: new Array(KV_PAGES).fill(null), dirty: true, ours: [], scale: 1, churn: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    // the neighbours' pages come and go
    R.churn += dt; if (R.churn > 1.6) { R.churn = 0; for (let n = 0; n < 4; n++) { const i = Math.floor(Math.random() * KV_PAGES); if (R.hex[i] == null) { R.owner[i] = R.owner[i] === 'other' ? null : 'other'; R.dirty = true; } } }
    if (!R.dirty) return; R.dirty = false;
    const free = THEME === 'dark' ? 0x2c2b33 : 0xcfcdd6, other = THEME === 'dark' ? 0x4a453c : 0xc4b9a4;
    for (let i = 0; i < KV_PAGES; i++) R.pages.setColorAt(i, R.col.set(R.hex[i] ?? (R.owner[i] === 'other' ? other : free)));
    R.pages.instanceColor.needsUpdate = true;
  },
});

// ── the prefix index: the session's cached prefix as a chain of 256-token blocks ──
// A request walks the chain from the root: every block that matches is a cache hit (cyan); at the
// first difference the chain forks — the old tail is left behind to be evicted — and the rest of
// the request is prefilled as new blocks (teal). The decode output becomes more blocks at the end.
const PC = { cols: 44, rows: 2, x0: PIDX.x0 + 3, z0: PIDX.z0 + 8.6, p: 2.24 };
const PC_N = PC.cols * PC.rows;
station('pcache', {
  name: '提示缓存', role: '前缀命中 · cache_read_input_tokens', color: FLUID.cache,
  desc: '服务器按 256 个 token 一块给提示词前缀建索引。每次请求从根开始沿链比对：一样的块直接命中（青色，账单里记作 cachedReadTokens，都是 256 的整数倍），第一处不一样的地方链会分叉，旧的尾巴留在原地等着被回收，后面的部分重新预填（蓝绿色）。系统提示词和工具定义在最前面，所以换工具（比如 MCP 断开）会让从那里往后全部失效；harness 把提醒追加在末尾，就是为了不碰前面的块。会话闲置太久，整条链会过期。',
  work: [(PIDX.x0 + PIDX.x1) / 2, DIE_Y + 30, PIDX.z1 + 26], pin: [PIDX.x0 + 4, DIE_Y + 12, PIDX.z0 + 2],
  build(S, g) {
    const cells = new THREE.InstancedMesh(slabGeo(PC.p - 0.5, 0.5, 2.8, 0, 0.12), fluidMat(0xffffff), PC_N);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < PC_N; i++) { m4.makeTranslation(PC.x0 + (i % PC.cols + 0.5) * PC.p, DIE_Y + 0.55, PC.z0 + Math.floor(i / PC.cols) * 6.2); cells.setMatrixAt(i, m4); cells.setColorAt(i, col.set(0xd6d3de)); }
    cells.castShadow = false; cells.userData.tone = 0.35; g.add(cells);
    const cursor = mesh(frameGeo(3.2, 4, 0.5, 1.2), solid(0xffffff, { glow: 0.9, glowColor: FLUID.cache }), g, [PC.x0, DIE_Y + 0.5, PC.z0], [0, 0, 0], { tone: 0.8, cast: false });
    cursor.visible = false;
    const scale = makeScreen(26, 3.2, 20, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `500 ${h * 0.6}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(s.t || '1 格 = 256 tok', w * 0.03, h * 0.55); });
    scale.mesh.rotation.x = -Math.PI / 2; scale.mesh.position.set(PIDX.x1 - 15, DIE_Y + 0.62, PIDX.z0 + 2.6); g.add(scale.mesh); scale.paint({ t: '1 格 = 256 tok' });
    return { cells, col, cursor, scale, chain: [], fork: [], per: 1, walk: null, dirty: true, expired: false };
  },
  update(S, t, dt) {
    const R = S.refs;
    if (R.walk) {
      const W = R.walk; W.t += dt;
      const upto = Math.min(W.to, Math.floor(W.t * W.rate));
      for (let i = W.done + 1; i <= upto; i++) { if (i < W.hits) R.chain[i] = FLUID.cache; else if (i < W.to) R.chain[i] = 0x1fa58e; }
      W.done = upto; R.dirty = true;
      const c = Math.min(upto, PC.cols * 2 - 1);
      R.cursor.visible = true; R.cursor.position.set(PC.x0 + (c % PC.cols + 0.5) * PC.p, DIE_Y + 0.5, PC.z0 + Math.floor(c / PC.cols) * 6.2);
      setLamp(R.cursor, 0.9, upto < W.hits ? FLUID.cache : 0x1fa58e);
      if (upto >= W.to) { R.walk = null; R.cursor.visible = false; }
    }
    if (!R.dirty) return; R.dirty = false;
    const empty = THEME === 'dark' ? 0x34333c : 0xd6d3de;
    for (let i = 0; i < PC_N; i++) {
      // the main chain fills the first row and wraps; the abandoned fork shows faintly underneath
      const hex = R.chain[i] ?? (R.fork[i] != null ? (THEME === 'dark' ? 0x3d4a50 : 0xb9d6dc) : empty);
      R.cells.setColorAt(i, R.col.set(hex));
    }
    R.cells.instanceColor.needsUpdate = true;
  },
});
// one request reaches the server: `input` tokens, of which `cached` came from the prefix cache
function pcacheRequest(input, cached) {
  const R = ST.pcache.refs, blocks = Math.ceil(input / BLOCK_TOK), hitB = Math.floor(cached / BLOCK_TOK);
  R.per = Math.max(1, Math.ceil(blocks / PC_N));
  const to = Math.min(PC_N, Math.ceil(blocks / R.per)), hits = Math.min(to, Math.floor(hitB / R.per));
  // where the old chain stops matching, its tail becomes a fork that will be evicted
  const old = R.chain.length;
  R.fork = old > hits ? R.chain.map((h, i) => (i >= hits ? 1 : null)) : [];
  R.chain = R.chain.slice(0, hits).map(() => null);
  R.walk = { t: 0, rate: Math.max(30, to / 0.9), to, hits, done: -1 };
  R.scale.paint({ t: `1 格 = ${R.per * BLOCK_TOK} tok · 命中 ${hitB} 块` });
  R.dirty = true;
  if (R.fork.length) after(2.4, () => { R.fork = []; R.dirty = true; });
  return { blocks, hitB, per: R.per };
}
// decode output extends the chain (those blocks will be cached for the next request)
function pcacheExtend(n = 1) { const R = ST.pcache.refs; for (let i = 0; i < n && R.chain.length < PC_N; i++) R.chain.push(FLUID.reason); R.dirty = true; }
function pcacheExpire() { const R = ST.pcache.refs; R.fork = R.chain.map(() => 1); R.chain = []; R.dirty = true; after(2, () => { R.fork = []; R.dirty = true; }); }
