// ═════════════════════════ the lab: stations along the walls ═════════════════════════
// ── the long bench on the far wall ──
function buildBench() {
  const k = new Kit({ tone: 0.4 });
  const X0 = -160, X1 = 170, Z0 = WALLZ, Z1 = WALLZ + 46, D = Z1 - Z0;
  // carcass, recessed toe kick, worktop with a front lip
  k.box(X1 - X0, 6, D - 5, { p: [(X0 + X1) / 2, FLOOR, Z0 + (D - 5) / 2], color: MAT.graphite, tone: 0.3 });
  k.box(X1 - X0, BENCH - 4 - FLOOR - 6, D - 1, { p: [(X0 + X1) / 2, FLOOR + 6, Z0 + (D - 1) / 2], b: 0.6, color: MAT.pale, tone: 0.4 });
  k.box(X1 - X0 + 2, 4, D + 1, { p: [(X0 + X1) / 2, BENCH - 4, Z0 + (D + 1) / 2], b: 1, color: MAT.enamel, tone: 0.5 });
  // fronts: drawers and doors in three bays, each with a bar pull and a label holder
  const bays = [];
  for (let i = 0; i < 5; i++) bays.push([X0 + 2 + (i * (X1 - X0 - 4)) / 5, X0 + 2 + ((i + 1) * (X1 - X0 - 4)) / 5]);
  for (const [a, b] of bays) {
    const w = b - a - 2, cx = (a + b) / 2;
    for (let i = 0; i < 3; i++) {
      const y0 = BENCH - 6 - (i + 1) * 15.5;
      k.box(w, 14.5, 1.2, { p: [cx, y0, Z1 - 0.6], b: 0.5, color: MAT.paper, tone: 0.42 });
      k.tube([[cx - 7, y0 + 9, Z1 + 0.4], [cx - 7, y0 + 9, Z1 + 2.2], [cx + 7, y0 + 9, Z1 + 2.2], [cx + 7, y0 + 9, Z1 + 0.4]], 0.45, { bend: 0.9, color: MAT.steel, radial: 6 });
      const lh = rrPts(9, 3.4, 0.5, 2).map(p => [cx + p[0], y0 + 4.2 + p[1], Z1 + 0.65]); lh.push(lh[0]); k.line(lh, 'lo');
    }
    const dy = FLOOR + 7;
    k.box(w, BENCH - 6 - 3 * 15.5 - dy - 1, 1.2, { p: [cx, dy, Z1 - 0.6], b: 0.5, color: MAT.paper, tone: 0.42 });
    k.box(1, 9, 1.2, { p: [cx + w / 2 - 5, dy + 6, Z1 + 0.6], color: MAT.steel, tone: 0.5 });
    for (let y = dy + 3; y < dy + 8; y += 1.6) k.line([[cx - w / 2 + 4, y, Z1 + 0.06], [cx - w / 2 + 16, y, Z1 + 0.06]], 'lo');
  }
  // backsplash with sockets and two gas taps, a shelf with brackets
  k.box(X1 - X0, 16, 1.2, { p: [(X0 + X1) / 2, BENCH, Z0 + 0.6], color: MAT.pale, tone: 0.32 });
  for (const x of [-132, -40, 22, 96, 150]) { k.box(9, 6, 1, { p: [x, BENCH + 6, Z0 + 1.7], rr: 1, b: 0.3, color: MAT.paper }); k.line([[x - 2, BENCH + 9.5, Z0 + 2.25], [x - 2, BENCH + 8.3, Z0 + 2.25]], 'mid'); k.line([[x + 2, BENCH + 9.5, Z0 + 2.25], [x + 2, BENCH + 8.3, Z0 + 2.25]], 'mid'); }
  for (const x of [-60, 64]) { k.cyl(1.4, 6, { p: [x, BENCH + 10, Z0 + 2], r: [Math.PI / 2, 0, 0], color: MAT.brass }); k.cyl(2, 1.4, { p: [x, BENCH + 13.2, Z0 + 6.4], color: MAT.hazard, b: 0.3 }); }
  const SX0 = -84, SX1 = 104;
  k.box(SX1 - SX0, 1.6, 12, { p: [(SX0 + SX1) / 2, 158, Z0 + 6.5], b: 0.4, color: MAT.pale, tone: 0.42 });
  for (const x of [SX0 + 6, 0, SX1 - 6]) k.add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(10, 0), new THREE.Vector2(0, -8)]), { depth: 1.2, bevelEnabled: false }), { p: [x - 0.6, 158, Z0 + 1.2], r: [0, -Math.PI / 2, 0], color: MAT.steel, tone: 0.4 });
  // reagent bottles on the shelf
  const bottle = [[0, 0], [3.4, 0], [3.6, 0.4, 1], [3.6, 7, 1], [2.6, 9, 1], [1.5, 9.6], [1.5, 11], [0, 11]];
  const r2 = mulberry32(3);
  for (let x = SX0 + 6; x <= SX1 - 6; x += 9.5) {
    if (Math.abs(x) < 6) continue;
    const s = 0.8 + r2() * 0.4, tall = r2() > 0.5;
    k.lathe(bottle.map(([r, y, f]) => [r * s, y * s * (tall ? 1.2 : 1), f]), { p: [x, 159.6, Z0 + 6.5], seg: 18, color: r2() > 0.65 ? 0xc8b393 : MAT.paper, tone: 0.42 });
    k.cyl(1.8 * s, 2.2, { p: [x, 159.6 + 11 * s * (tall ? 1.2 : 1), Z0 + 6.5], seg: 14, color: MAT.graphite, b: 0.3, tone: 0.45 });
    k.line([[x - 2.4 * s, 162.5, Z0 + 6.5 + 3.62 * s], [x + 2.4 * s, 162.5, Z0 + 6.5 + 3.62 * s]], 'lo');
  }
  k.finish(world);
}

