// Physically based materials and their textures, generated on a canvas at load so nothing large ships.
// Colours and grain are read off the three room photos; the tile size of the parquet is an ESTIMATE.
import * as THREE from 'three';
import { noise3 } from './forms.mjs';

const TEX = 1024;

function canvas(size = TEX) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function tex(c, { srgb = false, repeatM = 1 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(1 / repeatM, 1 / repeatM);
  t.generateMipmaps = true;
  return t;
}

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Normal map from a height array, wrapping at the edges so it tiles. */
function normalFrom(height, size, strength) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x + size - 1) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y + size - 1) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      const nx = (l - r) * strength; const ny = (d - u) * strength; const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Wood grain as a function of position: long streaks along u with a slow cathedral wobble. */
function grain(u, v, seed, scale = 1) {
  const w = noise3(u * 0.8 * scale, v * 2.2 * scale, seed, seed) * 2.4;
  const ring = Math.sin((v * 34 * scale + w * 5) * Math.PI);
  const fine = noise3(u * 3 * scale, v * 130 * scale, seed + 1, seed);
  const pore = noise3(u * 9 * scale, v * 420 * scale, seed + 2, seed);
  return ring * 0.45 + fine * 0.42 + Math.min(0, pore) * 0.55;
}

// The photos show warm honey oak in a square mosaic: blocks of five fingers, turned 90 degrees checkerwise.
// ESTIMATE: 120 mm squares of 5 x 24 mm fingers, the common size for this floor type, from the look only.
const TILE = 120; const FINGERS = 5; const TILES_PER_TEX = 8;
function parquet() {
  const size = 2048;
  const m = (TILES_PER_TEX * TILE) / 1000;
  const col = canvas(size); const cx = col.getContext('2d');
  const img = cx.createImageData(size, size);
  const rough = canvas(size); const rx = rough.getContext('2d'); const rimg = rx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const pxPerTile = size / TILES_PER_TEX;
  const fw = pxPerTile / FINGERS;
  const rnd = seeded(4242);
  const tones = [];
  for (let i = 0; i < TILES_PER_TEX * TILES_PER_TEX * FINGERS; i++) tones.push({ t: rnd(), s: rnd() * 90, off: rnd() * 20 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ti = Math.floor(x / pxPerTile); const tj = Math.floor(y / pxPerTile);
      const turned = (ti + tj) % 2 === 1;
      const lu = turned ? y - tj * pxPerTile : x - ti * pxPerTile;
      const lv = turned ? x - ti * pxPerTile : y - tj * pxPerTile;
      const f = Math.min(FINGERS - 1, Math.floor(lv / fw));
      const tone = tones[(tj * TILES_PER_TEX + ti) * FINGERS + f];
      const g = grain((lu / size) * 8 + tone.off, (lv / size) * 8 + tone.off * 1.3, 3 + (tone.s | 0) % 9, 1);
      const tv = tone.t * tone.t;
      // Warm amber to mid honey, darker at the grain.
      const k = 0.5 + g * 0.5;
      const r = (198 + 34 * tv) * (0.82 + 0.22 * k);
      const gg = (150 + 36 * tv) * (0.8 + 0.24 * k);
      const b = (98 + 34 * tv) * (0.74 + 0.28 * k);
      const edgeF = Math.min(lv - f * fw, (f + 1) * fw - lv);
      const edgeT = Math.min(lu, pxPerTile - lu);
      const groove = Math.min(edgeF * 2.0, edgeT, 3) / 3; // fingers tight, tile edges a touch wider
      const i = (y * size + x) * 4;
      const d = 0.62 + 0.38 * groove;
      img.data[i] = r * d; img.data[i + 1] = gg * d; img.data[i + 2] = b * d; img.data[i + 3] = 255;
      const ro = 90 + g * 28 + (1 - groove) * 90; // satin varnish, dull in the joints
      rimg.data[i] = ro; rimg.data[i + 1] = ro; rimg.data[i + 2] = ro; rimg.data[i + 3] = 255;
      height[y * size + x] = groove * 0.9 + g * 0.05;
    }
  }
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  return {
    map: tex(col, { srgb: true, repeatM: m }),
    roughnessMap: tex(rough, { repeatM: m }),
    normalMap: tex(normalFrom(height, size, 1.3), { repeatM: m }),
  };
}

