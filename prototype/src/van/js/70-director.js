// ═════════════════════════ director: trace events → the lab ═════════════════════════
// blocked: a human decision is pending (the replay waits for you)
const clock = { vt: 0, speed: 2, paused: false, blocked: false, hold: 0 };
let cursor = 0, skipTurn = null;
const S_ = { turn: null, loop: null, loopReal: 0, ctx: 0, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], bucket: 2, firstTool: false, firstFail: false, firstHuman: false, ended: false, forming: null, mode: 'default', yolo: false };
const ARCHIVE = { base: ARCHIVE_BASE.turns, turns: ARCHIVE_BASE.turns, tokens: ARCHIVE_BASE.tokens };
const countedTurns = new Set();
const timers = [], realTimers = [];
const after = (sec, fn) => timers.push({ t: sec, fn });
const afterReal = (sec, fn) => realTimers.push({ t: sec, fn });
// a timer may clear the list it is on (a jump settles the scene), so each step re-checks what is left
function runTimers(list, dt) { for (let i = list.length - 1; i >= 0; i--) { const tm = list[i]; if (!tm) continue; tm.t -= dt; if (tm.t <= 0) { list.splice(i, 1); try { tm.fn(); } catch (err) { console.error(err); } } } }

// the codex names van stations directly
function codexStation(k) { return k; }
function inspectRobot() {
  openInspector('龙门机器人 · agent', `<p>机器人就是正在干活的 agent：从反应釜（模型）取出工单，经安全联锁送到对应仪器，再把结果倒回储液塔（上下文）。它的指示环：灰色待命，青色忙碌，黄色闪烁是在等你，红色是出错。</p><dl><dt>当前</dt><dd>${esc(ROBOT.text)}</dd><dt>排队</dt><dd>${ROBOT.tasks.length} 项</dd><dt>位置</dt><dd>${ROBOT.at ? esc(ST[ROBOT.at]?.name || ROBOT.at) : '—'}</dd></dl>`);
}
function stationForTool(name = '', kind, ns) {
  if (name === 'ask_user_question' || kind === 'ask_user') return 'radio';
  if (name === 'enter_plan_mode' || name === 'exit_plan_mode') return 'mode';
  if (name === 'todo_write' || kind === 'think') return 'notebook';
  if (name === 'update_goal') return 'goalboard';
  if (name === 'workflow') return 'workflow';
  if (name === 'spawn_subagent') return 'dock';
  if (name === 'monitor' || /command_or_subagent/.test(name)) return 'incubator';
  if (/^scheduler_/.test(name)) return 'timer';
  if (/^memory_/.test(name)) return 'dewar';
  if (name === 'web_search' || name === 'web_fetch' || kind === 'fetch') return 'antenna';
  if (name === 'list_dir' || kind === 'list') return 'carousel';
  if (kind === 'read' || name === 'read_file') return 'scope';
  if (kind === 'search' || name === 'grep' || name === 'glob') return 'spectro';
  if (kind === 'write' || kind === 'edit' || name === 'write' || name === 'search_replace' || name === 'apply_patch') return 'pipettor';
  if (kind === 'execute' || name === 'run_terminal_command') return 'hood';
  return 'rack';
}
let focusId = null;
function focus(id) { focusId = id; for (const S of ST_LIST) S.litGoal = S.id === id ? 1 : 0; }
function busy(id, dur = 1.2) { const S = ST[id]; if (!S) return; S.state = 'busy'; S.stateUntil = sceneClock + dur; }
function stState(id, state, dur = 0) { const S = ST[id]; if (!S) return; S.state = state; S.stateUntil = dur ? sceneClock + dur : 0; }
function logS(id, e) { const S = ST[id]; if (S && e) { S.events.push(e); if (S.events.length > 30) S.events.shift(); } }
function setCtx(tokens, demo = false) {
  if (!demo) S_.ctx = tokens;
  ST.tower.refs.level = ctxFrac(tokens / WINDOW_TOKENS);
  hud.ctx(tokens, demo);
  setStatus('tower', `${fmtK(tokens)} · ${((tokens / WINDOW_TOKENS) * 100).toFixed(1)}%`);
}
// a short visit: the arm goes to look at a station for a moment
function visit(id, text, dwell = 1, pri = 1, mode = 'watch') { const S = ST[id]; if (!S || ROBOT.tasks.length > 3) return; robotTask([['say', text, mode], ['call', () => { ROBOT.at = id; }], ['move', S.work.clone()], ['wait', dwell]], { pri, expire: sceneClock + 6 }); }
function beacon(mode, sec) { const B = ST.beacon.refs; B.mode = mode; B.until = sec ? sceneClock + sec : 0; }

// ── where things happen ──
const SPOT = {
  order: V(REACT.x + 18, BENCH, REACT.z + 26),       // a tool order precipitates in front of the reactor
  product: V(RECV.a[0] + 12, BENCH, REACT.z + 28),   // the decanted product waits by the receivers
  intake: V(FX - 10, 140, -26),                      // the hatch tray in the bulkhead
  pour: V(TOWER.x, 156, TOWER.z + TOWER.r + 9),
};
const headAt = base => base + HOLD;
function pickSteps(item, base) {
  return [['move', V(base.x, headAt(base.y) + 10, base.z)], ['move', V(base.x, headAt(base.y), base.z)], ['grip'], ['wait', 0.12], ['take', item], ['move', V(base.x, headAt(base.y) + 14, base.z)]];
}
function placeSteps(item, base, parent = world) {
  return [['move', V(base.x, headAt(base.y) + 10, base.z)], ['move', V(base.x, headAt(base.y), base.z)], ['open'], ['put', item, { parent, pos: base.clone() }], ['wait', 0.1], ['move', V(base.x, headAt(base.y) + 14, base.z)]];
}
function pourSteps(hex, what) {
  return [['say', what, 'work'], ['call', () => { ROBOT.at = 'tower'; }], ['move', SPOT.pour.clone().add(V(0, 6, 0))], ['move', SPOT.pour], ['pour', hex, 1.0], ['discard'], ['open'], ['call', () => { ST.tower.refs.splash = 1; busy('tower', 1); }], ['move', SPOT.pour.clone().add(V(0, 10, 0))]];
}
function wasteSteps(what) {
  const W = ST.waste.refs.dropAt;
  return [['say', what, 'error'], ['call', () => { ST.waste.refs.openGoal = 1; ROBOT.at = 'waste'; }], ['move', V(W.x, 160, W.z)], ['move', V(W.x, headAt(W.y) + 4, W.z)], ['open'], ['discard'], ['wait', 0.25], ['call', () => { ST.waste.refs.openGoal = 0; busy('waste', 1); }], ['move', V(W.x, 170, W.z)]];
}
const SPAWNED = new Set();
function spawnVial(fluid, cap, pos, parent = world) {
  const v = makeVial(fluid, cap);
  v.position.copy(pos); v.scale.setScalar(0.05); parent.add(v); SPAWNED.add(v);
  const grow = () => { v.scale.setScalar(Math.min(1, v.scale.x + 0.12)); if (v.scale.x < 1) after(0.02, grow); };
  grow();
  return v;
}
function burst(p, hex, n = 8, speed = 30, life = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; fx.drops.emit(p, V(Math.cos(a) * speed * Math.random(), speed * (0.4 + Math.random()), Math.sin(a) * speed * Math.random()), hex, life, 0.35 + Math.random() * 0.3); } }
function hoseFlow(pts, hex, n = 14, dur = 1.6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => (p.isVector3 ? p : V(...p))));
  for (let i = 0; i < n; i++) {
    after((i / n) * dur * 0.6, () => {
      let u = 0;
      const tick = () => { u += 0.05; fx.drops.emit(curve.getPointAt(Math.min(1, u)), V(0, 0, 0), hex, 0.12, 0.6, { g: 0 }); if (u < 1) after(0.03, tick); };
      tick();
    });
  }
}

// ── teletype: the prompt and the answer, printed on paper tape ──
function printTape(text, answer, prefix) {
  const R = ST.cab.refs, src = oneLine(text), width = 24, out = [];
  const head = prefix ?? (answer ? '< ' : '> ');
  for (let i = 0, n = 0; i < src.length && n < 6; n++) { const step = n ? width : width - head.length; out.push({ t: (n ? '  ' : head) + src.slice(i, i + step), dim: answer }); i += step; }
  R.tapeLines.push(...out, { t: '', dim: true });
  while (R.tapeLines.length > 40) R.tapeLines.shift();
  R.tape.paint({ lines: R.tapeLines });
  busy('cab', 1.6);
}
function paintGauges() { const R = ST.cab.refs; R.speedo.paint({ v: stats.tps }); R.odo.paint({ v: ARCHIVE.tokens }); }

// ── reactor drops ──
const tmpV = V();
function refluxDrop() {
  const R = ST.reactor.refs;
  fx.drops.emit(V(REACT.x + (Math.random() - 0.5) * 1.2, R.cy0 + 1, REACT.z), V(0, -12, 0), FLUID.reason, 1.2, 0.55, { floor: FLASK.cy - 3 });
  if (Math.random() < 0.5) fx.puffs.emit(V(REACT.x, R.cy0 + 4, REACT.z), V(0, 14, 0), FLUID.reason, 1.1, 3, 1.2, 0.3);
  R.recvLv.a = Math.min(1, R.recvLv.a + 0.004); R.recvDirty = true;
}
function distillDrop() {
  const R = ST.reactor.refs, tip = R.spout.localToWorld(tmpV.set(0, -3.4, -6));
  fx.drops.emit(tip, V(0, -6, 0), FLUID.text, 1, 0.55, { floor: BENCH + 4 });
  R.recvLv.b = Math.min(1, R.recvLv.b + 0.006); R.recvDirty = true;
}
let recvT = 0;
function updateReceivers(dt) {
  const R = ST.reactor.refs; recvT -= dt;
  if (!R.recvDirty || recvT > 0) return;
  recvT = 0.25; R.recvDirty = false;
  for (const k of ['a', 'b']) {
    const lv = BENCH + 1.6 + R.recvLv[k] * 13, m = R.recv[k];
    m.geometry.dispose(); m.geometry = fillGeo(ERLEN.map(([r, yy]) => [r, yy + BENCH + 1.2]), lv);
  }
}

