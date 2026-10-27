// ═════════════════════════ layers: the harness's architecture layers, stacked tiers, glass name signs ═════════════════════════
// Every module belongs to one layer of the harness, and each layer has a colour. On the die a module
// stands on a pedestal of its own height (a stacked die) with a seam in its layer's colour, and over
// it floats a glass sign: the layer, the module's name, and its name in the source (or, while it
// works, what it is doing). From far away the module signs give way to one sign per layer.
const DOMAINS = [
  { id: 'session', en: 'SESSION', zh: '会话与输入', tok: 'gold', ids: ['client', 'acp', 'queue', 'turn'] },
  { id: 'loop', en: 'AGENT LOOP', zh: '循环核心', tok: 'violet', ids: ['loop', 'gates'] },
  { id: 'context', en: 'CONTEXT', zh: '上下文管理', tok: 'teal', ids: ['sram', 'prefix', 'compact', 'rem', 'skills', 'mem'] },
  { id: 'model', en: 'MODEL I/O', zh: '模型请求', tok: 'blue', ids: ['rb', 'sampler', 'phy', 'stream'] },
  { id: 'tools', en: 'TOOL PIPELINE', zh: '工具管线', tok: 'amber', ids: ['tools', 'perm', 'hooks', 'runtime', 'mcp'] },
  { id: 'agents', en: 'CHILD · BACKGROUND', zh: '子会话与后台', tok: 'green', ids: ['sub', 'bg'] },
  { id: 'remote', en: 'INFERENCE', zh: '远端推理', tok: 'ink2', ids: ['front', 'lm', 'hbm', 'pcache'] },
  { id: 'storage', en: 'STORAGE', zh: '本地存储', tok: 'muted', ids: ['store'] },
];
// the page's colour tokens (style.css), light and dark, so signs and the HUD legend agree
const DOM_TOK = {
  gold: ['#a87c00', '#ffd54a'], violet: ['#7a3cf0', '#b18cff'], teal: ['#138ca3', '#4fd6ea'], blue: ['#2667e8', '#6ea2ff'],
  amber: ['#e5650f', '#ff9a4d'], green: ['#23955a', '#5fd897'], ink2: ['#57575a', '#a3a3a3'], muted: ['#8c8c90', '#8c8c90'], red: ['#d93a3f', '#ff6b6b'],
};
const DOMAIN_OF = {}; for (const D of DOMAINS) for (const id of D.ids) DOMAIN_OF[id] = D;
const domCss = D => DOM_TOK[D.tok][THEME === 'dark' ? 1 : 0];
// each module's English name and where it lives in the grok-build source
const SIGN_TXT = {
  client: ['ACP CLIENT', 'TUI · IDE · stdio'], acp: ['ACP PORT', 'JSON-RPC · session/*'], queue: ['PROMPT QUEUE', 'pending_inputs'], turn: ['TURN CONTROL', 'handle_prompt'],
  loop: ['AGENT LOOP', 'process_conversation_turn'], gates: ['STOP GATE · GOAL', 'stop_gate.rs · goal_*'],
  sram: ['CONVERSATION', 'ChatState · items'], prefix: ['PROMPT TEMPLATE', 'PromptContext · prompt.md'], compact: ['COMPACTION', 'run_compact_inner'],
  rem: ['REMINDERS', 'push_system_reminder'], skills: ['SKILLS', 'SkillManager · SKILL.md'], mem: ['MEMORY', 'xai-grok-memory'],
  rb: ['REQUEST BUILDER', 'build_conversation_request'], sampler: ['SAMPLER', 'SamplerActor · retry · doom-loop'], phy: ['NETWORK PHY', 'HTTP/2 · SSE /responses'], stream: ['STREAM', 'handle_sampling_event'],
  tools: ['TOOL EXECUTOR', 'execute_tool_calls'], perm: ['PERMISSION', 'PermissionManager'], hooks: ['HOOKS', 'HookDispatcher · 14 events'], runtime: ['TOOL RUNTIME', 'FinalizedToolset::call'], mcp: ['MCP POOL', 'search_tool · use_tool'],
  sub: ['CHILD SESSIONS', 'run_shell_child · workflow'], bg: ['BACKGROUND', 'tasks · monitor · cron'], store: ['LOCAL STORE', 'sessions · checkpoints · memory'],
  front: ['FRONTEND', 'tokenize · batch · quota'], lm: ['MODEL', 'prefill · decode · sample'], hbm: ['KV CACHE', 'HBM · KV pages'], pcache: ['PROMPT CACHE', 'prefix index · 256-token blocks'],
};
// how high each harness module stands: the loop and the busiest paths rise highest
const TIER = {
  loop: 3.4, sampler: 3, perm: 2.7, sram: 2.5, tools: 2.3, compact: 2.1, gates: 2, rb: 1.8, mem: 1.8, stream: 1.6, sub: 1.6, turn: 1.5,
  prefix: 1.4, mcp: 1.4, phy: 1.2, skills: 1.2, acp: 1.1, hooks: 1, bg: 1, rem: 0.9, runtime: 0.8, queue: 0.7,
};
// where a sign's post stands, for modules that are not blocks on the harness die
const SIGN_AT = {
  client: () => [-433, 27, -74], store: () => [(STORE.x0 + STORE.x1) / 2, SUB_Y + 3.4, (STORE.z0 + STORE.z1) / 2],
  front: () => [(FRONT.x0 + FRONT.x1) / 2, DIE_Y + 0.6, (FRONT.z0 + FRONT.z1) / 2], lm: () => [PE.x0 + (PE.n * PE.p) / 2, DIE_Y + 0.6, PE.z0 + (PE.n * PE.p) / 2],
  hbm: () => [HBM[1].x, INT_Y + 13.8, HBM[1].z], pcache: () => [(PIDX.x0 + PIDX.x1) / 2, DIE_Y + 0.6, (PIDX.z0 + PIDX.z1) / 2],
  loop: () => [RING.cx, DIE_Y + TIER.loop + 1.2, RING.cz - 8],
};
function signAnchor(id) {
  if (SIGN_AT[id]) return V(...SIGN_AT[id]());
  const b = bc(id); return V(b.cx, DIE_Y + (TIER[id] || 0) + 0.6, b.cz);
}

