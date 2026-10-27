// ═════════════════════════ the courier: the agent itself ═════════════════════════
// An omni-wheeled cart with a two-link arm drives up and down the lane. It takes jobs from the
// core's dispatch tray, carries them through the gate to the tool modules and files the results
// back into the context magazine. Its tasks are lists of steps, like the van's arm.
const ARM = { L1: 44, L2: 44, reach: 21 };
const BODY = { L: 34, W: 24, H: 10, clear: 3, wheelR: 4.2 };
const SH_Y = TOP + BODY.clear + BODY.H + 8;          // shoulder height
const CLEAR_Y = TOP + 60;                            // the arm folds up to this height to drive
const ROBOT = {
  tip: V(-142, CLEAR_Y, 0), bx: -150, plan: [], tw: null, grip: 0, gripGoal: 0, held: null, tasks: [], task: null,
  mode: 'idle', text: '待命', at: null, scan: 0, yaw: 0, roll: 0,
};
const ROBOT_HOME = V(-142, CLEAR_Y, 0);
const courier = {};
function buildCourier() {
  const B = BODY, body = group(world, [ROBOT.bx, 0, 0]);
  const k = new Kit({ tone: 0.75 });
  const y0 = TOP + B.clear;
  // chassis: a rounded tub with a bumper band, a deck plate, a lidar puck and a status strip
  k.box(B.L, B.H, B.W, { p: [0, y0, 0], rr: 4, b: 1, color: MAT.paper, tone: 0.75 });
  k.box(B.L + 1.2, 2, B.W + 1.2, { p: [0, y0 + 1.5, 0], rr: 4.4, b: 0.3, color: MAT.graphite, tone: 0.7 });
  k.box(B.L - 6, 0.8, B.W - 6, { p: [0, y0 + B.H, 0], rr: 2.4, color: MAT.alu, tone: 0.6 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.screw(sx * (B.L / 2 - 5), y0 + B.H + 0.8, sz * (B.W / 2 - 5), { r: 0.5 });
  k.cyl(3, 2.6, { p: [B.L / 2 - 6, y0 + B.H + 0.8, 0], color: MAT.graphite, seg: 20, b: 0.4 });
  k.cyl(2.2, 1.2, { p: [B.L / 2 - 6, y0 + B.H + 3.4, 0], color: MAT.steel, seg: 16 });
  for (const sz of [-1, 1]) for (let i = 0; i < 5; i++) k.line([[-B.L / 2 + 6 + i * 2.2, y0 + 4, sz * (B.W / 2 + 0.02)], [-B.L / 2 + 6 + i * 2.2, y0 + 7.5, sz * (B.W / 2 + 0.02)]], 'lo');
  // the turret and the shoulder housing
  k.cyl(6.4, 3.6, { p: [0, y0 + B.H + 0.8, 0], color: MAT.pale, seg: 32, b: 0.5, tone: 0.8 });
  k.finish(body);
  const wheels = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = group(body, [sx * (B.L / 2 - 6.5), TOP + B.wheelR, sz * (B.W / 2 + 0.4)]);
    const kw = new Kit({ tone: 0.8 });
    kw.cyl(B.wheelR, 3, { p: [0, 0, -1.5], r: [Math.PI / 2, 0, 0], color: MAT.rubber, seg: 20, b: 0.4 });
    kw.cyl(1.6, 3.4, { p: [0, 0, -1.7], r: [Math.PI / 2, 0, 0], color: MAT.alu, seg: 12 });
    // mecanum rollers: diagonal strokes round the tread
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, c = Math.cos(a) * (B.wheelR + 0.05), s = Math.sin(a) * (B.wheelR + 0.05); kw.line([[c, s, -1.4 * sx * sz], [c * 0.98 - s * 0.25, s * 0.98 + c * 0.25, 1.4 * sx * sz]], 'mid'); }
    kw.finish(w);
    wheels.push(w);
  }
  const ledMat = solid(0xffffff, { glow: 0.2, glowColor: 0xb8b8bc });
  for (const sx of [-1, 1]) mesh(slabGeo(0.6, 1.6, B.W - 8, 0, 0), ledMat, body, [sx * (B.L / 2 + 0.25), y0 + 5.6, 0], [0, 0, 0], { tone: 0.7, cast: false });
  // the arm: yaw, shoulder, elbow, wrist
  const yaw = group(body, [0, y0 + B.H + 4.4, 0]);
  const ky = new Kit({ tone: 0.85 });
  ky.cyl(5.4, 3.6, { color: MAT.paper, seg: 28, b: 0.5 });
  ky.cyl(4.6, 10, { p: [0, SH_Y - (y0 + B.H + 4.4), -5], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 26, b: 0.8 });
  ky.box(8, SH_Y - (y0 + B.H + 4.4), 6, { p: [0, 0, 0], rr: 1.6, b: 0.4, color: MAT.paper });
  ky.finish(yaw);
  const shoulder = group(yaw, [0, SH_Y - (y0 + B.H + 4.4), 0]);
  const ku = new Kit({ tone: 0.9 });
  ku.box(ARM.L1 - 8, 6.4, 6.4, { p: [ARM.L1 / 2, -3.2, 0], rr: 2.2, b: 0.7, color: MAT.paper });
  ku.box(ARM.L1 * 0.5, 1, 4.4, { p: [ARM.L1 / 2, 3.2, 0], rr: 0.5, b: 0.2, color: MAT.alu });
  ku.cyl(4.4, 8, { p: [ARM.L1, 0, -4], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 24, b: 0.7 });
  ku.screw(ARM.L1, 0, 4.1, { axis: 'z', r: 0.8 });
  ku.tube([[6, 4.4, 4.2], [ARM.L1 * 0.5, 6, 4.4], [ARM.L1 - 6, 4.4, 4.2]], 0.6, { color: MAT.graphite, radial: 6, bend: 8 });
  ku.finish(shoulder);
  const elbow = group(shoulder, [ARM.L1, 0, 0]);
  const kf = new Kit({ tone: 0.9 });
  kf.box(ARM.L2 - 6, 5.4, 5.4, { p: [ARM.L2 / 2, -2.7, 0], rr: 2, b: 0.6, color: MAT.paper });
  kf.cyl(3.2, 6.4, { p: [ARM.L2, 0, -3.2], r: [Math.PI / 2, 0, 0], color: MAT.paper, seg: 20, b: 0.5 });
  kf.tube([[6, 3.6, 3.4], [ARM.L2 * 0.5, 5, 3.6], [ARM.L2 - 5, 3.6, 3.4]], 0.5, { color: MAT.graphite, radial: 6, bend: 8 });
  kf.finish(elbow);
  const wrist = group(elbow, [ARM.L2, 0, 0]);
  const kw = new Kit({ tone: 0.9 });
  kw.cyl(2.3, ARM.reach - 13, { p: [0, -(ARM.reach - 13), 0], color: MAT.alu, seg: 16, b: 0.4 });
  kw.finish(wrist);
  // the head lives in the world, upright, at the tool point: gripper fingers, a ring light, a camera
  const head = group(world, [0, 0, 0]);
  const kh = new Kit({ tone: 0.95 });
  kh.box(9, 6, 9, { p: [0, 5, 0], rr: 1.4, b: 0.6, color: MAT.paper });
  kh.box(6, 1.2, 4, { p: [0, 3.9, 0], color: MAT.graphite });
  kh.cyl(1.3, 2.4, { p: [3.6, 7.5, 4.6], r: [Math.PI / 2, 0, 0], color: MAT.graphite, seg: 12 });
  kh.cyl(2.8, 2, { p: [0, 11, 0], color: MAT.alu, seg: 18, b: 0.3 });
  kh.screw(-3.4, 11, 3.4); kh.screw(3.4, 11, -3.4);
  kh.finish(head);
  const headLed = solid(0xffffff, { glow: 0.2, glowColor: 0xb8b8bc });
  mesh(torusGeo(4.9, 0.5, 6, 32), headLed, head, [0, 7, 0], [0, 0, 0], { tone: 0.9, cast: false });
  const fingers = [-1, 1].map(s => mesh(slabGeo(1.2, 5, 3, 0, 0.3), solid(MAT.graphite), head, [s * 2.4, -0.6, 0], [0, 0, 0], { tone: 0.95 }));
  const scanMat = new THREE.MeshBasicMaterial({ color: FLUID.ok, transparent: true, opacity: 0, depthWrite: false });
  const scan = new THREE.Mesh(new THREE.ConeGeometry(9, 24, 24, 1, true), scanMat); scan.position.set(0, -12, 0); scan.rotation.x = Math.PI; scan.layers.set(1); head.add(scan);
  const halo = glow(head, 0xffffff, 26, [0, 7, 0]);
  Object.assign(courier, { body, bridge: body, wheels, yaw, shoulder, elbow, wrist, head, ledMat, headLed, fingers, scan, scanMat, halo });
}
// two-link inverse kinematics in the arm's vertical plane (elbow up)
function placeCourier() {
  const P = courier, t = ROBOT.tip;
  P.body.position.x = ROBOT.bx;
  const dx = t.x - ROBOT.bx, dz = t.z, d = Math.hypot(dx, dz);
  if (d > 0.5) ROBOT.yaw = Math.atan2(-dz, dx);
  P.yaw.rotation.y = ROBOT.yaw;
  const W = { r: d, y: t.y + ARM.reach }, S = { r: 0, y: SH_Y };
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
  P.wrist.updateWorldMatrix(true, false);
  const wp = P.wrist.getWorldPosition(V());
  P.head.position.set(wp.x, wp.y - ARM.reach, wp.z);
  P.head.rotation.y = ROBOT.yaw;
  const open = 1 - ROBOT.grip;
  P.fingers[0].position.x = -1.9 - open * 1.6; P.fingers[1].position.x = 1.9 + open * 1.6;
  for (const w of P.wheels) w.rotation.z = -ROBOT.roll / BODY.wheelR;
}

