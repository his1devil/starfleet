// ═════════════════════════ the display base, the board and its buses ═════════════════════════
// TK-1 is an inference machine drawn as one big circuit board. x runs along the board (the model
// side on the left, the tool side past the permission gate on the right), z across it (+z is the
// near edge), y up; 1 unit = 1 cm at 1:10. The agent is a courier that drives down the middle lane.
const TOP = 10;                                          // board surface
const BOARD = { x0: -300, x1: 300, z0: -170, z1: 170, t: 2.4 };
const AVE = { z: 0, half: 16, x0: -258, x1: 254 };       // the courier's lane, and how far its body may drive
const CHASSIS = { x0: -310, x1: 310, z0: -180, z1: 180, h: 150 };
// words the shared HUD uses for this scene
const WORDS = { place: '在机器里', unit: '盒' };
Object.assign(MAT, { pcb: 0xe1e6db, mask: 0xd6ddd1, gold: 0xd9b45a, ceramic: 0xeeece4, glassK: 0xdfe6ea });

// where the big parts sit; the buses between them are routed from these
const MAG = { x0: -282, x1: -172, z: -47 };              // context magazine: two rows of cartridge slots
const DMA = { x: -158, z: -50 };
// the model: twelve layer trays × 28 positions (the KV cache), and a decoder carriage in front of them
const GRID = { x0: -142, cols: 28, rows: 12, px: 4.4, py: 4.3, z: -106 };
const SUBST = { x0: -152, x1: -8, z0: -128, z1: -80, h: 3 };
const TRAY = { x: -46, z: -54 };                         // where the sampled tool-call tokens collect into a job
const SPOOL = { x: -178, z: -104 };                      // the reasoning reel
const GATE = { x: -4, post: 25, h: 100 };
const TERM = { x: -270, z: 96 };
const INTAKE = { x: -256, z: 30 };

const ghostParts = [], ghostLines = [];
function ghostLine(pts, parent = world) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => V(...p)));
  const L = new THREE.Line(g, LINE_M.ghost); L.layers.set(1); L.renderOrder = 6; parent.add(L); ghostLines.push(L);
  return L;
}

// ── the display base: a white plinth with feet, a ruler and a name plate (as in the van plate) ──
const BASE = { W: 700, D: 470, T: 10 };
function buildBase() {
  const { W, D, T } = BASE;
  const k = new Kit({ tone: 0.32 });
  k.box(W, T, D, { p: [0, -T, 0], rr: 18, b: 2.4, seg: 8 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (W / 2 - 36), z = sz * (D / 2 - 32);
    k.cyl(10, 1.8, { p: [x, -T - 8, z], seg: 24, tone: 0.25 });
    k.cyl(7, 6.4, { p: [x, -T - 6.4, z], seg: 24, b: 0.8, color: MAT.pale });
  }
  const gr = rrPts(W - 18, D - 18, 10, 6).map(p => [p[0], 0.08, p[1]]); gr.push(gr[0]); k.line(gr, 'lo');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (W / 2 - 22), z = sz * (D / 2 - 22);
    k.screw(x, 0, z, { r: 1 }); k.line(ringPts(x, 0.08, z, 2.8), 'lo');
  }
  // ruler strip on the near edge: a tick every 10 cm, a major one every 50
  const rz = D / 2 - 16, half = Math.floor((W / 2 - 60) / 10) * 10;
  k.box(half * 2 + 20, 0.8, 8.5, { p: [0, 0, rz], color: MAT.pale, tone: 0.25 });
  for (let x = -half; x <= half; x += 10) { const maj = x % 50 === 0; k.line([[x, 0.88, rz + 4.25], [x, 0.88, rz + 4.25 - (maj ? 5 : 2.6)]], maj ? 'mid' : 'lo'); }
  k.line([[-half - 10, 0.88, rz + 4.25], [half + 10, 0.88, rz + 4.25]], 'lo');
  // label plate with rule lines and two screws
  const lx = half - 30, lz = rz - 26;
  k.box(64, 1.2, 20, { p: [lx, 0, lz], rr: 2, b: 0.4, color: MAT.pale, tone: 0.3 });
  const lp = rrPts(60, 16, 1.5, 3).map(p => [lx + p[0], 1.28, lz + p[1]]); lp.push(lp[0]); k.line(lp, 'lo');
  k.line([[lx - 8, 1.28, lz + 2], [lx + 22, 1.28, lz + 2]], 'lo'); k.line([[lx - 8, 1.28, lz + 5.5], [lx + 14, 1.28, lz + 5.5]], 'lo');
  k.screw(lx - 26, 1.2, lz, { r: 0.6 }); k.screw(lx + 26, 1.2, lz, { r: 0.6 });
  k.finish(world, { cast: false });
  silk('TK-1   1:10', lx - 2, lz - 3.4, { y: 1.32, size: 3.6 });
  const H = haloTexture(560, 380, 40, 26);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * H.sw * 1.02, D * H.sh * 1.04), new THREE.MeshBasicMaterial({ map: H.tex, transparent: true, depthWrite: false, opacity: 0.3 }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(10, -T - 9, 14); halo.layers.set(1); halo.renderOrder = -1; world.add(halo);
  THEMED.push((P, name) => { halo.material.opacity = name === 'dark' ? 0.85 : 0.3; });
}

