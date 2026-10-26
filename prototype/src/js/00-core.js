import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ═════════════════════════ data & helpers ═════════════════════════
// Two sources: a recorded local session (real, but only ~17 event types) and a staged session
// that walks through every event type grok-build can emit. The director plays whichever is active.
const TRACES = {
  replay: JSON.parse(document.getElementById('trace-data').textContent),
  demo: JSON.parse(document.getElementById('demo-data').textContent),
};
const SRC_NAME = { demo: '全事件演示', replay: '本机回放' };
let SRC = 'demo', TRACE, SESSION, WINDOW_TOKENS, PROJECT, TL, MCP_SERVERS;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// exponential follow: frame-rate independent approach of `cur` toward `to`
const damp = (cur, to, rate, dt) => lerp(cur, to, 1 - Math.exp(-rate * dt));
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const fmtK = n => (n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(2) + 'K' : String(Math.round(n)));
const fmtMs = ms => (ms == null ? '—' : ms < 1000 ? Math.round(ms) + 'ms' : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + 's');
const fmtIdle = ms => (ms >= 3600e3 ? (ms / 3600e3).toFixed(1) + ' 小时' : ms >= 60e3 ? Math.round(ms / 60e3) + ' 分钟' : Math.round(ms / 1000) + ' 秒');
const clockTxt = ms => new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261026);

const ORIGIN = {
  'turn.start': 'events.jsonl · turn_started', 'loop.start': 'events.jsonl · loop_started', phase: 'events.jsonl · phase_changed',
  k: 'events.jsonl · phase_changed（每个流式 chunk 一次）', 'request.first_token': 'events.jsonl · first_token',
  'tool.start': 'events.jsonl · tool_started', 'tool.end': 'events.jsonl · tool_completed',
  'permission.request': 'events.jsonl · permission_requested', 'permission.resolve': 'events.jsonl · permission_resolved',
  'turn.end': 'events.jsonl · turn_ended', 'mcp.starting': 'events.jsonl · mcp_server_starting',
  'mcp.connected': 'events.jsonl · mcp_server_connected', 'mcp.ready': 'events.jsonl · mcp_init_completed',
  'user.message': 'updates.jsonl · session/update · user_message_chunk', 'stream.thought': 'updates.jsonl · session/update · agent_thought_chunk',
  'stream.text': 'updates.jsonl · session/update · agent_message_chunk', hook: 'updates.jsonl · _x.ai/session/update · hook_execution',
  'tool.call': 'updates.jsonl · session/update · tool_call', 'tool.update': 'updates.jsonl · session/update · tool_call_update',
  'turn.completed': 'updates.jsonl · _x.ai/session/update · turn_completed',
};
const TYPE_NAME = {
  'turn.start': '回合开始', 'user.message': '用户消息', hook: 'Hook 执行', 'loop.start': '模型请求', phase: '阶段切换', k: '流式 chunk',
  'request.first_token': '首 token', 'stream.thought': '推理（整段）', 'stream.text': '正文（整段）', 'tool.call': '工具调用',
  'tool.update': '工具更新', 'tool.start': '工具开始', 'tool.end': '工具结束', 'permission.request': '权限请求',
  'permission.resolve': '权限决定', 'turn.end': '回合结束', 'turn.completed': '回合完成', 'mcp.starting': 'MCP 启动',
  'mcp.connected': 'MCP 连接', 'mcp.ready': 'MCP 就绪',
};

