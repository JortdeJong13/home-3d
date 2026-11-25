import * as THREE from 'three';

/**
 * Procedural Wall Tile Texture: T21c Motto Lake 450 × 225 mm White Mat (1594238)
 *
 * Per Tekening woonwensen 55.1 / 55.2 & Technische omschrijving §16.2:
 * - Tile dimensions: 22.5 cm wide × 45.0 cm tall (portrait / "staand geplaatst")
 * - Finish: Matte white ceramic ("White Mat") with subtle ceramic micro-variation
 * - Grout: Silver-grey ("zilvergrijs gevoegd"), crisp 2.5 mm straight grid joints
 *
 * Periodic world repeat:
 * - 4 columns × 0.225 m = 0.90 m (U / horizontal)
 * - 2 rows    × 0.450 m = 0.90 m (V / vertical)
 */
export const WALL_TILE_W_M = 0.225;
export const WALL_TILE_H_M = 0.450;
export const WALL_TILE_COLS = 4;
export const WALL_TILE_ROWS = 2;
export const WALL_TILE_REPEAT_U_M = WALL_TILE_W_M * WALL_TILE_COLS; // 0.90 m
export const WALL_TILE_REPEAT_V_M = WALL_TILE_H_M * WALL_TILE_ROWS; // 0.90 m

const TEX_SIZE = 512;
const JOINT_HALF_M = 0.0014; // ~2.8 mm silver-grey grout line so it reads crisply in isometric view

// Soft silver-grey grout ("zilvergrijs gevoegd")
const GROUT_R = 192;
const GROUT_G = 196;
const GROUT_B = 200;

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

export interface WallTileTextureSet {
  map: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
}

let cachedWallTileTextures: WallTileTextureSet | null = null;

function createTileDataTexture(
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
 * Generates seamless procedural Motto Lake 450 × 225 mm matte white wall tile textures.
 * Uses THREE.DataTexture so it runs identically in Node verification and browser.
 */
export function getBathroomWallTileTextures(): WallTileTextureSet {
  if (cachedWallTileTextures) return cachedWallTileTextures;

  const albedo = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const bump = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  for (let py = 0; py < TEX_SIZE; py++) {
    const vM = (py / TEX_SIZE) * WALL_TILE_REPEAT_V_M;
    const row = Math.floor(vM / WALL_TILE_H_M);
    const localV = vM - row * WALL_TILE_H_M;
    const distEdgeV = Math.min(localV, WALL_TILE_H_M - localV);

    for (let px = 0; px < TEX_SIZE; px++) {
      const uM = (px / TEX_SIZE) * WALL_TILE_REPEAT_U_M;
      const col = Math.floor(uM / WALL_TILE_W_M);
      const localU = uM - col * WALL_TILE_W_M;
      const distEdgeU = Math.min(localU, WALL_TILE_W_M - localU);

      const distEdge = Math.min(distEdgeU, distEdgeV);
      // 0 = inside grout joint, 1 = on flat matte ceramic tile face
      const tileMask = smoothstep(JOINT_HALF_M * 0.75, JOINT_HALF_M * 1.45, distEdge);

      // Subtle per-tile warm-white matte variation (±1.2%) + whisper-soft ceramic micro-grain
      const tileTone = 0.988 + hash2D(col, row, 17) * 0.020;
      const micro = (hash2D(px, py, 91) - 0.5) * 2.4;

      // Motto Lake White Mat base (#f5f4f0)
      const faceR = Math.min(255, Math.round(245 * tileTone + micro));
      const faceG = Math.min(255, Math.round(244 * tileTone + micro));
      const faceB = Math.min(255, Math.round(240 * tileTone + micro));

      const r = Math.round(GROUT_R + (faceR - GROUT_R) * tileMask);
      const g = Math.round(GROUT_G + (faceG - GROUT_G) * tileMask);
      const b = Math.round(GROUT_B + (faceB - GROUT_B) * tileMask);

      const bumpVal = Math.round(90 + 165 * tileMask);

      const idx = (py * TEX_SIZE + px) * 4;
      albedo[idx] = r;
      albedo[idx + 1] = g;
      albedo[idx + 2] = b;
      albedo[idx + 3] = 255;

      bump[idx] = bumpVal;
      bump[idx + 1] = bumpVal;
      bump[idx + 2] = bumpVal;
      bump[idx + 3] = 255;
    }
  }

  cachedWallTileTextures = {
    map: createTileDataTexture(albedo, THREE.SRGBColorSpace),
    bumpMap: createTileDataTexture(bump, THREE.NoColorSpace),
  };
  return cachedWallTileTextures;
}

/**
 * Applies exact real-world portrait wall-tile UVs (22.5 cm wide × 45.0 cm tall)
 * to a BoxGeometry based on its world position and face normals so tiles align
 * seamlessly around corners, above doors/windows, and across the toilet cistern.
 */
export function applyWorldWallTileUVs(
  geo: THREE.BufferGeometry,
  centerX: number,
  centerY: number,
  centerZ: number,
  floorBaseY: number
): void {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  if (!pos || !norm || !uv) return;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + centerX;
    const wy = pos.getY(i) + centerY - floorBaseY;
    const wz = pos.getZ(i) + centerZ;
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));

    let uM: number;
    let vM: number;
    if (ny > 0.7) {
      // Horizontal plateau surface (toilet cistern top ledge)
      uM = wz;
      vM = wx;
    } else if (nx > 0.7) {
      // Wall running along Z (left/right bathroom walls & cistern front face)
      uM = wz;
      vM = wy;
    } else {
      // Wall running along X (front/rear bathroom walls & shower divider)
      uM = wx;
      vM = wy;
    }

    uv.setXY(i, uM / WALL_TILE_REPEAT_U_M, vM / WALL_TILE_REPEAT_V_M);
  }
  uv.needsUpdate = true;
}
