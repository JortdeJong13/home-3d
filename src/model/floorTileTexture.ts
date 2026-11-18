import * as THREE from 'three';

/**
 * Large-format textured limestone / travertine floor tiles (150 × 75 cm)
 * laid in a 1/3 staggered running bond (half-metre step per strip)
 * aligned lengthwise front-to-back along the Z axis.
 *
 * Periodic world repeat:
 * - 6 columns × 0.75 m = 4.50 m (X)
 * - 3 rows    × 1.50 m = 4.50 m (Z)
 */
export const GROUND_TILE_WIDTH_M = 0.75;
export const GROUND_TILE_LENGTH_M = 1.50;
export const GROUND_TILE_COLS = 6;
export const GROUND_TILE_ROWS = 3;
export const GROUND_TILE_REPEAT_W_M = GROUND_TILE_WIDTH_M * GROUND_TILE_COLS;   // 4.50 m
export const GROUND_TILE_REPEAT_H_M = GROUND_TILE_LENGTH_M * GROUND_TILE_ROWS; // 4.50 m

// Align left tile column flush with main house interior wall (X = 0.40 m),
// and shift Z origin slightly so front (Z = -0.40 m) and rear (Z = -12.46 m)
// walls never receive skinny sliver cuts across any of the 3 staggered phases.
export const GROUND_TILE_ORIGIN_X = 0.40;
export const GROUND_TILE_ORIGIN_Z = -0.15;

const TEX_SIZE = 1024;

// Subtle ~5.6 mm rectified joint width (world metres)
const JOINT_HALF_M = 0.0028;

// Warm taupe-sand mortar recessed cleanly against the textured stone
const GROUT_R = 160;
const GROUT_G = 149;
const GROUT_B = 130;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic integer hash in [0, 1). */
function hash2D(ix: number, iy: number, seed = 0): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1]. */
function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy, seed);
  const b = hash2D(ix + 1, iy, seed);
  const c = hash2D(ix, iy + 1, seed);
  const d = hash2D(ix + 1, iy + 1, seed);

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/** Multi-octave fractional Brownian motion for organic stone variation. */
function fbm2D(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 37);
    norm += amplitude;
    frequency *= 2.07;
    amplitude *= 0.5;
  }

  return value / norm;
}

/** Ridged/creased noise in [0, 1] for natural split-limestone strata & mineral edges. */
function ridgedFbm2D(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * frequency, y * frequency, seed + i * 53);
    const ridge = 1.0 - Math.abs(n * 2.0 - 1.0);
    value += amplitude * (ridge * ridge);
    norm += amplitude;
    frequency *= 2.11;
    amplitude *= 0.52;
  }

  return value / norm;
}