// ── tiers: lift each module and fill the gap with a pedestal; a seam in the layer's colour runs under the top ──
function buildTiers() {
  const k = new Kit({ tone: 0.4 }), SEAM = 0.9;
  const hexOf = D => new THREE.Color(DOM_TOK[D.tok][0]).getHex();
  for (const id in TIER) {
    const S = ST[id], h = TIER[id], D = DOMAIN_OF[id]; if (!S) continue;
    S.g.position.y += h; S.pin.y += h; S.work.y += h;
    if (id === 'loop') {
      k.cyl(51, h - SEAM, { p: [RING.cx, DIE_Y, RING.cz], color: MAT.siDark, seg: 96, b: 0.2, tone: 0.42 });
      k.cyl(51.25, SEAM, { p: [RING.cx, DIE_Y + h - SEAM, RING.cz], color: hexOf(D), paint: 0.85, seg: 96, tone: 0.3 });
      for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU, x = RING.cx + Math.cos(a) * 51.05, z = RING.cz + Math.sin(a) * 51.05; if (Math.sin(a) < -0.2 && Math.cos(a) > -0.3) continue; k.line([[x, DIE_Y + 0.15, z], [x, DIE_Y + h - SEAM - 0.1, z]], 'faint'); }
      continue;
    }
    const b = bc(id);
    k.box(b.w, h - SEAM, b.d, { p: [b.cx, DIE_Y, b.cz], b: 0.15, color: MAT.siDark, tone: 0.42 });
    k.box(b.w + 0.5, SEAM, b.d + 0.5, { p: [b.cx, DIE_Y + h - SEAM, b.cz], color: hexOf(D), paint: 0.85, tone: 0.3 });
    // through-silicon vias down the two faces the camera sees
    if (h - SEAM > 0.5) {
      for (let x = b.x0 + 2; x < b.x1 - 1; x += 3) k.line([[x, DIE_Y + 0.12, b.z1 + 0.04], [x, DIE_Y + h - SEAM - 0.1, b.z1 + 0.04]], 'faint');
      for (let z = b.z0 + 2; z < b.z1 - 1; z += 3) k.line([[b.x0 - 0.04, DIE_Y + 0.12, z], [b.x0 - 0.04, DIE_Y + h - SEAM - 0.1, z]], 'faint');
    }
  }
  k.finish(world);
}

