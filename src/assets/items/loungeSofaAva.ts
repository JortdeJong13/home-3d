import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

const TEX_SIZE = 256;

function hash2(ix: number, iy: number, seed = 0): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

let cachedBoucleTex: THREE.DataTexture | null = null;

/**
 * Generates a subtle, powdery matte fine-woven naturel beige melange fabric DataTexture
 * matching Goossens "stof gemeleerd fijn geweven naturel" (warm off-white / light oatmeal)
 * in the soft architectural diorama style.
 */
function getAvaFabricTexture(): THREE.DataTexture {
  if (cachedBoucleTex) return cachedBoucleTex;

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      const warp = Math.sin((px / TEX_SIZE) * Math.PI * 2 * 64) * 0.5 + 0.5;
      const weft = Math.sin((py / TEX_SIZE) * Math.PI * 2 * 64) * 0.5 + 0.5;
      const weave = ((px + py) & 1) === 0 ? warp : weft;

      const coarse = hash2(px >> 1, py >> 1, 17);
      const fine = hash2(px, py, 53);
      const mix = coarse * 0.50 + fine * 0.30 + weave * 0.20;

      // Soft off-white / light naturel beige (#ece8e0 .. #ded8cc)
      const r = Math.round(lerp(222, 238, mix));
      const g = Math.round(lerp(216, 234, mix));
      const b = Math.round(lerp(205, 226, mix));

      const idx = (py * TEX_SIZE + px) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  cachedBoucleTex = tex;
  return tex;
}

/**
 * Tri-planar-like world-scale UVs so fine-woven fabric tiles uniformly across curved meshes.
 */
