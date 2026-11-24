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

let cachedBoucleTex: THREE.DataTexture | null = null;

/**
 * Generates a subtle, powdery matte fine-woven naturel beige melange fabric DataTexture
 * matching Goossens "stof gemeleerd fijn geweven naturel" (off-white / warm oatmeal cream)
 * while staying cohesive with the soft architectural diorama aesthetic.
 */
function getAvaFabricTexture(): THREE.DataTexture {
  if (cachedBoucleTex) return cachedBoucleTex;

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  for (let py = 0; py < TEX_SIZE; py++) {
    for (let px = 0; px < TEX_SIZE; px++) {
      // Fine woven warp/weft micro-variation + gentle nubby melange speckling
      const warp = Math.sin((px / TEX_SIZE) * Math.PI * 2 * 64) * 0.5 + 0.5;
      const weft = Math.sin((py / TEX_SIZE) * Math.PI * 2 * 64) * 0.5 + 0.5;
      const weave = ((px + py) & 1) === 0 ? warp : weft;

      // Coarse 2x2 melange cluster + fine pixel grain
      const coarse = hash2(px >> 1, py >> 1, 17);
      const fine = hash2(px, py, 53);
      const mix = coarse * 0.52 + fine * 0.28 + weave * 0.20;

      // Warm off-white / light beige naturel (#e9e5dc .. #dbd4c8) — reads close to white in daylight
      const r = Math.round(lerp(220, 237, mix));
      const g = Math.round(lerp(214, 233, mix));
      const b = Math.round(lerp(202, 224, mix));

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
 * Applies tri-planar-like world-scale UV mapping to a geometry so the fine-woven fabric
 * texture tiles uniformly without stretching across curves or bevels.
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

    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = x * tileScale;
      v = z * tileScale;
    } else if (nx >= nz) {
      u = z * tileScale;
      v = y * tileScale;
    } else {
      u = x * tileScale;
      v = y * tileScale;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/**
 * Creates an extruded organic seat-deck slab from a 2D footprint in (X, Z) coordinates.
 * Note: Three.js Shape uses (shapeX, shapeY); after rotateX(-PI/2), shapeX -> +X and shapeY -> -Z.
 * So we pass (x, -z) into Shape so the resulting mesh sits at exact world (X, Z).
 */
function createOrganicSlabGeometry(
  pointsXZ: Array<[number, number]>,
  yBottom: number,
  yTop: number,
  bevelSize: number,
  bevelThickness: number,
  bevelSegments = 7,
  curveSegments = 32
): THREE.BufferGeometry {
  // Inset the 2D polygon slightly by bevelSize along inward normals so the beveled outer boundary
  // matches the target footprint closely.
  const n = pointsXZ.length;
  const cx = pointsXZ.reduce((s, p) => s + p[0], 0) / n;
  const cz = pointsXZ.reduce((s, p) => s + p[1], 0) / n;

  const insetPts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pointsXZ[(i - 1 + n) % n];
    const curr = pointsXZ[i];
    const next = pointsXZ[(i + 1) % n];

    const dx1 = curr[0] - prev[0];
    const dz1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dz1) || 1;
    const dx2 = next[0] - curr[0];
    const dz2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dz2) || 1;

    // Average edge normal pointing inward toward centroid
    let nx = -(dz1 / len1 + dz2 / len2);
    let nz = dx1 / len1 + dx2 / len2;
    const nlen = Math.hypot(nx, nz) || 1;
    nx /= nlen;
    nz /= nlen;

    // Ensure normal points inward toward polygon centroid
    if (nx * (cx - curr[0]) + nz * (cz - curr[1]) < 0) {
      nx = -nx;
      nz = -nz;
    }

    const ix = curr[0] + nx * bevelSize;
    const iz = curr[1] + nz * bevelSize;
    insetPts.push(new THREE.Vector2(ix, -iz));
  }

  const shape = new THREE.Shape();
  const spline = new THREE.SplineCurve([...insetPts, insetPts[0]]);
  const sampled = spline.getPoints(curveSegments * 2);
  shape.moveTo(sampled[0].x, sampled[0].y);
  for (let i = 1; i < sampled.length; i++) {
    shape.lineTo(sampled[i].x, sampled[i].y);
  }
  shape.closePath();

  const totalH = Math.max(0.02, yTop - yBottom);
  const clampedBevelT = Math.min(bevelThickness, totalH * 0.44);
  const coreH = Math.max(0.005, totalH - 2 * clampedBevelT);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreH,
    bevelEnabled: true,
    bevelThickness: clampedBevelT,
    bevelSize,
    bevelSegments,
    curveSegments: 12,
  });

  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(0, yBottom - bb.min.y, 0);

  // Normalize exact Y span to [yBottom, yTop]
  geo.computeBoundingBox();
  const bb2 = geo.boundingBox!;
  const actualH = bb2.max.y - bb2.min.y;
  if (actualH > 0 && Math.abs(actualH - totalH) > 1e-4) {
    geo.translate(0, -yBottom, 0);
    geo.scale(1, totalH / actualH, 1);
    geo.translate(0, yBottom, 0);
  }

  applyBoxScaleUVs(geo, 1.8);
  return geo;
}

