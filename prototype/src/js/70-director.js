// ═════════════════════════ director: trace events → the lab ═════════════════════════
// blocked: a human decision is pending; hold: a demo has the stage (the replay waits for both)
const clock = { vt: 0, speed: 2, paused: false, blocked: false, hold: 0 };
let cursor = 0, skipTurn = null;
const S_ = { turn: null, loop: null, loopReal: 0, ctx: 0, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], bucket: 2, firstTool: false, firstFail: false, firstHuman: false, ended: false };
const ARCHIVE = { base: ARCHIVE_BASE.turns, turns: ARCHIVE_BASE.turns, tokens: ARCHIVE_BASE.tokens };
const countedTurns = new Set();
const timers = [], realTimers = [];
const after = (sec, fn) => timers.push({ t: sec, fn });
const afterReal = (sec, fn) => realTimers.push({ t: sec, fn });
function runTimers(list, dt) { for (let i = list.length - 1; i >= 0; i--) { list[i].t -= dt; if (list[i].t <= 0) { const tm = list.splice(i, 1)[0]; try { tm.fn(); } catch (err) { console.error(err); } } } }

function stationForTool(name, kind) {
  if (name === 'ask_user_question' || kind === 'ask_user') return 'radio';
  if (name === 'todo_write' || name === 'update_goal' || name === 'enter_plan_mode' || kind === 'think') return 'notebook';
  if (name === 'spawn_subagent') return 'dock';
  if (name === 'web_search' || name === 'web_fetch' || kind === 'fetch') return 'antenna';
  if (kind === 'read' || kind === 'list' || name === 'read_file' || name === 'list_dir') return 'scope';
  if (kind === 'search' || name === 'grep' || name === 'glob') return 'spectro';
  if (kind === 'write' || kind === 'edit' || name === 'write' || name === 'search_replace') return 'pipettor';
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

// ── where things happen ──
const SPOT = {
  order: V(-55, BENCH, -47),      // a tool order precipitates in front of the reactor
  product: V(-27, BENCH, -48),    // the decanted product waits by the receivers
  intake: V(100, 140, -26),       // the hatch tray in the bulkhead
  pour: V(TOWER.x, 155, TOWER.z + TOWER.r + 9),
};
const headAt = base => base + HOLD;
function pickSteps(item, base) {
  return [['move', V(base.x, headAt(base.y) + 10, base.z)], ['move', V(base.x, headAt(base.y), base.z)], ['grip'], ['wait', 0.12], ['take', item], ['move', V(base.x, headAt(base.y) + 14, base.z)]];
}
function placeSteps(item, base, parent = world) {
  return [['move', V(base.x, headAt(base.y) + 10, base.z)], ['move', V(base.x, headAt(base.y), base.z)], ['open'], ['put', item, { parent, pos: base.clone() }], ['wait', 0.1], ['move', V(base.x, headAt(base.y) + 14, base.z)]];
}
function pourSteps(hex, what) {
  return [['say', what, 'work'], ['move', SPOT.pour.clone().add(V(0, 6, 0))], ['move', SPOT.pour], ['pour', hex, 1.0], ['discard'], ['open'], ['call', () => { ST.tower.refs.splash = 1; busy('tower', 1); }], ['move', SPOT.pour.clone().add(V(0, 10, 0))]];
}
function wasteSteps(what) {
  const W = ST.waste.refs.dropAt;
  return [['say', what, 'error'], ['call', () => { ST.waste.refs.openGoal = 1; }], ['move', V(W.x, 150, W.z)], ['move', V(W.x, headAt(W.y) + 4, W.z)], ['open'], ['discard'], ['wait', 0.25], ['call', () => { ST.waste.refs.openGoal = 0; busy('waste', 1); }], ['move', V(W.x, 160, W.z)]];
}
function spawnVial(fluid, cap, pos, parent = world) {
  const v = makeVial(fluid, cap);
  v.position.copy(pos); v.scale.setScalar(0.05); parent.add(v);
  const grow = () => { v.scale.setScalar(Math.min(1, v.scale.x + 0.12)); if (v.scale.x < 1) after(0.02, grow); };
  grow();
  return v;
}
function burst(p, hex, n = 8, speed = 30, life = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; fx.drops.emit(p, V(Math.cos(a) * speed * Math.random(), speed * (0.4 + Math.random()), Math.sin(a) * speed * Math.random()), hex, life, 0.35 + Math.random() * 0.3); } }

