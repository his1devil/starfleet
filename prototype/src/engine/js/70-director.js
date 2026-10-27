// ═════════════════════════ director: trace events → the board ═════════════════════════
// blocked: a human decision is pending (the replay waits for you)
const clock = { vt: 0, speed: 2, paused: false, blocked: false, hold: 0 };
let cursor = 0, skipTurn = null;
const S_ = { turn: null, loop: null, loopReal: 0, ctx: 0, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], bucket: 2, firstTool: false, firstFail: false, firstHuman: false, ended: false, forming: null, mode: 'default', yolo: false, msgs: 0, mag: [], trayN: 0 };
const ARCHIVE = { base: ARCHIVE_BASE.turns, turns: ARCHIVE_BASE.turns, tokens: ARCHIVE_BASE.tokens };
const countedTurns = new Set();
const timers = [], realTimers = [];
const after = (sec, fn) => timers.push({ t: sec, fn });
const afterReal = (sec, fn) => realTimers.push({ t: sec, fn });
// a timer may clear the list it is on (a jump settles the scene), so each step re-checks what is left
function runTimers(list, dt) { for (let i = list.length - 1; i >= 0; i--) { const tm = list[i]; if (!tm) continue; tm.t -= dt; if (tm.t <= 0) { list.splice(i, 1); try { tm.fn(); } catch (err) { console.error(err); } } } }

// the codex names van stations; this is where each of them lives on the board
const CODEX_MAP = {
  intake: 'term', cab: 'term', radio: 'term', pump: 'dma', reactor: 'core', tower: 'ctx', cache: 'kv', interlock: 'gate', waste: 'fault',
  archive: 'archive', mode: 'mode', verifier: 'verify', supervisor: 'watch', goalboard: 'goal', rack: 'mcp', notebook: 'plan', sign: 'sign',
  pipettor: 'write', rotavap: 'compact', checkpoint: 'snap', dewar: 'mem', dock: 'sub', workflow: 'flow', incubator: 'daemon', timer: 'rtc',
  beacon: 'beacon', hooks: 'hooks', tape: 'journal', scope: 'read', carousel: 'list', spectro: 'search', hood: 'shell', antenna: 'net', meter: 'meter', power: 'power',
};
function codexStation(k) { return CODEX_MAP[k] || k; }
function inspectRobot() {
  openInspector('搬运车 · agent', `<p>搬运车就是正在干活的 agent：从模型核心的派单托盘取工单，过权限闸门送到对应的工具模块，再把结果插回上下文卡匣。它的指示灯：灰色待命，青色忙碌，黄色闪烁是在等你，红色是出错。</p><dl><dt>当前</dt><dd>${esc(ROBOT.text)}</dd><dt>排队</dt><dd>${ROBOT.tasks.length} 项</dd><dt>位置</dt><dd>${ROBOT.at ? esc(ST[ROBOT.at]?.name || ROBOT.at) : '—'}</dd></dl>`);
}
function stationForTool(name = '', kind) {
  if (name === 'ask_user_question' || kind === 'ask_user') return 'term';
  if (name === 'enter_plan_mode' || name === 'exit_plan_mode') return 'mode';
  if (name === 'todo_write' || kind === 'think') return 'plan';
  if (name === 'update_goal') return 'goal';
  if (name === 'workflow') return 'flow';
  if (name === 'spawn_subagent') return 'sub';
  if (name === 'monitor' || /command_or_subagent/.test(name)) return 'daemon';
  if (/^scheduler_/.test(name)) return 'rtc';
  if (/^memory_/.test(name)) return 'mem';
  if (name === 'web_search' || name === 'web_fetch' || kind === 'fetch') return 'net';
  if (name === 'list_dir' || kind === 'list') return 'list';
  if (kind === 'read' || name === 'read_file') return 'read';
  if (kind === 'search' || name === 'grep' || name === 'glob') return 'search';
  if (kind === 'write' || kind === 'edit' || name === 'write' || name === 'search_replace' || name === 'apply_patch') return 'write';
  if (kind === 'execute' || name === 'run_terminal_command') return 'shell';
  return 'mcp';
}
// stations past the gate: a job for them has to go through it
const TOOL_SIDE = id => ST[id] && ST[id].work.x > GATE.x;
let focusId = null;
function focus(id) { focusId = id; for (const S of ST_LIST) S.litGoal = S.id === id ? 1 : 0; }
function busy(id, dur = 1.2) { const S = ST[id]; if (!S) return; S.state = 'busy'; S.stateUntil = sceneClock + dur; }
function stState(id, state, dur = 0) { const S = ST[id]; if (!S) return; S.state = state; S.stateUntil = dur ? sceneClock + dur : 0; }
function logS(id, e) { const S = ST[id]; if (S && e) { S.events.push(e); if (S.events.length > 30) S.events.shift(); } }
function setCtx(tokens, demo = false) {
  if (!demo) S_.ctx = tokens;
  ST.ctx.refs.level = ctxFrac(tokens / WINDOW_TOKENS);
  hud.ctx(tokens, demo);
  setStatus('ctx', `${fmtK(tokens)} · ${((tokens / WINDOW_TOKENS) * 100).toFixed(1)}%`);
}
// a short visit: the courier goes to look at a station for a moment
function visit(id, text, dwell = 1, pri = 1, mode = 'watch') { const S = ST[id]; if (!S || ROBOT.tasks.length > 3) return; robotTask([['say', text, mode], ['call', () => { ROBOT.at = id; }], ['move', S.work.clone()], ['wait', dwell]], { pri, expire: sceneClock + 6 }); }
function beacon(mode, sec) { const B = ST.beacon.refs; B.mode = mode; B.until = sec ? sceneClock + sec : 0; }

// ── the magazine: each message is a cartridge in the next slot ──
function magSet(i, hex) {
  const R = ST.ctx.refs; R.put(i, hex); S_.mag[i % (MAG_N * 2)] = hex; R.flash = 1;
  const n = Math.min(S_.msgs, MAG_N * 2);
  R.scr.paint({ t: `CTX · ${S_.msgs} msg${S_.msgs > MAG_N * 2 ? ' · 循环' : ''}` }); busy('ctx', 1);
  return n;
}
// reserve the next slot now, so results that land out of order keep their places
const reserveSlot = () => S_.msgs++;
function magClear() { ST.ctx.refs.clear(); S_.msgs = 0; S_.mag = []; ST.ctx.refs.scr.paint({ t: 'CTX · 0 msg' }); }

// ── where things happen ──
const headAt = base => base + HOLD;
const GATE_WAIT = () => V(GATE.x - 30, CLEAR_Y, 0);
function pickSteps(item, base) {
  return [['move', V(base.x, headAt(base.y) + 10, base.z)], ['move', V(base.x, headAt(base.y), base.z)], ['grip'], ['wait', 0.12], ['take', item], ['move', V(base.x, headAt(base.y) + 14, base.z)]];
}
function placeSteps(item, base, parent = world) {
  return [['move', V(base.x, headAt(base.y) + 10, base.z)], ['move', V(base.x, headAt(base.y), base.z)], ['open'], ['put', item, { parent, pos: base.clone() }], ['wait', 0.1], ['move', V(base.x, headAt(base.y) + 14, base.z)]];
}
// carry the held cartridge to magazine slot i and file it as `hex`
function fileSteps(i, hex, what) {
  const p = magSlot(i);
  return [['say', what, 'work'], ['call', () => { ROBOT.at = 'ctx'; }],
    ['move', V(p.x, headAt(p.y) + 12, p.z)], ['move', V(p.x, headAt(p.y), p.z)], ['open'],
    ['call', () => { if (ROBOT.held) { SPAWNED.delete(ROBOT.held); ROBOT.held.removeFromParent(); ROBOT.held = null; } magSet(i, hex); }], ['wait', 0.1],
    ['move', V(p.x, headAt(p.y) + 14, p.z)]];
}
function faultSteps(what) {
  const F = ST.fault.refs, W = V(FAULT.x, TOP + 13, FAULT.z);
  return [['say', what, 'error'], ['call', () => { F.openGoal = 1; ROBOT.at = 'fault'; }], ['move', V(W.x, headAt(W.y) + 10, W.z)], ['move', V(W.x, headAt(W.y), W.z)], ['open'], ['discard'], ['wait', 0.25], ['call', () => { F.openGoal = 0; F.n++; busy('fault', 1); setStatus('fault', `${F.n} 件`); }], ['move', V(W.x, headAt(W.y) + 16, W.z)]];
}
const SPAWNED = new Set();
function spawnCart(hex, pos, parent = world) {
  const c = makeCart(hex);
  c.position.copy(pos); c.scale.setScalar(0.05); parent.add(c); SPAWNED.add(c);
  const grow = () => { c.scale.setScalar(Math.min(1, c.scale.x + 0.12)); if (c.scale.x < 1) after(0.02, grow); };
  grow();
  return c;
}
function burst(p, hex, n = 8, speed = 30, life = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; fx.drops.emit(p, V(Math.cos(a) * speed * Math.random(), speed * (0.4 + Math.random()), Math.sin(a) * speed * Math.random()), hex, life, 0.35 + Math.random() * 0.3); } }
// things that fly on their own (compaction feed): quadratic arcs, advanced by the frame loop
const FLIGHTS = [];
function fly(obj, to, dur, lift = 30, done) { const a = obj.position.clone(); FLIGHTS.push({ obj, a, b: to.clone(), c: a.clone().lerp(to, 0.5).add(V(0, lift, 0)), t: 0, dur, done }); }
function updateFlights(dt) {
  for (let i = FLIGHTS.length - 1; i >= 0; i--) {
    const F = FLIGHTS[i]; F.t = Math.min(1, F.t + dt / F.dur); const u = ease(F.t);
    F.obj.position.set((1 - u) * (1 - u) * F.a.x + 2 * (1 - u) * u * F.c.x + u * u * F.b.x, (1 - u) * (1 - u) * F.a.y + 2 * (1 - u) * u * F.c.y + u * u * F.b.y, (1 - u) * (1 - u) * F.a.z + 2 * (1 - u) * u * F.c.z + u * u * F.b.z);
    if (F.t >= 1) { FLIGHTS.splice(i, 1); try { F.done?.(); } catch (err) { console.error(err); } }
  }
}

