// ═════════════════════════ routing: the loop bus, spokes, and the trains that ride them ═════════════════════════
// The harness die is organised around one bus that runs in a loop round the agent loop itself.
// Blocks hang off it at stops; a message travels out of its block on a spoke, round the loop
// (clockwise on the outer lane, back the short way on the inner lane) and in on another spoke.
const RING = { cx: -200, cz: -18, hx: 112, hz: 70, r: 24, lanes: [2.2, -2.2] };
// a rounded-rectangle loop as a dense polyline, starting at the middle of the north side, clockwise
function ringPoly(off, n = 480) {
  const { cx, cz, hx, hz, r } = RING, ax = hx + off, az = hz + off, rr = Math.max(4, r + off);
  const straightX = 2 * (ax - rr), straightZ = 2 * (az - rr), arc = (Math.PI / 2) * rr, L = 2 * straightX + 2 * straightZ + 4 * arc;
  const at = s => {
    s = ((s % L) + L) % L;
    // north side, going +x from the middle
    const segs = [
      [straightX / 2, u => [cx + u, cz - az]],
      [arc, u => { const a = -Math.PI / 2 + (u / rr); return [cx + ax - rr + Math.cos(a) * rr, cz - az + rr + Math.sin(a) * rr]; }],
      [straightZ, u => [cx + ax, cz - az + rr + u]],
      [arc, u => { const a = u / rr; return [cx + ax - rr + Math.cos(a) * rr, cz + az - rr + Math.sin(a) * rr]; }],
      [straightX, u => [cx + ax - rr - u, cz + az]],
      [arc, u => { const a = Math.PI / 2 + u / rr; return [cx - ax + rr + Math.cos(a) * rr, cz + az - rr + Math.sin(a) * rr]; }],
      [straightZ, u => [cx - ax, cz + az - rr - u]],
      [arc, u => { const a = Math.PI + u / rr; return [cx - ax + rr + Math.cos(a) * rr, cz - az + rr + Math.sin(a) * rr]; }],
      [straightX / 2, u => [cx - ax + rr + u, cz - az]],
    ];
    for (const [len, f] of segs) { if (s <= len) return f(s); s -= len; }
    return [cx, cz - az];
  };
  const pts = []; for (let i = 0; i < n; i++) { const [x, z] = at((i / n) * L); pts.push(V(x, MET_Y, z)); }
  return { pts, L };
}
const LANES = RING.lanes.map(off => ringPoly(off));
// the stop on a lane nearest to a point
function ringStop(lane, x, z) { let best = 0, bd = Infinity; LANES[lane].pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }
const PORTS = {};   // id → { p: V (where the spoke meets the block), stop: [outer, inner] }
function port(id, x, z) { PORTS[id] = { p: V(x, MET_Y, z), stop: [ringStop(0, x, z), ringStop(1, x, z)] }; return PORTS[id]; }
// a route from one block to another round the loop, cached; returns { curve, len }
const ROUTES = new Map();
function polyCurve(pts) { const c = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceToSquared(pts[i + 1]) > 1e-6) c.add(new THREE.LineCurve3(pts[i], pts[i + 1])); return { curve: c, len: c.getLength(), y: 0 }; }
function route(a, b, lane) {
  const key = `${a}>${b}>${lane ?? 'auto'}`;
  if (ROUTES.has(key)) return ROUTES.get(key);
  const A = PORTS[a], B = PORTS[b]; if (!A || !B) return null;
  // clockwise on the outer lane unless the inner lane (counter-clockwise) is much shorter
  const n = LANES[0].pts.length, cw = (B.stop[0] - A.stop[0] + n) % n, ccw = (A.stop[1] - B.stop[1] + n) % n;
  const L = lane ?? (ccw < cw * 0.6 ? 1 : 0), P = LANES[L].pts, pts = [A.p.clone()];
  let i = A.stop[L]; const end = B.stop[L], step = L === 0 ? 1 : -1;
  pts.push(P[i].clone());
  while (i !== end) { i = (i + step + n) % n; pts.push(P[i].clone()); }
  pts.push(B.p.clone());
  const r = polyCurve(pts); ROUTES.set(key, r); return r;
}
// a straight-ish route through explicit points (off the loop: the network, the remote die)
function path(name, pts) { const r = polyCurve(pts.map(p => (p.isVector3 ? p.clone() : V(...p)))); BUS[name] = r; return r; }
function chain(...parts) { const pts = []; for (const r of parts) { if (!r) continue; const n = Math.max(8, Math.ceil(r.len / 2)); for (let i = 0; i <= n; i++) { const p = r.curve.getPointAt(i / n); if (!pts.length || pts[pts.length - 1].distanceToSquared(p) > 0.01) pts.push(p); } } return polyCurve(pts); }

