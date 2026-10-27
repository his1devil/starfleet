// ═════════════════════════ the model side: context, prefill, the core, the KV cache ═════════════════════════
// Messages are cartridges. Each one stands in a slot of the context magazine with its role on its
// cap: gold for the user, blue for the model's answer, green for a tool result, red for a failure,
// teal for a compacted summary. The courier carries them; the core reads them all on every request.

// ── cartridges: the thing the courier carries (a body and a coloured cap it grips by) ──
const CART = { w: 3.6, h: 11.6, d: 9, cap: 2 };
const HOLD = 11.2;   // a held cartridge hangs this far below the courier's head
function makeCart(hex, label = MAT.pale) {
  const g = new THREE.Group();
  const body = mesh(slabGeo(CART.w, CART.h, CART.d, 0.4, 0.3), solid(label), g, [0, 0, 0], [0, 0, 0], { tone: 0.8 });
  const cap = mesh(slabGeo(CART.w + 0.3, CART.cap, CART.d + 0.3, 0.5, 0.4), fluidMat(hex), g, [0, CART.h, 0], [0, 0, 0], { tone: 0.85 });
  // the fill bar on the side: how much of the job has streamed in
  const fill = mesh(slabGeo(0.3, 1, CART.d - 3), fluidMat(hex), g, [CART.w / 2 + 0.05, 1.5, 0], [0, 0, 0], { tone: 0.6, cast: false });
  fill.scale.y = CART.h - 3;
  g.userData = { cart: true, body, cap, fill };
  return g;
}
function recolorCart(c, hex) { c.userData.cap.material.color.set(hex); c.userData.fill.material.color.set(hex); }
function cartFill(c, k) { c.userData.fill.scale.y = Math.max(0.2, (CART.h - 3) * clamp(k, 0, 1)); }
function dropItem(item, parent, pos) { item.removeFromParent(); parent.add(item); if (pos) item.position.copy(pos); }
// the log scale used by every context reading: 0.1 % → 0, 100 % → 1
const ctxFrac = r => clamp((Math.log10(Math.max(r, 1e-3)) + 3) / 3, 0, 1);

