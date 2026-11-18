import * as THREE from 'three';
import { AssetPrefabDefinition, AssetBuilderContext } from '../assetTypes';
import { MaterialId } from '../../model/materials';
import { m, cm } from '../../model/units';

export interface BrickArchBuildResult {
  group: THREE.Group;
  outerBorderMesh: THREE.Mesh;
  recessedInfillMesh: THREE.Mesh;
}

/**
 * Shared procedural builder for the asymmetrical red-brick entrance portal.
 *
 * Local coordinate convention (origin at bottom-center of the 1.50 m portal):
 * - X spans [-0.75, +0.75] (total width 1.50 m)
 * - Y spans [0.00, 2.83] (door height 2.08 m + semicircular arch radius 0.75 m)
 * - Z starts at 0.00 (main facade brick face) and extrudes outward toward +Z.
 *
 * Door opening sits asymmetrically on the left:
 * - Left border leg:  X in [-0.75, -0.62] (13 cm)
 * - Door opening:     X in [-0.62, +0.43] (105 cm, centered at X = -0.095 m)
 * - Right brick pier: X in [+0.43, +0.62] (19 cm recessed infill)
 * - Right border leg: X in [+0.62, +0.75] (13 cm)
 */
export function buildDecorativeBrickArchMeshes(
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  outerReliefDepth = 0.076,
  infillReliefDepth = 0.044
): BrickArchBuildResult {
  const group = new THREE.Group();

  const rOuter = 0.75; // 1.50 m total portal width / 2
  const rInner = 0.62; // 13 cm outer arch border (rollaag)
  const springY = 2.08; // Top of door frame
  const doorRightLocalX = 0.43; // Right edge of 1.05 m door opening in portal space

  // Slightly deeper derivative of exterior_arch_brick for the recessed tympanum & right pier
  const archBrickMat = getMat('exterior_arch_brick');
  const infillMat = new THREE.MeshStandardMaterial({
    color: archBrickMat.color.clone().multiplyScalar(0.88),
    roughness: archBrickMat.roughness,
    metalness: archBrickMat.metalness,
    name: 'arch_tympanum_brick',
  });

  // 1. Continuous Outer U-Shaped Arch Border (Left leg + Semicircular Arch + Right leg)
  const borderShape = new THREE.Shape();
  borderShape.moveTo(-rOuter, 0);
  borderShape.lineTo(-rInner, 0);
  borderShape.lineTo(-rInner, springY);
  borderShape.absarc(0, springY, rInner, Math.PI, 0, true);
  borderShape.lineTo(rInner, 0);
  borderShape.lineTo(rOuter, 0);
  borderShape.lineTo(rOuter, springY);
  borderShape.absarc(0, springY, rOuter, 0, Math.PI, false);
  borderShape.closePath();

  const borderGeo = new THREE.ExtrudeGeometry(borderShape, {
    depth: outerReliefDepth,
    bevelEnabled: false,
    curveSegments: 36,
  });
  const outerBorderMesh = new THREE.Mesh(borderGeo, archBrickMat);
  outerBorderMesh.castShadow = true;
  outerBorderMesh.receiveShadow = true;
  group.add(outerBorderMesh);

  // 2. Slightly Recessed Red-Brick Infill (Tympanum above door + Right brick pier)
  const infillShape = new THREE.Shape();
  infillShape.moveTo(doorRightLocalX, 0);
  infillShape.lineTo(rInner, 0);
  infillShape.lineTo(rInner, springY);
  infillShape.absarc(0, springY, rInner, 0, Math.PI, false);
  infillShape.lineTo(doorRightLocalX, springY);
  infillShape.closePath();

  const infillGeo = new THREE.ExtrudeGeometry(infillShape, {
    depth: infillReliefDepth,
    bevelEnabled: false,
    curveSegments: 36,
  });
  const recessedInfillMesh = new THREE.Mesh(infillGeo, infillMat);
  recessedInfillMesh.castShadow = true;
  recessedInfillMesh.receiveShadow = true;
  group.add(recessedInfillMesh);

  return { group, outerBorderMesh, recessedInfillMesh };
}

