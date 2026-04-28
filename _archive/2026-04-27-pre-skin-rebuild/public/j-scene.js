/**
 * jonathanellis.dev — 3D J morphing scene · v3
 *
 * Skins: 9 (metallic·lasers·lava·water·iridescent·stones·fuzzy·camo·vines)
 * Backgrounds: 4 (none·aurora·fireworks·galaxy) — original implementations
 * Controls: skin params, spin play/pause/speed, TV cycle mode, BG switcher
 *
 * All shader/particle code below is original — written for this site,
 * using common public-domain techniques (value noise, FBM, additive
 * particles, spiral distribution).
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
const STORAGE_KEY = 'jdev-state-v3';
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
const STONE_TYPES = {
  granite:    { name: 'Granite',    base: [0.42, 0.40, 0.38], speck: [0.25, 0.22, 0.20], bumpScale: 1.0, vein: 0.0 },
  marble:     { name: 'Marble',     base: [0.92, 0.92, 0.90], speck: [0.78, 0.78, 0.74], bumpScale: 0.3, vein: 1.0 },
  jade:       { name: 'Jade',       base: [0.20, 0.50, 0.32], speck: [0.10, 0.30, 0.20], bumpScale: 0.4, vein: 0.6 },
  red_jasper: { name: 'Red Jasper', base: [0.55, 0.18, 0.14], speck: [0.30, 0.08, 0.08], bumpScale: 0.6, vein: 0.2 },
  carnelian:  { name: 'Carnelian',  base: [0.78, 0.32, 0.10], speck: [0.45, 0.18, 0.06], bumpScale: 0.4, vein: 0.3 },
  citrine:    { name: 'Citrine',    base: [0.92, 0.72, 0.18], speck: [0.65, 0.50, 0.10], bumpScale: 0.3, vein: 0.4 },
  aventurine: { name: 'Aventurine', base: [0.30, 0.55, 0.32], speck: [0.18, 0.35, 0.20], bumpScale: 0.5, vein: 0.3 },
  sodalite:   { name: 'Sodalite',   base: [0.18, 0.28, 0.55], speck: [0.85, 0.85, 0.92], bumpScale: 0.7, vein: 0.5 },
  amethyst:   { name: 'Amethyst',   base: [0.45, 0.25, 0.65], speck: [0.30, 0.15, 0.45], bumpScale: 0.4, vein: 0.4 },
  obsidian:   { name: 'Obsidian',   base: [0.06, 0.06, 0.08], speck: [0.18, 0.18, 0.22], bumpScale: 1.2, vein: 0.0 },
};
const CAMO_TYPES = {
  forest:  { name: 'Forest',  colors: [[0.25,0.35,0.20],[0.42,0.50,0.30],[0.18,0.25,0.15],[0.10,0.15,0.08]] },
  jungle:  { name: 'Jungle',  colors: [[0.18,0.40,0.18],[0.30,0.55,0.25],[0.10,0.25,0.10],[0.40,0.45,0.20]] },
  desert:  { name: 'Desert',  colors: [[0.78,0.65,0.42],[0.55,0.42,0.25],[0.92,0.80,0.55],[0.45,0.35,0.20]] },
  white:   { name: 'Snow',    colors: [[0.92,0.94,0.95],[0.78,0.82,0.85],[0.55,0.60,0.65],[0.35,0.42,0.48]] },
  night:   { name: 'Night',   colors: [[0.06,0.10,0.15],[0.12,0.18,0.25],[0.22,0.28,0.35],[0.04,0.06,0.10]] },
  urban:   { name: 'Urban',   colors: [[0.30,0.32,0.34],[0.45,0.48,0.50],[0.18,0.20,0.22],[0.62,0.65,0.68]] },
  tiger:   { name: 'Tiger',   colors: [[0.85,0.50,0.10],[0.95,0.78,0.30],[0.10,0.06,0.04],[0.55,0.30,0.08]] },
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

  /* ───── 01 · METALLIC — green by default; tint slider cycles full color wheel */
  metallic: {
    label: 'Metallic',
    params: { roughness: 0.15, clearcoat: 0.9, shimmer: 0.7, sweep: 0.6, hue: 0.33, autoTint: 1 },
    post: { bloom: false },
    make(p) {
      // Default = green (hue 0.33). Slider goes 0..1 = full color wheel.
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(p.hue, 0.85, 0.55),
        metalness: 1.0,
        roughness: p.roughness,
        clearcoat: p.clearcoat,
        clearcoatRoughness: 0.02,
        envMapIntensity: 1.8,
        iridescence: p.shimmer * 0.8,
        iridescenceIOR: 1.45,
        iridescenceThicknessRange: [200, 900],
      });
      // Custom shader injection: sweeping highlight band that rides over the surface
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uSweep = { value: p.sweep };
        // Inject varying in vertex shader so we know world position in fragment
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
           varying vec3 vSurfacePos;`
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSurfacePos = position;`
        );
        // Inject sweeping highlight in fragment output stage
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uSweep;
           varying vec3 vSurfacePos;`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <output_fragment>',
          `
            // Sweeping iridescent band across the J — moves slowly across, hue cycles
            float bandT = uTime * 0.18;
            float bandPos = vSurfacePos.y * 0.7 + vSurfacePos.x * 0.4;
            float band = exp(-pow((bandPos - sin(bandT) * 1.4), 2.0) * 4.0);
            // hue shifts as the band moves
            float bh = fract(bandT * 0.3);
            vec3 bandCol = vec3(
              0.5 + 0.5 * cos(6.28318 * (bh + 0.0)),
              0.5 + 0.5 * cos(6.28318 * (bh + 0.33)),
              0.5 + 0.5 * cos(6.28318 * (bh + 0.66))
            );
            outgoingLight += bandCol * band * uSweep * 0.55;
            #include <output_fragment>
          `
        );
        mat.userData.shader = shader;
      };
      return mat;
    },
    controls: [
      { key: 'roughness', label: 'Roughness', min: 0, max: 0.6, step: 0.01 },
      { key: 'clearcoat', label: 'Clearcoat', min: 0, max: 1, step: 0.01 },
      { key: 'shimmer', label: 'Shimmer', min: 0, max: 1, step: 0.01 },
      { key: 'sweep', label: 'Sweep band', min: 0, max: 1, step: 0.01 },
      { key: 'hue', label: 'Tint', min: 0, max: 1, step: 0.01 },
      { key: 'autoTint', label: 'Cycle colors', min: 0, max: 1, step: 1 },
    ],
    update(p, mat) {
      mat.roughness = p.roughness;
      mat.clearcoat = p.clearcoat;
      mat.iridescence = p.shimmer * 0.8;
      // If autoTint is off, use the slider hue immediately
      if (!p.autoTint) mat.color.setHSL(p.hue, 0.85, 0.55);
      mat.userData.shimmer = p.shimmer;
      mat.userData.sweep = p.sweep;
      mat.userData.autoTint = p.autoTint;
      mat.userData.manualHue = p.hue;
      if (mat.userData.shader) mat.userData.shader.uniforms.uSweep.value = p.sweep;
    },
    tick(t, mat) {
      const sh = mat.userData.shimmer ?? 0.7;
      mat.envMapIntensity = 1.7 + Math.sin(t * 0.4) * 0.3;
      const lo = 200 + Math.sin(t * 0.25) * 130;
      const hi = 900 + Math.cos(t * 0.3) * 280;
      mat.iridescenceThicknessRange = [lo, hi];
      mat.iridescence = sh * (0.55 + 0.25 * Math.sin(t * 0.6));
      // Color cycle through full hue wheel — completes a full cycle every ~24 seconds
      if (mat.userData.autoTint) {
        const cycledHue = (t * 0.04 + (mat.userData.manualHue ?? 0.33)) % 1;
        mat.color.setHSL(cycledHue, 0.85, 0.55);
      }
      if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t;
      const r = 2.8;
      orbLight.position.set(Math.cos(t * 0.4) * r, Math.sin(t * 0.25) * 1.4, Math.sin(t * 0.4) * r);
      orbLight.intensity = 1.6 + Math.sin(t * 0.6) * 0.7;
      orbLight.color.setHSL(0.08 + Math.sin(t * 0.2) * 0.05, 0.4, 0.85);
    },
    onEnter() { orbLight.intensity = 1.6; },
    onLeave() { orbLight.intensity = 0.0; },
  },

  /* ───── 02 · LASERS — anti-aliased holographic grid, no aliasing/glitching */
  lasers: {
    label: 'Lasers',
    params: { speed: 0.4, spacing: 0.10, glow: 1.0, hue: 0.33 },
    post: { bloom: true, bloomStrength: 0.8, bloomRadius: 0.7, bloomThreshold: 0.5 },
    make(p) {
      const u = {
        time: { value: 0 }, speed: { value: p.speed },
        spacing: { value: p.spacing }, glow: { value: p.glow }, hue: { value: p.hue },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        glslVersion: THREE.GLSL3,
        vertexShader: `
          out vec3 vP; out vec3 vN; out vec3 vView;
          void main(){
            vP = position;
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: GLSL_HSL + `
          in vec3 vP; in vec3 vN; in vec3 vView;
          uniform float time, speed, spacing, glow, hue;
          out vec4 fragColor;

          // Anti-aliased horizontal line at periodic offset.
          // Returns 0..1 line intensity that's smoothed at sub-pixel level.
          float aaLine(float coord, float spacing, float thickness) {
            // Distance to nearest line in coord-space
            float n = coord / spacing;
            float dist = abs(fract(n) - 0.5);     // 0 at line center, 0.5 between lines
            // Use derivatives for proper anti-aliasing
            float w = fwidth(n) * 1.5;
            // Width of the band in normalized units
            float halfWidth = thickness;
            return 1.0 - smoothstep(halfWidth - w, halfWidth + w, dist);
          }

          void main(){
            // One axis only — clean horizontal scan, slow vertical drift
            float coord = vP.y - time * speed * 0.5;
            float lineMain = aaLine(coord, spacing, 0.06);
            // Secondary thin lines between, dimmer
            float lineFine = aaLine(coord + spacing * 0.5, spacing, 0.02) * 0.4;

            // Edge fresnel — bright rim
            float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 2.5);

            // Color: very slow hue drift, no high-frequency change
            float h = hue + sin(time * 0.04) * 0.06;
            vec3 lineCol = hsl2rgb(h, 1.0, 0.60);
            vec3 rimCol  = hsl2rgb(h + 0.5, 0.9, 0.55);

            // Final: base dim glow + sharp lines + rim
            vec3 col = vec3(0.0);
            col += hsl2rgb(h, 0.9, 0.10) * 0.08;            // very dim base reads silhouette
            col += lineCol * (lineMain + lineFine) * glow;
            col += rimCol * fres * 0.45;

            fragColor = vec4(col, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'speed', label: 'Scan speed', min: 0, max: 2, step: 0.01 },
      { key: 'spacing', label: 'Line spacing', min: 0.04, max: 0.4, step: 0.005 },
      { key: 'glow', label: 'Glow', min: 0.4, max: 2.5, step: 0.05 },
      { key: 'hue', label: 'Color', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.speed.value = p.speed; u.spacing.value = p.spacing;
      u.glow.value = p.glow; u.hue.value = p.hue;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },

  /* ───── 03 · LAVA — true volcanic look: black rock, glowing red-orange magma in cracks, flowing */
  lava: {
    label: 'Lava',
    params: { heat: 0.4, flow: 0.5, cracks: 0.7, chunks: 0.6 },
    post: { bloom: true, bloomStrength: 0.5, bloomRadius: 0.4, bloomThreshold: 0.85 },
    make(p) {
      const u = {
        time: { value: 0 }, heat: { value: p.heat }, flow: { value: p.flow },
        cracks: { value: p.cracks }, chunks: { value: p.chunks },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: GLSL_VALUE_NOISE + `
          uniform float time, flow, cracks, chunks;
          varying vec3 vP; varying vec3 vN; varying float vChunk; varying float vCrackDepth;
          void main(){
            float t = time * (0.10 + flow * 0.20);
            // Charcoal chunks — large outward bumps with hard threshold (rocky look)
            float chunkNoise = fbm3(position * 3.0 + vec3(t * 0.15, 0.0, t * 0.1));
            float chunk = smoothstep(0.45, 0.65, chunkNoise);
            // Crack pattern — thin valleys for magma. Use Worley-like distance.
            // Two octaves combined for irregular crack networks.
            float c1 = abs(vnoise3(position * 7.0 + vec3(t * 0.3, 0.0, 0.0)) * 2.0 - 1.0);
            float c2 = abs(vnoise3(position * 4.0 + vec3(0.0, t * 0.2, t * 0.15)) * 2.0 - 1.0);
            float crackBase = min(c1, c2);
            float crackMask = pow(1.0 - smoothstep(0.0, 0.08, crackBase), 3.0);
            // Displacement: chunks bulge out, cracks recede
            float disp = chunk * 0.08 * chunks - crackMask * 0.06 * cracks;
            vec3 d = position + normal * disp;
            vChunk = chunk;
            vCrackDepth = crackMask;
            vP = position;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(d, 1.0);
          }`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
          uniform float time, heat, flow;
          varying vec3 vP; varying vec3 vN; varying float vChunk; varying float vCrackDepth;
          void main(){
            float t = time * (0.25 + flow * 0.5);
            // Flowing magma noise — advected over time so it looks like it's moving
            vec3 flowOff = vec3(0.0, -t * 0.3, t * 0.15);
            float magmaFlow = fbm3(vP * 8.0 + flowOff);
            // Color stops along temperature gradient
            // BLACK rock → DEEP RED → ORANGE → YELLOW (only when very deep+hot)
            // Crack depth determines temperature reveal
            float temp = vCrackDepth * (0.5 + heat * 0.7) + magmaFlow * vCrackDepth * 0.4;

            // Base rock color: very dark with subtle texture variation
            float rockTex = fbm3(vP * 28.0);
            vec3 rock = vec3(0.020, 0.015, 0.013) + vec3(0.025) * rockTex;
            // Bumpy chunks slightly lighter than smooth rock
            rock = mix(rock, rock * 1.4, vChunk * 0.6);

            // Magma gradient — red at low temp, orange/yellow at high
            // 0..0.3 = invisible, 0.3..0.5 = deep red, 0.5..0.8 = orange, 0.8..1 = bright yellow
            vec3 magma = vec3(0.0);
            if (temp > 0.3) {
              float t2 = smoothstep(0.3, 1.0, temp);
              vec3 deepRed = vec3(0.35, 0.04, 0.0);     // low-temp red
              vec3 orange  = vec3(0.95, 0.30, 0.05);    // mid magma
              vec3 yellow  = vec3(1.00, 0.78, 0.20);    // peak heat
              if (t2 < 0.5) magma = mix(deepRed, orange, t2 * 2.0);
              else          magma = mix(orange, yellow, (t2 - 0.5) * 2.0);
              // Boost magma brightness in deepest cracks (for bloom)
              magma *= (1.0 + smoothstep(0.7, 1.0, temp) * 1.5);
            }

            // Mix: rock base, magma fills cracks
            float magmaMask = smoothstep(0.30, 0.55, temp);
            vec3 col = mix(rock, magma, magmaMask);

            // Glow halo around hot edges — adds atmospheric warmth without making the J white
            float halo = smoothstep(0.5, 0.9, temp) * heat;
            col += vec3(0.6, 0.18, 0.04) * halo * 0.5;

            // Lambert lighting on the rock parts only — don't dim glowing magma
            vec3 L_dir = normalize(vec3(0.5, 0.8, 0.6));
            float diff = max(0.25, dot(normalize(vN), L_dir));
            col = mix(col * diff, col, magmaMask);

            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'heat', label: 'Heat', min: 0, max: 1, step: 0.01 },
      { key: 'flow', label: 'Flow', min: 0, max: 1, step: 0.01 },
      { key: 'cracks', label: 'Crack depth', min: 0.3, max: 1, step: 0.01 },
      { key: 'chunks', label: 'Chunks', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.heat.value = p.heat; u.flow.value = p.flow;
      u.cracks.value = p.cracks; u.chunks.value = p.chunks;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },

  /* ───── 04 · WATER */
  water: {
    label: 'Water',
    params: { transmission: 0.95, thickness: 0.6, ior: 1.33, ripple: 0.4 },
    post: { bloom: false },
    make(p) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccdd, metalness: 0.0, roughness: 0.05,
        transmission: p.transmission, thickness: p.thickness, ior: p.ior,
        envMapIntensity: 1.4, clearcoat: 1.0, clearcoatRoughness: 0.0,
        attenuationColor: 0x66bbcc, attenuationDistance: 1.4, side: THREE.DoubleSide,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uRipple = { value: p.ripple };
        shader.vertexShader = 'uniform float uTime;\nuniform float uRipple;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
            transformed.x += sin(uTime*1.4+position.y*8.0)*0.008*uRipple;
            transformed.z += cos(uTime*1.7+position.y*7.0)*0.008*uRipple;`
        );
        mat.userData.shader = shader;
      };
      return mat;
    },
    controls: [
      { key: 'transmission', label: 'Clarity', min: 0.5, max: 1, step: 0.01 },
      { key: 'thickness', label: 'Thickness', min: 0, max: 2, step: 0.05 },
      { key: 'ior', label: 'IOR', min: 1, max: 2, step: 0.01 },
      { key: 'ripple', label: 'Ripple', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      mat.transmission = p.transmission; mat.thickness = p.thickness; mat.ior = p.ior;
      if (mat.userData.shader) mat.userData.shader.uniforms.uRipple.value = p.ripple;
    },
    tick(t, mat) { if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t; },
  },

  /* ───── 05 · VAPOUR — translucent flowing fog/cloud wrapping the J */
  vapour: {
    label: 'Vapour',
    params: { density: 0.55, flow: 0.5, hue: 0.55, glow: 0.6 },
    post: { bloom: true, bloomStrength: 0.5, bloomRadius: 0.9, bloomThreshold: 0.3 },
    make(p) {
      const u = {
        time: { value: 0 }, density: { value: p.density }, flow: { value: p.flow },
        hue: { value: p.hue }, glow: { value: p.glow },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: GLSL_VALUE_NOISE + `
          uniform float time, flow;
          varying vec3 vP; varying vec3 vN; varying vec3 vView;
          void main(){
            // Slight outward "puff" to make J fluffier
            float puff = fbm3(position * 3.0 + vec3(time * 0.2 * flow, 0.0, 0.0)) * 0.05;
            vec3 d = position + normal * puff;
            vP = position;
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(d, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
          uniform float time, density, hue, flow, glow;
          varying vec3 vP; varying vec3 vN; varying vec3 vView;
          void main(){
            float t = time * (0.15 + flow * 0.5);
            // Two layers of swirling noise for cloud-like motion
            float n1 = fbm3(vP * 4.0 + vec3(t * 0.4, t, t * 0.6));
            float n2 = fbm3(vP * 8.0 + vec3(-t * 0.3, t * 0.8, 0.0));
            float vapor = n1 * 0.6 + n2 * 0.4;
            // Soft alpha based on noise + fresnel — denser at glancing angles, like real fog
            float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 1.5);
            float alpha = smoothstep(0.3, 0.7, vapor) * density;
            alpha = mix(alpha, alpha + fres * 0.3, 0.5);
            alpha = clamp(alpha, 0.0, 0.9);
            // Color: shifts subtly with vapor density and hue parameter
            float h = hue + vapor * 0.05 + sin(time * 0.1) * 0.03;
            vec3 base = hsl2rgb(h, 0.4, 0.7);
            vec3 bright = hsl2rgb(h + 0.05, 0.3, 0.95);
            vec3 col = mix(base, bright, vapor);
            // Glow at fresnel edges
            col += hsl2rgb(h + 0.1, 0.5, 0.85) * fres * glow * 0.4;
            gl_FragColor = vec4(col, alpha);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'density', label: 'Density', min: 0.2, max: 1, step: 0.01 },
      { key: 'flow', label: 'Flow speed', min: 0, max: 1.5, step: 0.05 },
      { key: 'hue', label: 'Hue', min: 0, max: 1, step: 0.01 },
      { key: 'glow', label: 'Edge glow', min: 0, max: 1.5, step: 0.05 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.density.value = p.density; u.flow.value = p.flow;
      u.hue.value = p.hue; u.glow.value = p.glow;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },

  /* ───── 06 · STONES */
  stones: {
    label: 'Stones',
    params: { type: 'granite', roughness: 0.85, scale: 0.6 },
    post: { bloom: false },
    make(p) {
      const t = STONE_TYPES[p.type] || STONE_TYPES.granite;
      const u = {
        time: { value: 0 },
        baseColor: { value: new THREE.Vector3(...t.base) },
        speckColor: { value: new THREE.Vector3(...t.speck) },
        bumpScale: { value: t.bumpScale },
        veinAmt: { value: t.vein },
        roughness: { value: p.roughness },
        noiseScale: { value: p.scale },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u, lights: false,
        vertexShader: `varying vec3 vP;varying vec3 vN;varying vec3 vV;void main(){vP=position;vec4 wp=modelViewMatrix*vec4(position,1.0);vV=normalize(-wp.xyz);vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*wp;}`,
        fragmentShader: GLSL_VALUE_NOISE + `
          uniform float bumpScale, veinAmt, roughness, noiseScale;
          uniform vec3 baseColor, speckColor;
          varying vec3 vP; varying vec3 vN; varying vec3 vV;
          float voro(vec3 p){vec3 i=floor(p);vec3 f=fract(p);float md=1.0;
            for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
              vec3 g=vec3(x,y,z);vec3 o=fract(sin(dot(i+g,vec3(127.1,311.7,74.7)))*vec3(43758.5453));
              vec3 d=g+o-f;md=min(md,dot(d,d));}return sqrt(md);}
          void main(){
            float scale = 6.0 + noiseScale * 18.0;
            float n = fbm3(vP * scale);
            float speck = smoothstep(0.0, 0.4, n) * smoothstep(0.6, 0.4, n);
            float v = voro(vP * scale * 0.6);
            float crystals = smoothstep(0.0, 0.4, v) * speck;
            float vein = 0.0;
            if (veinAmt > 0.01) {
              float vn = vnoise3(vP * 2.5 + vec3(0.0, fbm3(vP * 0.8) * 2.0, 0.0)) * 2.0 - 1.0;
              vein = smoothstep(0.04, 0.0, abs(vn - 0.3)) * veinAmt;
            }
            vec3 col = mix(baseColor, speckColor, crystals * 0.7);
            col = mix(col, speckColor * 1.3, vein);
            vec3 L = normalize(vec3(0.5, 0.8, 0.6));
            vec3 perturbed = normalize(vN + vec3(
              vnoise3(vP*scale)*0.4,
              vnoise3(vP*scale*1.1+1.0)*0.4,
              vnoise3(vP*scale*0.9+2.0)*0.4) * bumpScale * 0.5);
            float diff = max(0.2, dot(perturbed, L));
            float fres = pow(1.0 - max(0.0, dot(perturbed, vV)), 3.0);
            col *= diff;
            col += baseColor * fres * 0.15 * (1.0 - roughness);
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'type', label: 'Type', type: 'select', options: Object.entries(STONE_TYPES).map(([k,v])=>({value:k, label:v.name})) },
      { key: 'roughness', label: 'Roughness', min: 0.4, max: 1, step: 0.01 },
      { key: 'scale', label: 'Grain scale', min: 0.1, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const t = STONE_TYPES[p.type] || STONE_TYPES.granite;
      const u = mat.userData.uniforms;
      u.baseColor.value.set(...t.base);
      u.speckColor.value.set(...t.speck);
      u.bumpScale.value = t.bumpScale;
      u.veinAmt.value = t.vein;
      u.roughness.value = p.roughness;
      u.noiseScale.value = p.scale;
    },
  },

  /* ───── 07 · FUZZY — real instanced 3D fur strands attached to the J surface */
  fuzzy: {
    label: 'Fuzzy',
    params: { count: 6000, length: 0.20, hue: 0.05, wind: 0.5 },
    post: { bloom: false },
    make(p) {
      // Dark skin underneath fur (the J's "scalp")
      const baseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(p.hue, 0.55, 0.10),
        roughness: 0.96, metalness: 0.0,
      });
      buildFurInstances(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'count', label: 'Strand count', min: 1500, max: 12000, step: 500 },
      { key: 'length', label: 'Length', min: 0.05, max: 2.0, step: 0.05 },
      { key: 'hue', label: 'Color', min: 0, max: 1, step: 0.01 },
      { key: 'wind', label: 'Wind', min: 0, max: 2, step: 0.05 },
    ],
    update(p, mat) {
      mat.color.setHSL(p.hue, 0.55, 0.10);
      // For count changes we need to rebuild
      const inst = decorGroup.children[0];
      if (!inst || inst.userData.kind !== 'fur' || inst.userData.count !== p.count) {
        buildFurInstances(p);
      } else {
        const u = inst.material.userData.uniforms;
        u.uLength.value = p.length;
        u.uHue.value = p.hue;
        u.uWind.value = p.wind;
      }
    },
    tick(t) {
      const inst = decorGroup.children[0];
      if (inst?.material?.userData?.uniforms) inst.material.userData.uniforms.uTime.value = t;
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },

  /* ───── 08 · CAMO */
  camo: {
    label: 'Camo',
    params: { type: 'forest', scale: 0.5, sharpness: 0.6 },
    post: { bloom: false },
    make(p) {
      const t = CAMO_TYPES[p.type] || CAMO_TYPES.forest;
      const u = {
        scale: { value: p.scale }, sharp: { value: p.sharpness },
        c0: { value: new THREE.Vector3(...t.colors[0]) },
        c1: { value: new THREE.Vector3(...t.colors[1]) },
        c2: { value: new THREE.Vector3(...t.colors[2]) },
        c3: { value: new THREE.Vector3(...t.colors[3]) },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: `varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: GLSL_VALUE_NOISE + `
          uniform float scale, sharp;
          uniform vec3 c0, c1, c2, c3;
          varying vec3 vP; varying vec3 vN;
          void main(){
            float s = 2.0 + scale * 8.0;
            float n1 = fbm3(vP * s);
            float n2 = fbm3(vP * s * 1.7 + 4.0);
            float k = 1.0 - sharp;
            float a = smoothstep(0.45 - k*0.15, 0.55 + k*0.15, n1);
            float b = smoothstep(0.40 - k*0.15, 0.60 + k*0.15, n2);
            vec3 col = mix(c0, c1, a);
            col = mix(col, c2, b * 0.7);
            col = mix(col, c3, (1.0-a) * b * 0.5);
            float lit = 0.55 + 0.45 * dot(vN, normalize(vec3(0.5, 1.0, 0.6)));
            gl_FragColor = vec4(col * lit, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'type', label: 'Pattern', type: 'select', options: Object.entries(CAMO_TYPES).map(([k,v])=>({value:k, label:v.name})) },
      { key: 'scale', label: 'Scale', min: 0.2, max: 1, step: 0.01 },
      { key: 'sharpness', label: 'Sharpness', min: 0.2, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const t = CAMO_TYPES[p.type] || CAMO_TYPES.forest;
      const u = mat.userData.uniforms;
      u.scale.value = p.scale; u.sharp.value = p.sharpness;
      u.c0.value.set(...t.colors[0]); u.c1.value.set(...t.colors[1]);
      u.c2.value.set(...t.colors[2]); u.c3.value.set(...t.colors[3]);
    },
  },

  /* ───── 09 · VINES — real instanced 3D leaves growing on the J surface */
  vines: {
    label: 'Vines',
    params: { count: 600, leafSize: 1.0, hue: 0.30, wind: 0.5 },
    post: { bloom: false },
    make(p) {
      // Bark/wood base
      const baseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08, 0.5, 0.10),
        roughness: 0.95, metalness: 0.0,
      });
      buildLeafInstances(p);
      decorGroup.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'count', label: 'Leaf count', min: 100, max: 1500, step: 50 },
      { key: 'leafSize', label: 'Leaf size', min: 0.4, max: 2.0, step: 0.05 },
      { key: 'hue', label: 'Leaf hue', min: 0.18, max: 0.42, step: 0.01 },
      { key: 'wind', label: 'Wind', min: 0, max: 1.5, step: 0.05 },
    ],
    update(p, mat) {
      mat.color.setHSL(0.07, 0.55, 0.15);
      const inst = decorGroup.children[0];
      if (!inst || inst.userData.kind !== 'leaves' || inst.userData.count !== p.count) {
        buildLeafInstances(p);
      } else {
        const u = inst.material.userData.uniforms;
        u.uHue.value = p.hue;
        u.uWind.value = p.wind;
        u.uSize.value = p.leafSize;
      }
    },
    tick(t) {
      const inst = decorGroup.children[0];
      if (inst?.material?.userData?.uniforms) inst.material.userData.uniforms.uTime.value = t;
    },
    onEnter() { decorGroup.visible = true; },
    onLeave() { clearDecorGroup(); },
  },
};

