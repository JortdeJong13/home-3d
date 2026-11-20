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
 * Generates a soft, warm vertical sand-oak (zandeiken) veneer DataTexture matching
 * the Superkeukens Savino Chabrier kastenwand in Keuken rose groot.webp and the
 * powdery matte architectural diorama style of the house.
 * Grain runs vertically along V (Y axis).
 */
function getSandOakTexture(): THREE.DataTexture {
  if (cachedSandOakTexture) return cachedSandOakTexture;

  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  const NUM_STRIPS = 6;

  for (let py = 0; py < TEX_SIZE; py++) {
    const v = py / TEX_SIZE;
    for (let px = 0; px < TEX_SIZE; px++) {
      const u = px / TEX_SIZE;

      const stripFloat = u * NUM_STRIPS;
      const stripIdx = Math.floor(stripFloat) % NUM_STRIPS;
      const stripFrac = stripFloat - Math.floor(stripFloat);

      const stripTone = 0.988 + hash2(stripIdx, 5, 31) * 0.024;
      const offsetU = hash2(stripIdx, 13, 47) * 9.0;
      const offsetV = hash2(stripIdx, 23, 61) * 11.0;

      const seamDist = Math.min(stripFrac, 1.0 - stripFrac);
      const seamMask = smoothstep(0.0, 0.022, seamDist);

      // Gentle vertical flowing sand-oak grain ribbons
      const warp1 = periodicNoise2D(u * 10 + offsetU, v * 3 + offsetV, 10, 3, 83);
      const warp2 = periodicNoise2D(u * 20 + offsetU, v * 6 + offsetV, 20, 6, 109);
      const fineStreak = periodicNoise2D(u * 48 + offsetU, v * 8 + offsetV, 48, 8, 151);

      const ringCoord =
        (u * 7.5 + offsetU) * 2.3 +
        warp1 * 2.1 +
        warp2 * 0.45 +
        Math.sin((v + offsetV * 0.1) * Math.PI * 2) * 0.25;

      const ringPhase = fract(ringCoord);
      const ringBand = Math.sin(ringPhase * Math.PI);
      const latewood = (1.0 - smoothstep(0.14, 0.76, ringBand)) * 0.78 + fineStreak * 0.22;

      // Warm honey-sand oak palette (#dfc095 -> #cda574) matching Keuken rose groot.webp
      const shade = stripTone * (0.992 + 0.008 * seamMask);
      const r = Math.min(255, Math.round(lerp(223, 205, latewood) * shade));
      const g = Math.min(255, Math.round(lerp(192, 165, latewood) * shade));
      const b = Math.min(255, Math.round(lerp(149, 116, latewood) * shade));

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
  const uScale = Math.max(0.25, w / 0.65);
  const vScale = Math.max(0.25, h / 1.60);
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
 * - Continuous recessed brushed-copper grip rail (greeplijst) between lower and upper doors
 * - Built-in matte-black oven in the 2nd upper cabinet from the right (column index 2 when facing +Z)
 * - Recessed matching sand-oak toe-kick plinth at floor level
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
      roughness: 0.82,
      metalness: 0.0,
    });

    const oakPlinthMat = new THREE.MeshStandardMaterial({
      color: '#ebe4da',
      map: oakMap,
      roughness: 0.86,
      metalness: 0.0,
    });

    // Warm brushed copper recessed greeplijst (matches Keuken rose groot.webp)
    const copperInlayMat = new THREE.MeshStandardMaterial({
      color: '#9b6246',
      roughness: 0.42,
      metalness: 0.52,
    });

    // Dark shadow backing behind door reveals
    const carcassShadowMat = new THREE.MeshStandardMaterial({
      color: '#342e29',
      roughness: 0.92,
      metalness: 0.0,
    });

    // Clean interior melamine shelves (visible when interactive doors swing open)
    const interiorShelfMat = new THREE.MeshStandardMaterial({
      color: '#e5dfd5',
      roughness: 0.88,
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
      opacity: 0.74,
    });
    const ovenCavityMat = new THREE.MeshStandardMaterial({
      color: '#25282d',
      roughness: 0.85,
      metalness: 0.05,
    });
    const ovenRackMat = new THREE.MeshStandardMaterial({
      color: '#888e96',
      roughness: 0.42,
      metalness: 0.45,
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
    const carcassBackZ = -depth / 2; // -0.300 m
    const carcassBodyDepth = carcassFrontZ - carcassBackZ; // 0.578 m
    const carcassBodyCenterZ = (carcassBackZ + carcassFrontZ) / 2;

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

    // 2. Left & Right Outer Sand-Oak Side Panels (X: exact -width/2 and +width/2, Y: plinthH..height)
    const bodyH = height - plinthH;
    const sideGeo = createOakDoorGeometry(sidePanelThick, bodyH, carcassBodyDepth, 0.13, 0.05);
    const leftSide = new THREE.Mesh(sideGeo, oakMat);
    leftSide.name = 'kastenwand_side_left';
    leftSide.position.set(-width / 2 + sidePanelThick / 2, plinthH + bodyH / 2, carcassBodyCenterZ);
    group.add(leftSide);

    const rightSide = new THREE.Mesh(sideGeo, oakMat);
    rightSide.name = 'kastenwand_side_right';
    rightSide.position.set(width / 2 - sidePanelThick / 2, plinthH + bodyH / 2, carcassBodyCenterZ);
    group.add(rightSide);

    // 3. Top, Bottom, Back Carcass Panels & Vertical Dividers (keeps interior hollow for open doors)
    const innerW = width - 2 * sidePanelThick;
    const panelT = 0.018;

    const backPanel = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, bodyH, panelT),
      carcassShadowMat
    );
    backPanel.name = 'kastenwand_back';
    backPanel.position.set(0, plinthH + bodyH / 2, carcassBackZ + panelT / 2);
    group.add(backPanel);

    const topPanel = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, panelT, carcassBodyDepth),
      oakMat
    );
    topPanel.name = 'kastenwand_top';
    topPanel.position.set(0, height - panelT / 2, carcassBodyCenterZ);
    group.add(topPanel);

    const bottomPanel = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, panelT, carcassBodyDepth),
      interiorShelfMat
    );
    bottomPanel.name = 'kastenwand_bottom';
    bottomPanel.position.set(0, plinthH + panelT / 2, carcassBodyCenterZ);
    group.add(bottomPanel);

    // Horizontal mid-deck behind the copper channel
    const midDeckDepth = carcassBodyDepth - 0.028;
    const midDeck = new THREE.Mesh(
      new THREE.BoxGeometry(innerW, copperChannelH, midDeckDepth),
      carcassShadowMat
    );
    midDeck.name = 'kastenwand_mid_deck';
    midDeck.position.set(
      0,
      copperBottomY + copperChannelH / 2,
      carcassBackZ + midDeckDepth / 2
    );
    group.add(midDeck);

    // 3 vertical internal cabinet dividers between the 4 columns (front edge dark so 3 mm gaps read dark)
    const divDepth = carcassBodyDepth - panelT;
    for (let i = 1; i < colCount; i++) {
      const divX = -width / 2 + i * colW;
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, bodyH - 2 * panelT, divDepth),
        interiorShelfMat
      );
      divider.name = `kastenwand_divider_${i}`;
      divider.position.set(divX, plinthH + bodyH / 2, carcassBackZ + panelT + divDepth / 2);
      group.add(divider);

      // Dark front edge strip on divider so the 3 mm reveal between doors is crisp
      const edgeStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, bodyH - 2 * panelT, 0.004),
        carcassShadowMat
      );
      edgeStrip.position.set(divX, plinthH + bodyH / 2, carcassFrontZ - 0.002);
      group.add(edgeStrip);
    }

    // Interior shelves inside each cabinet column (visible when doors open)
    const shelfDepth = carcassBodyDepth - 0.06;
    const shelfCenterZ = carcassBackZ + panelT + shelfDepth / 2;
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

    // 4. Continuous Recessed Copper Inlay (Greeplijst, Y: 0.820..0.858 m)
    // C-channel profile: recessed back plate + top & bottom return flanges
    const copperBackZ = doorFrontZ - 0.032; // 3.2 cm recess behind door front
    const copperFrontZ = doorFrontZ - 0.008; // 8 mm inset from door face
    const copperLipDepth = copperFrontZ - copperBackZ;
    const copperLipCenterZ = (copperBackZ + copperFrontZ) / 2;

    const copperBack = new THREE.Mesh(
      new THREE.BoxGeometry(width, copperChannelH, 0.006),
      copperInlayMat
    );
    copperBack.name = 'kastenwand_copper_inlay_back';
    copperBack.position.set(0, copperBottomY + copperChannelH / 2, copperBackZ);
    group.add(copperBack);

    const copperTopLip = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.004, copperLipDepth),
      copperInlayMat
    );
    copperTopLip.name = 'kastenwand_copper_inlay_top';
    copperTopLip.position.set(0, copperTopY - 0.002, copperLipCenterZ);
    group.add(copperTopLip);

    const copperBottomLip = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.004, copperLipDepth),
      copperInlayMat
    );
    copperBottomLip.name = 'kastenwand_copper_inlay_bottom';
    copperBottomLip.position.set(0, copperBottomY + 0.002, copperLipCenterZ);
    group.add(copperBottomLip);

    // 5. Helper to build an interactive hinged sand-oak cabinet door
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
      const pivot = new THREE.Group();
      pivot.name = `pivot_${id}`;
      pivot.position.set(hingeX, bottomY + doorH / 2, doorCenterZ);
      group.add(pivot);

      const doorGeo = createOakDoorGeometry(doorW, doorH, doorThick, uOffset, vOffset);
      const doorMesh = new THREE.Mesh(doorGeo, oakMat);
      doorMesh.name = id;
      doorMesh.position.set(hingeSide === 'left' ? doorW / 2 : -doorW / 2, 0, 0);
      pivot.add(doorMesh);

      // Stationary invisible trigger plane for smooth hover/click interaction
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

        // Recessed dark oven cavity behind door glass
        const ovenCavityDepth = 0.42;
        const ovenCavity = new THREE.Mesh(
          new THREE.BoxGeometry(ovenW - 0.04, ovenH - 0.04, ovenCavityDepth),
          ovenCavityMat
        );
        ovenCavity.position.set(
          colCenterX,
          ovenBottomY + ovenH / 2,
          carcassFrontZ - ovenCavityDepth / 2
        );
        ovenGroup.add(ovenCavity);

        // Two subtle metallic wire rack bars inside oven cavity
        for (const rackRelY of [0.34, 0.56]) {
          const rackBar = new THREE.Mesh(
            new THREE.BoxGeometry(ovenW - 0.12, 0.006, 0.012),
            ovenRackMat
          );
          rackBar.position.set(
            colCenterX,
            ovenBottomY + ovenH * rackRelY,
            carcassFrontZ - 0.06
          );
          ovenGroup.add(rackBar);
        }

        // Matte-black outer oven fascia bezel (front at Z = +0.284 m so handle projects cleanly to +0.300 m)
        const ovenFrontZ = depth / 2 - 0.016; // +0.284 m
        const ovenFasciaThick = 0.018;
        const ovenCenterY = ovenBottomY + ovenH / 2;

        // Control strip at top of oven (10.5 cm high)
        const ctrlH = 0.105;
        const ctrlY = ovenTopY - ctrlH / 2;
        const ctrlStrip = new THREE.Mesh(
          new THREE.BoxGeometry(ovenW, ctrlH, ovenFasciaThick),
          ovenMatteBlackMat
        );
        ctrlStrip.name = 'oven_control_panel';
        ctrlStrip.position.set(colCenterX, ctrlY, ovenFrontZ - ovenFasciaThick / 2);
        ovenGroup.add(ctrlStrip);

        // Crisp centered digital clock display
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

        // Oven door perimeter frame + dark tinted glass window
        const ovenDoorH = ovenH - ctrlH - 0.004; // ~0.487 m
        const ovenDoorBottomY = ovenBottomY;
        const ovenDoorCenterY = ovenDoorBottomY + ovenDoorH / 2;
        const frameSideW = 0.052;
        const frameTopH = 0.068;
        const frameBotH = 0.064;

        // Left & right vertical matte-black door stiles
        for (const s of [-1, 1]) {
          const stile = new THREE.Mesh(
            new THREE.BoxGeometry(frameSideW, ovenDoorH, ovenFasciaThick),
            ovenMatteBlackMat
          );
          stile.position.set(
            colCenterX + s * (ovenW / 2 - frameSideW / 2),
            ovenDoorCenterY,
            ovenFrontZ - ovenFasciaThick / 2
          );
          ovenGroup.add(stile);
        }

        // Top & bottom horizontal matte-black door rails
        const innerGlassW = ovenW - 2 * frameSideW;
        const topRail = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, frameTopH, ovenFasciaThick),
          ovenMatteBlackMat
        );
        topRail.position.set(
          colCenterX,
          ovenDoorBottomY + ovenDoorH - frameTopH / 2,
          ovenFrontZ - ovenFasciaThick / 2
        );
        ovenGroup.add(topRail);

        const botRail = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, frameBotH, ovenFasciaThick),
          ovenMatteBlackMat
        );
        botRail.position.set(
          colCenterX,
          ovenDoorBottomY + frameBotH / 2,
          ovenFrontZ - ovenFasciaThick / 2
        );
        ovenGroup.add(botRail);

        // Tinted glass viewing window
        const glassH = ovenDoorH - frameTopH - frameBotH;
        const glassMesh = new THREE.Mesh(
          new THREE.BoxGeometry(innerGlassW, glassH, 0.008),
          ovenGlassMat
        );
        glassMesh.name = 'oven_door_glass';
        glassMesh.position.set(
          colCenterX,
          ovenDoorBottomY + frameBotH + glassH / 2,
          ovenFrontZ - 0.006
        );
        ovenGroup.add(glassMesh);

        // Sleek horizontal matte-black bar handle (front edge hits exact Z = +depth/2 = +0.300 m)
        const handleW = 0.46;
        const handleBarThick = 0.009;
        const handleY = ovenDoorBottomY + ovenDoorH - frameTopH * 0.50;
        const handleBar = new THREE.Mesh(
          new THREE.BoxGeometry(handleW, 0.014, handleBarThick),
          ovenMatteBlackMat
        );
        handleBar.name = 'oven_door_handle';
        handleBar.position.set(colCenterX, handleY, depth / 2 - handleBarThick / 2);
        ovenGroup.add(handleBar);

        // Two handle standoffs connecting bar to oven top rail
        const standoffDepth = depth / 2 - handleBarThick - ovenFrontZ;
        for (const s of [-1, 1]) {
          const standoff = new THREE.Mesh(
            new THREE.BoxGeometry(0.014, 0.012, standoffDepth),
            ovenMatteBlackMat
          );
          standoff.position.set(
            colCenterX + s * (handleW / 2 - 0.032),
            handleY,
            ovenFrontZ + standoffDepth / 2
          );
          ovenGroup.add(standoff);
        }

        // Subtle brushed-metal brand emblem on lower oven rail
        const emblem = new THREE.Mesh(
          new THREE.BoxGeometry(0.026, 0.005, 0.002),
          ovenRackMat
        );
        emblem.position.set(colCenterX, ovenDoorBottomY + frameBotH * 0.52, ovenFrontZ + 0.001);
        ovenGroup.add(emblem);

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

        // Keep reference to ovenCenterY unused warning free
        void ovenCenterY;
      }
    }

    return group;
  },
};