function applyBoxScaleUVs(geo: THREE.BufferGeometry, tileScale = 1.8): void {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    if (ny >= nx && ny >= nz) {
      uvs[i * 2] = x * tileScale;
      uvs[i * 2 + 1] = z * tileScale;
    } else if (nx >= nz) {
      uvs[i * 2] = z * tileScale;
      uvs[i * 2 + 1] = y * tileScale;
    } else {
      uvs[i * 2] = x * tileScale;
      uvs[i * 2 + 1] = y * tileScale;
    }
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/**
 * Builds a single monolithic, tautly upholstered organic seat-deck volume from a closed 2D outline
 * in (X, Z) coordinates (ordered counter-clockwise when viewed from +Y, i.e. standard top-down).
 *
 * Vertical profile:
 * - Soft bottom tuck from yBottom up 5.5 cm (insets inward underneath)
 * - Smooth, taut slightly-convex upholstered vertical flank
 * - Generous 9.5 cm rounded top shoulder rolling seamlessly into a subtly crowned top surface
 *
 * Produces ONE clean seamless upholstered body (no double-slab step).
 */
function createMonolithicSeatDeckGeometry(
  controlPointsXZ: Array<[number, number]>,
  yBottom: number,
  yTop: number,
  samples = 84
): THREE.BufferGeometry {
  const curve3 = new THREE.CatmullRomCurve3(
    controlPointsXZ.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.5
  );

  // Sample closed perimeter evenly
  const ringPts: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  const rawPts = curve3.getSpacedPoints(samples);
  rawPts.pop(); // remove duplicate closing point
  const N = rawPts.length;

  // Compute signed area in (X, Z) to determine outward normal sign
  let area2 = 0;
  for (let i = 0; i < N; i++) {
    const a = rawPts[i];
    const b = rawPts[(i + 1) % N];
    area2 += a.x * b.z - b.x * a.z;
  }
  const normalSign = area2 >= 0 ? 1 : -1;

  // Centroid for radial dome cap
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < N; i++) {
    cx += rawPts[i].x;
    cz += rawPts[i].z;
  }
  cx /= N;
  cz /= N;

  for (let i = 0; i < N; i++) {
    const prev = rawPts[(i - 1 + N) % N];
    const curr = rawPts[i];
    const next = rawPts[(i + 1) % N];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    // Outward normal in XZ
    let nx = (tz / tlen) * normalSign;
    let nz = (-tx / tlen) * normalSign;
    // Verify outward direction against centroid (dot should generally be positive for star-shaped hull)
    const testDot = nx * (curr.x - cx) + nz * (curr.z - cz);
    if (i === 0 && testDot < 0) {
      // Flip all if winding was opposite
    }
    ringPts.push({ x: curr.x, z: curr.z, nx, nz });
  }

  // Ensure outward normals consistently point away from centroid on average
  let avgOut = 0;
  for (const p of ringPts) {
    avgOut += p.nx * (p.x - cx) + p.nz * (p.z - cz);
  }
  if (avgOut < 0) {
    for (const p of ringPts) {
      p.nx = -p.nx;
      p.nz = -p.nz;
    }
  }

  const totalH = yTop - yBottom;
  const crownH = 0.014; // Subtle 1.4 cm plush crown across the seat top
  const shoulderY = yTop - crownH;

  // Profile stations: [y, insetFromOuterPerimeter, blendToCenter]
  // Carefully sculpted to match Goossens Ava's taut lower skirt + generous rounded top roll
  const profileStations: Array<[number, number, number]> = [
    // Bottom tuck (hidden underneath base)
    [yBottom, 0.065, 0.0],
    [yBottom + 0.012, 0.036, 0.0],
    [yBottom + 0.032, 0.015, 0.0],
    [yBottom + 0.058, 0.004, 0.0],
    // Smooth taut upholstered flank with very gentle plush belly
    [yBottom + totalH * 0.30, -0.003, 0.0],
    [yBottom + totalH * 0.55, -0.004, 0.0],
    [yBottom + totalH * 0.72, 0.001, 0.0],
    // Generous rounded top shoulder (quarter-round roll)
    [yBottom + totalH * 0.80, 0.012, 0.0],
    [yBottom + totalH * 0.865, 0.030, 0.0],
    [yBottom + totalH * 0.915, 0.055, 0.0],
    [yBottom + totalH * 0.950, 0.088, 0.0],
    [shoulderY, 0.125, 0.0],
    // Smooth crowned seat deck transitioning to center
    [shoulderY + crownH * 0.55, 0.125, 0.32],
    [shoulderY + crownH * 0.88, 0.125, 0.66],
  ];

  const positions: number[] = [];
  const indices: number[] = [];

  for (const [py, inset, centerBlend] of profileStations) {
    for (let i = 0; i < N; i++) {
      const p = ringPts[i];
      const ox = p.x - p.nx * inset;
      const oz = p.z - p.nz * inset;
      const vx = lerp(ox, cx, centerBlend);
      const vz = lerp(oz, cz, centerBlend);
      positions.push(vx, py, vz);
    }
  }

  const numRings = profileStations.length;
  // Stitch rings — determine winding so faces point outward
  for (let r = 0; r < numRings - 1; r++) {
    const baseA = r * N;
    const baseB = (r + 1) * N;
    for (let i = 0; i < N; i++) {
      const iNext = (i + 1) % N;
      const a0 = baseA + i;
      const a1 = baseA + iNext;
      const b0 = baseB + i;
      const b1 = baseB + iNext;
      indices.push(a0, a1, b0);
      indices.push(a1, b1, b0);
    }
  }

  // Bottom center cap
  const botCenterIdx = positions.length / 3;
  positions.push(cx, yBottom, cz);
  for (let i = 0; i < N; i++) {
    const iNext = (i + 1) % N;
    indices.push(botCenterIdx, iNext, i);
  }

  // Top center cap
  const topCenterIdx = positions.length / 3;
  positions.push(cx, yTop, cz);
  const lastRingBase = (numRings - 1) * N;
  for (let i = 0; i < N; i++) {
    const iNext = (i + 1) % N;
    indices.push(topCenterIdx, lastRingBase + i, lastRingBase + iNext);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  // Verify outward triangle winding using signed volume; flip if negative
  const posAttr = geo.getAttribute('position');
  let signedVol = 0;
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cross = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    vA.fromBufferAttribute(posAttr, indices[i]);
    vB.fromBufferAttribute(posAttr, indices[i + 1]);
    vC.fromBufferAttribute(posAttr, indices[i + 2]);
    cross.crossVectors(vB, vC);
    signedVol += vA.dot(cross);
  }
  if (signedVol < 0) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
    geo.setIndex(indices);
  }

  applyBoxScaleUVs(geo, 1.8);
  return geo;
}

