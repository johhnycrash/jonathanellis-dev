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
      speed: typeof s.speed === 'number' ? s.speed : 1.0,
      paused: !!s.paused,
      tv: !!s.tv,
    };
  } catch {
    return { skin: DEFAULT_SKIN, bg: DEFAULT_BG, params: {}, speed: 1.0, paused: false, tv: false };
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

const furShells = new THREE.Group();
furShells.visible = false;
jGroup.add(furShells);

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

  /* ───── 01 · METALLIC — animated env response, like OddCommon */
  metallic: {
    label: 'Metallic',
    params: { metalness: 1.0, roughness: 0.16, clearcoat: 0.7, hue: 0.55, shimmer: 0.4 },
    post: { bloom: false },
    make(p) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(0, 0, 0.94),
        metalness: p.metalness,
        roughness: p.roughness,
        clearcoat: p.clearcoat,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.6,
        // Subtle iridescence — animated in tick for shimmer
        iridescence: p.shimmer * 0.5,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [200, 700],
      });
      return mat;
    },
    controls: [
      { key: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01 },
      { key: 'roughness', label: 'Roughness', min: 0, max: 0.5, step: 0.01 },
      { key: 'clearcoat', label: 'Clearcoat', min: 0, max: 1, step: 0.01 },
      { key: 'shimmer', label: 'Shimmer', min: 0, max: 1, step: 0.01 },
      { key: 'hue', label: 'Tint', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      mat.metalness = p.metalness;
      mat.roughness = p.roughness;
      mat.clearcoat = p.clearcoat;
      mat.iridescence = p.shimmer * 0.5;
      mat.color.setHSL(p.hue, 0.05, 0.94);
      mat.userData.shimmer = p.shimmer;
    },
    tick(t, mat) {
      // Animated env intensity + iridescence band — gives the metal a "living" surface
      const sh = mat.userData.shimmer ?? 0.4;
      mat.envMapIntensity = 1.5 + Math.sin(t * 0.5) * 0.25;
      const lo = 200 + Math.sin(t * 0.3) * 100;
      const hi = 700 + Math.cos(t * 0.4) * 200;
      mat.iridescenceThicknessRange = [lo, hi];
      mat.iridescence = sh * (0.4 + 0.2 * Math.sin(t * 0.7));
      // Orbiting accent light — moves highlights across the surface
      const r = 2.6;
      orbLight.position.set(
        Math.cos(t * 0.4) * r,
        Math.sin(t * 0.25) * 1.2,
        Math.sin(t * 0.4) * r
      );
      orbLight.intensity = 1.4 + Math.sin(t * 0.6) * 0.6;
      orbLight.color.setHSL(0.08 + Math.sin(t * 0.2) * 0.05, 0.4, 0.8);
    },
    onEnter() { orbLight.intensity = 1.4; },
    onLeave() { orbLight.intensity = 0.0; },
  },

  /* ───── 02 · LASERS */
  lasers: {
    label: 'Lasers',
    params: { speed: 0.6, density: 24, hue: 0.33, glow: 1.4 },
    post: { bloom: true, bloomStrength: 1.2, bloomRadius: 0.6, bloomThreshold: 0.4 },
    make(p) {
      const u = { time: { value: 0 }, speed: { value: p.speed }, density: { value: p.density },
        hue: { value: p.hue }, glow: { value: p.glow } };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: `varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: GLSL_HSL + `uniform float time,speed,density,hue,glow;varying vec3 vP;varying vec3 vN;void main(){
          float scan=fract(vP.y*density-time*speed*4.0);
          float band=smoothstep(0.45,0.5,scan)*(1.0-smoothstep(0.5,0.55,scan));
          float fres=pow(1.0-abs(dot(normalize(vN),vec3(0.0,0.0,1.0))),2.5);
          vec3 col=hsl2rgb(hue+scan*0.1,1.0,0.55);
          gl_FragColor=vec4(col*(band*glow+fres*0.6),1.0);}`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'speed', label: 'Scan speed', min: 0, max: 2, step: 0.01 },
      { key: 'density', label: 'Density', min: 4, max: 60, step: 1 },
      { key: 'hue', label: 'Color', min: 0, max: 1, step: 0.01 },
      { key: 'glow', label: 'Glow', min: 0.5, max: 3, step: 0.1 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.speed.value = p.speed; u.density.value = p.density;
      u.hue.value = p.hue; u.glow.value = p.glow;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },

  /* ───── 03 · LAVA — vertex displacement + cracks */
  lava: {
    label: 'Lava',
    params: { heat: 0.32, viscosity: 0.4, cracks: 0.7, intensity: 0.85 },
    post: { bloom: true, bloomStrength: 0.9, bloomRadius: 0.7, bloomThreshold: 0.6 },
    make(p) {
      const u = {
        time: { value: 0 }, heat: { value: p.heat }, viscosity: { value: p.viscosity },
        cracks: { value: p.cracks }, intensity: { value: p.intensity },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: GLSL_VALUE_NOISE + `
          uniform float time, viscosity, cracks;
          varying vec3 vP; varying vec3 vN; varying float vDisp;
          void main(){
            float t = time * (0.2 + viscosity * 0.4);
            float n = fbm3(position * 3.0 + vec3(t, t*0.5, t*0.7));
            float ck = abs(vnoise3(position*6.0+vec3(0.0,t*0.3,0.0)) - 0.5) * 2.0;
            ck = pow(1.0 - smoothstep(0.0, 0.18, ck), 4.0);
            float disp = n * 0.05 - ck * 0.08 * cracks;
            vec3 d = position + normal * disp;
            vDisp = disp;
            vP = position;
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(d, 1.0);
          }`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
          uniform float time, heat, intensity, cracks;
          varying vec3 vP; varying vec3 vN; varying float vDisp;
          void main(){
            float t = time * 0.3;
            float n = fbm3(vP * 4.0 + vec3(0.0, t, t*0.5));
            float crackGlow = smoothstep(-0.05, -0.02, vDisp) * cracks;
            vec3 cool = vec3(0.06, 0.04, 0.05);
            float h = 0.04 + n * 0.06;
            float l = 0.5 + heat * (n + 0.3);
            vec3 hot = hsl2rgb(h, 1.0, clamp(l, 0.3, 0.85));
            float mixHot = clamp(crackGlow + heat*0.4 + n*0.2, 0.0, 1.0);
            vec3 col = mix(cool, hot, mixHot);
            float fres = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 2.0);
            col += vec3(0.6, 0.2, 0.05) * fres * heat * 0.5;
            gl_FragColor = vec4(col * intensity, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'heat', label: 'Heat', min: 0, max: 1, step: 0.01 },
      { key: 'viscosity', label: 'Flow', min: 0, max: 1, step: 0.01 },
      { key: 'cracks', label: 'Cracks', min: 0, max: 1, step: 0.01 },
      { key: 'intensity', label: 'Brightness', min: 0.4, max: 1.5, step: 0.05 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.heat.value = p.heat; u.viscosity.value = p.viscosity;
      u.cracks.value = p.cracks; u.intensity.value = p.intensity;
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

  /* ───── 05 · IRIDESCENT */
  iridescent: {
    label: 'Iridescent',
    params: { thickness: 400, intensity: 1.0, roughness: 0.05, base: 0.0 },
    post: { bloom: false },
    make(p) {
      return new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.4, roughness: p.roughness,
        iridescence: p.intensity, iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, p.thickness],
        envMapIntensity: 1.4, clearcoat: 1.0, clearcoatRoughness: 0.0,
      });
    },
    controls: [
      { key: 'thickness', label: 'Film thickness', min: 200, max: 1200, step: 10 },
      { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01 },
      { key: 'roughness', label: 'Roughness', min: 0, max: 0.3, step: 0.01 },
      { key: 'base', label: 'Base hue', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      mat.iridescence = p.intensity;
      mat.iridescenceThicknessRange = [100, p.thickness];
      mat.roughness = p.roughness;
      mat.color.setHSL(p.base, 0.1, 0.95);
    },
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

  /* ───── 07 · FUZZY — multi-shell fur */
  fuzzy: {
    label: 'Fuzzy',
    params: { length: 0.06, density: 200, hue: 0.05, wind: 0.3 },
    shells: 24,
    post: { bloom: false },
    make(p) {
      const baseMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(p.hue, 0.6, 0.18), roughness: 0.95, metalness: 0.0,
      });
      buildFurShells(p);
      furShells.visible = true;
      return baseMat;
    },
    controls: [
      { key: 'length', label: 'Length', min: 0.01, max: 0.15, step: 0.005 },
      { key: 'density', label: 'Density', min: 30, max: 600, step: 10 },
      { key: 'hue', label: 'Color', min: 0, max: 1, step: 0.01 },
      { key: 'wind', label: 'Wind', min: 0, max: 1.5, step: 0.05 },
    ],
    update(p, mat) {
      mat.color.setHSL(p.hue, 0.6, 0.18);
      furShells.children.forEach((shell, i) => {
        const t = (i + 1) / SKINS.fuzzy.shells;
        const u = shell.material.userData.uniforms;
        u.uShellLevel.value = t;
        u.uLength.value = p.length;
        u.uDensity.value = p.density;
        u.uHue.value = p.hue;
        u.uWind.value = p.wind;
      });
    },
    tick(t) {
      furShells.children.forEach((s) => { if (s.material.userData.uniforms) s.material.userData.uniforms.uTime.value = t; });
    },
    onEnter() { furShells.visible = true; },
    onLeave() {
      furShells.visible = false;
      while (furShells.children.length) { const c = furShells.children.pop(); c.material?.dispose?.(); }
    },
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

  /* ───── 09 · VINES */
  vines: {
    label: 'Vines',
    params: { coverage: 0.7, leafSize: 0.5, hue: 0.3, wind: 0.4 },
    post: { bloom: false },
    make(p) {
      const u = { time: { value: 0 }, coverage: { value: p.coverage },
        leafSize: { value: p.leafSize }, hue: { value: p.hue }, wind: { value: p.wind } };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: GLSL_VALUE_NOISE + `
          uniform float time, wind;
          varying vec3 vP; varying vec3 vN; varying vec3 vV;
          void main(){
            vP = position;
            vN = normalize(normalMatrix * normal);
            float sway = sin(time*1.6 + position.y*4.0 + position.x*2.0) * wind * 0.012;
            vec3 d = position + vec3(sway, 0.0, sway*0.8);
            vec4 wp = modelViewMatrix * vec4(d, 1.0);
            vV = normalize(-wp.xyz);
            gl_Position = projectionMatrix * wp;
          }`,
        fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
          uniform float coverage, leafSize, hue;
          varying vec3 vP; varying vec3 vN; varying vec3 vV;
          vec3 cellLeaf(vec3 p) {
            vec3 i = floor(p); vec3 f = fract(p);
            float minD = 1e9; vec3 minP = vec3(0.0);
            for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++) {
              vec3 g = vec3(x,y,z);
              vec3 o = fract(sin(dot(i+g, vec3(127.1, 311.7, 74.7))) * vec3(43758.5453));
              vec3 d = g + o - f; float dd = dot(d,d);
              if (dd < minD) { minD = dd; minP = i + g + o; }
            }
            return vec3(sqrt(minD), minP.x + minP.y * 0.3, minP.z);
          }
          void main(){
            float scale = 5.0 + leafSize * 10.0;
            vec3 cell = cellLeaf(vP * scale);
            float dist = cell.x;
            float leaf = smoothstep(0.5, 0.1, dist);
            float coverageMask = step(1.0 - coverage, fract(cell.y * 12.7));
            float leafMask = leaf * coverageMask;
            float stemNoise = abs(vnoise3(vP * 2.0 + vec3(0.0, fbm3(vP * 0.8) * 3.0, 0.0)) - 0.5) * 2.0;
            float stem = smoothstep(0.04, 0.0, stemNoise) * 0.7;
            vec3 bark = hsl2rgb(0.08, 0.4, 0.18);
            vec3 stemCol = hsl2rgb(0.06, 0.6, 0.22);
            float leafHueVar = fract(cell.y * 7.3) * 0.08 - 0.04;
            float leafLight = 0.32 + fract(cell.z * 3.7) * 0.18;
            vec3 leafCol = hsl2rgb(hue + leafHueVar, 0.65, leafLight);
            float vein = smoothstep(0.05, 0.0, abs(dist - 0.25));
            leafCol *= 1.0 - vein * 0.3;
            vec3 col = bark;
            col = mix(col, stemCol, stem);
            col = mix(col, leafCol, leafMask);
            vec3 L = normalize(vec3(0.4, 0.9, 0.5));
            float lit = 0.5 + 0.5 * dot(normalize(vN), L);
            float fres = pow(1.0 - max(0.0, dot(normalize(vN), vV)), 1.5);
            col *= lit;
            col += leafCol * fres * leafMask * 0.4;
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      mat.userData.uniforms = u;
      return mat;
    },
    controls: [
      { key: 'coverage', label: 'Leaf coverage', min: 0.3, max: 1, step: 0.01 },
      { key: 'leafSize', label: 'Leaf size', min: 0.2, max: 1, step: 0.01 },
      { key: 'hue', label: 'Leaf hue', min: 0.2, max: 0.45, step: 0.01 },
      { key: 'wind', label: 'Wind', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.coverage.value = p.coverage; u.leafSize.value = p.leafSize;
      u.hue.value = p.hue; u.wind.value = p.wind;
    },
    tick(t, mat) { mat.userData.uniforms.time.value = t; },
  },
};

/* ──────────────────────────────────────────────────────────────
   FUR SHELLS BUILDER
   ────────────────────────────────────────────────────────────── */
function buildFurShells(p) {
  while (furShells.children.length) { const c = furShells.children.pop(); c.material?.dispose?.(); }
  if (!baseGeometry) return;
  const N = SKINS.fuzzy.shells;
  for (let i = 0; i < N; i++) {
    const t = (i + 1) / N;
    const u = {
      uTime: { value: 0 }, uShellLevel: { value: t },
      uLength: { value: p.length }, uDensity: { value: p.density },
      uHue: { value: p.hue }, uWind: { value: p.wind },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, side: THREE.FrontSide,
      vertexShader: `
        uniform float uShellLevel, uLength, uTime, uWind;
        varying vec3 vP; varying vec3 vN; varying float vShell;
        void main(){
          vec3 d = position + normal * uShellLevel * uLength;
          float wind = sin(uTime*1.5 + position.y*6.0 + position.x*4.0) * uWind * 0.012 * uShellLevel;
          d.x += wind; d.z += wind*0.6;
          d.y -= uShellLevel * uLength * 0.15;
          vP = position;
          vN = normalize(normalMatrix * normal);
          vShell = uShellLevel;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(d, 1.0);
        }`,
      fragmentShader: `
        uniform float uShellLevel, uDensity, uHue;
        varying vec3 vP; varying vec3 vN; varying float vShell;
        float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        vec3 hsl(float h, float s, float l){vec3 r=clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);return l+s*(r-0.5)*(1.0-abs(2.0*l-1.0));}
        void main(){
          vec3 cell = floor(vP * uDensity);
          float strandHash = h(cell);
          if (strandHash < vShell) discard;
          float taper = 1.0 - vShell;
          vec3 fc = fract(vP * uDensity);
          float dCenter = length(fc - 0.5);
          float strand = smoothstep(0.5*taper, 0.5*taper-0.1, dCenter);
          if (strand < 0.05) discard;
          vec3 base = hsl(uHue, 0.55, 0.18);
          vec3 tip  = hsl(uHue, 0.45, 0.55);
          vec3 col = mix(base, tip, vShell);
          vec3 L = normalize(vec3(0.5, 1.0, 0.6));
          float diff = 0.4 + 0.6 * max(0.0, dot(vN, L));
          col *= diff;
          gl_FragColor = vec4(col, strand * (0.7 + 0.3 * (1.0 - vShell)));
        }`,
    });
    mat.userData.uniforms = u;
    const shell = new THREE.Mesh(baseGeometry, mat);
    shell.scale.copy(jMesh.scale);
    furShells.add(shell);
  }
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

/* ───── Aurora — vertical curtains with flowing color, my own arrangement */
function makeAurora() {
  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uMouse: { value: new THREE.Vector2(0, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: GLSL_VALUE_NOISE + GLSL_HSL + `
      uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse;
      // A single aurora curtain: vertical band with horizontal noise distortion + height-faded.
      float curtain(vec2 uv, float seed, float phase, float speed) {
        float xWarp = (fbm2(vec2(uv.y * 0.8 + uTime * speed, seed)) - 0.5) * 1.6;
        float dx = uv.x - xWarp;
        float band = exp(-pow(dx * 1.8, 2.0));            // gaussian band shape
        float hf = smoothstep(-1.1, -0.3, uv.y) * smoothstep(1.2, 0.4, uv.y);
        // vertical streaks within the band
        float streak = 0.7 + 0.3 * fbm2(vec2(uv.x * 4.0 + seed, uv.y * 8.0 - uTime * 0.6 * speed));
        return band * hf * streak;
      }
      void main(){
        vec2 uv = (gl_FragCoord.xy - uRes.xy * 0.5) / uRes.y * 2.0;
        // Mouse subtly distorts the field
        uv += (uMouse - 0.5) * 0.15;

        vec3 col = vec3(0.0);
        // 4 curtains, distinct hues drifting over time
        col += curtain(uv + vec2(-0.7, 0.0), 0.31, 0.0, 0.30) * hsl2rgb(0.40 + 0.05*sin(uTime*0.10), 0.95, 0.55);
        col += curtain(uv + vec2(-0.15, 0.0), 1.27, 0.5, 0.42) * hsl2rgb(0.50 + 0.04*sin(uTime*0.13), 0.90, 0.55);
        col += curtain(uv + vec2( 0.35, 0.0), 2.93, 1.0, 0.36) * hsl2rgb(0.78 + 0.05*sin(uTime*0.16), 0.85, 0.60);
        col += curtain(uv + vec2( 0.85, 0.0), 4.61, 1.5, 0.50) * hsl2rgb(0.92 + 0.05*sin(uTime*0.19), 0.85, 0.55);

        // soft low base — aurora green wash
        float base = max(0.0, 0.18 - length(uv*vec2(0.4,1.0)) * 0.18);
        col += vec3(0.05, 0.18, 0.10) * base;

        // starfield
        vec2 g = floor(gl_FragCoord.xy * 0.45);
        float h = fract(sin(dot(g, vec2(12.9, 78.2))) * 43758.5453);
        if (h > 0.992) {
          float tw = 0.5 + 0.5 * sin(uTime * 3.0 + h * 100.0);
          col += vec3(0.95, 0.92, 0.85) * (h - 0.992) * 95.0 * tw;
        }

        // gentle vignette
        float vig = 1.0 - dot(uv, uv) * 0.10;
        col *= clamp(vig, 0.4, 1.0);

        // tonemap-ish
        col = col / (col + vec3(1.4));

        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  bgScene.add(plane);
  return {
    scene: bgScene, camera: bgCamera,
    tick(t, mouse) {
      uniforms.uTime.value = t;
      uniforms.uMouse.value.x = (mouse.x + 1) * 0.5;
      uniforms.uMouse.value.y = (1 - mouse.y) * 0.5;
    },
    resize(w, h) { uniforms.uRes.value.set(w, h); },
    dispose() { mat.dispose(); plane.geometry.dispose(); },
  };
}

/* ───── Fireworks — original particle system with synthesized audio kick */
function makeFireworks() {
  const bgScene = new THREE.Scene();
  bgScene.fog = new THREE.FogExp2(0x000000, 0.0018);
  const bgCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
  bgCamera.position.set(0, 0, 160);

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
      this.pos = new THREE.Vector3((Math.random() - 0.5) * 240, -90, (Math.random() - 0.5) * 80);
      this.vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.95 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
      this.target = -20 + Math.random() * 40;

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
      const N = 1200 + Math.floor(Math.random() * 800);
      this.N = N;
      this.pos0 = this.pos.clone();
      const positions = new Float32Array(N * 3);
      const colors = new Float32Array(N * 3);
      this.vel = new Float32Array(N * 3);
      this.life = new Float32Array(N);
      this.col0 = new Float32Array(N * 3);
      const speed = 1.6 + Math.random() * 1.4;
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
    scene: bgScene, camera: bgCamera,
    tick(_t) {
      const dt = clock.getDelta();
      const now = performance.now();
      if (now - lastLaunch > nextDelay) {
        lastLaunch = now;
        nextDelay = 2400 + Math.random() * 2600;
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
function makeGalaxy() {
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

  const N = MOBILE ? 35000 : 90000;
  const positions = new Float32Array(N * 3);
  const colors = new Float32Array(N * 3);
  const sizes = new Float32Array(N);
  const radii = new Float32Array(N);
  const angles = new Float32Array(N);
  const heights = new Float32Array(N);
  const armCount = 4;
  const armWind = 2.8;
  const radius = 60;

  for (let i = 0; i < N; i++) {
    // Radial distribution: more particles near center (bulge)
    const rT = Math.pow(Math.random(), 0.55);
    const r = rT * radius;
    const arm = Math.floor(Math.random() * armCount);
    const baseAngle = (arm / armCount) * Math.PI * 2;
    const armOffset = (rT * armWind) * Math.PI * 2;
    const jitter = (Math.random() - 0.5) * (1.0 - rT * 0.6);
    const angle = baseAngle + armOffset + jitter;
    const h = (Math.random() - 0.5) * (3.5 + rT * 2.0) * (1.0 - rT * 0.7);

    radii[i] = r;
    angles[i] = angle;
    heights[i] = h;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = h;
    positions[i * 3 + 2] = Math.sin(angle) * r;

    // Color: bulge = warm yellow/orange, edges = cool blue
    const hue = 0.62 - rT * 0.5;        // 0.62 → 0.12 (blue → orange)
    const sat = 0.55 + Math.random() * 0.25;
    const lit = 0.55 + (1 - rT) * 0.3 + (Math.random() - 0.5) * 0.15;
    const c = new THREE.Color().setHSL(hue, sat, Math.min(0.95, lit));
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    // Bigger particles in the bulge
    sizes[i] = (1.0 - rT * 0.6) * (0.5 + Math.random() * 1.0) + 0.3;
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

  return {
    scene: bgScene, camera: bgCamera,
    tick(t, mouse) {
      // Per-particle differential rotation: inner spins faster
      mat.uniforms.uTime.value = t;
      const pos = geo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const r = radii[i];
        const w = 0.06 / (0.5 + r * 0.06);  // angular velocity falloff
        angles[i] += w * 0.016 + 0.0003;
        const a = angles[i];
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      geo.attributes.position.needsUpdate = true;

      // Slow camera orbit influenced by mouse
      const camR = 95;
      const baseAngle = t * 0.04;
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

function applyBg(key) {
  if (bgSystem) { bgSystem.dispose(); bgSystem = null; }
  if (key !== 'none' && BG_FACTORIES[key]) bgSystem = BG_FACTORIES[key]();
  currentBg = key;
  state.bg = key;
  saveState();
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
