/**
 * jonathanellis.dev — 3D J morphing scene · v6 (PREVIEW BUILD)
 *
 * Reference-driven 9-skin rebuild. Each skin retargeted to a specific visual
 * intent rather than incremental tweak of the previous version.
 *
 *   01 metallic — marbled liquid pigment under glassy clearcoat
 *   02 lasers   — volumetric beams emanating from a center point through the J
 *   03 lava     — charcoal majority with hot magma confined to deep cracks
 *   04 water    — J submerged, animated waterline + caustic refractions
 *   05 vapour   — J emits rising smoke ribbons (particle system)
 *   06 stones   — real instanced 3D pebble aggregate (icosahedra)
 *   07 fuzzy    — long flowing strands clumped into directional sweep field
 *   08 camo     — hard-edged voronoi blob layers, multi-variant
 *   09 vines    — rope vines wrap the J, real leaves at intervals
 *
 * Backgrounds (unchanged from v5): aurora · fireworks · galaxy.
 *
 * All shader/particle code below is original — written for this site,
 * using common public-domain techniques (value noise, FBM, voronoi cells,
 * additive particles, parametric tube sweeps, spiral distribution).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';

/* ──────────────────────────────────────────────────────────────
   STATE
   ────────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'jdev-state-preview-v6';   // separate from prod's 'jdev-state-v3'
const DEFAULT_SKIN = 'metallic';
const DEFAULT_BG = 'none';
const MOBILE = window.matchMedia('(max-width: 720px)').matches;

const state = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    return {
      skin: s.skin || DEFAULT_SKIN,
      bg: s.bg || DEFAULT_BG,
      params: s.params || {},
      bgParams: s.bgParams || {},
      speed: typeof s.speed === 'number' ? s.speed : 1.0,
      paused: !!s.paused,
      tv: !!s.tv,
    };
  } catch {
    return { skin: DEFAULT_SKIN, bg: DEFAULT_BG, params: {}, bgParams: {}, speed: 1.0, paused: false, tv: false };
  }
})();
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }

/* ──────────────────────────────────────────────────────────────
   MAIN RENDERER + J SCENE
   ────────────────────────────────────────────────────────────── */
const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  antialias: true, alpha: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.2);

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const ambient = new THREE.AmbientLight(0xffffff, 0.18);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x00e640, 0.5);
rimLight.position.set(-3, -1, -4);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xa0c8ff, 0.3);
fillLight.position.set(-4, 2, 2);
scene.add(fillLight);

/* Accent point light that orbits — gives metallic surface "alive" feel */
const orbLight = new THREE.PointLight(0xffe4b0, 0.0, 8, 1.4);
orbLight.position.set(2.0, 0, 1.5);
scene.add(orbLight);

const jGroup = new THREE.Group();
scene.add(jGroup);

/* Decoration group — holds instanced fur strands or leaves; lives under jGroup so it follows rotation/scale */
const decorGroup = new THREE.Group();
decorGroup.visible = false;
jGroup.add(decorGroup);

/* J-scene composer (bloom for emissive skins) */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.55, 0.85
);
bloomPass.enabled = false;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ──────────────────────────────────────────────────────────────
   STONE + CAMO PRESETS
   ────────────────────────────────────────────────────────────── */

/* Stones: each preset is now a multi-color palette + scale band for the
   instanced pebble aggregate. Colors are sampled per-pebble so the surface
   reads as a real mix of rocks, not one tinted shader. */
const STONE_TYPES = {
  granite:    { name: 'Granite',    palette: [[0.55,0.53,0.50],[0.32,0.30,0.28],[0.78,0.76,0.72],[0.18,0.17,0.16]], rough: 0.85, sizeMul: 1.0 },
  river:      { name: 'River pebbles', palette: [[0.42,0.38,0.32],[0.65,0.55,0.42],[0.30,0.30,0.32],[0.85,0.78,0.66]], rough: 0.55, sizeMul: 1.25 },
  slate:      { name: 'Slate',      palette: [[0.22,0.24,0.26],[0.34,0.36,0.40],[0.14,0.16,0.18],[0.42,0.44,0.48]], rough: 0.7,  sizeMul: 1.1 },
  basalt:     { name: 'Basalt',     palette: [[0.10,0.10,0.11],[0.20,0.18,0.18],[0.06,0.06,0.07],[0.28,0.26,0.24]], rough: 0.9,  sizeMul: 0.95 },
  jade:       { name: 'Jade',       palette: [[0.18,0.42,0.30],[0.30,0.55,0.40],[0.10,0.28,0.20],[0.42,0.62,0.50]], rough: 0.4,  sizeMul: 1.05 },
  carnelian:  { name: 'Carnelian',  palette: [[0.72,0.30,0.12],[0.92,0.48,0.20],[0.45,0.18,0.08],[0.30,0.10,0.05]], rough: 0.45, sizeMul: 1.0 },
  amethyst:   { name: 'Amethyst',   palette: [[0.45,0.25,0.65],[0.65,0.45,0.85],[0.30,0.15,0.45],[0.20,0.10,0.30]], rough: 0.35, sizeMul: 1.15 },
  obsidian:   { name: 'Obsidian',   palette: [[0.04,0.04,0.05],[0.12,0.12,0.14],[0.02,0.02,0.03],[0.20,0.20,0.22]], rough: 0.25, sizeMul: 0.9 },
  sandstone:  { name: 'Sandstone',  palette: [[0.78,0.66,0.46],[0.92,0.80,0.58],[0.55,0.42,0.25],[0.42,0.32,0.18]], rough: 0.95, sizeMul: 1.2 },
};

/* Camo: each preset has a 4-color palette and a `style` flag controlling
   the shader's blob algorithm. 'soft' = classic woodland, 'digital' = pixelated
   ACU-style, 'ghillie' = chunky organic blots, 'bape' = bright high-contrast. */
const CAMO_TYPES = {
  forest:    { name: 'Forest',     style: 'soft',    colors: [[0.25,0.35,0.20],[0.42,0.50,0.30],[0.18,0.25,0.15],[0.06,0.10,0.06]] },
  woodland:  { name: 'Woodland',   style: 'soft',    colors: [[0.18,0.30,0.16],[0.50,0.40,0.22],[0.10,0.18,0.08],[0.05,0.04,0.03]] },
  jungle:    { name: 'Jungle',     style: 'soft',    colors: [[0.16,0.42,0.18],[0.32,0.58,0.28],[0.08,0.22,0.10],[0.40,0.45,0.18]] },
  bape:      { name: 'Bright',     style: 'bape',    colors: [[0.20,0.78,0.22],[0.58,0.92,0.30],[0.10,0.40,0.12],[0.05,0.14,0.06]] },
  acu:       { name: 'ACU digital',style: 'digital', colors: [[0.62,0.60,0.50],[0.78,0.74,0.62],[0.42,0.40,0.34],[0.30,0.28,0.24]] },
  digigreen: { name: 'Digi green', style: 'digital', colors: [[0.30,0.42,0.22],[0.45,0.55,0.32],[0.18,0.28,0.14],[0.10,0.16,0.08]] },
  desert:    { name: 'Desert',     style: 'soft',    colors: [[0.78,0.65,0.42],[0.55,0.42,0.25],[0.92,0.80,0.55],[0.40,0.30,0.18]] },
  arctic:    { name: 'Arctic',     style: 'soft',    colors: [[0.92,0.94,0.95],[0.74,0.78,0.82],[0.50,0.56,0.62],[0.28,0.32,0.36]] },
  navy:      { name: 'Navy',       style: 'digital', colors: [[0.10,0.18,0.32],[0.20,0.32,0.50],[0.06,0.10,0.18],[0.32,0.42,0.58]] },
  urban:     { name: 'Urban grey', style: 'ghillie', colors: [[0.30,0.32,0.34],[0.45,0.48,0.50],[0.18,0.20,0.22],[0.10,0.12,0.14]] },
  ghillie:   { name: 'Ghillie',    style: 'ghillie', colors: [[0.22,0.26,0.16],[0.42,0.45,0.28],[0.10,0.14,0.08],[0.55,0.50,0.30]] },
  tiger:     { name: 'Tiger',      style: 'ghillie', colors: [[0.82,0.50,0.10],[0.95,0.78,0.30],[0.08,0.05,0.04],[0.50,0.28,0.08]] },
};

/* ──────────────────────────────────────────────────────────────
   SHARED GLSL HELPERS — own implementations of common techniques
   ────────────────────────────────────────────────────────────── */
