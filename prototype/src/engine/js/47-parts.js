// ═════════════════════════ the rest of the board: I/O, power, housekeeping, goals, helpers ═════════════════════════

// ── 17 · the console: your prompts go in here, answers come out ──
station('term', {
  name: 'I/O 终端', role: '用户消息 · 回答 · 提问 · user_message_chunk', color: FLUID.user,
  desc: '板子左前角接着一台终端：你的委托（user_message_chunk）从这里打进去，变成一盒金色卡匣放到旁边的进件托盘上，由搬运车插进上下文卡匣；模型的正文沿蓝色总线送回来显示在屏幕上。ask_user_question 和反馈请求也在这里响铃。',
  work: [INTAKE.x, TOP + 34, INTAKE.z], pin: [TERM.x, TOP + 52, TERM.z],
  build(S, g) {
    const { x, z } = TERM, k = new Kit({ tone: 0.55 });
    // monitor on a stand, keyboard in front, a cable back to the board's I/O header
    k.box(22, 2, 14, { p: [x, TOP, z - 2], rr: 2, b: 0.5, color: MAT.pale, tone: 0.5 });
    k.box(5, 14, 3.4, { p: [x, TOP + 2, z - 5], rr: 1, b: 0.3, color: MAT.steel, tone: 0.55 });
    k.box(50, 33, 4, { p: [x, TOP + 13, z - 4], rr: 2, b: 0.8, color: MAT.paper, tone: 0.6, r: [-0.1, 0, 0] });
    k.box(44, 2.4, 14, { p: [x, TOP, z + 24], rr: 1.4, b: 0.5, color: MAT.paper, tone: 0.5, r: [0.06, 0, 0] });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) k.box(2.6, 0.9, 2.4, { p: [x - 19.5 + c * 3.25 + (r % 2) * 0.8, TOP + 2.6 - r * 0.15, z + 19 + r * 3], rr: 0.4, color: c === 12 && r === 2 ? MAT.hazard : MAT.pale, tone: 0.6 });
    k.tube([[x + 6, TOP + 18, z - 7], [x + 8, TOP + 4, z - 16], [x + 14, TOP + 0.8, z - 26], [TERM.x + 4, TOP + 0.8, 70]], 0.8, { color: MAT.graphite, bend: 5, radial: 7 });
    // the intake tray by the lane
    k.box(14, 2.2, 16, { p: [INTAKE.x, TOP, INTAKE.z], rr: 1.2, b: 0.4, color: MAT.pale, tone: 0.5 });
    const port = socket(k, INTAKE.x, INTAKE.z, TOP + 2.2);
    k.tube([[TERM.x + 4, TOP + 0.8, 70], [INTAKE.x + 2, TOP + 0.8, 48], [INTAKE.x + 2, TOP + 1.2, INTAKE.z + 8]], 0.6, { color: MAT.graphite, bend: 6, radial: 6 });
    k.finish(g);
    const scr = makeScreen(45, 28, 11, (c, w, h, s, P) => {
      const lines = s.lines || [], rows = 13, lh = h / (rows + 1.2);
      c.fillStyle = P.screenInk; c.textBaseline = 'top';
      c.font = `600 ${lh * 0.7}px ${FONT_MONO}`; c.fillText(fitText(c, s.head || 'TK-1 · tty0', w * 0.94), w * 0.03, lh * 0.3);
      c.globalAlpha = 0.25; c.fillRect(w * 0.03, lh * 1.25, w * 0.94, 1);
      lines.slice(-(rows - 1)).forEach((l, i) => { c.globalAlpha = l.dim ? 0.62 : 1; c.fillStyle = l.gold ? '#c99a00' : P.screenInk; c.font = `${l.dim ? 400 : 500} ${lh * 0.66}px ${FONT_MONO}`; c.fillText(fitText(c, l.t, w * 0.94), w * 0.03, lh * (1.5 + i)); });
      c.globalAlpha = 1;
    });
    // the screen sits in the bezel, which leans back by 0.1
    scr.mesh.position.set(x, TOP + 13 + 16.5 * Math.cos(-0.1), z - 4 + 16.5 * Math.sin(-0.1) + 2.05); scr.mesh.rotation.x = -0.1; g.add(scr.mesh);
    scr.paint({ lines: [] });
    const bell = lampMesh(g, [x + 22, TOP + 44.6, z - 6.6], 1, MAT.amberlamp);
    return { scr, port, bell, lines: [], ring: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.ring = Math.max(0, R.ring - dt); setLamp(R.bell, R.ring > 0 ? (Math.sin(t * 26) > 0 ? 1 : 0.2) : 0.05); },
});

