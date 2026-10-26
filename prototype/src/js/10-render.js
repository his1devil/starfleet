// ═════════════════════════ renderer: paper surfaces + ink lines ═════════════════════════
// Three passes a frame: (1) colour — paper tones by facing, soft shadows, glass and glows;
// (2) id — view normal, part id and line tone of every solid; (3) composite — ink is drawn
// wherever depth folds, a normal creases or one part meets another, then grain and sRGB.
const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:40% 16px auto;text-align:center;font:15px/1.6 Georgia,serif">这一页需要 WebGL。请换用新版 Chrome、Edge、Firefox 或 Safari，或打开硬件加速。</p>');
  throw err;
}
let DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
const FLOAT_OK = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTES.light.paper);
const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 9000);
camera.layers.enable(1);

// light comes from the camera's upper left (the van is seen from its rear right corner), so faces
// turned to the rear read lightest and the cast shadows fall forward, into the van
const LIGHT_DIR = new THREE.Vector3(-0.55, 0.82, 0.17).normalize();
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 2.5;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.5;
Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 400, bottom: -400, near: 10, far: 2600 });
sun.shadow.camera.updateProjectionMatrix();
sun.position.copy(LIGHT_DIR).multiplyScalar(1200);
scene.add(sun, sun.target);

// shared uniforms for every paper material (theme switches rewrite these once)
const PAPER_U = {
  uTop: { value: new THREE.Color() }, uShade0: { value: new THREE.Color() }, uShade3: { value: new THREE.Color() },
  uBottom: { value: new THREE.Color() }, uShadow: { value: new THREE.Color() }, uShadowK: { value: 0.8 },
  uLightXZ: { value: new THREE.Vector2(LIGHT_DIR.x, LIGHT_DIR.z).normalize() },
};
const PAPER_VERT_HEAD = 'varying vec3 vWN;\nattribute float aPaint;\nvarying float vPaint;\n';
const PAPER_FRAG_HEAD = 'uniform vec3 uTop, uShade0, uShade3, uBottom, uShadow; uniform float uShadowK; uniform vec2 uLightXZ; uniform float uGlow, uPaint; uniform vec3 uGlowColor;\nvarying vec3 vWN; varying float vPaint;\n';
const PAPER_FRAG_BODY = `
  vec3 wn = normalize(vWN) * (gl_FrontFacing ? 1.0 : -1.0);
  float sideK = dot(normalize(wn.xz + vec2(1e-5, 0.0)), uLightXZ) * 0.5 + 0.5;
  vec3 sideTone = mix(uShade0, uShade3, sideK);
  vec3 tone = wn.y >= 0.0 ? mix(sideTone, uTop, smoothstep(0.32, 0.94, wn.y)) : mix(sideTone, uBottom, smoothstep(0.2, 0.95, -wn.y));
  float rel = dot(tone, vec3(0.2126, 0.7152, 0.0722)) / max(dot(uTop, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  vec3 alb = diffuseColor.rgb;
  vec3 col = mix(tone * alb, alb * mix(0.78, 1.0, rel), max(vPaint, uPaint));
  #ifdef USE_SHADOWMAP
    col *= mix(vec3(1.0), uShadow, (1.0 - getShadowMask()) * uShadowK);
  #endif
  col = mix(col, uGlowColor, uGlow);
  gl_FragColor = vec4(col, diffuseColor.a);
`;
function paperMaterial(o = {}) {
  const m = new THREE.MeshLambertMaterial({ color: o.color ?? 0xffffff, vertexColors: o.vertexColors ?? false, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true });
  m.userData.u = { uGlow: { value: o.glow ?? 0 }, uGlowColor: { value: new THREE.Color(o.glowColor ?? 0xffffff) }, uPaint: { value: o.paint ?? 0 } };
  m.onBeforeCompile = paperCompile;
  return m;
}
function paperCompile(sh) {
  Object.assign(sh.uniforms, PAPER_U, this.userData.u);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + PAPER_VERT_HEAD)
    .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWN = (vec4(transformedNormal, 0.0) * viewMatrix).xyz;\nvPaint = aPaint;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PAPER_FRAG_HEAD)
    .replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>')
    .replace('#include <opaque_fragment>', PAPER_FRAG_BODY);
}
// a paper material shares one program; each instance keeps its own glow uniforms
const PAPER = paperMaterial({ vertexColors: true });
const PAPER2 = paperMaterial({ vertexColors: true, side: THREE.DoubleSide });
const solid = (hex, o = {}) => paperMaterial({ color: hex, ...o });
const fluidMat = (hex, o = {}) => { const m = paperMaterial({ color: hex, paint: 1, ...o }); m.userData.fluid = true; return m; };

