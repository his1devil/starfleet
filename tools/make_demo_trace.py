"""Build a synthetic grok-build session that exercises every event type the prototype knows,
in the same normalized format (ATE v1) that extract_grok_trace.py writes for real sessions.

Local sessions only ever show ~15 event types, so this script stages the rest (plan mode,
todos, every tool family, background tasks and monitors, MCP tool calls and transport errors,
interjection, todo gate, laziness nudges, subagents, workflows, goal mode with its verifiers,
compaction with memory flush, model switches, retries and doom loops, auto recovery,
schedules, recap, rewind, session end, memory dreams) with payloads shaped like the structs
in the grok-build source (xai-grok-shell extensions/notification.rs, xai-file-utils
events/types.rs, xai-grok-hooks event.rs). Every value is invented; nothing comes from a
real session.

Usage: python3 tools/make_demo_trace.py --out prototype/data/demo-trace.json
"""
import argparse
import json
import random

ap = argparse.ArgumentParser()
ap.add_argument('--out', required=True)
args = ap.parse_args()

R = random.Random(20261026)
MODEL = 'grok-code'
SESSION_ID = '0a1b2c3d-demo-4e5f-8a9b-mv01lab00001'
T0 = 1793000000000  # an arbitrary epoch in ms; only differences matter
WINDOW = 1048576


class Turn:
    def __init__(self, n, t0, chapter=''):
        self.n, self.t0, self.t, self.ev = n, t0, 0, []
        self.ctx = 0
        self.chapter = chapter

    def add(self, typ, data=None, dt=0):
        self.t += dt
        self.ev.append([int(self.t), typ, data if data is not None else {}])
        return self

    def wait(self, dt):
        self.t += dt
        return self

    def ticks(self, ch, n, ms=(28, 70)):
        for _ in range(n):
            self.t += R.uniform(*ms)
            self.ev.append([int(self.t), 'k', ch])
        return self

    def dump(self):
        return {'n': self.n, 'promptId': f'prompt-{self.n:02d}', 't0': self.t0, 'chapter': self.chapter, 'events': self.ev}


tool_seq = [0]


def hook(T, event, tool=None, runs=None, dt=30):
    runs = runs if runs is not None else [{'name': 'project/qc-check', 'status': 'success', 'ms': R.randint(8, 40)}]
    T.add('hook', {'event': event, 'tool': tool, 'runs': runs}, dt)


def request(T, i, think='', text='', r=30, t=0, ttft=(1800, 3600), cache=0.85):
    """One model request: loop_started → response_started → first token → reasoning / text streams."""
    T.add('loop.start', {'i': i}, 60)
    T.add('phase', {'phase': 'waiting_for_model'}, 5)
    inp = T.ctx + R.randint(800, 2400)
    T.add('x.response_started', {'message_id': f'msg_{T.n}_{i}', 'model': MODEL, 'input_tokens': inp,
                                 'cache_read_input_tokens': int(inp * cache), 'cache_creation_input_tokens': R.randint(200, 900)}, 120)
    T.add('request.first_token', {}, R.randint(*ttft))
    if r:
        T.add('phase', {'phase': 'streaming_reasoning'}, 5)
        T.ticks('r', r)
        T.add('x.reasoning_completed', {'signature': 'sig…'}, 20)
        T.ctx = inp + r * 3
        T.add('stream.thought', {'ctx': T.ctx, 'len': len(think), 'text': think}, 10)
    if t:
        T.add('phase', {'phase': 'streaming_text'}, 5)
        T.ticks('t', t)
        T.ctx += t * 3
        T.add('stream.text', {'ctx': T.ctx, 'len': len(text), 'text': text}, 10)
    T.add('x.response_completed', {'message_id': f'msg_{T.n}_{i}', 'stop_reason': 'end_turn' if t and not r else 'tool_use',
                                   'usage': {'input_tokens': inp, 'output_tokens': (r + t) * 3}}, 20)


def tool(T, name, kind, label, inp, title, *, out='', status='completed', perm='auto', locations=None, diff=None,
         progress=(), exit=None, ns='grok_build', read_only=True, wait_ms=None, deltas=0, dur=None, delta_name=None, extra=None):
    tool_seq[0] += 1
    tid = f'tool_demo_{tool_seq[0]:03d}'
    T.add('phase', {'phase': 'tool_execution'}, 30)
    for k in range(deltas):  # arguments streaming in before the call is complete
        T.add('x.tool_call_delta_chunk', {'tool_call_id': tid, 'tool_index': 0, 'name': delta_name or name,
                                          'arguments_delta': json.dumps(inp, ensure_ascii=False)[k * 24:(k + 1) * 24]}, 60)
    T.add('tool.start', {'name': name}, 20)
    T.ctx += 400
    T.add('tool.call', {'ctx': T.ctx, 'id': tid, 'name': name, 'kind': kind, 'ns': ns, 'label': label,
                        'readOnly': read_only, 'input': inp}, 10)
    upd = {'id': tid, 'name': name, 'title': title, 'acpKind': kind, 'input': inp}
    if locations:
        upd['locations'] = locations
    if diff:
        upd['diff'] = diff
    upd.update(extra or {})
    T.add('tool.update', upd, 40)
    if diff:
        T.add('x.diff_review', {'content': [{'type': 'diff', 'path': diff['path']}]}, 20)
    if perm and perm != 'plan':
        T.add('phase', {'phase': 'permission_prompt'}, 10)
        T.add('permission.request', {'name': name}, 10)
        human = perm.startswith('human')
        if human:
            T.add('x.pending_interaction', {'tool_call_id': tid, 'kind': 'permission'}, 10)
        decision = 'deny' if perm.endswith('deny') else 'cancelled' if perm.endswith('cancel') else 'allow'
        w = wait_ms if wait_ms is not None else (R.randint(2500, 9000) if human else R.randint(240, 320))
        T.add('permission.resolve', {'name': name, 'decision': decision, 'wait': w}, w)
        if human:
            T.add('x.interaction_resolved', {'tool_call_id': tid}, 10)
        if decision != 'allow':
            hook(T, 'permission_denied', name)
            T.add('tool.update', {'id': tid, 'name': name, 'status': 'failed',
                                  'output': f'User {"rejected" if decision == "deny" else "cancelled"} the execution for tool `{name}`'}, 30)
            hook(T, 'post_tool_use_failure', name)
            T.add('tool.end', {'name': name, 'outcome': 'rejected', 'dur': 0}, 10)
            return tid
        T.add('phase', {'phase': 'tool_execution'}, 10)
    hook(T, 'pre_tool_use', name)
    if perm == 'plan':  # exit_plan_mode is a reverse request: the client approves the plan
        T.add('x.pending_interaction', {'tool_call_id': tid, 'kind': 'plan_approval'}, 20)
        T.add('x.interaction_resolved', {'tool_call_id': tid}, wait_ms or 5200)
        T.add('acp.current_mode_update', {'mode': 'default'}, 20)
    for p in progress:
        T.add('tool.update', {'id': tid, 'name': name, 'status': 'in_progress', 'output': p}, R.randint(250, 600))
    d = {'id': tid, 'name': name, 'status': status, 'output': out}
    if exit is not None:
        d['exit'] = exit
    if diff:
        d['diff'] = diff
    T.add('tool.update', d, dur if dur is not None else R.randint(150, 700))
    T.ctx += len(out) // 2 + 200
    hook(T, 'post_tool_use' if status == 'completed' else 'post_tool_use_failure', name)
    T.add('tool.end', {'name': name, 'outcome': 'success' if status == 'completed' else 'error', 'dur': R.randint(40, 900)}, 10)
    return tid


