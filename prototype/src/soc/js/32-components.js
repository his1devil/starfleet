// ═════════════════════════ discrete parts: the capacitors, inductors and regulators around the dies ═════════════════════════
// A real package is ringed with power parts at very different heights; drawing them gives the
// flat floorplan a skyline. Every part stands at y0 (the surface it sits on).
function cmpEcap(k, x, z, y0, r = 2.8, h = 10) {
  k.cyl(r, h, { p: [x, y0, z], color: MAT.alu, seg: 22, b: 0.5, tone: 0.55 });
  k.cyl(r + 0.06, h * 0.32, { p: [x, y0 + h * 0.18, z], color: MAT.graphite, seg: 22, tone: 0.5 });
  k.box(0.6, h * 0.62, 0.3, { p: [x + r * 0.7, y0 + h * 0.2, z + r * 0.72], r: [0, Math.PI / 4, 0], color: MAT.paper, tone: 0.5 });
  const t = y0 + h + 0.03; k.line([[x - r * 0.55, t, z], [x + r * 0.55, t, z]], 'lo'); k.line([[x, t, z - r * 0.55], [x, t, z + r * 0.55]], 'lo');
}
function cmpInductor(k, x, z, y0, s = 7, h = 5) { k.box(s, h, s, { p: [x, y0, z], rr: 1.3, b: 0.5, color: MAT.graphite, tone: 0.6 }); k.line(ringPts(x, y0 + h + 0.03, z, s * 0.26, 16), 'lo'); }
function cmpTant(k, x, z, y0, rot = 0) { k.box(4.4, 2.4, 3, { p: [x, y0, z], r: [0, rot, 0], rr: 0.4, b: 0.2, color: MAT.hazard, paint: 0.6, tone: 0.55 }); k.box(0.7, 2.45, 3.05, { p: [x - 1.6 * Math.cos(rot), y0, z + 1.6 * Math.sin(rot)], r: [0, rot, 0], color: MAT.graphite }); }
function cmpMlcc(k, x0, z, y0, n, step = 3.2, horiz = true) { for (let i = 0; i < n; i++) { const x = horiz ? x0 + i * step : x0, zz = horiz ? z : z + i * step; k.box(2.4, 1.3, 1.4, { p: [x, y0, zz], r: [0, horiz ? 0 : Math.PI / 2, 0], color: MAT.ceramic, tone: 0.45 }); for (const s of [-1, 1]) k.box(0.5, 1.35, 1.45, { p: [x + (horiz ? s * 1 : 0), y0, zz + (horiz ? 0 : s * 1)], r: [0, horiz ? 0 : Math.PI / 2, 0], color: MAT.steel, tone: 0.4 }); } }
function cmpXtal(k, x, z, y0) { k.box(8, 2.6, 3.4, { p: [x, y0, z], rr: 1.69, b: 0.4, color: MAT.alu, tone: 0.6 }); k.line([[x - 2.4, y0 + 2.63, z], [x + 2.4, y0 + 2.63, z]], 'lo'); }
// a regulator: a small chip under a finned heatsink
function cmpVrm(k, x, z, y0, w = 14, fins = 7, h = 7) {
  k.box(w, 1.4, w, { p: [x, y0, z], rr: 0.6, color: MAT.graphite, tone: 0.5 });
  k.box(w - 1, 1, w - 1, { p: [x, y0 + 1.4, z], color: MAT.alu, tone: 0.55 });
  for (let i = 0; i < fins; i++) k.box(0.8, h, w - 2, { p: [x - (w - 3) / 2 + (i * (w - 3)) / (fins - 1), y0 + 2.4, z], color: MAT.alu, tone: 0.6 });
}
function cmpSiCap(k, x, z, y0, w = 6, d = 3) { k.box(w, 0.6, d, { p: [x, y0, z], color: 0x6a6c72, tone: 0.45 }); for (const s of [-1, 1]) k.box(0.8, 0.65, d, { p: [x + s * (w / 2 - 0.4), y0, z], color: MAT.gold, tone: 0.35 }); }
function cmpResNet(k, x, z, y0) { k.box(8, 1.2, 2.6, { p: [x, y0, z], color: MAT.graphite, tone: 0.5 }); for (let i = 0; i < 4; i++) k.box(0.7, 1.25, 2.65, { p: [x - 3 + i * 2, y0, z], color: MAT.steel, tone: 0.4 }); }