// ── 18 · power: the supply and the rail around the board ──
const PSU = { x: -214, z: 134 };
station('power', {
  name: '电源', role: '会话开始 / 结束 · session_start / session_end', color: MAT.amberlamp,
  desc: '会话开始（session_start hook）时电源合上，板边一圈电源轨亮起；会话结束（session_end）时断电，电源轨熄灭。',
  work: [PSU.x, TOP + 40, 30], pin: [PSU.x, TOP + 30, PSU.z],
  build(S, g) {
    const { x, z } = PSU, k = new Kit({ tone: 0.55 });
    k.box(36, 16, 28, { p: [x, TOP, z], rr: 1.6, b: 0.6, color: MAT.alu, tone: 0.5 });
    for (let i = 1; i <= 5; i++) k.line(ringPts(x - 6, TOP + 16.06, z, i * 1.9, 32), i === 5 ? 'mid' : 'lo');
    k.line([[x - 15.5, TOP + 16.06, z], [x + 3.5, TOP + 16.06, z]], 'lo'); k.line([[x - 6, TOP + 16.06, z - 9.5], [x - 6, TOP + 16.06, z + 9.5]], 'lo');
    k.box(10, 0.3, 12, { p: [x + 10, TOP + 16, z - 2], color: MAT.paper, tone: 0.3 });
    for (let i = 0; i < 4; i++) k.line([[x + 6, TOP + 16.36, z - 6 + i * 2.4], [x + 14, TOP + 16.36, z - 6 + i * 2.4]], 'lo');
    k.box(8, 6, 1.2, { p: [x + 9, TOP + 5, z + 14.6], rr: 0.6, color: MAT.graphite, tone: 0.6 });
    k.tube([[x - 12, TOP + 6, z - 14], [x - 12, TOP + 2, z - 22], [x - 30, TOP + 0.6, z - 22], [BOARD.x0 + 11, TOP + 0.6, z - 22]], 1.1, { color: MAT.graphite, bend: 5, radial: 8 });
    k.finish(g);
    const rocker = group(g, [x + 9, TOP + 8, z + 15.4]);
    const kr = new Kit({ tone: 0.9 }); kr.box(5, 3.4, 1.6, { p: [0, -1.7, 0], color: MAT.redlamp, paint: 1, rr: 0.4 }); kr.finish(rocker);
    const led = lampMesh(g, [x - 13, TOP + 10, z + 14.4], 0.8, FLUID.ok);
    // the rail: a copper ring just inside the board edge that glows while the session is powered
    const { x0, x1, z0, z1 } = BOARD, pts = rrPts(x1 - x0 - 22, z1 - z0 - 22, 8, 4).map(p => V((x0 + x1) / 2 + p[0], TOP, (z0 + z1) / 2 + p[1])); pts.push(pts[0].clone());
    const railCurve = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) railCurve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const rail = mesh(ribbonGeo(railCurve, 1.4, 0.3, 6), solid(MAT.copper, { glow: 0, glowColor: 0xffc04a }), g, [0, 0, 0], [0, 0, 0], { tone: 0.3, cast: false });
    return { rocker, led, rail, on: 0, onGoal: 1 };
  },
  update(S, t, dt) { const R = S.refs; R.on = damp(R.on, R.onGoal, 2, dt); R.rocker.rotation.x = lerp(0.3, -0.3, R.on); setLamp(R.led, R.on * 0.9); setLamp(R.rail, R.on * 0.55); },
});

// ── 19 · the hook bus: one lamp per hook event, along the lane ──
const HOOKB = { x0: -226, x1: -66, z: 27 };
const HOOK_CODES = ['SS', 'UPS', 'PRE', 'POST', 'PTF', 'DEN', 'STOP', 'SF', 'NTF', 'SA+', 'SA-', 'PC', 'PC+', 'SE'];
station('hooks', {
  name: 'Hook 总线', role: 'Hook 执行 · hook_execution', color: FLUID.ok,
  desc: '沿通道一排 14 盏灯，对应 14 种 hook 事件（session_start、user_prompt_submit、pre_tool_use、post_tool_use、post_tool_use_failure、permission_denied、stop、stop_failure、notification、subagent_start、subagent_stop、pre_compact、post_compact、session_end）。每次 hook_execution 对应的灯闪一下：全部成功是绿色，有跳过的是琥珀色，有失败的是红色；搬运车同时用扫描头扫一下手上的东西。',
  work: [(HOOKB.x0 + HOOKB.x1) / 2, TOP + 36, 10], pin: [HOOKB.x0 + 4, TOP + 16, HOOKB.z],
  build(S, g) {
    const { x0, x1, z } = HOOKB, k = new Kit({ tone: 0.55 });
    k.box(x1 - x0 + 8, 2.4, 8, { p: [(x0 + x1) / 2, TOP, z], rr: 1.2, b: 0.4, color: MAT.pale, tone: 0.5 });
    const lamps = [];
    HOOK_EVENTS.forEach((ev, i) => {
      const px = x0 + (i / 13) * (x1 - x0);
      k.cyl(1.9, 0.8, { p: [px, TOP + 2.4, z - 1], color: MAT.steel, seg: 16 });
      lamps.push(lampMesh(g, [px, TOP + 4, z - 1], 1.25, FLUID.ok));
      silk(HOOK_CODES[i], px, z + 2.6, { size: 1.5, y: TOP + 2.46 });
    });
    k.finish(g);
    return { lamps, k: new Array(14).fill(0), hex: new Array(14).fill(FLUID.ok) };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 0.6); setLamp(m, 0.05 + R.k[i], R.hex[i]); }); },
});

// ── 20 · the journal ring: every turn is a cell; rewind sweeps the pointer back ──
const JOUR = { x: -200, z: 74 };
station('journal', {
  name: '日志环', role: '回退 · rewind_marker', color: FLUID.text,
  desc: '一圈 24 格的环形日志：每个回合点亮一格，指针指着最新的一格。回退（rewind_marker）时指针倒着扫回目标回合，后面的格子熄灭，上下文跟着回落。',
  work: [JOUR.x, TOP + 36, 22], pin: [JOUR.x, TOP + 18, JOUR.z],
  build(S, g) {
    const { x, z } = JOUR, k = new Kit({ tone: 0.55 });
    k.cyl(19, 3, { p: [x, TOP, z], color: MAT.pale, seg: 48, b: 0.6, tone: 0.5 });
    k.cyl(12.6, 0.4, { p: [x, TOP + 3, z], color: MAT.paper, seg: 40, tone: 0.5 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.line([[x + Math.cos(a) * 13, TOP + 3.06, z + Math.sin(a) * 13], [x + Math.cos(a) * 18, TOP + 3.06, z + Math.sin(a) * 18]], 'lo'); }
    k.cyl(2.6, 2, { p: [x, TOP + 3, z], color: MAT.graphite, seg: 18 });
    k.finish(g);
    const cells = new THREE.InstancedMesh(slabGeo(3.4, 0.9, 1.8, 0, 0.2), fluidMat(0xffffff), 24);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + TAU / 48; q.setFromAxisAngle(V(0, 1, 0), -a); m4.compose(V(x + Math.cos(a) * 15.5, TOP + 3, z + Math.sin(a) * 15.5), q, V(1, 1, 1)); cells.setMatrixAt(i, m4); cells.setColorAt(i, col.set(MAT.pale)); }
    cells.userData.tone = 0.5; cells.castShadow = false; g.add(cells);
    const hand = group(g, [x, TOP + 5, z]);
    const kh = new Kit({ tone: 0.9 }); kh.box(1, 0.8, 14, { p: [0, 0, 7], color: MAT.redlamp, paint: 1 }); kh.finish(hand);
    return { cells, col, hand, n: 0, idx: 0, ang: 0, lit: new Array(24).fill(false), dirty: true, rewind: 0 };
  },
  update(S, t, dt) {
    const R = S.refs, goal = ((R.idx % 24) / 24) * TAU + TAU / 48;
    let d = goal - R.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); R.ang += d * (1 - Math.exp(-(R.rewind > 0 ? 2 : 6) * dt));
    R.rewind = Math.max(0, R.rewind - dt);
    R.hand.rotation.y = Math.PI / 2 - R.ang;
    if (R.dirty) { R.dirty = false; for (let i = 0; i < 24; i++) R.cells.setColorAt(i, R.col.set(R.lit[i] ? (i === R.idx % 24 ? FLUID.user : FLUID.text) : MAT.pale)); R.cells.instanceColor.needsUpdate = true; }
  },
});

