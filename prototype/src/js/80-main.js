// ═════════════════════════ camera: isometric; follows the robot, frames a station, or the whole van ═════════════════════════
const CAM = { az: -38 * DEG, el: 30 * DEG, zoom: 520, target: V(-10, 120, 0) };
const CAM_GOAL = { az: CAM.az, el: CAM.el, zoom: CAM.zoom, target: CAM.target.clone() };
let camMode = 'follow', userZoom = 1, camStation = null, userTouched = false;
const camDir = (az, el) => V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
function freeArea() {
  const narrow = innerWidth <= 860, hidden = document.body.dataset.panels === 'hide';
  const leftEl = $('#notebook')?.getBoundingClientRect(), rightEl = $('#instruments')?.getBoundingClientRect();
  const left = narrow || hidden || !leftEl?.width ? 0 : leftEl.right;
  const right = narrow || hidden || !rightEl?.width ? 0 : innerWidth - rightEl.left;
  const top = 48, bottom = narrow ? 84 : 76;
  return { left, right, top, bottom, w: Math.max(200, innerWidth - left - right - 20), h: Math.max(200, innerHeight - top - bottom) };
}
function applyCamera() {
  const A = freeArea(), aspect = innerWidth / innerHeight, h = CAM.zoom, w = h * aspect;
  const sx = ((A.left - A.right) / 2 / innerWidth) * w, sy = ((A.bottom - A.top) / 2 / innerHeight) * h;
  camera.left = -w / 2 - sx; camera.right = w / 2 - sx; camera.top = h / 2 - sy; camera.bottom = -h / 2 - sy;
  camera.position.copy(CAM.target).addScaledVector(camDir(CAM.az, CAM.el), 3000);
  camera.near = 1; camera.far = 6000;
  camera.lookAt(CAM.target); camera.updateProjectionMatrix();
}
function fitZoom(pts, az, el, pad = 1.08) {
  const d = camDir(az, el), right = V(Math.cos(az), 0, -Math.sin(az)), up = new THREE.Vector3().crossVectors(right, d).negate();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const c = V();
  for (const p of pts) { const x = p.dot(right), y = p.dot(up); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); c.add(p); }
  c.multiplyScalar(1 / pts.length);
  const A = freeArea(), hFromW = (x1 - x0) * (innerHeight / A.w), hFromH = (y1 - y0) * (innerHeight / A.h);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, cc = c.clone();
  cc.addScaledVector(right, mx - c.dot(right)).addScaledVector(up, my - c.dot(up));
  return { zoom: Math.max(hFromW, hFromH) * pad, center: cc };
}
// the overview frames the van itself; the display base may run off the edges a little
const VAN_BOX = (() => { const pts = []; for (const x of [VAN.x0 - 24, VAN.x1 + 14]) for (const y of [-12, ROOF + 8]) for (const z of [-VAN.z - 20, VAN.z + 40]) pts.push(V(x, y, z)); return pts; })();
const FOLLOW_ZOOM = () => (innerWidth / innerHeight < 0.8 ? 400 : innerWidth <= 860 ? 300 : 235);
const tmpF = V();
function updateCamera(dt) {
  if (camMode === 'overview') { const f = fitZoom(VAN_BOX, CAM_GOAL.az, CAM_GOAL.el, 1.04); CAM_GOAL.zoom = f.zoom * userZoom; CAM_GOAL.target.copy(f.center); }
  else if (camMode === 'follow') {
    const head = robotParts.head.getWorldPosition(tmpF);
    CAM_GOAL.target.set(head.x, lerp(head.y, BENCH + 18, 0.5), head.z * 0.7 - 12);
    CAM_GOAL.zoom = FOLLOW_ZOOM() * userZoom;
  } else if (camMode === 'station' && camStation) { CAM_GOAL.target.copy(camStation.pin).add(V(0, -24, 10)); CAM_GOAL.zoom = 170 * userZoom; }
  CAM.az = damp(CAM.az, CAM_GOAL.az, 5, dt); CAM.el = damp(CAM.el, CAM_GOAL.el, 5, dt);
  CAM.zoom = damp(CAM.zoom, CAM_GOAL.zoom, 2.6, dt);
  for (const k of ['x', 'y', 'z']) CAM.target[k] = damp(CAM.target[k], CAM_GOAL.target[k], camMode === 'follow' ? 2.2 : 3, dt);
  applyCamera();
}
function snapCamera() { updateCamera(0); CAM.az = CAM_GOAL.az; CAM.el = CAM_GOAL.el; CAM.zoom = CAM_GOAL.zoom; CAM.target.copy(CAM_GOAL.target); applyCamera(); }
function setView(v, instant = false) {
  camMode = v; camStation = null; userZoom = 1;
  document.querySelectorAll('#view-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (instant) snapCamera();
}
function focusStation(id, user = false) {
  focus(id);
  if (!user) return;
  camMode = 'station'; camStation = ST[id]; userZoom = 1;
  document.querySelectorAll('#view-seg button').forEach(b => b.setAttribute('aria-pressed', 'false'));
}

// ═════════════════════════ controls ═════════════════════════
$('#view-seg').addEventListener('click', ev => { const b = ev.target.closest('button[data-view]'); if (b) { userTouched = true; setView(b.dataset.view); } });
function setSpeed(s) { clock.speed = s; document.querySelectorAll('#speed-seg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.speed === s))); }
$('#speed-seg').addEventListener('click', ev => { const b = ev.target.closest('button[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
const pauseBtn = $('#pause');
function paintPause() {
  pauseBtn.setAttribute('aria-label', clock.paused ? '继续' : '暂停');
  pauseBtn.innerHTML = clock.paused ? '<svg viewBox="0 0 16 16"><path d="M5 3.5l8 4.5-8 4.5z"/></svg>' : '<svg viewBox="0 0 16 16"><path d="M5.5 3.5v9M10.5 3.5v9"/></svg>';
}
pauseBtn.addEventListener('click', () => { clock.paused = !clock.paused; paintPause(); });
$('#xray').addEventListener('input', ev => setXray(+ev.target.value / 100));
// hide both side panels to give the drawing the whole window
$('#panels-btn').addEventListener('click', ev => { const hide = document.body.dataset.panels !== 'hide'; document.body.dataset.panels = hide ? 'hide' : ''; ev.currentTarget.setAttribute('aria-pressed', String(!hide)); hud.stats(); });
$('#pins-btn').addEventListener('click', ev => { const on = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; ev.currentTarget.setAttribute('aria-pressed', String(on)); pinsEl.classList.toggle('hide', !on); });
$('#theme-btn').addEventListener('click', () => { const next = THEME === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; applyTheme(next); hud.stats(); });
new MutationObserver(() => { const t = detectTheme(); if (t !== THEME) { applyTheme(t); hud.stats(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { const t = detectTheme(); if (t !== THEME) { applyTheme(t); hud.stats(); } });
const demoPop = $('#demo-pop'), demoBtn = $('#demo-btn');
demoBtn.addEventListener('click', () => { demoPop.hidden = !demoPop.hidden; demoBtn.setAttribute('aria-expanded', String(!demoPop.hidden)); });
demoPop.addEventListener('click', ev => {
  const b = ev.target.closest('button[data-ti]'); if (!b) return;
  demoPop.hidden = true; demoBtn.setAttribute('aria-expanded', 'false');
  jumpTo(+b.dataset.ti);
});
$('#src-seg').addEventListener('click', ev => { const b = ev.target.closest('button[data-src]'); if (b) switchSource(b.dataset.src); });
$('#rtabs').addEventListener('click', ev => {
  const b = ev.target.closest('button[data-tab]'); if (!b) return;
  const codex = b.dataset.tab === 'codex';
  $('#codex-pane').hidden = !codex; $('#ins-pane').hidden = codex; $('#rp-title').textContent = codex ? '图鉴' : '仪表';
  document.querySelectorAll('#rtabs button').forEach(x => { const on = x === b; x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-selected', String(on)); });
  if (codex) renderCodex(true); else hud.stats();
});
document.querySelectorAll('.capsule button[data-sheet]').forEach(b => b.addEventListener('click', () => {
  const on = document.body.dataset.sheet === b.dataset.sheet ? '' : b.dataset.sheet;
  document.body.dataset.sheet = on;
  document.querySelectorAll('.capsule button[data-sheet]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.sheet === on)));
  if (on === 'instruments') hud.stats();
}));
addEventListener('keydown', ev => {
  if (ev.target.closest?.('input, textarea, [contenteditable]') || !dlg.hidden) return;
  if (ev.key === ' ') { ev.preventDefault(); clock.paused = !clock.paused; paintPause(); }
  else if ('1248'.includes(ev.key) && ev.key.length === 1) setSpeed(+ev.key);
  else if (ev.key === 'f') setView('follow');
  else if (ev.key === 'o') setView('overview');
});
// drag turns the drawing (within the range that keeps the cut side toward you); the wheel zooms
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null, dragLast = null;
canvas.addEventListener('pointerdown', ev => { userTouched = true; downAt = [ev.clientX, ev.clientY]; dragLast = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointermove', ev => {
  if (!dragLast || !(ev.buttons & 1)) return;
  CAM_GOAL.az = clamp(CAM_GOAL.az - (ev.clientX - dragLast[0]) * 0.0045, -82 * DEG, 62 * DEG);
  CAM_GOAL.el = clamp(CAM_GOAL.el + (ev.clientY - dragLast[1]) * 0.0035, 12 * DEG, 68 * DEG);
  dragLast = [ev.clientX, ev.clientY];
});
canvas.addEventListener('wheel', ev => { ev.preventDefault(); userZoom = clamp(userZoom * (1 + ev.deltaY * 0.0012), 0.35, 3.2); }, { passive: false });
canvas.addEventListener('pointerup', ev => {
  dragLast = null;
  if (!downAt) return; const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]); downAt = null; if (moved > 6) return;
  ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([...ST_LIST.map(S => S.g), robotParts.bridge], true)[0]; if (!hit) return;
  let o = hit.object; while (o && !o.userData.station && o !== robotParts.bridge) o = o.parent;
  if (!o) return;
  if (o === robotParts.bridge) { inspectRobot(); return; }
  inspectStation(o.userData.station.id); focusStation(o.userData.station.id, true);
});
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); makeTargets(); applyCamera(); hud.stats(); });

// ═════════════════════════ quality governor ═════════════════════════
const perf = { acc: 0, n: 0, cool: 0, locked: location.hash === '#hq' };
function samplePerf(dt) {
  if (perf.locked) return;
  perf.acc += dt; perf.n++;
  if (perf.n < 90) return;
  const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
  if (avg < 0.036 || DPR <= 1 || performance.now() < perf.cool) return;
  DPR = DPR > 1.5 ? 1.5 : 1; perf.cool = performance.now() + 5000;
  renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight, false); makeTargets();
  toast('画质', `渲染分辨率降到 ${DPR}× 以保持流畅`);
}

// ═════════════════════════ frame loop ═════════════════════════
let last = 0, sceneClock = 0, hudT = 0;
function step(dtReal, now) {
  const playing = !clock.paused, dt = playing ? dtReal * (clock.blocked || clock.hold ? 1.5 : clock.speed) : 0;
  sceneClock += dt;
  if (playing && !clock.blocked && !clock.hold) clock.vt += dtReal * 1000 * clock.speed;
  pump();
  runTimers(timers, dt); runTimers(realTimers, playing ? dtReal : 0);
  S_.bucket = Math.min(3, S_.bucket + dt * 9);
  const t = now / 1000;
  for (const S of ST_LIST) {
    if (S.stateUntil && sceneClock > S.stateUntil) { S.state = 'idle'; S.stateUntil = 0; }
    S.lit = damp(S.lit, S.litGoal, 3, dtReal);
    S.update?.(S, t, dt);
  }
  robotUpdate(dt, t);
  fx.drops.update(dt); fx.puffs.update(dt);
  updateReceivers(dt);
  hudT -= dtReal;
  if (hudT <= 0) { hudT = 0.25; readout(); renderCodex(); if (stats.tps) ST.cab.refs.speedo.paint({ v: stats.tps }); }
}
function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  samplePerf(dtReal);
  step(dtReal, now);
  updateCamera(dtReal);
  updatePins();
  renderFrame();
  requestAnimationFrame(frame);
}
function start(data = {}) {
  buildBase(); buildVan(); buildBench(); buildNearBox(); buildRobot();
  fx.drops = new DropPool(600, 0.5, world); fx.puffs = new PuffPool(200, world);
  applyTheme(detectTheme());
  // the freezer starts with every turn this machine has already run
  for (let i = 0; i < ARCHIVE.turns && i < FR_SLOTS.length; i++) ST.archive.refs.put(i, FLUID.text, i % 7 === 3 ? 0xffcf1a : 0x2f7bff);
  ST.archive.refs.scr.paint({ n: ARCHIVE.turns });
  paintSource(); renderChapters(); renderCodex(true);
  ST.sign.refs.scr.paint({ t: SESSION.title || 'MV-01' });
  if (data.speed) setSpeed(data.speed);
  // open on the whole van (that first still is the page's thumbnail), then move in to follow the arm
  setView(data.view === 'follow' ? 'follow' : 'overview');
  if (data.view !== 'overview') afterReal(3.2, () => { if (camMode === 'overview' && !userTouched) setView('follow'); });
  hud.stats(); hud.run(null, null); hud.archive(); paintPause(); renderStations(); paintGauges();
  setCtx(0); hud.ctx(0, false); $('#ctx-num').textContent = '等待首条更新'; $('#ctx-pct').textContent = '—'; ST.tower.refs.level = 0;
  feed('sys', '开机', `MV-01 · ${SRC_NAME[SRC]} · ${PROJECT} · ${SESSION.model}；接上实时数据后同一辆车直接用`, null);
  toast(SRC_NAME[SRC], `${PROJECT} · ${TRACE.turns.length - 1} 个回合 · 右上「图鉴」看事件覆盖`);
  snapCamera();
  document.fonts?.ready?.then(() => { for (const f of THEMED) f(PALETTES[THEME], THEME); });
  requestAnimationFrame(now => { last = now; requestAnimationFrame(frame); });
}
// test hook for headless previews: advance the simulation without rendering every step
window.__starfleet = {
  auto: false,
  async simulate(sec, fps = 30) { const dt = 1 / fps; let now = performance.now(); for (let i = 0; i < sec * fps; i++) { now += dt * 1000; step(dt, now); updateCamera(dt); if (i % 15 === 0) await new Promise(r => setTimeout(r, 0)); } updatePins(); renderFrame(); },
  view(v, opts = {}) { if (opts.az != null) CAM_GOAL.az = opts.az * DEG; if (opts.el != null) CAM_GOAL.el = opts.el * DEG; if (v === 'at') { camMode = 'fixed'; CAM_GOAL.target.set(...opts.target); CAM_GOAL.zoom = opts.zoom; } else setView(v); snapCamera(); updatePins(); renderFrame(); },
  theme(t) { document.documentElement.dataset.theme = t; applyTheme(t); renderFrame(); },
  xray(v) { setXray(v); renderFrame(); },
  jump: ti => jumpTo(ti),
  source: name => switchSource(name),
  codex: () => ({ seen: CODEX.filter(c => SEEN.has(c[0])).length, total: CODEX.length, missing: CODEX.filter(c => !SEEN.has(c[0])).map(c => c[0]) }),
  speed: setSpeed,
  state: () => ({ vt: clock.vt, cursor, total: TL.length, robot: ROBOT.text, mode: ROBOT.mode, tasks: ROBOT.tasks.length, turn: S_.turn, archive: ARCHIVE.turns }),
};
try { window.claude?.hot?.snapshot?.(() => ({ speed: clock.speed, view: camMode === 'overview' ? 'overview' : 'follow' })); } catch (err) { /* optional viewer hook */ }
if (window.claude?.hot?.ready) window.claude.hot.ready(start); else start(window.claude?.hot?.data ?? {});
