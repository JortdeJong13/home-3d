import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Creates a Geberit Renova-inspired softly rounded D-shaped 2D contour in XY
 * spanning X in [-w/2, +w/2] and Y in [0, d], where Y=0 is the flat back
 * mounted against the built-in cistern wall and Y=d is the smooth semicircular nose.
 */
function createDShape(w: number, d: number): THREE.Shape {
  const halfW = w / 2;
  const r = Math.min(halfW, d * 0.55);
  const straightLen = Math.max(0.005, d - r);

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(halfW, 0);
  shape.lineTo(halfW, straightLen);
  shape.absarc(0, straightLen, halfW, 0, Math.PI, false);
  shape.lineTo(-halfW, 0);
  shape.closePath();
  return shape;
}

/**
 * Creates a rounded oval hole Path inside a D-shaped ring (for the hollow toilet rim
 * and open toilet seat ring). Centered in X, shifted slightly forward in Y.
 */
function createBowlHolePath(
  w: number,
  d: number,
  rimMarginX: number,
  rimBack: number,
  rimFront: number
): THREE.Path {
  const rx = Math.max(0.04, w / 2 - rimMarginX);
  const holeLen = Math.max(0.08, d - rimBack - rimFront);
  const ry = holeLen / 2;
  const cy = rimBack + ry;

  const hole = new THREE.Path();
  hole.absellipse(0, cy, rx, ry, 0, Math.PI * 2, true, 0);
  return hole;
}

/**
 * Extrudes a D-shaped horizontal slab (either solid lid or hollow rim/seat ring)
 * aligned so:
 * - Back flat face sits at local Z = zBack
 * - Front nose reaches Z = zBack + depthProj
 * - Bottom sits at Y = yBottom, top reaches Y = yBottom + thickness
 */
