"""Extract turns of a grok-build session into a compact, normalized trace
(ATE v1) for the Starfleet prototype. Merges events.jsonl + updates.jsonl,
rewrites the home directory to ~ and truncates long text.

The busy event types get short names (turn.start, tool.call, k, ...); every other
events.jsonl type passes through as `e.<type>`, the other ACP updates as
`acp.<type>` and the xAI extensions as `x.<type>`, with their fields kept.

Usage:
  python3 tools/extract_grok_trace.py --session <session-dir> --turns 0,4,8 --out prototype/data/sample-trace.json
"""
import argparse
import datetime
import glob
import json
import os
import re

SESS_ROOT = os.path.expanduser('~/.grok/sessions')
HOME = os.path.expanduser('~')

ap = argparse.ArgumentParser()
ap.add_argument('--session', required=True, help='~/.grok/sessions/<cwd>/<session-id> directory')
ap.add_argument('--turns', default='', help='comma-separated turn numbers to keep (default: all)')
ap.add_argument('--out', required=True)
args = ap.parse_args()
SESSION_DIR = os.path.expanduser(args.session)
OUT = args.out


def clean(s, n=None):
    if not isinstance(s, str):
        return s
    s = s.replace(HOME, '~')
    s = re.sub(r'sk-[A-Za-z0-9_\-]{8,}', 'sk-***', s)
    if n and len(s) > n:
        s = s[:n].rstrip() + '…'
    return s


def deep_clean(v, n=200, depth=0):
    """Clean every string in a JSON value, cap long strings and long lists."""
    if isinstance(v, str):
        return clean(v, n)
    if isinstance(v, list):
        return [deep_clean(x, n, depth + 1) for x in v[:12]]
    if isinstance(v, dict):
        return {k: deep_clean(x, n, depth + 1) for k, x in v.items() if depth < 4}
    return v


def iso_ms(s):
    return datetime.datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp() * 1000


def text_of(content):
    if isinstance(content, dict):
        return content.get('text', '')
    out = []
    for c in content or []:
        if c.get('type') == 'content':
            out.append((c.get('content') or {}).get('text', ''))
        elif c.get('type') == 'text':
            out.append(c.get('text', ''))
    return '\n'.join(x for x in out if x)


def diff_of(content):
    for c in content or []:
        if c.get('type') == 'diff':
            return {
                'path': clean(c.get('path')),
                'old': clean(c.get('oldText') or '', 240),
                'new': clean(c.get('newText') or '', 240),
            }
    return None


# ── collect raw rows ──────────────────────────────────────────────────────
rows = []  # (ts_ms, order, src, obj)
order = 0
for line in open(os.path.join(SESSION_DIR, 'events.jsonl')):
    try:
        o = json.loads(line)
    except json.JSONDecodeError:
        continue
    rows.append((iso_ms(o['ts']), order, 'ev', o))
    order += 1
for line in open(os.path.join(SESSION_DIR, 'updates.jsonl')):
    try:
        o = json.loads(line)
    except json.JSONDecodeError:
        continue
    p = o.get('params') or {}
    meta = p.get('_meta') or {}
    ts = meta.get('agentTimestampMs') or (o.get('timestamp', 0) * 1000)
    rows.append((ts, order, 'up', o))
    order += 1
rows.sort(key=lambda r: (r[0], r[1]))

# ── split into turns (session preamble = turn -1) ─────────────────────────
turns = {-1: []}
cur = -1
for ts, _, src, o in rows:
    if src == 'ev' and o['type'] == 'turn_started':
        cur = o['turn_number']
        turns[cur] = []
    turns[cur].append((ts, src, o))