// ── the console: prompts and answers scroll on the terminal ──
function printTerm(text, kind = 'user', prefix) {
  const R = ST.term.refs, src = oneLine(text), width = 30, out = [];
  const head = prefix ?? (kind === 'user' ? '> ' : '< ');
  for (let i = 0, n = 0; i < src.length && n < 5; n++) { const step = n ? width : width - head.length; out.push({ t: (n ? '  ' : head) + src.slice(i, i + step), dim: kind === 'answer' || kind === 'sys', gold: kind === 'user' }); i += step; }
  R.lines.push(...out);
  while (R.lines.length > 40) R.lines.shift();
  R.scr.paint({ lines: R.lines, head: `TK-1 · tty0 · ${SESSION.model || ''}` });
  busy('term', 1.6);
}

// ── the core's per-token show: a sampled token, a ring up the stack, a pulse down a bus ──
function tokenFx(ch) {
  if (ch === 'r') {
    sampleToken(FLUID.reason); fx.pulses.emit('think', FLUID.reason, { speed: 110 });
    const Sp = ST.spool.refs; Sp.fill = Math.min(1, Sp.fill + 0.012); Sp.spin = 0.6;
  } else if (ch === 't') {
    sampleToken(FLUID.text); fx.pulses.emit('text', FLUID.text, { speed: 170 });
  } else {
    sampleToken(FLUID.tool); fx.pulses.emit('job', FLUID.tool, { speed: 60 });
  }
}

// ── tool life: job on the tray → through the gate → module → result back into the magazine ──
const shortPath = p => String(p || '').split('/').slice(-2).join('/');
const outLines = (s, n) => String(s || '').replace(/\d+→/g, '').split('\n').map(x => x.trimEnd()).filter(Boolean).slice(0, n);
const TOOLFX = {
  read: {
    run(T) { const R = ST.read.refs; R.onGoal = 1; R.scr.paint({ title: `READ ${T.loc || T.title || ''}`, lines: ['…'], rows: 3 }); },
    done(T, ok) { const R = ST.read.refs; R.scr.paint({ title: `${ok ? 'READ' : 'FAIL'} · ${T.loc || T.name}`, lines: outLines(T.result?.output, 3), rows: 3 }); after(1.6, () => { R.onGoal = 0; }); },
  },
  list: {
    run(T) { const R = ST.list.refs; R.spin = 3; R.scr.paint({ title: `LIST ${T.loc || '.'}`, lines: ['…'], rows: 3 }); },
    done(T, ok) { const R = ST.list.refs, lines = outLines(T.result?.output, 12); R.spin = 0.6; R.scr.paint({ title: `${ok ? 'LIST' : 'FAIL'} · ${T.loc || '.'} · ${lines.length} 项`, lines: lines.length ? lines : outLines(T.result?.output, 3), rows: 3 }); },
  },
  search: {
    run(T) { const R = ST.search.refs; R.onGoal = 1; R.scr.paint({ title: `/${oneLine(T.input.pattern || T.input.query || T.title || '').slice(0, 28)}/`, lines: [] }); },
    done(T, ok) {
      const R = ST.search.refs, m = /(\d+)\s+(match|result)/.exec(T.result?.output || ''), n = m ? +m[1] : outLines(T.result?.output, 99).length;
      const r = mulberry32(n * 7919 + (T.id || '').length), lines = [], hues = ['#e8233a', '#ff7a1c', '#ffcf1a', '#26c75a', '#18c4dc', '#2f7bff', '#8a4dff'];
      for (let i = 0; i < Math.min(28, n); i++) lines.push([r(), hues[Math.floor(r() * 7)]]);
      R.scr.paint({ title: `${ok ? n + ' 处命中' : '失败'} · /${oneLine(T.input.pattern || '').slice(0, 18)}/`, lines });
      searchHits(n, n * 31 + (T.id || '').length);
      after(2, () => { R.onGoal = 0; });
    },
  },
  write: {
    run(T) {
      const R = ST.write.refs, d = T.diff || {}, adds = d.new ? d.new.split('\n').filter(Boolean).length : 0, dels = d.old ? d.old.split('\n').filter(Boolean).length : 0;
      R.scr.paint({ title: `EDIT ${shortPath(d.path || T.loc || '')}`, lines: [`+${adds}  −${dels}`, T.name], rows: 3 });
      plotDiff(Math.max(adds, d.new == null ? 3 : 0), dels);
    },
    done(T, ok) { const R = ST.write.refs; if (!ok) R.scr.paint({ title: 'EDIT · 失败', lines: outLines(T.result?.output, 2), rows: 3 }); },
  },
  shell: {
    run(T) { const R = ST.shell.refs; R.runGoal = 1; R.exitK = 0.05; R.term.paint({ title: 'SANDBOX · 运行中', lines: [`$ ${T.input.command || T.title}`, ...(T.progress || [])], rows: 5 }); },
    done(T, ok) {
      const R = ST.shell.refs; R.runGoal = 0; R.exitHex = ok ? FLUID.ok : FLUID.err; R.exitK = 0.95;
      if (!ok) burst(V(SHELL.x + 3, TOP + 26, SHELL.z), MAT.amberlamp, 16, 26);
      R.term.paint({ title: ok ? `SANDBOX · exit ${T.exit ?? 0}` : 'SANDBOX · 失败', lines: [`$ ${T.input.command || T.title}`, ...outLines(T.result?.output, 4)], rows: 5 });
      after(2.6, () => { R.exitK = 0.05; });
    },
  },
  net: { run(T) { const R = ST.net.refs; R.onGoal = 1; R.title = `RX · ${T.name}`; }, done(T) { const R = ST.net.refs; R.title = `RX · ${oneLine(T.result?.output).slice(0, 24)}`; after(1.4, () => { R.onGoal = 0; R.scr.paint({ title: 'RX · 待命', amp: 0.08 }); }); } },
  term: { run() { const R = ST.term.refs; R.ring = 2.4; printTerm('agent 有问题要问你', 'sys', '? '); }, done() {} },
  plan: { run(T) { const todos = T.input.todos || T.input.items; if (Array.isArray(todos)) paintPlan(todos.map(t => ({ content: t.content || t.text || String(t), status: t.status }))); }, done() {} },
  mcp: { run() { const R = ST.mcp.refs; R.pulse = 1.6; R.active = 0; }, done() {} },
  daemon: { run() { const R = ST.daemon.refs; R.spinGoal = Math.max(R.spinGoal, 0.4); after(1.6, () => { if (!R.running) R.spinGoal = 0; }); }, done() {} },
  rtc: { run() { ST.rtc.refs.pin.visible = true; }, done() {} },
  mem: { run() { ST.mem.refs.act = 1.6; }, done() {} },
  sub: { run() {}, done() {} }, flow: { run() {}, done() {} }, goal: { run() {}, done() {} }, mode: { run() {}, done() {} },
};
function paintPlan(items) { ST.plan.refs.paper.paint({ title: '计划', items: items.slice(0, 7).map(t => ({ t: t.content, done: t.status === 'completed' })) }); busy('plan', 1.5); }
// the walk through the gate: stop only when a person has to decide or the answer is no
function gateSteps(T, label) {
  return [
    ['say', `过闸 · ${label}`, 'work'],
    ['move', GATE_WAIT()],
    ['call', () => {
      T.atGate = true; ROBOT.at = 'gate';
      const G = ST.gate.refs;
      if (T.perm || (!T.permReq && T.noPerm)) gateFlash(T.perm || 'allow', true);
      else { stState('gate', 'wait'); G.mode = 'wait'; G.scr.paint({ t: S_.yolo ? 'BYPASS' : 'AUTH ?' }); ROBOT.mode = 'wait'; ROBOT.text = `等审批 · ${label}`; }
    }],
    ['until', () => T.perm != null || T.cancel || T.noPerm, 18],
    ['call', () => { if (!T.perm) T.perm = 'allow'; gateFlash(T.perm, true); }],
    ['wait', 0.35],
  ];
}
function toolSteps(T) {
  const tgt = ST[T.target], label = T.label || T.name, through = TOOL_SIDE(T.target);
  return [
    ['say', `取工单 · ${label}`, 'work'],
    ['call', () => { ROBOT.at = 'core'; }],
    ...pickSteps(T.cart, T.spot),
    ['call', () => { S_.trayN = Math.max(0, S_.trayN - 1); }],
    ...(through ? gateSteps(T, label) : [['until', () => T.perm != null || T.cancel || T.noPerm, 12], ['call', () => { if (!T.perm) T.perm = 'allow'; }]]),
    ['branch', () => (T.perm === 'allow' && !T.cancel ? deliverSteps(T, tgt) : [['call', () => { T.done = true; }], ...faultSteps(`工单作废 · ${label}`)])],
  ];
}
function deliverSteps(T, tgt) {
  const port = tgt.refs.port, label = T.label || T.name;
  const steps = [['say', `送到${tgt.name} · ${label}`, 'work']];
  if (port) steps.push(...placeSteps(T.cart, port));
  else steps.push(['move', tgt.work.clone()], ['discard']);
  steps.push(
    ['call', () => { T.delivered = true; ROBOT.at = T.target; focus(T.target); tgt.uses++; busy(T.target, 30); TOOLFX[T.target]?.run(T); setStatus(T.target, T.loc || shortPath(T.title)); renderStations(); }],
    ['say', `${tgt.name}工作中 · ${label}`, 'watch'],
    ['until', () => T.result != null, 20],
    ['wait', 0.8],
    ['call', () => finishTool(T)],
    ['branch', () => {
      const ok = !!T.result?.ok;
      // a module without a socket hands its result straight to the gripper
      const back = port ? pickSteps(T.cart, port)
        : [['call', () => { T.cart = makeCart(ok ? FLUID.ok : FLUID.err); SPAWNED.add(T.cart); dropItem(T.cart, courier.head, V(0, -HOLD, 0)); ROBOT.held = T.cart; }]];
      if (!ok) return [...back, ...faultSteps(`失败 · ${label}`)];
      return [...back, ...fileSteps(reserveSlot(), FLUID.ok, `结果插回上下文 · ${label}`)];
    }],
    ['say', '待命', 'idle'],
  );
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
  if (T.cart) recolorCart(T.cart, ok ? FLUID.ok : FLUID.err);
  if (!ok && !S_.firstFail) { S_.firstFail = true; toast('警报', `第一次工具失败 · ${T.name}`, true); }
}
function skipTool(T) {
  // the courier fell behind: settle the books without the walk; a good result still lands in the magazine
  if (T.cart) { SPAWNED.delete(T.cart); T.cart.removeFromParent(); }
  S_.trayN = Math.max(0, S_.trayN - 1);
  const settle = () => { finishTool(T); if (T.result?.ok) magSet(reserveSlot(), FLUID.ok); };
  if (T.result) settle(); else T.pendingFinish = settle;
}
function gateFlash(dec, quiet = false) {
  const G = ST.gate.refs, ok = dec === 'allow';
  G.mode = ok ? 'allow' : 'deny'; G.until = sceneClock + 1.8; G.scan = 1;
  G.scr.paint({ t: ok ? (S_.yolo ? 'BYPASS' : 'GRANTED') : 'DENIED' });
  stState('gate', ok ? 'idle' : 'error', ok ? 0 : 1.6);
  if (ROBOT.mode === 'wait') ROBOT.mode = ok ? 'work' : 'error';
  if (!quiet) busy('gate', 1);
}
function jiggle() { // a nudge: the courier is shoved back to work
  const p = ROBOT.tip.clone();
  robotTask([['say', '被推回去干活', 'error'], ['line', p.clone().add(V(8, 0, 0))], ['line', p.clone().add(V(-8, 0, 0))], ['line', p]], { pri: 4, expire: sceneClock + 3 });
}

