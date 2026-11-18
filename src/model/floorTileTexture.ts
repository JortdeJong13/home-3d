import * as THREE from 'three';

/**
 * Large-format honed limestone / travertine floor tiles (150 × 75 cm)
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

// Hairline rectified joint (~1.6 mm) with tone closely matched to the tile
const JOINT_HALF_M = 0.0008;

// Tone-on-tone warm limestone mortar so seams stay whisper-thin and subtle
const GROUT_R = 198;
const GROUT_G = 188;
const GROUT_B = 169;

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

/** Multi-octave fractional Brownian motion. */
function fbm2D(x: number, y: number, octaves: number, seed: number): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 37);
    norm += amplitude;
    frequency *= 2.05;
    amplitude *= 0.5;
  }

  return value / norm;
}

/** Ridged noise in [0, 1] for tactile limestone surface relief. */
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
  normalMap: THREE.DataTexture;
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
 * Generates (and caches) a seamless procedural 1024×1024 150×75 cm limestone
 * floor tile texture set:
 * - Smooth, soft warm cream-limestone albedo (`map`) with gentle mineral clouding
 * - Rich tactile stone surface relief (`normalMap`) + matte-satin `roughnessMap`
 *   so grazing light catches natural limestone pitting, grain, and bevels without
 *   making the color blotchy.
 * Uses THREE.DataTexture so it runs identically in both the browser and Node.js.
 */
