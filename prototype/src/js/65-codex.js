// ═════════════════════════ event codex: every event type grok-build can emit, and whether it has been seen ═════════════════════════
// Keys are the names in the grok-build source: events.jsonl types (L1), ACP session/update (L2),
// the _x.ai/session/update extensions (L3), hook events (L4) and the blocking reverse requests (L5).
const CODEX_LAYERS = [
  ['L1', 'events.jsonl · 会话生命周期'],
  ['L2', 'ACP 标准 session/update'],
  ['L3', 'xAI 扩展 _x.ai/session/update'],
  ['L4', 'Hook 事件'],
  ['L5', '反向请求（等你回应）'],
];
const C_TURN = '--ink', C_REQ = '--teal-f', C_THINK = '--violet-f', C_TEXT = '--blue-f', C_TOOL = '--amber-f', C_OK = '--green-f', C_ERR = '--red-f', C_USER = '--gold-f', C_PERM = '--hazard-a', C_MCP = '--teal-f', C_SYS = '--line';
// [key, layer, 中文名, station, colour]
const CODEX = [
  // L1 · turns and tools
  ['turn_started', 'L1', '回合开始', 'intake', C_TURN], ['loop_started', 'L1', '模型请求', 'pump', C_REQ], ['phase_changed', 'L1', '阶段 / chunk 节拍', 'reactor', C_REQ],
  ['first_token', 'L1', '首 token', 'reactor', C_REQ], ['tool_started', 'L1', '工具开始', 'reactor', C_TOOL], ['tool_completed', 'L1', '工具结束', 'tower', C_TOOL],
  ['permission_requested', 'L1', '权限请求', 'interlock', C_PERM], ['permission_resolved', 'L1', '权限决定', 'interlock', C_PERM], ['turn_ended', 'L1', '回合结束', 'archive', C_TURN],
  ['interjected', 'L1', '插话', 'intake', C_USER], ['yolo_toggled', 'L1', 'YOLO 开关', 'mode', C_PERM],
  // L1 · stop gates
  ['todo_gate_fired', 'L1', '待办闸门', 'verifier', C_ERR], ['todo_gate_exhausted', 'L1', '待办闸门耗尽', 'verifier', C_ERR],
  ['laziness_classifier_fired', 'L1', '偷懒判定', 'supervisor', C_ERR], ['laziness_nudge_fired', 'L1', '偷懒提醒', 'supervisor', C_ERR], ['laziness_classifier_aborted', 'L1', '偷懒判定中止', 'supervisor', C_SYS],
  // L1 · goal mode
  ['goal_auto_paused', 'L1', '目标自动暂停', 'goalboard', C_OK], ['goal_classifier_fired', 'L1', '评估器启动', 'goalboard', C_OK], ['goal_classifier_verdict', 'L1', '评估结论', 'goalboard', C_OK],
  ['goal_classifier_fail_open', 'L1', '评估失败放行', 'goalboard', C_ERR], ['goal_classifier_fail_closed', 'L1', '评估失败拦截', 'goalboard', C_ERR], ['goal_classifier_cap_reached', 'L1', '评估次数到顶', 'goalboard', C_ERR],
  ['goal_classifier_mid_turn_deferred', 'L1', '评估推迟', 'goalboard', C_SYS], ['goal_classifier_dropped_after_cap', 'L1', '超额评估丢弃', 'goalboard', C_SYS], ['goal_classifier_pending_queue_cleared', 'L1', '评估队列清空', 'goalboard', C_SYS],
  ['goal_planner_fired', 'L1', '规划员启动', 'goalboard', C_OK], ['goal_planner_completed', 'L1', '规划完成', 'goalboard', C_OK], ['goal_planner_fail_closed', 'L1', '规划失败', 'goalboard', C_ERR],
  ['goal_strategist_fired', 'L1', '策略师启动', 'goalboard', C_OK], ['goal_strategist_completed', 'L1', '策略完成', 'goalboard', C_OK], ['goal_strategist_failed', 'L1', '策略失败', 'goalboard', C_ERR],
  ['goal_strategist_contract_restore_failed', 'L1', '策略契约恢复失败', 'goalboard', C_ERR], ['goal_summarizer_fired', 'L1', '总结员启动', 'goalboard', C_OK], ['goal_summarizer_completed', 'L1', '总结完成', 'goalboard', C_OK],
  ['goal_summarizer_fail_open', 'L1', '总结失败放行', 'goalboard', C_ERR], ['goal_role_model_resolved', 'L1', '角色模型选定', 'verifier', C_OK], ['goal_role_model_fail_open', 'L1', '角色模型缺失', 'verifier', C_ERR],
  ['goal_verifier_skeptic_verdict', 'L1', '怀疑者复核', 'verifier', C_OK], ['goal_verifier_aggregate_verdict', 'L1', '复核汇总', 'verifier', C_OK], ['goal_premature_stop_detected', 'L1', '过早收工', 'supervisor', C_ERR],
  // L1 · MCP
  ['mcp_config_resolved', 'L1', 'MCP 配置解析', 'rack', C_MCP], ['mcp_managed_config_result', 'L1', '托管配置', 'rack', C_MCP], ['mcp_oauth_discovery_timeout', 'L1', 'OAuth 发现超时', 'rack', C_ERR],
  ['mcp_server_starting', 'L1', 'MCP 启动', 'rack', C_MCP], ['mcp_server_connected', 'L1', 'MCP 连接', 'rack', C_MCP], ['mcp_server_failed', 'L1', 'MCP 失败', 'rack', C_ERR],
  ['mcp_tool_registration_failed', 'L1', '工具注册失败', 'rack', C_ERR], ['mcp_init_completed', 'L1', 'MCP 就绪', 'rack', C_MCP], ['mcp_init_cancelled', 'L1', 'MCP 初始化取消', 'rack', C_SYS],
  ['mcp_tool_call_started', 'L1', 'MCP 调用开始', 'rack', C_MCP], ['mcp_tool_call_completed', 'L1', 'MCP 调用完成', 'rack', C_MCP], ['mcp_transport_error', 'L1', '传输错误', 'rack', C_ERR],
  ['mcp_transport_decode_error', 'L1', '解码错误', 'rack', C_ERR], ['mcp_transport_reconnect', 'L1', '重连', 'rack', C_MCP], ['mcp_auth_retry', 'L1', '鉴权重试', 'rack', C_MCP],
  ['mcp_health_check', 'L1', '健康检查', 'rack', C_MCP], ['mcp_server_toggled', 'L1', '服务开关', 'rack', C_SYS],
  // L2 · ACP
  ['user_message_chunk', 'L2', '用户消息', 'cab', C_USER], ['agent_thought_chunk', 'L2', '推理', 'reactor', C_THINK], ['agent_message_chunk', 'L2', '正文', 'reactor', C_TEXT],
  ['tool_call', 'L2', '工具调用', 'reactor', C_TOOL], ['tool_call_update', 'L2', '工具更新', 'tower', C_TOOL], ['plan', 'L2', '计划', 'notebook', C_TEXT],
  ['available_commands_update', 'L2', '可用命令', 'notebook', C_SYS], ['current_mode_update', 'L2', '模式切换', 'mode', C_TEXT], ['session_info_update', 'L2', '会话信息', 'sign', C_SYS],
  // L3 · stream and response
  ['response_started', 'L3', '响应开始', 'cache', C_REQ], ['reasoning_completed', 'L3', '推理结束', 'reactor', C_THINK], ['response_completed', 'L3', '响应结束', 'reactor', C_REQ],
  ['tool_call_delta_chunk', 'L3', '工具参数流', 'reactor', C_TOOL], ['turn_completed', 'L3', '回合完成', 'archive', C_TURN], ['diff_review', 'L3', '改动审阅', 'pipettor', C_OK],
  // L3 · context and memory
  ['auto_compact_started', 'L3', '压缩开始', 'rotavap', C_REQ], ['auto_compact_completed', 'L3', '压缩完成', 'rotavap', C_OK], ['auto_compact_failed', 'L3', '压缩失败', 'rotavap', C_ERR],
  ['auto_compact_cancelled', 'L3', '压缩取消', 'rotavap', C_SYS], ['auto_continue_completed', 'L3', '压缩后续跑', 'reactor', C_REQ], ['compaction_checkpoint', 'L3', '压缩存档', 'checkpoint', C_REQ],
  ['memory_flush_started', 'L3', '记忆写入开始', 'dewar', C_REQ], ['memory_flush_completed', 'L3', '记忆写入完成', 'dewar', C_OK], ['memory_dream_completed', 'L3', '记忆整合', 'dewar', C_OK],
  ['memory_session_saved', 'L3', '会话记忆保存', 'dewar', C_OK], ['memory_files', 'L3', '记忆文件', 'dewar', C_SYS],
  // L3 · multi-agent and background
  ['subagent_spawned', 'L3', '子 agent 出发', 'dock', C_MCP], ['subagent_progress', 'L3', '子 agent 进度', 'dock', C_MCP], ['subagent_finished', 'L3', '子 agent 返回', 'dock', C_OK],
  ['workflow_updated', 'L3', '工作流', 'workflow', C_THINK], ['goal_updated', 'L3', '目标更新', 'goalboard', C_OK], ['task_backgrounded', 'L3', '转后台', 'incubator', C_TOOL],
  ['task_completed', 'L3', '后台完成', 'incubator', C_OK], ['monitor_event', 'L3', '监视输出', 'incubator', C_TOOL], ['scheduled_task_created', 'L3', '定时创建', 'timer', C_USER],
  ['scheduled_task_fired', 'L3', '定时触发', 'timer', C_USER], ['scheduled_task_deleted', 'L3', '定时删除', 'timer', C_SYS],
  // L3 · interaction and recovery
  ['pending_interaction', 'L3', '等待交互', 'beacon', C_PERM], ['interaction_resolved', 'L3', '交互完成', 'beacon', C_PERM], ['feedback_request', 'L3', '反馈请求', 'notebook', C_USER],
  ['retry_state', 'L3', '重试', 'beacon', C_ERR], ['auto_recovery_started', 'L3', '自救开始', 'beacon', C_ERR], ['auto_recovery_exhausted', 'L3', '自救耗尽', 'beacon', C_ERR],
  // L3 · hooks, meta, models, media
  ['hook_execution', 'L3', 'Hook 执行', 'hooks', C_OK], ['hook_annotation', 'L3', 'Hook 批注', 'hooks', C_OK], ['hooks_changed', 'L3', 'Hook 变更', 'hooks', C_SYS],
  ['plugins_changed', 'L3', '插件变更', 'hooks', C_SYS], ['plugin_updates_installed', 'L3', '插件更新', 'hooks', C_SYS], ['session_summary_generated', 'L3', '标题生成', 'sign', C_SYS],
  ['session_recap', 'L3', '会话回顾', 'notebook', C_TEXT], ['session_recap_unavailable', 'L3', '回顾不可用', 'notebook', C_SYS], ['rewind_marker', 'L3', '回退', 'tape', C_TEXT],
  ['model_changed', 'L3', '换模型', 'reactor', C_REQ], ['model_auto_switched', 'L3', '自动换模型', 'reactor', C_REQ], ['image_compressed', 'L3', '图片压缩', 'scope', C_SYS],
  ['image_dropped', 'L3', '图片丢弃', 'scope', C_ERR], ['relay_sync_status', 'L3', '中继同步', 'antenna', C_SYS],
  // L4 · hooks
  ...HOOK_EVENTS.map(h => ['hook.' + h, 'L4', h, 'hooks', /fail|denied/.test(h) ? C_ERR : C_OK]),
  // L5 · reverse requests
  ['session/request_permission', 'L5', '请求权限', 'interlock', C_PERM], ['x.ai/ask_user_question', 'L5', '向你提问', 'radio', C_USER], ['x.ai/exit_plan_mode', 'L5', '批准计划', 'mode', C_TEXT],
];
const CODEX_BY = new Map(CODEX.map(c => [c[0], c]));
const SEEN = new Map();
function codexKeys(e) {
  const t = e.type, d = e.d || {};
  switch (t) {
    case 'turn.start': return ['turn_started'];
    case 'loop.start': return ['loop_started'];
    case 'phase': case 'k': return ['phase_changed'];
    case 'request.first_token': return ['first_token'];
    case 'tool.start': return ['tool_started'];
    case 'tool.end': return ['tool_completed'];
    case 'permission.request': return ['permission_requested', 'session/request_permission'];
    case 'permission.resolve': return ['permission_resolved'];
    case 'turn.end': return ['turn_ended'];
    case 'mcp.starting': return ['mcp_server_starting'];
    case 'mcp.connected': return ['mcp_server_connected'];
    case 'mcp.ready': return ['mcp_init_completed'];
    case 'user.message': return ['user_message_chunk'];
    case 'stream.thought': return ['agent_thought_chunk'];
    case 'stream.text': return ['agent_message_chunk'];
    case 'tool.call': return d.name === 'ask_user_question' ? ['tool_call', 'x.ai/ask_user_question'] : ['tool_call'];
    case 'tool.update': return ['tool_call_update'];
    case 'turn.completed': return ['turn_completed'];
    case 'hook': return ['hook_execution', 'hook.' + d.event];
  }
  const dot = t.indexOf('.');
  if (dot < 0) return [];
  const k = t.slice(dot + 1);
  if (k === 'pending_interaction' && d.kind === 'plan_approval') return [k, 'x.ai/exit_plan_mode'];
  return [k];
}
let codexDirty = true;
const codexFresh = new Set();
function codexSee(e) {
  for (const k of codexKeys(e)) {
    if (!CODEX_BY.has(k)) continue;
    if (!SEEN.has(k)) { codexFresh.add(k); codexDirty = true; }
    SEEN.set(k, (SEEN.get(k) || 0) + 1);
  }
}
function renderCodex(force = false) {
  const seen = CODEX.filter(c => SEEN.has(c[0])).length, total = CODEX.length;
  $('#codex-count').textContent = `${seen}/${total}`;
  $('#cov-note').textContent = `${seen} / ${total} 种`;
  $('#cov-gauge i').style.width = ((seen / total) * 100).toFixed(1) + '%';
  if ((!codexDirty && !force) || $('#codex-pane').hidden) return;
  codexDirty = false;
  $('#codex').innerHTML = CODEX_LAYERS.map(([L, title]) => {
    const items = CODEX.filter(c => c[1] === L), n = items.filter(c => SEEN.has(c[0])).length;
    return `<section><h3>${L} · ${esc(title)}<em>${n}/${items.length}</em></h3><div class="chips">${items.map(c => `<button type="button" class="chip${SEEN.has(c[0]) ? ' seen' : ''}${codexFresh.has(c[0]) ? ' flash' : ''}" data-k="${esc(c[0])}" style="--c: var(${c[4]})" title="${esc(c[0])}">${esc(c[2])}${SEEN.has(c[0]) ? ` <small>${SEEN.get(c[0])}</small>` : ''}</button>`).join('')}</div></section>`;
  }).join('');
  codexFresh.clear();
}
$('#codex').addEventListener('click', ev => {
  const b = ev.target.closest('.chip'); if (!b) return;
  const c = CODEX_BY.get(b.dataset.k); if (!c) return;
  const S = ST[c[3]], n = SEEN.get(c[0]) || 0;
  openInspector(c[2], `<p class="sub">${esc(c[1])} · <code>${esc(c[0])}</code></p>
    <dl><dt>在车里</dt><dd>${S ? `${S.n} · ${esc(S.name)}` : '—'}</dd><dt>本次出现</dt><dd>${n ? n + ' 次' : '还没出现'}</dd></dl>
    ${S ? `<p>${esc(S.desc)}</p>` : ''}${!n && SRC === 'replay' ? '<p class="sub">本机录制里没有这种事件，切到「全事件演示」能看到。</p>' : ''}`);
  if (S) focusStation(S.id, true);
});
