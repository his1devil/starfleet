// ═════════════════════════ the plinth, two chip packages and the network between them ═════════════════════════
// HX-1 draws the grok-build harness as a chip. The local package carries the harness die (the
// agent loop and everything around it); the remote package is the inference service — the model
// die with its KV cache in HBM — and a network link joins them. x runs left → right (local →
// remote), z toward the viewer, y up; 1 unit ≈ 0.1 mm of an imaginary die.
const TOP = 0;                                  // the plinth surface
const HGT = { ball: 2.4, sub: 5, intp: 1.8, bump: 0.5, die: 2.8 };
const SUB_Y = HGT.ball + HGT.sub;               // substrate top
const INT_Y = SUB_Y + HGT.intp;                 // interposer top
const DIE_Y = INT_Y + HGT.bump + HGT.die;       // die top: the floorplan lives here
const MET_Y = DIE_Y + 0.35;                     // the top-metal tracks: routes and their traffic ride here
const LOCAL = { sub: [-412, -186, 22, 186], intp: [-396, -168, 6, 146] };
const HX = { x0: -380, x1: -12, z0: -152, z1: 130 };
const REMOTE = { sub: [100, -164, 404, 164], intp: [116, -148, 388, 148] };
const LM = { x0: 194, x1: 310, z0: -58, z1: 58 };
const HBM = [-92, 0, 92].flatMap(z => [{ x: 152, z }, { x: 352, z }]);
// words the shared HUD uses for this scene
const WORDS = { place: '在芯片上', unit: '轮' };
Object.assign(MAT, { pcb: 0xe1e6db, mask: 0xd6ddd1, gold: 0xd9b45a, ceramic: 0xeeece4, si: 0xe4e2ea, siDark: 0xc9c6d4, laminate: 0xdcd6c4, copperM: 0xd8a27a });

const ghostParts = [], ghostLines = [];
function ghostLine(pts, parent = world) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => V(...p)));
  const L = new THREE.Line(g, LINE_M.ghost); L.layers.set(1); L.renderOrder = 6; parent.add(L); ghostLines.push(L);
  return L;
}

// ── the display base ──
const BASE = { W: 900, D: 470, T: 10, x: -4, z: 4 };
function buildBase() {
  const { W, D, T, x: bx, z: bz } = BASE;
  const k = new Kit({ tone: 0.32 });
  k.box(W, T, D, { p: [bx, -T, bz], rr: 18, b: 2.4, seg: 8 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = bx + sx * (W / 2 - 36), z = bz + sz * (D / 2 - 32);
    k.cyl(10, 1.8, { p: [x, -T - 8, z], seg: 24, tone: 0.25 });
    k.cyl(7, 6.4, { p: [x, -T - 6.4, z], seg: 24, b: 0.8, color: MAT.pale });
  }
  const gr = rrPts(W - 18, D - 18, 10, 6).map(p => [bx + p[0], 0.08, bz + p[1]]); gr.push(gr[0]); k.line(gr, 'lo');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = bx + sx * (W / 2 - 22), z = bz + sz * (D / 2 - 22); k.screw(x, 0, z, { r: 1 }); k.line(ringPts(x, 0.08, z, 2.8), 'lo'); }
  // a scale bar along the near edge: 100 units to the major tick
  const rz = bz + D / 2 - 16, half = Math.floor((W / 2 - 70) / 10) * 10;
  k.box(half * 2 + 20, 0.8, 8.5, { p: [bx, 0, rz], color: MAT.pale, tone: 0.25 });
  for (let x = -half; x <= half; x += 10) { const maj = x % 100 === 0; k.line([[bx + x, 0.88, rz + 4.25], [bx + x, 0.88, rz + 4.25 - (maj ? 5 : 2.6)]], maj ? 'mid' : 'lo'); }
  const lx = bx + half - 40, lz = rz - 24;
  k.box(72, 1.2, 18, { p: [lx, 0, lz], rr: 2, b: 0.4, color: MAT.pale, tone: 0.3 });
  k.screw(lx - 30, 1.2, lz, { r: 0.6 }); k.screw(lx + 30, 1.2, lz, { r: 0.6 });
  k.finish(world, { cast: false });
  silk('HX-1   SCALE 100 : 1', lx - 4, lz - 2, { y: 1.32, size: 3.4 });
  silk('LOCAL · 本机', LOCAL.sub[0] + 6, LOCAL.sub[3] + 14, { y: 0.1, size: 3.6, align: 'left', weight: 600 });
  silk('REMOTE · 推理服务', REMOTE.sub[0] + 6, REMOTE.sub[3] + 14, { y: 0.1, size: 3.6, align: 'left', weight: 600 });
  const Hh = haloTexture(560, 300, 40, 26);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * Hh.sw * 1.02, D * Hh.sh * 1.04), new THREE.MeshBasicMaterial({ map: Hh.tex, transparent: true, depthWrite: false, opacity: 0.3 }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(bx + 10, -T - 9, bz + 14); halo.layers.set(1); halo.renderOrder = -1; world.add(halo);
  THEMED.push((P, name) => { halo.material.opacity = name === 'dark' ? 0.85 : 0.3; });
}

