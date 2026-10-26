// ═════════════════════════ the display base and the van ═════════════════════════
// x runs along the van (front +x), z across it (the cut-open near side is +z), y up; 1 unit = 1 cm.
const FLOOR = 52, BENCH = 122, ROOF = 205, BOW = 198, FX = 108;
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

function buildBase() {
  const W = 640, D = 344, T = 10;
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
  const rz = D / 2 - 16;
  k.box(560, 0.8, 8.5, { p: [0, 0, rz], color: MAT.pale, tone: 0.25 });
  for (let x = -270; x <= 270; x += 10) { const maj = x % 50 === 0; k.line([[x, 0.88, rz + 4.25], [x, 0.88, rz + 4.25 - (maj ? 5 : 2.6)]], maj ? 'mid' : 'lo'); }
  k.line([[-280, 0.88, rz + 4.25], [280, 0.88, rz + 4.25]], 'lo');
  // label plate with three rule lines (they stand for printed text) and two screws
  const lx = -238, lz = rz - 30;
  k.box(64, 1.2, 22, { p: [lx, 0, lz], rr: 2, b: 0.4, color: MAT.pale, tone: 0.3 });
  const lp = rrPts(60, 18, 1.5, 3).map(p => [lx + p[0], 1.28, lz + p[1]]); lp.push(lp[0]); k.line(lp, 'lo');
  k.line([[lx - 8, 1.28, lz - 1], [lx + 22, 1.28, lz - 1]], 'lo'); k.line([[lx - 8, 1.28, lz + 3], [lx + 16, 1.28, lz + 3]], 'lo'); k.line([[lx - 8, 1.28, lz + 7], [lx + 10, 1.28, lz + 7]], 'lo');
  k.screw(lx - 26, 1.2, lz, { r: 0.6 }); k.screw(lx + 26, 1.2, lz, { r: 0.6 });
  // wheel chocks
  for (const x of [-150, 150]) for (const sz of [-1, 1]) for (const dx of [-44, 44]) {
    k.at([x + dx, 0, sz * 80], [0, dx > 0 ? 0 : Math.PI, 0], kk => {
      kk.add(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-6, 0), new THREE.Vector2(6, 0), new THREE.Vector2(-6, 9)]), { depth: 20, bevelEnabled: false }), { p: [0, 0, -10], color: MAT.pale, tone: 0.3 });
    });
  }
  k.finish(world, { cast: false });
  // engraved name on the label plate
  const c = mkCanvas(256, 64), g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(lx + 13, 1.32, lz - 5.6); lbl.layers.set(1); world.add(lbl);
  THEMED.push(P => { g.clearRect(0, 0, 256, 64); g.fillStyle = P.ink; g.globalAlpha = 0.7; g.font = `500 34px ${FONT_MONO}`; g.textBaseline = 'middle'; g.fillText('MV-01  1:20', 4, 34); tex.needsUpdate = true; });
  // the soft halo that lifts the base off the card
  const H = haloTexture(520, 280, 40, 26);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(W * H.sw * 1.04, D * H.sh * 1.06), new THREE.MeshBasicMaterial({ map: H.tex, transparent: true, depthWrite: false, opacity: 0.3 }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(10, -T - 9, 14); halo.layers.set(1); halo.renderOrder = -1; world.add(halo);
  THEMED.push((P, name) => { halo.material.opacity = name === 'dark' ? 0.85 : 0.3; });
}

