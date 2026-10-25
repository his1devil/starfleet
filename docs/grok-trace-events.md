# Grok Build trace 事件探索（草稿 v0）

源码：`~/Development/personal/grok-build`（SOURCE_REV 2a28b4a8，二进制 0.2.106）。
真实数据：`~/.grok/sessions/<urlencoded-cwd>/<session-id>/`，共 9 个会话，66 个回合，29 次工具调用。

## 0. 数据源

| 来源 | 位置 | 粒度 / 特点 |
|---|---|---|
| 会话生命周期事件 | `events.jsonl` | `{ts, type, ...}`。turn/loop/phase/first_token/tool/permission/mcp。**phase_changed 每个流式 chunk 打一次**（13.5k 条），可当 token 节拍 |
| ACP 会话更新 | `updates.jsonl` | `{timestamp, method, params:{sessionId, update, _meta}}`。method = `session/update`（ACP 标准）或 `_x.ai/session/update`（xAI 扩展）。**chunk 已合并**：每段思考/正文一条 |
| 更新元数据 | `params._meta` / `update._meta` | `eventId`(会话内单调序号) `agentTimestampMs` `promptId` `totalTokens`(当前上下文占用) `streamStartMs` `turnStartMs` `updateType` `chunkId`；工具上的 `x.ai/tool:{name, kind, namespace, label, read_only, input}` |
| 模型视角对话 | `chat_history.jsonl` | `system / user / reasoning / assistant(model_id) / tool_result(tool_call_id)` |
| 会话汇总 | `summary.json` | 标题、cwd、git 远端/分支/commit、`agent_name`、`next_trace_turn`、模型 |
| 会话指标 | `signals.json` | turnCount、toolCallCount、errorCount、compactionCount、contextTokensUsed/contextWindowTokens、avg/min/max TTFT、ITL p50/p99/max、totalChunkCount、doomLoop*、inferenceIdleTimeouts、agent/human lines added/removed、filesTouched、peakRssBytes、longPausesCount |
| 回退点 | `rewind_points.jsonl` | 每个 prompt_index 一条，含改动前后文件快照 |
| 其他 | `prompt_context.json` `resources_state.json` `terminal/<tool_call_id>.log` `compaction_checkpoints/` `recap_requests/` | 提示词构成、工具参数、命令完整输出、压缩快照 |
| 进程内存 | `~/.grok/memtrace/<ts>-<pid>.jsonl` | 每 30s 一次 `{kind:sample, footprint_bytes, rss_bytes, alloc{…}}` |
| 全局日志 | `~/.grok/logs/unified.jsonl`、`hooks.log`、`leader.log` | tracing 日志 |
| 实时流 | ACP stdio / `grok agent serve`(WS) / `~/.grok/leader.sock`(共享 leader，多客户端实时镜像) | chunk 级粒度 |
| headless | `grok -p "…" --output-format streaming-json` | 原生 ACP 更新的 NDJSON；另有 `streaming-messages-json`（Anthropic Messages 线格式） |
| 云端 per-turn trace（xAI 内部） | GCS 上传 | `metadata.json` `turn_result.json` `permission_decisions.json` `turn_messages.json` `tool_definitions.json` `upload_manifest.json` + afterStateHistory |

## 1. 事件分层

### L0 采样器（进程内，`xai-grok-sampler/src/events.rs`，不落盘）
StreamStarted · FirstToken · ChannelToken{Text|Reasoning} · ToolCallDelta · ResponseStarted(message_id, input/cache tokens) · ReasoningCompleted(signature) · Completed(metrics) · Retrying(kind, doom_loop_triggers, aborted_at_chunk) · Failed · ModelMetadata …

### L1 会话生命周期（`events.jsonl`，`xai-file-utils/src/events/types.rs`，共 57 种，本机只出现过 15 种）
- 回合：turn_started · loop_started · phase_changed · first_token · tool_started · tool_completed(tool_call_id, source) · permission_requested · permission_resolved(decision, wait_ms) · turn_ended(outcome, cancellation_*) · interjected(source=direct|queue) · yolo_toggled
- 收尾闸门：todo_gate_fired/exhausted · laziness_classifier_fired(category, confidence)/aborted · laziness_nudge_fired
- Goal 模式：goal_auto_paused · goal_classifier_* · goal_planner_* · goal_strategist_* · goal_summarizer_* · goal_role_model_* · goal_verifier_skeptic_verdict · goal_verifier_aggregate_verdict · goal_premature_stop_detected
- MCP：mcp_config_resolved · mcp_managed_config_result · mcp_oauth_discovery_timeout · mcp_server_starting/connected(tools[])/failed · mcp_tool_registration_failed · mcp_init_completed/cancelled · mcp_tool_call_started/completed · mcp_transport_error/decode_error/reconnect · mcp_auth_retry · mcp_health_check · mcp_server_toggled