// id pass: view normal (xy), part id, line tone — read by the composite
const ID_MAT = new THREE.ShaderMaterial({
  uniforms: { uIdBase: { value: 0 }, uTone: { value: 0.5 }, uLit: { value: 0 } },
  vertexShader: `
    attribute float aId; attribute float aTone;
    uniform float uIdBase, uTone, uLit;
    varying vec3 vN; varying float vId; varying float vTone;
    #include <common>
    void main() {
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      vN = normalize(transformedNormal);
      vId = fract(uIdBase + aId);
      vTone = max(max(aTone, uTone), uLit);
    }`,
  fragmentShader: `
    varying vec3 vN; varying float vId; varying float vTone;
    void main() {
      vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
      gl_FragColor = vec4(n.xy, vId, vTone);
    }`,
  side: THREE.DoubleSide,
});
ID_MAT.defaultAttributeValues = { ...ID_MAT.defaultAttributeValues, aId: [0], aTone: [0] };
// every mesh feeds its own id / tone / station highlight into the id pass
THREE.Mesh.prototype.onBeforeRender = function (r, s, c, g, material) {
  if (material !== ID_MAT) return;
  const d = this.userData;
  if (d.inkId === undefined) d.inkId = rand();
  const u = ID_MAT.uniforms;
  u.uIdBase.value = d.inkId;
  u.uTone.value = d.tone ?? 0.5;
  u.uLit.value = d.station ? d.station.lit : (d.lit ?? 0);
  ID_MAT.uniformsNeedUpdate = true;
};

// glass: a pale veil, denser at grazing angles, inked where it turns away (its silhouette)
const GLASS_U = { uInkC: { value: new THREE.Color() }, uTint: { value: new THREE.Color() }, uGA: { value: 0.16 } };
function glassMaterial(o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...GLASS_U, uAlphaK: { value: o.alpha ?? 1 }, uRim: { value: o.rim ?? 0.7 }, uInkA: { value: o.ink ?? 0.85 }, uStreak: { value: o.streak ?? 0 }, uFade: { value: 1 } },
    vertexShader: `
      varying vec3 vVN; varying vec3 vWP;
      #include <common>
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <project_vertex>
        vVN = normalize(transformedNormal);
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      }`,
    fragmentShader: `
      uniform vec3 uInkC, uTint; uniform float uGA, uAlphaK, uRim, uInkA, uStreak, uFade;
      varying vec3 vVN; varying vec3 vWP;
      void main() {
        vec3 n = normalize(vVN) * (gl_FrontFacing ? 1.0 : -1.0);
        float ndv = abs(n.z), rim = 1.0 - ndv;
        // ink where the surface turns away: ndv / fwidth(ndv) is roughly twice the distance to the silhouette in pixels
        float line = (1.0 - smoothstep(uRim, uRim + 1.6, ndv / max(fwidth(ndv), 1e-5))) * step(0.0005, fwidth(ndv));
        float a = min(0.94, uGA * uAlphaK * (0.5 + 0.9 * rim * rim));
        float q = fract((vWP.x * 0.8 + vWP.y + vWP.z * 0.5) * 0.035);
        float streak = uStreak * smoothstep(0.0, 0.04, q) * (1.0 - smoothstep(0.08, 0.13, q));
        // a soft highlight down the lit side of round glass
        float hl = (1.0 - uStreak) * smoothstep(0.55, 0.8, n.x * 0.55 + n.y * 0.6) * smoothstep(0.15, 0.5, ndv);
        vec3 col = mix(uTint, vec3(1.0), max(streak, hl));
        a = max(a, max(streak * 0.4, hl * 0.5) * min(1.0, uAlphaK));
        col = mix(col, uInkC, line);
        a = max(a, line * uInkA);
        gl_FragColor = vec4(col, a * uFade);
      }`,
    transparent: true, depthWrite: false, side: o.side ?? THREE.FrontSide,
  });
  return m;
}
const GLASS = glassMaterial({ side: THREE.DoubleSide });
const GLASS2 = glassMaterial({ side: THREE.DoubleSide, streak: 0.8 });
const GHOST = glassMaterial({ side: THREE.DoubleSide, alpha: 0.7, rim: 0.5, ink: 0.4, streak: 0.25 });

