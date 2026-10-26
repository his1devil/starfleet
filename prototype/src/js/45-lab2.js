// ═════════════════════════ the lab, continued: tool instruments and the rest of the van ═════════════════════════
function fitText(c, text, maxW) { text = String(text ?? ''); if (c.measureText(text).width <= maxW) return text; while (text.length > 1 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1); return text + '…'; }
// an instrument LCD: a bold title row and a few body rows
function lcdDraw(c, w, h, s, P) {
  const rows = s.rows || 4, lh = h / (rows + 1.4);
  c.fillStyle = P.screenInk; c.textBaseline = 'top';
  c.font = `600 ${lh * 0.74}px ${FONT_MONO}`; c.fillText(fitText(c, s.title || '', w * 0.92), w * 0.04, lh * 0.3);
  c.globalAlpha = 0.25; c.fillRect(w * 0.04, lh * 1.2, w * 0.92, Math.max(1, h * 0.008)); c.globalAlpha = 0.85;
  c.font = `400 ${lh * 0.66}px ${FONT_MONO}`;
  (s.lines || []).slice(0, rows).forEach((ln, i) => c.fillText(fitText(c, ln, w * 0.92), w * 0.04, lh * (1.45 + i)));
  c.globalAlpha = 1;
}
// a sample holder: a little block with a well where the robot sets an order vial
function holder(k, x, y, z) {
  k.box(6, 3, 6, { p: [x, y, z], rr: 1, b: 0.4, color: MAT.pale, tone: 0.55 });
  k.line(ringPts(x, y + 3.06, z, 2.6, 18), 'mid');
  return V(x, y + 3 - 1.2, z);
}

