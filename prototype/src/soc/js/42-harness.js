// ═════════════════════════ the harness die, part two: the stream, the tools and everything around them ═════════════════════════

// ── the stream handler: splits the SSE stream into reasoning, text and tool-call deltas ──
station('stream', {
  name: '流处理', role: '流式 chunk · handle_sampling_event', color: FLUID.text,
  desc: '采样器解出来的每个事件到这里分路：推理（紫）存进对话，正文（蓝）一边推给客户端显示一边存进对话，工具调用的参数增量（琥珀）只推给界面看——工具要等整段响应收完才执行。每来一个分片就发一次 phase_changed，第一个分片是 first_token。',
  work: focusAt('stream', 32, 30), pin: pinAt('stream', 4, 4),
  build(S, g) {
    const b = bc('stream'), k = new Kit({ tone: 0.5 });
    block(k, 'stream', b.x0, b.z0, b.x1, b.z1, { tex: 'logic', label: 'STREAM', sub: 'handle_sampling_event' });
    glyph(k, 'split', b.x1 - 11, b.z0 + 12, 10);
    const lanes = [[FLUID.reason, 'REASONING'], [FLUID.text, 'TEXT'], [FLUID.tool, 'TOOL Δ']].map(([hex, name], i) => {
      const z = b.z0 + 22 + i * 9;
      k.box(b.w - 22, 0.4, 2.2, { p: [b.cx + 4, DIE_Y + 0.5, z], color: MAT.siDark, tone: 0.4 });
      silk(name, b.x0 + 3, z + 0.5, { y: DIE_Y + 0.56, size: 1.6, align: 'left', weight: 600, alpha: 0.7 });
      return mesh(slabGeo(b.w - 22, 0.35, 1.6, 0, 0), solid(0xffffff, { glow: 0, glowColor: hex }), g, [b.cx + 4, DIE_Y + 0.92, z], [0, 0, 0], { tone: 0.3, cast: false });
    });
    k.finish(g);
    return { lanes, k: [0, 0, 0], n: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.lanes.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 3); setLamp(m, 0.04 + R.k[i] * 0.9); }); },
});

// ── the tool executor: preflight, then every approved call of a response in parallel ──
const TX_STAGES = ['PARSE', 'PLAN GATE', 'PRE HOOK', 'PERMIT', 'RUN ‖', 'FINALIZE'];
station('tools', {
  name: '工具执行', role: '工具调用 · execute_tool_calls', color: FLUID.tool,
  desc: '一段响应里的工具调用收齐之后，逐个预检：解析参数（坏掉的 JSON 尽量修，修不了就把错误当结果还给模型）、计划模式下拦掉除计划文件以外的编辑、跑 pre_tool_use hook、问权限；通过的调用全部并行执行（不限并发，写同一路径的串行），结果加上提醒（诊断、任务完成）写回对话，再跑 post_tool_use hook。写文件前的快照按提问编号存好，用来回退。',
  work: focusAt('tools', 34, 30), pin: pinAt('tools', 4, 4),
  build(S, g) {
    const b = bc('tools'), k = new Kit({ tone: 0.5 });
    block(k, 'tools', b.x0, b.z0, b.x1, b.z1 - 22, { tex: 'logic', label: 'TOOL EXEC', sub: 'execute_tool_calls' });
    block(k, 'filestate', b.x0, b.z1 - 19, b.x1, b.z1, { tex: 'grid', pitch: 2, label: 'FILE STATE · rewind', labelSize: 1.7 });
    const stages = TX_STAGES.map((s, i) => { const z = b.z0 + 13 + i * 7.6; silk(s, b.x0 + 8, z + 0.5, { y: DIE_Y + 0.56, size: 1.6, align: 'left', weight: 600, alpha: 0.7 }); return lampMesh(g, [b.x0 + 4.6, DIE_Y + 1.1, z], 1, FLUID.tool); });
    // the parallel batch: six slots, one per call in flight
    const slots = []; for (let i = 0; i < 6; i++) { const x = b.x0 + 38 + (i % 2) * 11, z = b.z0 + 16 + Math.floor(i / 2) * 11; k.box(9, 0.6, 9, { p: [x, DIE_Y + 0.5, z], rr: 0.6, color: MAT.siDark, tone: 0.4 }); slots.push(mesh(slabGeo(7.4, 0.5, 7.4, 0.5, 0.2), solid(0xffffff, { glow: 0, glowColor: FLUID.tool }), g, [x, DIE_Y + 1.1, z], [0, 0, 0], { tone: 0.6, cast: false })); }
    k.finish(g);
    const snaps = []; for (let i = 0; i < 12; i++) snaps.push(mesh(slabGeo(3.2, 0.4, 3.2, 0, 0.1), fluidMat(FLUID.ok), g, [b.x0 + 6 + i * 4.6, DIE_Y + 0.92, b.z1 - 6], [0, 0, 0], { tone: 0.4, cast: false }));
    snaps.forEach(m => { m.visible = false; });
    return { stages, slots, snaps, stage: -1, calls: new Map(), snapN: 0 };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.stages.forEach((m, i) => setLamp(m, i === R.stage ? 0.9 : 0.04, i === 3 && R.waiting ? MAT.amberlamp : FLUID.tool));
    const live = [...R.calls.values()];
    R.slots.forEach((m, i) => { const c = live[i]; m.visible = !!c; if (c) setLamp(m, c.done ? 0.6 : 0.4 + 0.4 * Math.sin(t * 8 + i), c.done ? (c.ok ? FLUID.ok : FLUID.err) : FLUID.tool); });
  },
});

