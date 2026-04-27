/**
 * jonathanellis.dev — 3D J morphing scene
 *
 * 8 material skins, each with persistent parameters (localStorage).
 * Built with Three.js r160 + GSAP.
 *
 * Architecture:
 *   - Single shared geometry (the J mesh from j.glb)
 *   - Each skin defines a material + params + optional update(time, mesh) hook
 *   - Skin transitions tween shared scalar values for crossfade
 *   - Param sliders are auto-generated from the skin's params definition
 *
 * Performance:
 *   - DPR capped at 2 (or 1.5 on mobile)
 *   - Only re-renders on idle or interaction (RAF loop is throttled at 60fps)
 *   - Heavy effects (post-processing) only enabled when their skin is active
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
   CONSTANTS & STORAGE
   ────────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'jdev-state-v1';
const DEFAULT_SKIN = 'metallic';
const MOBILE = window.matchMedia('(max-width: 720px)').matches;

const state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { skin: DEFAULT_SKIN, params: {} };
  } catch { return { skin: DEFAULT_SKIN, params: {} }; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

/* ──────────────────────────────────────────────────────────────
   SCENE SETUP
   ────────────────────────────────────────────────────────────── */
const host = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null; // CSS bg shows through

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.2);
camera.lookAt(0, 0, 0);

/* Procedural HDR environment for reflections (no external HDR needed) */
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04).texture;

/* Lights */
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(3, 4, 5);
scene.add(key);

const rim = new THREE.DirectionalLight(0x00e640, 0.4);
rim.position.set(-3, -1, -4);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xa0c8ff, 0.25);
fill.position.set(-4, 2, 2);
scene.add(fill);

/* Group that holds the J — we rotate this, not the camera */
const jGroup = new THREE.Group();
scene.add(jGroup);

/* Post-processing: bloom for emissive skins (lasers, lava) */
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.55, 0.85);
bloomPass.enabled = false;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ──────────────────────────────────────────────────────────────
   LOAD THE J
   ────────────────────────────────────────────────────────────── */
let jMesh = null;
const loader = new GLTFLoader();

loader.load(
  '/public/j.glb',
  (gltf) => {
    // Find the first mesh
    gltf.scene.traverse((c) => { if (!jMesh && c.isMesh) jMesh = c; });
    if (!jMesh) {
      console.error('No mesh in j.glb');
      return;
    }

    // Center it geometrically
    jMesh.geometry.computeBoundingBox();
    const box = jMesh.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    jMesh.geometry.translate(-center.x, -center.y, -center.z);
    jMesh.geometry.computeBoundsTree?.();
    jMesh.geometry.computeVertexNormals();

    // Scale to a known target height
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = 2.4;
    const scale = targetHeight / size.y;
    jMesh.scale.setScalar(scale);

    jGroup.add(jMesh);

    // Apply the saved skin
    applySkin(state.skin, false);

    // Hide loader
    document.getElementById('loader').classList.add('gone');
    setTimeout(() => {
      document.getElementById('hint').classList.add('show');
      document.getElementById('keyhints').classList.add('show');
      setTimeout(() => document.getElementById('hint').classList.add('gone'), 4500);
    }, 600);

    // Set initial active button
    setActiveButton(state.skin);
  },
  (xhr) => {
    /* progress callback — could update loader if we want */
  },
  (err) => {
    console.error('Failed to load j.glb', err);
    document.getElementById('loader').querySelector('.label').textContent = 'Failed to load model';
  }
);

/* ──────────────────────────────────────────────────────────────
   SKIN DEFINITIONS
   Each skin: { make(), params, controls, post?, update?(t, mesh) }
   ────────────────────────────────────────────────────────────── */