// ── teletype: the prompt and the answer, printed on paper tape ──
function printTape(text, answer) {
  const R = ST.cab.refs, src = oneLine(text), width = 24, out = [];
  const head = answer ? '< ' : '> ';
  for (let i = 0, n = 0; i < src.length && n < 6; n++) { const step = n ? width : width - 2; out.push({ t: (n ? '  ' : head) + src.slice(i, i + step), dim: answer }); i += step; }
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
const TOOLFX = {
  scope: {
    run(T) { const R = ST.scope.refs; R.onGoal = 1; R.scr.paint({ title: `READ ${T.loc || T.title || ''}`, lines: ['…'], rows: 5 }); },
    done(T, ok) { const R = ST.scope.refs; R.scr.paint({ title: `${ok ? 'READ' : 'FAIL'} · ${T.loc || T.name}`, lines: outLines(T.result?.output, 5), rows: 5 }); after(1.8, () => { R.onGoal = 0; }); },
  },
  spectro: {
    run(T) { const R = ST.spectro.refs; R.onGoal = 1; R.scr.paint({ title: `/${oneLine(T.input.pattern || T.title || '').slice(0, 28)}/`, lines: [] }); },
    done(T, ok) {
      const R = ST.spectro.refs, m = /(\d+)\s+match/.exec(T.result?.output || ''), n = m ? +m[1] : outLines(T.result?.output, 99).length;
      const r = mulberry32(n * 7919 + (T.id || '').length), lines = [];
      for (let i = 0; i < Math.min(28, n); i++) lines.push([r(), [0xe8233a, 0xff7a1c, 0xffcf1a, 0x26c75a, 0x18c4dc, 0x2f7bff, 0x8a4dff].map(h => '#' + h.toString(16).padStart(6, '0'))[Math.floor(r() * 7)]]);
      R.scr.paint({ title: `${ok ? n + ' 处命中' : '失败'} · /${oneLine(T.input.pattern || '').slice(0, 18)}/`, lines });
      after(2.2, () => { R.onGoal = 0; });
    },
  },
  pipettor: {
    run(T) {
      const R = ST.pipettor.refs, d = T.diff || {}, adds = d.new ? d.new.split('\n').filter(Boolean).length : 0, dels = d.old ? d.old.split('\n').filter(Boolean).length : 0;
      R.scr.paint({ title: `EDIT ${shortPath(d.path || T.loc || '')}`, lines: [`+${adds}  −${dels}`, T.name], rows: 3 });
      const seq = [{ x: PIPET.x - 11, z: PIPET.z - 7 }];
      const total = Math.min(24, adds + dels), cols = [];
      for (let i = 0; i < total; i++) cols.push(i < Math.min(adds, total) ? FLUID.ok : FLUID.err);
      cols.forEach((hex, i) => seq.push({ x: PIPET.x + 4 - 5.5 + (R.wellIdx + i) % 12, z: PIPET.z + 2 - 3.5 + Math.floor(((R.wellIdx + i) % 96) / 12), fn: () => wellFill(hex) }));
      R.seq.push(...seq);
    },
    done(T, ok) { const R = ST.pipettor.refs; if (!ok) R.scr.paint({ title: 'EDIT · 失败', lines: outLines(T.result?.output, 2), rows: 3 }); },
  },
  hood: {
    run(T) { const R = ST.hood.refs; R.sashGoal = BENCH + 2; R.fireGoal = 1; R.term.paint({ title: 'TTY · 运行中', lines: [`$ ${T.input.command || T.title}`], rows: 5 }); },
    done(T, ok) {
      const R = ST.hood.refs; R.fireGoal = 0; R.lampHex = ok ? FLUID.ok : FLUID.err; if (!ok) R.smoke = 3;
      R.term.paint({ title: ok ? `TTY · exit ${T.exit ?? 0}` : 'TTY · 失败', lines: [`$ ${T.input.command || T.title}`, ...outLines(T.result?.output, 4)], rows: 5 });
      after(2.4, () => { R.sashGoal = BENCH + 14; R.lampHex = FLUID.ok; });
    },
  },
  radio: { run() { const R = ST.radio.refs; R.liftGoal = 1; R.scr.paint({ t: 'TX ··' }); }, done() { const R = ST.radio.refs; R.liftGoal = 0; R.scr.paint({ t: 'CH 09' }); } },
  notebook: {
    run(T) { const todos = T.input.todos || T.input.items; if (Array.isArray(todos)) ST.notebook.refs.paper.paint({ title: '实验方案', items: todos.slice(0, 8).map(t => ({ t: t.content || t.text || String(t), done: t.status === 'completed' })) }); },
    done() {},
  },
  antenna: { run(T) { const R = ST.antenna.refs; R.onGoal = 1; R.title = `RX · ${T.name}`; }, done() { after(1.4, () => { ST.antenna.refs.onGoal = 0; ST.antenna.refs.scr.paint({ title: 'RX · 待命', amp: 0.08 }); }); } },
  dock: { run() {}, done() {} },
  rack: { run() { ST.rack.refs.boot = [1.2, 1.2]; }, done() {} },
};
const shortPath = p => String(p || '').split('/').slice(-2).join('/');
const outLines = (s, n) => String(s || '').replace(/\d+→/g, '').split('\n').map(x => x.trimEnd()).filter(Boolean).slice(0, n);
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
  return [
    ['say', `取工单 · ${label}`, 'work'],
    ...pickSteps(T.vial, T.spot),
    ['say', `送去安全联锁 · ${label}`, 'work'],
    ['move', I.clone()],
    ['call', () => { T.atGate = true; ROBOT.at = 'interlock'; if (T.perm) interlockFlash(T.perm, true); else { stState('interlock', 'wait'); ST.interlock.refs.mode = 'wait'; ST.interlock.refs.scr.paint({ t: 'AUTH ?' }); ROBOT.mode = 'wait'; ROBOT.text = `等审批 · ${label}`; } }],
    ['until', () => T.perm != null || T.cancel, 18],
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
  if (port) {
    steps.push(['branch', () => (T.result?.ok ? [...pickSteps(T.vial, port), ...pourSteps(FLUID.ok, `结果倒回储液塔 · ${label}`)] : [...pickSteps(T.vial, port), ...wasteSteps(`失败 · ${label}`)])]);
  }
  steps.push(['say', '待命', 'idle']);
  return steps;
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
  // the robot fell behind: settle the books without the walk
  T.vial?.removeFromParent();
  if (T.result) finishTool(T); else T.pendingFinish = true;
}
function interlockFlash(dec, quiet = false) {
  const I = ST.interlock.refs, ok = dec === 'allow';
  I.mode = ok ? 'allow' : 'deny'; I.keyGoal = ok ? 1.4 : 0; I.until = sceneClock + 1.8;
  I.scr.paint({ t: ok ? 'GRANTED' : 'DENIED' });
  stState('interlock', ok ? 'idle' : 'error', ok ? 0 : 1.6);
  if (ROBOT.mode === 'wait') ROBOT.mode = ok ? 'work' : 'error';
  if (!quiet) busy('interlock', 1);
}

// ── event handlers ──
const H = {};
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
  const runs = e.d.runs || [], skipped = runs.filter(r => r.status === 'failed').length;
  ROBOT.scan = 1;
  logS(focusId || 'intake', e);
  feed('hook', '质检', `${e.d.event}${e.d.tool ? ' · ' + e.d.tool : ''} · ${runs.length} 个${skipped ? `，${skipped} 个未执行` : ''}`, e);
};
H['loop.start'] = e => {
  S_.loop = e.d.i; S_.loopReal = e.real; hud.run(S_.turn, e.d.i + 1);
  feed('req', '进样', `第 ${e.d.i + 1} 次反应 · 送样到 ${SESSION.model}`, e);
  logS('reactor', e); logS('pump', e);
  const P = ST.pump.refs; P.spinGoal = 1; after(1.8, () => { P.spinGoal = 0; });
  const R = ST.reactor.refs; R.heatGoal = 1; R.scr.paint({ a: 'HEAT', b: `req ${e.d.i + 1} · ${SESSION.model}` });
  busy('pump', 1.8); stState('reactor', 'busy'); focus('reactor');
  for (let i = 0; i < 6; i++) after(i * 0.18, () => fx.drops.emit(V(-82 + (Math.random() - 0.5), FLASK.cy + 38, -70), V(0, -16, 0), FLUID.context, 1.2, 0.5, { floor: FLASK.cy + 18 }));
  if (!ROBOT.task && !ROBOT.tasks.length) robotTask([['say', `第 ${e.d.i + 1} 次请求 · 等首滴`, 'watch'], ['move', ST.reactor.work.clone()]], { pri: 0, expire: sceneClock + 4 });
};
H.phase = e => {
  const p = e.d.phase, R = ST.reactor.refs; hud.phase(p);
  if (p === 'waiting_for_model') { R.heatGoal = 1; R.mode = null; }
  else if (p === 'streaming_reasoning') { R.mode = 'r'; R.spoutGoal = Math.PI; R.mixGoal.set(FLUID.context).lerp(new THREE.Color(FLUID.reason), 0.6); stState('reactor', 'busy'); setStatus('reactor', '回流 · 推理'); R.scr.paint({ a: 'REFLUX', b: 'reasoning' }); }
  else if (p === 'streaming_text') { R.mode = 't'; R.spoutGoal = 0; R.mixGoal.set(FLUID.context).lerp(new THREE.Color(FLUID.text), 0.6); stState('reactor', 'busy'); setStatus('reactor', '馏出 · 正文'); R.scr.paint({ a: 'DISTIL', b: 'answer' }); }
  else if (p === 'tool_execution') { R.mode = null; R.heatGoal = 0.45; stState('reactor', 'idle'); R.scr.paint({ a: 'HOLD', b: 'tools' }); }
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
  const target = stationForTool(d.name, d.kind);
  const spot = SPOT.order.clone().add(V((S_.tools.size % 3) * 5 - 5, 0, 0));
  const T = { id: d.id, name: d.name, kind: d.kind, label: d.label, target, ev: e, title: d.name, input: typeof d.input === 'object' && d.input ? d.input : {}, perm: null, result: null, spot };
  S_.tools.set(d.id, T);
  T.vial = spawnVial(FLUID.tool, MAT.amberlamp, spot);
  burst(spot.clone().add(V(0, 6, 0)), FLUID.tool, 10, 18);
  stats.calls++; hud.stats();
  logS('reactor', e); logS(target, e);
  feed('tool', '工单', `${d.label || d.name} → ${ST[target].name} · ${d.name}`, e);
  robotTask(toolSteps(T), { pri: 3, tag: 'tool', expire: sceneClock + 30, onSkip: () => skipTool(T) });
  if (!S_.firstTool) { S_.firstTool = true; toast('里程碑', '第一张工单'); }
};
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
  if (d.status === 'in_progress') { if (d.output && T.delivered) setStatus(T.target, oneLine(d.output).slice(0, 30)); return; }
  if (d.status !== 'completed' && d.status !== 'failed') return;
  T.result = { ok: d.status === 'completed', output: d.output || d.error || '', ev: e };
  if (T.pendingFinish) finishTool(T);
};
H['permission.request'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && !x.permReq);
  if (T) T.permReq = e;
  logS('interlock', e);
  const res = e.link;
  if (!e.human) { feed('perm', '联锁', `${e.d.name} · 规则自动放行（录制时 ${fmtMs(res?.d.wait)}）`, e); return; }
  feed('perm', '联锁', `${e.d.name} · 等你批准`, e);
  const I = ST.interlock.refs; I.mode = 'wait'; I.scr.paint({ t: 'AUTH ?' }); stState('interlock', 'wait'); focus('interlock');
  if (!S_.firstHuman) { S_.firstHuman = true; toast('里程碑', '第一次人工审批'); }
  openPermission(e, res, T);
};
H['permission.resolve'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && x.permReq && !x.perm), dec = e.d.decision;
  if (T) T.perm = dec === 'allow' ? 'allow' : dec;
  logS('interlock', e);
  if (dec !== 'allow') { feed('err', '联锁', `${e.d.name} · ${dec === 'deny' ? '已拒绝' : '已取消'} · 录制时等了 ${fmtMs(e.d.wait)}`, e); interlockFlash(dec); }
  else { if (e.d.wait >= 600) { feed('perm', '联锁', `${e.d.name} · 已批准`, e); interlockFlash('allow'); } }
  if (T && dec === 'allow' && e.ask) openAsk(T, e.ask);
};
H['turn.end'] = e => {
  const R = ST.reactor.refs; R.heatGoal = 0; R.mode = null; hud.phase(null); R.scr.paint({ a: 'IDLE', b: 'cooling' });
  stState('reactor', 'idle'); logS('cab', e);
  if (e.d.outcome === 'cancelled') { feed('err', '中止', `第 ${S_.turn} 轮已取消 · ${e.d.cancel || ''}`, e); stState('cab', 'error', 1.6); }
};
H['turn.completed'] = e => {
  const u = e.d.usage || {}, ok = e.d.stop !== 'cancelled';
  stats.turns.push({ n: S_.turn, input: u.inputTokens || 0, cached: u.cachedReadTokens || 0, output: u.outputTokens || 0, reasoning: u.reasoningTokens || 0, api: u.apiDurationMs || 0 });
  if (u.apiDurationMs) stats.tps = (u.outputTokens || 0) / (u.apiDurationMs / 1000);
  hud.stats(); logS('archive', e);
  const hit = u.inputTokens ? Math.round((100 * (u.cachedReadTokens || 0)) / u.inputTokens) : 0;
  feed('turn', ok ? '封样' : '计费', `${e.d.stop} · 进样 ${fmtK(u.inputTokens)}（回收 ${hit}%）· 产出 ${fmtK(u.outputTokens)} · 推理 ${fmtK(u.reasoningTokens)} · ${u.modelCalls ?? '—'} 次反应 · ${fmtMs(u.apiDurationMs)}`, e);
  const fresh = !countedTurns.has(e.i); countedTurns.add(e.i);
  const R = ST.reactor.refs;
  const v = spawnVial(ok ? FLUID.text : FLUID.err, ok ? 0x2f7bff : FLUID.err, SPOT.product);
  R.recvLv.a = 0; R.recvLv.b = 0; R.recvDirty = true;
  const store = () => {
    if (!fresh) return;
    ST.archive.refs.put(ARCHIVE.turns, ok ? FLUID.text : FLUID.err, 0xffcf1a);
    ARCHIVE.turns++; ARCHIVE.tokens += u.totalTokens || 0;
    ST.archive.refs.scr.paint({ n: ARCHIVE.turns }); hud.archive(); paintGauges();
    setStatus('archive', `${ARCHIVE.turns} 瓶 · +${fmtK(u.totalTokens)}`); busy('archive', 1.5);
  };
  const slot = FR_SLOTS[ARCHIVE.turns % FR_SLOTS.length];
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
const mcpIdx = server => MCP_SERVERS.indexOf(server);
H['mcp.starting'] = e => { const i = mcpIdx(e.d.server); if (i >= 0 && i < 2) ST.rack.refs.boot[i] = 3; busy('rack', 3); logS('rack', e); setStatus('rack', `${e.d.server} 启动中`); feed('sys', 'MCP', `${e.d.server} 启动中 · ${e.d.transport}`, e); };
H['mcp.connected'] = e => { const i = mcpIdx(e.d.server); if (i >= 0 && i < 2) { ST.rack.refs.online[i] = true; ST.rack.refs.boot[i] = 0; } logS('rack', e); setStatus('rack', `${e.d.server} · ${e.d.tools} 个工具`); feed('sys', 'MCP', `${e.d.server} 已连接 · ${e.d.tools} 个工具 · ${e.d.ms}ms`, e); };
H['mcp.ready'] = e => feed('sys', 'MCP', `MCP 就绪 · ${e.d.servers} 个服务 · ${e.d.tools} 个工具`, e);

function dispatch(e) {
  if (skipTurn != null) { if (e.ti === skipTurn) return; skipTurn = null; }
  REAL_NOW = e.real;
  const h = H[e.type];
  if (h) { try { h(e); } catch (err) { console.error('dispatch', e.type, err); } }
}
function pump() {
  while (!clock.blocked && !clock.hold && cursor < TL.length && TL[cursor].vt <= clock.vt) dispatch(TL[cursor++]);
  if (cursor >= TL.length && !S_.ended) { S_.ended = true; feed('sys', '回放', '录制片段播完，8 秒后从头重播', null); afterReal(8, restart); }
}
function restart() {
  cursor = 0; clock.vt = 0; skipTurn = null;
  Object.assign(S_, { turn: null, loop: null, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], ended: false });
  stats.turns = []; stats.ttft = []; stats.ok = 0; stats.err = 0; stats.calls = 0; hud.stats();
  feed('sys', '回放', '从头重播（样品冰箱保持真实累计，不重复入库）', null);
}