// ── 21 · memory: a flash drive whose cells fill as memories are written ──
const MEM = { x: -140, z: 72 };
station('mem', {
  name: '记忆盘', role: '记忆 · memory_*', color: FLUID.cache,
  desc: '一块固态盘，四颗闪存上的格子是写下来的记忆。记忆写入（memory_flush_*）时活动灯狂闪、格子一格格亮起；会话记忆保存、记忆整合（memory_dream_completed，格子重新排列）、记忆文件清单也在这里。',
  work: [MEM.x, TOP + 34, 22], pin: [MEM.x, TOP + 16, MEM.z - 8],
  build(S, g) {
    const { x, z } = MEM, k = new Kit({ tone: 0.55 });
    k.box(8, 4, 20, { p: [x - 26, TOP, z], rr: 0.6, color: MAT.graphite, tone: 0.5 });
    for (const dx of [-12, 22]) k.cyl(1.2, 3.2, { p: [x + dx, TOP, z], color: MAT.brass, seg: 10 });
    k.box(52, 1.2, 18, { p: [x - 1, TOP + 3.2, z], rr: 0.8, color: MAT.mask, tone: 0.45 });
    for (let i = 0; i < 4; i++) k.box(9, 1.4, 9, { p: [x - 16 + i * 11, TOP + 4.4, z], rr: 0.4, b: 0.2, color: MAT.graphite, tone: 0.55 });
    k.box(7, 1.2, 7, { p: [x + 28, TOP + 4.4, z - 3], color: 0x6a6c72, tone: 0.55 });
    k.box(16, 0.2, 5, { p: [x + 2, TOP + 5.8, z + 6.6], color: MAT.paper, tone: 0.3 });
    k.finish(g);
    const cells = new THREE.InstancedMesh(slabGeo(1.6, 0.3, 1.6, 0, 0), fluidMat(0xffffff), 64);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let c = 0; c < 64; c++) { const p = Math.floor(c / 16), r = c % 16; m4.makeTranslation(x - 16 + p * 11 - 3 + (r % 4) * 2, TOP + 5.8, z - 3 + Math.floor(r / 4) * 2); cells.setMatrixAt(c, m4); cells.setColorAt(c, col.set(0x8c8e94)); }
    cells.userData.tone = 0.3; cells.castShadow = false; g.add(cells);
    const led = lampMesh(g, [x + 22, TOP + 5, z + 7], 0.6, FLUID.cache);
    return { cells, col, led, count: 0, act: 0, dirty: true, order: Array.from({ length: 64 }, (_, i) => i) };
  },
  update(S, t, dt) {
    const R = S.refs; R.act = Math.max(0, R.act - dt);
    setLamp(R.led, R.act > 0 ? (Math.sin(t * 40) > 0 ? 1 : 0.1) : 0.12);
    if (R.dirty) { R.dirty = false; const n = Math.min(64, R.count * 6); for (let c = 0; c < 64; c++) R.cells.setColorAt(R.order[c], R.col.set(c < n ? FLUID.cache : THEME === 'dark' ? 0x2f3136 : 0x8c8e94)); R.cells.instanceColor.needsUpdate = true; }
  },
});

