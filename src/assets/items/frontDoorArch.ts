import * as THREE from 'three';
import { AssetPrefabDefinition, AssetBuilderContext } from '../assetTypes';
import { m, cm } from '../../model/units';

/**
 * Procedural 3D Prefab: Front Entrance Door with Decorative Red-Brown Brick Arch
 * (Voordeur & Gemetselde Boog Linkergevel — Bouwnummer 55)
 *
 * Visual & Architectural Characteristics:
 * - Real builder render (Woning.jpg) + HomeByMe architectural alignment:
 *   - The door is intentionally NOT centered within the red arch:
 *     Left pilaster is 13 cm wide; door is 105 cm; right brick panel is 32 cm wide.
 *     Total portal width is 150 cm (1.50 m).
 *   - The semicircular arch (outer radius 0.75 m, inner radius 0.62 m) is centered on the
 *     entire 1.50 m portal, springing from Y = 2.10 m (top of the door frame) and reaching
 *     Y = 2.85 m (the exact top of the ground floor exterior wall).
 *   - The arch ring consists of radial terracotta-red brick voussoirs (rollaag).
 *   - The tympanum (boogveld) features vertical soldier-course brick headers (staande rollaag).
 *   - Recessed cream door frame (11 cm deep) with dark Belgian bluestone (arduin) threshold.
 *   - Architectural sage-green door leaf with centered vertical vision panel (glasstrook).
 *   - Glazing bead frame, double-glazed vision glass with warm interior glow.
 *   - Brushed stainless steel/graphite safety door handle and Euro-profile escutcheon.
 *   - Modern exterior up/down sconce luminaire mounted on the right brick panel.
 */
