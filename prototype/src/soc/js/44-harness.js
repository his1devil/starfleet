// ═════════════════════════ the harness die, part three: MCP, memory, and what sits off the die ═════════════════════════

// ── MCP: a pool of servers behind two tools; their tools never go into the request directly ──
const MCP_N = 3;
station('mcp', {
  name: 'MCP 池', role: 'MCP 服务全套 · mcp_*', color: FLUID.cache,
  desc: '启动时读配置（config.toml 各层、项目 .grok/config.toml、插件、兼容 Claude/Cursor 的 mcp.json，客户端给的优先），最多 8 个并行启动：stdio 的起子进程，http/sse 走同一套 streamable HTTP，OAuth 发现 5 秒超时；握手、tools/list，再把工具以 server__tool 的名字登记进旁路注册表。这些工具不进模型的工具列表——列表变了服务器上的前缀缓存就废了——模型只能先用 search_tool（BM25）找、再用 use_tool 调；连上、断开的消息靠提醒告诉模型。stdio 服务挂了按 1/4/16 秒重启。',
  work: focusAt('mcp', 32, 30), pin: pinAt('mcp', 4, 4),
  build(S, g) {
    const b = bc('mcp'), k = new Kit({ tone: 0.5 });
    block(k, 'mcp', b.x0, b.z0, b.x1, b.z0 + 30, { tex: 'logic', label: 'MCP POOL', sub: 'ToolBridge · server__tool', labelDx: 8 });
    block(k, 'bm25', b.x0, b.z0 + 33, b.x1, b.z1, { tex: 'rom', label: 'BM25 INDEX', sub: 'search_tool → use_tool', labelSize: 1.8 });
    glyph(k, 'plug', b.x1 - 9, b.z0 + 20, 9);
    phyPads(k, b.x0, b.z0, b.x1, b.z0 + 30, 'w');
    k.finish(g);
    const ports = [];
    for (let i = 0; i < MCP_N; i++) {
      const z = b.z0 + 12 + i * 6;
      ports.push([0, 1, 2].map(j => lampMesh(g, [b.x0 + 14 + j * 4.4, DIE_Y + 1.1, z], 0.9, [MAT.amberlamp, FLUID.ok, FLUID.err][j])));
    }
    // the servers live outside the package, on the plinth: small boxes with their names
    const kx = new Kit({ tone: 0.5 }), boxes = [], names = (TRACE.context?.mcp || []).map(m => m.name);
    MCP_SERVERS.forEach(n => { if (!names.includes(n)) names.push(n); });
    for (let i = 0; i < MCP_N; i++) {
      const bx = -392 + i * 46, bz = 214;
      kx.box(36, 12, 20, { p: [bx, 0, bz], rr: 1.6, b: 0.5, color: MAT.paper, tone: 0.5 });
      for (let j = 0; j < 4; j++) kx.line([[bx - 15, 3 + j * 2, bz + 10.05], [bx + 2, 3 + j * 2, bz + 10.05]], 'lo');
      kx.tube([[b.x0 + 6, DIE_Y + 0.6, b.z0 + 12 + i * 6], [b.x0 - 6, DIE_Y + 2, b.z0 + 12 + i * 6], [LOCAL.sub[0] + 10, SUB_Y + 2, 150 + i * 8], [bx, 4, bz - 14], [bx, 6, bz - 10]], 0.75, { color: MAT.graphite, bend: 6, radial: 7 });
      boxes.push(lampMesh(world, [bx + 12, 9, bz + 10.3], 0.9, FLUID.ok));
      if (names[i]) silk(names[i], bx - 15, bz - 5, { y: 12.08, size: 2, align: 'left', alpha: 0.65, parent: world });
    }
    kx.finish(world);
    silk('MCP SERVERS · 外部进程', -392 - 18, 236, { y: 0.1, size: 2.4, align: 'left', alpha: 0.6, parent: world });
    return { ports, boxes, boot: [0, 0, 0], online: [false, false, false], fail: [false, false, false], heart: [0, 0, 0], call: [0, 0, 0] };
  },
  update(S, t, dt) {
    const R = S.refs;
    for (let i = 0; i < MCP_N; i++) {
      R.boot[i] = Math.max(0, R.boot[i] - dt); R.heart[i] = Math.max(0, R.heart[i] - dt); R.call[i] = Math.max(0, R.call[i] - dt);
      const [a, b2, c] = R.ports[i];
      setLamp(a, R.boot[i] > 0 ? (Math.sin(t * 10) > 0 ? 0.9 : 0.2) : 0.04);
      setLamp(b2, R.online[i] ? 0.5 + (R.heart[i] > 0 ? 0.4 * Math.sin(R.heart[i] * 12) : 0) + (R.call[i] > 0 ? 0.4 * Math.sin(t * 20) : 0) : 0.04);
      setLamp(c, R.fail[i] ? 0.9 : 0.04);
      setLamp(R.boxes[i], R.online[i] ? 0.45 + 0.35 * Math.sin(t * 3 + i) + (R.call[i] > 0 ? 0.3 : 0) : R.fail[i] ? 0.8 : 0.03, R.fail[i] ? FLUID.err : FLUID.ok);
    }
  },
});
const mcpIdx = server => { const names = (TRACE.context?.mcp || []).map(m => m.name); MCP_SERVERS.forEach(n => { if (!names.includes(n)) names.push(n); }); return names.indexOf(server); };