// ── tool life: order vial → interlock → instrument → result back to the tower (or the waste bin) ──
const shortPath = p => String(p || '').split('/').slice(-2).join('/');
const outLines = (s, n) => String(s || '').replace(/\d+→/g, '').split('\n').map(x => x.trimEnd()).filter(Boolean).slice(0, n);
const TOOLFX = {
  scope: {
    run(T) { const R = ST.scope.refs; R.onGoal = 1; R.scr.paint({ title: `READ ${T.loc || T.title || ''}`, lines: ['…'], rows: 5 }); },
    done(T, ok) { const R = ST.scope.refs; R.scr.paint({ title: `${ok ? 'READ' : 'FAIL'} · ${T.loc || T.name}`, lines: outLines(T.result?.output, 5), rows: 5 }); after(1.8, () => { R.onGoal = 0; }); },
  },
  carousel: {
    run(T) { const R = ST.carousel.refs; R.spin = 3; ST.scope.refs.scr.paint({ title: `LIST ${T.loc || '.'}`, lines: ['…'], rows: 5 }); },
    done(T, ok) {
      const R = ST.carousel.refs, lines = outLines(T.result?.output, 12), m = new THREE.Matrix4(), c = new THREE.Color();
      lines.forEach((l, i) => { const a = (i / 12) * TAU; m.makeTranslation(Math.cos(a) * 6.4, 1.6, Math.sin(a) * 6.4); R.marks.setMatrixAt(i, m); R.marks.setColorAt(i, c.set(/\./.test(l) ? FLUID.cache : FLUID.user)); });
      R.marks.count = lines.length; R.marks.instanceMatrix.needsUpdate = true; if (R.marks.instanceColor) R.marks.instanceColor.needsUpdate = true;
      ST.scope.refs.scr.paint({ title: `${ok ? 'LIST' : 'FAIL'} · ${T.loc || '.'} · ${lines.length} 项`, lines: lines.length ? lines : outLines(T.result?.output, 5), rows: 5 });
    },
  },
  spectro: {
    run(T) { const R = ST.spectro.refs; R.onGoal = 1; R.scr.paint({ title: `/${oneLine(T.input.pattern || T.input.query || T.title || '').slice(0, 28)}/`, lines: [] }); },
    done(T, ok) {
      const R = ST.spectro.refs, m = /(\d+)\s+(match|result)/.exec(T.result?.output || ''), n = m ? +m[1] : outLines(T.result?.output, 99).length;
      const r = mulberry32(n * 7919 + (T.id || '').length), lines = [], hues = ['#e8233a', '#ff7a1c', '#ffcf1a', '#26c75a', '#18c4dc', '#2f7bff', '#8a4dff'];
      for (let i = 0; i < Math.min(28, n); i++) lines.push([r(), hues[Math.floor(r() * 7)]]);
      R.scr.paint({ title: `${ok ? n + ' 处命中' : '失败'} · /${oneLine(T.input.pattern || '').slice(0, 18)}/`, lines });
      after(2.2, () => { R.onGoal = 0; });
    },
  },
  pipettor: {
    run(T) {
      const R = ST.pipettor.refs, d = T.diff || {}, adds = d.new ? d.new.split('\n').filter(Boolean).length : 0, dels = d.old ? d.old.split('\n').filter(Boolean).length : 0;
      R.scr.paint({ title: `EDIT ${shortPath(d.path || T.loc || '')}`, lines: [`+${adds}  −${dels}`, T.name], rows: 3 });
      const seq = [{ x: PIPET.x - 11, z: PIPET.z - 7 }];
      const total = Math.min(24, adds + dels);
      for (let i = 0; i < total; i++) { const hex = i < Math.min(adds, total) ? FLUID.ok : FLUID.err, k = R.wellIdx + i; seq.push({ x: PIPET.x + 4 - 5.5 + (k % 12), z: PIPET.z + 2 - 3.5 + Math.floor((k % 96) / 12), fn: () => wellFill(hex) }); }
      R.seq.push(...seq);
    },
    done(T, ok) { const R = ST.pipettor.refs; if (!ok) R.scr.paint({ title: 'EDIT · 失败', lines: outLines(T.result?.output, 2), rows: 3 }); },
  },
  hood: {
    run(T) { const R = ST.hood.refs; R.sashGoal = BENCH + 2; R.fireGoal = 1; R.term.paint({ title: 'TTY · 运行中', lines: [`$ ${T.input.command || T.title}`, ...(T.progress || [])], rows: 5 }); },
    done(T, ok) {
      const R = ST.hood.refs; R.fireGoal = 0; R.lampHex = ok ? FLUID.ok : FLUID.err; if (!ok) R.smoke = 3;
      R.term.paint({ title: ok ? `TTY · exit ${T.exit ?? 0}` : 'TTY · 失败', lines: [`$ ${T.input.command || T.title}`, ...outLines(T.result?.output, 4)], rows: 5 });
      after(2.4, () => { R.sashGoal = BENCH + 14; R.lampHex = FLUID.ok; });
    },
  },
  radio: { run() { const R = ST.radio.refs; R.liftGoal = 1; R.scr.paint({ t: 'TX ··' }); }, done() { const R = ST.radio.refs; R.liftGoal = 0; R.scr.paint({ t: 'CH 09' }); } },
  notebook: { run(T) { const todos = T.input.todos || T.input.items; if (Array.isArray(todos)) paintPlan(todos.map(t => ({ content: t.content || t.text || String(t), status: t.status }))); }, done() {} },
  antenna: { run(T) { const R = ST.antenna.refs; R.onGoal = 1; R.title = `RX · ${T.name}`; }, done(T) { const R = ST.antenna.refs; R.title = `RX · ${oneLine(T.result?.output).slice(0, 24)}`; after(1.4, () => { R.onGoal = 0; R.scr.paint({ title: 'RX · 待命', amp: 0.08 }); }); } },
  dock: { run() {}, done() {} },
  rack: { run(T) { ST.rack.refs.boot = [1.2, 1.2]; ST.rack.refs.pulse = 1.2; }, done() {} },
  mode: { run() {}, done() {} },
  goalboard: { run() {}, done() {} },
  workflow: { run() {}, done() {} },
  incubator: { run() {}, done() {} },
  timer: { run() { ST.timer.refs.pin.visible = true; }, done() {} },
  dewar: { run() { ST.dewar.refs.openGoal = 1; after(2, () => { ST.dewar.refs.openGoal = 0; }); }, done() {} },
};
function paintPlan(items) { ST.notebook.refs.paper.paint({ title: '实验方案', items: items.slice(0, 8).map(t => ({ t: t.content, done: t.status === 'completed' })) }); busy('notebook', 1.5); }
function wellFill(hex) {
  const R = ST.pipettor.refs, i = R.wellIdx % 96, m = new THREE.Matrix4();
  m.makeTranslation(PIPET.x + 4 - 5.5 + (i % 12), BENCH + 4.3, PIPET.z + 2 - 3.5 + Math.floor(i / 12));
  R.wells.setMatrixAt(i, m); R.wells.setColorAt(i, new THREE.Color(hex));
  R.wells.count = Math.min(96, Math.max(R.wells.count, i + 1)); R.wells.instanceMatrix.needsUpdate = true; R.wells.instanceColor.needsUpdate = true;
  R.wellIdx++;
  fx.drops.emit(V(PIPET.x + 4 - 5.5 + (i % 12), BENCH + 8, PIPET.z + 2 - 3.5 + Math.floor(i / 12)), V(0, -30, 0), hex, 0.3, 0.3, { floor: BENCH + 4.6 });
}
function toolSteps(T) {
  const I = ST.interlock.work, tgt = ST[T.target], label = T.label || T.name;
  if (!T.gate) return [
    ['say', `取工单 · ${label}`, 'work'],
    ...pickSteps(T.vial, T.spot),
    ['until', () => T.perm != null || T.cancel || T.noPerm, 12],
    ['call', () => { if (!T.perm) T.perm = 'allow'; }],
    ['branch', () => (T.perm === 'allow' && !T.cancel ? deliverSteps(T, tgt) : wasteSteps(`工单作废 · ${label}`))],
  ];
  return [
    ['say', `取工单 · ${label}`, 'work'],
    ...pickSteps(T.vial, T.spot),
    ['say', `送去安全联锁 · ${label}`, 'work'],
    ['move', I.clone()],
    ['call', () => { T.atGate = true; ROBOT.at = 'interlock'; if (T.perm || !T.permReq && T.noPerm) interlockFlash(T.perm || 'allow', true); else { stState('interlock', 'wait'); ST.interlock.refs.mode = 'wait'; ST.interlock.refs.scr.paint({ t: S_.yolo ? 'BYPASS' : 'AUTH ?' }); ROBOT.mode = 'wait'; ROBOT.text = `等审批 · ${label}`; } }],
    ['until', () => T.perm != null || T.cancel || T.noPerm, 18],
    ['call', () => { if (!T.perm) T.perm = 'allow'; interlockFlash(T.perm, true); }],
    ['wait', 0.5],
    ['branch', () => (T.perm === 'allow' && !T.cancel ? deliverSteps(T, tgt) : wasteSteps(`工单作废 · ${label}`))],
    ['call', () => { if (T.perm !== 'allow' || T.cancel) { T.done = true; } }],
  ];
}
function deliverSteps(T, tgt) {
  const port = tgt.refs.port, label = T.label || T.name;
  const steps = [['say', `送到${tgt.name} · ${label}`, 'work']];
  if (port) steps.push(...placeSteps(T.vial, port));
  else { steps.push(['move', tgt.work.clone()], ['discard']); }
  steps.push(
    ['call', () => { T.delivered = true; ROBOT.at = T.target; focus(T.target); tgt.uses++; busy(T.target, 30); TOOLFX[T.target]?.run(T); setStatus(T.target, T.loc || shortPath(T.title)); renderStations(); }],
    ['say', `${tgt.name}工作中 · ${label}`, 'watch'],
    ['until', () => T.result != null, 20],
    ['wait', 0.9],
    ['call', () => finishTool(T)],
  );
  if (port) steps.push(['branch', () => (!T.result?.ok ? [...pickSteps(T.vial, port), ...wasteSteps(`失败 · ${label}`)]
    : TUBE_PORTS[T.target] != null ? [['call', () => capsuleHome(T)]]
    : [...pickSteps(T.vial, port), ...pourSteps(FLUID.ok, `结果倒回储液塔 · ${label}`)])]);
  steps.push(['say', '待命', 'idle']);
  return steps;
}
// a finished order: its vial shrinks into a capsule that rides the tube back to the tower
function capsuleHome(T) {
  const v = T.vial; if (!v) return;
  const shrink = () => { v.scale.setScalar(Math.max(0.01, v.scale.x - 0.12)); if (v.scale.x > 0.02) after(0.02, shrink); else v.removeFromParent(); };
  shrink();
  sendCapsule(T.target, FLUID.ok, () => { ST.tower.refs.splash = 1; busy('tower', 1); fx.drops.emit(V(TOWER.x, TOWER.y0 + TOWER.h, TOWER.z), V(0, -20, 0), FLUID.ok, 1, 0.6, { floor: TOWER.y0 + 20 }); });
}
function finishTool(T) {
  if (T.finished) return; T.finished = true;
  const ok = !!T.result?.ok;
  if (ok) stats.ok++; else stats.err++;
  hud.stats();
  stState(T.target, ok ? 'idle' : 'error', ok ? 0 : 2.4);
  setStatus(T.target, `${ok ? '完成' : '失败'} · ${T.loc || shortPath(T.title)}`);
  feed(ok ? 'ok' : 'err', ok ? '结果' : '失败', `${oneLine(T.title || T.name).slice(0, 48)} · ${oneLine(T.result?.output) || (ok ? '完成' : '失败')}`, T.result?.ev);
  TOOLFX[T.target]?.done(T, ok);
  if (T.vial) recolorVial(T.vial, ok ? FLUID.ok : FLUID.err, ok ? FLUID.ok : FLUID.err);
  if (!ok && !S_.firstFail) { S_.firstFail = true; toast('警报', `第一次工具失败 · ${T.name}`, true); }
}
function skipTool(T) {
  // the arm fell behind: settle the books without the walk
  T.vial?.removeFromParent();
  if (T.result) finishTool(T); else T.pendingFinish = true;
}
function interlockFlash(dec, quiet = false) {
  const I = ST.interlock.refs, ok = dec === 'allow';
  I.mode = ok ? 'allow' : 'deny'; I.keyGoal = ok ? 1.4 : 0; I.until = sceneClock + 1.8;
  I.scr.paint({ t: ok ? (S_.yolo ? 'BYPASS' : 'GRANTED') : 'DENIED' });
  stState('interlock', ok ? 'idle' : 'error', ok ? 0 : 1.6);
  if (ROBOT.mode === 'wait') ROBOT.mode = ok ? 'work' : 'error';
  if (!quiet) busy('interlock', 1);
}
function jiggle() { // a nudge: the arm is shoved back to work
  const p = ROBOT.tip.clone();
  robotTask([['say', '被推回去干活', 'error'], ['line', p.clone().add(V(0, 0, 8))], ['line', p.clone().add(V(0, 0, -8))], ['line', p]], { pri: 4, expire: sceneClock + 3 });
}