// ── event handlers: one per event type the source can emit ──
const H = {};
const QUIET = new Set(['k', 'phase', 'tool.start', 'tool.end', 'x.response_started', 'x.reasoning_completed', 'x.response_completed', 'x.tool_call_delta_chunk', 'x.interaction_resolved']);
H['turn.start'] = e => {
  S_.turn = e.d.n; S_.loop = null; hud.run(S_.turn, '—'); hud.phase(null);
  if (e.idle > 60000) feed('sys', '空闲', `会话空闲 ${fmtIdle(e.idle)}，已跳过`, null);
  feed('turn', `第 ${e.d.n} 轮`, `新的委托 · 对话里已有 ${e.d.msgs} 条消息`, e);
  logS('term', e); busy('term', 2); focus('term');
  ST.beacon.refs.run = true;
  const J = ST.journal.refs; if (e.d.n >= 0) { J.idx = J.n % 24; J.lit[J.idx] = true; J.n++; J.dirty = true; setStatus('journal', `第 ${e.d.n} 轮`); }
  const Sp = ST.spool.refs; Sp.fill = 0;
};
H['user.message'] = e => {
  const text = oneLine(e.d.text);
  feed('user', '委托', text, e); logS('term', e);
  setStatus('term', text.slice(0, 22)); printTerm(text, 'user');
  fx.pulses.train('user', FLUID.user, 5, 0.09, { speed: 140 });
  const port = ST.term.refs.port, c = spawnCart(FLUID.user, port);
  busy('term', 3);
  const slot = reserveSlot();
  robotTask([['say', '接收委托', 'work'], ['call', () => { ROBOT.at = 'term'; }], ...pickSteps(c, port), ...fileSteps(slot, FLUID.user, '把委托插进上下文'), ['say', '待命', 'idle']],
    { pri: 3, tag: 'intake', expire: sceneClock + 20, onSkip: () => { SPAWNED.delete(c); c.removeFromParent(); magSet(slot, FLUID.user); } });
};
H.hook = e => {
  const ev = e.d.event, runs = e.d.runs || [], failed = runs.filter(r => r.status === 'failed').length, skipped = runs.filter(r => r.status === 'skipped').length;
  ROBOT.scan = 1;
  const i = HOOK_EVENTS.indexOf(ev), HB = ST.hooks.refs;
  if (i >= 0) { HB.k[i] = 1; HB.hex[i] = failed ? FLUID.err : skipped ? MAT.amberlamp : FLUID.ok; }
  logS('hooks', e); busy('hooks', 1); setStatus('hooks', ev);
  if (ev === 'session_start') { ST.power.refs.onGoal = 1; busy('power', 2); setStatus('power', '通电'); }
  if (ev === 'session_end') { ST.power.refs.onGoal = 0.04; busy('power', 2); setStatus('power', '断电'); }
  if (ev === 'notification' || ev === 'stop_failure') beacon(ev === 'stop_failure' ? 'alert' : 'wait', 2.4);
  if (ev === 'permission_denied') gateFlash('deny');
  if (ev === 'pre_compact' || ev === 'post_compact') busy('compact', 1.2);
  if (ev === 'subagent_start' || ev === 'subagent_stop') busy('sub', 1.2);
  feed(failed ? 'err' : 'hook', 'Hook', `${ev}${e.d.tool ? ' · ' + e.d.tool : ''} · ${runs.length} 个${failed ? `，${failed} 个失败` : skipped ? `，${skipped} 个跳过` : ''}`, e);
};
H['loop.start'] = e => {
  S_.loop = e.d.i; S_.loopReal = e.real; hud.run(S_.turn, e.d.i + 1);
  feed('req', '请求', `第 ${e.d.i + 1} 次请求 · 整排卡匣送进 ${SESSION.model}`, e);
  logS('core', e); logS('dma', e);
  const D = ST.dma.refs; D.act = 2; D.scr.paint({ title: `REQ ${e.d.i + 1} · prefill`, lines: [`${fmtK(S_.ctx)} tok → core`], rows: 2 });
  // every request reads the whole magazine: a train of pulses from the cartridges to the core
  fx.pulses.train('prefill', FLUID.context, 8, 0.07, { speed: 160, onEnd: () => fx.pulses.emit('prefill2', FLUID.context, { speed: 160 }) });
  ST.ctx.refs.flash = 1;
  const R = ST.core.refs; R.heatGoal = S_.mode === 'plan' ? 0.5 : 1; R.mode = null; R.plan = S_.mode === 'plan';
  R.scr.paint({ a: S_.mode === 'plan' ? 'PLAN · prefill' : 'PREFILL', b: `req ${e.d.i + 1} · ${SESSION.model}` });
  kvPrefill(kvUsed(S_.ctx), 0);
  ST.spool.refs.fill = 0;
  busy('dma', 1.8); stState('core', 'busy'); focus('core');
  if (!ROBOT.task && !ROBOT.tasks.length) robotTask([['say', `第 ${e.d.i + 1} 次请求 · 等首 token`, 'watch'], ['move', ST.core.work.clone()]], { pri: 0, expire: sceneClock + 4 });
};
H.phase = e => {
  const p = e.d.phase, R = ST.core.refs; hud.phase(p);
  if (p === 'waiting_for_model') { R.heatGoal = S_.mode === 'plan' ? 0.5 : 1; R.mode = null; }
  else if (p === 'streaming_reasoning') { R.mode = 'r'; stState('core', 'busy'); setStatus('core', '推理'); R.scr.paint({ a: 'REASONING', b: SESSION.model || '' }); busy('spool', 4); }
  else if (p === 'streaming_text') { R.mode = 't'; stState('core', 'busy'); setStatus('core', '正文'); R.scr.paint({ a: 'DECODE · text', b: SESSION.model || '' }); }
  else if (p === 'tool_execution') { R.mode = null; R.heatGoal = 0.45; stState('core', 'idle'); R.scr.paint({ a: 'HOLD · tools', b: '' }); }
  else if (p === 'permission_prompt') beacon('wait', 1.2);
};
H['request.first_token'] = e => {
  const ttft = e.real - S_.loopReal; stats.ttft.push(ttft); hud.stats();
  feed('req', '首 token', `TTFT ${fmtMs(ttft)}`, e); logS('core', e);
  const R = ST.core.refs; R.scr.paint({ a: `TTFT ${fmtMs(ttft)}`, b: 'first token' });
  setStatus('core', `首 token ${fmtMs(ttft)}`);
  burst(samplerPos(), FLUID.context, 10, 22);
};
H.k = e => {
  const ch = e.d === 'r' ? 'r' : 't';
  S_.ticks[ch]++;
  S_.tickTimes.push(e.real); while (S_.tickTimes.length && e.real - S_.tickTimes[0] > 2000) S_.tickTimes.shift();
  stats.tps = S_.tickTimes.length / 2;
  if (S_.bucket >= 1) { S_.bucket -= 1; tokenFx(ch); }
  else if (ch === 'r') { const Sp = ST.spool.refs; Sp.fill = Math.min(1, Sp.fill + 0.004); }
};
H['stream.thought'] = e => { if (e.d.ctx) setCtx(e.d.ctx); feed('think', '推理', e.d.text, e, `${e.d.len} 字`); logS('core', e); logS('spool', e); setStatus('spool', `${e.d.len} 字`); ST.spool.refs.spin = 1.5; };
H['stream.text'] = e => {
  if (e.d.ctx) setCtx(e.d.ctx);
  feed('text', '正文', e.d.text, e, `${e.d.len} 字`); logS('core', e); logS('term', e); printTerm(e.d.text, 'answer');
  // the answer is a message too: it is written back into the magazine
  const slot = reserveSlot();
  fx.pulses.train('prefill2', FLUID.text, 4, 0.1, { rev: true, speed: 160, onEnd: () => fx.pulses.emit('prefill', FLUID.text, { rev: true, speed: 160 }) });
  after(1.4, () => magSet(slot, FLUID.text));
};
H['tool.call'] = e => {
  const d = e.d; if (d.ctx) setCtx(d.ctx);
  const target = stationForTool(d.name, d.kind);
  const spot = TRAY_SPOTS[S_.trayN % 3]; S_.trayN++;
  const T = { id: d.id, name: d.name, kind: d.kind, label: d.label, target, ev: e, title: d.name, input: typeof d.input === 'object' && d.input ? d.input : {}, perm: null, result: null, spot, progress: [] };
  // plan / todo / goal / mode tools run without a permission prompt
  T.noPerm = !nextOf(e, x => x.type === 'permission.request' && x.d.name === d.name);
  S_.tools.set(d.id, T);
  if (S_.forming && S_.forming.id === d.id) { T.cart = S_.forming.cart; T.spot = S_.forming.spot; S_.forming = null; S_.trayN = Math.max(0, S_.trayN - 1); }
  else { T.cart = spawnCart(FLUID.tool, spot); cartFill(T.cart, 1); for (let i = 0; i < 3; i++) after(i * 0.12, () => tokenFx('c')); }
  cartFill(T.cart, 1);
  stats.calls++; hud.stats();
  logS('core', e); logS(target, e);
  ST.core.refs.mode = 'c';
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
    if (d.output) { T.progress.push(oneLine(d.output)); if (T.delivered) { setStatus(T.target, oneLine(d.output).slice(0, 30)); if (T.target === 'shell') ST.shell.refs.term.paint({ title: 'SANDBOX · 运行中', lines: [`$ ${T.input.command || T.title}`, ...T.progress.slice(-4)], rows: 5 }); } feed('tool', '输出', d.output, e); }
    return;
  }
  if (d.status !== 'completed' && d.status !== 'failed') return;
  T.result = { ok: d.status === 'completed', output: d.output || d.error || '', ev: e };
  if (T.pendingFinish) T.pendingFinish();
};
H['permission.request'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && !x.permReq);
  if (T) T.permReq = e;
  logS('gate', e);
  const res = e.link;
  if (S_.yolo && !e.human) { feed('perm', '闸门', `${e.d.name} · YOLO 旁路，直接放行`, e); return; }
  if (!e.human) { feed('perm', '闸门', `${e.d.name} · 规则自动放行（录制时 ${fmtMs(res?.d.wait)}）`, e); return; }
  feed('perm', '闸门', `${e.d.name} · 等你批准`, e);
  const G = ST.gate.refs; G.mode = 'wait'; G.scr.paint({ t: 'AUTH ?' }); stState('gate', 'wait'); focus('gate'); beacon('wait');
  if (!S_.firstHuman) { S_.firstHuman = true; toast('里程碑', '第一次人工审批'); }
  openPermission(e, res, T);
};
H['permission.resolve'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && x.permReq && !x.perm), dec = e.d.decision;
  if (T) T.perm = dec === 'allow' ? 'allow' : dec;
  logS('gate', e); beacon(null);
  if (dec !== 'allow') { feed('err', '闸门', `${e.d.name} · ${dec === 'deny' ? '已拒绝' : '已取消'} · 录制时等了 ${fmtMs(e.d.wait)}`, e); gateFlash(dec); }
  else if (e.d.wait >= 600) { feed('perm', '闸门', `${e.d.name} · 已批准`, e); gateFlash('allow'); }
  if (T && dec === 'allow' && e.ask) openAsk(T, e.ask);
};
H['turn.end'] = e => {
  const R = ST.core.refs; R.heatGoal = 0; R.mode = null; hud.phase(null); R.scr.paint({ a: 'IDLE', b: 'cooling' });
  stState('core', 'idle'); logS('term', e); ST.beacon.refs.run = false;
  if (e.d.outcome === 'cancelled') { feed('err', '中止', `第 ${S_.turn} 轮已取消 · ${e.d.cancel || ''}`, e); stState('term', 'error', 1.6); }
  if (e.d.outcome === 'error') { feed('err', '中止', `第 ${S_.turn} 轮失败`, e); stState('term', 'error', 2); beacon('alert', 3); }
};
H['turn.completed'] = e => {
  const u = e.d.usage || {}, ok = e.d.stop !== 'cancelled' && e.d.stop !== 'error';
  stats.turns.push({ n: S_.turn, input: u.inputTokens || 0, cached: u.cachedReadTokens || 0, output: u.outputTokens || 0, reasoning: u.reasoningTokens || 0, api: u.apiDurationMs || 0 });
  if (u.apiDurationMs && u.outputTokens) stats.tps = u.outputTokens / (u.apiDurationMs / 1000);
  hud.stats(); logS('archive', e); logS('meter', e);
  const M = ST.meter.refs; M.tot[0] += u.inputTokens || 0; M.tot[1] += u.cachedReadTokens || 0; M.tot[2] += u.outputTokens || 0; M.tot[3] += u.reasoningTokens || 0; M.calls += u.modelCalls || 0; M.api += u.apiDurationMs || 0;
  M.scr.paint({ vals: M.tot }); M.sub.paint({ t: `${M.calls} 次请求 · API ${fmtMs(M.api)}` }); busy('meter', 1.5); setStatus('meter', `+${fmtK(u.totalTokens)}`);
  const hit = u.inputTokens ? Math.round((100 * (u.cachedReadTokens || 0)) / u.inputTokens) : 0;
  feed('turn', ok ? '封存' : '计费', `${e.d.stop} · 输入 ${fmtK(u.inputTokens)}（缓存 ${hit}%）· 输出 ${fmtK(u.outputTokens)} · 推理 ${fmtK(u.reasoningTokens)} · ${u.modelCalls ?? '—'} 次请求 · ${fmtMs(u.apiDurationMs)}`, e);
  const fresh = SRC === 'replay' && !countedTurns.has(e.i); if (SRC === 'replay') countedTurns.add(e.i);
  const c = spawnCart(ok ? FLUID.text : FLUID.err, SEAL);
  const slotIdx = fresh ? ARCHIVE.turns : ARCHIVE.turns + ((S_.demoCarts = (S_.demoCarts || 0) + 1) % 6);
  const store = () => {
    if (fresh) {
      ST.archive.refs.put(ARCHIVE.turns, ok ? FLUID.text : FLUID.err, FLUID.user);
      ARCHIVE.turns++; ARCHIVE.tokens += u.totalTokens || 0;
      hud.archive();
      setStatus('archive', `${ARCHIVE.turns} 盒 · +${fmtK(u.totalTokens)}`);
    } else {
      // staged and replayed turns get a marked cartridge that does not count toward the long-term line
      ST.archive.refs.put(slotIdx, ok ? FLUID.text : FLUID.err, MAT.paper);
      setStatus('archive', SRC === 'demo' ? '演示回合 · 不计入长期累计' : '已计入');
    }
    ST.archive.refs.scr.paint({ n: ARCHIVE.turns }); busy('archive', 1.5);
  };
  const slot = archSlot(slotIdx);
  robotTask([
    ['say', '封存这一轮', 'work'], ...pickSteps(c, SEAL),
    ['call', () => { ROBOT.at = 'archive'; focus('archive'); }],
    ['move', V(slot.x, headAt(slot.y) + 14, slot.z)], ['move', V(slot.x, headAt(slot.y) + 0.5, slot.z)], ['open'],
    ['call', () => { if (ROBOT.held) { SPAWNED.delete(ROBOT.held); ROBOT.held.removeFromParent(); ROBOT.held = null; } store(); }], ['wait', 0.2],
    ['move', V(slot.x, headAt(slot.y) + 20, slot.z)],
    ['say', '待命 · 等下一份委托', 'idle'],
  ], { pri: 2, tag: 'archive', expire: sceneClock + 40, onSkip: () => { SPAWNED.delete(c); c.removeFromParent(); store(); } });
};
// ── MCP: the backplane ──
const mcpIdx = server => MCP_SERVERS.indexOf(server);
const mcpMod = (server, fn) => { const i = mcpIdx(server); if (i >= 0 && i < MCP_SLOTS) fn(ST.mcp.refs, i); };
const MCP_SPARK = () => V(MCPB.x, TOP + 30, MCPB.z - 6);
H['mcp.starting'] = e => { mcpMod(e.d.server, (R, i) => { R.boot[i] = 3; R.fail[i] = false; }); busy('mcp', 3); logS('mcp', e); setStatus('mcp', `${e.d.server} 启动中`); feed('sys', 'MCP', `${e.d.server} 启动中 · ${e.d.transport}`, e); };
H['mcp.connected'] = e => { mcpMod(e.d.server, (R, i) => { R.online[i] = true; R.boot[i] = 0; R.fail[i] = false; }); logS('mcp', e); setStatus('mcp', `${e.d.server} · ${e.d.tools} 个工具`); feed('sys', 'MCP', `${e.d.server} 已连接 · ${e.d.tools} 个工具 · ${e.d.ms}ms`, e); };
H['mcp.ready'] = e => feed('sys', 'MCP', `MCP 就绪 · ${e.d.servers} 个服务 · ${e.d.tools} 个工具`, e);
H['e.mcp_config_resolved'] = e => { logS('mcp', e); feed('sys', 'MCP', `配置解析 · ${(e.d.servers || []).map(s => s.name || s).join('、') || '无服务'}`, e); };
H['e.mcp_managed_config_result'] = e => { logS('mcp', e); feed('sys', 'MCP', `托管配置 · ${e.d.server_count ?? 0} 个${e.d.error ? ' · ' + e.d.error : ''}`, e); };
H['e.mcp_oauth_discovery_timeout'] = e => { mcpMod(e.d.server_name, (R, i) => { R.boot[i] = 1.5; }); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · OAuth 发现超时`, e); };
H['e.mcp_server_failed'] = e => { mcpMod(e.d.server_name, (R, i) => { R.fail[i] = true; R.online[i] = false; R.boot[i] = 0; }); stState('mcp', 'error', 2); burst(MCP_SPARK(), FLUID.err, 10, 16); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} 启动失败 · ${e.d.error_type} · ${e.d.error_message}`, e); };
H['e.mcp_auth_retry'] = e => { mcpMod(e.d.server_name, (R, i) => { R.boot[i] = 1.5; R.fail[i] = !e.d.success; }); logS('mcp', e); feed(e.d.success ? 'sys' : 'err', 'MCP', `${e.d.server_name} · 鉴权重试${e.d.success ? '成功' : '失败'}`, e); };
H['e.mcp_tool_registration_failed'] = e => { logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · 工具 ${e.d.tool_name} 注册失败 · ${e.d.error}`, e); };
H['e.mcp_init_cancelled'] = e => { logS('mcp', e); feed('sys', 'MCP', `MCP 初始化取消 · ${e.d.reason}`, e); };
H['e.mcp_tool_call_started'] = e => { mcpMod(e.d.server_name, (R, i) => { R.pulse = 2; R.active = i; }); busy('mcp', 2); logS('mcp', e); feed('tool', 'MCP', `${e.d.server_name} · ${e.d.tool_name} 调用开始`, e); };
H['e.mcp_tool_call_completed'] = e => { logS('mcp', e); feed(e.d.success ? 'ok' : 'err', 'MCP', `${e.d.server_name} · ${e.d.tool_name} · ${e.d.success ? '完成' : '失败'} · ${fmtMs(e.d.duration_ms)}${e.d.reconnect_attempted ? ' · 中途重连过' : ''}`, e); };
H['e.mcp_transport_error'] = e => { burst(MCP_SPARK(), MAT.amberlamp, 14, 22); stState('mcp', 'error', 1.2); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · 传输错误 · ${e.d.error}`, e); };
H['e.mcp_transport_decode_error'] = e => { burst(MCP_SPARK(), MAT.amberlamp, 8, 16); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · 解码错误 · ${e.d.error}`, e); };
H['e.mcp_transport_reconnect'] = e => { mcpMod(e.d.server_name, (R, i) => { R.boot[i] = 1; }); logS('mcp', e); feed(e.d.success ? 'sys' : 'err', 'MCP', `${e.d.server_name} · 重连${e.d.success ? '成功' : '失败'}`, e); };
H['e.mcp_health_check'] = e => { mcpMod(e.d.server_name, (R, i) => { R.heart[i] = 1.2; }); logS('mcp', e); feed('sys', 'MCP', `${e.d.server_name} · 健康检查 ${e.d.healthy ? '正常' : '异常'}`, e); };
H['e.mcp_server_toggled'] = e => { mcpMod(e.d.server_name, (R, i) => { R.online[i] = !!e.d.enabled; }); logS('mcp', e); feed('sys', 'MCP', `${e.d.server_name} · ${e.d.enabled ? '启用' : '停用'}`, e); };
// ── interjection, YOLO, stop gates ──
H['e.interjected'] = e => { const R = ST.term.refs; R.ring = 2.2; printTerm(`（插话 · ${e.d.source === 'queue' ? '排队' : '直接'}）`, 'user', '! '); busy('term', 2); beacon('wait', 1.6); logS('term', e); feed('user', '插话', `用户中途插话（${e.d.source === 'queue' ? '排队' : '直接'}）`, e); };
H['e.yolo_toggled'] = e => { S_.yolo = !!e.d.enabled; ST.mode.refs.yolo = S_.yolo; ST.gate.refs.scr.paint({ t: S_.yolo ? 'BYPASS' : 'LOCKED' }); visit('mode', S_.yolo ? '掀开红盖，转动 YOLO 钥匙' : '拔下 YOLO 钥匙', 0.8, 2); logS('mode', e); feed('perm', 'YOLO', S_.yolo ? '打开 · 权限闸门被旁路' : '关闭 · 权限闸门恢复', e); };
H['e.todo_gate_fired'] = e => { ST.verify.refs.todoK = 1; ST.watch.refs.alert = 1.6; busy('plan', 1.5); jiggle(); logS('verify', e); feed('err', '待办闸门', `还有 ${e.d.pending} 项待办没做完就想收工 → 退回继续（第 ${e.d.fires} 次）`, e); };
H['e.todo_gate_exhausted'] = e => { ST.verify.refs.todoK = 1; logS('verify', e); feed('err', '待办闸门', `闸门次数用完，放行 · 仍有 ${e.d.pending} 项待办`, e); };
H['e.laziness_classifier_fired'] = e => { ST.verify.refs.lazyK = 1; ST.watch.refs.alert = 2; logS('watch', e); feed('err', '巡检', `偷懒判定 · ${e.d.category} · 置信 ${Math.round((e.d.confidence || 0) * 100)}%`, e); };
H['e.laziness_nudge_fired'] = e => { ST.watch.refs.alert = 1.6; jiggle(); logS('watch', e); feed('err', '巡检', `提醒一次，把活干完 · 还剩 ${e.d.nudges_remaining} 次`, e); };
H['e.laziness_classifier_aborted'] = e => { logS('watch', e); feed('sys', '巡检', `偷懒判定中止 · ${e.d.reason}`, e); };
H['e.goal_premature_stop_detected'] = e => { ST.watch.refs.alert = 2; jiggle(); goalLog(`过早收工 · ${e.d.pattern}`); logS('watch', e); feed('err', '巡检', `没验证就说做完了（${e.d.pattern}）`, e); };
// ── goal mode: the board and the verification fixture ──
function goalLog(line) { const G = ST.goal.refs; G.state.log = [...(G.state.log || []), line].slice(-7); G.board.paint(G.state); busy('goal', 1.2); }
H['x.goal_updated'] = e => {
  const d = e.d, G = ST.goal.refs;
  Object.assign(G.state, { objective: d.objective, status: d.status, phase: d.phase, deliverables: d.deliverables, used: d.tokens_used, budget: d.token_budget });
  G.board.paint(G.state); busy('goal', 2); focus('goal'); logS('goal', e); setStatus('goal', `${d.phase} · ${d.completed_deliverables}/${d.total_deliverables}`);
  if (d.phase === 'verifying') visit('verify', '目标复核', 1.6, 2);
  else visit('goal', `目标 · ${d.phase}`, 0.8, 1);
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
    const txt = GOAL_TXT[k](e.d); goalLog(txt); logS(/role_model/.test(k) ? 'verify' : 'goal', e);
    const bad = /fail|cap_reached|dropped|cleared/.test(k);
    if (k === 'goal_auto_paused') stState('goal', 'wait', 2);
    feed(bad ? 'err' : 'ok', '目标', txt, e);
  };
}
H['e.goal_verifier_skeptic_verdict'] = e => { const V_ = ST.verify.refs, i = e.d.skeptic_idx % 3; V_.uk[i] = 1; V_.probe[i] = 1; setLamp(V_.units[i], 1, e.d.refuted ? FLUID.err : FLUID.ok); busy('verify', 2); focus('verify'); goalLog(`怀疑者 #${i + 1} · ${e.d.refuted ? '驳倒' : '没驳倒'}（${e.d.confidence}）`); logS('verify', e); feed(e.d.refuted ? 'err' : 'ok', '复核', `怀疑者 #${i + 1} · ${e.d.refuted ? '驳倒了结论' : '没能驳倒'} · 置信 ${e.d.confidence}`, e); };
H['e.goal_verifier_aggregate_verdict'] = e => { const V_ = ST.verify.refs; V_.aggK = 1; setLamp(V_.agg, 1, e.d.achieved ? FLUID.ok : FLUID.err); goalLog(`复核汇总 · ${e.d.refuted_count}/${e.d.total} 驳倒 → ${e.d.achieved ? '达成' : '未达成'}`); logS('verify', e); feed(e.d.achieved ? 'ok' : 'err', '复核', `${e.d.total} 个怀疑者里 ${e.d.refuted_count} 个驳倒 → ${e.d.achieved ? '目标达成' : '未达成'}`, e); };
// ── ACP extras: plan, commands, mode, session info ──
H['acp.plan'] = e => { paintPlan(e.d.entries || []); logS('plan', e); const done = (e.d.entries || []).filter(x => x.status === 'completed').length; setStatus('plan', `${done}/${(e.d.entries || []).length}`); visit('plan', '更新计划屏', 0.8, 1); feed('text', '计划', `计划 ${done}/${(e.d.entries || []).length} · ${(e.d.entries || []).map(x => x.content).join(' / ')}`, e); };
H['acp.available_commands_update'] = e => { printTerm((e.d.commands || []).join(' '), 'sys', '/ '); logS('term', e); feed('sys', '命令', `可用命令 ${(e.d.commands || []).length} 个 · ${(e.d.commands || []).slice(0, 6).join(' ')}`, e); };
H['acp.current_mode_update'] = e => {
  const m = e.d.mode; S_.mode = m; ST.mode.refs.mode = m; logS('mode', e); busy('mode', 1.5); setStatus('mode', m === 'plan' ? '计划模式' : '常规');
  const R = ST.core.refs; R.plan = m === 'plan';
  if (m === 'plan') { R.heatGoal = 0.5; R.scr.paint({ a: 'PLAN', b: 'dry run · no tools' }); ST.gate.refs.scr.paint({ t: 'PLAN' }); }
  else ST.gate.refs.scr.paint({ t: S_.yolo ? 'BYPASS' : 'LOCKED' });
  visit('mode', m === 'plan' ? '旋钮拨到计划' : '旋钮拨回常规', 0.6, 2);
  feed('text', '模式', m === 'plan' ? '进入计划模式 · 只出方案，不动手' : `回到 ${m} 模式`, e);
};
H['acp.session_info_update'] = e => { if (e.d.title) { ST.sign.refs.scr.paint({ t: e.d.title }); busy('sign', 2); setStatus('sign', e.d.title); } logS('sign', e); feed('sys', '标题', e.d.title || '会话信息更新', e); };
H['x.session_summary_generated'] = e => { ST.sign.refs.scr.paint({ t: e.d.session_summary }); busy('sign', 2); logS('sign', e); feed('sys', '标题', `生成标题 · ${e.d.session_summary}`, e); };
// ── response lifecycle: the KV cache and the core's display ──
H['x.response_started'] = e => {
  const d = e.d, hit = d.input_tokens ? d.cache_read_input_tokens / d.input_tokens : 0, K = ST.kv.refs;
  const used = kvUsed(d.input_tokens || S_.ctx);
  K.hit = hit; kvPrefill(used, Math.round(used * hit));
  busy('kv', 1.8); setStatus('kv', `命中 ${Math.round(hit * 100)}%`); logS('kv', e);
  ST.core.refs.scr.paint({ a: `IN ${fmtK(d.input_tokens)}`, b: `cache ${Math.round(hit * 100)}% · ${d.model || ''}` });
};
H['x.reasoning_completed'] = e => { const R = ST.core.refs; if (R.mode === 'r') R.mode = null; ST.spool.refs.spin = 0; logS('spool', e); };
H['x.response_completed'] = e => { logS('core', e); if (e.d.usage) ST.core.refs.scr.paint({ a: `OUT ${fmtK(e.d.usage.output_tokens)}`, b: e.d.stop_reason || '' }); };
H['x.tool_call_delta_chunk'] = e => {
  // the job forms in its cartridge on the tray while the tool arguments stream in
  if (!S_.forming || S_.forming.id !== e.d.tool_call_id) { const spot = TRAY_SPOTS[S_.trayN % 3]; S_.trayN++; S_.forming = { id: e.d.tool_call_id, spot, cart: spawnCart(FLUID.tool, spot), n: 0 }; cartFill(S_.forming.cart, 0.1); }
  const F = S_.forming; F.n++; cartFill(F.cart, 0.15 + F.n * 0.18); logS('core', e);
  ST.core.refs.mode = 'c'; tokenFx('c');
};
H['x.diff_review'] = e => { const p = e.d.content?.[0]?.path; ST.write.refs.scr.paint({ title: `审阅 ${shortPath(p)}`, lines: ['diff ready'], rows: 3 }); busy('write', 1.5); logS('write', e); feed('ok', '审阅', `改动待审 · ${shortPath(p)}`, e); };
H['x.pending_interaction'] = e => {
  beacon('wait'); logS('beacon', e);
  const kind = e.d.kind;
  if (kind === 'plan_approval') { stState('mode', 'wait'); focus('mode'); feed('perm', '方案', '等你批准方案（exit_plan_mode）', e); if (e.human) openPlanApproval(e); }
  else feed('perm', '等待', kind === 'question' ? '等你回答问题' : '等你审批', e);
};
H['x.interaction_resolved'] = e => { beacon(null); stState('mode', 'idle'); logS('beacon', e); };
H['x.feedback_request'] = e => { const R = ST.term.refs; R.ring = 2.5; printTerm('请给这次会话打个分', 'sys', '* '); logS('term', e); feed('user', '反馈', '请求你给本次会话打分', e); };
// ── context: compaction, checkpoints, memory ──
H['x.auto_compact_started'] = e => {
  const d = e.d, C = ST.compact.refs;
  setCtx(d.tokens_used, false); stState('ctx', 'error', 4); stState('compact', 'busy', 12); focus('compact');
  C.scr.paint({ title: `PRESS · ${d.percentage}%`, lines: [], rows: 1 });
  // every cartridge in the magazine flies into the press bed
  C.saved = S_.mag.slice(); C.savedN = S_.msgs;
  const n = Math.min(S_.msgs, MAG_N * 2);
  for (let i = 0; i < n; i++) {
    const hex = S_.mag[i]; if (hex == null) continue;
    after(i * 0.06, () => {
      ST.ctx.refs.put(i, null);
      const c = makeCart(hex); c.position.copy(magSlot(i)); world.add(c); SPAWNED.add(c);
      fly(c, V(PRESS.x + (Math.random() - 0.5) * 10, TOP + 11.4, PRESS.z + (Math.random() - 0.5) * 8), 0.9, 40, () => { SPAWNED.delete(c); c.removeFromParent(); });
    });
  }
  after(n * 0.06 + 0.9, () => { C.pressGoal = 1; });
  visit('compact', '压缩上下文', 2, 3, 'work');
  logS('compact', e); feed('err', '压缩', `上下文 ${d.percentage}% · ${fmtK(d.tokens_used)} / ${fmtK(d.context_window)} · ${d.reason} → 自动压缩开始`, e);
};
H['x.auto_compact_completed'] = e => {
  const d = e.d, C = ST.compact.refs;
  C.pressGoal = 0; after(1.5, () => C.scr.paint({ title: 'PRESS · idle', lines: [], rows: 1 }));
  setCtx(d.tokens_after);
  magClear();
  kvClear();
  const c = spawnCart(FLUID.context, OUTFEED);
  const slot = reserveSlot();
  robotTask([['say', '摘要卡匣插回第一格', 'work'], ['call', () => { ROBOT.at = 'compact'; }], ...pickSteps(c, OUTFEED), ...fileSteps(slot, FLUID.context, '摘要插回上下文'), ['say', '待命', 'idle']],
    { pri: 3, expire: sceneClock + 20, onSkip: () => { SPAWNED.delete(c); c.removeFromParent(); magSet(slot, FLUID.context); } });
  logS('compact', e); toast('里程碑', '压缩完成');
  feed('ok', '压缩', `压缩完成 · ${fmtK(d.tokens_before)} → ${fmtK(d.tokens_after)} · ${fmtMs(d.elapsed_ms)}${d.summary_preview ? ' · ' + d.summary_preview : ''}`, e);
};
function compactRestore() { const C = ST.compact.refs; C.pressGoal = 0; if (C.saved) { C.saved.forEach((hex, i) => { if (hex != null) ST.ctx.refs.put(i, hex); }); S_.mag = C.saved; S_.msgs = C.savedN; C.saved = null; } }
H['x.auto_compact_failed'] = e => { compactRestore(); stState('compact', 'error', 2.5); beacon('alert', 2); logS('compact', e); feed('err', '压缩', `压缩失败 · ${e.d.error}`, e); };
H['x.auto_compact_cancelled'] = e => { compactRestore(); stState('compact', 'idle'); logS('compact', e); feed('sys', '压缩', `压缩取消 · ${e.d.reason}`, e); };
H['x.auto_continue_completed'] = e => { const R = ST.core.refs; R.heatGoal = 1; kvPrefill(kvUsed(e.d.total_tokens || S_.ctx), 0); after(1.5, () => { R.heatGoal = 0.4; }); logS('core', e); feed('req', '续跑', `压缩后自动续跑 · 上下文 ${fmtK(e.d.total_tokens)}`, e); };
H['x.compaction_checkpoint'] = e => { const C = ST.snap.refs; C.cores[C.n % 4].visible = true; C.n++; busy('snap', 2); visit('snap', '封存检查点', 0.8, 2, 'work'); logS('snap', e); setStatus('snap', `${C.n} 块`); feed('sys', '存档', `压缩检查点 · ${e.d.checkpoint_file}`, e); };
H['x.memory_flush_started'] = e => { const D = ST.mem.refs; D.act = 4; busy('mem', 4); visit('mem', '把记忆写进记忆盘', 1.4, 2, 'work'); logS('mem', e); feed('req', '记忆', '记忆写入开始（无工具的一次模型调用）', e); };
H['x.memory_flush_completed'] = e => { const D = ST.mem.refs; D.count++; D.dirty = true; D.act = 0.6; logS('mem', e); setStatus('mem', e.d.result); feed('ok', '记忆', `记忆写入 · ${e.d.result}${e.d.path ? ' · ' + e.d.path : ''}`, e); };
H['x.memory_session_saved'] = e => { const D = ST.mem.refs; D.act = 1.5; D.count++; D.dirty = true; busy('mem', 2); logS('mem', e); feed('ok', '记忆', `会话记忆保存 · ${e.d.path}`, e); };
H['x.memory_dream_completed'] = e => { const D = ST.mem.refs; D.act = 3; for (let i = D.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [D.order[i], D.order[j]] = [D.order[j], D.order[i]]; } D.dirty = true; busy('mem', 4); focus('mem'); logS('mem', e); feed('ok', '记忆', `记忆整合（做梦）· ${e.d.result}`, e); };
H['x.memory_files'] = e => { const D = ST.mem.refs, n = (e.d.files || []).length; D.count = n; D.dirty = true; logS('mem', e); setStatus('mem', `${n} 个文件`); feed('sys', '记忆', `记忆文件 ${n} 个 · ${(e.d.files || []).map(f => f.path || f).join('、')}`, e); };
H['x.rewind_marker'] = e => {
  const J = ST.journal.refs, target = Math.max(0, e.d.target_prompt_index);
  for (let i = 0; i < 24; i++) J.lit[i] = i <= target % 24 && i < J.n;
  J.idx = target % 24; J.n = target + 1; J.rewind = 2; J.dirty = true;
  busy('journal', 2.5); focus('journal'); visit('journal', '倒回日志', 1.6, 3, 'work');
  setCtx(Math.round(S_.ctx * 0.6));
  logS('journal', e); feed('text', '回退', `回退到第 ${e.d.target_prompt_index} 个回合（${e.d.created_at}）`, e);
};
H['x.session_recap'] = e => { printTerm(e.d.summary, 'answer', '= '); busy('term', 2); logS('term', e); feed('text', '回顾', `${e.d.auto ? '自动' : ''}回顾 · ${e.d.summary}`, e); };
H['x.session_recap_unavailable'] = e => { logS('term', e); feed('sys', '回顾', '这次没法生成回顾', e); };
// ── subagents: the little core leaves the board and comes back ──
const AWAY = () => V(SUB.x + 260, TOP + 300, SUB.z - 160);
function podFly(from, to, dur, done, dir = 1) { const D = ST.sub.refs; D.flight = { a: from.clone(), b: to.clone(), c: from.clone().lerp(to, 0.5).add(V(0, 60, 0)), t: 0, dur, done, dir }; }
H['x.subagent_spawned'] = e => {
  const D = ST.sub.refs; S_.sub = { id: e.d.subagent_id, type: e.d.subagent_type, desc: e.d.description };
  stState('sub', 'busy', 30); focus('sub'); logS('sub', e); setStatus('sub', `${e.d.subagent_type} · ${e.d.description}`);
  const card = $('#subcard'); card.hidden = false; $('#sub-state').textContent = '外派中'; $('#sub-line').textContent = `${e.d.subagent_type} · ${e.d.capability_mode || ''} · ${e.d.description}`; $('#sub-bar').style.width = '4%';
  D.away = true; D.prog = 0.05;
  if (!D.flight) podFly(D.home, V(SUB.x, TOP + 60, SUB.z), 1.4, () => podFly(V(SUB.x, TOP + 60, SUB.z), AWAY(), 2.2, () => { D.pod.visible = false; }));
  feed('sys', '外派', `子 agent 出发 · ${e.d.subagent_type} · ${e.d.description}`, e);
};
H['x.subagent_progress'] = e => {
  const d = e.d, D = ST.sub.refs; $('#subcard').hidden = false; $('#sub-line').textContent = `${d.turn_count} 轮 · ${d.tool_call_count} 次工具 · ${fmtK(d.tokens_used)} token · ${Math.round(d.duration_ms / 1000)}s`;
  $('#sub-bar').style.width = Math.min(90, 20 + d.turn_count * 22) + '%'; setStatus('sub', `外派中 · ${d.turn_count} 轮`); D.ping = 1; D.prog = Math.min(0.9, 0.2 + d.turn_count * 0.22); logS('sub', e);
  feed('sys', '外派', `进度 · ${d.turn_count} 轮 · ${d.tool_call_count} 次工具 · ${fmtK(d.tokens_used)} token`, e);
};
H['x.subagent_finished'] = e => {
  const d = e.d, D = ST.sub.refs, ok = d.status === 'completed';
  $('#sub-state').textContent = ok ? '已返回' : d.status; $('#sub-bar').style.width = '100%';
  D.pod.visible = true; D.prog = 1;
  podFly(AWAY(), V(SUB.x, TOP + 60, SUB.z), 2.2, () => podFly(V(SUB.x, TOP + 60, SUB.z), D.home, 1.4, () => {
    D.away = false;
    const c = spawnCart(ok ? FLUID.ok : FLUID.err, D.pickup);
    const steps = [['say', '取回子 agent 的结果', 'work'], ['call', () => { ROBOT.at = 'sub'; }], ...pickSteps(c, D.pickup)];
    if (ok) { const slot = reserveSlot(); steps.push(...fileSteps(slot, FLUID.ok, '子 agent 结果插回上下文')); } else steps.push(...faultSteps('子 agent 失败'));
    steps.push(['say', '待命', 'idle']);
    robotTask(steps, { pri: 3, expire: sceneClock + 25, onSkip: () => { SPAWNED.delete(c); c.removeFromParent(); } });
    stState('sub', 'idle'); after(4, () => { $('#subcard').hidden = true; });
  }, -1), -1);
  logS('sub', e); toast('里程碑', '子 agent 带回结果');
  feed(ok ? 'ok' : 'err', '外派', `子 agent ${d.status} · ${d.tool_calls} 次工具 · ${d.turns} 轮 · ${fmtMs(d.duration_ms)} · ${fmtK(d.tokens_used)} token${d.output ? ' · ' + d.output : ''}`, e);
};
// ── workflows: the chiplet array ──
H['x.workflow_updated'] = e => {
  const d = e.d, W = ST.flow.refs;
  W.agents = (d.agents || []).slice(0, 8).map(a => ({ state: a.state, label: a.label }));
  (d.phases || []).slice(0, 5).forEach((p, i) => setLamp(W.phases[i], p.state === 'done' ? 0.9 : p.state === 'running' ? 0.6 : 0.05, p.state === 'done' ? FLUID.ok : FLUID.reason));
  W.scr.paint({ title: `${d.name} · ${d.status}`, lines: [`${d.current_phase || ''} · agent ${d.agents_used}/${d.agent_budget ?? '∞'}`], rows: 2 });
  busy('flow', 2); focus('flow'); logS('flow', e); setStatus('flow', `${d.current_phase || d.status}`);
  if (d.revision === 1) visit('flow', '工作流上片', 1.4, 2, 'work');
  feed(d.status === 'complete' ? 'ok' : 'think', '工作流', `${d.name} r${d.revision} · ${d.status} · 阶段 ${d.current_phase || '—'} · ${d.active_agents} 个在跑${d.result_summary ? ' · ' + d.result_summary : ''}`, e);
};
// ── background tasks and monitors: the coprocessor ──
H['x.task_backgrounded'] = e => {
  const I = ST.daemon.refs; I.spinGoal = 1; I.running = true; I.timer = 0; I.pts = []; I.notes = []; I.title = e.d.task_id || 'BG'; I.hex = '#e5650f';
  I.chart.paint({ pts: [], notes: [], title: I.title }); setLamp(I.lamp, 0.05);
  stState('daemon', 'busy', 60); focus('daemon'); visit('daemon', '交给后台协处理器', 1.2, 2, 'work'); logS('daemon', e); setStatus('daemon', e.d.monitor_description || e.d.command);
  feed('tool', '后台', `转后台 · ${e.d.task_id} · ${e.d.command}${e.d.monitor_description ? ' · 监视：' + e.d.monitor_description : ''}`, e);
};
H['x.monitor_event'] = e => {
  const I = ST.daemon.refs, num = parseFloat((String(e.d.event_text).match(/-?\d+(\.\d+)?$/) || [])[0]);
  const v = Number.isFinite(num) ? clamp((num + 82) / 16, 0, 1) : Math.random();
  I.pts.push(v); I.notes.push(oneLine(e.d.event_text)); I.hex = v > 0.7 ? '#d93a3f' : '#e5650f';
  I.chart.paint({ pts: I.pts, notes: I.notes, title: I.title, hex: I.hex });
  busy('daemon', 1); logS('daemon', e); setStatus('daemon', oneLine(e.d.event_text));
  feed('tool', '监视', `${e.d.description} · ${e.d.event_text}`, e);
};
H['x.task_completed'] = e => {
  const I = ST.daemon.refs, snap = e.d.task_snapshot || {}; I.spinGoal = 0; I.running = false; setLamp(I.lamp, 0.9, snap.exit_code === 0 || snap.explicitly_killed ? FLUID.ok : FLUID.err);
  after(3, () => setLamp(I.lamp, 0.05));
  stState('daemon', 'idle'); logS('daemon', e);
  feed('ok', '后台', `后台完成 · ${snap.task_id} · exit ${snap.exit_code ?? '—'}${snap.explicitly_killed ? '（主动停止）' : ''}${e.d.will_wake ? ' · 会唤醒父会话' : ''}`, e);
};
// ── schedules ──
H['x.scheduled_task_created'] = e => { const T_ = ST.rtc.refs; T_.pin.visible = true; busy('rtc', 2); visit('rtc', '插上定时销', 1, 2, 'work'); logS('rtc', e); setStatus('rtc', e.d.human_schedule); feed('user', '定时', `创建 · ${e.d.human_schedule} · ${e.d.prompt}`, e); };
H['x.scheduled_task_fired'] = e => { const T_ = ST.rtc.refs; T_.ring = 2.5; busy('rtc', 2.5); focus('rtc'); logS('rtc', e); feed('user', '定时', `到点触发 · ${e.d.human_schedule}${e.d.subagent_id ? ' · 派出 ' + e.d.subagent_id : ''} · 下次 ${e.d.next_fire_at || '—'}`, e); };
H['x.scheduled_task_deleted'] = e => { ST.rtc.refs.pin.visible = false; logS('rtc', e); setStatus('rtc', '无'); feed('sys', '定时', `删除 · ${e.d.task_id}`, e); };
// ── models, retries, recovery ──
H['x.model_changed'] = e => { const R = ST.core.refs; R.scr.paint({ a: 'MODEL', b: e.d.model_id }); R.quench = 1.2; busy('core', 2); burst(samplerPos(), FLUID.cache, 8, 14); logS('core', e); feed('req', '换模型', `${e.d.model_id}${e.d.reasoning_effort ? ' · 推理强度 ' + e.d.reasoning_effort : ''}`, e); };
H['x.model_auto_switched'] = e => { const R = ST.core.refs; R.scr.paint({ a: 'SWITCH', b: e.d.new_model_id }); R.quench = 1.2; busy('core', 2); logS('core', e); feed('req', '换模型', `自动切换 ${e.d.previous_model_id} → ${e.d.new_model_id} · ${e.d.reason}`, e); };
H['x.retry_state'] = e => {
  const d = e.d, R = ST.core.refs, doom = /doom/.test(d.reason || '');
  if (d.type === 'retrying') {
    beacon('alert', 2.4); R.scr.paint({ a: `RETRY ${d.attempt}/${d.maxRetries}`, b: oneLine(d.reason).slice(0, 22) });
    for (let i = 0; i < 6; i++) fx.puffs.emit(samplerPos(), V((Math.random() - 0.5) * 8, 14, (Math.random() - 0.5) * 8), 0xdfe3e8, 1.4, 4, 2, 0.5);
    R.err = doom ? 2.4 : 1;
    feed('fog', doom ? '振荡' : '重试', doom ? `doom-loop：${d.reason} → 掐断重采样` : `重试 ${d.attempt}/${d.maxRetries} · ${d.reason}`, e);
  } else if (d.type === 'exhausted') { beacon('alert', 5); R.err = 3; stState('core', 'error', 3); feed('fog', '失控', `重试用完（${d.attempts} 次）· ${d.reason}${d.isRateLimited ? ' · 限流' : ''}`, e); }
  else { beacon('alert', 4); R.err = 2; stState('core', 'error', 3); feed('fog', '失败', `请求失败 · ${d.errorType} · ${d.message}`, e); }
  stState('beacon', 'error', 2.4); logS('core', e); logS('beacon', e); focus('core');
};
H['x.auto_recovery_started'] = e => { const R = ST.core.refs; R.quench = 2.2; R.err = 0; beacon('alert', 2); visit('core', '复位核心 · 自救', 1.4, 4, 'work'); logS('beacon', e); feed('ok', '自救', `自动恢复第 ${e.d.attempt}/${e.d.max_retries} 次 · ${fmtMs(e.d.delay_ms)} 后重试 · ${e.d.error}`, e); };
H['x.auto_recovery_exhausted'] = e => { beacon('alert', 5); ST.core.refs.err = 2.5; stState('beacon', 'error', 4); logS('beacon', e); feed('fog', '自救', `自救耗尽（${e.d.attempts} 次）· ${e.d.error}`, e); };
H['x.relay_sync_status'] = e => { const A = ST.net.refs; A.title = `RELAY ${e.d.status}`; A.scr.paint({ title: A.title, amp: e.d.status === 'connected' ? 0.1 : 0.6 }); busy('net', 1.5); logS('net', e); feed(e.d.status === 'connected' ? 'sys' : 'err', '中继', `同步 ${e.d.status}${e.d.attempt ? ' · 第 ' + e.d.attempt + ' 次' : ''}`, e); };
// ── hook bus housekeeping, images ──
H['x.hook_annotation'] = e => { const HB = ST.hooks.refs; HB.k = HB.k.map(() => 0.5); logS('hooks', e); feed('hook', 'Hook', `批注 · ${e.d.message}`, e); };
H['x.hooks_changed'] = e => { const HB = ST.hooks.refs; HB.k = HB.k.map(() => 0.8); logS('hooks', e); feed('sys', 'Hook', `Hook 变更 · ${e.d.hooks} 个 · ${e.d.project_trusted ? '项目已信任' : '项目未信任'}`, e); };
H['x.plugins_changed'] = e => { const HB = ST.hooks.refs; HB.k = HB.k.map(() => 0.6); logS('hooks', e); feed('sys', '插件', `插件变更 · ${(e.d.plugins || []).join('、')}`, e); };
H['x.plugin_updates_installed'] = e => { logS('hooks', e); feed('sys', '插件', `插件更新 · ${(e.d.updates || []).map(u => u.join(' ')).join('、')}`, e); };
H['x.image_compressed'] = e => { const R = ST.read.refs; R.onGoal = 1; after(1.5, () => { R.onGoal = 0; }); R.scr.paint({ title: 'IMAGE · 压缩', lines: (e.d.images || []).map(i => `${i.name} ${fmtK(i.original_bytes)}→${fmtK(i.compressed_bytes)} B`), rows: 3 }); logS('read', e); feed('sys', '图片', e.d.message, e); };
H['x.image_dropped'] = e => { logS('read', e); feed('err', '图片', `丢弃 · ${(e.d.notes || []).join('；')}`, e); };

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
// clear what is in flight (cartridges, tasks, the pod, timers) before a jump or a source switch
function settleScene() {
  ROBOT.tasks.length = 0; ROBOT.task = null; ROBOT.tw = null; ROBOT.wait = 0; ROBOT.gripGoal = 0;
  if (ROBOT.held) { ROBOT.held.removeFromParent(); ROBOT.held = null; }
  for (const c of SPAWNED) c.removeFromParent();
  SPAWNED.clear(); timers.length = 0; realTimers.length = 0; FLIGHTS.length = 0; S_.forming = null; S_.trayN = 0;
  const D = ST.sub.refs; D.flight = null; D.pod.visible = true; D.pod.position.copy(D.home); D.away = false;
  const R = ST.core.refs; R.heatGoal = 0; R.mode = null; R.err = 0; R.passes.length = 0;
  const I = ST.daemon.refs; I.spinGoal = 0; I.running = false;
  ST.flow.refs.agents = [];
  ST.compact.refs.pressGoal = 0; ST.compact.refs.saved = null;
  ST.spool.refs.fill = 0;
  kvClear();
  ST.gate.refs.mode = 'idle'; ST.beacon.refs.run = false;
  magClear();
  beacon(null); closeDialog(); clock.blocked = false; $('#subcard').hidden = true;
  for (const S of ST_LIST) { S.state = 'idle'; S.stateUntil = 0; }
}
function jumpTo(ti) {
  settleScene();
  const i = TL.findIndex(e => e.ti === ti);
  cursor = Math.max(0, i); clock.vt = cursor ? TL[cursor].vt - 400 : 0; skipTurn = null;
  Object.assign(S_, { turn: null, loop: null, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], ended: false });
  // the gauge starts from the nearest context reading before the jump
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
  ST.mode.refs.mode = 'default'; ST.mode.refs.yolo = false; ST.core.refs.plan = false;
  stats.turns = []; stats.ttft = []; stats.ok = 0; stats.err = 0; stats.calls = 0; stats.tps = 0;
  const M = ST.meter.refs; M.tot = [0, 0, 0, 0]; M.calls = 0; M.api = 0; M.scr.paint({ vals: M.tot }); M.sub.paint({ t: '0 次请求 · 0 s' });
  const J = ST.journal.refs; J.n = 0; J.idx = 0; J.lit.fill(false); J.dirty = true;
  ST.term.refs.lines = []; ST.term.refs.scr.paint({ lines: [] });
  feedEl.innerHTML = ''; feedCount = 0;
  SEEN.clear(); codexDirty = true;
  setCtx(0); hud.stats(); hud.run(null, null); renderChapters(); renderCodex(true); paintSource();
  ST.sign.refs.scr.paint({ t: SESSION.title || 'TK-1' });
  feed('sys', '切换', `${SRC_NAME[SRC]} · ${PROJECT} · ${SESSION.model}`, null);
  toast('数据来源', SRC_NAME[SRC]);
}
function paintSource() { document.querySelectorAll('#src-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.src === SRC))); $('#corner-title').textContent = `Starfleet · ${SRC_NAME[SRC]} · ${SESSION.model || '—'}`; }
function renderChapters() {
  $('#chap-h').textContent = `${SRC_NAME[SRC]} · ${TRACE.turns.length} 段`;
  $('#chapters').innerHTML = TRACE.turns.map((t, ti) => `<button type="button" data-ti="${ti}"><b>${esc(chapterName(ti))}</b><small>${t.events.length} 条事件</small></button>`).join('');
}

// ═════════════════════════ dialogs: the gate slip, the console question, the plan approval ═════════════════════════
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
  dlg.innerHTML = `<div class="stripe"></div><header><strong>权限闸门 · 放行单</strong><span>${esc(e.d.name)}</span></header>
    <div class="body"><h4>${esc(title)}</h4>${pre ? `<pre>${esc(pre)}</pre>` : ''}
      <p class="rec">${SRC === 'demo' ? '演示脚本里' : '录制时'}这一步被<b>${recTxt}</b>，等了 ${fmtMs(res?.d.wait)}。接上实时会话后，这两个按钮会直接回复 ACP 的 session/request_permission。</p></div>
    <footer><button type="button" class="btn go" id="perm-allow">抬杆 · 放行</button><button type="button" class="btn no" id="perm-deny">拒绝</button><span class="countdown" id="perm-cd"></span></footer>`;
  dlg.hidden = false;
  const choose = (c, auto = false) => {
    closeDialog(); clock.blocked = false;
    if (auto) { feed('sys', '自动', `无人操作，按记录结果${recTxt}`, null); return; }
    feed('user', '你的决定', c === 'allow' ? '放行' : '拒绝', null);
    if (c === 'deny' && rec === 'allow') { divergeDeny(e, T); return; }
    if (c === 'allow' && rec !== 'allow') toast('回放', `记录里这一步被${recTxt}，回放沿用记录结果`);
  };
  $('#perm-allow').addEventListener('click', () => choose('allow'));
  $('#perm-deny').addEventListener('click', () => choose('deny'));
  countdown(9, $('#perm-cd'), `按记录结果（${recTxt}）继续`, () => choose(rec, true));
  $('#perm-allow').focus({ preventScroll: true });
}
function divergeDeny(e, T) {
  feed('err', '闸门', `你拒绝了 ${e.d.name} → 本轮中止（分支：记录里是批准）`, null, null, true);
  if (T) { T.perm = 'deny'; T.cancel = true; }
  gateFlash('deny'); const R = ST.core.refs; R.heatGoal = 0; R.mode = null; hud.phase(null);
  skipTurn = e.ti;
  const next = TL.findIndex(x => x.i > e.i && x.ti !== e.ti);
  afterReal(1.2, () => { feed('err', '中止', `第 ${S_.turn} 轮已取消 · permission_rejected`, null, null, true); stState('term', 'error', 1.6); });
  if (next >= 0) { cursor = next; clock.vt = Math.max(clock.vt, TL[next].vt - 1800); } else cursor = TL.length;
}
function parseAnswers(text) { const m = new Map(); for (const [, q, a] of String(text).matchAll(/"([^"]+)"="([^"]+)"/g)) m.set(q, a.split(/,\s*/)); return m; }
function openAsk(T, done) {
  clock.blocked = true; stState('term', 'wait'); focus('term'); beacon('wait'); ST.term.refs.ring = 3;
  const qs = T.questions || [], rec = parseAnswers(done?.d.output || '');
  const recTxt = qs.map(q => (rec.get(q.q) || []).join('、')).filter(Boolean).join(' / ') || '—';
  dlg.innerHTML = `<header><strong>I/O 终端 · agent 提问</strong><span>ask_user_question · ${qs.length} 个问题</span></header>
    <div class="body">${qs.map((q, qi) => `<fieldset><legend>${esc(q.q)}</legend>${q.options.map((o, oi) => `<label for="ask-${qi}-${oi}"><input id="ask-${qi}-${oi}" type="${q.multi ? 'checkbox' : 'radio'}" name="ask-${qi}" value="${esc(o.label)}"><span><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></span></label>`).join('')}</fieldset>`).join('')}
      <p class="rec">记录里的回答：<b>${esc(recTxt)}</b></p></div>
    <footer><button type="button" class="btn go" id="ask-send">回复</button><span class="countdown" id="ask-cd"></span></footer>`;
  dlg.hidden = false;
  const submit = auto => {
    if (auto) qs.forEach((q, qi) => q.options.forEach((o, oi) => { const inp = $(`#ask-${qi}-${oi}`); if (inp) inp.checked = (rec.get(q.q) || []).includes(o.label); }));
    const mine = qs.map((q, qi) => [...dlg.querySelectorAll(`input[name="ask-${qi}"]:checked`)].map(i => i.value).join('、') || '（未选）').join(' / ');
    closeDialog(); clock.blocked = false; stState('term', 'busy', 1.5); beacon(null);
    printTerm(auto ? recTxt : mine, 'user');
    feed('user', '回答', auto ? `按记录回答：${recTxt}` : `你的回答：${mine}（记录回答：${recTxt}）`, done);
  };
  $('#ask-send').addEventListener('click', () => submit(false));
  countdown(16, $('#ask-cd'), '按记录回答提交', () => submit(true));
}
function openPlanApproval(e) {
  clock.blocked = true;
  const plan = [...S_.tools.values()].reverse().find(t => t.name === 'exit_plan_mode');
  const entries = (TL.slice(0, e.i).reverse().find(x => x.type === 'acp.plan')?.d.entries) || [];
  dlg.innerHTML = `<header><strong>模式钥匙 · 批准方案</strong><span>exit_plan_mode · plan_approval</span></header>
    <div class="body"><h4>agent 想退出计划模式，开始动手</h4>${entries.length ? `<pre>${esc(entries.map((x, i) => `${i + 1}. ${x.content}`).join('\n'))}</pre>` : ''}
      <p class="rec">${plan?.input?.plan ? esc(plan.input.plan) + ' · ' : ''}批准后模式切回 default，核心恢复全功率，闸门重新开放。</p></div>
    <footer><button type="button" class="btn go" id="plan-ok">批准方案</button><button type="button" class="btn no" id="plan-more">再想想</button><span class="countdown" id="plan-cd"></span></footer>`;
  dlg.hidden = false;
  const done = (ok, auto) => { closeDialog(); clock.blocked = false; feed('user', auto ? '自动' : '你的决定', ok ? '批准方案' : '先不批（回放沿用记录：批准）', null); };
  $('#plan-ok').addEventListener('click', () => done(true));
  $('#plan-more').addEventListener('click', () => done(false));
  countdown(10, $('#plan-cd'), '按记录批准', () => done(true, true));
}