def norm_turn(n, recs):
    out = []
    t0 = recs[0][0]
    last_phase = None
    prompt_id = None
    tool_names = {}
    for ts, src, o in recs:
        dt = int(round(ts - t0))
        if src == 'ev':
            t = o['type']
            if t == 'turn_started':
                out.append([dt, 'turn.start', {'n': o['turn_number'], 'model': o['model_id'],
                                               'msgs': o.get('conversation_message_count')}])
            elif t == 'loop_started':
                out.append([dt, 'loop.start', {'i': o['loop_index']}])
                last_phase = None
            elif t == 'phase_changed':
                ph = o['phase']
                if ph in ('streaming_reasoning', 'streaming_text'):
                    out.append([dt, 'k', 'r' if ph == 'streaming_reasoning' else 't'])
                if ph != last_phase:
                    out.append([dt, 'phase', {'phase': ph}])
                    last_phase = ph
            elif t == 'first_token':
                out.append([dt, 'request.first_token', {}])
            elif t == 'tool_started':
                out.append([dt, 'tool.start', {'name': o['tool_name']}])
            elif t == 'tool_completed':
                out.append([dt, 'tool.end', {'name': o['tool_name'], 'outcome': o.get('outcome'),
                                             'dur': o.get('duration_ms')}])
            elif t == 'permission_requested':
                out.append([dt, 'permission.request', {'name': o['tool_name']}])
            elif t == 'permission_resolved':
                out.append([dt, 'permission.resolve', {'name': o['tool_name'], 'decision': o['decision'],
                                                       'wait': o.get('wait_ms')}])
            elif t == 'turn_ended':
                out.append([dt, 'turn.end', {'outcome': o['outcome'],
                                             'cancel': o.get('cancellation_category')}])
            elif t == 'mcp_server_connected':
                out.append([dt, 'mcp.connected', {'server': o['server_name'], 'tools': o['tool_count'],
                                                  'ms': o['duration_ms'], 'transport': o['transport']}])
            elif t == 'mcp_server_starting':
                out.append([dt, 'mcp.starting', {'server': o['server_name'], 'transport': o['transport']}])
            elif t == 'mcp_init_completed':
                out.append([dt, 'mcp.ready', {'servers': o['total_servers'], 'tools': o['total_tools'],
                                              'ms': o['duration_ms']}])
            else:
                out.append([dt, 'e.' + t, deep_clean({k: v for k, v in o.items() if k not in ('ts', 'type', 'session_id')})])
            continue
        p = o.get('params') or {}
        u = p.get('update') or {}
        meta = p.get('_meta') or {}
        su = u.get('sessionUpdate')
        ctx = meta.get('totalTokens')
        base = {'ctx': ctx} if ctx else {}
        if meta.get('promptId'):
            prompt_id = meta['promptId']
        if su == 'user_message_chunk':
            out.append([dt, 'user.message', {'text': clean(text_of(u.get('content')), 400)}])
        elif su == 'agent_thought_chunk':
            txt = text_of(u.get('content'))
            out.append([dt, 'stream.thought', {**base, 'len': len(txt), 'text': clean(txt, 360)}])
        elif su == 'agent_message_chunk':
            txt = text_of(u.get('content'))
            out.append([dt, 'stream.text', {**base, 'len': len(txt), 'text': clean(txt, 420)}])
        elif su == 'hook_execution':
            runs = [{'name': clean(r['name'].split(':')[0]), 'status': r['status']['status'],
                     'ms': r['status'].get('elapsed_ms')} for r in u.get('runs', [])]
            out.append([dt, 'hook', {'event': u.get('event_name'), 'tool': u.get('tool_name'), 'runs': runs}])
        elif su == 'tool_call':
            xt = (u.get('_meta') or {}).get('x.ai/tool') or {}
            tool_names[u['toolCallId']] = xt.get('name') or u.get('title')
            raw = u.get('rawInput') or {}
            out.append([dt, 'tool.call', {**base, 'id': u['toolCallId'], 'name': xt.get('name') or u.get('title'),
                                          'kind': xt.get('kind'), 'ns': xt.get('namespace'),
                                          'label': xt.get('label'), 'readOnly': xt.get('read_only'),
                                          'input': json.loads(clean(json.dumps(raw, ensure_ascii=False)[:1600]))
                                          if len(json.dumps(raw, ensure_ascii=False)) <= 1600 else
                                          clean(json.dumps(raw, ensure_ascii=False), 600)}])
        elif su == 'tool_call_update':
            d = {'id': u['toolCallId'], 'name': tool_names.get(u['toolCallId'])}
            if u.get('title'):
                d['title'] = clean(u['title'], 120)
            if u.get('kind'):
                d['acpKind'] = u['kind']
            if u.get('status'):
                d['status'] = u['status']
            if u.get('locations'):
                d['locations'] = [clean(x.get('path')) for x in u['locations']]
            txt = text_of(u.get('content'))
            if txt:
                d['output'] = clean(txt, 360)
            df = diff_of(u.get('content'))
            if df:
                d['diff'] = df
            ri = u.get('rawInput')
            if isinstance(ri, dict) and ri.get('variant') == 'AskUserQuestion':
                d['questions'] = [{'q': q['question'], 'multi': q.get('multiSelect', False),
                                   'options': [{'label': op['label'], 'desc': op.get('description', '')}
                                               for op in q['options']]} for q in ri['questions']]
            elif isinstance(ri, dict):
                d['input'] = {k: clean(v, 200) for k, v in ri.items() if k != 'content'}
            ro = u.get('rawOutput')
            if isinstance(ro, dict):
                if ro.get('type') == 'Bash':
                    d['exit'] = ro.get('exit_code')
                    if ro.get('output_for_prompt'):
                        d['output'] = clean(ro['output_for_prompt'], 360)
                elif ro.get('type') and 'FileNotFound' in ro:
                    d['error'] = clean(ro['FileNotFound'], 200)
            out.append([dt, 'tool.update', d])
        elif su == 'turn_completed':
            out.append([dt, 'turn.completed', {'stop': u.get('stop_reason'), 'usage': u.get('usage')}])
        elif su == 'plan':
            out.append([dt, 'acp.plan', {'entries': [{'content': clean(x.get('content'), 120), 'status': x.get('status'),
                                                      'priority': x.get('priority')} for x in u.get('entries', [])[:12]]}])
        elif su == 'available_commands_update':
            out.append([dt, 'acp.available_commands_update',
                        {'commands': [c.get('name') for c in u.get('availableCommands', [])][:40]}])
        elif su == 'current_mode_update':
            out.append([dt, 'acp.current_mode_update', {'mode': u.get('currentModeId')}])
        elif su == 'session_info_update':
            out.append([dt, 'acp.session_info_update', {'title': clean(u.get('title'), 80)}])
        elif su:
            out.append([dt, 'x.' + su, deep_clean({k: v for k, v in u.items() if k != 'sessionUpdate'})])
    # drop idle-time noise (e.g. MCP re-inits) that lands after the turn finished
    end = next((e[0] for e in out if e[1] == 'turn.completed'), None)
    if end is not None:
        out = [e for e in out if e[0] <= end + 1500]
    return {'n': n, 'promptId': prompt_id, 't0': int(recs[0][0]), 'events': out}


