// The live, orbitable view: rasterized PBR with soft sun shadows and ambient occlusion.
// Scaled by device tier so it keeps moving on a phone. The final image quality lives in the path-traced stills.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { P } from './scene.mjs';

/** Rough tier from the device. A frame-time watchdog in the loop can still step down. */
export function pickTier() {
  const small = Math.min(screen.width, screen.height) < 700;
  const mem = navigator.deviceMemory || 8;
  if (small || mem <= 2) return 'low';
  return 'high';
}

export class Raster {
  constructor(canvas, built, { tier = pickTier() } = {}) {
    this.canvas = canvas;
    this.built = built;
    this.tier = tier;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap; // VSM left jagged black fringes on the duvet edge
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.05, 40);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });

    const scene = built.scene;
    const pm = new THREE.PMREMGenerator(r);
    this.envRT = pm.fromEquirectangular(built.sky.noSun);
    pm.dispose();
    scene.environment = this.envRT.texture;
    // The room is a closed box, so the sky map only reaches it as a dim ambient: real bounce is what is missing here.
    scene.environmentIntensity = 0.42;
    const d = built.sky.sunDir;
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    sun.position.copy(P(1333, 2500, 1200)).addScaledVector(d, 7);
    sun.target.position.copy(P(1333, 2500, 1200));
    sun.castShadow = true;
    const map = tier === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(map, map);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 });
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 5;
    scene.add(sun, sun.target);
    // Stand-ins for what a path tracer gets for free: sky glow through the windows and sun bouncing off the floor.
    const bounce = new THREE.PointLight(0xffd8a8, 2.2, 7, 1.4);
    bounce.position.copy(P(1700, 3000, 300));
    const fill = new THREE.PointLight(0xdbe6ff, 3.0, 8, 1.3);
    fill.position.copy(P(300, 3100, 1700));
    scene.add(bounce, fill);

    this.composer = null;
    if (tier === 'high') {
      this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.gtao = new GTAOPass(scene, this.camera, 4, 4);
      this.gtao.updateGtaoMaterial({ radius: 0.32, distanceExponent: 1.4, thickness: 1, scale: 1.25, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 2, rings: 2, samples: 16 });
      this.composer.addPass(this.gtao);
      this.composer.addPass(new OutputPass());
      const mirror = this.findMirror();
      if (mirror) this.addReflector(mirror);
    }
    this.ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.px = new Uint8Array(4);
    this.timing = false;
    this.dirty = true;
    this.resize();
    this.frameMs = 0;
  }

  findMirror() {
    let found = null;
    this.built.root.traverse((o) => { if (o.material === this.built.materials.mirror) found = o; });
    return found;
  }

  addReflector(mesh) {
    // The real mirror: a planar reflection only in the tier that can pay for a second scene pass.
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    const g = new THREE.PlaneGeometry(b.max.x - b.min.x, b.max.z - b.min.z);
    const ref = new Reflector(g, { textureWidth: 1024, textureHeight: 1536, clipBias: 0.001, color: 0xe4e6e6 });
    ref.rotation.x = -Math.PI / 2;
    ref.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.5, (b.min.z + b.max.z) / 2);
    this.built.root.add(ref);
  }

  /** A portrait phone needs a taller field to show the same width as a landscape screen. */
  fitFov() {
    const a = this.camera.aspect;
    const f = this.baseFov || 58;
    if (a >= 1.2) { this.camera.fov = f; } else {
      const half = Math.tan(THREE.MathUtils.degToRad(f / 2)) * 1.2;
      this.camera.fov = Math.min(112, THREE.MathUtils.radToDeg(2 * Math.atan(half / a)));
    }
    this.camera.updateProjectionMatrix();
  }

  setView(pos, target, fov) {
    this.baseFov = fov;
    this.fitFov();
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
    this.dirty = true;
  }

  resize() {
    const w = this.canvas.clientWidth || 1; const h = this.canvas.clientHeight || 1;
    const dpr = Math.min(window.devicePixelRatio, this.tier === 'high' ? 2 : 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.fitFov();
    this.composer?.setPixelRatio(dpr);
    this.composer?.setSize(w, h);
    this.dirty = true;
  }

  /** Hide what stands between an outside camera and the room, keeping it in the shadow pass so no sun floods in. */
  cutaway() {
    const c = this.camera.position;
    const x = c.x * 1000; const y = -c.z * 1000; const z = c.y * 1000;
    const { walls, ceiling } = this.built.room;
    const room = this.built.resolved;
    const W = Math.max(...room.corners.map((q) => q[0])); const L = Math.max(...room.corners.map((q) => q[1]));
    const hide = (o, out) => {
      o.traverse((m) => {
        if (!m.isMesh) return;
        if (!m.userData.solid) m.userData.solid = m.material;
        m.material = out ? this.ghost : m.userData.solid;
      });
    };
    hide(walls.west, x < 0); hide(walls.east, x > W); hide(walls.south, y < 0); hide(walls.north, y > L); hide(ceiling, z > room.maxHeight);
  }

  render() {
    const t0 = performance.now();
    this.cutaway();
    if (this.composer) this.composer.render(); else this.renderer.render(this.built.scene, this.camera);
    // A one-pixel read is the only real wait for the GPU in Chrome; only do it while timing.
    if (this.timing) { const gl = this.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px); }
    this.frameMs = performance.now() - t0;
  }

  frame() {
    this.controls.update();
    if (!this.dirty) return;
    this.dirty = false;
    this.render();
  }

  dispose() {
    this.controls.dispose();
    this.composer?.dispose?.();
    this.envRT.dispose();
    this.renderer.dispose();
  }
}