// detail strokes (seams, ticks, rules) in three tones; they sit just off the face they belong to
const LINE_M = {
  hi: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 }),
  mid: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }),
  lo: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.32 }),
  ghost: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3, depthTest: false }),
};

// paper grain, pixel-stable
const GRAIN = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), img = g.createImageData(256, 256), r = mulberry32(7);
  for (let i = 0; i < 256 * 256; i++) { const v = 128 + (r() - 0.5) * 70; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.18; g.strokeStyle = '#000';
  for (let i = 0; i < 260; i++) { const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 2 + r() * 9; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
})();

const RT = { w: 1, h: 1, color: null, id: null };
const COMP = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null }, tN: { value: null }, tDepth: { value: null }, tGrain: { value: GRAIN },
    uPx: { value: new THREE.Vector2() }, uGrainScale: { value: new THREE.Vector2(1, 1) },
    uInk: { value: new THREE.Color() }, uDepthK: { value: 1 }, uSilT: { value: 0.5 }, uCreT: { value: 0.2 }, uGrainK: { value: 0.045 }, uInkK: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D tColor, tN, tDepth, tGrain;
    uniform vec2 uPx, uGrainScale;
    uniform vec3 uInk; uniform float uDepthK, uSilT, uCreT, uGrainK, uInkK;
    varying vec2 vUv;
    float D(vec2 o) { return texture2D(tDepth, vUv + o).r * uDepthK; }
    vec3 nrm(vec4 c) { return vec3(c.xy, sqrt(max(0.0, 1.0 - dot(c.xy, c.xy)))); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    float idEdge(vec4 c0, float d0, vec2 o) {
      vec4 cn = texture2D(tN, vUv + o); float dn = D(o);
      float far = uDepthK * 0.9999;
      if (dn >= far || abs(c0.z - cn.z) < 1e-4) return 0.0;
      // the nearer part owns the line; coplanar parts break the tie by id so it is drawn once
      return d0 < dn - uSilT * 0.5 ? 1.0 : (abs(d0 - dn) <= uSilT * 0.5 && c0.z > cn.z ? 1.0 : 0.0);
    }
    void main() {
      vec3 col = texture2D(tColor, vUv).rgb;
      vec4 c0 = texture2D(tN, vUv);
      float d0 = D(vec2(0.0));
      float far = uDepthK * 0.9999;
      float a = 0.0;
      if (d0 < far) {
        vec2 ox = vec2(uPx.x, 0.0), oy = vec2(0.0, uPx.y);
        float lap = max(D(-ox) + D(ox) - 2.0 * d0, D(-oy) + D(oy) - 2.0 * d0);
        float sil = smoothstep(uSilT, uSilT * 2.2, lap);
        float ide = max(max(idEdge(c0, d0, ox), idEdge(c0, d0, -ox)), max(idEdge(c0, d0, oy), idEdge(c0, d0, -oy)));
        vec4 cr = texture2D(tN, vUv + ox), ct = texture2D(tN, vUv + oy);
        vec3 n0 = nrm(c0);
        float creR = D(ox) < far && abs(c0.z - cr.z) < 1e-4 ? smoothstep(uCreT, uCreT * 1.7, 1.0 - dot(n0, nrm(cr))) : 0.0;
        float creT = D(oy) < far && abs(c0.z - ct.z) < 1e-4 ? smoothstep(uCreT, uCreT * 1.7, 1.0 - dot(n0, nrm(ct))) : 0.0;
        float tone = c0.w;
        a = max(sil, ide * 0.9) * mix(0.42, 1.0, tone) + max(creR, creT) * mix(0.2, 0.55, tone);
        a = clamp(a * uInkK, 0.0, 1.0);
      }
      col = mix(col, uInk, a);
      col *= 1.0 + (texture2D(tGrain, vUv * uGrainScale).r - 0.5) * uGrainK;
      gl_FragColor = vec4(toSRGB(col), 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const compScene = new THREE.Scene();
const compCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
compScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), COMP));