// ── 1 · the context magazine and its gauge ──
const MAG_ROWS = [-53, -41], MAG_N = 20, MAG_Y = TOP + 5;
const magSlot = i => V(MAG.x0 + 5 + (i % MAG_N) * ((MAG.x1 - MAG.x0 - 10) / (MAG_N - 1)), MAG_Y, MAG_ROWS[Math.floor(i / MAG_N) % 2]);
const GAUGE = { x: -292, z: -47, n: 24, y0: TOP + 6, step: 2.25 };
station('ctx', {
  name: '上下文卡匣', role: '上下文窗口 · _meta.totalTokens', color: FLUID.context,
  desc: '每条消息是一盒卡匣，插在两排槽位里，盒盖的颜色是它的角色：金色是你的委托，蓝色是模型的回答，绿色是工具结果，红色是失败，青色是压缩后的摘要。左端的灯柱是上下文占用（_meta.totalTokens / 窗口），对数刻度：0.1%、1%、10%、100% 各占三分之一；红线是 85% 自动压缩线。每次请求，整排卡匣都会被 DMA 读进模型核心。',
  work: [(MAG.x0 + MAG.x1) / 2, TOP + 40, MAG.z], pin: [MAG.x0 + 20, TOP + 30, MAG.z - 14],
  build(S, g) {
    const { x0, x1, z } = MAG, k = new Kit({ tone: 0.5 });
    // the tray: a base, a slotted comb for each row, end blocks with handles, a label rail in front
    k.box(x1 - x0, 3, 30, { p: [(x0 + x1) / 2, TOP, z], rr: 2, b: 0.6, color: MAT.pale, tone: 0.45 });
    for (const rz of MAG_ROWS) {
      k.box(x1 - x0 - 4, 2, 10.6, { p: [(x0 + x1) / 2, TOP + 3, rz], rr: 0.8, b: 0.3, color: MAT.graphite, tone: 0.4 });
      for (let i = 0; i <= MAG_N; i++) { const x = x0 + 5 + (i - 0.5) * ((x1 - x0 - 10) / (MAG_N - 1)); k.box(0.6, 4.2, 10.8, { p: [x, TOP + 3, rz], color: MAT.steel, tone: 0.45 }); }
    }
    for (const x of [x0 + 1.5, x1 - 1.5]) { k.box(3, 12, 30, { p: [x, TOP, z], rr: 1, b: 0.4, color: MAT.paper, tone: 0.55 }); k.tube([[x, TOP + 6, z - 8], [x + (x < 0 ? -3 : 3), TOP + 6, z - 8], [x + (x < 0 ? -3 : 3), TOP + 6, z + 8], [x, TOP + 6, z + 8]], 0.5, { color: MAT.steel, bend: 1, radial: 6 }); }
    k.box(x1 - x0 - 30, 4, 1.4, { p: [(x0 + x1) / 2 + 10, TOP + 1, z + 15.7], color: MAT.paper, tone: 0.5 });
    for (let i = 0; i < MAG_N; i += 5) { const p = magSlot(i); k.line([[p.x, TOP + 3.1, z + 15.2], [p.x, TOP + 3.1, z + 14]], 'mid'); }
    // the gauge column: a framed stack of segments, the 85 % mark in red
    const G = GAUGE, gh = G.n * G.step + 6;
    k.box(10, gh, 10, { p: [G.x, TOP, G.z], rr: 1.4, b: 0.5, color: MAT.paper, tone: 0.55 });
    k.box(7.4, gh - 4, 1, { p: [G.x, TOP + 2, G.z + 5.2], color: MAT.graphite, tone: 0.4 });
    const y85 = G.y0 + ctxFrac(0.85) * G.n * G.step;
    k.box(9, 0.8, 1.2, { p: [G.x, y85, G.z + 5.9], color: MAT.redlamp, paint: 1, tone: 0.6 });
    for (const f of [0.001, 0.01, 0.1, 1]) { const y = G.y0 + ctxFrac(f) * G.n * G.step; k.line([[G.x - 5.2, y, G.z + 5.3], [G.x - 6.8, y, G.z + 5.3]], 'mid'); }
    k.finish(g);
    const segs = new THREE.InstancedMesh(slabGeo(6, G.step - 0.55, 1, 0, 0), fluidMat(0xffffff), G.n);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < G.n; i++) { m4.makeTranslation(G.x, G.y0 + i * G.step, G.z + 5.9); segs.setMatrixAt(i, m4); segs.setColorAt(i, col.set(MAT.pale)); }
    segs.userData.tone = 0.6; segs.castShadow = false; g.add(segs);
    const halo = glow(g, FLUID.context, 26, [G.x, G.y0 + 20, G.z + 7]);
    // the cartridges in the slots: instanced bodies and caps, empty slots scaled to nothing
    const bodies = new THREE.InstancedMesh(slabGeo(CART.w, CART.h, CART.d, 0.4, 0.3), solid(MAT.pale), MAG_N * 2);
    const caps = new THREE.InstancedMesh(slabGeo(CART.w + 0.3, CART.cap, CART.d + 0.3, 0.5, 0.4), fluidMat(0xffffff), MAG_N * 2);
    for (const I of [bodies, caps]) { I.castShadow = true; I.receiveShadow = true; I.userData.tone = 0.7; I.frustumCulled = false; g.add(I); }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAG_N * 2; i++) { bodies.setMatrixAt(i, zero); caps.setMatrixAt(i, zero); caps.setColorAt(i, col.set(0xffffff)); }
    const scr = makeScreen(22, 3.4, 22, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `600 ${h * 0.56}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(fitText(c, s.t || 'CTX · 0 msg', w * 0.96), w * 0.03, h * 0.55); });
    scr.mesh.position.set(x0 + 37, TOP + 3.1, z + 16.45); g.add(scr.mesh); scr.paint({ t: 'CTX · 0 msg' });
    const R = { segs, halo, bodies, caps, scr, level: 0, shown: 0, n: 0, hot: false, col, m4, zero, flash: 0 };
    // put a cartridge of colour `hex` in slot i (or empty it with null)
    R.put = (i, hex) => {
      i %= MAG_N * 2;
      if (hex == null) { bodies.setMatrixAt(i, zero); caps.setMatrixAt(i, zero); }
      else { const p = magSlot(i); m4.makeTranslation(p.x, p.y, p.z); bodies.setMatrixAt(i, m4); m4.makeTranslation(p.x, p.y + CART.h, p.z); caps.setMatrixAt(i, m4); caps.setColorAt(i, col.set(hex)); }
      bodies.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; caps.instanceColor.needsUpdate = true;
    };
    R.clear = () => { for (let i = 0; i < MAG_N * 2; i++) R.put(i, null); R.n = 0; };
    return R;
  },
  update(S, t, dt) {
    const R = S.refs, G = GAUGE;
    R.shown = damp(R.shown, R.level, 4, dt);
    const lit = R.shown * G.n, hot = R.level >= ctxFrac(0.85) - 1e-3;
    for (let i = 0; i < G.n; i++) {
      const on = i < lit - 0.02, part = clamp(lit - i, 0, 1);
      R.segs.setColorAt(i, R.col.set(on || part > 0.3 ? (hot ? FLUID.err : FLUID.context) : MAT.pale));
    }
    R.segs.instanceColor.needsUpdate = true;
    R.flash = Math.max(0, R.flash - dt * 1.5);
    R.halo.userData.set((hot ? 0.45 + 0.25 * Math.sin(t * 6) : 0.12 * R.shown) + R.flash * 0.5, hot ? FLUID.err : FLUID.context);
  },
});

// ── 2 · the DMA engine: every request streams the whole magazine into the core ──
station('dma', {
  name: '预填充 DMA', role: '模型请求 · loop_started', color: FLUID.context,
  desc: '每次模型请求（loop_started）都从这里开始：DMA 把上下文卡匣里的全部消息按顺序读出来，沿青色总线送进模型核心做预填充（prefill）。屏幕上是第几次请求和送进去的 token 数。',
  work: [DMA.x, TOP + 36, DMA.z + 8], pin: [DMA.x, TOP + 26, DMA.z],
  build(S, g) {
    const { x, z } = DMA, k = new Kit({ tone: 0.55 });
    k.box(20, 2.4, 20, { p: [x, TOP, z], rr: 1.2, b: 0.4, color: MAT.graphite, tone: 0.45 });
    for (let i = -4; i <= 4; i++) for (const s of [-1, 1]) { k.box(1, 0.6, 2.4, { p: [x + i * 2, TOP, z + s * 11], color: MAT.steel, tone: 0.3 }); k.box(2.4, 0.6, 1, { p: [x + s * 11, TOP, z + i * 2], color: MAT.steel, tone: 0.3 }); }
    k.box(16, 1.6, 16, { p: [x, TOP + 2.4, z], rr: 0.8, b: 0.3, color: MAT.alu, tone: 0.5 });
    for (let i = 0; i < 7; i++) k.box(1, 9, 15, { p: [x - 6 + i * 2, TOP + 4, z], color: MAT.alu, tone: 0.55 });
    // a status display on a stand in front
    const scr = standScreen(g, k, x, z + 14, 13, 6, lcdDraw, { px: 26 });
    k.finish(g);
    scr.paint({ title: 'DMA · idle', lines: ['—'], rows: 2 });
    const lamps = [lampMesh(g, [x - 7, TOP + 3.4, z + 10.6], 0.7, FLUID.context), lampMesh(g, [x + 7, TOP + 3.4, z + 10.6], 0.7, FLUID.context)];
    return { scr, lamps, act: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.act = Math.max(0, R.act - dt); R.lamps.forEach((m, i) => setLamp(m, R.act > 0 ? (Math.sin(t * 24 + i * 2) > 0 ? 0.9 : 0.2) : 0.05)); },
});

// ── 3 · the model: twelve layer trays × 28 positions, and the decoder carriage that runs in front ──
// Each tray is a layer; each column is a stretch of the context. The cells are the KV cache: the
// cached prefix glows cyan, freshly prefilled positions teal, and every generated token runs a
// pass up its column — the carriage's read head climbs the layers, attention arcs reach back to
// earlier positions, and the sampler on top picks the next token.
const GY0 = TOP + SUBST.h + 6;
const colX = c => GRID.x0 + (c + 0.5) * GRID.px;
const rowY = r => GY0 + r * GRID.py;
const GRID_W = GRID.cols * GRID.px, GRID_TOP = rowY(GRID.rows - 1) + 6;
const CAR_Z = GRID.z + 10;            // the carriage rides in front of the cells
const DECK_Y = GRID_TOP + 7.5;        // the sampler deck on its top trolley
const TOKENS_PER_COL = 6;
const KV_EMPTY = () => (THEME === 'dark' ? 0x2c2e33 : 0xd7d9de);
const KV_FRESH = 0x1fa58e;   // freshly prefilled positions (teal); the cached prefix is FLUID.cache
// the finished turn is sealed into a cartridge on the pad left of the tray
const SEAL = V(TRAY.x - 20, TOP + 2, TRAY.z);
const TRAY_SPOTS = [V(TRAY.x - 7, TOP + 3, TRAY.z), V(TRAY.x, TOP + 3, TRAY.z), V(TRAY.x + 7, TOP + 3, TRAY.z)];
station('kv', {
  name: 'KV 缓存', role: '缓存命中 · cache_read_input_tokens', color: FLUID.cache,
  desc: '十二层托盘叠成一面墙：每层是 transformer 的一层，每一列是上下文里的一段位置，格子就是这一段在这一层留下的 key / value。每次请求开头（response_started）带着 cache_read_input_tokens：命中缓存的前缀直接亮成青色，剩下的部分由解码小车扫一遍、预填成蓝绿色；之后生成的 token 一列列往后追加。',
  work: [colX(5), TOP + 52, GRID.z + 44], pin: [GRID.x0 - 4, GRID_TOP + 8, GRID.z],
  build(S, g) {
    const k = new Kit({ tone: 0.55 }), cx = GRID.x0 + GRID_W / 2;
    k.box(GRID_W + 16, 4, 20, { p: [cx, TOP + SUBST.h, GRID.z - 1], rr: 1.4, b: 0.5, color: MAT.pale, tone: 0.5 });
    for (const x of [GRID.x0 - 4, GRID.x0 + GRID_W + 4]) k.box(6, GRID_TOP - (TOP + SUBST.h + 4), 14, { p: [x, TOP + SUBST.h + 4, GRID.z - 2], rr: 1, b: 0.4, color: MAT.paper, tone: 0.6 });
    k.box(GRID_W + 14, 3, 14, { p: [cx, GRID_TOP, GRID.z - 2], rr: 1, b: 0.4, color: MAT.paper, tone: 0.6 });
    for (let r = 0; r < GRID.rows; r++) k.box(GRID_W + 2, 0.9, 10, { p: [cx, rowY(r) - 0.9, GRID.z - 2], color: r % 2 ? MAT.pale : MAT.ceramic, tone: 0.45 });
    // the residual stream: a thread up each position
    for (let c = 0; c < GRID.cols; c++) k.line([[colX(c), rowY(0) - 0.9, GRID.z + 3.1], [colX(c), rowY(GRID.rows - 1) + 2.6, GRID.z + 3.1]], 'lo');
    // the rails the carriage runs on
    k.box(GRID_W + 12, 2, 4, { p: [cx, TOP + SUBST.h, CAR_Z], color: MAT.steel, tone: 0.55 });
    k.box(GRID_W + 12, 2.2, 3, { p: [cx, GRID_TOP + 0.8, CAR_Z - 2.5], color: MAT.steel, tone: 0.55 });
    for (const x of [GRID.x0 - 4, GRID.x0 + GRID_W + 4]) k.box(6, 2.2, 13, { p: [x, GRID_TOP + 0.8, GRID.z + 3], color: MAT.steel, tone: 0.5 });
    k.finish(g);
    for (let r = 0; r < GRID.rows; r += 1) silk(`L${String(r).padStart(2, '0')}`, GRID.x0 - 4, GRID.z + 5.06, { face: 'z', y: rowY(r) + 1.2, size: 1.9, alpha: 0.7 });
    const N = GRID.cols * GRID.rows, cells = new THREE.InstancedMesh(slabGeo(3.4, 2.4, 4, 0, 0.3), fluidMat(0xffffff), N);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let c = 0; c < GRID.cols; c++) for (let r = 0; r < GRID.rows; r++) { m4.makeTranslation(colX(c), rowY(r), GRID.z + 1); cells.setMatrixAt(c * GRID.rows + r, m4); cells.setColorAt(c * GRID.rows + r, col.set(KV_EMPTY())); }
    cells.castShadow = false; cells.userData.tone = 0.35; g.add(cells);
    return { cells, col, hex: new Array(N).fill(null), dirty: true, used: 0, cur: 0, n: 0, sweep: null, hit: 0 };
  },
  update(S, t, dt) {
    const K = S.refs;
    if (K.sweep) {
      const W = K.sweep; W.t += dt;
      const upto = Math.min(W.c1, W.c0 + Math.floor((W.t / W.dur) * (W.c1 - W.c0 + 1)));
      for (let c = W.done + 1; c <= upto; c++) kvSetCol(c, KV_FRESH);
      W.done = Math.max(W.done, upto);
      if (W.t >= W.dur) K.sweep = null;
    }
    if (!K.dirty) return; K.dirty = false;
    for (let i = 0; i < K.hex.length; i++) K.cells.setColorAt(i, K.col.set(K.hex[i] ?? KV_EMPTY()));
    K.cells.instanceColor.needsUpdate = true;
  },
});
const KVC = GRID.cols, KVR = GRID.rows;
function kvSetCol(c, hex, rows = KVR) { const K = ST.kv.refs; if (c < 0 || c >= KVC) return; for (let r = 0; r < KVR; r++) K.hex[c * KVR + r] = r < rows ? hex : null; K.dirty = true; }
function kvClear() { const K = ST.kv.refs; K.hex.fill(null); K.used = 0; K.cur = 0; K.n = 0; K.sweep = null; K.dirty = true; }
// how many columns the current context fills (log scale, like the gauge)
const kvUsed = tokens => clamp(Math.round(ctxFrac(tokens / WINDOW_TOKENS) * KVC * 0.72), 1, KVC - 4);
// a request: the cached prefix lights at once, the rest is prefilled by a sweep of the carriage
function kvPrefill(used, cachedCols = 0) {
  const K = ST.kv.refs;
  for (let c = used; c < KVC; c++) kvSetCol(c, null, 0);
  for (let c = 0; c < Math.min(cachedCols, used); c++) kvSetCol(c, FLUID.cache);
  K.used = used; K.cur = used; K.n = 0;
  K.sweep = cachedCols < used ? { c0: cachedCols, c1: used - 1, t: 0, dur: Math.max(0.45, (used - cachedCols) * 0.07), done: cachedCols - 1 } : null;
}
// one generated token (or tool-call token): it lands in the newest column
function kvAppend() {
  const K = ST.kv.refs, col = Math.min(K.cur, KVC - 1);
  K.n++;
  if (K.n >= TOKENS_PER_COL && K.cur < KVC - 1) { K.cur++; K.n = 0; }
  return col;
}

station('core', {
  name: '模型核心', role: '推理 · 正文 · 首 token · 工具调用', color: FLUID.reason,
  desc: '模型就是这面层墙加上前面的解码小车。预填充时小车从左扫到右，把这次要读的位置一列列点亮；之后每生成一个 token，小车停在最新一列，读头从底层爬到顶层（一次前向），每到一层都拉出几道注意力弧，连回前面的位置；顶上的采样转盘在一圈 logits 里挑出一根：紫色是推理，蓝色是正文（沿总线送到终端），琥珀色是工具调用的参数（落进派单托盘，攒成一张工单）。',
  work: [colX(14), TOP + 50, GRID.z + 50], pin: [colX(20), DECK_Y + 16, CAR_Z],
  build(S, g) {
    const k = new Kit({ tone: 0.55 });
    // the package substrate with decoupling caps along its front edge
    k.box(SUBST.x1 - SUBST.x0, SUBST.h, SUBST.z1 - SUBST.z0, { p: [(SUBST.x0 + SUBST.x1) / 2, TOP, (SUBST.z0 + SUBST.z1) / 2], rr: 2, b: 0.5, color: MAT.mask, tone: 0.4 });
    for (let i = 0; i < 30; i++) { const xx = SUBST.x0 + 4 + i * 4.7; k.line([[xx, TOP + 0.2, SUBST.z1 + 0.05], [xx + 1.2, TOP + 0.2, SUBST.z1 + 0.05]], 'lo'); }
    for (let xx = SUBST.x0 + 40; xx <= SUBST.x1 - 6; xx += 7) k.box(2.2, 1.2, 1.2, { p: [xx, TOP + SUBST.h, SUBST.z1 - 3], color: MAT.ceramic, tone: 0.45 });
    // the dispatch tray where tool-call tokens collect, and the seal pad beside it
    k.box(24, 2, 13, { p: [TRAY.x, TOP, TRAY.z], rr: 1.4, b: 0.4, color: MAT.pale, tone: 0.5 });
    for (const p of TRAY_SPOTS) k.box(5.4, 1.2, 10.6, { p: [p.x, TOP + 2, p.z], rr: 0.6, color: MAT.graphite, tone: 0.45 });
    socket(k, SEAL.x, SEAL.z);
    const scr = standScreen(g, k, SUBST.x0 + 16, SUBST.z1 - 4, 22, 7, (c, w2, h, s, P) => {
      c.fillStyle = P.screenInk; c.textBaseline = 'middle';
      c.font = `600 ${h * 0.34}px ${FONT_MONO}`; c.fillText(fitText(c, s.a || 'IDLE', w2 * 0.94), w2 * 0.03, h * 0.3);
      c.globalAlpha = 0.75; c.font = `400 ${h * 0.24}px ${FONT_MONO}`; c.fillText(fitText(c, s.b || '', w2 * 0.94), w2 * 0.03, h * 0.72); c.globalAlpha = 1;
    }, { y: TOP + SUBST.h });
    k.finish(g);
    scr.paint({ a: 'IDLE', b: '' });
    // the carriage: a bottom trolley, two uprights, a top trolley carrying the sampler deck
    const car = group(g, [colX(0), 0, CAR_Z]);
    const kc = new Kit({ tone: 0.85 });
    const yb = TOP + SUBST.h + 2;
    kc.box(11, 4.4, 8, { p: [0, yb, 0], rr: 1.2, b: 0.4, color: MAT.graphite, tone: 0.7 });
    for (const sx of [-1, 1]) kc.box(1.8, GRID_TOP - yb - 2, 2.4, { p: [sx * 4.6, yb + 4.4, 0], color: MAT.alu, tone: 0.75 });
    kc.box(13, 3.4, 10, { p: [0, GRID_TOP + 2.6, -2], rr: 1.2, b: 0.4, color: MAT.paper });
    kc.cyl(1.4, 3, { p: [0, GRID_TOP + 6, -1], color: MAT.steel, seg: 12 });
    kc.cyl(11.5, 1.6, { p: [0, DECK_Y - 1.6, -1], color: MAT.pale, seg: 44, b: 0.4 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, r0 = 10.4, r1 = i % 4 ? 11 : 11.4; kc.line([[Math.cos(a) * r0, DECK_Y + 0.05, -1 + Math.sin(a) * r0], [Math.cos(a) * r1, DECK_Y + 0.05, -1 + Math.sin(a) * r1]], 'lo'); }
    kc.finish(car);
    // the read head rides up the uprights
    const head = mesh(slabGeo(8, 3.4, 2, 0.6, 0.3), solid(0xffffff, { glow: 0.15, glowColor: FLUID.reason }), car, [0, rowY(0) - 0.5, -3.6], [0, 0, 0], { tone: 0.8 });
    // the sampler: sixteen logit bars around a hub, a pointer that picks one
    const bars = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, b = mesh(slabGeo(1.2, 1, 4.4, 0, 0.2), solid(MAT.paper, { glow: 0, glowColor: FLUID.text }), car, [Math.cos(a) * 6.6, DECK_Y, -1 + Math.sin(a) * 6.6], [0, Math.PI / 2 - a, 0], { tone: 0.75 });
      b.scale.y = 0.6; bars.push(b);
    }
    const piv = group(car, [0, DECK_Y, -1]);
    const kp = new Kit({ tone: 0.9 }); kp.cyl(2.4, 2.2, { color: MAT.graphite, seg: 18, b: 0.4 }); kp.box(0.8, 0.7, 8, { p: [0, 2.2, 4], color: MAT.redlamp, paint: 1 }); kp.finish(piv);
    // attention: arcs from the head back to earlier positions in the same layer
    const NB = 8, SEG = 10, beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * SEG * 2 * 3), 3));
    const beamMat = new THREE.LineBasicMaterial({ color: FLUID.reason, transparent: true, opacity: 0, depthWrite: false });
    const beams = new THREE.LineSegments(beamGeo, beamMat); beams.layers.set(1); beams.renderOrder = 3; beams.frustumCulled = false; g.add(beams);
    const halo = glow(car, FLUID.reason, 44, [0, DECK_Y + 2, -1]);
    const headHalo = glow(head, FLUID.reason, 16, [0, 1.7, -1]);
    return {
      scr, car, head, bars, piv, beams, beamGeo, beamMat, halo, headHalo, NB, SEG,
      heat: 0, heatGoal: 0, mode: null, passes: [], flash: 0, err: 0, quench: 0, plan: false, pick: 0, pickGoal: 0, sel: 0,
      barH: new Array(16).fill(0.6), barGoal: new Array(16).fill(0.6), carX: colX(0),
    };
  },
  update(S, t, dt) {
    const R = S.refs, K = ST.kv.refs;
    R.heat = damp(R.heat, R.heatGoal, 2, dt);
    const err = R.err > 0; R.err = Math.max(0, R.err - dt); R.quench = Math.max(0, R.quench - dt);
    // where the carriage should be: sweeping during prefill, at the newest column while decoding
    const p = R.passes[R.passes.length - 1];
    const goalX = K.sweep ? colX(lerp(K.sweep.c0, K.sweep.c1, clamp(K.sweep.t / K.sweep.dur, 0, 1))) : colX(p ? p.col : Math.min(K.cur, KVC - 1));
    R.carX = K.sweep ? goalX : damp(R.carX, goalX, 10, dt);
    R.car.position.x = R.carX;
    // passes climb the layers in ~0.3 s, lighting their column as they go
    for (let i = R.passes.length - 1; i >= 0; i--) {
      const q = R.passes[i]; q.u = Math.min(1, q.u + dt * 3.4);
      const top = Math.floor(q.u * (KVR - 1) + 1e-6);
      if (top > q.lit) { for (let r = q.lit + 1; r <= top; r++) K.hex[q.col * KVR + r] = q.hex; q.lit = top; K.dirty = true; }
      if (q.u >= 1) R.passes.splice(i, 1);
    }
    const live = R.mode === 'r' ? FLUID.reason : R.mode === 't' ? FLUID.text : R.mode === 'c' ? FLUID.tool : FLUID.context;
    const hex = err ? FLUID.err : p ? p.hex : K.sweep ? FLUID.context : live;
    const rowF = p ? p.u * (KVR - 1) : K.sweep ? (t * 6) % KVR : 0;
    R.head.position.y = rowY(rowF) - 0.5;
    setLamp(R.head, err ? 0.5 + 0.4 * Math.sin(t * 18) : p || K.sweep ? 0.95 : R.heat * 0.3 + 0.1, hex);
    R.headHalo.userData.set(p || K.sweep || err ? 0.7 : 0, hex);
    R.halo.userData.set(err ? 0.5 + 0.3 * Math.sin(t * 14) : R.quench > 0 ? R.quench * 0.5 : (p ? 0.35 : 0) + R.heat * (R.plan ? 0.08 : 0.16), err ? FLUID.err : R.quench > 0 ? FLUID.cache : live);
    // attention arcs for the pass in flight
    const pos = R.beamGeo.attributes.position.array;
    if (p && p.targets.length) {
      const y = rowY(rowF) + 1.2, zf = GRID.z + 3.2, x0 = colX(p.col);
      let o = 0;
      for (let b = 0; b < R.NB; b++) {
        const j = p.targets[b % p.targets.length], x1 = colX(j), bow = 3 + (p.col - j) * 0.55, rise = 1 + (p.col - j) * 0.12;
        for (let s = 0; s < R.SEG; s++) for (const u of [s / R.SEG, (s + 1) / R.SEG]) {
          const w = 4 * u * (1 - u);
          pos[o++] = lerp(x0, x1, u); pos[o++] = y + rise * w; pos[o++] = zf + bow * w;
        }
      }
      R.beamGeo.attributes.position.needsUpdate = true;
      R.beamMat.color.set(hex); R.beamMat.opacity = (THEME === 'dark' ? 0.6 : 0.45) * (1 - p.u * 0.4);
      R.beams.visible = true;
    } else R.beams.visible = false;
    // the sampler: bars settle toward their logits, the pointer swings to the pick
    R.flash = Math.max(0, R.flash - dt * 3);
    R.bars.forEach((b, i) => { R.barH[i] = damp(R.barH[i], R.barGoal[i], 12, dt); b.scale.y = R.barH[i]; setLamp(b, i === R.sel ? R.flash * 0.95 : 0, live); });
    let d = R.pickGoal - R.pick; d = Math.atan2(Math.sin(d), Math.cos(d)); R.pick += d * (1 - Math.exp(-14 * dt));
    R.piv.rotation.y = Math.PI / 2 - R.pick;
  },
});
// where the sampler sits right now (for sparks and smoke)
const samplerPos = () => ST.core.refs.car.localToWorld(V(0, DECK_Y + 3, -1));
// one sampled token: new logits, a pick, a pass up the newest column with attention arcs
function sampleToken(hex) {
  const R = ST.core.refs, r = Math.random;
  const sel = Math.floor(r() * 16);
  for (let i = 0; i < 16; i++) R.barGoal[i] = 0.4 + r() * r() * 3;
  R.barGoal[sel] = 4.2 + r() * 1.4;
  R.sel = sel; R.pickGoal = (sel / 16) * TAU; R.flash = 1;
  const col = kvAppend();
  // attention: the first position (the sink), the last few, and a couple of far ones
  const targets = [...new Set([0, col - 1, col - 2, col - 4, Math.floor(r() * col), Math.floor(r() * col * 0.6)].filter(j => j >= 0 && j < col))];
  R.passes.push({ u: 0, hex, col, lit: -1, targets }); if (R.passes.length > 3) R.passes.shift();
  fx.drops.emit(samplerPos(), V((r() - 0.5) * 10, 26, 8 + r() * 6), hex, 0.7, 0.7);
}

// ── 5 · the reasoning reel: thought tokens wind onto it, cleared each request ──
station('spool', {
  name: '推理卷盘', role: '推理 · agent_thought_chunk', color: FLUID.reason,
  desc: '模型在出正文之前的推理 token（agent_thought_chunk、reasoning）沿紫色总线卷到这只卷盘上；卷得越厚，这次请求想得越久。推理结束（reasoning_completed）时卷盘停转，下一次请求重新开始。',
  work: [SPOOL.x, TOP + 40, SPOOL.z + 40], pin: [SPOOL.x, TOP + 40, SPOOL.z],
  build(S, g) {
    const { x, z } = SPOOL, k = new Kit({ tone: 0.55 }), ay = TOP + 16;
    k.box(26, 3, 14, { p: [x, TOP, z], rr: 1.2, b: 0.4, color: MAT.pale, tone: 0.45 });
    for (const s of [-1, 1]) k.box(2, 16, 8, { p: [x, TOP + 3, z + s * 6.5], rr: 0.6, color: MAT.steel, tone: 0.5 });
    k.cyl(1.2, 18, { p: [x, ay, z - 9], r: [Math.PI / 2, 0, 0], color: MAT.steel, seg: 12 });
    k.finish(g);
    const reel = group(g, [x, ay, z]);
    const kr = new Kit({ tone: 0.75 });
    for (const s of [-1, 1]) { kr.cyl(12, 0.8, { p: [0, 0, s * 3.6 - (s > 0 ? 0.8 : 0)], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 40, tone: 0.7 }); }
    kr.cyl(3.6, 6.4, { p: [0, 0, -3.2], r: [Math.PI / 2, 0, 0], color: MAT.alu, seg: 24 });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; kr.add(cylGeo(1.6, 0.9, 0, 12), { p: [Math.cos(a) * 7.5, Math.sin(a) * 7.5, 3.0], r: [Math.PI / 2, 0, 0], color: MAT.graphite }); }
    kr.finish(reel);
    const wind = mesh(cylGeo(1, 6, 0, 32), fluidMat(FLUID.reason), reel, [0, 0, -3], [Math.PI / 2, 0, 0], { tone: 0.6 });
    wind.scale.set(3.7, 1, 3.7);
    return { reel, wind, fill: 0, shown: 0, spin: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.shown = damp(R.shown, R.fill, 5, dt); const r = 3.7 + R.shown * 7.6;
    R.wind.scale.set(r, 1, r); R.spin = Math.max(0, R.spin - dt);
    R.reel.rotation.z -= dt * (R.spin > 0 ? 7 : 0.2);
  },
});

// ── 6 · the compactor: auto-compaction presses the magazine into one summary cartridge ──
const PRESS = { x: -255, z: -126 }, OUTFEED = V(-266, TOP + 3, -24);
station('compact', {
  name: '压缩机', role: '自动压缩 · auto_compact_*', color: FLUID.context,
  desc: '上下文越过 85% 线，自动压缩开始（auto_compact_started）：卡匣一盒盒被送进压机，压头落下、亮起青光，出来一盒青色的摘要卡匣（auto_compact_completed 里的 summary），由搬运车插回卡匣第一格；占用随之骤降。失败或取消时压头停住。',
  work: [PRESS.x, TOP + 50, -40], pin: [PRESS.x, TOP + 66, PRESS.z],
  build(S, g) {
    const { x, z } = PRESS, k = new Kit({ tone: 0.55 });
    k.box(40, 10, 32, { p: [x, TOP, z], rr: 2, b: 0.6, color: MAT.pale, tone: 0.45 });
    k.box(24, 1.4, 20, { p: [x, TOP + 10, z], rr: 1, color: MAT.steel, tone: 0.55 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(1.6, 46, { p: [x + sx * 16, TOP + 10, z + sz * 11], color: MAT.steel, seg: 14, b: 0.3 });
    k.box(40, 7, 30, { p: [x, TOP + 56, z], rr: 2, b: 0.6, color: MAT.paper, tone: 0.6 });
    k.cyl(5, 8, { p: [x, TOP + 63, z], color: MAT.graphite, b: 0.6, seg: 20 });
    k.box(1, 4, 24, { p: [x - 20.4, TOP + 57.5, z], color: MAT.hazard, paint: 1 });
    // an outfeed chute down to the tray beside the magazine
    k.tube([[x + 14, TOP + 12, z + 16], [x + 14, TOP + 12, z + 40], [OUTFEED.x, TOP + 8, OUTFEED.z - 14], [OUTFEED.x, TOP + 4, OUTFEED.z - 5]], 1.6, { color: MAT.steel, bend: 8, radial: 8 });
    k.box(8, 2.4, 13, { p: [OUTFEED.x, TOP, OUTFEED.z], rr: 1, b: 0.3, color: MAT.graphite, tone: 0.45 });
    k.finish(g);
    const ram = mesh(slabGeo(18, 12, 16, 1.2, 0.6), solid(MAT.alu, { glow: 0, glowColor: FLUID.context }), g, [x, TOP + 44, z], [0, 0, 0], { tone: 0.7 });
    const scr = makeScreen(20, 5, 22, lcdDraw);
    scr.mesh.position.set(x, TOP + 3.5, z + 16.05); g.add(scr.mesh); scr.paint({ title: 'PRESS · idle', lines: [], rows: 1 });
    const halo = glow(g, FLUID.context, 40, [x, TOP + 30, z]);
    return { ram, scr, halo, press: 0, pressGoal: 0, glowK: 0, fed: [] };
  },
  update(S, t, dt) {
    const R = S.refs; R.press = damp(R.press, R.pressGoal, 3, dt);
    R.ram.position.y = TOP + 44 - R.press * 30;
    const k = R.pressGoal > 0 ? 0.35 + 0.25 * Math.sin(t * 8) : 0; R.glowK = damp(R.glowK, k, 4, dt);
    setLamp(R.ram, R.glowK, FLUID.context); R.halo.userData.set(R.glowK * 0.8, FLUID.context);
  },
});

// ── 7 · checkpoints: each compaction seals a snapshot block ──
const SNAP = { x: -205, z: -128 };
station('snap', {
  name: '快照', role: '压缩存档 · compaction_checkpoint', color: FLUID.context,
  desc: '每次压缩都会写一个检查点文件（compaction_checkpoint），这里封进一块玻璃快照，里面亮起压缩前的上下文。',
  work: [SNAP.x, TOP + 46, -40], pin: [SNAP.x, TOP + 28, SNAP.z],
  build(S, g) {
    const { x, z } = SNAP, k = new Kit({ tone: 0.55 });
    k.box(38, 4, 14, { p: [x, TOP, z], rr: 1.4, b: 0.5, color: MAT.pale, tone: 0.45 });
    for (let i = 0; i < 4; i++) { k.box(7.6, 0.8, 7.6, { p: [x - 13.5 + i * 9, TOP + 4, z], rr: 0.4, color: MAT.steel, tone: 0.5 }); k.add(slabGeo(7, 7, 7, 0.6, 0), { p: [x - 13.5 + i * 9, TOP + 4.8, z], glass: true }); }
    k.finish(g, { glassMat: GLASS2 });
    const cores = [];
    for (let i = 0; i < 4; i++) { const m = mesh(slabGeo(3.6, 3.6, 3.6, 0.4, 0.3), fluidMat(FLUID.context), g, [x - 13.5 + i * 9, TOP + 6.5, z], [0, Math.PI / 4, 0], { tone: 0.6, cast: false }); m.visible = false; cores.push(m); }
    return { cores, n: 0 };
  },
  update(S, t, dt) { S.refs.cores.forEach((m, i) => { if (m.visible) m.rotation.y = Math.PI / 4 + t * 0.4 + i; }); },
});
