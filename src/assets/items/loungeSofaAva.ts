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
      const r = Math.round(lerp(223, 239, mix));
      const g = Math.round(lerp(217, 235, mix));
      const b = Math.round(lerp(206, 227, mix));

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
 * in (X, Z) coordinates.
 *
 * Vertical profile:
 * - Soft bottom tuck from yBottom up 5.5 cm
 * - Smooth, taut slightly-convex upholstered vertical flank
 * - Generous 9.5 cm rounded top shoulder rolling seamlessly into a subtly crowned top deck
 */
function createMonolithicSeatDeckGeometry(
  controlPointsXZ: Array<[number, number]>,
  yBottom: number,
  yTop: number,
  samples = 88
): THREE.BufferGeometry {
  const curve3 = new THREE.CatmullRomCurve3(
    controlPointsXZ.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
    0.5
  );

  const rawPts = curve3.getSpacedPoints(samples);
  rawPts.pop();
  const N = rawPts.length;

  let area2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < N; i++) {
    const a = rawPts[i];
    const b = rawPts[(i + 1) % N];
    area2 += a.x * b.z - b.x * a.z;
    cx += a.x;
    cz += a.z;
  }
  cx /= N;
  cz /= N;
  const normalSign = area2 >= 0 ? 1 : -1;

  const ringPts: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  for (let i = 0; i < N; i++) {
    const prev = rawPts[(i - 1 + N) % N];
    const curr = rawPts[i];
    const next = rawPts[(i + 1) % N];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    const nx = (tz / tlen) * normalSign;
    const nz = (-tx / tlen) * normalSign;
    ringPts.push({ x: curr.x, z: curr.z, nx, nz });
  }

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
  const crownH = 0.015;
  const shoulderY = yTop - crownH;

  const profileStations: Array<[number, number, number]> = [
    [yBottom, 0.065, 0.0],
    [yBottom + 0.012, 0.036, 0.0],
    [yBottom + 0.032, 0.015, 0.0],
    [yBottom + 0.058, 0.004, 0.0],
    [yBottom + totalH * 0.30, -0.003, 0.0],
    [yBottom + totalH * 0.56, -0.004, 0.0],
    [yBottom + totalH * 0.72, 0.001, 0.0],
    [yBottom + totalH * 0.80, 0.012, 0.0],
    [yBottom + totalH * 0.865, 0.030, 0.0],
    [yBottom + totalH * 0.915, 0.055, 0.0],
    [yBottom + totalH * 0.950, 0.088, 0.0],
    [shoulderY, 0.125, 0.0],
    [shoulderY + crownH * 0.55, 0.125, 0.34],
    [shoulderY + crownH * 0.88, 0.125, 0.68],
  ];

  const positions: number[] = [];
  const indices: number[] = [];

  for (const [py, inset, centerBlend] of profileStations) {
    for (let i = 0; i < N; i++) {
      const p = ringPts[i];
      const ox = p.x - p.nx * inset;
      const oz = p.z - p.nz * inset;
      positions.push(lerp(ox, cx, centerBlend), py, lerp(oz, cz, centerBlend));
    }
  }

  const numRings = profileStations.length;
  for (let r = 0; r < numRings - 1; r++) {
    const baseA = r * N;
    const baseB = (r + 1) * N;
    for (let i = 0; i < N; i++) {
      const iNext = (i + 1) % N;
      indices.push(baseA + i, baseA + iNext, baseB + i);
      indices.push(baseA + iNext, baseB + iNext, baseB + i);
    }
  }

  const botCenterIdx = positions.length / 3;
  positions.push(cx, yBottom, cz);
  for (let i = 0; i < N; i++) {
    indices.push(botCenterIdx, (i + 1) % N, i);
  }

  const topCenterIdx = positions.length / 3;
  positions.push(cx, yTop, cz);
  const lastRingBase = (numRings - 1) * N;
  for (let i = 0; i < N; i++) {
    indices.push(topCenterIdx, lastRingBase + i, lastRingBase + ((i + 1) % N));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);

  // Guarantee outward winding via signed volume
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
 * Keeps the bottom flush at yBottom all the way to the front armrest cheeks while smoothly
 * rounding the front corners and top crest.
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

  const sampleProfile = (angle: number, halfT: number, h: number): [number, number] => {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const exp = sa > 0 ? lerp(0.42, 0.80, sa) : lerp(0.42, 0.62, -sa);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), exp);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), exp);
    const bottomTuck = sa < -0.55 ? 1.0 - 0.14 * ((-sa - 0.55) / 0.45) : 1.0;
    return [sx * halfT * bottomTuck, yBottom + (sy * 0.5 + 0.5) * h];
  };

  interface RingStation {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    halfT: number;
    h: number;
  }

  const rings: RingStation[] = [];

  const makeStation = (t: number, shiftTan: number, thickScale: number, heightScale: number) => {
    const clampedT = Math.max(0, Math.min(1, t));
    const p = curve.getPointAt(clampedT);
    const tan = curve.getTangentAt(clampedT).normalize();
    const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    rings.push({
      center: p.clone().addScaledVector(tan, shiftTan),
      normal: norm,
      halfT: halfThickFn(clampedT) * thickScale,
      h: heightFn(clampedT) * heightScale,
    });
  };

  // Start cap stays anchored at yBottom so armrest front reaches down to the floor cleanly
  if (roundFrontStart) {
    const ht0 = halfThickFn(0);
    makeStation(0, -ht0 * 0.72, 0.18, 0.86);
    makeStation(0, -ht0 * 0.56, 0.56, 0.94);
    makeStation(0, -ht0 * 0.32, 0.84, 0.98);
    makeStation(0, -ht0 * 0.10, 0.96, 0.995);
  } else {
    makeStation(0, -0.014, 0.90, 0.99);
    makeStation(0, -0.005, 0.98, 0.998);
  }

  for (let i = 0; i <= lengthSegs; i++) {
    makeStation(i / lengthSegs, 0, 1.0, 1.0);
  }

  if (roundFrontEnd) {
    const ht1 = halfThickFn(1);
    makeStation(1, ht1 * 0.10, 0.96, 0.995);
    makeStation(1, ht1 * 0.32, 0.84, 0.98);
    makeStation(1, ht1 * 0.56, 0.56, 0.94);
    makeStation(1, ht1 * 0.72, 0.18, 0.86);
  } else {
    makeStation(1, 0.005, 0.98, 0.998);
    makeStation(1, 0.014, 0.90, 0.99);
  }

  const positions: number[] = [];
  const indices: number[] = [];

  for (const r of rings) {
    for (let s = 0; s < profileSegs; s++) {
      const angle = (s / profileSegs) * Math.PI * 2;
      const [out, rawY] = sampleProfile(angle, r.halfT, r.h);
      positions.push(r.center.x + r.normal.x * out, rawY, r.center.z + r.normal.z * out);
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

  const first = rings[0];
  const startIdx = positions.length / 3;
  positions.push(first.center.x, yBottom + first.h * 0.5, first.center.z);
  for (let s = 0; s < profileSegs; s++) {
    indices.push(startIdx, (s + 1) % profileSegs, s);
  }

  const last = rings[rings.length - 1];
  const lastBase = (rings.length - 1) * profileSegs;
  const endIdx = positions.length / 3;
  positions.push(last.center.x, yBottom + last.h * 0.5, last.center.z);
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
 * Creates a silky-smooth, plump architectural-diorama cushion or throw pillow via rounded
 * ExtrudeGeometry + gentle pillow loft. Avoids any sharp pinched edges or dark normal seams,
 * matching the soft upholstered aesthetic of the rest of the house diorama.
 */
function createSoftPillowGeometry(
  w: number,
  h: number,
  t: number,
  cornerRadius = 0.055,
  bevelRadius = 0.042,
  topTaper = 0.965
): THREE.BufferGeometry {
  const b = Math.min(bevelRadius, t * 0.44, w * 0.20, h * 0.20);
  const iw = Math.max(0.02, w - 2 * b);
  const ih = Math.max(0.02, h - 2 * b);
  const coreT = Math.max(0.008, t - 2 * b);
  const hw = iw / 2;
  const hh = ih / 2;
  const c = Math.min(cornerRadius, hw * 0.45, hh * 0.45);

  // Rounded rectangle in XY
  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.quadraticCurveTo(hw, hh, hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.quadraticCurveTo(-hw, -hh, -hw + c, -hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreT,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 6,
    curveSegments: 8,
  });
  geo.center();

  // Apply gentle organic pillow fullness (soft middle crown + subtle top taper)
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = Math.max(-1, Math.min(1, x / (w / 2)));
    const ny = Math.max(-1, Math.min(1, y / (h / 2)));

    // Subtle upward taper like real upright sofa back cushions
    x *= lerp(1.0, topTaper, (ny + 1) * 0.5);

    // Gentle dome across front & back faces (+18% loft in center, zero distortion at edges)
    const dome = Math.cos(nx * Math.PI * 0.5) * Math.cos(ny * Math.PI * 0.5);
    z *= 0.88 + 0.20 * dome;

    pos.setXYZ(i, x, y, z);
  }

  // Normalize back to exact (w × h × t)
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
 * - Total Height: 83 cm (Y: 0.00..0.83 m; curved shell ~69 cm, 3 loose back cushions to 83 cm)
 * - Seat Height: 44 cm (3.2 cm recessed matte black glide feet + monolithic upholstered seat deck)
 * - Seat Depth: 58 cm (generous ~105–116 cm total 3-seater depth from rear shell to front edge)
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

    // Primary fine-woven naturel beige upholstery (reads warm off-white in daylight)
    const fabricMat = new THREE.MeshStandardMaterial({
      color: '#f5f2eb',
      map: fabricTex,
      roughness: 0.94,
      metalness: 0.0,
    });

    // Subtle 1.5% warmer shade for loose cushions so they separate softly in diorama lighting
    const cushionMat = new THREE.MeshStandardMaterial({
      color: '#f1ede5',
      map: fabricTex,
      roughness: 0.95,
      metalness: 0.0,
    });

    // Low matte-black cylindrical glide feet tucked under base corners
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

    // Module split X between 3-seater (left) and chaise longue (right)
    const splitX = 0.36;

    // -------------------------------------------------------------------------
    // 1. TWO MONOLITHIC ORGANIC SEAT DECKS (Full-Bodied 3-Zits + Wide Rounded Chaise)
    // -------------------------------------------------------------------------
    // Left 3-seater footprint:
    // - Full, generous depth all the way across: ~116 cm on the left-center bow (Z: -0.875..+0.29 m)
    //   sweeping smoothly to ~104 cm at the module junction (Z: -0.875..+0.16 m) so the middle
    //   never looks thin or pinched!
    const leftSeatOutline: Array<[number, number]> = [
      [-1.47, -0.42],
      [-1.24, -0.64],
      [-0.76, -0.73],
      [-0.18, -0.75],
      [splitX - 0.008, -0.73],
      [splitX - 0.008, 0.16],  // Full ~104 cm total depth at the middle junction!
      [0.06, 0.18],
      [-0.28, 0.23],
      [-0.66, 0.29],           // Gentle organic forward bow (~116 cm total depth)
      [-1.04, 0.30],
      [-1.33, 0.24],
      [-1.47, 0.08],
      [-1.49, -0.16],
    ];

    const leftSeatGeo = createMonolithicSeatDeckGeometry(leftSeatOutline, footH, seatH, 88);
    const leftSeatMesh = new THREE.Mesh(leftSeatGeo, fabricMat);
    leftSeatMesh.name = 'ava_seat_3zits';
    content.add(leftSeatMesh);

    // Right Chaise Longue footprint (Hoekrichting Rechts):
    // - Projects ~71 cm forward beyond the 3-seater junction to Z = +0.875 m (175 cm total depth)
    // - Wide, lush, semi-circular bulbous front nose (~116 cm seat deck width)
    const rightChaiseOutline: Array<[number, number]> = [
      [splitX + 0.008, -0.73],
      [0.80, -0.70],
      [1.20, -0.58],
      [1.45, -0.34],
      [1.51, -0.02],
      [1.53, 0.36],
      [1.48, 0.61],
      [1.31, 0.785],
      [1.04, 0.875], // Full rounded chaise nose apex
      [0.74, 0.865],
      [0.50, 0.74],
      [0.39, 0.52],
      [splitX + 0.008, 0.28],
      [splitX + 0.008, 0.16],
    ];

    const rightChaiseGeo = createMonolithicSeatDeckGeometry(rightChaiseOutline, footH, seatH, 88);
    const rightChaiseMesh = new THREE.Mesh(rightChaiseGeo, fabricMat);
    rightChaiseMesh.name = 'ava_seat_chaise';
    content.add(rightChaiseMesh);

    // -------------------------------------------------------------------------
    // 2. CRESCENT WRAP-AROUND BACKREST & ARMREST SHELLS (Taut Back, Plush Arms)
    // -------------------------------------------------------------------------
    const leftShellCenterline: Array<[number, number]> = [
      [-1.535, 0.11],           // Front cheek of left armrest hugging 3-seater front
      [-1.56, -0.16],           // Outer left cheek (reaches X = -1.67 m)
      [-1.45, -0.48],           // Sweeping rear-left corner
      [-1.14, -0.68],           // Rear-left arc
      [-0.68, -0.755],          // Rear center-left
      [-0.16, -0.762],          // Rear apex (outer face reaches Z = -0.875 m)
      [splitX - 0.012, -0.742], // Clean vertical rear module seam
    ];

    const leftShellGeo = createCrescentShellGeometry(leftShellCenterline, {
      yBottom: footH + 0.005,
      heightFn: (t) => {
        // Armrest slopes smoothly from 56 cm at front cheek up to 68 cm along the backrest
        const s = smoothstep(0.0, 0.36, t);
        return lerp(0.56, 0.68, s);
      },
      halfThickFn: (t) => lerp(0.112, 0.115, Math.sin(t * Math.PI)),
      roundFrontStart: true,
      roundFrontEnd: false,
      lengthSegs: 48,
      profileSegs: 28,
    });
    const leftShellMesh = new THREE.Mesh(leftShellGeo, fabricMat);
    leftShellMesh.name = 'ava_shell_3zits';
    content.add(leftShellMesh);

    const rightShellCenterline: Array<[number, number]> = [
      [splitX + 0.012, -0.742], // Clean vertical rear module seam
      [0.82, -0.705],           // Rear chaise back
      [1.24, -0.575],           // Rear-right corner curve
      [1.50, -0.32],            // Outer right curve
      [1.56, 0.00],             // Outer right cheek (reaches X = +1.67 m)
      [1.54, 0.30],             // Front cheek of right chaise armrest
    ];

    const rightShellGeo = createCrescentShellGeometry(rightShellCenterline, {
      yBottom: footH + 0.005,
      heightFn: (t) => {
        const s = smoothstep(0.0, 0.38, 1 - t);
        return lerp(0.56, 0.68, s);
      },
      halfThickFn: (t) => lerp(0.115, 0.112, t * t),
      roundFrontStart: false,
      roundFrontEnd: true,
      lengthSegs: 42,
      profileSegs: 28,
    });
    const rightShellMesh = new THREE.Mesh(rightShellGeo, fabricMat);
    rightShellMesh.name = 'ava_shell_chaise';
    content.add(rightShellMesh);

    // -------------------------------------------------------------------------
    // 3. THREE PLUMP, SOFTLY ROUNDED BACK CUSHIONS (Crest at exact 83 cm)
    // -------------------------------------------------------------------------
    const backCushionH = 0.415;
    const backCushionT = 0.175;
    const backCushionY = seatH + backCushionH * 0.5 - 0.020;

    const backCushionSpecs: Array<{
      name: string;
      w: number;
      x: number;
      z: number;
      rotY: number;
      leanX: number;
    }> = [
      // Left 3-seater back cushion
      { name: 'ava_back_cushion_left', w: 0.85, x: -0.92, z: -0.51, rotY: 0.13, leanX: -0.14 },
      // Center 3-seater back cushion
      { name: 'ava_back_cushion_center', w: 0.86, x: -0.05, z: -0.545, rotY: -0.02, leanX: -0.13 },
      // Right chaise longue back cushion
      { name: 'ava_back_cushion_right', w: 0.84, x: 0.81, z: -0.49, rotY: -0.16, leanX: -0.14 },
    ];

    for (const spec of backCushionSpecs) {
      const geo = createSoftPillowGeometry(spec.w, backCushionH, backCushionT, 0.045, 0.042, 0.96);
      const mesh = new THREE.Mesh(geo, cushionMat);
      mesh.name = spec.name;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(spec.leanX, spec.rotY, 0);
      mesh.position.set(spec.x, backCushionY, spec.z);
      content.add(mesh);
    }

    // -------------------------------------------------------------------------
    // 4. FOUR SOFT THROW PILLOWS (Sierkussens — cleanly layered, zero clipping)
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
    }> = [
      // Left armrest outer pillow (tucked neatly inside left arm curve, clear of shell)
      {
        name: 'ava_throw_pillow_left_outer',
        w: 0.42,
        h: 0.38,
        t: 0.125,
        x: -1.30,
        y: seatH + 0.175,
        z: -0.18,
        rotY: 1.05,
        leanX: -0.18,
      },
      // Left armrest inner pillow (layered cleanly in front of outer pillow, angled toward room)
      {
        name: 'ava_throw_pillow_left_inner',
        w: 0.42,
        h: 0.38,
        t: 0.125,
        x: -1.14,
        y: seatH + 0.175,
        z: -0.25,
        rotY: 0.52,
        leanX: -0.16,
      },
      // Right chaise armrest outer pillow (tucked neatly inside right arm curve)
      {
        name: 'ava_throw_pillow_right_outer',
        w: 0.42,
        h: 0.38,
        t: 0.125,
        x: 1.30,
        y: seatH + 0.175,
        z: -0.08,
        rotY: -1.08,
        leanX: -0.18,
      },
      // Right chaise armrest inner pillow (layered cleanly in front of outer pillow)
      {
        name: 'ava_throw_pillow_right_inner',
        w: 0.42,
        h: 0.38,
        t: 0.125,
        x: 1.13,
        y: seatH + 0.175,
        z: -0.18,
        rotY: -0.54,
        leanX: -0.16,
      },
    ];

    for (const p of throwSpecs) {
      const geo = createSoftPillowGeometry(p.w, p.h, p.t, 0.042, 0.036, 0.98);
      const mesh = new THREE.Mesh(geo, cushionMat);
      mesh.name = p.name;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(p.leanX, p.rotY, 0);
      mesh.position.set(p.x, p.y, p.z);
      content.add(mesh);
    }

    // -------------------------------------------------------------------------
    // 5. LOW RECESSED MATTE BLACK GLIDE FEET (Y: 0.00..0.036 m)
    // -------------------------------------------------------------------------
    const footGeo = new THREE.CylinderGeometry(0.024, 0.022, footH + 0.006, 12);
    const footPositions: Array<[number, number]> = [
      [-1.34, 0.18],
      [-1.38, -0.44],
      [-0.50, 0.16],
      [-0.48, -0.68],
      [0.26, 0.08],
      [0.26, -0.66],
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