function oak() {
  const size = 1024; const m = 0.9;
  const col = canvas(size); const cx = col.getContext('2d'); const img = cx.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size; const v = y / size;
      // Periodic in u via sin wrap of the slow term so the long grain does not show a tile line.
      // Straight quarter-sawn look: the cathedral swirls of a plain grain() read as fake over a whole door.
      const w = noise3(Math.sin(u * Math.PI * 2) * 0.5, v * 3, 2, 11) * 0.7;
      const line = noise3(Math.sin(u * Math.PI * 2) * 0.8, (v + w * 0.04) * 90, 1, 3) * 0.6;
      const pore = noise3(Math.sin(u * Math.PI * 2) * 7, (v + w * 0.02) * 520, 2, 5);
      const band = noise3(Math.sin(u * Math.PI * 2) * 0.3, v * 14, 3, 8) * 0.5;
      const g = line + Math.min(0, pore) * 0.5 + band;
      const k = 0.5 + g * 0.5;
      const i = (y * size + x) * 4;
      img.data[i] = 214 * (0.8 + 0.22 * k); img.data[i + 1] = 178 * (0.77 + 0.25 * k); img.data[i + 2] = 132 * (0.7 + 0.3 * k); img.data[i + 3] = 255;
      height[y * size + x] = g * 0.14;
    }
  }
  cx.putImageData(img, 0, 0);
  return { map: tex(col, { srgb: true, repeatM: m }), normalMap: tex(normalFrom(height, size, 1.3), { repeatM: m }) };
}

function weave() {
  // A tight, slightly irregular wool weave. Tile is 40 mm with about 2.5 mm threads.
  const size = 512; const threads = 16; const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * threads; const v = (y / size) * threads;
      const iu = Math.floor(u); const iv = Math.floor(v);
      const fu = u - iu - 0.5; const fv = v - iv - 0.5;
      const over = (iu + iv) % 2 === 0;
      const a = over ? Math.cos(fu * Math.PI) : Math.cos(fv * Math.PI);
      const j = noise3(x * 0.07, y * 0.07, 3, 7) * 0.28;
      h[y * size + x] = Math.max(0, a) * (over ? 1 : 0.84) + j;
    }
  }
  return tex(normalFrom(h, size, 3.2), { repeatM: 0.08 }); // 5 mm threads: chunky wool that still shows at room distance
}

function melamineGrain() {
  // The white doors in the third photo carry a fine vertical embossed wood grain.
  const size = 512; const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size; const v = y / size;
      h[y * size + x] = noise3(u * 90, Math.sin(v * Math.PI * 2) * 2.5, Math.cos(v * Math.PI * 2) * 2.5, 2) * 0.6 + noise3(u * 280, v * 6, 0, 4) * 0.25;
    }
  }
  return tex(normalFrom(h, size, 1.4), { repeatM: 0.5 });
}

function grit() {
  const size = 256; const h = new Float32Array(size * size);
  const r = seeded(77);
  for (let i = 0; i < h.length; i++) h[i] = r();
  return tex(normalFrom(h, size, 0.8), { repeatM: 0.05 });
}