// ── 4 · the sample freezer: every finished turn becomes a vial in its rack ──
// a top-loading chest freezer with a sliding glass lid, so the gripper comes in from above
const FRIDGE = { x: -209, z: -68, w: 46, d: 44, y0: FLOOR, h: 82 };
const FR_RACK = FLOOR + 50;
const FR_SLOTS = (() => { const s = []; for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) s.push(V(FRIDGE.x - 17.6 + c * 3.2, FR_RACK, -52 - r * 4.8)); return s; })();
station('archive', {
  name: '样品冰箱', role: '回合完成 · turn_completed', color: FLUID.text,
  desc: '每个回合结束，接收瓶里的产物被封进样品瓶，标上回合号和 token 数，放进低温冰柜的样品架。架上先放着本机所有 grok 会话的真实累计，回放每完成一个回合就多一瓶，这是长期成长线。',
  work: [FRIDGE.x, 150, -50], pin: [FRIDGE.x, FLOOR + FRIDGE.h + 30, FRIDGE.z],
  build(S, g) {
    const { x, z, w, d, y0, h } = FRIDGE, k = new Kit({ tone: 0.5 }), t = 3, x0 = x - w / 2, x1 = x + w / 2, zb = z - d / 2, zf = z + d / 2, top = y0 + h;
    // plinth with a vent, a hollow body, the control strip and a handle on the front
    k.box(w - 2, 6, d - 4, { p: [x, y0, z - 1], color: MAT.graphite, tone: 0.35 });
    for (let xx = x0 + 6; xx < x1 - 4; xx += 3) k.line([[xx, y0 + 1.5, zf - 2.95], [xx, y0 + 4.5, zf - 2.95]], 'lo');
    k.box(w, t, d, { p: [x, y0 + 6, z], b: 0.5 });
    k.box(t, h - 6, d, { p: [x0 + t / 2, y0 + 6, z], b: 0.6 }); k.box(t, h - 6, d, { p: [x1 - t / 2, y0 + 6, z], b: 0.6 });
    k.box(w - 2 * t, h - 6, t, { p: [x, y0 + 6, zb + t / 2], b: 0.6 }); k.box(w - 2 * t, h - 6, t, { p: [x, y0 + 6, zf - t / 2], b: 0.6 });
    k.box(w - 2 * t - 0.4, 0.8, d - 2 * t - 0.4, { p: [x, FR_RACK - 6, z], color: MAT.pale, tone: 0.3 });
    // the vial rack: a block with sixty wells
    k.box(w - 2 * t - 2, 4, 26, { p: [x, FR_RACK - 4, -61.6], rr: 1, b: 0.4, color: MAT.pale, tone: 0.45 });
    for (const sl of FR_SLOTS) k.line(ringPts(sl.x, FR_RACK + 0.06, sl.z, 1.5, 10), 'lo');
    k.box(w - 8, 9, 1, { p: [x, top - 12, zf + 0.2], color: MAT.pale, tone: 0.45 });
    k.box(26, 2, 2, { p: [x + 4, top - 2.5, zf + 1.2], rr: 0.8, b: 0.3, color: MAT.steel, tone: 0.55 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.screw(x + sx * (w / 2 - 3), top, z + sz * (d / 2 - 3), { r: 0.45 });
    // a cupboard of sample boxes on the wall above it
    k.box(w, 26, 20, { p: [x, 150, -81], rr: 1, b: 0.6, color: MAT.paper, tone: 0.45 });
    for (const dx of [-11.5, 11.5]) { k.box(22, 24, 1, { p: [x + dx, 151, -70.6], b: 0.4, color: MAT.paper, tone: 0.45 }); k.box(1, 8, 1.4, { p: [x + dx + (dx < 0 ? 9 : -9), 159, -69.6], color: MAT.steel }); }
    k.finish(g);
    // glass lid hinged at the back edge; it swings up to let the gripper in
    const lid = group(g, [x, top, zb + 1]);
    const kl = new Kit({ tone: 0.55 });
    kl.box(w - 1, 1.8, 2.4, { p: [0, 0, 1.2], b: 0.3, color: MAT.alu }); kl.box(w - 1, 1.8, 2.4, { p: [0, 0, d - 3.4], b: 0.3, color: MAT.alu });
    kl.box(2.4, 1.8, d - 2, { p: [-(w - 1) / 2 + 1.2, 0, d / 2 - 1], b: 0.3, color: MAT.alu }); kl.box(2.4, 1.8, d - 2, { p: [(w - 1) / 2 - 1.2, 0, d / 2 - 1], b: 0.3, color: MAT.alu });
    kl.add(new THREE.PlaneGeometry(w - 5, d - 6).rotateX(-Math.PI / 2), { p: [0, 1, d / 2 - 1], glass: true });
    kl.box(14, 1.4, 2, { p: [0, 1.8, d - 3], rr: 0.6, color: MAT.graphite });
    kl.finish(lid, { glassMat: GLASS2 });
    // the stored vials (all earlier sessions, then the replay's new ones)
    const n = FR_SLOTS.length;
    const bodies = new THREE.InstancedMesh(cylGeo(1.3, 7, 0.3, 12), fluidMat(0xffffff), n);
    const caps = new THREE.InstancedMesh(cylGeo(1.45, 1.8, 0.3, 12), solid(0xffffff), n);
    for (const im of [bodies, caps]) { im.castShadow = false; im.userData.tone = 0.6; im.count = 0; g.add(im); }
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const put = (i, hex, capHex) => {
      const p = FR_SLOTS[i % n];
      bodies.setMatrixAt(i % n, m4.makeTranslation(p.x, p.y, p.z)); bodies.setColorAt(i % n, c.set(hex));
      caps.setMatrixAt(i % n, m4.makeTranslation(p.x, p.y + 7, p.z)); caps.setColorAt(i % n, c.set(capHex));
      bodies.count = caps.count = Math.min(n, Math.max(bodies.count, i + 1));
      bodies.instanceMatrix.needsUpdate = caps.instanceMatrix.needsUpdate = true;
      bodies.instanceColor.needsUpdate = caps.instanceColor.needsUpdate = true;
    };
    const scr = makeScreen(14, 4.6, 22, (cc, w2, h2, s, P) => {
      cc.fillStyle = P.screenInk; cc.textBaseline = 'middle'; cc.font = `600 ${h2 * 0.44}px ${FONT_MONO}`;
      cc.fillText('-80.0°C', w2 * 0.05, h2 * 0.5); cc.textAlign = 'right'; cc.font = `400 ${h2 * 0.36}px ${FONT_MONO}`; cc.fillText(`${s.n ?? 0} 瓶`, w2 * 0.95, h2 * 0.52); cc.textAlign = 'left';
    });
    scr.mesh.position.set(x - 9, top - 7.5, zf + 0.75); g.add(scr.mesh);
    const light = glow(g, 0xbfe6ff, 50, [x, FR_RACK + 6, z]);
    return { lid, open: 0, openGoal: 0, bodies, caps, put, count: 0, scr, light };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.open = damp(R.open, R.openGoal, 4, dt);
    R.lid.rotation.x = -R.open * 1.45;
    R.light.userData.set(R.open * 0.45);
  },
});

// ── 5 · the fume hood (shell commands) and its safety interlock (permission) ──
const HOOD = { x: -152, z: -68, w: 60, d: 48 };
station('hood', {
  name: '通风橱', role: '执行命令 · run_terminal_command', color: FLUID.tool,
  desc: '命令行工具在通风橱里做：机器人把工单放进去，玻璃视窗降下，本生灯点火，烧杯里开始冒泡，侧面的屏幕显示命令和输出。成功亮绿灯，失败亮红灯、冒烟。',
  work: [HOOD.x + 18, 150, -36], pin: [HOOD.x, 192, HOOD.z],
  build(S, g) {
    const { x, z, w, d } = HOOD, k = new Kit({ tone: 0.5 }), x0 = x - w / 2, x1 = x + w / 2, zb = z - d / 2, zf = z + d / 2, top = 184;
    // base cabinet with two doors and a hazard label
    k.box(w, 6, d - 5, { p: [x, FLOOR, z - 2.5], color: MAT.graphite, tone: 0.3 });
    k.box(w, BENCH - FLOOR - 9, d - 1, { p: [x, FLOOR + 6, z - 0.5], b: 0.6, color: MAT.pale, tone: 0.4 });
    for (const sx of [-1, 1]) { k.box(w / 2 - 2, BENCH - FLOOR - 13, 1.2, { p: [x + sx * (w / 4), FLOOR + 8, zf - 0.6], b: 0.5, color: MAT.paper }); k.box(1, 10, 1.4, { p: [x + sx * 3, FLOOR + 36, zf + 0.6], color: MAT.steel }); }
    k.box(10, 8, 0.4, { p: [x - 16, FLOOR + 46, zf + 0.1], color: MAT.hazard, paint: 1, tone: 0.5 });
    k.line([[x - 18.5, FLOOR + 48, zf + 0.35], [x - 16, FLOOR + 52.5, zf + 0.35], [x - 13.5, FLOOR + 48, zf + 0.35], [x - 18.5, FLOOR + 48, zf + 0.35]], 'hi');
    // work surface, side posts with glass windows, back baffle with slots, top housing with the light
    k.box(w + 2, 3, d + 1, { p: [x, BENCH - 3, z], b: 0.8, color: MAT.graphite, tone: 0.45 });
    for (const sx of [-1, 1]) {
      const px = sx < 0 ? x0 + 2 : x1 - 2;
      k.box(4, top - BENCH - 8, 6, { p: [px, BENCH, zf - 3], b: 0.6 });
      k.box(1.6, top - BENCH - 8, d - 8, { p: [px, BENCH, z - 4], color: MAT.pale, tone: 0.35 });
    }
    k.box(w - 6, top - BENCH - 8, 1.6, { p: [x, BENCH, zb + 0.8], color: MAT.pale, tone: 0.32 });
    for (let yy = BENCH + 8; yy < top - 14; yy += 9) k.line([[x - (w - 16) / 2, yy, zb + 1.65], [x + (w - 16) / 2, yy, zb + 1.65], [x + (w - 16) / 2, yy + 1.6, zb + 1.65], [x - (w - 16) / 2, yy + 1.6, zb + 1.65], [x - (w - 16) / 2, yy, zb + 1.65]], 'lo');
    k.box(w, 8, d, { p: [x, top - 8, z], rr: 1.5, b: 0.8, tone: 0.5 });
    k.box(w - 10, 1, 8, { p: [x, top - 8.8, zf - 6], color: 0xfff6dc, tone: 0.4 });
    // exhaust duct up through the roof to a capped fan housing
    k.cyl(5, ROOF + 2 - top, { p: [x + 12, top, zb + 7], color: MAT.steel, seg: 24, tone: 0.45 });
    k.lathe([[0, 0], [8, 0], [8, 4], [9.5, 6], [9.5, 7], [0, 7]], { p: [x + 12, ROOF + 2, zb + 7], color: MAT.pale, tone: 0.55 });
    k.lathe([[0, 0], [11, 0], [11, 1.2], [3, 5], [0, 5]], { p: [x + 12, ROOF + 13, zb + 7], color: MAT.pale, tone: 0.55 });
    for (const a of [0.5, 2.6, 4.7]) k.tube([[x + 12 + Math.cos(a) * 9.5, ROOF + 9, zb + 7 + Math.sin(a) * 9.5], [x + 12 + Math.cos(a) * 9.5, ROOF + 13, zb + 7 + Math.sin(a) * 9.5]], 0.4, { color: MAT.steel, radial: 5 });
    // inside: Bunsen burner, tripod with gauze and a beaker, a rack of test tubes
    const bx = x - 10, bz = z - 4;
    k.cyl(4, 1.2, { p: [bx, BENCH, bz], color: MAT.graphite, b: 0.3 }); k.cyl(0.9, 9, { p: [bx, BENCH + 1.2, bz], color: MAT.brass }); k.cyl(1.2, 1.6, { p: [bx, BENCH + 3, bz], color: MAT.brass, b: 0.2 });
    k.tube([[bx + 4, BENCH + 0.8, bz], [bx + 14, BENCH + 0.8, bz + 2], [x0 + 3, BENCH + 6, zb + 6]], 0.6, { color: MAT.hose, bend: 4 });
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; k.tube([[bx + Math.cos(a) * 7, BENCH, bz + Math.sin(a) * 7], [bx + Math.cos(a) * 5.5, BENCH + 16, bz + Math.sin(a) * 5.5]], 0.35, { color: MAT.steel, radial: 5 }); }
    k.torus(5.6, 0.4, { p: [bx, BENCH + 16, bz], tub: 24, color: MAT.steel });
    k.box(11, 0.3, 11, { p: [bx, BENCH + 16.2, bz], color: MAT.steel, tone: 0.4 });
    const BEAKER = [[0, 0], [4.6, 0], [4.8, 0.5, 1], [4.8, 11], [5.3, 11.6]];
    k.add(latheGeo(BEAKER, 26), { p: [bx, BENCH + 16.5, bz], glass: true });
    const tx = x + 10, tz = z + 2;
    k.box(18, 5, 6, { p: [tx, BENCH, tz], color: MAT.paper, tone: 0.5 }); k.box(18, 0.8, 6, { p: [tx, BENCH + 7, tz], color: MAT.paper, tone: 0.5 });
    const tubes = [];
    for (let i = 0; i < 6; i++) { const px = tx - 7.5 + i * 3; k.add(latheGeo([[0, 0], [1.1, 0.8, 1], [1.1, 13], [1.3, 13.4]], 14), { p: [px, BENCH + 1, tz], glass: true }); tubes.push(px); }
    k.box(14, 1.6, 7, { p: [x + 18, BENCH - 3.6, zf + 3], b: 0.3, color: MAT.steel, tone: 0.45 });
    const port = holder(k, x + 18, BENCH - 2, zf + 3.5);
    k.finish(g);
    // the sash: a framed glass pane that slides down while a command runs
    const sash = group(g, [x, 0, zf - 0.5]);
    const ks = new Kit({ tone: 0.6 });
    ks.box(w - 8, 2.2, 2, { p: [0, 0, 0], b: 0.4 }); ks.box(w - 8, 2.2, 2, { p: [0, 30, 0], b: 0.4 });
    ks.box(2, 30, 2, { p: [-(w - 8) / 2 + 1, 0, 0] }); ks.box(2, 30, 2, { p: [(w - 8) / 2 - 1, 0, 0] });
    ks.add(new THREE.PlaneGeometry(w - 12, 28), { p: [0, 16, 0], glass: true });
    ks.box(18, 1.2, 1.6, { p: [0, -1.2, 1.4], color: MAT.steel });
    ks.finish(sash, { glassMat: GLASS2 });
    // live: flame, beaker liquid, test tube liquids, side terminal, airflow lamp
    const flame = mesh(coneGeo(1.1, 0.05, 5.5, 12), solid(0xffffff, { glow: 1, glowColor: 0x5aa2ff }), g, [bx, BENCH + 10.2, bz], [0, 0, 0], { tone: 0.4, cast: false });
    const flameHalo = glow(g, 0x4b8dff, 16, [bx, BENCH + 13, bz]);
    const beakerLiq = mesh(fillGeo(BEAKER.map(([r, yy]) => [r, yy + BENCH + 16.5]), BENCH + 16.5 + 5), fluidMat(FLUID.tool), g, [bx, 0, bz], [0, 0, 0], { tone: 0.7 });
    const tubeLiq = tubes.map((px, i) => mesh(cylGeo(0.85, 5 + (i % 3) * 1.5, 0, 10), fluidMat([FLUID.tool, FLUID.ok, FLUID.cache, FLUID.user, FLUID.tool, FLUID.err][i]), g, [px, BENCH + 1.4, tz], [0, 0, 0], { tone: 0.6 }));
    const term = makeScreen(15, 9, 18, lcdDraw);
    term.mesh.position.set(x1 + 0.2, BENCH + 30, z + 6); term.mesh.rotation.y = Math.PI / 2; g.add(term.mesh);
    term.paint({ title: 'TTY · 待命', lines: ['$ _'], rows: 5 });
    const lamp = mesh(sphereGeo(1.1, 12, 10), solid(0xffffff, { glow: 0.3, glowColor: FLUID.ok }), g, [x1 - 2, top - 4, zf + 0.6], [0, 0, 0], { tone: 0.6 });
    return { sash, sashY: BENCH + 14, sashGoal: BENCH + 14, flame, flameHalo, fire: 0, fireGoal: 0, beakerLiq, tubeLiq, term, lamp, lampHex: FLUID.ok, port, bx, bz, smoke: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.sashY = damp(R.sashY, R.sashGoal, 3, dt); R.sash.position.y = R.sashY;
    R.fire = damp(R.fire, R.fireGoal, 5, dt);
    R.flame.visible = R.fire > 0.05; R.flame.scale.set(1, 0.6 + R.fire * 0.5 + Math.sin(t * 31) * 0.06, 1);
    R.flameHalo.userData.set(R.fire * 0.7);
    R.lamp.material.userData.u.uGlowColor.value.set(R.lampHex);
    R.lamp.material.userData.u.uGlow.value = R.lampHex === FLUID.err ? (Math.sin(t * 12) > 0 ? 1 : 0.3) : 0.75;
    if (R.fire > 0.5 && Math.random() < dt * 22) fx.drops.emit(V(R.bx + (Math.random() - 0.5) * 6, BENCH + 18, R.bz + (Math.random() - 0.5) * 6), V(0, 9 + Math.random() * 6, 0), 0xffffff, 0.5, 0.35 + Math.random() * 0.3, { g: 10 });
    if (R.smoke > 0) { R.smoke -= dt; if (Math.random() < dt * 14) fx.puffs.emit(V(R.bx, BENCH + 30, R.bz), V((Math.random() - 0.5) * 6, 16, 4), 0x55575d, 2.4, 7, 2.2, 0.45); }
  },
});
station('interlock', {
  name: '安全联锁', role: '权限请求 · request_permission', color: MAT.hazard,
  desc: '钥匙开关加红绿灯。agent 要执行需要审批的工具时（session/request_permission），机器人带着工单停在联锁前，灯闪黄等你批准；批准后钥匙转动、绿灯亮；拒绝则红灯，工单作废扔进废液桶。',
  work: [HOOD.x + 36, 150, -34], pin: [HOOD.x + 35, 172, -44],
  build(S, g) {
    const x = HOOD.x + HOOD.w / 2 + 4, z = -44.6, y = 138, k = new Kit({ tone: 0.75 });
    k.box(11, 22, 1.4, { p: [x, y, z], rr: 1, b: 0.3, color: MAT.hazard, paint: 1, tone: 0.7 });
    for (let i = -4; i <= 4; i++) k.line([[x - 5.5, y + 11 + i * 2.4 - 2.6, z + 0.75], [x - 5.5 + 2.4, y + 11 + i * 2.4, z + 0.75]], 'hi');
    k.box(8, 18, 1.2, { p: [x, y + 2, z + 1.1], rr: 0.8, b: 0.3, color: MAT.paper, tone: 0.7 });
    k.cyl(2, 1.4, { p: [x, y + 8, z + 2.3], r: [Math.PI / 2, 0, 0], color: MAT.steel, b: 0.3 });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.screw(x + sx * 4.6, y + 11 + sy * 9.6, z + 0.7, { axis: 'z', r: 0.35 });
    k.finish(g);
    const key = group(g, [x, y + 8, z + 3.7]);
    const kk = new Kit({ tone: 0.9 });
    kk.box(0.9, 3.4, 0.8, { p: [0, -1.7, 0], color: MAT.brass }); kk.cyl(1.3, 0.6, { p: [0, 1.7, -0.3], r: [Math.PI / 2, 0, 0], color: MAT.brass, seg: 16 });
    kk.finish(key);
    const red = mesh(sphereGeo(1.2, 14, 10), solid(0xffffff, { glow: 0.15, glowColor: FLUID.err }), g, [x - 2.2, y + 14.5, z + 2], [0, 0, 0], { tone: 0.7 });
    const green = mesh(sphereGeo(1.2, 14, 10), solid(0xffffff, { glow: 0.15, glowColor: FLUID.ok }), g, [x + 2.2, y + 14.5, z + 2], [0, 0, 0], { tone: 0.7 });
    const scr = makeScreen(6.4, 2.6, 26, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `600 ${h * 0.5}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.fillText(s.t || 'LOCKED', w / 2, h / 2); c.textAlign = 'left'; });
    scr.mesh.position.set(x, y + 3.6, z + 1.75); g.add(scr.mesh); scr.paint({ t: 'LOCKED' });
    const halo = glow(g, MAT.amberlamp, 30, [x, y + 12, z + 3]);
    return { key, keyAng: 0, keyGoal: 0, red, green, scr, halo, mode: 'idle', until: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.keyAng = damp(R.keyAng, R.keyGoal, 6, dt); R.key.rotation.z = -R.keyAng;
    const wait = R.mode === 'wait', blink = Math.sin(t * 7) > 0;
    R.red.material.userData.u.uGlow.value = R.mode === 'deny' ? 1 : wait && blink ? 0.9 : 0.12;
    R.green.material.userData.u.uGlow.value = R.mode === 'allow' ? 1 : 0.12;
    R.red.material.userData.u.uGlowColor.value.set(wait ? MAT.amberlamp : FLUID.err);
    R.halo.userData.set(wait ? (blink ? 0.7 : 0.25) : R.mode === 'allow' ? 0.35 : R.mode === 'deny' ? 0.45 : 0, wait ? MAT.amberlamp : R.mode === 'allow' ? FLUID.ok : FLUID.err);
    if (R.until && sceneClock > R.until && !wait) { R.mode = 'idle'; R.until = 0; R.keyGoal = 0; R.scr.paint({ t: 'LOCKED' }); }
  },
});

// ── 6 · microscope (read_file / list_dir) ──
const SCOPE = { x: -13, z: -70 };
station('scope', {
  name: '显微镜', role: '读文件 / 列目录 · read', color: FLUID.cache,
  desc: '读文件和列目录在显微镜下做：工单放进样品座，底灯亮起，物镜转到位，旁边的屏幕显示文件路径和读到的内容。',
  work: [SCOPE.x + 9, 150, SCOPE.z + 12], pin: [SCOPE.x, 168, SCOPE.z],
  build(S, g) {
    const { x, z } = SCOPE, y = BENCH, k = new Kit({ tone: 0.6 });
    k.box(16, 3.6, 20, { p: [x, y, z - 1], rr: 3, b: 0.8, color: MAT.paper, tone: 0.55 });
    k.box(6, 22, 6, { p: [x, y + 3.6, z - 8.5], rr: 1.5, b: 0.5 });
    k.at([x, y + 25, z - 8.5], [-0.42, 0, 0], kk => kk.box(6, 14, 6, { p: [0, 0, 0], rr: 1.5, b: 0.5 }));
    k.box(9, 6, 10, { p: [x, y + 34, z - 2], rr: 1.5, b: 0.5 });
    for (const sx of [-1, 1]) k.at([x + sx * 2.3, y + 39, z + 1], [-0.75, 0, 0], kk => { kk.cyl(1.1, 8, { color: MAT.graphite, seg: 14 }); kk.cyl(1.4, 1.6, { p: [0, 8, 0], color: MAT.graphite, seg: 14, b: 0.3 }); });
    k.cyl(3.4, 2, { p: [x, y + 31.5, z + 0.5], color: MAT.steel, seg: 24, b: 0.4 });
    for (const [dx, dz, l] of [[0, 1.5, 5], [1.6, -0.6, 4], [-1.6, -0.6, 3.4]]) k.cyl(0.8, l, { p: [x + dx, y + 31.5 - l, z + 0.5 + dz], color: MAT.alu, seg: 12 });
    k.box(14, 1.4, 13, { p: [x, y + 17, z + 1], rr: 1, b: 0.3, color: MAT.graphite, tone: 0.55 });
    for (const sx of [-1, 1]) k.box(4.5, 0.4, 1, { p: [x + sx * 3, y + 18.5, z + 3], color: MAT.steel });
    k.cyl(1.3, 3, { p: [x + 7, y + 16, z + 4], r: [0, 0, -Math.PI / 2], color: MAT.graphite });
    for (const sx of [-1, 1]) {
      k.cyl(3.2, 1.8, { p: [x + sx * 3, y + 12, z - 8.5], r: [0, 0, sx * -Math.PI / 2], color: MAT.graphite, seg: 28, b: 0.3 });
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.line([[x + sx * 3.4, y + 12 + Math.sin(a) * 3.22, z - 8.5 + Math.cos(a) * 3.22], [x + sx * 5, y + 12 + Math.sin(a) * 3.22, z - 8.5 + Math.cos(a) * 3.22]], 'lo'); }
    }
    k.cyl(2.2, 0.4, { p: [x, y + 3.6, z + 1], color: 0xfff3d6, seg: 20, tone: 0.4 });
    // monitor on a little stand
    const mx = x + 13, mz = z - 6;
    k.box(9, 1, 7, { p: [mx, y, mz], rr: 1.5, b: 0.3, color: MAT.pale }); k.box(2, 12, 2, { p: [mx, y + 1, mz - 1] });
    k.at([mx, y + 19, mz], [-0.2, 0, 0], kk => kk.box(18, 12, 1.6, { p: [0, -6, 0], rr: 1.2, b: 0.4 }));
    const port = holder(k, x + 9, y, z + 12);
    k.finish(g);
    const scr = makeScreen(16, 10, 20, lcdDraw);
    scr.mesh.position.set(mx, y + 19.17, mz + 0.81); scr.mesh.rotation.x = -0.2; g.add(scr.mesh);
    scr.paint({ title: 'READ · 待命', lines: [], rows: 5 });
    const lamp = mesh(cylGeo(2.2, 0.45, 0, 20), solid(0xffffff, { glow: 0, glowColor: 0xffe7a8 }), g, [x, y + 3.62, z + 1], [0, 0, 0], { tone: 0.4, cast: false });
    const beam = mesh(cylGeo(1.2, 12, 0, 16), new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false }), g, [x, y + 4, z + 1], [0, 0, 0]);
    const slide = new THREE.Group(); slide.position.set(x, y + 18.45, z + 1); g.add(slide);
    const ksl = new Kit({ tone: 0.8 }); ksl.add(new THREE.BoxGeometry(7.6, 0.2, 2.6), { glass: true }); ksl.box(2.2, 0.06, 1.8, { p: [0, 0.1, 0], color: FLUID.cache, paint: 1 }); ksl.finish(slide);
    slide.visible = false;
    return { scr, lamp, beam, slide, on: 0, onGoal: 0, port };
  },
  update(S, t, dt) {
    const R = S.refs; R.on = damp(R.on, R.onGoal, 4, dt);
    R.lamp.material.userData.u.uGlow.value = R.on; R.beam.material.opacity = R.on * 0.22; R.beam.visible = R.on > 0.02; R.slide.visible = R.on > 0.3;
  },
});

// ── 7 · spectrometer (grep / search) ──
const SPEC = { x: 31, z: -69 };
station('spectro', {
  name: '分光仪', role: '搜索 · grep / search', color: FLUID.reason,
  desc: '搜索在光学平台上做：光源经狭缝和透镜打到棱镜，散开的光谱落在探测屏上。搜索命中的每一行就是屏上亮起的一条谱线。',
  work: [SPEC.x - 18, 150, SPEC.z + 13], pin: [SPEC.x, 162, SPEC.z],
  build(S, g) {
    const { x, z } = SPEC, y = BENCH, k = new Kit({ tone: 0.55 });
    // breadboard with a grid of tapped holes, levelling feet
    k.box(44, 2.4, 30, { p: [x, y + 1.2, z], rr: 1, b: 0.4, color: MAT.graphite, tone: 0.45 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(1.4, 1.2, { p: [x + sx * 19, y, z + sz * 12], color: MAT.steel });
    for (let i = -20; i <= 20; i += 2.5) for (let j = -13.5; j <= 13.5; j += 2.5) k.line([[x + i - 0.25, y + 3.62, z + j], [x + i + 0.25, y + 3.62, z + j]], 'lo');
    // lamp housing with a slit
    const lx = x - 17;
    k.box(7, 8, 7, { p: [lx, y + 3.6, z - 6], rr: 1, b: 0.4, color: MAT.paper, tone: 0.6 });
    for (let yy = y + 6; yy < y + 11; yy += 1.4) k.line([[lx - 3.55, yy, z - 8], [lx - 3.55, yy, z - 4]], 'lo');
    k.box(1, 6, 1, { p: [lx + 3.8, y + 4.6, z - 6], color: MAT.graphite });
    // posts with a lens and the slit
    const post = (px, pz, h) => { k.cyl(1.2, 1, { p: [px, y + 3.6, pz], color: MAT.steel, seg: 12 }); k.cyl(0.6, h, { p: [px, y + 4.6, pz], color: MAT.steel, seg: 10 }); };
    post(x - 9, z - 6, 4); k.box(0.6, 4, 3.4, { p: [x - 9, y + 8.6, z - 6], color: MAT.graphite }); k.line([[x - 8.65, y + 9.6, z - 6], [x - 8.65, y + 11.6, z - 6]], 'hi');
    post(x - 3, z - 5, 4); k.at([x - 3, y + 10.6, z - 5], [0, 0, Math.PI / 2], kk => kk.add(latheGeo([[0, -0.5], [2.4, -0.15, 1], [2.4, 0.15, 1], [0, 0.5]], 20), { glass: true }));
    k.torus(2.5, 0.25, { p: [x - 3, y + 10.6, z - 5], r: [0, 0, Math.PI / 2], tub: 20, color: MAT.alu });
    // prism on a rotation stage
    k.cyl(4.2, 1.6, { p: [x + 4, y + 3.6, z - 3], color: MAT.alu, seg: 28, b: 0.3 });
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; k.line([[x + 4 + Math.cos(a) * 4.22, y + 4.6, z - 3 + Math.sin(a) * 4.22], [x + 4 + Math.cos(a) * 4.22, y + 5.2, z - 3 + Math.sin(a) * 4.22]], 'lo'); }
    const prism = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-2.6, -1.5), new THREE.Vector2(2.6, -1.5), new THREE.Vector2(0, 3)]), { depth: 5, bevelEnabled: false });
    prism.rotateX(-Math.PI / 2);
    k.add(prism, { p: [x + 4, y + 5.2, z - 3], r: [0, 0.4, 0], glass: true });
    // detector: an arc screen on two posts
    post(x + 15, z - 12, 6); post(x + 15, z + 8, 6);
    k.finish(g);
    const scr = makeScreen(12, 10, 18, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.fillRect(w * 0.02, h * 0.82, w * 0.96, h * 0.012);
      const lines = s.lines || [];
      for (let i = 0; i < 46; i++) { const xx = w * (0.06 + 0.88 * (i / 45)); c.globalAlpha = 0.2; c.fillRect(xx, h * 0.62, Math.max(1, w * 0.004), h * 0.2); }
      c.globalAlpha = 1;
      lines.forEach(([u, hex]) => { c.fillStyle = hex; c.fillRect(w * (0.06 + 0.88 * u) - w * 0.008, h * 0.12, w * 0.016, h * 0.7); });
      c.fillStyle = P.screenInk; c.font = `500 ${h * 0.09}px ${FONT_MONO}`; c.textBaseline = 'top'; c.fillText(fitText(c, s.title || '', w * 0.9), w * 0.04, h * 0.86);
    });
    scr.mesh.position.set(x + 15, y + 16, z - 2); scr.mesh.rotation.y = -Math.PI / 2 + 0.2; g.add(scr.mesh);
    mesh(slabGeo(1, 12, 22, 0, 0.2), solid(MAT.paper), g, [x + 15.9, y + 10.4, z - 2], [0, 0.2, 0], { tone: 0.6 });
    scr.mesh.position.set(x + 15.3, y + 16.4, z - 2); scr.paint({ title: 'GREP · 待命', lines: [] });
    // light paths: a white beam to the prism, a fan of colours to the screen
    const beamMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const bg = new THREE.BufferGeometry().setFromPoints([V(x - 13.4, y + 10.6, z - 6), V(x + 4, y + 7.7, z - 3)]);
    const beam = new THREE.Line(bg, beamMat); beam.layers.set(1); g.add(beam);
    const fan = new THREE.Group(); g.add(fan);
    const hues = [0xe8233a, 0xff7a1c, 0xffcf1a, 0x26c75a, 0x18c4dc, 0x2f7bff, 0x8a4dff];
    hues.forEach((hex, i) => { const L = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x + 4, y + 7.7, z - 3), V(x + 15, y + 15 - i * 0.6, z - 9 + i * 2.2)]), new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0 })); L.layers.set(1); fan.add(L); });
    const halo = glow(g, 0xffffff, 14, [x + 4, y + 7.7, z - 3]);
    const kp = new Kit({ tone: 0.55 }), port = holder(kp, x - 18, y, z + 13); kp.finish(g);
    return { scr, beamMat, fan, halo, on: 0, onGoal: 0, port, hues };
  },
  update(S, t, dt) {
    const R = S.refs; R.on = damp(R.on, R.onGoal, 5, dt);
    R.beamMat.opacity = R.on * 0.9; R.fan.children.forEach((L, i) => { L.material.opacity = R.on * (0.55 + 0.35 * Math.sin(t * 9 + i)); });
    R.halo.userData.set(R.on * 0.6);
  },
});

// ── 8 · pipetting station (write / edit) ──
const PIPET = { x: 80, z: -68 };
station('pipettor', {
  name: '移液工作站', role: '写文件 / 编辑 · write / edit', color: FLUID.ok,
  desc: '写文件和编辑在移液工作站做：八通道移液头先从试剂槽吸液，再一列列滴进 96 孔板。绿孔是新增的行，红孔是删除的行，屏幕上是文件路径和增删行数。',
  work: [PIPET.x - 25, 150, PIPET.z + 20], pin: [PIPET.x, 170, PIPET.z],
  build(S, g) {
    const { x, z } = PIPET, y = BENCH, k = new Kit({ tone: 0.55 });
    k.box(40, 3, 32, { p: [x, y, z], rr: 2, b: 0.6, color: MAT.pale, tone: 0.5 });
    // frame posts and top rails of the little gantry
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(2, 30, 2, { p: [x + sx * 19, y + 3, z + sz * 15], b: 0.3, color: MAT.alu });
    for (const sz of [-1, 1]) k.box(40, 2, 2, { p: [x, y + 31, z + sz * 15], b: 0.3, color: MAT.alu });
    // deck: 96-well plate, tip rack, reagent trough
    k.box(13, 1.6, 9, { p: [x + 4, y + 3, z + 2], rr: 0.8, b: 0.2, color: MAT.paper, tone: 0.6 });
    for (let r = 0; r < 8; r++) for (let c = 0; c < 12; c++) k.line(ringPts(x + 4 - 5.5 + c, y + 4.66, z + 2 - 3.5 + r, 0.38, 8), 'lo');
    k.box(10, 4, 8, { p: [x - 11, y + 3, z + 4], rr: 0.8, b: 0.2, color: MAT.graphite, tone: 0.5 });
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) k.cyl(0.35, 0.8, { p: [x - 14.5 + c, y + 7, z + 1.5 + r], seg: 6, color: 0xe8e2c8, tone: 0.4 });
    k.box(10, 3, 5, { p: [x - 11, y + 3, z - 7], rr: 0.6, b: 0.2, color: MAT.paper, tone: 0.55 });
    const port = holder(k, x - 25, y, z + 20);
    k.finish(g);
    const trough = mesh(slabGeo(8.6, 0.4, 3.6, 0.4, 0), fluidMat(FLUID.ok), g, [x - 11, y + 5.4, z - 7], [0, 0, 0], { tone: 0.6 });
    // moving bridge + 8-channel head
    const bridge = group(g, [x, y + 31, z]);
    const kb = new Kit({ tone: 0.8 });
    kb.box(3, 2.6, 30, { p: [0, -2.6, 0], b: 0.3, color: MAT.alu });
    kb.finish(bridge);
    const headG = group(bridge, [0, -2.6, 0]);
    const kh = new Kit({ tone: 0.9 });
    kh.box(5, 6, 10, { p: [0, -6, 0], rr: 0.8, b: 0.3, color: MAT.paper });
    for (let i = 0; i < 8; i++) kh.add(coneGeo(0.25, 0.45, 3.2, 8).clone().rotateX(Math.PI), { p: [0, -6, -3.5 + i], color: 0xe8e2c8, tone: 0.6 });
    kh.finish(headG);
    // wells that fill: 96 instanced discs
    const wells = new THREE.InstancedMesh(cylGeo(0.36, 0.5, 0, 8), fluidMat(0xffffff), 96);
    wells.count = 0; wells.castShadow = false; wells.userData.tone = 0.5; g.add(wells);
    const scr = makeScreen(14, 7, 20, lcdDraw);
    scr.mesh.position.set(x + 8, y + 22, z + 15.2); g.add(scr.mesh);
    const kscr = new Kit({ tone: 0.5 }); kscr.box(15, 8, 1, { p: [x + 8, y + 18, z + 14.6], rr: 0.8, b: 0.2 }); kscr.finish(g);
    scr.paint({ title: 'EDIT · 待命', lines: [], rows: 3 });
    return { bridge, headG, wells, scr, port, trough, hx: x, hz: z, goal: V(x, 0, z), seq: [], wellIdx: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    // walk through queued dispense points
    if (R.seq.length) {
      const g0 = R.seq[0];
      R.bridge.position.x = damp(R.bridge.position.x, g0.x, 9, dt);
      R.headG.position.z = damp(R.headG.position.z, g0.z - PIPET.z, 9, dt);
      if (Math.abs(R.bridge.position.x - g0.x) < 0.3 && Math.abs(R.headG.position.z - (g0.z - PIPET.z)) < 0.3) { R.seq.shift(); g0.fn?.(); }
    }
  },
});

// ── 9 · the bulkhead: intake hatch, radio (ask_user), protocol clipboard (todo), clock ──
station('intake', {
  name: '传递窗', role: '用户消息 · user_message', color: FLUID.user,
  desc: '驾驶室的电传打印机打出委托单（用户消息），装进金色样品瓶，经隔断上的传递窗送进实验区。机器人在这里接过它，倒进储液塔。',
  work: [96, 150, -26], pin: [104, 176, -26],
  build(S, g) {
    const k = new Kit({ tone: 0.45 }), x = FX;
    // lower bulkhead panel, mesh partition above, the pass-through hatch
    k.box(4, 76, 184, { p: [x, FLOOR, 0], b: 0.6, color: MAT.pale });
    k.box(4, 2, 184, { p: [x, FLOOR + 76, 0], b: 0.4 });
    for (const zz of [-90, -48, -4, 90]) k.box(3, 196 - FLOOR - 78, 3, { p: [x, FLOOR + 78, zz], color: MAT.steel, tone: 0.45 });
    k.box(3, 3, 184, { p: [x, 193, 0], color: MAT.steel, tone: 0.45 });
    for (let zz = 4; zz < 90; zz += 5) k.line([[x - 0.1, FLOOR + 78, zz], [x - 0.1, 193, zz]], 'lo');
    for (let yy = FLOOR + 82; yy < 193; yy += 5) k.line([[x - 0.1, yy, -4], [x - 0.1, yy, 90]], 'lo');
    for (let zz = -86; zz < -48; zz += 5) k.line([[x - 0.1, FLOOR + 78, zz], [x - 0.1, 193, zz]], 'lo');
    for (let yy = FLOOR + 82; yy < 193; yy += 5) k.line([[x - 0.1, yy, -88], [x - 0.1, yy, -48]], 'lo');
    // hatch: frame and a little tray that pushes a vial through
    k.box(14, 2, 40, { p: [x - 5, 138, -26], b: 0.4, color: MAT.paper, tone: 0.55 });
    k.box(2, 26, 2, { p: [x - 11, 140, -45], color: MAT.steel }); k.box(2, 26, 2, { p: [x - 11, 140, -7], color: MAT.steel });
    k.box(2, 2, 40, { p: [x - 11, 165, -26], color: MAT.steel });
    for (let zz = -44; zz <= -8; zz += 3) k.line([[x - 11.9, 140.05, zz], [x + 1, 140.05, zz]], 'lo');
    k.finish(g);
    return { tray: V(x - 5, 140, -26) };
  },
});
station('radio', {
  name: '对讲机', role: '向用户提问 · ask_user_question', color: FLUID.user,
  desc: 'agent 需要问你问题时（ask_user_question），机器人去隔断上取下对讲机听筒，等你回答。',
  work: [98, 150, 20], pin: [104, 158, 20],
  build(S, g) {
    const k = new Kit({ tone: 0.6 }), x = FX - 2.4, y = 112, z = 20;
    k.box(3.4, 12, 22, { p: [x - 1.7, y, z], rr: 1.5, b: 0.5, color: MAT.graphite, tone: 0.55 });
    for (let zz = z - 8; zz < z - 1; zz += 1.4) k.line([[x - 3.45, y + 3, zz], [x - 3.45, y + 9, zz]], 'lo');
    k.cyl(1.6, 1.2, { p: [x - 3.4, y + 8, z + 5], r: [0, 0, Math.PI / 2], color: MAT.steel, b: 0.3 });
    k.cyl(0.4, 10, { p: [x - 1, y + 12, z + 9], color: MAT.graphite, seg: 8 });
    k.box(1.2, 4, 3, { p: [x - 4, y + 12, z], color: MAT.steel });
    k.finish(g);
    const scr = makeScreen(5, 1.8, 30, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `600 ${h * 0.55}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(s.t || 'CH 09', w * 0.06, h * 0.52); });
    scr.mesh.position.set(x - 3.46, y + 4.6, z + 4.4); scr.mesh.rotation.y = -Math.PI / 2; g.add(scr.mesh); scr.paint({ t: 'CH 09' });
    const hand = group(g, [x - 4.6, y + 11, z]);
    const kh = new Kit({ tone: 0.8 }); kh.box(2.4, 13, 3.6, { p: [0, -6.5, 0], rr: 1.1, b: 0.4, color: MAT.graphite }); kh.finish(hand);
    return { scr, hand, lift: 0, liftGoal: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.lift = damp(R.lift, R.liftGoal, 4, dt); R.hand.position.y = 123 + R.lift * 9; R.hand.rotation.z = R.lift * 0.5; },
});
station('notebook', {
  name: '实验记录夹', role: '计划 / 待办 · todo_write', color: FLUID.text,
  desc: '隔断上夹着的实验方案。agent 写待办（todo_write）时机器人来这里勾选条目；挂钟走的是录制时间。',
  work: [96, 146, 56], pin: [104, 150, 56],
  build(S, g) {
    const k = new Kit({ tone: 0.6 }), x = FX - 2.2;
    k.box(1.2, 30, 22, { p: [x - 0.6, 92, 56], rr: 1, b: 0.3, color: MAT.cork, tone: 0.45 });
    k.box(1.6, 3, 8, { p: [x - 1.6, 120, 56], rr: 0.6, b: 0.2, color: MAT.steel });
    // wall clock
    k.cyl(7.5, 2, { p: [x - 1, 160, 28], r: [0, 0, Math.PI / 2], color: MAT.paper, seg: 36, b: 0.5, tone: 0.55 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.line([[x - 3.05, 160 + Math.cos(a) * 6.4, 28 + Math.sin(a) * 6.4], [x - 3.05, 160 + Math.cos(a) * (i % 3 ? 5.6 : 5), 28 + Math.sin(a) * (i % 3 ? 5.6 : 5)]], i % 3 ? 'lo' : 'mid'); }
    // fire extinguisher
    k.cyl(4.6, 34, { p: [x - 6, FLOOR + 1, 80], color: MAT.redlamp, paint: 1, b: 1, tone: 0.6 });
    k.cyl(1.6, 4, { p: [x - 6, FLOOR + 35, 80], color: MAT.graphite });
    k.finish(g);
    const paper = makeScreen(19, 26, 12, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#1d1d1d' : '#fbfbf7'; c.fillRect(0, 0, w, h);
      c.fillStyle = P.ink; c.globalAlpha = 0.85; c.font = `italic 600 ${h * 0.07}px ${FONT_SERIF}`; c.textBaseline = 'top'; c.fillText(s.title || '实验方案', w * 0.08, h * 0.05);
      c.globalAlpha = 1; c.font = `400 ${h * 0.05}px ${FONT_MONO}`;
      (s.items || []).slice(0, 8).forEach((it, i) => {
        const yy = h * (0.2 + i * 0.095);
        c.strokeStyle = P.ink; c.lineWidth = 1; c.strokeRect(w * 0.08, yy, h * 0.045, h * 0.045);
        if (it.done) { c.beginPath(); c.moveTo(w * 0.085, yy + h * 0.02); c.lineTo(w * 0.1, yy + h * 0.04); c.lineTo(w * 0.15, yy - h * 0.01); c.stroke(); }
        c.globalAlpha = it.done ? 0.5 : 0.9; c.fillText(fitText(c, it.t, w * 0.72), w * 0.2, yy); c.globalAlpha = 1;
      });
    });
    paper.mesh.position.set(x - 1.3, 92 + 13, 56); paper.mesh.rotation.y = -Math.PI / 2; g.add(paper.mesh);
    paper.paint({ title: '实验方案', items: [{ t: '登记委托', done: false }, { t: '进样 · 反应', done: false }, { t: '仪器分析', done: false }, { t: '封样入库', done: false }] });
    const hands = [0.4, 0.25].map((w, i) => { const m = mesh(slabGeo(0.6, 6 - i * 1.8, 0.3, 0, 0), solid(MAT.graphite), g, [x - 3.2, 160, 28], [0, 0, 0], { tone: 0.8, cast: false }); m.rotation.order = 'XYZ'; return m; });
    return { paper, hands };
  },
  update(S, t, dt) {
    const R = S.refs, ms = CLOCK_REAL();
    const d = new Date(ms), hh = d.getHours() % 12 + d.getMinutes() / 60, mm = d.getMinutes() + d.getSeconds() / 60;
    R.hands[0].rotation.x = (hh / 12) * TAU; R.hands[1].rotation.x = (mm / 60) * TAU;
  },
});

// ── 10 · near side: rotary evaporator (compaction), drone dock (subagent), racks, bins ──
const ROTA = { x: -150, z: 76, y: FLOOR + 24 };
station('rotavap', {
  name: '旋转蒸发仪', role: '自动压缩 · auto_compact', color: FLUID.context,
  desc: '上下文过 85% 时（auto_compact_started），储液塔的液体被抽进旋蒸瓶，在水浴里旋转蒸发，冷凝收集，浓缩后的摘要回流到储液塔，液位骤降（auto_compact_completed）。',
  work: [ROTA.x + 6, 140, ROTA.z - 18], pin: [ROTA.x, ROTA.y + 66, ROTA.z],
  build(S, g) {
    const { x, z, y } = ROTA, k = new Kit({ tone: 0.55 });
    k.box(30, 8, 20, { p: [x, y, z], rr: 2, b: 0.6, color: MAT.pale, tone: 0.5 });
    k.lathe([[0, 0], [10.5, 0], [10.5, 9], [11.2, 9.6], [11.2, 10.4], [10, 10.4], [9.6, 1.4], [0, 1.4]], { p: [x - 5, y + 8, z], color: MAT.steel, seg: 36, tone: 0.55 });
    k.box(5, 34, 5, { p: [x + 11, y + 8, z - 4], b: 0.5, color: MAT.paper, tone: 0.6 });
    k.at([x + 9, y + 38, z - 4], [0, 0, -0.55], kk => { kk.box(8, 14, 8, { p: [0, -4, 0], rr: 1.5, b: 0.5, color: MAT.paper, tone: 0.65 }); });
    // vertical coil condenser and its receiving flask
    const cx = x + 13, cz = z + 6;
    k.add(latheGeo([[2.6, 0], [3.4, 1.5, 1], [3.4, 22, 1], [2.4, 24], [2.4, 26]], 22), { p: [cx, y + 36, cz], glass: true });
    const coil = []; for (let i = 0; i <= 120; i++) { const a = (i / 120) * TAU * 7; coil.push(V(cx + Math.cos(a) * 2.4, y + 38 + (i / 120) * 18, cz + Math.sin(a) * 2.4)); }
    k.tube(new THREE.CatmullRomCurve3(coil), 0.26, { color: MAT.copper, radial: 5, seg: 240, tone: 0.5 });
    k.add(sphereGeo(5, 22, 16), { p: [cx, y + 28, cz], glass: true });
    k.add(latheGeo([[1.2, 0], [1.2, 4]], 12), { p: [cx, y + 32.5, cz], glass: true });
    k.box(8, 3, 8, { p: [cx, y + 8, cz], rr: 1, b: 0.3, color: MAT.graphite });
    k.tube([[cx, y + 11, cz], [cx, y + 23, cz]], 0.5, { color: MAT.steel });
    // vacuum controller with a screen
    k.box(10, 7, 8, { p: [x - 20, y, z + 2], rr: 1.2, b: 0.4, color: MAT.paper, tone: 0.5 });
    k.tube([[x - 20, y + 7, z + 2], [x - 18, y + 30, z + 2], [cx - 2, y + 48, cz]], 0.6, { color: MAT.hose, bend: 6 });
    k.finish(g);
    // the evaporation flask turns on its tilted axis
    const rot = group(g, [x - 3, y + 30, z - 1]); rot.rotation.z = 0.95;
    const kr = new Kit({ tone: 0.7 });
    kr.add(latheGeo([[0.9, 14], [0.9, 8], [1.6, 7]], 14), { glass: true });
    kr.add(sphereGeo(6.5, 22, 16), { p: [0, 0, 0], glass: true });
    kr.finish(rot);
    const flaskLiq = mesh(sphereGeo(6, 18, 12), fluidMat(FLUID.context), rot, [0, 0, 0], [0, 0, 0], { tone: 0.6 });
    flaskLiq.scale.setScalar(0.01);
    const recvLiq = mesh(sphereGeo(4.6, 16, 12), fluidMat(FLUID.context), g, [cx, y + 28, cz], [0, 0, 0], { tone: 0.6 });
    recvLiq.scale.set(1, 0.02, 1);
    const bath = mesh(cylGeo(9.4, 1, 0, 32), fluidMat(FLUID.water, { transparent: true, opacity: 0.85 }), g, [x - 5, y + 9.2, z], [0, 0, 0], { tone: 0.3 });
    bath.scale.y = 7.5;
    const scr = makeScreen(7.6, 3.4, 26, lcdDraw);
    scr.mesh.position.set(x - 20, y + 3.6, z + 6.06); g.add(scr.mesh); scr.paint({ title: '35 mbar', lines: [], rows: 1 });
    return { rot, flaskLiq, recvLiq, spin: 0, spinGoal: 0, fill: 0, fillGoal: 0, recv: 0, recvGoal: 0, scr, cx, cz };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.spin = damp(R.spin, R.spinGoal, 2, dt); R.rot.rotation.y = 0; R.rot.children.forEach(c => { c.rotation.y += dt * R.spin * 6; });
    R.fill = damp(R.fill, R.fillGoal, 1.5, dt); R.flaskLiq.scale.setScalar(Math.max(0.01, R.fill));
    R.recv = damp(R.recv, R.recvGoal, 1.2, dt); R.recvLiq.scale.set(1, Math.max(0.02, R.recv), 1);
    if (R.spin > 0.5 && Math.random() < dt * 8) fx.drops.emit(V(R.cx, ROTA.y + 37, R.cz), V(0, -10, 0), FLUID.context, 0.8, 0.4, { floor: ROTA.y + 29 });
    if (R.spin > 0.5 && Math.random() < dt * 6) fx.puffs.emit(V(ROTA.x - 3, ROTA.y + 34, ROTA.z - 1), V(6, 10, 3), 0xcfe8f0, 1.2, 3, 1.4, 0.35);
  },
});
const DOCK = { x: -88, z: 76, y: FLOOR + 24 };
station('dock', {
  name: '无人机坞站', role: '子 agent · spawn_subagent', color: FLUID.cache,
  desc: '派出子 agent（spawn_subagent）时，坞站上的四旋翼带着样品出发：天窗打开，飞出车外，每 2 秒发回一次进度（subagent_progress），完成后带着结果回来（subagent_finished）。',
  work: [DOCK.x, 140, DOCK.z - 14], pin: [DOCK.x, DOCK.y + 40, DOCK.z],
  build(S, g) {
    const { x, z, y } = DOCK, k = new Kit({ tone: 0.5 });
    k.box(34, 2, 26, { p: [x, y, z], rr: 2, b: 0.5, color: MAT.graphite, tone: 0.45 });
    k.line(ringPts(x, y + 2.06, z, 9, 36), 'mid'); k.line(ringPts(x, y + 2.06, z, 6.5, 36), 'lo');
    k.line([[x - 3, y + 2.06, z - 4], [x - 3, y + 2.06, z + 4]], 'mid'); k.line([[x + 3, y + 2.06, z - 4], [x + 3, y + 2.06, z + 4]], 'mid'); k.line([[x - 3, y + 2.06, z], [x + 3, y + 2.06, z]], 'mid');
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(3, 1, 3, { p: [x + sx * 14, y + 2, z + sz * 10], color: MAT.brass, tone: 0.5 });
    // roof hatch frame above the dock
    k.box(36, 2, 3, { p: [x, ROOF - 6, z - 17], color: MAT.steel, tone: 0.45 }); k.box(36, 2, 3, { p: [x, ROOF - 6, 87], color: MAT.steel, tone: 0.45 });
    k.finish(g);
    const drone = group(g, [x, y + 2, z]);
    const kd = new Kit({ tone: 0.85 });
    kd.box(8, 3, 8, { p: [0, 2.4, 0], rr: 2, b: 0.6, color: MAT.paper });
    kd.box(4, 1.6, 4, { p: [0, 5.4, 0], rr: 1, b: 0.3, color: MAT.alu });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      kd.tube([[sx * 3, 4, sz * 3], [sx * 8.5, 4.6, sz * 8.5]], 0.6, { color: MAT.paper, radial: 8 });
      kd.cyl(1.2, 2, { p: [sx * 8.5, 4, sz * 8.5], color: MAT.graphite, seg: 14 });
      kd.torus(4.4, 0.35, { p: [sx * 8.5, 5.4, sz * 8.5], tub: 32, color: MAT.paper, tone: 0.7 });
    }
    for (const sx of [-1, 1]) kd.tube([[sx * 3, 1.2, -4], [sx * 3.6, 0, -4], [sx * 3.6, 0, 4], [sx * 3, 1.2, 4]], 0.35, { bend: 0.8, color: MAT.graphite, radial: 6 });
    kd.finish(drone);
    const rotors = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => { const r = mesh(slabGeo(7.6, 0.2, 0.9, 0.4, 0), solid(MAT.graphite), drone, [sx * 8.5, 6.1, sz * 8.5], [0, 0, 0], { tone: 0.8, cast: false }); return r; });
    const ledMat = solid(0xffffff, { glow: 0.2, glowColor: FLUID.cache });
    mesh(sphereGeo(0.7, 10, 8), ledMat, drone, [0, 2.6, 4.1], [0, 0, 0], { tone: 0.6 });
    return { drone, rotors, ledMat, spin: 0, home: V(x, y + 2, z), flight: null };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.rotors.forEach((r, i) => { r.rotation.y += dt * R.spin * (i % 2 ? 40 : -40); });
    R.ledMat.userData.u.uGlow.value = R.flight ? (Math.sin(t * 9) > 0 ? 1 : 0.2) : 0.25;
    const F = R.flight;
    if (F) {
      F.t += dt / F.dur;
      const k = ease(Math.min(1, F.t));
      const p = new THREE.Vector3().copy(F.a).multiplyScalar((1 - k) * (1 - k)).addScaledVector(F.c, 2 * k * (1 - k)).addScaledVector(F.b, k * k);
      R.drone.position.copy(p); R.drone.rotation.z = Math.sin(k * Math.PI) * 0.25 * F.dir;
      R.spin = 1;
      if (F.t >= 1) { const cb = F.done; R.flight = null; R.drone.rotation.z = 0; cb?.(); }
    } else R.spin = damp(R.spin, 0, 1.5, dt);
  },
});
const RACK = { x: -14, z: 79 };
station('rack', {
  name: '仪器机柜', role: 'MCP 服务 · mcp_server', color: FLUID.cache,
  desc: '每个 MCP 服务是机柜里的一个模块：启动时自检灯走一遍，连上后常亮，模块数和工具数显示在面板上。',
  work: [RACK.x, 130, RACK.z - 18], pin: [RACK.x, FLOOR + 60, RACK.z],
  build(S, g) {
    const { x, z } = RACK, k = new Kit({ tone: 0.5 }), w = 28, d = 22, h = 50;
    k.box(w, 4, d, { p: [x, FLOOR, z], color: MAT.graphite, tone: 0.35 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(2.4, h, 2.4, { p: [x + sx * (w / 2 - 1.2), FLOOR + 4, z + sz * (d / 2 - 1.2)], color: MAT.graphite, tone: 0.5 });
    k.box(w, 2, d, { p: [x, FLOOR + 4 + h, z], b: 0.4, color: MAT.graphite, tone: 0.5 });
    const mods = [];
    [[FLOOR + 40, 'MCP-A'], [FLOOR + 29, 'MCP-B'], [FLOOR + 18, 'PDU'], [FLOOR + 8, 'UPS']].forEach(([yy, name], i) => {
      k.box(w - 5, 9, d - 3, { p: [x, yy, z - 1], rr: 0.6, b: 0.3, color: i < 2 ? MAT.paper : MAT.pale, tone: 0.55 });
      for (const sx of [-1, 1]) k.screw(x + sx * 11.6, yy + 4.5, z + d / 2 - 2.4 - 0.1 + 0.5, { axis: '-z', r: 0.35 });
      for (let xx = x - 9; xx < x - 1; xx += 1.3) k.line([[xx, yy + 2, z - d / 2 + 0.43], [xx, yy + 7, z - d / 2 + 0.43]], 'lo');
      mods.push(yy);
    });
    // patch cables up to the tray under the roof
    for (const [i, yy] of mods.slice(0, 2).entries()) k.tube([[x + 8 + i * 2, yy + 6, z - d / 2 - 0.5], [x + 8 + i * 2, yy + 6, z - d / 2 - 3], [x + 10 + i * 2, FLOOR + 62, z - 14], [x + 14, 182, 74]], 0.45, { bend: 5, color: i ? MAT.amberlamp : FLUID.cache, paint: 1, radial: 6 });
    k.finish(g);
    const leds = [];
    mods.slice(0, 2).forEach((yy, mi) => { for (let i = 0; i < 4; i++) leds.push({ m: mesh(sphereGeo(0.45, 8, 6), solid(0xffffff, { glow: 0.1, glowColor: FLUID.ok }), g, [x + 3 + i * 2, yy + 6.4, z - d / 2 + 0.6], [0, 0, 0], { tone: 0.6, cast: false }), mod: mi, i }); });
    return { leds, boot: [0, 0], online: [false, false] };
  },
  update(S, t, dt) {
    const R = S.refs;
    for (const L of R.leds) {
      const b = R.boot[L.mod], on = R.online[L.mod];
      const k = b > 0 ? (Math.floor(t * 8 + L.i) % 4 === 0 ? 1 : 0.15) : on ? (L.i === 3 ? 0.4 + 0.6 * (Math.sin(t * 13 + L.mod) > 0.6 ? 1 : 0) : 0.85) : 0.08;
      L.m.material.userData.u.uGlow.value = k; L.m.material.userData.u.uGlowColor.value.set(b > 0 ? MAT.amberlamp : FLUID.ok);
    }
    R.boot = R.boot.map(b => Math.max(0, b - dt));
  },
});
station('antenna', {
  name: '天线与接收机', role: '联网搜索 / 抓网页 · web_search / web_fetch', color: FLUID.cache,
  desc: '车顶的抛物面天线连着侧门边的接收机。联网搜索和抓网页时天线转向、接收机屏幕上出现波形。',
  work: [34, 140, 60], pin: [34, ROOF + 30, 70],
  build(S, g) {
    const x = 34, z = 79, k = new Kit({ tone: 0.5 });
    k.box(26, 44, 20, { p: [x, FLOOR, z], rr: 1.5, b: 0.6, color: MAT.pale, tone: 0.45 });
    k.box(22, 12, 1, { p: [x, FLOOR + 28, z - 10.4], rr: 0.8, b: 0.2, color: MAT.paper, tone: 0.55 });
    for (const dx of [-7, -3]) k.cyl(1.4, 1.4, { p: [x + dx, FLOOR + 22, z - 10.4], r: [-Math.PI / 2, 0, 0], color: MAT.graphite, b: 0.3 });
    for (let xx = x - 10; xx < x + 10; xx += 1.5) k.line([[xx, FLOOR + 6, z - 10.03], [xx, FLOOR + 16, z - 10.03]], 'lo');
    // mast through the roof
    k.cyl(1.2, ROOF + 14 - (FLOOR + 44), { p: [x, FLOOR + 44, z - 2], color: MAT.steel, seg: 12, tone: 0.5 });
    k.cyl(4, 2, { p: [x, ROOF, z - 2], color: MAT.graphite, b: 0.4 });
    k.finish(g);
    const dish = group(g, [x, ROOF + 14, z - 2]);
    const kd = new Kit({ tone: 0.75 });
    kd.box(3, 4, 3, { p: [0, 0, 0], b: 0.4, color: MAT.alu });
    kd.at([0, 6, 0], [-0.8, 0, 0], kk => {
      kk.lathe([[0, 0], [10, 2.8, 1], [10.6, 3.4], [10, 3.2], [0, 0.6]], { seg: 40, color: MAT.paper });
      for (const a of [0, 2.1, 4.2]) kk.tube([[Math.cos(a) * 9, 3, Math.sin(a) * 9], [0, 9, 0]], 0.25, { radial: 5, color: MAT.steel });
      kk.cyl(1, 2, { p: [0, 9, 0], color: MAT.graphite });
    });
    kd.finish(dish);
    const scr = makeScreen(20, 10, 16, (c, w, h, s, P) => {
      c.strokeStyle = P.screenInk; c.lineWidth = Math.max(1, h * 0.02); c.beginPath();
      for (let i = 0; i <= 80; i++) { const u = i / 80, v = 0.55 + Math.sin(u * 40 + (s.ph || 0)) * 0.22 * (s.amp ?? 0.1) * Math.sin(u * Math.PI); i ? c.lineTo(u * w, v * h) : c.moveTo(0, v * h); }
      c.stroke(); c.fillStyle = P.screenInk; c.font = `500 ${h * 0.14}px ${FONT_MONO}`; c.textBaseline = 'top'; c.fillText(fitText(c, s.title || 'RX · 待命', w * 0.9), w * 0.04, h * 0.05);
    });
    scr.mesh.position.set(x, FLOOR + 34, z - 10.95); scr.mesh.rotation.y = Math.PI; g.add(scr.mesh);
    scr.mesh.scale.set(1.02, 1, 1);
    scr.paint({ title: 'RX · 待命', amp: 0.08 });
    return { dish, scr, on: 0, onGoal: 0, ph: 0, rings: [] };
  },
  update(S, t, dt) {
    const R = S.refs; R.on = damp(R.on, R.onGoal, 3, dt);
    R.dish.rotation.y += dt * (0.15 + R.on * 1.6);
    if (R.on > 0.1) { R.ph += dt * 12; if (Math.floor(t * 10) !== R.lastPaint) { R.lastPaint = Math.floor(t * 10); R.scr.paint({ title: R.title, amp: R.on, ph: R.ph }); } }
  },
});
station('waste', {
  name: '废液桶', role: '失败 / 被拒的工单', color: FLUID.err,
  desc: '工具失败或权限被拒时，红盖的工单样品被扔进废液桶。',
  work: [-194, 140, 62], pin: [-194, FLOOR + 62, 70],
  build(S, g) {
    const x = -194, z = 70, y = FLOOR + 24, k = new Kit({ tone: 0.5 });
    k.lathe([[0, 0], [8, 0], [8.6, 0.6, 1], [9.2, 22, 1], [9.6, 22.6], [9.6, 23.4], [0, 23.4]], { p: [x, y, z], color: MAT.paper, seg: 32 });
    k.box(8, 1.4, 4, { p: [x, y, z + 9], color: MAT.graphite });
    // two gas cylinders strapped behind it
    for (const [cx, hex] of [[-228, MAT.steel], [-214, 0x9bb3c9]]) {
      k.lathe([[0, 0], [6, 0], [6.3, 0.6, 1], [6.3, 44, 1], [5.2, 49, 1], [2, 51.5], [2, 54], [0, 54]], { p: [cx, y, 80], color: hex, seg: 28, tone: 0.5 });
      k.cyl(2.2, 4, { p: [cx, y + 54, 80], color: MAT.brass, b: 0.3 });
      k.cyl(2.4, 1.2, { p: [cx + 2.4, y + 57, 80], r: [0, 0, -Math.PI / 2], color: MAT.paper, b: 0.2 });
    }
    k.box(24, 2.4, 1.2, { p: [-221, y + 34, 86.6], color: MAT.graphite });
    k.finish(g);
    const lid = group(g, [x, y + 23.4, z - 9.6]);
    const kl = new Kit({ tone: 0.7 }); kl.lathe([[0, 0], [9.8, 0], [9.8, 1.6], [8, 2.6], [0, 2.8]], { p: [0, 0, 9.6], color: FLUID.err, paint: 1, seg: 32 }); kl.finish(lid);
    return { lid, open: 0, openGoal: 0, dropAt: V(x, y + 26, z) };
  },
  update(S, t, dt) { const R = S.refs; R.open = damp(R.open, R.openGoal, 6, dt); R.lid.rotation.x = -R.open * 1.2; },
});

// ── 11 · the cab: teletype (user messages and answers), gauges (tok/s, odometer), seats ──
station('cab', {
  name: '驾驶台', role: '委托与回复 · prompt / answer', color: FLUID.user,
  desc: '电传打印机打出你发来的委托（用户消息），也打出 agent 的回答。速度表指的是当前流式输出的 tok/s，里程表是本机所有 grok 会话累计的 token。',
  work: [96, 152, -40], pin: [196, 160, 0],
  build(S, g) {
    const k = new Kit({ tone: 0.45 });
    // dashboard shelf and cowl, instrument hood behind the wheel
    k.box(26, 22, 182, { p: [204, 106, 0], rr: 4, b: 1.2, color: MAT.pale, tone: 0.45 });
    k.box(14, 6, 40, { p: [197, 128, -46], rr: 3, b: 1, color: MAT.graphite, tone: 0.5 });
    for (let zz = -80; zz <= 80; zz += 4) k.line([[214, 128.06, zz], [218, 128.06, zz]], 'lo');
    // steering wheel and column
    k.at([181, 136, -46], [0, 0, -1.0], kk => { kk.torus(15, 1.3, { tub: 48, color: MAT.graphite, tone: 0.7 }); kk.cyl(3.4, 2.2, { p: [0, -1.1, 0], color: MAT.graphite, b: 0.6 }); for (const a of [0.3, Math.PI - 0.3, -Math.PI / 2]) kk.tube([[Math.cos(a) * 3, 0, Math.sin(a) * 3], [Math.cos(a) * 14, 0, Math.sin(a) * 14]], 0.9, { color: MAT.graphite, radial: 8 }); kk.cyl(1.6, 16, { p: [0, -17, 0], color: MAT.graphite }); });
    // seats
    for (const sz of [-1, 1]) {
      const sx = 138, zz = sz * 46;
      k.box(30, 14, 34, { p: [sx, FLOOR, zz], rr: 2, b: 0.6, color: MAT.graphite, tone: 0.4 });
      k.box(40, 9, 44, { p: [sx + 2, FLOOR + 14, zz], rr: 5, b: 2, color: 0xc9c6bf, tone: 0.5 });
      k.at([sx - 18, FLOOR + 22, zz], [0, 0, 0.22], kk => { kk.box(9, 52, 44, { p: [0, 0, 0], rr: 5, b: 2, color: 0xc9c6bf, tone: 0.5 }); kk.box(7, 15, 24, { p: [0, 58, 0], rr: 4, b: 1.5, color: 0xc9c6bf, tone: 0.5 }); for (const dz of [-6, 6]) kk.cyl(0.6, 6, { p: [0, 52, dz], color: MAT.steel }); });
      k.line([[sx - 17, FLOOR + 76, zz + sz * 20], [sx + 10, FLOOR + 24, zz - sz * 18]], 'mid');
    }
    // gear lever between the seats
    k.box(16, 18, 20, { p: [148, FLOOR, 0], rr: 3, b: 0.8, color: MAT.graphite, tone: 0.4 });
    k.cyl(0.8, 14, { p: [150, FLOOR + 18, 0], color: MAT.steel }); k.sphere(2.2, { p: [150, FLOOR + 33, 0], color: MAT.graphite });
    // teletype on the centre of the dash: case, paper roll, platen
    k.box(22, 13, 26, { p: [194, 117, 4], rr: 2, b: 0.8, color: MAT.paper, tone: 0.6 });
    k.cyl(4.6, 22, { p: [200, 133.6, 4 - 11], r: [Math.PI / 2, 0, 0], color: 0xf7f5ee, seg: 28, tone: 0.55 });
    k.cyl(1.2, 26, { p: [200, 133.6, 4 - 13], r: [Math.PI / 2, 0, 0], color: MAT.steel, seg: 12 });
    k.box(4, 3, 22, { p: [184.5, 125, 4], color: MAT.graphite });
    for (let zz = -6; zz <= 14; zz += 2) k.line([[183.4, 120, zz], [183.4, 124, zz]], 'lo');
    k.finish(g);
    // live: the printed tape curling over the edge, two gauges
    const tape = makeScreen(20, 46, 10, (c, w, h, s, P) => {
      c.fillStyle = THEME === 'dark' ? '#202020' : '#fbfaf3'; c.fillRect(0, 0, w, h);
      c.fillStyle = P.ink; c.font = `400 ${w * 0.075}px ${FONT_MONO}`; c.textBaseline = 'top';
      const lines = s.lines || [];
      let yy = h - w * 0.12;
      for (let i = lines.length - 1; i >= 0 && yy > 0; i--) { c.globalAlpha = lines[i].dim ? 0.55 : 0.9; c.fillText(fitText(c, lines[i].t, w * 0.9), w * 0.05, yy); yy -= w * 0.1; }
      c.globalAlpha = 1;
    });
    const tg = new THREE.PlaneGeometry(20, 46, 1, 24), pos = tg.attributes.position;
    for (let i = 0; i < pos.count; i++) { const v = pos.getY(i) + 23, a = (v / 46) * 2.2; pos.setXYZ(i, pos.getX(i), Math.sin(a) * 12 - 6, -Math.cos(a) * 12 + 12); }
    tg.computeVertexNormals();
    tape.mesh.geometry.dispose(); tape.mesh.geometry = tg; tape.mesh.material.side = THREE.DoubleSide;
    tape.mesh.position.set(183, 124, 4); tape.mesh.rotation.y = -Math.PI / 2; tape.mesh.rotation.order = 'YXZ';
    g.add(tape.mesh); tape.paint({ lines: [{ t: 'MV-01 TELETYPE READY', dim: true }] });
    const gauge = (z, draw) => { const s = makeScreen(11, 11, 22, draw); s.mesh.position.set(190.4, 128.5, z); s.mesh.rotation.y = -Math.PI / 2; s.mesh.rotation.x = 0; g.add(s.mesh); return s; };
    const speedo = gauge(-52, (c, w, h, s, P) => {
      c.strokeStyle = P.screenInk; c.fillStyle = P.screenInk; c.lineWidth = Math.max(1, w * 0.012);
      c.beginPath(); c.arc(w / 2, h / 2, w * 0.44, 0, TAU); c.stroke();
      for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * w * 0.38, h / 2 + Math.sin(a) * w * 0.38); c.lineTo(w / 2 + Math.cos(a) * w * (i % 5 ? 0.33 : 0.3), h / 2 + Math.sin(a) * w * (i % 5 ? 0.33 : 0.3)); c.stroke(); }
      const v = clamp((s.v || 0) / 120, 0, 1), a = Math.PI * 0.75 + v * Math.PI * 1.5;
      c.lineWidth = Math.max(1.5, w * 0.022); c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * w * 0.34, h / 2 + Math.sin(a) * w * 0.34); c.stroke();
      c.font = `500 ${w * 0.1}px ${FONT_MONO}`; c.textAlign = 'center'; c.fillText(`${Math.round(s.v || 0)} tok/s`, w / 2, h * 0.76); c.textAlign = 'left';
    });
    const odo = gauge(-38, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.font = `600 ${w * 0.1}px ${FONT_MONO}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('ODO', w / 2, h * 0.28);
      const digits = String(Math.round(s.v || 0)).padStart(8, '0');
      for (let i = 0; i < 8; i++) { const xx = w * 0.1 + i * w * 0.1; c.globalAlpha = 0.18; c.fillRect(xx, h * 0.42, w * 0.085, h * 0.2); c.globalAlpha = 1; c.font = `600 ${w * 0.1}px ${FONT_MONO}`; c.fillText(digits[i], xx + w * 0.0425, h * 0.53); }
      c.font = `400 ${w * 0.08}px ${FONT_MONO}`; c.fillText('tokens', w / 2, h * 0.78); c.textAlign = 'left';
    });
    speedo.paint({ v: 0 }); odo.paint({ v: 0 });
    return { tape, tapeLines: [{ t: 'MV-01 TELETYPE READY', dim: true }], speedo, odo };
  },
});