export function getGroundFloorTileTextures(): GroundFloorTileTextureSet {
  if (cachedTileTextures) return cachedTileTextures;

  const albedoData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const normalData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const roughnessData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const heightField = new Float32Array(TEX_SIZE * TEX_SIZE);

  const jointFracU = JOINT_HALF_M / GROUND_TILE_WIDTH_M;
  const jointFracV = JOINT_HALF_M / GROUND_TILE_LENGTH_M;
  const featherU = (0.9 / TEX_SIZE) * GROUND_TILE_COLS;
  const featherV = (0.9 / TEX_SIZE) * GROUND_TILE_ROWS;

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

      // Grout & soft rectified edge mask
      const maskU =
        smoothstep(jointFracU, jointFracU + featherU, colFrac) *
        smoothstep(jointFracU, jointFracU + featherU, 1.0 - colFrac);
      const maskV =
        smoothstep(jointFracV, jointFracV + featherV, rowFrac) *
        smoothstep(jointFracV, jointFracV + featherV, 1.0 - rowFrac);
      const tileMask = maskU * maskV;

      // Tile-local coordinates in metres with unique per-tile noise offset
      const lx = colFrac * GROUND_TILE_WIDTH_M;
      const ly = rowFrac * GROUND_TILE_LENGTH_M;
      const seedOffsetX = hash2D(col, row, 13) * 47.0;
      const seedOffsetY = hash2D(col, row, 29) * 47.0;

      // -----------------------------------------------------------------------
      // 1. SMOOTH, SOFT LIMESTONE COLOR (subtle warm mineral clouding)
      // -----------------------------------------------------------------------
      const warpX = fbm2D(lx * 1.5 + seedOffsetX, ly * 1.5 + seedOffsetY, 3, 101);
      const warpY = fbm2D(lx * 1.5 + seedOffsetX + 11.3, ly * 1.5 + seedOffsetY + 6.7, 3, 202);
      const qx = lx + (warpX - 0.5) * 0.40;
      const qy = ly + (warpY - 0.5) * 0.40;

      const macroCloud = fbm2D(qx * 2.1 + seedOffsetX, qy * 1.8 + seedOffsetY, 4, 303);
      const sedWisp = fbm2D(qx * 4.8 + seedOffsetX + 4.9, qy * 2.0 + seedOffsetY + 8.3, 3, 404);
      const softGrainColor = fbm2D(lx * 18.0 + seedOffsetX, ly * 18.0 + seedOffsetY, 2, 505);

      const colorVal = clamp(
        0.5 + (macroCloud - 0.5) * 0.72 + (sedWisp - 0.5) * 0.30 + (softGrainColor - 0.5) * 0.10,
        0,
        1
      );

      let baseR: number;
      let baseG: number;
      let baseB: number;
      if (colorVal < 0.5) {
        const k = colorVal * 2.0;
        baseR = lerp(201, 218, k);
        baseG = lerp(189, 207, k);
        baseB = lerp(167, 186, k);
      } else {
        const k = (colorVal - 0.5) * 2.0;
        baseR = lerp(218, 231, k);
        baseG = lerp(207, 223, k);
        baseB = lerp(186, 205, k);
      }

      // Gentle per-tile tonal variation
      const tileBrightness = 0.978 + hash2D(col, row, 71) * 0.044;
      const tileWarmth = (hash2D(col, row, 89) - 0.5) * 3.5;

      const tileR = clamp(baseR * tileBrightness + tileWarmth, 0, 255);
      const tileG = clamp(baseG * tileBrightness, 0, 255);
      const tileB = clamp(baseB * tileBrightness - tileWarmth * 0.7, 0, 255);

      const pIdx = py * TEX_SIZE + px;
      const idx = pIdx * 4;
      albedoData[idx] = Math.round(lerp(GROUT_R, tileR, tileMask));
      albedoData[idx + 1] = Math.round(lerp(GROUT_G, tileG, tileMask));
      albedoData[idx + 2] = Math.round(lerp(GROUT_B, tileB, tileMask));
      albedoData[idx + 3] = 255;

      // -----------------------------------------------------------------------
      // 2. TACTILE PHYSICAL STONE RELIEF (drives normalMap & roughnessMap only)
      // -----------------------------------------------------------------------
      const reliefStrata = ridgedFbm2D(qx * 5.2 + seedOffsetX + 4.9, qy * 2.6 + seedOffsetY + 8.3, 3, 601);
      const pocketNoise = fbm2D(qx * 11.5 + seedOffsetX + 19.1, qy * 11.5 + seedOffsetY + 3.7, 3, 613);
      const pitDetail = valueNoise2D(qx * 28.0 + seedOffsetX, qy * 28.0 + seedOffsetY, 631);
      const pitMask = smoothstep(0.25, 0.44, pocketNoise) * (1.0 - smoothstep(0.58, 0.76, pitDetail));
      const mediumRelief = fbm2D(lx * 24.0 + seedOffsetX, ly * 24.0 + seedOffsetY, 3, 707);
      const crispStoneGrain = valueNoise2D(lx * 58.0 + seedOffsetX, ly * 58.0 + seedOffsetY, 809);

      const tileHeight = clamp(
        0.58 +
          (macroCloud - 0.5) * 0.24 +
          (reliefStrata - 0.5) * 0.26 +
          (mediumRelief - 0.5) * 0.30 +
          (crispStoneGrain - 0.5) * 0.20 -
          pitMask * 0.34,
        0.12,
        1.0
      );
      heightField[pIdx] = lerp(tileHeight * 0.72, tileHeight, tileMask);

      // Roughness map: chalky matte inside stone depressions & grout, softer satin on smooth high spots
      const tileRough = lerp(246, 196, tileHeight);
      const groutRough = 242;
      const roughVal = Math.round(clamp(lerp(groutRough, tileRough, tileMask), 0, 255));
      roughnessData[idx] = roughVal;
      roughnessData[idx + 1] = roughVal;
      roughnessData[idx + 2] = roughVal;
      roughnessData[idx + 3] = 255;
    }
  }

  // Convert periodic heightField into a crisp tangent-space normalMap
  const normalStrength = 2.6;
  for (let py = 0; py < TEX_SIZE; py++) {
    const pyUp = (py - 1 + TEX_SIZE) % TEX_SIZE;
    const pyDown = (py + 1) % TEX_SIZE;

    for (let px = 0; px < TEX_SIZE; px++) {
      const pxLeft = (px - 1 + TEX_SIZE) % TEX_SIZE;
      const pxRight = (px + 1) % TEX_SIZE;

      const hL = heightField[py * TEX_SIZE + pxLeft];
      const hR = heightField[py * TEX_SIZE + pxRight];
      const hU = heightField[pyUp * TEX_SIZE + px];
      const hD = heightField[pyDown * TEX_SIZE + px];

      const dx = (hL - hR) * normalStrength;
      const dy = (hU - hD) * normalStrength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (py * TEX_SIZE + px) * 4;
      normalData[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;
    }
  }

  cachedTileTextures = {
    map: createDataTexture(albedoData, THREE.SRGBColorSpace),
    normalMap: createDataTexture(normalData, THREE.NoColorSpace),
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