// ── signs ──
const SIGNS = [], DOMAIN_SIGNS = [];
let signsOn = true, domainFocus = null;
const SIGN_GEO = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
const STEM_GEO = new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 1, 0)]);
const SIGN_FONT_ZH = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif';
function signCanvas(w, h, paint) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { w, h, tex, paint() { g.clearRect(0, 0, w, h); paint(g, w, h); tex.needsUpdate = true; } };
}
// the glass: a pale (or dark) translucent plate, a hairline edge, a highlight along the top
function plateBg(g, w, h, acc, strong) {
  const dark = THEME === 'dark', P = PALETTES[THEME];
  g.fillStyle = dark ? `rgba(22,22,24,${strong ? 0.9 : 0.72})` : `rgba(252,252,250,${strong ? 0.92 : 0.74})`;
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fill();
  g.lineWidth = strong ? 4 : 2; g.strokeStyle = strong ? acc : P.ink; g.globalAlpha = strong ? 1 : 0.38; g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.95)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(18, 6); g.lineTo(w - 18, 6); g.stroke();
}
function makeSignPlate(W, H, paint, order) {
  const cv = signCanvas(W, H, paint);
  const plate = new THREE.Mesh(SIGN_GEO, new THREE.MeshBasicMaterial({ map: cv.tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  plate.renderOrder = order; plate.visible = false; OVERLAY.add(plate);
  const stem = new THREE.Line(STEM_GEO, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, color: new THREE.Color(PALETTES[THEME].ink) }));
  stem.layers.set(1); stem.renderOrder = 2; stem.visible = false; world.add(stem);
  return { cv, plate, stem };
}
function makeSign(id) {
  const St = ST[id], D = DOMAIN_OF[id], [en, src] = SIGN_TXT[id];
  const s = { id, D, St, anchor: signAnchor(id), strong: false, k: 0, alpha: 0, post: 14, goal: 14, want: false, status: '', mode: '', prio: TIER[id] || 1, scale: 1 };
  Object.assign(s, makeSignPlate(512, 184, (g, w, h) => {
    const P = PALETTES[THEME], acc = domCss(D);
    plateBg(g, w, h, s.mode === 'err' ? DOM_TOK.red[THEME === 'dark' ? 1 : 0] : s.mode === 'wait' ? '#e3b320' : acc, s.strong || !!s.mode);
    g.fillStyle = acc; g.beginPath(); g.roundRect(14, 20, 8, h - 40, 4); g.fill();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = `600 26px ${FONT_MONO}`; g.fillStyle = acc; const kick = `${D.zh} · ${D.en}`; g.fillText(g.measureText(kick).width < w - 100 ? kick : D.zh, 38, 48);
    g.textAlign = 'right'; g.fillStyle = P.ink; g.globalAlpha = 0.5; g.fillText(String(St.n).padStart(2, '0'), w - 22, 48); g.globalAlpha = 1; g.textAlign = 'left';
    g.font = `600 52px ${SIGN_FONT_ZH}`; g.fillStyle = P.ink; const zh = fitText(g, St.name, w - 70); g.fillText(zh, 36, 112);
    const zw = g.measureText(zh).width;
    g.font = `500 25px ${FONT_MONO}`; g.globalAlpha = 0.62; if (zw + 70 + g.measureText(en).width < w - 30) g.fillText(en, 36 + zw + 16, 110); g.globalAlpha = 1;
    // the bottom line: the source name, or what the module is doing right now
    const live = s.strong && s.status;
    g.font = `${live ? 600 : 400} 25px ${FONT_MONO}`; g.fillStyle = live ? acc : P.ink; g.globalAlpha = live ? 1 : 0.58;
    g.fillText(fitText(g, live ? `● ${s.status}` : src, w - 60), 36, 154); g.globalAlpha = 1;
  }, 10));
  s.cv.paint(); THEMED.push(() => { s.stem.material.color.set(PALETTES[THEME].ink); s.cv.paint(); });
  return s;
}
function makeDomainSign(D) {
  const pts = D.ids.filter(id => ST[id]).map(signAnchor), c = pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / pts.length);
  // the leader ends on the layer's most central module, so it points at something real
  let best = pts[0]; for (const p of pts) if (p.distanceTo(c) < best.distanceTo(c)) best = p;
  const s = { D, anchor: best.clone(), k: 0, alpha: 0, lx: 0, ly: 0, ax: 0, ay: 0 };
  Object.assign(s, makeSignPlate(560, 168, (g, w, h) => {
    const P = PALETTES[THEME], acc = domCss(D);
    plateBg(g, w, h, acc, true);
    g.fillStyle = acc; g.beginPath(); g.roundRect(14, 20, 10, h - 40, 5); g.fill();
    g.font = `600 30px ${FONT_MONO}`; g.fillStyle = acc; g.fillText(fitText(g, D.en, w - 70), 42, 58);
    g.font = `600 54px ${SIGN_FONT_ZH}`; g.fillStyle = P.ink; g.fillText(D.zh, 42, 124);
    const zw = g.measureText(D.zh).width; g.font = `500 28px ${FONT_MONO}`; g.globalAlpha = 0.6; g.fillText(`${D.ids.length} 个模块`, 42 + zw + 18, 122); g.globalAlpha = 1;
  }, 20));
  s.stem.visible = false;
  s.leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthTest: false }));
  s.dot = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false }));
  s.leader.renderOrder = s.dot.renderOrder = 19; s.leader.visible = s.dot.visible = false; OVERLAY.add(s.leader, s.dot);
  const tint = () => { s.leader.material.color.set(domCss(D)); s.dot.material.color.set(domCss(D)); };
  tint(); s.cv.paint(); THEMED.push(() => { tint(); s.cv.paint(); });
  return s;
}
function buildSigns() {
  for (const id in SIGN_TXT) if (ST[id] && DOMAIN_OF[id]) SIGNS.push(makeSign(id));
  for (const D of DOMAINS) DOMAIN_SIGNS.push(makeDomainSign(D));
  // canvas text does not ask for web-font subsets by itself, so ask for the glyphs the signs use
  const text = [...SIGNS.map(s => s.St.name), ...DOMAINS.map(D => D.zh), '个模块'].join('');
  document.fonts?.load?.(`600 52px "Noto Sans SC"`, text).then(() => { for (const s of [...SIGNS, ...DOMAIN_SIGNS]) s.cv.paint(); }).catch(() => {});
}