// ── 22 · the real-time clock: scheduled tasks are pins on a 24-hour dial ──
const RTC = { x: -86, z: 74 };
station('rtc', {
  name: '实时时钟', role: '定时任务 · scheduled_task_*', color: FLUID.user,
  desc: '主板上的纽扣电池和晶振，旁边一只 24 小时表盘：scheduled_task_created 插上一枚定时销，到点（scheduled_task_fired）铃响，派出一个后台子 agent；scheduled_task_deleted 拔掉销子。指针走的是录制时的真实时间。',
  work: [RTC.x, TOP + 34, 22], pin: [RTC.x, TOP + 18, RTC.z],
  build(S, g) {
    const { x, z } = RTC, k = new Kit({ tone: 0.55 });
    k.cyl(7, 2.4, { p: [x - 16, TOP, z + 4], color: MAT.steel, seg: 32, b: 0.4 });
    k.box(2, 3, 14, { p: [x - 16, TOP + 0.4, z + 4], color: MAT.alu, tone: 0.6 });
    k.box(6, 2.4, 3, { p: [x - 16, TOP, z - 8], rr: 1.2, b: 0.3, color: MAT.alu, tone: 0.55 });
    k.cyl(13, 2.4, { p: [x + 6, TOP, z], color: MAT.pale, seg: 48, b: 0.5, tone: 0.5 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.line([[x + 6 + Math.cos(a) * 11.6, TOP + 2.46, z + Math.sin(a) * 11.6], [x + 6 + Math.cos(a) * (i % 6 ? 10.4 : 9.4), TOP + 2.46, z + Math.sin(a) * (i % 6 ? 10.4 : 9.4)]], i % 6 ? 'lo' : 'mid'); }
    k.cyl(1.4, 1.4, { p: [x + 6, TOP + 2.4, z], color: MAT.graphite, seg: 14 });
    k.finish(g);
    const hand = group(g, [x + 6, TOP + 3, z]);
    const kh = new Kit({ tone: 0.9 }); kh.box(0.7, 0.6, 9, { p: [0, 0, 4.5], color: MAT.graphite }); kh.finish(hand);
    const pin = mesh(cylGeo(0.8, 3, 0, 10), solid(FLUID.user, { paint: 1 }), g, [x + 6, TOP + 2.4, z - 10.8], [0, 0, 0], { tone: 0.8 });
    pin.visible = false;
    const bell = lampMesh(g, [x - 16, TOP + 3.6, z + 4], 1, MAT.amberlamp);
    return { hand, pin, bell, ring: 0 };
  },
  update(S, t, dt) {
    const R = S.refs, d = new Date(CLOCK_REAL()), a = ((d.getHours() + d.getMinutes() / 60) / 24) * TAU;
    R.hand.rotation.y = -a;
    R.ring = Math.max(0, R.ring - dt); setLamp(R.bell, R.ring > 0 ? (Math.sin(t * 30) > 0 ? 1 : 0.2) : 0.05);
  },
});

// ── 23 · the usage meter: four counters and a request tally ──
const METER = { x: -158, z: 134 };
station('meter', {
  name: '计量表', role: '用量 · turn_completed.usage', color: FLUID.cache,
  desc: '每回合结束时 turn_completed 带着 usage：输入（inputTokens）、缓存命中（cachedReadTokens）、输出（outputTokens）、推理（reasoningTokens）四个计数器各自累加；下面一行是请求次数和 API 用时。',
  work: [METER.x, TOP + 40, 30], pin: [METER.x, TOP + 26, METER.z],
  build(S, g) {
    const { x, z } = METER, k = new Kit({ tone: 0.55 });
    k.box(42, 8, 22, { p: [x, TOP, z], rr: 1.6, b: 0.5, color: MAT.paper, tone: 0.5 });
    for (let i = 0; i < 4; i++) k.cyl(1.1, 0.8, { p: [x - 15 + i * 10, TOP + 8, z + 8.4], color: [FLUID.context, FLUID.cache, FLUID.text, FLUID.reason][i], paint: 1, seg: 12 });
    const scr = standScreen(g, k, x, z - 3, 38, 8, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.font = `600 ${h * 0.3}px ${FONT_MONO}`; c.textBaseline = 'middle';
      const vals = s.vals || [0, 0, 0, 0];
      c.globalAlpha = 0.2; for (let i = 1; i < 4; i++) c.fillRect(w * i * 0.25, h * 0.15, Math.max(1, w * 0.004), h * 0.7); c.globalAlpha = 1;
      vals.forEach((v, i) => { c.textAlign = 'center'; c.fillText(fmtK(v), w * (0.125 + i * 0.25), h * 0.55); });
      c.textAlign = 'left';
    }, { y: TOP + 8, px: 16 });
    k.finish(g);
    scr.paint({ vals: [0, 0, 0, 0] });
    const sub = makeScreen(30, 3.6, 18, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `500 ${h * 0.62}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(fitText(c, s.t || '', w * 0.96), w * 0.02, h * 0.55); });
    sub.mesh.position.set(x, TOP + 4, z + 11.06); g.add(sub.mesh); sub.paint({ t: '0 次请求 · 0 s' });
    return { scr, sub, tot: [0, 0, 0, 0], calls: 0, api: 0 };
  },
});

// ── 24 · the plan panel: the todo list on e-paper ──
const PLANP = { x: -104, z: 136 };
station('plan', {
  name: '计划屏', role: '计划与待办 · plan / todo_write', color: FLUID.text,
  desc: '一块电子纸：agent 写下的计划（plan、todo_write）逐条列出，做完的打勾。可用命令、会话回顾、反馈请求也会在终端上打出来。',
  work: [PLANP.x, TOP + 40, 30], pin: [PLANP.x, TOP + 34, PLANP.z],
  build(S, g) {
    const { x, z } = PLANP, k = new Kit({ tone: 0.55 });
    k.box(34, 2, 16, { p: [x, TOP, z + 2], rr: 1.4, b: 0.4, color: MAT.pale, tone: 0.5 });
    const paper = standScreen(g, k, x, z, 32, 21, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#1d1d1d' : '#f6f5ef'; c.fillRect(0, 0, w, h);
      c.fillStyle = P.ink; c.textBaseline = 'top';
      c.font = `italic 600 ${h * 0.1}px ${FONT_SERIF}`; c.fillText(s.title || '计划', w * 0.05, h * 0.04);
      (s.items || []).slice(0, 7).forEach((it, i) => {
        const yy = h * (0.2 + i * 0.112); c.strokeStyle = P.ink; c.lineWidth = 1.2; c.strokeRect(w * 0.05, yy + h * 0.015, h * 0.065, h * 0.065);
        if (it.done) { c.beginPath(); c.moveTo(w * 0.055, yy + h * 0.045); c.lineTo(w * 0.075, yy + h * 0.075); c.lineTo(w * 0.1, yy); c.stroke(); }
        c.globalAlpha = it.done ? 0.55 : 0.95; c.font = `400 ${h * 0.068}px ${FONT_SERIF}`; c.fillText(fitText(c, it.t, w * 0.82), w * 0.13, yy); c.globalAlpha = 1;
      });
    }, { y: TOP + 2, tilt: -0.55, px: 12 });
    k.finish(g);
    paper.paint({ title: '计划', items: [] });
    return { paper };
  },
});

// ── 25 · the name plate: the session title on a dot-matrix strip along the near edge ──
const SIGN = { x: 222, z: 150 };
station('sign', {
  name: '铭牌', role: '会话标题 · session_info_update', color: MAT.amberlamp,
  desc: '板子前沿的点阵铭牌显示会话标题：首条消息后生成标题（session_summary_generated → session_info_update）就换上新的一块。',
  work: [SIGN.x, TOP + 40, 30], pin: [SIGN.x - 46, TOP + 20, SIGN.z],
  build(S, g) {
    const { x, z } = SIGN, k = new Kit({ tone: 0.55 });
    k.box(96, 3, 16, { p: [x, TOP, z], rr: 1.6, b: 0.5, color: MAT.pale, tone: 0.5 });
    const scr = standScreen(g, k, x, z + 1, 88, 8, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#0d0d0d' : '#1d1f1b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffb23e'; c.font = `600 ${h * 0.55}px ${FONT_MONO}`; c.textBaseline = 'middle';
      c.fillText(fitText(c, s.t || 'TK-1', w * 0.96), w * 0.02, h * 0.55);
      c.fillStyle = 'rgba(0,0,0,0.35)'; for (let xx = 0; xx < w; xx += 3) c.fillRect(xx, 0, 1, h); for (let yy = 0; yy < h; yy += 3) c.fillRect(0, yy, w, 1);
    }, { y: TOP + 3, tilt: -0.75, px: 12 });
    k.finish(g);
    scr.paint({ t: 'TK-1 · 待命' });
    return { scr };
  },
});

// ── 26 · the watchdog camera under the gate: it watches the courier finish its work ──
const WATCH_Z = 15;
station('watch', {
  name: '巡检相机', role: '收尾判定 · laziness / premature stop', color: FLUID.err,
  desc: '挂在闸门横梁下的巡检相机盯着搬运车：想偷懒收工（laziness_classifier_fired）、目标还没验证就说做完了（goal_premature_stop_detected），它转过来亮红灯，把车推回去干活（laziness_nudge_fired）。',
  work: [GATE.x - 30, TOP + 40, 0], pin: [GATE.x - 4, TOP + GATE.h - 16, WATCH_Z],
  build(S, g) {
    const x = GATE.x, y = TOP + GATE.h + 2, z = WATCH_Z, k = new Kit({ tone: 0.6 });
    k.box(6, 2, 6, { p: [x, y - 2, z], color: MAT.steel });
    k.cyl(1, 6, { p: [x, y - 8, z], color: MAT.steel, seg: 10 });
    k.finish(g);
    const head = group(g, [x, y - 8, z]);
    const kh = new Kit({ tone: 0.85 }); kh.box(12, 6, 7, { p: [-4, -6, 0], rr: 2, b: 0.5, color: MAT.paper }); kh.cyl(2.4, 3, { p: [-10.4, -3, 0], r: [0, 0, Math.PI / 2], color: MAT.graphite, seg: 18 }); kh.finish(head);
    const led = lampMesh(head, [-6, -1.6, 3.7], 0.6, FLUID.err);
    return { head, led, alert: 0, look: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.alert = Math.max(0, R.alert - dt * 0.4);
    const hp = courier.head?.position;
    if (hp) { const ang = Math.atan2(hp.z - WATCH_Z, -(hp.x - GATE.x)); R.look = damp(R.look, clamp(ang, -1.3, 1.3), 2, dt); R.head.rotation.y = R.look; R.head.rotation.z = -0.5 - R.alert * 0.2 + clamp((Math.abs(hp.x - GATE.x) - 40) / 400, -0.2, 0.3); }
    setLamp(R.led, R.alert > 0 ? (Math.sin(t * 12) > 0 ? 1 : 0.3) : 0.2 + 0.15 * Math.sin(t * 2));
  },
});

// ── 27 · the stack light on the gate's far post ──
station('beacon', {
  name: '信号灯塔', role: '等待与告警 · retry_state / pending_interaction', color: MAT.amberlamp,
  desc: '闸门柱顶的三色灯塔：回合进行中绿灯常亮；等你审批或回答时黄灯闪；重试、失败、自救耗尽（retry_state / auto_recovery_*）时红灯闪。',
  work: [GATE.x - 30, TOP + 50, -10], pin: [GATE.x, TOP + GATE.h + 36, -GATE.post],
  build(S, g) {
    const x = GATE.x, z = -GATE.post, y = TOP + GATE.h + 6.5, k = new Kit({ tone: 0.6 });
    k.cyl(1, 6, { p: [x, y, z], color: MAT.steel, seg: 10 });
    k.cyl(3.2, 1.4, { p: [x, y + 6, z], color: MAT.graphite, seg: 24, b: 0.3 });
    k.cyl(3.2, 1.6, { p: [x, y + 19.4, z], color: MAT.graphite, seg: 24, b: 0.4 });
    k.finish(g);
    const tiers = [FLUID.ok, MAT.amberlamp, FLUID.err].map((hex, i) => mesh(cylGeo(2.9, 4.2, 0.3, 22), solid(0xffffff, { glow: 0.05, glowColor: hex }), g, [x, y + 7.4 + i * 4, z], [0, 0, 0], { tone: 0.5, cast: false }));
    const sweep = glow(g, MAT.amberlamp, 60, [x, y + 14, z]);
    return { tiers, sweep, mode: null, until: 0, run: false };
  },
  update(S, t, dt) {
    const R = S.refs;
    if (R.until && sceneClock > R.until) { R.mode = null; R.until = 0; }
    const on = 0.5 + 0.5 * Math.max(0, Math.sin(t * 7));
    setLamp(R.tiers[0], R.run && !R.mode ? 0.75 : 0.05);
    setLamp(R.tiers[1], R.mode === 'wait' ? on * 0.95 : 0.05);
    setLamp(R.tiers[2], R.mode === 'alert' ? on * 0.95 : 0.05);
    R.sweep.userData.set(R.mode ? on * 0.6 : 0, R.mode === 'alert' ? FLUID.err : MAT.amberlamp);
  },
});

// ── 28 · the goal board ──
const GOALB = { x: 64, z: -130 };
station('goal', {
  name: '目标板', role: '目标模式 · goal_updated / goal_*', color: FLUID.ok,
  desc: '/goal 设定的目标写在这块电子纸上：交付物逐条打勾，阶段从 planning → executing → verifying → complete，进度条是 token 预算。评估器、规划员、策略师、总结员的每一步（goal_* 事件）都记在右边。',
  work: [GOALB.x, TOP + 40, -40], pin: [GOALB.x - 30, TOP + 60, GOALB.z],
  build(S, g) {
    const { x, z } = GOALB, k = new Kit({ tone: 0.55 });
    for (const sx of [-1, 1]) { k.box(8, 2, 10, { p: [x + sx * 30, TOP, z], rr: 1, color: MAT.steel }); k.box(2.4, 24, 2.4, { p: [x + sx * 30, TOP + 2, z], color: MAT.steel, tone: 0.5 }); }
    const board = standScreen(g, k, x, z, 60, 38, (c, w, h, s, P) => {
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
    }, { y: TOP + 24, tilt: -0.2, px: 9 });
    k.finish(g);
    board.paint({});
    return { board, state: { log: [] } };
  },
});

// ── 29 · the verification fixture: three skeptic probes over a test pad, plus the stop gates ──
const VERIF = { x: 150, z: -128 };
station('verify', {
  name: '验证夹具', role: '目标验证与收尾闸门 · goal_verifier / todo_gate', color: FLUID.ok,
  desc: '目标模式收尾时，三个"怀疑者"子 agent 各自复核（goal_verifier_skeptic_verdict）：对应的探针落下去测一下，绿灯是没被驳倒，红灯是驳倒；中间的汇总灯给出结论。右边两盏是收尾闸门：待办没做完想停（todo_gate_fired）和偷懒判定（laziness_classifier_fired）。',
  work: [VERIF.x, TOP + 40, -40], pin: [VERIF.x - 22, TOP + 44, VERIF.z],
  build(S, g) {
    const { x, z } = VERIF, k = new Kit({ tone: 0.55 });
    k.box(56, 5, 32, { p: [x, TOP, z], rr: 1.8, b: 0.6, color: MAT.pale, tone: 0.5 });
    k.box(36, 0.5, 14, { p: [x - 6, TOP + 5, z + 4], color: MAT.gold, tone: 0.3 });
    for (let i = 0; i < 9; i++) k.line([[x - 23 + i * 4, TOP + 5.56, z - 2.5], [x - 23 + i * 4, TOP + 5.56, z + 10.5]], 'lo');
    for (let i = 0; i < 3; i++) {
      const px = x - 18 + i * 12;
      k.box(4, 26, 4, { p: [px, TOP + 5, z - 12], rr: 0.8, color: MAT.steel, tone: 0.55 });
      k.box(5, 4, 16, { p: [px, TOP + 27, z - 5], rr: 1, b: 0.3, color: MAT.paper, tone: 0.6 });
    }
    k.box(14, 10, 12, { p: [x + 19, TOP + 5, z + 4], rr: 1.4, b: 0.4, color: MAT.paper, tone: 0.55 });
    k.finish(g);
    const pins = [], units = [];
    for (let i = 0; i < 3; i++) {
      const px = x - 18 + i * 12;
      pins.push(mesh(cylGeo(0.7, 16, 0.2, 10), solid(MAT.brass), g, [px, TOP + 14, z + 1.6], [0, 0, 0], { tone: 0.8 }));
      units.push(lampMesh(g, [px, TOP + 31.6, z + 1], 1.4, FLUID.ok));
    }
    const agg = lampMesh(g, [x + 19, TOP + 16.4, z + 4], 2, FLUID.ok);
    const todoLamp = lampMesh(g, [x + 15, TOP + 10, z + 10.4], 1, MAT.amberlamp);
    const lazyLamp = lampMesh(g, [x + 23, TOP + 10, z + 10.4], 1, FLUID.err);
    return { pins, units, agg, todoLamp, lazyLamp, uk: [0, 0, 0], aggK: 0, todoK: 0, lazyK: 0, probe: [0, 0, 0] };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.units.forEach((m, i) => { R.uk[i] = Math.max(0, R.uk[i] - dt * 0.15); setLamp(m, 0.05 + R.uk[i]); R.probe[i] = Math.max(0, R.probe[i] - dt * 0.7); R.pins[i].position.y = TOP + 14 - Math.sin(Math.min(1, R.probe[i]) * Math.PI) * 8; });
    R.aggK = Math.max(0, R.aggK - dt * 0.15); setLamp(R.agg, 0.05 + R.aggK);
    R.todoK = Math.max(0, R.todoK - dt * 0.3); setLamp(R.todoLamp, 0.05 + R.todoK * (0.6 + 0.4 * Math.sin(t * 9)));
    R.lazyK = Math.max(0, R.lazyK - dt * 0.3); setLamp(R.lazyLamp, 0.05 + R.lazyK * (0.6 + 0.4 * Math.sin(t * 9)));
  },
});

// ── 30 · the background coprocessor: backgrounded tasks spin its fan; monitors draw on its scope ──
const DAEMON = { x: 182, z: 54 };
station('daemon', {
  name: '后台协处理器', role: '后台任务与监视 · task_backgrounded / monitor_event', color: FLUID.tool,
  desc: '放到后台跑的命令（task_backgrounded）交给这颗协处理器：风扇转起来，计时器在走；task_completed 时停转、亮灯。挂了 monitor 的任务，每行输出都在示波屏上走一笔（monitor_event）。',
  work: [DAEMON.x, TOP + 36, DAEMON.z - 24], pin: [DAEMON.x - 10, TOP + 30, DAEMON.z],
  build(S, g) {
    const { x, z } = DAEMON, k = new Kit({ tone: 0.55 });
    k.box(34, 4, 30, { p: [x, TOP, z], rr: 1.6, b: 0.5, color: MAT.pale, tone: 0.45 });
    k.box(24, 6, 24, { p: [x - 3, TOP + 4, z + 1], rr: 1.2, b: 0.4, color: MAT.graphite, tone: 0.5 });
    k.box(26, 1.6, 26, { p: [x - 3, TOP + 10, z + 1], rr: 1.4, b: 0.3, color: MAT.alu, tone: 0.55 });
    k.ring(9.6, 10.6, 1.4, { p: [x - 3, TOP + 11.6, z + 1], color: MAT.steel, seg: 36 });
    const port = socket(k, x + 12, z - 9, TOP + 4);
    const chart = standScreen(g, k, x + 4, z + 20, 26, 12, (c, w, h, s, P) => {
      c.fillStyle = P.screenBg; c.fillRect(0, 0, w, h);
      c.strokeStyle = P.screenInk; c.globalAlpha = 0.18; c.lineWidth = 1;
      for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo((i / 8) * w, 0); c.lineTo((i / 8) * w, h); c.stroke(); }
      for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, (i / 4) * h); c.lineTo(w, (i / 4) * h); c.stroke(); }
      c.globalAlpha = 0.95; c.strokeStyle = s.hex || '#e5650f'; c.lineWidth = Math.max(1.4, w * 0.008); c.beginPath();
      (s.pts || []).slice(-30).forEach((v, i, arr) => { const xx = w * (0.04 + (0.92 * i) / Math.max(1, arr.length - 1)), yy = h * (0.9 - 0.75 * v); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }); c.stroke();
      c.globalAlpha = 1; c.fillStyle = P.screenInk; c.font = `500 ${h * 0.09}px ${FONT_MONO}`; c.textBaseline = 'top';
      c.fillText(fitText(c, s.title || 'BG · idle', w * 0.9), w * 0.04, h * 0.05);
      (s.notes || []).slice(-2).forEach((n, i) => { c.globalAlpha = 0.75; c.fillText(fitText(c, n, w * 0.9), w * 0.04, h * (0.17 + i * 0.1)); }); c.globalAlpha = 1;
    }, { y: TOP + 4, tilt: -0.5, px: 16 });
    k.finish(g);
    chart.paint({ pts: [], notes: [] });
    const fan = group(g, [x - 3, TOP + 11.8, z + 1]);
    const kf = new Kit({ tone: 0.8 }); kf.cyl(2.4, 1.2, { color: MAT.graphite, seg: 16 }); for (let i = 0; i < 7; i++) kf.box(7, 0.4, 2.4, { p: [3.6, 0.4, 0], r: [0, (i / 7) * TAU, 0.35], color: MAT.paper, tone: 0.7 }); kf.finish(fan);
    const lamp = lampMesh(g, [x + 13, TOP + 4.8, z + 12], 0.9, FLUID.ok);
    return { chart, port, fan, lamp, spin: 0, spinGoal: 0, timer: 0, running: false, pts: [], notes: [], title: 'BG · idle' };
  },
  update(S, t, dt) {
    const R = S.refs; R.spin = damp(R.spin, R.spinGoal, 1.5, dt); R.fan.rotation.y += dt * (0.2 + R.spin * 20);
    if (R.running) { R.timer += dt; if (Math.floor(R.timer * 2) !== R.lastPaint) { R.lastPaint = Math.floor(R.timer * 2); const s = Math.floor(R.timer); R.chart.paint({ pts: R.pts, notes: R.notes, title: `${R.title} · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, hex: R.hex }); } }
  },
});

