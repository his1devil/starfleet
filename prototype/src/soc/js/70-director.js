// ═════════════════════════ director: trace events → the chip ═════════════════════════
// blocked: a human decision is pending (the replay waits for you)
const clock = { vt: 0, speed: 2, paused: false, blocked: false, hold: 0 };
let cursor = 0, skipTurn = null;
const S_ = { turn: null, loop: null, loopReal: 0, ctx: 0, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], bucket: 2, firstTool: false, firstFail: false, firstHuman: false, ended: false, mode: 'default', yolo: false, kvAt: 0, decodeN: 0, lastReq: null };
const ARCHIVE = { base: ARCHIVE_BASE.turns, turns: ARCHIVE_BASE.turns, tokens: ARCHIVE_BASE.tokens };
const countedTurns = new Set();
const timers = [], realTimers = [];
const after = (sec, fn) => timers.push({ t: sec, fn });
const afterReal = (sec, fn) => realTimers.push({ t: sec, fn });
// a timer may clear the list it is on (a jump settles the scene), so each step re-checks what is left
function runTimers(list, dt) { for (let i = list.length - 1; i >= 0; i--) { const tm = list[i]; if (!tm) continue; tm.t -= dt; if (tm.t <= 0) { list.splice(i, 1); try { tm.fn(); } catch (err) { console.error(err); } } } }

// where each codex entry lives on the chip: by event first, then by the van station it names
const KEY_STATION = [
  [/^turn_(started|ended|completed)$/, 'turn'], [/^loop_started$|^phase_changed$/, 'loop'], [/^first_token$|^response_completed$|^retry_state$|^model_/, 'sampler'],
  [/^tool_(started|completed|call|call_update)$|^diff_review$|^rewind_marker$/, 'tools'], [/^permission_|^yolo_toggled$|^current_mode_update$|exit_plan_mode$|request_permission$/, 'perm'],
  [/^interjected$/, 'queue'], [/^todo_gate|^laziness|^goal_/, 'gates'], [/^mcp_/, 'mcp'], [/^user_message_chunk$|^available_commands_update$|^pending_interaction$|^interaction_resolved$|^feedback_request$|^relay_sync_status$|ask_user_question$/, 'acp'],
  [/^agent_(thought|message)_chunk$|^reasoning_completed$|^tool_call_delta_chunk$/, 'stream'], [/^plan$/, 'runtime'], [/^session_info_update$|^session_summary_generated$|^session_recap/, 'client'],
  [/^response_started$/, 'pcache'], [/^auto_compact_|^auto_continue_completed$/, 'compact'], [/^compaction_checkpoint$/, 'store'], [/^memory_/, 'mem'],
  [/^subagent_|^workflow_updated$/, 'sub'], [/^task_|^monitor_event$|^scheduled_task_/, 'bg'], [/^auto_recovery_/, 'turn'], [/^hook|^hooks_changed$|^plugin/, 'hooks'], [/^image_/, 'turn'],
];
function codexStation(place, key = '') { for (const [re, id] of KEY_STATION) if (re.test(key)) return id; return 'turn'; }
function inspectRobot() {}
function stationForTool(name = '', kind) { return 'runtime'; }
let focusId = null, camFocusId = null;
function focus(id) { focusId = id; for (const S of ST_LIST) S.litGoal = S.id === id ? 1 : 0; }
// the follow camera drifts to where the action is
function camTo(id) { if (ST[id]) camFocusId = id; }
function busy(id, dur = 1.2) { const S = ST[id]; if (!S) return; S.state = 'busy'; S.stateUntil = sceneClock + dur; }
function stState(id, state, dur = 0) { const S = ST[id]; if (!S) return; S.state = state; S.stateUntil = dur ? sceneClock + dur : 0; }
function logS(id, e) { const S = ST[id]; if (S && e) { S.events.push(e); if (S.events.length > 30) S.events.shift(); } }
function setCtx(tokens, demo = false) { if (!demo) S_.ctx = tokens; hud.ctx(tokens, demo); setStatus('sram', `${fmtK(tokens)} · ${((tokens / WINDOW_TOKENS) * 100).toFixed(1)}%`); }
const turnState = i => { ST.turn.refs.state = i; };
function printClient(text, kind = 'user', prefix) {
  const R = ST.client.refs, src = oneLine(text), width = 30, head = prefix ?? (kind === 'user' ? '> ' : '< ');
  for (let i = 0, n = 0; i < src.length && n < 4; n++) { const step = n ? width : width - head.length; R.lines.push({ t: (n ? '  ' : head) + src.slice(i, i + step), dim: kind !== 'user', gold: kind === 'user' }); i += step; }
  while (R.lines.length > 30) R.lines.shift();
  R.scr.paint({ lines: R.lines });
}
function burst(p, hex, n = 8, speed = 30, life = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU; fx.drops.emit(p, V(Math.cos(a) * speed * Math.random(), speed * (0.4 + Math.random()), Math.sin(a) * speed * Math.random()), hex, life, 0.3 + Math.random() * 0.25); } }
function nextOf(e, pred, span = 400) { for (let j = e.i + 1; j < TL.length && TL[j].ti === e.ti && j < e.i + span; j++) if (pred(TL[j])) return TL[j]; return null; }

// ── a request: assembled, sent as a train of cache blocks, matched against the prefix cache ──
// Real numbers when the trace has them (response_started on the Messages backend); otherwise the
// context reading and this turn's billed cached share, rounded down to whole 256-token blocks.
function requestNumbers(e) {
  const rs = nextOf(e, x => x.type === 'x.response_started' || x.type === 'loop.start');
  if (rs && rs.type === 'x.response_started') return { input: rs.d.input_tokens, cached: rs.d.cache_read_input_tokens, real: true };
  const done = nextOf(e, x => x.type === 'turn.completed', 4000), u = done?.d.usage || {};
  const input = Math.max(CTX.toolsTok + ctxTokens(), S_.ctx || 0);
  const share = u.inputTokens ? (u.cachedReadTokens || 0) / u.inputTokens : 0.8;
  return { input, cached: Math.floor((input * share) / BLOCK_TOK) * BLOCK_TOK, real: !!u.inputTokens };
}
function sendRequest(e, label = 'request') {
  const N = requestNumbers(e), { cars, per } = requestCars(N.input);
  S_.lastReq = N;
  ST.rb.refs.sweep = 1; ST.rb.refs.scr.paint({ t: `IN ${fmtK(N.input)} · ${cars.length}×${per * BLOCK_TOK}` });
  ST.prefix.refs.read = 1.2;
  flows('sram', 'rb', FLUID.context, 4, 0.06, { speed: 220 });
  flow('prefix', 'rb', 0x9a96aa, { speed: 220 });
  ST.sampler.refs.busy = 3; ST.phy.refs.txK = 1;
  // the head car is the request header: x-grok-conv-id routes it to the machine holding the cache
  fx.trains.send(JOURNEY.out, [0xffffff, ...cars], {
    speed: 190,
    onArrive: () => {
      ST.front.refs.busy = 2.5;
      const pc = pcacheRequest(N.input, N.cached);
      hbmRequest(N.input, N.cached);
      lmWave(FLUID.context, true);
      paintRequestBar(N.input, N.cached, pc.per);
      busy('pcache', 2); busy('hbm', 2); busy('lm', 2);
      setStatus('pcache', `命中 ${Math.round((100 * N.cached) / Math.max(1, N.input))}% · ${Math.floor(N.cached / BLOCK_TOK)} 块`);
    },
  });
  return N;
}
// KV pages: the session's pages are reused for the cached prefix, new ones allocated for the rest
function hbmRequest(input, cached) {
  const R = ST.hbm.refs, blocks = Math.ceil(input / BLOCK_TOK), per = Math.max(1, Math.ceil(blocks / Math.round(KV_PAGES * 0.55)));
  R.scale = per;
  const want = Math.ceil(blocks / per), hitP = Math.floor(cached / BLOCK_TOK / per);
  // drop pages beyond the cached prefix (they belonged to the old tail), keep the rest
  R.ours.slice(hitP).forEach(i => { R.hex[i] = null; R.owner[i] = null; });
  R.ours = R.ours.slice(0, hitP);
  R.ours.forEach(i => { R.hex[i] = FLUID.cache; });
  let need = want - R.ours.length;
  const free = []; for (let i = 0; i < KV_PAGES && free.length < need; i++) if (R.owner[i] == null && R.hex[i] == null) free.push(i);
  free.forEach((i, j) => after(0.25 + j * 0.012, () => { R.hex[i] = 0x1fa58e; R.owner[i] = 'ours'; R.dirty = true; }));
  R.ours.push(...free); R.dirty = true;
  S_.kvAt = 0;
}
function hbmDecode(hex) {
  const R = ST.hbm.refs;
  S_.kvAt++; if (S_.kvAt % 6) return;
  for (let i = 0; i < KV_PAGES; i++) if (R.owner[i] == null && R.hex[i] == null) { R.hex[i] = hex; R.owner[i] = 'ours'; R.ours.push(i); R.dirty = true; break; }
}
function hbmExpire() { const R = ST.hbm.refs; R.ours.forEach(i => { R.hex[i] = null; R.owner[i] = null; }); R.ours = []; R.dirty = true; }