// ── per frame: size for the screen, stack the signs so none covers another, fade by zoom ──
const _sp = V();
let VIEW_BOX = { l: 0, r: 0, t: 0, b: 0 };
function signScreen(p) {
  _sp.copy(p).project(camera);
  const x = (_sp.x * 0.5 + 0.5) * innerWidth, y = (-_sp.y * 0.5 + 0.5) * innerHeight;
  return [x, y, x > VIEW_BOX.l && x < VIEW_BOX.r && y > VIEW_BOX.t && y < VIEW_BOX.b];
}
// place signs in priority order; each one climbs its post until it clears the ones already placed
function stackSigns(list, wpx, hpx, pxu, minPost, maxPost) {
  const placed = [], ce = Math.cos(CAM.el), pad = 5;
  for (const s of list) {
    const [ax, ay, on] = signScreen(s.anchor), sw = wpx * s.scale, sh = hpx * s.scale;
    s.want = false; if (!on) continue;
    let post = minPost, ok = false;
    for (let guard = 0; guard < 12; guard++) {
      const bot = ay - post * ce * pxu, top = bot - sh, l = ax - sw / 2, r = ax + sw / 2;
      const hit = placed.find(q => l < q.r + pad && r > q.l - pad && top < q.b + pad && bot > q.t - pad);
      if (!hit) { ok = true; placed.push({ l, r, t: top, b: bot }); break; }
      post = (ay - hit.t + pad) / (ce * pxu) + 0.5;
      if (post > maxPost) break;
    }
    if (ok || s.k > 0.5) { s.want = true; s.goal = Math.min(post, maxPost); }
  }
}
function updateSigns(dt) {
  const pxu = innerHeight / CAM.zoom, narrow = innerWidth < 600;
  const near = signsOn ? clamp((560 - CAM.zoom) / 140, 0, 1) : 0, far = signsOn ? clamp((CAM.zoom - 520) / 160, 0, 1) : 0;
  const grow = clamp(Math.sqrt(230 / CAM.zoom), 0.82, 1.3), wpx = (narrow ? 140 : 188) * grow, hpx = (wpx * 184) / 512;
  const tgt = CAM.target, quat = camera.quaternion, A = freeArea();
  VIEW_BOX = { l: A.left + 8, r: innerWidth - A.right - 8, t: A.top - 20, b: innerHeight - A.bottom + 10 };
  // module signs: the busy ones first, then the ones nearest the middle of the view, then the tall ones
  for (const s of SIGNS) {
    const St = s.St, act = Math.max(St.lit, St.state !== 'idle' ? 1 : 0, domainFocus === s.D.id ? 0.6 : 0);
    s.k = damp(s.k, act, 5, dt);
    const strong = s.k > 0.55, status = strong ? St.status || '' : '', mode = St.state === 'error' ? 'err' : St.state === 'wait' ? 'wait' : '';
    if (strong !== s.strong || status !== s.status || mode !== s.mode) { s.strong = strong; s.status = status; s.mode = mode; s.cv.paint(); }
    s.scale = 1 + 0.12 * clamp(s.k, 0, 1);
    s.rank = (strong ? 1e6 : 0) + (domainFocus === s.D.id ? 5e5 : 0) - Math.hypot(s.anchor.x - tgt.x, s.anchor.z - tgt.z) + s.prio * 6;
  }
  if (near > 0) stackSigns([...SIGNS].sort((a, b) => b.rank - a.rank), wpx, hpx, pxu, narrow ? 11 : 9, 64);
  for (const s of SIGNS) {
    const dim = domainFocus && domainFocus !== s.D.id ? 0.16 : 1;
    s.alpha = damp(s.alpha, near > 0 && s.want ? near * dim : 0, 6, dt);
    s.post = damp(s.post, s.goal, 6, dt);
    placeSign(s, (wpx * s.scale) / pxu, (hpx * s.scale) / pxu, quat);
  }
  // layer callouts, when the whole chip is in view
  const dw = narrow ? 138 : 176, dh = (dw * 168) / 560;
  if (far > 0) layoutCallouts(DOMAIN_SIGNS, dw, dh);
  for (const s of DOMAIN_SIGNS) {
    const dim = domainFocus && domainFocus !== s.D.id ? 0.3 : 1;
    s.alpha = damp(s.alpha, far * dim, 6, dt);
    placeCallout(s, dw, dh, pxu, quat);
  }
  // close up, the signs carry the module numbers, so the numbered pins step aside
  pinsEl.classList.toggle('signed', near > 0.5);
}
function placeSign(s, w, h, quat) {
  const show = s.alpha > 0.02; s.plate.visible = s.stem.visible = show; if (!show) return;
  s.plate.position.set(s.anchor.x, s.anchor.y + s.post, s.anchor.z);
  s.plate.quaternion.copy(quat); s.plate.scale.set(w, h, 1);
  s.plate.material.opacity = s.alpha;
  s.stem.position.copy(s.anchor); s.stem.scale.set(1, s.post, 1); s.stem.material.opacity = 0.55 * s.alpha;
}
// callouts: one band above the drawing and one below, each label as near its anchor as the others allow
const _cp = V();
function layoutCallouts(list, w, h) {
  const A = freeArea(), L = A.left + 12, R = innerWidth - A.right - 12, gap = 10, rowH = h + 8;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of OV_BOX) { const [, y] = signScreen(p); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bands = [[], []];
  for (const s of list) { const [ax, ay] = signScreen(s.anchor); s.ax = ax; s.ay = ay; }
  // the nearer half of the anchors goes below, the farther half above
  [...list].sort((a, b) => a.ay - b.ay).forEach((s, i, all) => bands[i < all.length / 2 ? 0 : 1].push(s));
  const perRow = Math.max(1, Math.floor((R - L + gap) / (w + gap)));
  bands.forEach((band, bi) => {
    band.sort((a, b) => a.ax - b.ax);
    const rows = Math.ceil(band.length / perRow), Ht = rows * rowH - 8;
    const start = bi === 0 ? clamp(y0 - 14 - Ht, A.top + 6, Infinity) : Math.min(y1 + 14, innerHeight - A.bottom - 6 - Ht);
    for (let r = 0; r < rows; r++) {
      const row = band.filter((_, i) => i % rows === r), xs = row.map(s => s.ax - w / 2);
      for (let it = 0; it < 40; it++) {
        for (let i = 1; i < xs.length; i++) { const ov = xs[i - 1] + w + gap - xs[i]; if (ov > 0) { xs[i - 1] -= ov / 2; xs[i] += ov / 2; } }
        for (let i = 0; i < xs.length; i++) xs[i] = clamp(xs[i], L, Math.max(L, R - w));
      }
      // the row nearest the drawing holds the labels whose anchors are nearest the band's edge
      const y = bi === 0 ? start + (rows - 1 - r) * rowH : start + r * rowH;
      row.forEach((s, i) => { s.lx = xs[i]; s.ly = y; });
    }
  });
}
function screenToWorld(x, y, z, out) { return out.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, z).unproject(camera); }
function placeCallout(s, w, h, pxu, quat) {
  const show = s.alpha > 0.02; s.plate.visible = s.leader.visible = s.dot.visible = show; if (!show) return;
  _sp.copy(s.anchor).project(camera); const z = _sp.z, above = s.ly + h < s.ay;
  screenToWorld(s.lx + w / 2, s.ly + h, z, s.plate.position);
  s.plate.quaternion.copy(quat); s.plate.scale.set(w / pxu, h / pxu, 1); s.plate.material.opacity = s.alpha;
  // the leader leaves the label's nearer edge, straight above or below the anchor where it can
  const ex = clamp(s.ax, s.lx + 14, s.lx + w - 14), ey = above ? s.ly + h : s.ly;
  const pos = s.leader.geometry.attributes.position;
  screenToWorld(ex, ey, z, _cp); pos.setXYZ(0, _cp.x, _cp.y, _cp.z);
  pos.setXYZ(1, s.anchor.x, s.anchor.y, s.anchor.z); pos.needsUpdate = true; s.leader.geometry.computeBoundingSphere();
  s.leader.material.opacity = 0.85 * s.alpha;
  s.dot.position.copy(s.anchor); s.dot.quaternion.copy(quat); s.dot.scale.setScalar(3.4 / pxu); s.dot.material.opacity = s.alpha;
}
// the points a layer covers, for the camera to frame it
function domainPoints(id) {
  const D = DOMAINS.find(x => x.id === id), pts = [];
  for (const sid of D?.ids || []) {
    if (BLK[sid]) { const b = bc(sid); pts.push(V(b.x0, DIE_Y, b.z0), V(b.x1, DIE_Y, b.z1), V(b.x0, DIE_Y + 40, b.z0), V(b.x1, DIE_Y + 40, b.z1)); }
    else { const p = signAnchor(sid); pts.push(p.clone().add(V(-30, -4, -30)), p.clone().add(V(30, 40, 30))); }
  }
  return pts;
}
// a sign under the pointer, for clicks
function signAt(ray) {
  const live = [...SIGNS, ...DOMAIN_SIGNS].filter(s => s.plate.visible && s.alpha > 0.4);
  const hit = ray.intersectObjects(live.map(s => s.plate), false)[0];
  return hit ? live.find(s => s.plate === hit.object) : null;
}

