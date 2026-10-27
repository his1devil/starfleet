// ═════════════════════════ glyphs: a small sculpture on each block that says what it does ═════════════════════════
// A floorplan is a field of rectangles; these turn them into instruments you can tell apart at a
// glance. Each glyph stands on the block's top face at (x, z), about `s` units across.
const BTOP = DIE_Y + 0.5;
function shapeGeo(pts, depth) { const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))); return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 10 }); }
const GLYPH = {
  // gathering many inputs into one request
  funnel(k, x, z, s) { const q = s / 8; k.add(latheGeo([[0, 0], [1.2 * q, 0], [1.2 * q, 1.4 * q], [4 * q, 4 * q, 1], [4 * q, 4.6 * q], [3.6 * q, 4.6 * q], [0.8 * q, 1.6 * q], [0, 1.6 * q]], 28), { p: [x, BTOP, z], color: MAT.paper, tone: 0.65 }); },
  // a dial with a needle: timing and sampling
  dial(k, x, z, s) { const r = s / 2; k.cyl(r, 0.9, { p: [x, BTOP, z], color: MAT.paper, seg: 32, b: 0.25, tone: 0.65 }); for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; k.line([[x + Math.cos(a) * r * 0.78, BTOP + 0.94, z + Math.sin(a) * r * 0.78], [x + Math.cos(a) * r * (i % 6 ? 0.9 : 0.96), BTOP + 0.94, z + Math.sin(a) * r * (i % 6 ? 0.9 : 0.96)]], 'mid'); } k.box(0.4, 0.3, r * 0.75, { p: [x + r * 0.2, BTOP + 0.9, z - r * 0.25], r: [0, 0.7, 0], color: MAT.redlamp, paint: 1 }); k.cyl(0.6, 0.6, { p: [x, BTOP + 0.9, z], color: MAT.graphite, seg: 12 }); },
  // one input splitting three ways
  split(k, x, z, s) { const q = s / 8, y = BTOP + 0.7; k.cyl(1.1 * q, 1.4, { p: [x - 3.4 * q, BTOP, z], color: MAT.paper, seg: 16 }); for (const dz of [-3, 0, 3]) { k.tube([[x - 3.4 * q, y, z], [x - 0.6 * q, y, z + dz * q * 0.4], [x + 3.6 * q, y, z + dz * q]], 0.45 * q, { color: MAT.steel, radial: 8, bend: 2 * q }); k.cyl(0.8 * q, 1.4, { p: [x + 3.8 * q, BTOP, z + dz * q], color: MAT.paper, seg: 14 }); } },
  // a shield: permission
  shield(k, x, z, s) { const q = s / 8, pts = [[0, 4], [3.2, 3], [3.2, 0.4], [0, -4], [-3.2, 0.4], [-3.2, 3]].map(([a, b]) => [a * q, b * q]); k.add(shapeGeo(pts, 1.2), { p: [x, BTOP + 1.2, z], r: [Math.PI / 2, 0, 0], color: MAT.paper, tone: 0.7 }); k.add(shapeGeo(pts.map(([a, b]) => [a * 0.62, b * 0.62 + 0.2 * q]), 0.4), { p: [x, BTOP + 1.6, z], r: [Math.PI / 2, 0, 0], color: MAT.hazard, paint: 1, tone: 0.6 }); },
  // a comb: one tooth per hook line
  comb(k, x, z, s) { const q = s / 8; k.box(8 * q, 1, 1.6 * q, { p: [x, BTOP, z - 2.4 * q], b: 0.2, color: MAT.paper, tone: 0.65 }); for (let i = 0; i < 7; i++) k.box(0.5 * q, 0.8, 3.6 * q, { p: [x - 3.4 * q + i * 1.13 * q, BTOP, z + 0.4 * q], color: MAT.steel, tone: 0.55 }); },
  // a plug: an outside server attached
  plug(k, x, z, s) { const q = s / 8; k.box(4.4 * q, 2.6, 3.4 * q, { p: [x - 1 * q, BTOP, z], rr: 0.6, b: 0.3, color: MAT.paper, tone: 0.65 }); for (const dz of [-0.9, 0.9]) k.cyl(0.35 * q, 3 * q, { p: [x + 1.2 * q, BTOP + 1.3, z + dz * q], r: [0, 0, -Math.PI / 2], color: MAT.brass, seg: 10 }); k.tube([[x - 3.2 * q, BTOP + 1.3, z], [x - 5 * q, BTOP + 0.6, z + 1.5 * q]], 0.4 * q, { color: MAT.graphite, radial: 6 }); },
  // a database: memory
  db(k, x, z, s) { const r = s / 2.6; for (let i = 0; i < 3; i++) k.cyl(r, 1.1, { p: [x, BTOP + i * 1.35, z], color: i === 2 ? MAT.paper : MAT.pale, seg: 28, b: 0.3, tone: 0.65 }); },
  // books: skills
  books(k, x, z, s) { const q = s / 8; [[MAT.paper, 0, 0], [MAT.cork, 0.5, 0.2], [MAT.pale, -0.3, -0.25]].forEach(([c, dx, rot], i) => k.box(5 * q, 0.9, 3.4 * q, { p: [x + dx * q, BTOP + i * 0.95, z], r: [0, rot, 0], rr: 0.3, color: c, tone: 0.65 })); },
  // a pinned note: reminders
  note(k, x, z, s) { const q = s / 8; k.box(5 * q, 0.35, 6 * q, { p: [x, BTOP, z], r: [0, 0.18, 0], color: MAT.paper, tone: 0.6 }); for (let i = 0; i < 3; i++) k.line([[x - 1.6 * q, BTOP + 0.4, z - 0.6 * q + i * 1.4 * q], [x + 1.8 * q, BTOP + 0.4, z - 1 * q + i * 1.4 * q]], 'lo'); k.add(sphereGeo(0.7 * q, 12, 10), { p: [x - 0.4 * q, BTOP + 0.9, z - 2.2 * q], color: MAT.redlamp, paint: 1 }); },
  // a terminal: bash
  terminal(k, x, z, s) { const q = s / 8; k.box(5.4 * q, 3.2, 1.4 * q, { p: [x, BTOP, z], rr: 0.4, b: 0.25, color: MAT.paper, tone: 0.65 }); k.box(4.4 * q, 2.2, 0.2, { p: [x, BTOP + 0.5, z + 0.75 * q], color: MAT.graphite, tone: 0.5 }); },
  // a pencil: edits
  pencil(k, x, z, s) { const q = s / 8; k.cyl(0.7 * q, 5.4 * q, { p: [x - 2.2 * q, BTOP + 0.8, z + 1.4 * q], r: [0, 0.7, -Math.PI / 2], color: MAT.hazard, paint: 1, seg: 6 }); k.add(coneGeo(0.7 * q, 0.05, 1.6 * q, 6), { p: [x + 1.7 * q, BTOP + 0.8, z - 1.2 * q], r: [0, 0.7, -Math.PI / 2], color: MAT.cork }); },
  // a magnifier: reading and searching
  lens(k, x, z, s) { const q = s / 8; k.torus(1.9 * q, 0.42 * q, { p: [x - 0.6 * q, BTOP + 0.45, z - 0.6 * q], tub: 24, color: MAT.steel }); k.box(0.7 * q, 0.7, 3 * q, { p: [x + 1.6 * q, BTOP + 0.1, z + 1.6 * q], r: [0, -0.785, 0], color: MAT.graphite }); },
  // a globe: the web
  globe(k, x, z, s) { const r = s / 3; k.add(sphereGeo(r, 20, 14), { p: [x, BTOP + r, z], color: MAT.paper, tone: 0.65 }); k.torus(r * 1.02, 0.12, { p: [x, BTOP + r, z], tub: 32, color: MAT.steel }); k.torus(r * 1.02, 0.12, { p: [x, BTOP + r, z], r: [0, 0, Math.PI / 2], tub: 32, color: MAT.steel }); },
  // a question mark balloon: asking the user
  ask(k, x, z, s) { const q = s / 8; k.cyl(2.6 * q, 0.8, { p: [x, BTOP, z], color: MAT.paper, seg: 24, b: 0.25 }); k.add(coneGeo(1 * q, 0.05, 1.6 * q, 8), { p: [x - 1.4 * q, BTOP, z + 2.6 * q], r: [Math.PI / 2, 0, 0], color: MAT.paper }); },
  // a checklist: plans and todos
  list(k, x, z, s) { const q = s / 8; for (let i = 0; i < 3; i++) { k.box(1.2 * q, 0.6, 1.2 * q, { p: [x - 2.4 * q, BTOP, z - 2 * q + i * 2 * q], color: i === 0 ? MAT.greenlamp : MAT.paper, paint: i === 0 ? 1 : 0 }); k.box(3.6 * q, 0.4, 0.7 * q, { p: [x + 0.6 * q, BTOP, z - 2 * q + i * 2 * q], color: MAT.pale }); } },
  // a flag: goals
  flag(k, x, z, s) { const q = s / 8; k.cyl(0.25 * q, 6 * q, { p: [x - 1.6 * q, BTOP, z], color: MAT.steel, seg: 8 }); k.add(shapeGeo([[0, 0], [3.4 * q, -1.2 * q], [0, -2.4 * q]], 0.3), { p: [x - 1.6 * q, BTOP + 6 * q, z], color: MAT.greenlamp, paint: 1 }); },
  // stacked chips: child sessions
  stack(k, x, z, s) { const q = s / 8; for (let i = 0; i < 3; i++) k.box(4.6 * q, 0.6, 4.6 * q, { p: [x + i * 0.6 * q, BTOP + i * 0.9, z - i * 0.6 * q], rr: 0.4, b: 0.15, color: i === 2 ? MAT.paper : MAT.pale, tone: 0.65 }); },
  // a gear: the runtime
  gear(k, x, z, s) { const q = s / 8, pts = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, r = (i % 2 ? 2.6 : 3.4) * q; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } k.add(shapeGeo(pts, 1), { p: [x, BTOP + 1, z], r: [Math.PI / 2, 0, 0], color: MAT.paper, tone: 0.65 }); k.cyl(1 * q, 1.2, { p: [x, BTOP, z], color: MAT.steel, seg: 16 }); },
  // a clock: background and schedules
  clock(k, x, z, s) { GLYPH.dial(k, x, z, s); },
  // a press: compaction
  press(k, x, z, s) { const q = s / 8; k.box(6 * q, 0.8, 4 * q, { p: [x, BTOP, z], color: MAT.steel }); for (const dx of [-2.4, 2.4]) k.cyl(0.35 * q, 4.4 * q, { p: [x + dx * q, BTOP + 0.8, z], color: MAT.steel, seg: 10 }); k.box(6 * q, 1, 4 * q, { p: [x, BTOP + 3.6 * q, z], color: MAT.paper, tone: 0.65 }); k.box(3.4 * q, 1.4, 2.4 * q, { p: [x, BTOP + 2.2 * q, z], color: MAT.alu }); },
  // a padlock: the sealed prompt template
  lock(k, x, z, s) { const q = s / 8; k.box(5 * q, 1.4, 3.6 * q, { p: [x, BTOP, z], rr: 0.6, color: MAT.brass, tone: 0.6 }); k.add(torusGeo(1.5 * q, 0.38 * q, 6, 20, Math.PI), { p: [x, BTOP + 1.4, z], r: [Math.PI / 2, 0, 0], color: MAT.steel }); },
  // a doorway: the ACP port
  door(k, x, z, s) { const q = s / 8; for (const dx of [-2.2, 2.2]) k.box(0.8 * q, 4 * q, 0.8 * q, { p: [x + dx * q, BTOP, z], color: MAT.paper }); k.box(5.2 * q, 0.8 * q, 0.8 * q, { p: [x, BTOP + 4 * q, z], color: MAT.paper }); },
  // arrows into a slot: the queue
  fifo(k, x, z, s) { const q = s / 8; for (let i = 0; i < 3; i++) k.add(shapeGeo([[0, 0.9 * q], [1.4 * q, 0], [0, -0.9 * q]], 0.4), { p: [x - 2.4 * q + i * 2 * q, BTOP + 0.4, z], r: [Math.PI / 2, 0, 0], color: i === 2 ? MAT.paper : MAT.pale }); },
};
function glyph(k, kind, x, z, s = 8) { (GLYPH[kind] || GLYPH.gear)(k, x, z, s); }
