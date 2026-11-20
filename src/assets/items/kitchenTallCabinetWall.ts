import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

const TEX_SIZE = 512;

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash2(ix: number, iy: number, seed = 0): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

let cachedSandOakTexture: THREE.DataTexture | null = null;

/**
 * Generates a very smooth, soft, low-contrast vertical sand-oak (zandeiken) veneer
 * DataTexture matching the Superkeukens Savino Chabrier kastenwand and the powdery
 * matte architectural diorama style of the house.
 * Grain runs softly and vertically along V (Y axis).
 */
function getSandOakTexture(): THREE.DataTexture {
  if (cachedSandOakTexture) return cachedSandOakTexture;

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const NUM_STRIPS = 4;

  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;

      const stripFloat = u * NUM_STRIPS;
      const stripIdx = Math.floor(stripFloat) % NUM_STRIPS;
      const stripFrac = stripFloat - Math.floor(stripFloat);

      // Subtle, serene plank warmth variation (±0.6%)
      const stripTone = 0.994 + hash2(stripIdx, 5, 31) * 0.012;
      const offsetU = hash2(stripIdx, 13, 47) * 7.0;
      const offsetV = hash2(stripIdx, 23, 61) * 9.0;

      const seamDist = Math.min(stripFrac, 1.0 - stripFrac);
      const seamMask = smoothstep(0.0, 0.04, seamDist);

      // Soft, low-frequency silky vertical sand-oak flow (no harsh streaks or dark veins)
      const warp1 = periodicNoise2D(u * 4 + offsetU, v * 2 + offsetV, 4, 2, 83);
      const warp2 = periodicNoise2D(u * 8 + offsetU, v * 4 + offsetV, 8, 4, 109);

      const ringCoord =
        (u * 3.0 + offsetU) * 1.7 +
        warp1 * 1.25 +
        warp2 * 0.25 +
        Math.sin((v + offsetV * 0.1) * Math.PI * 2) * 0.18;

      const ringPhase = fract(ringCoord);
      const ringBand = Math.sin(ringPhase * Math.PI);
      const latewood = (1.0 - smoothstep(0.22, 0.86, ringBand)) * 0.55;

      // Soft, muted warm sand-oak palette (#e5cfa9 -> #dbc198)
      const shade = stripTone * (0.996 + 0.004 * seamMask);
      const r = Math.min(255, Math.round(lerp(229, 219, latewood) * shade));
      const g = Math.min(255, Math.round(lerp(207, 193, latewood) * shade));
      const b = Math.min(255, Math.round(lerp(169, 152, latewood) * shade));

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
  cachedSandOakTexture = tex;
  return tex;
}

/**
 * Offsets the UV coordinates of a BoxGeometry so each cabinet door displays a distinct
 * vertical slice of the sand-oak veneer texture.
 */
function createOakDoorGeometry(
  w: number,
  h: number,
  d: number,
  uOffset: number,
  vOffset: number
): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv');
  const uScale = Math.max(0.25, w / 0.70);
  const vScale = Math.max(0.25, h / 1.80);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * uScale + uOffset, uv.getY(i) * vScale + vOffset);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Superkeukens Savino Chabrier — Tall Kitchen Cabinet Wall (Kastenwand)
 *
 * Dimensions: 240 cm (W) × 60 cm (D) × 224 cm (H)
 * - 4 × 60 cm cabinet columns, split into 4 lower doors and 4 upper doors/compartments
 * - One continuous recessed brushed-copper grip rail (greeplijst) across all 4 cabinets
 * - Built-in matte-black oven in the 2nd upper cabinet from the right (column index 2 when facing +Z)
 *   with an interactive drop-down oven door and hollow baking cavity with racks
 * - Recessed matching sand-oak toe-kick plinth at floor level
 * - Clean white back panel with zero overlapping/clipping geometry
 * - Interactive hinged doors (hover to open, click to pin) with interior shelving
 */
