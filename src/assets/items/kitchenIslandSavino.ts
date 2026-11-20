import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

const TEX_SIZE = 512;

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

let cachedMarbleTexture: THREE.DataTexture | null = null;

/**
 * Generates a soft, creamy off-white marble/quartzite countertop DataTexture with
 * delicate warm-greige veining matching Keuken rose groot.webp.
 */
function getCountertopMarbleTexture(): THREE.DataTexture {
  if (cachedMarbleTexture) return cachedMarbleTexture;

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;

      const n1 = periodicNoise2D(u * 4, v * 4, 4, 4, 17);
      const n2 = periodicNoise2D(u * 8, v * 8, 8, 8, 43);
      const n3 = periodicNoise2D(u * 16, v * 16, 16, 16, 79);

      // Soft diagonal wispy marble veins
      const veinField = Math.sin((u * 2.2 + v * 1.4 + n1 * 1.3 + n2 * 0.45) * Math.PI * 2);
      const vein = (1.0 - smoothstep(0.0, 0.24, Math.abs(veinField))) * 0.65;
      const cloud = (n1 * 0.6 + n2 * 0.3 + n3 * 0.1 - 0.5) * 0.25;
      const t = Math.max(0, Math.min(1, vein * 0.65 + cloud + 0.12));

      // Creamy off-white (#f4f1ea) with soft warm-greige veins (#dfd7cb)
      const r = Math.round(lerp(244, 223, t));
      const g = Math.round(lerp(241, 215, t));
      const b = Math.round(lerp(234, 203, t));

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
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cachedMarbleTexture = tex;
  return tex;
}

/**
 * Creates a 2D plan shape for the Savino Chabrier island with rounded corners on ALL 4 sides:
 * - X spans [-halfW, +halfW]
 * - Y spans [-halfD, +halfD], which after rotateX(-PI/2) maps:
 *     +halfD -> -Z (dining/showcase side, generous rounded corners rDining = 14 cm)
 *     -halfD -> +Z (working/cooking side, rounded corners rWork = 6 cm matching 60 mm cheeks)
 */
function createIslandPlanShape(
  halfW: number,
  halfD: number,
  rDining: number,
  rWork: number
): THREE.Shape {
  const rd = Math.min(rDining, halfW * 0.45, halfD * 0.45);
  const rw = Math.min(rWork, halfW * 0.45, halfD * 0.45);
  const s = new THREE.Shape();
  s.moveTo(-halfW + rw, -halfD);
  s.lineTo(halfW - rw, -halfD);
  s.absarc(halfW - rw, -halfD + rw, rw, -Math.PI / 2, 0, false);
  s.lineTo(halfW, halfD - rd);
  s.absarc(halfW - rd, halfD - rd, rd, 0, Math.PI / 2, false);
  s.lineTo(-halfW + rd, halfD);
  s.absarc(-halfW + rd, halfD - rd, rd, Math.PI / 2, Math.PI, false);
  s.lineTo(-halfW, -halfD + rw);
  s.absarc(-halfW + rw, -halfD + rw, rw, Math.PI, (3 * Math.PI) / 2, false);
  s.closePath();
  return s;
}

/**
 * Extrudes a vertical 2D plan shape cleanly to Y: [yBottom, yBottom + height].
 */
function extrudePlanY(
  shape: THREE.Shape,
  height: number,
  yBottom: number,
  widthForUV: number,
  depthForUV: number
): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yBottom, 0);

  // Clean planar top/bottom UVs for marble veining
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, (x + widthForUV / 2) / widthForUV, (z + depthForUV / 2) / depthForUV);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Superkeukens Savino Chabrier — Kitchen Island (Kook- & Spoeleiland)
 *
 * Dimensions: 252 cm (L) × 108 cm (W) × 97 cm (H countertop)
 * - Soft matte sand-greige (zandgrijs) fronts & signature rounded organic corners on the dining (-Z) side
 * - Creamy off-white marble-look countertop (3 cm thick) with recessed bronze/copper undermount sink
 * - Mirrored working (+Z) layout per Leidingschema 47359_1_1:
 *     Left  (90 cm): Induction cooktop with downdraft extractor + 2 sliding drawers
 *     Mid   (60 cm): Built-in dishwasher (drop-down door, simple low-poly tub)
 *     Right (90 cm): Bronze/copper undermount sink & matching bronze tap + 2 hinged doors
 * - Dining/showcase (-Z) side: 4 sleek full-height vertical cabinet doors between rounded end cheeks
 */