const GLSL_VALUE_NOISE = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float h31(vec3 p){p=fract(p*vec3(123.34,456.21,789.41));p+=dot(p,p+45.32);return fract(p.x*p.y*p.z);}
float vnoise2(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
float vnoise3(vec3 p){vec3 i=floor(p);vec3 f=fract(p);vec3 u=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z);}
float fbm2(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*vnoise2(p);p*=2.02;a*=0.5;}return v;}
float fbm3(vec3 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*vnoise3(p);p*=2.02;a*=0.5;}return v;}
`;

const GLSL_HSL = `
vec3 hsl2rgb(float h, float s, float l) {
  vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
  return l + s * (rgb - 0.5) * (1.0 - abs(2.0*l - 1.0));
}
`;

/* Voronoi 3D — returns vec2(F1, cellID) where F1 is distance to nearest seed
   and cellID is a hash that's constant within each cell (use for hard-edged
   blob coloring in camo, etc.). */
const GLSL_VORONOI = `
vec2 voro3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float minDist = 1.0;
  float cellId = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 seed = i + g;
    vec3 jitter = fract(sin(vec3(
      dot(seed, vec3(127.1, 311.7,  74.7)),
      dot(seed, vec3(269.5, 183.3, 246.1)),
      dot(seed, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453);
    vec3 d = g + jitter - f;
    float dist = dot(d, d);
    if (dist < minDist) {
      minDist = dist;
      cellId = fract(sin(dot(seed, vec3(91.7, 51.3, 17.9))) * 43758.5453);
    }
  }
  return vec2(sqrt(minDist), cellId);
}
`;

/* ──────────────────────────────────────────────────────────────
   J MESH LOAD
   ────────────────────────────────────────────────────────────── */
let jMesh = null;
let baseGeometry = null;
new GLTFLoader().load(
  '/public/j.glb',
  (gltf) => {
    gltf.scene.traverse((c) => { if (!jMesh && c.isMesh) jMesh = c; });
    if (!jMesh) {
      document.getElementById('loader').querySelector('.label').textContent = 'No mesh in model';
      return;
    }
    jMesh.geometry.computeBoundingBox();
    const box = jMesh.geometry.boundingBox;
    const c = new THREE.Vector3(); box.getCenter(c);
    jMesh.geometry.translate(-c.x, -c.y, -c.z);
    jMesh.geometry.computeVertexNormals();
    const size = new THREE.Vector3(); box.getSize(size);
    jMesh.scale.setScalar(2.4 / size.y);
    baseGeometry = jMesh.geometry;
    jGroup.add(jMesh);
    applySkin(state.skin, false);
    setActiveButton(state.skin);
    applyBg(state.bg);
    setActiveBgButton(state.bg);
    document.getElementById('loader').classList.add('gone');
    setTimeout(() => document.getElementById('keyhints').classList.add('show'), 400);
  },
  undefined,
  (err) => {
    console.error(err);
    document.getElementById('loader').querySelector('.label').textContent = 'Failed to load';
  }
);

/* ──────────────────────────────────────────────────────────────
   SKINS
   ────────────────────────────────────────────────────────────── */
const SKINS = {

  /* ───── 01 · METALLIC — marbled liquid pigment under a glassy clearcoat
     (OddCommon-style flowing color: 3 hue lanes blended via warped FBM,
     advected over time; clearcoat carries the chrome highlight on top).      */
  metallic: {
    label: 'Metallic',
    params: { clearcoat: 1.0, swirl: 0.55, flow: 0.55, hueA: 0.33, hueB: 0.58, hueC: 0.88, autoCycle: 1 },
    post: { bloom: false },
    make(p) {
      // PhysicalMaterial gives us free clearcoat lobe + env reflections.
      // We override base color in onBeforeCompile with a marbled mix.
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.55,             // mid-metal: pigment shows through, but still reflective
        roughness: 0.30,             // soft satin under the gloss
        clearcoat: p.clearcoat,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.5,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime  = { value: 0 };
        shader.uniforms.uSwirl = { value: p.swirl };
        shader.uniforms.uFlow  = { value: p.flow };
        shader.uniforms.uHueA  = { value: p.hueA };
        shader.uniforms.uHueB  = { value: p.hueB };
        shader.uniforms.uHueC  = { value: p.hueC };

        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>\nvarying vec3 vMarbleP;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\nvMarbleP = position;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uTime, uSwirl, uFlow, uHueA, uHueB, uHueC;
           varying vec3 vMarbleP;
           ${GLSL_VALUE_NOISE}
           ${GLSL_HSL}`
        );
        // Replace base diffuseColor with the marbled mix BEFORE lighting runs,
        // so the metal/clearcoat reflectance picks up the swirl naturally.
        shader.fragmentShader = shader.fragmentShader.replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `
            float t = uTime * (0.05 + uFlow * 0.15);
            // Warp the sample position with low-freq FBM — this is what makes
            // the colors look like flowing pigment instead of stationary noise.
            vec3 q = vMarbleP * 1.6;
            vec3 warp = vec3(
              fbm3(q + vec3(t, 0.0, 0.0)),
              fbm3(q + vec3(0.0, t, 0.0)),
              fbm3(q + vec3(0.0, 0.0, t))
            ) - 0.5;
            q += warp * (1.4 * uSwirl);
            float n1 = fbm3(q * 1.2 + vec3(t * 0.3, 0.0, 0.0));
            float n2 = fbm3(q * 2.4 + vec3(0.0, -t * 0.4, t * 0.2));
            float n3 = fbm3(q * 0.7 + vec3(t * 0.15, t * 0.1, 0.0));
            // Three hue lanes A/B/C blended by the noise field.
            vec3 cA = hsl2rgb(uHueA, 0.85, 0.55);
            vec3 cB = hsl2rgb(uHueB, 0.85, 0.50);
            vec3 cC = hsl2rgb(uHueC, 0.85, 0.55);
            float wA = smoothstep(0.30, 0.65, n1);
            float wB = smoothstep(0.30, 0.65, n2);
            vec3 pigment = mix(cA, cB, wA);
            pigment = mix(pigment, cC, wB * 0.7);
            // Subtle "vein" — high-contrast thin lines where two color regions meet
            float vein = smoothstep(0.02, 0.0, abs(n3 - 0.5)) * 0.35;
            pigment += vec3(0.95, 0.92, 0.85) * vein;
            vec4 diffuseColor = vec4(pigment, opacity);
          `
        );
        mat.userData.shader = shader;
      };
      return mat;
    },
    controls: [
      { key: 'clearcoat', label: 'Clearcoat',  min: 0,    max: 1,    step: 0.01 },
      { key: 'swirl',     label: 'Swirl',      min: 0,    max: 1.5,  step: 0.01 },
      { key: 'flow',      label: 'Flow speed', min: 0,    max: 1.5,  step: 0.01 },
      { key: 'hueA',      label: 'Color A',    min: 0,    max: 1,    step: 0.01 },
      { key: 'hueB',      label: 'Color B',    min: 0,    max: 1,    step: 0.01 },
      { key: 'hueC',      label: 'Color C',    min: 0,    max: 1,    step: 0.01 },
      { key: 'autoCycle', label: 'Cycle hues', min: 0,    max: 1,    step: 1 },
    ],
    update(p, mat) {
      mat.clearcoat = p.clearcoat;
      mat.userData.autoCycle = p.autoCycle;
      mat.userData.manualHues = [p.hueA, p.hueB, p.hueC];
      if (mat.userData.shader && !p.autoCycle) {
        mat.userData.shader.uniforms.uHueA.value = p.hueA;
        mat.userData.shader.uniforms.uHueB.value = p.hueB;
        mat.userData.shader.uniforms.uHueC.value = p.hueC;
      }
      if (mat.userData.shader) {
        mat.userData.shader.uniforms.uSwirl.value = p.swirl;
        mat.userData.shader.uniforms.uFlow.value  = p.flow;
      }
    },
    tick(t, mat) {
      if (mat.userData.shader) {
        mat.userData.shader.uniforms.uTime.value = t;
        if (mat.userData.autoCycle) {
          const [a, b, c] = mat.userData.manualHues || [0.33, 0.58, 0.88];
          // Slow drift — full wheel every ~50s, lanes stay offset
          mat.userData.shader.uniforms.uHueA.value = (a + t * 0.020) % 1;
          mat.userData.shader.uniforms.uHueB.value = (b + t * 0.018) % 1;
          mat.userData.shader.uniforms.uHueC.value = (c + t * 0.022) % 1;
        }
      }
      // Orbiting accent light keeps the clearcoat highlight alive
      const r = 2.8;
      orbLight.position.set(Math.cos(t * 0.4) * r, Math.sin(t * 0.25) * 1.4, Math.sin(t * 0.4) * r);
      orbLight.intensity = 1.4 + Math.sin(t * 0.6) * 0.5;
      orbLight.color.setHSL(0.08 + Math.sin(t * 0.2) * 0.05, 0.4, 0.85);
    },
    onEnter() { orbLight.intensity = 1.4; },
    onLeave() { orbLight.intensity = 0.0; },
  },

  /* ───── 02 · LASERS — volumetric stage beams emanating from the J's center
     The J becomes a dark, semi-reflective stage prop. ~14 long thin beams
     (additive cylinders) fan outward from a center anchor and slowly sweep,
     strobing brightness independently. Bloom does the heavy lifting on the
     additive beams; the J catches glints as beams pass over it.                */
  lasers: {
    label: 'Lasers',
    params: { count: 14, length: 6.0, intensity: 1.0, sweep: 0.4, strobe: 0.6, hue: 0.33, palette: 1 },
    post: { bloom: true, bloomStrength: 1.1, bloomRadius: 0.85, bloomThreshold: 0.25 },
    make(p) {
      // Stage prop: dark glossy J that catches beam reflections.
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x070708,
        metalness: 0.85,
        roughness: 0.18,
        envMapIntensity: 0.6,
      });
      buildLaserBeams(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'count',     label: 'Beam count', min: 4,   max: 24,  step: 1 },
      { key: 'length',    label: 'Beam length',min: 2.0, max: 12,  step: 0.1 },
      { key: 'intensity', label: 'Intensity',  min: 0.2, max: 2.5, step: 0.05 },
      { key: 'sweep',     label: 'Sweep speed',min: 0,   max: 1.5, step: 0.01 },
      { key: 'strobe',    label: 'Strobe',     min: 0,   max: 1,   step: 0.01 },
      { key: 'hue',       label: 'Base hue',   min: 0,   max: 1,   step: 0.01 },
      { key: 'palette',   label: 'Multicolor', min: 0,   max: 1,   step: 1 },
    ],
    update(p, mat) {
      const inst = decorGroup.children[0];
      if (!inst || inst.userData.kind !== 'laser' || inst.userData.count !== p.count) {
        buildLaserBeams(p);
      } else {
        const u = inst.material.userData.uniforms;
        u.uIntensity.value = p.intensity;
        u.uSweep.value     = p.sweep;
        u.uStrobe.value    = p.strobe;
        u.uHue.value       = p.hue;
        u.uPalette.value   = p.palette;
        u.uLength.value    = p.length;
      }
    },
    tick(t) {
      const inst = decorGroup.children[0];
      if (inst?.material?.userData?.uniforms) inst.material.userData.uniforms.uTime.value = t;
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },

  /* ───── 03 · LAVA — charcoal majority, magma in deep cracks
     Targeting the user's reference: a near-black charcoal J where only the
     deepest fissures glow with hot orange/yellow magma. Rock is matte and
     bumpy; magma reveals are tight and high-contrast (so bloom hits clean
     hotspots, not a sheen across the whole surface).                          */
  lava: {
    label: 'Lava',
    params: { heat: 0.5, flow: 0.5, crackiness: 0.55, chunks: 0.6 },
    post: { bloom: true, bloomStrength: 0.65, bloomRadius: 0.5, bloomThreshold: 0.88 },
    make(p) {
      const u = {
        time: { value: 0 }, heat: { value: p.heat }, flow: { value: p.flow },
        crackiness: { value: p.crackiness }, chunks: { value: p.chunks },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: GLSL_VALUE_NOISE + GLSL_VORONOI + `
          uniform float time, flow, crackiness, chunks;
          varying vec3 vP; varying vec3 vN; varying float vChunk; varying float vCrackDepth;
          void main(){
            float t = time * (0.06 + flow * 0.14);
            // Big charcoal chunks — low-freq FBM, hard threshold.
            float chunkNoise = fbm3(position * 2.6 + vec3(t * 0.12, 0.0, t * 0.08));
            float chunk = smoothstep(0.42, 0.62, chunkNoise);
            // Crack network from voronoi cell-edge distance: cells are big
            // so cracks are sparse, thin, and high-contrast.
            vec2 vor = voro3(position * 5.0 + vec3(t * 0.18, 0.0, t * 0.10));
            // Distance from cell center, normalized — cracks live near boundary
            float crackBase = vor.x;                    // 0 = center of cell, larger = boundary
            float crack = smoothstep(0.55, 0.95, crackBase);  // tight band near edges
            // Push the band tighter so cracks read as thin lines not patches:
            crack = pow(crack, 1.6);
            // Displacement: chunks bulge out a touch, cracks sink hard.
            float disp = chunk * 0.07 * chunks - crack * 0.10 * crackiness;
            vec3 d = position + normal * disp;
            vChunk = chunk;
            vCrackDepth = crack;
            vP = position;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(d, 1.0);
          }`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
          uniform float time, heat, flow;
          varying vec3 vP; varying vec3 vN; varying float vChunk; varying float vCrackDepth;
          void main(){
            float t = time * (0.20 + flow * 0.45);
            // Magma flow noise — advected, sampled at higher freq for texture
            vec3 flowOff = vec3(0.0, -t * 0.35, t * 0.18);
            float magmaFlow = fbm3(vP * 7.0 + flowOff);
            // Temperature is GATED on crack depth — only deep cracks even
            // qualify. Then heat slider scales the reveal.
            float gate = smoothstep(0.35, 0.85, vCrackDepth);
            float temp = gate * (0.4 + heat * 0.7) + magmaFlow * gate * 0.35;

            // ROCK: near-pure black with very subtle micro-texture
            float rockTex  = fbm3(vP * 26.0);
            float rockTex2 = fbm3(vP * 90.0);
            vec3 rock = vec3(0.005, 0.004, 0.004) + vec3(0.018) * rockTex;
            rock += vec3(0.012) * rockTex2;
            // Lighter on chunk crowns (catching grazing light)
            rock = mix(rock, rock * 1.6, vChunk * 0.55);

            // MAGMA: deep red → orange → yellow, only above gate threshold
            vec3 magma = vec3(0.0);
            if (temp > 0.25) {
              float t2 = smoothstep(0.25, 1.0, temp);
              vec3 deepRed = vec3(0.32, 0.03, 0.0);
              vec3 orange  = vec3(1.05, 0.34, 0.05);
              vec3 yellow  = vec3(1.40, 0.95, 0.28);
              if (t2 < 0.55) magma = mix(deepRed, orange, t2 * 1.82);
              else           magma = mix(orange, yellow, (t2 - 0.55) * 2.22);
              magma *= (1.0 + smoothstep(0.75, 1.0, temp) * 1.6);
            }

            // Hard mask — the magma ONLY shows where cracks are; no sheen elsewhere.
            float magmaMask = smoothstep(0.35, 0.65, temp);
            vec3 col = mix(rock, magma, magmaMask);

            // Tight halo around hot crack edges only (no global wash)
            float halo = smoothstep(0.45, 0.85, temp) * heat;
            col += vec3(0.55, 0.16, 0.03) * halo * 0.35 * gate;

            // Lambert on rock; preserve magma brightness through the mask
            vec3 L_dir = normalize(vec3(0.5, 0.8, 0.6));
            float diff = max(0.20, dot(normalize(vN), L_dir));
            col = mix(col * diff, col, magmaMask);

            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'heat',       label: 'Heat',       min: 0,   max: 1, step: 0.01 },
      { key: 'flow',       label: 'Flow',       min: 0,   max: 1, step: 0.01 },
      { key: 'crackiness', label: 'Crack depth',min: 0.2, max: 1, step: 0.01 },
      { key: 'chunks',     label: 'Chunks',     min: 0,   max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.heat.value = p.heat; u.flow.value = p.flow;
      u.crackiness.value = p.crackiness; u.chunks.value = p.chunks;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },

  /* ───── 04 · WATER — submerged J with animated waterline + caustics
     The reference shows a sphere submerged in a pool: bright above the water,
     blue-tinted with caustic light bands below. We compose that effect by
     splitting the J at an animated waterline (Y plane that bobs gently): top
     half = light glassy wet material, bottom half = blue-tinted with moving
     caustic stripes overlay and slight refraction. A ripple displacement at
     the waterline sells the surface tension.                                  */
  water: {
    label: 'Water',
    params: { level: 0.05, ripple: 0.5, caustics: 0.7, depth: 0.65, hue: 0.55 },
    post: { bloom: false },
    make(p) {
      const u = {
        time:     { value: 0 },
        level:    { value: p.level },
        ripple:   { value: p.ripple },
        caustics: { value: p.caustics },
        depth:    { value: p.depth },
        hue:      { value: p.hue },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: GLSL_VALUE_NOISE + `
          uniform float time, ripple, level;
          varying vec3 vP;
          varying vec3 vN;
          varying vec3 vView;
          varying float vBelow;     // 1 if vertex sits below the waterline, 0 if above
          varying float vWaterDist; // signed distance to the waterline (Y plane)
          void main(){
            // Animated waterline Y — bobs slowly, slight tilt for realism
            float waterY = level + sin(time * 0.6) * 0.04 + sin(time * 1.7 + position.x * 1.4) * 0.015;
            vWaterDist = position.y - waterY;
            vBelow = step(position.y, waterY);
            // Surface ripple: only push displacement on vertices NEAR the waterline,
            // strongest at it, fading 0.15 units up/down.
            float prox = exp(-pow(vWaterDist * 8.0, 2.0));
            vec3 disp = position;
            disp.x += sin(time * 2.0 + position.y * 12.0) * 0.012 * ripple * prox;
            disp.z += cos(time * 2.4 + position.y * 11.0) * 0.012 * ripple * prox;
            vP = position;
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(disp, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
          uniform float time, caustics, depth, hue;
          varying vec3 vP; varying vec3 vN; varying vec3 vView;
          varying float vBelow; varying float vWaterDist;
          // Caustic pattern: two phase-shifted layered cosines + noise — looks
          // like classic pool-bottom caustics without needing a ray-trace.
          float caustic(vec3 p, float t){
            float a = sin(p.x * 5.0 + t * 1.4 + p.z * 2.0);
            float b = sin(p.y * 4.0 - t * 1.1 + p.x * 1.6);
            float c = sin((p.x + p.y) * 3.0 + t * 0.9);
            float n = fbm3(p * 3.0 + vec3(t * 0.4, 0.0, t * 0.2));
            float k = (a + b + c) * 0.3 + n * 0.6;
            return pow(max(0.0, k), 3.0);
          }
          void main(){
            // Above-water: clear, bright, slightly cyan-tinted glass
            // Below-water: deeper blue, caustic stripes ripple across
            vec3 L_dir = normalize(vec3(0.5, 0.8, 0.6));
            float diff = max(0.25, dot(normalize(vN), L_dir));
            float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);

            // ABOVE-water look: wet glass — light cyan
            vec3 above = mix(vec3(0.78, 0.92, 0.98), vec3(0.55, 0.85, 0.95), 0.5);
            above *= 0.7 + diff * 0.5;
            above += vec3(0.95) * fres * 0.5;

            // BELOW-water look: depth-tinted blue with caustics
            vec3 deepCol  = hsl2rgb(hue,         0.65, 0.18);   // deep blue-green
            vec3 shallow  = hsl2rgb(hue + 0.02,  0.55, 0.55);   // light shallow
            float depthMix = smoothstep(0.0, -0.6, vWaterDist) * depth;
            vec3 below = mix(shallow, deepCol, depthMix);
            below *= 0.55 + diff * 0.55;
            // Caustic light bands sweep across submerged J
            float caus = caustic(vP * 3.0, time * 0.8) * caustics;
            below += vec3(0.85, 1.0, 0.95) * caus * (1.0 - depthMix * 0.5);
            // Inner glow at depth so silhouette doesn't go pitch black
            below += vec3(0.05, 0.12, 0.18);

            // Pick side
            vec3 col = mix(above, below, vBelow);

            // Waterline highlight band — bright wet sheen RIGHT at the surface
            float bandProx = exp(-pow(vWaterDist * 22.0, 2.0));
            col += vec3(0.95, 1.0, 1.0) * bandProx * 0.7;

            // Edge sheen on both sides (wet J)
            col += vec3(0.6, 0.85, 1.0) * fres * 0.18;

            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'level',    label: 'Water level',  min: -1.0, max: 1.0, step: 0.01 },
      { key: 'ripple',   label: 'Ripple',       min: 0,    max: 1.5, step: 0.01 },
      { key: 'caustics', label: 'Caustics',     min: 0,    max: 1.5, step: 0.01 },
      { key: 'depth',    label: 'Depth tint',   min: 0,    max: 1.0, step: 0.01 },
      { key: 'hue',      label: 'Water hue',    min: 0.45, max: 0.65,step: 0.005 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.level.value    = p.level;
      u.ripple.value   = p.ripple;
      u.caustics.value = p.caustics;
      u.depth.value    = p.depth;
      u.hue.value      = p.hue;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },

  /* ───── 05 · VAPOUR — J emits rising smoke ribbons (particle system)
     The J underneath is a dim translucent silhouette; smoke particles spawn
     across its surface and drift upward, expanding and fading. Reads as a
     J-shaped column of smoke rather than fog wrapped around a solid object.    */
  vapour: {
    label: 'Vapour',
    params: { density: 0.7, rise: 0.5, hue: 0.55, glow: 0.7, jOpacity: 0.25 },
    post: { bloom: true, bloomStrength: 0.55, bloomRadius: 0.95, bloomThreshold: 0.35 },
    make(p) {
      // J underneath: dim, semi-transparent so it reads as the silhouette
      // the smoke is rising from. Slight color tint matches the smoke hue.
      const baseColor = new THREE.Color().setHSL(p.hue, 0.4, 0.45);
      const baseMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: p.jOpacity,
        depthWrite: false,
      });
      buildVaporParticles(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'density',  label: 'Smoke density',min: 0.2,  max: 1.5, step: 0.01 },
      { key: 'rise',     label: 'Rise speed',   min: 0.1,  max: 1.5, step: 0.01 },
      { key: 'hue',      label: 'Hue',          min: 0,    max: 1,   step: 0.01 },
      { key: 'glow',     label: 'Glow',         min: 0,    max: 1.5, step: 0.01 },
      { key: 'jOpacity', label: 'J visibility', min: 0,    max: 0.7, step: 0.01 },
    ],
    update(p, mat) {
      mat.color.setHSL(p.hue, 0.4, 0.45);
      mat.opacity = p.jOpacity;
      const inst = decorGroup.children[0];
      if (!inst || inst.userData.kind !== 'vapor') {
        buildVaporParticles(p);
      } else {
        const u = inst.material.userData.uniforms;
        u.uDensity.value = p.density;
        u.uRise.value    = p.rise;
        u.uHue.value     = p.hue;
        u.uGlow.value    = p.glow;
      }
    },
    tick(t) {
      const inst = decorGroup.children[0];
      if (inst?.material?.userData?.uniforms) inst.material.userData.uniforms.uTime.value = t;
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },

  /* ───── 06 · STONES — real instanced pebble aggregate
     Sampled across the J's surface: ~1500 low-poly icosahedra, scaled
     non-uniformly, randomly oriented, each tinted from the type's 4-color
     palette. The J underneath is dark gray so it reads as crevices between
     pebbles instead of bare patches.                                          */
  stones: {
    label: 'Stones',
    params: { type: 'granite', count: 1500, sizeMul: 1.0, jitter: 0.7, wet: 0.0 },
    post: { bloom: false },
    make(p) {
      const t = STONE_TYPES[p.type] || STONE_TYPES.granite;
      const baseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(t.palette[3][0], t.palette[3][1], t.palette[3][2]).multiplyScalar(0.4),
        roughness: 0.95,
        metalness: 0.0,
      });
      buildPebbleInstances(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'type',    label: 'Type',     type: 'select', options: Object.entries(STONE_TYPES).map(([k,v])=>({value:k, label:v.name})) },
      { key: 'count',   label: 'Pebble count', min: 400, max: 3000, step: 100 },
      { key: 'sizeMul', label: 'Pebble size',  min: 0.4, max: 1.8,  step: 0.05 },
      { key: 'jitter',  label: 'Jitter',       min: 0,   max: 1,    step: 0.01 },
      { key: 'wet',     label: 'Wet sheen',    min: 0,   max: 1,    step: 0.01 },
    ],
    update(p, mat) {
      const t = STONE_TYPES[p.type] || STONE_TYPES.granite;
      mat.color.setRGB(t.palette[3][0] * 0.4, t.palette[3][1] * 0.4, t.palette[3][2] * 0.4);
      const inst = decorGroup.children[0];
      const needsRebuild =
        !inst || inst.userData.kind !== 'pebble' ||
        inst.userData.count !== p.count ||
        inst.userData.type !== p.type;
      if (needsRebuild) {
        buildPebbleInstances(p);
      } else if (inst?.material) {
        // sizeMul / jitter / wet: live-update via instance scale + material props
        inst.material.roughness = 0.9 - p.wet * 0.65;
        inst.material.clearcoat = p.wet;
        inst.userData.lastSize = p.sizeMul;
        inst.userData.lastJitter = p.jitter;
        // Re-scale all instances to reflect new sizeMul
        rescalePebbles(inst, p.sizeMul);
      }
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },

  /* ───── 07 · FUZZY — long flowing strands clumped into a sweep field
     Strands no longer point straight along the surface normal — each region of
     the J gets a smoothly-varying "primary direction" sampled from a sin/cos
     field on position, so the fur reads as flowing locks instead of a uniform
     fuzz coat. Root → tip color gradient gives the multi-tone look from refs. */
  fuzzy: {
    label: 'Fuzzy',
    params: { count: 8000, length: 0.55, rootHue: 0.05, tipHue: 0.10, sweep: 0.7, wind: 0.5 },
    post: { bloom: false },
    make(p) {
      // Dark scalp matches the strand root color
      const baseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(p.rootHue, 0.55, 0.08),
        roughness: 0.96, metalness: 0.0,
      });
      buildFurInstances(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'count',   label: 'Strand count', min: 2000, max: 14000, step: 500 },
      { key: 'length',  label: 'Length',       min: 0.10, max: 2.0,   step: 0.02 },
      { key: 'rootHue', label: 'Root color',   min: 0,    max: 1,     step: 0.01 },
      { key: 'tipHue',  label: 'Tip color',    min: 0,    max: 1,     step: 0.01 },
      { key: 'sweep',   label: 'Sweep flow',   min: 0,    max: 1.5,   step: 0.01 },
      { key: 'wind',    label: 'Wind',         min: 0,    max: 2,     step: 0.05 },
    ],
    update(p, mat) {
      mat.color.setHSL(p.rootHue, 0.55, 0.08);
      const inst = decorGroup.children[0];
      if (!inst || inst.userData.kind !== 'fur' || inst.userData.count !== p.count) {
        buildFurInstances(p);
      } else {
        const u = inst.material.userData.uniforms;
        u.uLength.value  = p.length;
        u.uRootHue.value = p.rootHue;
        u.uTipHue.value  = p.tipHue;
        u.uSweep.value   = p.sweep;
        u.uWind.value    = p.wind;
      }
    },
    tick(t) {
      const inst = decorGroup.children[0];
      if (inst?.material?.userData?.uniforms) inst.material.userData.uniforms.uTime.value = t;
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },

  /* ───── 08 · CAMO — hard-edged voronoi blob layers, style-aware
     Three layers of voronoi cells at different scales build up the canonical
     camo silhouette: large background blobs, mid-frequency contrast blobs,
     small accent blots. Style flag chooses the boundary handling:
       - 'soft'    : classic woodland (smooth-edged blobs)
       - 'digital' : ACU-style hard pixel quantization on top
       - 'ghillie' : chunky organic with deeper accent blots
       - 'bape'    : high-contrast, near-zero edge softening
     Cells are HARD voronoi distances (not FBM mixes), so blobs have real
     boundaries instead of gradient washes.                                    */
  camo: {
    label: 'Camo',
    params: { type: 'forest', scale: 0.5, contrast: 0.7, accent: 0.5 },
    post: { bloom: false },
    make(p) {
      const t = CAMO_TYPES[p.type] || CAMO_TYPES.forest;
      const styleId =
        t.style === 'digital' ? 1 :
        t.style === 'ghillie' ? 2 :
        t.style === 'bape'    ? 3 : 0;
      const u = {
        scale:    { value: p.scale },
        contrast: { value: p.contrast },
        accent:   { value: p.accent },
        style:    { value: styleId },
        c0: { value: new THREE.Vector3(...t.colors[0]) },
        c1: { value: new THREE.Vector3(...t.colors[1]) },
        c2: { value: new THREE.Vector3(...t.colors[2]) },
        c3: { value: new THREE.Vector3(...t.colors[3]) },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: `varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_VORONOI + `
          uniform float scale, contrast, accent, style;
          uniform vec3 c0, c1, c2, c3;
          varying vec3 vP; varying vec3 vN;
          void main(){
            // Three stacked voronoi layers at different scales
            float s = 1.5 + scale * 6.0;
            vec3 p1 = vP * s;
            vec3 p2 = vP * s * 2.3 + vec3(13.7, 4.1, 91.2);
            vec3 p3 = vP * s * 4.9 + vec3(31.2, 71.4, 5.6);

            // Digital: quantize sample positions to a grid → pixelated cells
            if (style > 0.5 && style < 1.5) {
              float qs = s * 6.0;
              p1 = floor(p1 * qs) / qs;
              p2 = floor(p2 * qs * 0.5) / (qs * 0.5);
            }

            vec2 v1 = voro3(p1);                  // (dist, cellId)
            vec2 v2 = voro3(p2);
            vec2 v3 = voro3(p3);

            // Cell-ID based color picks, hard boundaries.
            // Use cellId as a deterministic "this cell is one of N colors".
            float pick1 = step(0.5, v1.y);                       // background blob: c0 vs c1
            float pick2 = step(0.65, v2.y);                      // mid contrast: c2 patch
            float pick3 = step(0.78, v3.y);                      // small accent: c3 dot

            vec3 col = mix(c0, c1, pick1);

            // Edge softness controlled by `contrast` (high = razor edges, low = smudged)
            float edgeSoft = mix(0.18, 0.005, contrast);
            // For ghillie, allow medium-frequency to spill more:
            if (style > 1.5 && style < 2.5) edgeSoft *= 1.6;
            // For bape, push edges to zero:
            if (style > 2.5) edgeSoft *= 0.25;

            // Layer 2: mid blobs of c2 — show in cells where pick2 fires AND we're in cell interior
            float interior2 = 1.0 - smoothstep(0.0, edgeSoft + 0.05, v2.x - 0.0);  // cell interior weight
            col = mix(col, c2, pick2 * interior2 * 0.85);

            // Layer 3: small accent blots of c3 — controlled by `accent`
            float interior3 = 1.0 - smoothstep(0.0, edgeSoft + 0.03, v3.x - 0.0);
            col = mix(col, c3, pick3 * interior3 * accent);

            // Digital: add a fine secondary pixel pattern (the inner digital grain)
            if (style > 0.5 && style < 1.5) {
              vec3 fine = floor(vP * s * 24.0) / (s * 24.0);
              float grain = fract(sin(dot(fine, vec3(127.1, 311.7, 74.7))) * 43758.5453);
              float gOn = step(0.78, grain) * 0.18;
              col = mix(col, c2, gOn);
            }

            // Bape: punch saturation, add micro highlight
            if (style > 2.5) {
              float maxC = max(col.r, max(col.g, col.b));
              col = mix(vec3(maxC), col, 1.25);
            }

            // Light: matte, soft lambert (camo fabric isn't shiny)
            float lit = 0.55 + 0.45 * max(0.0, dot(normalize(vN), normalize(vec3(0.5, 1.0, 0.6))));
            gl_FragColor = vec4(col * lit, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'type',     label: 'Pattern',  type: 'select', options: Object.entries(CAMO_TYPES).map(([k,v])=>({value:k, label:v.name})) },
      { key: 'scale',    label: 'Scale',    min: 0.2, max: 1.5, step: 0.01 },
      { key: 'contrast', label: 'Edge sharpness', min: 0,   max: 1,   step: 0.01 },
      { key: 'accent',   label: 'Accent blots',   min: 0,   max: 1,   step: 0.01 },
    ],
    update(p, mat) {
      const t = CAMO_TYPES[p.type] || CAMO_TYPES.forest;
      const u = mat.userData.uniforms;
      const styleId =
        t.style === 'digital' ? 1 :
        t.style === 'ghillie' ? 2 :
        t.style === 'bape'    ? 3 : 0;
      u.scale.value = p.scale;
      u.contrast.value = p.contrast;
      u.accent.value = p.accent;
      u.style.value = styleId;
      u.c0.value.set(...t.colors[0]); u.c1.value.set(...t.colors[1]);
      u.c2.value.set(...t.colors[2]); u.c3.value.set(...t.colors[3]);
    },
  },

  /* ───── 09 · VINES — rope vines wrap the J, leaves sprout at intervals
     Vines are the primary structure: ~12 parametric helical paths spiralling
     around the J's bounding cylinder (each with random phase, pitch, and
     radius wobble). Each vine is a real 3D tube. Small instanced leaves are
     placed at intervals along each vine. The J underneath is dim moss-green
     so it reads as bark/stem behind the vines, not a separate object.        */
  vines: {
    label: 'Vines',
    params: { vineCount: 12, segments: 60, leavesPerVine: 30, vineRadius: 0.022, leafSize: 0.06, hue: 0.30, wind: 0.4 },
    post: { bloom: false },
    make(p) {
      const baseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.32, 0.4, 0.10),
        roughness: 0.95, metalness: 0.0,
      });
      buildVineNetwork(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'vineCount',     label: 'Vine count',     min: 4,    max: 24,  step: 1 },
      { key: 'segments',      label: 'Vine smoothness',min: 30,   max: 120, step: 5 },
      { key: 'leavesPerVine', label: 'Leaves per vine',min: 8,    max: 60,  step: 2 },
      { key: 'vineRadius',    label: 'Vine thickness', min: 0.008,max: 0.045,step: 0.002 },
      { key: 'leafSize',      label: 'Leaf size',      min: 0.025,max: 0.12,step: 0.005 },
      { key: 'hue',           label: 'Foliage hue',    min: 0.18, max: 0.42,step: 0.01 },
      { key: 'wind',          label: 'Wind',           min: 0,    max: 1.5, step: 0.05 },
    ],
    update(p, mat) {
      mat.color.setHSL(0.32, 0.4, 0.10);
      const root = decorGroup.children[0];
      const needsRebuild =
        !root || root.userData.kind !== 'vine' ||
        root.userData.vineCount     !== p.vineCount ||
        root.userData.segments      !== p.segments ||
        root.userData.leavesPerVine !== p.leavesPerVine ||
        root.userData.vineRadius    !== p.vineRadius;
      if (needsRebuild) {
        buildVineNetwork(p);
      } else {
        // Live params: leaf size + hue + wind
        const leaves = root.userData.leafMesh;
        if (leaves?.material?.userData?.uniforms) {
          const u = leaves.material.userData.uniforms;
          u.uHue.value  = p.hue;
          u.uWind.value = p.wind;
          u.uSize.value = p.leafSize;
        }
        const vineMat = root.userData.vineMat;
        if (vineMat) vineMat.color.setHSL(0.07, 0.55, 0.18);
      }
    },
    tick(t) {
      const root = decorGroup.children[0];
      if (root?.userData?.leafMesh?.material?.userData?.uniforms) {
        root.userData.leafMesh.material.userData.uniforms.uTime.value = t;
      }
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },
};

/* ──────────────────────────────────────────────────────────────
   INSTANCED 3D DECORATIONS
   Each builder samples positions on the J surface (or constructs its own
   parametric layout for vines), then places real geometry instances under
   `decorGroup`. The animation loop calls the active skin's `tick` to update
   per-frame uniforms.
   ────────────────────────────────────────────────────────────── */

function clearDecorGroup() {
  decorGroup.visible = false;
  while (decorGroup.children.length) {
    const c = decorGroup.children.pop();
    c.traverse?.((n) => {
      if (n.geometry) n.geometry.dispose();
      if (n.material) {
        if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
        else n.material.dispose();
      }
    });
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material.dispose();
    }
  }
}

/* Sample N positions+normals from the J's geometry. Random vertex selection. */
function sampleSurface(geom, count) {
  const pos = geom.attributes.position;
  const norm = geom.attributes.normal;
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pos.count);
    out.push({
      p: new THREE.Vector3().fromBufferAttribute(pos, idx),
      n: new THREE.Vector3().fromBufferAttribute(norm, idx).normalize(),
      seed: Math.random(),
    });
  }
  return out;
}

/* ───── Fur strands — long flowing strands clumped into a directional sweep
   field. Each strand's base orientation is the surface normal blended with a
   smoothly-varying "flow direction" sampled from sin/cos of position, which
   gives the locks-of-hair look from the references instead of uniform fuzz. */
function buildFurInstances(p) {
  clearDecorGroup();
  if (!baseGeometry) return;
  const COUNT = p.count;

  // Strand: tapered cylinder, base at y=0, tip at y=1
  const strand = new THREE.CylinderGeometry(0.0010, 0.00018, 1, 5, 1, true);
  strand.translate(0, 0.5, 0);

  const u = {
    uTime:    { value: 0 },
    uLength:  { value: p.length },
    uRootHue: { value: p.rootHue },
    uTipHue:  { value: p.tipHue },
    uSweep:   { value: p.sweep },
    uWind:    { value: p.wind },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `
      uniform float uTime, uLength, uWind;
      attribute float aSeed;
      attribute float aLen;
      attribute vec3  aSweepDir;     // unit-ish vector in J-local space, the strand's "flow"
      varying float vY;
      varying float vSeed;
      void main(){
        vY = position.y;
        vSeed = aSeed;
        // Total strand length in object space
        float L = uLength * aLen;
        // Stretch
        vec3 p = position * vec3(1.0, L, 1.0);
        // Bend the strand TOWARD aSweepDir as we go up: at y=0 it points along
        // local up (which is the surface normal once instanceMatrix orients us);
        // at y=L it leans into the sweep direction. This is what makes hair
        // flow in clumped directional sweeps instead of standing straight up.
        float yt = clamp(p.y / max(0.001, L), 0.0, 1.0);
        float bend = pow(yt, 1.4);
        p.xyz += aSweepDir * bend * L * 0.7;
        // Wind sway — increases with height; per-strand phase via seed.
        float windAmp = uWind * 0.10 * L;
        float sway  = sin(uTime * 1.4 + aSeed * 31.4) * pow(yt, 1.8);
        float swayZ = cos(uTime * 1.1 + aSeed * 17.7) * pow(yt, 1.8);
        p.x += sway  * windAmp;
        p.z += swayZ * windAmp * 0.7;
        // Gentle gravity droop near tip
        p.y -= pow(yt, 2.0) * L * 0.06;
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uRootHue, uTipHue;
      varying float vY; varying float vSeed;
      vec3 hsl2rgb(float h, float s, float l) {
        vec3 r = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
        return l + s * (r - 0.5) * (1.0 - abs(2.0*l - 1.0));
      }
      void main(){
        // Per-strand hue jitter
        float jitter = (vSeed - 0.5) * 0.04;
        // Smooth root → tip hue + lightness ramp
        float h = mix(uRootHue, uTipHue, vY) + jitter;
        float L = mix(0.16, 0.68, vY);
        float S = mix(0.50, 0.65, vY);
        vec3 col = hsl2rgb(h, S, L);
        // AO at base
        col *= 0.55 + 0.45 * vY;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  mat.userData.uniforms = u;

  const inst = new THREE.InstancedMesh(strand, mat, COUNT);
  inst.userData = { kind: 'fur', count: COUNT };

  const seeds = new Float32Array(COUNT);
  const lens  = new Float32Array(COUNT);
  const sweepDirs = new Float32Array(COUNT * 3);
  const samples = sampleSurface(baseGeometry, COUNT);

  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const localFlow = new THREE.Vector3();
  const tangent  = new THREE.Vector3();
  const inv = new THREE.Quaternion();

  for (let i = 0; i < COUNT; i++) {
    const s = samples[i];
    tmpPos.copy(s.p).addScaledVector(s.n, 0.002);
    tmpQuat.setFromUnitVectors(up, s.n);
    tmpScale.setScalar(1.0);
    tmp.compose(tmpPos, tmpQuat, tmpScale);
    inst.setMatrixAt(i, tmp);
    seeds[i] = s.seed;
    lens[i] = 0.55 + Math.random() * 0.9;

    // Build a SWEEP direction in WORLD-local J-space using a smooth sin/cos
    // field on the surface position. Project it onto the strand's tangent
    // plane (so it's perpendicular to the normal), then transform into the
    // strand's local frame so the vertex shader can apply it.
    const flowX = Math.sin(s.p.y * 4.0 + s.p.x * 1.5);
    const flowY = Math.cos(s.p.x * 3.0 + s.p.z * 2.2);
    const flowZ = Math.sin(s.p.z * 4.0 - s.p.y * 1.7);
    localFlow.set(flowX, flowY, flowZ).normalize();
    // Project onto tangent plane: subtract normal component
    const dot = localFlow.dot(s.n);
    tangent.copy(localFlow).addScaledVector(s.n, -dot).normalize();
    // Transform tangent into the instance's local frame (inverse of tmpQuat)
    inv.copy(tmpQuat).invert();
    tangent.applyQuaternion(inv);
    // Scale by per-strand sweep strength & global sweep param via shader
    sweepDirs[i * 3]     = tangent.x * p.sweep;
    sweepDirs[i * 3 + 1] = tangent.y * p.sweep;
    sweepDirs[i * 3 + 2] = tangent.z * p.sweep;
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.geometry.setAttribute('aSeed',     new THREE.InstancedBufferAttribute(seeds, 1));
  inst.geometry.setAttribute('aLen',      new THREE.InstancedBufferAttribute(lens, 1));
  inst.geometry.setAttribute('aSweepDir', new THREE.InstancedBufferAttribute(sweepDirs, 3));
  inst.scale.copy(jMesh.scale);
  inst.frustumCulled = false;
  decorGroup.add(inst);
}

/* ───── Laser beams — additive thin cylinders fanning from a center anchor.
   Beams ROTATE around random axes and STROBE intensity independently, giving
   a real stage-laser feel. Color is per-beam from a palette when palette=1. */
function buildLaserBeams(p) {
  clearDecorGroup();
  const COUNT = p.count;
  // Beam: thin tall cylinder centered at origin (will be translated so its
  // BASE sits at the anchor). 1 unit tall along +y; we'll scale by length.
  const beam = new THREE.CylinderGeometry(0.014, 0.0035, 1, 8, 1, true);
  beam.translate(0, 0.5, 0);   // base at y=0, tip at y=1

  const u = {
    uTime:      { value: 0 },
    uIntensity: { value: p.intensity },
    uSweep:     { value: p.sweep },
    uStrobe:    { value: p.strobe },
    uHue:       { value: p.hue },
    uPalette:   { value: p.palette },
    uLength:    { value: p.length },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime, uSweep, uLength;
      attribute float aSeed;
      attribute vec3  aAxis;     // unit rotation axis (random per beam)
      varying float vY;          // 0 base → 1 tip
      varying float vSeed;
      // Build a quaternion rotating around aAxis by angle theta
      vec4 quatAxis(vec3 axis, float theta){
        float h = theta * 0.5;
        return vec4(axis * sin(h), cos(h));
      }
      vec3 rotByQuat(vec3 v, vec4 q){
        return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
      }
      void main(){
        vY = position.y;
        vSeed = aSeed;
        // Stretch beam to length
        vec3 p = position * vec3(1.0, uLength, 1.0);
        // Apply per-beam sweep rotation: angle drifts over time
        float ang = uTime * uSweep * (0.4 + aSeed * 0.6) + aSeed * 6.28318;
        vec4 q = quatAxis(normalize(aAxis), ang);
        p = rotByQuat(p, q);
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * wp;
      }`,
    fragmentShader: GLSL_HSL + `
      uniform float uTime, uIntensity, uStrobe, uHue, uPalette;
      varying float vY; varying float vSeed;
      void main(){
        // Per-beam hue: if palette mode, distribute around the wheel; else
        // tight cluster around uHue.
        float h = uPalette > 0.5 ? fract(uHue + vSeed) : uHue + (vSeed - 0.5) * 0.05;
        // Strobe: each beam pulses on its own phase, gated by uStrobe
        float pulse = mix(1.0, 0.4 + 0.7 * abs(sin(uTime * 2.5 + vSeed * 13.7)), uStrobe);
        // Intensity falls off toward the tip — beam looks like it's scattering
        // through atmosphere and dimming with distance.
        float falloff = pow(1.0 - vY * 0.7, 1.4);
        // Soft alpha so additive blending doesn't blow out solid white at center
        float a = falloff * pulse * uIntensity;
        vec3 col = hsl2rgb(h, 1.0, 0.55) * a;
        // Hot core at the very base
        col += hsl2rgb(h, 0.5, 0.95) * smoothstep(0.95, 1.0, 1.0 - vY) * 0.5 * pulse;
        gl_FragColor = vec4(col, clamp(a * 0.9, 0.0, 1.0));
      }`,
  });
  mat.userData.uniforms = u;

  const inst = new THREE.InstancedMesh(beam, mat, COUNT);
  inst.userData = { kind: 'laser', count: COUNT };

  const seeds = new Float32Array(COUNT);
  const axes  = new Float32Array(COUNT * 3);

  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3(0, 0, 0);
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();

  // Anchor: just below origin, beams fan outward
  for (let i = 0; i < COUNT; i++) {
    // Random direction on the sphere — uniform distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dir.set(
      Math.sin(phi) * Math.cos(theta),
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
    );
    tmpQuat.setFromUnitVectors(up, dir);
    tmp.compose(tmpPos, tmpQuat, tmpScale);
    inst.setMatrixAt(i, tmp);

    seeds[i] = Math.random();
    // Random rotation axis perpendicular to the beam direction (so sweep
    // moves the beam through the sky rather than rotating around itself)
    const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize();
    axes[i * 3]     = ax.x;
    axes[i * 3 + 1] = ax.y;
    axes[i * 3 + 2] = ax.z;
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  inst.geometry.setAttribute('aAxis', new THREE.InstancedBufferAttribute(axes, 3));
  inst.scale.copy(jMesh.scale);
  inst.frustumCulled = false;
  decorGroup.add(inst);
}

/* ───── Vapor particles — soft additive sprites that spawn near the J surface
   and rise upward, expanding and fading. Re-spawn continuously to keep a
   steady column of smoke flowing off the J shape.                            */
function buildVaporParticles(p) {
  clearDecorGroup();
  if (!baseGeometry) return;
  const COUNT = 1500;

  // Soft circular sprite for each particle
  const tex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const u = {
    uTime:    { value: 0 },
    uDensity: { value: p.density },
    uRise:    { value: p.rise },
    uHue:     { value: p.hue },
    uGlow:    { value: p.glow },
    uMap:     { value: tex },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };

  const positions = new Float32Array(COUNT * 3);
  const seeds     = new Float32Array(COUNT);
  const samples   = sampleSurface(baseGeometry, COUNT);
  for (let i = 0; i < COUNT; i++) {
    const s = samples[i];
    positions[i * 3]     = s.p.x;
    positions[i * 3 + 1] = s.p.y;
    positions[i * 3 + 2] = s.p.z;
    seeds[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed',    new THREE.BufferAttribute(seeds, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime, uDensity, uRise, uPixelRatio;
      attribute float aSeed;
      varying float vLife;     // 0 = just spawned, 1 = about to die
      varying float vSeed;
      void main(){
        // Each particle has a 3-second lifetime, offset by its seed
        float period = 3.0;
        float age = mod(uTime * uRise + aSeed * period, period);
        vLife = age / period;
        vSeed = aSeed;
        // Position rises from spawn position straight up, with slight horizontal
        // drift via sin/cos wobble (matches the "ribbon" look)
        vec3 p = position;
        float upRise = vLife * 1.4;     // rise height in object space
        p.y += upRise;
        p.x += sin(uTime * 1.2 + aSeed * 12.7) * 0.10 * vLife;
        p.z += cos(uTime * 0.9 + aSeed *  7.3) * 0.10 * vLife;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Particles GROW as they rise
        float size = (40.0 + vLife * 90.0) * uDensity;
        gl_PointSize = size * uPixelRatio / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: GLSL_HSL + `
      uniform float uHue, uGlow;
      uniform sampler2D uMap;
      varying float vLife; varying float vSeed;
      void main(){
        // Fade in fast, fade out slow
        float fadeIn  = smoothstep(0.0, 0.12, vLife);
        float fadeOut = 1.0 - smoothstep(0.55, 1.0, vLife);
        float a = fadeIn * fadeOut;
        // Smoke color: hue-tinted, brighter at the leading edge (younger)
        float h = uHue + (vSeed - 0.5) * 0.04;
        vec3 base = hsl2rgb(h, 0.35, 0.70);
        vec3 hot  = hsl2rgb(h + 0.05, 0.45, 0.92);
        vec3 col = mix(hot, base, smoothstep(0.0, 0.4, vLife));
        col *= 1.0 + uGlow * (1.0 - vLife) * 0.6;
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(col, a) * t;
      }`,
  });
  mat.userData.uniforms = u;

  const points = new THREE.Points(geo, mat);
  points.userData = { kind: 'vapor' };
  points.scale.copy(jMesh.scale);
  points.frustumCulled = false;
  decorGroup.add(points);
}

/* ───── Pebble aggregate — instanced low-poly icosahedra packed onto J
   surface. Each pebble gets a random palette pick, non-uniform scale,
   random rotation. Reads as a stone-clad J at landing-page distance.        */
function buildPebbleInstances(p) {
  clearDecorGroup();
  if (!baseGeometry) return;
  const COUNT = p.count;
  const stoneType = STONE_TYPES[p.type] || STONE_TYPES.granite;
  const palette = stoneType.palette;
  const sizeBase = 0.018 * stoneType.sizeMul;

  // Low-poly rounded shape: subdivided icosahedron, 1 detail level = 80 tris
  const pebble = new THREE.IcosahedronGeometry(1.0, 1);

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.85 - p.wet * 0.6,
    clearcoat: p.wet,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.0,
    vertexColors: true,        // we'll bake the palette pick into per-vertex... actually we'll use instanceColor
  });

  const inst = new THREE.InstancedMesh(pebble, mat, COUNT);
  inst.userData = {
    kind: 'pebble',
    count: COUNT,
    type: p.type,
    sizeBase,
    samples: null,         // we'll keep the samples for rescale
    scales: null,
  };

  // Per-instance color via InstancedBufferAttribute on a shader override
  // The simplest path: use InstancedMesh's setColorAt + instanceColor.
  const samples = sampleSurface(baseGeometry, COUNT);
  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();
  const tmpColor = new THREE.Color();
  const scales = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    const s = samples[i];
    // Sit on the surface
    tmpPos.copy(s.p).addScaledVector(s.n, sizeBase * 0.4);
    // Random orientation — stones don't align
    tmpEuler.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
    );
    tmpQuat.setFromEuler(tmpEuler);
    // Non-uniform scale: pebbles aren't spheres
    const baseR = sizeBase * (0.55 + Math.random() * 0.9) * p.sizeMul;
    const sx = baseR * (0.7 + Math.random() * 0.7);
    const sy = baseR * (0.7 + Math.random() * 0.7);
    const sz = baseR * (0.7 + Math.random() * 0.7);
    tmpScale.set(sx, sy, sz);
    scales[i * 3] = sx; scales[i * 3 + 1] = sy; scales[i * 3 + 2] = sz;
    tmp.compose(tmpPos, tmpQuat, tmpScale);
    inst.setMatrixAt(i, tmp);

    // Pick palette color for this pebble
    const pal = palette[Math.floor(Math.random() * palette.length)];
    // Add a touch of per-pebble lightness jitter
    const jitter = 0.85 + Math.random() * 0.30;
    tmpColor.setRGB(pal[0] * jitter, pal[1] * jitter, pal[2] * jitter);
    inst.setColorAt(i, tmpColor);
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.scale.copy(jMesh.scale);
  inst.frustumCulled = false;
  inst.userData.samples = samples;
  inst.userData.scales  = scales;
  decorGroup.add(inst);
}

/* Live re-scale all pebbles when the user moves the size slider, without
   rebuilding (preserving positions and colors). */
function rescalePebbles(inst, sizeMul) {
  const samples = inst.userData.samples;
  const baseScales = inst.userData.scales;
  const sizeBase = inst.userData.sizeBase;
  if (!samples || !baseScales) return;
  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  for (let i = 0; i < inst.count; i++) {
    inst.getMatrixAt(i, tmp);
    tmp.decompose(tmpPos, tmpQuat, tmpScale);
    // Re-derive position from sample (pebble base sits on surface)
    const s = samples[i];
    tmpPos.copy(s.p).addScaledVector(s.n, sizeBase * 0.4 * sizeMul);
    tmpScale.set(
      baseScales[i * 3]     * sizeMul,
      baseScales[i * 3 + 1] * sizeMul,
      baseScales[i * 3 + 2] * sizeMul,
    );
    tmp.compose(tmpPos, tmpQuat, tmpScale);
    inst.setMatrixAt(i, tmp);
  }
  inst.instanceMatrix.needsUpdate = true;
}

/* ───── Vine network — parametric vines wrapping the J + leaves at intervals.
   Each vine is a TubeGeometry along a helix curve around the J's bounding
   cylinder, with sin/cos wobble in the radius for organic shape. Leaves are
   instanced 3D plane meshes placed at uniform parameter intervals along
   each vine (with random per-leaf orientation around the vine's tangent).   */
function buildVineNetwork(p) {
  clearDecorGroup();
  if (!baseGeometry) return;

  const root = new THREE.Group();
  root.userData = {
    kind: 'vine',
    vineCount: p.vineCount,
    segments: p.segments,
    leavesPerVine: p.leavesPerVine,
    vineRadius: p.vineRadius,
  };

  // The J's geometry has been centered + scaled to ~2.4 units tall (set in
  // GLB load). Bounding box gives the radius for the helix wrap.
  baseGeometry.computeBoundingBox();
  const bbox = baseGeometry.boundingBox;
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const yMin = bbox.min.y, yMax = bbox.max.y;
  const wrapR = Math.max(size.x, size.z) * 0.55;     // slightly outside the J's silhouette

  // Vine bark material — dark woody brown
  const vineMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.07, 0.55, 0.18),
    roughness: 0.92, metalness: 0.0,
  });
  root.userData.vineMat = vineMat;

  // Parametric vine path generator
  const makePath = (seed, pitch, radiusJitter) => {
    const points = [];
    const TURNS = 1.4 + (seed * 1.7);   // total turns around J
    for (let i = 0; i <= p.segments; i++) {
      const t = i / p.segments;
      const ang = seed * Math.PI * 2 + t * Math.PI * 2 * TURNS;
      // Radius wobbles so vines aren't perfectly cylindrical
      const r = wrapR * (1.0 + Math.sin(t * Math.PI * 4 + seed * 7.0) * 0.18 * radiusJitter);
      const y = yMin + t * (yMax - yMin) * pitch;
      points.push(new THREE.Vector3(
        Math.cos(ang) * r,
        y,
        Math.sin(ang) * r,
      ));
    }
    return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
  };

  // Build N vines: each gets random phase, pitch (so some climb fast, some slow)
  const vines = [];
  for (let i = 0; i < p.vineCount; i++) {
    const seed = i / p.vineCount + (Math.random() - 0.5) * 0.05;
    const pitch = 0.85 + Math.random() * 0.5;
    const radiusJitter = 0.6 + Math.random() * 0.7;
    const curve = makePath(seed, pitch, radiusJitter);
    const tube = new THREE.TubeGeometry(curve, p.segments, p.vineRadius, 6, false);
    const mesh = new THREE.Mesh(tube, vineMat);
    root.add(mesh);
    vines.push({ curve, mesh });
  }

  // Leaves — instanced almond-shape geometry placed along each vine
  const totalLeaves = p.vineCount * p.leavesPerVine;
  const leaf = new THREE.BufferGeometry();
  const RINGS = 9;
  const verts = [];
  const idx = [];
  verts.push(0, 0, 0);
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;
    const y = t * 2.0;
    const widthCurve = Math.pow(Math.sin(Math.PI * t), 0.65);
    const w = widthCurve * 0.5;
    const z = Math.sin(t * Math.PI) * 0.10;
    const spineZ = Math.sin(t * Math.PI) * 0.04;
    verts.push(-w, y, z);
    verts.push( 0, y, z + spineZ);
    verts.push( w, y, z);
  }
  for (let i = 0; i < RINGS; i++) {
    if (i === 0) {
      idx.push(0, 1, 2);
      idx.push(0, 2, 3);
    } else {
      const aL = 1 + (i - 1) * 3, aC = aL + 1, aR = aL + 2;
      const bL = 1 + i * 3,        bC = bL + 1, bR = bL + 2;
      idx.push(aL, bL, aC);  idx.push(bL, bC, aC);
      idx.push(aC, bC, aR);  idx.push(bC, bR, aR);
    }
  }
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  leaf.setIndex(idx);
  leaf.computeVertexNormals();

  const leafU = {
    uTime: { value: 0 },
    uHue:  { value: p.hue },
    uWind: { value: p.wind },
    uSize: { value: p.leafSize },
  };

  const leafMat = new THREE.ShaderMaterial({
    uniforms: leafU,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime, uWind, uSize;
      attribute float aSeed;
      attribute vec3  aTint;
      varying vec2 vLeafUV;
      varying vec3 vTint;
      varying vec3 vN;
      varying vec3 vView;
      void main(){
        vLeafUV = vec2(position.x + 0.5, position.y / 2.0);
        vTint = aTint;
        vN = normalize(normalMatrix * normal);
        float yt = position.y / 2.0;
        float windAmp = uWind * 0.30 * pow(yt, 1.5);
        float sway = sin(uTime * 2.4 + aSeed * 17.3);
        float curl = cos(uTime * 1.7 + aSeed *  9.1);
        vec3 p = position;
        p.x += sway * windAmp * 0.4;
        p.z += sway * windAmp;
        p.z += curl * windAmp * 0.3;
        p *= uSize;
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        vec4 mv = modelViewMatrix * wp;
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uHue;
      varying vec2 vLeafUV;
      varying vec3 vTint;
      varying vec3 vN;
      varying vec3 vView;
      vec3 hsl2rgb(float h, float s, float l) {
        vec3 r = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
        return l + s * (r - 0.5) * (1.0 - abs(2.0*l - 1.0));
      }
      void main(){
        float spineDist = abs(vLeafUV.x - 0.5);
        float spine = smoothstep(0.025, 0.0, spineDist) * 0.75;
        float side = 0.0;
        for (int i = 0; i < 5; i++) {
          float yy = 0.18 + float(i) * 0.16;
          float dy = vLeafUV.y - yy;
          float vMask = smoothstep(0.025, 0.0, abs(dy - spineDist * 0.45));
          side = max(side, vMask * smoothstep(0.5, 0.3, spineDist));
        }
        float h = uHue + vTint.x;
        float s = 0.55 + vTint.y * 0.25;
        float l = 0.30 + vTint.z * 0.20;
        vec3 base = hsl2rgb(h, s, l);
        vec3 veinCol = hsl2rgb(h - 0.02, s * 0.7, l * 1.4);
        vec3 col = mix(base, veinCol, max(spine, side * 0.7));
        float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 1.5);
        col += hsl2rgb(h - 0.05, 0.6, 0.5) * fres * 0.4;
        vec3 L = normalize(vec3(0.4, 0.9, 0.5));
        float lit = 0.5 + 0.5 * max(0.0, dot(normalize(vN), L));
        col *= lit;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  leafMat.userData.uniforms = leafU;

  const leafInst = new THREE.InstancedMesh(leaf, leafMat, totalLeaves);
  const leafSeeds = new Float32Array(totalLeaves);
  const leafTints = new Float32Array(totalLeaves * 3);

  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  let li = 0;
  for (let v = 0; v < p.vineCount; v++) {
    const curve = vines[v].curve;
    for (let k = 0; k < p.leavesPerVine; k++) {
      // Stagger leaf positions along the vine, with jitter so they don't
      // line up perfectly
      const t = (k + 0.5) / p.leavesPerVine + (Math.random() - 0.5) * 0.02;
      const point = curve.getPoint(Math.min(1, Math.max(0, t)));
      const tangent = curve.getTangent(Math.min(1, Math.max(0, t)));
      // Leaf base sits OFF the vine, perpendicular to tangent
      // Build a perp by crossing with up (or x if vine is mostly vertical)
      const ref = Math.abs(tangent.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
      const perp = new THREE.Vector3().crossVectors(tangent, ref).normalize();
      // Random spin around the tangent so leaves point in varied directions
      const spinAngle = Math.random() * Math.PI * 2;
      const q1 = new THREE.Quaternion().setFromAxisAngle(tangent, spinAngle);
      perp.applyQuaternion(q1);
      // Position leaf base just off the vine surface
      tmpPos.copy(point).addScaledVector(perp, p.vineRadius * 0.8);
      // Orient leaf's "up" along the perp so the leaf grows outward
      tmpQuat.setFromUnitVectors(up, perp);
      // Random tilt for variety
      const tilt = new THREE.Quaternion().setFromAxisAngle(
        tangent,
        (Math.random() - 0.5) * 0.6,
      );
      tmpQuat.premultiply(tilt);
      // Per-leaf scale variation
      const sc = 0.6 + Math.random() * 0.8;
      tmpScale.setScalar(sc);
      tmp.compose(tmpPos, tmpQuat, tmpScale);
      leafInst.setMatrixAt(li, tmp);

      leafSeeds[li] = Math.random();
      leafTints[li * 3]     = (Math.random() - 0.5) * 0.06;
      leafTints[li * 3 + 1] = (Math.random() - 0.5) * 0.5;
      leafTints[li * 3 + 2] = (Math.random() - 0.5) * 0.6;
      li++;
    }
  }
  leafInst.count = li;
  leafInst.instanceMatrix.needsUpdate = true;
  leafInst.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(leafSeeds, 1));
  leafInst.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(leafTints, 3));
  leafInst.frustumCulled = false;
  root.add(leafInst);
  root.userData.leafMesh = leafInst;

  root.scale.copy(jMesh.scale);
  root.frustumCulled = false;
  decorGroup.add(root);
}

/* ──────────────────────────────────────────────────────────────
   APPLY SKIN + PARAM PANEL
   ────────────────────────────────────────────────────────────── */
let currentSkin = null;
let currentMaterial = null;

function getParams(skinKey) {
  return { ...SKINS[skinKey].params, ...(state.params[skinKey] || {}) };
}

function applySkin(skinKey, animate = true) {
  const def = SKINS[skinKey];
  if (!def || !jMesh) return;
  if (currentSkin && SKINS[currentSkin].onLeave) SKINS[currentSkin].onLeave();

  const params = getParams(skinKey);
  const newMat = def.make(params);
  if (def.onEnter) def.onEnter();

  if (animate && currentMaterial) {
    gsap.to(jMesh.scale, {
      x: jMesh.scale.x * 0.92, y: jMesh.scale.y * 0.92, z: jMesh.scale.z * 0.92,
      duration: 0.18, ease: 'power2.in',
      onComplete: () => {
        if (currentMaterial.dispose) currentMaterial.dispose();
        jMesh.material = newMat;
        currentMaterial = newMat;
        gsap.to(jMesh.scale, {
          x: jMesh.scale.x / 0.92, y: jMesh.scale.y / 0.92, z: jMesh.scale.z / 0.92,
          duration: 0.45, ease: 'elastic.out(1, 0.7)',
        });
      },
    });
  } else {
    if (currentMaterial && currentMaterial.dispose) currentMaterial.dispose();
    jMesh.material = newMat;
    currentMaterial = newMat;
  }

  bloomPass.enabled = !!def.post?.bloom;
  if (def.post?.bloom) {
    bloomPass.strength = def.post.bloomStrength ?? 0.6;
    bloomPass.radius = def.post.bloomRadius ?? 0.6;
    bloomPass.threshold = def.post.bloomThreshold ?? 0.5;
  }

  currentSkin = skinKey;
  state.skin = skinKey;
  saveState();
  buildParamPanel(skinKey);
}

function buildParamPanel(skinKey) {
  const def = SKINS[skinKey];
  const body = document.getElementById('param-body');
  const panel = document.getElementById('params');
  body.innerHTML = '';
  const params = getParams(skinKey);
  def.controls.forEach((ctrl) => {
    const wrap = document.createElement('div');
    wrap.className = 'control';
    const id = `ctrl-${skinKey}-${ctrl.key}`;
    const val = params[ctrl.key];
    if (ctrl.type === 'select') {
      const opts = ctrl.options.map(o => `<option value="${o.value}"${o.value===val?' selected':''}>${o.label}</option>`).join('');
      wrap.innerHTML = `<div class="row"><label for="${id}">${ctrl.label}</label></div><select id="${id}">${opts}</select>`;
      body.appendChild(wrap);
      wrap.querySelector('select').addEventListener('change', (e) => {
        params[ctrl.key] = e.target.value;
        state.params[skinKey] = params; saveState();
        applySkin(skinKey, false);
      });
    } else {
      const display = formatValue(val, ctrl);
      wrap.innerHTML = `
        <div class="row"><label for="${id}">${ctrl.label}</label><span class="val" id="${id}-val">${display}</span></div>
        <input type="range" id="${id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}">`;
      body.appendChild(wrap);
      const input = wrap.querySelector('input'); const valEl = wrap.querySelector('.val');
      input.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        params[ctrl.key] = v; state.params[skinKey] = params; saveState();
        def.update(params, currentMaterial);
        valEl.textContent = formatValue(v, ctrl);
      });
    }
  });
  panel.classList.add('show');
}
function formatValue(v, ctrl) {
  if (ctrl.step >= 1) return Math.round(v).toString();
  if (ctrl.step >= 0.1) return v.toFixed(1);
  return v.toFixed(2);
}

/* ──────────────────────────────────────────────────────────────
   BACKGROUND SYSTEMS — original implementations
   ────────────────────────────────────────────────────────────── */

let bgSystem = null;
let currentBg = null;

/* ───── Aurora — wispy curtains spread across the full canvas */
function makeAurora(params) {
  const p = { speed: 0.6, count: 8, ...params };
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uSpeed: { value: p.speed },
    uCount: { value: p.count },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
      uniform float uTime, uSpeed, uCount;
      uniform vec2 uRes, uMouse;
      // Wisp at a position in canvas-space, drifting horizontally + warping
      float wisp(vec2 uv, vec2 center, float seed, float speed, float spread) {
        // Wisp travels horizontally across the full canvas
        float drift = mod(uTime * speed * 0.05 + seed * 4.0, 4.5) - 2.25;
        vec2 c = center + vec2(drift, 0.0);
        // Warp the wisp shape with FBM noise
        float warpX = fbm2(vec2(uv.y * 0.6 + uTime * speed * 0.3, seed * 3.7)) * 1.2;
        float warpY = fbm2(vec2(uv.x * 0.6 + uTime * speed * 0.2, seed * 9.1)) * 0.6;
        vec2 d = uv - c - vec2(warpX, warpY);
        // Stretched vertical gaussian — wisp is taller than wide
        float distSq = (d.x * d.x) / (spread * spread) + (d.y * d.y) / (spread * spread * 4.0);
        float band = exp(-distSq * 1.5);
        // Vertical streaks within the wisp
        float streak = 0.6 + 0.4 * fbm2(vec2(uv.x * 5.0 + seed, uv.y * 9.0 - uTime * 0.5 * speed));
        return band * streak;
      }
      void main(){
        vec2 uv = (gl_FragCoord.xy - uRes.xy * 0.5) / uRes.y * 2.0;
        // x range covers full canvas aspect-aware
        float aspect = uRes.x / uRes.y;
        uv += (uMouse - 0.5) * 0.2;

        vec3 col = vec3(0.0);
        // Spread wisps across the canvas — randomized x positions, varied hues
        int N = int(min(uCount, 14.0));
        for (int i = 0; i < 14; i++) {
          if (i >= N) break;
          float fi = float(i);
          // Pseudo-random position spanning full canvas
          float seedX = fi * 0.4137 + 0.13;
          float seedY = fi * 0.7531 + 0.41;
          float xPos = (fract(sin(seedX * 73.7) * 4321.97) - 0.5) * 2.0 * aspect;
          float yPos = (fract(sin(seedY * 91.3) * 7723.11) - 0.5) * 1.5;
          float seed = fi * 1.7 + 0.31;
          float spread = 0.3 + fract(sin(fi * 13.9) * 12345.0) * 0.4;
          float speed = uSpeed * (0.7 + fract(sin(fi * 21.7) * 6789.0) * 0.6);
          // Hue rotates per wisp + slow drift over time
          float hue = fract(fi * 0.14 + uTime * 0.015);
          float w = wisp(uv, vec2(xPos, yPos), seed, speed, spread);
          col += hsl2rgb(hue, 0.9, 0.55) * w;
        }

        // Soft ambient base wash (dim)
        float ambient = 0.05 * (0.5 + fbm2(uv * 1.2 + uTime * 0.04));
        col += vec3(0.08, 0.10, 0.18) * ambient;

        // Starfield
        vec2 g = floor(gl_FragCoord.xy * 0.45);
        float h = fract(sin(dot(g, vec2(12.9, 78.2))) * 43758.5453);
        if (h > 0.992) {
          float tw = 0.5 + 0.5 * sin(uTime * 3.0 + h * 100.0);
          col += vec3(0.95, 0.92, 0.85) * (h - 0.992) * 95.0 * tw;
        }

        // Gentle vignette
        float vig = 1.0 - dot(uv, uv) * 0.06;
        col *= clamp(vig, 0.5, 1.0);

        // Tone curve
        col = col / (col + vec3(1.3));
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  bgScene.add(plane);
  return {
    scene: bgScene, camera: bgCamera, kind: 'aurora',
    tick(t, mouse) {
      uniforms.uTime.value = t;
      uniforms.uMouse.value.x = (mouse.x + 1) * 0.5;
      uniforms.uMouse.value.y = (1 - mouse.y) * 0.5;
    },
    resize(w, h) { uniforms.uRes.value.set(w, h); },
    setParam(k, v) {
      if (k === 'speed') uniforms.uSpeed.value = v;
      if (k === 'count') uniforms.uCount.value = v;
    },
    dispose() { mat.dispose(); plane.geometry.dispose(); },
  };
}

/* ───── Fireworks — original particle system with synthesized audio kick */
function makeFireworks(params) {
  const cfg = { frequency: 1.0, size: 1.0, ...params };
  const bgScene = new THREE.Scene();
  bgScene.fog = new THREE.FogExp2(0x000000, 0.0018);
  const bgCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
  bgCamera.position.set(0, 30, 175);          // tilted up & back so bursts fill the upper sky
  bgCamera.lookAt(0, 30, 0);

  // Glow sprite (radial canvas)
  const sprite = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d').createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    const ctx = c.getContext('2d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const starN = 1800;
  const sp = new Float32Array(starN * 3);
  for (let i = 0; i < starN * 3; i++) sp[i] = (Math.random() - 0.5) * 1500;
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 1.2, color: 0x9aa8b0, map: sprite, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  bgScene.add(stars);

  // Audio synth — sub-bass thud (my own envelope)
  const audio = {
    ctx: null, gain: null, enabled: true,
    init() {
      if (this.ctx) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.gain = this.ctx.createGain();
        this.gain.gain.value = 0.5;
        this.gain.connect(this.ctx.destination);
      } catch { this.enabled = false; }
    },
    boom() {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      // Sub-bass body
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(58, t0);
      o.frequency.exponentialRampToValueAtTime(22, t0 + 1.6);
      og.gain.setValueAtTime(0.0, t0);
      og.gain.linearRampToValueAtTime(0.7, t0 + 0.02);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 2.0);
      o.connect(og); og.connect(this.gain);
      o.start(t0); o.stop(t0 + 2.0);
      // Filtered noise tail
      const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(180, t0);
      lp.frequency.exponentialRampToValueAtTime(40, t0 + 1.4);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.5, t0);
      ng.gain.exponentialRampToValueAtTime(0.001, t0 + 1.5);
      ns.connect(lp); lp.connect(ng); ng.connect(this.gain);
      ns.start(t0);
    },
  };

  // A single rocket+burst entity
  class Rocket {
    constructor() {
      this.dead = false;
      this.phase = 'rise';
      this.timer = 0;
      const baseHue = Math.random();
      const palCount = Math.random() < 0.4 ? 1 : (Math.random() < 0.5 ? 2 : 3);
      this.palette = [];
      for (let i = 0; i < palCount; i++) {
        this.palette.push(new THREE.Color().setHSL((baseHue + i / palCount) % 1, 1.0, 0.58));
      }
      // Launch from below the visible area; burst higher in the sky to fill more of the viewport
      this.pos = new THREE.Vector3((Math.random() - 0.5) * 280, -110, (Math.random() - 0.5) * 90);
      this.vel = new THREE.Vector3((Math.random() - 0.5) * 0.7, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.7);
      this.target = 15 + Math.random() * 55;          // burst high (was -20..20)

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([this.pos.x, this.pos.y, this.pos.z], 3));
      this.rocket = new THREE.Points(g, new THREE.PointsMaterial({
        size: 2.5, color: this.palette[0], map: sprite, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      bgScene.add(this.rocket);
    }
    burst() {
      audio.boom();
      bgScene.remove(this.rocket);
      this.rocket.geometry.dispose(); this.rocket.material.dispose();
      this.rocket = null;
      this.phase = 'burst';
      const N = Math.floor((1200 + Math.floor(Math.random() * 800)) * cfg.size);
      this.N = N;
      this.pos0 = this.pos.clone();
      const positions = new Float32Array(N * 3);
      const colors = new Float32Array(N * 3);
      this.vel = new Float32Array(N * 3);
      this.life = new Float32Array(N);
      this.col0 = new Float32Array(N * 3);
      const speed = (1.6 + Math.random() * 1.4) * cfg.size;
      // Burst variant: spherical (most), ring (some), willow (some)
      const variant = Math.random();
      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        positions[i3] = this.pos0.x;
        positions[i3 + 1] = this.pos0.y;
        positions[i3 + 2] = this.pos0.z;
        let vx, vy, vz;
        if (variant < 0.65) {
          // sphere
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const v = speed * (0.85 + Math.random() * 0.3);
          vx = v * Math.sin(phi) * Math.cos(theta);
          vy = v * Math.sin(phi) * Math.sin(theta);
          vz = v * Math.cos(phi);
        } else if (variant < 0.85) {
          // ring (mostly horizontal)
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.9 + Math.random() * 0.2);
          vx = v * Math.cos(a);
          vy = (Math.random() - 0.5) * 0.4;
          vz = v * Math.sin(a);
        } else {
          // willow (slow, droops)
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const v = speed * 0.4 * (0.85 + Math.random() * 0.3);
          vx = v * Math.sin(phi) * Math.cos(theta);
          vy = v * Math.sin(phi) * Math.sin(theta) + 0.2;
          vz = v * Math.cos(phi);
        }
        this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
        const tc = this.palette[Math.floor(Math.random() * this.palette.length)];
        const b = 0.6 + Math.random() * 0.7;
        this.col0[i3]     = tc.r * b;
        this.col0[i3 + 1] = tc.g * b;
        this.col0[i3 + 2] = tc.b * b;
        colors[i3]     = this.col0[i3];
        colors[i3 + 1] = this.col0[i3 + 1];
        colors[i3 + 2] = this.col0[i3 + 2];
        this.life[i] = 1.0;
      }
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g2.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.spark = new THREE.Points(g2, new THREE.PointsMaterial({
        size: 1.0, map: sprite, transparent: true, depthWrite: false,
        vertexColors: true, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      bgScene.add(this.spark);
    }
    step(dt) {
      if (this.phase === 'rise') {
        this.pos.add(this.vel);
        this.vel.y *= 0.985;
        this.rocket.geometry.attributes.position.setXYZ(0, this.pos.x, this.pos.y, this.pos.z);
        this.rocket.geometry.attributes.position.needsUpdate = true;
        if (this.vel.y < 0.18 || this.pos.y >= this.target) this.burst();
      } else {
        this.timer += dt;
        const pos = this.spark.geometry.attributes.position.array;
        const cols = this.spark.geometry.attributes.color.array;
        let alive = 0;
        const hover = this.timer < 1.2;
        const gravFactor = hover ? 0 : Math.min(1, (this.timer - 1.2) / 0.6);
        for (let i = 0; i < this.N; i++) {
          if (this.life[i] <= 0) continue;
          alive++;
          const i3 = i * 3;
          pos[i3]     += this.vel[i3];
          pos[i3 + 1] += this.vel[i3 + 1];
          pos[i3 + 2] += this.vel[i3 + 2];
          if (hover) {
            this.vel[i3] *= 0.96; this.vel[i3 + 1] *= 0.96; this.vel[i3 + 2] *= 0.96;
          } else {
            this.vel[i3 + 1] -= 0.018 * gravFactor;
            this.vel[i3] *= 0.985; this.vel[i3 + 1] *= 0.985; this.vel[i3 + 2] *= 0.985;
            this.life[i] -= 0.0055;
          }
          const a = Math.max(0, this.life[i]);
          cols[i3]     = this.col0[i3]     * a * 1.4;
          cols[i3 + 1] = this.col0[i3 + 1] * a * 1.4;
          cols[i3 + 2] = this.col0[i3 + 2] * a * 1.4;
        }
        this.spark.geometry.attributes.position.needsUpdate = true;
        this.spark.geometry.attributes.color.needsUpdate = true;
        if (alive === 0) this.cleanup();
      }
    }
    cleanup() {
      this.dead = true;
      if (this.spark) {
        bgScene.remove(this.spark);
        this.spark.geometry.dispose(); this.spark.material.dispose();
      }
      if (this.rocket) {
        bgScene.remove(this.rocket);
        this.rocket.geometry.dispose(); this.rocket.material.dispose();
      }
    }
  }

  const rockets = [];
  let lastLaunch = 0;
  let nextDelay = 0;
  const clock = new THREE.Clock();

  function launch() { rockets.push(new Rocket()); }

  // Click anywhere = manual launch + audio init
  const onClick = () => {
    audio.init();
    if (audio.ctx?.state === 'suspended') audio.ctx.resume();
    launch();
  };
  host.addEventListener('click', onClick);

  return {
    scene: bgScene, camera: bgCamera, kind: 'fireworks',
    setParam(k, v) {
      if (k === 'frequency') cfg.frequency = v;
      if (k === 'size') cfg.size = v;
    },
    tick(_t) {
      const dt = clock.getDelta();
      const now = performance.now();
      if (now - lastLaunch > nextDelay) {
        lastLaunch = now;
        // Higher frequency = shorter delay
        nextDelay = (2400 + Math.random() * 2600) / Math.max(0.2, cfg.frequency);
        launch();
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        rockets[i].step(dt);
        if (rockets[i].dead) rockets.splice(i, 1);
      }
    },
    resize(w, h) {
      bgCamera.aspect = w / h;
      bgCamera.updateProjectionMatrix();
    },
    dispose() {
      host.removeEventListener('click', onClick);
      while (rockets.length) rockets.pop().cleanup();
      bgScene.remove(stars); starGeo.dispose(); stars.material.dispose();
      sprite.dispose();
      if (audio.ctx) audio.ctx.close();
    },
  };
}

/* ───── Galaxy — original spiral particle distribution */
function makeGalaxy(params) {
  const cfg = {
    quality: MOBILE ? 0 : 1,    // 0=low, 1=med, 2=high
    speed: 1.0,
    comets: true,
    ...params,
  };
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  bgCamera.position.set(0, 18, 95);
  bgCamera.lookAt(0, 0, 0);

  // Glow sprite
  const sprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const QUALITY_PRESETS = [40000, 100000, 200000];
  const N = QUALITY_PRESETS[Math.max(0, Math.min(2, cfg.quality | 0))];
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const radii = new Float32Array(N);
  const angles = new Float32Array(N);
  const heights = new Float32Array(N);
  const armCount = 4;
  const armWind = 3.2;
  const radius = 65;

  // Dust lane simulation — value-noise-like function deterministic per radius+angle
  const dust = (r, a) => {
    const x = Math.cos(a) * r * 0.04;
    const y = Math.sin(a) * r * 0.04;
    const n = Math.sin(x * 5.3 + y * 2.7) * Math.cos(x * 3.1 - y * 4.2);
    return Math.max(0, 0.5 + n * 0.45);
  };

  for (let i = 0; i < N; i++) {
    // Radial distribution: stronger central bulge
    const rT = Math.pow(Math.random(), 0.7);          // more central concentration
    const r = rT * radius;
    const arm = Math.floor(Math.random() * armCount);
    const baseAngle = (arm / armCount) * Math.PI * 2;
    const armOffset = (rT * armWind) * Math.PI * 2;
    // Tighter arms — less jitter so spiral structure is clearer
    const jitter = (Math.random() - 0.5) * (0.6 + (1.0 - rT) * 0.6);
    const angle = baseAngle + armOffset + jitter;
    // Vertical thickness — much thinner disk away from bulge
    const h = (Math.random() - 0.5) * (4.0 * Math.exp(-rT * 1.4));

    radii[i] = r;
    angles[i] = angle;
    heights[i] = h;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = h;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    // Color: deep core = warm yellow-white, outer edges = cool blue, with star-type variation
    const hue = 0.58 - rT * 0.48;
    const sat = 0.45 + Math.random() * 0.4;
    let lit = 0.55 + (1 - rT) * 0.35 + (Math.random() - 0.5) * 0.18;
    // Dust lanes: dim some particles — they "sit behind" dust and look darker/redder
    const d = dust(r, angle);
    if (Math.random() < 0.18 * d) {
      lit *= 0.35;
    }
    // Some bright giants
    if (Math.random() < 0.008) {
      lit = Math.min(0.95, lit + 0.4);
    }
    const c = new THREE.Color().setHSL(hue, sat, Math.min(0.95, Math.max(0.1, lit)));
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    // Sizes: bulge stars bigger, far stars smaller
    sizes[i] = (1.0 - rT * 0.7) * (0.4 + Math.random() * 0.9) + 0.25;
    if (Math.random() < 0.008) sizes[i] *= 2.5;     // a few brighter giants
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: sprite },
      uPixelRatio: { value: renderer.getPixelRatio() },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexColors: true,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uTime; uniform float uPixelRatio;
      void main(){
        vColor = color;
        vec3 p = position;
        // small twinkle: shimmer the size based on time and a per-particle hash
        float h = fract(sin(dot(p.xz, vec2(127.1, 311.7))) * 43758.5453);
        float tw = 0.7 + 0.3 * sin(uTime * 3.0 + h * 100.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * tw * 250.0 * uPixelRatio / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(vColor, 1.0) * t;
      }`,
  });

  const cloud = new THREE.Points(geo, mat);
  bgScene.add(cloud);

  // Bright central core — large additive sprite at galaxy center
  const coreSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sprite,
    color: 0xffe6b8,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  coreSprite.scale.set(28, 28, 1);
  bgScene.add(coreSprite);

  // Halo glow around core
  const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sprite,
    color: 0xffaa55,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.45,
  }));
  haloSprite.scale.set(75, 75, 1);
  bgScene.add(haloSprite);

  // Nebula tinted volume — large soft sprites scattered to suggest dust
  const nebulaGeo = new THREE.BufferGeometry();
  const nebN = 80;
  const nebPos = new Float32Array(nebN * 3);
  const nebCol = new Float32Array(nebN * 3);
  const nebSiz = new Float32Array(nebN);
  for (let i = 0; i < nebN; i++) {
    const r = Math.pow(Math.random(), 0.5) * radius;
    const a = Math.random() * Math.PI * 2;
    nebPos[i * 3]     = Math.cos(a) * r;
    nebPos[i * 3 + 1] = (Math.random() - 0.5) * 4;
    nebPos[i * 3 + 2] = Math.sin(a) * r;
    const hue = 0.7 + Math.random() * 0.2;
    const c = new THREE.Color().setHSL(hue, 0.4, 0.25);
    nebCol[i * 3] = c.r; nebCol[i * 3 + 1] = c.g; nebCol[i * 3 + 2] = c.b;
    nebSiz[i] = 30 + Math.random() * 50;
  }
  nebulaGeo.setAttribute('position', new THREE.BufferAttribute(nebPos, 3));
  nebulaGeo.setAttribute('color', new THREE.BufferAttribute(nebCol, 3));
  nebulaGeo.setAttribute('size', new THREE.BufferAttribute(nebSiz, 1));
  const nebMat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: sprite }, uPixelRatio: { value: renderer.getPixelRatio() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main(){
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * 8.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap;varying vec3 vColor;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(vColor,1.0)*t;}`,
  });
  const nebula = new THREE.Points(nebulaGeo, nebMat);
  bgScene.add(nebula);

  // Background star layer
  const bgStars = (() => {
    const g = new THREE.BufferGeometry();
    const M = 1500;
    const sp = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      const a = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 250 + Math.random() * 200;
      sp[i * 3] = Math.sin(phi) * Math.cos(a) * r;
      sp[i * 3 + 1] = Math.cos(phi) * r;
      sp[i * 3 + 2] = Math.sin(phi) * Math.sin(a) * r;
    }
    g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size: 1.4, color: 0xc0c8d0, map: sprite, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  })();
  bgScene.add(bgStars);

  // Comets — long-tailed particles streaking through the scene
  const comets = [];
  function spawnComet() {
    const startA = Math.random() * Math.PI * 2;
    const startR = 200 + Math.random() * 100;
    const targetA = startA + Math.PI + (Math.random() - 0.5) * 0.6;
    const targetR = 30 + Math.random() * 50;
    return {
      pos: new THREE.Vector3(Math.cos(startA) * startR, (Math.random() - 0.5) * 30, Math.sin(startA) * startR),
      target: new THREE.Vector3(Math.cos(targetA) * targetR, (Math.random() - 0.5) * 6, Math.sin(targetA) * targetR),
      progress: 0,
      duration: 6 + Math.random() * 6,
      trail: [],
    };
  }
  // Comet rendering: a single Line for each comet's trail
  const cometGeometries = [];
  const cometLines = [];
  const MAX_COMETS = 6;
  for (let i = 0; i < MAX_COMETS; i++) {
    const cg = new THREE.BufferGeometry();
    const positions = new Float32Array(40 * 3); // 40-segment trail
    const colors = new Float32Array(40 * 3);
    cg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    cg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    cometGeometries.push(cg);
    const line = new THREE.Line(cg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.visible = false;
    bgScene.add(line);
    cometLines.push(line);
  }
  let lastCometSpawn = 0;

  return {
    scene: bgScene, camera: bgCamera, kind: 'galaxy',
    setParam(k, v) {
      if (k === 'speed') cfg.speed = v;
      if (k === 'comets') cfg.comets = !!v;
    },
    tick(t, mouse) {
      mat.uniforms.uTime.value = t;
      // Per-particle differential rotation
      const pos = geo.attributes.position.array;
      const sp = cfg.speed;
      for (let i = 0; i < N; i++) {
        const r = radii[i];
        const w = 0.06 / (0.5 + r * 0.06);
        angles[i] += (w * 0.016 + 0.0003) * sp;
        const a = angles[i];
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      geo.attributes.position.needsUpdate = true;

      // Comets
      if (cfg.comets) {
        if (t - lastCometSpawn > 3.5 && comets.length < MAX_COMETS) {
          comets.push(spawnComet());
          lastCometSpawn = t;
        }
        const dt = 0.016;
        for (let i = comets.length - 1; i >= 0; i--) {
          const c = comets[i];
          c.progress += dt / c.duration;
          if (c.progress >= 1) { comets.splice(i, 1); continue; }
          // Lerp position
          c.pos.lerpVectors(c.pos, c.target, dt / (c.duration * (1 - c.progress) + 0.001));
          c.trail.unshift(c.pos.clone());
          if (c.trail.length > 40) c.trail.pop();
          // Update line geometry
          const line = cometLines[i];
          const cg = cometGeometries[i];
          const positions = cg.attributes.position.array;
          const colors = cg.attributes.color.array;
          for (let j = 0; j < 40; j++) {
            const pt = c.trail[j] || c.trail[c.trail.length - 1];
            positions[j * 3]     = pt ? pt.x : 0;
            positions[j * 3 + 1] = pt ? pt.y : 0;
            positions[j * 3 + 2] = pt ? pt.z : 0;
            const fade = (40 - j) / 40;
            colors[j * 3]     = 0.9 * fade;
            colors[j * 3 + 1] = 0.95 * fade;
            colors[j * 3 + 2] = 1.0 * fade;
          }
          cg.attributes.position.needsUpdate = true;
          cg.attributes.color.needsUpdate = true;
          line.visible = true;
        }
        // Hide unused comet lines
        for (let i = comets.length; i < MAX_COMETS; i++) cometLines[i].visible = false;
      } else {
        for (let i = 0; i < MAX_COMETS; i++) cometLines[i].visible = false;
      }

      // Camera orbit
      const camR = 95;
      const baseAngle = t * 0.04 * sp;
      const tilt = mouse.y * 12;
      bgCamera.position.x = Math.sin(baseAngle + mouse.x * 0.6) * camR;
      bgCamera.position.z = Math.cos(baseAngle + mouse.x * 0.6) * camR;
      bgCamera.position.y = 18 + tilt;
      bgCamera.lookAt(0, 0, 0);
    },
    resize(w, h) {
      bgCamera.aspect = w / h;
      bgCamera.updateProjectionMatrix();
    },
    dispose() {
      bgScene.remove(cloud); geo.dispose(); mat.dispose();
      bgScene.remove(nebula); nebulaGeo.dispose(); nebMat.dispose();
      bgScene.remove(bgStars); bgStars.geometry.dispose(); bgStars.material.dispose();
      bgScene.remove(coreSprite); coreSprite.material.dispose();
      bgScene.remove(haloSprite); haloSprite.material.dispose();
      cometLines.forEach((l, i) => { bgScene.remove(l); cometGeometries[i].dispose(); l.material.dispose(); });
      sprite.dispose();
    },
  };
}

const BG_FACTORIES = {
  none: null,
  aurora: makeAurora,
  fireworks: makeFireworks,
  galaxy: makeGalaxy,
};

const BG_DEFAULTS = {
  aurora: { speed: 0.6, count: 8 },
  fireworks: { frequency: 1.0, size: 1.0 },
  galaxy: { quality: MOBILE ? 0 : 1, speed: 1.0, comets: true },
};

const BG_CONTROLS = {
  aurora: [
    { key: 'speed', label: 'Speed', min: 0.1, max: 2, step: 0.05 },
    { key: 'count', label: 'Wisp count', min: 2, max: 14, step: 1 },
  ],
  fireworks: [
    { key: 'frequency', label: 'Frequency', min: 0.3, max: 3, step: 0.1 },
    { key: 'size', label: 'Burst size', min: 0.5, max: 2, step: 0.05 },
  ],
  galaxy: [
    { key: 'quality', label: 'Quality (0=low,2=high)', min: 0, max: 2, step: 1 },
    { key: 'speed', label: 'Rotation speed', min: 0, max: 3, step: 0.05 },
    { key: 'comets', label: 'Comets', min: 0, max: 1, step: 1 },
  ],
};

function getBgParams(key) {
  return { ...BG_DEFAULTS[key], ...(state.bgParams?.[key] || {}) };
}

function applyBg(key) {
  if (bgSystem) { bgSystem.dispose(); bgSystem = null; }
  if (key !== 'none' && BG_FACTORIES[key]) {
    bgSystem = BG_FACTORIES[key](getBgParams(key));
  }
  currentBg = key;
  state.bg = key;
  saveState();
  buildBgParamPanel(key);
}

function buildBgParamPanel(key) {
  const panel = document.getElementById('bg-params');
  const body = document.getElementById('bg-param-body');
  if (!panel || !body) return;
  if (key === 'none' || !BG_CONTROLS[key]) {
    panel.classList.remove('show');
    body.innerHTML = '';
    return;
  }
  body.innerHTML = '';
  const params = getBgParams(key);
  BG_CONTROLS[key].forEach((ctrl) => {
    const wrap = document.createElement('div');
    wrap.className = 'control';
    const id = `bgctrl-${key}-${ctrl.key}`;
    const val = params[ctrl.key];
    const display = ctrl.step >= 1 ? Math.round(val) : val.toFixed(2);
    wrap.innerHTML = `
      <div class="row"><label for="${id}">${ctrl.label}</label><span class="val" id="${id}-val">${display}</span></div>
      <input type="range" id="${id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}">`;
    body.appendChild(wrap);
    const input = wrap.querySelector('input');
    const valEl = wrap.querySelector('.val');
    input.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      params[ctrl.key] = v;
      state.bgParams = state.bgParams || {};
      state.bgParams[key] = params;
      saveState();
      // Quality on galaxy means full rebuild; otherwise live update
      if (key === 'galaxy' && ctrl.key === 'quality') {
        applyBg(key);
      } else if (bgSystem?.setParam) {
        bgSystem.setParam(ctrl.key, v);
      }
      valEl.textContent = ctrl.step >= 1 ? Math.round(v) : v.toFixed(2);
    });
  });
  panel.classList.add('show');
}

/* ──────────────────────────────────────────────────────────────
   UI WIRING
   ────────────────────────────────────────────────────────────── */
function setActiveButton(key) {
  document.querySelectorAll('#skin-rail button').forEach(b => b.classList.toggle('active', b.dataset.skin === key));
}
function setActiveBgButton(key) {
  document.querySelectorAll('#bg-select button').forEach(b => b.classList.toggle('active', b.dataset.bg === key));
}

document.querySelectorAll('#skin-rail button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.skin;
    if (!SKINS[key] || key === currentSkin) return;
    setActiveButton(key); applySkin(key); notifyInteraction();
  });
});

document.querySelectorAll('#bg-select button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.bg;
    if (key === currentBg) return;
    setActiveBgButton(key); applyBg(key);
  });
});

document.querySelector('#params .reset').addEventListener('click', () => {
  delete state.params[currentSkin]; saveState();
  applySkin(currentSkin, false); setActiveButton(currentSkin);
});

/* J controls */
const playPauseBtn = document.getElementById('play-pause');
const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');
const tvBtn = document.getElementById('tv-toggle');
const tvLbl = document.getElementById('tv-lbl');

function updateSpeedUI() {
  speedSlider.value = state.speed;
  speedVal.textContent = state.speed.toFixed(1) + 'x';
  document.getElementById('ic-play').style.display = state.paused ? 'block' : 'none';
  document.getElementById('ic-pause').style.display = state.paused ? 'none' : 'block';
}
playPauseBtn.addEventListener('click', () => { state.paused = !state.paused; saveState(); updateSpeedUI(); });
speedSlider.addEventListener('input', (e) => { state.speed = parseFloat(e.target.value); saveState(); updateSpeedUI(); });
document.getElementById('speed-down').addEventListener('click', () => { state.speed = Math.max(-2, state.speed - 0.2); saveState(); updateSpeedUI(); });
document.getElementById('speed-up').addEventListener('click', () => { state.speed = Math.min(3, state.speed + 0.2); saveState(); updateSpeedUI(); });

function updateTvUI() { tvBtn.textContent = state.tv ? 'On' : 'Off'; tvBtn.classList.toggle('on', state.tv); tvLbl.classList.toggle('on', state.tv); }
tvBtn.addEventListener('click', () => {
  state.tv = !state.tv; saveState(); updateTvUI();
  if (state.tv) startTvCycle(); else stopTvCycle();
});

let tvTimer = null;
const TV_INTERVAL_MS = 14000;
function startTvCycle() {
  stopTvCycle();
  tvTimer = setInterval(() => {
    const keys = Object.keys(SKINS);
    const idx = keys.indexOf(currentSkin);
    const next = keys[(idx + 1) % keys.length];
    setActiveButton(next); applySkin(next);
    window.dispatchEvent(new CustomEvent('jdev:skinchange', { detail: { skin: next } }));
  }, TV_INTERVAL_MS);
}
function stopTvCycle() { if (tvTimer) { clearInterval(tvTimer); tvTimer = null; } }

let interactionTimer = null;
function notifyInteraction() {
  if (!state.tv) return;
  stopTvCycle();
  if (interactionTimer) clearTimeout(interactionTimer);
  interactionTimer = setTimeout(() => { if (state.tv) startTvCycle(); }, 30000);
}

/* Keyboard */
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 9) {
    const k = Object.keys(SKINS)[num - 1];
    if (k) { setActiveButton(k); applySkin(k); notifyInteraction(); }
  } else if (e.key === ' ') {
    e.preventDefault(); state.paused = !state.paused; saveState(); updateSpeedUI();
  } else if (e.key === 't' || e.key === 'T') {
    state.tv = !state.tv; saveState(); updateTvUI();
    if (state.tv) startTvCycle(); else stopTvCycle();
  } else if (e.key === 'r' || e.key === 'R') {
    delete state.params[currentSkin]; saveState(); applySkin(currentSkin, false);
  } else if (e.key === 'p' || e.key === 'P') {
    document.getElementById('params').classList.toggle('show');
  } else if (e.key === 'b' || e.key === 'B') {
    const bgs = Object.keys(BG_FACTORIES);
    const idx = bgs.indexOf(currentBg);
    const next = bgs[(idx + 1) % bgs.length];
    setActiveBgButton(next); applyBg(next);
  }
});

updateSpeedUI(); updateTvUI();
if (state.tv) startTvCycle();

/* Pointer interaction */
let isDragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0;
let mouseX = 0, mouseY = 0;
function onDown(e) {
  isDragging = true;
  lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  lastY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  velX = 0; velY = 0; notifyInteraction();
}
function onMove(e) {
  const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  mouseX = (x / window.innerWidth) * 2 - 1;
  mouseY = (y / window.innerHeight) * 2 - 1;
  if (!isDragging) return;
  velX = (y - lastY) * 0.005; velY = (x - lastX) * 0.005;
  lastX = x; lastY = y;
}
function onUp() { isDragging = false; }
host.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
host.addEventListener('touchstart', onDown, { passive: true });
window.addEventListener('touchmove', onMove, { passive: true });
window.addEventListener('touchend', onUp);

/* ──────────────────────────────────────────────────────────────
   ANIMATION LOOP — BG first, then J scene
   ────────────────────────────────────────────────────────────── */
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Slowly orbit rim light always (tiny effect on most skins, helps metallic)
  rimLight.position.set(Math.cos(t * 0.18) * 4, -1, Math.sin(t * 0.18) * 4);

  if (jGroup) {
    if (isDragging) {
      jGroup.rotation.x += velX; jGroup.rotation.y += velY;
    } else {
      velX *= 0.95; velY *= 0.95;
      jGroup.rotation.x += velX;
      const idle = state.paused ? 0 : 0.0025 * state.speed;
      jGroup.rotation.y += velY + idle;
    }
    jGroup.position.x += (mouseX * 0.06 - jGroup.position.x) * 0.04;
    jGroup.position.y += (-mouseY * 0.04 - jGroup.position.y) * 0.04;
  }

  if (currentSkin && currentMaterial && SKINS[currentSkin].tick) {
    SKINS[currentSkin].tick(t, currentMaterial);
  }

  // Render BG first, then J
  renderer.clear(true, true, true);
  if (bgSystem) {
    bgSystem.tick(t, { x: mouseX, y: mouseY });
    renderer.render(bgSystem.scene, bgSystem.camera);
    renderer.clearDepth();
  }
  if (bloomPass.enabled) composer.render();
  else renderer.render(scene, camera);
}
animate();

/* Resize */
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h);
  if (bgSystem?.resize) bgSystem.resize(w, h);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) clock.stop(); else clock.start(); });