// ── 31 · the sub-core socket: subagents are small cores that leave the board and come back ──
const SUB = { x: 236, z: 52 };
station('sub', {
  name: '子核插座', role: '子 agent · subagent_*', color: FLUID.cache,
  desc: '插座里坐着一颗小核心：派出子 agent（subagent_spawned）时它升起来，飞出机箱；进度（subagent_progress）由插座的灯报告；子 agent 返回（subagent_finished）时它飞回来落座，搬运车把它带回的结果插进上下文卡匣。',
  work: [SUB.x, TOP + 36, SUB.z - 24], pin: [SUB.x - 12, TOP + 28, SUB.z],
  build(S, g) {
    const { x, z } = SUB, k = new Kit({ tone: 0.55 });
    k.box(30, 3, 30, { p: [x, TOP, z], rr: 1.6, b: 0.5, color: MAT.pale, tone: 0.45 });
    k.box(22, 3, 22, { p: [x, TOP + 3, z], rr: 1, b: 0.3, color: MAT.paper, tone: 0.55 });
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i < 2 || i > 5 || j < 2 || j > 5)) k.line(ringPts(x - 7 + i * 2, TOP + 6.06, z - 7 + j * 2, 0.35, 6), 'lo');
    k.box(1.6, 1.6, 20, { p: [x + 12.4, TOP + 4, z], color: MAT.steel });
    k.box(9, 2.4, 14, { p: [x, TOP, z - 23], rr: 1, b: 0.3, color: MAT.pale, tone: 0.5 });
    k.finish(g);
    const lever = group(g, [x + 12.4, TOP + 4.8, z + 10]);
    const kl = new Kit({ tone: 0.9 }); kl.box(1.2, 1.2, 12, { p: [0, 0, -6], color: MAT.steel }); kl.finish(lever);
    // the little core: substrate, three layers, a glass cap
    const pod = group(g, [x, TOP + 6, z]);
    const kp = new Kit({ tone: 0.75 });
    kp.box(16, 1.6, 16, { rr: 1, color: MAT.mask, tone: 0.5 });
    for (let i = 0; i < 3; i++) kp.box(9, 0.8, 9, { p: [0, 2.8 + i * 2.6, 0], color: MAT.ceramic, tone: 0.6 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kp.cyl(0.5, 8, { p: [sx * 5, 1.6, sz * 5], color: MAT.brass, seg: 8 });
    kp.add(slabGeo(12, 9, 12, 1.2, 0), { p: [0, 1.6, 0], glass: true });
    kp.box(13, 1.2, 13, { p: [0, 10.6, 0], rr: 1, b: 0.3, color: MAT.paper });
    kp.finish(pod);
    const podLamp = lampMesh(pod, [0, 12.6, 0], 1, FLUID.cache);
    const lamps = [0, 1, 2, 3].map(i => lampMesh(g, [x - 10.5 + i * 7, TOP + 3.6, z + 15.2], 0.7, FLUID.cache));
    return { pod, podLamp, lever, lamps, home: V(x, TOP + 6, z), pickup: V(x, TOP + 2.4, z - 23), flight: null, ping: 0, away: false, prog: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.lever.rotation.x = damp(R.lever.rotation.x, R.away || R.flight ? 1.4 : 0, 5, dt);
    if (R.flight) {
      const F = R.flight; F.t = Math.min(1, F.t + dt / F.dur);
      const u = ease(F.t), a = F.a, b = F.b, c = F.c;
      R.pod.position.set((1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y, (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * c.z + u * u * b.z);
      R.pod.rotation.y += dt * 3 * F.dir;
      if (F.t >= 1) { R.flight = null; F.done?.(); }
    }
    R.ping = Math.max(0, R.ping - dt);
    setLamp(R.podLamp, R.away || R.flight ? 0.5 + 0.4 * Math.sin(t * 8) : 0.08);
    R.lamps.forEach((m, i) => setLamp(m, R.away ? (i < Math.ceil(R.prog * 4) ? 0.8 : 0.05) * (R.ping > 0 ? 0.6 + 0.4 * Math.sin(t * 20) : 1) : 0.05));
  },
});

// ── 32 · the chiplet array: a workflow runs one subagent per chiplet ──
const FLOW = { x: 150, z: 130 };
station('flow', {
  name: '芯粒阵列', role: '工作流 · workflow_updated', color: FLUID.reason,
  desc: '工作流（workflow_updated）里的每个子 agent 占一颗芯粒：运行中紫灯脉动，完成转绿，失败转红；前沿五盏灯是工作流的阶段，屏幕上是当前阶段和用掉的 agent 预算。',
  work: [FLOW.x, TOP + 40, 30], pin: [FLOW.x - 30, TOP + 20, FLOW.z],
  build(S, g) {
    const { x, z } = FLOW, k = new Kit({ tone: 0.55 });
    k.box(70, 4, 34, { p: [x, TOP, z], rr: 1.8, b: 0.6, color: MAT.pale, tone: 0.45 });
    k.box(62, 1.4, 26, { p: [x, TOP + 4, z - 2], rr: 1, color: MAT.mask, tone: 0.45 });
    for (let i = 0; i < 8; i++) { const cx = x - 22.5 + (i % 4) * 15, cz = z - 8 + Math.floor(i / 4) * 12; k.box(11, 2.4, 9, { p: [cx, TOP + 5.4, cz], rr: 0.6, b: 0.3, color: MAT.graphite, tone: 0.55 }); k.box(7, 0.6, 5, { p: [cx, TOP + 7.8, cz], color: MAT.ceramic, tone: 0.6 }); }
    for (let i = 0; i < 5; i++) k.cyl(1.5, 0.6, { p: [x - 20 + i * 10, TOP + 4, z + 14], color: MAT.steel, seg: 14 });
    const scr = standScreen(g, k, x + 46, z + 2, 18, 8, lcdDraw, { px: 22 });
    k.finish(g);
    scr.paint({ title: 'WORKFLOW · idle', lines: [], rows: 2 });
    const chips = [];
    for (let i = 0; i < 8; i++) chips.push(lampMesh(g, [x - 22.5 + (i % 4) * 15, TOP + 9, z - 8 + Math.floor(i / 4) * 12], 1.3, FLUID.reason));
    const phases = [0, 1, 2, 3, 4].map(i => lampMesh(g, [x - 20 + i * 10, TOP + 5.2, z + 14], 1, FLUID.ok));
    return { scr, chips, phases, agents: [] };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.chips.forEach((m, i) => {
      const a = R.agents[i];
      if (!a) setLamp(m, 0.04, FLUID.reason);
      else if (a.state === 'running') setLamp(m, 0.45 + 0.45 * Math.sin(t * 5 + i), FLUID.reason);
      else setLamp(m, 0.75, a.state === 'failed' ? FLUID.err : a.state === 'done' || a.state === 'completed' ? FLUID.ok : FLUID.cache);
    });
  },
});

// ── 33 · the archive: every finished turn is a sealed cartridge on the tiers at the end of the lane ──
const ARCH = { x0: 274, z: 0, tiers: 5, per: 12 };
const ARCH_N = ARCH.tiers * ARCH.per;
const archSlot = i => V(ARCH.x0 + 3 + (Math.floor(i / ARCH.per) % ARCH.tiers) * 5.2, TOP + 4 + (Math.floor(i / ARCH.per) % ARCH.tiers) * 3, ARCH.z - 31.9 + (i % ARCH.per) * 5.8);
station('archive', {
  name: '归档架', role: '回合完成 · turn_completed / turn_ended', color: FLUID.text,
  desc: '通道尽头的阶梯架：每个回合完成（turn_completed），搬运车把这一轮封成一盒卡匣放上去。本机录制里已经跑过的回合一开始就在架上；只有真实回放的新回合计入长期累计，演示回合用白盖标记。',
  work: [ARCH.x0 + 10, TOP + 40, 0], pin: [ARCH.x0 + 14, TOP + 38, -34],
  build(S, g) {
    const { x0, z } = ARCH, k = new Kit({ tone: 0.55 });
    for (let i = 0; i < ARCH.tiers; i++) k.box(5.2, 4 + i * 3, 74, { p: [x0 + 3 + i * 5.2, TOP, z], b: 0.3, color: i % 2 ? MAT.pale : MAT.paper, tone: 0.5 });
    for (const sz of [-1, 1]) k.box(27, 22, 1.6, { p: [x0 + 13.4, TOP, z + sz * 37.6], rr: 0.6, color: MAT.steel, tone: 0.5 });
    k.finish(g);
    const bodies = new THREE.InstancedMesh(slabGeo(CART.d, CART.h, CART.w, 0.4, 0.3), solid(MAT.pale), ARCH_N);
    const caps = new THREE.InstancedMesh(slabGeo(CART.d + 0.3, CART.cap, CART.w + 0.3, 0.5, 0.4), fluidMat(0xffffff), ARCH_N);
    for (const I of [bodies, caps]) { I.castShadow = true; I.receiveShadow = true; I.userData.tone = 0.7; I.frustumCulled = false; g.add(I); }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < ARCH_N; i++) { bodies.setMatrixAt(i, zero); caps.setMatrixAt(i, zero); caps.setColorAt(i, col.set(0xffffff)); }
    const scr = makeScreen(22, 4, 22, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `600 ${h * 0.56}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(`ARCHIVE · ${s.n ?? 0}`, w * 0.04, h * 0.55); });
    scr.mesh.position.set(x0 + 13.4, TOP + 13, z + 38.45); g.add(scr.mesh); scr.paint({ n: 0 });
    const put = (i, hex, capHex) => {
      i %= ARCH_N; const p = archSlot(i);
      m4.makeTranslation(p.x, p.y, p.z); bodies.setMatrixAt(i, m4); m4.makeTranslation(p.x, p.y + CART.h, p.z); caps.setMatrixAt(i, m4); caps.setColorAt(i, col.set(capHex ?? hex));
      bodies.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; caps.instanceColor.needsUpdate = true;
    };
    return { bodies, caps, scr, put };
  },
});