/**
 * Builds an architectural crescent backrest & armrest shell along a 2D centerline curve in (X, Z).
 *
 * Key visual fidelity vs generic tubes:
 * - Taut, nearly-vertical outer & inner upholstered faces (matching the clean rear view of Ava)
 * - Soft 4.5 cm bottom tuck and generous 10 cm rounded top crest
 * - Armrest front ends curve smoothly downward in height and terminate in a full-height
 *   rounded front cheek (NOT a pinched bullet point!), hugging the seat deck flush.
 */
function createCrescentShellGeometry(
  centerlineXZ: Array<[number, number]>,
  options: {
    yBottom: number;
    heightFn: (t: number) => number;
    halfThickFn: (t: number) => number;
    roundFrontStart: boolean;
    roundFrontEnd: boolean;
    lengthSegs?: number;
    profileSegs?: number;
  }
): THREE.BufferGeometry {
  const {
    yBottom,
    heightFn,
    halfThickFn,
    roundFrontStart,
    roundFrontEnd,
    lengthSegs = 48,
    profileSegs = 28,
  } = options;

  const curve = new THREE.CatmullRomCurve3(
    centerlineXZ.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    'centripetal',
    0.5
  );

  // Taut architectural upholstered wall cross-section (flat sides, soft bottom tuck, plush rounded crest)
  const sampleProfile = (angle: number, halfT: number, h: number): [number, number] => {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    // Use a tighter exponent (0.42) on the lower/mid walls for taut vertical sides,
    // and a rounder exponent (0.78) on the upper crest for the plush rolled top!
    const exp = sa > 0 ? lerp(0.42, 0.80, sa) : lerp(0.42, 0.62, -sa);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), exp);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), exp);

    // Slight gentle inward taper at very bottom (4%) so the shell tucks gracefully above the floor
    const bottomTuck = sa < -0.55 ? 1.0 - 0.14 * ((-sa - 0.55) / 0.45) : 1.0;
    const out = sx * halfT * bottomTuck;
    const y = yBottom + (sy * 0.5 + 0.5) * h;
    return [out, y];
  };

  interface RingStation {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    halfT: number;
    h: number;
    yOff: number;
  }

  const rings: RingStation[] = [];

  const makeStation = (t: number, shiftTan: number, thickScale: number, heightScale: number, yLift = 0) => {
    const clampedT = Math.max(0, Math.min(1, t));
    const p = curve.getPointAt(clampedT);
    const tan = curve.getTangentAt(clampedT).normalize();
    const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const pos = p.clone().addScaledVector(tan, shiftTan);
    rings.push({
      center: pos,
      normal: norm,
      halfT: halfThickFn(clampedT) * thickScale,
      h: heightFn(clampedT) * heightScale,
      yOff: yLift,
    });
  };

  // Start cap: either a full-height rounded armrest front cheek or a crisp module seam
  if (roundFrontStart) {
    const ht0 = halfThickFn(0);
    const h0 = heightFn(0);
    makeStation(0, -ht0 * 0.72, 0.16, 0.74, h0 * 0.08);
    makeStation(0, -ht0 * 0.58, 0.54, 0.88, h0 * 0.03);
    makeStation(0, -ht0 * 0.34, 0.82, 0.96, h0 * 0.01);
    makeStation(0, -ht0 * 0.12, 0.95, 0.99, 0);
  } else {
    makeStation(0, -0.014, 0.88, 0.985, 0.004);
    makeStation(0, -0.005, 0.97, 0.996, 0.001);
  }

  for (let i = 0; i <= lengthSegs; i++) {
    makeStation(i / lengthSegs, 0, 1.0, 1.0, 0);
  }

  // End cap: either a full-height rounded armrest front cheek or a crisp module seam
  if (roundFrontEnd) {
    const ht1 = halfThickFn(1);
    const h1 = heightFn(1);
    makeStation(1, ht1 * 0.12, 0.95, 0.99, 0);
    makeStation(1, ht1 * 0.34, 0.82, 0.96, h1 * 0.01);
    makeStation(1, ht1 * 0.58, 0.54, 0.88, h1 * 0.03);
    makeStation(1, ht1 * 0.72, 0.16, 0.74, h1 * 0.08);
  } else {
    makeStation(1, 0.005, 0.97, 0.996, 0.001);
    makeStation(1, 0.014, 0.88, 0.985, 0.004);
  }

  const positions: number[] = [];
  const indices: number[] = [];

  for (const r of rings) {
    for (let s = 0; s < profileSegs; s++) {
      const angle = (s / profileSegs) * Math.PI * 2;
      const [out, rawY] = sampleProfile(angle, r.halfT, r.h);
      const vx = r.center.x + r.normal.x * out;
      const vz = r.center.z + r.normal.z * out;
      positions.push(vx, rawY + r.yOff, vz);
    }
  }

  for (let r = 0; r < rings.length - 1; r++) {
    const baseA = r * profileSegs;
    const baseB = (r + 1) * profileSegs;
    for (let s = 0; s < profileSegs; s++) {
      const sNext = (s + 1) % profileSegs;
      indices.push(baseA + s, baseB + s, baseA + sNext);
      indices.push(baseA + sNext, baseB + s, baseB + sNext);
    }
  }

  // Start & end cap centers
  const first = rings[0];
  const startIdx = positions.length / 3;
  positions.push(first.center.x, yBottom + first.yOff + first.h * 0.5, first.center.z);
  for (let s = 0; s < profileSegs; s++) {
    indices.push(startIdx, (s + 1) % profileSegs, s);
  }

  const last = rings[rings.length - 1];
  const lastBase = (rings.length - 1) * profileSegs;
  const endIdx = positions.length / 3;
  positions.push(last.center.x, yBottom + last.yOff + last.h * 0.5, last.center.z);
  for (let s = 0; s < profileSegs; s++) {
    indices.push(endIdx, lastBase + s, lastBase + ((s + 1) % profileSegs));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  applyBoxScaleUVs(geo, 1.8);
  return geo;
}