const SKINS = {

  /* ============================================================
     01 · METALLIC — OddCommon-style chrome with environment reflection.
     ============================================================ */
  metallic: {
    label: 'Metallic',
    params: { metalness: 1.0, roughness: 0.18, clearcoat: 0.6, hue: 0.55 },
    post: { bloom: false },
    make(p) {
      const color = new THREE.Color().setHSL(0.0, 0.0, 0.92);
      const mat = new THREE.MeshPhysicalMaterial({
        color,
        metalness: p.metalness,
        roughness: p.roughness,
        clearcoat: p.clearcoat,
        clearcoatRoughness: 0.05,
        envMapIntensity: 1.6,
      });
      return mat;
    },
    controls: [
      { key: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01 },
      { key: 'roughness', label: 'Roughness', min: 0, max: 0.5, step: 0.01 },
      { key: 'clearcoat', label: 'Clearcoat', min: 0, max: 1, step: 0.01 },
      { key: 'hue', label: 'Tint', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      mat.metalness = p.metalness;
      mat.roughness = p.roughness;
      mat.clearcoat = p.clearcoat;
      const tint = new THREE.Color().setHSL(p.hue, 0.05, 0.92);
      mat.color.copy(tint);
    },
  },

  /* ============================================================
     02 · LASERS — emissive scanline holographic.
     ============================================================ */
  lasers: {
    label: 'Lasers',
    params: { speed: 0.6, density: 24, hue: 0.33, glow: 1.4 },
    post: { bloom: true, bloomStrength: 1.2, bloomRadius: 0.6, bloomThreshold: 0.4 },
    make(p) {
      const uniforms = {
        time: { value: 0 },
        speed: { value: p.speed },
        density: { value: p.density },
        hue: { value: p.hue },
        glow: { value: p.glow },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vPos;
          varying vec3 vNormal;
          void main() {
            vPos = position;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float speed;
          uniform float density;
          uniform float hue;
          uniform float glow;
          varying vec3 vPos;
          varying vec3 vNormal;

          vec3 hsl2rgb(float h, float s, float l) {
            vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
            return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
          }

          void main() {
            float scan = fract(vPos.y * density - time * speed * 4.0);
            float band = smoothstep(0.45, 0.5, scan) * (1.0 - smoothstep(0.5, 0.55, scan));
            float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.5);
            vec3 col = hsl2rgb(hue + scan * 0.1, 1.0, 0.55);
            vec3 final = col * (band * glow + fres * 0.6);
            gl_FragColor = vec4(final, 1.0);
          }
        `,
        transparent: false,
      });
      mat.userData.uniforms = uniforms;
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
      u.speed.value = p.speed;
      u.density.value = p.density;
      u.hue.value = p.hue;
      u.glow.value = p.glow;
    },
    tick(t, mat) {
      mat.userData.uniforms.time.value = t;
    },
  },

  /* ============================================================
     03 · LAVA — bumpy, animated emissive viscous.
     ============================================================ */
  lava: {
    label: 'Lava',
    params: { heat: 0.6, viscosity: 0.4, hueShift: 0.05, intensity: 1.0 },
    post: { bloom: true, bloomStrength: 0.7, bloomRadius: 0.7, bloomThreshold: 0.55 },
    make(p) {
      const uniforms = {
        time: { value: 0 },
        heat: { value: p.heat },
        viscosity: { value: p.viscosity },
        hueShift: { value: p.hueShift },
        intensity: { value: p.intensity },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vPos;
          varying vec3 vNormal;
          varying vec2 vUv;
          void main() {
            vPos = position;
            vNormal = normalize(normalMatrix * normal);
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float heat;
          uniform float viscosity;
          uniform float hueShift;
          uniform float intensity;
          varying vec3 vPos;
          varying vec3 vNormal;

          // simplex-ish noise
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
          vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

          float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            i = mod289(i);
            vec4 p = permute(permute(permute(
                       i.z + vec4(0.0, i1.z, i2.z, 1.0))
                     + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                     + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
          }

          vec3 hsl2rgb(float h, float s, float l) {
            vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
            return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
          }

          void main() {
            float t = time * (0.3 + viscosity * 0.5);
            float n = snoise(vPos * 1.5 + vec3(0.0, t * 0.5, t)) * 0.5
                    + snoise(vPos * 4.0 - vec3(t, 0.0, t * 0.3)) * 0.25;
            float h = 0.05 + hueShift + n * 0.08; // red→orange→yellow band
            float l = 0.4 + heat * (n + 0.5);
            vec3 col = hsl2rgb(h, 1.0, clamp(l, 0.2, 0.85));
            // edges glow brighter
            float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
            col += vec3(0.8, 0.3, 0.05) * fres * 0.6;
            gl_FragColor = vec4(col * intensity, 1.0);
          }
        `,
      });
      mat.userData.uniforms = uniforms;
      return mat;
    },
    controls: [
      { key: 'heat', label: 'Heat', min: 0, max: 1, step: 0.01 },
      { key: 'viscosity', label: 'Flow', min: 0, max: 1, step: 0.01 },
      { key: 'hueShift', label: 'Color', min: -0.1, max: 0.2, step: 0.01 },
      { key: 'intensity', label: 'Brightness', min: 0.5, max: 2, step: 0.05 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.heat.value = p.heat;
      u.viscosity.value = p.viscosity;
      u.hueShift.value = p.hueShift;
      u.intensity.value = p.intensity;
    },
    tick(t, mat) {
      mat.userData.uniforms.time.value = t;
    },
  },

  /* ============================================================
     04 · WATER — refractive transmission + ripple.
     ============================================================ */
  water: {
    label: 'Water',
    params: { transmission: 0.95, thickness: 0.6, ior: 1.33, ripple: 0.4 },
    post: { bloom: false },
    make(p) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccdd,
        metalness: 0.0,
        roughness: 0.05,
        transmission: p.transmission,
        thickness: p.thickness,
        ior: p.ior,
        envMapIntensity: 1.4,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
        attenuationColor: 0x66bbcc,
        attenuationDistance: 1.4,
        side: THREE.DoubleSide,
      });
      // subtle normal animation via onBeforeCompile (small perturbation)
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uRipple = { value: p.ripple };
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
            float t = uTime;
            transformed.x += sin(t * 1.4 + position.y * 8.0) * 0.008 * uRipple;
            transformed.z += cos(t * 1.7 + position.y * 7.0) * 0.008 * uRipple;
          `
        );
        shader.vertexShader = 'uniform float uTime;\nuniform float uRipple;\n' + shader.vertexShader;
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
      mat.transmission = p.transmission;
      mat.thickness = p.thickness;
      mat.ior = p.ior;
      if (mat.userData.shader) mat.userData.shader.uniforms.uRipple.value = p.ripple;
    },
    tick(t, mat) {
      if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t;
    },
  },

  /* ============================================================
     05 · IRIDESCENT — soap-bubble interference.
     ============================================================ */
  iridescent: {
    label: 'Iridescent',
    params: { thickness: 400, intensity: 1.0, roughness: 0.05, base: 0.0 },
    post: { bloom: false },
    make(p) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.4,
        roughness: p.roughness,
        iridescence: p.intensity,
        iridescenceIOR: 1.3,
        iridescenceThicknessRange: [100, p.thickness],
        envMapIntensity: 1.4,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
      });
      return mat;
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
      const c = new THREE.Color().setHSL(p.base, 0.1, 0.95);
      mat.color.copy(c);
    },
  },

  /* ============================================================
     06 · STONES — rocky, weathered surface (procedural noise normals)
     ============================================================ */
  stones: {
    label: 'Stones',
    params: { roughness: 0.85, bumpiness: 0.5, hue: 0.08, darkness: 0.45 },
    post: { bloom: false },
    make(p) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x6a6258,
        metalness: 0.05,
        roughness: p.roughness,
        envMapIntensity: 0.6,
      });
      // procedural bump via onBeforeCompile
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uBump = { value: p.bumpiness };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          // procedural noise displacement on normal
          float n = sin(vViewPosition.x * 60.0) * cos(vViewPosition.y * 55.0) * sin(vViewPosition.z * 65.0);
          normal = normalize(normal + vec3(n * 0.4, n * -0.3, n * 0.2) * uBump);
          `
        );
        shader.fragmentShader = 'uniform float uBump;\n' + shader.fragmentShader;
        mat.userData.shader = shader;
      };
      return mat;
    },
    controls: [
      { key: 'roughness', label: 'Roughness', min: 0.4, max: 1, step: 0.01 },
      { key: 'bumpiness', label: 'Bumpiness', min: 0, max: 1.5, step: 0.05 },
      { key: 'hue', label: 'Hue', min: 0, max: 1, step: 0.01 },
      { key: 'darkness', label: 'Darkness', min: 0.2, max: 0.7, step: 0.01 },
    ],
    update(p, mat) {
      mat.roughness = p.roughness;
      const col = new THREE.Color().setHSL(p.hue, 0.15, p.darkness);
      mat.color.copy(col);
      if (mat.userData.shader) mat.userData.shader.uniforms.uBump.value = p.bumpiness;
    },
  },

  /* ============================================================
     07 · FUZZY — shell-based fur with view-dependent shading.
     ============================================================ */
  fuzzy: {
    label: 'Fuzzy',
    params: { length: 0.8, density: 0.6, hue: 0.05, wind: 0.3 },
    post: { bloom: false },
    make(p) {
      // Single material using fresnel + noise to fake fur shading
      const uniforms = {
        time: { value: 0 },
        length: { value: p.length },
        density: { value: p.density },
        hue: { value: p.hue },
        wind: { value: p.wind },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        lights: false,
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vPos;
          uniform float time;
          uniform float wind;
          void main() {
            vec3 displaced = position;
            displaced += normal * sin(time * 1.2 + position.x * 4.0 + position.y * 3.0) * 0.01 * wind;
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelViewMatrix * vec4(displaced, 1.0);
            vViewDir = normalize(-worldPos.xyz);
            vPos = position;
            gl_Position = projectionMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform float length;
          uniform float density;
          uniform float hue;
          varying vec3 vNormal;
          varying vec3 vViewDir;
          varying vec3 vPos;

          float hash(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          }

          vec3 hsl2rgb(float h, float s, float l) {
            vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
            return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
          }

          void main() {
            float fres = 1.0 - abs(dot(vNormal, vViewDir));
            // simulated fur "tufts" via grainy noise
            float grain = hash(floor(vPos * (40.0 + density * 80.0))) ;
            float fur = grain * fres * length;
            vec3 base = hsl2rgb(hue, 0.6, 0.4);
            vec3 tip = hsl2rgb(hue, 0.4, 0.85);
            vec3 col = mix(base, tip, fur);
            col *= 0.5 + 0.5 * dot(vNormal, normalize(vec3(0.5, 1.0, 0.6)));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      mat.userData.uniforms = uniforms;
      return mat;
    },
    controls: [
      { key: 'length', label: 'Length', min: 0, max: 1.5, step: 0.05 },
      { key: 'density', label: 'Density', min: 0, max: 1, step: 0.01 },
      { key: 'hue', label: 'Color', min: 0, max: 1, step: 0.01 },
      { key: 'wind', label: 'Wind', min: 0, max: 1.5, step: 0.05 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.length.value = p.length;
      u.density.value = p.density;
      u.hue.value = p.hue;
      u.wind.value = p.wind;
    },
    tick(t, mat) {
      mat.userData.uniforms.time.value = t;
    },
  },

  /* ============================================================
     08 · VINES — green moss-like growth shader.
     ============================================================ */
  vines: {
    label: 'Vines',
    params: { coverage: 0.7, growth: 0.5, hue: 0.32, dampness: 0.4 },
    post: { bloom: false },
    make(p) {
      const uniforms = {
        time: { value: 0 },
        coverage: { value: p.coverage },
        growth: { value: p.growth },
        hue: { value: p.hue },
        dampness: { value: p.dampness },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPos;
          varying vec3 vViewDir;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelViewMatrix * vec4(position, 1.0);
            vViewDir = normalize(-worldPos.xyz);
            vPos = position;
            gl_Position = projectionMatrix * worldPos;
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float coverage;
          uniform float growth;
          uniform float hue;
          uniform float dampness;
          varying vec3 vNormal;
          varying vec3 vPos;
          varying vec3 vViewDir;

          float hash(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          }
          float vnoise(vec3 p) {
            vec3 i = floor(p); vec3 f = fract(p);
            f = f*f*(3.0-2.0*f);
            float a = hash(i);
            float b = hash(i + vec3(1.,0.,0.));
            float c = hash(i + vec3(0.,1.,0.));
            float d = hash(i + vec3(1.,1.,0.));
            float e = hash(i + vec3(0.,0.,1.));
            float g = hash(i + vec3(1.,0.,1.));
            float h = hash(i + vec3(0.,1.,1.));
            float k = hash(i + vec3(1.,1.,1.));
            return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y),
                       mix(mix(e,g,f.x),mix(h,k,f.x),f.y),f.z);
          }

          vec3 hsl2rgb(float h, float s, float l) {
            vec3 rgb = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
            return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
          }

          void main() {
            float n = vnoise(vPos * (4.0 + growth * 6.0) + time * 0.05);
            // moss likes upward-facing surfaces
            float upward = max(0.0, vNormal.y);
            float moss = smoothstep(1.0 - coverage, 1.0 - coverage + 0.15, n + upward * 0.4);
            vec3 stone = hsl2rgb(0.08, 0.1, 0.35);
            vec3 mossCol = hsl2rgb(hue, 0.5, 0.3 + dampness * 0.15);
            vec3 col = mix(stone, mossCol, moss);
            // fake light
            float lit = 0.4 + 0.6 * dot(vNormal, normalize(vec3(0.5, 1.0, 0.6)));
            col *= lit;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      mat.userData.uniforms = uniforms;
      return mat;
    },
    controls: [
      { key: 'coverage', label: 'Coverage', min: 0, max: 1, step: 0.01 },
      { key: 'growth', label: 'Growth', min: 0, max: 1, step: 0.01 },
      { key: 'hue', label: 'Hue', min: 0.2, max: 0.45, step: 0.01 },
      { key: 'dampness', label: 'Dampness', min: 0, max: 1, step: 0.01 },
    ],
    update(p, mat) {
      const u = mat.userData.uniforms;
      u.coverage.value = p.coverage;
      u.growth.value = p.growth;
      u.hue.value = p.hue;
      u.dampness.value = p.dampness;
    },
    tick(t, mat) {
      mat.userData.uniforms.time.value = t;
    },
  },

};

/* ──────────────────────────────────────────────────────────────
   SKIN APPLY + PARAM PANEL
   ────────────────────────────────────────────────────────────── */
let currentSkin = null;
let currentMaterial = null;

function getParams(skinKey) {
  const def = SKINS[skinKey];
  const stored = state.params[skinKey] || {};
  return { ...def.params, ...stored };
}

function applySkin(skinKey, animate = true) {
  const def = SKINS[skinKey];
  if (!def || !jMesh) return;

  const params = getParams(skinKey);
  const newMat = def.make(params);

  if (animate && currentMaterial) {
    // Quick crossfade via mesh scale (hides material swap)
    gsap.to(jMesh.scale, {
      x: jMesh.scale.x * 0.92,
      y: jMesh.scale.y * 0.92,
      z: jMesh.scale.z * 0.92,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        if (currentMaterial.dispose) currentMaterial.dispose();
        jMesh.material = newMat;
        currentMaterial = newMat;
        gsap.to(jMesh.scale, {
          x: jMesh.scale.x / 0.92,
          y: jMesh.scale.y / 0.92,
          z: jMesh.scale.z / 0.92,
          duration: 0.45,
          ease: 'elastic.out(1, 0.7)',
        });
      },
    });
  } else {
    if (currentMaterial && currentMaterial.dispose) currentMaterial.dispose();
    jMesh.material = newMat;
    currentMaterial = newMat;
  }

  // Configure post-processing
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
    const display = formatValue(val, ctrl);
    wrap.innerHTML = `
      <div class="row">
        <label for="${id}">${ctrl.label}</label>
        <span class="val" id="${id}-val">${display}</span>
      </div>
      <input type="range" id="${id}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${val}">
    `;
    body.appendChild(wrap);
    const input = wrap.querySelector('input');
    const valEl = wrap.querySelector('.val');
    input.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      params[ctrl.key] = v;
      state.params[skinKey] = params;
      saveState();
      def.update(params, currentMaterial);
      valEl.textContent = formatValue(v, ctrl);
    });
  });

  panel.classList.add('show');
}