def finish(T, out_tokens=0, calls=1, stop='end_turn'):
    hook(T, 'stop')
    T.add('turn.end', {'outcome': 'completed', 'cancel': None}, 40)
    inp = T.ctx
    usage = {'inputTokens': inp * calls // 2, 'outputTokens': out_tokens or R.randint(600, 2400), 'cachedReadTokens': int(inp * calls // 2 * 0.86),
             'reasoningTokens': R.randint(200, 900), 'modelCalls': calls, 'apiDurationMs': R.randint(9000, 40000), 'numTurns': calls}
    usage['totalTokens'] = usage['inputTokens'] + usage['outputTokens']
    T.add('turn.completed', {'stop': stop, 'usage': usage}, 20)


turns = []
t_abs = T0

# ── preamble: MCP start-up, hooks, plugins, commands, mode, memory files, relay ──
P = Turn(-1, t_abs, '开场 · MCP 启动与自检')
P.add('e.mcp_config_resolved', {'servers': [{'name': 'lab-inventory', 'transport': 'stdio', 'source': 'project'},
                                            {'name': 'docs-search', 'transport': 'http', 'source': 'user'}], 'disabled': []})
P.add('e.mcp_managed_config_result', {'server_count': 0, 'error': None}, 20)
P.add('mcp.starting', {'server': 'lab-inventory', 'transport': 'stdio'}, 30)
P.add('mcp.starting', {'server': 'docs-search', 'transport': 'http'}, 10)
P.add('e.mcp_oauth_discovery_timeout', {'server_name': 'docs-search', 'url': 'https://docs.example/mcp'}, 900)
P.add('e.mcp_server_failed', {'server_name': 'docs-search', 'transport': 'http', 'error_type': 'auth_required',
                              'error_message': 'OAuth token missing', 'duration_ms': 1200}, 300)
P.add('mcp.connected', {'server': 'lab-inventory', 'tools': 9, 'ms': 640, 'transport': 'stdio'}, 200)
P.add('e.mcp_auth_retry', {'server_name': 'docs-search', 'trigger': 'startup', 'success': True}, 700)
P.add('mcp.connected', {'server': 'docs-search', 'tools': 4, 'ms': 2900, 'transport': 'http'}, 300)
P.add('e.mcp_tool_registration_failed', {'server_name': 'docs-search', 'tool_name': 'export_pdf', 'error': 'schema rejected'}, 40)
P.add('mcp.ready', {'servers': 2, 'tools': 13, 'ms': 3100}, 40)
hook(P, 'session_start', runs=[{'name': 'global/settings', 'status': 'success', 'ms': 14}, {'name': 'project/lab-env', 'status': 'success', 'ms': 31}])
P.add('x.hooks_changed', {'hooks': 5, 'project_trusted': True, 'load_errors': []}, 40)
P.add('x.plugins_changed', {'plugins': ['lab-tools', 'qc-hooks']}, 30)
P.add('x.plugin_updates_installed', {'updates': [['qc-hooks', '1.2.0', '1.3.0']]}, 30)
P.add('acp.available_commands_update', {'commands': ['/compact', '/recap', '/goal', '/workflow', '/plan', '/model', '/rewind', '/schedule']}, 30)
P.add('acp.current_mode_update', {'mode': 'default'}, 20)
P.add('x.memory_files', {'files': [{'path': 'memory/MV-01.md', 'bytes': 2140}, {'path': 'memory/freezer.md', 'bytes': 860}]}, 30)
P.add('x.relay_sync_status', {'status': 'connected'}, 40)
turns.append(P)
t_abs += 9000