// ── hooks: fourteen lines out to user scripts ──
station('hooks', {
  name: 'Hook 调度', role: 'Hook 执行 · HookDispatcher', color: FLUID.ok,
  desc: '14 种事件各有一条线通到外部脚本（~/.grok/hooks、项目 .grok/hooks、插件、兼容 Claude/Cursor 的配置）：命令从 stdin 收到一包 JSON，默认 5 秒超时。只有 pre_tool_use 能拦下工具（退出码 2 或 decision:deny，不能改参数），stop / subagent_stop 能把模型推回去继续干；其余只是旁听。脚本出错一律放行。',
  work: focusAt('hooks', 32, 30), pin: pinAt('hooks', 4, 4),
  build(S, g) {
    const b = bc('hooks'), k = new Kit({ tone: 0.5 });
    block(k, 'hooks', b.x0, b.z0, b.x1, b.z1, { tex: 'logic', label: 'HOOKS', sub: '14 lines' });
    glyph(k, 'comb', b.cx, b.z1 - 4.4, 9);
    const lamps = HOOK_EVENTS.map((ev, i) => { const x = b.x0 + 6 + (i % 2) * 17, z = b.z0 + 12 + Math.floor(i / 2) * 7.6; silk(ev.replace(/_/g, ' ').slice(0, 14), x + 2.4, z + 0.5, { y: DIE_Y + 0.56, size: 1.3, align: 'left', weight: 600, alpha: 0.66 }); return lampMesh(g, [x, DIE_Y + 1.05, z], 0.95, FLUID.ok); });
    k.finish(g);
    return { lamps, k: new Array(14).fill(0), hex: new Array(14).fill(FLUID.ok) };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 0.6); setLamp(m, 0.04 + R.k[i], R.hex[i]); }); },
});