// ── memory: experimental, off unless asked for; MEMORY.md files plus a search index ──
station('mem', {
  name: '记忆', role: '记忆 · memory_*', color: FLUID.cache,
  desc: '实验功能，默认关闭（--experimental-memory 或 GROK_MEMORY=1）。打开后：第一回合先在全局和本仓库的 MEMORY.md、会话日志里做一次检索（全文 + 向量），前 6 条作为 <memory-context> 并进系统消息；压缩前和会话结束时各写一次日志（一次不带工具的模型调用，只取最近约 20 条消息）；攒够 4 小时、3 份新日志再"做梦"，把日志整合进 MEMORY.md。这次会话的开关状态取自真实的 prompt_context.json。',
  work: focusAt('mem', 32, 30), pin: pinAt('mem', 4, 4),
  build(S, g) {
    const b = bc('mem'), k = new Kit({ tone: 0.5 }), on = !!TRACE.context?.memory;
    block(k, 'mem', b.x0, b.z0, b.x1, b.z1, { tex: on ? 'logic' : 'grid', label: 'MEMORY', sub: on ? 'flush · dream · search' : 'off · experimental', labelSize: 2 });
    k.finish(g);
    const kg = new Kit({ tone: 0.6 }); glyph(kg, 'db', b.x1 - 8, b.z0 + 33, 9); kg.finish(g);
    const lamps = ['FLUSH', 'DREAM', 'SAVED', 'SEARCH'].map((s, i) => { const z = b.z0 + 16 + i * 11; silk(s, b.x0 + 9, z + 0.5, { y: DIE_Y + 0.56, size: 1.6, align: 'left', weight: 600, alpha: 0.68 }); return lampMesh(g, [b.x0 + 5.4, DIE_Y + 1.1, z], 1, FLUID.cache); });
    return { lamps, on, k: [0, 0, 0, 0] };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 0.4); setLamp(m, (R.on ? 0.05 : 0.01) + R.k[i]); }); },
});