# ── turn 1: plan mode, todos, plan approval, title ──
T = Turn(1, t_abs, '计划模式与待办')
T.ctx = 9800
T.add('turn.start', {'n': 1, 'model': MODEL, 'msgs': 2})
T.add('user.message', {'text': '给样品冰柜写一个温度报警脚本：超过 -70°C 就报警。先出方案给我看。'}, 20)
hook(T, 'user_prompt_submit')
request(T, 0, think='User wants a freezer temperature alarm. They asked for a plan first, so switch to plan mode and outline steps.', r=26)
tool(T, 'enter_plan_mode', 'other', 'Plan Mode', {}, 'Enter plan mode', out='Entered plan mode.', perm=None)
T.add('acp.current_mode_update', {'mode': 'plan'}, 30)
request(T, 1, think='Read the existing probe script and the log format, then write todos.', r=22)
tool(T, 'todo_write', 'think', 'Todos', {'todos': [
    {'content': '读温度探头脚本和日志格式', 'status': 'in_progress'},
    {'content': '写 scripts/freezer_alarm.sh', 'status': 'pending'},
    {'content': '跑 shellcheck 和单元测试', 'status': 'pending'},
    {'content': '接上定时检查', 'status': 'pending'}]}, 'Update todos', out='4 todos', perm=None)
T.add('acp.plan', {'entries': [
    {'content': '读温度探头脚本和日志格式', 'status': 'in_progress', 'priority': 'high'},
    {'content': '写 scripts/freezer_alarm.sh', 'status': 'pending', 'priority': 'high'},
    {'content': '跑 shellcheck 和单元测试', 'status': 'pending', 'priority': 'medium'},
    {'content': '接上定时检查', 'status': 'pending', 'priority': 'low'}]}, 20)
request(T, 2, think='Present the plan and ask to exit plan mode.', text='方案：读探头日志 → 写报警脚本（阈值 -70°C，连续 3 次超限才报警）→ shellcheck + 测试 → 每天 8 点定时检查。', r=14, t=44)
tool(T, 'exit_plan_mode', 'other', 'Exit Plan Mode', {'plan': '4 步，见上'}, 'Exit plan mode', out='User approved the plan.', perm='plan', dur=50)
finish(T, calls=3)
T.add('x.session_summary_generated', {'session_summary': '冰柜温度报警脚本'}, 400)
T.add('acp.session_info_update', {'title': '冰柜温度报警脚本'}, 20)
turns.append(T)
t_abs += T.t + 14000

# ── turn 2: the full tool kit, a denied command, background task + monitor, MCP, interjection, gates ──
T = Turn(2, t_abs, '工具全家桶 · 审批 · 后台 · 插话 · 闸门')
T.ctx = 18200
T.add('turn.start', {'n': 2, 'model': MODEL, 'msgs': 9})
T.add('user.message', {'text': '按方案做吧。'}, 20)
hook(T, 'user_prompt_submit')
request(T, 0, think='Start with the probe script and the log directory.', r=18)
tool(T, 'read_file', 'read', 'Read', {'target_file': 'scripts/probe.sh'}, 'Read `scripts/probe.sh`', locations=['scripts/probe.sh'],
     out='1→#!/usr/bin/env bash\n2→# reads /dev/probe0 every 10 s\n3→read_temp() { awk \'{print $2}\' /dev/probe0; }\n4→log() { echo "$(date +%T) $1" >> logs/freezer.log; }')
tool(T, 'list_dir', 'list', 'List Files', {'target_directory': 'logs'}, 'List `logs`', locations=['logs'], out='freezer.log\nfreezer.log.1\nfreezer.log.2.gz')
tool(T, 'grep', 'search', 'Search', {'pattern': 'ALARM|threshold|-70', 'path': '.', '-i': True}, 'ALARM|threshold|-70', out='found 12 matches')
tool(T, 'read_file', 'read', 'Read', {'target_file': 'scripts/alarm.cfg'}, 'Read `scripts/alarm.cfg`', locations=['scripts/alarm.cfg'], status='failed',
     out='Error: scripts/alarm.cfg does not exist.')
request(T, 1, think='No config file. Look up common -80 freezer alarm thresholds, then fetch the vendor note.', r=20)
tool(T, 'web_search', 'search', 'Web Search', {'query': 'ultra-low freezer alarm threshold -80C best practice'}, 'freezer alarm threshold', ns='backend',
     out='5 results · 推荐告警线 -70°C，连续超限 3 次再报警')
tool(T, 'web_fetch', 'fetch', 'Fetch', {'url': 'https://example.org/ult-freezer-alarms'}, 'Fetch example.org/ult-freezer-alarms', out='HTTP 200 · 18.4 KB · 提取正文 3 段')
request(T, 2, think='Write the alarm script.', r=16)
tool(T, 'write', 'edit', 'Write', {'file_path': 'scripts/freezer_alarm.sh'}, 'Write `scripts/freezer_alarm.sh`', locations=['scripts/freezer_alarm.sh'], read_only=False,
     perm='human-allow', deltas=4, diff={'path': 'scripts/freezer_alarm.sh', 'old': '',
     'new': '#!/usr/bin/env bash\nset -euo pipefail\nLIMIT=-70\nHITS=0\nwhile read -r t; do\n  if (( t > LIMIT )); then HITS=$((HITS+1)); else HITS=0; fi\n  (( HITS >= 3 )) && notify "freezer at ${t}°C"\ndone'})
tool(T, 'run_terminal_command', 'execute', 'Run Command', {'command': 'shellcheck scripts/freezer_alarm.sh && bats test/alarm.bats'}, 'Execute `shellcheck … && bats …`',
     read_only=False, progress=['shellcheck: ok', '1..4', 'ok 1 below limit stays quiet', 'ok 2 three hits raise the alarm'],
     out='exit: 0\n1..4\nok 1 below limit stays quiet\nok 2 three hits raise the alarm\nok 3 resets after a cold reading\nok 4 notify called once', exit=0)