// ═════════════════════════ dialogs: the authorization slip and the radio call ═════════════════════════
const dlg = $('#dialog');
let dlgTimer = null;
function closeDialog() { if (dlgTimer) clearInterval(dlgTimer); dlgTimer = null; dlg.hidden = true; dlg.innerHTML = ''; }
function countdown(sec, el, label, onZero) {
  if (window.__starfleet?.auto) setTimeout(onZero, 0);
  let left = sec; const paint = () => { el.textContent = `${left}s 后${label}`; }; paint();
  dlgTimer = setInterval(() => { if (clock.paused) return; left--; paint(); if (left <= 0) onZero(); }, 1000);
}
function preview(T) {
  if (T?.diff) return `${T.diff.path}\n${T.diff.new.split('\n').slice(0, 6).map(l => '+ ' + l).join('\n')}`;
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
      <p class="rec">录制时你<b>${recTxt}</b>了这一步，等了 ${fmtMs(res?.d.wait)}。接上实时会话后，这两个按钮会直接回复 ACP 的 session/request_permission。</p></div>
    <footer><button type="button" class="btn go" id="perm-allow">转动钥匙 · 批准</button><button type="button" class="btn no" id="perm-deny">拒绝</button><span class="countdown" id="perm-cd"></span></footer>`;
  dlg.hidden = false;
  const choose = (c, auto = false) => {
    closeDialog(); clock.blocked = false;
    if (auto) { feed('sys', '自动', `无人操作，按录制结果${recTxt}`, null); return; }
    feed('user', '你的决定', c === 'allow' ? '批准' : '拒绝', null);
    if (c === 'deny' && rec === 'allow') { divergeDeny(e, T); return; }
    if (c === 'allow' && rec !== 'allow') toast('回放', `录制时这一步被${recTxt}，回放沿用录制结果`);
  };
  $('#perm-allow').addEventListener('click', () => choose('allow'));
  $('#perm-deny').addEventListener('click', () => choose('deny'));
  countdown(9, $('#perm-cd'), `按录制结果（${recTxt}）继续`, () => choose(rec, true));
  $('#perm-allow').focus({ preventScroll: true });
}
function divergeDeny(e, T) {
  feed('err', '联锁', `你拒绝了 ${e.d.name} → 本轮中止（演示分支：录制时是批准）`, null, null, true);
  if (T) { T.perm = 'deny'; T.cancel = true; }
  interlockFlash('deny'); const R = ST.reactor.refs; R.heatGoal = 0; R.mode = null; hud.phase(null);
  skipTurn = e.ti;
  const next = TL.findIndex(x => x.i > e.i && x.ti !== e.ti);
  afterReal(1.2, () => { feed('err', '中止', `第 ${S_.turn} 轮已取消 · permission_rejected`, null, null, true); stState('cab', 'error', 1.6); });
  if (next >= 0) { cursor = next; clock.vt = Math.max(clock.vt, TL[next].vt - 1800); } else cursor = TL.length;
}
function parseAnswers(text) { const m = new Map(); for (const [, q, a] of String(text).matchAll(/"([^"]+)"="([^"]+)"/g)) m.set(q, a.split(/,\s*/)); return m; }
function openAsk(T, done) {
  clock.blocked = true; stState('radio', 'wait'); focus('radio');
  const qs = T.questions || [], rec = parseAnswers(done?.d.output || '');
  const recTxt = qs.map(q => (rec.get(q.q) || []).join('、')).filter(Boolean).join(' / ') || '—';
  dlg.innerHTML = `<header><strong>对讲机 · 实验员呼叫</strong><span>ask_user_question · ${qs.length} 个问题</span></header>
    <div class="body">${qs.map((q, qi) => `<fieldset><legend>${esc(q.q)}</legend>${q.options.map((o, oi) => `<label for="ask-${qi}-${oi}"><input id="ask-${qi}-${oi}" type="${q.multi ? 'checkbox' : 'radio'}" name="ask-${qi}" value="${esc(o.label)}"><span><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></span></label>`).join('')}</fieldset>`).join('')}
      <p class="rec">录制时的回答：<b>${esc(recTxt)}</b></p></div>
    <footer><button type="button" class="btn go" id="ask-send">回复</button><span class="countdown" id="ask-cd"></span></footer>`;
  dlg.hidden = false;
  const submit = auto => {
    if (auto) qs.forEach((q, qi) => q.options.forEach((o, oi) => { const inp = $(`#ask-${qi}-${oi}`); if (inp) inp.checked = (rec.get(q.q) || []).includes(o.label); }));
    const mine = qs.map((q, qi) => [...dlg.querySelectorAll(`input[name="ask-${qi}"]:checked`)].map(i => i.value).join('、') || '（未选）').join(' / ');
    closeDialog(); clock.blocked = false; stState('radio', 'busy', 1.5);
    feed('user', '回答', auto ? `按录制回答：${recTxt}` : `你的回答：${mine}（录制回答：${recTxt}）`, done);
  };
  $('#ask-send').addEventListener('click', () => submit(false));
  countdown(16, $('#ask-cd'), '按录制回答提交', () => submit(true));
}