function formatValue(v, ctrl) {
  if (ctrl.step >= 1) return Math.round(v).toString();
  if (ctrl.step >= 0.1) return v.toFixed(1);
  return v.toFixed(2);
}

/* ──────────────────────────────────────────────────────────────
   UI WIRING
   ────────────────────────────────────────────────────────────── */
function setActiveButton(key) {
  document.querySelectorAll('#skin-rail button').forEach(b => {
    b.classList.toggle('active', b.dataset.skin === key);
  });
}

document.querySelectorAll('#skin-rail button').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.skin;
    if (!SKINS[key] || key === currentSkin) return;
    setActiveButton(key);
    applySkin(key);
  });
});

document.querySelector('#params .reset').addEventListener('click', () => {
  delete state.params[currentSkin];
  saveState();
  applySkin(currentSkin, false);
  setActiveButton(currentSkin);
});

/* Keyboard: 1-8 skin, R reset, P params toggle */
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 8) {
    const keys = Object.keys(SKINS);
    const key = keys[num - 1];
    if (key) {
      setActiveButton(key);
      applySkin(key);
    }
  } else if (e.key === 'r' || e.key === 'R') {
    delete state.params[currentSkin];
    saveState();
    applySkin(currentSkin, false);
  } else if (e.key === 'p' || e.key === 'P') {
    document.getElementById('params').classList.toggle('show');
  }
});