phase 取值：`waiting_for_model` → `streaming_reasoning` → `streaming_text` / `tool_execution` → `permission_prompt`

### L2 ACP 标准 `session/update`
user_message_chunk · agent_thought_chunk · agent_message_chunk · tool_call · tool_call_update · plan · available_commands_update · current_mode_update · session_info_update

### L3 xAI 扩展 `_x.ai/session/update`（`xai-grok-shell/src/extensions/notification.rs`）
- 流/响应：response_started · reasoning_completed · response_completed · tool_call_delta_chunk · turn_completed(stop_reason, usage)
- 上下文：auto_compact_started/completed/failed/cancelled · auto_continue_completed · compaction_checkpoint · memory_flush_started/completed · memory_dream_completed · memory_session_saved · memory_files
- 多智能体：subagent_spawned/progress/finished · workflow_updated · goal_updated
- 后台：task_backgrounded · task_completed · monitor_event · scheduled_task_created/fired/deleted
- 交互：pending_interaction(permission|question|plan_approval) · interaction_resolved · diff_review · feedback_request
- 容错：retry_state(retrying|exhausted|failed) · auto_recovery_started/exhausted
- hooks：hook_execution · hook_annotation · hooks_changed · plugins_changed · plugin_updates_installed
- 元信息：session_summary_generated · session_recap · session_recap_unavailable · rewind_marker · model_changed · model_auto_switched · image_compressed · image_dropped · relay_sync_status

### L4 Hooks（`xai-grok-hooks/src/event.rs`）
session_start · user_prompt_submit · pre_tool_use · post_tool_use · post_tool_use_failure · permission_denied · stop · stop_failure · notification · subagent_start · subagent_stop · pre_compact · post_compact · session_end

### L5 反向请求（agent → client，阻塞）
session/request_permission · x.ai/ask_user_question · x.ai/exit_plan_mode

### L6 带外通知（节选）
x.ai/session/prompt_complete · x.ai/queue/{changed,interject,edit,remove,reorder,clear} · x.ai/session/interjection · x.ai/yolo_mode_changed · x.ai/git_head_changed · x.ai/fs_notify · x.ai/mcp/{init_progress,servers_updated,tools_changed,server_status} · x.ai/follow_ups · x.ai/session/usage · x.ai/billing · x.ai/session/fork

### L7 tracing / telemetry（默认不落地，本机 telemetry=Disabled）
- OTLP span（内部，需 xAI 凭据）：session › agent.prompt › session.handle_prompt › session.process_conversation_turn(ttft_ms, tokens, stop_reason) › http.*_stream / tools.execute › tool.execution › tool.<name>；另有 session.compact(_inner)、subagent.handle_request、hooks.dispatch › hook.run、mcp.call_tool、tool.decision、skill.activated
- 产品埋点 116 个（grok-shell-<name>）：turn_completed、model_response_received、tool_call_completed、permission_decision、compaction_triggered/completed、subagent_launched/completed、doom_loop_recovery、prompt_latency …
- **外部 OTEL 流（免凭据）**：`GROK_EXTERNAL_OTEL=1 OTEL_LOGS_EXPORTER=otlp|console` → 18 个日志事件 `grok_code.{session_start, session_end, user_prompt, turn_completed, api_request, api_error, tool_result, tool_decision, mcp_server_connection, permission_mode_changed, skill_activated, plugin_loaded, compaction, subagent, auth, internal_error, model_switched, contextual_tip}` + 6 个计数器；与 Claude Code / Codex 的 OTel 思路同构 → 跨 agent 统一接入口
- `~/.grok/logs/unified.jsonl` 的回合计时：shell.prompt.queued · shell.handle_prompt.start/done · shell.turn.build_request_done · shell.turn.tool_prep_done · shell.turn.inference_start · shell.turn.inference_done(ttft_ms, itl_p50_ms, attempts, prompt/cached/completion/reasoning tokens, tokens_per_sec) · shell.tool.exec_done · inference_retry/failed · action_stationarity_stop/nudge
- 调试开关：`--debug`(~/.grok/debug/<sid>.txt 全量) · `GROK_LOG_SAMPLING=1`(sampling.jsonl 每个原始 SSE chunk) · `GROK_INSTRUMENTATION=chrome`(chrome trace，仅启动/MCP)
- **`grok trace <sid> --local`** → `~/.grok/trace-exports/<sid>.tar.gz` = 整个会话目录 + trace_config.json + export_metadata.json —— 可直接作为可视化的输入/分享格式

