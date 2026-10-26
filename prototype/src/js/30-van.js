// ═════════════════════════ the display base and the van ═════════════════════════
// x runs along the van (front +x), z across it (the cut-open near side is +z), y up; 1 unit = 1 cm.
// A long, high-roof van: 6 m long, 2.16 m wide, the lab fills everything behind the cab bulkhead.
const VAN = { x0: -300, x1: 300, z: 108, wall: 3, roof: 236, bottom: 36, wheelR: 36, wheelX: 200, wheelZ: 92, arch: 42 };
const FLOOR = 52, BENCH = 122, ROOF = VAN.roof, FX = 176;
const WALLZ = -(VAN.z - VAN.wall);   // inner face of the far wall
const NEARZ = VAN.z - VAN.wall;      // inner face of the near wall
const world = group(scene);
const ghostParts = [], ghostLines = [];

function ringPts(cx, y, cz, r, n = 24, axis = 'y') {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r;
    pts.push(axis === 'y' ? [cx + c, y, cz + s] : axis === 'z' ? [cx + c, y + s, cz] : [cx, y + c, cz + s]);
  }
  return pts;
}
function haloTexture(w, h, r, blur) {
  const pad = blur * 2, c = mkCanvas(w + pad * 2, h + pad * 2), g = c.getContext('2d');
  g.filter = `blur(${blur}px)`; g.fillStyle = '#000';
  g.beginPath(); g.roundRect(pad, pad, w, h, r); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, sw: (w + pad * 2) / w, sh: (h + pad * 2) / h };
}

const BASE = { W: VAN.x1 - VAN.x0 + 72, D: VAN.z * 2 + 104, T: 10 };
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
  const rz = D / 2 - 16, half = Math.floor((W / 2 - 50) / 10) * 10;
  k.box(half * 2 + 20, 0.8, 8.5, { p: [0, 0, rz], color: MAT.pale, tone: 0.25 });
  for (let x = -half; x <= half; x += 10) { const maj = x % 50 === 0; k.line([[x, 0.88, rz + 4.25], [x, 0.88, rz + 4.25 - (maj ? 5 : 2.6)]], maj ? 'mid' : 'lo'); }
  k.line([[-half - 10, 0.88, rz + 4.25], [half + 10, 0.88, rz + 4.25]], 'lo');
  // label plate with three rule lines (they stand for printed text) and two screws
  const lx = -half + 40, lz = rz - 30;
  k.box(64, 1.2, 22, { p: [lx, 0, lz], rr: 2, b: 0.4, color: MAT.pale, tone: 0.3 });
  const lp = rrPts(60, 18, 1.5, 3).map(p => [lx + p[0], 1.28, lz + p[1]]); lp.push(lp[0]); k.line(lp, 'lo');
  k.line([[lx - 8, 1.28, lz - 1], [lx + 22, 1.28, lz - 1]], 'lo'); k.line([[lx - 8, 1.28, lz + 3], [lx + 16, 1.28, lz + 3]], 'lo'); k.line([[lx - 8, 1.28, lz + 7], [lx + 10, 1.28, lz + 7]], 'lo');
  k.screw(lx - 26, 1.2, lz, { r: 0.6 }); k.screw(lx + 26, 1.2, lz, { r: 0.6 });
  // wheel chocks
  for (const x of [-VAN.wheelX, VAN.wheelX]) for (const sz of [-1, 1]) for (const dx of [-46, 46]) {
    k.at([x + dx, 0, sz * VAN.wheelZ], [0, dx > 0 ? 0 : Math.PI, 0], kk => {
      kk.add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-6, 0), new THREE.Vector2(6, 0), new THREE.Vector2(-6, 9)]), { depth: 22, bevelEnabled: false }), { p: [0, 0, -11], color: MAT.pale, tone: 0.3 });
    });
  }
  k.finish(world, { cast: false });
  // engraved name on the label plate
  const c = mkCanvas(256, 64), g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(lx + 13, 1.32, lz - 5.6); lbl.layers.set(1); world.add(lbl);
  THEMED.push(P => { g.clearRect(0, 0, 256, 64); g.fillStyle = P.ink; g.globalAlpha = 0.7; g.font = `500 34px ${FONT_MONO}`; g.textBaseline = 'middle'; g.fillText('MV-01  1:20', 4, 34); tex.needsUpdate = true; });
  // the soft halo that lifts the base off the card
  const H = haloTexture(560, 260, 40, 26);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * H.sw * 1.02, D * H.sh * 1.05), new THREE.MeshBasicMaterial({ map: H.tex, transparent: true, depthWrite: false, opacity: 0.3 }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(10, -T - 9, 14); halo.layers.set(1); halo.renderOrder = -1; world.add(halo);
  THEMED.push((P, name) => { halo.material.opacity = name === 'dark' ? 0.85 : 0.3; });
}

