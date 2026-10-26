// ═════════════════════════ geometry kit ═════════════════════════
// Units are centimetres, y up. Slabs and cylinders stand on y = 0 like anatomy's slabOf(plan, z, h).
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2, DEG = Math.PI / 180;

// triangle soup with explicit normals; each triangle is wound so its front face follows its normals
class Soup {
  constructor() { this.p = []; this.n = []; }
  tri(a, b, c, na, nb, nc) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * (na[0] + nb[0] + nc[0]) + cy * (na[1] + nb[1] + nc[1]) + cz * (na[2] + nb[2] + nc[2]) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; }
    this.p.push(...a, ...b, ...c); this.n.push(...na, ...nb, ...nc);
  }
  quad(a, b, c, d, na, nb, nc, nd) { this.tri(a, b, c, na, nb, nc); this.tri(a, c, d, na, nc, nd); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); return g; }
}
// rounded-rectangle plan in x/z: [x, z, nx, nz] around the outline
function rrPts(w, d, r, seg) {
  r = Math.max(0, Math.min(r, w / 2 - 1e-4, d / 2 - 1e-4));
  const out = [], hw = w / 2 - r, hd = d / 2 - r;
  for (const [cx, cz, a0] of [[hw, hd, 0], [-hw, hd, 90], [-hw, -hd, 180], [hw, -hd, 270]]) {
    for (let i = 0; i <= seg; i++) { const a = (a0 + (90 * i) / seg) * DEG; out.push([cx + r * Math.cos(a), cz + r * Math.sin(a), Math.cos(a), Math.sin(a)]); }
  }
  return out;
}
const GEO = new Map();
const memo = (key, f) => { if (!GEO.has(key)) GEO.set(key, f()); return GEO.get(key); };
// slab: plan w × d with corner radius r, height h, a chamfer b on the top edge that catches the light
function slabGeo(w, h, d, r = 0, b = 0, seg = 5) {
  return memo(`slab${w}|${h}|${d}|${r}|${b}|${seg}`, () => {
    const s = new Soup(), sg = r > 0 ? seg : 1;
    b = Math.max(0, Math.min(b, h * 0.5, w / 2 - 1e-3, d / 2 - 1e-3));
    const O = rrPts(w, d, r, sg), I = rrPts(w - 2 * b, d - 2 * b, Math.max(0, r - b), sg);
    const n = O.length, mid = h - b, UP = [0, 1, 0], DN = [0, -1, 0], k = Math.SQRT1_2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, o0 = O[i], o1 = O[j], i0 = I[i], i1 = I[j];
      const n0 = [o0[2], 0, o0[3]], n1 = [o1[2], 0, o1[3]];
      s.quad([o0[0], 0, o0[1]], [o1[0], 0, o1[1]], [o1[0], mid, o1[1]], [o0[0], mid, o0[1]], n0, n1, n1, n0);
      if (b > 0) s.quad([o0[0], mid, o0[1]], [o1[0], mid, o1[1]], [i1[0], h, i1[1]], [i0[0], h, i0[1]], [o0[2] * k, k, o0[3] * k], [o1[2] * k, k, o1[3] * k], [o1[2] * k, k, o1[3] * k], [o0[2] * k, k, o0[3] * k]);
      s.tri([0, h, 0], [i0[0], h, i0[1]], [i1[0], h, i1[1]], UP, UP, UP);
      s.tri([0, 0, 0], [o1[0], 0, o1[1]], [o0[0], 0, o0[1]], DN, DN, DN);
    }
    return s.geo();
  });
}
// lathe about y: profile [[r, y, smooth?], ...] walked so the surface lies on its right; a smooth knot
// shares one normal between its two bands, a sharp knot keeps a crease (and so an ink line)
function latheGeo(P, seg = 32, a0 = 0, a1 = TAU) { return memo(`lathe${JSON.stringify(P)}|${seg}|${a0}|${a1}`, () => latheRaw(P, seg, a0, a1)); }
function latheRaw(P, seg = 32, a0 = 0, a1 = TAU) {
  {
    const s = new Soup(), m = P.length, segN = [];
    for (let k = 0; k < m - 1; k++) { const dr = P[k + 1][0] - P[k][0], dy = P[k + 1][1] - P[k][1], L = Math.hypot(dr, dy) || 1; segN.push([dy / L, -dr / L]); }
    const knot = (k, own) => {
      if (P[k][2] && k > 0 && k < m - 1) { const a = segN[k - 1], b = segN[k], x = a[0] + b[0], y = a[1] + b[1], L = Math.hypot(x, y) || 1; return [x / L, y / L]; }
      return own;
    };
    for (let k = 0; k < m - 1; k++) {
      const p0 = P[k], p1 = P[k + 1];
      if (Math.abs(p0[0]) < 1e-6 && Math.abs(p1[0]) < 1e-6) continue;
      const nA = knot(k, segN[k]), nB = knot(k + 1, segN[k]);
      for (let i = 0; i < seg; i++) {
        const t0 = a0 + ((a1 - a0) * i) / seg, t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
        const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
        s.quad([p0[0] * c0, p0[1], p0[0] * s0], [p0[0] * c1, p0[1], p0[0] * s1], [p1[0] * c1, p1[1], p1[0] * s1], [p1[0] * c0, p1[1], p1[0] * s0],
          [nA[0] * c0, nA[1], nA[0] * s0], [nA[0] * c1, nA[1], nA[0] * s1], [nB[0] * c1, nB[1], nB[0] * s1], [nB[0] * c0, nB[1], nB[0] * s0]);
      }
    }
    return s.geo();
  }
}
const cylGeo = (r, h, b = 0, seg = 28) => latheGeo(b > 0 ? [[0, 0], [r, 0], [r, h - b], [r - b, h], [0, h]] : [[0, 0], [r, 0], [r, h], [0, h]], seg);
const ringGeo = (r0, r1, h, seg = 32) => latheGeo([[r0, 0], [r1, 0], [r1, h], [r0, h], [r0, 0]], seg);
const coneGeo = (r0, r1, h, seg = 28) => latheGeo([[0, 0], [r0, 0], [r1, h], [0, h]], seg);
const sphereGeo = (r, w = 24, h = 16) => memo(`sp${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const torusGeo = (R, r, rad = 8, tub = 40, arc = TAU) => memo(`to${R}|${r}|${rad}|${tub}|${arc}`, () => new THREE.TorusGeometry(R, r, rad, tub, arc).rotateX(Math.PI / 2));
// a polyline with round bends, as one curve
function filletPath(pts, bend) {
  const P = pts.map(p => (p.isVector3 ? p.clone() : V(...p)));
  const path = new THREE.CurvePath();
  let prev = P[0].clone();
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const ab = b.clone().sub(a), bc = c.clone().sub(b);
    const r = Math.min(bend, ab.length() / 2, bc.length() / 2);
    const p1 = b.clone().addScaledVector(ab.normalize(), -r), p2 = b.clone().addScaledVector(bc.normalize(), r);
    if (prev.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(prev, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    prev = p2;
  }
  path.add(new THREE.LineCurve3(prev, P[P.length - 1].clone()));
  return path;
}
function tubeGeo(pts, r, o = {}) {
  const path = pts instanceof THREE.Curve ? pts : filletPath(pts, o.bend ?? r * 3);
  const len = path.getLength();
  return new THREE.TubeGeometry(path, o.seg ?? Math.max(6, Math.ceil(len / (o.step ?? 1.6))), r, o.radial ?? 10, false);
}

const mat4 = (p = [0, 0, 0], r = [0, 0, 0], s = 1) => new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], 'YXZ')), typeof s === 'number' ? V(s, s, s) : V(...s));

// Kit collects the static parts of one assembly and merges them into one paper mesh, one glass mesh
// and up to three line sets. Every part keeps its own id so the ink pass still outlines it.
class Kit {
  constructor(o = {}) { this.paper = []; this.glass = []; this.lines = { hi: [], mid: [], lo: [] }; this.stack = [new THREE.Matrix4()]; this.tone = o.tone ?? 0.5; this.color = o.color ?? MAT.paper; }
  get M() { return this.stack[this.stack.length - 1]; }
  at(p, r, fn, s = 1) { this.stack.push(this.M.clone().multiply(mat4(p, r, s))); fn(this); this.stack.pop(); return this; }
  add(geo, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(this.M.clone().multiply(mat4(o.p, o.r, o.s ?? 1)));
    if (o.glass) { this.glass.push(g); return g; }
    const n = g.attributes.position.count, col = new THREE.Color(o.color ?? this.color), cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('aId', new THREE.BufferAttribute(new Float32Array(n).fill(o.id ?? rand()), 1));
    g.setAttribute('aTone', new THREE.BufferAttribute(new Float32Array(n).fill(o.tone ?? this.tone), 1));
    g.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(n).fill(o.paint ?? 0), 1));
    this.paper.push(g);
    return g;
  }
  box(w, h, d, o = {}) { return this.add(slabGeo(w, h, d, o.rr ?? 0, o.b ?? 0, o.seg ?? 5), o); }
  cyl(r, h, o = {}) { return this.add(cylGeo(r, h, o.b ?? 0, o.seg ?? 28), o); }
  lathe(P, o = {}) { return this.add(latheGeo(P, o.seg ?? 32), o); }
  ring(r0, r1, h, o = {}) { return this.add(ringGeo(r0, r1, h, o.seg ?? 32), o); }
  sphere(r, o = {}) { return this.add(sphereGeo(r, o.w ?? 20, o.h ?? 14), o); }
  torus(R, r, o = {}) { return this.add(torusGeo(R, r, o.rad ?? 8, o.tub ?? 36, o.arc ?? TAU), o); }
  tube(pts, r, o = {}) { return this.add(tubeGeo(pts, r, o), o); }
  // a screw head: a 0.5 cm dot that faces along `axis` (y by default)
  screw(x, y, z, o = {}) { const ax = o.axis ?? 'y', r = ax === 'x' ? [0, 0, -Math.PI / 2] : ax === 'z' ? [Math.PI / 2, 0, 0] : ax === '-z' ? [-Math.PI / 2, 0, 0] : ax === '-x' ? [0, 0, Math.PI / 2] : [0, 0, 0]; return this.add(cylGeo(o.r ?? 0.32, 0.16, 0.06, 10), { p: [x, y, z], r, color: o.color ?? MAT.steel, tone: o.tone ?? 0.35 }); }
  line(pts, tone = 'mid') {
    const m = this.M, arr = this.lines[tone];
    for (let i = 0; i < pts.length - 1; i++) { const a = V(...pts[i]).applyMatrix4(m), b = V(...pts[i + 1]).applyMatrix4(m); arr.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  }
  segs(list, tone = 'mid') { for (const [a, b] of list) this.line([a, b], tone); }
  finish(parent, o = {}) {
    const out = {};
    if (this.paper.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.paper, false), o.mat ?? PAPER);
      mesh.castShadow = o.cast ?? true; mesh.receiveShadow = true; mesh.userData.tone = 0;
      parent.add(mesh); out.paper = mesh;
    }
    if (this.glass.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.glass, false), o.glassMat ?? GLASS);
      mesh.layers.set(1); mesh.renderOrder = 2; parent.add(mesh); out.glass = mesh;
    }
    for (const t of ['hi', 'mid', 'lo']) {
      if (!this.lines[t].length) continue;
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.lines[t], 3));
      const L = new THREE.LineSegments(g, LINE_M[t]); L.layers.set(1); L.renderOrder = 1; parent.add(L); out['line_' + t] = L;
    }
    this.paper = []; this.glass = []; this.lines = { hi: [], mid: [], lo: [] };
    return out;
  }
}
// small helpers for the live (moving) parts, which stay separate meshes
function mesh(geo, mat, parent, p = [0, 0, 0], r = [0, 0, 0], o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(r[0], r[1], r[2], 'YXZ');
  m.castShadow = o.cast ?? true; m.receiveShadow = true;
  if (o.tone != null) m.userData.tone = o.tone;
  if (mat.isShaderMaterial || mat.transparent) m.layers.set(1);
  if (parent) parent.add(m);
  return m;
}
const group = (parent, p = [0, 0, 0], r = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...p); g.rotation.set(r[0], r[1], r[2], 'YXZ'); if (parent) parent.add(g); return g; };

// ═════════════════════════ textures: screens, labels, glows ═════════════════════════
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const FONT_SERIF = '"Source Serif 4", "Noto Serif SC", Georgia, serif';
// a small LCD in the plane of an instrument face; redraws itself when the theme changes
function makeScreen(w, h, pxPerCm = 14, draw) {
  const c = mkCanvas(Math.round(w * pxPerCm), Math.round(h * pxPerCm)), g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.receiveShadow = false; m.castShadow = false; m.userData.tone = 0.7;
  const scr = { mesh: m, tex, c, g, w: c.width, h: c.height, state: {}, draw: draw || null };
  scr.paint = (state = scr.state) => {
    scr.state = state;
    const P = PALETTES[THEME];
    g.fillStyle = P.screenBg; g.fillRect(0, 0, c.width, c.height);
    if (scr.draw) scr.draw(g, c.width, c.height, state, P);
    tex.needsUpdate = true;
  };
  THEMED.push(() => scr.paint());
  return scr;
}
function radialTex(stops, size = 128) {
  const c = mkCanvas(size, size), g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW_TEX = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
const PUFF_TEX = radialTex([[0, 'rgba(255,255,255,0.9)'], [0.45, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
// a glow on paper is a saturated halo laid over the drawing; in the dark theme it adds light
const GLOWS = [];
function glow(parent, hex, size, p = [0, 0, 0]) {
  const m = new THREE.SpriteMaterial({ map: GLOW_TEX, color: new THREE.Color(hex), transparent: true, depthWrite: false, opacity: 0 });
  const s = new THREE.Sprite(m); s.position.set(...p); s.scale.setScalar(size); s.layers.set(1); s.renderOrder = 3;
  parent.add(s); GLOWS.push(s);
  s.userData.set = (k, hex2) => { m.opacity = clamp(k, 0, 1) * (THEME === 'dark' ? 0.9 : 0.42); if (hex2 != null) m.color.set(hex2); s.visible = k > 0.002; };
  s.userData.set(0);
  return s;
}
THEMED.push((P, name) => { for (const s of GLOWS) s.material.blending = name === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending; });

// ═════════════════════════ particles: drops, bubbles, vapour ═════════════════════════
// drops and bubbles are solid little spheres (so they are inked); vapour and smoke are soft sprites
class DropPool {
  constructor(n, r, parent) {
    this.mesh = new THREE.InstancedMesh(sphereGeo(1, 10, 8), fluidMat(0xffffff), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.castShadow = false; this.mesh.userData.tone = 0.55; this.mesh.frustumCulled = false;
    this.items = []; this.max = n; this.r = r; this.m = new THREE.Matrix4(); this.c = new THREE.Color();
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    parent.add(this.mesh);
  }
  emit(p, v, hex, life = 1, r = this.r, o = {}) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ p: p.clone(), v: v.clone(), hex, life, age: 0, r, g: o.g ?? -980, floor: o.floor ?? -Infinity, onEnd: o.onEnd, drag: o.drag ?? 0 });
  }
  update(dt) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const d = it[i]; d.age += dt;
      d.v.y += d.g * dt; if (d.drag) d.v.multiplyScalar(Math.exp(-d.drag * dt));
      d.p.addScaledVector(d.v, dt);
      if (d.age >= d.life || d.p.y < d.floor) { it.splice(i, 1); d.onEnd?.(d); }
    }
    for (let i = 0; i < it.length; i++) {
      const d = it[i], s = d.r * (d.g > 0 ? Math.min(1, d.age * 8) : 1) * (1 - smooth(d.life * 0.8, d.life, d.age) * 0.6);
      this.m.makeScale(s, s * (d.g < -100 ? 1.25 : 1), s).setPosition(d.p);
      this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, this.c.set(d.hex));
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
class PuffPool {
  constructor(n, parent) { this.items = []; this.max = n; this.parent = parent; this.free = []; }
  emit(p, v, hex, life = 2, size = 6, grow = 2.5, opacity = 0.5) {
    let s = this.free.pop();
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: PUFF_TEX, transparent: true, depthWrite: false })); s.layers.set(1); s.renderOrder = 4; this.parent.add(s); }
    if (this.items.length >= this.max) { const o = this.items.shift(); o.s.visible = false; this.free.push(o.s); }
    s.visible = true; s.material.color.set(hex); s.position.copy(p);
    this.items.push({ s, v: v.clone(), life, age: 0, size, grow, opacity });
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i]; d.age += dt;
      if (d.age >= d.life) { d.s.visible = false; this.free.push(d.s); this.items.splice(i, 1); continue; }
      const k = d.age / d.life;
      d.s.position.addScaledVector(d.v, dt);
      d.s.scale.setScalar(d.size * (1 + d.grow * k));
      d.s.material.opacity = d.opacity * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (THEME === 'dark' ? 0.8 : 1);
    }
  }
}