## 2. 一个回合的真实时序（来自 updates.jsonl + events.jsonl 合并）

```
turn_started(turn_number, model_id, yolo_mode)
user_message_chunk
hook_execution(user_prompt_submit)
loop_started(0)
  phase waiting_for_model            ← 请求在途
  first_token                        ← TTFT（实测 3~33s）
  phase streaming_reasoning ×N       ← 每 chunk 一次
  agent_thought_chunk(合并全文)
  ┌ phase streaming_text ×N → agent_message_chunk           （直接作答）
  └ phase tool_execution → tool_started → tool_call → tool_call_update(title/kind/locations/rawInput)
      → hook(pre_tool_use) → phase permission_prompt → permission_requested
      → permission_resolved(allow|deny|cancelled, wait_ms)
      → phase tool_execution → tool_call_update(in_progress→completed|failed, content, rawOutput)
      → hook(post_tool_use | post_tool_use_failure) → tool_completed(duration_ms, outcome)
loop_started(1) …（工具结果回灌，再发一次请求）
hook_execution(stop)
turn_ended(outcome, cancellation_category)
turn_completed(stop_reason, usage{input/output/cachedRead/reasoning tokens, modelCalls, apiDurationMs, modelUsage})
```

拒绝/取消分支：permission_resolved(deny|cancelled) → tool_call_update(failed) → turn_ended(cancelled, permission_rejected|permission_cancelled)。

## 3. 各流程状态机（源码核对）

**工具调用（每个）**：tool_call(pending, kind=other, title=原始函数名, `_meta.x.ai/tool`) → tool_call_update(真实 title/kind/locations/diff/rawInput) → [pending_interaction(permission) → interaction_resolved] → hook(pre_tool_use) → bash 每段输出一条 tool_call_update(in_progress, 增量 rawOutput) → tool_call_update(completed|failed) → hook(post_tool_use) → todo_write 额外发 ACP `plan`。

**压缩 compaction**：阈值默认 85%（env/模型/会话/远端可覆盖）。触发点 4 个：每轮采样前估算超阈值 / 工具结果回灌后超 100% / 采样报上下文溢出（压缩后重发）/ 切到小窗口模型。手动 `/compact [补充说明]`。
自动序列：auto_compact_started(tokens_used, window, %) → [并发 memory_flush_started/completed] → PreCompact hook → 摘要请求（9 段 `<summary>` 模板，最多 3 次，<500 字视为退化重试；溢出时 verbatim→fitted→lossy 逐级降级）→ 写 compaction_checkpoints/{uuid}.json + 落盘 compaction_checkpoint → 替换对话、重置 todo / plan mode → PostCompact hook → auto_compact_completed(before/after, elapsed) | auto_compact_failed(error) → 回合继续。失败会按原因进入抑制期。auto_compact_cancelled / auto_continue_completed 当前无发送方。

**子 agent**：工具 `spawn_subagent`（type: general-purpose / explore / plan / 自定义；background 默认 true；capability_mode；isolation=worktree；resume_from），深度上限 1。
序列：父 tool_call → subagent_spawned（在子 prompt 发出之前）→ 子会话自己的 session/update 流（session id = subagent_id）→ subagent_progress（每 2s 有变化才发 + 8s 心跳，不落盘）→ subagent_finished(completed|failed|cancelled, tool_calls, turns, duration, tokens, output)。前台超 600s 自动转后台；后台完成后自动唤醒父会话（合成 prompt `subagent-completed-{id}` → 新回合）。

**Workflow（Rhai 脚本）**：工具 `workflow` / `/workflow` / `/deep-research`；agent()/parallel()/phase()/log()。workflow_updated(active, phases[]) → 每个 phase 一次更新 → agent() 产生带 workflow_run_id 的 subagent_* 事件 → 终态 complete | *_paused | blocked | budget_limited | cancelled | failed | interrupted → 合成 prompt 唤醒父会话。

**Goal 模式**：`/goal <目标> [--budget N]` / 工具 update_goal。goal_updated(executing) → [planner 子 agent] → 多轮执行 → 评估器判 Continue / CandidateComplete → 验证：N 个（默认 3）"skeptic" 子 agent 并行 → achieved → summarizer 子 agent → complete；未达成记 gaps，周期性跑 strategist；各类暂停：back_off / no_progress / blocked / infra / budget_limited / user_paused。