/**
 * Builds a smooth, sculptural swept backrest/armrest shell along a 2D centerline curve in (X, Z).
 * Each cross-section is a softly rounded, upholstered pillow-wall profile with gently domed end caps.
 */
function createSculptedShellGeometry(
  centerlineXZ: Array<[number, number]>,
  options: {
    yBottom: number;
    heightFn: (t: number) => number;
    halfThickFn: (t: number) => number;
    domeStart: boolean;
    domeEnd: boolean;
    lengthSegs?: number;
    profileSegs?: number;
  }
): THREE.BufferGeometry {
  const {
    yBottom,
    heightFn,
    halfThickFn,
    domeStart,
    domeEnd,
    lengthSegs = 44,
    profileSegs = 24,
  } = options;

  const curvePts = centerlineXZ.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(curvePts, false, 'centripetal', 0.5);

  const ringCount = lengthSegs + 1;
  const positions: number[] = [];
  const indices: number[] = [];

  // Superellipse-like rounded cross-section:
  // uAngle in [0, 2*PI): a = cos(angle) across thickness (-1 inner, +1 outer), b = sin(angle) vertical (-1 bottom, +1 top)
  const profilePoint = (angle: number, halfThick: number, h: number): [number, number] => {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    // Superellipse exponent 0.62 creates a plump upholstered cushion-wall with soft top & bottom tuck
    const exp = 0.62;
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), exp);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), exp);
    // Subtle outward belly bulge near middle-bottom like the real Ava shell
    const belly = 1.0 + 0.06 * Math.cos(sa * Math.PI * 0.5) - 0.08 * Math.max(0, -sy);
    const localOut = sx * halfThick * belly;
    const localY = yBottom + (sy * 0.5 + 0.5) * h;
    return [localOut, localY];
  };

  // Optional start cap center + rings
  const ringData: Array<{
    center: THREE.Vector3;
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    halfThick: number;
    h: number;
    scale: number;
  }> = [];

  const pushStation = (t: number, scale: number, shiftAlongTangent = 0) => {
    const p = curve.getPointAt(Math.max(0, Math.min(1, t)));
    const tan = curve.getTangentAt(Math.max(0, Math.min(1, t))).normalize();
    // Normal in XZ perpendicular to tangent
    const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const pos = p.clone().addScaledVector(tan, shiftAlongTangent);
    ringData.push({
      center: pos,
      normal: norm,
      tangent: tan,
      halfThick: halfThickFn(t),
      h: heightFn(t),
      scale,
    });
  };

  // Start rounded dome (e.g. front tip of armrest)
  if (domeStart) {
    const ht0 = halfThickFn(0);
    pushStation(0, 0.08, -ht0 * 0.86);
    pushStation(0, 0.48, -ht0 * 0.68);
    pushStation(0, 0.78, -ht0 * 0.38);
    pushStation(0, 0.94, -ht0 * 0.14);
  } else {
    // Softly chamfered seam edge where the two modules meet
    pushStation(0, 0.92, -0.012);
    pushStation(0, 0.98, -0.004);
  }

  for (let i = 0; i < ringCount; i++) {
    const t = i / lengthSegs;
    pushStation(t, 1.0, 0);
  }

  // End rounded dome
  if (domeEnd) {
    const ht1 = halfThickFn(1);
    pushStation(1, 0.94, ht1 * 0.14);
    pushStation(1, 0.78, ht1 * 0.38);
    pushStation(1, 0.48, ht1 * 0.68);
    pushStation(1, 0.08, ht1 * 0.86);
  } else {
    pushStation(1, 0.98, 0.004);
    pushStation(1, 0.92, 0.012);
  }

  const totalRings = ringData.length;
  for (let r = 0; r < totalRings; r++) {
    const rd = ringData[r];
    const midY = yBottom + rd.h * 0.5;
    for (let s = 0; s < profileSegs; s++) {
      const angle = (s / profileSegs) * Math.PI * 2;
      const [outOffset, rawY] = profilePoint(angle, rd.halfThick * rd.scale, rd.h);
      const y = midY + (rawY - midY) * (0.28 + 0.72 * rd.scale);
      const vx = rd.center.x + rd.normal.x * outOffset;
      const vz = rd.center.z + rd.normal.z * outOffset;
      positions.push(vx, y, vz);
    }
  }

  // Stitch quads between rings
  for (let r = 0; r < totalRings - 1; r++) {
    const baseA = r * profileSegs;
    const baseB = (r + 1) * profileSegs;
    for (let s = 0; s < profileSegs; s++) {
      const sNext = (s + 1) % profileSegs;
      const a0 = baseA + s;
      const a1 = baseA + sNext;
      const b0 = baseB + s;
      const b1 = baseB + sNext;
      indices.push(a0, b0, a1);
      indices.push(a1, b0, b1);
    }
  }

  // Close start cap
  const startCenterIdx = positions.length / 3;
  const firstRd = ringData[0];
  positions.push(firstRd.center.x, yBottom + firstRd.h * 0.5, firstRd.center.z);
  for (let s = 0; s < profileSegs; s++) {
    const sNext = (s + 1) % profileSegs;
    indices.push(startCenterIdx, sNext, s);
  }

  // Close end cap
  const endCenterIdx = positions.length / 3;
  const lastRd = ringData[totalRings - 1];
  const lastRingBase = (totalRings - 1) * profileSegs;
  positions.push(lastRd.center.x, yBottom + lastRd.h * 0.5, lastRd.center.z);
  for (let s = 0; s < profileSegs; s++) {
    const sNext = (s + 1) % profileSegs;
    indices.push(endCenterIdx, lastRingBase + s, lastRingBase + sNext);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  applyBoxScaleUVs(geo, 1.8);
  return geo;
}