// ── the board: a solder-masked slab on brass standoffs, with copper buses, vias and silkscreen ──
function buildBoard() {
  const { x0, x1, z0, z1, t } = BOARD, W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const k = new Kit({ tone: 0.36, color: MAT.pcb });
  k.box(W, t, D, { p: [cx, TOP - t, cz], rr: 6, b: 0.5, seg: 6 });
  // the edge shows the laminate
  const ed = rrPts(W - 0.6, D - 0.6, 5.7, 6).map(p => [cx + p[0], TOP - t * 0.5, cz + p[1]]); ed.push(ed[0]); k.line(ed, 'lo');
  // brass standoffs and plated mounting holes
  const holes = [];
  for (const x of [x0 + 12, -150, 0, 150, x1 - 12]) for (const z of [z0 + 12, z1 - 12]) holes.push([x, z]);
  for (const z of [-60, 60]) { holes.push([x0 + 12, z]); holes.push([x1 - 12, z]); }
  for (const [x, z] of holes) {
    k.add(latheGeo([[0, 0], [3.2, 0], [3.2, TOP - t], [0, TOP - t]], 6), { p: [x, 0, z], color: MAT.brass, tone: 0.45 });
    k.ring(2.2, 3.6, 0.2, { p: [x, TOP, z], color: MAT.gold, seg: 24, tone: 0.3 });
    k.screw(x, TOP + 0.2, z, { r: 1.5, color: MAT.steel });
  }
  // fiducials for the courier's camera
  for (const [x, z] of [[x0 + 26, z0 + 26], [x1 - 26, z0 + 26], [x0 + 26, z1 - 26]]) { k.cyl(1.2, 0.25, { p: [x, TOP, z], color: MAT.gold, seg: 16 }); k.line(ringPts(x, TOP + 0.06, z, 3, 20), 'lo'); }
  // the lane: two dashed rails and chevrons where the courier drives
  for (const sz of [-1, 1]) for (let x = AVE.x0 - 14; x < AVE.x1 + 12; x += 8) k.line([[x, TOP + 0.05, sz * AVE.half], [x + 4.6, TOP + 0.05, sz * AVE.half]], 'mid');
  for (let x = AVE.x0 + 20; x < AVE.x1; x += 64) k.line([[x - 3, TOP + 0.05, -6], [x + 3, TOP + 0.05, 0], [x - 3, TOP + 0.05, 6]], 'lo');
  // the power rail: a ring of copper just inside the edge (it lights when the session powers up)
  const rail = rrPts(W - 22, D - 22, 8, 4).map(p => [cx + p[0], TOP + 0.04, cz + p[1]]); rail.push(rail[0]);
  k.line(rail, 'mid');
  // decorative routing: bundles of parallel traces with 45° jogs between the parts, and via fields
  const bundle = (pts, n, gap, tone = 'lo') => {
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap;
      const P = pts.map(([x, z], j) => {
        const prev = pts[j - 1], next = pts[j + 1];
        const dx = next ? next[0] - x : x - prev[0], dz = next ? next[1] - z : z - prev[1];
        return Math.abs(dx) > Math.abs(dz) ? [x, TOP + 0.05, z + o] : [x + o, TOP + 0.05, z];
      });
      k.line(P, tone);
    }
  };
  bundle([[-170, -92], [-150, -92], [-140, -82], [-134, -82]], 6, 1.3);
  bundle([[-6, -86], [14, -86], [24, -96], [24, -150]], 8, 1.3);
  bundle([[-6, -110], [6, -110], [16, -120], [16, -160]], 4, 1.3);
  bundle([[-230, 44], [-60, 44]], 10, 1.2);
  bundle([[30, 90], [280, 90]], 8, 1.3);
  bundle([[30, -86], [280, -86]], 8, 1.3);
  bundle([[-290, 20], [-290, 150]], 5, 1.4);
  bundle([[-120, 100], [-20, 100], [-10, 110], [-10, 160]], 6, 1.2);
  const r = mulberry32(11);
  for (let i = 0; i < 90; i++) {
    const x = lerp(x0 + 20, x1 - 20, r()), z = lerp(z0 + 20, z1 - 20, r());
    if (Math.abs(z) < AVE.half + 4) continue;
    k.line(ringPts(x, TOP + 0.05, z, 0.6, 8), 'lo');
  }
  // small passives scattered along the buses: 0402-ish blocks with tinned ends
  for (let i = 0; i < 70; i++) {
    const x = lerp(x0 + 24, x1 - 24, r()), z = lerp(z0 + 24, z1 - 24, r()), rot = r() > 0.5 ? Math.PI / 2 : 0;
    if (Math.abs(z) < AVE.half + 6) continue;
    k.box(3.2, 1.2, 1.6, { p: [x, TOP, z], r: [0, rot, 0], color: r() > 0.5 ? MAT.graphite : MAT.ceramic, tone: 0.4 });
    for (const s of [-1, 1]) k.box(0.7, 1.25, 1.65, { p: [x + (rot ? 0 : s * 1.3), TOP, z + (rot ? s * 1.3 : 0)], r: [0, rot, 0], color: MAT.steel, tone: 0.4 });
  }
  // gold edge fingers along the right edge
  for (let z = -40; z <= 40; z += 4) k.box(2.6, 0.2, 6, { p: [x1 - 4, TOP, z], color: MAT.gold, tone: 0.3 });
  // data buses: context → DMA → core, core → terminal, core → reasoning reel, terminal → magazine
  bus('prefill', [[MAG.x1 - 6, -30], [DMA.x - 12, -30], [DMA.x - 12, -42]], { w: 2.4, bend: 4 }, k);
  bus('prefill2', [[DMA.x + 10, -50], [-142, -50], [-134, -58], [-134, SUBST.z1]], { w: 2.4 }, k);
  bus('text', [[-96, SUBST.z1], [-96, -26], [-226, -26], [-232, -20], [-232, 58], [TERM.x + 12, 70]], { w: 2.2, bend: 8 }, k);
  bus('user', [[TERM.x + 4, 70], [-244, 62], [-244, -20], [-250, -26], [-250, -33]], { w: 2.2, bend: 6 }, k);
  bus('think', [[SUBST.x0, -118], [-168, -118], [-168, -112]], { w: 2, bend: 4 }, k);
  bus('job', [[TRAY.x, SUBST.z1], [TRAY.x, TRAY.z - 8]], { w: 2, bend: 2 }, k);
  k.finish(world, { cast: false });
  // silkscreen
  silk('TK-1  REV C   INFERENCE BOARD', -296, 158, { size: 4.2, weight: 600, align: 'left' });
  silk('© STARFLEET 2026 · grok-build ATE v1', -296, 164.5, { size: 2.6, align: 'left' });
  silk('LANE A', AVE.x0 - 6, -AVE.half - 4, { size: 2.6, align: 'left' });
  silk('MODEL SIDE', -140, AVE.half + 5, { size: 2.6 });
  silk('TOOL SIDE · SANDBOXED', 120, AVE.half + 5, { size: 2.6 });
  silk('J1 CTX', MAG.x0 + 6, -66, { size: 2.8, align: 'left' });
  silk('U2 DMA', DMA.x - 6, -63, { size: 2.6, align: 'left' });
  silk('U1 CORE · 12 LAYERS × 28 POS', SUBST.x0 + 2, SUBST.z1 + 4, { size: 2.8, align: 'left' });
}