/**
 * Build a rounded brushed-steel door shield ("langschild") with Euro cylinder and
 * cylindrical lever grip on both sides of a door leaf.
 */
export function createBrushedSteelLeverHandle(params: {
  leafThickness: number;
  handleMat: THREE.Material;
  leverDirection?: 1 | -1;
  exteriorOnly?: boolean;
}): THREE.Group {
  const { leafThickness, handleMat, leverDirection = -1, exteriorOnly = false } = params;
  const group = new THREE.Group();

  const shieldW = 0.036;
  const shieldR = shieldW / 2;
  const shieldStraightH = 0.145;

  const shieldShape = new THREE.Shape();
  shieldShape.absarc(0, shieldStraightH / 2, shieldR, 0, Math.PI, false);
  shieldShape.absarc(0, -shieldStraightH / 2, shieldR, Math.PI, Math.PI * 2, false);
  shieldShape.closePath();

  const shieldDepth = exteriorOnly ? 0.01 : leafThickness + 0.014;
  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, {
    depth: shieldDepth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  shieldGeo.translate(0, 0, exteriorOnly ? leafThickness / 2 - 0.002 : -shieldDepth / 2);
  group.add(new THREE.Mesh(shieldGeo, handleMat));

  // Subtle Euro cylinder keyhole on the lower half of the rounded shield
  const cylDepth = exteriorOnly ? 0.014 : shieldDepth + 0.004;
  const cylinderGeo = new THREE.CylinderGeometry(0.0085, 0.0085, cylDepth, 14);
  cylinderGeo.rotateX(Math.PI / 2);
  const cylinderMesh = new THREE.Mesh(cylinderGeo, handleMat);
  cylinderMesh.position.set(0, -0.048, exteriorOnly ? leafThickness / 2 + 0.003 : 0);
  group.add(cylinderMesh);

  // Round cylindrical handle neck (through both sides, or exterior-only for garage door)
  const leverY = 0.032;
  const neckOffsetZ = leafThickness / 2 + 0.034;
  const neckLen = exteriorOnly ? 0.036 : neckOffsetZ * 2;
  const neckRadius = 0.009;
  const neckGeo = new THREE.CylinderGeometry(neckRadius, neckRadius, neckLen, 16);
  neckGeo.rotateX(Math.PI / 2);
  const neckMesh = new THREE.Mesh(neckGeo, handleMat);
  neckMesh.position.set(0, leverY, exteriorOnly ? leafThickness / 2 + 0.016 : 0);
  group.add(neckMesh);

  // Round cylindrical lever grip + rounded elbow & tip
  const gripLen = 0.112;
  const gripGeo = new THREE.CylinderGeometry(neckRadius, neckRadius, gripLen, 16);
  gripGeo.rotateZ(Math.PI / 2);
  const jointGeo = new THREE.SphereGeometry(neckRadius, 14, 10);

  const sides = exteriorOnly ? [1] : [1, -1];
  for (const side of sides) {
    const zPos = side * neckOffsetZ;
    const elbow = new THREE.Mesh(jointGeo, handleMat);
    elbow.position.set(0, leverY, zPos);
    group.add(elbow);

    const grip = new THREE.Mesh(gripGeo, handleMat);
    grip.position.set((leverDirection * gripLen) / 2, leverY, zPos);
    group.add(grip);

    const tip = new THREE.Mesh(jointGeo, handleMat);
    tip.position.set(leverDirection * gripLen, leverY, zPos);
    group.add(tip);
  }

  return group;
}

/**
 * Builds the sage-green entrance door leaf with a true extruded cutout for the
 * vertical vision window, thin glazing bead, glass pane, and brushed metal handle.
 *
 * Local origin is at the hinge-side center (X: [0, innerW], Y: [-innerH/2, +innerH/2], Z: [-leafThickness/2, +leafThickness/2]).
 */
export function buildDoorLeafWithVisionCutout(params: {
  innerW: number;
  innerH: number;
  leafThickness: number;
  doorMat: THREE.MeshStandardMaterial;
  frameMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  handleMat: THREE.MeshStandardMaterial;
}): { leafPivotContent: THREE.Group; leafMesh: THREE.Mesh } {
  const { innerW, innerH, leafThickness, doorMat, frameMat, glassMat, handleMat } = params;
  const container = new THREE.Group();

  const visionW = 0.22;
  const visionH = Math.min(1.28, innerH * 0.64);
  const visionCenterX = innerW / 2;
  const visionCenterY = 0.08; // Slightly above vertical midpoint

  // Extruded door leaf with real rectangular hole for the glass
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -innerH / 2);
  leafShape.lineTo(innerW, -innerH / 2);
  leafShape.lineTo(innerW, innerH / 2);
  leafShape.lineTo(0, innerH / 2);
  leafShape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(visionCenterX - visionW / 2, visionCenterY - visionH / 2);
  hole.lineTo(visionCenterX + visionW / 2, visionCenterY - visionH / 2);
  hole.lineTo(visionCenterX + visionW / 2, visionCenterY + visionH / 2);
  hole.lineTo(visionCenterX - visionW / 2, visionCenterY + visionH / 2);
  hole.closePath();
  leafShape.holes.push(hole);

  const leafGeo = new THREE.ExtrudeGeometry(leafShape, {
    depth: leafThickness,
    bevelEnabled: false,
  });
  leafGeo.translate(0, 0, -leafThickness / 2);

  const leafMesh = new THREE.Mesh(leafGeo, doorMat);
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = true;
  container.add(leafMesh);

  // Subtle inner glazing bead lining the cutout
  const beadW = 0.016;
  const beadDepth = leafThickness + 0.004;
  const beadShape = new THREE.Shape();
  beadShape.moveTo(visionCenterX - visionW / 2 - beadW, visionCenterY - visionH / 2 - beadW);
  beadShape.lineTo(visionCenterX + visionW / 2 + beadW, visionCenterY - visionH / 2 - beadW);
  beadShape.lineTo(visionCenterX + visionW / 2 + beadW, visionCenterY + visionH / 2 + beadW);
  beadShape.lineTo(visionCenterX - visionW / 2 - beadW, visionCenterY + visionH / 2 + beadW);
  beadShape.closePath();

  const beadHole = new THREE.Path();
  beadHole.moveTo(visionCenterX - visionW / 2, visionCenterY - visionH / 2);
  beadHole.lineTo(visionCenterX + visionW / 2, visionCenterY - visionH / 2);
  beadHole.lineTo(visionCenterX + visionW / 2, visionCenterY + visionH / 2);
  beadHole.lineTo(visionCenterX - visionW / 2, visionCenterY + visionH / 2);
  beadHole.closePath();
  beadShape.holes.push(beadHole);

  const beadGeo = new THREE.ExtrudeGeometry(beadShape, {
    depth: beadDepth,
    bevelEnabled: false,
  });
  beadGeo.translate(0, 0, -beadDepth / 2);
  const beadMesh = new THREE.Mesh(beadGeo, frameMat);
  container.add(beadMesh);

  // Transparent vision glass pane
  const glassPane = new THREE.Mesh(
    new THREE.BoxGeometry(visionW, visionH, 0.014),
    glassMat
  );
  glassPane.position.set(visionCenterX, visionCenterY, 0);
  container.add(glassPane);

  // Rounded pill-shaped door shield (langschild) + cylindrical lever handle
  const handleGroup = createBrushedSteelLeverHandle({
    leafThickness,
    handleMat,
    leverDirection: -1,
  });
  handleGroup.position.set(innerW - 0.075, -0.02, 0);
  container.add(handleGroup);

  return { leafPivotContent: container, leafMesh };
}