// Real gaps are softly compressed so a 20-minute session plays in a few minutes; human waits
// (permission prompts, ask_user) become barriers that pause the clock until the player answers.
function buildTimeline() {
  const flat = [];
  TRACE.turns.forEach((turn, ti) => {
    turn.events.forEach((ev, k) => flat.push({ ti, n: turn.n, real: turn.t0 + ev[0], type: ev[1], d: ev[2], first: k === 0 }));
  });
  flat.forEach((e, i) => {
    if (e.type !== 'permission.request') return;
    for (let j = i + 1; j < flat.length && flat[j].ti === e.ti; j++) {
      const r = flat[j];
      if (r.type === 'permission.resolve' && r.d.name === e.d.name && !r.req) { e.link = r; r.req = e; break; }
    }
  });
  const windows = [];
  flat.forEach((e, i) => {
    if (e.type === 'permission.request' && e.link && e.link.d.wait >= 600) { e.human = true; windows.push([i, flat.indexOf(e.link)]); }
    if (e.type === 'x.pending_interaction' && e.d.kind === 'plan_approval') {
      for (let j = i + 1; j < flat.length && flat[j].ti === e.ti; j++) {
        const r = flat[j];
        if (r.type === 'x.interaction_resolved' && r.d.tool_call_id === e.d.tool_call_id) { if (r.real - e.real >= 600) { e.human = true; e.link = r; windows.push([i, j]); } break; }
      }
    }
    if (e.type === 'permission.resolve' && e.d.name === 'ask_user_question' && e.d.decision === 'allow') {
      for (let j = i + 1; j < flat.length && flat[j].ti === e.ti; j++) {
        const x = flat[j];
        if (x.type === 'tool.update' && x.d.name === 'ask_user_question' && (x.d.status === 'completed' || x.d.status === 'failed')) { e.ask = x; windows.push([i, j]); break; }
      }
    }
  });
  for (const [a, b] of windows) for (let j = a + 1; j <= b; j++) flat[j].inWindow = true;
  const soft = (gap, cap) => (gap <= 1200 ? gap : Math.min(cap, 1200 + Math.sqrt(gap - 1200) * 35));
  let vt = 0, prev = null;
  flat.forEach((e, i) => {
    const gap = prev == null ? 0 : Math.max(0, e.real - prev);
    const v = e.inWindow ? Math.min(gap, 350) : e.first && prev != null ? soft(gap, 3200) : soft(gap, 6000);
    vt += v; e.vt = vt; e.i = i; e.idle = e.first ? gap : 0; prev = e.real;
  });
  return flat;
}
function useSource(name) {
  SRC = TRACES[name] ? name : 'replay';
  TRACE = TRACES[SRC]; SESSION = TRACE.session;
  WINDOW_TOKENS = SESSION.contextWindow || 1048576;
  PROJECT = (SESSION.cwd || '').split('/').filter(Boolean).pop() || 'session';
  TL = buildTimeline();
  MCP_SERVERS = [...new Set(TL.filter(e => e.type === 'mcp.starting').map(e => e.d.server))];
}
try { const saved = localStorage.getItem('starfleet.src'); if (saved && TRACES[saved]) SRC = saved; } catch (err) { /* storage may be blocked */ }
useSource(SRC);
// the long-term line always comes from the real recording: every turn this machine has run
const LONG = TRACES.replay.longTerm || {};
const REPLAY_DONE = TRACES.replay.turns.flatMap(t => t.events.filter(e => e[1] === 'turn.completed'));
const ARCHIVE_BASE = {
  tokens: Math.max(0, (LONG.tokens || 0) - REPLAY_DONE.reduce((s, e) => s + ((e[2].usage || {}).totalTokens || 0), 0)),
  turns: Math.max(0, (LONG.turns || 0) - REPLAY_DONE.length),
};

// ═════════════════════════ palette (anatomy tones + Every Joule store colours) ═════════════════════════
// Every drawn colour is a token with a light and a dark value; the shaders read the same tokens.
const PALETTES = {
  light: {
    paper: '#fbfbfa', top: '#ffffff', shade0: '#d9d9d6', shade3: '#f3f3f0', bottom: '#cfcfcc', shadow: '#c9cbd3', shadowK: 0.78,
    ink: '#232327', glassTint: '#cfd8e0', glassA: 0.2, ghostA: 0.1, glowBlend: 'normal', grain: 0.045, screenBg: '#e4e9df', screenInk: '#2a3326',
  },
  dark: {
    paper: '#131313', top: '#262626', shade0: '#0d0d0d', shade3: '#1b1b1b', bottom: '#0b0b0b', shadow: '#000000', shadowK: 0.62,
    ink: '#d4d4d4', glassTint: '#9aa3ad', glassA: 0.1, ghostA: 0.07, glowBlend: 'add', grain: 0.06, screenBg: '#121a14', screenInk: '#a6f0b4',
  },
};
// fluids are the subject, so they are the only saturated colours in the drawing
const FLUID = {
  context: 0x2aa6c9, reason: 0x8a4dff, text: 0x2f7bff, tool: 0xff7a1c, ok: 0x26c75a, err: 0xe8233a, user: 0xffcf1a, cache: 0x18c4dc, water: 0x9ccfe0,
};
const MAT = { // albedo multipliers for painted parts (sRGB); "paper" parts take the theme tones directly
  paper: 0xffffff, pale: 0xf1f1ef, steel: 0xd5dae0, alu: 0xe6e8ea, graphite: 0x55575d, rubber: 0x3a3b40, hose: 0xc4baa8, brass: 0xd2b072, copper: 0xd09068,
  cork: 0xd8c3a0, enamel: 0xf6f6f2, hazard: 0xf2c230, hazardK: 0x2a2a2e, redlamp: 0xe8233a, greenlamp: 0x26c75a, amberlamp: 0xffa31a,
};
let THEME = 'light';
// the replay's wall clock (the recorded time of the event being shown); the director advances it
let REAL_NOW = TRACE?.turns?.[0]?.t0 || Date.now();
const CLOCK_REAL = () => REAL_NOW;
function detectTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