// ── ~/.grok: the storage everything persists to, including the trace this drawing replays ──
const STORE = { x0: -312, x1: -176, z0: 153, z1: 179 };
const STORE_PARTS = [['sessions/', 'events · updates · chat_history'], ['memory/', 'MEMORY.md · index.sqlite'], ['skills/ · hooks/', 'SKILL.md · scripts'], ['checkpoints', 'compaction · rewind']];
station('store', {
  name: '~/.grok', role: '本地存储 · 会话记录 · 记忆 · 检查点', color: FLUID.text,
  desc: '所有落盘的东西：每个会话一个目录（events.jsonl、updates.jsonl、chat_history.jsonl、signals.json、system_prompt.txt、prompt_context.json、压缩检查点、回退快照），记忆文件和索引，技能、hook 脚本和配置。这张图回放的就是 sessions/ 里那几个文件。',
  work: [(STORE.x0 + STORE.x1) / 2, DIE_Y + 26, STORE.z1 + 20], pin: [STORE.x0 + 6, SUB_Y + 12, STORE.z0 + 4],
  build(S, g) {
    const k = new Kit({ tone: 0.5 }), w = STORE.x1 - STORE.x0, d = STORE.z1 - STORE.z0, cx = (STORE.x0 + STORE.x1) / 2, cz = (STORE.z0 + STORE.z1) / 2;
    k.box(w, 3.4, d, { p: [cx, SUB_Y, cz], rr: 1, b: 0.4, color: 0xa3a5ad, tone: 0.55 });
    for (let x = STORE.x0 + 2; x < STORE.x1 - 1; x += 2.6) for (const z of [STORE.z0 - 0.6, STORE.z1 + 0.6]) k.box(1.1, 1.6, 1.4, { p: [x, SUB_Y, z], color: MAT.steel, tone: 0.4 });
    k.finish(g);
    silk('~/.grok  本地存储', STORE.x0 + 3, STORE.z0 + 3.8, { y: SUB_Y + 3.46, size: 2.4, align: 'left', weight: 700, alpha: 0.85 });
    const pw = (w - 8) / STORE_PARTS.length, lamps = [];
    STORE_PARTS.forEach(([a, b2], i) => {
      const x = STORE.x0 + 4 + i * pw;
      silk(a, x + 4, STORE.z0 + 13.5, { y: SUB_Y + 3.46, size: 1.9, align: 'left', weight: 600, alpha: 0.8 });
      silk(b2, x + 4, STORE.z0 + 18.5, { y: SUB_Y + 3.46, size: 1.25, align: 'left', alpha: 0.6 });
      lamps.push(lampMesh(g, [x + 2, SUB_Y + 4, STORE.z0 + 13], 0.7, [FLUID.text, FLUID.cache, 0xc27bd1, FLUID.context][i]));
    });
    return { lamps, k: [0, 0, 0, 0] };
  },
  update(S, t, dt) { const R = S.refs; R.lamps.forEach((m, i) => { R.k[i] = Math.max(0, R.k[i] - dt * 2); setLamp(m, 0.08 + R.k[i] * 0.9); }); },
});
const storeTouch = i => { ST.store.refs.k[i] = 1; };

// ── the ACP client: the terminal or IDE on the other end of stdio ──
station('client', {
  name: 'ACP 客户端', role: '你 · 终端界面 / IDE', color: FLUID.user,
  desc: '终端界面或编辑器插件。你的话从这里发出去，模型的正文在这里显示；要你批准、回答问题、批准计划的时候，也是它弹窗问你。',
  work: [-432, DIE_Y + 30, -40], pin: [-432, 22, -96],
  build(S, g) {
    const x = -433, z = -74, k = new Kit({ tone: 0.55 });
    k.box(26, 3, 44, { p: [x, 0, z], rr: 2, b: 0.6, color: MAT.pale, tone: 0.5 });
    // the monitor stands on the die side and faces out, toward whoever sits at the client
    k.box(3, 22, 34, { p: [x + 6, 3, z], rr: 1.2, b: 0.5, color: MAT.paper, tone: 0.6 });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) k.box(2.2, 0.7, 2.6, { p: [x - 10 + i * 3, 3, z - 13 + j * 3.2], rr: 0.3, color: MAT.pale, tone: 0.6 });
    // stdio: a cable from the client to the ACP pads on the die's west edge
    const a = bc('acp');
    k.tube([[x + 12, 2, z + 10], [LOCAL.sub[0] - 4, 4, a.cz], [LOCAL.sub[0] + 8, SUB_Y + 2, a.cz], [a.x0 + 2, DIE_Y + 0.8, a.cz]], 0.8, { color: MAT.graphite, bend: 6, radial: 7 });
    k.finish(g);
    const scr = makeScreen(31, 18, 14, (c, w, h, s, P) => {
      const rows = 9, lh = h / (rows + 0.6); c.fillStyle = P.screenInk; c.textBaseline = 'top';
      (s.lines || []).slice(-rows).forEach((l, i) => { c.globalAlpha = l.dim ? 0.6 : 1; c.fillStyle = l.gold ? '#c99a00' : P.screenInk; c.font = `${l.dim ? 400 : 500} ${lh * 0.66}px ${FONT_MONO}`; c.fillText(fitText(c, l.t, w * 0.94), w * 0.03, lh * (0.3 + i)); });
      c.globalAlpha = 1;
    });
    scr.mesh.position.set(x + 4.44, 14, z); scr.mesh.rotation.y = -Math.PI / 2; g.add(scr.mesh); scr.paint({ lines: [] });
    return { scr, lines: [] };
  },
});
