// ═════════════════════════ the robot arm: the agent itself ═════════════════════════
// A six-axis-looking arm hangs from a carriage on one rail down the middle of the roof. It folds up
// to travel, swings down to the bench, and carries sample vials between the instruments.
const GANTRY = { x0: -222, x1: 96, railY: 194, shoulderY: 176, safe: 168, aisle: 0, zMax: 74 };
// the head's flange sits 14.1 above the tool point; the wrist link above it is 10 long
const ARM = { L1: 58, L2: 58, wrist: 14, reach: 24.1 };
const ROBOT = {
  tip: V(-40, GANTRY.safe, 0), plan: [], tw: null, grip: 0, gripGoal: 0, held: null, tasks: [], task: null,
  mode: 'idle', text: '待命', at: null, scan: 0, cx: -40, yaw: 0,
};
const robotParts = {};
const ROBOT_HOME = V(-60, GANTRY.safe, -14);
function buildRobot() {
  const G = GANTRY, k = new Kit({ tone: 0.6 });
  // the rail: an aluminium extrusion hung from the roof on short posts, with end stops and a rack
  k.box(G.x1 - G.x0 + 16, 5, 7, { p: [(G.x0 + G.x1) / 2, G.railY, 0], b: 0.6, color: MAT.alu, tone: 0.55 });
  for (let x = G.x0 - 8; x <= G.x1 + 8; x += 2.5) k.line([[x, G.railY + 0.6, 3.55], [x, G.railY + 4.4, 3.55]], 'lo');
  for (let x = G.x0 + 4; x <= G.x1; x += 53) { k.box(4, ROOF - 4 - G.railY - 5, 4, { p: [x, G.railY + 5, 0], color: MAT.steel, tone: 0.45 }); k.box(10, 1.2, 10, { p: [x, ROOF - 5.2, 0], color: MAT.steel, tone: 0.45 }); }
  for (const x of [G.x0 - 12, G.x1 + 12]) k.box(4, 8, 9, { p: [x, G.railY - 2, 0], b: 0.5, color: MAT.graphite, tone: 0.6 });
  k.finish(world);
  // carriage under the rail: rollers, a drive motor, a turret that yaws
  const car = group(world, [ROBOT.tip.x, 0, 0]);
  const kc = new Kit({ tone: 0.75 });
  kc.box(22, 8, 12, { p: [0, G.railY - 8, 0], rr: 2, b: 0.6, color: MAT.paper });
  for (const dx of [-7, 7]) for (const sz of [-1, 1]) kc.cyl(1.8, 1.6, { p: [dx, G.railY + 1.5, sz * 4.4], r: [Math.PI / 2, 0, 0], color: MAT.graphite, seg: 14 });
  kc.cyl(3, 9, { p: [-8, G.railY - 4, 7], r: [0, 0, Math.PI / 2], color: MAT.graphite, b: 0.4, tone: 0.7 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kc.screw(sx * 9, G.railY, sz * 4.6);
  kc.cyl(7.5, 2.4, { p: [0, G.railY - 10.4, 0], color: MAT.alu, seg: 32, b: 0.4 });
  kc.finish(car);
  const yaw = group(car, [0, G.railY - 10.4, 0]);
  const ky = new Kit({ tone: 0.85 });
  ky.cyl(6.2, 7, { p: [0, -7, 0], color: MAT.paper, seg: 32, b: 0.6 });
  ky.line(ringPts(0, -3.5, 0, 6.25, 32), 'lo');
  ky.cyl(5.4, 12, { p: [0, -G.railY + 10.4 + G.shoulderY, -6], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 28, b: 0.8 });
  ky.finish(yaw);
  // upper arm and forearm: each a link that points along its own +x, with joint housings
  const shoulder = group(yaw, [0, G.shoulderY - (G.railY - 10.4), 0]);
  const ku = new Kit({ tone: 0.9 });
  ku.box(ARM.L1 - 8, 7, 7.5, { p: [ARM.L1 / 2, -3.5, 0], rr: 2.5, b: 0.8, color: MAT.paper, r: [0, 0, 0] });
  ku.box(ARM.L1 * 0.5, 1.2, 5, { p: [ARM.L1 / 2, 3.5, 0], rr: 0.6, b: 0.3, color: MAT.alu });
  ku.cyl(5, 9, { p: [ARM.L1, 0, -4.5], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 26, b: 0.8 });
  ku.screw(ARM.L1, 0, 4.6, { axis: 'z', r: 0.9 });
  ku.tube([[6, 5, 4.6], [ARM.L1 * 0.5, 7, 4.8], [ARM.L1 - 6, 5, 4.6]], 0.7, { color: MAT.graphite, radial: 6, bend: 8 });
  ku.finish(shoulder);
  const elbow = group(shoulder, [ARM.L1, 0, 0]);
  const kf = new Kit({ tone: 0.9 });
  kf.box(ARM.L2 - 6, 6, 6, { p: [ARM.L2 / 2, -3, 0], rr: 2.2, b: 0.7, color: MAT.paper });
  kf.cyl(3.6, 7, { p: [ARM.L2, 0, -3.5], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 22, b: 0.6 });
  kf.tube([[6, 4, 3.6], [ARM.L2 * 0.5, 5.4, 3.8], [ARM.L2 - 5, 4, 3.6]], 0.6, { color: MAT.graphite, radial: 6, bend: 8 });
  kf.finish(elbow);
  const wrist = group(elbow, [ARM.L2, 0, 0]);
  const kw = new Kit({ tone: 0.9 });
  kw.cyl(2.6, ARM.wrist - 4, { p: [0, -(ARM.wrist - 4), 0], color: MAT.alu, seg: 18, b: 0.4 });
  kw.finish(wrist);
  // the head lives in the world, upright, at the tool point; it carries the gripper and the LED ring
  const head = group(world, [0, 0, 0]);
  const kh = new Kit({ tone: 0.95 });
  kh.box(9, 6, 9, { p: [0, 6.5, 0], rr: 1.4, b: 0.6, color: MAT.paper });
  kh.box(5, 1.4, 3, { p: [0, 5.1, 0], color: MAT.graphite });
  kh.cyl(1.4, 2.4, { p: [3.4, 8, 4.6], r: [Math.PI / 2, 0, 0], color: MAT.graphite, seg: 12 });
  kh.cyl(3, 1.6, { p: [0, 12.5, 0], color: MAT.alu, seg: 18, b: 0.3 });
  kh.screw(-3.4, 12.5, 3.4); kh.screw(3.4, 12.5, -3.4);
  kh.finish(head);
  const ledMat = solid(0xffffff, { glow: 0.2, glowColor: 0xb8b8bc });
  mesh(torusGeo(4.9, 0.55, 6, 32), ledMat, head, [0, 8.2, 0], [0, 0, 0], { tone: 0.9, cast: false });
  const fingers = [-1, 1].map(s => mesh(slabGeo(1.4, 6, 3.2, 0, 0.3), solid(MAT.graphite), head, [s * 2.2, -0.6, 0], [0, 0, 0], { tone: 0.95 }));
  const scanMat = new THREE.MeshBasicMaterial({ color: FLUID.err, transparent: true, opacity: 0, depthWrite: false });
  const scan = new THREE.Mesh(new THREE.ConeGeometry(9, 26, 24, 1, true), scanMat); scan.position.set(0, -13, 0); scan.rotation.x = Math.PI; scan.layers.set(1); head.add(scan);
  const halo = glow(head, 0xffffff, 26, [0, 8, 0]);
  // cable chain riding on top of the rail
  const chain = new THREE.InstancedMesh(slabGeo(2.4, 1.8, 3, 0, 0.3), solid(MAT.steel), 120);
  chain.castShadow = true; chain.receiveShadow = true; chain.userData.tone = 0.3; chain.frustumCulled = false;
  world.add(chain);
  Object.assign(robotParts, { bridge: car, car, yaw, shoulder, elbow, wrist, head, ledMat, fingers, scan, scanMat, halo, chain });
}
const CH = { xf: -70, L: 300, R: 2.6, z: 0, y: GANTRY.railY + 5.6, m: new THREE.Matrix4() };
function updateChain(xb) {
  const xl = (CH.L - Math.PI * CH.R + CH.xf + xb) / 2, links = robotParts.chain;
  const runA = xl - CH.xf, runB = xl - xb, arc = Math.PI * CH.R, total = runA + arc + runB;
  let i = 0;
  for (let s = 1.6; s < total && i < 120; s += 3, i++) {
    let x, y, ang = 0;
    if (s < runA) { x = CH.xf + s; y = CH.y; }
    else if (s < runA + arc) { const a = (s - runA) / CH.R; x = xl + Math.sin(a) * CH.R; y = CH.y + CH.R - Math.cos(a) * CH.R; ang = a; }
    else { x = xl - (s - runA - arc); y = CH.y + 2 * CH.R; ang = Math.PI; }
    CH.m.makeRotationZ(ang).setPosition(x, y, CH.z);
    links.setMatrixAt(i, CH.m);
  }
  links.count = i; links.instanceMatrix.needsUpdate = true;
}
// two-link inverse kinematics in the arm's vertical plane (elbow up)
function placeRobot(dt = 0) {
  const P = robotParts, t = ROBOT.tip, G = GANTRY;
  // the carriage trails the tool a little, so the arm leans into its moves
  ROBOT.cx = dt ? damp(ROBOT.cx, clamp(t.x, G.x0, G.x1), 3.2, dt) : clamp(t.x, G.x0, G.x1);
  P.car.position.x = ROBOT.cx;
  const dx = t.x - ROBOT.cx, dz = t.z, d = Math.hypot(dx, dz);
  if (d > 0.5) ROBOT.yaw = Math.atan2(-dz, dx);
  P.yaw.rotation.y = ROBOT.yaw;
  const W = { r: d, y: t.y + ARM.reach }, S = { r: 0, y: G.shoulderY };
  const L1 = ARM.L1, L2 = ARM.L2;
  let D = Math.hypot(W.r - S.r, W.y - S.y);
  D = clamp(D, Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
  const phi = Math.atan2(W.y - S.y, W.r - S.r);
  const alpha = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  const a1 = phi + alpha;
  const E = { r: S.r + L1 * Math.cos(a1), y: S.y + L1 * Math.sin(a1) };
  const Wc = { r: S.r + D * Math.cos(phi), y: S.y + D * Math.sin(phi) };
  const a2 = Math.atan2(Wc.y - E.y, Wc.r - E.r);
  P.shoulder.rotation.z = a1;
  P.elbow.rotation.z = a2 - a1;
  P.wrist.rotation.z = -a2;
  // the head hangs under the wrist, upright, turned with the arm
  P.wrist.updateWorldMatrix(true, false);
  const wp = P.wrist.getWorldPosition(V());
  P.head.position.set(wp.x, wp.y - ARM.reach, wp.z);
  P.head.rotation.y = ROBOT.yaw;
  const open = 1 - ROBOT.grip;
  P.fingers[0].position.x = -1.6 - open * 1.8; P.fingers[1].position.x = 1.6 + open * 1.8;
  updateChain(ROBOT.cx);
}

// ── sample vials: the things the robot carries ──
// a held vial hangs this far below the head origin (the fingers close on its cap)
const HOLD = 7.4;
const VIAL_WALL = [[0, 0], [1.9, 0.2], [2.1, 1, 1], [2.1, 9], [2.3, 9.4], [2.3, 10]];
function makeVial(fluidHex, capHex, level = 7) {
  const g = new THREE.Group();
  const k = new Kit({ tone: 0.8 });
  k.add(latheGeo(VIAL_WALL, 18), { glass: true });
  k.finish(g);
  const cap = mesh(cylGeo(2.45, 2.6, 0.4, 18), solid(capHex), g, [0, 10, 0], [0, 0, 0], { tone: 0.85 });
  const liq = mesh(latheGeo(liquidFill(VIAL_WALL, level).map(([r, y, s]) => [Math.max(0, r - 0.2), y, s]), 16), fluidMat(fluidHex), g, [0, 0, 0], [0, 0, 0], { tone: 0.7 });
  g.userData.liq = liq; g.userData.cap = cap; g.userData.vial = true;
  return g;
}
function recolorVial(v, fluidHex, capHex) { if (fluidHex != null) v.userData.liq.material.color.set(fluidHex); if (capHex != null) v.userData.cap.material.color.set(capHex); }
function dropItem(item, parent, pos) { item.removeFromParent(); parent.add(item); if (pos) item.position.copy(pos); }

// ── motion: tasks made of steps; moves go up, across the aisle, along, across, down ──
const SPEED = { x: 150, z: 110, y: 80 };
function moveTweens(from, to0) {
  const G = GANTRY, out = [], p = from.clone(), to = to0.clone();
  to.x = clamp(to.x, G.x0, G.x1); to.z = clamp(to.z, -G.zMax, G.zMax); to.y = Math.min(to.y, G.safe);
  const push = (axis, v) => { if (Math.abs(p[axis] - v) < 0.3) return; const q = p.clone(); q[axis] = v; out.push({ from: p.clone(), to: q.clone(), dur: Math.max(0.16, Math.abs(v - p[axis]) / SPEED[axis] + 0.08) }); p.copy(q); };
  const far = Math.abs(p.x - to.x) > 2 || Math.abs(p.z - to.z) > 2;
  if (far) {
    push('y', G.safe);
    if (Math.abs(p.x - to.x) > 2) { push('z', clamp(p.z, -18, 18)); push('x', to.x); }
    push('z', to.z);
  }
  push('y', to.y);
  return out;
}
function robotTask(steps, o = {}) {
  const T = { steps, pri: o.pri ?? 1, expire: o.expire ?? sceneClock + 30, onSkip: o.onSkip, tag: o.tag, born: sceneClock };
  ROBOT.tasks.push(T);
  ROBOT.tasks.sort((a, b) => b.pri - a.pri || a.born - b.born);
  return T;
}
function robotRun(dt) {
  const R = ROBOT;
  if (!R.task) {
    while (R.tasks.length) {
      const T = R.tasks.shift();
      if (sceneClock > T.expire) { try { T.onSkip?.(); } catch (err) { console.error(err); } continue; }
      R.task = T; R.si = 0; R.tw = null; break;
    }
    if (!R.task) {
      if (R.mode !== 'wait') R.mode = 'idle';
      // after a quiet moment the arm folds back to its rest above the reactor
      R.idleT = (R.idleT || 0) + dt;
      if (R.idleT > 2.5 && R.tip.distanceTo(ROBOT_HOME) > 3) { R.idleT = 0; robotTask([['say', '待命', 'idle'], ['move', ROBOT_HOME.clone()]], { pri: -1, expire: sceneClock + 10 }); }
      return;
    }
    R.idleT = 0;
  }
  const T = R.task;
  if (R.tw) {
    const tw = R.tw; tw.t += dt / tw.dur;
    R.tip.lerpVectors(tw.from, tw.to, ease(Math.min(1, tw.t)));
    if (tw.t >= 1) { R.tw = tw.queue.length ? { ...tw.queue.shift(), t: 0, queue: tw.queue } : null; }
    return;
  }
  if (R.wait > 0) { R.wait -= dt; return; }
  if (R.si >= T.steps.length) { R.task = null; return; }
  const [kind, a, b] = T.steps[R.si++];
  try {
    if (kind === 'move') { const q = moveTweens(R.tip, a); if (q.length) R.tw = { ...q.shift(), t: 0, queue: q }; }
    else if (kind === 'grip') R.gripGoal = 1;
    else if (kind === 'open') R.gripGoal = 0;
    else if (kind === 'wait') R.wait = a;
    else if (kind === 'take') { dropItem(a, robotParts.head, V(0, -HOLD, 0)); R.held = a; }
    else if (kind === 'put') { const p = a.getWorldPosition(V()); dropItem(a, b?.parent || world, b?.pos ?? p); R.held = null; }
    else if (kind === 'call') a();
    else if (kind === 'say') { R.text = a; R.mode = b || R.mode; }
    else if (kind === 'until') { if (!a()) { R.untilT = (R.untilT || 0) + dt; if (!(b && R.untilT > b)) R.si--; else R.untilT = 0; } else R.untilT = 0; }
    else if (kind === 'branch') { const more = a() || []; T.steps.splice(R.si, 0, ...more); }
    else if (kind === 'line') { const to = a.clone(); to.y = Math.min(to.y, GANTRY.safe); R.tw = { from: R.tip.clone(), to, dur: Math.max(0.15, R.tip.distanceTo(to) / 60), t: 0, queue: [] }; }
    else if (kind === 'pour') { R.pour = { hex: a, t: b }; R.wait = b + 0.45; }
    else if (kind === 'discard') { if (R.held) { const h = R.held; R.held = null; h.removeFromParent(); } }
  } catch (err) { console.error('robot step', kind, err); }
}
function robotUpdate(dt, t) {
  const R = ROBOT;
  robotRun(dt);
  R.grip = damp(R.grip, R.gripGoal, 10, dt);
  // pouring: the held vial pivots on its cap and empties into whatever is below
  const pouring = R.pour && R.pour.t > 0;
  R.tilt = damp(R.tilt || 0, pouring ? 1.9 : 0, 7, dt);
  if (R.pour) { R.pour.t -= dt; if (R.pour.t < -0.5) R.pour = null; }
  if (R.held) {
    const th = R.tilt; R.held.position.set(10 * Math.sin(th), -HOLD + 10 - 10 * Math.cos(th), 0); R.held.rotation.z = th;
    if (pouring && Math.random() < dt * 36) { const m = R.held.localToWorld(V(0, 10.4, 0)); fx.drops.emit(m, V((Math.random() - 0.5) * 6, -20, (Math.random() - 0.5) * 6), R.pour.hex, 0.9, 0.55, { floor: m.y - 26 }); }
  }
  const busy = !!R.task || R.tw;
  const hex = R.mode === 'wait' ? MAT.amberlamp : R.mode === 'error' ? FLUID.err : R.mode === 'ok' ? FLUID.ok : busy ? FLUID.context : 0xb8b8bc;
  const pulse = R.mode === 'wait' ? 0.55 + 0.45 * Math.sin(t * 6) : busy ? 0.75 : 0.3;
  robotParts.ledMat.userData.u.uGlow.value = pulse; robotParts.ledMat.userData.u.uGlowColor.value.set(hex);
  robotParts.halo.userData.set(busy || R.mode === 'wait' ? pulse * 0.6 : 0, hex);
  R.scan = Math.max(0, R.scan - dt * 1.4);
  robotParts.scanMat.opacity = R.scan > 0 ? 0.16 * Math.sin(Math.min(1, R.scan) * Math.PI) : 0;
  robotParts.scan.visible = R.scan > 0;
  placeRobot(dt);
}