function createDExtrusion(
  w: number,
  depthProj: number,
  thickness: number,
  bevel: number,
  zBack: number,
  yBottom: number,
  holeOpts?: { rimMarginX: number; rimBack: number; rimFront: number }
): THREE.BufferGeometry {
  const b = Math.min(bevel, thickness * 0.40, w * 0.10, depthProj * 0.10);
  const innerW = Math.max(0.04, w - 2 * b);
  const innerD = Math.max(0.04, depthProj - 2 * b);
  const coreThick = Math.max(0.003, thickness - 2 * b);

  const shape = createDShape(innerW, innerD);
  if (holeOpts) {
    shape.holes.push(
      createBowlHolePath(
        innerW,
        innerD,
        Math.max(0.015, holeOpts.rimMarginX - b),
        Math.max(0.02, holeOpts.rimBack - b),
        Math.max(0.015, holeOpts.rimFront - b)
      )
    );
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreThick,
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 3,
    curveSegments: 28,
  });

  // Rotate +90° around X: shape +Y -> +Z (forward projection), extrude +Z -> -Y
  geo.rotateX(Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;

  const cx = (bb.min.x + bb.max.x) / 2;
  geo.translate(-cx, yBottom - bb.min.y, zBack - bb.min.z);

  geo.computeBoundingBox();
  const bb2 = geo.boundingBox!;
  const actualW = bb2.max.x - bb2.min.x;
  const actualH = bb2.max.y - bb2.min.y;
  const actualD = bb2.max.z - bb2.min.z;
  const sx = actualW > 0 ? w / actualW : 1;
  const sy = actualH > 0 ? thickness / actualH : 1;
  const sz = actualD > 0 ? depthProj / actualD : 1;
  if (Math.abs(sx - 1) > 1e-5 || Math.abs(sy - 1) > 1e-5 || Math.abs(sz - 1) > 1e-5) {
    geo.translate(0, -yBottom, -zBack);
    geo.scale(sx, sy, sz);
    geo.translate(0, yBottom, zBack);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a smoothly lofted, tapered lower ceramic bowl body (Geberit Renova
 * rimless wall-hung silhouette) from yBottom to yTop with outward-facing normals
 * and a clean white porcelain interior basin floor (no water).
 */
function createLoftedBowlBelly(
  topW: number,
  topD: number,
  yBottom: number,
  yTop: number,
  zBack: number
): THREE.BufferGeometry {
  const numRings = 9;
  const ptsPerRing = 36;
  const positions: number[] = [];
  const indices: number[] = [];

  function sampleDPerimeter(w: number, d: number, count: number): Array<[number, number]> {
    const hw = w / 2;
    const straight = Math.max(0.005, d - hw);
    const pts: Array<[number, number]> = [];
    const backPts = 6;
    const sidePts = 5;
    const arcPts = count - backPts - 2 * sidePts; // 20

    for (let i = 0; i < backPts; i++) {
      pts.push([-hw + (i / backPts) * w, 0]);
    }
    for (let i = 0; i < sidePts; i++) {
      pts.push([hw, (i / sidePts) * straight]);
    }
    for (let i = 0; i < arcPts; i++) {
      const a = (i / arcPts) * Math.PI;
      pts.push([Math.cos(a) * hw, straight + Math.sin(a) * hw]);
    }
    for (let i = 0; i < sidePts; i++) {
      pts.push([-hw, straight * (1 - i / sidePts)]);
    }
    return pts;
  }

  for (let r = 0; r < numRings; r++) {
    const v = r / (numRings - 1); // 0 = bottom, 1 = top
    const ease = Math.pow(v, 0.50);
    const ringW = topW * (0.46 + 0.54 * ease);
    const ringD = topD * (0.44 + 0.56 * ease);
    const y = yBottom + v * (yTop - yBottom);
    const ring = sampleDPerimeter(ringW, ringD, ptsPerRing);
    for (const [px, pz] of ring) {
      positions.push(px, y, zBack + pz);
    }
  }

  for (let r = 0; r < numRings - 1; r++) {
    const rowA = r * ptsPerRing;
    const rowB = (r + 1) * ptsPerRing;
    for (let i = 0; i < ptsPerRing; i++) {
      const iNext = (i + 1) % ptsPerRing;
      const a = rowA + i;
      const b = rowA + iNext;
      const c = rowB + iNext;
      const d = rowB + i;
      indices.push(a, c, b);
      indices.push(a, d, c);
    }
  }

  // Bottom cap
  const bottomCenterIdx = positions.length / 3;
  positions.push(0, yBottom, zBack + topD * 0.22);
  for (let i = 0; i < ptsPerRing; i++) {
    const iNext = (i + 1) % ptsPerRing;
    indices.push(bottomCenterIdx, i, iNext);
  }

  // Clean recessed porcelain basin floor cap at yTop
  const topCenterIdx = positions.length / 3;
  const topRowStart = (numRings - 1) * ptsPerRing;
  positions.push(0, yTop - 0.04, zBack + topD * 0.52);
  for (let i = 0; i < ptsPerRing; i++) {
    const iNext = (i + 1) % ptsPerRing;
    indices.push(topCenterIdx, topRowStart + iNext, topRowStart + i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Modern Wall-Hung Toilet (Geberit Renova Rimfree Wandcloset) — Secondary Asset
 *
 * Mounts directly onto the built-in tiled concealed cistern (built as part of the floor construction).
 * - Dimensions: 35.5 cm wide × 54 cm projection, floating 10 cm above the floor, rim at 40 cm,
 *   slim soft-close seat & animated lid top at 43.5 cm.
 * - Clean white porcelain interior basin (no water).
 * - Interactive animated lid: smoothly lifts upright (~92°) on hover and pins open on click.
 */
export const wallHungToiletPrefab: AssetPrefabDefinition = {
  prefabId: 'wall_hung_toilet',
  defaultLabel: 'Wandcloset (Geberit Renova)',
  defaultDimensions: {
    width: cm(35.5, 'verified_drawing', 'Geberit Renova wall-hung toilet standard width 35.5 cm'),
    depth: cm(54, 'verified_drawing', 'Geberit Renova wall-hung toilet standard projection 54 cm'),
    height: cm(43.5, 'verified_drawing', 'Floating wall-hung toilet (10 cm clearance + 30 cm ceramic body + 3.5 cm seat & lid)'),
  },
  build3D: ({ width, depth, height, registerInteractiveDoor }) => {
    const group = new THREE.Group();

    const ceramicMat = new THREE.MeshStandardMaterial({
      color: '#fafaf7',
      roughness: 0.28,
      metalness: 0.02,
    });
    const seatMat = new THREE.MeshStandardMaterial({
      color: '#f5f4f0',
      roughness: 0.38,
      metalness: 0.02,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#cfd4d8',
      roughness: 0.32,
      metalness: 0.42,
    });

    // 1 mm micro-clearance from cistern face prevents any coplanar Z-fighting
    const zBowlBack = -depth / 2 + 0.001;
    const actualBowlProj = depth - 0.001;

    const bowlBottomY = 0.100; // Floating 10 cm above floor
    const bowlMidY = 0.275;
    const bowlRimY = Math.min(0.400, height - 0.035);

    // 1. Lower smoothly tapered ceramic belly (Y: 0.100 .. 0.275 m)
    const bellyGeo = createLoftedBowlBelly(width, actualBowlProj, bowlBottomY, bowlMidY, zBowlBack);
    const bellyMesh = new THREE.Mesh(bellyGeo, ceramicMat);
    bellyMesh.name = 'toilet_bowl_lower';
    group.add(bellyMesh);

    // 2. Upper hollow rimless ceramic bowl ring (Y: 0.275 .. 0.400 m)
    const upperGeo = createDExtrusion(
      width,
      actualBowlProj,
      bowlRimY - bowlMidY,
      0.010,
      zBowlBack,
      bowlMidY,
      { rimMarginX: 0.042, rimBack: 0.085, rimFront: 0.042 }
    );
    const upperMesh = new THREE.Mesh(upperGeo, ceramicMat);
    upperMesh.name = 'toilet_bowl_upper';
    group.add(upperMesh);

    // 3. Open Slim Seat Ring + Animated Hinged Soft-Close Lid
    const seatW = width - 0.004;
    const seatD = actualBowlProj - 0.006;
    const seatThick = 0.015;
    const lidThick = 0.015;
    const seatBottomY = bowlRimY + 0.003;

    const seatGeo = createDExtrusion(
      seatW,
      seatD,
      seatThick,
      0.004,
      zBowlBack + 0.003,
      seatBottomY,
      { rimMarginX: 0.062, rimBack: 0.105, rimFront: 0.060 }
    );
    const seatMesh = new THREE.Mesh(seatGeo, seatMat);
    seatMesh.name = 'toilet_seat';
    group.add(seatMesh);

    // Two subtle chrome hinge barrels at the rear of the seat/lid
    const hingeY = seatBottomY + seatThick + 0.002;
    const hingeZ = zBowlBack + 0.032;
    const hingeGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.022, 12);
    hingeGeo.rotateZ(Math.PI / 2);
    for (const side of [-1, 1]) {
      const hinge = new THREE.Mesh(hingeGeo, chromeMat);
      hinge.name = side < 0 ? 'toilet_hinge_left' : 'toilet_hinge_right';
      hinge.position.set(side * 0.08, hingeY - 0.004, hingeZ);
      group.add(hinge);
    }

    // Animated lid mounted in a hinge pivot group (rotates around X to lift upright)
    const lidPivot = new THREE.Group();
    lidPivot.name = 'toilet_lid_pivot';
    lidPivot.position.set(0, hingeY, hingeZ);
    group.add(lidPivot);

    const lidGeo = createDExtrusion(
      seatW,
      seatD - 0.004,
      lidThick,
      0.005,
      zBowlBack + 0.003 - hingeZ,
      0
    );
    const lidMesh = new THREE.Mesh(lidGeo, seatMat);
    lidMesh.name = 'toilet_lid';
    lidPivot.add(lidMesh);

    // Invisible stationary trigger covering the toilet bowl + lid for smooth hover/click interaction
    const triggerMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, 0.48, actualBowlProj + 0.04),
      triggerMat
    );
    trigger.name = 'toilet_lid_trigger';
    trigger.position.set(0, 0.34, zBowlBack + actualBowlProj / 2);
    trigger.userData.isInteractiveTrigger = true;
    group.add(trigger);

    registerInteractiveDoor?.({
      subId: 'lid',
      pivots: [
        {
          group: lidPivot,
          closedAngle: 0,
          openAngle: -Math.PI * 0.51, // ~92° upright, clears cistern cleanly
          currentAngle: 0,
          onUpdate: (currentAngle) => {
            lidPivot.rotation.x = currentAngle;
          },
        },
      ],
      triggerMeshes: [trigger, lidMesh, seatMesh],
    });

    return group;
  },
};
