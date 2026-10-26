// ═════════════════════════ the lab, part three: instruments for every other event family ═════════════════════════
// Wall panels face +z from the far wall; bulkhead fittings face −x into the lab.
const WALL_FACE = WALLZ + 0.6;
// a lamp whose glow the director sets (0…1) and whose colour it can change
function lampMesh(parent, p, r = 1, hex = FLUID.ok) { return mesh(sphereGeo(r, 12, 10), solid(0xffffff, { glow: 0.08, glowColor: hex }), parent, p, [0, 0, 0], { tone: 0.6, cast: false }); }
const setLamp = (m, k, hex) => { m.material.userData.u.uGlow.value = k; if (hex != null) m.material.userData.u.uGlowColor.value.set(hex); };
// a framed wall panel with its LCD
function wallPanel(k, x, y, w, h, o = {}) {
  k.box(w, h, 2.2, { p: [x, y, WALL_FACE + 1.1], rr: 1.2, b: 0.5, color: o.color ?? MAT.pale, tone: o.tone ?? 0.45 });
  for (const [sx, sy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) k.screw(x + sx * (w / 2 - 2.4), y + 2.4 + sy * (h - 4.8), WALL_FACE + 2.2, { axis: 'z', r: 0.4 });
}

// ── solvent recovery: cached input tokens are recycled solvent fed back to the pump ──
const CACHE = { x: -159, z: -96 };
station('cache', {
  name: '溶剂回收罐', role: '缓存命中 · cache_read_input_tokens', color: FLUID.cache,
  desc: '每次请求开头（response_started）带着 cache_read_input_tokens：这部分上下文不是新进样，是从回收罐里循环回来的溶剂。罐里的液位是上一次请求的缓存命中率，青色管路在请求开始时流动。',
  work: [CACHE.x + 4, 160, CACHE.z + 30], pin: [CACHE.x, BENCH + 52, CACHE.z],
  build(S, g) {
    const { x, z } = CACHE, y = BENCH, k = new Kit({ tone: 0.55 });
    k.box(14, 2, 14, { p: [x, y, z], rr: 2, b: 0.4, color: MAT.steel });
    k.lathe([[0, 0], [5.6, 0], [5.6, 3], [4.6, 4], [0, 4]], { p: [x, y + 2, z], color: MAT.steel });
    k.add(cylGeo(4.6, 32, 0, 28), { p: [x, y + 6, z], glass: true });
    k.lathe([[0, 0], [5.6, 0], [5.6, 2.4], [2, 4], [0, 4]], { p: [x, y + 38, z], color: MAT.steel });
    for (let i = 0; i <= 10; i++) k.line([[x - 4.7, y + 8 + i * 2.8, z + 1.2], [x - 4.7 - (i % 5 ? 0.9 : 1.8), y + 8 + i * 2.8, z + 1.2]], i % 5 ? 'lo' : 'mid');
    // recovery line from the condenser top, feed line to the pump inlet
    k.tube([[REACT.x, 186, REACT.z], [REACT.x - 14, 192, REACT.z - 6], [x, 192, z], [x, y + 42, z]], 0.7, { color: MAT.hose, bend: 6, radial: 7 });
    k.tube([[x + 4, y + 3, z + 4], [PUMP.x - 6, y + 3, PUMP.z - 6], [PUMP.x - 8, y + 6, PUMP.z + 4]], 0.7, { color: FLUID.cache, paint: 1, bend: 4, radial: 7 });
    k.finish(g);
    const liq = mesh(cylGeo(4.2, 1, 0, 24), fluidMat(FLUID.cache), g, [x, y + 6.3, z], [0, 0, 0], { tone: 0.6 });
    return { liq, level: 0.5, shown: 0.5, flow: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.shown = damp(R.shown, R.level, 2, dt); R.liq.scale.y = Math.max(0.5, R.shown * 30);
    if (R.flow > 0) { R.flow -= dt; if (fx.drops && Math.random() < dt * 30) { const u = Math.random(); fx.drops.emit(V(lerp(CACHE.x + 4, PUMP.x - 6, u), BENCH + 3.6, lerp(CACHE.z + 4, PUMP.z - 6, u)), V(0, 0, 0), FLUID.cache, 0.25, 0.55, { g: 0 }); } }
  },
});

// ── slide carousel beside the microscope: list_dir ──
const CAROUSEL = { x: -42, z: -72 };
station('carousel', {
  name: '载玻片转盘', role: '列目录 · list_dir', color: FLUID.cache,
  desc: '列目录（list_dir）是一盘载玻片：转盘转一圈，每个槽位是目录里的一项，屏幕列出文件名。',
  work: [CAROUSEL.x, 158, CAROUSEL.z + 16], pin: [CAROUSEL.x, BENCH + 24, CAROUSEL.z],
  build(S, g) {
    const { x, z } = CAROUSEL, y = BENCH, k = new Kit({ tone: 0.55 });
    k.cyl(6, 3, { p: [x, y, z], color: MAT.graphite, b: 0.5, seg: 28 });
    k.cyl(1.4, 4, { p: [x, y + 3, z], color: MAT.steel, seg: 12 });
    k.finish(g);
    const disk = group(g, [x, y + 6.6, z]);
    const kd = new Kit({ tone: 0.7 });
    kd.cyl(9.5, 1.4, { color: MAT.paper, seg: 40, b: 0.4 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; kd.at([Math.cos(a) * 6.4, 1.4, Math.sin(a) * 6.4], [0, -a, 0], kk => kk.add(new THREE.BoxGeometry(4.6, 0.2, 1.4), { glass: true })); kd.line([[Math.cos(a) * 3, 1.46, Math.sin(a) * 3], [Math.cos(a) * 9.2, 1.46, Math.sin(a) * 9.2]], 'lo'); }
    kd.finish(disk);
    const marks = new THREE.InstancedMesh(slabGeo(1.6, 0.25, 1, 0, 0), fluidMat(0xffffff), 12);
    marks.count = 0; marks.castShadow = false; marks.userData.tone = 0.6; disk.add(marks);
    return { disk, spin: 0, marks };
  },
  update(S, t, dt) { const R = S.refs; R.spin = damp(R.spin, 0, 0.8, dt); R.disk.rotation.y += dt * R.spin; },
});

// ── a parallel micro-reactor array: workflow runs, one vial per agent, lamps per phase ──
const WF = { x: 82, z: -84 };
station('workflow', {
  name: '平行反应阵列', role: '工作流 · workflow_updated', color: FLUID.reason,
  desc: '工作流（workflow）在这排平行反应器里跑：每个子 agent 占一个反应管，运行时加热发光，完成时变绿；后面的阶段灯对应 workflow 的 phases，屏幕上是名称、预算和已用 agent 数。',
  work: [WF.x, 160, WF.z + 22], pin: [WF.x, BENCH + 44, WF.z],
  build(S, g) {
    const { x, z } = WF, y = BENCH, k = new Kit({ tone: 0.55 });
    k.box(40, 9, 18, { p: [x, y, z + 2], rr: 1.5, b: 0.6, color: MAT.steel, tone: 0.5 });
    for (let i = 0; i < 8; i++) { const px = x - 15.75 + i * 4.5; k.line(ringPts(px, y + 9.06, z + 2, 1.5, 14), 'mid'); k.add(latheGeo([[0, 0], [1.3, 0.4, 1], [1.3, 12], [1.5, 12.4]], 14), { p: [px, y + 4, z + 2], glass: true }); }
    k.box(40, 12, 3, { p: [x, y, z - 9], rr: 1, b: 0.4, color: MAT.pale, tone: 0.5 });
    for (let i = 0; i < 18; i++) k.line([[x - 18 + i * 2.1, y + 1.5, z + 11.05], [x - 18 + i * 2.1, y + 7.5, z + 11.05]], 'lo');
    k.finish(g);
    const vials = []; for (let i = 0; i < 8; i++) vials.push(mesh(cylGeo(1.1, 1, 0, 12), fluidMat(FLUID.reason), g, [x - 15.75 + i * 4.5, y + 4.6, z + 2], [0, 0, 0], { tone: 0.6 }));
    vials.forEach(v => { v.scale.y = 0.01; v.visible = false; });
    const phases = [0, 1, 2, 3, 4].map(i => lampMesh(g, [x - 12 + i * 6, y + 9.4, z - 7.4], 1, FLUID.reason));
    const scr = makeScreen(18, 6, 20, lcdDraw); scr.mesh.position.set(x + 9, y + 18, z - 7.45); g.add(scr.mesh);
    const ks = new Kit({ tone: 0.5 }); ks.box(20, 8, 2, { p: [x + 9, y + 14, z - 8.6], rr: 0.8, b: 0.3 }); ks.box(2, 4, 2, { p: [x + 9, y + 10, z - 8.6] }); ks.finish(g);
    scr.paint({ title: 'WORKFLOW · 待命', lines: [], rows: 2 });
    const halo = glow(g, FLUID.reason, 40, [x, y + 12, z + 2]);
    return { vials, phases, scr, halo, agents: [], heat: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; let any = 0;
    R.vials.forEach((v, i) => {
      const a = R.agents[i];
      v.visible = !!a; if (!a) return;
      v.scale.y = damp(v.scale.y, a.state === 'done' ? 10 : 6 + Math.sin(t * 6 + i) * 1.5, 4, dt);
      v.material.color.set(a.state === 'done' ? FLUID.ok : a.state === 'failed' ? FLUID.err : FLUID.reason);
      if (a.state === 'running') any++;
    });
    R.heat = damp(R.heat, any ? 1 : 0, 2, dt); R.halo.userData.set(R.heat * 0.5);
  },
});

// ── an orbital shaker under a clear hood: background tasks; a strip-chart recorder on the wall: monitor events ──
const INC = { x: 130, z: -82 };
station('incubator', {
  name: '恒温摇床', role: '后台任务 · task_backgrounded', color: FLUID.tool,
  desc: '放到后台跑的命令（task_backgrounded）进摇床：瓶子在摇，计时器在走；task_completed 时停摇、亮灯。挂了 monitor 的任务，每行输出都会在墙上的记录仪上走一笔（monitor_event）。',
  work: [INC.x, 160, INC.z + 24], pin: [INC.x, BENCH + 40, INC.z],
  build(S, g) {
    const { x, z } = INC, y = BENCH, k = new Kit({ tone: 0.55 });
    k.box(34, 10, 30, { p: [x, y, z], rr: 2, b: 0.8, color: MAT.paper, tone: 0.5 });
    k.box(30, 7, 1, { p: [x, y + 1.5, z + 15.1], rr: 0.8, b: 0.2, color: MAT.pale });
    for (const dx of [-8, 8]) k.cyl(1.6, 1.4, { p: [x + dx, y + 5, z + 15.6], r: [Math.PI / 2, 0, 0], color: MAT.graphite, b: 0.3 });
    // clear hood over the platform
    k.add(slabGeo(32, 22, 28, 3, 1, 4), { p: [x, y + 10, z], glass: true });
    k.finish(g);
    const plat = group(g, [x, y + 10.2, z]);
    const kp = new Kit({ tone: 0.65 });
    kp.box(28, 1.2, 24, { rr: 1.5, b: 0.3, color: MAT.steel });
    const ER = [[0, 0], [4.6, 0], [4.8, 0.5, 1], [2, 9], [1.5, 11], [1.5, 12.5]];
    for (const [dx, dz] of [[-8, -5], [0, 5], [8, -5]]) { kp.add(latheGeo(ER, 20), { p: [dx, 1.2, dz], glass: true }); kp.torus(3.6, 0.35, { p: [dx, 3, dz], tub: 20, color: MAT.steel }); }
    kp.finish(plat);
    const liq = [[-8, -5], [0, 5], [8, -5]].map(([dx, dz]) => mesh(fillGeo(ER.map(([r, yy]) => [r, yy + 1.2]), 4.4), fluidMat(FLUID.tool), plat, [dx, 0, dz], [0, 0, 0], { tone: 0.6 }));
    liq.forEach(m => { m.visible = false; });
    const scr = makeScreen(12, 4.4, 22, lcdDraw); scr.mesh.position.set(x + 7, y + 5.4, z + 15.62); g.add(scr.mesh);
    scr.paint({ title: '00:00', lines: [], rows: 1 });
    const lamp = lampMesh(g, [x - 12, y + 6.5, z + 15.6], 0.9, FLUID.ok);
    // wall strip-chart recorder: paper scrolls, a pen draws each monitor line
    const rx = x + 2, ry = 184;
    const kr = new Kit({ tone: 0.55 });
    wallPanel(kr, rx, ry, 34, 36);
    kr.cyl(1.8, 26, { p: [rx - 13, ry + 32, WALL_FACE + 4], r: [0, 0, Math.PI / 2], color: 0xf7f5ee, seg: 18 });
    kr.cyl(1.8, 26, { p: [rx - 13, ry + 4, WALL_FACE + 4], r: [0, 0, Math.PI / 2], color: 0xf7f5ee, seg: 18 });
    kr.box(30, 2, 3, { p: [rx, ry + 18, WALL_FACE + 4.5], color: MAT.alu });
    kr.finish(g);
    const chart = makeScreen(26, 26, 12, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#1d1d1d' : '#fbfaf3'; c.fillRect(0, 0, w, h);
      c.strokeStyle = P.ink; c.globalAlpha = 0.18; c.lineWidth = 1;
      for (let i = 1; i < 10; i++) { c.beginPath(); c.moveTo((i / 10) * w, 0); c.lineTo((i / 10) * w, h); c.stroke(); }
      c.globalAlpha = 0.85; c.strokeStyle = s.hex || '#e5650f'; c.lineWidth = Math.max(1.2, w * 0.008); c.beginPath();
      (s.pts || []).forEach((v, i) => { const yy = h - (i + 1) * (h / 40), xx = w * (0.1 + 0.8 * v); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }); c.stroke();
      c.globalAlpha = 1; c.fillStyle = P.ink; c.font = `500 ${h * 0.05}px ${FONT_MONO}`; c.textBaseline = 'top';
      (s.notes || []).slice(-6).forEach((n, i) => c.fillText(fitText(c, n, w * 0.9), w * 0.05, h * (0.04 + i * 0.065)));
    });
    chart.mesh.position.set(rx, ry + 18, WALL_FACE + 2.3); g.add(chart.mesh);
    chart.paint({ pts: [], notes: [] });
    const pen = mesh(slabGeo(1, 1.2, 6, 0, 0.2), solid(MAT.redlamp, { paint: 1 }), g, [rx, ry + 18, WALL_FACE + 6], [0, 0, 0], { tone: 0.8 });
    return { plat, liq, scr, lamp, chart, pen, shake: 0, shakeGoal: 0, timer: 0, running: false, pts: [], notes: [], penX: 0.5 };
  },
  update(S, t, dt) {
    const R = S.refs; R.shake = damp(R.shake, R.shakeGoal, 2, dt);
    R.plat.position.x = INC.x + Math.cos(t * 9) * 1.4 * R.shake; R.plat.position.z = INC.z + Math.sin(t * 9) * 1.4 * R.shake;
    if (R.running) { R.timer += dt; if (Math.floor(R.timer * 4) !== R.lastPaint) { R.lastPaint = Math.floor(R.timer * 4); const s = Math.floor(R.timer); R.scr.paint({ title: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, lines: [], rows: 1 }); } }
    R.pen.position.x = damp(R.pen.position.x, INC.x + 2 - 11 + 22 * R.penX, 6, dt);
  },
});

// ── the hook panel: one lamp per hook event (14), flashing green / red as each hook runs ──
const HOOK_EVENTS = ['session_start', 'user_prompt_submit', 'pre_tool_use', 'post_tool_use', 'post_tool_use_failure', 'permission_denied', 'stop', 'stop_failure', 'notification', 'subagent_start', 'subagent_stop', 'pre_compact', 'post_compact', 'session_end'];
const HOOKP = { x: -130, y: 194 };
station('hooks', {
  name: '质检灯板', role: 'Hook 执行 · hook_execution', color: FLUID.ok,
  desc: '14 种 hook 事件各占一盏灯（session_start、user_prompt_submit、pre_tool_use、post_tool_use、…、session_end）。每次 hook_execution 对应的灯闪一下：全部成功是绿色，有被跳过或失败的是琥珀色或红色；机械臂的扫描头同时扫一下当前的样品。',
  work: [HOOKP.x, 172, WALLZ + 40], pin: [HOOKP.x, HOOKP.y + 34, WALLZ + 4],
  build(S, g) {
    const { x, y } = HOOKP, k = new Kit({ tone: 0.5 });
    wallPanel(k, x, y, 54, 28);
    const lamps = [];
    HOOK_EVENTS.forEach((ev, i) => {
      const px = x - 21 + (i % 7) * 7, py = y + (i < 7 ? 19 : 9);
      k.cyl(2, 0.8, { p: [px, py, WALL_FACE + 2.2], r: [Math.PI / 2, 0, 0], color: MAT.steel, seg: 16 });
      k.line([[px - 2, py - 3.6, WALL_FACE + 2.25], [px + 2, py - 3.6, WALL_FACE + 2.25]], 'lo');
      lamps.push(lampMesh(g, [px, py, WALL_FACE + 3.3], 1.25, FLUID.ok));
    });
    k.finish(g);
    return { lamps, k: new Array(14).fill(0) };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 0.6); setLamp(m, 0.06 + R.k[i]); }); },
});

