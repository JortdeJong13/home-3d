import * as THREE from 'three';

/**
 * Slightly stylized Dutch running-bond brick tile dimensions (metres)
 * tuned for clean, clutter-free legibility at isometric diorama scale:
 * - 10 bricks across × 0.26 m = 2.60 m
 * - 32 courses high × 0.075 m = 2.40 m
 */
export const BRICK_TILE_WIDTH_M = 2.60;
export const BRICK_TILE_HEIGHT_M = 2.40;

const TEX_SIZE = 1024;
const BRICK_COLS = 10;
const BRICK_ROWS = 32;

// Subtle mortar joint thickness as a fraction of each brick cell
const HEAD_JOINT_FRAC = 0.011 / 0.260;
const BED_JOINT_FRAC = 0.011 / 0.075;

interface BrickTone {
  r: number;
  g: number;
  b: number;
  weight: number;
}

/**
 * Soft, harmonious warm sand-ochre / biscuit brick palette with gentle
 * tonal variation — maintains the clean matte diorama art style without
 * harsh high-contrast speckles.
 */
const BRICK_TONES: BrickTone[] = [
  // Soft warm cream-sand (~20%)
  { r: 222, g: 202, b: 165, weight: 10 },
  { r: 217, g: 196, b: 158, weight: 10 },
  // Core warm sand-ochre (~50%)
  { r: 212, g: 188, b: 146, weight: 18 },
  { r: 207, g: 182, b: 139, weight: 16 },
  { r: 214, g: 192, b: 152, weight: 16 },
  // Gentle muted tan / biscuit (~20%)
  { r: 198, g: 173, b: 132, weight: 12 },
  { r: 192, g: 167, b: 127, weight: 8 },
  // Subtle warm taupe-ochre accent (~10%)
  { r: 181, g: 156, b: 118, weight: 10 },
];

const TOTAL_WEIGHT = BRICK_TONES.reduce((sum, t) => sum + t.weight, 0);

// Soft warm buff mortar close in value to the bricks for a gentle, painterly joint
const MORTAR_R = 209;
const MORTAR_G = 197;
const MORTAR_B = 176;

/** Deterministic integer hash in [0, 1) for seamless brick-grid variation. */
function hash2D(ix: number, iy: number, seed = 0): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pickBrickTone(col: number, row: number): BrickTone {
  const h = hash2D(col, row, 17) * TOTAL_WEIGHT;
  let acc = 0;
  for (const tone of BRICK_TONES) {
    acc += tone.weight;
    if (h <= acc) return tone;
  }
  return BRICK_TONES[0];
}

let cachedTextures: { map: THREE.DataTexture; bumpMap: THREE.DataTexture } | null = null;

/**
 * Generates (and caches) a seamless procedural 1024×1024 running-bond brick
 * albedo map + subtle mortar-recess bump map. Uses THREE.DataTexture so it
 * runs identically in both the browser and Node.js verification scripts.
 */