// ── a package: BGA balls, the laminate substrate with its caps, the silicon interposer ──
function buildPackage(P, o) {
  const [x0, z0, x1, z1] = P.sub, [ix0, iz0, ix1, iz1] = P.intp, k = new Kit({ tone: 0.36 });
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // ball grid: only the outer rows show under the overhang
  const bk = new Kit({ tone: 0.5 });
  for (let x = x0 + 8; x <= x1 - 8; x += 7) for (const z of [z0 + 6, z1 - 6]) bk.add(sphereGeo(1.25, 10, 8), { p: [x, 1.2, z], color: MAT.steel, tone: 0.5 });
  for (let z = z0 + 13; z <= z1 - 13; z += 7) for (const x of [x0 + 6, x1 - 6]) bk.add(sphereGeo(1.25, 10, 8), { p: [x, 1.2, z], color: MAT.steel, tone: 0.5 });
  bk.finish(world, { cast: false });
  k.box(W, HGT.sub, D, { p: [cx, HGT.ball, cz], rr: 4, b: 0.5, color: MAT.laminate, tone: 0.36 });
  const ed = rrPts(W - 0.6, D - 0.6, 3.7, 6).map(p => [cx + p[0], HGT.ball + HGT.sub * 0.45, cz + p[1]]); ed.push(ed[0]); k.line(ed, 'lo');
  // decoupling caps in rows along the substrate's free edges
  for (let x = x0 + 12; x <= x1 - 12; x += 9) for (const z of [z0 + 8.5, z1 - 8.5]) { k.box(4, 1.6, 2.2, { p: [x, SUB_Y, z], color: MAT.ceramic, tone: 0.45 }); for (const s of [-1, 1]) k.box(0.8, 1.65, 2.25, { p: [x + s * 1.6, SUB_Y, z], color: MAT.steel, tone: 0.4 }); }
  // the corner marks, a pin-1 triangle, a laser-etched name
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = sx < 0 ? x0 + 3 : x1 - 3, z = sz < 0 ? z0 + 3 : z1 - 3; k.line([[x - sx * 6, SUB_Y + 0.05, z], [x, SUB_Y + 0.05, z], [x, SUB_Y + 0.05, z - sz * 6]], 'mid'); }
  k.line([[x0 + 14, SUB_Y + 0.05, z0 + 14], [x0 + 20, SUB_Y + 0.05, z0 + 14], [x0 + 14, SUB_Y + 0.05, z0 + 20], [x0 + 14, SUB_Y + 0.05, z0 + 14]], 'hi');
  // the interposer: thin silicon with micro-bump fields hinted around the dies
  k.box(ix1 - ix0, HGT.intp, iz1 - iz0, { p: [(ix0 + ix1) / 2, SUB_Y, (iz0 + iz1) / 2], rr: 1, b: 0.3, color: MAT.si, tone: 0.42 });
  for (let x = ix0 + 4; x < ix1 - 2; x += 3.2) k.line([[x, INT_Y + 0.04, iz0 + 2], [x + 1.4, INT_Y + 0.04, iz0 + 2]], 'lo');
  k.finish(world);
  if (o.label) silk(o.label, x0 + 22, z1 - 16, { y: SUB_Y + 0.08, size: 3, align: 'left', weight: 600, alpha: 0.55 });
  if (o.sub) silk(o.sub, x0 + 22, z1 - 11.5, { y: SUB_Y + 0.08, size: 2.2, align: 'left', alpha: 0.5 });
}

