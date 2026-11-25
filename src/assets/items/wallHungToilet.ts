import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Creates a clean D-shaped (flat back, semicircular front) 2D shape in XY
 * spanning X in [-w/2, +w/2] and Y in [0, d], where Y=0 is the flat back
 * mounted against the concealed cistern wall and Y=d is the rounded front nose.
 */
function createDShape(w: number, d: number): THREE.Shape {
  const halfW = w / 2;
  const r = Math.min(halfW, d * 0.55);
  const straightLen = Math.max(0.005, d - r);

  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.lineTo(halfW, 0);
  shape.lineTo(halfW, straightLen);
  // Semicircular front nose (in XY: center at (0, straightLen), radius r from 0 -> PI)
  shape.absarc(0, straightLen, halfW, 0, Math.PI, false);
  shape.lineTo(-halfW, 0);
  shape.closePath();
  return shape;
}

/**
 * Extrudes a D-shaped horizontal slab (e.g., ceramic rim, toilet seat, or lid)
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
  yBottom: number
): THREE.BufferGeometry {
  const b = Math.min(bevel, thickness * 0.42, w * 0.12, depthProj * 0.12);
  const innerW = Math.max(0.04, w - 2 * b);
  const innerD = Math.max(0.04, depthProj - 2 * b);
  const coreThick = Math.max(0.004, thickness - 2 * b);

  const shape = createDShape(innerW, innerD);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: coreThick,
    bevelEnabled: b > 0.0005,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    curveSegments: 28,
  });

  // ExtrudeGeometry extrudes along +Z, with shape in XY (Y=0..innerD).
  // Rotate +90° around X: shape +Y becomes +Z (projection forward), extrude +Z becomes -Y.
  geo.rotateX(Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;

  // Translate so X is centered, back is at zBack, and bottom is at yBottom
  const cx = (bb.min.x + bb.max.x) / 2;
  geo.translate(-cx, yBottom - bb.min.y, zBack - bb.min.z);

  // Normalize exact target extents in case curve tessellation deviates by sub-millimetre
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
 * Builds a smoothly lofted, tapered lower ceramic bowl body (modern floating
 * Geberit Renova wandcloset profile) from yBottom (e.g. 0.10 m) to yTop (e.g. 0.30 m).
 * Each horizontal ring is a D-shape whose width & projection smoothly ease inward
 * toward the underside for a sleek, modern architectural silhouette.
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
    // Distribute points cleanly around: back wall -> right straight -> front arc -> left straight
    const backPts = 6;
    const sidePts = 5;
    const arcPts = count - backPts - 2 * sidePts; // 20

    // 1. Back wall (left to right along z=0)
    for (let i = 0; i < backPts; i++) {
      const t = i / backPts;
      pts.push([-hw + t * w, 0]);
    }
    // 2. Right straight (z=0 -> z=straight)
    for (let i = 0; i < sidePts; i++) {
      const t = i / sidePts;
      pts.push([hw, t * straight]);
    }
    // 3. Front semicircle (angle 0 -> PI)
    for (let i = 0; i < arcPts; i++) {
      const t = i / arcPts;
      const a = t * Math.PI;
      pts.push([Math.cos(a) * hw, straight + Math.sin(a) * hw]);
    }
    // 4. Left straight (z=straight -> z=0)
    for (let i = 0; i < sidePts; i++) {
      const t = i / sidePts;
      pts.push([-hw, straight * (1 - t)]);
    }
    return pts;
  }

  for (let r = 0; r < numRings; r++) {
    const v = r / (numRings - 1); // 0 = bottom, 1 = top
    // Smooth architectural curve: gently rounded underside sweeping up into full apron
    const ease = Math.pow(v, 0.52);
    const ringW = topW * (0.48 + 0.52 * ease);
    const ringD = topD * (0.46 + 0.54 * ease);
    const y = yBottom + v * (yTop - yBottom);
    const ring = sampleDPerimeter(ringW, ringD, ptsPerRing);
    for (const [px, pz] of ring) {
      positions.push(px, y, zBack + pz);
    }
  }

  // Side quads between adjacent rings
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

  // Close bottom cap cleanly
  const bottomCenterIdx = positions.length / 3;
  positions.push(0, yBottom, zBack + topD * 0.23);
  for (let i = 0; i < ptsPerRing; i++) {
    const iNext = (i + 1) % ptsPerRing;
    indices.push(bottomCenterIdx, i, iNext);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Modern Wall-Hung Toilet (Geberit Renova Wandcloset) with Concealed Cistern Enclosure
 *
 * Specifications from Technische Omschrijving (§16.2 & §23) & HomeByMe:
 * - Concealed flush reservoir (inbouwreservoir voorzetwand): 17 cm deep × 100 cm high,
 *   spanning full alcove width (91 cm on 1st floor Badkamer, 92 cm on Ground floor Toiletruimte),
 *   finished in matte white wall tile tone with a tiled top ledge (plateau) and satin-chrome edge trim.
 * - Wall-hung toilet bowl (Geberit Renova): 36 cm wide × 53 cm projection (total depth 70 cm),
 *   floating 10 cm above the floor, rim at 40 cm, slim soft-close seat & lid at 43.6 cm.
 * - Dual-flush actuator plate (waterbesparende spoelstop) centered at Y = 84 cm.
 */