// ── event handlers: one per event type the source can emit ──
const H = {};
const QUIET = new Set(['k', 'phase', 'tool.start', 'tool.end', 'x.response_started', 'x.reasoning_completed', 'x.response_completed', 'x.tool_call_delta_chunk', 'x.interaction_resolved']);
H['turn.start'] = e => {
  S_.turn = e.d.n; S_.loop = null; hud.run(S_.turn, '—'); hud.phase(null);
  if (e.idle > 60000) feed('sys', '空闲', `会话空闲 ${fmtIdle(e.idle)}，已跳过`, null);
  feed('turn', `第 ${e.d.n} 轮`, `新的委托 · 对话里已有 ${e.d.msgs} 条消息`, e);
  logS('intake', e); logS('cab', e); busy('cab', 2); focus('intake');
  const R = ST.reactor.refs; R.recvLv.a = 0; R.recvLv.b = 0; R.recvDirty = true; R.mixGoal.set(FLUID.context);
};
H['user.message'] = e => {
  const text = oneLine(e.d.text);
  feed('user', '委托', text, e); logS('cab', e); logS('intake', e);
  setStatus('intake', text.slice(0, 22)); printTape(text, false);
  const v = spawnVial(FLUID.user, 0xd9a300, SPOT.intake);
  busy('intake', 3);
  robotTask([['say', '接收委托', 'work'], ['call', () => { ROBOT.at = 'intake'; }], ...pickSteps(v, SPOT.intake), ...pourSteps(FLUID.user, '把委托倒进储液塔'), ['say', '待命', 'idle']],
    { pri: 3, tag: 'intake', expire: sceneClock + 20, onSkip: () => v.removeFromParent() });
};
H.hook = e => {
  const ev = e.d.event, runs = e.d.runs || [], failed = runs.filter(r => r.status === 'failed').length, skipped = runs.filter(r => r.status === 'skipped').length;
  ROBOT.scan = 1;
  const i = HOOK_EVENTS.indexOf(ev), HP = ST.hooks.refs;
  if (i >= 0) { HP.k[i] = 1; setLamp(HP.lamps[i], 1, failed ? FLUID.err : skipped ? MAT.amberlamp : FLUID.ok); }
  logS('hooks', e); busy('hooks', 1); setStatus('hooks', ev);
  if (ev === 'session_start') { ST.power.refs.onGoal = 1; busy('power', 2); setStatus('power', '通电'); }
  if (ev === 'session_end') { ST.power.refs.onGoal = 0.08; busy('power', 2); setStatus('power', '断电'); }
  if (ev === 'notification' || ev === 'stop_failure') beacon(ev === 'stop_failure' ? 'alert' : 'wait', 2.4);
  if (ev === 'permission_denied') interlockFlash('deny');
  if (ev === 'pre_compact' || ev === 'post_compact') busy('rotavap', 1.2);
  if (ev === 'subagent_start' || ev === 'subagent_stop') busy('dock', 1.2);
  feed(failed ? 'err' : 'hook', '质检', `${ev}${e.d.tool ? ' · ' + e.d.tool : ''} · ${runs.length} 个${failed ? `，${failed} 个失败` : skipped ? `，${skipped} 个跳过` : ''}`, e);
};
H['loop.start'] = e => {
  S_.loop = e.d.i; S_.loopReal = e.real; hud.run(S_.turn, e.d.i + 1);
  feed('req', '进样', `第 ${e.d.i + 1} 次反应 · 送样到 ${SESSION.model}`, e);
  logS('reactor', e); logS('pump', e);
  const P = ST.pump.refs; P.spinGoal = 1; after(1.8, () => { P.spinGoal = 0; });
  const R = ST.reactor.refs; R.heatGoal = S_.mode === 'plan' ? 0.5 : 1; R.scr.paint({ a: S_.mode === 'plan' ? 'PLAN' : 'HEAT', b: `req ${e.d.i + 1} · ${SESSION.model}` });
  busy('pump', 1.8); stState('reactor', 'busy'); focus('reactor');
  for (let i = 0; i < 6; i++) after(i * 0.18, () => fx.drops.emit(V(REACT.x - 16 + (Math.random() - 0.5), FLASK.cy + 38, REACT.z), V(0, -16, 0), FLUID.context, 1.2, 0.5, { floor: FLASK.cy + 18 }));
  if (!ROBOT.task && !ROBOT.tasks.length) robotTask([['say', `第 ${e.d.i + 1} 次请求 · 等首滴`, 'watch'], ['move', ST.reactor.work.clone()]], { pri: 0, expire: sceneClock + 4 });
};
H.phase = e => {
  const p = e.d.phase, R = ST.reactor.refs; hud.phase(p);
  if (p === 'waiting_for_model') { R.heatGoal = S_.mode === 'plan' ? 0.5 : 1; R.mode = null; }
  else if (p === 'streaming_reasoning') { R.mode = 'r'; R.spoutGoal = Math.PI; R.mixGoal.set(FLUID.context).lerp(new THREE.Color(FLUID.reason), 0.6); stState('reactor', 'busy'); setStatus('reactor', '回流 · 推理'); R.scr.paint({ a: 'REFLUX', b: 'reasoning' }); }
  else if (p === 'streaming_text') { R.mode = 't'; R.spoutGoal = 0; R.mixGoal.set(FLUID.context).lerp(new THREE.Color(FLUID.text), 0.6); stState('reactor', 'busy'); setStatus('reactor', '馏出 · 正文'); R.scr.paint({ a: 'DISTIL', b: 'answer' }); }
  else if (p === 'tool_execution') { R.mode = null; R.heatGoal = 0.45; stState('reactor', 'idle'); R.scr.paint({ a: 'HOLD', b: 'tools' }); }
  else if (p === 'permission_prompt') beacon('wait', 1.2);
};
H['request.first_token'] = e => {
  const ttft = e.real - S_.loopReal; stats.ttft.push(ttft); hud.stats();
  feed('req', '首滴', `TTFT ${fmtMs(ttft)}`, e); logS('reactor', e);
  ST.reactor.refs.scr.paint({ a: `TTFT ${fmtMs(ttft)}`, b: 'first drop' });
  setStatus('reactor', `首滴 ${fmtMs(ttft)}`);
  const R = ST.reactor.refs;
  fx.drops.emit(V(REACT.x, R.cy0 + 1, REACT.z), V(0, -8, 0), FLUID.context, 1.4, 0.8, { floor: FLASK.cy - 3 });
};
H.k = e => {
  const ch = e.d === 'r' ? 'r' : 't';
  S_.ticks[ch]++;
  S_.tickTimes.push(e.real); while (S_.tickTimes.length && e.real - S_.tickTimes[0] > 2000) S_.tickTimes.shift();
  stats.tps = S_.tickTimes.length / 2;
  if (S_.bucket >= 1) { S_.bucket -= 1; ch === 'r' ? refluxDrop() : distillDrop(); }
  else { const R = ST.reactor.refs; R.recvLv[ch === 'r' ? 'a' : 'b'] = Math.min(1, R.recvLv[ch === 'r' ? 'a' : 'b'] + 0.004); R.recvDirty = true; }
};
H['stream.thought'] = e => { if (e.d.ctx) setCtx(e.d.ctx); feed('think', '回流', e.d.text, e, `${e.d.len} 字`); logS('reactor', e); setStatus('reactor', `推理 ${e.d.len} 字`); };
H['stream.text'] = e => { if (e.d.ctx) setCtx(e.d.ctx); feed('text', '馏出', e.d.text, e, `${e.d.len} 字`); logS('reactor', e); logS('cab', e); printTape(e.d.text, true); };
H['tool.call'] = e => {
  const d = e.d; if (d.ctx) setCtx(d.ctx);
  const target = stationForTool(d.name, d.kind, d.ns);
  const spot = SPOT.order.clone().add(V((S_.tools.size % 3) * 5 - 5, 0, 0));
  const T = { id: d.id, name: d.name, kind: d.kind, label: d.label, target, ev: e, title: d.name, input: typeof d.input === 'object' && d.input ? d.input : {}, perm: null, result: null, spot, progress: [] };
  // plan / todo / goal / mode tools run without a permission prompt
  T.noPerm = !nextOf(e, x => x.type === 'permission.request' && x.d.name === d.name);
  // the arm only walks the order past the interlock when a person decides, or the answer is no
  T.gate = !!nextOf(e, x => (x.type === 'permission.request' && x.d.name === d.name && x.human) || (x.type === 'permission.resolve' && x.d.name === d.name && x.d.decision !== 'allow'));
  S_.tools.set(d.id, T);
  if (S_.forming && S_.forming.id === d.id) { T.vial = S_.forming.vial; T.spot = S_.forming.spot; S_.forming = null; }
  else { T.vial = spawnVial(FLUID.tool, MAT.amberlamp, spot); burst(spot.clone().add(V(0, 6, 0)), FLUID.tool, 10, 18); }
  stats.calls++; hud.stats();
  logS('reactor', e); logS(target, e);
  feed('tool', '工单', `${d.label || d.name} → ${ST[target].name} · ${d.name}`, e);
  robotTask(toolSteps(T), { pri: 3, tag: 'tool', expire: sceneClock + 30, onSkip: () => skipTool(T) });
  if (!S_.firstTool) { S_.firstTool = true; toast('里程碑', '第一张工单'); }
};
function nextOf(e, pred) { for (let j = e.i + 1; j < TL.length && TL[j].ti === e.ti && j < e.i + 40; j++) if (pred(TL[j])) return TL[j]; return null; }
H['tool.update'] = e => {
  const d = e.d, T = S_.tools.get(d.id); if (!T) return;
  if (d.title) T.title = d.title;
  if (d.questions) T.questions = d.questions;
  if (d.diff) T.diff = d.diff;
  if (d.input) T.input = { ...T.input, ...d.input };
  if (d.locations && d.locations[0]) T.loc = d.locations[0];
  if (d.exit != null) T.exit = d.exit;
  logS(T.target, e);
  if (d.status && !T.perm && !T.permReq) T.perm = 'allow';
  if (d.status === 'in_progress') {
    if (d.output) { T.progress.push(oneLine(d.output)); if (T.delivered) { setStatus(T.target, oneLine(d.output).slice(0, 30)); if (T.target === 'hood') ST.hood.refs.term.paint({ title: 'TTY · 运行中', lines: [`$ ${T.input.command || T.title}`, ...T.progress.slice(-4)], rows: 5 }); } feed('tool', '输出', d.output, e); }
    return;
  }
  if (d.status !== 'completed' && d.status !== 'failed') return;
  T.result = { ok: d.status === 'completed', output: d.output || d.error || '', ev: e };
  if (T.pendingFinish) finishTool(T);
};
H['permission.request'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && !x.permReq);
  if (T) T.permReq = e;
  logS('interlock', e);
  const res = e.link;
  if (S_.yolo && !e.human) { feed('perm', '联锁', `${e.d.name} · YOLO 旁路，直接放行`, e); return; }
  if (!e.human) { feed('perm', '联锁', `${e.d.name} · 规则自动放行（录制时 ${fmtMs(res?.d.wait)}）`, e); return; }
  feed('perm', '联锁', `${e.d.name} · 等你批准`, e);
  const I = ST.interlock.refs; I.mode = 'wait'; I.scr.paint({ t: 'AUTH ?' }); stState('interlock', 'wait'); focus('interlock'); beacon('wait');
  if (!S_.firstHuman) { S_.firstHuman = true; toast('里程碑', '第一次人工审批'); }
  openPermission(e, res, T);
};
H['permission.resolve'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && x.permReq && !x.perm), dec = e.d.decision;
  if (T) T.perm = dec === 'allow' ? 'allow' : dec;
  logS('interlock', e); beacon(null);
  if (dec !== 'allow') { feed('err', '联锁', `${e.d.name} · ${dec === 'deny' ? '已拒绝' : '已取消'} · 录制时等了 ${fmtMs(e.d.wait)}`, e); interlockFlash(dec); }
  else if (e.d.wait >= 600) { feed('perm', '联锁', `${e.d.name} · 已批准`, e); interlockFlash('allow'); }
  if (T && dec === 'allow' && e.ask) openAsk(T, e.ask);
};
H['turn.end'] = e => {
  const R = ST.reactor.refs; R.heatGoal = 0; R.mode = null; hud.phase(null); R.scr.paint({ a: 'IDLE', b: 'cooling' });
  stState('reactor', 'idle'); logS('cab', e);
  if (e.d.outcome === 'cancelled') { feed('err', '中止', `第 ${S_.turn} 轮已取消 · ${e.d.cancel || ''}`, e); stState('cab', 'error', 1.6); }
  if (e.d.outcome === 'error') { feed('err', '中止', `第 ${S_.turn} 轮失败`, e); stState('cab', 'error', 2); beacon('alert', 3); }
};
H['turn.completed'] = e => {
  const u = e.d.usage || {}, ok = e.d.stop !== 'cancelled' && e.d.stop !== 'error';
  stats.turns.push({ n: S_.turn, input: u.inputTokens || 0, cached: u.cachedReadTokens || 0, output: u.outputTokens || 0, reasoning: u.reasoningTokens || 0, api: u.apiDurationMs || 0 });
  if (u.apiDurationMs && u.outputTokens) stats.tps = u.outputTokens / (u.apiDurationMs / 1000);
  hud.stats(); logS('archive', e); logS('meter', e);
  // the four totalizers on the wall
  const M = ST.meter.refs; M.tot[0] += u.inputTokens || 0; M.tot[1] += u.cachedReadTokens || 0; M.tot[2] += u.outputTokens || 0; M.tot[3] += u.reasoningTokens || 0; M.calls += u.modelCalls || 0; M.api += u.apiDurationMs || 0;
  M.scr.paint({ vals: M.tot }); M.sub.paint({ t: `${M.calls} 次请求 · API ${fmtMs(M.api)}` }); busy('meter', 1.5); setStatus('meter', `+${fmtK(u.totalTokens)}`);
  const hit = u.inputTokens ? Math.round((100 * (u.cachedReadTokens || 0)) / u.inputTokens) : 0;
  feed('turn', ok ? '封样' : '计费', `${e.d.stop} · 进样 ${fmtK(u.inputTokens)}（回收 ${hit}%）· 产出 ${fmtK(u.outputTokens)} · 推理 ${fmtK(u.reasoningTokens)} · ${u.modelCalls ?? '—'} 次反应 · ${fmtMs(u.apiDurationMs)}`, e);
  const fresh = SRC === 'replay' && !countedTurns.has(e.i); if (SRC === 'replay') countedTurns.add(e.i);
  const R = ST.reactor.refs;
  const v = spawnVial(ok ? FLUID.text : FLUID.err, ok ? 0x2f7bff : FLUID.err, SPOT.product);
  R.recvLv.a = 0; R.recvLv.b = 0; R.recvDirty = true;
  const slotIdx = fresh ? ARCHIVE.turns : ARCHIVE.turns + ((S_.demoVials = (S_.demoVials || 0) + 1) % 6);
  const store = () => {
    if (fresh) {
      ST.archive.refs.put(ARCHIVE.turns, ok ? FLUID.text : FLUID.err, 0xffcf1a);
      ARCHIVE.turns++; ARCHIVE.tokens += u.totalTokens || 0;
      hud.archive(); paintGauges();
      setStatus('archive', `${ARCHIVE.turns} 瓶 · +${fmtK(u.totalTokens)}`);
    } else {
      // staged and replayed turns get a marked vial that does not count toward the long-term line
      ST.archive.refs.put(slotIdx, ok ? FLUID.text : FLUID.err, MAT.paper);
      setStatus('archive', SRC === 'demo' ? '演示样品 · 不计入长期累计' : '已计入');
    }
    ST.archive.refs.scr.paint({ n: ARCHIVE.turns }); busy('archive', 1.5);
  };
  const slot = FR_SLOTS[slotIdx % FR_SLOTS.length];
  robotTask([
    ['say', '封样入库', 'work'], ...pickSteps(v, SPOT.product),
    ['call', () => { ST.archive.refs.openGoal = 1; ROBOT.at = 'archive'; focus('archive'); }],
    ['move', V(slot.x, headAt(slot.y) + 14, slot.z)], ['move', V(slot.x, headAt(slot.y) + 0.5, slot.z)], ['open'],
    ['call', () => { ROBOT.held?.removeFromParent(); ROBOT.held = null; store(); }], ['wait', 0.2],
    ['move', V(slot.x, headAt(slot.y) + 20, slot.z)], ['call', () => { ST.archive.refs.openGoal = 0; }],
    ['say', '待命 · 等下一份委托', 'idle'],
  ], { pri: 2, tag: 'archive', expire: sceneClock + 40, onSkip: () => { v.removeFromParent(); store(); } });
  paintGauges();
};
// ── MCP: the instrument rack ──
const mcpIdx = server => MCP_SERVERS.indexOf(server);
const rackMod = (server, fn) => { const i = mcpIdx(server); if (i >= 0 && i < 2) fn(ST.rack.refs, i); };
H['mcp.starting'] = e => { rackMod(e.d.server, (R, i) => { R.boot[i] = 3; R.fail[i] = false; }); busy('rack', 3); logS('rack', e); setStatus('rack', `${e.d.server} 启动中`); feed('sys', 'MCP', `${e.d.server} 启动中 · ${e.d.transport}`, e); };
H['mcp.connected'] = e => { rackMod(e.d.server, (R, i) => { R.online[i] = true; R.boot[i] = 0; R.fail[i] = false; }); logS('rack', e); setStatus('rack', `${e.d.server} · ${e.d.tools} 个工具`); feed('sys', 'MCP', `${e.d.server} 已连接 · ${e.d.tools} 个工具 · ${e.d.ms}ms`, e); };
H['mcp.ready'] = e => feed('sys', 'MCP', `MCP 就绪 · ${e.d.servers} 个服务 · ${e.d.tools} 个工具`, e);
H['e.mcp_config_resolved'] = e => { logS('rack', e); feed('sys', 'MCP', `配置解析 · ${(e.d.servers || []).map(s => s.name || s).join('、') || '无服务'}`, e); };
H['e.mcp_managed_config_result'] = e => { logS('rack', e); feed('sys', 'MCP', `托管配置 · ${e.d.server_count ?? 0} 个${e.d.error ? ' · ' + e.d.error : ''}`, e); };
H['e.mcp_oauth_discovery_timeout'] = e => { rackMod(e.d.server_name, (R, i) => { R.boot[i] = 1.5; }); logS('rack', e); feed('err', 'MCP', `${e.d.server_name} · OAuth 发现超时`, e); };
H['e.mcp_server_failed'] = e => { rackMod(e.d.server_name, (R, i) => { R.fail[i] = true; R.online[i] = false; R.boot[i] = 0; }); stState('rack', 'error', 2); burst(V(RACK.x, FLOOR + 40, RACK.z - 12), FLUID.err, 10, 16); logS('rack', e); feed('err', 'MCP', `${e.d.server_name} 启动失败 · ${e.d.error_type} · ${e.d.error_message}`, e); };
H['e.mcp_auth_retry'] = e => { rackMod(e.d.server_name, (R, i) => { R.boot[i] = 1.5; R.fail[i] = !e.d.success; }); logS('rack', e); feed(e.d.success ? 'sys' : 'err', 'MCP', `${e.d.server_name} · 鉴权重试${e.d.success ? '成功' : '失败'}`, e); };
H['e.mcp_tool_registration_failed'] = e => { logS('rack', e); feed('err', 'MCP', `${e.d.server_name} · 工具 ${e.d.tool_name} 注册失败 · ${e.d.error}`, e); };
H['e.mcp_init_cancelled'] = e => { logS('rack', e); feed('sys', 'MCP', `MCP 初始化取消 · ${e.d.reason}`, e); };
H['e.mcp_tool_call_started'] = e => { rackMod(e.d.server_name, (R, i) => { R.pulse = 2; R.active = i; }); busy('rack', 2); logS('rack', e); feed('tool', 'MCP', `${e.d.server_name} · ${e.d.tool_name} 调用开始`, e); };
H['e.mcp_tool_call_completed'] = e => { logS('rack', e); feed(e.d.success ? 'ok' : 'err', 'MCP', `${e.d.server_name} · ${e.d.tool_name} · ${e.d.success ? '完成' : '失败'} · ${fmtMs(e.d.duration_ms)}${e.d.reconnect_attempted ? ' · 中途重连过' : ''}`, e); };
H['e.mcp_transport_error'] = e => { burst(V(RACK.x + 10, FLOOR + 46, RACK.z - 12), MAT.amberlamp, 14, 22); stState('rack', 'error', 1.2); logS('rack', e); feed('err', 'MCP', `${e.d.server_name} · 传输错误 · ${e.d.error}`, e); };
H['e.mcp_transport_decode_error'] = e => { burst(V(RACK.x + 10, FLOOR + 46, RACK.z - 12), MAT.amberlamp, 8, 16); logS('rack', e); feed('err', 'MCP', `${e.d.server_name} · 解码错误 · ${e.d.error}`, e); };
H['e.mcp_transport_reconnect'] = e => { rackMod(e.d.server_name, (R, i) => { R.boot[i] = 1; }); logS('rack', e); feed(e.d.success ? 'sys' : 'err', 'MCP', `${e.d.server_name} · 重连${e.d.success ? '成功' : '失败'}`, e); };
H['e.mcp_health_check'] = e => { rackMod(e.d.server_name, (R, i) => { R.heart = 1.2; }); logS('rack', e); feed('sys', 'MCP', `${e.d.server_name} · 健康检查 ${e.d.healthy ? '正常' : '异常'}`, e); };
H['e.mcp_server_toggled'] = e => { rackMod(e.d.server_name, (R, i) => { R.online[i] = !!e.d.enabled; }); logS('rack', e); feed('sys', 'MCP', `${e.d.server_name} · ${e.d.enabled ? '启用' : '停用'}`, e); };
// ── interjection, YOLO, stop gates ──
H['e.interjected'] = e => { const R = ST.radio.refs; R.liftGoal = 1; R.scr.paint({ t: '插话 !' }); after(2.2, () => { R.liftGoal = 0; R.scr.paint({ t: 'CH 09' }); }); busy('intake', 2); beacon('wait', 1.6); logS('intake', e); feed('user', '插话', `用户中途插话（${e.d.source === 'queue' ? '排队' : '直接'}）`, e); };
H['e.yolo_toggled'] = e => { S_.yolo = !!e.d.enabled; ST.mode.refs.yolo = S_.yolo; ST.interlock.refs.scr.paint({ t: S_.yolo ? 'BYPASS' : 'LOCKED' }); visit('mode', S_.yolo ? '转动 YOLO 钥匙' : '拔下 YOLO 钥匙', 0.8, 2); logS('mode', e); feed('perm', 'YOLO', S_.yolo ? '打开 · 安全联锁被旁路' : '关闭 · 安全联锁恢复', e); };
H['e.todo_gate_fired'] = e => { ST.verifier.refs.todoK = 1; ST.supervisor.refs.alert = 1.6; busy('notebook', 1.5); jiggle(); logS('verifier', e); feed('err', '待办闸门', `还有 ${e.d.pending} 项待办没做完就想收工 → 退回继续（第 ${e.d.fires} 次）`, e); };
H['e.todo_gate_exhausted'] = e => { ST.verifier.refs.todoK = 1; logS('verifier', e); feed('err', '待办闸门', `闸门次数用完，放行 · 仍有 ${e.d.pending} 项待办`, e); };
H['e.laziness_classifier_fired'] = e => { ST.verifier.refs.lazyK = 1; ST.supervisor.refs.alert = 2; logS('supervisor', e); feed('err', '监督', `偷懒判定 · ${e.d.category} · 置信 ${Math.round((e.d.confidence || 0) * 100)}%`, e); };
H['e.laziness_nudge_fired'] = e => { ST.supervisor.refs.alert = 1.6; jiggle(); logS('supervisor', e); feed('err', '监督', `提醒一次，把活干完 · 还剩 ${e.d.nudges_remaining} 次`, e); };
H['e.laziness_classifier_aborted'] = e => { logS('supervisor', e); feed('sys', '监督', `偷懒判定中止 · ${e.d.reason}`, e); };
H['e.goal_premature_stop_detected'] = e => { ST.supervisor.refs.alert = 2; jiggle(); goalLog(`过早收工 · ${e.d.pattern}`); logS('supervisor', e); feed('err', '监督', `没验证就说做完了（${e.d.pattern}）`, e); };
// ── goal mode: the board and the verification bench ──
function goalLog(line) { const G = ST.goalboard.refs; G.state.log = [...(G.state.log || []), line].slice(-7); G.board.paint(G.state); busy('goalboard', 1.2); }
H['x.goal_updated'] = e => {
  const d = e.d, G = ST.goalboard.refs;
  Object.assign(G.state, { objective: d.objective, status: d.status, phase: d.phase, deliverables: d.deliverables, used: d.tokens_used, budget: d.token_budget });
  G.board.paint(G.state); busy('goalboard', 2); focus('goalboard'); logS('goalboard', e); setStatus('goalboard', `${d.phase} · ${d.completed_deliverables}/${d.total_deliverables}`);
  if (d.phase === 'verifying') visit('verifier', '目标复核', 1.6, 2);
  else visit('goalboard', `目标 · ${d.phase}`, 0.8, 1);
  feed(d.status === 'complete' ? 'ok' : 'turn', '目标', `${d.status} · ${d.phase} · 交付 ${d.completed_deliverables}/${d.total_deliverables} · ${fmtK(d.tokens_used)} / ${fmtK(d.token_budget)} token`, e);
};
const GOAL_TXT = {
  goal_auto_paused: d => `自动暂停 · ${d.reason}`, goal_classifier_fired: d => `评估器 #${d.attempt} 启动`, goal_classifier_verdict: d => `评估结论 · ${d.verdict === 'achieved' ? '达成' : '未达成'}`,
  goal_classifier_fail_open: d => `评估失败放行 · ${d.reason}`, goal_classifier_fail_closed: d => `评估失败拦截 · ${d.reason}`, goal_classifier_cap_reached: d => `评估次数到顶（${d.attempt}）`,
  goal_classifier_mid_turn_deferred: d => `评估推迟到回合末 · 队列 ${d.pending_depth}`, goal_classifier_dropped_after_cap: d => `超额评估丢弃 · ${d.attempts_seen}`, goal_classifier_pending_queue_cleared: d => `评估队列清空 · ${d.dropped}`,
  goal_planner_fired: d => `规划员 #${d.attempt} 启动`, goal_planner_completed: d => `规划完成 · ${fmtMs(d.latency_ms)}`, goal_planner_fail_closed: d => `规划失败 · ${d.reason}`,
  goal_strategist_fired: d => `策略师启动 · 连败 ${d.consecutive_failures}`, goal_strategist_completed: d => `策略完成 · ${fmtMs(d.latency_ms)}`, goal_strategist_failed: d => `策略失败 · ${d.reason}`,
  goal_strategist_contract_restore_failed: d => `策略契约恢复失败 · ${d.reason}`, goal_summarizer_fired: () => '总结员启动', goal_summarizer_completed: d => `总结完成 · ${fmtMs(d.latency_ms)}`, goal_summarizer_fail_open: d => `总结失败放行 · ${d.reason}`,
  goal_role_model_resolved: d => `${d.role}${d.skeptic_idx != null ? ' #' + (d.skeptic_idx + 1) : ''} → ${d.model_id}`, goal_role_model_fail_open: d => `${d.role} 模型缺失 · ${d.reason}`,
};
for (const k of Object.keys(GOAL_TXT)) {
  H['e.' + k] = e => {
    const txt = GOAL_TXT[k](e.d); goalLog(txt); logS('goalboard', e);
    const bad = /fail|cap_reached|dropped|cleared/.test(k);
    if (k === 'goal_auto_paused') stState('goalboard', 'wait', 2);
    feed(bad ? 'err' : 'ok', '目标', txt, e);
  };
}
H['e.goal_verifier_skeptic_verdict'] = e => { const V_ = ST.verifier.refs, i = e.d.skeptic_idx % 3; V_.uk[i] = 1; setLamp(V_.units[i], 1, e.d.refuted ? FLUID.err : FLUID.ok); busy('verifier', 2); focus('verifier'); goalLog(`怀疑者 #${i + 1} · ${e.d.refuted ? '驳倒' : '没驳倒'}（${e.d.confidence}）`); logS('verifier', e); feed(e.d.refuted ? 'err' : 'ok', '复核', `怀疑者 #${i + 1} · ${e.d.refuted ? '驳倒了结论' : '没能驳倒'} · 置信 ${e.d.confidence}`, e); };
H['e.goal_verifier_aggregate_verdict'] = e => { const V_ = ST.verifier.refs; V_.aggK = 1; setLamp(V_.agg, 1, e.d.achieved ? FLUID.ok : FLUID.err); goalLog(`复核汇总 · ${e.d.refuted_count}/${e.d.total} 驳倒 → ${e.d.achieved ? '达成' : '未达成'}`); logS('verifier', e); feed(e.d.achieved ? 'ok' : 'err', '复核', `${e.d.total} 个怀疑者里 ${e.d.refuted_count} 个驳倒 → ${e.d.achieved ? '目标达成' : '未达成'}`, e); };
// ── ACP extras: plan, commands, mode, session info ──
H['acp.plan'] = e => { paintPlan(e.d.entries || []); logS('notebook', e); const done = (e.d.entries || []).filter(x => x.status === 'completed').length; setStatus('notebook', `${done}/${(e.d.entries || []).length}`); visit('notebook', '更新实验方案', 0.8, 1); feed('text', '方案', `计划 ${done}/${(e.d.entries || []).length} · ${(e.d.entries || []).map(x => x.content).join(' / ')}`, e); };
H['acp.available_commands_update'] = e => { printTape((e.d.commands || []).join(' '), true, '/ '); logS('notebook', e); feed('sys', '命令', `可用命令 ${(e.d.commands || []).length} 个 · ${(e.d.commands || []).slice(0, 6).join(' ')}`, e); };
H['acp.current_mode_update'] = e => {
  const m = e.d.mode; S_.mode = m; ST.mode.refs.mode = m; logS('mode', e); busy('mode', 1.5); setStatus('mode', m === 'plan' ? '计划模式' : '常规');
  if (m === 'plan') { ST.reactor.refs.heatGoal = 0.5; ST.reactor.refs.scr.paint({ a: 'PLAN', b: 'dry run' }); }
  visit('mode', m === 'plan' ? '旋钮拨到计划' : '旋钮拨回常规', 0.6, 2);
  feed('text', '模式', m === 'plan' ? '进入计划模式 · 只出方案，不动手' : `回到 ${m} 模式`, e);
};
H['acp.session_info_update'] = e => { if (e.d.title) { ST.sign.refs.scr.paint({ t: e.d.title }); busy('sign', 2); setStatus('sign', e.d.title); } logS('sign', e); feed('sys', '标题', e.d.title || '会话信息更新', e); };
H['x.session_summary_generated'] = e => { ST.sign.refs.scr.paint({ t: e.d.session_summary }); busy('sign', 2); logS('sign', e); feed('sys', '标题', `生成标题 · ${e.d.session_summary}`, e); };
// ── response lifecycle: the cache tank and the reactor screen ──
H['x.response_started'] = e => {
  const d = e.d, hit = d.input_tokens ? d.cache_read_input_tokens / d.input_tokens : 0, C = ST.cache.refs;
  C.level = hit; C.flow = 1.8; busy('cache', 1.8); setStatus('cache', `回收 ${Math.round(hit * 100)}%`); logS('cache', e);
  ST.reactor.refs.scr.paint({ a: `IN ${fmtK(d.input_tokens)}`, b: `cache ${Math.round(hit * 100)}% · ${d.model || ''}` });
};
H['x.reasoning_completed'] = e => { const R = ST.reactor.refs; if (R.mode === 'r') R.mode = null; logS('reactor', e); };
H['x.response_completed'] = e => { logS('reactor', e); if (e.d.usage) ST.reactor.refs.scr.paint({ a: `OUT ${fmtK(e.d.usage.output_tokens)}`, b: e.d.stop_reason || '' }); };
H['x.tool_call_delta_chunk'] = e => {
  // the order forms in its vial while the tool arguments stream in
  if (!S_.forming || S_.forming.id !== e.d.tool_call_id) { const spot = SPOT.order.clone().add(V(5, 0, 0)); S_.forming = { id: e.d.tool_call_id, spot, vial: spawnVial(FLUID.tool, MAT.amberlamp, spot), n: 0 }; }
  const F = S_.forming; F.n++; F.vial.userData.liq.scale.y = Math.min(1, 0.25 + F.n * 0.2); logS('reactor', e);
};
H['x.diff_review'] = e => { const p = e.d.content?.[0]?.path; ST.pipettor.refs.scr.paint({ title: `审阅 ${shortPath(p)}`, lines: ['diff ready'], rows: 3 }); busy('pipettor', 1.5); logS('pipettor', e); feed('ok', '审阅', `改动待审 · ${shortPath(p)}`, e); };
H['x.pending_interaction'] = e => {
  beacon('wait'); logS('beacon', e);
  const kind = e.d.kind;
  if (kind === 'plan_approval') { stState('mode', 'wait'); focus('mode'); feed('perm', '方案', '等你批准方案（exit_plan_mode）', e); if (e.human) openPlanApproval(e); }
  else feed('perm', '等待', kind === 'question' ? '等你回答问题' : '等你审批', e);
};
H['x.interaction_resolved'] = e => { beacon(null); stState('mode', 'idle'); logS('beacon', e); };
H['x.feedback_request'] = e => { const R = ST.radio.refs; R.scr.paint({ t: '评分?' }); after(2.5, () => R.scr.paint({ t: 'CH 09' })); printTape('请给这次会话打个分', true, '* '); logS('notebook', e); feed('user', '反馈', '请求你给本次会话打分', e); };
// ── context: compaction, checkpoints, memory ──
H['x.auto_compact_started'] = e => {
  const d = e.d, RV = ST.rotavap.refs;
  setCtx(d.tokens_used, false); stState('tower', 'error', 4); stState('rotavap', 'busy', 12); focus('rotavap');
  RV.fillGoal = 1; RV.spinGoal = 1; RV.scr.paint({ title: '35 mbar · 旋转', lines: [], rows: 1 });
  hoseFlow([[TOWER.x, TOWER.y0 - 5, TOWER.z + TOWER.r + 13], [TOWER.x + 20, FLOOR + 6, 0], [ROTA.x, FLOOR + 30, ROTA.z - 26], [ROTA.x - 3, ROTA.y + 34, ROTA.z - 1]], FLUID.context, 22, 2.4);
  visit('rotavap', '旋蒸浓缩上下文', 2, 3, 'work');
  logS('rotavap', e); feed('err', '旋蒸', `上下文 ${d.percentage}% · ${fmtK(d.tokens_used)} / ${fmtK(d.context_window)} · ${d.reason} → 自动压缩开始`, e);
};
H['x.auto_compact_completed'] = e => {
  const d = e.d, RV = ST.rotavap.refs;
  RV.recvGoal = 1; RV.fillGoal = 0.25; after(3, () => { RV.spinGoal = 0; RV.fillGoal = 0; RV.recvGoal = 0; RV.scr.paint({ title: '35 mbar', lines: [], rows: 1 }); });
  setCtx(d.tokens_after);
  const v = spawnVial(FLUID.context, MAT.paper, V(ROTA.x + 13, ROTA.y + 8 + 3, ROTA.z - 12));
  robotTask([['say', '浓缩液送回储液塔', 'work'], ...pickSteps(v, V(ROTA.x + 13, ROTA.y + 11, ROTA.z - 12)), ...pourSteps(FLUID.context, '浓缩液倒回储液塔'), ['say', '待命', 'idle']], { pri: 3, expire: sceneClock + 20, onSkip: () => v.removeFromParent() });
  logS('rotavap', e); toast('里程碑', '压缩完成');
  feed('ok', '旋蒸', `压缩完成 · ${fmtK(d.tokens_before)} → ${fmtK(d.tokens_after)} · ${fmtMs(d.elapsed_ms)}${d.summary_preview ? ' · ' + d.summary_preview : ''}`, e);
};
H['x.auto_compact_failed'] = e => { const RV = ST.rotavap.refs; RV.spinGoal = 0; RV.fillGoal = 0; stState('rotavap', 'error', 2.5); beacon('alert', 2); logS('rotavap', e); feed('err', '旋蒸', `压缩失败 · ${e.d.error}`, e); };
H['x.auto_compact_cancelled'] = e => { const RV = ST.rotavap.refs; RV.spinGoal = 0; RV.fillGoal = 0; stState('rotavap', 'idle'); logS('rotavap', e); feed('sys', '旋蒸', `压缩取消 · ${e.d.reason}`, e); };
H['x.auto_continue_completed'] = e => { ST.reactor.refs.heatGoal = 1; after(1.5, () => { ST.reactor.refs.heatGoal = 0.4; }); logS('reactor', e); feed('req', '续跑', `压缩后自动续跑 · 上下文 ${fmtK(e.d.total_tokens)}`, e); };
H['x.compaction_checkpoint'] = e => { const C = ST.checkpoint.refs; C.amps[C.n % 4].visible = true; C.n++; busy('checkpoint', 2); visit('checkpoint', '封存检查点', 0.8, 2, 'work'); logS('checkpoint', e); setStatus('checkpoint', `${C.n} 支`); feed('sys', '存档', `压缩检查点 · ${e.d.checkpoint_file}`, e); };
H['x.memory_flush_started'] = e => { const D = ST.dewar.refs; D.openGoal = 1; D.vapor = 3; busy('dewar', 4); visit('dewar', '记忆写入液氮罐', 1.4, 2, 'work'); logS('dewar', e); feed('req', '记忆', '记忆写入开始（无工具的一次模型调用）', e); };
H['x.memory_flush_completed'] = e => { const D = ST.dewar.refs; D.openGoal = 0; D.count++; D.scr.paint({ title: `${D.count} 份记忆`, lines: [], rows: 1 }); logS('dewar', e); setStatus('dewar', e.d.result); feed('ok', '记忆', `记忆写入 · ${e.d.result}${e.d.path ? ' · ' + e.d.path : ''}`, e); };
H['x.memory_session_saved'] = e => { const D = ST.dewar.refs; D.vapor = 2; D.count++; D.scr.paint({ title: `${D.count} 份记忆`, lines: [], rows: 1 }); busy('dewar', 2); logS('dewar', e); feed('ok', '记忆', `会话记忆保存 · ${e.d.path}`, e); };
H['x.memory_dream_completed'] = e => { const D = ST.dewar.refs; D.vapor = 4; busy('dewar', 4); focus('dewar'); logS('dewar', e); feed('ok', '记忆', `记忆整合（做梦）· ${e.d.result}`, e); };
H['x.memory_files'] = e => { const D = ST.dewar.refs, n = (e.d.files || []).length; D.count = n; D.scr.paint({ title: `${n} 份记忆`, lines: [], rows: 1 }); logS('dewar', e); feed('sys', '记忆', `记忆文件 ${n} 个 · ${(e.d.files || []).map(f => f.path || f).join('、')}`, e); };
H['x.rewind_marker'] = e => {
  const T_ = ST.tape.refs; T_.speedGoal = -8; after(2.4, () => { T_.speedGoal = 0.15; });
  T_.counter.paint({ title: `IDX ${String(e.d.target_prompt_index).padStart(2, '0')}`, lines: [], rows: 1 });
  busy('tape', 2.5); focus('tape'); visit('tape', '倒带回退', 1.6, 3, 'work');
  setCtx(Math.round(S_.ctx * 0.6));
  logS('tape', e); feed('text', '回退', `回退到第 ${e.d.target_prompt_index} 个回合（${e.d.created_at}）`, e);
};
H['x.session_recap'] = e => { printTape(e.d.summary, true, '= '); busy('notebook', 2); logS('notebook', e); feed('text', '回顾', `${e.d.auto ? '自动' : ''}回顾 · ${e.d.summary}`, e); };
H['x.session_recap_unavailable'] = e => { logS('notebook', e); feed('sys', '回顾', '这次没法生成回顾', e); };
// ── subagents: the drone ──
const AWAY = () => V(DOCK.x + 300, ROOF + 280, DOCK.z + 140);
function droneFly(from, to, dur, done, dir = 1) { const D = ST.dock.refs; D.flight = { a: from.clone(), b: to.clone(), c: from.clone().lerp(to, 0.5).add(V(0, 60, 0)), t: 0, dur, done, dir }; }
H['x.subagent_spawned'] = e => {
  const D = ST.dock.refs; S_.sub = { id: e.d.subagent_id, type: e.d.subagent_type, desc: e.d.description };
  stState('dock', 'busy', 30); focus('dock'); logS('dock', e); setStatus('dock', `${e.d.subagent_type} · ${e.d.description}`);
  const card = $('#subcard'); card.hidden = false; $('#sub-state').textContent = '外派中'; $('#sub-line').textContent = `${e.d.subagent_type} · ${e.d.capability_mode || ''} · ${e.d.description}`; $('#sub-bar').style.width = '4%';
  if (!D.flight) droneFly(D.home, V(DOCK.x, ROOF + 30, DOCK.z), 1.6, () => droneFly(V(DOCK.x, ROOF + 30, DOCK.z), AWAY(), 2.2, () => { D.drone.visible = false; }));
  feed('sys', '外派', `子 agent 出发 · ${e.d.subagent_type} · ${e.d.description}`, e);
};
H['x.subagent_progress'] = e => {
  const d = e.d; $('#subcard').hidden = false; $('#sub-line').textContent = `${d.turn_count} 轮 · ${d.tool_call_count} 次工具 · ${fmtK(d.tokens_used)} token · ${Math.round(d.duration_ms / 1000)}s`;
  $('#sub-bar').style.width = Math.min(90, 20 + d.turn_count * 22) + '%'; setStatus('dock', `外派中 · ${d.turn_count} 轮`); ST.dock.refs.ping = 1; logS('dock', e);
  feed('sys', '外派', `进度 · ${d.turn_count} 轮 · ${d.tool_call_count} 次工具 · ${fmtK(d.tokens_used)} token`, e);
};
H['x.subagent_finished'] = e => {
  const d = e.d, D = ST.dock.refs;
  $('#sub-state').textContent = d.status === 'completed' ? '已返回' : d.status; $('#sub-bar').style.width = '100%';
  D.drone.visible = true;
  const carried = D.drone.children.find(c => c.userData.vial);
  if (carried) recolorVial(carried, FLUID.ok, FLUID.ok);
  droneFly(AWAY(), V(DOCK.x, ROOF + 30, DOCK.z), 2.2, () => droneFly(V(DOCK.x, ROOF + 30, DOCK.z), D.home, 1.6, () => {
    const vv = D.drone.children.find(c => c.userData.vial) || spawnVial(FLUID.ok, FLUID.ok, V(DOCK.x, DOCK.y + 2, DOCK.z - 6));
    const base = V(DOCK.x, DOCK.y + 2, DOCK.z - 6);
    dropItem(vv, world, base); SPAWNED.add(vv);
    robotTask([['say', '取回子 agent 的结果', 'work'], ...pickSteps(vv, base), ...pourSteps(FLUID.ok, '子 agent 结果倒回储液塔'), ['say', '待命', 'idle']], { pri: 3, expire: sceneClock + 25, onSkip: () => vv.removeFromParent() });
    stState('dock', 'idle'); after(4, () => { $('#subcard').hidden = true; });
  }), -1);
  logS('dock', e); toast('里程碑', '子 agent 带回结果');
  feed(d.status === 'completed' ? 'ok' : 'err', '外派', `子 agent ${d.status} · ${d.tool_calls} 次工具 · ${d.turns} 轮 · ${fmtMs(d.duration_ms)} · ${fmtK(d.tokens_used)} token${d.output ? ' · ' + d.output : ''}`, e);
};
// ── workflows: the parallel reactor array ──
H['x.workflow_updated'] = e => {
  const d = e.d, W = ST.workflow.refs;
  W.agents = (d.agents || []).slice(0, 8).map(a => ({ state: a.state, label: a.label }));
  (d.phases || []).slice(0, 5).forEach((p, i) => setLamp(W.phases[i], p.state === 'done' ? 0.9 : p.state === 'running' ? 0.6 : 0.06, p.state === 'done' ? FLUID.ok : FLUID.reason));
  W.scr.paint({ title: `${d.name} · ${d.status}`, lines: [`${d.current_phase || ''} · agent ${d.agents_used}/${d.agent_budget ?? '∞'}`], rows: 2 });
  busy('workflow', 2); focus('workflow'); logS('workflow', e); setStatus('workflow', `${d.current_phase || d.status}`);
  if (d.revision === 1) visit('workflow', '工作流装管', 1.4, 2, 'work');
  feed(d.status === 'complete' ? 'ok' : 'think', '工作流', `${d.name} r${d.revision} · ${d.status} · 阶段 ${d.current_phase || '—'} · ${d.active_agents} 个在跑${d.result_summary ? ' · ' + d.result_summary : ''}`, e);
};
// ── background tasks and monitors: the shaker and the chart recorder ──
H['x.task_backgrounded'] = e => {
  const I = ST.incubator.refs; I.shakeGoal = 1; I.running = true; I.timer = 0; I.liq.forEach(m => { m.visible = true; }); setLamp(I.lamp, 0.06);
  I.notes = []; I.pts = []; I.chart.paint({ pts: [], notes: [] });
  stState('incubator', 'busy', 60); focus('incubator'); visit('incubator', '放进摇床后台跑', 1.2, 2, 'work'); logS('incubator', e); setStatus('incubator', e.d.monitor_description || e.d.command);
  feed('tool', '后台', `转后台 · ${e.d.task_id} · ${e.d.command}${e.d.monitor_description ? ' · 监视：' + e.d.monitor_description : ''}`, e);
};
H['x.monitor_event'] = e => {
  const I = ST.incubator.refs, num = parseFloat((String(e.d.event_text).match(/-?\d+(\.\d+)?$/) || [])[0]);
  const v = Number.isFinite(num) ? clamp((num + 82) / 16, 0, 1) : Math.random();
  I.pts.push(v); I.penX = v; I.notes.push(oneLine(e.d.event_text)); I.chart.paint({ pts: I.pts, notes: I.notes, hex: v > 0.7 ? '#d93a3f' : '#e5650f' });
  busy('incubator', 1); logS('incubator', e); setStatus('incubator', oneLine(e.d.event_text));
  feed('tool', '监视', `${e.d.description} · ${e.d.event_text}`, e);
};
H['x.task_completed'] = e => {
  const I = ST.incubator.refs, snap = e.d.task_snapshot || {}; I.shakeGoal = 0; I.running = false; setLamp(I.lamp, 0.9, snap.exit_code === 0 || snap.explicitly_killed ? FLUID.ok : FLUID.err);
  after(3, () => { I.liq.forEach(m => { m.visible = false; }); setLamp(I.lamp, 0.06); });
  stState('incubator', 'idle'); logS('incubator', e);
  feed('ok', '后台', `后台完成 · ${snap.task_id} · exit ${snap.exit_code ?? '—'}${snap.explicitly_killed ? '（主动停止）' : ''}${e.d.will_wake ? ' · 会唤醒父会话' : ''}`, e);
};
// ── schedules ──
H['x.scheduled_task_created'] = e => { const T_ = ST.timer.refs; T_.pin.visible = true; busy('timer', 2); visit('timer', '插上定时销', 1, 2, 'work'); logS('timer', e); setStatus('timer', e.d.human_schedule); feed('user', '定时', `创建 · ${e.d.human_schedule} · ${e.d.prompt}`, e); };
H['x.scheduled_task_fired'] = e => { const T_ = ST.timer.refs; T_.ring = 2.5; busy('timer', 2.5); focus('timer'); logS('timer', e); feed('user', '定时', `到点触发 · ${e.d.human_schedule}${e.d.subagent_id ? ' · 派出 ' + e.d.subagent_id : ''} · 下次 ${e.d.next_fire_at || '—'}`, e); };
H['x.scheduled_task_deleted'] = e => { ST.timer.refs.pin.visible = false; logS('timer', e); setStatus('timer', '无'); feed('sys', '定时', `删除 · ${e.d.task_id}`, e); };
// ── models, retries, recovery ──
H['x.model_changed'] = e => { const R = ST.reactor.refs; R.scr.paint({ a: 'MODEL', b: e.d.model_id }); busy('reactor', 2); burst(V(REACT.x, FLASK.cy + 14, REACT.z), FLUID.cache, 8, 14); logS('reactor', e); feed('req', '换模型', `${e.d.model_id}${e.d.reasoning_effort ? ' · 推理强度 ' + e.d.reasoning_effort : ''}`, e); };
H['x.model_auto_switched'] = e => { const R = ST.reactor.refs; R.scr.paint({ a: 'SWITCH', b: e.d.new_model_id }); busy('reactor', 2); logS('reactor', e); feed('req', '换模型', `自动切换 ${e.d.previous_model_id} → ${e.d.new_model_id} · ${e.d.reason}`, e); };
H['x.retry_state'] = e => {
  const d = e.d, R = ST.reactor.refs, doom = /doom/.test(d.reason || '');
  if (d.type === 'retrying') {
    beacon('alert', 2.4); R.scr.paint({ a: `RETRY ${d.attempt}/${d.maxRetries}`, b: oneLine(d.reason).slice(0, 18) });
    for (let i = 0; i < 6; i++) fx.puffs.emit(V(REACT.x, R.cy1 + 1, REACT.z), V((Math.random() - 0.5) * 8, 14, (Math.random() - 0.5) * 8), 0xdfe3e8, 1.4, 4, 2, 0.5);
    if (doom) { R.bz = 2.4; R.runaway = true; after(2.4, () => { R.runaway = false; }); }
    feed('fog', doom ? '振荡' : '重试', doom ? `doom-loop：${d.reason} → 掐断重采样` : `重试 ${d.attempt}/${d.maxRetries} · ${d.reason}`, e);
  } else if (d.type === 'exhausted') { beacon('alert', 5); R.runaway = true; after(3, () => { R.runaway = false; }); stState('reactor', 'error', 3); feed('fog', '失控', `重试用完（${d.attempts} 次）· ${d.reason}${d.isRateLimited ? ' · 限流' : ''}`, e); }
  else { beacon('alert', 4); stState('reactor', 'error', 3); feed('fog', '失败', `请求失败 · ${d.errorType} · ${d.message}`, e); }
  stState('beacon', 'error', 2.4); logS('reactor', e); logS('beacon', e); focus('reactor');
};
H['x.auto_recovery_started'] = e => { const R = ST.reactor.refs; R.quench = 2.2; R.bz = 0; beacon('alert', 2); visit('reactor', '氮气淬灭 · 自救', 1.4, 4, 'work'); logS('beacon', e); feed('ok', '自救', `自动恢复第 ${e.d.attempt}/${e.d.max_retries} 次 · ${fmtMs(e.d.delay_ms)} 后重试 · ${e.d.error}`, e); };
H['x.auto_recovery_exhausted'] = e => { beacon('alert', 5); ST.reactor.refs.runaway = true; after(2.5, () => { ST.reactor.refs.runaway = false; }); stState('beacon', 'error', 4); logS('beacon', e); feed('fog', '自救', `自救耗尽（${e.d.attempts} 次）· ${e.d.error}`, e); };
H['x.relay_sync_status'] = e => { const A = ST.antenna.refs; A.title = `RELAY ${e.d.status}`; A.scr.paint({ title: A.title, amp: e.d.status === 'connected' ? 0.1 : 0.6 }); busy('antenna', 1.5); logS('antenna', e); feed(e.d.status === 'connected' ? 'sys' : 'err', '中继', `同步 ${e.d.status}${e.d.attempt ? ' · 第 ' + e.d.attempt + ' 次' : ''}`, e); };
// ── hooks panel housekeeping, images ──
H['x.hook_annotation'] = e => { ST.hooks.refs.k = ST.hooks.refs.k.map(() => 0.5); logS('hooks', e); feed('hook', '质检', `批注 · ${e.d.message}`, e); };
H['x.hooks_changed'] = e => { ST.hooks.refs.k = ST.hooks.refs.k.map(() => 0.8); logS('hooks', e); feed('sys', '质检', `Hook 变更 · ${e.d.hooks} 个 · ${e.d.project_trusted ? '项目已信任' : '项目未信任'}`, e); };
H['x.plugins_changed'] = e => { ST.hooks.refs.k = ST.hooks.refs.k.map(() => 0.6); logS('hooks', e); feed('sys', '插件', `插件变更 · ${(e.d.plugins || []).join('、')}`, e); };
H['x.plugin_updates_installed'] = e => { logS('hooks', e); feed('sys', '插件', `插件更新 · ${(e.d.updates || []).map(u => u.join(' ')).join('、')}`, e); };
H['x.image_compressed'] = e => { const R = ST.scope.refs; R.onGoal = 1; after(1.5, () => { R.onGoal = 0; }); R.scr.paint({ title: 'IMAGE · 压缩', lines: (e.d.images || []).map(i => `${i.name} ${fmtK(i.original_bytes)}→${fmtK(i.compressed_bytes)} B`), rows: 5 }); logS('scope', e); feed('sys', '图片', e.d.message, e); };
H['x.image_dropped'] = e => { logS('scope', e); feed('err', '图片', `丢弃 · ${(e.d.notes || []).join('；')}`, e); };