export const kitchenTallCabinetWallPrefab: AssetPrefabDefinition = {
  prefabId: 'kitchen_tall_cabinet_wall',
  defaultLabel: 'Keuken Kastenwand Savino Chabrier (240 × 60 × 224 cm)',
  defaultDimensions: {
    width: cm(240, 'user_supplied', 'User specification: Savino Chabrier kastenwand 240 cm wide (4 × 60 cm)'),
    depth: cm(60, 'user_supplied', 'User specification: Savino Chabrier kastenwand 60 cm deep'),
    height: cm(224, 'user_supplied', 'User specification: Savino Chabrier kastenwand 224 cm high'),
  },
  build3D: ({ width, depth, height, registerInteractiveDoor }) => {
    const group = new THREE.Group();
    const oakMap = getSandOakTexture();

    // --- Materials ---
    const oakMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: oakMap,
      roughness: 0.85,
      metalness: 0.0,
    });

    const oakPlinthMat = new THREE.MeshStandardMaterial({
      color: '#f2ece2',
      map: oakMap,
      roughness: 0.88,
      metalness: 0.0,
    });

    // Warm lighter brushed copper recessed greeplijst (one continuous piece)
    const copperInlayMat = new THREE.MeshStandardMaterial({
      color: '#c88b6b',
      roughness: 0.40,
      metalness: 0.44,
    });

    // Clean white exterior cabinet backer (no black back, zero clipping)
    const backWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f4f1eb',
      roughness: 0.90,
      metalness: 0.0,
    });

    // Warm taupe-sand interior cabinet lining so open cabinets clearly read as deep
    // cabinetry rather than blending into the white plaster nis walls
    const interiorBackMat = new THREE.MeshStandardMaterial({
      color: '#b8aa98',
      roughness: 0.88,
      metalness: 0.0,
    });
    const interiorDividerMat = new THREE.MeshStandardMaterial({
      color: '#c4b7a5',
      roughness: 0.86,
      metalness: 0.0,
    });
    const interiorShelfMat = new THREE.MeshStandardMaterial({
      color: '#d4c7b4',
      roughness: 0.85,
      metalness: 0.0,
    });

    // Built-in matte-black oven materials
    const ovenMatteBlackMat = new THREE.MeshStandardMaterial({
      color: '#1b1d20',
      roughness: 0.44,
      metalness: 0.14,
    });
    const ovenGlassMat = new THREE.MeshStandardMaterial({
      color: '#121518',
      roughness: 0.14,
      metalness: 0.16,
      transparent: true,
      opacity: 0.68,
    });
    const ovenCavityMat = new THREE.MeshStandardMaterial({
      color: '#262a30',
      roughness: 0.82,
      metalness: 0.08,
    });
    const ovenRackMat = new THREE.MeshStandardMaterial({
      color: '#9aa0a8',
      roughness: 0.38,
      metalness: 0.55,
    });
    const ovenTrayMat = new THREE.MeshStandardMaterial({
      color: '#1e2126',
      roughness: 0.55,
      metalness: 0.22,
    });
    const ovenDisplayMat = new THREE.MeshStandardMaterial({
      color: '#f2f5f7',
      emissive: '#d8e6f0',
      emissiveIntensity: 0.65,
      roughness: 0.3,
      metalness: 0.0,
    });

    const triggerMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    // --- Parametric Vertical & Horizontal Layout ---
    const colCount = 4;
    const colW = width / colCount; // 0.60 m
    const doorGap = 0.003; // 3 mm architectural reveal between doors
    const doorW = colW - doorGap;
    const doorThick = 0.020; // 20 mm cabinet front
    const doorFrontZ = depth / 2 - 0.002; // +0.298 m (oven handle reaches exact +0.300 m)
    const doorCenterZ = doorFrontZ - doorThick / 2; // +0.288 m
    const carcassFrontZ = doorFrontZ - doorThick; // +0.278 m

    const plinthH = 0.100; // 10 cm recessed toe-kick
    const plinthInsetFront = 0.055; // 5.5 cm toe-kick recess
    const plinthInsetSide = 0.018;

    const lowerDoorBottomY = plinthH; // 0.100 m
    const lowerDoorH = Math.min(0.720, height * 0.322); // 72.0 cm lower doors
    const lowerDoorTopY = lowerDoorBottomY + lowerDoorH; // 0.820 m

    const copperChannelH = 0.038; // 3.8 cm recessed copper inlay (greeplijst)
    const copperBottomY = lowerDoorTopY; // 0.820 m
    const copperTopY = copperBottomY + copperChannelH; // 0.858 m

    // Copper channel Z layout (strictly non-overlapping with side panels & dividers!)
    const copperBackPlateThick = 0.006;
    const copperBackFaceZ = doorFrontZ - 0.035; // +0.263 m (back of copper rail)
    const copperInnerFaceZ = copperBackFaceZ + copperBackPlateThick; // +0.269 m
    const copperFrontZ = doorFrontZ - 0.006; // +0.292 m

    const upperBottomY = copperTopY; // 0.858 m
    const upperTopY = height; // 2.240 m
    const upperFullH = upperTopY - upperBottomY; // 1.382 m

    // Oven column is 2nd upper cabinet from the right when facing +Z (indices 0, 1, 2, 3 -> index 2)
    const ovenColIndex = 2;
    const ovenTrimBelowH = 0.018;
    const ovenH = 0.596;
    const ovenW = Math.min(0.596, colW - 0.004);
    const ovenBottomY = upperBottomY + ovenTrimBelowH; // 0.876 m
    const ovenTopY = ovenBottomY + ovenH; // 1.472 m
    const aboveOvenBottomY = ovenTopY + 0.004; // 1.476 m
    const aboveOvenH = upperTopY - aboveOvenBottomY; // 0.764 m

    const sidePanelThick = 0.018;
    const panelT = 0.018;
    const carcassBackZ = -depth / 2; // -0.300 m
    const backInnerZ = carcassBackZ + panelT; // -0.282 m (everything inside starts here -> zero back clipping!)
    const carcassSideDepth = carcassFrontZ - carcassBackZ; // 0.578 m
    const carcassSideCenterZ = (carcassBackZ + carcassFrontZ) / 2;
    const innerDepth = carcassFrontZ - backInnerZ; // 0.560 m
    const innerCenterZ = (backInnerZ + carcassFrontZ) / 2;

    // 1. Recessed Sand-Oak Plinth (Y: 0.000..0.100 m)
    const plinthW = width - 2 * plinthInsetSide;
    const plinthD = depth - plinthInsetFront;
    const plinthMesh = new THREE.Mesh(
      new THREE.BoxGeometry(plinthW, plinthH, plinthD),
      oakPlinthMat
    );
    plinthMesh.name = 'kastenwand_plinth';
    plinthMesh.position.set(0, plinthH / 2, carcassBackZ + plinthD / 2);
    group.add(plinthMesh);

    // 2. Left & Right Outer Sand-Oak Side Panels (split cleanly around the copper rail -> zero edge clipping!)
    const sideBackDepthCopper = copperBackFaceZ - carcassBackZ; // stops cleanly behind copper rail
    const sideBackCenterZCopper = (carcassBackZ + copperBackFaceZ) / 2;
    const sideXPositions = [-width / 2 + sidePanelThick / 2, width / 2 - sidePanelThick / 2];

    sideXPositions.forEach((sx, idx) => {
      const tag = idx === 0 ? 'left' : 'right';
      const uSeed = idx === 0 ? 0.13 : 0.67;

      // Lower side panel (Y: plinthH..copperBottomY)
      const lowerSide = new THREE.Mesh(
        createOakDoorGeometry(sidePanelThick, lowerDoorH, carcassSideDepth, uSeed, 0.05),
        oakMat
      );
      lowerSide.name = `kastenwand_side_${tag}_lower`;
      lowerSide.position.set(sx, lowerDoorBottomY + lowerDoorH / 2, carcassSideCenterZ);
      group.add(lowerSide);

      // Mid side section behind the continuous copper channel (Y: copperBottomY..copperTopY)
      const midSide = new THREE.Mesh(
        createOakDoorGeometry(sidePanelThick, copperChannelH, sideBackDepthCopper, uSeed, 0.34),
        oakMat
      );
      midSide.name = `kastenwand_side_${tag}_mid`;
      midSide.position.set(sx, copperBottomY + copperChannelH / 2, sideBackCenterZCopper);
      group.add(midSide);

      // Upper side panel (Y: copperTopY..height)
      const upperSide = new THREE.Mesh(
        createOakDoorGeometry(sidePanelThick, upperFullH, carcassSideDepth, uSeed, 0.38),
        oakMat
      );
      upperSide.name = `kastenwand_side_${tag}_upper`;
      upperSide.position.set(sx, upperBottomY + upperFullH / 2, carcassSideCenterZ);
      group.add(upperSide);
    });

    // 3. Back Panel: clean white on exterior (-Z), warm taupe-sand on interior (+Z)
    const innerW = width - 2 * sidePanelThick;
    const bodyH = height - plinthH;
    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, bodyH, panelT),
      [
        backWhiteMat, // +X
        backWhiteMat, // -X
        backWhiteMat, // +Y
        backWhiteMat, // -Y
        interiorBackMat, // +Z (inside cabinet)
        backWhiteMat, // -Z (exterior back)
      ]
    );
    backPanel.name = 'kastenwand_back_white';
    backPanel.position.set(0, plinthH + bodyH / 2, carcassBackZ + panelT / 2);
    group.add(backPanel);

    // 4. Top, Bottom & Mid-Deck Carcass Panels (all start at backInnerZ -> zero back clipping!)
    const topPanel = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, panelT, innerDepth),
      oakMat
    );
    topPanel.name = 'kastenwand_top';
    topPanel.position.set(0, height - panelT / 2, innerCenterZ);
    group.add(topPanel);

    const bottomPanel = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, panelT, innerDepth),
      interiorShelfMat
    );
    bottomPanel.name = 'kastenwand_bottom';
    bottomPanel.position.set(0, plinthH + panelT / 2, innerCenterZ);
    group.add(bottomPanel);

    // Horizontal mid-deck behind the copper channel (stops strictly at copperBackFaceZ)
    const midDeckDepth = copperBackFaceZ - backInnerZ;
    const midDeck = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, copperChannelH, midDeckDepth),
      interiorShelfMat
    );
    midDeck.name = 'kastenwand_mid_deck';
    midDeck.position.set(0, copperBottomY + copperChannelH / 2, backInnerZ + midDeckDepth / 2);
    group.add(midDeck);

    // 5. Three Internal Vertical Dividers — split cleanly below & above the copper channel so
    //    NO divider can ever intersect or show through the continuous copper greeplijst,
    //    with a clean white front edge (no dark strip).
    const lowerDivH = lowerDoorH - panelT; // from top of bottomPanel to copperBottomY
    const upperDivH = upperFullH - panelT; // from copperTopY to underside of topPanel
    const dividerMats = [
      interiorDividerMat, // +X
      interiorDividerMat, // -X
      interiorDividerMat, // +Y
      interiorDividerMat, // -Y
      backWhiteMat, // +Z (clean white front edge)
      interiorDividerMat, // -Z
    ];

    for (let i = 1; i < colCount; i++) {
      const divX = -width / 2 + i * colW;

      // Lower divider
      const lowDiv = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, lowerDivH, innerDepth),
        dividerMats
      );
      lowDiv.name = `kastenwand_divider_lower_${i}`;
      lowDiv.position.set(divX, plinthH + panelT + lowerDivH / 2, innerCenterZ);
      group.add(lowDiv);

      // Upper divider
      const upDiv = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, upperDivH, innerDepth),
        dividerMats
      );
      upDiv.name = `kastenwand_divider_upper_${i}`;
      upDiv.position.set(divX, copperTopY + upperDivH / 2, innerCenterZ);
      group.add(upDiv);
    }

    // Interior shelves inside each cabinet column (visible when doors open)
    const shelfDepth = innerDepth - 0.04;
    const shelfCenterZ = backInnerZ + shelfDepth / 2;
    for (let c = 0; c < colCount; c++) {
      const colCenterX = -width / 2 + (c + 0.5) * colW;
      const shelfW = colW - 0.022;

      // Lower cabinet shelf
      const lowShelf = new THREE.Mesh(
        new THREE.BoxGeometry(shelfW, 0.016, shelfDepth),
        interiorShelfMat
      );
      lowShelf.position.set(colCenterX, plinthH + lowerDoorH * 0.50, shelfCenterZ);
      group.add(lowShelf);

      // Upper shelves (skip oven cavity zone in ovenColIndex)
      const upperShelfHeights =
        c === ovenColIndex ? [aboveOvenBottomY + aboveOvenH * 0.48] : [1.22, 1.58, 1.92];
      for (const sy of upperShelfHeights) {
        if (sy > height - 0.12) continue;
        const upShelf = new THREE.Mesh(
          new THREE.BoxGeometry(shelfW, 0.016, shelfDepth),
          interiorShelfMat
        );
        upShelf.position.set(colCenterX, sy, shelfCenterZ);
        group.add(upShelf);
      }
    }

    // 6. ONE Continuous Recessed Copper Inlay (Greeplijst, Y: 0.820..0.858 m, full 240 cm width)
    // Extruded C-channel profile along X -> guaranteed single unbroken piece with zero edge clipping!
    const copperLipT = 0.004;
    const copperProfile = new THREE.Shape();
    // Profile in 2D (x = local Z depth from copperBackFaceZ, y = local Y from copperBottomY)
    const railDepth = copperFrontZ - copperBackFaceZ; // 2.9 cm
    copperProfile.moveTo(0, 0);
    copperProfile.lineTo(railDepth, 0);
    copperProfile.lineTo(railDepth, copperLipT);
    copperProfile.lineTo(copperBackPlateThick, copperLipT);
    copperProfile.lineTo(copperBackPlateThick, copperChannelH - copperLipT);
    copperProfile.lineTo(railDepth, copperChannelH - copperLipT);
    copperProfile.lineTo(railDepth, copperChannelH);
    copperProfile.lineTo(0, copperChannelH);
    copperProfile.closePath();

    const copperGeo = new THREE.ExtrudeGeometry(copperProfile, {
      depth: width,
      bevelEnabled: false,
      steps: 1,
    });
    // Rotate so extrusion axis (+Z) maps to world +X, and profile +X maps to world +Z
    copperGeo.rotateY(-Math.PI / 2);
    // After rotateY(-PI/2): (x, y, z) -> (-z, y, x). Shift X by +width/2 so X spans [-width/2, +width/2]
    copperGeo.translate(width / 2, copperBottomY, copperBackFaceZ);
    copperGeo.computeVertexNormals();

    const copperRailMesh = new THREE.Mesh(copperGeo, copperInlayMat);
    copperRailMesh.name = 'kastenwand_copper_greeplijst';
    group.add(copperRailMesh);

    // 7. Helper to build an interactive hinged sand-oak cabinet door
    const addHingedDoor = (
      id: string,
      colIndex: number,
      bottomY: number,
      doorH: number,
      hingeSide: 'left' | 'right',
      uOffset: number,
      vOffset: number
    ) => {
      const colLeftX = -width / 2 + colIndex * colW + doorGap / 2;
      const colRightX = colLeftX + doorW;
      const hingeX = hingeSide === 'left' ? colLeftX : colRightX;
      // Place pivot at front outer corner (doorFrontZ) like a concealed Euro hinge so
      // opening outward never swings the door's back edge into the adjacent nis cheek wall.
      const pivot = new THREE.Group();
      pivot.name = `pivot_${id}`;
      pivot.position.set(hingeX, bottomY + doorH / 2, doorFrontZ);
      group.add(pivot);

      const doorGeo = createOakDoorGeometry(doorW, doorH, doorThick, uOffset, vOffset);
      const doorMesh = new THREE.Mesh(doorGeo, oakMat);
      doorMesh.name = id;
      doorMesh.position.set(hingeSide === 'left' ? doorW / 2 : -doorW / 2, 0, -doorThick / 2);
      pivot.add(doorMesh);

      const trigger = new THREE.Mesh(
        new THREE.BoxGeometry(doorW, doorH, doorThick + 0.04),
        triggerMat
      );
      trigger.userData.isInteractiveTrigger = true;
      trigger.position.set(
        (colLeftX + colRightX) / 2,
        bottomY + doorH / 2,
        doorCenterZ + 0.01
      );
      group.add(trigger);

      const openAngle = hingeSide === 'left' ? -Math.PI * 0.42 : Math.PI * 0.42;
      registerInteractiveDoor?.({
        subId: id,
        pivots: [{ group: pivot, openAngle, closedAngle: 0, currentAngle: 0 }],
        triggerMeshes: [trigger, doorMesh],
      });
    };

    // Build 4 Lower Doors + 4 Upper Columns
    const hingeSides: Array<'left' | 'right'> = ['left', 'right', 'left', 'right'];
    const uSeeds = [0.04, 0.29, 0.57, 0.81];

    for (let c = 0; c < colCount; c++) {
      const side = hingeSides[c];
      const uOff = uSeeds[c];

      // Lower cabinet door (Y: 0.100..0.820 m)
      addHingedDoor(
        `kastenwand_door_lower_${c + 1}`,
        c,
        lowerDoorBottomY,
        lowerDoorH,
        side,
        uOff,
        0.05
      );

      if (c !== ovenColIndex) {
        // Full-height upper cabinet door (Y: 0.858..2.240 m)
        addHingedDoor(
          `kastenwand_door_upper_${c + 1}`,
          c,
          upperBottomY,
          upperFullH,
          side,
          uOff,
          0.38
        );
      } else {
        // Oven Column (2nd upper cabinet from the right, index 2)
        const colCenterX = -width / 2 + (c + 0.5) * colW;

        // Thin sand-oak filler strip between copper rail and oven base
        const trimGeo = createOakDoorGeometry(doorW, ovenTrimBelowH, doorThick, uOff, 0.36);
        const trimMesh = new THREE.Mesh(trimGeo, oakMat);
        trimMesh.name = 'kastenwand_oven_lower_trim';
        trimMesh.position.set(colCenterX, upperBottomY + ovenTrimBelowH / 2, doorCenterZ);
        group.add(trimMesh);

        // Built-in Matte-Black Oven (Y: 0.876..1.472 m, 59.6 × 59.6 cm)
        const ovenGroup = new THREE.Group();
        ovenGroup.name = 'kastenwand_builtin_oven';
        group.add(ovenGroup);

        const ovenFrontZ = depth / 2 - 0.016; // +0.284 m (handle reaches exact +0.300 m)
        const ovenFasciaThick = 0.018;
        const ctrlH = 0.105;
        const ovenDoorH = ovenH - ctrlH - 0.004; // ~0.487 m
        const ovenDoorBottomY = ovenBottomY;

        // Hollow dark oven cavity (back, top, bottom, left, right walls — visible when oven door opens!)
        const cavW = ovenW - 0.05;
        const cavH = ovenDoorH - 0.03;
        const cavD = 0.44;
        const cavWallT = 0.014;
        const cavFrontZ = ovenFrontZ - ovenFasciaThick; // +0.266 m
        const cavCenterZ = cavFrontZ - cavD / 2;
        const cavCenterY = ovenDoorBottomY + ovenDoorH / 2;

        const cavBack = new THREE.Mesh(
          new THREE.BoxGeometry(cavW, cavH, cavWallT),
          ovenCavityMat
        );
        cavBack.position.set(colCenterX, cavCenterY, cavFrontZ - cavD + cavWallT / 2);
        ovenGroup.add(cavBack);

        const cavTop = new THREE.Mesh(
          new THREE.BoxGeometry(cavW, cavWallT, cavD),
          ovenCavityMat
        );
        cavTop.position.set(colCenterX, cavCenterY + cavH / 2 - cavWallT / 2, cavCenterZ);
        ovenGroup.add(cavTop);

        const cavBottom = new THREE.Mesh(
          new THREE.BoxGeometry(cavW, cavWallT, cavD),
          ovenCavityMat
        );
        cavBottom.position.set(colCenterX, cavCenterY - cavH / 2 + cavWallT / 2, cavCenterZ);
        ovenGroup.add(cavBottom);

        for (const s of [-1, 1]) {
          const cavSide = new THREE.Mesh(
            new THREE.BoxGeometry(cavWallT, cavH, cavD),
            ovenCavityMat
          );
          cavSide.position.set(colCenterX + s * (cavW / 2 - cavWallT / 2), cavCenterY, cavCenterZ);
          ovenGroup.add(cavSide);
        }

        // Interior wire rack & enameled baking tray inside cavity
        const rackW = cavW - 0.04;
        const rackD = cavD - 0.08;
        const rackY = cavCenterY + 0.05;
        // Front & back rack bars + side rails + cross wires
        for (const rz of [-rackD / 2, rackD / 2]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(rackW, 0.005, 0.005), ovenRackMat);
          bar.position.set(colCenterX, rackY, cavCenterZ + rz);
          ovenGroup.add(bar);
        }
        for (let rw = -3; rw <= 3; rw++) {
          const wire = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, rackD), ovenRackMat);
          wire.position.set(colCenterX + (rw / 3.5) * (rackW / 2), rackY, cavCenterZ);
          ovenGroup.add(wire);
        }

        // Dark baking tray on lower shelf level
        const bakingTray = new THREE.Mesh(
          new THREE.BoxGeometry(rackW - 0.01, 0.016, rackD - 0.02),
          ovenTrayMat
        );
        bakingTray.position.set(colCenterX, cavCenterY - 0.08, cavCenterZ);
        ovenGroup.add(bakingTray);

        // Stationary top control panel strip (10.5 cm high)
        const ctrlY = ovenTopY - ctrlH / 2;
        const ctrlStrip = new THREE.Mesh(
          new THREE.BoxGeometry(ovenW, ctrlH, ovenFasciaThick),
          ovenMatteBlackMat
        );
        ctrlStrip.name = 'oven_control_panel';
        ctrlStrip.position.set(colCenterX, ctrlY, ovenFrontZ - ovenFasciaThick / 2);
        ovenGroup.add(ctrlStrip);

        // Centered crisp digital clock display
        const display = new THREE.Mesh(
          new THREE.BoxGeometry(0.052, 0.016, 0.003),
          ovenDisplayMat
        );
        display.name = 'oven_digital_display';
        display.position.set(colCenterX, ctrlY + 0.004, ovenFrontZ + 0.0015);
        ovenGroup.add(display);

        // Two rotary control knobs flanking the display
        const knobGeo = new THREE.CylinderGeometry(0.016, 0.017, 0.014, 20);
        knobGeo.rotateX(Math.PI / 2);
        for (const knobSide of [-1, 1]) {
          const knob = new THREE.Mesh(knobGeo, ovenMatteBlackMat);
          knob.name = knobSide < 0 ? 'oven_knob_left' : 'oven_knob_right';
          knob.position.set(colCenterX + knobSide * 0.115, ctrlY + 0.004, ovenFrontZ + 0.007);
          ovenGroup.add(knob);
        }

        // Interactive Bottom-Hinged Drop-Down Oven Door
        const ovenDoorPivot = new THREE.Group();
        ovenDoorPivot.name = 'pivot_kastenwand_oven_door';
        ovenDoorPivot.position.set(colCenterX, ovenDoorBottomY, ovenFrontZ - ovenFasciaThick / 2);
        ovenGroup.add(ovenDoorPivot);

        const frameSideW = 0.052;
        const frameTopH = 0.068;
        const frameBotH = 0.064;
        const doorLocalCenterY = ovenDoorH / 2;
        const doorLocalFrontZ = ovenFasciaThick / 2;

        // Left & right vertical matte-black door stiles
        for (const s of [-1, 1]) {
          const stile = new THREE.Mesh(
            new THREE.BoxGeometry(frameSideW, ovenDoorH, ovenFasciaThick),
            ovenMatteBlackMat
          );
          stile.position.set(s * (ovenW / 2 - frameSideW / 2), doorLocalCenterY, 0);
          ovenDoorPivot.add(stile);
        }

        // Top & bottom horizontal matte-black door rails
        const innerGlassW = ovenW - 2 * frameSideW;
        const topRail = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, frameTopH, ovenFasciaThick),
          ovenMatteBlackMat
        );
        topRail.position.set(0, ovenDoorH - frameTopH / 2, 0);
        ovenDoorPivot.add(topRail);

        const botRail = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, frameBotH, ovenFasciaThick),
          ovenMatteBlackMat
        );
        botRail.position.set(0, frameBotH / 2, 0);
        ovenDoorPivot.add(botRail);

        // Tinted glass viewing window
        const glassH = ovenDoorH - frameTopH - frameBotH;
        const glassMesh = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, glassH, 0.008),
          ovenGlassMat
        );
        glassMesh.name = 'oven_door_glass';
        glassMesh.position.set(0, frameBotH + glassH / 2, 0);
        ovenDoorPivot.add(glassMesh);

        // Sleek horizontal matte-black bar handle (front edge hits exact Z = +depth/2 = +0.300 m)
        const handleW = 0.46;
        const handleBarThick = 0.009;
        const handleLocalY = ovenDoorH - frameTopH * 0.50;
        const handleProjFromDoor = depth / 2 - ovenFrontZ; // 0.016 m
        const handleBar = new THREE.Mesh(
          new THREE.BoxGeometry(handleW, 0.014, handleBarThick),
          ovenMatteBlackMat
        );
        handleBar.name = 'oven_door_handle';
        handleBar.position.set(
          0,
          handleLocalY,
          doorLocalFrontZ + handleProjFromDoor - handleBarThick / 2
        );
        ovenDoorPivot.add(handleBar);

        // Two handle standoffs connecting bar to oven top rail
        const standoffDepth = handleProjFromDoor - handleBarThick;
        for (const s of [-1, 1]) {
          const standoff = new THREE.Mesh(
            new THREE.BoxGeometry(0.014, 0.012, standoffDepth),
            ovenMatteBlackMat
          );
          standoff.position.set(
            s * (handleW / 2 - 0.032),
            handleLocalY,
            doorLocalFrontZ + standoffDepth / 2
          );
          ovenDoorPivot.add(standoff);
        }

        // Subtle brushed-metal brand emblem on lower oven rail
        const emblem = new THREE.Mesh(
          new THREE.BoxGeometry(0.026, 0.005, 0.002),
          ovenRackMat
        );
        emblem.position.set(0, frameBotH * 0.52, doorLocalFrontZ + 0.001);
        ovenDoorPivot.add(emblem);

        // Stationary invisible trigger covering the oven door opening
        const ovenTrigger = new THREE.Mesh(
          new THREE.BoxGeometry(ovenW, ovenDoorH, ovenFasciaThick + 0.04),
          triggerMat
        );
        ovenTrigger.userData.isInteractiveTrigger = true;
        ovenTrigger.position.set(colCenterX, ovenDoorBottomY + ovenDoorH / 2, ovenFrontZ + 0.01);
        ovenGroup.add(ovenTrigger);

        registerInteractiveDoor?.({
          subId: 'kastenwand_oven_door',
          pivots: [
            {
              group: ovenDoorPivot,
              openAngle: Math.PI * 0.44, // ~80° drop-down outward toward +Z
              closedAngle: 0,
              currentAngle: 0,
              onUpdate: (angle) => {
                ovenDoorPivot.rotation.x = angle;
              },
            },
          ],
          triggerMeshes: [ovenTrigger, glassMesh, topRail, botRail, handleBar],
        });

        // Upper cabinet door above the oven (Y: 1.476..2.240 m)
        addHingedDoor(
          `kastenwand_door_upper_${c + 1}_above_oven`,
          c,
          aboveOvenBottomY,
          aboveOvenH,
          side,
          uOff,
          0.62
        );
      }
    }

    return group;
  },
};