// ── the layer legend in the instruments panel: built once, then only its classes change ──
function renderDomains() {
  const el = $('#domains'); if (!el) return;
  el.innerHTML = DOMAINS.map(D => {
    const live = D.ids.filter(id => ST[id]);
    return `<li data-dom="${D.id}" style="--c: var(--${D.tok === 'ink2' ? 'ink-2' : D.tok})" tabindex="0" role="button" aria-pressed="false" title="模块 ${live.map(id => ST[id].n).join(' · ')}"><i></i><span><b>${esc(D.zh)}</b><small>${esc(D.en)} · ${live.length}</small></span></li>`;
  }).join('');
  updateDomains();
}
function updateDomains() {
  for (const li of document.querySelectorAll('#domains li[data-dom]')) {
    const D = DOMAINS.find(x => x.id === li.dataset.dom), busy = D.ids.some(id => ST[id] && (ST[id].state !== 'idle' || ST[id].lit > 0.5)), sel = domainFocus === D.id;
    li.classList.toggle('on', busy); li.classList.toggle('sel', sel); li.setAttribute('aria-pressed', String(sel));
  }
}
function setDomainFocus(id) {
  domainFocus = domainFocus === id ? null : id;
  if (domainFocus) { camMode = 'domain'; camStation = null; userZoom = 1; document.querySelectorAll('#view-seg button').forEach(b => b.setAttribute('aria-pressed', 'false')); }
  else setView('follow');
  updateDomains();
}
$('#domains')?.addEventListener('click', ev => { const li = ev.target.closest('li[data-dom]'); if (li) { userTouched = true; setDomainFocus(li.dataset.dom); } });
$('#domains')?.addEventListener('keydown', ev => { const li = ev.target.closest('li[data-dom]'); if (li && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); userTouched = true; setDomainFocus(li.dataset.dom); } });
$('#signs-btn')?.addEventListener('click', ev => { signsOn = ev.currentTarget.getAttribute('aria-pressed') !== 'true'; ev.currentTarget.setAttribute('aria-pressed', String(signsOn)); });