tool(T, 'run_terminal_command', 'execute', 'Run Command', {'command': 'rm -rf logs/*.gz'}, 'Execute `rm -rf logs/*.gz`', read_only=False, perm='human-deny')
# a background tail with a monitor attached
tid = tool(T, 'monitor', 'other', 'Monitor', {'command': 'tail -f logs/freezer.log', 'description': '盯冰柜温度日志'}, 'Monitor `tail -f logs/freezer.log`',
           out='started in background as task bg-7', perm='auto', dur=120)
T.add('x.task_backgrounded', {'tool_call_id': tid, 'task_id': 'bg-7', 'command': 'tail -f logs/freezer.log', 'cwd': '~/lab/mv01',
                              'output_file': '.grok/tasks/bg-7.log', 'monitor_description': '盯冰柜温度日志', 'description': None}, 40)
for line in ['08:00:10 -79.6', '08:00:20 -79.4', '08:00:30 -71.2', '08:00:40 -69.8']:
    T.add('x.monitor_event', {'task_id': 'bg-7', 'description': '盯冰柜温度日志', 'event_text': line}, 900)
# the user cuts in mid-turn
T.add('e.interjected', {'source': 'direct', 'image_count': 0, 'redirect_kind': 'interjection'}, 600)
T.add('user.message', {'text': '插一句：报警阈值改成 -72°C。'}, 20)
hook(T, 'user_prompt_submit')
request(T, 3, think='User interjected: change the limit to -72. Edit the script.', r=14, ttft=(1200, 2000))
tool(T, 'search_replace', 'edit', 'Edit', {'file_path': 'scripts/freezer_alarm.sh'}, 'Edit `scripts/freezer_alarm.sh`', locations=['scripts/freezer_alarm.sh'],
     read_only=False, diff={'path': 'scripts/freezer_alarm.sh', 'old': 'LIMIT=-70', 'new': 'LIMIT=-72'}, out='1 replacement')
T.add('x.task_completed', {'task_snapshot': {'task_id': 'bg-7', 'command': 'tail -f logs/freezer.log', 'exit_code': 0, 'completed': True,
                                             'explicitly_killed': True}, 'will_wake': False}, 400)
# an MCP tool from the lab inventory server, with a transport hiccup on the way
tid = tool(T, 'lab-inventory__find_sample', 'other', 'lab-inventory', {'query': 'freezer probe spare'}, 'lab-inventory · find_sample', ns='mcp',
           out='probe P-12 · 抽屉 3 · 剩 2 个', dur=60)
T.add('e.mcp_tool_call_started', {'server_name': 'lab-inventory', 'tool_name': 'find_sample', 'call_id': tid, 'timeout_sec': 60}, 20)
T.add('e.mcp_transport_error', {'server_name': 'lab-inventory', 'tool_name': 'find_sample', 'error': 'broken pipe'}, 300)
T.add('e.mcp_transport_reconnect', {'server_name': 'lab-inventory', 'success': True, 'error': None}, 500)
T.add('e.mcp_tool_call_completed', {'server_name': 'lab-inventory', 'tool_name': 'find_sample', 'call_id': tid, 'duration_ms': 1180,
                                    'success': True, 'is_timeout': False, 'error': None, 'reconnect_attempted': True, 'auth_retry_attempted': False}, 400)
T.add('e.mcp_transport_decode_error', {'server_name': 'lab-inventory', 'error': 'unexpected trailing bytes', 'sample': '{"jsonrpc":"2.0",…'}, 200)
T.add('e.mcp_health_check', {'server_name': 'lab-inventory', 'healthy': True, 'client_state': 'ready'}, 200)
# trying to stop with an open todo, then a premature stop: both gates push it back to work
request(T, 4, think='Done, wrap up.', text='脚本写好了。', r=8, t=10)
T.add('e.todo_gate_fired', {'fires': 1, 'pending': 1, 'in_progress': 0, 'reason': 'pending_todos'}, 60)
request(T, 5, think='The schedule todo is still open; mark progress and continue.', r=12)
tool(T, 'todo_write', 'think', 'Todos', {'todos': [
    {'content': '读温度探头脚本和日志格式', 'status': 'completed'},
    {'content': '写 scripts/freezer_alarm.sh', 'status': 'completed'},
    {'content': '跑 shellcheck 和单元测试', 'status': 'completed'},
    {'content': '接上定时检查', 'status': 'in_progress'}]}, 'Update todos', out='4 todos', perm=None)
T.add('acp.plan', {'entries': [
    {'content': '读温度探头脚本和日志格式', 'status': 'completed', 'priority': 'high'},
    {'content': '写 scripts/freezer_alarm.sh', 'status': 'completed', 'priority': 'high'},
    {'content': '跑 shellcheck 和单元测试', 'status': 'completed', 'priority': 'medium'},
    {'content': '接上定时检查', 'status': 'in_progress', 'priority': 'low'}]}, 20)
request(T, 6, think='I could leave scheduling to the user.', text='剩下的定时检查你可以自己加。', r=8, t=12)
T.add('e.laziness_classifier_fired', {'model_id': MODEL, 'category': 'deferred_work', 'confidence': 0.84}, 80)
T.add('e.laziness_nudge_fired', {'model_id': MODEL, 'category': 'deferred_work', 'nudges_remaining': 1}, 30)
request(T, 7, think='Nudged: finish the schedule myself next turn after asking the time.', r=10)
tool(T, 'ask_user_question', 'ask_user', 'Ask User', {'questions': [{'question': '每天几点检查？', 'options': [{'label': '08:00'}, {'label': '20:00'}]}]},
     'Ask 1 question', perm='auto', dur=6400, out='User has answered your questions: "每天几点检查？"="08:00". You can now continue with the user\'s answers in mind.',
     extra={'questions': [{'q': '每天几点检查？', 'multi': False, 'options': [{'label': '08:00', 'desc': '上班前看一眼'}, {'label': '20:00', 'desc': '下班前看一眼'}]}]})