// the stream: one bead per sampled chunk rides back from the model to the stream handler and splits
function streamChunk(ch) {
  const hex = ch === 'r' ? FLUID.reason : ch === 't' ? FLUID.text : FLUID.tool;
  lmSample(hex); hbmDecode(hex); busy('lm', 0.9);
  if (++S_.decodeN % 20 === 0) pcacheExtend(1);
  ST.lm.refs.mode = ch === 'c' ? 'c' : ch;
  fx.pulses.emit(JOURNEY.back, hex, {
    speed: 420, r: 0.95, stretch: 2.2, lift: 0.9,
    onEnd: () => {
      ST.phy.refs.rxK = 1; ST.sampler.refs.busy = 1;
      fx.pulses.emit('samp_stream', hex, { speed: 120, r: 0.9, lift: 0.9 });
      const SR = ST.stream.refs; SR.k[ch === 'r' ? 0 : ch === 't' ? 1 : 2] = 1;
      if (ch === 't') { flow('stream', 'acp', FLUID.text, { speed: 260, r: 0.8 }); ST.acp.refs.txK = 1; }
      else if (ch === 'c') flow('stream', 'tools', FLUID.tool, { speed: 220, r: 0.8 });
    },
  });
}

// ── tools ──
const shortPath = p => String(p || '').split('/').slice(-2).join('/');
const isMcp = T => T.name === 'use_tool' || T.name === 'search_tool' || /__/.test(T.name) || T.ns === 'mcp' || T.ns === 'MCP';
function toolStage(i) { ST.tools.refs.stage = i; }
function finishTool(T) {
  if (T.finished) return; T.finished = true;
  const ok = !!T.result?.ok, R = ST.tools.refs;
  if (ok) stats.ok++; else stats.err++;
  hud.stats();
  const c = R.calls.get(T.id); if (c) { c.done = true; c.ok = ok; after(1.6, () => R.calls.delete(T.id)); }
  stState('runtime', ok ? 'idle' : 'error', ok ? 0 : 2);
  ST.runtime.refs.hex[T.lane] = ok ? FLUID.ok : FLUID.err; ST.runtime.refs.k[T.lane] = 1;
  setStatus('runtime', `${T.lane} · ${ok ? '完成' : '失败'} · ${T.loc || shortPath(T.title)}`);
  feed(ok ? 'ok' : 'err', ok ? '结果' : '失败', `${oneLine(T.title || T.name).slice(0, 48)} · ${oneLine(T.result?.output) || (ok ? '完成' : '失败')}`, T.result?.ev);
  toolStage(5);
  // the result is a conversation item: it goes the rest of the way round the loop into the buffer
  const out = T.result?.output || '';
  flows('tools', 'sram', ok ? FLUID.ok : FLUID.err, 3, 0.1, { lane: 0, speed: 260, onEnd: () => { ctxTake('result', out.length / 3 + 20, T.name); paintSram(); } });
  camTo('sram');
  if (!ok && !S_.firstFail) { S_.firstFail = true; toast('警报', `第一次工具失败 · ${T.name}`, true); }
}
function runTool(T) {
  const RT = ST.runtime.refs;
  toolStage(4); RT.k[T.lane] = 1; RT.hex[T.lane] = FLUID.tool; busy('runtime', 3); focus('runtime'); camTo('runtime');
  flow('tools', 'runtime', FLUID.tool, { speed: 220 });
  setStatus('runtime', `${T.lane} · ${T.loc || shortPath(T.title) || T.name}`);
  if (T.lane === 'MCP') { flow('runtime', 'mcp', FLUID.tool, { speed: 200 }); const i = Math.max(0, mcpIdx((T.name.split('__')[0]) || '')); ST.mcp.refs.call[i % MCP_N] = 2; }
  if (T.lane === 'TASK') { const S = ST.sub.refs, i = S.state.findIndex(x => !x); if (i >= 0) S.state[i] = 'running'; }
  if (T.lane === 'BG') ST.bg.refs.running = true;
  if (T.lane === 'MEM') ST.mem.refs.k[3] = 1;
  if (T.lane === 'EDIT') { const F = ST.tools.refs, n = F.snapN++ % F.snaps.length; F.snaps[n].visible = true; storeTouch(3); }
}