// ── permission: a guarded block; deny rules, yolo, grants, the auto classifier, then ask ──
const PERM_STEPS = ['DENY RULE', 'YOLO', 'GRANTS', 'AUTO', 'SAFE CMD', 'ASK USER'];
station('perm', {
  name: '权限', role: '权限请求 · PermissionManager', color: MAT.hazard,
  desc: '每个工具调用按这个顺序过一遍：命中拒绝规则直接拒（YOLO 也拦不住）→ YOLO 全放行 → 这次会话或之前保存的授权 → auto 模式的快速通道和分类器 → 只读工具和安全命令直接放行 → 都不是就用 session/request_permission 问你。规则写法像 Bash(git:*)、Read(src/**)、WebFetch(domain:x)。你拒绝会结束这一回合；规则拒绝只把拒绝当结果交还模型。',
  work: focusAt('perm', 32, 30), pin: pinAt('perm', 4, 4),
  build(S, g) {
    const b = bc('perm'), k = new Kit({ tone: 0.5 });
    block(k, 'perm', b.x0, b.z0, b.x1, b.z1, { color: MAT.pale, label: 'PERMISSION', sub: 'rules → ask', labelSize: 2 });
    // a guard ring of vias, the mark of a secured block
    for (const inset of [1.2, 2.4]) { const pts = []; const per = 2 * (b.w + b.d - 4 * inset); for (let s = 0; s < per; s += 1.6) { let x, z; const w = b.w - 2 * inset, d = b.d - 2 * inset; if (s < w) { x = b.x0 + inset + s; z = b.z0 + inset; } else if (s < w + d) { x = b.x1 - inset; z = b.z0 + inset + s - w; } else if (s < 2 * w + d) { x = b.x1 - inset - (s - w - d); z = b.z1 - inset; } else { x = b.x0 + inset; z = b.z1 - inset - (s - 2 * w - d); } k.box(0.5, 0.12, 0.5, { p: [x, DIE_Y + 0.5, z], color: MAT.gold, tone: 0.3 }); } }
    glyph(k, 'shield', b.x1 - 9, b.z0 + 24, 9);
    const steps = PERM_STEPS.map((s, i) => { const z = b.z0 + 13 + i * 8; silk(s, b.x0 + 9, z + 0.5, { y: DIE_Y + 0.56, size: 1.6, align: 'left', weight: 600, alpha: 0.7 }); return lampMesh(g, [b.x0 + 5.6, DIE_Y + 1.1, z], 1, FLUID.ok); });
    k.finish(g);
    const verdict = lampMesh(g, [b.x1 - 6, DIE_Y + 1.6, b.z1 - 7], 1.7, FLUID.ok);
    const halo = glow(g, MAT.amberlamp, 40, [b.cx, DIE_Y + 4, b.cz]);
    return { steps, verdict, halo, step: -1, mode: 'idle', until: 0 };
  },
  update(S, t, dt) {
    const R = S.refs, wait = R.mode === 'wait', blink = Math.sin(t * 7) > 0;
    R.steps.forEach((m, i) => setLamp(m, i === R.step ? 0.9 : 0.04, i === 5 ? MAT.amberlamp : i === 0 ? FLUID.err : FLUID.ok));
    setLamp(R.verdict, wait ? (blink ? 0.9 : 0.25) : R.mode === 'allow' ? 0.9 : R.mode === 'deny' ? 1 : 0.06, wait ? MAT.amberlamp : R.mode === 'deny' ? FLUID.err : FLUID.ok);
    R.halo.userData.set(wait ? (blink ? 0.6 : 0.2) : 0, MAT.amberlamp);
    if (R.until && sceneClock > R.until && !wait) { R.mode = 'idle'; R.until = 0; R.step = -1; }
  },
});