// ── storage box along the near side (covers the wheel well) ──
function buildNearBox() {
  const k = new Kit({ tone: 0.38 });
  const X0 = VAN.x0 + 4, X1 = -60, Z0 = NEARZ - 28, Z1 = NEARZ, H = 24;
  k.box(X1 - X0, H, Z1 - Z0, { p: [(X0 + X1) / 2, FLOOR, (Z0 + Z1) / 2], b: 1, color: MAT.pale });
  for (let x = X0 + 4; x < X1 - 30; x += 49) {
    k.box(45, 18, 1, { p: [x + 22.5, FLOOR + 3, Z0 - 0.5], b: 0.4, color: MAT.paper, tone: 0.4 });
    k.box(12, 1.6, 1.4, { p: [x + 22.5, FLOOR + 15, Z0 - 1.4], color: MAT.steel, tone: 0.5 });
  }
  for (let x = X0 + 10; x < X1; x += 24) k.screw(x, FLOOR + H, Z1 - 3, { r: 0.4 });
  k.finish(world);
}

// ── 1 · the context tower: a graduated column whose level is the context window ──
const TOWER = { x: -172, z: -86, y0: FLOOR + 10, h: 104, r: 9 };
// log scale for the tower: 0.1 % → 0, 100 % → 1
const ctxFrac = r => clamp((Math.log10(Math.max(r, 1e-3)) + 3) / 3, 0, 1);
station('tower', {
  name: '储液塔', role: '上下文窗口 · _meta.totalTokens', color: FLUID.context,
  desc: '一根带刻度的玻璃柱，液位就是当前上下文占用（_meta.totalTokens / 窗口）。刻度是对数的：0.1%、1%、10%、100% 各占三分之一，所以百万窗口里用掉 1% 也看得出来。红环是 85% 自动压缩线；越过红线，旋转蒸发仪会把它浓缩。每次模型请求，蠕动泵从底部把它送进反应釜。',
  work: [TOWER.x, TOWER.y0 + TOWER.h, TOWER.z + TOWER.r + 9], pin: [TOWER.x, TOWER.y0 + TOWER.h + 18, TOWER.z],
  build(S, g) {
    const { x, z, y0, h, r } = TOWER, k = new Kit({ tone: 0.55 });
    // floor stand with feet, bottom cap with an outlet valve, top cap with a fill funnel
    k.box(30, 3, 30, { p: [x, FLOOR, z], rr: 3, b: 0.8, color: MAT.pale, tone: 0.4 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.screw(x + sx * 11, FLOOR + 3, z + sz * 11, { r: 0.6 });
    k.lathe([[0, 0], [r + 3, 0], [r + 3, 5], [r + 1.2, 7], [r - 0.4, 7], [0, 7]], { p: [x, y0 - 7, z], color: MAT.steel, tone: 0.6 });
    k.lathe([[0, 0], [r + 2.2, 0], [r + 2.2, 4], [r + 0.8, 5.5], [5, 6.5], [3, 9], [0, 9]], { p: [x, y0 + h, z], color: MAT.steel, tone: 0.6 });
    // side inlet: a short arm from the column wall that ends in a funnel facing the aisle
    k.tube([[x, y0 + h - 36, z + r - 1], [x, y0 + h - 36, z + r + 6], [x, y0 + h - 28, z + r + 9]], 1.2, { bend: 3, color: MAT.steel });
    k.lathe([[1.4, 0], [2.2, 0], [5.5, 5, 1], [7, 7.2], [7, 8], [6.3, 8], [4.8, 5.4, 1], [1.4, 1]], { p: [x, y0 + h - 28, z + r + 9], color: MAT.steel, tone: 0.6 });
    k.tube([[x, y0 - 3, z + r + 3], [x, y0 - 3, z + r + 9]], 1.6, { color: MAT.steel });
    k.cyl(2.6, 4, { p: [x, y0 - 5, z + r + 9], color: MAT.brass, b: 0.4 });
    k.box(9, 1.2, 1.6, { p: [x + 3.5, y0 + 0.6, z + r + 9], color: MAT.hazard, tone: 0.6 });
    // the column, its graduation strip and the 85% red ring
    k.add(cylGeo(r, h, 0, 40), { p: [x, y0, z], glass: true });
    // the scale is logarithmic, like a slide rule: 0.1 %, 1 %, 10 %, 100 % each take a third of the column
    k.box(3, h - 6, 0.8, { p: [x - r - 2.4, y0 + 3, z + 3], color: MAT.alu, tone: 0.45 });
    for (let dec = -3; dec < 0; dec++) for (let m = 1; m <= 9; m++) {
      const y = y0 + 4 + ctxFrac(m * 10 ** dec) * (h - 8), maj = m === 1;
      k.line([[x - r - 0.9, y, z + 3.42], [x - r - 0.9 - (maj ? 2.6 : m === 5 ? 1.8 : 1.2), y, z + 3.42]], maj ? 'hi' : 'mid');
    }
    k.line([[x - r - 0.9, y0 + h - 4, z + 3.42], [x - r - 3.5, y0 + h - 4, z + 3.42]], 'hi');
    k.torus(r + 0.35, 0.55, { p: [x, y0 + 4 + ctxFrac(0.85) * (h - 8), z], tub: 48, color: MAT.redlamp, paint: 1, tone: 0.9 });
    // wall brackets
    for (const y of [y0 + 30, y0 + h - 20]) { k.torus(r + 0.6, 0.9, { p: [x, y, z], tub: 40, color: MAT.steel }); k.box(2.4, 2.4, z - r - WALLZ, { p: [x, y - 1.2, (z - r + WALLZ) / 2], color: MAT.steel }); k.box(10, 10, 1.2, { p: [x, y - 5, WALLZ + 0.6], rr: 1, b: 0.3, color: MAT.pale }); }
    k.finish(g);
    // live: the liquid and its meniscus
    const liquid = mesh(cylGeo(r - 0.5, 1, 0, 40), fluidMat(FLUID.context), g, [x, y0 + 0.4, z], [0, 0, 0], { tone: 0.75 });
    liquid.scale.y = 1;
    const hot = glow(g, FLUID.err, 46, [x, y0 + 4 + ctxFrac(0.85) * (h - 8), z]);
    return { liquid, hot, level: 0.02, shown: 0.02 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.shown = damp(R.shown, R.level, 2.2, dt);
    R.liquid.scale.y = Math.max(0.6, 4 + R.shown * (TOWER.h - 8));
    R.hot.userData.set(R.shown >= ctxFrac(0.85) ? 0.55 + 0.35 * Math.sin(t * 6) : 0);
    // a pour into the side funnel sends a few bubbles up the column
    if (R.splash > 0) { R.splash -= dt; if (fx.drops && Math.random() < dt * 20) fx.drops.emit(V(TOWER.x + (Math.random() - 0.5) * 8, TOWER.y0 + 4, TOWER.z + (Math.random() - 0.5) * 8), V(0, 30, 0), 0xffffff, 1.2, 0.5, { g: 20 }); }
  },
});

// ── 2 · the reactor: the model ──
const REACT = { x: -116, z: -84, y: BENCH };
const JACK = 6, FLASK = { r: 11, cy: REACT.y + 23.2 };
// outer wall of the round-bottom flask (sphere) for the liquid fill
const FLASK_WALL = (() => { const p = []; for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI * 0.86; p.push([FLASK.r * Math.cos(a), FLASK.cy + FLASK.r * Math.sin(a)]); } return p; })();
const ERLEN = [[0, 0], [7, 0], [7.2, 0.6, 1], [3, 12], [2.2, 15], [2.2, 17.5]];
const RECV = { a: [REACT.x + 30, REACT.z + 10], b: [REACT.x + 30, REACT.z - 9] };
station('reactor', {
  name: '反应釜', role: '模型推理 · 每次请求', color: FLUID.reason,
  desc: '三口圆底烧瓶坐在加热套里。请求开始时泵把储液塔的液体送进来、加热套升温；第一滴冷凝液就是首 token（TTFT）。推理时紫色蒸汽在回流冷凝管里上升又滴回；写正文时活塞拨向蒸馏支管，蓝色液滴落进产物瓶。工具调用会从侧口析出一枚橙色工单。',
  work: [REACT.x + 10, REACT.y + 60, REACT.z + 26], pin: [REACT.x, REACT.y + 76, REACT.z],
  build(S, g) {
    const { x, z, y } = REACT, k = new Kit({ tone: 0.55 });
    // retort stand: base plate, rod, boss heads and clamps
    k.box(26, 1.6, 16, { p: [x, y, z - 12], rr: 1.5, b: 0.4, color: MAT.graphite, tone: 0.45 });
    k.cyl(0.8, 74, { p: [x - 6, y + 1.6, z - 16], color: MAT.steel, seg: 12 });
    for (const [cy, len] of [[y + 30, 12], [y + 50, 13], [y + 66, 13]]) {
      k.box(3, 3, 3, { p: [x - 6, cy - 1.5, z - 16], b: 0.4, color: MAT.alu });
      k.cyl(0.9, 2.6, { p: [x - 6, cy, z - 13.8], r: [Math.PI / 2, 0, 0], color: MAT.brass, seg: 10 });
      k.tube([[x - 6, cy, z - 16], [x - 2, cy, z - 16], [x, cy, z - 16 + len - 4]], 0.5, { color: MAT.steel, radial: 6 });
    }
    // lab jack: base, scissor arms, top plate, knob
    k.box(24, 1.4, 24, { p: [x, y, z], rr: 1.5, b: 0.4, color: MAT.alu, tone: 0.5 });
    k.box(24, 1.4, 24, { p: [x, y + JACK, z], rr: 1.5, b: 0.4, color: MAT.alu, tone: 0.5 });
    for (const sz of [-1, 1]) { k.tube([[x - 10, y + 1.6, z + sz * 10], [x + 10, y + JACK - 0.2, z + sz * 10]], 0.5, { radial: 6, color: MAT.steel }); k.tube([[x + 10, y + 1.6, z + sz * 10], [x - 10, y + JACK - 0.2, z + sz * 10]], 0.5, { radial: 6, color: MAT.steel }); }
    k.tube([[x, y + 3.7, z - 10], [x, y + 3.7, z + 13]], 0.4, { radial: 6, color: MAT.steel });
    k.cyl(1.8, 2.2, { p: [x, y + 3.7, z + 13], r: [Math.PI / 2, 0, 0], color: MAT.graphite, b: 0.3 });
    // heating mantle: a bowl on the jack
    k.lathe([[0, 0], [15, 0], [15.4, 0.6, 1], [15.4, 10, 1], [14.6, 11.4], [11.6, 11.4], [8, 8.6, 1], [0, 7.8]], { p: [x, y + JACK + 1.4, z], color: MAT.steel, tone: 0.55, seg: 40 });
    k.line(ringPts(x, y + JACK + 6.5, z, 15.45, 48), 'lo');
    k.box(6, 4, 3, { p: [x, y + JACK + 4, z + 15], rr: 1, b: 0.3, color: MAT.graphite });
    // flask necks: centre (condenser), left (addition funnel), right (still head)
    k.add(latheGeo([[2.4, 0], [2.4, 4.4], [3, 5], [3, 6]], 24), { p: [x, FLASK.cy + FLASK.r - 1.2, z], glass: true });
    k.at([x - 5.2, FLASK.cy + 7, z], [0, 0, 0.42], kk => kk.add(latheGeo([[1.8, 0], [1.8, 8], [2.4, 8.6], [2.4, 10]], 18), { glass: true }));
    k.at([x + 5.2, FLASK.cy + 7, z], [0, 0, -0.42], kk => kk.add(latheGeo([[1.8, 0], [1.8, 8], [2.4, 8.6], [2.4, 10]], 18), { glass: true }));
    // ground-glass joint rings (frosted) where the parts meet: drawn as thin solid bands
    k.torus(3.05, 0.35, { p: [x, FLASK.cy + FLASK.r + 4.4, z], tub: 28, color: MAT.pale, tone: 0.7 });
    // the flask itself
    k.add(sphereGeo(FLASK.r, 40, 28), { p: [x, FLASK.cy, z], glass: true });
    // reflux condenser: jacket, inner coil, water hoses
    const cy0 = FLASK.cy + FLASK.r + 4.8, cy1 = 184;
    k.add(latheGeo([[2.2, 0], [3.4, 2, 1], [3.4, cy1 - cy0 - 3, 1], [2.2, cy1 - cy0], [2.2, cy1 - cy0 + 2]], 24), { p: [x, cy0, z], glass: true });
    const coil = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * TAU * 9; coil.push(V(x + Math.cos(a) * 1.9, cy0 + 3 + (i / 160) * (cy1 - cy0 - 7), z + Math.sin(a) * 1.9)); }
    k.tube(new THREE.CatmullRomCurve3(coil), 0.28, { color: MAT.copper, radial: 5, seg: 320, tone: 0.5 });
    for (const [yy, sx] of [[cy0 + 4, 1], [cy1 - 6, 1]]) k.tube([[x + 3.3, yy, z], [x + 6, yy, z], [x + 6, yy, z + 6]], 0.7, { color: MAT.paper, tone: 0.45 });
    k.tube([[x + 6, cy0 + 4, z + 6], [x + 6, y + 4, z + 10], [x + 18, y + 1, z + 14]], 0.9, { color: MAT.hose, tone: 0.5, bend: 5 });
    k.tube([[x + 6, cy1 - 6, z + 6], [x + 12, cy1 - 10, z + 10], [x + 22, y + 1, z + 12]], 0.9, { color: MAT.hose, tone: 0.5, bend: 6 });
    // addition funnel on the left neck; the pump line comes into its top
    k.at([x - 9.3, FLASK.cy + 16.5, z], [0, 0, 0.42], kk => {
      kk.add(latheGeo([[1.2, 0], [1.2, 3], [3.8, 9, 1], [4.4, 13, 1], [3.6, 17, 1], [1.6, 19], [1.6, 21]], 22), { glass: true });
      kk.box(4.6, 1, 1, { p: [0, 2.2, 0], color: MAT.paper, tone: 0.6 });
    });
    // still head on the right neck, the descending Liebig condenser and the swing spout
    k.add(tubeGeo([[x + 9.3, FLASK.cy + 16, z], [x + 12, FLASK.cy + 21, z], [x + 16, FLASK.cy + 21, z]], 1.3, { bend: 2.5 }), { glass: true });
    const L0 = V(x + 16, FLASK.cy + 21, z), L1 = V(RECV.a[0], FLASK.cy + 6, z);
    k.add(tubeGeo([L0, L1], 2.6, { radial: 16 }), { glass: true });
    k.add(tubeGeo([L0.clone().lerp(L1, -0.06), L1.clone().lerp(L0, -0.08)], 1.1, { radial: 10 }), { glass: true });
    k.tube([L1, V(L1.x, L1.y - 2.5, L1.z)], 0.9, { color: MAT.paper, tone: 0.6 });
    k.cyl(1.4, 2, { p: [L1.x, L1.y - 3.5, L1.z], color: MAT.paper, tone: 0.6 });
    // receivers: reasoning (violet) and product (blue) Erlenmeyers on a cork ring each
    for (const [rx, rz] of [RECV.a, RECV.b]) { k.torus(5.4, 0.9, { p: [rx, y + 0.9, rz], tub: 28, color: MAT.cork, tone: 0.4 }); k.add(latheGeo(ERLEN, 28), { p: [rx, y + 1.2, rz], glass: true }); k.torus(2.3, 0.3, { p: [rx, y + 1.2 + 17.5, rz], tub: 20, color: MAT.pale, tone: 0.6 }); }
    // controller on the wall above the bench: screen, two knobs, a lamp, a cable down to the mantle
    const cx = x - 21, cy = y + 24, cz = WALLZ + 3;
    k.box(18, 13, 6, { p: [cx, cy, cz], rr: 1.5, b: 0.6, color: MAT.pale, tone: 0.5 });
    for (const dx of [-4.5, 4.5]) k.cyl(1.7, 1.5, { p: [cx + dx, cy + 3, cz + 3], r: [Math.PI / 2, 0, 0], color: MAT.graphite, b: 0.3 });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.screw(cx + sx * 7.6, cy + 6.5 + sy * 5, cz + 3, { axis: 'z', r: 0.35 });
    k.tube([[cx + 6, cy + 1, cz + 3.2], [cx + 7, y + 3, cz + 9], [x - 6, y + JACK + 5, z + 14.5]], 0.55, { color: MAT.rubber, tone: 0.45, bend: 4 });
    k.finish(g);
    // live parts
    const scr = makeScreen(12, 4.8, 22, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.font = `500 ${h * 0.42}px ${FONT_MONO}`; c.textBaseline = 'middle';
      c.fillText(s.a || 'IDLE', w * 0.05, h * 0.3); c.globalAlpha = 0.75; c.font = `400 ${h * 0.3}px ${FONT_MONO}`; c.fillText(s.b || '', w * 0.05, h * 0.74); c.globalAlpha = 1;
    });
    scr.mesh.position.set(cx, cy + 8.6, cz + 3.06); g.add(scr.mesh); scr.paint({ a: 'IDLE', b: '0 tok/s' });
    const lamp = mesh(sphereGeo(0.8, 12, 10), solid(MAT.amberlamp), g, [cx + 6, cy + 3, cz + 3.2], [0, 0, 0], { tone: 0.6 });
    const mantleGlow = mesh(latheGeo([[0, 7.9], [8, 8.7, 1], [11.5, 11.35], [0, 11.35]], 32), solid(0x8e8a84, { glow: 0, glowColor: FLUID.tool }), g, [x, y + JACK + 1.45, z], [0, 0, 0], { tone: 0.4 });
    const liquidMat = fluidMat(FLUID.context);
    const liquid = mesh(fillGeo(FLASK_WALL, FLASK.cy - 2), liquidMat, g, [x, 0, z], [0, 0, 0], { tone: 0.7 });
    const stir = mesh(cylGeo(0.7, 4.6, 0.3, 10), solid(MAT.paper), g, [x, FLASK.cy - FLASK.r + 1.6, z], [0, 0, Math.PI / 2], { tone: 0.6 });
    const recvMat = { a: fluidMat(FLUID.reason), b: fluidMat(FLUID.text) };
    const recv = {
      a: mesh(fillGeo(ERLEN.map(([r, yy]) => [r, yy + y + 1.2]), y + 1.6), recvMat.a, g, [RECV.a[0], 0, RECV.a[1]], [0, 0, 0], { tone: 0.7 }),
      b: mesh(fillGeo(ERLEN.map(([r, yy]) => [r, yy + y + 1.2]), y + 1.6), recvMat.b, g, [RECV.b[0], 0, RECV.b[1]], [0, 0, 0], { tone: 0.7 }),
    };
    const spout = group(g, [L1.x, L1.y - 4.6, L1.z]);
    const sk = new Kit({ tone: 0.7 });
    sk.tube([[0, 0, 0], [0, -1.5, 0], [0, -3.4, -6]], 0.55, { bend: 1.5, color: MAT.paper });
    sk.finish(spout);
    const halo = glow(g, FLUID.reason, 44, [x, FLASK.cy, z]);
    const vapor = glow(g, FLUID.reason, 20, [x, cy0 + 10, z]);
    return { scr, lamp, mantleGlow, liquid, liquidMat, stir, recv, recvMat, recvLv: { a: 0, b: 0 }, spout, spoutAng: 0, spoutGoal: 0, halo, vapor, heat: 0, heatGoal: 0, boil: 0, mode: null, cy0, cy1, L1, mix: new THREE.Color(FLUID.context), mixGoal: new THREE.Color(FLUID.context), fill: 0.45 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.heat = damp(R.heat, R.heatGoal, 1.6, dt);
    R.mantleGlow.material.userData.u.uGlow.value = R.heat * 0.85;
    R.lamp.material.userData.u.uGlow.value = R.heatGoal > 0 ? 0.6 + 0.4 * Math.sin(t * 5) : 0;
    R.lamp.material.userData.u.uGlowColor.value.set(MAT.amberlamp);
    R.stir.rotation.y += dt * (2 + R.heat * 16);
    R.mix.lerp(R.mixGoal, 1 - Math.exp(-2.5 * dt));
    R.liquidMat.color.copy(R.mix);
    R.halo.userData.set(R.boil * 0.85, R.mode === 't' ? FLUID.text : FLUID.reason);
    R.vapor.userData.set(R.mode === 'r' ? 0.5 + 0.25 * Math.sin(t * 7) : 0);
    R.vapor.position.y = R.cy0 + 8 + Math.sin(t * 2) * 4;
    R.spoutAng = damp(R.spoutAng, R.spoutGoal, 5, dt);
    R.spout.rotation.y = R.spoutAng;
    // bubbles in the flask while it boils
    if (R.boil > 0.05 && fx.drops && Math.random() < dt * 30 * R.boil) {
      const a = Math.random() * TAU, rr = Math.random() * 7;
      fx.drops.emit(V(REACT.x + Math.cos(a) * rr, FLASK.cy - 8, REACT.z + Math.sin(a) * rr), V(0, 14 + Math.random() * 10, 0), 0xffffff, 0.45, 0.45 + Math.random() * 0.4, { g: 30 });
    }
    R.boil = damp(R.boil, R.runaway ? 1.6 : R.heat > 0.6 && R.mode ? 1 : R.heat * 0.3, 2, dt);
    // demo: a runaway reaction smokes, a Belousov–Zhabotinsky-style oscillation flips its colour, nitrogen quenches it
    if (R.runaway && fx.puffs && Math.random() < dt * 16) fx.puffs.emit(V(REACT.x + (Math.random() - 0.5) * 2, R.cy1 + 1, REACT.z), V((Math.random() - 0.5) * 10, 16 + Math.random() * 8, (Math.random() - 0.5) * 10), 0x3a3b40, 2.8, 6, 2.8, 0.55);
    if (R.bz > 0) { R.bz -= dt; R.mixGoal.set(Math.sin(t * 8) > 0 ? FLUID.err : FLUID.text); }
    if (R.quench > 0) { R.quench -= dt; if (fx.puffs && Math.random() < dt * 20) fx.puffs.emit(V(REACT.x - 9, FLASK.cy + 22, REACT.z), V(-4, 10, 4), 0xeef2f6, 1.6, 4, 2, 0.6); }
  },
});

// ── 3 · the peristaltic pump: context → reactor ──
const PUMP = { x: -148, z: -74 };
station('pump', {
  name: '蠕动泵', role: '模型请求 · loop_started', color: FLUID.context,
  desc: '每次模型请求（loop_started）开始时，泵从储液塔底部抽出当前上下文，经软管送进反应釜的加料漏斗。转子转多久，取决于这次请求要送多少上下文。',
  work: [PUMP.x, BENCH + 30, PUMP.z + 22], pin: [PUMP.x - 2, BENCH + 22, PUMP.z + 2],
  build(S, g) {
    const { x, z } = PUMP, y = BENCH, k = new Kit({ tone: 0.55 });
    k.box(16, 12, 14, { p: [x, y, z], rr: 1.5, b: 0.6, color: MAT.pale });
    k.cyl(5.6, 1.2, { p: [x, y + 6, z + 7], r: [Math.PI / 2, 0, 0], color: MAT.steel, b: 0.3 });
    k.box(4, 2, 1, { p: [x - 4, y + 1.8, z + 7.1], color: MAT.graphite });
    k.line(ringPts(x, y + 6, z + 8.32, 5.7, 32, 'z'), 'mid');
    // hose: tower outlet → pump → funnel
    k.tube([[TOWER.x, TOWER.y0 - 5, TOWER.z + TOWER.r + 13], [TOWER.x + 6, BENCH + 4, z + 15], [x - 8, y + 6, z + 9], [x - 4, y + 6, z + 9.6]], 0.9, { color: MAT.rubber, tone: 0.5, bend: 6, radial: 8 });
    k.tube([[x + 4, y + 6, z + 9.6], [x + 9, y + 9, z + 8], [REACT.x - 16, FLASK.cy + 40, REACT.z]], 0.75, { color: MAT.rubber, tone: 0.5, bend: 6, radial: 8 });
    k.finish(g);
    const rotor = group(g, [x, y + 6, z + 8.3]);
    const rk = new Kit({ tone: 0.6 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; rk.cyl(1.3, 1, { p: [Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0], r: [Math.PI / 2, 0, 0], color: MAT.alu, seg: 14 }); }
    rk.cyl(1.2, 1.2, { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], color: MAT.graphite, seg: 12 });
    rk.finish(rotor);
    return { rotor, spin: 0, spinGoal: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.spin = damp(R.spin, R.spinGoal, 3, dt); R.rotor.rotation.z -= dt * R.spin * 9; },
});