request(T, 8, text='好的，阈值 -72°C 已改，测试 4/4 通过；下一步每天 08:00 定时检查。', t=48)
finish(T, calls=9)
turns.append(T)
t_abs += T.t + 16000

# ── turn 3: a subagent and a parallel workflow ──
T = Turn(3, t_abs, '子 agent 与并行工作流')
T.ctx = 41000
T.add('turn.start', {'n': 3, 'model': MODEL, 'msgs': 31})
T.add('user.message', {'text': '再派人调研一下：-80 冰柜常见故障，分三路并行查。'}, 20)
hook(T, 'user_prompt_submit')
request(T, 0, think='Spawn an explore subagent for vendor manuals, and a 3-way workflow for failure modes.', r=20)
tid = tool(T, 'spawn_subagent', 'other', 'Subagent', {'subagent_type': 'explore', 'description': '查厂商手册', 'background': True}, 'Spawn explore · 查厂商手册',
           out='spawned sa-41 in background', dur=80)
hook(T, 'subagent_start', 'spawn_subagent')
T.add('x.subagent_spawned', {'subagent_id': 'sa-41', 'parent_session_id': SESSION_ID, 'child_session_id': 'sa-41', 'subagent_type': 'explore',
                             'description': '查厂商手册', 'capability_mode': 'read-only', 'model': MODEL}, 30)
for k, (turns_, calls, tok) in enumerate([(1, 3, 9800), (2, 6, 15400), (3, 9, 21000)]):
    T.add('x.subagent_progress', {'subagent_id': 'sa-41', 'child_session_id': 'sa-41', 'duration_ms': 2000 * (k + 1) * 3, 'turn_count': turns_,
                                  'tool_call_count': calls, 'tokens_used': tok, 'context_window_tokens': WINDOW, 'context_usage_pct': 2,
                                  'tools_used': ['web_search', 'web_fetch', 'read_file'][:k + 1], 'error_count': 0}, 2000)
tid = tool(T, 'workflow', 'other', 'Workflow', {'name': 'failure-modes', 'objective': '-80 冰柜常见故障'}, 'Workflow · failure-modes', out='workflow wf-9 started', dur=60)
phases = ['分路调研', '交叉核对', '写报告']
agents = ['压缩机', '门封与结霜', '供电与报警']
for rev, (cur, done_agents, status) in enumerate([(0, 0, 'running'), (0, 1, 'running'), (0, 3, 'running'), (1, 3, 'running'), (2, 3, 'running'), (2, 3, 'complete')]):
    ph = [{'title': p, 'state': 'done' if i < cur or status == 'complete' else 'running' if i == cur else 'pending'} for i, p in enumerate(phases)]
    ag = [{'agent_id': f'wf9-a{i}', 'label': a, 'phase': phases[0], 'model': MODEL, 'state': 'done' if i < done_agents else 'running',
           'tokens_used': 6000 + i * 1500 if i < done_agents else 2500, 'duration_ms': 9000} for i, a in enumerate(agents)]
    T.add('x.workflow_updated', {'run_id': 'wf-9', 'revision': rev + 1, 'name': 'failure-modes', 'objective': '-80 冰柜常见故障', 'status': status,
                                 'foreground': False, 'phases': ph, 'current_phase': phases[min(cur, 2)], 'agent_budget': 6, 'agents_used': done_agents,
                                 'agents_reserved': 3, 'agents_remaining': 6 - done_agents, 'elapsed_ms': 3000 * (rev + 1),
                                 'active_agents': 3 - done_agents if cur == 0 else (1 if status != 'complete' else 0), 'agents': ag,
                                 'last_event': 'phase_started' if status != 'complete' else 'completed', 'result_summary': '压缩机、门封、供电三类，附排查清单' if status == 'complete' else None}, 1700)
T.add('x.subagent_finished', {'subagent_id': 'sa-41', 'child_session_id': 'sa-41', 'status': 'completed', 'error': None, 'tool_calls': 11, 'turns': 3,
                              'duration_ms': 21400, 'tokens_used': 24100, 'output': '两家厂商手册都建议：门封每季度检查，压缩机报警优先级最高。', 'will_wake': True}, 900)
hook(T, 'subagent_stop', 'spawn_subagent')
request(T, 1, text='调研完成：三类故障（压缩机、门封结霜、供电与报警）+ 厂商手册要点，已写进 docs/freezer-faults.md。', r=10, t=40)
finish(T, calls=2)
turns.append(T)
t_abs += T.t + 14000

# ── turn 4: goal mode with planner, classifier, strategist, skeptic verifiers, summarizer ──
T = Turn(4, t_abs, '目标模式 · 评估与复核')
T.ctx = 66000
T.add('turn.start', {'n': 4, 'model': MODEL, 'msgs': 44})
T.add('user.message', {'text': '/goal 让报警脚本在真实日志上回放也全部通过 --budget 200000'}, 20)
hook(T, 'user_prompt_submit')
tid = tool(T, 'update_goal', 'other', 'Goal', {'objective': '报警脚本在真实日志回放下全部通过', 'token_budget': 200000}, 'Set goal', perm=None, out='goal g-3 set')


def goal(status, phase, done, cur=None, verifying=False, planning=False, used=0, last=None):
    T.add('x.goal_updated', {'goal_id': 'g-3', 'objective': '报警脚本在真实日志回放下全部通过', 'status': status, 'phase': phase, 'token_budget': 200000,
                             'tokens_used': used, 'elapsed_ms': 1000 + used // 20, 'total_deliverables': 3, 'completed_deliverables': done,
                             'current_deliverable_idx': cur, 'current_deliverable_title': ['回放工具', '修正误报', '回归测试'][cur] if cur is not None else None,
                             'deliverables': [{'id': i, 'title': t, 'status': 'done' if i < done else 'in_progress' if i == cur else 'pending'}
                                              for i, t in enumerate(['回放工具', '修正误报', '回归测试'])],
                             'verifying_completion': verifying, 'planning': planning, 'last_event': last}, 300)