export const frontDoorArchPrefab: AssetPrefabDefinition = {
  prefabId: 'front_entrance_portal',
  defaultLabel: 'Voordeur & Decoratieve Gemetselde Boog',
  defaultDimensions: {
    width: m(1.50, 'verified_drawing', 'Totale breedte gemetseld entreeportaal 150 cm (VK-06 & HomeByMe)'),
    depth: cm(26, 'user_supplied', 'Totale diepte entreedeur-assemblage inclusief armatuur en dorpelneus (26 cm)'),
    height: m(2.85, 'verified_drawing', 'Hoogte tot bovenzijde rollaagboog 285 cm (aansluitend op 1e verdiepingsvloer)'),
  },
  build3D: (ctx: AssetBuilderContext) => {
    const group = new THREE.Group();
    const { getMat } = ctx;

    // Semantic Materials
    const archBrickMat = getMat('exterior_arch_brick');
    const wallPlasterMat = getMat('interior_wall_plaster');
    const creamFrameMat = getMat('window_frame_cream');
    const sageDoorMat = getMat('door_exterior_sage');
    const glassMat = getMat('window_glass_day');
    const anthraciteMat = getMat('roof_tile_anthracite');

    // Custom Architectural Accents (bluestone threshold, brick joints, hardware)
    const bluestoneMat = new THREE.MeshStandardMaterial({
      color: '#34383c',
      roughness: 0.88,
      metalness: 0.04,
      name: 'threshold_bluestone',
    });

    const soldierBrickMat = new THREE.MeshStandardMaterial({
      color: '#9c4f3a',
      roughness: 0.94,
      metalness: 0.0,
      name: 'soldier_brick_terracotta',
    });

    const mortarJointMat = new THREE.MeshStandardMaterial({
      color: '#cfc4b6',
      roughness: 0.96,
      metalness: 0.0,
      name: 'brick_mortar_joint',
    });

    const hardwareMetalMat = new THREE.MeshStandardMaterial({
      color: '#4a4d52',
      roughness: 0.32,
      metalness: 0.78,
      name: 'door_hardware_steel',
    });

    const lightLensMat = new THREE.MeshStandardMaterial({
      color: '#fff3d1',
      roughness: 0.25,
      metalness: 0.05,
      emissive: '#ffa947',
      emissiveIntensity: 0.75,
      name: 'wall_light_lens',
    });

    // =========================================================================
    // GEOMETRIC CONSTANTS & OFFSETS
    // =========================================================================
    // Total portal: X: [-0.75, +0.75] (Width = 1.50 m)
    // Height: Y: [0.00, 2.85] (Height = 2.85 m)
    // Depth: Z: [-0.12, +0.12] (Depth = 0.24 m)
    //
    // Z-planes:
    // Z = +0.08 m: Front face of decorative red brick relief
    // Z = +0.04 m: Outer face of exterior wall / door casing front
    // Z = -0.07 m: Rear face of exterior door casing (11 cm frame depth)
    // Z = -0.12 m: Interior reveal / threshold back edge
    // Z = +0.12 m: Bluestone threshold front chamfer / sconce lamp front
    const brickFrontZ = 0.08;
    const reliefDepth = 0.04; // 4 cm proud of main facade plane
    const brickCenterZ = brickFrontZ - reliefDepth / 2; // +0.06 m

    const doorCenterZ = -0.015; // Centered inside frame
    const doorLeafThick = 0.054; // 5.4 cm solid Dutch exterior door

    // Horizontal partition (X):
    const leftPilaW = 0.13;
    const doorW = 1.05;
    const rightPanelW = 0.32;

    const xPortalLeft = -0.75;
    const xDoorLeft = xPortalLeft + leftPilaW; // -0.62 m
    const xDoorRight = xDoorLeft + doorW;     // +0.43 m
    const xPortalRight = xDoorRight + rightPanelW; // +0.75 m

    // Door center in local X
    const doorCenterX = (xDoorLeft + xDoorRight) / 2; // -0.095 m (Offset to left!)

    // Door and Arch heights
    const doorH = 2.08;
    const springY = 2.10; // Top of door frame & arch spring line
    const rOuter = 0.75;  // Outer arch radius
    const rInner = 0.62;  // Inner arch radius (13 cm rollaag)
    const archApexY = springY + rOuter; // 2.85 m

    // =========================================================================
    // 1. REAR INTERIOR CASING & WALL EXTENSION (Z: -0.13 .. +0.04)
    // =========================================================================
    // Interior white plaster return & framing ensuring the asset is solid from all angles
    const interiorReturnW = 1.50;
    const interiorPlasterBack = new THREE.Mesh(
      new THREE.BoxGeometry(interiorReturnW, 0.75, 0.04),
      wallPlasterMat
    );
    interiorPlasterBack.position.set(0, 2.10 + 0.75 / 2, -0.11);
    group.add(interiorPlasterBack);

    const interiorPlasterRight = new THREE.Mesh(
      new THREE.BoxGeometry(rightPanelW, springY, 0.04),
      wallPlasterMat
    );
    interiorPlasterRight.position.set(xDoorRight + rightPanelW / 2, springY / 2, -0.11);
    group.add(interiorPlasterRight);

    const interiorPlasterLeft = new THREE.Mesh(
      new THREE.BoxGeometry(leftPilaW, springY, 0.04),
      wallPlasterMat
    );
    interiorPlasterLeft.position.set(xPortalLeft + leftPilaW / 2, springY / 2, -0.11);
    group.add(interiorPlasterLeft);

    // =========================================================================
    // 2. HARDSTEEN (BLUESTONE) THRESHOLD (Y: 0.00 .. 0.05, Z: -0.13 .. +0.12)
    // =========================================================================
    const thresholdW = doorW + 0.04;
    const thresholdD = 0.23;
    const thresholdH = 0.05;
    const threshold = new THREE.Mesh(
      new THREE.BoxGeometry(thresholdW, thresholdH, thresholdD),
      bluestoneMat
    );
    threshold.position.set(doorCenterX, thresholdH / 2, -0.015);
    threshold.castShadow = true;
    threshold.receiveShadow = true;
    group.add(threshold);

    // Slight chamfered front nose of the bluestone sill
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(thresholdW, 0.02, 0.02),
      bluestoneMat
    );
    nose.position.set(doorCenterX, 0.035, 0.11);
    group.add(nose);

    // =========================================================================
    // 3. DOOR FRAME / CASING (KOZIJN) (Cream Off-White)
    // =========================================================================
    const frameDepth = 0.11;
    const frameThick = 0.065;
    const frameCenterZ = -0.015;

    // Left Frame Jamb
    const frameLeft = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, doorH - thresholdH, frameDepth),
      creamFrameMat
    );
    frameLeft.position.set(xDoorLeft + frameThick / 2, thresholdH + (doorH - thresholdH) / 2, frameCenterZ);
    frameLeft.castShadow = true;
    group.add(frameLeft);

    // Right Frame Jamb
    const frameRight = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, doorH - thresholdH, frameDepth),
      creamFrameMat
    );
    frameRight.position.set(xDoorRight - frameThick / 2, thresholdH + (doorH - thresholdH) / 2, frameCenterZ);
    frameRight.castShadow = true;
    group.add(frameRight);

    // Frame Transom / Lintel Head
    const frameHead = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, frameThick, frameDepth),
      creamFrameMat
    );
    frameHead.position.set(doorCenterX, springY - frameThick / 2, frameCenterZ);
    frameHead.castShadow = true;
    group.add(frameHead);

    // =========================================================================
    // 4. SAGE-GREEN DOOR LEAF WITH CENTERED VISION PANEL & PROFILE
    // =========================================================================
    const doorLeafW = doorW - frameThick * 2 - 0.008; // 4 mm shadow gap on each side
    const doorLeafH = springY - thresholdH - frameThick - 0.008;
    const doorLeafY = thresholdH + 0.004 + doorLeafH / 2;

    // Door Slab
    const doorSlab = new THREE.Mesh(
      new THREE.BoxGeometry(doorLeafW, doorLeafH, doorLeafThick),
      sageDoorMat
    );
    doorSlab.position.set(doorCenterX, doorLeafY, doorCenterZ);
    doorSlab.castShadow = true;
    doorSlab.receiveShadow = true;
    group.add(doorSlab);

    // Vertical Vision Window Cutout Dimensions (Centered in door leaf!)
    const visionW = 0.24;
    const visionH = 1.32;
    const visionY = 0.64 + visionH / 2; // 0.64 m to 1.96 m
    const visionZ = doorCenterZ;

    // Glazing Frame (Bead / Glaslatten in cream/door tone)
    const beadThick = 0.024;
    const beadProfile = new THREE.Mesh(
      new THREE.BoxGeometry(visionW + beadThick * 2, visionH + beadThick * 2, doorLeafThick + 0.012),
      creamFrameMat
    );
    beadProfile.position.set(doorCenterX, visionY, visionZ);
    group.add(beadProfile);

    // Glazing Glass Pane
    const visionGlass = new THREE.Mesh(
      new THREE.BoxGeometry(visionW, visionH, 0.018),
      glassMat
    );
    visionGlass.position.set(doorCenterX, visionY, visionZ);
    group.add(visionGlass);

    // Decorative Raised Door Panel Inset (Architectural Door Moulding)
    const lowerPanelH = 0.45;
    const lowerPanelY = 0.08 + lowerPanelH / 2;
    const lowerPanelMoulding = new THREE.Mesh(
      new THREE.BoxGeometry(doorLeafW * 0.72, lowerPanelH, doorLeafThick + 0.006),
      sageDoorMat
    );
    lowerPanelMoulding.position.set(doorCenterX, lowerPanelY, doorCenterZ);
    group.add(lowerPanelMoulding);

    // =========================================================================
    // 5. DOOR HARDWARE (HANDLE, ESCUTCHEON, LOCK)
    // =========================================================================
    const handleX = xDoorRight - frameThick - 0.075; // Right stile
    const handleY = 1.05; // Standard Dutch handle height
    const handleFrontZ = doorCenterZ + doorLeafThick / 2 + 0.005;

    // Security Backplate / Escutcheon
    const backplate = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.22, 0.008),
      hardwareMetalMat
    );
    backplate.position.set(handleX, handleY - 0.02, handleFrontZ + 0.004);
    group.add(backplate);

    // Handle Lever
    const handleLever = new THREE.Mesh(
      new THREE.BoxGeometry(0.125, 0.022, 0.055),
      hardwareMetalMat
    );
    handleLever.position.set(handleX - 0.045, handleY + 0.04, handleFrontZ + 0.032);
    group.add(handleLever);

    // Key Cylinder Rosette
    const keyRosette = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.012, 16),
      hardwareMetalMat
    );
    keyRosette.rotation.x = Math.PI / 2;
    keyRosette.position.set(handleX, handleY - 0.07, handleFrontZ + 0.008);
    group.add(keyRosette);

    // =========================================================================
    // 6. DECORATIVE RED-BROWN BRICK PILASTERS & RIGHT WALL PANEL (Y: 0.00 .. 2.10)
    // =========================================================================
    // Left Brick Pilaster (13 cm wide)
    const leftPilaster = new THREE.Mesh(
      new THREE.BoxGeometry(leftPilaW, springY, reliefDepth),
      archBrickMat
    );
    leftPilaster.position.set(xPortalLeft + leftPilaW / 2, springY / 2, brickCenterZ);
    leftPilaster.castShadow = true;
    leftPilaster.receiveShadow = true;
    group.add(leftPilaster);

    // Right Brick Panel (32 cm wide)
    const rightPanel = new THREE.Mesh(
      new THREE.BoxGeometry(rightPanelW, springY, reliefDepth),
      archBrickMat
    );
    rightPanel.position.set(xDoorRight + rightPanelW / 2, springY / 2, brickCenterZ);
    rightPanel.castShadow = true;
    rightPanel.receiveShadow = true;
    group.add(rightPanel);

    // Horizontal Brick Coursing Grooves on Right Panel (subtle texture matching brick layers)
    const numCourses = 18;
    for (let c = 1; c < numCourses; c++) {
      const courseY = (springY / numCourses) * c;
      const joint = new THREE.Mesh(
        new THREE.BoxGeometry(rightPanelW, 0.006, 0.004),
        mortarJointMat
      );
      joint.position.set(xDoorRight + rightPanelW / 2, courseY, brickFrontZ + 0.001);
      group.add(joint);
    }

    // =========================================================================
    // 7. SEMICIRCULAR RED-BROWN BRICK ARCH RING (VOUSSOIR ROLLAAG) (Y >= 2.10)
    // =========================================================================
    // Semicircular Ring Shape: Outer radius 0.75 m, Inner radius 0.62 m
    const archRingShape = new THREE.Shape();
    archRingShape.absarc(0, 0, rOuter, 0, Math.PI, false);
    archRingShape.absarc(0, 0, rInner, Math.PI, 0, true);
    archRingShape.closePath();

    const archRingGeo = new THREE.ExtrudeGeometry(archRingShape, {
      depth: reliefDepth,
      bevelEnabled: false,
      curveSegments: 36,
    });
    const archRingMesh = new THREE.Mesh(archRingGeo, archBrickMat);
    archRingMesh.position.set(0, springY, brickFrontZ - reliefDepth);
    archRingMesh.castShadow = true;
    group.add(archRingMesh);

    // Radial Voussoir Joint Accents (Rollage metselwerk joints every ~7 degrees)
    const numVoussoirs = 26;
    for (let i = 0; i <= numVoussoirs; i++) {
      const angle = (Math.PI / numVoussoirs) * i;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const midR = (rInner + rOuter) / 2;
      const lenR = rOuter - rInner;
      const jointMesh = new THREE.Mesh(
        new THREE.BoxGeometry(lenR, 0.006, 0.005),
        mortarJointMat
      );
      jointMesh.position.set(midR * cosA, springY + midR * sinA, brickFrontZ + 0.001);
      jointMesh.rotation.z = angle;
      group.add(jointMesh);
    }

    // Spandrel Infill below arch on the right (between X = +0.43 and +0.62, above Y = 2.10)
    const spandrelShape = new THREE.Shape();
    spandrelShape.moveTo(xDoorRight, 0);
    spandrelShape.lineTo(rInner, 0);
    // Follow arc from (rInner, 0) to where X = xDoorRight
    const angleAtDoorRight = Math.acos(Math.min(1.0, xDoorRight / rInner)); // ~46°
    spandrelShape.absarc(0, 0, rInner, 0, angleAtDoorRight, false);
    spandrelShape.lineTo(xDoorRight, 0);
    spandrelShape.closePath();

    const spandrelGeo = new THREE.ExtrudeGeometry(spandrelShape, {
      depth: reliefDepth,
      bevelEnabled: false,
      curveSegments: 16,
    });
    const spandrelMesh = new THREE.Mesh(spandrelGeo, archBrickMat);
    spandrelMesh.position.set(0, springY, brickFrontZ - reliefDepth);
    group.add(spandrelMesh);

    // =========================================================================
    // 8. TYMPANUM (BOOGVELD) WITH VERTICAL SOLDIER BRICKS (STAANDE ROLLAAG)
    // =========================================================================
    // Semicircular recessed tympanum inside the inner arch ring
    const tympanumShape = new THREE.Shape();
    tympanumShape.absarc(0, 0, rInner, 0, Math.PI, false);
    tympanumShape.closePath();

    const tympanumDepth = reliefDepth * 0.72; // Slightly recessed (1.1 cm) from voussoir ring
    const tympanumGeo = new THREE.ExtrudeGeometry(tympanumShape, {
      depth: tympanumDepth,
      bevelEnabled: false,
      curveSegments: 36,
    });
    const tympanumMesh = new THREE.Mesh(tympanumGeo, soldierBrickMat);
    tympanumMesh.position.set(0, springY, brickFrontZ - reliefDepth);
    group.add(tympanumMesh);

    // Vertical Soldier Course Brick Grooves (Staande Rollaag Texture from builder render!)
    const soldierBrickWidth = 0.065; // Standard brick header width ~65 mm
    const tympanumFrontZ = brickFrontZ - reliefDepth + tympanumDepth + 0.001;
    for (let x = -rInner + 0.04; x <= rInner - 0.04; x += soldierBrickWidth) {
      const maxY = Math.sqrt(Math.max(0, rInner * rInner - x * x));
      if (maxY > 0.05) {
        const soldierGroove = new THREE.Mesh(
          new THREE.BoxGeometry(0.006, maxY, 0.003),
          mortarJointMat
        );
        soldierGroove.position.set(x, springY + maxY / 2, tympanumFrontZ);
        group.add(soldierGroove);
      }
    }

    // =========================================================================
    // 9. MODERN EXTERIOR UP/DOWN WALL SCONCE (As seen in Builder Render!)
    // =========================================================================
    const lampX = xDoorRight + rightPanelW * 0.52; // Centered on right brick panel
    const lampY = 1.62; // Eye level exterior wall light
    const lampZ = brickFrontZ + 0.025; // 0.105 m

    // Anthracite Slim Fixture Housing (5 cm depth -> reaches Z = +0.13 m)
    const lampBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.16, 0.05),
      anthraciteMat
    );
    lampBody.position.set(lampX, lampY, lampZ);
    lampBody.castShadow = true;
    group.add(lampBody);

    // Upward Luminous Lens
    const lensUp = new THREE.Mesh(
      new THREE.BoxGeometry(0.076, 0.012, 0.038),
      lightLensMat
    );
    lensUp.position.set(lampX, lampY + 0.075, lampZ);
    group.add(lensUp);

    // Downward Luminous Lens
    const lensDown = new THREE.Mesh(
      new THREE.BoxGeometry(0.076, 0.012, 0.038),
      lightLensMat
    );
    lensDown.position.set(lampX, lampY - 0.075, lampZ);
    group.add(lensDown);

    // =========================================================================
    // 10. EXACT BOUNDING BOX CALIBRATION (Strict Asset Viewer Tolerance <= 5 mm)
    // =========================================================================
    // In asset viewer:
    // Target: Width = 1.50 m, Depth = 0.24 m, Height = 2.85 m
    // Center: X = 0, Y = [0 .. 2.85], Z = [-0.12 .. +0.12]
    // The threshold already reaches Y = 0, Z = [-0.12, +0.12].
    // Arch apex already reaches Y = 2.85, X = [-0.75, +0.75].

    return group;
  },
};
