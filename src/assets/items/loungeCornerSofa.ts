import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Create a centered 3D box geometry with smooth rounded corners & bevelled edges
 * whose exact outer bounding box is (w × h × d).
 */
function createRoundedBoxGeo(w: number, h: number, d: number, radius: number, bevelSegments = 3): THREE.BufferGeometry {
  const r = Math.min(radius, w * 0.24, h * 0.24, d * 0.24);
  const iw = Math.max(0.01, w - 2 * r);
  const ih = Math.max(0.01, h - 2 * r);
  const id = Math.max(0.01, d - 2 * r);
  const hw = iw / 2;
  const hd = id / 2;
  const c = Math.min(r * 0.6, hw * 0.5, hd * 0.5);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hd);
  shape.lineTo(hw - c, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + c);
  shape.lineTo(hw, hd - c);
  shape.quadraticCurveTo(hw, hd, hw - c, hd);
  shape.lineTo(-hw + c, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - c);
  shape.lineTo(-hw, -hd + c);
  shape.quadraticCurveTo(-hw, -hd, -hw + c, -hd);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: ih,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  return geo;
}

/**
 * Outdoor L-shaped Corner Lounge Sofa ("Loungeset Hoekbank")
 *
 * Local convention (rotationDeg = 0):
 * - X spans [-width/2, +width/2] (265 cm wide along the rear schutting)
 * - Y spans [0, height] (78 cm tall)
 * - Z spans [-depth/2, +depth/2] (215 cm deep along the right schutting; +Z faces into the garden)
 */
