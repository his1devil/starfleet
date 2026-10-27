// ═════════════════════════ the gate and the tool side ═════════════════════════
// Everything right of the gate runs on the outside world, so the courier carries every job through
// the permission portal. Each tool module has a socket the job cartridge stands in while it runs.

// ── 8 · the permission gate: a portal across the lane ──
station('gate', {
  name: '权限闸门', role: '权限请求 · request_permission', color: MAT.hazard,
  desc: '横跨通道的门架：右边的工具都会碰到外部世界，所以每张工单都要过这道闸。规则自动放行时绿灯一闪、光幕扫过；需要人决定时（session/request_permission）栏杆落下、黄灯闪烁，等你批准；拒绝则红灯，工单被扔进左边的废料盒。YOLO 打开后屏幕显示 BYPASS，栏杆一直抬着。',
  work: [GATE.x - 34, TOP + 46, 0], pin: [GATE.x, TOP + GATE.h + 16, -GATE.post],
  build(S, g) {
    const { x, post, h } = GATE, k = new Kit({ tone: 0.6 });
    for (const sz of [-1, 1]) {
      k.box(14, 2, 12, { p: [x, TOP, sz * post], rr: 1.2, b: 0.4, color: MAT.steel, tone: 0.45 });
      k.box(6, h, 6, { p: [x, TOP + 2, sz * post], rr: 0.8, b: 0.5, color: MAT.paper, tone: 0.6 });
      for (let y = TOP + 10; y < TOP + h - 6; y += 9) k.line([[x - 3.05, y, sz * post - 2], [x - 3.05, y + 4, sz * post + 2]], 'lo');
      k.box(1, 12, 4, { p: [x - 3.4, TOP + 20, sz * post], color: MAT.hazard, paint: 1, tone: 0.6 });
    }
    k.box(9, 9, post * 2 + 10, { p: [x, TOP + h + 2, 0], rr: 1.4, b: 0.6, color: MAT.paper, tone: 0.65 });
    k.box(1.4, 3, post * 2 - 6, { p: [x - 4.9, TOP + h + 2.6, 0], color: MAT.hazard, paint: 1, tone: 0.6 });
    for (let z = -post + 4; z <= post - 4; z += 3) k.line([[x - 5.65, TOP + h + 2.7, z], [x - 5.65, TOP + h + 5.5, z + 1.6]], 'hi');
    // the light-curtain emitters down the inner faces of the posts
    for (const sz of [-1, 1]) for (let y = TOP + 8; y < TOP + h; y += 4) k.box(1.6, 1, 0.6, { p: [x, y, sz * (post - 3.2)], color: MAT.graphite, tone: 0.5 });
    // the key switch on the near post
    k.box(1.4, 9, 6, { p: [x - 3.6, TOP + 36, post], rr: 0.6, color: MAT.pale, tone: 0.6 });
    k.cyl(1.4, 1, { p: [x - 4.4, TOP + 41, post], r: [0, 0, Math.PI / 2], color: MAT.brass, seg: 14 });
    k.finish(g);
    const scr = makeScreen(18, 5.4, 26, (c, w, hh, s, P) => { c.fillStyle = P.screenInk; c.font = `600 ${hh * 0.52}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText(s.t || 'LOCKED', w / 2, hh * 0.54); c.textAlign = 'left'; });
    scr.mesh.position.set(x - 4.55, TOP + h + 6.6, -8); scr.mesh.rotation.y = -Math.PI / 2; g.add(scr.mesh); scr.paint({ t: 'LOCKED' });
    const red = lampMesh(g, [x - 4.8, TOP + h + 6.6, 7], 1.3, FLUID.err), green = lampMesh(g, [x - 4.8, TOP + h + 6.6, 12], 1.3, FLUID.ok);
    // the barrier arm, hinged on the near post, and the light curtain between the posts
    const arm = group(g, [x - 5, TOP + 26, post - 3.4]);
    const ka = new Kit({ tone: 0.85 });
    for (let i = 0; i < 8; i++) ka.box(1.6, 2.4, 5.6, { p: [0, -1.2, -2.8 - i * 5.6], color: i % 2 ? MAT.hazardK : MAT.hazard, paint: i % 2 ? 0 : 1, tone: 0.85 });
    ka.cyl(2.2, 3, { p: [0.4, 0, 0], r: [0, 0, Math.PI / 2], color: MAT.graphite, seg: 16 });
    ka.finish(arm);
    const curtainMat = new THREE.MeshBasicMaterial({ color: FLUID.ok, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(post * 2 - 6, h - 8), curtainMat);
    curtain.position.set(x, TOP + 6 + (h - 8) / 2, 0); curtain.rotation.y = Math.PI / 2; curtain.layers.set(1); curtain.renderOrder = 4; g.add(curtain);
    const key = group(g, [x - 5, TOP + 41, post]);
    const kk = new Kit({ tone: 0.9 }); kk.box(0.8, 3, 0.8, { p: [-0.4, -1.5, 0], color: MAT.brass }); kk.cyl(1.2, 0.6, { p: [-0.7, 1.5, 0], r: [0, 0, Math.PI / 2], color: MAT.brass, seg: 14 }); kk.finish(key);
    const halo = glow(g, MAT.amberlamp, 50, [x - 6, TOP + h + 6, 8]);
    return { scr, red, green, arm, curtain, curtainMat, key, halo, mode: 'idle', until: 0, armAng: 0, scan: 0, keyAng: 0 };
  },
  update(S, t, dt) {
    const R = S.refs, wait = R.mode === 'wait', blink = Math.sin(t * 7) > 0;
    // the barrier stays up unless a decision is pending or the job was refused
    const down = (wait || R.mode === 'deny') && !S_.yolo;
    R.armAng = damp(R.armAng, down ? 0 : 1.45, 5, dt); R.arm.rotation.x = R.armAng;
    R.keyAng = damp(R.keyAng, R.mode === 'allow' ? 1.3 : 0, 6, dt); R.key.rotation.x = R.keyAng;
    setLamp(R.red, R.mode === 'deny' ? 1 : wait && blink ? 0.9 : 0.1, wait ? MAT.amberlamp : FLUID.err);
    setLamp(R.green, R.mode === 'allow' || S_.yolo ? 0.9 : 0.1);
    R.scan = Math.max(0, R.scan - dt * 1.6);
    R.curtainMat.opacity = R.scan > 0 ? 0.22 * Math.sin(Math.min(1, R.scan) * Math.PI) : wait ? 0.06 + 0.04 * Math.sin(t * 7) : 0;
    R.curtainMat.color.set(wait ? MAT.amberlamp : R.mode === 'deny' ? FLUID.err : FLUID.ok);
    R.curtain.visible = R.curtainMat.opacity > 0.003;
    R.halo.userData.set(wait ? (blink ? 0.7 : 0.25) : R.mode === 'allow' ? 0.35 : R.mode === 'deny' ? 0.5 : 0, wait ? MAT.amberlamp : R.mode === 'allow' ? FLUID.ok : FLUID.err);
    if (R.until && sceneClock > R.until && !wait) { R.mode = 'idle'; R.until = 0; R.scr.paint({ t: S_.yolo ? 'BYPASS' : S_.mode === 'plan' ? 'PLAN' : 'LOCKED' }); }
  },
});

// ── 9 · the mode console beside the gate: plan mode and the YOLO key ──
const MODE = { x: -32, z: 44 };
station('mode', {
  name: '模式钥匙', role: '计划模式 / YOLO · current_mode_update / yolo_toggled', color: FLUID.text,
  desc: '旋钮在"常规 / 计划"两档之间：计划模式（current_mode_update=plan）下核心只低功率运行、闸门显示 PLAN，退出计划要你批准方案（exit_plan_mode → plan_approval）。旁边带红盖的钥匙是 YOLO：打开后闸门被旁路，权限请求自动放行。',
  work: [MODE.x, TOP + 36, MODE.z - 20], pin: [MODE.x, TOP + 26, MODE.z],
  build(S, g) {
    const { x, z } = MODE, k = new Kit({ tone: 0.6 });
    k.box(22, 9, 14, { p: [x, TOP, z], rr: 1.6, b: 0.6, color: MAT.paper, tone: 0.55 });
    k.box(20, 1, 12, { p: [x, TOP + 9, z], rr: 1.2, color: MAT.pale, tone: 0.6 });
    k.cyl(4.6, 0.6, { p: [x - 4, TOP + 10, z], color: MAT.steel, seg: 28 });
    for (const a of [-0.7, 0.7]) k.line([[x - 4 + Math.sin(a) * 5.4, TOP + 10.7, z - Math.cos(a) * 5.4], [x - 4 + Math.sin(a) * 6.5, TOP + 10.7, z - Math.cos(a) * 6.5]], 'hi');
    k.box(7, 1.4, 7, { p: [x + 5.5, TOP + 10, z], rr: 0.6, color: MAT.hazard, paint: 1, tone: 0.6 });
    k.finish(g);
    silk('DEF', x - 9.6, z - 5.8, { size: 1.6, y: TOP + 10.08 }); silk('PLAN', x + 1.4, z - 5.8, { size: 1.6, y: TOP + 10.08 }); silk('YOLO', x + 5.5, z + 5, { size: 1.6, y: TOP + 10.08 });
    const knob = group(g, [x - 4, TOP + 10.6, z]);
    const kn = new Kit({ tone: 0.9 }); kn.cyl(2.8, 2, { color: MAT.graphite, seg: 20, b: 0.4 }); kn.box(1, 1, 5.4, { p: [0, 2, -1.4], color: MAT.paper }); kn.finish(knob);
    const cover = group(g, [x + 5.5, TOP + 11.4, z - 3.5]);
    const kc = new Kit({ tone: 0.9 }); kc.box(6.4, 0.8, 6.6, { p: [0, 0, 3.3], rr: 0.5, color: MAT.redlamp, paint: 1 }); kc.finish(cover);
    const planLamp = lampMesh(g, [x - 9, TOP + 6, z + 7.2], 0.9, FLUID.text);
    const yoloLamp = lampMesh(g, [x + 9, TOP + 6, z + 7.2], 0.9, FLUID.err);
    return { knob, cover, planLamp, yoloLamp, mode: 'default', yolo: false, ang: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.ang = damp(R.ang, R.mode === 'plan' ? -0.7 : 0.7, 6, dt); R.knob.rotation.y = R.ang;
    R.cover.rotation.x = damp(R.cover.rotation.x, R.yolo ? -1.9 : 0, 6, dt);
    setLamp(R.planLamp, R.mode === 'plan' ? 0.85 : 0.05); setLamp(R.yoloLamp, R.yolo ? 0.6 + 0.4 * Math.sin(t * 6) : 0.05);
  },
});

// ── the reject bin: refused or failed jobs end here ──
const FAULT = { x: -20, z: -46 };
station('fault', {
  name: '废料盒', role: '失败与拒绝 · tool failed / denied', color: FLUID.err,
  desc: '被拒绝的工单、跑失败的工具结果，都由搬运车扔进这只红边的废料盒。',
  work: [FAULT.x, TOP + 30, FAULT.z], pin: [FAULT.x, TOP + 22, FAULT.z - 6],
  build(S, g) {
    const { x, z } = FAULT, k = new Kit({ tone: 0.6 });
    k.box(16, 1.2, 16, { p: [x, TOP, z], rr: 1, color: MAT.pale, tone: 0.5 });
    for (const [w, d, px, pz] of [[16, 1.2, 0, -7.4], [16, 1.2, 0, 7.4], [1.2, 14, -7.4, 0], [1.2, 14, 7.4, 0]]) {
      k.box(w, 11, d, { p: [x + px, TOP + 1.2, z + pz], color: MAT.pale, tone: 0.55 });
      k.box(w + 0.4, 1.6, d + 0.4, { p: [x + px, TOP + 11.2, z + pz], color: MAT.redlamp, paint: 1, tone: 0.6 });
    }
    for (let i = 0; i < 4; i++) k.line([[x - 7 + i * 4, TOP + 2, z + 8.05], [x - 4 + i * 4, TOP + 7, z + 8.05]], 'hi');
    k.finish(g);
    const lid = group(g, [x - 6.2, TOP + 12.4, z]);
    const kl = new Kit({ tone: 0.85 }); kl.box(12.4, 0.8, 12.4, { p: [6.2, 0, 0], rr: 0.6, color: MAT.paper }); kl.finish(lid);
    return { lid, openGoal: 0, n: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.lid.rotation.z = damp(R.lid.rotation.z, R.openGoal ? 1.6 : 0, 7, dt); },
});

// ── 10 · the reader: read_file (and images) on a flatbed ──
const READ = { x: 44, z: -50 };
station('read', {
  name: '读取器', role: '读文件 · read_file / 图片', color: FLUID.text,
  desc: '一台平板扫描器：读文件时（read_file）文档放上玻璃板，光条从一头扫到另一头，屏幕上是路径和读到的前几行。图片压缩（image_compressed）和丢弃也在这里显示。',
  work: [READ.x, TOP + 34, READ.z + 10], pin: [READ.x - 8, TOP + 22, READ.z - 6],
  build(S, g) {
    const { x, z } = READ, k = new Kit({ tone: 0.55 });
    k.box(38, 6, 30, { p: [x - 3, TOP, z], rr: 2, b: 0.6, color: MAT.paper, tone: 0.5 });
    k.box(32, 0.6, 22, { p: [x - 5, TOP + 6, z - 1], rr: 0.6, color: MAT.graphite, tone: 0.45 });
    k.add(slabGeo(31, 0.5, 21, 0.4, 0), { p: [x - 5, TOP + 6.6, z - 1], glass: true });
    const port = socket(k, x + 19.5, z + 5);
    const scr = standScreen(g, k, x - 5, z + 21, 24, 8, lcdDraw);
    k.finish(g);
    scr.paint({ title: 'READ · idle', lines: [], rows: 3 });
    const bar = mesh(slabGeo(2, 1, 20, 0, 0), solid(0xffffff, { glow: 0, glowColor: FLUID.text }), g, [x - 20, TOP + 6.1, z - 1], [0, 0, 0], { tone: 0.6, cast: false });
    const sheet = mesh(slabGeo(18, 0.2, 13, 0, 0), solid(MAT.paper), g, [x - 5, TOP + 7.1, z - 1], [0, 0.08, 0], { tone: 0.4, cast: false });
    sheet.visible = false;
    return { scr, port, bar, sheet, onGoal: 0, on: 0, ph: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.on = damp(R.on, R.onGoal, 6, dt);
    if (R.on > 0.05) R.ph += dt * 0.8;
    R.bar.position.x = READ.x - 20 + ((Math.sin(R.ph * Math.PI) + 1) / 2) * 30;
    setLamp(R.bar, R.on * 0.9); R.sheet.visible = R.on > 0.2;
  },
});

// ── 11 · the index drum: list_dir flips through a card drum ──
const LIST = { x: 98, z: -50 };
station('list', {
  name: '目录索引', role: '列目录 · list_dir', color: FLUID.user,
  desc: '一只卡片转筒：列目录（list_dir）时转筒翻动，屏幕上列出路径下的条目，文件和目录颜色不同。',
  work: [LIST.x, TOP + 34, LIST.z + 10], pin: [LIST.x - 6, TOP + 30, LIST.z - 6],
  build(S, g) {
    const { x, z } = LIST, k = new Kit({ tone: 0.55 }), ay = TOP + 15;
    k.box(30, 4, 24, { p: [x - 3, TOP, z - 2], rr: 1.6, b: 0.5, color: MAT.paper, tone: 0.5 });
    for (const sx of [-1, 1]) k.box(2, 13, 8, { p: [x - 3 + sx * 13, TOP + 4, z - 4], rr: 0.6, color: MAT.steel, tone: 0.5 });
    k.cyl(1, 28, { p: [x - 17, ay, z - 4], r: [0, 0, -Math.PI / 2], color: MAT.steel, seg: 12 });
    k.cyl(2.4, 2, { p: [x + 12, ay, z - 4], r: [0, 0, -Math.PI / 2], color: MAT.graphite, seg: 16 });
    const port = socket(k, x + 15, z + 4);
    const scr = standScreen(g, k, x - 3, z + 17, 22, 8, lcdDraw);
    k.finish(g);
    scr.paint({ title: 'LIST · idle', lines: [], rows: 3 });
    const drum = group(g, [x - 3, ay, z - 4]);
    const kd = new Kit({ tone: 0.75 });
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; kd.box(22, 0.3, 7.4, { p: [0, Math.cos(a) * 4.4, Math.sin(a) * 4.4], r: [a, 0, 0], color: i % 7 ? MAT.paper : MAT.cork, tone: 0.6 }); }
    kd.cyl(2.2, 23, { p: [-11.5, 0, 0], r: [0, 0, -Math.PI / 2], color: MAT.alu, seg: 16 });
    kd.finish(drum);
    return { scr, port, drum, spin: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.spin = Math.max(0, R.spin - dt); R.drum.rotation.x += dt * (R.spin > 0 ? 9 : 0.05); },
});

// ── 12 · the comb scanner: grep / glob sweep a bed of file strips ──
const SEARCH = { x: 154, z: -50 };
station('search', {
  name: '检索扫描', role: '搜索 · grep / glob', color: FLUID.tool,
  desc: '一床平行的文件条，横梁带着激光扫过去：搜索（grep、glob）每命中一处，文件条上就亮一个刻点，屏幕上是模式和命中数。',
  work: [SEARCH.x, TOP + 34, SEARCH.z + 10], pin: [SEARCH.x - 10, TOP + 24, SEARCH.z - 8],
  build(S, g) {
    const { x, z } = SEARCH, k = new Kit({ tone: 0.55 });
    k.box(42, 4, 30, { p: [x - 2, TOP, z - 2], rr: 1.6, b: 0.5, color: MAT.paper, tone: 0.5 });
    for (let i = 0; i < 12; i++) k.box(30, 0.6, 1.4, { p: [x - 4, TOP + 4, z - 14 + i * 2.2], color: i % 3 ? MAT.pale : MAT.cork, tone: 0.45 });
    for (const sz of [-1, 1]) k.box(36, 3, 1.6, { p: [x - 4, TOP + 4, z - 2 + sz * 14.6], color: MAT.steel, tone: 0.55 });
    const port = socket(k, x + 21, z + 4);
    const scr = standScreen(g, k, x - 4, z + 19, 24, 8, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.textBaseline = 'top'; c.font = `600 ${h * 0.2}px ${FONT_MONO}`; c.fillText(fitText(c, s.title || 'GREP · idle', w * 0.94), w * 0.03, h * 0.06);
      const n = (s.lines || []).length; c.globalAlpha = 0.3; c.fillRect(w * 0.03, h * 0.88, w * 0.94, 1); c.globalAlpha = 1;
      (s.lines || []).forEach(([u, hex]) => { c.fillStyle = hex; c.fillRect(w * (0.04 + u * 0.92), h * 0.42, Math.max(2, w * 0.008), h * 0.44); });
      if (!n) { c.globalAlpha = 0.5; c.fillStyle = P.screenInk; c.font = `400 ${h * 0.16}px ${FONT_MONO}`; c.fillText('无命中', w * 0.03, h * 0.5); c.globalAlpha = 1; }
    });
    k.finish(g);
    scr.paint({ title: 'GREP · idle', lines: [] });
    const beam = group(g, [x - 18, TOP + 7, z - 2]);
    const kb = new Kit({ tone: 0.85 }); kb.box(3, 3, 32, { p: [0, 0, 0], rr: 0.6, b: 0.3, color: MAT.paper }); kb.box(2, 1.6, 3, { p: [0, -1.4, -4], color: MAT.graphite }); kb.finish(beam);
    const laser = mesh(slabGeo(0.5, 0.3, 27, 0, 0), solid(0xffffff, { glow: 0, glowColor: FLUID.err }), beam, [0, -2.7, 0], [0, 0, 0], { tone: 0.2, cast: false });
    const hits = new THREE.InstancedMesh(slabGeo(0.8, 0.5, 1.6, 0, 0), fluidMat(0xffffff), 40);
    hits.count = 0; hits.castShadow = false; hits.userData.tone = 0.4; g.add(hits);
    return { scr, port, beam, laser, hits, onGoal: 0, on: 0, ph: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.on = damp(R.on, R.onGoal, 6, dt);
    if (R.on > 0.05) R.ph += dt * 1.1;
    R.beam.position.x = SEARCH.x - 18 + ((1 - Math.cos(R.ph * Math.PI)) / 2) * 28;
    setLamp(R.laser, R.on * 0.95);
  },
});
function searchHits(n, seed) {
  const R = ST.search.refs, r = mulberry32(seed), m = new THREE.Matrix4(), c = new THREE.Color(), hues = [FLUID.err, FLUID.tool, FLUID.user, FLUID.ok, FLUID.cache, FLUID.text, FLUID.reason];
  const k = Math.min(40, n);
  for (let i = 0; i < k; i++) { m.makeTranslation(SEARCH.x - 18 + r() * 28, TOP + 4.6, SEARCH.z - 14 + Math.floor(r() * 12) * 2.2); R.hits.setMatrixAt(i, m); R.hits.setColorAt(i, c.set(hues[Math.floor(r() * 7)])); }
  R.hits.count = k; R.hits.instanceMatrix.needsUpdate = true; if (R.hits.instanceColor) R.hits.instanceColor.needsUpdate = true;
}

// ── 13 · the diff plotter: write / edit draw their changes, + green, − red ──
const WRITE = { x: 212, z: -50 };
station('write', {
  name: '改动绘图仪', role: '写文件 / 编辑 · write / search_replace / diff', color: FLUID.ok,
  desc: '一台笔式绘图仪：写文件和编辑（write、search_replace、apply_patch）时，笔头把改动一行行画在纸上：绿线是新增，红线是删除。屏幕上是文件路径和 +/− 行数；改动待审（diff_review）时纸面亮一下。',
  work: [WRITE.x, TOP + 34, WRITE.z + 10], pin: [WRITE.x - 10, TOP + 24, WRITE.z - 8],
  build(S, g) {
    const { x, z } = WRITE, k = new Kit({ tone: 0.55 });
    k.box(40, 3, 32, { p: [x - 2, TOP, z - 2], rr: 1.6, b: 0.5, color: MAT.paper, tone: 0.5 });
    k.box(30, 0.3, 24, { p: [x - 4, TOP + 3, z - 2], color: MAT.enamel, tone: 0.3 });
    for (let i = 0; i <= 12; i++) k.line([[x - 18, TOP + 3.36, z - 13 + i * 1.9], [x + 10, TOP + 3.36, z - 13 + i * 1.9]], 'lo');
    for (const sz of [-1, 1]) k.box(34, 4, 2, { p: [x - 4, TOP + 3, z - 2 + sz * 14.5], rr: 0.4, color: MAT.alu, tone: 0.55 });
    const port = socket(k, x + 20, z + 4);
    const scr = standScreen(g, k, x - 4, z + 20, 24, 8, lcdDraw);
    k.finish(g);
    scr.paint({ title: 'PLOT · idle', lines: [], rows: 3 });
    const beam = group(g, [x - 16, TOP + 7, z - 2]);
    const kb = new Kit({ tone: 0.85 }); kb.box(3.2, 2.6, 31, { p: [0, 0, 0], rr: 0.6, b: 0.3, color: MAT.paper }); kb.finish(beam);
    const pen = group(beam, [0, 0, 0]);
    const kp = new Kit({ tone: 0.9 }); kp.box(4.4, 5, 4.4, { p: [0, -1.2, 0], rr: 0.8, b: 0.3, color: MAT.graphite }); kp.cyl(0.7, 3, { p: [0, -4.2, 0], color: MAT.steel, seg: 10 }); kp.finish(pen);
    const lines = new THREE.InstancedMesh(slabGeo(1, 0.15, 0.9, 0, 0), fluidMat(0xffffff), 72);
    lines.count = 0; lines.castShadow = false; lines.userData.tone = 0.2; g.add(lines);
    return { scr, port, beam, pen, lines, seq: [], row: 0, cur: null, px: x - 16, pz: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    // the pen walks a queue of strokes: each one a row on the sheet
    if (!R.cur && R.seq.length) R.cur = { ...R.seq.shift(), t: 0 };
    if (R.cur) {
      const c = R.cur; c.t += dt * 3.2;
      const u = clamp(c.t, 0, 1), x0 = WRITE.x - 17, x1 = x0 + c.len;
      R.beam.position.x = lerp(x0, x1, u); R.pen.position.z = c.z - (WRITE.z - 2);
      const m = new THREE.Matrix4().makeScale(Math.max(0.1, c.len * u), 1, 1).setPosition(x0 + (c.len * u) / 2, TOP + 3.32, c.z);
      R.lines.setMatrixAt(c.i, m); R.lines.setColorAt(c.i, new THREE.Color(c.hex));
      R.lines.count = Math.max(R.lines.count, c.i + 1); R.lines.instanceMatrix.needsUpdate = true; R.lines.instanceColor.needsUpdate = true;
      if (c.t >= 1) R.cur = null;
    } else R.beam.position.x = damp(R.beam.position.x, WRITE.x + 6, 2, dt);
  },
});
function plotDiff(adds, dels) {
  const R = ST.write.refs, total = Math.min(24, adds + dels), r = Math.random;
  if (R.row + total > 72) { R.row = 0; R.lines.count = 0; }
  for (let i = 0; i < total; i++) {
    const add = i < Math.round((total * adds) / Math.max(1, adds + dels));
    R.seq.push({ i: R.row, z: WRITE.z - 13 + ((R.row % 12) + 0.5) * 1.9, len: 6 + r() * 20, hex: add ? FLUID.ok : FLUID.err });
    R.row++;
  }
}

// ── 14 · the uplink: web_search / web_fetch and the relay ──
const NET = { x: 262, z: -52 }, MAST = { x: 272, z: -122 };
station('net', {
  name: '外网天线', role: '联网 · web_search / web_fetch / relay', color: FLUID.cache,
  desc: '调制解调器连着后面的抛物面天线：联网搜索、抓网页（web_search、web_fetch）时天线转向、屏幕出波形，结果顺着线缆回来；中继同步（relay_sync_status）也在这里显示。',
  work: [NET.x, TOP + 34, NET.z + 10], pin: [MAST.x, TOP + 104, MAST.z],
  build(S, g) {
    const { x, z } = NET, k = new Kit({ tone: 0.55 });
    k.box(26, 9, 18, { p: [x - 2, TOP, z - 4], rr: 1.6, b: 0.5, color: MAT.paper, tone: 0.5 });
    for (let i = 0; i < 6; i++) k.line([[x - 13.05, TOP + 2 + i * 1.1, z - 9], [x - 13.05, TOP + 2 + i * 1.1, z + 1]], 'lo');
    const port = socket(k, x + 15, z + 8);
    const scr = standScreen(g, k, x - 4, z + 14, 18, 7, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.textBaseline = 'top'; c.font = `600 ${h * 0.22}px ${FONT_MONO}`; c.fillText(fitText(c, s.title || 'RX · 待命', w * 0.94), w * 0.03, h * 0.06);
      c.strokeStyle = P.screenInk; c.lineWidth = Math.max(1, h * 0.03); c.beginPath();
      for (let i = 0; i <= 60; i++) { const xx = (i / 60) * w, yy = h * 0.66 + Math.sin(i * 0.7 + (s.ph || 0)) * h * (s.amp ?? 0.08) * (0.6 + 0.4 * Math.sin(i * 0.23)); i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
      c.stroke();
    });
    // the mast and its cable
    k.box(14, 3, 14, { p: [MAST.x, TOP, MAST.z], rr: 1.4, b: 0.5, color: MAT.steel, tone: 0.45 });
    k.cyl(1.6, 82, { p: [MAST.x, TOP + 3, MAST.z], color: MAT.steel, seg: 14, b: 0.3 });
    for (let y = TOP + 12; y < TOP + 80; y += 12) k.box(5, 0.8, 0.8, { p: [MAST.x, y, MAST.z], color: MAT.steel });
    k.tube([[x + 6, TOP + 6, z - 13], [x + 6, TOP + 3, z - 30], [MAST.x - 2, TOP + 3, MAST.z + 12], [MAST.x - 2, TOP + 14, MAST.z + 2]], 0.7, { color: MAT.graphite, bend: 6, radial: 7 });
    k.finish(g);
    scr.paint({ title: 'RX · 待命', amp: 0.08 });
    const yaw = group(g, [MAST.x, TOP + 85, MAST.z]);
    const ky = new Kit({ tone: 0.8 }); ky.cyl(2.6, 4, { color: MAT.graphite, seg: 16 }); ky.finish(yaw);
    const dish = group(yaw, [0, 6, 0], [0, 0, 0]);
    const kd = new Kit({ tone: 0.8 });
    kd.add(latheGeo([[0, 0], [5, 0.6, 1], [9, 2.2, 1], [12, 4.6], [11.4, 4.8], [8.6, 2.6, 1], [4.6, 1.1, 1], [0, 0.5]], 40), { r: [Math.PI / 2 - 0.5, 0, 0], color: MAT.paper });
    for (const a of [0, 2.1, 4.2]) kd.tube([[Math.cos(a) * 11, Math.sin(a) * 11 * 0.88 - 1, 5.2], [0, -2.6, 12.4]], 0.3, { color: MAT.steel, radial: 5 });
    kd.cyl(1.2, 3, { p: [0, -2.6, 12], r: [Math.PI / 2 - 0.5, 0, 0], color: MAT.graphite, seg: 12 });
    kd.finish(dish);
    const beam = glow(g, FLUID.cache, 40, [MAST.x - 6, TOP + 100, MAST.z + 14]);
    return { scr, port, yaw, beam, onGoal: 0, on: 0, title: 'RX · 待命', ph: 0, paintT: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.on = damp(R.on, R.onGoal, 4, dt);
    R.yaw.rotation.y = 0.5 + Math.sin(t * 0.3) * 0.15 + R.on * Math.sin(t * 1.4) * 0.5;
    R.beam.userData.set(R.on * (0.4 + 0.3 * Math.sin(t * 9)), FLUID.cache);
    R.paintT -= dt;
    if (R.on > 0.05 && R.paintT <= 0) { R.paintT = 0.12; R.ph += 0.9; R.scr.paint({ title: R.title, amp: 0.1 + R.on * 0.25, ph: R.ph }); }
  },
});

// ── 15 · the sandbox: run_terminal_command inside a sealed glass container ──
const SHELL = { x: 52, z: 54 };
station('shell', {
  name: '沙箱', role: '执行命令 · run_terminal_command', color: FLUID.tool,
  desc: '一只封闭的玻璃容器，里面是一台小机器：执行命令时工单从气闸口送进去，机器灯闪、风扇转，侧面的终端滚动输出；结束时退出码灯亮绿或红，失败会冒火花。',
  work: [SHELL.x, TOP + 40, SHELL.z - 26], pin: [SHELL.x - 16, TOP + 56, SHELL.z],
  build(S, g) {
    const { x, z } = SHELL, k = new Kit({ tone: 0.55 }), s = 42;
    k.box(s + 8, 3, s + 8, { p: [x, TOP, z], rr: 2, b: 0.6, color: MAT.pale, tone: 0.45 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(2.4, s, 2.4, { p: [x + sx * s / 2, TOP + 3, z + sz * s / 2], b: 0.3, color: MAT.steel, tone: 0.55 });
    k.add(slabGeo(s, s, s, 0.6, 0), { p: [x, TOP + 3, z], glass: true });
    k.add(frameGeo(s + 4, s + 4, 3, 2.4), { p: [x, TOP + 3 + s, z], color: MAT.paper, tone: 0.6 });
    // the little machine inside: three units in a cage
    for (let i = 0; i < 3; i++) { k.box(26, 6, 20, { p: [x + 3, TOP + 5 + i * 7.4, z + 2], rr: 0.8, b: 0.3, color: i === 1 ? MAT.graphite : MAT.paper, tone: 0.55 }); for (let j = 0; j < 8; j++) k.line([[x - 9 + j * 2.4, TOP + 7 + i * 7.4, z + 12.05], [x - 9 + j * 2.4, TOP + 9.6 + i * 7.4, z + 12.05]], 'lo'); }
    // the airlock on the lane side
    k.box(12, 10, 6, { p: [x, TOP + 3, z - s / 2 - 3], rr: 1, b: 0.4, color: MAT.paper, tone: 0.55 });
    const port = socket(k, x, z - s / 2 - 10);
    // the terminal on the left face
    k.box(1.6, 18, 26, { p: [x - s / 2 - 2.6, TOP + 14, z], rr: 0.8, b: 0.3, color: MAT.paper, tone: 0.6 });
    k.box(1.2, 11, 3, { p: [x - s / 2 - 2.6, TOP + 3, z], color: MAT.steel });
    k.finish(g);
    const term = makeScreen(23, 15, 18, lcdDraw);
    term.mesh.position.set(x - s / 2 - 3.45, TOP + 23, z); term.mesh.rotation.y = -Math.PI / 2; g.add(term.mesh);
    term.paint({ title: 'SANDBOX · idle', lines: ['$ _'], rows: 5 });
    const leds = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) leds.push(lampMesh(g, [x - 7 + j * 3, TOP + 8.6 + i * 7.4, z + 12.3], 0.5, j === 2 ? FLUID.tool : FLUID.ok));
    const fan = group(g, [x + 3, TOP + 25.4, z + 2]);
    const kf = new Kit({ tone: 0.8 }); kf.cyl(7, 0.6, { color: MAT.graphite, seg: 24 }); for (let i = 0; i < 5; i++) kf.box(6.4, 0.5, 1.8, { p: [3.2, 0.6, 0], r: [0, (i / 5) * TAU, 0.3], color: MAT.paper }); kf.finish(fan);
    const exit = lampMesh(g, [x - s / 2 - 3.6, TOP + 31, z + 11], 1, FLUID.ok);
    return { term, port, leds, fan, exit, run: 0, runGoal: 0, exitHex: FLUID.ok, exitK: 0.05 };
  },
  update(S, t, dt) {
    const R = S.refs; R.run = damp(R.run, R.runGoal, 4, dt);
    R.fan.rotation.y += dt * (0.3 + R.run * 16);
    R.leds.forEach((m, i) => setLamp(m, R.run > 0.1 ? (Math.sin(t * (9 + i * 3) + i) > 0.2 ? 0.9 : 0.1) : 0.05));
    setLamp(R.exit, R.exitK, R.exitHex);
  },
});

// ── 16 · the MCP backplane: a cage of server cards, each cabled to its server outside the board ──
const MCPB = { x: 120, z: 54 };
const MCP_SLOTS = 3;
station('mcp', {
  name: 'MCP 背板', role: 'MCP 服务全套 · mcp_*', color: FLUID.cache,
  desc: '一只插卡笼：每个 MCP 服务一张卡，卡上三盏灯是启动（琥珀）、在线（绿）、故障（红），线缆从板边接到外面的服务器盒。配置解析、启动、连接、鉴权重试、工具注册失败、传输错误、重连、健康检查、开关，全部在这里。没有专门模块接的工具调用也会送到这里。',
  work: [MCPB.x, TOP + 40, MCPB.z - 26], pin: [MCPB.x - 14, TOP + 40, MCPB.z],
  build(S, g) {
    const { x, z } = MCPB, k = new Kit({ tone: 0.55 });
    k.box(40, 3, 34, { p: [x, TOP, z], rr: 1.6, b: 0.5, color: MAT.pale, tone: 0.45 });
    k.box(40, 28, 2.4, { p: [x, TOP + 3, z - 15.5], rr: 0.8, b: 0.3, color: MAT.mask, tone: 0.5 });
    for (let i = 0; i < MCP_SLOTS; i++) k.box(3, 22, 1, { p: [x - 10 + i * 10, TOP + 5, z - 14], color: MAT.graphite, tone: 0.5 });
    for (const sx of [-1, 1]) k.box(2, 28, 30, { p: [x + sx * 19, TOP + 3, z], rr: 0.6, color: MAT.steel, tone: 0.55 });
    for (let i = 0; i < MCP_SLOTS; i++) k.box(1.4, 1.4, 28, { p: [x - 10 + i * 10, TOP + 3, z], color: MAT.graphite });
    const port = socket(k, x, z - 25);
    k.finish(g);
    // the cards themselves (slid in when a server comes up), with three lamps on each top edge
    const cards = [], lamps = [];
    for (let i = 0; i < MCP_SLOTS; i++) {
      const cg = group(g, [x - 10 + i * 10, TOP + 4.4, z]);
      const kc = new Kit({ tone: 0.75 });
      kc.box(1.6, 22, 26, { color: MAT.mask, tone: 0.6 });
      for (let j = 0; j < 4; j++) kc.box(1.2, 3.4, 3.4, { p: [-1.3, 4 + j * 4.6, -6 + (j % 2) * 8], color: MAT.graphite, tone: 0.6 });
      kc.box(2.4, 3, 2, { p: [0, 22, 12], color: MAT.steel });
      kc.finish(cg);
      cards.push(cg);
      lamps.push([0, 1, 2].map(j => lampMesh(cg, [-1.2, 20 - j * 2.8, 11.4], 0.65, [MAT.amberlamp, FLUID.ok, FLUID.err][j])));
      cg.visible = false;
    }
    // cables to the server boxes that sit on the plinth past the near edge
    const kx = new Kit({ tone: 0.5 }), boxes = [];
    for (let i = 0; i < MCP_SLOTS; i++) {
      const bx = x - 34 + i * 34, bz = BOARD.z1 + 28;
      kx.box(22, 12, 16, { p: [bx, 0, bz], rr: 1.4, b: 0.5, color: MAT.paper, tone: 0.5 });
      for (let j = 0; j < 4; j++) kx.line([[bx - 9, 3 + j * 2, bz + 8.05], [bx + 4, 3 + j * 2, bz + 8.05]], 'lo');
      kx.tube([[x - 10 + i * 10, TOP + 30, z + 12], [x - 10 + i * 10, TOP + 32, z + 20], [x - 10 + i * 10, TOP + 12, z + 36], [bx, TOP + 2, BOARD.z1 + 4], [bx, 6, bz - 9]], 0.8, { color: MAT.graphite, bend: 7, radial: 7 });
      boxes.push(lampMesh(g, [bx + 7, 9, bz + 8.3], 0.8, FLUID.ok));
    }
    kx.finish(world);
    return { port, cards, lamps, boxes, boot: [0, 0, 0], online: [false, false, false], fail: [false, false, false], heart: [0, 0, 0], pulse: 0, active: -1 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.pulse = Math.max(0, R.pulse - dt);
    for (let i = 0; i < MCP_SLOTS; i++) {
      R.boot[i] = Math.max(0, R.boot[i] - dt); R.heart[i] = Math.max(0, R.heart[i] - dt);
      const show = R.online[i] || R.boot[i] > 0 || R.fail[i];
      R.cards[i].visible = show;
      R.cards[i].position.y = damp(R.cards[i].position.y, show ? TOP + 4.4 : TOP + 30, 6, dt);
      const [a, b, c] = R.lamps[i];
      setLamp(a, R.boot[i] > 0 ? (Math.sin(t * 10) > 0 ? 0.9 : 0.2) : 0.05);
      setLamp(b, R.online[i] ? 0.55 + (R.heart[i] > 0 ? 0.45 * Math.sin(R.heart[i] * 12) : 0) + (R.pulse > 0 && R.active === i ? 0.35 * Math.sin(t * 20) : 0) : 0.05);
      setLamp(c, R.fail[i] ? 0.9 : 0.05);
      setLamp(R.boxes[i], R.online[i] ? 0.5 + 0.4 * Math.sin(t * 3 + i) : R.fail[i] ? 0.8 : 0.04, R.fail[i] ? FLUID.err : FLUID.ok);
    }
  },
});