// ── board furniture: the parts every real board carries, so the drawing reads as dense as one ──
function qfp(k, x, z, w, d, o = {}) {
  const h = o.h ?? 1.6, n = o.pins ?? Math.max(4, Math.round(w / 1.6)), m = o.pinsZ ?? Math.max(4, Math.round(d / 1.6));
  k.box(w, h, d, { p: [x, TOP, z], rr: 0.5, b: 0.25, color: o.color ?? MAT.graphite, tone: 0.55 });
  for (let i = 0; i < n; i++) { const u = -w / 2 + 1 + ((i + 0.5) * (w - 2)) / n; for (const sg of [-1, 1]) k.box(0.55, 0.45, 1.5, { p: [x + u, TOP, z + sg * (d / 2 + 0.6)], color: MAT.steel, tone: 0.4 }); }
  for (let i = 0; i < m; i++) { const u = -d / 2 + 1 + ((i + 0.5) * (d - 2)) / m; for (const sg of [-1, 1]) k.box(1.5, 0.45, 0.55, { p: [x + sg * (w / 2 + 0.6), TOP, z + u], color: MAT.steel, tone: 0.4 }); }
  k.line(ringPts(x - w / 2 + 1.6, TOP + h + 0.03, z - d / 2 + 1.6, 0.5, 10), 'mid');
  if (o.label) silk(o.label, x, z + d / 2 + 3.4, { size: o.labelSize ?? 2 });
}
function ecap(k, x, z, r = 2.6, h = 7) {
  k.cyl(r, h, { p: [x, TOP, z], color: MAT.alu, seg: 20, b: 0.5, tone: 0.55 });
  k.cyl(r + 0.06, 1.4, { p: [x, TOP + h - 3, z], color: MAT.graphite, seg: 20, tone: 0.55 });
  k.line([[x - r * 0.55, TOP + h + 0.03, z], [x + r * 0.55, TOP + h + 0.03, z]], 'lo'); k.line([[x, TOP + h + 0.03, z - r * 0.55], [x, TOP + h + 0.03, z + r * 0.55]], 'lo');
}
function inductor(k, x, z, sz = 6) { k.box(sz, sz * 0.62, sz, { p: [x, TOP, z], rr: 1.1, b: 0.4, color: MAT.graphite, tone: 0.6 }); k.line(ringPts(x, TOP + sz * 0.62 + 0.03, z, sz * 0.26, 16), 'lo'); }
function header(k, x, z, n, rows = 1) {
  k.box(n * 2.54, 2.4, rows * 2.54, { p: [x, TOP, z], color: MAT.graphite, tone: 0.55 });
  for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) k.box(0.64, 6.2, 0.64, { p: [x - n * 1.27 + 1.27 + i * 2.54, TOP + 0.4, z - rows * 1.27 + 1.27 + j * 2.54], color: MAT.gold, tone: 0.4 });
}
function sinkChip(k, x, z, w, fins, h = 10) {
  qfp(k, x, z, w, w, { h: 2 });
  k.box(w - 2, 1.2, w - 2, { p: [x, TOP + 2, z], color: MAT.alu, tone: 0.5 });
  for (let i = 0; i < fins; i++) k.box(0.9, h, w - 3, { p: [x - (w - 4) / 2 + (i * (w - 4)) / (fins - 1), TOP + 3.2, z], color: MAT.alu, tone: 0.55 });
}
function hatch(k, x0, z0, x1, z1, step = 3) {
  for (let d = 0; d < (x1 - x0) + (z1 - z0); d += step) {
    const a = [x0 + Math.max(0, d - (z1 - z0)), z1 - Math.min(d, z1 - z0)], b = [x0 + Math.min(d, x1 - x0), z1 - Math.max(0, d - (x1 - x0))];
    k.line([[a[0], TOP + 0.04, a[1]], [b[0], TOP + 0.04, b[1]]], 'lo');
  }
  const o = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => [x, TOP + 0.04, z]); k.line(o, 'mid');
}
function buildFurniture() {
  const k = new Kit({ tone: 0.5 });
  // the core's power stage, in front of the tool side: phases of inductors, a wall of caps, a controller
  hatch(k, 26, 94, 108, 166, 3.2);
  for (let i = 0; i < 5; i++) inductor(k, 36 + i * 14, 104, 7);
  for (let i = 0; i < 6; i++) ecap(k, 34 + i * 12.4, 124, 3.2, 9);
  qfp(k, 50, 150, 12, 12, { label: 'U6 VRM 0.8V' });
  for (let i = 0; i < 4; i++) k.box(3.2, 1.2, 1.6, { p: [72 + i * 7, TOP, 150], color: MAT.ceramic, tone: 0.45 });
  silk('PWR STAGE · 5φ', 30, 166, { size: 2.2, align: 'left' });
  // a switch fabric under a heatsink behind the tool row
  sinkChip(k, 222, -126, 24, 9, 12);
  for (const [x, z] of [[198, -106], [198, -146], [246, -106], [246, -146]]) ecap(k, x, z, 2.6, 7);
  silk('U7 FABRIC', 222, -110, { size: 2.2 });
  // an embedded controller and a debug header beside the clock
  qfp(k, -40, 80, 12, 12, { label: 'U9 EC' });
  header(k, -40, 104, 8, 2);
  silk('J5 JTAG', -40, 110.5, { size: 1.8 });
  for (let i = 0; i < 3; i++) ecap(k, -54 + i * 10, 128, 2.6, 7);
  qfp(k, -40, 150, 9, 9, { label: 'U10 FLASH', labelSize: 1.7 });
  // the console's serial jack at the near edge
  k.box(14, 6, 10, { p: [-276, TOP, 160], rr: 1, b: 0.4, color: MAT.alu, tone: 0.55 });
  k.box(9, 3, 1, { p: [-276, TOP + 1.5, 165.1], rr: 1.2, color: MAT.graphite });
  silk('J2 TTY', -276, 152, { size: 1.8 });
  for (const x of [-258, -250]) ecap(k, x, 158, 2.2, 6);
  // ESD protection where signals cross the gate
  for (let i = 0; i < 4; i++) for (const z of [-50, 44]) { k.box(2.6, 1.2, 1.4, { p: [12, TOP, z + i * 3.4], color: MAT.graphite, tone: 0.45 }); }
  qfp(k, 14, -66, 8, 8, { label: 'U8 GATE', labelSize: 1.6 });
  // decoupling caps standing guard along the back of the tool row
  for (let x = 30; x <= 250; x += 22) ecap(k, x, -84, 1.8, 5);
  k.finish(world);
}