/* ──────────────────────────────────────────────────────────────
   INSTANCED 3D DECORATIONS — fur strands + leaves
   Sample positions on the J surface, place real geometry instances.
   ────────────────────────────────────────────────────────────── */

function clearDecorGroup() {
  decorGroup.visible = false;
  while (decorGroup.children.length) {
    const c = decorGroup.children.pop();
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
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

/* ───── Fur strands — thin tapered cylinders pointing along surface normals */
function buildFurInstances(p) {
  clearDecorGroup();
  if (!baseGeometry) return;
  const COUNT = p.count;

  // Strand: tapered cylinder, base at y=0, tip at y=1
  const strand = new THREE.CylinderGeometry(0.0009, 0.00018, 1, 5, 1, true);
  strand.translate(0, 0.5, 0);

  const u = {
    uTime: { value: 0 },
    uLength: { value: p.length },
    uHue: { value: p.hue },
    uWind: { value: p.wind },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: `
      uniform float uTime, uLength, uWind;
      attribute float aSeed;
      attribute float aLen;
      varying float vY;
      varying float vSeed;
      void main(){
        vY = position.y;          // 0 (base) → 1 (tip)
        vSeed = aSeed;
        // Stretch the strand to its individual length, scaled by global uLength
        vec3 p = position * vec3(1.0, uLength * aLen, 1.0);
        // Wind sway — increases with height; per-strand phase via seed.
        // Wind effect scales with strand length so longer hair sways more dramatically.
        float yt = p.y / max(0.001, uLength * aLen);
        float windAmp = uWind * 0.12 * uLength * aLen;
        float sway = sin(uTime * 1.4 + aSeed * 31.4) * pow(yt, 1.8);
        float swayZ = cos(uTime * 1.1 + aSeed * 17.7) * pow(yt, 1.8);
        p.x += sway * windAmp;
        p.z += swayZ * windAmp * 0.7;
        // Gentle gravity droop at tip
        p.y -= pow(p.y / max(0.001, uLength * aLen), 2.0) * uLength * aLen * 0.06;
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uHue;
      varying float vY; varying float vSeed;
      vec3 hsl2rgb(float h, float s, float l) {
        vec3 r = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
        return l + s * (r - 0.5) * (1.0 - abs(2.0*l - 1.0));
      }
      void main(){
        // Per-strand hue jitter
        float h = uHue + (vSeed - 0.5) * 0.04;
        // Dark base → light tip
        float L = mix(0.18, 0.62, vY);
        vec3 col = hsl2rgb(h, 0.55, L);
        // Faint AO at base for shading depth
        col *= 0.55 + 0.45 * vY;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  mat.userData.uniforms = u;

  const inst = new THREE.InstancedMesh(strand, mat, COUNT);
  inst.userData = { kind: 'fur', count: COUNT };

  // Per-instance attributes
  const seeds = new Float32Array(COUNT);
  const lens = new Float32Array(COUNT);
  const samples = sampleSurface(baseGeometry, COUNT);

  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < COUNT; i++) {
    const s = samples[i];
    tmpPos.copy(s.p).addScaledVector(s.n, 0.002);
    tmpQuat.setFromUnitVectors(up, s.n);
    tmpScale.setScalar(1.0);
    tmp.compose(tmpPos, tmpQuat, tmpScale);
    inst.setMatrixAt(i, tmp);
    seeds[i] = s.seed;
    lens[i] = 0.55 + Math.random() * 0.9; // varied lengths
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  inst.geometry.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
  inst.scale.copy(jMesh.scale);
  inst.frustumCulled = false;
  decorGroup.add(inst);
}

/* ───── Leaves — real plane geometry per leaf, oriented along surface normal */
function buildLeafInstances(p) {
  clearDecorGroup();
  if (!baseGeometry) return;
  const COUNT = p.count;

  // Hand-built leaf geometry: elongated almond shape with central spine,
  // curved upward at the tip (real leaves have a slight 3D bend).
  // Pivot at base (y=0), tip at y=2.2, max width ~0.9
  const leaf = new THREE.BufferGeometry();
  const RINGS = 11;
  const verts = [];
  const idx = [];
  // Base point
  verts.push(0, 0, 0);
  for (let i = 1; i <= RINGS; i++) {
    const t = i / RINGS;                 // 0..1 along leaf length
    const y = t * 2.2;
    // Width profile — narrow at base, widest 40% along, pointed at tip
    const widthCurve = Math.pow(Math.sin(Math.PI * t), 0.7);
    const w = widthCurve * 0.5;
    // Slight upward curl in z based on height
    const z = Math.sin(t * Math.PI) * 0.12;
    // Veins/curl at edge: tiny spine bump in the middle
    const spineZ = Math.sin(t * Math.PI) * 0.04;
    verts.push(-w, y, z);
    verts.push( 0, y, z + spineZ);
    verts.push( w, y, z);
  }
  // Triangulate as 3 strips (left, center spine, right)
  for (let i = 0; i < RINGS; i++) {
    if (i === 0) {
      // Connect base point to first ring
      idx.push(0, 1, 2);
      idx.push(0, 2, 3);
    } else {
      const aL = 1 + (i - 1) * 3;
      const aC = aL + 1;
      const aR = aL + 2;
      const bL = 1 + i * 3;
      const bC = bL + 1;
      const bR = bL + 2;
      // left strip
      idx.push(aL, bL, aC);
      idx.push(bL, bC, aC);
      // right strip
      idx.push(aC, bC, aR);
      idx.push(bC, bR, aR);
    }
  }
  leaf.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  leaf.setIndex(idx);
  leaf.computeVertexNormals();

  const u = {
    uTime: { value: 0 },
    uHue: { value: p.hue },
    uWind: { value: p.wind },
    uSize: { value: p.leafSize },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime, uWind, uSize;
      attribute float aSeed;
      attribute vec3 aTint;
      varying vec2 vLeafUV;
      varying vec3 vTint;
      varying vec3 vN;
      varying vec3 vView;
      void main(){
        // Encode leaf-local UV: x in [-0.5..0.5] from leaf width, y in [0..1] from leaf length
        vLeafUV = vec2(position.x + 0.5, position.y / 2.2);
        vTint = aTint;
        vN = normalize(normalMatrix * normal);
        // Wind sway: tips curl more than base. Per-leaf phase via seed.
        float yt = position.y / 2.2;
        float windAmp = uWind * 0.35 * pow(yt, 1.5);
        float sway = sin(uTime * 2.4 + aSeed * 17.3);
        float curl = cos(uTime * 1.7 + aSeed * 9.1);
        vec3 p = position;
        p.x += sway * windAmp * 0.4;
        p.z += sway * windAmp;
        p.z += curl * windAmp * 0.3;
        // Apply per-instance size scaling
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
        // Central spine along x = 0.5
        float spineDist = abs(vLeafUV.x - 0.5);
        float spine = smoothstep(0.025, 0.0, spineDist) * 0.8;
        // Side veins fanning out from spine — more realistic angle
        float side = 0.0;
        for (int i = 0; i < 6; i++) {
          float yy = 0.15 + float(i) * 0.13;
          float dy = vLeafUV.y - yy;
          // Veins angle outward from spine
          float angle = 0.45;
          float vMask = smoothstep(0.03, 0.0, abs(dy - spineDist * angle));
          side = max(side, vMask * smoothstep(0.5, 0.3, spineDist));
        }
        // Base leaf color with per-leaf hue/sat/light variation
        float h = uHue + vTint.x;
        float s = 0.55 + vTint.y * 0.25;
        float l = 0.30 + vTint.z * 0.20;
        vec3 base = hsl2rgb(h, s, l);
        // Veins are slightly lighter (sun-bleached)
        vec3 veinCol = hsl2rgb(h - 0.02, s * 0.7, l * 1.4);
        vec3 col = mix(base, veinCol, max(spine, side * 0.7));
        // Edge translucency — leaf glows slightly at silhouette (sun-through-leaf effect)
        float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 1.5);
        col += hsl2rgb(h - 0.05, 0.6, 0.5) * fres * 0.4;
        // Soft lambert + ambient
        vec3 L = normalize(vec3(0.4, 0.9, 0.5));
        float lit = 0.5 + 0.5 * max(0.0, dot(normalize(vN), L));
        col *= lit;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.userData.uniforms = u;

  const inst = new THREE.InstancedMesh(leaf, mat, COUNT);
  inst.userData = { kind: 'leaves', count: COUNT };

  const seeds = new Float32Array(COUNT);
  const tints = new Float32Array(COUNT * 3);
  const samples = sampleSurface(baseGeometry, COUNT);

  const tmp = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < COUNT; i++) {
    const s = samples[i];
    // Lift slightly off the surface so leaves don't z-fight
    tmpPos.copy(s.p).addScaledVector(s.n, 0.005);
    // Orient leaf base along the surface normal
    tmpQuat.setFromUnitVectors(up, s.n);
    // Random spin around the normal for variety
    const spin = new THREE.Quaternion().setFromAxisAngle(s.n, Math.random() * Math.PI * 2);
    tmpQuat.premultiply(spin);
    // Random tilt — leaves don't all sit flush; some lean
    const tilt = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      (Math.random() - 0.5) * 0.7
    );
    tmpQuat.premultiply(tilt);
    // Per-leaf scale variation — bigger leaves so they read clearly
    const sc = 0.045 * (0.6 + Math.random() * 0.9);
    tmpScale.setScalar(sc);
    tmp.compose(tmpPos, tmpQuat, tmpScale);
    inst.setMatrixAt(i, tmp);

    seeds[i] = s.seed;
    // Per-leaf color jitter (hue offset, sat offset, light offset)
    tints[i * 3]     = (Math.random() - 0.5) * 0.06;
    tints[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
    tints[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  inst.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  inst.scale.copy(jMesh.scale);
  inst.frustumCulled = false;
  decorGroup.add(inst);
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
