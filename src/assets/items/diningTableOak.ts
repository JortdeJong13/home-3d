import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

const TEX_SIZE = 512;

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash2(ix: number, iy: number, seed = 0): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function hash3(ix: number, iy: number, iz: number, seed = 0): number {
  let n =
    Math.imul(ix, 374761393) +
    Math.imul(iy, 668265263) +
    Math.imul(iz, 2147483647) +
    Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Tileable 2D value noise on a periodic integer grid (periodPx, periodPy). */
function periodicNoise2D(x: number, y: number, px: number, py: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const x0 = ((ix % px) + px) % px;
  const x1 = (x0 + 1) % px;
  const y0 = ((iy % py) + py) % py;
  const y1 = (y0 + 1) % py;

  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

/** 3D value noise for seamless cylindrical wood grain. */
function noise3D(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash3(ix, iy, iz, seed);
  const n100 = hash3(ix + 1, iy, iz, seed);
  const n010 = hash3(ix, iy + 1, iz, seed);
  const n110 = hash3(ix + 1, iy + 1, iz, seed);
  const n001 = hash3(ix, iy, iz + 1, seed);
  const n101 = hash3(ix + 1, iy, iz + 1, seed);
  const n011 = hash3(ix, iy + 1, iz + 1, seed);
  const n111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  return lerp(
    lerp(lerp(n000, n100, ux), lerp(n010, n110, ux), uy),
    lerp(lerp(n001, n101, ux), lerp(n011, n111, ux), uy),
    uz
  );
}

interface OakTextureSet {
  topMap: THREE.DataTexture;
  legMap: THREE.DataTexture;
}

let cachedOakTextures: OakTextureSet | null = null;

function createTextureFromBytes(
  data: Uint8Array<ArrayBuffer>,
  size: number,
  colorSpace: THREE.ColorSpace
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
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
 * Generates soft, low-contrast procedural oak DataTextures tuned to the clean,
 * powdery matte architectural diorama style of the house (no harsh pores or speckles).
 * Uses THREE.DataTexture so it runs identically in Node verification and browser.
 */
function getOakWoodTextures(): OakTextureSet {
  if (cachedOakTextures) return cachedOakTextures;

  const topAlbedo = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const legAlbedo = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  // 1. Tabletop: gentle warm-oak staves running smoothly along U (no harsh seams or dark pores)
  const NUM_STAVES = 5;
  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    const staveFloat = v * NUM_STAVES;
    const staveIdx = Math.floor(staveFloat) % NUM_STAVES;
    const staveFrac = staveFloat - Math.floor(staveFloat);

    // Very soft plank-to-plank warmth variation (±1%)
    const staveTone = 0.99 + hash2(staveIdx, 3, 19) * 0.02;
    const staveOffsetU = hash2(staveIdx, 11, 29) * 12.0;
    const staveOffsetV = hash2(staveIdx, 17, 41) * 8.0;

    // Barely perceptible soft transition between staves
    const seamDist = Math.min(staveFrac, 1.0 - staveFrac);
    const seamMask = smoothstep(0.0, 0.025, seamDist);

    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;

      // Smooth low-frequency flowing oak grain ribbons
      const warp1 = periodicNoise2D(u * 3 + staveOffsetU, v * 8 + staveOffsetV, 3, 8, 71);
      const warp2 = periodicNoise2D(u * 6 + staveOffsetU, v * 16 + staveOffsetV, 6, 16, 97);
      const ringCoord =
        (v * 4.5 + staveOffsetV) * 2.6 +
        warp1 * 2.4 +
        warp2 * 0.55 +
        Math.sin((u + staveOffsetU * 0.1) * Math.PI * 2) * 0.3;

      const ringPhase = fract(ringCoord);
      const ringBand = Math.sin(ringPhase * Math.PI);
      const latewood = 1.0 - smoothstep(0.15, 0.72, ringBand);

      // Soft warm diorama oak palette with very close light/dark shades (#ddc0a0 -> #d5b592)
      const shade = staveTone * (0.994 + 0.006 * seamMask);
      const r = Math.min(255, Math.round(lerp(221, 213, latewood) * shade));
      const g = Math.min(255, Math.round(lerp(192, 181, latewood) * shade));
      const b = Math.min(255, Math.round(lerp(160, 146, latewood) * shade));

      const idx = (py * TEX_SIZE + px) * 4;
      topAlbedo[idx] = r;
      topAlbedo[idx + 1] = g;
      topAlbedo[idx + 2] = b;
      topAlbedo[idx + 3] = 255;
    }
  }

  // 2. Cylindrical Legs: silky low-contrast vertical cathedral grain (seamless around U)
  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;
      const angle = u * Math.PI * 2;
      const cx = Math.cos(angle);
      const cz = Math.sin(angle);

      const warpA = noise3D(cx * 1.4 + 4.1, cz * 1.4 + 2.3, v * 1.6, 211);
      const warpB = noise3D(cx * 3.0 + 9.7, cz * 3.0 + 5.1, v * 3.8, 241);

      const lx = cx * 0.8 + 0.25 + warpA * 0.38 + warpB * 0.10;
      const lz = cz * 0.8 + 0.12 + warpA * 0.28;
      const radialDist = Math.hypot(lx, lz);
      const ringCoord = radialDist * 9.5 + v * 0.4;

      const ringPhase = fract(ringCoord);
      const ringBand = Math.sin(ringPhase * Math.PI);
      const latewood = 1.0 - smoothstep(0.16, 0.72, ringBand);

      // Soft warm oak leg palette close in tone to tabletop (#d2ae87 -> #caa47c)
      const r = Math.round(lerp(210, 202, latewood));
      const g = Math.round(lerp(174, 164, latewood));
      const b = Math.round(lerp(135, 124, latewood));

      const idx = (py * TEX_SIZE + px) * 4;
      legAlbedo[idx] = r;
      legAlbedo[idx + 1] = g;
      legAlbedo[idx + 2] = b;
      legAlbedo[idx + 3] = 255;
    }
  }

  cachedOakTextures = {
    topMap: createTextureFromBytes(topAlbedo, TEX_SIZE, THREE.SRGBColorSpace),
    legMap: createTextureFromBytes(legAlbedo, TEX_SIZE, THREE.SRGBColorSpace),
  };
  return cachedOakTextures;
}