pick = [int(x) for x in args.turns.split(',') if x.strip()] or sorted(k for k in turns if k >= 0)


# ── the model-visible context, segment by segment (chat_history.jsonl) ────
# Each segment is [kind, tokens, turn, label]: sys / info / rem (reminder) / user / think / text /
# call / result / summary. Tokens are estimated from characters (about 4 ASCII or 1.5 CJK per
# token), which lands within a few percent of grok's own _meta.totalTokens. Labels carry names
# only (reminder kind, tool, skill, server), never message content.
def est_tokens(s):
    if not s:
        return 0
    a = sum(1 for ch in s if ord(ch) < 128)
    return max(1, round(a / 4 + (len(s) - a) / 1.5))


def row_text(r):
    c = r.get('content')
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return '\n'.join((x.get('text') or '') for x in c if isinstance(x, dict))
    return ''


def context_of(session_dir):
    path = os.path.join(session_dir, 'chat_history.jsonl')
    if not os.path.exists(path):
        return None
    rows = []
    for line in open(path):
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    # the turn a row belongs to: queries carry prompt_index; reminders count toward the next query,
    # replies toward the last one; the system prompt and user_info are the preamble (-1)
    nxt, n = [None] * len(rows), None
    for i in range(len(rows) - 1, -1, -1):
        if rows[i].get('prompt_index') is not None:
            n = rows[i]['prompt_index']
        nxt[i] = n
    segs, prev, names, skills, mcp = [], -1, {}, [], []
    for i, r in enumerate(rows):
        t, txt = r.get('type'), row_text(r)
        if r.get('prompt_index') is not None:
            prev = r['prompt_index']
        if t == 'system':
            segs.append(['sys', est_tokens(txt), -1, 'system_prompt'])
        elif t == 'user' and r.get('synthetic_reason'):
            sub = ('skills' if 'skills are available' in txt else 'mcp+' if 'MCP servers connected' in txt
                   else 'mcp-' if 'MCP servers disconnected' in txt else 'mcp~' if 'currently connecting' in txt
                   else 'date' if 'date has changed' in txt else 'compact' if 'summar' in txt.lower() else r['synthetic_reason'])
            if sub == 'skills':
                skills = re.findall(r'^- ([\w:.\-]+):', txt, re.M)
            if sub == 'mcp+':
                mcp = [{'name': a, 'tools': int(b)} for a, b in re.findall(r'^- ([\w.\-]+) \((\d+) tools\)', txt, re.M)]
            segs.append(['rem', est_tokens(txt), nxt[i] if nxt[i] is not None else prev, sub])
        elif t == 'user' and '<user_info>' in txt and r.get('prompt_index') is None:
            segs.append(['info', est_tokens(txt), -1, 'user_info'])
        elif t == 'user':
            segs.append(['user', est_tokens(txt), r.get('prompt_index', prev), 'query' if r.get('prompt_index') is not None else 'user'])
        elif t == 'reasoning':
            summ = ' '.join((x.get('text') or '') for x in (r.get('summary') or []) if isinstance(x, dict))
            segs.append(['think', est_tokens(summ), prev, 'reasoning'])
        elif t == 'assistant':
            if txt:
                segs.append(['text', est_tokens(txt), prev, r.get('model_id') or 'assistant'])
            for c in r.get('tool_calls') or []:
                names[c.get('id')] = c.get('name')
                segs.append(['call', est_tokens(c.get('arguments') or '') + 12, prev, c.get('name')])
        elif t == 'tool_result':
            segs.append(['result', est_tokens(txt), prev, names.get(r.get('tool_call_id')) or 'tool'])
        elif t:
            segs.append([t, est_tokens(txt), prev, t])
    pc = {}
    try:
        pc = json.load(open(os.path.join(session_dir, 'prompt_context.json')))
    except (OSError, json.JSONDecodeError):
        pass
    return {'segments': segs, 'skills': skills, 'mcp': mcp,
            'agentsMd': len(pc.get('agents_md_files') or []), 'memory': bool(pc.get('memory_enabled')),
            'personas': len(pc.get('persona_summaries') or []), 'promptMode': pc.get('prompt_mode')}