/**
 * Tailored rectangular sofa cushion / throw pillow with crisp soft corners and natural feather-fill loft.
 */
function createTailoredPillowGeometry(
  w: number,
  h: number,
  t: number,
  topTaper = 0.96,
  edgeSoftness = 0.22
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, t, 14, 12, 6);
  const pos = geo.getAttribute('position');

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = x / (w / 2); // [-1, 1]
    const ny = y / (h / 2); // [-1, 1]

    // Very subtle upward taper for realistic upright back cushions
    x *= lerp(1.0, topTaper, (ny + 1) * 0.5);

    // Full rectangular body that softens gently at the outer perimeter seam (keeps crisp corners!)
    const fx = Math.pow(Math.max(0, Math.cos(nx * Math.PI * 0.5)), 0.38);
    const fy = Math.pow(Math.max(0, Math.cos(ny * Math.PI * 0.5)), 0.38);
    const loft = fx * fy;

    const thickScale = (1 - edgeSoftness) * 0.26 + loft * (0.86 + edgeSoftness * 0.40);
    z *= thickScale;

    // Gentle vertical crown across the top edge
    y *= 0.97 + 0.03 * Math.cos(nx * Math.PI * 0.5);

    pos.setXYZ(i, x, y, z);
  }

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.scale(
    w / (bb.max.x - bb.min.x),
    h / (bb.max.y - bb.min.y),
    t / (bb.max.z - bb.min.z)
  );

  applyBoxScaleUVs(geo, 2.0);
  return geo;
}

/**
 * Goossens Loungebank Ava — Chaise longue + 3-zits (Hoekrichting Rechts, Beige / Naturel Stof)
 * Product ref: https://www.goossenswonen.nl/p/300885077/loungebank-ava-beige-stof/
 *
 * Verified dimensions (Goossens Afmetingen):
 * - Total Width: 334 cm (X: -1.67..+1.67 m)
 * - Total Depth: 175 cm (Z: -0.875..+0.875 m; chaise longue on +X side = Hoekrichting Rechts)
 * - Total Height: 83 cm (Y: 0.00..0.83 m; curved shell ~67 cm, 3 loose back cushions to 83 cm)
 * - Seat Height: 44 cm (3.2 cm recessed matte black glide feet + monolithic upholstered seat deck)
 * - Seat Depth: 58 cm (3-seater clear seat depth in front of back cushions)
 *
 * Local orientation convention (rotationDeg = 0):
 * - Front of sofa faces +Z (viewer standing at +Z looking at -Z sees chaise longue on the RIGHT, +X).
 */