// side silhouette of a long high-roof van, drawn in x/y
const WS = { top: [226, ROOF], bot: [272, 146] };   // windscreen line
function sideShape() {
  const { x0, x1, bottom, wheelX, arch } = VAN, s = new THREE.Shape();
  s.moveTo(x0, bottom);
  s.lineTo(x0, ROOF - 16); s.quadraticCurveTo(x0, ROOF, x0 + 16, ROOF);
  s.lineTo(WS.top[0] - 18, ROOF); s.quadraticCurveTo(WS.top[0], ROOF, WS.top[0] + 6, ROOF - 10);
  s.lineTo(WS.bot[0], WS.bot[1]); s.quadraticCurveTo(WS.bot[0] + 4, WS.bot[1] - 6, WS.bot[0] + 12, WS.bot[1] - 9);
  s.quadraticCurveTo(x1, WS.bot[1] - 12, x1, WS.bot[1] - 24);
  s.lineTo(x1 + 1, bottom + 12); s.quadraticCurveTo(x1 + 1, bottom, x1 - 11, bottom);
  s.lineTo(wheelX + arch, bottom); s.absarc(wheelX, bottom, arch, 0, Math.PI, false);
  s.lineTo(-wheelX + arch, bottom); s.absarc(-wheelX, bottom, arch, 0, Math.PI, false);
  s.lineTo(x0, bottom);
  return s;
}
const polyPath = (pts, Ctor = THREE.Path) => new Ctor(pts.map(([x, y]) => new THREE.Vector2(x, y)));
function roundRectPath(x0, y0, x1, y1, r, Ctor = THREE.Path) {
  const p = new Ctor();
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r); p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r); p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}
const FRONT_WIN = [[FX + 6, 160], [FX + 6, ROOF - 12], [WS.top[0] - 4, ROOF - 12], [WS.bot[0] - 10, 160]];
const CLERESTORY = [-160, 204, 168, 228];

function wheel(parent, x, z, near) {
  const k = new Kit({ tone: 0.5 }), R = VAN.wheelR / 32;
  k.at([x, VAN.wheelR + 0.6, z], [Math.PI / 2, 0, 0], kk => {
    kk.lathe([[21, -11], [29, -11.5, 1], [31.6, -9.5, 1], [32.4, -6, 1], [32.4, 6, 1], [31.6, 9.5, 1], [29, 11.5, 1], [21, 11]].map(([r, y, s]) => [r * R, y, s]), { seg: 56, color: MAT.rubber, tone: 0.75 });
    for (const t of [-6.5, -2.2, 2.2, 6.5]) kk.line(ringPts(0, t, 0, 32.5 * R, 56), 'lo');
    kk.at([0, 0, 0], [near ? 0 : Math.PI, 0, 0], k3 => {
      k3.lathe([[0, 4], [21.2, 4], [21.2, 10.6], [19.6, 8.4, 1], [16.5, 6.8, 1], [8, 8.2], [6.5, 8.6], [5.5, 9.8], [0, 9.8]].map(([r, y, s]) => [r * R, y, s]), { seg: 48, color: MAT.alu, tone: 0.6 });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k3.screw(Math.cos(a) * 4.9, 9.8, Math.sin(a) * 4.9, { r: 0.75 }); }
      k3.cyl(2.8, 0.8, { p: [0, 9.8, 0], color: MAT.steel, b: 0.3 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; k3.line([[Math.cos(a) * 9.5, 8.4, Math.sin(a) * 9.5], [Math.cos(a) * 17, 7.2, Math.sin(a) * 17]], 'lo'); }
      k3.line(ringPts(0, 7.1, 0, 16.5 * R, 48), 'lo');
    });
  });
  k.finish(parent);
}

