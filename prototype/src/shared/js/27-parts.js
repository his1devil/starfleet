// ═════════════════════════ parts the board-like scenes share: labels, buses, pulses, stands ═════════════════════════
// These read the scene's TOP (the surface they sit on) when they are called, not when they load.
// ── silkscreen: printed labels on the board, re-inked when the theme changes ──
function silk(text, x, z, o = {}) {
  const size = o.size ?? 3.2, font = `${o.weight ?? 500} 64px ${o.serif ? FONT_SERIF : FONT_MONO}`;
  const probe = mkCanvas(8, 8).getContext('2d'); probe.font = font;
  const wpx = Math.ceil(probe.measureText(text).width) + 16, c = mkCanvas(wpx, 84), g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const w = (wpx / 84) * size * 1.3, m = new THREE.Mesh(new THREE.PlaneGeometry(w, size * 1.3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.set(-Math.PI / 2, 0, o.rot ?? 0, 'YXZ');
  if (o.face === 'z') m.rotation.set(0, 0, 0); else if (o.face === '-x') m.rotation.set(0, -Math.PI / 2, 0);
  m.position.set(x + (o.align === 'left' ? w / 2 : 0), o.y ?? TOP + 0.08, z); m.layers.set(1); m.renderOrder = 1;
  (o.parent || SILK_PARENT || world).add(m);
  const paint = P => { g.clearRect(0, 0, c.width, c.height); g.fillStyle = o.color ?? P.ink; g.globalAlpha = o.alpha ?? 0.62; g.font = font; g.textBaseline = 'middle'; g.fillText(text, 8, 44); tex.needsUpdate = true; };
  THEMED.push(paint);
  return m;
}

// ── buses: copper strips on the board that data pulses ride along ──
// a flat strip following a curve: top face plus two low walls, so the ink pass outlines it
function ribbonGeo(curve, w, h, step = 2) {
  const s = new Soup(), n = Math.max(2, Math.ceil(curve.getLength() / step)), L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n), side = V(-t.z, 0, t.x).normalize().multiplyScalar(w / 2);
    L.push(p.clone().add(side)); R.push(p.clone().sub(side));
  }
  const UP = [0, 1, 0];
  for (let i = 0; i < n; i++) {
    const a = L[i], b = L[i + 1], c = R[i + 1], d = R[i];
    s.quad([a.x, a.y + h, a.z], [b.x, b.y + h, b.z], [c.x, c.y + h, c.z], [d.x, d.y + h, d.z], UP, UP, UP, UP);
    for (const [p, q, sg] of [[a, b, 1], [d, c, -1]]) {
      const nx = (q.z - p.z) * sg, nz = -(q.x - p.x) * sg, l = Math.hypot(nx, nz) || 1, N = [-nx / l, 0, -nz / l];
      s.quad([p.x, p.y, p.z], [q.x, q.y, q.z], [q.x, q.y + h, q.z], [p.x, p.y + h, p.z], N, N, N, N);
    }
  }
  return s.geo();
}
const BUS = {};
// pts are [x, z] corners; the run is filleted like a routed trace and drawn `w` wide
function bus(name, pts, o = {}, kit) {
  const y = o.y ?? TOP, curve = filletPath(pts.map(([x, z]) => V(x, y, z)), o.bend ?? 6);
  const len = curve.getLength();
  BUS[name] = { curve, len, y };
  if (kit) {
    kit.add(ribbonGeo(curve, o.w ?? 2.6, o.h ?? 0.35), { color: o.color ?? MAT.copper, tone: 0.3 });
    // a via at each end
    for (const p of [curve.getPointAt(0), curve.getPointAt(1)]) { kit.cyl(1.6, 0.5, { p: [p.x, y, p.z], color: MAT.gold, seg: 14, tone: 0.3 }); kit.line(ringPts(p.x, y + 0.56, p.z, 0.7, 10), 'mid'); }
  }
  return BUS[name];
}
// pulses: bright beads that run along a bus; the only saturated things on the board besides lamps
class PulsePool {
  constructor(n, parent) {
    this.mesh = new THREE.InstancedMesh(sphereGeo(1, 10, 8), fluidMat(0xffffff), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.castShadow = false; this.mesh.userData.tone = 0.5; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(0xffffff));
    parent.add(this.mesh);
    this.items = []; this.max = n; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.c = new THREE.Color(); this.p = V(); this.t = V(); this.s = V();
  }
  emit(name, hex, o = {}) {
    const B = typeof name === 'string' ? BUS[name] : name; if (!B) return;
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ B, u: o.rev ? 1 : 0, dir: o.rev ? -1 : 1, speed: o.speed ?? 150, hex, r: o.r ?? 1.15, stretch: o.stretch ?? 2.6, lift: o.lift ?? 1.3, onEnd: o.onEnd });
  }
  // a short train of pulses, spaced in time
  train(name, hex, n = 6, gap = 0.08, o = {}) { for (let i = 0; i < n; i++) after(i * gap, () => this.emit(name, hex, o)); }
  update(dt) {
    const it = this.items, Z = V(0, 0, 1);
    for (let i = it.length - 1; i >= 0; i--) {
      const d = it[i]; d.u += (d.dir * d.speed * dt) / d.B.len;
      if (d.u > 1 || d.u < 0) { it.splice(i, 1); d.onEnd?.(); }
    }
    for (let i = 0; i < it.length; i++) {
      const d = it[i];
      d.B.curve.getPointAt(clamp(d.u, 0, 1), this.p); d.B.curve.getTangentAt(clamp(d.u, 0, 1), this.t);
      this.q.setFromUnitVectors(Z, this.t.normalize());
      this.p.y += d.lift;
      this.m.compose(this.p, this.q, this.s.set(d.r, d.r * 0.7, d.r * d.stretch));
      this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, this.c.set(d.hex));
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// a square frame (outer w × d, bars b wide, h tall), for the rising layer ring and the like
function frameGeo(w, d, b, h) {
  return memo(`frame${w}|${d}|${b}|${h}`, () => mergeGeometries([
    slabGeo(w, h, b).clone().translate(0, 0, -(d - b) / 2), slabGeo(w, h, b).clone().translate(0, 0, (d - b) / 2),
    slabGeo(b, h, d - 2 * b).clone().translate(-(w - b) / 2, 0, 0), slabGeo(b, h, d - 2 * b).clone().translate((w - b) / 2, 0, 0),
  ], false));
}

// a socket a cartridge stands in; returns the cartridge's base position
function socket(k, x, z, y = TOP) {
  k.box(7, 3, 12.4, { p: [x, y, z], rr: 0.8, b: 0.3, color: MAT.graphite, tone: 0.5 });
  const o = rrPts(4.6, 10, 0.5, 2).map(p => [x + p[0], y + 3.06, z + p[1]]); o.push(o[0]); k.line(o, 'mid');
  return V(x, y + 2, z);
}
// a small display on a tilted stand, facing the near edge
function standScreen(g, k, x, z, w, h, draw, o = {}) {
  const y = o.y ?? TOP, tilt = o.tilt ?? -0.42;
  k.box(w + 2, h + 2, 1.4, { p: [x, y + 3, z], rr: 0.8, b: 0.3, color: MAT.paper, tone: 0.55, r: [tilt, 0, 0] });
  k.box(3, 4, 3, { p: [x, y, z - 0.6], color: MAT.steel, tone: 0.5 });
  const scr = makeScreen(w, h, o.px ?? 22, draw);
  const c = Math.cos(tilt), s = Math.sin(tilt);
  scr.mesh.position.set(x, y + 3 + (h + 2) / 2 * c - 0.75 * s, z + (h + 2) / 2 * s + 0.75 * c);
  scr.mesh.rotation.x = tilt; g.add(scr.mesh);
  return scr;
}
