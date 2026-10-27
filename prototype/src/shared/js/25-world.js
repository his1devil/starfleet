// ═════════════════════════ the world and its stations ═════════════════════════
// A station is a group of static kit parts plus a few live parts, a work point the agent's
// gripper visits, and a pin point for its numbered marker. Every scene registers its own.
const world = group(scene);

function ringPts(cx, y, cz, r, n = 24, axis = 'y') {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r;
    pts.push(axis === 'y' ? [cx + c, y, cz + s] : axis === 'z' ? [cx + c, y + s, cz] : [cx, y + c, cz + s]);
  }
  return pts;
}
function haloTexture(w, h, r, blur) {
  const pad = blur * 2, c = mkCanvas(w + pad * 2, h + pad * 2), g = c.getContext('2d');
  g.filter = `blur(${blur}px)`; g.fillStyle = '#000';
  g.beginPath(); g.roundRect(pad, pad, w, h, r); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, sw: (w + pad * 2) / w, sh: (h + pad * 2) / h };
}

const ST = {}, ST_LIST = [];
const STATE_TXT = { idle: '待机', busy: '工作中', wait: '等待', error: '异常' };
// while a station builds, printed labels join its group, so they move (and click) with it
let SILK_PARENT = null;
function station(id, def) {
  const S = { id, n: ST_LIST.length + 1, lit: 0, litGoal: 0, state: 'idle', stateUntil: 0, status: '', events: [], uses: 0, ...def };
  S.g = group(world);
  SILK_PARENT = S.g;
  try { S.refs = def.build(S, S.g) || {}; } finally { SILK_PARENT = null; }
  S.g.traverse(o => { if (o.isMesh) o.userData.station = S; });
  S.work = V(...def.work); S.pin = V(...def.pin);
  ST[id] = S; ST_LIST.push(S);
  return S;
}
const fx = { drops: null, puffs: null };
function liquidFill(profileOuter, level) {
  // a solid of revolution filled from the bottom of a vessel profile [[r, y]...] (outer wall, bottom → top) to `level`
  const P = [[0, profileOuter[0][1]]];
  for (let i = 0; i < profileOuter.length; i++) {
    const [r, y] = profileOuter[i];
    if (y >= level) { const [r0, y0] = profileOuter[i - 1] || [r, y]; const t = (level - y0) / Math.max(1e-6, y - y0); P.push([lerp(r0, r, t), level]); break; }
    P.push([r, y, 1]);
  }
  P.push([0, P[P.length - 1][1]]);
  return P;
}
// live fills change every few frames, so they are built fresh rather than memoised
const fillGeo = (outer, level, seg = 28) => latheRaw(liquidFill(outer, level).map(([r, y, s]) => [Math.max(0, r - 0.25), y, s]), seg);

// ── small parts every scene uses: LCD text, lamps ──
function fitText(c, text, maxW) { text = String(text ?? ''); if (c.measureText(text).width <= maxW) return text; while (text.length > 1 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1); return text + '…'; }
// an instrument LCD: a bold title row and a few body rows
function lcdDraw(c, w, h, s, P) {
  const rows = s.rows || 4, lh = h / (rows + 1.4);
  c.fillStyle = P.screenInk; c.textBaseline = 'top';
  c.font = `600 ${lh * 0.74}px ${FONT_MONO}`; c.fillText(fitText(c, s.title || '', w * 0.92), w * 0.04, lh * 0.3);
  c.globalAlpha = 0.25; c.fillRect(w * 0.04, lh * 1.2, w * 0.92, Math.max(1, h * 0.008)); c.globalAlpha = 0.85;
  c.font = `400 ${lh * 0.66}px ${FONT_MONO}`;
  (s.lines || []).slice(0, rows).forEach((ln, i) => c.fillText(fitText(c, ln, w * 0.92), w * 0.04, lh * (1.45 + i)));
  c.globalAlpha = 1;
}
// a lamp whose glow the director sets (0…1) and whose colour it can change
function lampMesh(parent, p, r = 1, hex = FLUID.ok) { return mesh(sphereGeo(r, 12, 10), solid(0xffffff, { glow: 0.08, glowColor: hex }), parent, p, [0, 0, 0], { tone: 0.6, cast: false }); }
const setLamp = (m, k, hex) => { m.material.userData.u.uGlow.value = k; if (hex != null) m.material.userData.u.uGlowColor.value.set(hex); };