// ── motion: tasks made of steps; to go far the arm folds up and the cart drives ──
const SPEED = { drive: 150, arm: 95 };
function moveTweens(from, to0) {
  const out = [], p = from.clone(), to = to0.clone();
  let bx = ROBOT.bx;
  to.z = clamp(to.z, -80, 80); to.y = Math.max(TOP + 4, to.y);
  // park so the arm reaches forward a little, not straight up
  const bxT = clamp(to.x - (Math.abs(to.z) < 22 ? 14 : 0), AVE.x0, AVE.x1);
  const push = (q, bxTo) => {
    const dArm = p.distanceTo(q), dBody = bxTo != null ? Math.abs(bxTo - bx) : 0;
    if (dArm < 0.3 && dBody < 0.3) return;
    out.push({ from: p.clone(), to: q.clone(), bx0: bx, bx1: bxTo ?? bx, dur: Math.max(0.14, dBody / SPEED.drive, dArm / SPEED.arm) + 0.06 });
    p.copy(q); if (bxTo != null) bx = bxTo;
  };
  const clearY = Math.max(CLEAR_Y, to.y);
  if (Math.abs(bxT - bx) > 3) {
    push(V(bx + 8, clearY, 0));
    push(V(bxT + 8, clearY, 0), bxT);
    push(V(to.x, clearY, to.z));
  } else if (Math.hypot(p.x - to.x, p.z - to.z) > 5) {
    const hy = Math.min(clearY, Math.max(p.y, to.y) + 12);
    push(V(p.x, hy, p.z)); push(V(to.x, hy, to.z));
  }
  push(to);
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
      // after a quiet moment the courier folds its arm and parks by the core
      R.idleT = (R.idleT || 0) + dt;
      if (R.idleT > 2.5 && (R.tip.distanceTo(ROBOT_HOME) > 3 || Math.abs(R.bx - (ROBOT_HOME.x - 8)) > 3)) { R.idleT = 0; robotTask([['say', '待命', 'idle'], ['move', ROBOT_HOME.clone()]], { pri: -1, expire: sceneClock + 10 }); }
      return;
    }
    R.idleT = 0;
  }
  const T = R.task;
  // with work piling up the courier hurries: up to four times its calm pace
  const boost = 1 + clamp((R.tasks.length - 1) * 0.45, 0, 3);
  dt *= boost;
  if (R.tw) {
    const tw = R.tw; tw.t += dt / tw.dur;
    const e = ease(Math.min(1, tw.t));
    R.tip.lerpVectors(tw.from, tw.to, e);
    const nbx = lerp(tw.bx0, tw.bx1, e); R.roll += nbx - R.bx; R.bx = nbx;
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
    else if (kind === 'take') { dropItem(a, courier.head, V(0, -HOLD, 0)); a.rotation.set(0, 0, 0); R.held = a; }
    else if (kind === 'put') { const p = a.getWorldPosition(V()); dropItem(a, b?.parent || world, b?.pos ?? p); a.rotation.set(0, b?.rot ?? 0, 0); R.held = null; }
    else if (kind === 'call') a();
    else if (kind === 'say') { R.text = a; R.mode = b || R.mode; }
    else if (kind === 'until') { if (!a()) { R.untilT = (R.untilT || 0) + dt; if (!(b && R.untilT > b)) R.si--; else R.untilT = 0; } else R.untilT = 0; }
    else if (kind === 'branch') { const more = a() || []; T.steps.splice(R.si, 0, ...more); }
    else if (kind === 'line') { const to = a.clone(); R.tw = { from: R.tip.clone(), to, bx0: R.bx, bx1: R.bx, dur: Math.max(0.15, R.tip.distanceTo(to) / 60), t: 0, queue: [] }; }
    else if (kind === 'discard') { if (R.held) { const h = R.held; R.held = null; h.removeFromParent(); } }
  } catch (err) { console.error('courier step', kind, err); }
}
function robotUpdate(dt, t) {
  const R = ROBOT;
  robotRun(dt);
  R.grip = damp(R.grip, R.gripGoal, 10, dt);
  // the held cartridge's cap lights while it is carried
  const busy = !!R.task || R.tw;
  const hex = R.mode === 'wait' ? MAT.amberlamp : R.mode === 'error' ? FLUID.err : R.mode === 'ok' ? FLUID.ok : busy ? FLUID.context : 0xb8b8bc;
  const pulse = R.mode === 'wait' ? 0.55 + 0.45 * Math.sin(t * 6) : busy ? 0.75 : 0.3;
  for (const m of [courier.ledMat, courier.headLed]) { m.userData.u.uGlow.value = pulse; m.userData.u.uGlowColor.value.set(hex); }
  courier.halo.userData.set(busy || R.mode === 'wait' ? pulse * 0.55 : 0, hex);
  R.scan = Math.max(0, R.scan - dt * 1.4);
  courier.scanMat.opacity = R.scan > 0 ? 0.16 * Math.sin(Math.min(1, R.scan) * Math.PI) : 0;
  courier.scan.visible = R.scan > 0;
  placeCourier();
}