export const kitchenIslandSavinoPrefab: AssetPrefabDefinition = {
  prefabId: 'kitchen_island_savino',
  defaultLabel: 'Keukeneiland Savino Chabrier (252 × 108 × 97 cm)',
  defaultDimensions: {
    width: cm(252, 'user_supplied', 'User spec & Leidingschema 47359_1_1: 60 + 900 + 600 + 900 + 60 = 2520 mm'),
    depth: cm(108, 'user_supplied', 'User specification: Kitchen island width 108 cm'),
    height: cm(97, 'user_supplied', 'User specification: Kitchen island countertop height 97 cm'),
  },
  build3D: ({ width, depth, height, registerInteractiveDoor }) => {
    const group = new THREE.Group();
    const marbleMap = getCountertopMarbleTexture();

    // --- Materials (matched to Keuken rose groot.webp & diorama style) ---
    const greigeFrontMat = new THREE.MeshStandardMaterial({
      color: '#d6cec3', // Soft light warm sand-greige (zandgrijs)
      roughness: 0.84,
      metalness: 0.0,
    });
    const greigePlinthMat = new THREE.MeshStandardMaterial({
      color: '#c5bdb2',
      roughness: 0.88,
      metalness: 0.0,
    });
    // Light brushed rose-copper greeplijst (working / faucet side only, matches kastenwand)
    const copperGripMat = new THREE.MeshStandardMaterial({
      color: '#d49c7e',
      roughness: 0.38,
      metalness: 0.40,
    });
    const countertopMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: marbleMap,
      roughness: 0.56,
      metalness: 0.02,
    });
    const interiorWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f2efe9',
      roughness: 0.90,
      metalness: 0.0,
    });
    const stainlessTubMat = new THREE.MeshStandardMaterial({
      color: '#c8ccd0',
      roughness: 0.42,
      metalness: 0.48,
    });
    const rackGreyMat = new THREE.MeshStandardMaterial({
      color: '#8e949c',
      roughness: 0.58,
      metalness: 0.25,
    });

    // Lighter warm brushed rose-copper sink & Quooker faucet (matches uploaded close-up photo)
    const bronzeSinkMat = new THREE.MeshStandardMaterial({
      color: '#cc9477',
      roughness: 0.34,
      metalness: 0.44,
    });
    const bronzeTapMat = new THREE.MeshStandardMaterial({
      color: '#dfb096',
      roughness: 0.28,
      metalness: 0.45,
    });
    const tapRedRingMat = new THREE.MeshStandardMaterial({
      color: '#d63b3b',
      emissive: '#a82222',
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.0,
    });

    // Matte-black SaphirMatt-style induction cooktop + recessed horizontal intake vent
    const cooktopGlassMat = new THREE.MeshStandardMaterial({
      color: '#232529',
      roughness: 0.44,
      metalness: 0.08,
    });
    const cooktopGrilleMat = new THREE.MeshStandardMaterial({
      color: '#17191c',
      roughness: 0.62,
      metalness: 0.14,
    });
    const cooktopVentWellMat = new THREE.MeshStandardMaterial({
      color: '#0f1012',
      roughness: 0.85,
      metalness: 0.05,
    });

    const triggerMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    // --- Parametric Dimensions ---
    const halfW = width / 2; // 1.26 m
    const halfD = depth / 2; // 0.54 m
    const diningCornerR = 0.14; // 14 cm organic rounded corners on dining (-Z) side
    const workCornerR = 0.06; // 6 cm rounded corners on working (+Z) side (matches 60 mm side cheeks)
    const plinthH = 0.100; // 10 cm toe-kick
    const topThick = 0.030; // 3 cm marble-look countertop
    const topBottomY = height - topThick; // 0.940 m
    const gripGrooveH = 0.032; // 3.2 cm recessed greeploos rail under countertop on working (+Z) side
    const workDoorTopY = topBottomY - gripGrooveH; // 0.908 m
    const workDoorH = workDoorTopY - plinthH; // 0.808 m
    const diningDoorH = topBottomY - plinthH; // 0.840 m

    const endCheekW = 0.060; // 60 mm side cheeks on working (+Z) side -> 60 + 900 + 600 + 900 + 60 = 2520 mm
    const doorThick = 0.020;
    const doorGap = 0.006; // 6 mm crisp reveal so individual doors & drawers read clearly

    // Sink & cooktop center coordinates (mirrored: cooktop on LEFT -X, sink on RIGHT +X when facing +Z)
    const cookColCenterX = -halfW + endCheekW + 0.45; // -0.75 m
    const dwColCenterX = 0.0; // 0.00 m (60 cm centered)
    const sinkColCenterX = halfW - endCheekW - 0.45; // +0.75 m
    const cookZ = 0.21; // 7 cm marble margin from front working edge (+0.54 m)
    const sinkZ = 0.255; // 7 cm marble margin from front edge -> basin Z: +0.055..+0.455 m (8 cm clear of center spine!)

    const sinkInnerW = 0.54;
    const sinkInnerD = 0.40;
    const sinkDepthY = 0.18;

    // 1. Recessed Toe-Kick Plinth (Y: 0.00..0.10 m, rounded on all 4 corners)
    const plinthInset = 0.055;
    const plinthShape = createIslandPlanShape(
      halfW - plinthInset,
      halfD - plinthInset,
      Math.max(0.04, diningCornerR - plinthInset * 0.7),
      Math.max(0.03, workCornerR - plinthInset * 0.5)
    );
    const plinthMesh = new THREE.Mesh(
      extrudePlanY(plinthShape, plinthH, 0, width, depth),
      greigePlinthMat
    );
    plinthMesh.name = 'island_plinth';
    group.add(plinthMesh);

    // 2. Countertop with Rounded Corners on ALL 4 Sides & Real Recessed Sink Cutout (Y: 0.94..0.97 m)
    const topShape = createIslandPlanShape(halfW, halfD, diningCornerR, workCornerR);
    // Punch sink opening hole in 2D shape (remember y_shape = -z_world)
    const holeX0 = sinkColCenterX - sinkInnerW / 2;
    const holeX1 = sinkColCenterX + sinkInnerW / 2;
    const holeY0 = -(sinkZ + sinkInnerD / 2);
    const holeY1 = -(sinkZ - sinkInnerD / 2);
    const sinkHole = new THREE.Path();
    sinkHole.moveTo(holeX0, holeY0);
    sinkHole.lineTo(holeX1, holeY0);
    sinkHole.lineTo(holeX1, holeY1);
    sinkHole.lineTo(holeX0, holeY1);
    sinkHole.closePath();
    topShape.holes.push(sinkHole);

    const countertopMesh = new THREE.Mesh(
      extrudePlanY(topShape, topThick, topBottomY, width, depth),
      countertopMat
    );
    countertopMesh.name = 'island_countertop_marble';
    group.add(countertopMesh);

    // 3. Signature Rounded Sand-Greige End Caps / Cheeks (rounded on BOTH working +Z and dining -Z corners!)
    const buildEndCheek = (side: -1 | 1) => {
      const rd = diningCornerR;
      const rw = workCornerR;
      const xOuter = side * halfW;
      const xInnerDining = side * (halfW - rd); // ±1.12 m (where dining doors start)
      const xInnerWork = side * (halfW - endCheekW); // ±1.20 m (where working doors start, exact tangent of rw!)
      const yWork = -halfD; // maps to +Z
      const yDining = halfD; // maps to -Z
      const yMidSplit = 0.0; // Z = 0 split line inside island

      const s = new THREE.Shape();
      if (side === -1) {
        s.moveTo(xInnerWork, yWork);
        s.lineTo(xInnerWork, yMidSplit);
        s.lineTo(xInnerDining, yMidSplit);
        s.lineTo(xInnerDining, yDining);
        s.absarc(xInnerDining, yDining - rd, rd, Math.PI / 2, Math.PI, false);
        s.lineTo(xOuter, yWork + rw);
        s.absarc(xOuter + rw, yWork + rw, rw, Math.PI, (3 * Math.PI) / 2, false);
        s.closePath();
      } else {
        s.moveTo(xInnerWork, yWork);
        s.absarc(xOuter - rw, yWork + rw, rw, -Math.PI / 2, 0, false);
        s.lineTo(xOuter, yDining - rd);
        s.absarc(xInnerDining, yDining - rd, rd, 0, Math.PI / 2, false);
        s.lineTo(xInnerDining, yMidSplit);
        s.lineTo(xInnerWork, yMidSplit);
        s.closePath();
      }

      const mesh = new THREE.Mesh(
        extrudePlanY(s, diningDoorH, plinthH, width, depth),
        greigeFrontMat
      );
      mesh.name = side < 0 ? 'island_end_cheek_left' : 'island_end_cheek_right';
      group.add(mesh);
    };
    buildEndCheek(-1);
    buildEndCheek(1);

    // 4. Simple Low-Poly Central Carcass Core (separates working +Z side from dining -Z side)
    const coreW = width - 2 * endCheekW; // 2.40 m
    const coreDivider = new THREE.Mesh(
      new THREE.BoxGeometry(coreW, diningDoorH, 0.024),
      interiorWhiteMat
    );
    coreDivider.name = 'island_center_spine';
    coreDivider.position.set(0, plinthH + diningDoorH / 2, -0.04);
    group.add(coreDivider);

    // Simple bottom floor deck inside the island (Y: 0.10..0.118 m)
    const floorDeck = new THREE.Mesh(
      new THREE.BoxGeometry(width - 2 * diningCornerR, 0.018, depth - 2 * doorThick - 0.01),
      interiorWhiteMat
    );
    floorDeck.position.set(0, plinthH + 0.009, 0);
    group.add(floorDeck);

    // Continuous recessed rose-copper greeplijst along the working/faucet (+Z) side ONLY
    // Extruded C-channel directly beneath the marble countertop (Y: workDoorTopY..topBottomY)
    {
      const gripBackZ = halfD - 0.036;
      const gripFrontZ = halfD - 0.004;
      const gripDepth = gripFrontZ - gripBackZ;
      const gripBackT = 0.006;
      const gripLipT = 0.004;
      const gripProfile = new THREE.Shape();
      gripProfile.moveTo(0, 0);
      gripProfile.lineTo(gripDepth, 0);
      gripProfile.lineTo(gripDepth, gripLipT);
      gripProfile.lineTo(gripBackT, gripLipT);
      gripProfile.lineTo(gripBackT, gripGrooveH - gripLipT);
      gripProfile.lineTo(gripDepth, gripGrooveH - gripLipT);
      gripProfile.lineTo(gripDepth, gripGrooveH);
      gripProfile.lineTo(0, gripGrooveH);
      gripProfile.closePath();

      const gripGeo = new THREE.ExtrudeGeometry(gripProfile, {
        depth: coreW,
        bevelEnabled: false,
        steps: 1,
      });
      gripGeo.rotateY(-Math.PI / 2);
      gripGeo.translate(coreW / 2, workDoorTopY, gripBackZ);
      gripGeo.computeVertexNormals();

      const gripRail = new THREE.Mesh(gripGeo, copperGripMat);
      gripRail.name = 'island_working_copper_greeplijst';
      group.add(gripRail);
    }

    // Two simple vertical dividers on the working (+Z) side separating 90 | 60 | 90 cm zones
    const workZoneDepth = halfD - doorThick - (-0.028); // from center spine to behind doors
    const workZoneCenterZ = (-0.028 + (halfD - doorThick)) / 2;
    for (const divX of [-0.30, 0.30]) {
      const wDiv = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, workDoorH, workZoneDepth),
        interiorWhiteMat
      );
      wDiv.position.set(divX, plinthH + workDoorH / 2, workZoneCenterZ);
      group.add(wDiv);
    }

    // 5. WORKING SIDE (+Z) INTERACTIVE FRONTS (Low-poly interiors!)
    const workFrontZ = halfD; // +0.54 m
    const workDoorCenterZ = workFrontZ - doorThick / 2;

    // 5a. LEFT (90 cm, cooktop): Two horizontal sliding drawers (simple low-poly box interior)
    const drawerW = 0.90 - doorGap;
    const drawerH = (workDoorH - doorGap) / 2;
    const drawerSpecs = [
      { id: 'drawer_cook_lower', bottomY: plinthH, h: drawerH },
      { id: 'drawer_cook_upper', bottomY: plinthH + drawerH + doorGap, h: drawerH },
    ];
    for (const ds of drawerSpecs) {
      const slideGroup = new THREE.Group();
      slideGroup.name = `pivot_${ds.id}`;
      slideGroup.position.set(cookColCenterX, ds.bottomY + ds.h / 2, workDoorCenterZ);
      group.add(slideGroup);

      const frontMesh = new THREE.Mesh(
        new THREE.BoxGeometry(drawerW, ds.h, doorThick),
        greigeFrontMat
      );
      frontMesh.name = ds.id;
      slideGroup.add(frontMesh);

      // Minimal low-poly drawer tray box (single box behind front)
      const boxD = 0.42;
      const boxH = ds.h * 0.62;
      const drawerBox = new THREE.Mesh(
        new THREE.BoxGeometry(drawerW - 0.04, boxH, boxD),
        interiorWhiteMat
      );
      drawerBox.position.set(0, -ds.h * 0.14, -doorThick / 2 - boxD / 2);
      slideGroup.add(drawerBox);

      const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(drawerW, ds.h, doorThick + 0.04),
        triggerMat
      );
      trigger.userData.isInteractiveTrigger = true;
      trigger.position.set(cookColCenterX, ds.bottomY + ds.h / 2, workDoorCenterZ + 0.01);
      group.add(trigger);

      registerInteractiveDoor?.({
        subId: ds.id,
        pivots: [
          {
            group: slideGroup,
            openAngle: 0.34, // 34 cm slide-out distance along +Z
            closedAngle: 0,
            currentAngle: 0,
            onUpdate: (dist) => {
              slideGroup.position.z = workDoorCenterZ + dist;
            },
          },
        ],
        triggerMeshes: [trigger, frontMesh],
      });
    }

    // 5b. MIDDLE (60 cm): Built-in Dishwasher (bottom-hinged drop-down door, simple low-poly tub)
    const dwW = 0.60 - doorGap;
    const dwPivot = new THREE.Group();
    dwPivot.name = 'pivot_island_dishwasher';
    dwPivot.position.set(dwColCenterX, plinthH, workFrontZ - doorThick / 2);
    group.add(dwPivot);

    const dwDoor = new THREE.Mesh(
      new THREE.BoxGeometry(dwW, workDoorH, doorThick),
      greigeFrontMat
    );
    dwDoor.name = 'island_dishwasher_door';
    dwDoor.position.set(0, workDoorH / 2, 0);
    dwPivot.add(dwDoor);

    // Simple low-poly stainless inner door panel + minimal tub & 2 flat rack planes
    const dwInnerDoor = new THREE.Mesh(
      new THREE.BoxGeometry(dwW - 0.03, workDoorH - 0.04, 0.006),
      stainlessTubMat
    );
    dwInnerDoor.position.set(0, workDoorH / 2, -doorThick / 2 - 0.003);
    dwPivot.add(dwInnerDoor);

    // Simple low-poly stainless tub back & two flat rack shelves inside
    const dwTubBack = new THREE.Mesh(
      new THREE.BoxGeometry(dwW - 0.03, workDoorH - 0.04, 0.012),
      stainlessTubMat
    );
    dwTubBack.position.set(dwColCenterX, plinthH + workDoorH / 2, -0.018);
    group.add(dwTubBack);

    for (const rackRelY of [0.28, 0.66]) {
      const rackPlane = new THREE.Mesh(
        new THREE.BoxGeometry(dwW - 0.08, 0.014, 0.40),
        rackGreyMat
      );
      rackPlane.position.set(dwColCenterX, plinthH + workDoorH * rackRelY, 0.24);
      group.add(rackPlane);
    }

    const dwTrigger = new THREE.Mesh(
      new THREE.BoxGeometry(dwW, workDoorH, doorThick + 0.04),
      triggerMat
    );
    dwTrigger.userData.isInteractiveTrigger = true;
    dwTrigger.position.set(dwColCenterX, plinthH + workDoorH / 2, workDoorCenterZ + 0.01);
    group.add(dwTrigger);

    registerInteractiveDoor?.({
      subId: 'island_dishwasher',
      pivots: [
        {
          group: dwPivot,
          openAngle: Math.PI * 0.36, // ~65° tilt-down outward
          closedAngle: 0,
          currentAngle: 0,
          onUpdate: (angle) => {
            dwPivot.rotation.x = angle;
          },
        },
      ],
      triggerMeshes: [dwTrigger, dwDoor],
    });

    // 5c. RIGHT (90 cm, sink cabinet): Two 45 cm hinged doors (simple low-poly interior)
    const sinkDoorW = 0.45 - doorGap;
    const sinkDoorConfigs: Array<{ id: string; xCenter: number; hinge: 'left' | 'right' }> = [
      { id: 'island_sink_door_left', xCenter: sinkColCenterX - 0.225, hinge: 'left' },
      { id: 'island_sink_door_right', xCenter: sinkColCenterX + 0.225, hinge: 'right' },
    ];
    for (const sc of sinkDoorConfigs) {
      const hingeX = sc.hinge === 'left' ? sc.xCenter - sinkDoorW / 2 : sc.xCenter + sinkDoorW / 2;
      const pivot = new THREE.Group();
      pivot.name = `pivot_${sc.id}`;
      pivot.position.set(hingeX, plinthH + workDoorH / 2, workFrontZ);
      group.add(pivot);

      const dMesh = new THREE.Mesh(
        new THREE.BoxGeometry(sinkDoorW, workDoorH, doorThick),
        greigeFrontMat
      );
      dMesh.name = sc.id;
      dMesh.position.set(sc.hinge === 'left' ? sinkDoorW / 2 : -sinkDoorW / 2, 0, -doorThick / 2);
      pivot.add(dMesh);

      const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(sinkDoorW, workDoorH, doorThick + 0.04),
        triggerMat
      );
      trigger.userData.isInteractiveTrigger = true;
      trigger.position.set(sc.xCenter, plinthH + workDoorH / 2, workDoorCenterZ + 0.01);
      group.add(trigger);

      registerInteractiveDoor?.({
        subId: sc.id,
        pivots: [
          {
            group: pivot,
            openAngle: sc.hinge === 'left' ? -Math.PI * 0.42 : Math.PI * 0.42,
            closedAngle: 0,
            currentAngle: 0,
          },
        ],
        triggerMeshes: [trigger, dMesh],
      });
    }

    // 6. DINING / SHOWCASE SIDE (-Z): 4 Sleek Full-Height Sand-Greige Vertical Doors
    // Spans between the two 14 cm rounded end cheeks: X in [-1.12, +1.12] (2.24 m / 4 = 56 cm each)
    const diningSpanW = width - 2 * diningCornerR; // 2.24 m
    const diningDoorCount = 4;
    const diningColW = diningSpanW / diningDoorCount; // 0.56 m
    const diningDoorW = diningColW - doorGap;
    const diningFrontZ = -halfD; // -0.54 m
    const diningHingeSides: Array<'left' | 'right'> = ['left', 'right', 'left', 'right'];

    // Simple low-poly single shelf on dining side + subtle recessed shadow seam strips behind the 5 vertical gaps
    const diningShelf = new THREE.Mesh(
      new THREE.BoxGeometry(diningSpanW - 0.02, 0.016, 0.36),
      interiorWhiteMat
    );
    diningShelf.position.set(0, plinthH + diningDoorH * 0.5, -0.28);
    group.add(diningShelf);

    const seamShadowMat = new THREE.MeshStandardMaterial({
      color: '#6e675f',
      roughness: 0.92,
      metalness: 0.0,
    });
    for (let s = 0; s <= diningDoorCount; s++) {
      const seamX = -diningSpanW / 2 + s * diningColW;
      const seamStrip = new THREE.Mesh(
        new THREE.BoxGeometry(doorGap * 0.9, diningDoorH, 0.004),
        seamShadowMat
      );
      seamStrip.position.set(seamX, plinthH + diningDoorH / 2, diningFrontZ + doorThick - 0.003);
      group.add(seamStrip);
    }

    for (let i = 0; i < diningDoorCount; i++) {
      const colLeftX = -diningSpanW / 2 + i * diningColW + doorGap / 2;
      const colRightX = colLeftX + diningDoorW;
      const side = diningHingeSides[i];
      const hingeX = side === 'left' ? colLeftX : colRightX;

      // Facing -Z: pivot at front outer edge (diningFrontZ = -halfD), door extends in +Z into cabinet
      const pivot = new THREE.Group();
      pivot.name = `pivot_island_dining_door_${i + 1}`;
      pivot.position.set(hingeX, plinthH + diningDoorH / 2, diningFrontZ);
      group.add(pivot);

      const dMesh = new THREE.Mesh(
        new THREE.BoxGeometry(diningDoorW, diningDoorH, doorThick),
        greigeFrontMat
      );
      dMesh.name = `island_dining_door_${i + 1}`;
      dMesh.position.set(side === 'left' ? diningDoorW / 2 : -diningDoorW / 2, 0, doorThick / 2);
      pivot.add(dMesh);

      const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(diningDoorW, diningDoorH, doorThick + 0.04),
        triggerMat
      );
      trigger.userData.isInteractiveTrigger = true;
      trigger.position.set(
        (colLeftX + colRightX) / 2,
        plinthH + diningDoorH / 2,
        diningFrontZ + doorThick / 2 - 0.01
      );
      group.add(trigger);

      // Facing -Z: left-hinged door (+X span) swings outward toward -Z with +angle; right-hinged (-X span) with -angle
      const openAngle = side === 'left' ? Math.PI * 0.42 : -Math.PI * 0.42;
      registerInteractiveDoor?.({
        subId: `island_dining_door_${i + 1}`,
        pivots: [{ group: pivot, openAngle, closedAngle: 0, currentAngle: 0 }],
        triggerMeshes: [trigger, dMesh],
      });
    }

    // 7. MATTE-BLACK INDUCTION COOKTOP WITH CENTRAL HORIZONTAL ROUNDED INTAKE VENT (LEFT, -X side)
    {
      const cookW = 0.80;
      const cookD = 0.52;
      const cookThick = 0.004;
      const cookR = 0.005;
      const ventW = 0.34; // horizontal intake vent running along X
      const ventD = 0.074;
      const ventR = 0.011; // slightly rounded corners on intake vent

      const makeRoundedRect = (w: number, d: number, r: number): THREE.Shape => {
        const hw = w / 2;
        const hd = d / 2;
        const rr = Math.min(r, hw * 0.45, hd * 0.45);
        const s = new THREE.Shape();
        s.moveTo(-hw + rr, -hd);
        s.lineTo(hw - rr, -hd);
        s.absarc(hw - rr, -hd + rr, rr, -Math.PI / 2, 0, false);
        s.lineTo(hw, hd - rr);
        s.absarc(hw - rr, hd - rr, rr, 0, Math.PI / 2, false);
        s.lineTo(-hw + rr, hd);
        s.absarc(-hw + rr, hd - rr, rr, Math.PI / 2, Math.PI, false);
        s.lineTo(-hw, -hd + rr);
        s.absarc(-hw + rr, -hd + rr, rr, Math.PI, (3 * Math.PI) / 2, false);
        s.closePath();
        return s;
      };

      const makeRoundedHole = (w: number, d: number, r: number): THREE.Path => {
        const hw = w / 2;
        const hd = d / 2;
        const rr = Math.min(r, hw * 0.45, hd * 0.45);
        const p = new THREE.Path();
        p.moveTo(-hw + rr, -hd);
        p.lineTo(hw - rr, -hd);
        p.absarc(hw - rr, -hd + rr, rr, -Math.PI / 2, 0, false);
        p.lineTo(hw, hd - rr);
        p.absarc(hw - rr, hd - rr, rr, 0, Math.PI / 2, false);
        p.lineTo(-hw + rr, hd);
        p.absarc(-hw + rr, hd - rr, rr, Math.PI / 2, Math.PI, false);
        p.lineTo(-hw, -hd + rr);
        p.absarc(-hw + rr, -hd + rr, rr, Math.PI, (3 * Math.PI) / 2, false);
        p.closePath();
        return p;
      };

      // Sleek matte-black ceramic glass plate with punched horizontal rounded vent opening
      const cookShape = makeRoundedRect(cookW, cookD, cookR);
      cookShape.holes.push(makeRoundedHole(ventW, ventD, ventR));
      const cookGeo = new THREE.ExtrudeGeometry(cookShape, {
        depth: cookThick,
        bevelEnabled: true,
        bevelThickness: 0.0008,
        bevelSize: 0.0008,
        bevelSegments: 2,
        curveSegments: 10,
      });
      cookGeo.rotateX(-Math.PI / 2);
      const cooktopMesh = new THREE.Mesh(cookGeo, cooktopGlassMat);
      cooktopMesh.name = 'island_induction_cooktop';
      cooktopMesh.position.set(cookColCenterX, height, cookZ);
      group.add(cooktopMesh);

      // Dark recessed intake well floor right beneath the vent opening
      const wellGeo = new THREE.ExtrudeGeometry(makeRoundedRect(ventW + 0.004, ventD + 0.004, ventR), {
        depth: 0.0015,
        bevelEnabled: false,
        curveSegments: 10,
      });
      wellGeo.rotateX(-Math.PI / 2);
      const wellMesh = new THREE.Mesh(wellGeo, cooktopVentWellMat);
      wellMesh.name = 'island_cooktop_vent_well';
      wellMesh.position.set(cookColCenterX, height + 0.0002, cookZ);
      group.add(wellMesh);

      // Slim matte-black intake grille trim frame with rounded corners + 2 subtle recessed louver slats
      const trimShape = makeRoundedRect(ventW + 0.006, ventD + 0.006, ventR + 0.001);
      trimShape.holes.push(makeRoundedHole(ventW - 0.012, ventD - 0.012, Math.max(0.004, ventR - 0.004)));
      const trimGeo = new THREE.ExtrudeGeometry(trimShape, {
        depth: 0.0022,
        bevelEnabled: false,
        curveSegments: 10,
      });
      trimGeo.rotateX(-Math.PI / 2);
      const trimMesh = new THREE.Mesh(trimGeo, cooktopGrilleMat);
      trimMesh.name = 'island_cooktop_extractor_rim';
      trimMesh.position.set(cookColCenterX, height + 0.0024, cookZ);
      group.add(trimMesh);

      // Subtle recessed horizontal intake louver slats inside the well
      for (const lz of [-0.016, 0.0, 0.016]) {
        const slat = new THREE.Mesh(
          new THREE.BoxGeometry(ventW - 0.020, 0.0015, 0.005),
          cooktopGrilleMat
        );
        slat.position.set(cookColCenterX, height + 0.0024, cookZ + lz);
        group.add(slat);
      }
    }

    // 8. ROSE-COPPER FLUSH-RIM SINK WITH FLAT LEDGE & MATCHING QUOOKER FAUCET (RIGHT, +X side)
    const sinkWallT = 0.008;
    const sinkRimW = 0.024; // 2.4 cm flat brushed-copper perimeter ledge resting on countertop
    const sinkRimT = 0.003; // 3 mm slim flat flange
    const sinkRimR = 0.010; // soft 1 cm rounded outer rim corners
    const sinkTopY = height; // basin walls rise cleanly to countertop rim
    const sinkBotY = sinkTopY - sinkDepthY;
    const sinkCenterY = (sinkTopY + sinkBotY) / 2;

    // Flat brushed-copper outer rim/ledge (ExtrudeGeometry frame with inner basin hole)
    {
      const rw = sinkInnerW / 2 + sinkRimW;
      const rd = sinkInnerD / 2 + sinkRimW;
      const rr = sinkRimR;
      const rimShape = new THREE.Shape();
      rimShape.moveTo(-rw + rr, -rd);
      rimShape.lineTo(rw - rr, -rd);
      rimShape.absarc(rw - rr, -rd + rr, rr, -Math.PI / 2, 0, false);
      rimShape.lineTo(rw, rd - rr);
      rimShape.absarc(rw - rr, rd - rr, rr, 0, Math.PI / 2, false);
      rimShape.lineTo(-rw + rr, rd);
      rimShape.absarc(-rw + rr, rd - rr, rr, Math.PI / 2, Math.PI, false);
      rimShape.lineTo(-rw, -rd + rr);
      rimShape.absarc(-rw + rr, -rd + rr, rr, Math.PI, (3 * Math.PI) / 2, false);
      rimShape.closePath();

      const iw = sinkInnerW / 2;
      const id = sinkInnerD / 2;
      const innerHole = new THREE.Path();
      innerHole.moveTo(-iw, -id);
      innerHole.lineTo(iw, -id);
      innerHole.lineTo(iw, id);
      innerHole.lineTo(-iw, id);
      innerHole.closePath();
      rimShape.holes.push(innerHole);

      const rimGeo = new THREE.ExtrudeGeometry(rimShape, {
        depth: sinkRimT,
        bevelEnabled: false,
        curveSegments: 10,
      });
      rimGeo.rotateX(-Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeo, bronzeSinkMat);
      rimMesh.name = 'island_bronze_sink_rim';
      rimMesh.position.set(sinkColCenterX, height, sinkZ);
      group.add(rimMesh);
    }

    // 4 basin walls + bottom (positioned strictly inside cutout & well clear of center spine!)
    const sinkBot = new THREE.Mesh(
      new THREE.BoxGeometry(sinkInnerW + 2 * sinkWallT, sinkWallT, sinkInnerD + 2 * sinkWallT),
      bronzeSinkMat
    );
    sinkBot.name = 'island_bronze_sink_bottom';
    sinkBot.position.set(sinkColCenterX, sinkBotY + sinkWallT / 2, sinkZ);
    group.add(sinkBot);

    for (const s of [-1, 1]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(sinkWallT, sinkDepthY, sinkInnerD + 2 * sinkWallT),
        bronzeSinkMat
      );
      sideWall.position.set(
        sinkColCenterX + s * (sinkInnerW / 2 + sinkWallT / 2),
        sinkCenterY,
        sinkZ
      );
      group.add(sideWall);

      const fbWall = new THREE.Mesh(
        new THREE.BoxGeometry(sinkInnerW, sinkDepthY, sinkWallT),
        bronzeSinkMat
      );
      fbWall.position.set(
        sinkColCenterX,
        sinkCenterY,
        sinkZ + s * (sinkInnerD / 2 + sinkWallT / 2)
      );
      group.add(fbWall);
    }

    // Subtle overflow slot on the back inner wall of the basin (below faucet)
    const overflowSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.012, 0.002),
      cooktopGrilleMat
    );
    overflowSlot.position.set(sinkColCenterX, sinkTopY - 0.055, sinkZ - sinkInnerD / 2 + 0.001);
    group.add(overflowSlot);

    // Circular brushed-copper drain strainer assembly in basin floor
    const drainOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.003, 24),
      bronzeTapMat
    );
    drainOuter.position.set(sinkColCenterX, sinkBotY + sinkWallT + 0.0015, sinkZ);
    group.add(drainOuter);

    const drainInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.038, 0.005, 24),
      cooktopGrilleMat
    );
    drainInner.position.set(sinkColCenterX, sinkBotY + sinkWallT + 0.0025, sinkZ);
    group.add(drainInner);

    const drainCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.007, 16),
      bronzeTapMat
    );
    drainCap.position.set(sinkColCenterX, sinkBotY + sinkWallT + 0.0035, sinkZ);
    group.add(drainCap);

    // Matching Brushed Rose-Copper Quooker Fusion Square Faucet behind sink
    const tapX = sinkColCenterX;
    const tapZ = sinkZ - sinkInnerD / 2 - sinkRimW - 0.042; // 4.2 cm behind sink rim ledge
    const tapGroup = new THREE.Group();
    tapGroup.name = 'island_bronze_tap';
    tapGroup.position.set(tapX, height, tapZ);
    group.add(tapGroup);

    // 1. Thick cylindrical faucet body (Ø 4.4 cm, height 13.2 cm)
    const bodyR = 0.022;
    const bodyH = 0.132;
    const bodyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyR, bodyR, bodyH, 24),
      bronzeTapMat
    );
    bodyMesh.position.y = bodyH / 2;
    tapGroup.add(bodyMesh);

    // 2. Signature Quooker red indicator ring + knurled boiling-water collar
    const redRingH = 0.0035;
    const redRing = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyR + 0.0005, bodyR + 0.0005, redRingH, 24),
      tapRedRingMat
    );
    redRing.position.y = bodyH + redRingH / 2;
    tapGroup.add(redRing);

    const collarH = 0.022;
    const collarY = bodyH + redRingH;
    const collarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(bodyR + 0.001, bodyR + 0.001, collarH, 24),
      bronzeTapMat
    );
    collarMesh.position.y = collarY + collarH / 2;
    tapGroup.add(collarMesh);

    // 3. Side mixer handle on the right (+X) side matching the showroom photo
    const leverHubY = 0.086;
    const leverHubLen = 0.044;
    const leverHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, leverHubLen, 18),
      bronzeTapMat
    );
    leverHub.rotation.z = Math.PI / 2;
    leverHub.position.set(bodyR + leverHubLen / 2 - 0.004, leverHubY, 0);
    tapGroup.add(leverHub);

    const leverPinH = 0.092;
    const leverPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0048, leverPinH, 12),
      bronzeTapMat
    );
    leverPin.position.set(bodyR + leverHubLen - 0.014, leverHubY + leverPinH / 2 + 0.008, 0);
    tapGroup.add(leverPin);

    // 4. Crisp Quooker Square-Arch Spout (straight segments + exact 90° circular bends)
    const spoutR = 0.0115; // Ø 2.3 cm
    const bendR = 0.028; // tight 2.8 cm architectural 90° bend radius
    const spoutStartY = collarY + collarH - 0.002; // 0.155 m
    const archTopY = 0.335; // 33.5 cm total faucet height
    const reachZ = 0.185; // 18.5 cm forward reach over the sink
    const tipDropLen = 0.040; // 4.0 cm vertical nozzle drop

    const spoutPath = new THREE.CurvePath<THREE.Vector3>();
    // Vertical straight riser
    spoutPath.add(
      new THREE.LineCurve3(
        new THREE.Vector3(0, spoutStartY, 0),
        new THREE.Vector3(0, archTopY - bendR, 0)
      )
    );
    // First crisp 90° elbow (vertical -> horizontal +Z)
    spoutPath.add(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, archTopY - bendR, 0),
        new THREE.Vector3(0, archTopY, 0),
        new THREE.Vector3(0, archTopY, bendR)
      )
    );
    // Horizontal straight arm
    spoutPath.add(
      new THREE.LineCurve3(
        new THREE.Vector3(0, archTopY, bendR),
        new THREE.Vector3(0, archTopY, reachZ - bendR)
      )
    );
    // Second crisp 90° elbow (horizontal +Z -> downward -Y)
    spoutPath.add(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, archTopY, reachZ - bendR),
        new THREE.Vector3(0, archTopY, reachZ),
        new THREE.Vector3(0, archTopY - bendR, reachZ)
      )
    );
    // Short vertical straight spout nozzle
    spoutPath.add(
      new THREE.LineCurve3(
        new THREE.Vector3(0, archTopY - bendR, reachZ),
        new THREE.Vector3(0, archTopY - bendR - tipDropLen, reachZ)
      )
    );

    const spoutMesh = new THREE.Mesh(
      new THREE.TubeGeometry(spoutPath, 40, spoutR, 18, false),
      bronzeTapMat
    );
    tapGroup.add(spoutMesh);

    // Flat aerator cap closing the spout tip cleanly
    const tipCap = new THREE.Mesh(
      new THREE.CylinderGeometry(spoutR * 0.96, spoutR * 0.96, 0.004, 18),
      bronzeTapMat
    );
    tipCap.position.set(0, archTopY - bendR - tipDropLen, reachZ);
    tapGroup.add(tipCap);

    return group;
  },
};