function buildComponents() {
  const k = new Kit({ tone: 0.5 }), ys = SUB_Y, yi = INT_Y;
  // ── the local package ──
  // a power stage along the near edge: regulators, inductors and a row of tall electrolytics, stepped
  cmpVrm(k, -150, 162, ys, 15, 8, 8);
  cmpVrm(k, -126, 165, ys, 11, 6, 5.5);
  [[-104, 158, 11], [-96, 170, 14], [-86, 158, 9], [-78, 170, 12.5], [-68, 158, 16], [-58, 170, 10]].forEach(([x, z, h]) => cmpEcap(k, x, z, ys, 3, h));
  for (let i = 0; i < 4; i++) cmpInductor(k, -40 + i * 11, 160 + (i % 2) * 8, ys, 8, 4.5 + (i % 3) * 1.2);
  cmpXtal(k, -2, 160, ys); cmpResNet(k, 2, 170, ys);
  // the far edge: tantalums and small electrolytics in an uneven line
  for (let i = 0; i < 18; i++) { const x = -396 + i * 22.5, z = -171.6; if (i % 3 === 1) cmpEcap(k, x, z, ys, 2.2, 5 + (i % 4) * 1.6); else cmpTant(k, x, z, ys, i % 2 ? Math.PI / 2 : 0); }
  // the left edge, beside the client cable
  cmpMlcc(k, -406, -150, ys, 9, 3.4, false);
  cmpEcap(k, -404, -112, ys, 2.6, 12); cmpEcap(k, -404, 52, ys, 2.6, 9); cmpInductor(k, -404, 90, ys, 7, 5);
  // the right edge, around the network connector
  cmpEcap(k, 14, -140, ys, 2.6, 8); cmpEcap(k, 14, -24, ys, 2.4, 13); cmpInductor(k, 14, 40, ys, 7, 6); cmpEcap(k, 14, 110, ys, 2.4, 7);
  // silicon capacitors on the interposer's margins around the harness die
  for (let x = -372; x < -20; x += 14) { cmpSiCap(k, x, -160, yi); cmpSiCap(k, x + 7, 138, yi, 5, 2.6); }
  for (let z = -140; z < 126; z += 13) { cmpSiCap(k, -388, z, yi, 3, 6); if (z + 6 < -118 || z + 6 > -56) cmpSiCap(k, -2, z + 6, yi, 3, 5); }
  // ── the remote package ──
  cmpVrm(k, 396, -128, ys, 13, 7, 9); cmpVrm(k, 396, 128, ys, 13, 7, 7);
  [[396, -96, 12], [396, -66, 9], [396, -34, 15], [396, -2, 10], [396, 30, 13], [396, 62, 8], [396, 94, 11]].forEach(([x, z, h]) => cmpEcap(k, x, z, ys, 2.8, h));
  // the interposer's near and far margins: inductors in front, electrolytics and tantalums behind
  for (let i = 0; i < 9; i++) cmpInductor(k, 138 + i * 28, 134, yi, 7, 3.6 + (i % 3) * 1.6);
  for (let i = 0; i < 8; i++) { const x = 198 + i * 24; if (i % 2) cmpEcap(k, x, -134, yi, 2.4, 6 + (i % 4) * 2.2); else cmpTant(k, x, -134, yi); }
  // the remote interposer: silicon capacitors between the stacks and the model die
  for (const [x, z] of [[252, -112], [252, 112], [186, -128], [318, -128], [186, 128], [318, 128]]) { cmpSiCap(k, x - 8, z, yi, 7, 3.4); cmpSiCap(k, x + 6, z, yi, 7, 3.4); }
  cmpXtal(k, 214, -132, yi);
  k.finish(world);
}