/** An illustrative picture for the projector wall: a plain dusk landscape, so nobody reads meaning into it. */
function projected() {
  const c = canvas(512); const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#223a6b'); g.addColorStop(0.55, '#e7936a'); g.addColorStop(0.72, '#f6d398'); g.addColorStop(0.73, '#2a2f3e'); g.addColorStop(1, '#141721');
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  x.fillStyle = '#1c2231'; x.beginPath(); x.moveTo(0, 380); x.lineTo(120, 300); x.lineTo(220, 350); x.lineTo(340, 270); x.lineTo(512, 370); x.lineTo(512, 512); x.lineTo(0, 512); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Something plausible on the monitor: a dark terminal. Emissive, so it reads as switched on. */
function terminal() {
  const c = canvas(512); const x = c.getContext('2d');
  c.height = 288;
  x.fillStyle = '#0b1014'; x.fillRect(0, 0, 512, 288);
  const r = seeded(17);
  for (let i = 0; i < 26; i++) {
    x.fillStyle = i % 7 === 0 ? '#e0a050' : i % 3 === 0 ? '#7fc99a' : '#9db4c0';
    x.fillRect(14 + (i % 5 === 0 ? 0 : 14), 12 + i * 10, 40 + r() * 330, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const UPHOLSTERY = { vermilion: 0xb93218, cobalt: 0x1f3fa8, saffron: 0xdf9410 };

export function makeMaterials({ upholstery = 'vermilion' } = {}) {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const pq = parquet();
  const oakT = oak();
  const wv = weave();
  const grain2 = melamineGrain();
  const gritN = grit();
  const accent = UPHOLSTERY[upholstery] ?? upholstery;
  return {
    wall: S({ color: 0xece9e2, roughness: 0.9 }),
    ceiling: S({ color: 0xf0eee9, roughness: 0.92 }),
    parquet: S({ ...pq, roughness: 1, normalScale: new THREE.Vector2(0.45, 0.45) }),
    oak: P({ ...oakT, roughness: 0.42, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 0.15, clearcoatRoughness: 0.4 }),
    door: P({ ...oakT, color: 0xd8c8b4, roughness: 0.46, normalScale: new THREE.Vector2(0.3, 0.3) }), // ESTIMATE: he said wood, no photo shows it
    white: P({ color: 0xf3f2ec, roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.25 }),
    melamine: S({ color: 0xece9e1, roughness: 0.46, normalMap: grain2, normalScale: new THREE.Vector2(0.18, 0.18) }),
    pvc: S({ color: 0xf0efe9, roughness: 0.32 }),
    shelf: S({ color: 0xeeece5, roughness: 0.5 }),
    alu: S({ color: 0x17181a, roughness: 0.38, metalness: 0.85 }),
    steel: S({ color: 0x24262a, roughness: 0.36, metalness: 1 }),
    steelPale: S({ color: 0xc2c4c6, roughness: 0.3, metalness: 1 }),
    mirror: S({ color: 0xeef0f0, roughness: 0.012, metalness: 1 }),
    shutter: S({ color: 0x5a5e5c, roughness: 0.55, metalness: 0.2 }),
    radiator: S({ color: 0xdcdcd7, roughness: 0.42 }),
    fabric: P({ color: accent, roughness: 0.96, normalMap: wv, normalScale: new THREE.Vector2(1.1, 1.1), sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.25) }),
    holdA: S({ color: accent, roughness: 0.74, normalMap: gritN, normalScale: new THREE.Vector2(0.5, 0.5) }),
    holdB: P({ ...oakT, roughness: 0.48, normalScale: new THREE.Vector2(0.3, 0.3) }),
    linen: P({ color: 0xe8e4da, roughness: 0.95, normalMap: wv, normalScale: new THREE.Vector2(0.3, 0.3), sheen: 0.4, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) }),
    duvet: P({ color: 0xd7d3c8, roughness: 0.95, normalMap: wv, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.45, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) }),
    pillow: P({ color: 0xf0ede4, roughness: 0.92, normalMap: wv, normalScale: new THREE.Vector2(0.25, 0.25), sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff) }),
    felt: S({ color: 0x1b1c1d, roughness: 0.96 }),
    black: S({ color: 0x141516, roughness: 0.5 }),
    powder: P({ color: 0x1a1c1e, roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.45 }), // ESTIMATE: black powder coat on Design B's frame
    figure: S({ color: 0xa9a59b, roughness: 0.78 }), // a neutral stand-in for a person, for scale only
    piano: P({ color: 0xf2f1ec, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    ring: S({ color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 1.6, roughness: 0.5 }),
    spot: S({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 0.5, roughness: 0.4 }),
    fanWhite: S({ color: 0xe9e8e3, roughness: 0.42 }),
    // A projector only adds light to the wall, so the picture is wall paint plus a dim emission.
    image: S({ color: 0xece9e2, roughness: 0.9, emissive: 0xffffff, emissiveMap: projected(), emissiveIntensity: 0.3 }),
    esd: S({ color: 0x2b3a42, roughness: 0.82 }), // ESTIMATE: the usual blue-grey anti-static mat
    screen: S({ color: 0x050607, roughness: 0.14, emissive: 0xffffff, emissiveMap: terminal(), emissiveIntensity: 0.22 }),
    pcb: S({ color: 0x14553a, roughness: 0.45 }),
    copper: S({ color: 0xb87a3c, roughness: 0.35, metalness: 1 }),
    stop: S({ color: accent, roughness: 0.4 }),
    glass: P({ color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 1, thickness: 0, ior: 1.5, transparent: true, opacity: 0.12 }),
  };
}

/** Sky seen through the west windows, as an equirectangular HDR map: world Y up, -X is west. */
export function makeSky({ azimuthDeg = 12, elevationDeg = 27, sunRadiance = 900, skyGain = 1.7, width = 2048 } = {}) {
  const w = width; const h = width / 2;
  const data = new Float32Array(w * h * 4);
  const az = THREE.MathUtils.degToRad(azimuthDeg); const el = THREE.MathUtils.degToRad(elevationDeg);
  // West is -X; azimuth swings toward south (world +Z).
  const sun = new THREE.Vector3(-Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  const d = new THREE.Vector3();
  const noSunData = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = ((x + 0.5) / w) * Math.PI * 2 - Math.PI;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const up = Math.max(d.y, 0);
      const t = Math.pow(up, 0.55);
      // Hazy afternoon: pale warm at the horizon, clear blue higher up.
      let r = (1 - t) * 2.5 + t * 0.62;
      let g = (1 - t) * 2.35 + t * 0.92;
      let b = (1 - t) * 2.15 + t * 1.5;
      const near = Math.max(0, d.dot(sun));
      const halo = Math.pow(near, 40) * 4.5 + Math.pow(near, 8) * 0.9;
      r += halo * 1.15; g += halo * 0.95; b += halo * 0.7;
      r *= skyGain; g *= skyGain; b *= skyGain;
      if (d.y < 0.002) {
        r = 0.62 * skyGain; g = 0.58 * skyGain; b = 0.5 * skyGain; // street and neighbouring facades, warm
      } else if (d.y < 0.11 + 0.035 * noise3(lon * 4, 0, 0, 4)) {
        const b2 = 0.75 + 0.18 * noise3(lon * 24, 0, 0, 8);
        r = 1.15 * b2 * skyGain; g = 1.04 * b2 * skyGain; b = 0.8 * b2 * skyGain; // the buttery facade in the first photo
      }
      const i = (y * w + x) * 4;
      noSunData.set([r, g, b, 1], i);
      const a = Math.acos(Math.min(1, near));
      const core = Math.exp(-((a / THREE.MathUtils.degToRad(1.6)) ** 2));
      // The lighting map holds only the sun. The sky reaches the room through portal lights in the window
      // openings (scene.mjs), because almost every sky ray from inside a room hits a wall and is wasted.
      data[i] = r * 0.015 + core * sunRadiance * 1.0;
      data[i + 1] = g * 0.015 + core * sunRadiance * 0.84;
      data[i + 2] = b * 0.015 + core * sunRadiance * 0.62;
      data[i + 3] = 1;
    }
  }
  const mk = (arr) => {
    const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat, THREE.FloatType);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(data), noSun: mk(noSunData), sunDir: sun };
}