// ── the tool runtime: one lane per family of built-in tools ──
const LANES_RT = [
  ['FS', 'read_file · list_dir · grep'], ['EDIT', 'search_replace · write'], ['BASH', 'run_terminal_command'], ['WEB', 'web_search · web_fetch'],
  ['ASK', 'ask_user_question'], ['PLAN', 'todo_write · plan mode'], ['MCP', 'search_tool · use_tool'], ['TASK', 'spawn_subagent · workflow'],
  ['BG', 'monitor · scheduler_*'], ['MEM', 'memory_search · get'], ['GOAL', 'update_goal'],
];
const LANE_GLYPH = { FS: 'lens', EDIT: 'pencil', BASH: 'terminal', WEB: 'globe', ASK: 'ask', PLAN: 'list', MCP: 'plug', TASK: 'stack', BG: 'clock', MEM: 'db', GOAL: 'flag' };
function laneOf(name = '', kind) {
  if (name === 'ask_user_question' || kind === 'ask_user') return 'ASK';
  if (/plan_mode/.test(name) || name === 'todo_write' || kind === 'think') return 'PLAN';
  if (name === 'update_goal') return 'GOAL';
  if (name === 'workflow' || name === 'spawn_subagent' || /command_or_subagent/.test(name)) return 'TASK';
  if (name === 'monitor' || /^scheduler_/.test(name)) return 'BG';
  if (/^memory_/.test(name)) return 'MEM';
  if (name === 'search_tool' || name === 'use_tool' || /__/.test(name)) return 'MCP';
  if (/^web_/.test(name) || kind === 'fetch') return 'WEB';
  if (kind === 'execute' || name === 'run_terminal_command') return 'BASH';
  if (kind === 'edit' || kind === 'write' || name === 'write' || name === 'search_replace' || name === 'apply_patch') return 'EDIT';
  return 'FS';
}
station('runtime', {
  name: '工具运行时', role: '内置工具 · FinalizedToolset', color: FLUID.tool,
  desc: '内置工具按家族分成 11 条通道。工具 id 带命名空间（GrokBuild:read_file），说明文字是模板，组装工具集时渲染。BASH 那条在沙箱里（macOS 用 Seatbelt，默认关闭），默认 120 秒超时、前台超过 15 秒自动转后台；输出有上限（命令 2 万字符、其他 40 KB、MCP 20 KB）。MCP 那条只有两个入口：search_tool 按 BM25 找工具，use_tool 去调用。',
  work: focusAt('runtime', 34, 30), pin: pinAt('runtime', 4, 4),
  build(S, g) {
    const b = bc('runtime'), k = new Kit({ tone: 0.5 }), lw = (b.w - 2) / LANES_RT.length;
    block(k, 'runtime', b.x0, b.z0, b.x1, b.z1, { color: MAT.siDark, h: 0.35, label: 'TOOL RUNTIME', sub: 'FinalizedToolset::call', labelSize: 2 });
    const lamps = {};
    LANES_RT.forEach(([id, names], i) => {
      const x0 = b.x0 + 1 + i * lw, x1 = x0 + lw - 1;
      block(k, 'lane_' + id, x0, b.z0 + 9, x1, b.z1 - 1, { tex: id === 'BASH' ? 'grid' : 'logic', h: 0.55, pitch: 1.6, seed: i * 37 });
      silk(id, (x0 + x1) / 2, b.z0 + 14, { y: DIE_Y + 0.62, size: 2.1, weight: 700, alpha: 0.82 });
      glyph(k, LANE_GLYPH[id], (x0 + x1) / 2, b.z0 + 31, 7.4);
      lamps[id] = lampMesh(g, [(x0 + x1) / 2, DIE_Y + 1.3, b.z1 - 6], 1.25, FLUID.tool);
    });
    // the sandbox outline around BASH
    const bi = LANES_RT.findIndex(l => l[0] === 'BASH'), bx0 = b.x0 + 1 + bi * lw - 0.4, bx1 = bx0 + lw + 0.2;
    for (let s = 0; s < 1; s += 0.02) { const pts = [[bx0, b.z0 + 8.4], [bx1, b.z0 + 8.4], [bx1, b.z1 - 0.4], [bx0, b.z1 - 0.4], [bx0, b.z0 + 8.4]]; void pts; }
    k.line([[bx0, DIE_Y + 0.98, b.z0 + 8.4], [bx1, DIE_Y + 0.98, b.z0 + 8.4], [bx1, DIE_Y + 0.98, b.z1 - 0.4], [bx0, DIE_Y + 0.98, b.z1 - 0.4], [bx0, DIE_Y + 0.98, b.z0 + 8.4]], 'hi');
    silk('SANDBOX', (bx0 + bx1) / 2, b.z1 - 11, { y: DIE_Y + 0.62, size: 1.05, alpha: 0.6 });
    k.finish(g);
    return { lamps, k: Object.fromEntries(LANES_RT.map(l => [l[0], 0])), hex: Object.fromEntries(LANES_RT.map(l => [l[0], FLUID.tool])), lw };
  },
  update(S, t, dt) { const R = S.refs; for (const id in R.lamps) { R.k[id] = Math.max(0, R.k[id] - dt * 0.5); setLamp(R.lamps[id], 0.05 + R.k[id] * 0.9, R.hex[id]); } },
});
const laneX = id => { const b = bc('runtime'), i = LANES_RT.findIndex(l => l[0] === id), lw = (b.w - 2) / LANES_RT.length; return b.x0 + 1 + i * lw + lw / 2; };