// ── a die: a silicon slab with a seal ring, corner keys and a scribe lane ──
function buildDie(D, o = {}) {
  const parent = o.parent ?? world, k = new Kit({ tone: 0.42 }), w = D.x1 - D.x0, d = D.z1 - D.z0, cx = (D.x0 + D.x1) / 2, cz = (D.z0 + D.z1) / 2;
  k.box(w + 3, HGT.bump, d + 3, { p: [cx, INT_Y, cz], color: MAT.siDark, tone: 0.4 });
  k.box(w, HGT.die, d, { p: [cx, INT_Y + HGT.bump, cz], b: 0.25, color: o.color ?? MAT.si, tone: 0.44 });
  for (const inset of [1.2, 2.2]) { const r = rrPts(w - inset * 2, d - inset * 2, 0.4, 1).map(p => [cx + p[0], DIE_Y + 0.04, cz + p[1]]); r.push(r[0]); k.line(r, inset < 2 ? 'mid' : 'lo'); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = sx < 0 ? D.x0 + 4 : D.x1 - 4, z = sz < 0 ? D.z0 + 4 : D.z1 - 4; k.box(3, 0.2, 0.8, { p: [x, DIE_Y, z], color: MAT.gold, tone: 0.3 }); k.box(0.8, 0.2, 3, { p: [x, DIE_Y, z], color: MAT.gold, tone: 0.3 }); }
  k.finish(parent);
  if (o.name) silk(o.name, D.x0 + 6, D.z1 - 4.5, { y: DIE_Y + 0.06, size: o.size ?? 3.2, align: 'left', weight: 600, alpha: 0.7, parent });
}