export const loungeSofaAvaPrefab: AssetPrefabDefinition = {
  prefabId: 'lounge_sofa_ava',
  defaultLabel: 'Loungebank Ava Rechts (334 × 175 cm)',
  defaultDimensions: {
    width: cm(334, 'user_supplied', 'Goossens Loungebank Ava 300885077: totale breedte 334 cm'),
    depth: cm(175, 'user_supplied', 'Goossens Loungebank Ava 300885077: totale diepte chaise longue 175 cm'),
    height: cm(83, 'user_supplied', 'Goossens Loungebank Ava 300885077: totale hoogte 83 cm (zithoogte 44 cm, zitdiepte 58 cm)'),
  },
  build3D: ({ width, depth, height }) => {
    const root = new THREE.Group();
    const content = new THREE.Group();
    root.add(content);

    const fabricTex = getAvaFabricTexture();

    // Fine-woven naturel beige upholstery (reads warm off-white in daylight, matching studio photos)
    const fabricMat = new THREE.MeshStandardMaterial({
      color: '#f5f2eb',
      map: fabricTex,
      roughness: 0.94,
      metalness: 0.0,
    });

    // Subtle 1.5% tonal shift on loose cushions for soft visual separation in isometric lighting
    const cushionMat = new THREE.MeshStandardMaterial({
      color: '#f1ede5',
      map: fabricTex,
      roughness: 0.95,
      metalness: 0.0,
    });

    // Low matte-black cylindrical glides tucked beneath corners
    const footMat = new THREE.MeshStandardMaterial({
      color: '#232325',
      roughness: 0.78,
      metalness: 0.05,
    });

    const W = 3.34;
    const D = 1.75;
    const H = 0.83;
    const footH = 0.032; // 3.2 cm recessed glides
    const seatH = 0.44;  // Verified zithoogte 44 cm

    // Module split X between 3-seater (left) and chaise longue (right): ~61% across width
    const splitX = 0.36;

    // -------------------------------------------------------------------------
    // 1. TWO MONOLITHIC ORGANIC SEAT DECKS (Smooth S-Curve 3-Zits + Wide Rounded Chaise)
    // -------------------------------------------------------------------------
    // Left 3-seater footprint:
    // - Left end bows forward (Z ≈ +0.26 m) around X = -1.10..-0.65 m
    // - Sweeps gracefully INWARD / CONCAVELY to Z ≈ -0.05 m at the module junction (X = +0.355 m)
    const leftSeatOutline: Array<[number, number]> = [
      [-1.46, -0.44],
      [-1.24, -0.64],
      [-0.76, -0.73],
      [-0.18, -0.75],
      [splitX - 0.008, -0.73],
      [splitX - 0.008, -0.05], // Deep inner cove meeting the chaise longue!
      [0.08, -0.01],
      [-0.24, 0.09],
      [-0.62, 0.21],
      [-1.00, 0.27],
      [-1.30, 0.23],
      [-1.47, 0.06],
      [-1.49, -0.18],
    ];

    const leftSeatGeo = createMonolithicSeatDeckGeometry(leftSeatOutline, footH, seatH, 84);
    const leftSeatMesh = new THREE.Mesh(leftSeatGeo, fabricMat);
    leftSeatMesh.name = 'ava_seat_3zits';
    content.add(leftSeatMesh);

    // Right Chaise Longue footprint (Hoekrichting Rechts):
    // - Inner flank runs cleanly forward from the deep cove (X = +0.365 m, Z: -0.05..+0.46 m)
    // - Expands into a wide, lush, semi-circular/oval bulbous nose reaching Z = +0.875 m
    // - Outer flank hugs inside the curved right armrest
    const rightChaiseOutline: Array<[number, number]> = [
      [splitX + 0.008, -0.73],
      [0.80, -0.70],
      [1.20, -0.58],
      [1.45, -0.34],
      [1.51, -0.02],
      [1.53, 0.34],
      [1.48, 0.60],
      [1.32, 0.78],
      [1.06, 0.875], // Full rounded chaise nose apex
      [0.76, 0.865],
      [0.52, 0.74],
      [0.385, 0.50],
      [splitX + 0.008, 0.16],
      [splitX + 0.008, -0.05],
    ];

    const rightChaiseGeo = createMonolithicSeatDeckGeometry(rightChaiseOutline, footH, seatH, 88);
    const rightChaiseMesh = new THREE.Mesh(rightChaiseGeo, fabricMat);
    rightChaiseMesh.name = 'ava_seat_chaise';
    content.add(rightChaiseMesh);

    // -------------------------------------------------------------------------
    // 2. CRESCENT WRAP-AROUND BACKREST & ARMREST SHELLS (2 Modules, Taut Back)
    // -------------------------------------------------------------------------
    // Left shell: hugs left flank of 3-seater tightly (X outer face = -1.67 m) and sweeps along rear
    const leftShellCenterline: Array<[number, number]> = [
      [-1.535, 0.06],            // Front cheek of left armrest (hugs left seat front!)
      [-1.56, -0.18],            // Outer left cheek (outer face reaches -1.67 m)
      [-1.45, -0.49],            // Sweeping rear-left corner
      [-1.14, -0.68],            // Rear-left arc
      [-0.68, -0.755],           // Rear center-left
      [-0.16, -0.762],           // Rear apex (outer face reaches Z = -0.875 m)
      [splitX - 0.012, -0.742],  // Clean vertical rear module seam
    ];

    const leftShellGeo = createCrescentShellGeometry(leftShellCenterline, {
      yBottom: footH + 0.006,
      heightFn: (t) => {
        // Armrest slopes gracefully from 54 cm at front cheek up to 65 cm along the backrest
        const s = smoothstep(0.0, 0.34, t);
        return lerp(0.54, 0.65, s);
      },
      halfThickFn: (t) => lerp(0.112, 0.114, Math.sin(t * Math.PI)),
      roundFrontStart: true,
      roundFrontEnd: false,
      lengthSegs: 48,
      profileSegs: 28,
    });
    const leftShellMesh = new THREE.Mesh(leftShellGeo, fabricMat);
    leftShellMesh.name = 'ava_shell_3zits';
    content.add(leftShellMesh);

    // Right shell: starts at rear seam, sweeps around rear-right and hugs outer flank of chaise longue
    const rightShellCenterline: Array<[number, number]> = [
      [splitX + 0.012, -0.742],  // Clean vertical rear module seam
      [0.82, -0.705],            // Rear chaise back
      [1.24, -0.575],            // Rear-right corner curve
      [1.50, -0.32],             // Outer right curve
      [1.56, 0.00],              // Outer right cheek (outer face reaches +1.67 m)
      [1.54, 0.28],              // Front cheek of right chaise armrest (hugs chaise flank!)
    ];

    const rightShellGeo = createCrescentShellGeometry(rightShellCenterline, {
      yBottom: footH + 0.006,
      heightFn: (t) => {
        const s = smoothstep(0.0, 0.36, 1 - t);
        return lerp(0.54, 0.65, s);
      },
      halfThickFn: (t) => lerp(0.114, 0.110, t * t),
      roundFrontStart: false,
      roundFrontEnd: true,
      lengthSegs: 42,
      profileSegs: 28,
    });
    const rightShellMesh = new THREE.Mesh(rightShellGeo, fabricMat);
    rightShellMesh.name = 'ava_shell_chaise';
    content.add(rightShellMesh);

    // -------------------------------------------------------------------------
    // 3. THREE WIDE, EDGE-TO-EDGE TAILORED BACK CUSHIONS (Crest at exact 83 cm)
    // -------------------------------------------------------------------------
    const backCushionH = 0.41;
    const backCushionT = 0.18;
    const backCushionY = seatH + backCushionH * 0.5 - 0.022;

    const backCushionSpecs: Array<{
      name: string;
      w: number;
      x: number;
      z: number;
      rotY: number;
      leanX: number;
    }> = [
      // Left 3-seater back cushion (follows left curve)
      { name: 'ava_back_cushion_left', w: 0.86, x: -0.94, z: -0.515, rotY: 0.16, leanX: -0.16 },
      // Center 3-seater back cushion (nearly edge-to-edge with left & right cushions)
      { name: 'ava_back_cushion_center', w: 0.86, x: -0.06, z: -0.555, rotY: -0.02, leanX: -0.15 },
      // Right chaise longue back cushion
      { name: 'ava_back_cushion_right', w: 0.86, x: 0.81, z: -0.495, rotY: -0.19, leanX: -0.16 },
    ];

    for (const spec of backCushionSpecs) {
      const geo = createTailoredPillowGeometry(spec.w, backCushionH, backCushionT, 0.96, 0.22);
      const mesh = new THREE.Mesh(geo, cushionMat);
      mesh.name = spec.name;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(spec.leanX, spec.rotY, 0);
      mesh.position.set(spec.x, backCushionY, spec.z);
      content.add(mesh);
    }

    // -------------------------------------------------------------------------
    // 4. FOUR TAILORED THROW PILLOWS (Sierkussens — 2 nested per armrest)
    // -------------------------------------------------------------------------
    const throwSpecs: Array<{
      name: string;
      w: number;
      h: number;
      t: number;
      x: number;
      y: number;
      z: number;
      rotY: number;
      leanX: number;
      tiltZ: number;
    }> = [
      // Left armrest outer pillow
      {
        name: 'ava_throw_pillow_left_outer',
        w: 0.44,
        h: 0.40,
        t: 0.135,
        x: -1.35,
        y: seatH + 0.17,
        z: -0.20,
        rotY: 1.02,
        leanX: -0.24,
        tiltZ: 0.06,
      },
      // Left armrest inner pillow (snugly layered in front)
      {
        name: 'ava_throw_pillow_left_inner',
        w: 0.42,
        h: 0.39,
        t: 0.135,
        x: -1.17,
        y: seatH + 0.165,
        z: -0.28,
        rotY: 0.64,
        leanX: -0.20,
        tiltZ: 0.04,
      },
      // Right chaise armrest outer pillow
      {
        name: 'ava_throw_pillow_right_outer',
        w: 0.44,
        h: 0.40,
        t: 0.135,
        x: 1.34,
        y: seatH + 0.17,
        z: -0.07,
        rotY: -1.06,
        leanX: -0.24,
        tiltZ: -0.06,
      },
      // Right chaise armrest inner pillow
      {
        name: 'ava_throw_pillow_right_inner',
        w: 0.42,
        h: 0.39,
        t: 0.135,
        x: 1.16,
        y: seatH + 0.165,
        z: -0.21,
        rotY: -0.68,
        leanX: -0.20,
        tiltZ: -0.04,
      },
    ];

    for (const p of throwSpecs) {
      const geo = createTailoredPillowGeometry(p.w, p.h, p.t, 0.98, 0.28);
      const mesh = new THREE.Mesh(geo, cushionMat);
      mesh.name = p.name;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(p.leanX, p.rotY, p.tiltZ);
      mesh.position.set(p.x, p.y, p.z);
      content.add(mesh);
    }

    // -------------------------------------------------------------------------
    // 5. LOW RECESSED MATTE BLACK GLIDE FEET (Y: 0.00..0.036 m)
    // -------------------------------------------------------------------------
    const footGeo = new THREE.CylinderGeometry(0.024, 0.022, footH + 0.006, 12);
    const footPositions: Array<[number, number]> = [
      // 3-seater feet (peeking subtly beneath outer corners as in product photos)
      [-1.34, 0.14],
      [-1.38, -0.44],
      [-0.50, 0.08],
      [-0.48, -0.68],
      [0.26, -0.08],
      [0.26, -0.66],
      // Chaise longue feet
      [0.46, -0.64],
      [0.48, 0.56],
      [0.98, 0.74],
      [1.38, 0.44],
      [1.40, -0.26],
    ];
    for (let i = 0; i < footPositions.length; i++) {
      const [fx, fz] = footPositions[i];
      const foot = new THREE.Mesh(footGeo, footMat);
      foot.name = `ava_foot_${i + 1}`;
      foot.position.set(fx, (footH + 0.006) / 2, fz);
      content.add(foot);
    }

    // -------------------------------------------------------------------------
    // 6. EXACT BOUNDING-BOX NORMALIZATION TO TARGET (width × height × depth)
    // -------------------------------------------------------------------------
    content.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(content);
    const actualW = bb.max.x - bb.min.x;
    const actualH = bb.max.y - bb.min.y;
    const actualD = bb.max.z - bb.min.z;

    const sx = actualW > 0 ? width / actualW : width / W;
    const sy = actualH > 0 ? height / actualH : height / H;
    const sz = actualD > 0 ? depth / actualD : depth / D;

    const cx = (bb.min.x + bb.max.x) / 2;
    const cz = (bb.min.z + bb.max.z) / 2;

    content.scale.set(sx, sy, sz);
    content.position.set(-cx * sx, -bb.min.y * sy, -cz * sz);

    return root;
  },
};