CONTEXT = context_of(SESSION_DIR)
if CONTEXT:
    last = max(pick) if pick else 0
    CONTEXT['segments'] = [s for s in CONTEXT['segments'] if s[2] <= last]
    # the tool definitions are not in the chat history: on a one-call first turn they are the gap
    # between the billed input and grok's first context reading (which counts messages only)
    first = turns.get(min(k for k in turns if k >= 0)) if any(k >= 0 for k in turns) else None
    if first:
        reads = [(o.get('params') or {}).get('_meta', {}).get('totalTokens') for _, src, o in first if src == 'up']
        reads = [r for r in reads if r]
        done = next(((o.get('params') or {}).get('update') or {}).get('usage') for _, src, o in first
                    if src == 'up' and ((o.get('params') or {}).get('update') or {}).get('sessionUpdate') == 'turn_completed')
        if reads and done and done.get('modelCalls') == 1 and done.get('inputTokens', 0) > reads[0]:
            CONTEXT['toolsTok'] = done['inputTokens'] - reads[0]
trace_turns = [norm_turn(-1, turns[-1])] + [norm_turn(n, turns[n]) for n in pick if n in turns]

summary = json.load(open(os.path.join(SESSION_DIR, 'summary.json')))
signals = json.load(open(os.path.join(SESSION_DIR, 'signals.json')))

# ── long-term totals across every local grok session ──────────────────────
all_tokens = 0
all_turns = 0
tools_used = set()
for f in glob.glob(os.path.join(SESS_ROOT, '*', '*', 'updates.jsonl')):
    for line in open(f):
        if '"turn_completed"' not in line:
            continue
        try:
            u = json.loads(line)['params']['update']
        except (json.JSONDecodeError, KeyError):
            continue
        if u.get('sessionUpdate') == 'turn_completed':
            all_turns += 1
            all_tokens += ((u.get('usage') or {}).get('totalTokens') or 0)
for f in glob.glob(os.path.join(SESS_ROOT, '*', '*', 'signals.json')):
    try:
        tools_used.update(json.load(open(f)).get('toolsUsed', []))
    except (json.JSONDecodeError, OSError):
        pass
n_sessions = len(glob.glob(os.path.join(SESS_ROOT, '*', '*', 'events.jsonl')))

trace = {
    'v': 1,
    'source': {'agent': 'grok-build', 'version': '0.2.106', 'adapter': 'grok-files'},
    'session': {
        'id': summary['info']['id'],
        'cwd': clean(summary['info']['cwd']),
        'title': clean(summary.get('generated_title') or summary.get('session_summary'), 60),
        'model': summary.get('current_model_id'),
        'agent': summary.get('agent_name'),
        'branch': summary.get('head_branch'),
        'contextWindow': signals.get('contextWindowTokens'),
        'turnCount': signals.get('turnCount'),
    },
    'longTerm': {'tokens': all_tokens, 'turns': all_turns, 'sessions': n_sessions,
                 'toolsUsed': sorted(tools_used)},
    'context': CONTEXT,
    'turns': trace_turns,
}
s = json.dumps(trace, ensure_ascii=False, separators=(',', ':'))
assert HOME not in s, 'home path leaked'
open(OUT, 'w').write(s)
print(f'wrote {OUT}: {len(s)/1024:.1f} KB, turns={len(trace_turns)}, '
      f'events={sum(len(t["events"]) for t in trace_turns)}, longTerm={trace["longTerm"]}')