export function getExteriorBrickTextures(): {
  map: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
} {
  if (cachedTextures) return cachedTextures;

  const albedoData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const bumpData = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  // Soft feathered edge width in brick-cell UV space (~2.8 pixels)
  const edgeSmoothU = (2.8 / TEX_SIZE) * BRICK_COLS;
  const edgeSmoothV = (2.8 / TEX_SIZE) * BRICK_ROWS;

  for (let py = 0; py < TEX_SIZE; py++) {
    // Flip Y so row 0 is at the bottom when mapped with standard UVs
    const vNorm = py / TEX_SIZE;
    const rowFloat = vNorm * BRICK_ROWS;
    const row = Math.floor(rowFloat) % BRICK_ROWS;
    const rowFrac = rowFloat - Math.floor(rowFloat);

    // Running bond (halfsteensverband): odd courses offset by 0.5 brick
    const stagger = (row & 1) === 1 ? 0.5 : 0.0;

    // Distance inside brick vertically (0 at mortar, 1 inside brick)
    const vEdgeBot = smoothstep(BED_JOINT_FRAC * 0.5 - edgeSmoothV, BED_JOINT_FRAC * 0.5 + edgeSmoothV, rowFrac);
    const vEdgeTop = smoothstep(1.0 - BED_JOINT_FRAC * 0.5 + edgeSmoothV, 1.0 - BED_JOINT_FRAC * 0.5 - edgeSmoothV, rowFrac);
    const maskV = vEdgeBot * vEdgeTop;

    for (let px = 0; px < TEX_SIZE; px++) {
      const uNorm = px / TEX_SIZE;
      const colFloat = uNorm * BRICK_COLS + stagger;
      const col = ((Math.floor(colFloat) % BRICK_COLS) + BRICK_COLS) % BRICK_COLS;
      const colFrac = colFloat - Math.floor(colFloat);

      const uEdgeLeft = smoothstep(HEAD_JOINT_FRAC * 0.5 - edgeSmoothU, HEAD_JOINT_FRAC * 0.5 + edgeSmoothU, colFrac);
      const uEdgeRight = smoothstep(1.0 - HEAD_JOINT_FRAC * 0.5 + edgeSmoothU, 1.0 - HEAD_JOINT_FRAC * 0.5 - edgeSmoothU, colFrac);
      const maskU = uEdgeLeft * uEdgeRight;

      const brickMask = maskU * maskV;
      const tone = pickBrickTone(col, row);

      // Silky-smooth brick face: gentle per-brick variation & soft pillowed center
      const brickTint = 0.98 + hash2D(col, row, 91) * 0.04;
      const centerShade = 0.985 + 0.025 * Math.sin(colFrac * Math.PI) * Math.sin(rowFrac * Math.PI);

      const shade = brickTint * centerShade;
      const brR = Math.min(255, tone.r * shade);
      const brG = Math.min(255, tone.g * shade);
      const brB = Math.min(255, tone.b * shade);

      const idx = (py * TEX_SIZE + px) * 4;
      albedoData[idx] = Math.round(MORTAR_R + (brR - MORTAR_R) * brickMask);
      albedoData[idx + 1] = Math.round(MORTAR_G + (brG - MORTAR_G) * brickMask);
      albedoData[idx + 2] = Math.round(MORTAR_B + (brB - MORTAR_B) * brickMask);
      albedoData[idx + 3] = 255;

      // Soft, clean bump: gentle rounded mortar recess with zero harsh noise
      const brickBump = 228 + hash2D(col, row, 53) * 8;
      const mortarBump = 155;
      const bumpVal = Math.round(mortarBump + (brickBump - mortarBump) * brickMask);
      bumpData[idx] = bumpVal;
      bumpData[idx + 1] = bumpVal;
      bumpData[idx + 2] = bumpVal;
      bumpData[idx + 3] = 255;
    }
  }

  const map = new THREE.DataTexture(albedoData, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  map.needsUpdate = true;

  const bumpMap = new THREE.DataTexture(bumpData, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.magFilter = THREE.LinearFilter;
  bumpMap.generateMipmaps = true;
  bumpMap.anisotropy = 8;
  bumpMap.needsUpdate = true;

  cachedTextures = { map, bumpMap };
  return cachedTextures;
}

/**
 * Recomputes planar UVs in world-metre brick tile units so brick courses
 * remain horizontally level and seamlessly aligned across all floors, gables,
 * window reveals, and Berging/extension fascia boxes.
 */
export function applyWorldBrickUVs(
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
    const x = posAttr.getX(i) + worldOffsetX;
    const y = posAttr.getY(i) + worldOffsetY;
    const z = posAttr.getZ(i) + worldOffsetZ;

    const nx = Math.abs(normAttr.getX(i));
    const ny = Math.abs(normAttr.getY(i));
    const nz = Math.abs(normAttr.getZ(i));

    let u: number;
    let v: number;
    if (ny > 0.75) {
      // Top / bottom faces (parapet tops, horizontal sills)
      u = x;
      v = z;
    } else if (nz >= nx) {
      // Main wall face (ExtrudeGeometry front/back or Z-facing BoxGeometry face)
      u = x;
      v = y;
    } else {
      // Side / end-cap / vertical reveal faces
      u = z;
      v = y;
    }

    uvAttr.setXY(i, u / BRICK_TILE_WIDTH_M, v / BRICK_TILE_HEIGHT_M);
  }
  uvAttr.needsUpdate = true;
}