/**
 * Builds the 40 mm pill/stadium-shaped tabletop with soft rounded bullnose edges
 * whose exact outer bounding box spans [-width/2, +width/2] × [yMin, yMin+thickness] × [-depth/2, +depth/2].
 */
function createStadiumTabletopGeometry(
  width: number,
  depth: number,
  thickness: number,
  yBottom: number
): THREE.BufferGeometry {
  const bevel = Math.min(0.011, thickness * 0.28);
  const coreThick = Math.max(0.004, thickness - 2 * bevel);

  const rOuter = depth / 2;
  const rInner = Math.max(0.02, rOuter - bevel);
  const straightHalf = Math.max(0, (width - depth) / 2);

  // Draw stadium in XY (after rotateX(-PI/2), +X remains +X and +Y becomes -Z)
  const shape = new THREE.Shape();
  shape.moveTo(-straightHalf, -rInner);
  shape.lineTo(straightHalf, -rInner);
  shape.absarc(straightHalf, 0, rInner, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-straightHalf, rInner);
  shape.absarc(-straightHalf, 0, rInner, Math.PI / 2, (3 * Math.PI) / 2, false);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreThick,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 36,
  });

  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;

  // Normalize position so XZ is centered on (0,0) and Y spans [yBottom, yBottom + thickness]
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  geo.translate(-cx, yBottom - bb.min.y, -cz);

  // Recompute exact scale in case curve tessellation deviates by sub-millimetre
  geo.computeBoundingBox();
  const bb2 = geo.boundingBox!;
  const actualW = bb2.max.x - bb2.min.x;
  const actualH = bb2.max.y - bb2.min.y;
  const actualD = bb2.max.z - bb2.min.z;
  const sx = actualW > 0 ? width / actualW : 1;
  const sy = actualH > 0 ? thickness / actualH : 1;
  const sz = actualD > 0 ? depth / actualD : 1;
  if (Math.abs(sx - 1) > 1e-5 || Math.abs(sy - 1) > 1e-5 || Math.abs(sz - 1) > 1e-5) {
    geo.translate(0, -yBottom, 0);
    geo.scale(sx, sy, sz);
    geo.translate(0, yBottom, 0);
  }

  // Remap UVs so wood grain runs seamlessly lengthwise along X across top, underside, and bullnose edge
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const uvAttr = geo.getAttribute('uv');
  const yMid = yBottom + thickness / 2;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = Math.abs(normAttr.getY(i));
    const u = (x + width / 2) / width;
    // On curved vertical sides, blend vertical elevation into V so grain wraps cleanly over the bullnose
    const v = (z + depth / 2) / depth + (1 - ny) * ((y - yMid) / thickness) * 0.08;
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a turned cylindrical oak leg with a softly rounded bottom foot chamfer
 * resting flush at Y = 0 and tucking 4 mm into the tabletop underside.
 */