function makeTargets() {
  const w = Math.max(1, Math.floor(innerWidth * DPR)), h = Math.max(1, Math.floor(innerHeight * DPR));
  RT.color?.dispose(); RT.id?.depthTexture?.dispose(); RT.id?.dispose();
  RT.color = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
  const depth = new THREE.DepthTexture(w, h);
  depth.type = THREE.UnsignedIntType;
  RT.id = new THREE.WebGLRenderTarget(w, h, { type: FLOAT_OK ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth, depthBuffer: true });
  RT.w = w; RT.h = h;
  const u = COMP.uniforms;
  u.tColor.value = RT.color.texture; u.tN.value = RT.id.texture; u.tDepth.value = depth;
  u.uPx.value.set(1 / w, 1 / h); u.uGrainScale.value.set(w / 256 / Math.max(1, DPR * 0.75), h / 256 / Math.max(1, DPR * 0.75));
}
makeTargets();

function renderFrame() {
  const u = COMP.uniforms;
  u.uDepthK.value = camera.far - camera.near;
  const pxWorld = (camera.top - camera.bottom) / RT.h;
  u.uSilT.value = Math.max(0.18, pxWorld * 2.4);
  renderer.shadowMap.needsUpdate = true;
  camera.layers.set(0); camera.layers.enable(1);
  renderer.setRenderTarget(RT.color);
  renderer.render(scene, camera);
  const bg = scene.background;
  scene.background = null; scene.overrideMaterial = ID_MAT;
  camera.layers.set(0);
  renderer.setRenderTarget(RT.id);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  scene.overrideMaterial = null; scene.background = bg;
  camera.layers.enable(1);
  renderer.setRenderTarget(null);
  renderer.render(compScene, compCam);
}

// theme: one token set feeds the paper, the ink, the glass and the HUD
const THEMED = [];
function applyTheme(name) {
  THEME = name;
  const P = PALETTES[name];
  scene.background.set(P.paper);
  PAPER_U.uTop.value.set(P.top); PAPER_U.uShade0.value.set(P.shade0); PAPER_U.uShade3.value.set(P.shade3);
  PAPER_U.uBottom.value.set(P.bottom); PAPER_U.uShadow.value.set(P.shadow); PAPER_U.uShadowK.value = P.shadowK;
  COMP.uniforms.uInk.value.set(P.ink); COMP.uniforms.uGrainK.value = P.grain;
  GLASS_U.uInkC.value.set(P.ink); GLASS_U.uTint.value.set(P.glassTint); GLASS_U.uGA.value = P.glassA;
  for (const k in LINE_M) LINE_M[k].color.set(P.ink);
  for (const f of THEMED) f(P, name);
}
