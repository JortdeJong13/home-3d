import * as THREE from 'three';

/**
 * Real-world Dutch Waalformaat brick tile dimensions (metres):
 * - 12 bricks across × 0.22 m (210 mm brick + 10 mm head joint) = 2.64 m
 * - 40 courses high × 0.06 m (50 mm brick + 10 mm bed joint) = 2.40 m
 */
export const BRICK_TILE_WIDTH_M = 2.64;
export const BRICK_TILE_HEIGHT_M = 2.40;

const TEX_SIZE = 1024;
const BRICK_COLS = 12;
const BRICK_ROWS = 40;

// Mortar joint thickness as a fraction of each brick cell
const HEAD_JOINT_FRAC = 0.010 / 0.220; // ~4.5% of 220 mm pitch
const BED_JOINT_FRAC = 0.010 / 0.060;  // ~16.7% of 60 mm pitch

interface BrickTone {
  r: number;
  g: number;
  b: number;
  weight: number;
}

/**
 * Curated warm yellow-sand / buff / muted tan / toasted umber brick palette
 * matching the reference render (Wonen aan de Hulk) while staying bright and
 * cohesive with the soft architectural diorama aesthetic.
 */
const BRICK_TONES: BrickTone[] = [
  // Light cream-buff (~18%)
  { r: 222, g: 204, b: 168, weight: 9 },
  { r: 214, g: 193, b: 154, weight: 9 },
  // Warm golden-sand & ochre (~44%)
  { r: 206, g: 179, b: 128, weight: 14 },
  { r: 199, g: 169, b: 116, weight: 12 },
  { r: 210, g: 185, b: 138, weight: 10 },
  { r: 191, g: 160, b: 108, weight: 8 },
  // Muted warm tan / biscuit (~24%)
  { r: 178, g: 149, b: 106, weight: 13 },
  { r: 166, g: 138, b: 96, weight: 11 },
  // Darker toasted umber / brown-grey accents (~14%)
  { r: 142, g: 114, b: 80, weight: 8 },
  { r: 126, g: 100, b: 70, weight: 6 },
];

const TOTAL_WEIGHT = BRICK_TONES.reduce((sum, t) => sum + t.weight, 0);

// Warm buff-grey mortar matching the reference facade
const MORTAR_R = 194;
const MORTAR_G = 186;
const MORTAR_B = 172;

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

  // Smooth anti-aliased edge width in brick-cell UV space (~1.4 pixels)
  const edgeSmoothU = (1.4 / TEX_SIZE) * BRICK_COLS;
  const edgeSmoothV = (1.4 / TEX_SIZE) * BRICK_ROWS;

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

      // Gentle per-brick brightness nudge + soft tactile center-to-edge warmth
      const brickTint = 0.96 + hash2D(col, row, 91) * 0.08;
      const centerShade = 0.97 + 0.04 * Math.sin(colFrac * Math.PI) * Math.sin(rowFrac * Math.PI);
      // Very subtle soft grain (keeps clean stylized diorama look)
      const microGrain = 0.985 + hash2D(px >> 1, py >> 1, 33) * 0.03;

      const shade = brickTint * centerShade * microGrain;
      const brR = Math.min(255, tone.r * shade);
      const brG = Math.min(255, tone.g * shade);
      const brB = Math.min(255, tone.b * shade);

      const mortarGrain = 0.98 + hash2D(px >> 1, py >> 1, 77) * 0.04;
      const mrR = MORTAR_R * mortarGrain;
      const mrG = MORTAR_G * mortarGrain;
      const mrB = MORTAR_B * mortarGrain;

      const idx = (py * TEX_SIZE + px) * 4;
      albedoData[idx] = Math.round(mrR + (brR - mrR) * brickMask);
      albedoData[idx + 1] = Math.round(mrG + (brG - mrG) * brickMask);
      albedoData[idx + 2] = Math.round(mrB + (brB - mrB) * brickMask);
      albedoData[idx + 3] = 255;

      // Bump: mortar recessed (~95), brick face raised (~228) with subtle surface relief
      const brickBump = 222 + hash2D(col, row, 53) * 14 + hash2D(px >> 2, py >> 2, 11) * 8;
      const mortarBump = 95;
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