function createTurnedLegGeometry(diameter: number, legHeight: number): THREE.BufferGeometry {
  const radius = diameter / 2;
  const footBevel = Math.min(0.009, radius * 0.22);
  const tuckIntoTop = 0.004;
  const totalH = legHeight + tuckIntoTop;

  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius - footBevel, 0),
  ];

  // Smooth quarter-round foot edge from (r - bevel, 0) to (r, bevel)
  const bevelSteps = 5;
  for (let s = 1; s <= bevelSteps; s++) {
    const a = (s / bevelSteps) * (Math.PI / 2);
    const pr = radius - footBevel + Math.sin(a) * footBevel;
    const py = footBevel - Math.cos(a) * footBevel;
    pts.push(new THREE.Vector2(pr, py));
  }

  pts.push(new THREE.Vector2(radius, totalH));
  pts.push(new THREE.Vector2(0, totalH));

  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

interface TableLegSpec {
  id: string;
  diameterM: number;
  xM: number;
  zM: number;
  rotY: number;
}

/**
 * Sculptural Oval/Stadium Solid Oak Dining Table with 6 Clustered Cylindrical Legs
 *
 * Exact dimensions from reference diagram:
 * - Overall: 220 cm (W) × 105 cm (D) × 77 cm (H)
 * - Tabletop: 40 mm (4 cm) thick stadium profile (52.5 cm + 115 cm + 52.5 cm)
 * - Under-table clearance: 73 cm
 * - 6 cylindrical legs (2 × Ø18 cm, 2 × Ø14 cm, 2 × Ø10 cm)
 *   spanning 115 cm in X (52.5 cm overhangs) × 61 cm in Z (21 cm back / 23 cm front overhangs)
 */
export const diningTableOakPrefab: AssetPrefabDefinition = {
  prefabId: 'dining_table_oak',
  defaultLabel: 'Eiken Eettafel (220 × 105 cm)',
  defaultDimensions: {
    width: cm(220, 'user_supplied', 'Reference photo overall length 220 cm'),
    depth: cm(105, 'user_supplied', 'Reference photo overall width 105 cm'),
    height: cm(77, 'user_supplied', 'Reference photo overall height 77 cm (73 cm clearance + 40 mm top)'),
  },
  build3D: ({ width, depth, height }) => {
    const group = new THREE.Group();
    const { topMap, legMap } = getOakWoodTextures();

    const topMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: topMap,
      roughness: 0.86,
      metalness: 0.0,
    });

    const legMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: legMap,
      roughness: 0.87,
      metalness: 0.0,
    });

    const topThickness = 0.04; // 40 mm
    const legClearanceH = Math.max(0.10, height - topThickness); // 73 cm at canonical 77 cm height

    // 1. 40 mm Stadium Tabletop (Y: 0.73..0.77 m)
    const topGeo = createStadiumTabletopGeometry(width, depth, topThickness, legClearanceH);
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.name = 'tabletop_oak_40mm';
    group.add(topMesh);

    // 2. Six Clustered Cylindrical Legs (scaled proportionally if width/depth overridden)
    const sx = width / 2.20;
    const sz = depth / 1.05;
    const legSpecs: TableLegSpec[] = [
      // Evenly spread 6-leg sculptural cluster (3 on -Z, 3 on +Z; 3 on -X, 3 on +X)
      // Envelope: X in [-0.575, +0.575] (115 cm, 52.5 cm overhangs), Z in [-0.315, +0.295] (61 cm, 21/23 cm overhangs)
      { id: 'leg_1_d14_left', diameterM: 0.14, xM: -0.505, zM: 0.080, rotY: 0.4 },
      { id: 'leg_2_d10_back_left', diameterM: 0.10, xM: -0.280, zM: -0.230, rotY: 1.7 },
      { id: 'leg_3_d18_front_left', diameterM: 0.18, xM: -0.140, zM: 0.205, rotY: 0.15 },
      { id: 'leg_4_d14_back_mid', diameterM: 0.14, xM: 0.110, zM: -0.245, rotY: 2.4 },
      { id: 'leg_5_d10_front_right', diameterM: 0.10, xM: 0.320, zM: 0.215, rotY: 3.1 },
      { id: 'leg_6_d18_back_right', diameterM: 0.18, xM: 0.485, zM: -0.090, rotY: -0.3 },
    ];

    const geoCache = new Map<number, THREE.BufferGeometry>();
    for (const spec of legSpecs) {
      let legGeo = geoCache.get(spec.diameterM);
      if (!legGeo) {
        legGeo = createTurnedLegGeometry(spec.diameterM, legClearanceH);
        geoCache.set(spec.diameterM, legGeo);
      }
      const legMesh = new THREE.Mesh(legGeo, legMat);
      legMesh.name = spec.id;
      legMesh.position.set(spec.xM * sx, 0, spec.zM * sz);
      legMesh.rotation.y = spec.rotY;
      group.add(legMesh);
    }

    return group;
  },
};