// ── event handlers ──
const H = {};
const QUIET = new Set(['k', 'phase', 'tool.start', 'tool.end', 'x.response_started', 'x.reasoning_completed', 'x.response_completed', 'x.tool_call_delta_chunk', 'x.interaction_resolved']);
H['turn.start'] = e => {
  S_.turn = e.d.n; S_.loop = null; hud.run(S_.turn, '—'); hud.phase(null);
  if (e.idle > 60000) feed('sys', '空闲', `会话空闲 ${fmtIdle(e.idle)}，已跳过`, null);
  if (e.idle > 300000) { pcacheExpire(); hbmExpire(); feed('sys', '缓存', '闲置太久：服务器上这个会话的前缀缓存多半已经过期', null); }
  feed('turn', `第 ${e.d.n} 轮`, `新的提问 · 对话里已有 ${e.d.msgs} 条消息`, e);
  ctxReset(e.d.n); paintSram(false);
  turnState(1); logS('turn', e); busy('turn', 2); focus('turn'); camTo('turn');
  const Q = ST.queue.refs; Q.items.shift();
  ST.loop.refs.scr.paint({ a: `TURN ${e.d.n}`, b: 'handle_prompt', c: '' });
  // reminders injected before the turn show on the injector
  const rem = (TRACE.context?.segments || []).filter(s => s[2] === e.d.n && s[0] === 'rem');
  rem.forEach((s, i) => after(0.2 + i * 0.25, () => { const j = REM_KINDS.findIndex(r => s[3].startsWith(r[1].slice(0, 3)) || (r[1] === 'mcp' && /^mcp/.test(s[3]))); ST.rem.refs.k[Math.max(0, j)] = 1; flow('rem', 'sram', SEG.rem.hex, { speed: 200 }); if (s[3] === 'skills') ST.skills.refs.k = 1; }));
  ST.tools.refs.snaps.forEach(m => { m.visible = false; }); ST.tools.refs.snapN = 0;
};
H['user.message'] = e => {
  const text = oneLine(e.d.text), R = ST.acp.refs;
  feed('user', '提问', text, e); logS('acp', e); logS('queue', e);
  printClient(text, 'user'); R.rxK = 1; busy('acp', 2);
  ST.queue.refs.items.push(FLUID.user);
  flow('acp', 'queue', FLUID.user, { speed: 180, onEnd: () => flow('queue', 'turn', FLUID.user, { speed: 180, onEnd: () => flow('turn', 'sram', FLUID.user, { speed: 200, onEnd: () => { ctxTake('user', text.length / 1.5 + 8, 'query'); paintSram(); ST.queue.refs.items.shift(); } }) }) });
  camTo('acp');
};
H.hook = e => {
  const ev = e.d.event, runs = e.d.runs || [], failed = runs.filter(r => r.status === 'failed').length, skipped = runs.filter(r => r.status === 'skipped').length;
  const i = HOOK_EVENTS.indexOf(ev), HB = ST.hooks.refs;
  if (i >= 0) { HB.k[i] = 1; HB.hex[i] = failed ? FLUID.err : skipped ? MAT.amberlamp : FLUID.ok; }
  logS('hooks', e); busy('hooks', 1); setStatus('hooks', ev); storeTouch(2);
  fx.pulses.emit('store_in', FLUID.ok, { speed: 90, r: 0.8 });
  if (ev === 'pre_tool_use') toolStage(2);
  if (ev === 'stop') { turnState(3); const G = ST.gates.refs; G.n = Math.min(8, G.n + 1); after(2, () => { G.n = 0; }); }
  if (ev === 'stop_failure' || ev === 'notification') ST.acp.refs.rxK = 1;
  if (ev === 'session_end') { turnState(4); ST.loop.refs.active = false; ST.loop.refs.scr.paint({ a: 'SESSION END', b: '', c: '' }); }
  if (ev === 'pre_compact' || ev === 'post_compact') busy('compact', 1.2);
  if (ev === 'subagent_start' || ev === 'subagent_stop') busy('sub', 1.2);
  feed(failed ? 'err' : 'hook', 'Hook', `${ev}${e.d.tool ? ' · ' + e.d.tool : ''} · ${runs.length} 个${failed ? `，${failed} 个失败` : skipped ? `，${skipped} 个跳过` : ''}`, e);
};
H['loop.start'] = e => {
  S_.loop = e.d.i; S_.loopReal = e.real; hud.run(S_.turn, e.d.i + 1);
  turnState(2); logS('loop', e); focus('loop'); camTo('loop');
  const L = ST.loop.refs; L.scr.paint({ a: `TURN ${S_.turn ?? '—'}`, b: `LOOP ${e.d.i}`, c: 'process_conversation_turn' });
  // INJECT → GUARD → COMPACT? → BUILD → SAMPLE: the token runs the first stages, the request leaves at BUILD
  loopStage(0, FLUID.reason);
  after(0.3, () => loopStage(1));
  after(0.55, () => loopStage(2));
  after(0.8, () => {
    loopStage(3, FLUID.context);
    const N = sendRequest(e);
    feed('req', '请求', `第 ${e.d.i + 1} 次模型请求 · ${fmtK(N.input)} token · 前缀命中 ${fmtK(N.cached)}（${Math.round((100 * N.cached) / Math.max(1, N.input))}%）${N.real ? '' : ' · 按本回合账单估'}`, e);
    camTo('rb');
  });
  after(1.3, () => { loopStage(4); camTo('pcache'); });
  stState('loop', 'busy');
};
H.phase = e => {
  const p = e.d.phase; hud.phase(p);
  if (p === 'waiting_for_model') { loopStage(4, FLUID.context); ST.sampler.refs.busy = 4; }
  else if (p === 'streaming_reasoning') { ST.lm.refs.mode = 'r'; setStatus('lm', '推理'); camTo('lm'); }
  else if (p === 'streaming_text') { ST.lm.refs.mode = 't'; setStatus('lm', '正文'); }
  else if (p === 'tool_execution') { loopStage(5, FLUID.tool); camTo('tools'); }
  else if (p === 'permission_prompt') { ST.perm.refs.mode = 'wait'; }
};
H['request.first_token'] = e => {
  const ttft = e.real - S_.loopReal; stats.ttft.push(ttft); hud.stats();
  feed('req', '首 token', `TTFT ${fmtMs(ttft)}`, e); logS('sampler', e);
  ST.sampler.refs.scr.paint({ a: `TTFT ${fmtMs(ttft)}`, b: `${SESSION.model || ''} · first token` });
  setStatus('sampler', `首 token ${fmtMs(ttft)}`);
  burst(V(SAMP.x, DIE_Y + 4, SAMP.z), FLUID.context, 10, 22);
};
H.k = e => {
  const ch = e.d === 'r' ? 'r' : 't';
  S_.ticks[ch]++;
  S_.tickTimes.push(e.real); while (S_.tickTimes.length && e.real - S_.tickTimes[0] > 2000) S_.tickTimes.shift();
  stats.tps = S_.tickTimes.length / 2;
  if (S_.bucket >= 1) { S_.bucket -= 1; streamChunk(ch); }
};
H['stream.thought'] = e => { if (e.d.ctx) setCtx(e.d.ctx); feed('think', '推理', e.d.text, e, `${e.d.len} 字`); logS('stream', e); flows('stream', 'sram', FLUID.reason, 2, 0.1, { onEnd: () => { ctxTake('think', e.d.len / 3, 'reasoning'); paintSram(); } }); };
H['stream.text'] = e => {
  if (e.d.ctx) setCtx(e.d.ctx);
  feed('text', '正文', e.d.text, e, `${e.d.len} 字`); logS('stream', e); printClient(e.d.text, 'answer');
  flows('stream', 'sram', FLUID.text, 2, 0.1, { onEnd: () => { ctxTake('text', e.d.len / 3, SESSION.model); paintSram(); } });
};
H['tool.call'] = e => {
  const d = e.d; if (d.ctx) setCtx(d.ctx);
  const T = { id: d.id, name: d.name, kind: d.kind, ns: d.ns, label: d.label, ev: e, title: d.name, input: typeof d.input === 'object' && d.input ? d.input : {}, perm: null, result: null, progress: [] };
  T.lane = laneOf(d.name, d.kind);
  S_.tools.set(d.id, T);
  const R = ST.tools.refs; R.calls.set(d.id, { done: false, ok: false });
  toolStage(0);
  stats.calls++; hud.stats();
  logS('tools', e); busy('tools', 3); focus('tools'); camTo('tools');
  flow('stream', 'tools', FLUID.tool, { speed: 220, onEnd: () => { ctxTake('call', JSON.stringify(T.input).length / 3 + 12, d.name); paintSram(); } });
  feed('tool', '工具', `${d.label || d.name} → ${T.lane} 通道 · ${d.name}`, e);
  // read-only tools and tools without a prompt start right away; the rest wait for the permission events
  T.noPerm = !nextOf(e, x => x.type === 'permission.request' && x.d.name === d.name, 60);
  after(0.4, () => toolStage(1));
  if (T.noPerm) after(0.8, () => { if (!T.started) { T.started = true; runTool(T); } });
  if (!S_.firstTool) { S_.firstTool = true; toast('里程碑', '第一个工具调用'); }
};
H['tool.update'] = e => {
  const d = e.d, T = S_.tools.get(d.id); if (!T) return;
  if (d.title) T.title = d.title;
  if (d.questions) T.questions = d.questions;
  if (d.diff) T.diff = d.diff;
  if (d.input) T.input = { ...T.input, ...d.input };
  if (d.locations && d.locations[0]) T.loc = d.locations[0];
  if (d.exit != null) T.exit = d.exit;
  logS('runtime', e);
  if (d.status && !T.perm && !T.permReq) T.perm = 'allow';
  if (d.status === 'in_progress') {
    if (!T.started) { T.started = true; runTool(T); }
    if (d.output) { T.progress.push(oneLine(d.output)); setStatus('runtime', `${T.lane} · ${oneLine(d.output).slice(0, 30)}`); feed('tool', '输出', d.output, e); ST.runtime.refs.k[T.lane] = 1; }
    return;
  }
  if (d.status !== 'completed' && d.status !== 'failed') return;
  if (!T.started) { T.started = true; runTool(T); }
  T.result = { ok: d.status === 'completed', output: d.output || d.error || '', ev: e };
  after(0.5, () => finishTool(T));
};
// permission: the checks light in order; a person is asked only when nothing else decided
H['permission.request'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && !x.permReq);
  if (T) T.permReq = e;
  logS('perm', e); toolStage(3); ST.tools.refs.waiting = !!e.human;
  const P = ST.perm.refs; focus('perm'); camTo('perm');
  flow('tools', 'perm', MAT.hazard, { speed: 200 });
  const human = !!e.human, yolo = S_.yolo && !human;
  [0, 1, 2, 3, 4].forEach(i => after(0.12 * i, () => { P.step = i; }));
  if (yolo) { after(0.2, () => { P.step = 1; P.mode = 'allow'; P.until = sceneClock + 1.2; }); feed('perm', '权限', `${e.d.name} · YOLO 放行`, e); return; }
  if (!human) { after(0.66, () => { P.step = 4; P.mode = 'allow'; P.until = sceneClock + 1.2; }); feed('perm', '权限', `${e.d.name} · 规则 / 只读直接放行（录制时 ${fmtMs(e.link?.d.wait)}）`, e); return; }
  after(0.7, () => { P.step = 5; P.mode = 'wait'; });
  ST.acp.refs.wait = true; flow('perm', 'acp', MAT.hazard, { speed: 200 });
  feed('perm', '权限', `${e.d.name} · 问你（session/request_permission）`, e);
  stState('perm', 'wait');
  if (!S_.firstHuman) { S_.firstHuman = true; toast('里程碑', '第一次人工审批'); }
  openPermission(e, e.link, T);
};
H['permission.resolve'] = e => {
  const T = [...S_.tools.values()].find(x => x.name === e.d.name && x.permReq && !x.perm), dec = e.d.decision, P = ST.perm.refs;
  if (T) T.perm = dec === 'allow' ? 'allow' : dec;
  logS('perm', e); ST.acp.refs.wait = false; ST.tools.refs.waiting = false;
  P.mode = dec === 'allow' ? 'allow' : 'deny'; P.until = sceneClock + 1.6;
  if (dec !== 'allow') { feed('err', '权限', `${e.d.name} · ${dec === 'deny' ? '已拒绝' : '已取消'} · 录制时等了 ${fmtMs(e.d.wait)}`, e); stState('perm', 'error', 1.6); if (T) { T.result = { ok: false, output: '被拒绝' }; after(0.4, () => finishTool(T)); } }
  else { if (e.d.wait >= 600) feed('perm', '权限', `${e.d.name} · 已批准`, e); if (T && !T.started) after(0.3, () => { if (!T.started) { T.started = true; runTool(T); } }); }
  if (T && dec === 'allow' && e.ask) openAsk(T, e.ask);
};
H['turn.end'] = e => {
  ST.loop.refs.active = false; hud.phase(null); turnState(3); camTo('gates');
  ST.loop.refs.scr.paint({ a: `TURN ${S_.turn}`, b: 'stop gate', c: e.d.outcome || '' });
  after(0.8, () => turnState(4));
  if (e.d.outcome === 'cancelled') { feed('err', '中止', `第 ${S_.turn} 轮已取消 · ${e.d.cancel || ''}`, e); stState('turn', 'error', 1.6); }
  if (e.d.outcome === 'error') { feed('err', '中止', `第 ${S_.turn} 轮失败`, e); stState('turn', 'error', 2); }
};
H['turn.completed'] = e => {
  const u = e.d.usage || {}, ok = e.d.stop !== 'cancelled' && e.d.stop !== 'error';
  stats.turns.push({ n: S_.turn, input: u.inputTokens || 0, cached: u.cachedReadTokens || 0, output: u.outputTokens || 0, reasoning: u.reasoningTokens || 0, api: u.apiDurationMs || 0 });
  if (u.apiDurationMs && u.outputTokens) stats.tps = u.outputTokens / (u.apiDurationMs / 1000);
  hud.stats(); logS('turn', e);
  const hit = u.inputTokens ? Math.round((100 * (u.cachedReadTokens || 0)) / u.inputTokens) : 0;
  feed('turn', ok ? '完成' : '计费', `${e.d.stop} · 输入 ${fmtK(u.inputTokens)}（缓存 ${hit}%）· 输出 ${fmtK(u.outputTokens)} · 推理 ${fmtK(u.reasoningTokens)} · ${u.modelCalls ?? '—'} 次请求 · ${fmtMs(u.apiDurationMs)}`, e);
  const fresh = SRC === 'replay' && !countedTurns.has(e.i); if (SRC === 'replay') countedTurns.add(e.i);
  if (fresh) { ARCHIVE.turns++; ARCHIVE.tokens += u.totalTokens || 0; hud.archive(); }
  turnState(4); storeTouch(0); fx.pulses.train('store_in', FLUID.text, 3, 0.12, { speed: 100, r: 0.9 });
  flow('turn', 'acp', FLUID.ok, { speed: 200 });
  setStatus('turn', `${e.d.stop} · ${fmtK(u.totalTokens)}`);
};
// ── MCP ──
const mcpMod = (server, fn) => { const i = mcpIdx(server); if (i >= 0 && i < MCP_N) fn(ST.mcp.refs, i); };
H['mcp.starting'] = e => { mcpMod(e.d.server, (R, i) => { R.boot[i] = 3; R.fail[i] = false; }); busy('mcp', 3); logS('mcp', e); camTo('mcp'); setStatus('mcp', `${e.d.server} 启动中`); feed('sys', 'MCP', `${e.d.server} 启动中 · ${e.d.transport}`, e); };
H['mcp.connected'] = e => { mcpMod(e.d.server, (R, i) => { R.online[i] = true; R.boot[i] = 0; R.fail[i] = false; }); logS('mcp', e); setStatus('mcp', `${e.d.server} · ${e.d.tools} 个工具`); feed('sys', 'MCP', `${e.d.server} 已连接 · ${e.d.tools} 个工具登记为 ${e.d.server}__* · ${e.d.ms}ms`, e); };
H['mcp.ready'] = e => feed('sys', 'MCP', `MCP 就绪 · ${e.d.servers} 个服务 · ${e.d.tools} 个工具（不进工具列表，经 search_tool / use_tool）`, e);
H['e.mcp_config_resolved'] = e => { logS('mcp', e); camTo('mcp'); storeTouch(2); feed('sys', 'MCP', `配置解析 · ${(e.d.servers || []).map(s => s.name || s).join('、') || '无服务'}`, e); };
H['e.mcp_managed_config_result'] = e => { logS('mcp', e); feed('sys', 'MCP', `托管配置 · ${e.d.server_count ?? 0} 个${e.d.error ? ' · ' + e.d.error : ''}`, e); };
H['e.mcp_oauth_discovery_timeout'] = e => { mcpMod(e.d.server_name, (R, i) => { R.boot[i] = 1.5; }); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · OAuth 发现超时（5 秒）`, e); };
H['e.mcp_server_failed'] = e => { mcpMod(e.d.server_name, (R, i) => { R.fail[i] = true; R.online[i] = false; R.boot[i] = 0; }); stState('mcp', 'error', 2); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} 启动失败 · ${e.d.error_type} · ${e.d.error_message}`, e); };
H['e.mcp_auth_retry'] = e => { mcpMod(e.d.server_name, (R, i) => { R.boot[i] = 1.5; R.fail[i] = !e.d.success; }); logS('mcp', e); feed(e.d.success ? 'sys' : 'err', 'MCP', `${e.d.server_name} · 鉴权重试${e.d.success ? '成功' : '失败'}`, e); };
H['e.mcp_tool_registration_failed'] = e => { logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · 工具 ${e.d.tool_name} 登记失败 · ${e.d.error}`, e); };
H['e.mcp_init_cancelled'] = e => { logS('mcp', e); feed('sys', 'MCP', `MCP 初始化取消 · ${e.d.reason}`, e); };
H['e.mcp_tool_call_started'] = e => { mcpMod(e.d.server_name, (R, i) => { R.call[i] = 2; }); busy('mcp', 2); logS('mcp', e); camTo('mcp'); feed('tool', 'MCP', `${e.d.server_name} · ${e.d.tool_name} 调用开始`, e); };
H['e.mcp_tool_call_completed'] = e => { logS('mcp', e); feed(e.d.success ? 'ok' : 'err', 'MCP', `${e.d.server_name} · ${e.d.tool_name} · ${e.d.success ? '完成' : '失败'} · ${fmtMs(e.d.duration_ms)}${e.d.reconnect_attempted ? ' · 中途重连过' : ''}`, e); };
H['e.mcp_transport_error'] = e => { mcpMod(e.d.server_name, (R, i) => { R.fail[i] = true; after(1.4, () => { R.fail[i] = false; }); }); stState('mcp', 'error', 1.2); logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · 传输错误 · ${e.d.error}`, e); };
H['e.mcp_transport_decode_error'] = e => { logS('mcp', e); feed('err', 'MCP', `${e.d.server_name} · 解码错误 · ${e.d.error}`, e); };
H['e.mcp_transport_reconnect'] = e => { mcpMod(e.d.server_name, (R, i) => { R.boot[i] = 1; }); logS('mcp', e); feed(e.d.success ? 'sys' : 'err', 'MCP', `${e.d.server_name} · 重连${e.d.success ? '成功' : '失败'}`, e); };
H['e.mcp_health_check'] = e => { mcpMod(e.d.server_name, (R, i) => { R.heart[i] = 1.2; }); logS('mcp', e); feed('sys', 'MCP', `${e.d.server_name} · 健康检查 ${e.d.healthy ? '正常' : '异常'}`, e); };
H['e.mcp_server_toggled'] = e => { mcpMod(e.d.server_name, (R, i) => { R.online[i] = !!e.d.enabled; }); logS('mcp', e); feed('sys', 'MCP', `${e.d.server_name} · ${e.d.enabled ? '启用' : '停用'}`, e); };
// ── interjection, modes, stop gates ──
H['e.interjected'] = e => { ST.queue.refs.items.push(MAT.amberlamp); ST.rem.refs.k[6] = 1; ST.acp.refs.rxK = 1; logS('queue', e); camTo('queue'); feed('user', '插话', `回合进行中插话（${e.d.source === 'queue' ? '排队' : '直接'}）· 下一圈循环的 INJECT 阶段塞进对话`, e); };
H['e.yolo_toggled'] = e => { S_.yolo = !!e.d.enabled; ST.perm.refs.step = 1; ST.perm.refs.mode = S_.yolo ? 'allow' : 'idle'; ST.perm.refs.until = sceneClock + 1.5; logS('perm', e); camTo('perm'); feed('perm', 'YOLO', S_.yolo ? '打开 · 除了拒绝规则，一律放行' : '关闭 · 恢复逐项检查', e); };
H['e.todo_gate_fired'] = e => { ST.gates.refs.todoK = 1; loopStage(0, MAT.amberlamp); logS('gates', e); camTo('gates'); feed('err', '待办闸门', `还有 ${e.d.pending} 项待办没做完就想收工 → 加一条提醒，再转一圈（第 ${e.d.fires} 次）`, e); };
H['e.todo_gate_exhausted'] = e => { ST.gates.refs.todoK = 1; logS('gates', e); feed('err', '待办闸门', `次数用完，放行 · 仍有 ${e.d.pending} 项待办`, e); };
H['e.laziness_classifier_fired'] = e => { ST.gates.refs.lazyK = 1; logS('gates', e); camTo('gates'); feed('err', '偷懒判定', `${e.d.category} · 置信 ${Math.round((e.d.confidence || 0) * 100)}%（回合结束后空闲 10 秒才跑）`, e); };
H['e.laziness_nudge_fired'] = e => { ST.gates.refs.lazyK = 1; ST.rem.refs.k[6] = 1; logS('gates', e); feed('err', '偷懒判定', `下次提问时提醒把活干完 · 还剩 ${e.d.nudges_remaining} 次`, e); };
H['e.laziness_classifier_aborted'] = e => { logS('gates', e); feed('sys', '偷懒判定', `中止 · ${e.d.reason}`, e); };
H['e.goal_premature_stop_detected'] = e => { ST.gates.refs.lazyK = 1; loopStage(0, MAT.amberlamp); logS('gates', e); feed('err', '目标', `没验证就说做完了（${e.d.pattern}）→ 接着干`, e); };
// ── goal mode: each role is a hidden subagent with its own model call ──
const ROLE_OF = k => /planner/.test(k) ? 0 : /strategist/.test(k) ? 1 : /classifier|evaluator/.test(k) ? 2 : /summarizer/.test(k) ? 6 : -1;
function goalRole(i, hex = FLUID.ok) { const G = ST.gates.refs; if (i < 0) return; G.roleK[i] = 1; G.roleHex[i] = hex; busy('gates', 1.2); }
H['x.goal_updated'] = e => { const d = e.d; goalRole(2, FLUID.ok); logS('gates', e); camTo('gates'); setStatus('gates', `${d.phase} · ${d.completed_deliverables}/${d.total_deliverables}`); feed(d.status === 'complete' ? 'ok' : 'turn', '目标', `${d.status} · ${d.phase} · 交付 ${d.completed_deliverables}/${d.total_deliverables} · ${fmtK(d.tokens_used)} / ${fmtK(d.token_budget)} token`, e); };
const GOAL_TXT = {
  goal_auto_paused: d => `自动暂停 · ${d.reason}`, goal_classifier_fired: d => `评估器 #${d.attempt} 启动`, goal_classifier_verdict: d => `评估结论 · ${d.verdict === 'achieved' ? '达成' : '未达成'}`,
  goal_classifier_fail_open: d => `评估失败放行 · ${d.reason}`, goal_classifier_fail_closed: d => `评估失败拦截 · ${d.reason}`, goal_classifier_cap_reached: d => `评估次数到顶（${d.attempt}）`,
  goal_classifier_mid_turn_deferred: d => `评估推迟到回合末 · 队列 ${d.pending_depth}`, goal_classifier_dropped_after_cap: d => `超额评估丢弃 · ${d.attempts_seen}`, goal_classifier_pending_queue_cleared: d => `评估队列清空 · ${d.dropped}`,
  goal_planner_fired: d => `规划员 #${d.attempt} 启动（写 goal/plan.md）`, goal_planner_completed: d => `规划完成 · ${fmtMs(d.latency_ms)}`, goal_planner_fail_closed: d => `规划失败 · ${d.reason}`,
  goal_strategist_fired: d => `策略师启动 · 连败 ${d.consecutive_failures}`, goal_strategist_completed: d => `策略完成 · ${fmtMs(d.latency_ms)}`, goal_strategist_failed: d => `策略失败 · ${d.reason}`,
  goal_strategist_contract_restore_failed: d => `策略契约恢复失败 · ${d.reason}`, goal_summarizer_fired: () => '总结员启动', goal_summarizer_completed: d => `总结完成 · ${fmtMs(d.latency_ms)}`, goal_summarizer_fail_open: d => `总结失败放行 · ${d.reason}`,
  goal_role_model_resolved: d => `${d.role}${d.skeptic_idx != null ? ' #' + (d.skeptic_idx + 1) : ''} → ${d.model_id}`, goal_role_model_fail_open: d => `${d.role} 模型缺失 · ${d.reason}`,
};
for (const k of Object.keys(GOAL_TXT)) {
  H['e.' + k] = e => {
    const txt = GOAL_TXT[k](e.d), bad = /fail|cap_reached|dropped|cleared/.test(k);
    goalRole(ROLE_OF(k), bad ? FLUID.err : FLUID.ok); logS('gates', e);
    if (/fired$/.test(k)) fx.trains.send(JOURNEY.out, new Array(10).fill(FLUID.ok), { speed: 320 });
    feed(bad ? 'err' : 'ok', '目标', txt, e);
  };
}
H['e.goal_verifier_skeptic_verdict'] = e => { const i = 3 + (e.d.skeptic_idx % 3); goalRole(i, e.d.refuted ? FLUID.err : FLUID.ok); logS('gates', e); camTo('gates'); feed(e.d.refuted ? 'err' : 'ok', '复核', `怀疑者 #${(e.d.skeptic_idx % 3) + 1} · ${e.d.refuted ? '驳倒了结论' : '没能驳倒'} · 置信 ${e.d.confidence}`, e); };
H['e.goal_verifier_aggregate_verdict'] = e => { [3, 4, 5].forEach(i => goalRole(i, e.d.achieved ? FLUID.ok : FLUID.err)); logS('gates', e); feed(e.d.achieved ? 'ok' : 'err', '复核', `${e.d.total} 个怀疑者里 ${e.d.refuted_count} 个驳倒 → ${e.d.achieved ? '多数通过，目标达成' : '未达成'}`, e); };
// ── ACP extras ──
H['acp.plan'] = e => { const n = (e.d.entries || []).length, done = (e.d.entries || []).filter(x => x.status === 'completed').length; ST.runtime.refs.k.PLAN = 1; logS('runtime', e); flow('runtime', 'acp', FLUID.text, { speed: 200 }); feed('text', '计划', `计划 ${done}/${n} · ${(e.d.entries || []).map(x => x.content).join(' / ')}`, e); };
H['acp.available_commands_update'] = e => { printClient((e.d.commands || []).join(' '), 'sys', '/ '); logS('acp', e); feed('sys', '命令', `可用命令 ${(e.d.commands || []).length} 个 · ${(e.d.commands || []).slice(0, 6).join(' ')}`, e); };
H['acp.current_mode_update'] = e => {
  const m = e.d.mode; S_.mode = m; logS('perm', e); busy('perm', 1.5); setStatus('perm', m === 'plan' ? '计划模式' : m);
  if (m === 'plan') { ST.rem.refs.k[2] = 1; ST.tools.refs.stage = 1; }
  feed('text', '模式', m === 'plan' ? '进入计划模式 · 工具执行器的 PLAN GATE 拦下计划文件以外的所有编辑' : `回到 ${m} 模式`, e);
};
H['acp.session_info_update'] = e => { if (e.d.title) { printClient(`【${e.d.title}】`, 'sys', ''); setStatus('client', e.d.title); } logS('client', e); feed('sys', '标题', e.d.title || '会话信息更新', e); };
H['x.session_summary_generated'] = e => { logS('client', e); feed('sys', '标题', `生成标题 · ${e.d.session_summary}`, e); };
// ── response lifecycle ──
H['x.response_started'] = e => { const d = e.d; logS('pcache', e); setStatus('pcache', `命中 ${Math.round((100 * d.cache_read_input_tokens) / Math.max(1, d.input_tokens))}%`); };
H['x.reasoning_completed'] = e => { ST.stream.refs.k[0] = 1; logS('stream', e); };
H['x.response_completed'] = e => { logS('sampler', e); if (e.d.usage) ST.sampler.refs.scr.paint({ a: `OUT ${fmtK(e.d.usage.output_tokens)}`, b: `${e.d.stop_reason || ''} · IN ${fmtK(e.d.usage.input_tokens)}` }); };
H['x.tool_call_delta_chunk'] = e => { logS('stream', e); if (S_.bucket >= 1) { S_.bucket -= 1; streamChunk('c'); } };
H['x.diff_review'] = e => { const F = ST.tools.refs, n = F.snapN++ % F.snaps.length; F.snaps[n].visible = true; busy('tools', 1.5); logS('tools', e); feed('ok', '审阅', `改动待审 · ${shortPath(e.d.content?.[0]?.path)}（当前版本没有发出这个更新的代码）`, e); };
H['x.pending_interaction'] = e => {
  ST.acp.refs.wait = true; logS('acp', e); camTo('acp');
  const kind = e.d.kind;
  if (kind === 'plan_approval') { stState('perm', 'wait'); feed('perm', '方案', '等你批准方案（x.ai/exit_plan_mode）', e); if (e.human) openPlanApproval(e); }
  else feed('perm', '等待', kind === 'question' ? '等你回答问题（x.ai/ask_user_question）' : '等你审批', e);
};
H['x.interaction_resolved'] = e => { ST.acp.refs.wait = false; stState('perm', 'idle'); logS('acp', e); };
H['x.feedback_request'] = e => { printClient('请给这次会话打个分', 'sys', '* '); ST.acp.refs.txK = 1; logS('acp', e); feed('user', '反馈', '请求你给本次会话打分', e); };
// ── compaction: the session's own model summarises the conversation, which is then rebuilt ──
H['x.auto_compact_started'] = e => {
  const d = e.d, C = ST.compact.refs;
  setCtx(d.tokens_used, false); C.on = 1; C.progGoal = 0.15; stState('compact', 'busy', 20); focus('compact'); camTo('compact');
  flows('sram', 'compact', FLUID.context, 6, 0.07, { speed: 240 });
  // the compaction request: the whole conversation plus the summary prompt, sent like any other
  after(0.6, () => { C.progGoal = 0.45; const { cars } = requestCars(d.tokens_used); fx.trains.send(JOURNEY.out, cars, { speed: 320, onArrive: () => { pcacheRequest(d.tokens_used, Math.floor(d.tokens_used * 0.9 / BLOCK_TOK) * BLOCK_TOK); lmWave(FLUID.context, true); } }); });
  logS('compact', e); feed('err', '压缩', `上下文 ${d.percentage}% · ${fmtK(d.tokens_used)} / ${fmtK(d.context_window)} · ${d.reason} → 先压缩再发请求`, e);
};
H['x.auto_compact_completed'] = e => {
  const d = e.d, C = ST.compact.refs; C.progGoal = 1;
  after(1.2, () => { C.on = 0; C.progGoal = 0; });
  // [system, user_info, AGENTS.md, the last question, the summary, a reminder of the state]
  const keep = CTX.segs.filter(s => s[2] === -1);
  const lastQ = [...CTX.segs].reverse().find(s => s[0] === 'user');
  const summ = (TRACE.context?.segments || []).find(s => s[0] === 'summary' && s[2] === S_.turn);
  const rest = Math.max(400, d.tokens_after - CTX.toolsTok - keep.reduce((a, s) => a + s[1], 0) - (lastQ?.[1] || 0) - 600);
  CTX.segs = [...keep, ...(lastQ ? [lastQ] : []), summ ? summ.slice() : ['summary', rest, S_.turn, 'compact'], ['rem', 600, S_.turn, 'compact']];
  flows('compact', 'sram', FLUID.context, 5, 0.08, { speed: 240, onEnd: () => paintSram() });
  setCtx(d.tokens_after);
  storeTouch(3); fx.pulses.train('store_in', FLUID.context, 3, 0.1, { speed: 100 });
  logS('compact', e); toast('里程碑', '压缩完成');
  feed('ok', '压缩', `压缩完成 · ${fmtK(d.tokens_before)} → ${fmtK(d.tokens_after)} · ${fmtMs(d.elapsed_ms)}${d.summary_preview ? ' · ' + d.summary_preview : ''}（下一次请求只剩开头还能命中缓存）`, e);
};
H['x.auto_compact_failed'] = e => { const C = ST.compact.refs; C.on = 0; C.progGoal = 0; stState('compact', 'error', 2.5); logS('compact', e); feed('err', '压缩', `压缩失败 · ${e.d.error} · 原对话不动，按原因暂停自动压缩`, e); };
H['x.auto_compact_cancelled'] = e => { const C = ST.compact.refs; C.on = 0; C.progGoal = 0; stState('compact', 'idle'); logS('compact', e); feed('sys', '压缩', `压缩取消 · ${e.d.reason}（当前版本没有发出这个更新的代码）`, e); };
H['x.auto_continue_completed'] = e => { logS('compact', e); feed('req', '续跑', `压缩后续跑 · 上下文 ${fmtK(e.d.total_tokens)}（旧检查点回放才会出现）`, e); };
H['x.compaction_checkpoint'] = e => { storeTouch(3); fx.pulses.emit('store_in', FLUID.context, { speed: 100 }); logS('store', e); setStatus('store', 'checkpoint'); feed('sys', '存档', `压缩检查点 · ${e.d.checkpoint_file}`, e); };
// ── memory ──
function memCall(i, label) { const M = ST.mem.refs; M.k[i] = 1; flow('mem', 'rb', FLUID.cache, { speed: 200 }); fx.trains.send(JOURNEY.out, new Array(12).fill(FLUID.cache), { speed: 320 }); feed('req', '记忆', label, null); }
H['x.memory_flush_started'] = e => { memCall(0, '记忆写入：一次不带工具的模型调用，只看最近约 20 条消息'); busy('mem', 4); logS('mem', e); camTo('mem'); };
H['x.memory_flush_completed'] = e => { const M = ST.mem.refs; M.k[0] = 1; storeTouch(1); flow('mem', 'bg', FLUID.cache, { speed: 160 }); logS('mem', e); setStatus('mem', e.d.result); feed('ok', '记忆', `记忆写入 · ${e.d.result}${e.d.path ? ' · ' + e.d.path : ''}`, e); };
H['x.memory_session_saved'] = e => { const M = ST.mem.refs; M.k[2] = 1; storeTouch(1); busy('mem', 2); logS('mem', e); feed('ok', '记忆', `会话日志保存 · ${e.d.path}`, e); };
H['x.memory_dream_completed'] = e => { memCall(1, '做梦：把攒下的会话日志整合进 MEMORY.md'); storeTouch(1); busy('mem', 4); focus('mem'); logS('mem', e); feed('ok', '记忆', `记忆整合 · ${e.d.result}`, e); };
H['x.memory_files'] = e => { const M = ST.mem.refs, n = (e.d.files || []).length; M.k[3] = 1; storeTouch(1); logS('mem', e); setStatus('mem', `${n} 个文件`); feed('sys', '记忆', `记忆文件 ${n} 个 · ${(e.d.files || []).map(f => f.path || f).join('、')}`, e); };
H['x.rewind_marker'] = e => {
  const target = Math.max(0, e.d.target_prompt_index), F = ST.tools.refs;
  F.snaps.forEach((m, i) => { if (i > target % F.snaps.length) m.visible = false; });
  CTX.segs = CTX.segs.filter(s => s[2] <= target);
  paintSram(); setCtx(Math.round(S_.ctx * 0.6)); storeTouch(3);
  busy('tools', 2.5); focus('tools'); camTo('sram'); logS('tools', e);
  feed('text', '回退', `回退到第 ${e.d.target_prompt_index} 次提问（${e.d.created_at}）· 文件按快照还原，对话截断`, e);
};
H['x.session_recap'] = e => { printClient(e.d.summary, 'answer', '= '); logS('client', e); feed('text', '回顾', `${e.d.auto ? '自动' : ''}回顾 · ${e.d.summary}`, e); };
H['x.session_recap_unavailable'] = e => { logS('client', e); feed('sys', '回顾', '这次没法生成回顾', e); };
// ── subagents and workflows: separate sessions with their own requests ──
H['x.subagent_spawned'] = e => {
  const S = ST.sub.refs; let i = S.state.findIndex(x => x === 'running'); if (i < 0) i = S.state.findIndex(x => !x); if (i >= 0) S.state[i] = 'running';
  S_.sub = { id: e.d.subagent_id, slot: i };
  stState('sub', 'busy', 30); focus('sub'); camTo('sub'); logS('sub', e); setStatus('sub', `${e.d.subagent_type} · ${e.d.description}`);
  const card = $('#subcard'); card.hidden = false; $('#sub-state').textContent = '运行中'; $('#sub-line').textContent = `${e.d.subagent_type} · ${e.d.capability_mode || ''} · ${e.d.description}`; $('#sub-bar').style.width = '4%';
  feed('sys', '子 agent', `起一个独立会话 · ${e.d.subagent_type} · ${e.d.description}`, e);
};
H['x.subagent_progress'] = e => {
  const d = e.d; $('#subcard').hidden = false; $('#sub-line').textContent = `${d.turn_count} 轮 · ${d.tool_call_count} 次工具 · ${fmtK(d.tokens_used)} token · ${Math.round(d.duration_ms / 1000)}s`;
  $('#sub-bar').style.width = Math.min(90, 20 + d.turn_count * 22) + '%'; setStatus('sub', `${d.turn_count} 轮`); logS('sub', e);
  // a child session makes its own model calls: a short train of its own on the network
  fx.trains.send(JOURNEY.out, new Array(8).fill(FLUID.cache), { speed: 320 });
  feed('sys', '子 agent', `进度 · ${d.turn_count} 轮 · ${d.tool_call_count} 次工具 · ${fmtK(d.tokens_used)} token`, e);
};
H['x.subagent_finished'] = e => {
  const d = e.d, S = ST.sub.refs, ok = d.status === 'completed', i = S_.sub?.slot ?? 0;
  if (i >= 0) { S.state[i] = ok ? 'done' : 'failed'; after(4, () => { S.state[i] = null; }); }
  $('#sub-state').textContent = ok ? '已返回' : d.status; $('#sub-bar').style.width = '100%'; after(4, () => { $('#subcard').hidden = true; });
  flows('sub', 'sram', ok ? FLUID.ok : FLUID.err, 3, 0.1, { lane: 1, speed: 240 });
  logS('sub', e); toast('里程碑', '子 agent 带回结果');
  feed(ok ? 'ok' : 'err', '子 agent', `${d.status} · ${d.tool_calls} 次工具 · ${d.turns} 轮 · ${fmtMs(d.duration_ms)} · ${fmtK(d.tokens_used)} token${d.output ? ' · ' + d.output : ''}`, e);
};
H['x.workflow_updated'] = e => {
  const d = e.d, S = ST.sub.refs;
  (d.agents || []).slice(0, 4).forEach((a, i) => { S.state[i] = a.state === 'running' ? 'running' : a.state === 'failed' ? 'failed' : a.state ? 'done' : null; });
  busy('sub', 2); focus('sub'); camTo('sub'); logS('sub', e); setStatus('sub', `${d.name} · ${d.current_phase || d.status}`);
  feed(d.status === 'complete' ? 'ok' : 'think', '工作流', `${d.name} r${d.revision} · ${d.status} · 阶段 ${d.current_phase || '—'} · ${d.active_agents} 个在跑 · agent ${d.agents_used}/${d.agent_budget ?? 128}${d.result_summary ? ' · ' + d.result_summary : ''}`, e);
};
// ── background tasks, monitors, schedules ──
H['x.task_backgrounded'] = e => { const B = ST.bg.refs; B.running = true; B.pts = []; B.scr.paint({ title: `${e.d.task_id} · ${e.d.monitor_description || e.d.command}`, pts: [] }); stState('bg', 'busy', 60); camTo('bg'); logS('bg', e); feed('tool', '后台', `转后台 · ${e.d.task_id} · ${e.d.command}${e.d.monitor_description ? ' · 监视：' + e.d.monitor_description : ''}`, e); };
H['x.monitor_event'] = e => {
  const B = ST.bg.refs, num = parseFloat((String(e.d.event_text).match(/-?\d+(\.\d+)?$/) || [])[0]);
  const v = Number.isFinite(num) ? clamp((num + 82) / 16, 0, 1) : Math.random();
  B.pts.push(v); B.scr.paint({ title: oneLine(e.d.event_text), pts: B.pts, hex: v > 0.7 ? '#d93a3f' : '#e5650f' });
  ST.rem.refs.k[4] = 1; flow('bg', 'rem', FLUID.tool, { speed: 200 });
  busy('bg', 1); logS('bg', e); feed('tool', '监视', `${e.d.description} · ${e.d.event_text}（作为提醒注入）`, e);
};
H['x.task_completed'] = e => { const B = ST.bg.refs, snap = e.d.task_snapshot || {}; B.running = false; stState('bg', 'idle'); logS('bg', e); if (e.d.will_wake) ST.queue.refs.items.push(FLUID.cache); feed('ok', '后台', `后台完成 · ${snap.task_id} · exit ${snap.exit_code ?? '—'}${snap.explicitly_killed ? '（主动停止）' : ''}${e.d.will_wake ? ' · 自动唤醒排进队列' : ''}`, e); };
H['x.scheduled_task_created'] = e => { ST.bg.refs.pin.visible = true; busy('bg', 2); camTo('bg'); logS('bg', e); setStatus('bg', e.d.human_schedule); feed('user', '定时', `创建 · ${e.d.human_schedule} · ${e.d.prompt}`, e); };
H['x.scheduled_task_fired'] = e => { ST.bg.refs.ring = 2.5; ST.queue.refs.items.push(FLUID.user); busy('bg', 2.5); logS('bg', e); feed('user', '定时', `到点触发 · ${e.d.human_schedule}${e.d.subagent_id ? ' · 派出 ' + e.d.subagent_id : ''} · 下次 ${e.d.next_fire_at || '—'}`, e); };
H['x.scheduled_task_deleted'] = e => { ST.bg.refs.pin.visible = false; logS('bg', e); setStatus('bg', '无'); feed('sys', '定时', `删除 · ${e.d.task_id}`, e); };
// ── models, retries, recovery ──
H['x.model_changed'] = e => { ST.sampler.refs.scr.paint({ a: 'MODEL', b: e.d.model_id }); busy('sampler', 2); logS('sampler', e); feed('req', '换模型', `${e.d.model_id}${e.d.reasoning_effort ? ' · 推理强度 ' + e.d.reasoning_effort : ''}`, e); };
H['x.model_auto_switched'] = e => { ST.sampler.refs.scr.paint({ a: 'SWITCH', b: e.d.new_model_id }); busy('sampler', 2); logS('sampler', e); feed('req', '换模型', `自动切换 ${e.d.previous_model_id} → ${e.d.new_model_id} · ${e.d.reason}`, e); };
H['x.retry_state'] = e => {
  const d = e.d, R = ST.sampler.refs, doom = /doom/.test(d.reason || '');
  R.err = 2.4; ST.front.refs.err = 2.4; ST.lm.refs.err = doom ? 2 : 0; camTo('sampler');
  // a request that bounces: out over the network and straight back in red
  fx.pulses.emit(BUS.net_tx, FLUID.err, { speed: 420, lift: 0, onEnd: () => fx.pulses.emit(BUS.net_rx, FLUID.err, { speed: 420, lift: 0 }) });
  if (d.type === 'retrying') { R.retry = Math.min(15, d.attempt || 1); if (doom) R.doomK = 2; R.scr.paint({ a: `RETRY ${d.attempt}/${d.maxRetries}`, b: oneLine(d.reason).slice(0, 26) }); feed('fog', doom ? '打转' : '重试', doom ? `doom-loop：${d.reason} → 中途掐断，重采样` : `重试 ${d.attempt}/${d.maxRetries} · ${d.reason} · 退避 ${Math.min(30, 2 ** (d.attempt || 1))}s`, e); }
  else if (d.type === 'exhausted') { R.retry = 15; R.err = 4; stState('sampler', 'error', 3); feed('fog', '用尽', `重试用完（${d.attempts} 次）· ${d.reason}${d.isRateLimited ? ' · 限流' : ''}`, e); }
  else { R.err = 3; stState('sampler', 'error', 3); feed('fog', '失败', `请求失败 · ${d.errorType} · ${d.message}`, e); }
  logS('sampler', e);
};
H['x.auto_recovery_started'] = e => { ST.sampler.refs.retry = 0; busy('turn', 2); camTo('turn'); logS('turn', e); feed('ok', '自救', `第 ${e.d.attempt}/${e.d.max_retries} 次自动恢复 · ${fmtMs(e.d.delay_ms)} 后整轮重来 · ${e.d.error}`, e); };
H['x.auto_recovery_exhausted'] = e => { stState('turn', 'error', 4); logS('turn', e); feed('fog', '自救', `自救耗尽（${e.d.attempts} 次）· ${e.d.error}`, e); };
H['x.relay_sync_status'] = e => { ST.acp.refs.txK = 1; logS('acp', e); feed(e.d.status === 'connected' ? 'sys' : 'err', '中继', `同步 ${e.d.status}${e.d.attempt ? ' · 第 ' + e.d.attempt + ' 次' : ''}`, e); };
H['x.hook_annotation'] = e => { const HB = ST.hooks.refs; HB.k = HB.k.map(() => 0.5); logS('hooks', e); feed('hook', 'Hook', `批注 · ${e.d.message}`, e); };
H['x.hooks_changed'] = e => { const HB = ST.hooks.refs; HB.k = HB.k.map(() => 0.8); storeTouch(2); logS('hooks', e); feed('sys', 'Hook', `Hook 变更 · ${e.d.hooks} 个 · ${e.d.project_trusted ? '项目已信任' : '项目未信任（项目里的 hook 不跑）'}`, e); };
H['x.plugins_changed'] = e => { const HB = ST.hooks.refs; HB.k = HB.k.map(() => 0.6); logS('hooks', e); feed('sys', '插件', `插件变更 · ${(e.d.plugins || []).join('、')}`, e); };
H['x.plugin_updates_installed'] = e => { logS('hooks', e); feed('sys', '插件', `插件更新 · ${(e.d.updates || []).map(u => u.join(' ')).join('、')}`, e); };
H['x.image_compressed'] = e => { busy('turn', 1.5); logS('turn', e); feed('sys', '图片', `${e.d.message}（≤1.5 MB、≤2000 px，存进会话 assets）`, e); };
H['x.image_dropped'] = e => { logS('turn', e); feed('err', '图片', `丢弃 · ${(e.d.notes || []).join('；')}`, e); };

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
// clear what is in flight before a jump or a source switch
function settleScene() {
  timers.length = 0; realTimers.length = 0; fx.trains.trains.length = 0; fx.pulses.items.length = 0;
  ST.loop.refs.active = false; ST.tools.refs.calls.clear(); ST.queue.refs.items = []; ST.sub.refs.state = [null, null, null, null];
  ST.compact.refs.on = 0; ST.compact.refs.progGoal = 0; ST.acp.refs.wait = false; ST.perm.refs.mode = 'idle';
  ST.sampler.refs.retry = 0; ST.bg.refs.running = false;
  hbmExpire(); ST.pcache.refs.chain = []; ST.pcache.refs.fork = []; ST.pcache.refs.dirty = true;
  closeDialog(); clock.blocked = false; $('#subcard').hidden = true;
  for (const S of ST_LIST) { S.state = 'idle'; S.stateUntil = 0; }
}
function jumpTo(ti) {
  settleScene();
  const i = TL.findIndex(e => e.ti === ti);
  cursor = Math.max(0, i); clock.vt = cursor ? TL[cursor].vt - 400 : 0; skipTurn = null;
  Object.assign(S_, { turn: null, loop: null, tools: new Map(), ticks: { r: 0, t: 0 }, tickTimes: [], ended: false });
  const prior = TL.slice(0, cursor).reverse().find(e => e.d && e.d.ctx);
  setCtx(prior ? prior.d.ctx : 0);
  ctxReset(TRACE.turns[ti]?.n ?? 0); paintSram(false);
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
  stats.turns = []; stats.ttft = []; stats.ok = 0; stats.err = 0; stats.calls = 0; stats.tps = 0;
  ST.client.refs.lines = []; ST.client.refs.scr.paint({ lines: [] });
  feedEl.innerHTML = ''; feedCount = 0;
  SEEN.clear(); codexDirty = true;
  ctxReset(-1); paintSram(false);
  setCtx(0); hud.stats(); hud.run(null, null); renderChapters(); renderCodex(true); paintSource();
  feed('sys', '切换', `${SRC_NAME[SRC]} · ${PROJECT} · ${SESSION.model}（芯片上的技能名、MCP 服务名在切换后要刷新页面才会换）`, null);
  toast('数据来源', SRC_NAME[SRC]);
}
function paintSource() { document.querySelectorAll('#src-seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.src === SRC))); $('#corner-title').textContent = `Starfleet · ${SRC_NAME[SRC]} · ${SESSION.model || '—'}`; }
function renderChapters() {
  $('#chap-h').textContent = `${SRC_NAME[SRC]} · ${TRACE.turns.length} 段`;
  $('#chapters').innerHTML = TRACE.turns.map((t, ti) => `<button type="button" data-ti="${ti}"><b>${esc(chapterName(ti))}</b><small>${t.events.length} 条事件</small></button>`).join('');
}

// ═════════════════════════ dialogs: permission, a question, the plan ═════════════════════════
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
  dlg.innerHTML = `<div class="stripe"></div><header><strong>session/request_permission</strong><span>${esc(e.d.name)}</span></header>
    <div class="body"><h4>${esc(title)}</h4>${pre ? `<pre>${esc(pre)}</pre>` : ''}
      <p class="rec">拒绝规则、YOLO、已有授权、auto 分类器、只读放行都没拦下，所以问你。${SRC === 'demo' ? '演示脚本里' : '录制时'}这一步被<b>${recTxt}</b>，等了 ${fmtMs(res?.d.wait)}。</p></div>
    <footer><button type="button" class="btn go" id="perm-allow">允许</button><button type="button" class="btn no" id="perm-deny">拒绝</button><span class="countdown" id="perm-cd"></span></footer>`;
  dlg.hidden = false;
  const choose = (c, auto = false) => {
    closeDialog(); clock.blocked = false;
    if (auto) { feed('sys', '自动', `无人操作，按记录结果${recTxt}`, null); return; }
    feed('user', '你的决定', c === 'allow' ? '允许' : '拒绝', null);
    if (c === 'deny' && rec === 'allow') { divergeDeny(e, T); return; }
    if (c === 'allow' && rec !== 'allow') toast('回放', `记录里这一步被${recTxt}，回放沿用记录结果`);
  };
  $('#perm-allow').addEventListener('click', () => choose('allow'));
  $('#perm-deny').addEventListener('click', () => choose('deny'));
  countdown(9, $('#perm-cd'), `按记录结果（${recTxt}）继续`, () => choose(rec, true));
  $('#perm-allow').focus({ preventScroll: true });
}
function divergeDeny(e, T) {
  feed('err', '权限', `你拒绝了 ${e.d.name} → 本轮结束（分支：记录里是批准）`, null, null, true);
  if (T) { T.perm = 'deny'; T.cancel = true; T.result = { ok: false, output: '你拒绝了' }; finishTool(T); }
  ST.perm.refs.mode = 'deny'; ST.perm.refs.until = sceneClock + 1.6; ST.loop.refs.active = false; hud.phase(null);
  skipTurn = e.ti;
  const next = TL.findIndex(x => x.i > e.i && x.ti !== e.ti);
  afterReal(1.2, () => { feed('err', '中止', `第 ${S_.turn} 轮结束 · 用户拒绝`, null, null, true); turnState(4); });
  if (next >= 0) { cursor = next; clock.vt = Math.max(clock.vt, TL[next].vt - 1800); } else cursor = TL.length;
}
function parseAnswers(text) { const m = new Map(); for (const [, q, a] of String(text).matchAll(/"([^"]+)"="([^"]+)"/g)) m.set(q, a.split(/,\s*/)); return m; }
function openAsk(T, done) {
  clock.blocked = true; ST.acp.refs.wait = true;
  const qs = T.questions || [], rec = parseAnswers(done?.d.output || '');
  const recTxt = qs.map(q => (rec.get(q.q) || []).join('、')).filter(Boolean).join(' / ') || '—';
  dlg.innerHTML = `<header><strong>x.ai/ask_user_question</strong><span>${qs.length} 个问题</span></header>
    <div class="body">${qs.map((q, qi) => `<fieldset><legend>${esc(q.q)}</legend>${q.options.map((o, oi) => `<label for="ask-${qi}-${oi}"><input id="ask-${qi}-${oi}" type="${q.multi ? 'checkbox' : 'radio'}" name="ask-${qi}" value="${esc(o.label)}"><span><b>${esc(o.label)}</b><small>${esc(o.desc)}</small></span></label>`).join('')}</fieldset>`).join('')}
      <p class="rec">记录里的回答：<b>${esc(recTxt)}</b></p></div>
    <footer><button type="button" class="btn go" id="ask-send">回复</button><span class="countdown" id="ask-cd"></span></footer>`;
  dlg.hidden = false;
  const submit = auto => {
    if (auto) qs.forEach((q, qi) => q.options.forEach((o, oi) => { const inp = $(`#ask-${qi}-${oi}`); if (inp) inp.checked = (rec.get(q.q) || []).includes(o.label); }));
    const mine = qs.map((q, qi) => [...dlg.querySelectorAll(`input[name="ask-${qi}"]:checked`)].map(i => i.value).join('、') || '（未选）').join(' / ');
    closeDialog(); clock.blocked = false; ST.acp.refs.wait = false;
    printClient(auto ? recTxt : mine, 'user');
    feed('user', '回答', auto ? `按记录回答：${recTxt}` : `你的回答：${mine}（记录回答：${recTxt}）`, done);
  };
  $('#ask-send').addEventListener('click', () => submit(false));
  countdown(16, $('#ask-cd'), '按记录回答提交', () => submit(true));
}
function openPlanApproval(e) {
  clock.blocked = true;
  const plan = [...S_.tools.values()].reverse().find(t => t.name === 'exit_plan_mode');
  const entries = (TL.slice(0, e.i).reverse().find(x => x.type === 'acp.plan')?.d.entries) || [];
  dlg.innerHTML = `<header><strong>x.ai/exit_plan_mode</strong><span>plan_approval</span></header>
    <div class="body"><h4>agent 想退出计划模式，开始动手</h4>${entries.length ? `<pre>${esc(entries.map((x, i) => `${i + 1}. ${x.content}`).join('\n'))}</pre>` : ''}
      <p class="rec">${plan?.input?.plan ? esc(plan.input.plan) + ' · ' : ''}批准后模式切回 default，工具执行器的 PLAN GATE 放开编辑。</p></div>
    <footer><button type="button" class="btn go" id="plan-ok">批准方案</button><button type="button" class="btn no" id="plan-more">再想想</button><span class="countdown" id="plan-cd"></span></footer>`;
  dlg.hidden = false;
  const done = (ok, auto) => { closeDialog(); clock.blocked = false; ST.acp.refs.wait = false; feed('user', auto ? '自动' : '你的决定', ok ? '批准方案' : '先不批（回放沿用记录：批准）', null); };
  $('#plan-ok').addEventListener('click', () => done(true));
  $('#plan-more').addEventListener('click', () => done(false));
  countdown(10, $('#plan-cd'), '按记录批准', () => done(true, true));
}