// the bus itself: four copper tracks (two lanes of two) with vias where the spokes join
function buildRing() {
  const k = new Kit({ tone: 0.3 });
  // two lanes, each a wide copper strip the traffic rides on, with chevrons showing its direction
  for (const off of RING.lanes) {
    const { pts } = ringPoly(off, 360), c = polyCurve([...pts, pts[0]]);
    k.add(ribbonGeo(c.curve, 2.6, 0.3, 1.5), { p: [0, -0.3, 0], color: MAT.copperM, tone: 0.3 });
  }
  for (const [li, dir] of [[0, 1], [1, -1]]) {
    const P = LANES[li].pts, n = P.length;
    for (let i = 0; i < n; i += 16) {
      const a = P[i], b = P[(i + dir * 2 + n) % n], t = b.clone().sub(a).normalize(), s2 = V(-t.z, 0, t.x).multiplyScalar(0.9), y = MET_Y + 0.03;
      k.line([[a.x + s2.x - t.x * 0.7, y, a.z + s2.z - t.z * 0.7], [a.x + t.x * 0.5, y, a.z + t.z * 0.5], [a.x - s2.x - t.x * 0.7, y, a.z - s2.z - t.z * 0.7]], 'mid');
    }
  }
  k.finish(world, { cast: false });
  silk('LOOP BUS  环形总线 · 外圈顺时针 · 内圈逆时针', RING.cx - RING.hx + 30, RING.cz - RING.hz - 5.2, { y: DIE_Y + 0.08, size: 2, align: 'left', weight: 600, alpha: 0.66 });
}
// a spoke from a block's port to its stop on the loop, drawn as a short copper strap
function buildSpokes() {
  const k = new Kit({ tone: 0.3 });
  for (const id in PORTS) {
    const A = PORTS[id];
    for (const L of [0, 1]) { const s = LANES[L].pts[A.stop[L]]; const c = polyCurve([A.p, s]); if (c.len > 0.5) k.add(ribbonGeo(c.curve, 0.8, 0.28, 1.5), { p: [0, -0.28, 0], color: MAT.copperM, tone: 0.3 }); }
    k.cyl(1.2, 0.5, { p: [A.p.x, DIE_Y + 0.4, A.p.z], color: MAT.gold, seg: 12, tone: 0.3 });
  }
  k.finish(world, { cast: false });
}

// ── trains: a request is a run of cars, one car per cache block (256 tokens, or more when it is long) ──
class TrainPool {
  constructor(n, parent) {
    this.mesh = new THREE.InstancedMesh(slabGeo(2.4, 1.5, 2.9, 0.4, 0.2), fluidMat(0xffffff), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.castShadow = false; this.mesh.userData.tone = 0.55; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(0xffffff));
    parent.add(this.mesh);
    this.trains = []; this.max = n; this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.c = new THREE.Color(); this.p = V(); this.t = V(); this.s = V(1, 1, 1); this.Z = V(0, 0, 1);
  }
  // cars: colours front to back; o.onArrive fires when the head reaches the end, o.onDone when the tail does
  send(r, cars, o = {}) { if (!r) return null; const T = { r, cars: cars.slice(0, 160), u: 0, gap: o.gap ?? 3.3, speed: o.speed ?? 120, onArrive: o.onArrive, onDone: o.onDone, arrived: false, lift: o.lift ?? 0 }; this.trains.push(T); return T; }
  update(dt) {
    let k = 0;
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const T = this.trains[i]; T.u += T.speed * dt;
      if (!T.arrived && T.u >= T.r.len) { T.arrived = true; T.onArrive?.(); }
      if (T.u - (T.cars.length - 1) * T.gap >= T.r.len) { this.trains.splice(i, 1); T.onDone?.(); }
    }
    for (const T of this.trains) {
      for (let j = 0; j < T.cars.length && k < this.max; j++) {
        const s = T.u - j * T.gap; if (s < 0 || s > T.r.len) continue;
        const u = s / T.r.len; T.r.curve.getPointAt(u, this.p); T.r.curve.getTangentAt(u, this.t);
        this.q.setFromUnitVectors(this.Z, this.t.normalize()); this.p.y += T.lift;
        this.m.compose(this.p, this.q, this.s); this.mesh.setMatrixAt(k, this.m); this.mesh.setColorAt(k, this.c.set(T.cars[j])); k++;
      }
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