export interface GroundFloorTileTextureSet {
  map: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

let cachedTileTextures: GroundFloorTileTextureSet | null = null;

function createDataTexture(
  data: Uint8Array<ArrayBuffer>,
  colorSpace: THREE.ColorSpace
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates (and caches) a seamless procedural 1024×1024 150×75 cm textured
 * limestone/travertine floor tile set (albedo with cavity shading + crisp stone
 * relief bump map + matte-satin roughness map).
 * Uses THREE.DataTexture so it runs identically in both the browser and Node.js.
 */
export function getGroundFloorTileTextures(): GroundFloorTileTextureSet {
  if (cachedTileTextures) return cachedTileTextures;

  const albedoData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const bumpData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const roughnessData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  const jointFracU = JOINT_HALF_M / GROUND_TILE_WIDTH_M;
  const jointFracV = JOINT_HALF_M / GROUND_TILE_LENGTH_M;
  const featherU = (1.5 / TEX_SIZE) * GROUND_TILE_COLS;
  const featherV = (1.5 / TEX_SIZE) * GROUND_TILE_ROWS;

  for (let py = 0; py < TEX_SIZE; py++) {
    const vNorm = (py + 0.5) / TEX_SIZE;

    for (let px = 0; px < TEX_SIZE; px++) {
      const uNorm = (px + 0.5) / TEX_SIZE;

      const colFloat = uNorm * GROUND_TILE_COLS;
      const col = Math.floor(colFloat) % GROUND_TILE_COLS;
      const colFrac = colFloat - Math.floor(colFloat);

      // 1/3 staggered running bond along Z (0.00 m, 0.50 m, 1.00 m step per column)
      const stagger = (col % 3) / 3;
      const rowFloat = vNorm * GROUND_TILE_ROWS + stagger;
      const row = ((Math.floor(rowFloat) % GROUND_TILE_ROWS) + GROUND_TILE_ROWS) % GROUND_TILE_ROWS;
      const rowFrac = rowFloat - Math.floor(rowFloat);

      // Tile-local coordinates in metres with unique per-tile noise offset
      const lx = colFrac * GROUND_TILE_WIDTH_M;
      const ly = rowFrac * GROUND_TILE_LENGTH_M;
      const seedOffsetX = hash2D(col, row, 13) * 47.0;
      const seedOffsetY = hash2D(col, row, 29) * 47.0;

      // Subtle organic chiseled edge micro-undulation (~1.5 mm) along tile borders
      const edgeWobbleU = (valueNoise2D(ly * 14.0 + seedOffsetY, col * 7.1, 61) - 0.5) * 0.0022;
      const edgeWobbleV = (valueNoise2D(lx * 14.0 + seedOffsetX, row * 7.1, 67) - 0.5) * 0.0011;

      const maskU =
        smoothstep(jointFracU, jointFracU + featherU, colFrac + edgeWobbleU) *
        smoothstep(jointFracU, jointFracU + featherU, 1.0 - colFrac - edgeWobbleU);
      const maskV =
        smoothstep(jointFracV, jointFracV + featherV, rowFrac + edgeWobbleV) *
        smoothstep(jointFracV, jointFracV + featherV, 1.0 - rowFrac - edgeWobbleV);
      const tileMask = maskU * maskV;

      // Domain-warped multi-scale limestone / travertine relief
      const warpX = fbm2D(lx * 2.1 + seedOffsetX, ly * 2.1 + seedOffsetY, 3, 101);
      const warpY = fbm2D(lx * 2.1 + seedOffsetX + 11.3, ly * 2.1 + seedOffsetY + 6.7, 3, 202);
      const qx = lx + (warpX - 0.5) * 0.36;
      const qy = ly + (warpY - 0.5) * 0.36;

      // 1. Macro mineral clouds & sedimentary stratification
      const macroCloud = fbm2D(qx * 2.6 + seedOffsetX, qy * 2.1 + seedOffsetY, 4, 303);
      const sedStrata = ridgedFbm2D(qx * 4.5 + seedOffsetX + 4.9, qy * 2.2 + seedOffsetY + 8.3, 3, 404);

      // 2. Natural weathered limestone pockets & shallow pitting (clearly visible in raking light)
      const pocketNoise = fbm2D(qx * 11.0 + seedOffsetX + 19.1, qy * 11.0 + seedOffsetY + 3.7, 3, 505);
      const pitRaw = valueNoise2D(qx * 30.0 + seedOffsetX, qy * 30.0 + seedOffsetY, 606);
      const pitMask = smoothstep(0.24, 0.42, pocketNoise) * (1.0 - smoothstep(0.62, 0.78, pitRaw));

      // 3. Crisp stone micro-grain (1.5–4 cm granular sandstone/limestone texture)
      const mediumGrain = fbm2D(lx * 22.0 + seedOffsetX, ly * 22.0 + seedOffsetY, 3, 707);
      const crispGrain = valueNoise2D(lx * 54.0 + seedOffsetX, ly * 54.0 + seedOffsetY, 808);

      // Combined surface height in [0, 1] (0 = recessed pit/depression, 1 = raised stone crest)
      const surfaceHeight = clamp(
        0.52 +
          (macroCloud - 0.5) * 0.36 +
          (sedStrata - 0.5) * 0.24 +
          (mediumGrain - 0.5) * 0.28 +
          (crispGrain - 0.5) * 0.16 -
          pitMask * 0.30,
        0,
        1
      );

      // Tone value with cavity darkening in depressed pockets + bright mineral ridges
      const stoneTone = clamp(
        0.50 +
          (macroCloud - 0.5) * 0.88 +
          (sedStrata - 0.5) * 0.44 +
          (mediumGrain - 0.5) * 0.34 +
          (crispGrain - 0.5) * 0.16 -
          pitMask * 0.28,
        0,
        1
      );

      // Calibrated warm travertine / limestone palette (richer contrast than smooth porcelain)
      let baseR: number;
      let baseG: number;
      let baseB: number;
      if (stoneTone < 0.5) {
        const k = stoneTone * 2.0;
        baseR = lerp(181, 215, k);
        baseG = lerp(169, 204, k);
        baseB = lerp(146, 181, k);
      } else {
        const k = (stoneTone - 0.5) * 2.0;
        baseR = lerp(215, 234, k);
        baseG = lerp(204, 226, k);
        baseB = lerp(181, 206, k);
      }

      // Per-tile tonal variation so adjacent tiles read distinctly
      const tileBrightness = 0.955 + hash2D(col, row, 71) * 0.085;
      const tileWarmth = (hash2D(col, row, 89) - 0.5) * 5.0;

      // Subtle light-catching chiseled edge highlight
      const distEdgeM = Math.min(
        lx,
        GROUND_TILE_WIDTH_M - lx,
        ly,
        GROUND_TILE_LENGTH_M - ly
      );
      const edgeHighlight =
        smoothstep(0.0025, 0.006, distEdgeM) *
        (1.0 - smoothstep(0.006, 0.018, distEdgeM)) *
        0.028;

      const shade = tileBrightness + edgeHighlight;
      const tileR = clamp(baseR * shade + tileWarmth, 0, 255);
      const tileG = clamp(baseG * shade, 0, 255);
      const tileB = clamp(baseB * shade - tileWarmth * 0.7, 0, 255);

      const idx = (py * TEX_SIZE + px) * 4;
      albedoData[idx] = Math.round(lerp(GROUT_R, tileR, tileMask));
      albedoData[idx + 1] = Math.round(lerp(GROUT_G, tileG, tileMask));
      albedoData[idx + 2] = Math.round(lerp(GROUT_B, tileB, tileMask));
      albedoData[idx + 3] = 255;

      // Full-range tactile bump map (deep grout = 20, stone pits = 95..145, crests = 215..255)
      const tileBump = lerp(95, 252, surfaceHeight);
      const groutBump = 20;
      const bumpVal = Math.round(clamp(lerp(groutBump, tileBump, tileMask), 0, 255));
      bumpData[idx] = bumpVal;
      bumpData[idx + 1] = bumpVal;
      bumpData[idx + 2] = bumpVal;
      bumpData[idx + 3] = 255;

      // Roughness map: chalky matte inside recessed stone pockets & grout, subtle satin on high ridges
      const tileRough = lerp(246, 194, surfaceHeight);
      const groutRough = 252;
      const roughVal = Math.round(clamp(lerp(groutRough, tileRough, tileMask), 0, 255));
      roughnessData[idx] = roughVal;
      roughnessData[idx + 1] = roughVal;
      roughnessData[idx + 2] = roughVal;
      roughnessData[idx + 3] = 255;
    }
  }

  cachedTileTextures = {
    map: createDataTexture(albedoData, THREE.SRGBColorSpace),
    bumpMap: createDataTexture(bumpData, THREE.NoColorSpace),
    roughnessMap: createDataTexture(roughnessData, THREE.NoColorSpace),
  };
  return cachedTileTextures;
}

/**
 * Recomputes planar world-space UVs for horizontal floor slabs so 150×75 cm tiles
 * align seamlessly across every room boundary and doorway threshold on the ground floor.
 */
export function applyWorldFloorTileUVs(
  geometry: THREE.BufferGeometry,
  worldOffsetX = 0,
  worldOffsetY = 0,
  worldOffsetZ = 0
): void {
  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  if (!posAttr || !normAttr || !uvAttr) return;

  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i) + worldOffsetX;
    const wy = posAttr.getY(i) + worldOffsetY;
    const wz = posAttr.getZ(i) + worldOffsetZ;

    const nx = Math.abs(normAttr.getX(i));
    const ny = Math.abs(normAttr.getY(i));

    let u: number;
    let v: number;
    if (ny > 0.75) {
      u = (wx - GROUND_TILE_ORIGIN_X) / GROUND_TILE_REPEAT_W_M;
      v = (wz - GROUND_TILE_ORIGIN_Z) / GROUND_TILE_REPEAT_H_M;
    } else if (nx >= 0.5) {
      u = (wz - GROUND_TILE_ORIGIN_Z) / GROUND_TILE_REPEAT_W_M;
      v = wy / GROUND_TILE_REPEAT_H_M;
    } else {
      u = (wx - GROUND_TILE_ORIGIN_X) / GROUND_TILE_REPEAT_W_M;
      v = wy / GROUND_TILE_REPEAT_H_M;
    }

    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
}

/**
 * Scales local BoxGeometry UVs into real-metre tile repeat units (4.50 × 4.50 m)
 * for small local-space threshold strips inside rotated exterior door assemblies.
 */
export function applyScaledLocalTileUVs(
  geometry: THREE.BufferGeometry,
  sizeX: number,
  sizeY: number,
  sizeZ: number
): void {
  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  if (!posAttr || !normAttr || !uvAttr) return;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i) + sizeX * 0.5;
    const y = posAttr.getY(i) + sizeY * 0.5;
    const z = posAttr.getZ(i) + sizeZ * 0.5;
    const ny = Math.abs(normAttr.getY(i));
    const nx = Math.abs(normAttr.getX(i));

    if (ny > 0.75) {
      uvAttr.setXY(i, x / GROUND_TILE_REPEAT_W_M, z / GROUND_TILE_REPEAT_H_M);
    } else if (nx >= 0.5) {
      uvAttr.setXY(i, z / GROUND_TILE_REPEAT_W_M, y / GROUND_TILE_REPEAT_H_M);
    } else {
      uvAttr.setXY(i, x / GROUND_TILE_REPEAT_W_M, y / GROUND_TILE_REPEAT_H_M);
    }
  }
  uvAttr.needsUpdate = true;
}
