// ═════════════════════════ the harness die, part one: the prompt side and the loop ═════════════════════════
// Block names follow the grok-build source (crates/codegen/xai-grok-shell, xai-chat-state,
// xai-grok-agent, xai-grok-sampler). The north band holds what a request is made of, the ring
// interior holds the loop that decides what happens next, the west column is where input arrives.
const BLK = {
  prefix: [-376, -148, -338, -98], compact: [-334, -148, -296, -98], sram: [-292, -148, -170, -98], rb: [-166, -148, -112, -98],
  sampler: [-108, -148, -30, -98], phy: [-28, -148, -14, -66],
  turn: [-300, -78, -258, 42], loop: [-252, -70, -148, 34], gates: [-142, -78, -100, 42],
  acp: [-376, -92, -322, -56], queue: [-376, -52, -322, -22], rem: [-376, -18, -322, 16], skills: [-376, 20, -322, 54],
  stream: [-80, -92, -16, -40], tools: [-80, -36, -16, 54],
  mcp: [-376, 60, -318, 126], mem: [-314, 60, -278, 126], runtime: [-274, 60, -152, 126], hooks: [-148, 60, -110, 126], perm: [-106, 60, -66, 126],
  sub: [-62, 60, -16, 92], bg: [-62, 96, -16, 126],
};
const bc = id => { const [x0, z0, x1, z1] = BLK[id]; return { x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }; };
const focusAt = (id, up = 34, fwd = 26) => { const b = bc(id); return [b.cx, DIE_Y + up, b.cz + fwd]; };
const pinAt = (id, dx = 4, dz = 4, up = 14) => { const b = bc(id); return [b.x0 + dx, DIE_Y + up, b.z0 + dz]; };
// a row of small lamps with an etched tag under each
function lampRow(g, k, x0, z, n, step, labels, hex, size = 1.6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    k.cyl(size * 0.75, 0.4, { p: [x, DIE_Y + 0.5, z], color: MAT.steel, seg: 12, tone: 0.4 });
    out.push(lampMesh(g, [x, DIE_Y + 1.2, z], size * 0.55, Array.isArray(hex) ? hex[i] : hex));
    if (labels && labels[i]) silk(labels[i], x, z + 3.2, { y: DIE_Y + 0.56, size: 1.45, weight: 600, alpha: 0.66 });
  }
  return out;
}
// the colours of context segments, shared by the conversation array and the HUD bar
const SEG = {
  sys: { hex: 0x6f6b7d, css: '#6f6b7d', name: '系统提示词' }, tools: { hex: 0xa68b5b, css: '#a68b5b', name: '工具定义' },
  info: { hex: 0x7d8c84, css: '#7d8c84', name: 'user_info' }, rem: { hex: 0xc27bd1, css: '#c27bd1', name: '提醒' },
  user: { hex: FLUID.user, css: '#ffcf1a', name: '用户' }, think: { hex: FLUID.reason, css: '#8a4dff', name: '推理' },
  text: { hex: FLUID.text, css: '#2f7bff', name: '正文' }, call: { hex: FLUID.tool, css: '#ff7a1c', name: '工具调用' },
  result: { hex: FLUID.ok, css: '#26c75a', name: '工具结果' }, summary: { hex: FLUID.context, css: '#2aa6c9', name: '压缩摘要' },
  older: { hex: 0xb9b4a8, css: '#b9b4a8', name: '更早的历史' },
};
const segHex = k => (SEG[k] || SEG.older).hex;