function dispatch(e) {
  if (skipTurn != null) { if (e.ti === skipTurn) return; skipTurn = null; }
  REAL_NOW = e.real;
  codexSee(e);
  const h = H[e.type];
  if (h) { try { h(e); } catch (err) { console.error('dispatch', e.type, err); } }
  else if (!QUIET.has(e.type)) feed('sys', '事件', `${e.type} · ${oneLine(JSON.stringify(e.d)).slice(0, 80)}`, e);
}
function pump() {
  while (!clock.blocked && cursor < TL.length && TL[cursor].vt <= clock.vt) dispatch(TL[cursor++]);
  if (cursor >= TL.length && !S_.ended) { S_.ended = true; feed('sys', '回放', '这一段播完了，8 秒后从头再来', null); afterReal(8, () => jumpTo(0)); }
}
// clear what is in flight (vials, robot tasks, the drone, timers) before a jump or a source switch
function settleScene() {
  ROBOT.tasks.length = 0; ROBOT.task = null; ROBOT.tw = null; ROBOT.wait = 0; ROBOT.pour = null; ROBOT.gripGoal = 0;
  if (ROBOT.held) { ROBOT.held.removeFromParent(); ROBOT.held = null; }
  for (const v of SPAWNED) v.removeFromParent();
  SPAWNED.clear(); timers.length = 0; realTimers.length = 0; S_.forming = null;
  const D = ST.dock.refs; D.flight = null; D.drone.visible = true; D.drone.position.copy(D.home); D.drone.children.filter(c => c.userData.vial).forEach(c => c.removeFromParent());
  const R = ST.reactor.refs; R.heatGoal = 0; R.mode = null; R.runaway = false; R.bz = 0;
  const I = ST.incubator.refs; I.shakeGoal = 0; I.running = false;
  ST.workflow.refs.agents = [];
  ST.rotavap.refs.spinGoal = 0; ST.rotavap.refs.fillGoal = 0; ST.rotavap.refs.recvGoal = 0;
  beacon(null); closeDialog(); clock.blocked = false; $('#subcard').hidden = true;
  for (const S of ST_LIST) { S.state = 'idle'; S.stateUntil = 0; }
}
function jumpTo(ti) {
  settleScene();
  const i = TL.findIndex(e => e.ti === ti);
  cursor = Math.max(0, i); clock.vt = cursor ? TL[cursor].vt - 400 : 0; skipTurn = null;
  Object.assign(S_, { turn: null, loop: null, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], ended: false });
  // the tower starts from the nearest context reading before the jump
  const prior = TL.slice(0, cursor).reverse().find(e => e.d && e.d.ctx);
  setCtx(prior ? prior.d.ctx : 0);
  if (!cursor) { stats.turns = []; stats.ttft = []; stats.ok = 0; stats.err = 0; stats.calls = 0; hud.stats(); }
  feed('sys', '跳转', ti ? `跳到「${chapterName(ti)}」` : `从头开始 · ${SRC_NAME[SRC]}`, null);
}
function chapterName(ti) { const t = TRACE.turns[ti]; if (!t) return ''; if (t.chapter) return t.chapter; if (t.n < 0) return '开场'; const um = t.events.find(e => e[1] === 'user.message'); return `第 ${t.n} 轮 · ${oneLine(um?.[2]?.text || '').slice(0, 22)}`; }
function switchSource(name) {
  if (name === SRC) return;
  settleScene();
  useSource(name);
  try { localStorage.setItem('starfleet.src', SRC); } catch (err) { /* storage may be blocked */ }
  cursor = 0; clock.vt = 0; skipTurn = null;
  Object.assign(S_, { turn: null, loop: null, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], ended: false, mode: 'default', yolo: false });
  ST.mode.refs.mode = 'default'; ST.mode.refs.yolo = false;
  stats.turns = []; stats.ttft = []; stats.ok = 0; stats.err = 0; stats.calls = 0; stats.tps = 0;
  const M = ST.meter.refs; M.tot = [0, 0, 0, 0]; M.calls = 0; M.api = 0; M.scr.paint({ vals: M.tot }); M.sub.paint({ t: '0 次请求 · 0 s' });
  feedEl.innerHTML = ''; feedCount = 0;
  SEEN.clear(); codexDirty = true;
  setCtx(0); hud.stats(); hud.run(null, null); renderChapters(); renderCodex(true); paintSource();
  ST.sign.refs.scr.paint({ t: SESSION.title || 'MV-01' });
  feed('sys', '切换', `${SRC_NAME[SRC]} · ${PROJECT} · ${SESSION.model}`, null);
  toast('数据来源', SRC_NAME[SRC]);
}
function paintSource() { document.querySelectorAll('#src-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.src === SRC))); $('#corner-title').textContent = `Starfleet · ${SRC_NAME[SRC]} · ${SESSION.model || '—'}`; }
function renderChapters() {
  $('#chap-h').textContent = `${SRC_NAME[SRC]} · ${TRACE.turns.length} 段`;
  $('#chapters').innerHTML = TRACE.turns.map((t, ti) => `<button type="button" data-ti="${ti}"><b>${esc(chapterName(ti))}</b><small>${t.events.length} 条事件</small></button>`).join('');
}

// ═════════════════════════ dialogs: the authorization slip, the radio call, the plan approval ═════════════════════════
const dlg = $('#dialog');
let dlgTimer = null;
function closeDialog() { if (dlgTimer) clearInterval(dlgTimer); dlgTimer = null; dlg.hidden = true; dlg.innerHTML = ''; }
function countdown(sec, el, label, onZero) {
  if (window.__starfleet?.auto) setTimeout(onZero, 0);
  let left = sec; const paint = () => { el.textContent = `${left}s 后${label}`; }; paint();
  dlgTimer = setInterval(() => { if (clock.paused) return; left--; paint(); if (left <= 0) onZero(); }, 1000);
}
function preview(T) {
  if (T?.diff) return `${T.diff.path}\n${String(T.diff.new || '').split('\n').slice(0, 6).map(l => '+ ' + l).join('\n')}`;
  const inp = T?.input || {};
  if (inp.command) return '$ ' + inp.command;
  if (inp.target_file || inp.file_path) return inp.target_file || inp.file_path;
  return T ? JSON.stringify(inp).slice(0, 300) : '';
}
function openPermission(e, res, T) {
  clock.blocked = true;
  const rec = res?.d.decision || 'allow', recTxt = rec === 'allow' ? '批准' : rec === 'deny' ? '拒绝' : '取消';
  const title = T ? T.title : e.d.name, pre = preview(T);
  dlg.innerHTML = `<div class="stripe"></div><header><strong>安全联锁 · 授权单</strong><span>${esc(e.d.name)}</span></header>
    <div class="body"><h4>${esc(title)}</h4>${pre ? `<pre>${esc(pre)}</pre>` : ''}
      <p class="rec">${SRC === 'demo' ? '演示脚本里' : '录制时'}这一步被<b>${recTxt}</b>，等了 ${fmtMs(res?.d.wait)}。接上实时会话后，这两个按钮会直接回复 ACP 的 session/request_permission。</p></div>
    <footer><button type="button" class="btn go" id="perm-allow">转动钥匙 · 批准</button><button type="button" class="btn no" id="perm-deny">拒绝</button><span class="countdown" id="perm-cd"></span></footer>`;
  dlg.hidden = false;
  const choose = (c, auto = false) => {
    closeDialog(); clock.blocked = false;
    if (auto) { feed('sys', '自动', `无人操作，按记录结果${recTxt}`, null); return; }
    feed('user', '你的决定', c === 'allow' ? '批准' : '拒绝', null);
    if (c === 'deny' && rec === 'allow') { divergeDeny(e, T); return; }
    if (c === 'allow' && rec !== 'allow') toast('回放', `记录里这一步被${recTxt}，回放沿用记录结果`);
  };
  $('#perm-allow').addEventListener('click', () => choose('allow'));
  $('#perm-deny').addEventListener('click', () => choose('deny'));
  countdown(9, $('#perm-cd'), `按记录结果（${recTxt}）继续`, () => choose(rec, true));
  $('#perm-allow').focus({ preventScroll: true });
}
function divergeDeny(e, T) {
  feed('err', '联锁', `你拒绝了 ${e.d.name} → 本轮中止（分支：记录里是批准）`, null, null, true);
  if (T) { T.perm = 'deny'; T.cancel = true; }
  interlockFlash('deny'); const R = ST.reactor.refs; R.heatGoal = 0; R.mode = null; hud.phase(null);
  skipTurn = e.ti;
  const next = TL.findIndex(x => x.i > e.i && x.ti !== e.ti);
  afterReal(1.2, () => { feed('err', '中止', `第 ${S_.turn} 轮已取消 · permission_rejected`, null, null, true); stState('cab', 'error', 1.6); });
  if (next >= 0) { cursor = next; clock.vt = Math.max(clock.vt, TL[next].vt - 1800); } else cursor = TL.length;
}
function parseAnswers(text) { const m = new Map(); for (const [, q, a] of String(text).matchAll(/"([^"]+)"="([^"]+)"/g)) m.set(q, a.split(/,\s*/)); return m; }
function openAsk(T, done) {
  clock.blocked = true; stState('radio', 'wait'); focus('radio'); beacon('wait');
  const qs = T.questions || [], rec = parseAnswers(done?.d.output || '');
  const recTxt = qs.map(q => (rec.get(q.q) || []).join('、')).filter(Boolean).join(' / ') || '—';
  dlg.innerHTML = `<header><strong>对讲机 · 实验员呼叫</strong><span>ask_user_question · ${qs.length} 个问题</span></header>
    <div class="body">${qs.map((q, qi) => `<fieldset><legend>${esc(q.q)}</legend>${q.options.map((o, oi) => `<label for="ask-${qi}-${oi}"><input id="ask-${qi}-${oi}" type="${q.multi ? 'checkbox' : 'radio'}" name="ask-${qi}" value="${esc(o.label)}"><span><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></span></label>`).join('')}</fieldset>`).join('')}
      <p class="rec">记录里的回答：<b>${esc(recTxt)}</b></p></div>
    <footer><button type="button" class="btn go" id="ask-send">回复</button><span class="countdown" id="ask-cd"></span></footer>`;
  dlg.hidden = false;
  const submit = auto => {
    if (auto) qs.forEach((q, qi) => q.options.forEach((o, oi) => { const inp = $(`#ask-${qi}-${oi}`); if (inp) inp.checked = (rec.get(q.q) || []).includes(o.label); }));
    const mine = qs.map((q, qi) => [...dlg.querySelectorAll(`input[name="ask-${qi}"]:checked`)].map(i => i.value).join('、') || '（未选）').join(' / ');
    closeDialog(); clock.blocked = false; stState('radio', 'busy', 1.5); beacon(null);
    feed('user', '回答', auto ? `按记录回答：${recTxt}` : `你的回答：${mine}（记录回答：${recTxt}）`, done);
  };
  $('#ask-send').addEventListener('click', () => submit(false));
  countdown(16, $('#ask-cd'), '按记录回答提交', () => submit(true));
}
function openPlanApproval(e) {
  clock.blocked = true;
  const plan = [...S_.tools.values()].reverse().find(t => t.name === 'exit_plan_mode');
  const entries = (TL.slice(0, e.i).reverse().find(x => x.type === 'acp.plan')?.d.entries) || [];
  dlg.innerHTML = `<header><strong>模式开关 · 批准方案</strong><span>exit_plan_mode · plan_approval</span></header>
    <div class="body"><h4>agent 想退出计划模式，开始动手</h4>${entries.length ? `<pre>${esc(entries.map((x, i) => `${i + 1}. ${x.content}`).join('\n'))}</pre>` : ''}
      <p class="rec">${plan?.input?.plan ? esc(plan.input.plan) + ' · ' : ''}批准后模式切回 default，反应釜正式加热。</p></div>
    <footer><button type="button" class="btn go" id="plan-ok">批准方案</button><button type="button" class="btn no" id="plan-more">再想想</button><span class="countdown" id="plan-cd"></span></footer>`;
  dlg.hidden = false;
  const done = (ok, auto) => { closeDialog(); clock.blocked = false; feed('user', auto ? '自动' : '你的决定', ok ? '批准方案' : '先不批（回放沿用记录：批准）', null); };
  $('#plan-ok').addEventListener('click', () => done(true));
  $('#plan-more').addEventListener('click', () => done(false));
  countdown(10, $('#plan-cd'), '按记录批准', () => done(true, true));
}