// ── etched block labels and the textures that tell one kind of circuit from another ──
// every block is a shallow plate on the die; what is printed on it says what it does
const BLOCKS = {};
// Chinese names printed beside the English ones
const BLOCK_ZH = {
  prefix: '提示词模板', compact: '压缩器', sram: '对话缓冲', rb: '请求组装', tooldefs: '工具定义', http: '连接', retry: '重试', doom: '打转检测', metrics: '计时',
  turn: '回合控制', stopgate: '收尾闸门', goal: '目标模式', acp: '客户端接口', queue: '提问队列', rem: '提醒注入', skills: '技能', stream: '流处理',
  tools: '工具执行', filestate: '文件快照', hooks: 'Hook 调度', perm: '权限', runtime: '工具运行时', sub: '子会话', bg: '后台', mcp: 'MCP 池', bm25: '工具检索',
  mem: '记忆', tok: '分词', batch: '批处理', quota: '配额', pidx: '前缀索引', samp: '采样器',
};
function block(k, id, x0, z0, x1, z1, o = {}) {
  const h = o.h ?? 0.5, y = DIE_Y, w = x1 - x0, d = z1 - z0;
  k.box(w, h, d, { p: [(x0 + x1) / 2, y, (z0 + z1) / 2], b: 0.15, color: o.color ?? MAT.paper, tone: o.tone ?? 0.5 });
  const top = y + h + 0.03, big = o.labelSize ?? 3.2;
  if (o.tex === 'logic') stdCells(k, x0 + 1.4, z0 + (o.label ? 9 : 1.4), x1 - 1.4, z1 - 1.4, top, o.seed ?? (x0 * 7 + z0));
  else if (o.tex === 'rom') romBits(k, x0 + 2, z0 + (o.label ? 9.5 : 2), x1 - 2, z1 - 2, top, o.seed ?? (x0 + z0));
  else if (o.tex === 'grid') gridLines(k, x0 + 1.5, z0 + (o.label ? 9 : 1.5), x1 - 1.5, z1 - 1.5, top, o.pitch ?? 2);
  if (o.label) {
    const lx = x0 + (o.labelDx ?? 1.8);
    const en = silk(o.label, lx, z0 + 3, { y: top + 0.02, size: big, align: 'left', weight: 700, alpha: 0.88 });
    const zh = BLOCK_ZH[id];
    if (zh && o.zh !== false) silk(zh, lx + en.geometry.parameters.width + 1.4, z0 + 3.1, { y: top + 0.02, size: big * 0.9, align: 'left', weight: 600, alpha: 0.7 });
    if (o.sub) silk(o.sub, lx, z0 + 3 + big * 1.2, { y: top + 0.02, size: o.subSize ?? Math.max(1.5, big * 0.62), align: 'left', alpha: 0.55 });
  }
  BLOCKS[id] = { x0, z0, x1, z1, y: top, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  return BLOCKS[id];
}
// standard-cell rows: power rails every row, cells as short ticks of varying width
function stdCells(k, x0, z0, x1, z1, y, seed) {
  const r = mulberry32(Math.abs(Math.round(seed)) + 3);
  for (let z = z0; z <= z1; z += 2.4) {
    k.line([[x0, y, z], [x1, y, z]], 'faint');
    let x = x0 + r() * 3;
    while (x < x1 - 1) { const wcell = 1.2 + r() * 4.2; if (r() > 0.5) k.line([[x, y, z], [x, y, Math.min(z1, z + 2.4)]], 'faint'); x += wcell; }
  }
}
// ROM / CAM: a bit grid with the set bits dotted in
function romBits(k, x0, z0, x1, z1, y, seed) {
  const r = mulberry32(Math.abs(Math.round(seed)) + 11);
  gridLines(k, x0, z0, x1, z1, y, 2.6);
  for (let x = x0 + 1.3; x < x1; x += 2.6) for (let z = z0 + 1.3; z < z1; z += 2.6) if (r() > 0.6) k.box(0.7, 0.12, 0.7, { p: [x, y - 0.03, z], color: MAT.graphite, tone: 0.3 });
}
function gridLines(k, x0, z0, x1, z1, y, pitch) {
  for (let x = x0; x <= x1 + 1e-6; x += pitch) k.line([[x, y, z0], [x, y, z1]], 'faint');
  for (let z = z0; z <= z1 + 1e-6; z += pitch) k.line([[x0, y, z], [x1, y, z]], 'faint');
}
// a PHY: bond pads along a die edge, ESD clamps, and serializer lanes heading inward
function phyPads(k, x0, z0, x1, z1, side, y = DIE_Y + 0.5) {
  const horiz = side === 'n' || side === 's', n = Math.floor((horiz ? x1 - x0 : z1 - z0) / 4.2);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const px = horiz ? lerp(x0, x1, u) : side === 'w' ? x0 + 2.4 : x1 - 2.4, pz = horiz ? (side === 'n' ? z0 + 2.4 : z1 - 2.4) : lerp(z0, z1, u);
    k.box(3, 0.3, 3, { p: [px, y, pz], color: MAT.gold, tone: 0.3 });
    const ex = horiz ? 0 : side === 'w' ? 4.4 : -4.4, ez = horiz ? (side === 'n' ? 4.4 : -4.4) : 0;
    k.box(horiz ? 1.6 : 2.2, 0.25, horiz ? 2.2 : 1.6, { p: [px + ex, y, pz + ez], color: MAT.graphite, tone: 0.35 });
  }
}
// an on-chip spiral inductor, the giveaway of analog / SerDes circuits
function spiral(k, cx, cz, y, r0, r1, turns = 4) {
  const pts = [];
  for (let i = 0; i <= turns * 4; i++) { const r = lerp(r1, r0, i / (turns * 4)), q = i % 4; const s = [[1, 1], [-1, 1], [-1, -1], [1, -1]][q]; pts.push([cx + s[0] * r, y, cz + s[1] * r]); }
  k.line(pts, 'mid');
}

