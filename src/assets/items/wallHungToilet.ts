import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Creates a Geberit Renova-inspired softly rounded D-shaped 2D contour in XY
 * spanning X in [-w/2, +w/2] and Y in [0, d], where Y=0 is the flat back
 * mounted against the concealed cistern wall and Y=d is the smooth semicircular nose.
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
function createBowlHolePath(w: number, d: number, rimMarginX: number, rimBack: number, rimFront: number): THREE.Path {
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
 * rimless wall-hung silhouette) from yBottom to yTop with outward-facing normals.
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

  // Top inner basin floor cap at yTop (cleanly closes the belly under the hollow rim!)
  const topCenterIdx = positions.length / 3;
  const topRowStart = (numRings - 1) * ptsPerRing;
  positions.push(0, yTop - 0.035, zBack + topD * 0.52);
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
 * Modern Wall-Hung Toilet (Geberit Renova Rimfree Wandcloset) with Concealed Cistern Enclosure
 *
 * Verified against Geberit Renova specifications, Technische Omschrijving (§16.2 & §23), and HomeByMe:
 * - Concealed flush reservoir (inbouwreservoir voorzetwand): 17 cm deep × 100 cm high,
 *   spanning alcove width with 2 mm shadow clearance against surrounding plaster walls to eliminate Z-fighting,
 *   finished in matte white wall-tile tone with a bevelled top plateau and non-overlapping satin-chrome edge trim.
 * - Wall-hung toilet bowl (Geberit Renova): 35.5 cm wide × 54 cm projection (total depth 71 cm),
 *   softly rounded rimless D-silhouette floating 10 cm above the floor, ceramic rim at 40 cm,
 *   recessed inner basin with subtle water surface, and open slim seat ring.
 * - Interactive animated lid: smoothly lifts open on hover and pins open on click via `registerInteractiveDoor`.
 */