// ── the system prompt template and the frozen session prefix ──
station('prefix', {
  name: '提示词模板', role: '系统提示词 · prompt.md / PromptContext', color: 0x6f6b7d,
  desc: '系统提示词由 PromptContext（工作目录、系统、日期、AGENTS.md、记忆开关）渲染 MiniJinja 模板得来（extend 模式：内置的 prompt.md 加可选正文），写进 system_prompt.txt / prompt_context.json。会话开头的前缀——系统提示词、技能清单提醒、<user_info> 与 <git_status>、AGENTS.md——之后再也不改：哪怕日期变了也只追加一条提醒，因为改了前缀就会让服务器的提示缓存全部失效。',
  work: focusAt('prefix'), pin: pinAt('prefix'),
  build(S, g) {
    const b = bc('prefix'), k = new Kit({ tone: 0.5 });
    block(k, 'prefix', b.x0, b.z0, b.x1, b.z1, { tex: 'rom', label: 'PROMPT', sub: 'prompt.md · extend', zh: false });
    silk('提示词模板', b.x0 + 1.8, b.z0 + 9.6, { y: DIE_Y + 0.55, size: 2.2, align: 'left', weight: 600, alpha: 0.7 });
    glyph(k, 'lock', b.x1 - 9, b.z1 - 9, 9);
    k.finish(g);
    const lamp = lampMesh(g, [b.x0 + 4, DIE_Y + 1, b.z1 - 5], 0.9, 0x9a96aa);
    return { lamp, read: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.read = Math.max(0, R.read - dt); setLamp(R.lamp, R.read > 0 ? 0.85 : 0.08); },
});

// ── the conversation: every item the model sees, as cells coloured by kind ──
const SR = { cols: 56, rows: 18 };
station('sram', {
  name: '对话缓冲', role: '上下文 · ChatState 会话条目', color: FLUID.context,
  desc: '模型能看到的一切按顺序排在这里：系统提示词、工具定义、user_info、各种提醒、你的每条话、推理、正文、工具调用和工具结果。每一格是固定数量的 token，颜色是条目类型；构成取自真实会话的 chat_history.jsonl，总量对齐 grok 自己报的 _meta.totalTokens。默认走无状态的 Responses API，每次请求都把整个缓冲重新发一遍。',
  work: focusAt('sram', 40, 30), pin: pinAt('sram', 6, 4),
  build(S, g) {
    const b = bc('sram'), k = new Kit({ tone: 0.5 });
    block(k, 'sram', b.x0, b.z0, b.x1, b.z1, { color: MAT.siDark, h: 0.4 });
    // row decoder down the left, sense amplifiers along the near edge
    k.box(3, 0.5, b.d - 6, { p: [b.x0 + 2.6, DIE_Y + 0.4, b.cz - 1], color: MAT.pale, tone: 0.45 });
    for (let z = b.z0 + 4; z < b.z1 - 4; z += 1.2) k.line([[b.x0 + 1.2, DIE_Y + 0.92, z], [b.x0 + 4, DIE_Y + 0.92, z]], 'lo');
    k.box(b.w - 8, 0.5, 3, { p: [b.cx + 1.5, DIE_Y + 0.4, b.z1 - 2.6], color: MAT.pale, tone: 0.45 });
    for (let x = b.x0 + 6; x < b.x1 - 2; x += 1.6) k.line([[x, DIE_Y + 0.92, b.z1 - 1.2], [x, DIE_Y + 0.92, b.z1 - 4]], 'lo');
    k.finish(g);
    silk('CONVERSATION  对话缓冲 · ChatState', b.x0 + 2, b.z0 - 2.6, { y: DIE_Y + 0.08, size: 2.6, align: 'left', weight: 700, alpha: 0.85, parent: world });
    const N = SR.cols * SR.rows, px = (b.w - 8) / SR.cols, pz = (b.d - 8) / SR.rows;
    const cells = new THREE.InstancedMesh(slabGeo(px - 0.35, 0.45, pz - 0.35, 0, 0.1), fluidMat(0xffffff), N);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < N; i++) { m4.makeTranslation(b.x0 + 5.5 + (i % SR.cols + 0.5) * px, DIE_Y + 0.4, b.z0 + 2 + (Math.floor(i / SR.cols) + 0.5) * pz); cells.setMatrixAt(i, m4); cells.setColorAt(i, col.set(0xd6d3de)); }
    cells.castShadow = false; cells.userData.tone = 0.3; g.add(cells);
    const scr = makeScreen(30, 3.2, 20, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `500 ${h * 0.6}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(fitText(c, s.t || '', w * 0.96), w * 0.02, h * 0.55); });
    scr.mesh.rotation.x = -Math.PI / 2; scr.mesh.position.set(b.x1 - 17, DIE_Y + 0.45, b.z0 - 2.2); g.add(scr.mesh); scr.paint({ t: '0 tok' });
    return { cells, col, scr, N, hex: new Array(N).fill(null), fresh: new Float32Array(N), per: 32, dirty: true };
  },
  update(S, t, dt) {
    const R = S.refs; let any = false;
    for (let i = 0; i < R.N; i++) if (R.fresh[i] > 0) { R.fresh[i] = Math.max(0, R.fresh[i] - dt * 1.6); any = true; }
    if (!R.dirty && !any) return; R.dirty = false;
    const empty = THEME === 'dark' ? 0x2e2d35 : 0xd6d3de, tmp = R.tmp ?? (R.tmp = new THREE.Color());
    for (let i = 0; i < R.N; i++) { const h = R.hex[i]; if (h == null) { R.cells.setColorAt(i, R.col.set(empty)); continue; } R.col.set(h); if (R.fresh[i] > 0) R.col.lerp(tmp.set(0xffffff), R.fresh[i] * 0.7); R.cells.setColorAt(i, R.col); }
    R.cells.instanceColor.needsUpdate = true;
  },
});

// ── compaction: when the conversation nears the window, it is summarised and rewritten ──
station('compact', {
  name: '压缩器', role: '自动压缩 · auto_compact_*', color: FLUID.context,
  desc: '每次请求前都检查一次上下文：超过窗口的 85%（部分模型 80%）就先压缩再发；工具结果把上下文撑爆、API 报上下文超长、换到窗口更小的模型时也会压缩。压缩本身也是一次模型请求：用会话自己的模型，按九个小节写一份 <summary>；新的对话只剩系统提示词、<user_info>、AGENTS.md、最后一条提问、这份摘要和一条状态提醒（改过的文件、技能、后台任务、待办、MCP 服务）。压缩前的对话写成检查点文件；失败时原对话不动。',
  work: focusAt('compact'), pin: pinAt('compact'),
  build(S, g) {
    const b = bc('compact'), k = new Kit({ tone: 0.5 });
    block(k, 'compact', b.x0, b.z0, b.x1, b.z1, { tex: 'logic', label: 'COMPACT', sub: '85% → 摘要', zh: false });
    silk('压缩器', b.x0 + 1.8, b.z0 + 9.6, { y: DIE_Y + 0.55, size: 2.2, align: 'left', weight: 600, alpha: 0.7 });
    glyph(k, 'press', b.cx, b.cz + 6, 12);
    k.finish(g);
    const bar = mesh(slabGeo(1, 0.3, 2, 0, 0), fluidMat(FLUID.context), g, [b.x0 + 3, DIE_Y + 0.62, b.z1 - 4], [0, 0, 0], { tone: 0.5, cast: false });
    bar.scale.x = 0.01;
    const lamp = lampMesh(g, [b.cx, DIE_Y + 7.4, b.cz + 6], 1.1, FLUID.context);
    return { bar, lamp, prog: 0, progGoal: 0, on: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.prog = damp(R.prog, R.progGoal, 3, dt); R.bar.scale.x = Math.max(0.01, R.prog * (bc('compact').w - 6)); R.bar.position.x = bc('compact').x0 + 3 + R.bar.scale.x / 2; setLamp(R.lamp, R.on > 0 ? 0.5 + 0.4 * Math.sin(t * 8) : 0.06); },
});

// ── the request builder: gathers prefix, tool definitions and conversation into one request ──
station('rb', {
  name: '请求组装', role: '模型请求 · build_conversation_request', color: FLUID.context,
  desc: '每轮循环都重新组装一次完整请求：系统提示词、工具定义（只有内置工具；MCP 工具不直接给，模型用 search_tool / use_tool 去找）、整个对话缓冲。顺手修补对话的完整性、请求体超过 47 MB 时先丢图片，第一次请求还会把记忆提醒并进系统消息。请求头带 x-grok-conv-id（会话 id），让请求尽量落到存着它缓存的那台机器上。',
  work: focusAt('rb'), pin: pinAt('rb'),
  build(S, g) {
    const b = bc('rb'), k = new Kit({ tone: 0.5 });
    block(k, 'rb', b.x0, b.z0, b.x1, b.z0 + 30, { tex: 'grid', pitch: 2.4, label: 'REQUEST', sub: 'build_conversation_request' });
    block(k, 'tooldefs', b.x0, b.z0 + 33, b.x1, b.z1, { tex: 'rom', label: 'TOOL DEFS', sub: 'builtins only', labelSize: 1.9 });
    glyph(k, 'funnel', b.x1 - 9, b.z0 + 19, 11);
    k.finish(g);
    const scan = mesh(slabGeo(0.6, 0.3, 22, 0, 0), solid(0xffffff, { glow: 0, glowColor: FLUID.context }), g, [b.x0 + 2, DIE_Y + 0.6, b.z0 + 16], [0, 0, 0], { tone: 0.3, cast: false });
    const scr = makeScreen(22, 3.2, 20, (c, w, h, s, P) => { c.fillStyle = P.screenInk; c.font = `500 ${h * 0.6}px ${FONT_MONO}`; c.textBaseline = 'middle'; c.fillText(fitText(c, s.t || 'IN —', w * 0.96), w * 0.02, h * 0.55); });
    scr.mesh.rotation.x = -Math.PI / 2; scr.mesh.position.set(b.cx + 3, DIE_Y + 0.45, b.z0 - 2.2); g.add(scr.mesh); scr.paint({ t: 'IN —' });
    return { scan, scr, sweep: 0 };
  },
  update(S, t, dt) { const R = S.refs, b = bc('rb'); R.sweep = Math.max(0, R.sweep - dt); R.scan.position.x = b.x0 + 2 + (1 - R.sweep) * (b.w - 4); setLamp(R.scan, R.sweep > 0 ? 0.9 : 0); R.scan.visible = R.sweep > 0; },
});

// ── the sampler: the HTTP/2 client, the SSE decoder, retries, doom-loop checks, timing ──
station('sampler', {
  name: '采样器', role: 'HTTP/2 · SSE · retry_state', color: FLUID.context,
  desc: 'SamplerActor 用 reqwest（HTTP/2）把请求 POST 到 /responses，回来的是 SSE 流。首 token、每个分片的间隔（TTFT 只算正文，推理不算）都在这里计时。失败自动重试：429、5xx、断流、空响应，2 秒起翻倍、封顶 30 秒、最多 15 次（429 只重试一次）；空闲 600 秒没有新事件就判超时。doom-loop 检测打开时，服务端发现推理在原地打转会中途掐断重采样，最多 2 次。',
  work: focusAt('sampler', 36, 28), pin: pinAt('sampler', 6, 4),
  build(S, g) {
    const b = bc('sampler'), k = new Kit({ tone: 0.5 });
    block(k, 'http', b.x0, b.z0, b.x0 + 36, b.z0 + 24, { tex: 'logic', label: 'HTTP/2 · SSE', sub: 'POST /responses', labelSize: 1.9 });
    block(k, 'retry', b.x0 + 39, b.z0, b.x1, b.z0 + 24, { tex: 'logic', label: 'RETRY', sub: '2s ×2 → 30s · 15', labelSize: 1.9 });
    block(k, 'doom', b.x0, b.z0 + 27, b.x0 + 36, b.z1, { tex: 'logic', label: 'DOOM-LOOP', sub: 'x-grok-doom-loop-check', labelSize: 1.8 });
    block(k, 'metrics', b.x0 + 39, b.z0 + 27, b.x1, b.z1, { label: 'METRICS', sub: 'TTFT · ITL', labelSize: 1.8 });
    k.finish(g);
    const retries = lampRow(g, k, b.x0 + 42, b.z0 + 17, 15, 2.4, null, MAT.amberlamp, 1.1);
    k.finish(g);
    const doom = lampMesh(g, [b.x0 + 32, DIE_Y + 1.2, b.z1 - 5], 1.1, FLUID.err);
    const scr = makeScreen(34, 9, 16, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.textBaseline = 'top'; c.font = `600 ${h * 0.3}px ${FONT_MONO}`;
      c.fillText(fitText(c, s.a || 'TTFT —', w * 0.95), w * 0.03, h * 0.08);
      c.globalAlpha = 0.75; c.font = `400 ${h * 0.22}px ${FONT_MONO}`; c.fillText(fitText(c, s.b || 'ITL —', w * 0.95), w * 0.03, h * 0.5); c.globalAlpha = 1;
    });
    scr.mesh.rotation.x = -Math.PI / 2; scr.mesh.position.set(b.x0 + 39 + (b.x1 - b.x0 - 39) / 2, DIE_Y + 0.56, b.z0 + 27 + 13.5); g.add(scr.mesh); scr.paint({});
    const halo = glow(g, FLUID.context, 40, [b.cx, DIE_Y + 4, b.cz]);
    return { retries, doom, scr, halo, retry: 0, doomK: 0, busy: 0, err: 0 };
  },
  update(S, t, dt) {
    const R = S.refs; R.busy = Math.max(0, R.busy - dt); R.err = Math.max(0, R.err - dt); R.doomK = Math.max(0, R.doomK - dt);
    R.retries.forEach((m, i) => setLamp(m, i < R.retry ? (R.err > 0 && i === R.retry - 1 ? (Math.sin(t * 14) > 0 ? 1 : 0.3) : 0.7) : 0.04));
    setLamp(R.doom, R.doomK > 0 ? (Math.sin(t * 16) > 0 ? 1 : 0.2) : 0.04);
    R.halo.userData.set(R.err > 0 ? 0.5 : R.busy > 0 ? 0.25 : 0, R.err > 0 ? FLUID.err : FLUID.context);
  },
});
station('phy', {
  name: '网络接口', role: 'TX 请求 · RX 流', color: FLUID.context,
  desc: '芯片东缘的收发器：请求从这里发出去，SSE 流从这里收回来。线的另一头是推理服务，中间是公网——这就是为什么首 token 要等几秒。',
  work: focusAt('phy', 30, 30), pin: pinAt('phy', 6, 6),
  build(S, g) {
    const b = bc('phy'), k = new Kit({ tone: 0.5 });
    block(k, 'phy', b.x0, b.z0, b.x1, b.z1, { color: MAT.pale });
    phyPads(k, b.x0, b.z0, b.x1, b.z1, 'e');
    for (const z of [b.z0 + 14, b.z0 + 42]) spiral(k, b.x0 + 5, z, DIE_Y + 0.56, 0.8, 4, 4);
    k.finish(g);
    const tx = lampMesh(g, [b.x0 + 5, DIE_Y + 1.2, b.z0 + 60], 1, FLUID.context), rx = lampMesh(g, [b.x0 + 5, DIE_Y + 1.2, b.z0 + 68], 1, FLUID.text);
    return { tx, rx, txK: 0, rxK: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.txK = Math.max(0, R.txK - dt * 2); R.rxK = Math.max(0, R.rxK - dt * 2); setLamp(R.tx, 0.06 + R.txK * 0.9); setLamp(R.rx, 0.06 + R.rxK * 0.9); },
});

// ── the turn controller: one prompt at a time, from turn_started to turn_completed ──
const TURN_STATES = ['QUEUED', 'STARTED', 'LOOPING', 'STOP GATE', 'ENDED'];
station('turn', {
  name: '回合控制', role: '回合 · handle_prompt', color: FLUID.user,
  desc: 'handle_prompt 一次只跑一个回合：先解析斜杠命令和技能，发出 turn_started，处理图片，注入回合前的提醒，把你的话写进对话，触发 user_prompt_submit hook，然后交给循环；循环结束后过一遍收尾闸门（stop hook 最多让它继续 8 次），最后 turn_ended、turn_completed。结局只有四种：完成、取消、达到轮数上限、原地打转被叫停。',
  work: focusAt('turn', 34, 30), pin: pinAt('turn', 4, 6),
  build(S, g) {
    const b = bc('turn'), k = new Kit({ tone: 0.5 });
    block(k, 'turn', b.x0, b.z0, b.x1, b.z1, { tex: 'logic', label: 'TURN', sub: 'handle_prompt' });
    k.finish(g);
    const lamps = [];
    TURN_STATES.forEach((s, i) => { const z = b.z0 + 22 + i * 19; lamps.push(lampMesh(g, [b.x0 + 7, DIE_Y + 1.1, z], 1.3, i === 4 ? FLUID.ok : FLUID.user)); silk(s, b.x0 + 11, z + 0.6, { y: DIE_Y + 0.56, size: 2.1, align: 'left', weight: 600, alpha: 0.75 }); });
    const k2 = new Kit({ tone: 0.4 }); k2.line(TURN_STATES.map((_, i) => [b.x0 + 7, DIE_Y + 0.56, b.z0 + 22 + i * 19]), 'mid'); k2.finish(g);
    return { lamps, state: -1 };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => setLamp(m, i === R.state ? 0.85 : 0.05)); },
});

// ── the agent loop: the six stages every model call goes round ──
const LOOP_STAGES = [
  ['INJECT', '注入提醒'], ['GUARD', '原地打转'], ['COMPACT?', '85% 检查'], ['BUILD', '组装请求'], ['SAMPLE', '等模型'], ['TOOLS', '执行工具'],
];
const LOOP_R = 34;
const stageAngle = i => -Math.PI / 2 + (i / LOOP_STAGES.length) * TAU;
station('loop', {
  name: '智能体循环', role: '查询引擎 · process_conversation_turn', color: FLUID.reason,
  desc: '这是 harness 的心脏：每次模型调用都绕它一圈。注入待处理的提醒（插话、技能、监视输出、记忆、MCP 变化）→ 原地打转检查（同一个工具调用连着 16 次就叫停）→ 上下文过 85% 先压缩 → 组装请求 → 采样等模型说完 → 有工具调用就执行，然后再转一圈；没有工具调用就去收尾闸门。中间的屏显示这是第几回合、第几圈；默认不限圈数。',
  work: focusAt('loop', 50, 36), pin: [RING.cx, DIE_Y + 22, RING.cz - 40],
  build(S, g) {
    const b = bc('loop'), k = new Kit({ tone: 0.5 });
    k.cyl(51, 0.35, { p: [RING.cx, DIE_Y, RING.cz], color: MAT.siDark, seg: 96, b: 0.15, tone: 0.45 });
    k.cyl(46, 0.2, { p: [RING.cx, DIE_Y + 0.35, RING.cz], color: MAT.pale, seg: 96, tone: 0.5 });
    for (const r of [24, 44]) k.line(ringPts(RING.cx, DIE_Y + 0.58, RING.cz, r, 96), 'lo');
    LOOP_STAGES.forEach((_, i) => { const a = stageAngle(i); k.line([[RING.cx + Math.cos(a) * 15.5, DIE_Y + 0.58, RING.cz + Math.sin(a) * 15.5], [RING.cx + Math.cos(a) * (LOOP_R - 6), DIE_Y + 0.58, RING.cz + Math.sin(a) * (LOOP_R - 6)]], 'mid'); });
    BLOCKS.loop = { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: DIE_Y + 0.55, cx: RING.cx, cz: RING.cz };
    silk('AGENT LOOP  智能体循环', RING.cx, RING.cz + 43.5, { y: DIE_Y + 0.58, size: 2.4, weight: 700, alpha: 0.8 });
    k.add(torusGeo(LOOP_R, 0.8, 6, 96), { p: [RING.cx, DIE_Y + 0.75, RING.cz], color: MAT.copperM, tone: 0.4 });
    LOOP_STAGES.forEach(([en], i) => {
      const a = stageAngle(i), x = RING.cx + Math.cos(a) * LOOP_R, z = RING.cz + Math.sin(a) * LOOP_R;
      k.box(15, 1.4, 9, { p: [x, DIE_Y + 0.35, z], rr: 1.4, b: 0.3, color: MAT.paper, tone: 0.6, r: [0, -a + Math.PI / 2, 0] });
    });
    // the hub: a screen ringed by graduations
    k.cyl(15, 0.8, { p: [RING.cx, DIE_Y + 0.35, RING.cz], color: MAT.pale, seg: 48, tone: 0.55 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; k.line([[RING.cx + Math.cos(a) * 13.6, DIE_Y + 1.2, RING.cz + Math.sin(a) * 13.6], [RING.cx + Math.cos(a) * (i % 8 ? 14.4 : 15), DIE_Y + 1.2, RING.cz + Math.sin(a) * (i % 8 ? 14.4 : 15)]], 'lo'); }
    k.finish(g);
    const lamps = LOOP_STAGES.map(([en, zh], i) => {
      const a = stageAngle(i), x = RING.cx + Math.cos(a) * LOOP_R, z = RING.cz + Math.sin(a) * LOOP_R;
      silk(en, x, z - 0.6, { y: DIE_Y + 1.82, size: 1.7, weight: 600, alpha: 0.75 }); silk(zh, x, z + 2.4, { y: DIE_Y + 1.82, size: 1.3, alpha: 0.55 });
      return lampMesh(g, [x + 5.6 * Math.cos(a + Math.PI / 2), DIE_Y + 2.2, z + 5.6 * Math.sin(a + Math.PI / 2)], 0.9, FLUID.reason);
    });
    const scr = makeScreen(22, 14, 16, (c, w, h, s, P) => {
      c.fillStyle = P.screenInk; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `600 ${h * 0.2}px ${FONT_MONO}`; c.fillText(s.a || 'IDLE', w / 2, h * 0.3);
      c.font = `500 ${h * 0.15}px ${FONT_MONO}`; c.globalAlpha = 0.75; c.fillText(s.b || '', w / 2, h * 0.58); c.fillText(s.c || '', w / 2, h * 0.8); c.globalAlpha = 1; c.textAlign = 'left';
    });
    scr.mesh.rotation.x = -Math.PI / 2; scr.mesh.position.set(RING.cx, DIE_Y + 1.18, RING.cz); g.add(scr.mesh); scr.paint({ a: 'IDLE' });
    const token = mesh(sphereGeo(1.8, 16, 12), solid(0xffffff, { glow: 0.95, glowColor: FLUID.reason }), g, [RING.cx, DIE_Y + 1.6, RING.cz - LOOP_R], [0, 0, 0], { tone: 0.8, cast: false });
    const halo = glow(token, FLUID.reason, 14, [0, 0, 0]);
    return { lamps, scr, token, halo, stage: -1, ang: stageAngle(0), goal: stageAngle(0), spin: 0, hex: FLUID.reason, active: false };
  },
  update(S, t, dt) {
    const R = S.refs;
    let d = R.goal - R.ang; while (d < -1e-3) d += TAU;   // the token only moves forward round the loop
    R.ang += Math.min(d, dt * 7.5);
    R.token.position.set(RING.cx + Math.cos(R.ang) * LOOP_R, DIE_Y + 1.6, RING.cz + Math.sin(R.ang) * LOOP_R);
    setLamp(R.token, R.active ? 0.95 : 0.25, R.hex); R.halo.userData.set(R.active ? 0.6 : 0, R.hex);
    R.lamps.forEach((m, i) => setLamp(m, i === R.stage && R.active ? 0.9 : 0.05, R.hex));
  },
});
// move the loop token to stage i (it always goes forward, so a new round is a full turn)
function loopStage(i, hex) { const R = ST.loop.refs; R.stage = i; R.goal = stageAngle(i); R.active = true; if (hex != null) R.hex = hex; }

// ── the stop gates and goal mode ──
const GOAL_ROLES = ['PLANNER', 'STRATEGIST', 'CLASSIFIER', 'SKEPTIC 1', 'SKEPTIC 2', 'SKEPTIC 3', 'SUMMARIZER'];
station('gates', {
  name: '收尾闸门', role: 'stop hook · 待办闸门 · 偷懒判定 · 目标模式', color: FLUID.err,
  desc: '循环想停的时候先过这里：stop hook 可以把它推回去继续干（每回合最多 8 次）；待办闸门（默认关）发现还有没做完的 todo 会退回；偷懒判定在回合结束后、空闲 10 秒才跑，置信度 ≥ 0.7 才在下一次提问时提醒。目标模式有自己的一组角色：规划员、策略师、评估器、三个怀疑者、总结员，各自是一次模型调用。',
  work: focusAt('gates', 34, 30), pin: pinAt('gates', 4, 6),
  build(S, g) {
    const b = bc('gates'), k = new Kit({ tone: 0.5 });
    block(k, 'stopgate', b.x0, b.z0, b.x1, b.z0 + 52, { tex: 'logic', label: 'STOP GATE', sub: 'stop hooks ≤ 8' });
    block(k, 'goal', b.x0, b.z0 + 55, b.x1, b.z1, { tex: 'logic', label: 'GOAL', sub: 'roles' });
    glyph(k, 'flag', b.x1 - 6, b.z0 + 62, 7);
    const stops = lampRow(g, k, b.x0 + 5, b.z0 + 20, 8, 4.3, null, FLUID.err, 1.3);
    const todo = lampMesh(g, [b.x0 + 8, DIE_Y + 1.1, b.z0 + 34], 1.2, MAT.amberlamp), lazy = lampMesh(g, [b.x0 + 8, DIE_Y + 1.1, b.z0 + 43], 1.2, FLUID.err);
    silk('TODO GATE', b.x0 + 12, b.z0 + 34.6, { y: DIE_Y + 0.56, size: 1.7, align: 'left', weight: 600, alpha: 0.7 }); silk('LAZINESS', b.x0 + 12, b.z0 + 43.6, { y: DIE_Y + 0.56, size: 1.7, align: 'left', weight: 600, alpha: 0.7 });
    const roles = GOAL_ROLES.map((r, i) => { const z = b.z0 + 66 + i * 7.4; silk(r, b.x0 + 9, z + 0.5, { y: DIE_Y + 0.56, size: 1.6, align: 'left', weight: 600, alpha: 0.68 }); return lampMesh(g, [b.x0 + 5.5, DIE_Y + 1.1, z], 1, FLUID.ok); });
    k.finish(g);
    return { stops, todo, lazy, roles, n: 0, todoK: 0, lazyK: 0, roleK: new Array(GOAL_ROLES.length).fill(0), roleHex: new Array(GOAL_ROLES.length).fill(FLUID.ok) };
  },
  update(S, t, dt) {
    const R = S.refs;
    R.stops.forEach((m, i) => setLamp(m, i < R.n ? 0.8 : 0.04));
    R.todoK = Math.max(0, R.todoK - dt * 0.4); R.lazyK = Math.max(0, R.lazyK - dt * 0.4);
    setLamp(R.todo, 0.04 + R.todoK * (0.6 + 0.4 * Math.sin(t * 9))); setLamp(R.lazy, 0.04 + R.lazyK * (0.6 + 0.4 * Math.sin(t * 9)));
    R.roles.forEach((m, i) => { R.roleK[i] = Math.max(0, R.roleK[i] - dt * 0.25); setLamp(m, 0.04 + R.roleK[i], R.roleHex[i]); });
  },
});

// ── the west column: where input arrives and reminders are made ──
station('acp', {
  name: 'ACP 接口', role: '客户端 · stdio JSON-RPC', color: FLUID.user,
  desc: 'harness 通过 ACP（Agent Client Protocol，stdio 上的 JSON-RPC）和客户端（终端界面、IDE）说话：session/prompt 进来，session/update 和 _x.ai/session/update 出去；要你拍板的时候反过来发请求（session/request_permission、x.ai/ask_user_question、x.ai/exit_plan_mode），等你回答。同时它把每个事件写进 ~/.grok/sessions 下的 events.jsonl 和 updates.jsonl——这张图读的就是这些文件。',
  work: focusAt('acp', 30, 30), pin: pinAt('acp', 4, 4),
  build(S, g) {
    const b = bc('acp'), k = new Kit({ tone: 0.5 });
    block(k, 'acp', b.x0, b.z0, b.x1, b.z1, { tex: 'logic', label: 'ACP', sub: 'stdio · JSON-RPC', labelDx: 8 });
    phyPads(k, b.x0, b.z0, b.x1, b.z1, 'w');
    k.finish(g);
    const rx = lampMesh(g, [b.x1 - 6, DIE_Y + 1.1, b.z0 + 14], 1, FLUID.user), tx = lampMesh(g, [b.x1 - 6, DIE_Y + 1.1, b.z0 + 22], 1, FLUID.text), rq = lampMesh(g, [b.x1 - 6, DIE_Y + 1.1, b.z0 + 30], 1, MAT.amberlamp);
    for (const [s, z] of [['IN', 14], ['OUT', 22], ['ASK', 30]]) silk(s, b.x1 - 13, b.z0 + z + 0.5, { y: DIE_Y + 0.56, size: 1.6, weight: 600, alpha: 0.66 });
    const kd = new Kit({ tone: 0.6 }); glyph(kd, 'door', b.cx - 4, b.z0 + 24, 9); kd.finish(g);
    return { rx, tx, rq, rxK: 0, txK: 0, wait: false };
  },
  update(S, t, dt) { const R = S.refs; R.rxK = Math.max(0, R.rxK - dt * 1.5); R.txK = Math.max(0, R.txK - dt * 3); setLamp(R.rx, 0.05 + R.rxK * 0.9); setLamp(R.tx, 0.05 + R.txK * 0.9); setLamp(R.rq, R.wait ? 0.5 + 0.45 * Math.sin(t * 7) : 0.05); },
});
station('queue', {
  name: '提问队列', role: '排队 · pending_inputs', color: FLUID.user,
  desc: '同一时间只跑一个回合；回合进行中你再发的话、插话、后台任务完成后的自动唤醒（task-completed-…、subagent-completed-…）、定时任务的提问，都先在这里排队。插话不等回合结束：循环每转一圈都会把它取出来塞进对话。',
  work: focusAt('queue', 30, 30), pin: pinAt('queue', 4, 4),
  build(S, g) {
    const b = bc('queue'), k = new Kit({ tone: 0.5 });
    block(k, 'queue', b.x0, b.z0, b.x1, b.z1, { label: 'QUEUE', sub: 'pending_inputs', labelSize: 2 });
    for (let i = 0; i < 6; i++) k.box(6.6, 0.6, 9, { p: [b.x0 + 6 + i * 7.6, DIE_Y + 0.5, b.z1 - 8], rr: 0.6, color: MAT.siDark, tone: 0.4 });
    k.finish(g);
    const slots = []; for (let i = 0; i < 6; i++) slots.push(mesh(slabGeo(5.4, 0.6, 7.8, 0.4, 0.2), solid(0xffffff, { glow: 0, glowColor: FLUID.user }), g, [b.x0 + 6 + i * 7.6, DIE_Y + 1.1, b.z1 - 8], [0, 0, 0], { tone: 0.6, cast: false }));
    return { slots, items: [] };
  },
  update(S, t, dt) { const R = S.refs; R.slots.forEach((m, i) => { const it = R.items[i]; m.visible = !!it; if (it) setLamp(m, 0.75, it); }); },
});
const REM_KINDS = [['MCP', 'mcp'], ['DATE', 'date'], ['PLAN', 'plan'], ['SKILL', 'skills'], ['MON', 'monitor'], ['MEM', 'memory'], ['INTJ', 'interject']];
station('rem', {
  name: '提醒注入', role: '系统提醒 · push_system_reminder', color: 0xc27bd1,
  desc: '会话中途要告诉模型的新情况，一律写成 <system-reminder> 追加在对话末尾，而不是去改前面的内容：MCP 服务连上或断开了、日期变了、进出计划模式、技能清单、监视输出、记忆、插话。追加只会让缓存的前缀变长，改写则会让服务器上缓存的前缀全部作废——源码里专门写着这是为了保住提示缓存。',
  work: focusAt('rem', 30, 30), pin: pinAt('rem', 4, 4),
  build(S, g) {
    const b = bc('rem'), k = new Kit({ tone: 0.5 });
    block(k, 'rem', b.x0, b.z0, b.x1, b.z1, { tex: 'logic', label: 'REMINDERS', sub: 'append-only', labelSize: 2 });
    const lamps = lampRow(g, k, b.x0 + 5, b.z1 - 9, REM_KINDS.length, 7.2, REM_KINDS.map(r => r[0]), 0xc27bd1, 1.3);
    glyph(k, 'note', b.x1 - 8, b.z0 + 11, 8);
    k.finish(g);
    return { lamps, k: new Array(REM_KINDS.length).fill(0) };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 0.7); setLamp(m, 0.05 + R.k[i]); }); },
});
station('skills', {
  name: '技能', role: '技能清单 · skill_activated', color: 0xc27bd1,
  desc: '会话一开始，所有可用技能的名字和一句话说明作为一条提醒写进对话（这里列的是这次会话真实的技能清单）；模型需要时再去读某个技能的完整说明，正文作为工具结果进入对话。',
  work: focusAt('skills', 30, 30), pin: pinAt('skills', 4, 4),
  build(S, g) {
    const b = bc('skills'), k = new Kit({ tone: 0.5 });
    block(k, 'skills', b.x0, b.z0, b.x1, b.z1, { label: 'SKILLS', sub: 'index → reminder', labelSize: 2 });
    const names = (TRACE.context?.skills || []).slice(0, 6), lamps = [];
    names.forEach((n, i) => { const z = b.z0 + 11 + i * 3.6; k.line([[b.x0 + 3, DIE_Y + 0.56, z + 1.6], [b.x1 - 16, DIE_Y + 0.56, z + 1.6]], 'lo'); silk(n, b.x0 + 7, z, { y: DIE_Y + 0.56, size: 1.6, align: 'left', weight: 600, alpha: 0.7 }); lamps.push(lampMesh(g, [b.x0 + 4.4, DIE_Y + 0.95, z], 0.6, 0xc27bd1)); });
    glyph(k, 'books', b.x1 - 8, b.z0 + 22, 9);
    k.finish(g);
    return { lamps, k: 0 };
  },
  update(S, t, dt) { const R = S.refs; R.k = Math.max(0, R.k - dt * 0.5); R.lamps.forEach((m, i) => setLamp(m, 0.05 + R.k * (0.5 + 0.5 * Math.sin(t * 6 + i)))); },
});