goal('active', 'planning', 0, planning=True, last='planner_started')
T.add('e.goal_planner_fired', {'attempt': 1, 'max_runs': 2, 'model_id': MODEL}, 60)
T.add('e.goal_role_model_resolved', {'role': 'planner', 'skeptic_idx': None, 'model_id': MODEL, 'agent_type': 'plan', 'source': 'default'}, 20)
T.add('e.goal_planner_completed', {'attempt': 1, 'latency_ms': 4100}, 4100)
goal('active', 'executing', 0, cur=0, used=12000, last='deliverable_started')
request(T, 0, think='Build a replay harness for real logs.', r=12)
tool(T, 'write', 'edit', 'Write', {'file_path': 'test/replay.sh'}, 'Write `test/replay.sh`', locations=['test/replay.sh'], read_only=False,
     diff={'path': 'test/replay.sh', 'old': '', 'new': 'for f in logs/freezer.log*; do zcat -f "$f" | scripts/freezer_alarm.sh; done'}, out='written')
tool(T, 'run_terminal_command', 'execute', 'Run Command', {'command': 'test/replay.sh'}, 'Execute `test/replay.sh`', read_only=False,
     progress=['replaying freezer.log.2.gz', 'ALARM 2026-10-02 03:14 -71.9'], status='failed', exit=1, out='exit: 1\nfalse alarm on a door-open spike')
goal('active', 'executing', 1, cur=1, used=38000, last='deliverable_completed')
T.add('e.goal_classifier_fired', {'attempt': 1, 'max_runs': 4, 'model_id': MODEL}, 300)
T.add('e.goal_classifier_verdict', {'verdict': 'not_achieved', 'attempt': 1, 'latency_ms': 2100}, 2100)
T.add('e.goal_auto_paused', {'reason': 'no_progress'}, 100)
goal('paused', 'executing', 1, cur=1, used=40000, last='auto_paused')
T.add('e.goal_strategist_fired', {'attempt': 1, 'consecutive_failures': 1, 'every': 2, 'model_id': MODEL}, 600)
T.add('e.goal_strategist_completed', {'attempt': 1, 'consecutive_failures': 1, 'latency_ms': 3000}, 3000)
request(T, 1, think='Strategist: ignore spikes shorter than 2 minutes (door open).', r=14)
tool(T, 'search_replace', 'edit', 'Edit', {'file_path': 'scripts/freezer_alarm.sh'}, 'Edit `scripts/freezer_alarm.sh`', locations=['scripts/freezer_alarm.sh'],
     read_only=False, diff={'path': 'scripts/freezer_alarm.sh', 'old': '(( HITS >= 3 ))', 'new': '(( HITS >= 12 ))  # 2 min at 10 s'}, out='1 replacement')
tool(T, 'run_terminal_command', 'execute', 'Run Command', {'command': 'test/replay.sh && bats test/alarm.bats'}, 'Execute `test/replay.sh && bats …`',
     read_only=False, progress=['replaying 3 logs', 'no false alarms'], exit=0, out='exit: 0\n3 logs replayed · 0 false alarms · 1 true alarm (2026-09-18)')
request(T, 2, text='回放 3 份日志无误报，真实故障 1 次被正确报出。', t=24)
T.add('e.goal_premature_stop_detected', {'pattern': 'claims_done_without_verification'}, 60)
goal('active', 'verifying', 3, verifying=True, used=71000, last='verification_started')
for i in range(3):
    T.add('e.goal_role_model_resolved', {'role': 'skeptic', 'skeptic_idx': i, 'model_id': MODEL, 'agent_type': 'explore', 'source': 'default'}, 40)
for i, refuted in enumerate([False, False, True]):
    T.add('e.goal_verifier_skeptic_verdict', {'attempt': 1, 'skeptic_idx': i, 'refuted': refuted, 'confidence': 'medium' if refuted else 'high',
                                              'latency_ms': 5200 + i * 700}, 1400)
T.add('e.goal_verifier_aggregate_verdict', {'attempt': 1, 'refuted_count': 1, 'total': 3, 'achieved': True}, 300)
T.add('e.goal_summarizer_fired', {'attempt': 1, 'model_id': MODEL}, 100)
T.add('e.goal_summarizer_completed', {'attempt': 1, 'latency_ms': 2600}, 2600)
goal('complete', 'complete', 3, used=79000, last='goal_achieved')
finish(T, calls=3)
turns.append(T)
t_abs += T.t + 15000

# ── turn 5: compaction with memory flush, model switch, retries, doom loop, auto recovery, images ──
T = Turn(5, t_abs, '压缩 · 记忆 · 换模型 · 重试')
T.ctx = 890000
T.add('turn.start', {'n': 5, 'model': MODEL, 'msgs': 61})
T.add('user.message', {'text': '把这段时间的排查经验整理一下，附上冰柜照片。'}, 20)
hook(T, 'user_prompt_submit')
T.add('x.image_compressed', {'images': [{'name': 'freezer.jpg', 'original_bytes': 4200000, 'compressed_bytes': 610000}], 'message': '1 张图片已压缩'}, 40)
T.add('x.image_dropped', {'notes': ['probe-closeup.heic：格式不支持，已跳过']}, 30)
T.add('x.auto_compact_started', {'tokens_used': 902000, 'context_window': WINDOW, 'percentage': 86, 'reason': 'Context window 86% full'}, 200)
T.add('x.memory_flush_started', {}, 40)
hook(T, 'pre_compact')
request(T, 0, think='Summarize the conversation into the 9-section summary template.', r=30, ttft=(2500, 4000))
T.add('x.compaction_checkpoint', {'checkpoint_id': '7c1e-demo', 'prompt_index_at_compaction': 5, 'checkpoint_file': 'compaction_checkpoints/7c1e-demo.json',
                                  'schema_version': 1, 'created_at': '2026-10-26T08:12:00Z'}, 200)