// side silhouette of a cab-forward van (a 面包车), drawn in x/y
function sideShape() {
  const s = new THREE.Shape();
  s.moveTo(-240, 36);
  s.lineTo(-240, 190); s.quadraticCurveTo(-240, ROOF, -225, ROOF);
  s.lineTo(166, ROOF); s.quadraticCurveTo(182, ROOF, 188, 194);
  s.lineTo(226, 130); s.quadraticCurveTo(229, 124, 236, 121);
  s.quadraticCurveTo(242, 118, 242, 108);
  s.lineTo(243, 48); s.quadraticCurveTo(243, 36, 231, 36);
  s.lineTo(190, 36); s.absarc(150, 36, 40, 0, Math.PI, false);
  s.lineTo(-110, 36); s.absarc(-150, 36, 40, 0, Math.PI, false);
  s.lineTo(-240, 36);
  return s;
}
const polyPath = (pts, Ctor = THREE.Path) => new Ctor(pts.map(([x, y]) => new THREE.Vector2(x, y)));
function roundRectPath(x0, y0, x1, y1, r, Ctor = THREE.Path) {
  const p = new Ctor();
  p.moveTo(x0 + r, y0); p.lineTo(x1 - r, y0); p.quadraticCurveTo(x1, y0, x1, y0 + r); p.lineTo(x1, y1 - r); p.quadraticCurveTo(x1, y1, x1 - r, y1);
  p.lineTo(x0 + r, y1); p.quadraticCurveTo(x0, y1, x0, y1 - r); p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  return p;
}
const FRONT_WIN = [[116, 148], [116, 192], [180, 192], [208, 148]];

function wheel(parent, x, z, near) {
  const k = new Kit({ tone: 0.5 });
  k.at([x, 33, z], [Math.PI / 2, 0, 0], kk => {
    // tyre: a rounded section turned about the axle
    kk.lathe([[21, -11], [29, -11.5, 1], [31.6, -9.5, 1], [32.4, -6, 1], [32.4, 6, 1], [31.6, 9.5, 1], [29, 11.5, 1], [21, 11]], { seg: 56, color: MAT.rubber, tone: 0.75 });
    for (const t of [-6.5, -2.2, 2.2, 6.5]) kk.line(ringPts(0, t, 0, 32.5, 56), 'lo');
    // rim and hub (the face toward the outside)
    kk.at([0, 0, 0], [near ? 0 : Math.PI, 0, 0], k3 => {
      k3.lathe([[0, 4], [21.2, 4], [21.2, 10.6], [19.6, 8.4, 1], [16.5, 6.8, 1], [8, 8.2], [6.5, 8.6], [5.5, 9.8], [0, 9.8]], { seg: 48, color: MAT.alu, tone: 0.6 });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k3.screw(Math.cos(a) * 4.6, 9.8, Math.sin(a) * 4.6, { r: 0.75 }); }
      k3.cyl(2.6, 0.8, { p: [0, 9.8, 0], color: MAT.steel, b: 0.3 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; k3.line([[Math.cos(a) * 9, 8.4, Math.sin(a) * 9], [Math.cos(a) * 16, 7.2, Math.sin(a) * 16]], 'lo'); }
      k3.line(ringPts(0, 7.1, 0, 15.5, 48), 'lo');
    });
  });
  k.finish(parent);
}