/**
 * Creates a plump, softly pinched cushion or throw pillow geometry centered at (0, 0, 0).
 * Captures the soft luxafoam + feather-filled loft of the Ava back cushions and sierkussens.
 */
function createPlumpPillowGeometry(
  w: number,
  h: number,
  t: number,
  topTaper = 0.94,
  seamPinch = 0.28
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, t, 14, 12, 6);
  const pos = geo.getAttribute('position');

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = x / (w / 2); // [-1, 1]
    const ny = y / (h / 2); // [-1, 1]
    const nz = z / (t / 2); // [-1, 1]

    // Subtle upward taper (back cushions are slightly narrower at top than bottom)
    const widthScale = lerp(1.0, topTaper, (ny + 1) * 0.5);
    x *= widthScale;

    // Plump pillow loft: full in the middle, pinched softly toward the outer perimeter seam
    const edgeFactorX = Math.cos(nx * Math.PI * 0.5);
    const edgeFactorY = Math.cos(ny * Math.PI * 0.5);
    const crown = Math.pow(Math.max(0, edgeFactorX * edgeFactorY), 0.55);

    const thickScale = (1 - seamPinch) * 0.35 + crown * (0.78 + seamPinch * 0.65);
    z *= thickScale;

    // Slight soft ear-like corner rounding along perimeter
    const r2 = nx * nx + ny * ny;
    if (r2 > 1.0) {
      const pull = 1.0 - 0.045 * (r2 - 1.0);
      x *= pull;
      y *= pull;
    }

    // Gentle vertical crown so top & bottom edges look softly stuffed
    y *= 0.96 + 0.04 * Math.cos(nx * Math.PI * 0.5) * Math.cos(nz * Math.PI * 0.5);

    pos.setXYZ(i, x, y, z);
  }

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const actualW = bb.max.x - bb.min.x;
  const actualH = bb.max.y - bb.min.y;
  const actualT = bb.max.z - bb.min.z;
  geo.scale(
    actualW > 0 ? w / actualW : 1,
    actualH > 0 ? h / actualH : 1,
    actualT > 0 ? t / actualT : 1
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
 * - Total Height: 83 cm (Y: 0.00..0.83 m; backrest shell ~67 cm, loose back cushions to 83 cm)
 * - Seat Height: 44 cm (3 cm recessed matte black glide feet + 41 cm upholstered seat deck)
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

    // Primary fine-woven naturel beige upholstery (close to warm off-white as in studio photos)
    const fabricMat = new THREE.MeshStandardMaterial({
      color: '#f5f2eb',
      map: fabricTex,
      roughness: 0.94,
      metalness: 0.0,
    });

    // Subtle 2% warmer shade for loose cushions so back/throw pillows separate softly in diorama lighting
    const cushionMat = new THREE.MeshStandardMaterial({
      color: '#f0ece4',
      map: fabricTex,
      roughness: 0.95,
      metalness: 0.0,
    });

    // Low matte-black recessed glide feet (visible peeking beneath corners in product photos)
    const footMat = new THREE.MeshStandardMaterial({
      color: '#252527',
      roughness: 0.78,
      metalness: 0.05,
    });

    // Canonical reference dimensions (metres); scaled cleanly at the end if overridden
    const W = 3.34;
    const D = 1.75;
    const H = 0.83;
    const footH = 0.032; // ~3.2 cm low recessed glides
    const seatH = 0.44; // Verified zithoogte 44 cm
    const seamY = 0.33; // Subtle horizontal upholstery seam ~11 cm below seat top

    // Module split X between 3-seater (left) and chaise longue (right): ~60% across width
    const splitX = 0.34;

    // -------------------------------------------------------------------------
    // 1. TWO-MODULE ORGANIC CURVED SEAT DECKS (Lower Plinth + Plush Seat Top)
    // -------------------------------------------------------------------------
    // Left 3-seater footprint (X: -1.48..+0.335, rear follows back shell, front has organic S-curve)
    const leftSeatFootprint: Array<[number, number]> = [
      [-1.47, -0.50],
      [-1.25, -0.66],
      [-0.78, -0.73],
      [-0.22, -0.75],
      [0.335, -0.73],
      [0.335, 0.07],
      [0.08, 0.08],
      [-0.28, 0.14],
      [-0.68, 0.21],
      [-1.08, 0.21],
      [-1.36, 0.14],
      [-1.48, -0.06],
    ];

    const leftBaseGeo = createOrganicSlabGeometry(
      leftSeatFootprint,
      footH,
      seamY + 0.012,
      0.042,
      0.038,
      5,
      28
    );
    const leftBaseMesh = new THREE.Mesh(leftBaseGeo, fabricMat);
    leftBaseMesh.name = 'ava_seat_base_3zits';
    content.add(leftBaseMesh);

    const leftTopGeo = createOrganicSlabGeometry(
      leftSeatFootprint,
      seamY - 0.008,
      seatH,
      0.058,
      0.054,
      7,
      30
    );
    const leftTopMesh = new THREE.Mesh(leftTopGeo, fabricMat);
    leftTopMesh.name = 'ava_seat_top_3zits';
    content.add(leftTopMesh);

    // Right Chaise Longue footprint (Hoekrichting Rechts, X: +0.345..+1.52, projects to Z = +0.875 m)
    const rightChaiseFootprint: Array<[number, number]> = [
      [0.345, -0.73],
      [0.78, -0.70],
      [1.18, -0.60],
      [1.44, -0.40],
      [1.50, -0.05],
      [1.51, 0.36],
      [1.43, 0.64],
      [1.24, 0.80],
      [0.98, 0.875],
      [0.68, 0.85],
      [0.45, 0.72],
      [0.355, 0.44],
      [0.345, 0.10],
    ];

    const rightBaseGeo = createOrganicSlabGeometry(
      rightChaiseFootprint,
      footH,
      seamY + 0.012,
      0.042,
      0.038,
      5,
      30
    );
    const rightBaseMesh = new THREE.Mesh(rightBaseGeo, fabricMat);
    rightBaseMesh.name = 'ava_seat_base_chaise';
    content.add(rightBaseMesh);

    const rightTopGeo = createOrganicSlabGeometry(
      rightChaiseFootprint,
      seamY - 0.008,
      seatH,
      0.058,
      0.054,
      7,
      32
    );
    const rightTopMesh = new THREE.Mesh(rightTopGeo, fabricMat);
    rightTopMesh.name = 'ava_seat_top_chaise';
    content.add(rightTopMesh);

    // -------------------------------------------------------------------------
    // 2. SCULPTED WRAP-AROUND BACKREST & ARMREST SHELLS (2 Modules, Rear Seam)
    // -------------------------------------------------------------------------
    // Left shell: starts at front of left armrest, wraps around -X cheek and along rear to splitX
    const leftShellCenterline: Array<[number, number]> = [
      [-1.49, 0.04],   // Front tip of left armrest
      [-1.55, -0.22],  // Outer left cheek (outer face reaches X = -1.67 m)
      [-1.44, -0.52],  // Rear-left curve
      [-1.12, -0.69],  // Rear-left sweep
      [-0.64, -0.755], // Rear center-left (outer face reaches Z = -0.875 m)
      [-0.14, -0.758], // Rear apex
      [splitX - 0.014, -0.742], // Meets right shell at clean vertical rear seam
    ];

    const leftShellGeo = createSculptedShellGeometry(leftShellCenterline, {
      yBottom: footH + 0.008,
      heightFn: (t) => {
        // Armrest tapers gently from 57 cm at front tip up to 64 cm along the backrest
        const smooth = Math.min(1, t / 0.35);
        return lerp(0.56, 0.64, smooth * smooth * (3 - 2 * smooth));
      },
      halfThickFn: (t) => {
        // Thick plush outer cheek ~12 cm half-thickness (~24 cm total)
        return lerp(0.115, 0.118, Math.sin(t * Math.PI));
      },
      domeStart: true,
      domeEnd: false,
      lengthSegs: 42,
      profileSegs: 24,
    });
    const leftShellMesh = new THREE.Mesh(leftShellGeo, fabricMat);
    leftShellMesh.name = 'ava_shell_3zits';
    content.add(leftShellMesh);

    // Right shell: starts at rear seam (splitX), sweeps around rear-right and wraps outer chaise arm
    const rightShellCenterline: Array<[number, number]> = [
      [splitX + 0.014, -0.742], // Clean vertical rear seam
      [0.82, -0.705],           // Rear chaise back
      [1.24, -0.58],            // Rear-right corner curve
      [1.50, -0.34],            // Outer right curve
      [1.555, -0.02],           // Outer right cheek (outer face reaches X = +1.67 m)
      [1.50, 0.25],             // Front tip of right chaise armrest
    ];

    const rightShellGeo = createSculptedShellGeometry(rightShellCenterline, {
      yBottom: footH + 0.008,
      heightFn: (t) => {
        // Backrest 64 cm tapering gently to 56 cm at front tip of right chaise armrest
        const smooth = Math.min(1, (1 - t) / 0.38);
        return lerp(0.56, 0.64, smooth * smooth * (3 - 2 * smooth));
      },
      halfThickFn: (t) => lerp(0.118, 0.112, t * t),
      domeStart: false,
      domeEnd: true,
      lengthSegs: 38,
      profileSegs: 24,
    });
    const rightShellMesh = new THREE.Mesh(rightShellGeo, fabricMat);
    rightShellMesh.name = 'ava_shell_chaise';
    content.add(rightShellMesh);

    // -------------------------------------------------------------------------
    // 3. THREE LARGE LOOSE BACK CUSHIONS (Reach exact 83 cm total height)
    // -------------------------------------------------------------------------
    const backCushionH = 0.405;
    const backCushionT = 0.19;
    const backCushionY = seatH + backCushionH * 0.5 - 0.022; // Sinks slightly into seat top; crest at ~0.83 m

    const backCushionSpecs: Array<{
      name: string;
      w: number;
      x: number;
      z: number;
      rotY: number;
      leanX: number;
    }> = [
      // Left 3-seater back cushion
      { name: 'ava_back_cushion_left', w: 0.80, x: -0.92, z: -0.51, rotY: 0.14, leanX: -0.17 },
      // Center 3-seater back cushion
      { name: 'ava_back_cushion_center', w: 0.82, x: -0.08, z: -0.545, rotY: -0.02, leanX: -0.16 },
      // Right chaise longue back cushion
      { name: 'ava_back_cushion_right', w: 0.80, x: 0.78, z: -0.495, rotY: -0.17, leanX: -0.17 },
    ];

    for (const spec of backCushionSpecs) {
      const geo = createPlumpPillowGeometry(spec.w, backCushionH, backCushionT, 0.94, 0.28);
      const mesh = new THREE.Mesh(geo, cushionMat);
      mesh.name = spec.name;
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(spec.leanX, spec.rotY, 0);
      mesh.position.set(spec.x, backCushionY, spec.z);
      content.add(mesh);
    }

    // -------------------------------------------------------------------------
    // 4. FOUR MATCHING THROW PILLOWS (Sierkussens — 2 left arm, 2 right arm)
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
      // Left armrest outer pillow (tucked deeper into curved left arm)
      {
        name: 'ava_throw_pillow_left_outer',
        w: 0.44,
        h: 0.40,
        t: 0.14,
        x: -1.34,
        y: seatH + 0.17,
        z: -0.24,
        rotY: 0.98,
        leanX: -0.22,
        tiltZ: 0.08,
      },
      // Left armrest inner pillow (angled forward in front of outer pillow)
      {
        name: 'ava_throw_pillow_left_inner',
        w: 0.42,
        h: 0.39,
        t: 0.14,
        x: -1.16,
        y: seatH + 0.165,
        z: -0.32,
        rotY: 0.62,
        leanX: -0.20,
        tiltZ: 0.05,
      },
      // Right chaise armrest outer pillow
      {
        name: 'ava_throw_pillow_right_outer',
        w: 0.44,
        h: 0.40,
        t: 0.14,
        x: 1.33,
        y: seatH + 0.17,
        z: -0.10,
        rotY: -1.04,
        leanX: -0.22,
        tiltZ: -0.08,
      },
      // Right chaise armrest inner pillow
      {
        name: 'ava_throw_pillow_right_inner',
        w: 0.42,
        h: 0.39,
        t: 0.14,
        x: 1.15,
        y: seatH + 0.165,
        z: -0.24,
        rotY: -0.68,
        leanX: -0.20,
        tiltZ: -0.05,
      },
    ];

    for (const p of throwSpecs) {
      const geo = createPlumpPillowGeometry(p.w, p.h, p.t, 0.97, 0.34);
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
      // 3-seater feet
      [-1.34, 0.08],
      [-1.36, -0.48],
      [-0.48, 0.04],
      [-0.48, -0.68],
      [0.24, -0.02],
      [0.24, -0.66],
      // Chaise longue feet
      [0.44, -0.64],
      [0.46, 0.56],
      [0.98, 0.74],
      [1.36, 0.42],
      [1.38, -0.28],
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
    //    Guarantees X in [-width/2, +width/2], Y in [0, height], Z in [-depth/2, +depth/2]
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