export const wallHungToiletPrefab: AssetPrefabDefinition = {
  prefabId: 'wall_hung_toilet',
  defaultLabel: 'Wandcloset met Inbouwreservoir (Geberit Renova)',
  defaultDimensions: {
    width: cm(91, 'user_supplied', '1st floor Badkamer toilet alcove width (91 cm); overridden to 92 cm on Ground floor'),
    depth: cm(70, 'user_supplied', '17 cm concealed flush reservoir (HomeByMe) + 53 cm Geberit Renova wall-hung bowl = 70 cm'),
    height: cm(100, 'user_supplied', 'HomeByMe concealed flush reservoir (inbouwreservoir) height 100 cm'),
  },
  build3D: ({ width, depth, height }) => {
    const group = new THREE.Group();

    // Materials tuned to the soft architectural diorama aesthetic
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
      roughness: 0.30,
      metalness: 0.02,
    });
    const seatMat = new THREE.MeshStandardMaterial({
      color: '#f5f4f0',
      roughness: 0.40,
      metalness: 0.02,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#cfd4d8',
      roughness: 0.34,
      metalness: 0.38,
    });
    const flushPlateMat = new THREE.MeshStandardMaterial({
      color: '#f2f1ed',
      roughness: 0.42,
      metalness: 0.06,
    });
    const shadowGapMat = new THREE.MeshStandardMaterial({
      color: '#d8d4cc',
      roughness: 0.90,
      metalness: 0.0,
    });

    const cisternDepth = Math.min(0.17, depth * 0.45);
    const bowlProj = Math.max(0.30, depth - cisternDepth); // 53 cm at canonical 70 cm depth
    const zBack = -depth / 2;
    const zCisternFront = zBack + cisternDepth;

    // -------------------------------------------------------------------------
    // 1. Concealed Cistern Enclosure (Inbouwreservoir Voorzetwand — W × 17 × 100 cm)
    // -------------------------------------------------------------------------
    const plateauThick = 0.022;
    const bodyH = Math.max(0.20, height - plateauThick);

    const cisternBody = new THREE.Mesh(
      new THREE.BoxGeometry(width, bodyH, cisternDepth),
      cisternTileMat
    );
    cisternBody.name = 'toilet_cistern_enclosure';
    cisternBody.position.set(0, bodyH / 2, zBack + cisternDepth / 2);
    group.add(cisternBody);

    // Tiled top ledge (plateau) with crisp architectural profile
    const plateau = new THREE.Mesh(
      new THREE.BoxGeometry(width, plateauThick, cisternDepth),
      plateauMat
    );
    plateau.name = 'toilet_cistern_plateau';
    plateau.position.set(0, bodyH + plateauThick / 2, zBack + cisternDepth / 2);
    group.add(plateau);

    // Subtle tile corner trim profile (tegelhoekprofiel) along the front top edge
    const trimSize = 0.008;
    const edgeTrim = new THREE.Mesh(
      new THREE.BoxGeometry(width, trimSize, trimSize),
      chromeMat
    );
    edgeTrim.name = 'toilet_plateau_trim';
    edgeTrim.position.set(0, height - trimSize / 2, zCisternFront - trimSize / 2 + 0.001);
    group.add(edgeTrim);

    // -------------------------------------------------------------------------
    // 2. Dual-Flush Actuator Plate (Bedieningsplaat, waterbesparende spoelstop)
    // -------------------------------------------------------------------------
    const plateW = 0.24;
    const plateH = 0.155;
    const plateD = 0.010;
    const plateY = Math.min(height - 0.14, 0.84);

    const plateFrame = new THREE.Mesh(
      new THREE.BoxGeometry(plateW, plateH, plateD),
      flushPlateMat
    );
    plateFrame.name = 'toilet_flush_plate';
    plateFrame.position.set(0, plateY, zCisternFront + plateD / 2);
    group.add(plateFrame);

    // Recessed button surround shadow line
    const surround = new THREE.Mesh(
      new THREE.BoxGeometry(plateW - 0.026, plateH - 0.028, 0.003),
      shadowGapMat
    );
    surround.name = 'toilet_flush_plate_recess';
    surround.position.set(0, plateY, zCisternFront + plateD + 0.0005);
    group.add(surround);

    // Large (full flush) & small (water-saving flush) modern rectangular buttons
    const btnH = plateH - 0.036;
    const largeBtnW = 0.118;
    const smallBtnW = 0.072;
    const btnGap = 0.010;
    const totalBtnsW = largeBtnW + btnGap + smallBtnW;
    const leftEdgeX = -totalBtnsW / 2;

    const largeBtn = new THREE.Mesh(
      new THREE.BoxGeometry(largeBtnW, btnH, 0.005),
      chromeMat
    );
    largeBtn.name = 'toilet_flush_button_full';
    largeBtn.position.set(
      leftEdgeX + largeBtnW / 2,
      plateY,
      zCisternFront + plateD + 0.0025
    );
    group.add(largeBtn);

    const smallBtn = new THREE.Mesh(
      new THREE.BoxGeometry(smallBtnW, btnH, 0.005),
      chromeMat
    );
    smallBtn.name = 'toilet_flush_button_eco';
    smallBtn.position.set(
      leftEdgeX + largeBtnW + btnGap + smallBtnW / 2,
      plateY,
      zCisternFront + plateD + 0.0025
    );
    group.add(smallBtn);

    // -------------------------------------------------------------------------
    // 3. Wall-Hung Ceramic Toilet Bowl (Geberit Renova — 36 × 53 cm, floating)
    // -------------------------------------------------------------------------
    const bowlW = Math.min(0.36, width - 0.08);
    const bowlBottomY = 0.105; // Floating 10.5 cm above floor
    const bowlMidY = 0.275;
    const bowlRimY = 0.400; // Standard European 40 cm ceramic rim height

    // Lower smoothly tapered ceramic belly
    const bellyGeo = createLoftedBowlBelly(bowlW, bowlProj, bowlBottomY, bowlMidY, zCisternFront);
    const bellyMesh = new THREE.Mesh(bellyGeo, ceramicMat);
    bellyMesh.name = 'toilet_bowl_lower';
    group.add(bellyMesh);

    // Upper ceramic apron & rim (clean D-shape with soft bevelled edge)
    const upperGeo = createDExtrusion(
      bowlW,
      bowlProj,
      bowlRimY - bowlMidY + 0.004,
      0.012,
      zCisternFront,
      bowlMidY - 0.004
    );
    const upperMesh = new THREE.Mesh(upperGeo, ceramicMat);
    upperMesh.name = 'toilet_bowl_upper';
    group.add(upperMesh);

    // -------------------------------------------------------------------------
    // 4. Slim Soft-Close Seat & Closed Lid (Wit Kunststof Closetzitting + Deksel)
    // -------------------------------------------------------------------------
    const seatW = bowlW - 0.006;
    const seatD = bowlProj - 0.008;
    const seatThick = 0.016;
    const lidThick = 0.016;

    const seatGeo = createDExtrusion(
      seatW,
      seatD,
      seatThick,
      0.005,
      zCisternFront + 0.004,
      bowlRimY + 0.003
    );
    const seatMesh = new THREE.Mesh(seatGeo, seatMat);
    seatMesh.name = 'toilet_seat';
    group.add(seatMesh);

    const lidGeo = createDExtrusion(
      seatW,
      seatD - 0.004,
      lidThick,
      0.006,
      zCisternFront + 0.004,
      bowlRimY + 0.003 + seatThick + 0.002
    );
    const lidMesh = new THREE.Mesh(lidGeo, seatMat);
    lidMesh.name = 'toilet_lid';
    group.add(lidMesh);

    // Two subtle chrome hinge barrels at the back of the seat/lid
    const hingeGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.022, 12);
    hingeGeo.rotateZ(Math.PI / 2);
    for (const side of [-1, 1]) {
      const hinge = new THREE.Mesh(hingeGeo, chromeMat);
      hinge.name = side < 0 ? 'toilet_hinge_left' : 'toilet_hinge_right';
      hinge.position.set(side * 0.08, bowlRimY + 0.014, zCisternFront + 0.022);
      group.add(hinge);
    }

    return group;
  },
};