hook(T, 'post_compact')
T.add('x.memory_flush_completed', {'result': 'written', 'path': 'memory/freezer.md'}, 300)
T.add('x.auto_compact_completed', {'tokens_before': 902000, 'tokens_after': 61240, 'elapsed_ms': 18400, 'summary_preview': '冰柜报警脚本已完成并通过回放…'}, 400)
T.ctx = 61240
T.add('x.auto_continue_completed', {'total_tokens': 61240}, 200)
T.add('x.model_auto_switched', {'previous_model_id': MODEL, 'new_model_id': 'grok-code-fast', 'reason': 'rate_limited'}, 300)
T.add('x.model_changed', {'model_id': 'grok-code-fast', 'reasoning_effort': 'medium'}, 30)
T.add('loop.start', {'i': 1}, 80)
T.add('phase', {'phase': 'waiting_for_model'}, 5)
T.add('x.retry_state', {'type': 'retrying', 'attempt': 1, 'maxRetries': 15, 'reason': 'HTTP 503 Service Unavailable'}, 1800)
T.add('x.retry_state', {'type': 'retrying', 'attempt': 2, 'maxRetries': 15, 'reason': 'stream error: connection reset'}, 2400)
T.add('request.first_token', {}, 2100)
T.add('phase', {'phase': 'streaming_reasoning'}, 5)
T.ticks('r', 24)
T.add('x.retry_state', {'type': 'retrying', 'attempt': 3, 'maxRetries': 15, 'reason': 'doom_loop: tail_repetition:6@thinking, aborted at chunk 412'}, 100)
T.add('x.auto_recovery_started', {'attempt': 1, 'max_retries': 2, 'error': 'doom loop in thinking channel', 'delay_ms': 1500}, 300)
request(T, 2, think='Resampled. Write the lessons-learned note.', text='整理好了：误报主要来自开门峰值，已按 2 分钟窗口过滤；压缩机报警优先级最高；门封每季度检查。', r=12, t=56)
T.add('x.hook_annotation', {'message': 'qc-hooks: 经验笔记已归档到 docs/lessons.md'}, 60)
finish(T, calls=3)
turns.append(T)
t_abs += T.t + 13000

# ── turn 6: schedule, recap, rewind, feedback, session end, memory save and dream ──
T = Turn(6, t_abs, '定时 · 回顾 · 回退')
T.ctx = 74000
T.add('turn.start', {'n': 6, 'model': 'grok-code-fast', 'msgs': 12})
T.add('user.message', {'text': '每天 08:00 自动跑一次检查，有报警就叫我。'}, 20)
hook(T, 'user_prompt_submit')
T.add('e.yolo_toggled', {'enabled': True}, 300)
T.add('e.mcp_server_toggled', {'server_name': 'docs-search', 'enabled': False}, 200)
request(T, 0, think='Create a daily schedule at 08:00.', r=10)
tool(T, 'scheduler_create', 'other', 'Schedule', {'prompt': '跑 scripts/freezer_alarm.sh 检查昨夜日志', 'schedule': '每天 08:00'}, 'Schedule daily 08:00',
     out='scheduled task s-2', perm='human-allow')
T.add('x.scheduled_task_created', {'task_id': 's-2', 'prompt': '跑 scripts/freezer_alarm.sh 检查昨夜日志', 'human_schedule': '每天 08:00', 'next_fire_at': '2026-10-27T08:00:00+08:00'}, 30)
T.add('x.scheduled_task_fired', {'task_id': 's-2', 'prompt': '跑 scripts/freezer_alarm.sh 检查昨夜日志', 'human_schedule': '每天 08:00',
                                 'next_fire_at': '2026-10-28T08:00:00+08:00', 'subagent_id': 'sa-loop-1'}, 2400)
hook(T, 'notification', runs=[{'name': 'global/notify', 'status': 'success', 'ms': 22}])
request(T, 1, text='已设好：每天 08:00 跑一次，有报警会通知你。今天这次已经跑过，没有报警。', t=36)
finish(T, calls=2)
T.add('x.session_recap', {'summary': '本次：写好冰柜报警脚本（-72°C，2 分钟窗口），回放无误报，接上每日 08:00 定时检查。', 'auto': True}, 1200)
T.add('x.rewind_marker', {'target_prompt_index': 4, 'created_at': '2026-10-26T08:40:00Z'}, 900)
T.add('x.feedback_request', {'kind': 'session_rating'}, 400)
T.add('x.scheduled_task_deleted', {'task_id': 's-2'}, 500)
T.add('e.yolo_toggled', {'enabled': False}, 300)
turns.append(T)
t_abs += T.t + 12000