// ── the chassis: a glass-and-sheet case around the board; the 机箱 slider sets how much of it shows ──
// the case is clear sheet: a faint veil with only a hint of the glass streak (it covers the whole view)
const CASE = glassMaterial({ side: THREE.DoubleSide, alpha: 0.7, rim: 0.5, ink: 0.4, streak: 0.06 });
function buildChassis() {
  const { x0, x1, z0, z1, h } = CHASSIS, y0 = TOP - 3, y1 = TOP + h, W = x1 - x0, D = z1 - z0;
  const panel = (w, hh, p, r) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), CASE); m.position.set(...p); m.rotation.set(...r); m.layers.set(1); m.renderOrder = 5; world.add(m); ghostParts.push(m); return m; };
  panel(W, D, [(x0 + x1) / 2, y1, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]);
  panel(W, h + 3, [(x0 + x1) / 2, (y0 + y1) / 2, z1], [0, 0, 0]);
  panel(D, h + 3, [x0, (y0 + y1) / 2, (z0 + z1) / 2], [0, -Math.PI / 2, 0]);
  panel(W, h + 3, [(x0 + x1) / 2, (y0 + y1) / 2, z0], [0, 0, 0]);
  panel(D, h + 3, [x1, (y0 + y1) / 2, (z0 + z1) / 2], [0, Math.PI / 2, 0]);
  // edges, a seam down the lid, vent slots on the near and left panels
  for (const [a, b] of [[[x0, y0, z1], [x1, y0, z1]], [[x0, y1, z1], [x1, y1, z1]], [[x0, y1, z0], [x1, y1, z0]], [[x0, y1, z0], [x0, y1, z1]], [[x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y1, z0]], [[x0, y0, z1], [x0, y1, z1]], [[x1, y0, z1], [x1, y1, z1]], [[x1, y0, z0], [x1, y1, z0]], [[x0, y0, z0], [x0, y0, z1]], [[x0, y0, z0], [x1, y0, z0]], [[x1, y0, z0], [x1, y0, z1]]]) ghostLine([a, b]);
  ghostLine([[0, y1, z0], [0, y1, z1]]);
  for (let x = x0 + 40; x < x1 - 40; x += 9) ghostLine([[x, y1 - 14, z1], [x, y1 - 36, z1]]);
  for (let z = z0 + 40; z < z1 - 40; z += 9) ghostLine([[x0, y1 - 14, z], [x0, y1 - 36, z]]);
  // four corner rails stay solid: the frame the panels hang on
  const k = new Kit({ tone: 0.5 });
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) k.box(3, 3, 3, { p: [x, y0 - 1, z], color: MAT.steel, b: 0.4 });
  k.finish(world, { cast: false });
}
// the 机箱 slider: 0 = case off, 1 = closed case
let XRAY = 0.22;
function setXray(v) {
  XRAY = v;
  CASE.uniforms.uAlphaK.value = v < 0.5 ? lerp(0.0, 1.6, v * 2) : lerp(1.6, 7, (v - 0.5) * 2);
  CASE.uniforms.uInkA.value = lerp(0.12, 0.5, Math.min(1, v * 2));
  LINE_M.ghost.opacity = lerp(0.06, 0.4, Math.min(1, v * 1.6));
  for (const m of ghostParts) m.visible = v > 0.01;
}