// ── usage totalizers: four drum counters and a cost window ──
const METER = { x: -46, y: 194 };
station('meter', {
  name: '流量计', role: '用量 · turn_completed.usage', color: FLUID.teal ?? FLUID.cache,
  desc: '每回合结束时 turn_completed 带着 usage：进样（inputTokens）、回收（cachedReadTokens）、产出（outputTokens）、推理（reasoningTokens）四个计数鼓各自累加；右边是请求次数和 API 用时。',
  work: [METER.x, 172, WALLZ + 40], pin: [METER.x, METER.y + 36, WALLZ + 4],
  build(S, g) {
    const { x, y } = METER, k = new Kit({ tone: 0.5 });
    wallPanel(k, x, y, 66, 30);
    for (let i = 0; i < 4; i++) { const px = x - 22 + i * 15; k.box(12, 7, 1.2, { p: [px, y + 13, WALL_FACE + 2.4], rr: 0.6, b: 0.2, color: MAT.graphite }); k.cyl(1.4, 1, { p: [px, y + 24, WALL_FACE + 2.2], r: [Math.PI / 2, 0, 0], color: [FLUID.context, FLUID.cache, FLUID.text, FLUID.reason][i], paint: 1, seg: 12 }); }
    k.finish(g);
    const scr = makeScreen(60, 9, 14, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.font = `600 ${h * 0.36}px ${FONT_MONO}`; c.textBaseline = 'middle';
      const vals = s.vals || [0, 0, 0, 0];
      c.globalAlpha = 0.2; for (let i = 1; i < 4; i++) c.fillRect(w * i * 0.25, h * 0.15, Math.max(1, w * 0.003), h * 0.7); c.globalAlpha = 1;
      vals.forEach((v, i) => { c.textAlign = 'center'; c.fillText(fmtK(v), w * (0.125 + i * 0.25), h * 0.55); });
      c.textAlign = 'left';
    });
    scr.mesh.position.set(x, y + 16.5, WALL_FACE + 3.06); g.add(scr.mesh);
    scr.paint({ vals: [0, 0, 0, 0] });
    const sub = makeScreen(40, 4, 16, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `500 ${h * 0.6}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(fitText(c, s.t || '', w * 0.96), w * 0.02, h * 0.55); });
    sub.mesh.position.set(x, y + 5, WALL_FACE + 2.3); g.add(sub.mesh); sub.paint({ t: '0 次请求 · 0 s' });
    return { scr, sub, tot: [0, 0, 0, 0], calls: 0, api: 0 };
  },
});

// ── the goal board: objective, deliverables, phase, budget ──
const GOALB = { x: 60, y: 178 };
station('goalboard', {
  name: '目标白板', role: '目标模式 · goal_updated', color: FLUID.ok,
  desc: '/goal 设定的目标写在白板上：交付物逐条打勾，阶段从 planning → executing → verifying → complete，进度条是 token 预算。评估器、策略师、总结员的每一步（goal_* 事件）都写在角落里。',
  work: [GOALB.x, 172, WALLZ + 42], pin: [GOALB.x, GOALB.y + 54, WALLZ + 4],
  build(S, g) {
    const { x, y } = GOALB, k = new Kit({ tone: 0.5 });
    k.box(90, 48, 1.6, { p: [x, y, WALL_FACE + 0.8], rr: 1.5, b: 0.4, color: MAT.alu, tone: 0.5 });
    k.box(80, 1.6, 4, { p: [x, y - 0.8, WALL_FACE + 2], rr: 0.6, color: MAT.alu });
    for (const [dx, hex] of [[-20, FLUID.err], [-14, FLUID.text], [-8, MAT.graphite]]) k.box(5, 1.2, 1.4, { p: [x + dx, y + 0.8, WALL_FACE + 2.6], rr: 0.6, color: hex, paint: 1 });
    k.finish(g);
    const board = makeScreen(86, 44, 8, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#1b1b1b' : '#fdfdfb'; c.fillRect(0, 0, w, h);
      c.fillStyle = P.ink; c.textBaseline = 'top';
      c.font = `italic 600 ${h * 0.085}px ${FONT_SERIF}`; c.fillText(fitText(c, s.objective || '（还没有目标）', w * 0.9), w * 0.04, h * 0.05);
      c.font = `500 ${h * 0.055}px ${FONT_MONO}`; c.globalAlpha = 0.7; c.fillText(fitText(c, `${s.status || 'idle'} · ${s.phase || '—'}`, w * 0.6), w * 0.04, h * 0.2); c.globalAlpha = 1;
      (s.deliverables || []).slice(0, 4).forEach((d, i) => {
        const yy = h * (0.32 + i * 0.12); c.strokeStyle = P.ink; c.lineWidth = 1.2; c.strokeRect(w * 0.04, yy, h * 0.06, h * 0.06);
        if (d.status === 'done') { c.beginPath(); c.moveTo(w * 0.045, yy + h * 0.03); c.lineTo(w * 0.06, yy + h * 0.055); c.lineTo(w * 0.085, yy - h * 0.01); c.stroke(); }
        c.globalAlpha = d.status === 'pending' ? 0.55 : 0.95; c.font = `400 ${h * 0.06}px ${FONT_SERIF}`; c.fillText(fitText(c, d.title, w * 0.5), w * 0.1, yy - h * 0.005); c.globalAlpha = 1;
      });
      const u = clamp((s.used || 0) / (s.budget || 1), 0, 1);
      c.strokeRect(w * 0.04, h * 0.84, w * 0.5, h * 0.05); c.fillStyle = u > 0.8 ? '#d93a3f' : P.ink; c.globalAlpha = 0.7; c.fillRect(w * 0.04, h * 0.84, w * 0.5 * u, h * 0.05); c.globalAlpha = 1;
      c.fillStyle = P.ink; c.font = `400 ${h * 0.045}px ${FONT_MONO}`; c.fillText(`${fmtK(s.used || 0)} / ${fmtK(s.budget || 0)} token`, w * 0.04, h * 0.91);
      c.globalAlpha = 0.75; (s.log || []).slice(-7).forEach((l, i) => c.fillText(fitText(c, l, w * 0.38), w * 0.6, h * (0.3 + i * 0.075))); c.globalAlpha = 1;
    });
    board.mesh.position.set(x, y + 24, WALL_FACE + 1.7); g.add(board.mesh);
    board.paint({});
    return { board, state: { log: [] } };
  },
});

// ── the verification bench on the near side: three skeptics for goal mode; lamps for the stop gates ──
const VERIF = { x: 56, z: 90 };
station('verifier', {
  name: '复核台', role: '目标验证与收尾闸门 · goal_verifier / todo_gate / laziness', color: FLUID.ok,
  desc: '目标模式收尾时三个"怀疑者"子 agent 各自复核（goal_verifier_skeptic_verdict），绿灯是没被驳倒，红灯是驳倒，汇总灯给出结论。右边两盏是收尾闸门：待办没做完想停（todo_gate_fired）和偷懒判定（laziness_classifier_fired / nudge）。',
  work: [VERIF.x, 150, VERIF.z - 18], pin: [VERIF.x, FLOOR + 74, VERIF.z],
  build(S, g) {
    const { x, z } = VERIF, k = new Kit({ tone: 0.5 }), top = FLOOR + 40;
    k.box(70, 40, 26, { p: [x, FLOOR, z], rr: 2, b: 0.8, color: MAT.pale });
    for (let i = 0; i < 3; i++) { k.box(20, 1, 1.2, { p: [x - 22 + i * 22, FLOOR + 26, z - 13.4], rr: 0.4, color: MAT.paper }); k.box(8, 1.4, 1.4, { p: [x - 22 + i * 22, FLOOR + 30, z - 13.6], color: MAT.steel }); }
    const units = [];
    for (let i = 0; i < 3; i++) {
      const ux = x - 24 + i * 15;
      k.box(12, 14, 14, { p: [ux, top, z], rr: 2, b: 0.6, color: MAT.paper, tone: 0.6 });
      k.cyl(3.6, 1, { p: [ux, top + 8, z - 7], r: [-Math.PI / 2, 0, 0], color: MAT.graphite, seg: 22 });
      units.push(lampMesh(g, [ux, top + 8, z - 8.2], 2.2, FLUID.ok));
    }
    k.box(10, 6, 12, { p: [x + 22, top, z], rr: 1.5, b: 0.4, color: MAT.paper, tone: 0.6 });
    k.box(14, 10, 10, { p: [x + 22, top + 6, z + 1], rr: 1.5, b: 0.4, color: MAT.pale, tone: 0.55 });
    k.finish(g);
    const agg = lampMesh(g, [x + 22, top + 11, z - 4.2], 1.6, FLUID.ok);
    const todoLamp = lampMesh(g, [x + 18, top + 4, z - 6.2], 1.1, MAT.amberlamp);
    const lazyLamp = lampMesh(g, [x + 26, top + 4, z - 6.2], 1.1, FLUID.err);
    return { units, agg, todoLamp, lazyLamp, uk: [0, 0, 0], aggK: 0, todoK: 0, lazyK: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.units.forEach((m, i) => { R.uk[i] = Math.max(0, R.uk[i] - dt * 0.15); setLamp(m, 0.06 + R.uk[i]); });
    R.aggK = Math.max(0, R.aggK - dt * 0.15); setLamp(R.agg, 0.06 + R.aggK);
    R.todoK = Math.max(0, R.todoK - dt * 0.3); setLamp(R.todoLamp, 0.06 + R.todoK * (0.6 + 0.4 * Math.sin(t * 9)));
    R.lazyK = Math.max(0, R.lazyK - dt * 0.3); setLamp(R.lazyLamp, 0.06 + R.lazyK * (0.6 + 0.4 * Math.sin(t * 9)));
  },
});

// ── a liquid-nitrogen dewar: long-term memory ──
const DEWAR = { x: -164, z: 92 };
station('dewar', {
  name: '液氮罐', role: '记忆 · memory_flush / dream', color: FLUID.cache,
  desc: '长期记忆冻在液氮罐里：memory_flush 时机械臂放进一支冻存管，会话结束存一份会话记忆（memory_session_saved），积累够了会"做梦"整合（memory_dream_completed），罐口冒出白汽。',
  work: [DEWAR.x, 150, DEWAR.z - 16], pin: [DEWAR.x, FLOOR + 92, DEWAR.z],
  build(S, g) {
    const { x, z } = DEWAR, y = FLOOR + 24, k = new Kit({ tone: 0.55 });
    k.lathe([[0, 0], [12, 0], [13, 1, 1], [13.2, 38, 1], [11, 44, 1], [6, 46], [6, 48], [0, 48]], { p: [x, y, z], color: MAT.steel, seg: 40, tone: 0.55 });
    for (const yy of [8, 30]) k.line(ringPts(x, y + yy, z, 13.25, 40), 'lo');
    for (const s of [-1, 1]) k.tube([[x + s * 13, y + 30, z], [x + s * 16, y + 32, z], [x + s * 16, y + 40, z], [x + s * 12, y + 42, z]], 0.8, { bend: 2, color: MAT.steel });
    k.finish(g);
    const lid = group(g, [x, y + 48, z]);
    const kl = new Kit({ tone: 0.7 }); kl.cyl(6.6, 3, { color: MAT.paper, b: 0.6, seg: 24 }); kl.cyl(2, 2, { p: [0, 3, 0], color: MAT.graphite }); kl.finish(lid);
    const scr = makeScreen(8, 3, 26, lcdDraw); scr.mesh.position.set(x, y + 20, z - 13.3); g.add(scr.mesh);
    const ks = new Kit({ tone: 0.5 }); ks.box(10, 5, 1.2, { p: [x, y + 17.5, z - 13.2], rr: 0.6 }); ks.finish(g);
    scr.paint({ title: 'LN2 82%', lines: [], rows: 1 });
    return { lid, open: 0, openGoal: 0, scr, vapor: 0, count: 2 };
  },
  update(S, t, dt) {
    const R = S.refs; R.open = damp(R.open, R.openGoal, 5, dt); R.lid.position.y = FLOOR + 24 + 48 + R.open * 6; R.lid.rotation.z = R.open * 0.6;
    if ((R.vapor > 0 || R.open > 0.3) && fx.puffs && Math.random() < dt * 10) { fx.puffs.emit(V(DEWAR.x, FLOOR + 24 + 50, DEWAR.z), V((Math.random() - 0.5) * 6, 10, (Math.random() - 0.5) * 6), 0xeef4f8, 2.2, 5, 2.5, 0.5); }
    R.vapor = Math.max(0, R.vapor - dt);
  },
});

// ── a reel-to-reel recorder above the freezer: rewind ──
const TAPE = { x: FRIDGE.x, y: 158 };
station('tape', {
  name: '磁带机', role: '回退 · rewind_marker', color: FLUID.text,
  desc: '每回合末都录一个回退点。用户 /rewind 时（rewind_marker）磁带倒转，指针退回到目标回合，储液塔的液位跟着回落。',
  work: [TAPE.x, 172, WALLZ + 40], pin: [TAPE.x, TAPE.y + 40, WALLZ + 4],
  build(S, g) {
    const { x, y } = TAPE, k = new Kit({ tone: 0.5 });
    wallPanel(k, x, y, 44, 32);
    k.box(30, 3, 2, { p: [x, y + 4, WALL_FACE + 3], rr: 0.6, color: MAT.graphite });
    for (let i = 0; i < 4; i++) k.box(5, 2, 1.4, { p: [x - 9 + i * 6, y + 4.5, WALL_FACE + 4.4], rr: 0.4, color: i === 1 ? FLUID.err : MAT.paper, paint: i === 1 ? 1 : 0 });
    k.box(6, 4, 2, { p: [x, y + 10, WALL_FACE + 3.2], color: MAT.steel });
    k.tube([[x - 10, y + 21, WALL_FACE + 3.4], [x - 3, y + 12, WALL_FACE + 3.4], [x + 3, y + 12, WALL_FACE + 3.4], [x + 10, y + 21, WALL_FACE + 3.4]], 0.25, { color: 0x6b4b2a, bend: 2, radial: 4 });
    k.finish(g);
    const reels = [-10, 10].map(dx => {
      const r = group(g, [x + dx, y + 21, WALL_FACE + 3]);
      const kr = new Kit({ tone: 0.75 });
      kr.at([0, 0, 0], [Math.PI / 2, 0, 0], kk => { kk.cyl(8, 0.6, { color: MAT.alu, seg: 36 }); kk.cyl(4.5, 1.6, { p: [0, 0.6, 0], color: 0x6b4b2a, seg: 30 }); kk.cyl(1.2, 2.4, { p: [0, 0, 0], color: MAT.graphite, seg: 12 }); });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; kr.line([[Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.05], [Math.cos(a) * 7.6, Math.sin(a) * 7.6, 0.05]], 'mid'); }
      kr.finish(r);
      return r;
    });
    const counter = makeScreen(10, 3, 26, lcdDraw); counter.mesh.position.set(x + 14, y + 9, WALL_FACE + 2.3); g.add(counter.mesh);
    counter.paint({ title: 'IDX 00', lines: [], rows: 1 });
    return { reels, counter, speed: 0.15, speedGoal: 0.15 };
  },
  update(S, t, dt) { const R = S.refs; R.speed = damp(R.speed, R.speedGoal, 2, dt); R.reels.forEach(r => { r.rotation.z -= dt * R.speed * 4; }); },
});

// ── a rack of sealed ampoules beside the rotary evaporator: compaction checkpoints ──
const CKPT = { x: -178, z: 92 };
station('checkpoint', {
  name: '检查点安瓿', role: '压缩存档 · compaction_checkpoint', color: FLUID.context,
  desc: '每次压缩都会把压缩前的对话封成一支安瓿（compaction_checkpoint，写进 compaction_checkpoints/），以后 rewind 跨过压缩边界时用它还原。',
  work: [CKPT.x, 140, CKPT.z - 14], pin: [CKPT.x, FLOOR + 62, CKPT.z],
  build(S, g) {
    const { x, z } = CKPT, y = FLOOR + 24, k = new Kit({ tone: 0.55 });
    k.box(14, 6, 10, { p: [x, y, z], rr: 1, b: 0.4, color: MAT.pale });
    for (let i = 0; i < 4; i++) k.line(ringPts(x - 4.5 + i * 3, y + 6.06, z, 0.9, 10), 'lo');
    k.finish(g);
    const amps = [0, 1, 2, 3].map(i => { const m = new THREE.Group(); m.position.set(x - 4.5 + i * 3, y + 6, z); g.add(m); const ka = new Kit({ tone: 0.7 }); ka.add(latheGeo([[0, 0], [0.8, 0.3, 1], [0.8, 5], [0.3, 6.5, 1], [0.3, 8], [0, 8.4]], 10), { glass: true }); ka.finish(m); mesh(cylGeo(0.65, 4.6, 0, 8), fluidMat(FLUID.context), m, [0, 0.3, 0], [0, 0, 0], { tone: 0.6 }); m.visible = false; return m; });
    return { amps, n: 0 };
  },
});

// ── the bulkhead fittings: mode switch + YOLO key, scheduler timer, main power, supervisor camera, beacon ──
station('mode', {
  name: '模式开关', role: '计划模式 / YOLO · current_mode_update / yolo_toggled', color: FLUID.text,
  desc: '旋钮在"常规 / 计划"两档之间：计划模式（current_mode_update=plan）下反应釜只预热不出料，退出计划要你批准方案（exit_plan_mode → plan_approval）。旁边带红盖的钥匙是 YOLO：打开后安全联锁被旁路，权限请求自动放行。',
  work: [FX - 12, 140, -70], pin: [FX - 4, 150, -70],
  build(S, g) {
    const x = FX - 2.4, y = 118, z = -70, k = new Kit({ tone: 0.6 });
    k.box(3, 26, 30, { p: [x - 1.5, y, z], rr: 1.5, b: 0.5, color: MAT.paper, tone: 0.55 });
    k.cyl(5, 1.4, { p: [x - 3, y + 17, z - 6], r: [0, 0, Math.PI / 2], color: MAT.steel, seg: 28 });
    for (let i = 0; i < 2; i++) { const a = -0.6 + i * 1.2; k.line([[x - 3.05, y + 17 + Math.cos(a) * 6.2, z - 6 + Math.sin(a) * 6.2], [x - 3.05, y + 17 + Math.cos(a) * 7.4, z - 6 + Math.sin(a) * 7.4]], 'hi'); }
    k.box(1.2, 8, 8, { p: [x - 3.4, y + 4, z + 8], rr: 0.6, color: MAT.hazard, paint: 1 });
    k.finish(g);
    const knob = group(g, [x - 4.4, y + 17, z - 6]);
    const kk = new Kit({ tone: 0.9 }); kk.cyl(3, 2, { r: [0, 0, Math.PI / 2], color: MAT.graphite, seg: 20, b: 0.4 }); kk.box(1, 5.6, 1.2, { p: [-1.6, -0.4, 0], color: MAT.paper }); kk.finish(knob);
    const key = group(g, [x - 4.6, y + 8, z + 8]);
    const kq = new Kit({ tone: 0.9 }); kq.box(0.9, 3.2, 0.8, { p: [0, -1.6, 0], color: MAT.brass }); kq.cyl(1.2, 0.6, { p: [-0.3, 1.6, 0], r: [0, 0, Math.PI / 2], color: MAT.brass, seg: 16 }); kq.finish(key);
    const planLamp = lampMesh(g, [x - 3.4, y + 21.5, z + 6], 1.1, FLUID.text);
    const yoloLamp = lampMesh(g, [x - 3.4, y + 14, z + 12], 1.1, FLUID.err);
    return { knob, key, planLamp, yoloLamp, mode: 'default', yolo: false, ang: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.ang = damp(R.ang, R.mode === 'plan' ? 1.2 : -0.6, 6, dt); R.knob.rotation.x = R.ang;
    R.key.rotation.x = damp(R.key.rotation.x, R.yolo ? 1.3 : 0, 6, dt);
    setLamp(R.planLamp, R.mode === 'plan' ? 0.85 : 0.06); setLamp(R.yoloLamp, R.yolo ? 0.6 + 0.4 * Math.sin(t * 6) : 0.06);
  },
});
station('timer', {
  name: '定时器', role: '定时任务 · scheduled_task_*', color: FLUID.user,
  desc: '24 小时机械定时器：scheduled_task_created 插上一枚定时销，到点（scheduled_task_fired）铃响，派出一个后台子 agent 去跑；scheduled_task_deleted 拔掉销子。',
  work: [FX - 12, 160, 88], pin: [FX - 4, 178, 88],
  build(S, g) {
    const x = FX - 2.4, y = 150, z = 88, k = new Kit({ tone: 0.6 });
    k.box(3, 22, 20, { p: [x - 1.5, y, z], rr: 1.5, b: 0.5, color: MAT.paper, tone: 0.55 });
    k.cyl(8, 1.2, { p: [x - 3, y + 11, z], r: [0, 0, Math.PI / 2], color: MAT.pale, seg: 40 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.line([[x - 4.25, y + 11 + Math.cos(a) * 7.4, z + Math.sin(a) * 7.4], [x - 4.25, y + 11 + Math.cos(a) * (i % 6 ? 6.6 : 5.8), z + Math.sin(a) * (i % 6 ? 6.6 : 5.8)]], i % 6 ? 'lo' : 'mid'); }
    k.cyl(2.4, 2, { p: [x - 3, y + 24.5, z], color: MAT.brass, seg: 18 });
    k.finish(g);
    const hand = mesh(slabGeo(0.5, 6.4, 0.3, 0, 0), solid(MAT.graphite), g, [x - 4.5, y + 11, z], [0, 0, 0], { tone: 0.9, cast: false });
    const pin = mesh(cylGeo(0.7, 2, 0, 10), solid(FLUID.user, { paint: 1 }), g, [x - 4.3, y + 11, z], [0, 0, Math.PI / 2], { tone: 0.8 });
    pin.visible = false;
    const bell = lampMesh(g, [x - 3, y + 26.5, z], 0.6, MAT.amberlamp);
    return { hand, pin, bell, ring: 0 };
  },
  update(S, t, dt) {
    const R = S.refs, d = new Date(CLOCK_REAL()), a = ((d.getHours() + d.getMinutes() / 60) / 24) * TAU;
    R.hand.rotation.x = a;
    R.ring = Math.max(0, R.ring - dt); setLamp(R.bell, R.ring > 0 ? (Math.sin(t * 30) > 0 ? 1 : 0.2) : 0.06);
  },
});
station('power', {
  name: '总电源', role: '会话开始 / 结束 · session_start / session_end', color: MAT.amberlamp,
  desc: '会话开始（session_start hook）时总闸合上，车顶灯带亮起、仪器自检；会话结束（session_end）时总闸拉下，灯带熄灭。',
  work: [FX - 12, 130, 40], pin: [FX - 4, 116, 40],
  build(S, g) {
    const x = FX - 2.4, y = 78, z = 40, k = new Kit({ tone: 0.6 });
    k.box(3, 30, 22, { p: [x - 1.5, y, z], rr: 1.5, b: 0.5, color: MAT.pale, tone: 0.55 });
    k.box(1, 3, 18, { p: [x - 3.4, y + 25, z], color: MAT.hazard, paint: 1 });
    for (let i = 0; i < 4; i++) k.box(1.6, 6, 3, { p: [x - 3.6, y + 4, z - 6 + i * 4], rr: 0.4, color: MAT.graphite });
    // light strips along both cant rails
    for (const sz of [-1, 1]) k.box(FX - VAN.x0 - 20, 1.2, 3, { p: [(VAN.x0 + FX) / 2, ROOF - 10.2, sz * (VAN.z - 12)], color: MAT.paper, tone: 0.4 });
    k.finish(g);
    const lever = group(g, [x - 4, y + 16, z]);
    const kl = new Kit({ tone: 0.9 }); kl.box(1.6, 8, 2.4, { p: [-0.8, -1, 0], color: MAT.redlamp, paint: 1, rr: 0.6 }); kl.finish(lever);
    const strips = [-1, 1].map(sz => mesh(slabGeo(FX - VAN.x0 - 22, 0.6, 2, 0, 0), solid(0xffffff, { glow: 0, glowColor: 0xfff3d6 }), g, [(VAN.x0 + FX) / 2, ROOF - 11, sz * (VAN.z - 12)], [0, 0, 0], { tone: 0.3, cast: false }));
    return { lever, strips, on: 0, onGoal: 1 };
  },
  update(S, t, dt) { const R = S.refs; R.on = damp(R.on, R.onGoal, 2, dt); R.lever.rotation.x = lerp(0.9, -0.9, R.on); R.strips.forEach(m => setLamp(m, R.on * 0.9)); },
});
station('supervisor', {
  name: '监督摄像头', role: '收尾判定 · laziness / premature stop', color: FLUID.err,
  desc: '隔断顶上的摄像头盯着机械臂：想偷懒收工（laziness_classifier_fired）、目标还没验证就说做完了（goal_premature_stop_detected），它转过来亮红灯，把机械臂推回去干活（laziness_nudge_fired）。',
  work: [FX - 30, 180, -20], pin: [FX - 6, ROOF - 6, -78],
  build(S, g) {
    const x = FX - 4, y = ROOF - 20, z = -78, k = new Kit({ tone: 0.6 });
    k.box(6, 3, 8, { p: [x, y + 6, z], rr: 1, color: MAT.graphite });
    k.cyl(1, 4, { p: [x - 2, y + 2, z], color: MAT.steel });
    k.finish(g);
    const head = group(g, [x - 2, y + 2, z]);
    const kh = new Kit({ tone: 0.85 }); kh.box(12, 6, 6, { p: [-5, -6, 0], rr: 2, b: 0.5, color: MAT.paper }); kh.cyl(2.2, 2, { p: [-11.6, -3, 0], r: [0, 0, Math.PI / 2], color: MAT.graphite, seg: 18 }); kh.finish(head);
    const led = lampMesh(head, [-6, -1.8, 3.2], 0.6, FLUID.err);
    return { head, led, alert: 0, look: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.alert = Math.max(0, R.alert - dt * 0.4);
    const hp = robotParts.head?.position;
    if (hp) { const ang = Math.atan2(hp.z - (-78), -(hp.x - (FX - 6))); R.look = damp(R.look, clamp(ang, -1.2, 1.2), 2, dt); R.head.rotation.y = R.look; }
    R.head.rotation.z = -0.35 - R.alert * 0.15;
    setLamp(R.led, R.alert > 0 ? (Math.sin(t * 12) > 0 ? 1 : 0.3) : 0.25 + 0.2 * Math.sin(t * 2));
  },
});
station('beacon', {
  name: '警示灯', role: '等待与告警 · retry_state / pending_interaction', color: MAT.amberlamp,
  desc: '隔断顶上的旋转警示灯：等你审批或回答时转黄，重试、失败、恢复耗尽（retry_state / auto_recovery_exhausted）时转红。',
  work: [FX - 30, 180, 60], pin: [FX - 6, ROOF + 4, 62],
  build(S, g) {
    const x = FX - 4, y = ROOF - 16, z = 62, k = new Kit({ tone: 0.6 });
    k.cyl(4.6, 2, { p: [x, y, z], color: MAT.graphite, seg: 24, b: 0.4 });
    k.add(latheGeo([[0, 0], [4, 0], [4, 5, 1], [2.6, 7.6, 1], [0, 8.2]], 22), { p: [x, y + 2, z], glass: true });
    k.finish(g);
    const core = mesh(cylGeo(1.6, 5, 0, 14), solid(0xffffff, { glow: 0, glowColor: MAT.amberlamp }), g, [x, y + 2.2, z], [0, 0, 0], { tone: 0.5, cast: false });
    const sweep = glow(g, MAT.amberlamp, 70, [x, y + 5, z]);
    return { core, sweep, mode: null, until: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    if (R.until && sceneClock > R.until) { R.mode = null; R.until = 0; }
    const hex = R.mode === 'alert' ? FLUID.err : MAT.amberlamp, on = R.mode ? 0.5 + 0.5 * Math.max(0, Math.sin(t * 7)) : 0;
    setLamp(R.core, on * 0.9 + (R.mode ? 0.1 : 0.04), hex); R.sweep.userData.set(on * 0.7, hex);
  },
});

// ── the destination sign inside the cab: the session title ──
station('sign', {
  name: '路牌', role: '会话标题 · session_info_update', color: MAT.amberlamp,
  desc: '车头的点阵路牌显示会话标题：首条消息后生成标题（session_summary_generated → session_info_update）就换上新的一块；回顾（session_recap）也会在这里滚动一遍。',
  work: [FX - 12, 170, 0], pin: [FX + 40, ROOF - 4, 0],
  build(S, g) {
    const x = FX + 44, y = ROOF - 26, k = new Kit({ tone: 0.55 });
    k.box(4, 14, 90, { p: [x, y, 0], rr: 1.5, b: 0.5, color: MAT.graphite, tone: 0.55 });
    for (const sz of [-1, 1]) k.box(2, 12, 2, { p: [x, y + 14, sz * 38], color: MAT.steel });
    k.finish(g);
    const scr = makeScreen(84, 10, 12, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#0d0d0d' : '#1d1f1b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffb23e'; c.font = `600 ${h * 0.55}px ${FONT_MONO}`; c.textBaseline = 'middle';
      const txt = s.t || 'MV-01'; c.fillText(fitText(c, txt, w * 0.96), w * 0.02 - (s.scroll || 0) * w, h * 0.55);
      c.fillStyle = 'rgba(0,0,0,0.35)'; for (let xx = 0; xx < w; xx += 3) c.fillRect(xx, 0, 1, h); for (let yy = 0; yy < h; yy += 3) c.fillRect(0, yy, w, 1);
    });
    scr.mesh.position.set(x - 2.06, y + 7, 0); scr.mesh.rotation.y = -Math.PI / 2; g.add(scr.mesh);
    scr.paint({ t: 'MV-01 · 待命' });
    return { scr };
  },
});

// ── a pneumatic tube along the far wall: results ride back to the tower in capsules ──
// One glass line behind the instruments, a riser at each station, a drop into the tower's funnel.
// it runs low under the bottle shelf, climbs over the reactor's wall fittings, and drops into the tower top
const TUBE = { y: 150, hi: 186, z: WALLZ + 7, x0: TOWER.x, x1: INC.x + 18 };
const TUBE_PORTS = { scope: SCOPE.x, carousel: CAROUSEL.x, spectro: SPEC.x, pipettor: PIPET.x, workflow: WF.x, incubator: INC.x };
station('pneumatic', {
  name: '气动传输管', role: '工具结果回灌 · tool_call_update(completed)', color: FLUID.ok,
  desc: '工具做完，结果装进胶囊，沿墙上的玻璃气动管送回储液塔，倒进上下文（下一次请求就能看到）。失败的结果不走管道，由机械臂扔进废液桶。',
  work: [TOWER.x + 20, 172, TUBE.z + 30], pin: [(TUBE.x0 + TUBE.x1) / 2, TUBE.y + 8, TUBE.z],
  build(S, g) {
    const k = new Kit({ tone: 0.5 });
    const main = [[TUBE.x1, TUBE.y, TUBE.z], [-84, TUBE.y, TUBE.z], [-98, TUBE.hi, TUBE.z], [TOWER.x + 10, TUBE.hi, TUBE.z], [TOWER.x, TUBE.hi - 2, TOWER.z + 2], [TOWER.x, TOWER.y0 + TOWER.h + 9, TOWER.z]];
    k.add(tubeGeo(main, 1.9, { bend: 6, radial: 12 }), { glass: true });
    // brackets on the wall every 40 cm, and a riser down to each station's bench
    for (let x = TUBE.x1 - 10; x > TOWER.x + 20; x -= 40) { const yy = x > -84 ? TUBE.y : TUBE.hi; if (x < -84 && x > -100) continue; k.box(3, 3, TUBE.z - WALLZ, { p: [x, yy - 1.5, (TUBE.z + WALLZ) / 2], color: MAT.steel, tone: 0.4 }); k.torus(2.2, 0.35, { p: [x, yy, TUBE.z], r: [0, 0, Math.PI / 2], tub: 20, color: MAT.steel }); }
    for (const [id, x] of Object.entries(TUBE_PORTS)) {
      k.add(tubeGeo([[x + 4, BENCH + 2, TUBE.z], [x + 4, TUBE.y - 2, TUBE.z]], 1.2, { radial: 10 }), { glass: true });
      k.cyl(2.4, 2, { p: [x + 4, BENCH, TUBE.z], color: MAT.steel, b: 0.3 });
    }
    k.cyl(2.6, 3, { p: [TOWER.x, TOWER.y0 + TOWER.h + 6, TOWER.z], color: MAT.steel, b: 0.4 });
    k.finish(g);
    const path = filletPath(main, 6);
    // where each station's riser meets the main line, as a fraction along it
    const join = {};
    for (const [id, x] of Object.entries(TUBE_PORTS)) { let best = 0, bd = Infinity; for (let i = 0; i <= 400; i++) { const q = path.getPointAt(i / 400), d = Math.abs(q.x - (x + 4)) + Math.abs(q.y - TUBE.y); if (d < bd) { bd = d; best = i / 400; } } join[id] = best; }
    return { path, caps: [], join };
  },
  update(S, t, dt) {
    const R = S.refs;
    for (let i = R.caps.length - 1; i >= 0; i--) {
      const c = R.caps[i]; c.t += dt / c.dur;
      if (c.t < c.rise) { const k = c.t / c.rise; c.m.position.set(c.x + 4, lerp(BENCH + 2, TUBE.y, k), TUBE.z); c.m.rotation.set(0, 0, 0); }
      else {
        const u = c.u0 + (1 - c.u0) * ease(Math.min(1, (c.t - c.rise) / (1 - c.rise)));
        const p = R.path.getPointAt(u), tg = R.path.getTangentAt(u);
        c.m.position.copy(p); c.m.quaternion.setFromUnitVectors(V(0, 1, 0), tg);
      }
      if (c.t >= 1) { c.m.removeFromParent(); R.caps.splice(i, 1); c.done?.(); }
    }
  },
});
// send a capsule from a station's port to the tower; `done` runs when it drops in
function sendCapsule(stationId, hex, done) {
  const R = ST.pneumatic.refs, x = TUBE_PORTS[stationId] ?? TUBE.x1, u0 = R.join[stationId] ?? 0;
  const m = new THREE.Group();
  mesh(cylGeo(1.25, 5, 0.6, 12), solid(hex, { paint: 1 }), m, [0, -2.5, 0], [0, 0, 0], { tone: 0.8 });
  world.add(m);
  R.caps.push({ m, x, t: 0, dur: 1.6 + (1 - u0) * 1.2, rise: 0.22, u0, done });
  busy('pneumatic', 2.5);
}