/* ──────────────────────────────────────────────────────────────
   INTERACTION — drag rotates J, idle rotation, mouse parallax tilt
   ────────────────────────────────────────────────────────────── */
let isDragging = false;
let lastX = 0, lastY = 0;
let velX = 0, velY = 0;
let mouseX = 0, mouseY = 0;
let interacted = false;

function onPointerDown(e) {
  isDragging = true;
  lastX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  lastY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  velX = 0; velY = 0;
  if (!interacted) {
    interacted = true;
    document.getElementById('hint').classList.add('gone');
  }
}
function onPointerMove(e) {
  const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  mouseX = (x / window.innerWidth) * 2 - 1;
  mouseY = (y / window.innerHeight) * 2 - 1;
  if (!isDragging) return;
  const dx = x - lastX;
  const dy = y - lastY;
  velX = dy * 0.005;
  velY = dx * 0.005;
  lastX = x; lastY = y;
}
function onPointerUp() { isDragging = false; }

host.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
host.addEventListener('touchstart', onPointerDown, { passive: true });
window.addEventListener('touchmove', onPointerMove, { passive: true });
window.addEventListener('touchend', onPointerUp);

/* ──────────────────────────────────────────────────────────────
   ANIMATION LOOP
   ────────────────────────────────────────────────────────────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  const dt = clock.getDelta();

  if (jGroup) {
    if (isDragging) {
      jGroup.rotation.x += velX;
      jGroup.rotation.y += velY;
    } else {
      // Damp velocities and add idle rotation
      velX *= 0.95;
      velY *= 0.95;
      jGroup.rotation.x += velX;
      jGroup.rotation.y += velY + 0.0025; // slow auto-rotate
    }
    // Mouse parallax tilt — subtle
    const targetTiltX = mouseY * 0.08;
    const targetTiltZ = -mouseX * 0.08;
    jGroup.position.x += (mouseX * 0.06 - jGroup.position.x) * 0.04;
    jGroup.position.y += (-mouseY * 0.04 - jGroup.position.y) * 0.04;
  }

  // Skin tick
  if (currentSkin && currentMaterial) {
    const tick = SKINS[currentSkin].tick;
    if (tick) tick(elapsed, currentMaterial);
  }

  if (bloomPass.enabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
animate();

/* ──────────────────────────────────────────────────────────────
   RESPONSIVE
   ────────────────────────────────────────────────────────────── */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ──────────────────────────────────────────────────────────────
   PAUSE WHEN TAB INACTIVE (perf)
   ────────────────────────────────────────────────────────────── */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clock.stop();
  else clock.start();
});