**后台任务 / monitor / 定时**：run_terminal_command(background) → task_backgrounded → task_completed(exit_code, will_wake)；monitor → task_backgrounded(monitor_description) → 每行 stdout 一条 monitor_event（限流、不落盘）→ task_completed；scheduler_create(≥60s) → scheduled_task_created → 每次触发 scheduled_task_fired（后台=派一个 loop 子 agent）→ scheduled_task_deleted。完成后可自动唤醒（合成 prompt `task-completed-{id}`）。

**记忆**（opt-in）：memory_flush_started → 一次无工具模型调用 → 质量闸 → memory_flush_completed(written|nothing|duplicate|rejected…)；会话结束 → SessionEnd hook → memory_session_saved → dream（≥4h 且 ≥3 个会话）→ memory_dream_completed。

**重试 / doom-loop / 自救**：采样器最多重试 15 次（2/4/8/16→30s 退避），每次 retry_state(retrying)；终态 retry_state(exhausted|failed)。服务端 doom_loop_check（thinking 通道尾部重复）→ 中途掐断、重采样最多 2 次 → 同样表现为 retrying。客户端"原地打转"守卫：同一工具签名 8 次 → 提醒，16 次 → 结束回合。auto_recovery_started/exhausted 只用于带 completion_requirement 的 agent 定义。

**Rewind / recap / 标题**：每回合末写 rewind 点；rewind 执行 → 回滚文件、截断对话（跨压缩边界时用 checkpoint 重建）→ 落盘 rewind_marker。recap：`/recap` 或离开 30s 后回来自动生成 → session_recap(summary, auto)。标题：首个 prompt 后一次 LLM 调用 → session_summary_generated + session_info_update。

**模式**：enter_plan_mode → current_mode_update(plan)；exit_plan_mode → pending_interaction(plan_approval) → 批准后 current_mode_update(default)。yolo / always-approve 不发 mode 更新。

## 3b. 工具目录（默认 grok-build 预设）
| 模型看到的名字 | ACP kind |
|---|---|
| run_terminal_command | execute |
| read_file | read |
| search_replace / write | edit（带 diff） |
| grep / web_search | search |
| web_fetch | fetch |
| todo_write | think（+ plan 更新） |
| list_dir、spawn_subagent、get/wait/kill_command_or_subagent、monitor、scheduler_*、search_tool/use_tool(MCP)、update_goal、workflow、enter/exit_plan_mode、ask_user_question、memory_*、lsp、image_gen/edit/video | other |
MCP 动态工具命名 `server__tool`；服务端托管的 web_search/x_search 直接以 in_progress 到达（`_meta.backend=true`）。更细的语义看 `_meta.x.ai/tool.kind`（ask_user / execute / read / write / search …）。其他预设：codex(apply_patch)、opencode、hashline、explore、plan。

## 4. 用量字段（turn_completed.usage = PromptUsage）
inputTokens(含缓存读) · outputTokens · totalTokens · cachedReadTokens · cacheCreation(headless 独立桶) · reasoningTokens · modelCalls · apiDurationMs · cost(不可信时会被清掉) · modelUsage{<model_id>: 同上} · numTurns(loop 轮数) · usageIsIncomplete

## 5. 设计草案：DSP 映射（待讨论）

核心洞察：agent loop（请求 → 流式 → 工具 → 结果回灌 → 再请求）本身就是一条闭环产线，DSP 的传送带/分拣器/制造台天然对得上。

两级视图（对应 DSP 的星图 ↔ 行星）：
- 星系视图（多会话总览）：恒星 = 模型；行星 = 会话；卫星 = 子 agent；运输船 = 模型请求（飞行时间 = TTFT）；射线 = token 流；戴森球 = 累计 token（长期进度）；轨道站 = MCP server。
- 行星工厂（单会话）：物流塔(用户指令/队列/插话) → 上下文装配厂(system+memory+tools+history) → 发射 → 熔炉(推理) / 制造台(正文) / 组装机(工具参数) → 分拣器(pre_tool_use hook) → 权限闸门 → 工具建筑(采矿机=read, 雷达=grep, 制造台=edit, 对撞机=bash, 星际站=web, 外星前哨=MCP, 运输船=subagent, 伊卡洛斯=ask_user) → 回流带 → 下一轮 loop。
- 蓄电池/电网 = 上下文窗口占用（_meta.totalTokens / contextWindow）；分馏塔 = compaction；储物仓 = memory flush；矩阵研究站 = turn_completed 产出。
- 物品配色借 DSP 六色矩阵：紫=推理、蓝=正文、黄=工具调用、绿=工具结果、红=错误/重试、白=摘要/压缩；用户指令=橙色货箱。
- 其他：黑雾 = doom-loop / 重试风暴；维修无人机 = auto_recovery；蓝图 = 可分享的 trace 回放码；里程碑 / 科技树 / 生产统计 = 真实指标。