/**
 * Inspectable 3D Asset Prefab for the Front Entrance Portal & Door.
 * Registered in `ASSET_PREFABS` so it can be inspected in `asset-viewer.html`.
 */
export const frontDoorArchPrefab: AssetPrefabDefinition = {
  prefabId: 'front_entrance_portal',
  defaultLabel: 'Voordeur & Asymmetrische Gemetselde Boog',
  defaultDimensions: {
    width: m(1.50, 'verified_drawing', 'Totale breedte gemetseld entreeportaal 150 cm (VK-06 & HomeByMe)'),
    depth: cm(20, 'user_supplied', 'Totale diepte entreedeur-kozijn inclusief gemetseld reliëf (20 cm)'),
    height: m(2.83, 'verified_drawing', 'Hoogte tot bovenzijde rollaagboog 283 cm (208 cm deur + 75 cm boogradius)'),
  },
  build3D: (ctx: AssetBuilderContext) => {
    const group = new THREE.Group();
    const { getMat } = ctx;

    const frameMat = getMat('window_frame_cream');
    const doorMat = getMat('door_exterior_sage');
    const glassMat = getMat('window_glass_day');
    const handleMat = new THREE.MeshStandardMaterial({
      color: '#a8aeb5',
      roughness: 0.35,
      metalness: 0.75,
      name: 'door_handle_steel',
    });

    // Depth layout (Z spans [-0.100, +0.100]):
    // - Brick portal wall plane at Z = +0.024, outer relief (+7.6 cm) reaches +0.100
    // - Recessed door casing (11 cm deep) centered at Z = -0.030 (Z: -0.085 .. +0.025)
    // - Interior door handle back tip reaches -0.030 - 0.070 = -0.100
    const archResult = buildDecorativeBrickArchMeshes(getMat, 0.076, 0.044);
    archResult.group.position.set(0, 0, 0.024);
    group.add(archResult.group);

    // Door opening spans X in [-0.62, +0.43] (width = 1.05 m, centered at X = -0.095 m)
    const doorW = 1.05;
    const doorH = 2.08;
    const doorCenterX = -0.095;
    const frameThick = 0.065;
    const frameDepth = 0.11;
    const frameCenterZ = -0.030;

    // Cream Door Frame (left, right, top)
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, frameThick, frameDepth),
      frameMat
    );
    topBar.position.set(doorCenterX, doorH - frameThick / 2, frameCenterZ);
    topBar.castShadow = true;
    group.add(topBar);

    const leftBar = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, doorH, frameDepth),
      frameMat
    );
    leftBar.position.set(doorCenterX - doorW / 2 + frameThick / 2, doorH / 2, frameCenterZ);
    leftBar.castShadow = true;
    group.add(leftBar);

    const rightBar = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, doorH, frameDepth),
      frameMat
    );
    rightBar.position.set(doorCenterX + doorW / 2 - frameThick / 2, doorH / 2, frameCenterZ);
    rightBar.castShadow = true;
    group.add(rightBar);

    // Dark Belgian Bluestone Threshold (Hardsteen Onderdorpel)
    const bluestoneMat = new THREE.MeshStandardMaterial({
      color: '#4f5359',
      roughness: 0.85,
      metalness: 0.04,
      name: 'threshold_bluestone',
    });
    const thresholdH = 0.045;
    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, thresholdH, 0.14),
      bluestoneMat
    );
    threshold.position.set(doorCenterX, thresholdH / 2, -0.01);
    threshold.receiveShadow = true;
    group.add(threshold);

    // Hinged Door Leaf with real cutout vision glass (swings inward -Z)
    const innerW = doorW - frameThick * 2;
    const innerH = doorH - frameThick - thresholdH;
    const { leafPivotContent, leafMesh } = buildDoorLeafWithVisionCutout({
      innerW,
      innerH,
      leafThickness: 0.054,
      doorMat,
      frameMat,
      glassMat,
      handleMat,
    });

    const pivot = new THREE.Group();
    pivot.position.set(
      doorCenterX - innerW / 2,
      thresholdH + innerH / 2,
      frameCenterZ
    );
    pivot.add(leafPivotContent);
    group.add(pivot);

    if (ctx.registerInteractiveDoor) {
      const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, 0.16),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      trigger.position.set(doorCenterX, doorH / 2, 0);
      trigger.userData.isInteractiveTrigger = true;
      group.add(trigger);

      ctx.registerInteractiveDoor({
        pivots: [{ group: pivot, openAngle: Math.PI * 0.45, closedAngle: 0, currentAngle: 0 }],
        triggerMeshes: [trigger, leafMesh],
      });
    }

    return group;
  },
};