# ── turn 7: a fault drill — every guard's failure branch, so each one has been seen once ──
T = Turn(7, t_abs, '故障演练')
T.ctx = 76000
T.add('turn.start', {'n': 7, 'model': 'grok-code-fast', 'msgs': 16})
T.add('user.message', {'text': '跑一遍故障演练：各个闸门和兜底都走一次失败分支。'}, 20)
hook(T, 'user_prompt_submit')
request(T, 0, think='Drill: exercise each guard failure path.', r=10)
T.add('x.auto_compact_started', {'tokens_used': 880000, 'context_window': WINDOW, 'percentage': 84, 'reason': 'manual /compact'}, 400)
T.add('x.auto_compact_failed', {'error': 'summary too short after 3 attempts'}, 1600)
T.add('x.auto_compact_started', {'tokens_used': 880000, 'context_window': WINDOW, 'percentage': 84, 'reason': 'manual /compact'}, 600)
T.add('x.auto_compact_cancelled', {'reason': 'user pressed Esc'}, 900)
T.add('e.todo_gate_fired', {'fires': 3, 'pending': 2, 'in_progress': 0, 'reason': 'pending_todos'}, 400)
T.add('e.todo_gate_exhausted', {'pending': 2}, 300)
T.add('e.laziness_classifier_aborted', {'reason': 'timeout'}, 400)
T.add('e.goal_classifier_fired', {'attempt': 2, 'max_runs': 4, 'model_id': 'grok-code-fast'}, 300)
T.add('e.goal_classifier_fail_open', {'reason': 'parse_error', 'attempt': 2, 'latency_ms': 1800}, 1800)
T.add('e.goal_classifier_fail_closed', {'reason': 'provider_error', 'attempt': 3}, 400)
T.add('e.goal_classifier_mid_turn_deferred', {'pending_depth': 1}, 300)
T.add('e.goal_classifier_cap_reached', {'attempt': 4}, 300)
T.add('e.goal_classifier_dropped_after_cap', {'attempts_seen': 5}, 200)
T.add('e.goal_classifier_pending_queue_cleared', {'dropped': 1}, 200)
T.add('e.goal_planner_fail_closed', {'reason': 'invalid_plan', 'attempt': 2, 'latency_ms': 2600}, 600)
T.add('e.goal_strategist_failed', {'reason': 'timeout', 'attempt': 2, 'consecutive_failures': 2, 'latency_ms': 30000}, 600)
T.add('e.goal_strategist_contract_restore_failed', {'reason': 'missing_contract', 'attempt': 2}, 300)
T.add('e.goal_summarizer_fail_open', {'reason': 'empty_summary', 'attempt': 1, 'latency_ms': 1400}, 500)
T.add('e.goal_role_model_fail_open', {'role': 'skeptic', 'skeptic_idx': 2, 'reason': 'model_unavailable'}, 300)
T.add('e.mcp_init_cancelled', {'reason': 'session reload'}, 500)
request(T, 1, text='演练完成：压缩失败与取消、待办闸门耗尽、懒惰判定超时、目标评估器的各种兜底、MCP 初始化取消都走了一遍。', t=40)
finish(T, calls=2)
turns.append(T)
t_abs += T.t + 12000

# ── turn 8: the provider gives out; retries run dry, recovery gives up, the turn fails; then the session ends ──
T = Turn(8, t_abs, '断线 · 收工 · 记忆整合')
T.ctx = 81000
T.add('turn.start', {'n': 8, 'model': 'grok-code-fast', 'msgs': 22})
T.add('user.message', {'text': '最后把报告发到实验群里。'}, 20)
hook(T, 'user_prompt_submit')
T.add('loop.start', {'i': 0}, 60)
T.add('phase', {'phase': 'waiting_for_model'}, 5)
T.add('x.relay_sync_status', {'status': 'reconnecting', 'attempt': 1}, 600)
for k in range(3):
    T.add('x.retry_state', {'type': 'retrying', 'attempt': k + 1, 'maxRetries': 15, 'reason': 'HTTP 429 Too Many Requests'}, 1500 + k * 900)
T.add('x.retry_state', {'type': 'exhausted', 'attempts': 15, 'reason': 'HTTP 429 Too Many Requests', 'isRateLimited': True}, 1800)
T.add('x.auto_recovery_started', {'attempt': 2, 'max_retries': 2, 'error': 'rate limited', 'delay_ms': 4000}, 300)
T.add('x.auto_recovery_exhausted', {'attempts': 2, 'error': 'rate limited'}, 2400)
T.add('x.retry_state', {'type': 'failed', 'errorType': 'rate_limit', 'message': 'provider capacity exhausted'}, 200)
hook(T, 'stop_failure', runs=[{'name': 'global/notify', 'status': 'success', 'ms': 18}])
T.add('turn.end', {'outcome': 'error', 'cancel': None}, 40)
T.add('turn.completed', {'stop': 'error', 'usage': {'inputTokens': 81000, 'outputTokens': 0, 'cachedReadTokens': 70000, 'reasoningTokens': 0,
                                                    'modelCalls': 1, 'apiDurationMs': 9100, 'numTurns': 1, 'totalTokens': 81000}}, 20)
T.add('x.relay_sync_status', {'status': 'connected'}, 900)
T.add('x.session_recap_unavailable', {}, 600)
hook(T, 'session_end', runs=[{'name': 'global/notify', 'status': 'success', 'ms': 12}])
T.add('x.memory_session_saved', {'path': 'memory/sessions/2026-10-26.md'}, 300)
T.add('x.memory_dream_completed', {'result': 'consolidated 3 sessions', 'path': 'memory/dreams/2026-10-26.md'}, 1400)
turns.append(T)

trace = {
    'v': 1,
    'source': {'agent': 'grok-build', 'version': '0.2.106', 'adapter': 'demo', 'synthetic': True},
    'session': {'id': SESSION_ID, 'cwd': '~/lab/mv01', 'title': '冰柜温度报警脚本（演示）', 'model': MODEL, 'agent': 'grok-build',
                'branch': 'main', 'contextWindow': WINDOW, 'turnCount': 8},
    'turns': [t.dump() for t in turns],
}
s = json.dumps(trace, ensure_ascii=False, separators=(',', ':'))
open(args.out, 'w').write(s)
types = sorted({e[1] for t in trace['turns'] for e in t['events']})
hooks = sorted({e[2]['event'] for t in trace['turns'] for e in t['events'] if e[1] == 'hook'})
print(f'wrote {args.out}: {len(s) / 1024:.1f} KB, {sum(len(t["events"]) for t in trace["turns"])} events, {len(types)} types, {len(hooks)} hook kinds')