export const wallHungToiletPrefab: AssetPrefabDefinition = {
  prefabId: 'wall_hung_toilet',
  defaultLabel: 'Wandcloset met Inbouwreservoir (Geberit Renova)',
  defaultDimensions: {
    width: cm(91, 'user_supplied', '1st floor Badkamer toilet alcove width (91 cm); overridden to 92 cm on Ground floor'),
    depth: cm(71, 'user_supplied', '17 cm concealed flush reservoir (HomeByMe) + 54 cm Geberit Renova wandcloset = 71 cm'),
    height: cm(100, 'user_supplied', 'HomeByMe concealed flush reservoir (inbouwreservoir) height 100 cm'),
  },
  build3D: ({ width, depth, height, registerInteractiveDoor }) => {
    const group = new THREE.Group();

    const cisternTileMat = new THREE.MeshStandardMaterial({
      color: '#f4f1ea',
      roughness: 0.84,
      metalness: 0.0,
    });
    const plateauMat = new THREE.MeshStandardMaterial({
      color: '#f7f4ee',
      roughness: 0.80,
      metalness: 0.0,
    });
    const ceramicMat = new THREE.MeshStandardMaterial({
      color: '#fafaf7',
      roughness: 0.28,
      metalness: 0.02,
    });
    const bowlWaterMat = new THREE.MeshStandardMaterial({
      color: '#c6dfe8',
      roughness: 0.16,
      metalness: 0.05,
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
    const flushPlateMat = new THREE.MeshStandardMaterial({
      color: '#f2f1ed',
      roughness: 0.42,
      metalness: 0.06,
    });
    const shadowGapMat = new THREE.MeshStandardMaterial({
      color: '#d4d0c8',
      roughness: 0.90,
      metalness: 0.0,
    });

    const wallClearance = 0.002; // 2 mm inset prevents coplanar Z-fighting with plaster walls & floor slab
    const cisternDepth = Math.min(0.17, depth * 0.45);
    const bowlProj = Math.max(0.30, depth - cisternDepth); // 54 cm at canonical 71 cm depth
    const zBack = -depth / 2;
    const zCisternBack = zBack + wallClearance;
    const zCisternFront = zBack + cisternDepth;
    const cisternW = Math.max(0.40, width - wallClearance * 2);
    const cisternD = Math.max(0.08, cisternDepth - wallClearance);

    // -------------------------------------------------------------------------
    // 1. Concealed Cistern Enclosure (Non-overlapping body, plateau, and edge trim)
    // -------------------------------------------------------------------------
    const plateauThick = 0.022;
    const trimSize = 0.008;
    const bodyBottomY = 0.001;
    const bodyTopY = Math.max(0.20, height - plateauThick);
    const bodyH = bodyTopY - bodyBottomY;

    const cisternBody = new THREE.Mesh(
      new THREE.BoxGeometry(cisternW, bodyH, cisternD),
      cisternTileMat
    );
    cisternBody.name = 'toilet_cistern_enclosure';
    cisternBody.position.set(0, bodyBottomY + bodyH / 2, zCisternBack + cisternD / 2);
    group.add(cisternBody);

    // Tiled top ledge (plateau) stepped back by `trimSize` at the front edge so trim never overlaps it
    const plateauD = cisternD - trimSize;
    const plateau = new THREE.Mesh(
      new THREE.BoxGeometry(cisternW, plateauThick, plateauD),
      plateauMat
    );
    plateau.name = 'toilet_cistern_plateau';
    plateau.position.set(0, bodyTopY + plateauThick / 2, zCisternBack + plateauD / 2);
    group.add(plateau);

    // Lower front lip beneath the chrome edge trim (fills the gap between bodyTopY and trim bottom)
    const lowerLipH = plateauThick - trimSize;
    if (lowerLipH > 0.001) {
      const lowerLip = new THREE.Mesh(
        new THREE.BoxGeometry(cisternW, lowerLipH, trimSize),
        cisternTileMat
      );
      lowerLip.name = 'toilet_plateau_front_lip';
      lowerLip.position.set(0, bodyTopY + lowerLipH / 2, zCisternFront - trimSize / 2);
      group.add(lowerLip);
    }

    // Crisp satin-chrome tile corner trim (tegelhoekprofiel) occupying the exact front-top corner
    const edgeTrim = new THREE.Mesh(
      new THREE.BoxGeometry(cisternW, trimSize, trimSize),
      chromeMat
    );
    edgeTrim.name = 'toilet_plateau_trim';
    edgeTrim.position.set(0, height - trimSize / 2, zCisternFront - trimSize / 2);
    group.add(edgeTrim);

    // -------------------------------------------------------------------------
    // 2. Dual-Flush Actuator Plate (Strictly layered in +Z, zero overlap)
    // -------------------------------------------------------------------------
    const plateW = 0.24;
    const plateH = 0.155;
    const plateD = 0.009;
    const plateY = Math.min(height - 0.14, 0.84);

    const plateFrame = new THREE.Mesh(
      new THREE.BoxGeometry(plateW, plateH, plateD),
      flushPlateMat
    );
    plateFrame.name = 'toilet_flush_plate';
    plateFrame.position.set(0, plateY, zCisternFront + plateD / 2);
    group.add(plateFrame);

    const recessD = 0.0015;
    const surround = new THREE.Mesh(
      new THREE.BoxGeometry(plateW - 0.026, plateH - 0.028, recessD),
      shadowGapMat
    );
    surround.name = 'toilet_flush_plate_recess';
    surround.position.set(0, plateY, zCisternFront + plateD + recessD / 2);
    group.add(surround);

    const btnH = plateH - 0.036;
    const btnD = 0.0035;
    const largeBtnW = 0.118;
    const smallBtnW = 0.072;
    const btnGap = 0.010;
    const totalBtnsW = largeBtnW + btnGap + smallBtnW;
    const leftEdgeX = -totalBtnsW / 2;
    const btnZ = zCisternFront + plateD + recessD + btnD / 2;

    const largeBtn = new THREE.Mesh(
      new THREE.BoxGeometry(largeBtnW, btnH, btnD),
      chromeMat
    );
    largeBtn.name = 'toilet_flush_button_full';
    largeBtn.position.set(leftEdgeX + largeBtnW / 2, plateY, btnZ);
    group.add(largeBtn);

    const smallBtn = new THREE.Mesh(
      new THREE.BoxGeometry(smallBtnW, btnH, btnD),
      chromeMat
    );
    smallBtn.name = 'toilet_flush_button_eco';
    smallBtn.position.set(leftEdgeX + largeBtnW + btnGap + smallBtnW / 2, plateY, btnZ);
    group.add(smallBtn);

    // -------------------------------------------------------------------------
    // 3. Wall-Hung Ceramic Bowl (Geberit Renova — 35.5 × 54 cm, floating, hollow rim)
    // -------------------------------------------------------------------------
    const bowlW = Math.min(0.355, width - 0.08);
    const zBowlBack = zCisternFront + 0.001; // 1 mm clearance from tiled cistern
    const actualBowlProj = bowlProj - 0.001;
    const bowlBottomY = 0.100; // Floating 10 cm above floor
    const bowlMidY = 0.275;
    const bowlRimY = 0.400; // Standard 40 cm ceramic rim height

    // Lower smoothly tapered ceramic belly (Y: 0.100 .. 0.275 m)
    const bellyGeo = createLoftedBowlBelly(bowlW, actualBowlProj, bowlBottomY, bowlMidY, zBowlBack);
    const bellyMesh = new THREE.Mesh(bellyGeo, ceramicMat);
    bellyMesh.name = 'toilet_bowl_lower';
    group.add(bellyMesh);

    // Subtle pale-blue water surface inside the lower basin (visible when lid opens!)
    const waterGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.004, 24);
    waterGeo.scale(1.0, 1.0, 1.35);
    const waterMesh = new THREE.Mesh(waterGeo, bowlWaterMat);
    waterMesh.name = 'toilet_bowl_water';
    waterMesh.position.set(0, bowlMidY - 0.014, zBowlBack + actualBowlProj * 0.54);
    group.add(waterMesh);

    // Upper hollow rimless ceramic bowl ring (Y: 0.275 .. 0.400 m, exact non-overlapping seam at bowlMidY)
    const upperGeo = createDExtrusion(
      bowlW,
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

    // -------------------------------------------------------------------------
    // 4. Open Slim Seat Ring + Animated Hinged Soft-Close Lid
    // -------------------------------------------------------------------------
    const seatW = bowlW - 0.004;
    const seatD = actualBowlProj - 0.006;
    const seatThick = 0.015;
    const lidThick = 0.015;
    const seatBottomY = bowlRimY + 0.003;

    // Open toilet seat ring (visible when the lid lifts open!)
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
      new THREE.BoxGeometry(bowlW + 0.06, 0.48, actualBowlProj + 0.04),
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
          openAngle: -Math.PI * 0.51, // ~92° upright, stays ~1.5 cm clear of cistern
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