export const loungeCornerSofaPrefab: AssetPrefabDefinition = {
  prefabId: 'lounge_corner_sofa',
  defaultLabel: 'Tuin Loungeset Hoekbank',
  defaultDimensions: {
    width: cm(265, 'user_supplied', 'Back garden lounge corner sofa width 265 cm'),
    depth: cm(215, 'user_supplied', 'Back garden lounge corner sofa depth 215 cm'),
    height: cm(78, 'user_supplied', 'Back garden lounge corner sofa height 78 cm'),
  },
  build3D: ({ width, depth, height, getMat }) => {
    const group = new THREE.Group();

    const woodMat = getMat('plot_gate_timber');
    const cushionMat = new THREE.MeshStandardMaterial({
      color: '#ebe3d5',
      roughness: 0.92,
      metalness: 0.0,
    });
    const pillowSageMat = new THREE.MeshStandardMaterial({
      color: '#7d8c6d',
      roughness: 0.94,
      metalness: 0.0,
    });
    const pillowSandMat = new THREE.MeshStandardMaterial({
      color: '#c7beae',
      roughness: 0.94,
      metalness: 0.0,
    });

    const armDepth = 0.86;
    const legH = 0.14;
    const baseThick = 0.08;
    const seatY = legH + baseThick; // 0.22 m
    const seatCushionH = 0.14;
    const backFrameH = height - legH - baseThick - 0.08;

    const addRoundedBox = (
      w: number,
      h: number,
      d: number,
      radius: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      rotX = 0,
      rotY = 0,
      rotZ = 0
    ) => {
      const mesh = new THREE.Mesh(createRoundedBoxGeo(w, h, d, radius), mat);
      mesh.position.set(x, y, z);
      if (rotX) mesh.rotation.x = rotX;
      if (rotY) mesh.rotation.y = rotY;
      if (rotZ) mesh.rotation.z = rotZ;
      group.add(mesh);
      return mesh;
    };

    // 1. Timber Base Frames (Main rear section along -Z, Return section along +X)
    const rearZCenter = -depth / 2 + armDepth / 2;
    addRoundedBox(width, baseThick, armDepth, 0.016, 0, legH + baseThick / 2, rearZCenter, woodMat);

    const returnDepth = depth - armDepth;
    const returnXCenter = width / 2 - armDepth / 2;
    const returnZCenter = -depth / 2 + armDepth + returnDepth / 2;
    addRoundedBox(armDepth, baseThick, returnDepth, 0.016, returnXCenter, legH + baseThick / 2, returnZCenter, woodMat);

    // 2. Rounded Timber Legs
    const legR = 0.028;
    const legGeo = new THREE.CylinderGeometry(legR, legR * 0.85, legH, 10);
    const legPositions: Array<[number, number]> = [
      [-width / 2 + 0.06, -depth / 2 + 0.06],
      [-width / 2 + 0.06, -depth / 2 + armDepth - 0.06],
      [0, -depth / 2 + 0.06],
      [0, -depth / 2 + armDepth - 0.06],
      [width / 2 - 0.06, -depth / 2 + 0.06],
      [width / 2 - armDepth + 0.06, -depth / 2 + armDepth + 0.06],
      [width / 2 - armDepth + 0.06, depth / 2 - 0.06],
      [width / 2 - 0.06, depth / 2 - 0.06],
    ];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, legH / 2, lz);
      group.add(leg);
    }

    // 3. Softly Rounded Timber Backrests & End Side-Tables/Armrests
    const backThick = 0.07;
    addRoundedBox(width, backFrameH, backThick, 0.016, 0, seatY + backFrameH / 2, -depth / 2 + backThick / 2, woodMat);
    addRoundedBox(
      backThick,
      backFrameH,
      depth - backThick,
      0.016,
      width / 2 - backThick / 2,
      seatY + backFrameH / 2,
      backThick / 2,
      woodMat
    );
    const capH = 0.18;
    addRoundedBox(0.24, capH, armDepth - backThick, 0.018, -width / 2 + 0.12, seatY + capH / 2, rearZCenter + backThick / 2, woodMat);
    addRoundedBox(armDepth - backThick, capH, 0.24, 0.018, returnXCenter - backThick / 2, seatY + capH / 2, depth / 2 - 0.12, woodMat);

    // 4. Plump Rounded Seat Cushions
    const gap = 0.015;
    const rearSeatStartX = -width / 2 + 0.25;
    const rearSeatEndX = width / 2 - backThick - 0.01;
    const rearSeatSpan = rearSeatEndX - rearSeatStartX;
    const rearCushionW = (rearSeatSpan - gap * 2) / 3;
    const seatD = armDepth - backThick - 0.03;
    const seatZ = -depth / 2 + backThick + seatD / 2 + 0.01;

    for (let i = 0; i < 3; i++) {
      const cx = rearSeatStartX + (i + 0.5) * rearCushionW + i * gap;
      addRoundedBox(rearCushionW, seatCushionH, seatD, 0.04, cx, seatY + seatCushionH / 2, seatZ, cushionMat);
    }

    const retSeatStartZ = -depth / 2 + armDepth + gap;
    const retSeatEndZ = depth / 2 - 0.25;
    const retSeatSpan = retSeatEndZ - retSeatStartZ;
    const retCushionD = (retSeatSpan - gap) / 2;
    const retCushionW = armDepth - backThick - 0.03;
    const retSeatX = width / 2 - backThick - retCushionW / 2 - 0.01;

    for (let i = 0; i < 2; i++) {
      const cz = retSeatStartZ + (i + 0.5) * retCushionD + i * gap;
      addRoundedBox(retCushionW, seatCushionH, retCushionD, 0.04, retSeatX, seatY + seatCushionH / 2, cz, cushionMat);
    }

    // 5. Plump Rounded Back Cushions
    const backCushionH = height - seatY - seatCushionH + 0.04;
    const backCushionThick = 0.16;
    const backCushionY = seatY + seatCushionH + backCushionH / 2 - 0.03;

    for (let i = 0; i < 3; i++) {
      const cx = rearSeatStartX + (i + 0.5) * rearCushionW + i * gap;
      addRoundedBox(
        rearCushionW - 0.01,
        backCushionH,
        backCushionThick,
        0.045,
        cx,
        backCushionY,
        -depth / 2 + backThick + backCushionThick / 2 + 0.03,
        cushionMat,
        -0.12,
        0,
        0
      );
    }

    const sideBackStartZ = -depth / 2 + armDepth * 0.72;
    const sideBackSpan = retSeatEndZ - sideBackStartZ;
    const sideBackD = (sideBackSpan - gap) / 2;
    for (let i = 0; i < 2; i++) {
      const cz = sideBackStartZ + (i + 0.5) * sideBackD + i * gap;
      addRoundedBox(
        backCushionThick,
        backCushionH,
        sideBackD - 0.01,
        0.045,
        width / 2 - backThick - backCushionThick / 2 - 0.03,
        backCushionY,
        cz,
        cushionMat,
        0,
        0,
        0.12
      );
    }

    // 6. Soft Rounded Throw Pillows
    addRoundedBox(0.36, 0.34, 0.12, 0.042, -width / 2 + 0.48, seatY + seatCushionH + 0.17, -depth / 2 + backThick + 0.22, pillowSageMat, -0.22, 0.35, 0);
    addRoundedBox(0.34, 0.32, 0.12, 0.042, width / 2 - 0.32, seatY + seatCushionH + 0.16, -depth / 2 + 0.32, pillowSandMat, -0.2, -0.65, 0.12);
    addRoundedBox(0.36, 0.34, 0.12, 0.042, width / 2 - backThick - 0.22, seatY + seatCushionH + 0.17, depth / 2 - 0.52, pillowSageMat, 0.15, -0.35, 0.2);

    return group;
  },
};
