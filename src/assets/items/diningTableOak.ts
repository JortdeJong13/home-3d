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
  topBump: THREE.DataTexture;
  topRoughness: THREE.DataTexture;
  legMap: THREE.DataTexture;
  legBump: THREE.DataTexture;
  legRoughness: THREE.DataTexture;
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
 * Generates seamless procedural natural European oak DataTextures for both
 * the laminated-stave tabletop (grain along U / length) and the solid-turned
 * cylindrical legs (vertical cathedral grain along V, zero seam around U).
 * Uses THREE.DataTexture so it runs identically in Node verification and browser.
 */
function getOakWoodTextures(): OakTextureSet {
  if (cachedOakTextures) return cachedOakTextures;

  const topAlbedo = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const topBump = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const topRough = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  const legAlbedo = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const legBump = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const legRough = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  // 1. Tabletop: 6 solid-oak staves running horizontally along U
  const NUM_STAVES = 6;
  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    const staveFloat = v * NUM_STAVES;
    const staveIdx = Math.floor(staveFloat) % NUM_STAVES;
    const staveFrac = staveFloat - Math.floor(staveFloat);

    // Subtle tonal & grain-offset variation per oak stave
    const staveTone = 0.965 + hash2(staveIdx, 3, 19) * 0.075;
    const staveOffsetU = hash2(staveIdx, 11, 29) * 16.0;
    const staveOffsetV = hash2(staveIdx, 17, 41) * 10.0;

    // Hairline glue joint between laminated oak planks
    const seamDist = Math.min(staveFrac, 1.0 - staveFrac);
    const seamMask = smoothstep(0.0, 0.012, seamDist);

    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;

      // Low-frequency warp for organic oak cathedral & wavy fibers (stretched along U)
      const warp1 = periodicNoise2D(u * 4 + staveOffsetU, v * 12 + staveOffsetV, 4, 12, 71);
      const warp2 = periodicNoise2D(u * 10 + staveOffsetU, v * 28 + staveOffsetV, 10, 28, 97);
      const ringCoord =
        (v * 6.5 + staveOffsetV) * 3.8 +
        warp1 * 3.6 +
        warp2 * 0.95 +
        Math.sin((u + staveOffsetU * 0.1) * Math.PI * 2) * 0.45;

      // Asymmetric sawtooth-like wood ring profile (broad light earlywood, crisp latewood line)
      const ringPhase = fract(ringCoord);
      const ringBand = Math.pow(Math.sin(ringPhase * Math.PI), 0.55);
      const latewood = 1.0 - smoothstep(0.10, 0.42, ringBand);

      // Fine longitudinal oak vessels / open pores
      const poreNoise = periodicNoise2D(u * 28 + staveOffsetU, v * 160 + staveOffsetV, 28, 160, 131);
      const poreStreak = smoothstep(0.66, 0.90, poreNoise);

      // Micro fiber shimmer
      const micro = periodicNoise2D(u * 64, v * 256, 64, 256, 173);

      // Natural light-warm European oak palette calibrated to tabletop photo
      // Earlywood (#dab996) -> Midtone (#cca279) -> Latewood (#ab7e53) -> Pores (#91653d)
      let r = lerp(218, 171, latewood);
      let g = lerp(185, 126, latewood);
      let b = lerp(150, 83, latewood);

      r = lerp(r, 145, poreStreak * 0.55);
      g = lerp(g, 101, poreStreak * 0.55);
      b = lerp(b, 61, poreStreak * 0.55);

      const grainShade = (0.97 + micro * 0.06) * staveTone * (0.92 + 0.08 * seamMask);
      r = Math.min(255, Math.max(0, Math.round(r * grainShade)));
      g = Math.min(255, Math.max(0, Math.round(g * grainShade)));
      b = Math.min(255, Math.max(0, Math.round(b * grainShade)));

      const idx = (py * TEX_SIZE + px) * 4;
      topAlbedo[idx] = r;
      topAlbedo[idx + 1] = g;
      topAlbedo[idx + 2] = b;
      topAlbedo[idx + 3] = 255;

      // Bump: smooth surface with recessed oak pores and stave seam
      const bumpVal = Math.round(235 - latewood * 22 - poreStreak * 55 - (1 - seamMask) * 40);
      topBump[idx] = bumpVal;
      topBump[idx + 1] = bumpVal;
      topBump[idx + 2] = bumpVal;
      topBump[idx + 3] = 255;

      // Roughness: satin-matte oiled oak (pores & latewood slightly more matte)
      const roughVal = Math.round(156 + latewood * 26 + poreStreak * 46 + micro * 12);
      topRough[idx] = roughVal;
      topRough[idx + 1] = roughVal;
      topRough[idx + 2] = roughVal;
      topRough[idx + 3] = 255;
    }
  }

  // 2. Cylindrical Legs: seamless 3D solid-wood cathedral grain (vertical along V)
  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;
      const angle = u * Math.PI * 2;
      // Cylindrical cross-section coordinates so radial growth rings create authentic
      // cathedral arches on opposite sides of the turned timber column
      const cx = Math.cos(angle);
      const cz = Math.sin(angle);

      const warpA = noise3D(cx * 1.8 + 4.1, cz * 1.8 + 2.3, v * 2.2, 211);
      const warpB = noise3D(cx * 4.5 + 9.7, cz * 4.5 + 5.1, v * 6.0, 241);

      // Virtual log center slightly offset from cylinder axis to yield realistic cathedral arches
      const lx = cx * 0.85 + 0.28 + warpA * 0.48 + warpB * 0.14;
      const lz = cz * 0.85 + 0.14 + warpA * 0.35;
      const radialDist = Math.hypot(lx, lz);
      const ringCoord = radialDist * 13.5 + v * 0.55;

      const ringPhase = fract(ringCoord);
      const ringBand = Math.pow(Math.sin(ringPhase * Math.PI), 0.52);
      const latewood = 1.0 - smoothstep(0.11, 0.44, ringBand);

      // Vertical oak vessels/pores along V
      const poreNoise = periodicNoise2D(u * 140, v * 22, 140, 22, 283);
      const poreStreak = smoothstep(0.65, 0.90, poreNoise);
      const micro = periodicNoise2D(u * 220, v * 48, 220, 48, 313);

      // Slightly richer warm honey-oak tone matching the turned legs in the photo
      // Earlywood (#cc9d70) -> Latewood (#9b693e) -> Pores (#7f512c)
      let r = lerp(204, 155, latewood);
      let g = lerp(157, 105, latewood);
      let b = lerp(112, 62, latewood);

      r = lerp(r, 127, poreStreak * 0.58);
      g = lerp(g, 81, poreStreak * 0.58);
      b = lerp(b, 44, poreStreak * 0.58);

      const shade = 0.96 + micro * 0.08;
      r = Math.min(255, Math.max(0, Math.round(r * shade)));
      g = Math.min(255, Math.max(0, Math.round(g * shade)));
      b = Math.min(255, Math.max(0, Math.round(b * shade)));

      const idx = (py * TEX_SIZE + px) * 4;
      legAlbedo[idx] = r;
      legAlbedo[idx + 1] = g;
      legAlbedo[idx + 2] = b;
      legAlbedo[idx + 3] = 255;

      const bumpVal = Math.round(234 - latewood * 24 - poreStreak * 56);
      legBump[idx] = bumpVal;
      legBump[idx + 1] = bumpVal;
      legBump[idx + 2] = bumpVal;
      legBump[idx + 3] = 255;

      const roughVal = Math.round(160 + latewood * 28 + poreStreak * 45 + micro * 12);
      legRough[idx] = roughVal;
      legRough[idx + 1] = roughVal;
      legRough[idx + 2] = roughVal;
      legRough[idx + 3] = 255;
    }
  }

  cachedOakTextures = {
    topMap: createTextureFromBytes(topAlbedo, TEX_SIZE, THREE.SRGBColorSpace),
    topBump: createTextureFromBytes(topBump, TEX_SIZE, THREE.NoColorSpace),
    topRoughness: createTextureFromBytes(topRough, TEX_SIZE, THREE.NoColorSpace),
    legMap: createTextureFromBytes(legAlbedo, TEX_SIZE, THREE.SRGBColorSpace),
    legBump: createTextureFromBytes(legBump, TEX_SIZE, THREE.NoColorSpace),
    legRoughness: createTextureFromBytes(legRough, TEX_SIZE, THREE.NoColorSpace),
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
    const { topMap, topBump, topRoughness, legMap, legBump, legRoughness } = getOakWoodTextures();

    const topMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: topMap,
      bumpMap: topBump,
      bumpScale: 0.0018,
      roughnessMap: topRoughness,
      roughness: 0.72,
      metalness: 0.0,
    });

    const legMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: legMap,
      bumpMap: legBump,
      bumpScale: 0.0022,
      roughnessMap: legRoughness,
      roughness: 0.75,
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
      // Left mid leg (Ø14 cm) — left edge at -57.5 cm (52.5 cm from left end)
      { id: 'leg_1_d14_left', diameterM: 0.14, xM: -0.505, zM: -0.010, rotY: 0.4 },
      // Back-left slim leg (Ø10 cm)
      { id: 'leg_2_d10_back_left', diameterM: 0.10, xM: -0.228, zM: -0.245, rotY: 1.7 },
      // Front-left thick leg (Ø18 cm) — front edge at +29.5 cm (23 cm from front edge)
      { id: 'leg_3_d18_front_left', diameterM: 0.18, xM: -0.184, zM: 0.205, rotY: 0.15 },
      // Back-center-right medium leg (Ø14 cm)
      { id: 'leg_4_d14_back_mid', diameterM: 0.14, xM: 0.118, zM: -0.225, rotY: 2.4 },
      // Mid-front slim leg (Ø10 cm)
      { id: 'leg_5_d10_front_right', diameterM: 0.10, xM: 0.228, zM: 0.045, rotY: 3.1 },
      // Back-right thick leg (Ø18 cm) — right edge at +57.5 cm (52.5 cm from right), back edge at -31.5 cm (21 cm from back)
      { id: 'leg_6_d18_back_right', diameterM: 0.18, xM: 0.485, zM: -0.225, rotY: -0.3 },
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