function buildVan() {
  const van = group(world);
  const k = new Kit({ tone: 0.42 });
  // far wall (solid), with the driver's window and a clerestory strip above the bench
  const shape = sideShape();
  shape.holes.push(polyPath(FRONT_WIN), roundRectPath(-118, 172, 98, 194, 6));
  k.add(new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 14 }), { p: [0, 0, -95], tone: 0.42 });
  // inner trim of the far wall: belt rail, cant rail, ribs between the panels, rivets
  k.box(470, 4, 3, { p: [-4, 166, -91.5], color: MAT.pale, b: 0.6 });
  k.box(408, 5, 6, { p: [-32, 196, -89], color: MAT.pale, b: 0.8, tone: 0.45 });
  for (const x of [-196, -118, -40, 38, 104]) k.box(5, 112, 2, { p: [x, 54, -91.4], color: MAT.pale, tone: 0.32 });
  for (let x = -230; x <= 100; x += 13) k.screw(x, 168, -90, { axis: 'z', r: 0.4 });
  // floor slab, its anti-slip ribs, two tie-down tracks
  k.box(478, 8, 188, { p: [0, FLOOR - 8, 0], b: 1.2, tone: 0.4 });
  for (let z = -84; z <= 84; z += 12) k.line([[-236, FLOOR + 0.05, z], [FX - 2, FLOOR + 0.05, z]], 'lo');
  for (const z of [-34, 34]) { k.box(330, 0.8, 3.4, { p: [-70, FLOOR, z], color: MAT.alu, tone: 0.35 }); for (let x = -230; x <= 90; x += 8) k.line([[x, FLOOR + 0.86, z - 1.1], [x, FLOOR + 0.86, z + 1.1]], 'lo'); }
  // wheel wells intruding into the cargo floor
  for (const x of [-150, 150]) for (const sz of [-1, 1]) k.box(86, 20, 26, { p: [x, FLOOR, sz * 79], rr: 6, b: 2, color: MAT.pale, tone: 0.4 });
  // cant rails: the frame that stays when the roof skin is cut away (the gantry hangs from them)
  for (const sz of [-1, 1]) k.box(412, 6, 5, { p: [-30, BOW - 1, sz * 90], b: 0.8, color: MAT.pale, tone: 0.5 });
  // rear frame: D pillars, sill, bumper with a step, tail lights
  for (const sz of [-1, 1]) {
    k.box(5, 150, 5, { p: [-237.5, FLOOR, sz * 92], b: 0.8, tone: 0.5 });
    k.box(2.5, 34, 8, { p: [-240.6, 128, sz * 86], rr: 1, b: 0.5, color: 0xe7c9c3, tone: 0.55 });
    k.line([[-241.9, 145, sz * 86 - 3.5], [-241.9, 145, sz * 86 + 3.5]], 'lo');
  }
  k.box(12, 18, 194, { p: [-243, 34, 0], rr: 3, b: 1.2, color: MAT.pale, tone: 0.45 });
  k.box(14, 3, 70, { p: [-250, 40, 0], b: 0.6, color: MAT.graphite, tone: 0.5 });
  for (let z = -30; z <= 30; z += 6) k.line([[-256.5, 43.05, z], [-243.5, 43.05, z]], 'lo');
  // under the floor: chassis rails, battery pack with cooling ribs, axles
  for (const sz of [-1, 1]) k.box(440, 9, 7, { p: [0, 35, sz * 68], color: MAT.graphite, tone: 0.4 });
  k.box(210, 9, 118, { p: [0, 35, 0], rr: 4, b: 1, color: MAT.steel, tone: 0.4 });
  for (let x = -96; x <= 96; x += 8) k.line([[x, 41, 59.05], [x, 36, 59.05]], 'lo');
  for (const x of [-150, 150]) { k.tube([[x, 33, -70], [x, 33, 70]], 2.6, { color: MAT.graphite, tone: 0.5 }); k.sphere(7, { p: [x, 33, 0], color: MAT.graphite }); }
  // coil springs between the axle and the body
  for (const x of [-150, 150]) for (const sz of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU * 4; pts.push(V(x + 18 + Math.cos(a) * 4, 37 + (i / 64) * 7, sz * 56 + Math.sin(a) * 4)); }
    k.tube(new THREE.CatmullRomCurve3(pts), 0.7, { color: MAT.steel, radial: 6 });
  }
  // the nose: hood, front face, bumper, as one turned-out block across the width
  const nose = polyPath([[200, 36], [231, 36], [243, 48], [242, 108], [236, 121], [226, 130], [200, 130]], THREE.Shape);
  k.add(new THREE.ExtrudeGeometry(nose, { depth: 186, bevelEnabled: true, bevelSize: 2, bevelThickness: 2, bevelSegments: 1, curveSegments: 8 }), { p: [0, 0, -93], tone: 0.48 });
  for (const sz of [-1, 1]) { k.box(3, 10, 30, { p: [244, 92, sz * 62], rr: 2, b: 0.6, color: MAT.pale, tone: 0.55 }); k.cyl(4, 1.5, { p: [245.5, 97, sz * 52], r: [0, 0, -Math.PI / 2], color: MAT.steel }); }
  for (let y = 60; y <= 84; y += 6) k.line([[245.05, y, -40], [245.05, y, 40]], 'lo');
  k.box(10, 14, 196, { p: [240, 34, 0], rr: 3, b: 1.2, color: MAT.pale, tone: 0.45 });
  // A pillars, dash cowl, windscreen
  for (const sz of [-1, 1]) k.tube([[187, ROOF - 3, sz * 92], [227, 129, sz * 92]], 2.4, { color: MAT.pale, tone: 0.5 });
  k.box(4, 3, 184, { p: [228, 127, 0], b: 0.6, color: MAT.graphite, tone: 0.5 });
  const ws = new THREE.PlaneGeometry(184, Math.hypot(40, 68)); ws.rotateY(Math.PI / 2); ws.rotateZ(Math.atan2(40, 68));
  k.add(ws, { p: [207, 164, 0], glass: true });
  // driver's window and clerestory glass in the far wall
  k.add(new THREE.ShapeGeometry(polyPath(FRONT_WIN, THREE.Shape)), { p: [0, 0, -93.5], glass: true });
  k.add(new THREE.ShapeGeometry(roundRectPath(-118, 172, 98, 194, 6, THREE.Shape)), { p: [0, 0, -93.5], glass: true });
  k.finish(van, { glassMat: GLASS2 });

  for (const x of [-150, 150]) { wheel(van, x, -80, false); wheel(van, x, 80, true); }

  // ── the skin that is cut away: near wall, roof and tailgate as a ghost shell ──
  const nearShape = sideShape();
  nearShape.holes.push(polyPath(FRONT_WIN), roundRectPath(4, 148, 96, 192, 6), roundRectPath(-226, 148, -12, 192, 6));
  addGhost(new THREE.ShapeGeometry(nearShape, 14), [0, 0, 95], [0, 0, 0], van);
  ghostOutline(nearShape, van);
  const doorSeam = []; for (const [x, y] of [[-6, 40], [-6, 196], [100, 196], [100, 40]]) doorSeam.push([x, y, 95.2]);
  ghostLine([...doorSeam, doorSeam[0]], van);
  ghostLine([[106, 40, 95.2], [106, 196], [194, 196]].map(p => [p[0], p[1], 95.2]), van);
  ghostLine([[-6, 44, 95.2], [100, 44, 95.2]], van);
  // roof skin
  const roof = slabGeo(408, 4, 190, 12, 1.5, 6);
  addGhost(roof, [-32, ROOF - 4, 0], [0, 0, 0], van);
  const rl = rrPts(408, 190, 12, 6).map(p => [p[0] - 32, ROOF, p[1]]); rl.push(rl[0]); ghostLine(rl, van);
  // tailgate, lifted on its hinge at the roof's rear edge
  const tg = group(van, [-238, ROOF - 2, 0], [0, 0, 0]);
  tg.rotation.z = -1.92;
  const gateGeo = slabGeo(4, 150, 186, 0, 0); gateGeo.translate(-2, -150, 0);
  addGhost(gateGeo, [0, 0, 0], [0, 0, 0], tg);
  const gl = [[-4.2, 0, -93], [-4.2, -150, -93], [-4.2, -150, 93], [-4.2, 0, 93], [-4.2, 0, -93]]; ghostLine(gl, tg);
  const gw = [[-4.2, -14, -78], [-4.2, -70, -78], [-4.2, -70, 78], [-4.2, -14, 78], [-4.2, -14, -78]]; ghostLine(gw, tg);
  const kg = new Kit({ tone: 0.5 });
  kg.box(3, 4, 22, { p: [-5.5, -140, 0], rr: 1.5, b: 0.5, color: MAT.graphite });
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
  const outer = shape.getPoints(14).map(v => [v.x, v.y, 95.2]); outer.push(outer[0]); ghostLine(outer, parent);
  for (const h of shape.holes) { const pts = h.getPoints(8).map(v => [v.x, v.y, 95.2]); pts.push(pts[0]); ghostLine(pts, parent); }
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