// ── the network: a fibre bundle arching from the local package to the remote one ──
const LINK = { tx: V(LOCAL.sub[2] - 4, SUB_Y + 1, -78), rx: V(REMOTE.sub[0] + 4, SUB_Y + 1, -78) };
function buildNetwork() {
  const k = new Kit({ tone: 0.55 });
  // a connector on each package edge
  for (const [x, s] of [[LOCAL.sub[2] - 6, 1], [REMOTE.sub[0] + 6, -1]]) {
    k.box(12, 5, 30, { p: [x, SUB_Y, -78], rr: 1.2, b: 0.4, color: MAT.alu, tone: 0.55 });
    k.box(2, 3, 24, { p: [x + s * 6.6, SUB_Y + 1, -78], color: MAT.graphite, tone: 0.5 });
  }
  const pts = (dz, lift) => [[LOCAL.sub[2] + 1, SUB_Y + 2.5, -78 + dz], [LOCAL.sub[2] + 18, SUB_Y + 10 + lift, -78 + dz], [(LOCAL.sub[2] + REMOTE.sub[0]) / 2, 46 + lift, -78 + dz * 1.4],
    [REMOTE.sub[0] - 18, SUB_Y + 10 + lift, -78 + dz], [REMOTE.sub[0] - 1, SUB_Y + 2.5, -78 + dz]];
  for (const [dz, lift, c] of [[-8, 0, MAT.graphite], [-3, 1.5, MAT.rubber], [3, 1.5, MAT.rubber], [8, 0, MAT.graphite]]) k.tube(new THREE.CatmullRomCurve3(pts(dz, lift).map(p => V(...p))), 1.3, { color: c, radial: 8, step: 2 });
  k.finish(world);
  // the two directions as buses the pulses ride: requests out on the upper fibre, the stream back on the other
  BUS.net_tx = (() => { const c = new THREE.CatmullRomCurve3(pts(-3, 3.2).map(p => V(...p))); return { curve: c, len: c.getLength(), y: 0 }; })();
  BUS.net_rx = (() => { const c = new THREE.CatmullRomCurve3(pts(3, 3.2).map(p => V(...p)).reverse()); return { curve: c, len: c.getLength(), y: 0 }; })();
  silk('NETWORK · HTTPS · SSE STREAM', (LOCAL.sub[2] + REMOTE.sub[0]) / 2, -40, { size: 2.6, y: 0.1 });
}

// ── the lids: the integrated heat spreaders, drawn as glass; the 封装盖 slider sets how much shows ──
const CASE = glassMaterial({ side: THREE.DoubleSide, alpha: 0.7, rim: 0.5, ink: 0.4, streak: 0.06 });
function buildLid(P, h = 30) {
  const [x0, z0, x1, z1] = P.intp.map((v, i) => v + (i < 2 ? -6 : 6)), y0 = SUB_Y, y1 = SUB_Y + h, W = x1 - x0, D = z1 - z0;
  const panel = (w, hh, p, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), CASE); m.position.set(...p); m.rotation.set(...r); m.layers.set(1); m.renderOrder = 5; world.add(m); ghostParts.push(m); };
  panel(W, D, [(x0 + x1) / 2, y1, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]);
  panel(W, h, [(x0 + x1) / 2, (y0 + y1) / 2, z1], [0, 0, 0]);
  panel(D, h, [x0, (y0 + y1) / 2, (z0 + z1) / 2], [0, -Math.PI / 2, 0]);
  panel(W, h, [(x0 + x1) / 2, (y0 + y1) / 2, z0], [0, 0, 0]);
  panel(D, h, [x1, (y0 + y1) / 2, (z0 + z1) / 2], [0, Math.PI / 2, 0]);
  for (const [a, b] of [[[x0, y1, z0], [x1, y1, z0]], [[x0, y1, z1], [x1, y1, z1]], [[x0, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]], [[x0, y0, z1], [x0, y1, z1]], [[x1, y0, z1], [x1, y1, z1]]]) ghostLine([a, b]);
}
let XRAY = 0.18;
function setXray(v) {
  XRAY = v;
  CASE.uniforms.uAlphaK.value = v < 0.5 ? lerp(0.0, 1.6, v * 2) : lerp(1.6, 7, (v - 0.5) * 2);
  CASE.uniforms.uInkA.value = lerp(0.12, 0.5, Math.min(1, v * 2));
  LINE_M.ghost.opacity = lerp(0.05, 0.4, Math.min(1, v * 1.6));
  for (const m of ghostParts) m.visible = v > 0.01;
}
