// Progressive path tracing of the same scene. Loaded on demand: it is 800 kB of JS and needs a desktop GPU.
import * as THREE from 'three';

/** Whether this browser can even try. A phone that passes this can still lose its context, so callers catch. */
export function canPathTrace() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return false;
  const ok = gl.getExtension('EXT_color_buffer_float') && gl.getExtension('OES_texture_float_linear');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return Boolean(ok) && Math.min(screen.width, screen.height) >= 700;
}

export class PathTrace {
  static async create(canvas, built, camera, { bounces = 7, textureSize = 1024, exposure = 1.05, size, tone = 'neutral' } = {}) {
    const { WebGLPathTracer } = await import('three-gpu-pathtracer');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = tone === 'agx' ? THREE.AgXToneMapping : tone === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    renderer.toneMappingExposure = exposure;
    if (size) renderer.setSize(size[0], size[1], false);
    const pt = new WebGLPathTracer(renderer);
    pt.bounces = bounces;
    pt.transmissiveBounces = 1;
    pt.filterGlossyFactor = 0.6;
    pt.minSamples = 1;
    pt.fadeDuration = 0;
    pt.renderDelay = 0;
    pt.tiles.set(1, 1);
    pt.textureSize.set(textureSize, textureSize);
    pt.rasterizeScene = false;
    const t0 = performance.now();
    pt.setScene(built.scene, camera);
    // The library's default stratified sampler converged to a fixed per-pixel speckle here: wall noise measured
    // 74.8 at 400 samples against 78.0 at 25, on three 0.180 with library 0.0.24. Plain PCG random falls as it should.
    pt._pathTracer.material.setDefine('RANDOM_TYPE', 0);
    const o = new PathTrace();
    Object.assign(o, { renderer, pt, built, camera, buildMs: performance.now() - t0, px: new Uint8Array(4) });
    return o;
  }

  get samples() { return this.pt.samples; }

  updateCamera() { this.pt.updateCamera(); }

  /** Render until `samples`, yielding each frame. `duty` < 1 rests the GPU between samples for other users of the box. */
  async run(samples, { duty = 1, onProgress, shouldStop } = {}) {
    const t0 = performance.now();
    let firstMs = 0;
    while (this.pt.samples < samples) {
      if (shouldStop?.()) break;
      const s0 = performance.now();
      this.pt.renderSample();
      // A one-pixel read is the only real wait in Chrome: finish() is just a flush there, and without this
      // the command queue runs ahead of the GPU and the timing means nothing.
      const gl = this.renderer.getContext();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
      const dt = performance.now() - s0;
      if (!firstMs && this.pt.samples >= 1) firstMs = dt;
      onProgress?.(this.pt.samples);
      await new Promise((r) => { setTimeout(r, duty < 1 ? dt * (1 / duty - 1) : 0); });
    }
    return { ms: performance.now() - t0, firstMs, samples: this.pt.samples };
  }

  /** A last pass of edge-preserving smoothing over the accumulated image, for stills. Costs a little fine grain. */
  async finish({ sigma = 2, threshold = 0.05, kSigma = 1.5 } = {}) {
    const { DenoiseMaterial } = await import('three-gpu-pathtracer');
    const { FullScreenQuad } = await import('three/addons/postprocessing/Pass.js');
    const quad = new FullScreenQuad(new DenoiseMaterial({ map: this.pt.target.texture, sigma, threshold, kSigma, opacity: 1, transparent: false, blending: THREE.NoBlending }));
    this.renderer.setRenderTarget(null);
    const auto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    quad.render(this.renderer);
    this.renderer.autoClear = auto;
    quad.material.dispose();
    quad.dispose();
  }

  dispose() {
    this.pt.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