function buildVan() {
  const van = group(world);
  const { x0, x1, z: Z, wall, bottom, wheelX } = VAN, L = x1 - x0;
  const k = new Kit({ tone: 0.42 });
  // far wall (solid), with the driver's window and a clerestory strip above the bench
  const shape = sideShape();
  shape.holes.push(polyPath(FRONT_WIN), roundRectPath(...CLERESTORY, 6));
  k.add(new THREE.ExtrudeGeometry(shape, { depth: wall, bevelEnabled: false, curveSegments: 14 }), { p: [0, 0, -Z], tone: 0.42 });
  // inner trim of the far wall: belt rail, cant rail, ribs between the panels, rivets
  k.box(FX - x0 - 8, 4, 3, { p: [(x0 + FX) / 2, 196, WALLZ + 1.5], color: MAT.pale, b: 0.6 });
  for (const x of [-250, -170, -90, -10, 70, 150]) k.box(5, 140, 2, { p: [x, FLOOR + 2, WALLZ + 1], color: MAT.pale, tone: 0.32 });
  for (let x = x0 + 8; x <= FX - 8; x += 13) k.screw(x, 198, WALLZ + 3, { axis: 'z', r: 0.4 });
  // cant rails along both walls: the frame that stays when the roof skin is cut away
  for (const sz of [-1, 1]) k.box(FX - x0 + 54, 6, 5, { p: [(x0 + FX + 54) / 2, ROOF - 9, sz * (Z - 6)], b: 0.8, color: MAT.pale, tone: 0.5 });
  // floor slab, anti-slip ribs, tie-down tracks, wheel wells
  k.box(L - 2, 8, Z * 2 - 4, { p: [0, FLOOR - 8, 0], b: 1.2, tone: 0.4 });
  for (let z = -Z + 12; z <= Z - 12; z += 12) k.line([[x0 + 4, FLOOR + 0.05, z], [FX - 2, FLOOR + 0.05, z]], 'lo');
  for (const z of [-40, 40]) { k.box(FX - x0 - 60, 0.8, 3.4, { p: [(x0 + FX) / 2 - 10, FLOOR, z], color: MAT.alu, tone: 0.35 }); for (let x = x0 + 30; x <= FX - 40; x += 8) k.line([[x, FLOOR + 0.86, z - 1.1], [x, FLOOR + 0.86, z + 1.1]], 'lo'); }
  for (const x of [-wheelX, wheelX]) for (const sz of [-1, 1]) k.box(92, 22, 28, { p: [x, FLOOR, sz * (Z - 17)], rr: 6, b: 2, color: MAT.pale, tone: 0.4 });
  // rear frame: D pillars, sill, bumper with a step, tail lights
  for (const sz of [-1, 1]) {
    k.box(5, ROOF - 12 - FLOOR, 5, { p: [x0 + 2.5, FLOOR, sz * (Z - 3)], b: 0.8, tone: 0.5 });
    k.box(2.5, 40, 8, { p: [x0 - 0.6, 136, sz * (Z - 10)], rr: 1, b: 0.5, color: 0xe7c9c3, tone: 0.55 });
    k.line([[x0 - 1.9, 156, sz * (Z - 10) - 3.5], [x0 - 1.9, 156, sz * (Z - 10) + 3.5]], 'lo');
  }
  k.box(12, 18, Z * 2 + 4, { p: [x0 - 3, bottom - 2, 0], rr: 3, b: 1.2, color: MAT.pale, tone: 0.45 });
  k.box(14, 3, 80, { p: [x0 - 10, bottom + 4, 0], b: 0.6, color: MAT.graphite, tone: 0.5 });
  for (let z = -36; z <= 36; z += 6) k.line([[x0 - 16.5, bottom + 7.05, z], [x0 - 3.5, bottom + 7.05, z]], 'lo');
  // under the floor: chassis rails, battery pack with cooling ribs, axles, coil springs
  for (const sz of [-1, 1]) k.box(L - 60, 9, 7, { p: [0, bottom - 1, sz * 76], color: MAT.graphite, tone: 0.4 });
  k.box(300, 9, 130, { p: [0, bottom - 1, 0], rr: 4, b: 1, color: MAT.steel, tone: 0.4 });
  for (let x = -144; x <= 144; x += 8) k.line([[x, bottom + 5, 65.05], [x, bottom, 65.05]], 'lo');
  for (const x of [-wheelX, wheelX]) {
    k.tube([[x, bottom - 1, -78], [x, bottom - 1, 78]], 2.8, { color: MAT.graphite, tone: 0.5 }); k.sphere(7.5, { p: [x, bottom - 1, 0], color: MAT.graphite });
    for (const sz of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU * 4; pts.push(V(x + 20 + Math.cos(a) * 4.4, bottom + 2 + (i / 64) * 8, sz * 62 + Math.sin(a) * 4.4)); }
      k.tube(new THREE.CatmullRomCurve3(pts), 0.75, { color: MAT.steel, radial: 6 });
    }
  }
  // the nose: hood, front face, bumper, as one block across the width
  const nose = polyPath([[x1 - 40, bottom], [x1 - 11, bottom], [x1 + 1, bottom + 12], [x1, WS.bot[1] - 24], [WS.bot[0] + 12, WS.bot[1] - 9], [WS.bot[0], WS.bot[1]], [x1 - 40, WS.bot[1]]], THREE.Shape);
  k.add(new THREE.ExtrudeGeometry(nose, { depth: Z * 2 - 6, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, bevelSegments: 1, curveSegments: 8 }), { p: [0, 0, -Z + 3], tone: 0.48 });
  for (const sz of [-1, 1]) { k.box(3, 11, 34, { p: [x1 + 2, 104, sz * 70], rr: 2, b: 0.6, color: MAT.pale, tone: 0.55 }); k.cyl(4.4, 1.5, { p: [x1 + 3.5, 110, sz * 58], r: [0, 0, -Math.PI / 2], color: MAT.steel }); }
  for (let y = 66; y <= 92; y += 6) k.line([[x1 + 3.05, y, -46], [x1 + 3.05, y, 46]], 'lo');
  k.box(10, 14, Z * 2 + 8, { p: [x1 - 2, bottom - 2, 0], rr: 3, b: 1.2, color: MAT.pale, tone: 0.45 });
  // A pillars, dash cowl, windscreen
  for (const sz of [-1, 1]) k.tube([[WS.top[0] + 2, ROOF - 3, sz * (Z - 2)], [WS.bot[0] + 1, WS.bot[1] - 1, sz * (Z - 2)]], 2.6, { color: MAT.pale, tone: 0.5 });
  k.box(4, 3, Z * 2 - 8, { p: [WS.bot[0] + 2, WS.bot[1] - 3, 0], b: 0.6, color: MAT.graphite, tone: 0.5 });
  const wsLen = Math.hypot(WS.bot[0] - WS.top[0], WS.top[1] - WS.bot[1]);
  const ws = new THREE.PlaneGeometry(Z * 2 - 8, wsLen); ws.rotateY(Math.PI / 2); ws.rotateZ(Math.atan2(WS.bot[0] - WS.top[0], WS.top[1] - WS.bot[1]));
  k.add(ws, { p: [(WS.top[0] + WS.bot[0]) / 2, (WS.top[1] + WS.bot[1]) / 2, 0], glass: true });
  k.add(new THREE.ShapeGeometry(polyPath(FRONT_WIN, THREE.Shape)), { p: [0, 0, -Z + 1.5], glass: true });
  k.add(new THREE.ShapeGeometry(roundRectPath(...CLERESTORY, 6, THREE.Shape)), { p: [0, 0, -Z + 1.5], glass: true });
  k.finish(van, { glassMat: GLASS2 });

  for (const x of [-wheelX, wheelX]) { wheel(van, x, -VAN.wheelZ, false); wheel(van, x, VAN.wheelZ, true); }

  // ── the skin that is cut away: near wall, roof and tailgate as a ghost shell ──
  const nearShape = sideShape();
  nearShape.holes.push(polyPath(FRONT_WIN), roundRectPath(30, 160, 160, 226, 6), roundRectPath(x0 + 14, 160, -20, 226, 6));
  addGhost(new THREE.ShapeGeometry(nearShape, 14), [0, 0, Z], [0, 0, 0], van);
  ghostOutline(nearShape, van);
  const door = [[20, bottom + 6], [20, ROOF - 4], [170, ROOF - 4], [170, bottom + 6]].map(([x, y]) => [x, y, Z + 0.2]);
  ghostLine([...door, door[0]], van);
  ghostLine([[FX + 2, bottom + 6, Z + 0.2], [FX + 2, ROOF - 4, Z + 0.2], [WS.top[0] + 4, ROOF - 4, Z + 0.2]], van);
  ghostLine([[20, bottom + 10, Z + 0.2], [170, bottom + 10, Z + 0.2]], van);
  const roof = slabGeo(WS.top[0] - x0 - 4, 4, Z * 2, 14, 1.5, 6);
  addGhost(roof, [(x0 + WS.top[0]) / 2 - 2, ROOF - 4, 0], [0, 0, 0], van);
  const rl = rrPts(WS.top[0] - x0 - 4, Z * 2, 14, 6).map(p => [p[0] + (x0 + WS.top[0]) / 2 - 2, ROOF, p[1]]); rl.push(rl[0]); ghostLine(rl, van);
  // tailgate, lifted on its hinge at the roof's rear edge
  const tg = group(van, [x0 + 2, ROOF - 2, 0], [0, 0, 0]);
  tg.rotation.z = -1.92;
  const gateGeo = slabGeo(4, 168, Z * 2 - 6, 0, 0); gateGeo.translate(-2, -168, 0);
  addGhost(gateGeo, [0, 0, 0], [0, 0, 0], tg);
  ghostLine([[-4.2, 0, -Z + 3], [-4.2, -168, -Z + 3], [-4.2, -168, Z - 3], [-4.2, 0, Z - 3], [-4.2, 0, -Z + 3]], tg);
  ghostLine([[-4.2, -14, -Z + 18], [-4.2, -76, -Z + 18], [-4.2, -76, Z - 18], [-4.2, -14, Z - 18], [-4.2, -14, -Z + 18]], tg);
  const kg = new Kit({ tone: 0.5 });
  kg.box(3, 4, 24, { p: [-5.5, -158, 0], rr: 1.5, b: 0.5, color: MAT.graphite });
  kg.finish(tg);
  setXray(0.22);
}
function addGhost(geo, p, r, parent) {
  const m = new THREE.Mesh(geo, GHOST);
  m.position.set(...p); m.rotation.set(...r); m.layers.set(1); m.renderOrder = 5; m.castShadow = false;
  parent.add(m); ghostParts.push(m);
  return m;
}
function ghostLine(pts, parent) {
  const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => V(...p)));
  const L = new THREE.Line(g, LINE_M.ghost); L.layers.set(1); L.renderOrder = 6; parent.add(L); ghostLines.push(L);
  return L;
}
function ghostOutline(shape, parent) {
  const outer = shape.getPoints(14).map(v => [v.x, v.y, VAN.z + 0.2]); outer.push(outer[0]); ghostLine(outer, parent);
  for (const h of shape.holes) { const pts = h.getPoints(8).map(v => [v.x, v.y, VAN.z + 0.2]); pts.push(pts[0]); ghostLine(pts, parent); }
}
// the 透视 slider: 0 = skin fully cut away, 1 = closed van
let XRAY = 0.22;
function setXray(v) {
  XRAY = v;
  GHOST.uniforms.uAlphaK.value = v < 0.5 ? lerp(0.0, 1.6, v * 2) : lerp(1.6, 7, (v - 0.5) * 2);
  GHOST.uniforms.uInkA.value = lerp(0.12, 0.5, Math.min(1, v * 2));
  LINE_M.ghost.opacity = lerp(0.08, 0.42, Math.min(1, v * 1.6));
  for (const m of ghostParts) m.visible = v > 0.01;
}