// ── child sessions and background work ──
station('sub', {
  name: '子会话', role: '子 agent · 工作流 · run_shell_child', color: FLUID.cache,
  desc: 'spawn_subagent 起的是一个独立的会话（新的上下文，自己的模型请求），和父会话共用权限、hook、终端、文件系统和 MCP 连接；默认在后台跑，结果通过工具结果、提醒或一次自动唤醒交回。工作流（workflow 工具，Rhai 脚本）里的每个 agent 也是这样的子会话，按阶段推进。',
  work: focusAt('sub', 30, 30), pin: pinAt('sub', 4, 4),
  build(S, g) {
    const b = bc('sub'), k = new Kit({ tone: 0.5 });
    block(k, 'sub', b.x0, b.z0, b.x1, b.z1, { label: 'CHILD SESSIONS', sub: 'subagents · workflow', labelSize: 1.7 });
    const cores = [];
    for (let i = 0; i < 4; i++) {
      const x = b.x0 + 7 + i * 10.4, z = b.z1 - 9;
      k.box(8.6, 0.6, 8.6, { p: [x, DIE_Y + 0.5, z], rr: 0.6, color: MAT.siDark, tone: 0.45 });
      k.add(torusGeo(2.6, 0.35, 5, 20), { p: [x, DIE_Y + 1.15, z], color: MAT.copperM });
      cores.push(lampMesh(g, [x, DIE_Y + 1.6, z], 1, FLUID.cache));
    }
    k.finish(g);
    return { cores, state: [null, null, null, null] };
  },
  update(S, t, dt) { const R = S.refs; R.cores.forEach((m, i) => { const s = R.state[i]; setLamp(m, !s ? 0.04 : s === 'running' ? 0.45 + 0.4 * Math.sin(t * 5 + i) : 0.8, !s || s === 'running' ? FLUID.cache : s === 'failed' ? FLUID.err : FLUID.ok); }); },
});
station('bg', {
  name: '后台', role: '后台任务 · 监视 · 定时', color: FLUID.tool,
  desc: '转到后台的命令、挂在日志上的监视器（monitor：200 毫秒去抖，每 2 秒最多 10 条，输出作为提醒注入）、定时任务（间隔 ≥ 60 秒，最多 50 个）都在这里排着；跑完会发一个自动唤醒的提问把模型叫回来。',
  work: focusAt('bg', 30, 30), pin: pinAt('bg', 4, 4),
  build(S, g) {
    const b = bc('bg'), k = new Kit({ tone: 0.5 });
    block(k, 'bg', b.x0, b.z0, b.x1, b.z1, { label: 'BACKGROUND', sub: 'tasks · monitor · cron', labelSize: 1.7 });
    k.cyl(6.4, 0.5, { p: [b.x1 - 9, DIE_Y + 0.5, b.cz + 3], color: MAT.pale, seg: 32 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.line([[b.x1 - 9 + Math.cos(a) * 5.6, DIE_Y + 1.05, b.cz + 3 + Math.sin(a) * 5.6], [b.x1 - 9 + Math.cos(a) * (i % 6 ? 6 : 5), DIE_Y + 1.05, b.cz + 3 + Math.sin(a) * (i % 6 ? 6 : 5)]], 'lo'); }
    k.finish(g);
    const hand = group(g, [b.x1 - 9, DIE_Y + 1.1, b.cz + 3]);
    const kh = new Kit({ tone: 0.9 }); kh.box(0.5, 0.4, 5, { p: [0, 0, 2.5], color: MAT.graphite }); kh.finish(hand);
    const scr = makeScreen(22, 9, 16, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.font = `500 ${h * 0.16}px ${FONT_MONO}`; c.textBaseline = 'top'; c.fillText(fitText(c, s.title || 'idle', w * 0.95), w * 0.03, h * 0.04);
      c.strokeStyle = s.hex || P.screenInk; c.lineWidth = Math.max(1.2, w * 0.01); c.beginPath(); (s.pts || []).slice(-24).forEach((v, i, a) => { const x = w * (0.04 + (0.92 * i) / Math.max(1, a.length - 1)), y = h * (0.9 - 0.6 * v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    });
    scr.mesh.rotation.x = -Math.PI / 2; scr.mesh.position.set(b.x0 + 13.5, DIE_Y + 0.56, b.cz + 3); g.add(scr.mesh); scr.paint({ title: 'idle' });
    const lamp = lampMesh(g, [b.x1 - 9, DIE_Y + 1.4, b.z0 + 4], 0.9, FLUID.tool);
    const pin = mesh(cylGeo(0.6, 2.2, 0, 10), solid(FLUID.user, { paint: 1 }), g, [b.x1 - 9, DIE_Y + 1, b.cz - 3.4], [0, 0, 0], { tone: 0.8 });
    pin.visible = false;
    return { hand, scr, lamp, pin, running: false, pts: [], ring: 0 };
  },
  update(S, t, dt) {
    const R = S.refs, d = new Date(CLOCK_REAL()); R.hand.rotation.y = -((d.getHours() + d.getMinutes() / 60) / 24) * TAU;
    R.ring = Math.max(0, R.ring - dt); setLamp(R.lamp, R.ring > 0 ? (Math.sin(t * 24) > 0 ? 1 : 0.2) : R.running ? 0.5 + 0.3 * Math.sin(t * 4) : 0.05);
  },
});
