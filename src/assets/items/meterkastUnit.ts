import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Dutch NEN 2768 Meterkast (Meterruimte) — Bouwnummer 55
 *
 * Built per Verkooptekening VK-06, Tekening woonwensen 55.1, and Technische omschrijving:
 * - §13 & §15.4: Factory-finished white (RAL 9010) wooden meterkastfront with flush door,
 *   kastslot (cupboard lock), upper transom panel (bovenpaneel), and NEN 2768 top/bottom
 *   natural ventilation grilles.
 * - §15.4: Unfinished interior walls/ceiling, raw plywood backboard (meterbord), airtight
 *   grey floor entry plate (bodemplaat), and exposed surface-mounted conduits.
 * - §21.1: Cold water main entry, brass shut-off valve (hoofdkraan), water meter, and risers.
 * - §22.1: Main fuse box, smart electricity meter (slimme meter), modern groepenkast with
 *   multiple RCDs (aardlekschakelaars) & MCBs, exposed vertical PVC conduits, and surface-mounted
 *   (opbouw) double earthed wall socket (WCD) on the left side as drawn on VK-06 / 55.1.
 * - §22.4 & §22.5: Doorbell transformer inside, doorbell chime (schel) on front header,
 *   and telecom/fiber entry box (FTU).
 * - Interactive door: hinged on the left (-X) jamb, swings outward (+Z) into the Hal on hover
 *   and toggles pinned-open on click.
 */
export const meterkastUnitPrefab: AssetPrefabDefinition = {
  prefabId: 'meterkast_unit',
  defaultLabel: 'Meterkast / Meterruimte (81 × 45 × 260 cm)',
  defaultDimensions: {
    width: cm(
      80.9,
      'verified_drawing',
      'VK-06 & 55.1: 97 cm nis − 16 cm stl-koker − 0.1 cm speling = 80.9 cm (75 cm NEN 2768 inwendig)'
    ),
    depth: cm(
      44.9,
      'verified_drawing',
      'VK-06 & NEN 2768: 45 cm diepe meterkast vóór achterliggende leidingschacht (Z = -6.999..-6.550 m)'
    ),
    height: cm(
      260,
      'verified_drawing',
      'Begane grond verdiepingshoogte 260 cm (220 cm deur + 40 cm wit bovenpaneel)'
    ),
  },

  build3D: ({ width, depth, height, getMat, registerInteractiveDoor }) => {
    const group = new THREE.Group();

    // Shared house materials (factory-finished white RAL 9010 door, frame & matching plaster top)
    const doorWhiteMat = getMat('door_interior_white');
    const frameWhiteMat = getMat('window_frame_cream');
    const topPlasterMat = getMat('interior_wall_plaster');

    // Soft matte architectural diorama materials for interior & technical hardware
    const rawWallMat = new THREE.MeshStandardMaterial({
      color: '#e6e2da',
      roughness: 0.94,
      metalness: 0.0,
    });
    const plywoodMat = new THREE.MeshStandardMaterial({
      color: '#d8be98',
      roughness: 0.90,
      metalness: 0.0,
    });
    const floorPlateMat = new THREE.MeshStandardMaterial({
      color: '#9ca2a8',
      roughness: 0.88,
      metalness: 0.04,
    });
    const ventGrilleMat = new THREE.MeshStandardMaterial({
      color: '#eceae4',
      roughness: 0.78,
      metalness: 0.04,
    });
    const ventSlotDarkMat = new THREE.MeshStandardMaterial({
      color: '#6b6f75',
      roughness: 0.92,
      metalness: 0.0,
    });
    const aluminiumMat = new THREE.MeshStandardMaterial({
      color: '#c8cdd2',
      roughness: 0.36,
      metalness: 0.45,
    });
    const plasticWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f2f1ec',
      roughness: 0.62,
      metalness: 0.02,
    });
    const plasticLightGreyMat = new THREE.MeshStandardMaterial({
      color: '#d8dce0',
      roughness: 0.68,
      metalness: 0.02,
    });
    const pvcConduitMat = new THREE.MeshStandardMaterial({
      color: '#c7cbd0',
      roughness: 0.72,
      metalness: 0.02,
    });
    const darkSlateMat = new THREE.MeshStandardMaterial({
      color: '#323840',
      roughness: 0.55,
      metalness: 0.08,
    });
    const rubberBlackMat = new THREE.MeshStandardMaterial({
      color: '#3a3d42',
      roughness: 0.90,
      metalness: 0.0,
    });
    const waterPipeBlueMat = new THREE.MeshStandardMaterial({
      color: '#3e7cb1',
      roughness: 0.68,
      metalness: 0.05,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#c9a658',
      roughness: 0.44,
      metalness: 0.42,
    });
    const copperPipeMat = new THREE.MeshStandardMaterial({
      color: '#c4835b',
      roughness: 0.48,
      metalness: 0.38,
    });
    const accentRedMat = new THREE.MeshStandardMaterial({
      color: '#c85a4d',
      roughness: 0.65,
      metalness: 0.05,
    });
    const accentBlueMat = new THREE.MeshStandardMaterial({
      color: '#4a86b8',
      roughness: 0.65,
      metalness: 0.05,
    });
    const accentOrangeMat = new THREE.MeshStandardMaterial({
      color: '#d9823b',
      roughness: 0.72,
      metalness: 0.02,
    });
    const ledGreenMat = new THREE.MeshStandardMaterial({
      color: '#52b788',
      roughness: 0.45,
      metalness: 0.0,
    });

    const addBox = (
      parent: THREE.Object3D,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    const addCyl = (
      parent: THREE.Object3D,
      rTop: number,
      rBot: number,
      len: number,
      x: number,
      y: number,
      z: number,
      mat: THREE.Material,
      rotX = 0,
      rotZ = 0
    ) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 12), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rotX, 0, rotZ);
      parent.add(mesh);
      return mesh;
    };

    // =========================================================================
    // 1. UNFINISHED INTERIOR ENCLOSURE, BODEMPLAAT & PLYWOOD BACKBOARD (§15.4)
    // =========================================================================
    const sideT = 0.016;
    const backT = 0.012;
    const floorPlateH = 0.024;
    const topCapT = 0.016;
    const frameDepth = 0.055;
    const innerW = width - 2 * sideT;
    const innerD = depth - backT - frameDepth;
    const zBackInner = -depth / 2 + backT;
    const zFrontFace = depth / 2;

    const bodyH = height - topCapT;

    // Rear backing shell
    addBox(group, width, bodyH, backT, 0, bodyH / 2, -depth / 2 + backT / 2, rawWallMat);
    // Left & right raw interior lining cheeks (stopping behind the white front kozijn)
    addBox(
      group,
      sideT,
      bodyH,
      depth - frameDepth,
      -width / 2 + sideT / 2,
      bodyH / 2,
      -frameDepth / 2,
      rawWallMat
    );
    addBox(
      group,
      sideT,
      bodyH,
      depth - frameDepth,
      width / 2 - sideT / 2,
      bodyH / 2,
      -frameDepth / 2,
      rawWallMat
    );
    // Seamless full-width, full-depth top cap flush at ceiling height (matching surrounding plaster walls)
    addBox(group, width, topCapT, depth, 0, height - topCapT / 2, 0, topPlasterMat);
    // Airtight grey floor entry plate (bodemplaat / invoerplaat)
    addBox(
      group,
      innerW,
      floorPlateH,
      innerD + 0.015,
      0,
      floorPlateH / 2,
      zBackInner + (innerD + 0.015) / 2,
      floorPlateMat
    );

    // Raw plywood meterbord (backboard) mounted on rear wall (Y: 0.04..2.36 m)
    const boardT = 0.018;
    const boardW = innerW - 0.024;
    const boardH = Math.min(2.32, height - 0.16);
    const boardBottomY = floorPlateH + 0.016;
    const zBoardFace = zBackInner + boardT;
    addBox(
      group,
      boardW,
      boardH,
      boardT,
      0,
      boardBottomY + boardH / 2,
      zBackInner + boardT / 2,
      plywoodMat
    );

    // =========================================================================
    // 2. LOWER ZONE: WATER METER, SHUT-OFF VALVE & UTILITY ENTRIES (§21.1, §22.5)
    // =========================================================================
    // Rubber floor grommets in the airtight bodemplaat
    const grommetXs = [-0.24, -0.14, -0.02, 0.21];
    for (const gx of grommetXs) {
      addCyl(group, 0.022, 0.025, 0.012, gx, floorPlateH + 0.006, zBoardFace + 0.05, rubberBlackMat);
    }

    // 2a. Incoming Blue PE Water Supply + Brass Hoofdkraan + Water Meter (Right side)
    const waterX = 0.21;
    const waterZ = zBoardFace + 0.05;
    // Lower incoming blue PE riser (Y: 0.02..0.34 m)
    addCyl(group, 0.014, 0.014, 0.32, waterX, floorPlateH + 0.16, waterZ, waterPipeBlueMat);
    // Main brass shut-off valve (hoofdkraan) at Y = 0.35 m
    addCyl(group, 0.020, 0.020, 0.045, waterX, 0.355, waterZ, brassMat);
    addBox(group, 0.055, 0.012, 0.014, waterX - 0.028, 0.355, waterZ + 0.012, accentRedMat);
    // Horizontal brass water meter assembly (Y = 0.44 m)
    addCyl(group, 0.013, 0.013, 0.06, waterX, 0.405, waterZ, brassMat);
    addBox(group, 0.075, 0.042, 0.042, waterX - 0.01, 0.455, waterZ, brassMat);
    // Circular white water meter dial cap facing +Z
    addCyl(
      group,
      0.032,
      0.032,
      0.022,
      waterX - 0.01,
      0.455,
      waterZ + 0.024,
      accentBlueMat,
      Math.PI / 2
    );
    addCyl(
      group,
      0.026,
      0.026,
      0.008,
      waterX - 0.01,
      0.455,
      waterZ + 0.035,
      plasticWhiteMat,
      Math.PI / 2
    );
    // Upper cold water distribution riser & manifold branch
    addCyl(group, 0.011, 0.011, 0.42, waterX, 0.68, waterZ, copperPipeMat);
    addBox(group, 0.14, 0.022, 0.022, waterX - 0.06, 0.88, waterZ, brassMat);
    // Two cold-water risers continuing up into the ceiling/kitchen/toilet
    addCyl(group, 0.009, 0.009, 1.68, waterX - 0.10, 1.72, zBoardFace + 0.026, copperPipeMat);
    addCyl(group, 0.009, 0.009, 1.68, waterX - 0.03, 1.72, zBoardFace + 0.026, copperPipeMat);

    // 2b. Incoming Main Power Cable (Black) + Telecom / Fiber FTU (§22.5, Left side)
    addCyl(group, 0.013, 0.013, 0.86, -0.02, floorPlateH + 0.43, zBoardFace + 0.045, rubberBlackMat);
    // Orange/green fiber duct rising to white FTU box
    addCyl(group, 0.009, 0.009, 0.56, -0.24, floorPlateH + 0.28, zBoardFace + 0.035, accentOrangeMat);
    addBox(group, 0.105, 0.14, 0.042, -0.24, 0.63, zBoardFace + 0.021, plasticWhiteMat);
    addBox(group, 0.065, 0.026, 0.010, -0.24, 0.67, zBoardFace + 0.044, accentOrangeMat);
    // Secondary telecom empty conduit (loze leiding, §22.5)
    addCyl(group, 0.008, 0.008, 0.62, -0.14, floorPlateH + 0.31, zBoardFace + 0.032, pvcConduitMat);

    // =========================================================================
    // 3. MIDDLE ZONE: HOOFDZEKERINGKAST, SLIMME METER & OPBOUW WCD (§22.1, §22.4)
    // =========================================================================
    // 3a. Hoofdzekeringkast (Main utility fuse box, Y: 0.86..1.08 m)
    addBox(group, 0.16, 0.20, 0.095, -0.02, 0.97, zBoardFace + 0.0475, plasticLightGreyMat);
    addBox(group, 0.13, 0.16, 0.010, -0.02, 0.97, zBoardFace + 0.098, plasticWhiteMat);

    // 3b. Slimme Meter (Smart Electricity Meter, Y: 1.12..1.40 m)
    const meterW = 0.175;
    const meterH = 0.265;
    const meterD = 0.098;
    const meterY = 1.255;
    const meterX = -0.02;
    addBox(group, meterW, meterH, meterD, meterX, meterY, zBoardFace + meterD / 2, plasticWhiteMat);
    // Lower terminal cover seam
    addBox(
      group,
      meterW - 0.012,
      0.065,
      0.008,
      meterX,
      meterY - meterH / 2 + 0.040,
      zBoardFace + meterD + 0.002,
      plasticLightGreyMat
    );
    // Recessed dark LCD display window
    addBox(
      group,
      0.092,
      0.048,
      0.008,
      meterX,
      meterY + 0.045,
      zBoardFace + meterD + 0.002,
      darkSlateMat
    );
    // Green status LED & blue utility push button
    addBox(group, 0.012, 0.012, 0.008, meterX - 0.048, meterY - 0.008, zBoardFace + meterD + 0.003, ledGreenMat);
    addBox(group, 0.022, 0.016, 0.010, meterX + 0.042, meterY - 0.008, zBoardFace + meterD + 0.004, accentBlueMat);

    // 3c. Opbouw Dubbele WCD (Surface-mounted double socket, drawn on left inside meterkast!)
    const wcdX = -0.245;
    const wcdY = 1.06;
    addBox(group, 0.072, 0.145, 0.044, wcdX, wcdY, zBoardFace + 0.022, plasticWhiteMat);
    // Two circular recessed socket wells
    addCyl(group, 0.020, 0.020, 0.006, wcdX, wcdY + 0.034, zBoardFace + 0.044, plasticLightGreyMat, Math.PI / 2);
    addCyl(group, 0.020, 0.020, 0.006, wcdX, wcdY - 0.034, zBoardFace + 0.044, plasticLightGreyMat, Math.PI / 2);
    // PVC conduit from WCD up to groepenkast
    addCyl(group, 0.008, 0.008, 0.38, wcdX, wcdY + 0.26, zBoardFace + 0.018, pvcConduitMat);

    // 3d. Beltransformator (Doorbell transformer, §22.4, right of smart meter)
    addBox(group, 0.085, 0.105, 0.062, -0.245, 1.32, zBoardFace + 0.031, plasticLightGreyMat);
    addBox(group, 0.068, 0.042, 0.012, -0.245, 1.32, zBoardFace + 0.064, plasticWhiteMat);

    // =========================================================================
    // 4. UPPER ZONE: GROEPENKAST & EXPOSED PVC CONDUITS (§22.1 & §15.4)
    // =========================================================================
    const gkW = 0.38;
    const gkH = 0.39;
    const gkD = 0.112;
    const gkX = -0.04;
    const gkY = 1.66;
    // Main white/light-grey distribution board enclosure
    addBox(group, gkW, gkH, gkD, gkX, gkY, zBoardFace + gkD / 2, plasticWhiteMat);
    // Subtle front frame bezel
    addBox(group, gkW - 0.022, gkH - 0.022, 0.008, gkX, gkY, zBoardFace + gkD + 0.002, plasticLightGreyMat);

    // Two rows of DIN-rail modular breakers (installatieautomaten + 2 aardlekschakelaars + hoofdschakelaar)
    const rowYs = [gkY + 0.075, gkY - 0.075];
    for (let r = 0; r < rowYs.length; r++) {
      const ry = rowYs[r];
      // Dark DIN rail slot recess
      addBox(group, gkW - 0.055, 0.068, 0.008, gkX, ry, zBoardFace + gkD + 0.006, darkSlateMat);
      const moduleCount = 10;
      const modSpacing = (gkW - 0.075) / moduleCount;
      for (let m = 0; m < moduleCount; m++) {
        const mx = gkX - (gkW - 0.075) / 2 + (m + 0.5) * modSpacing;
        // White breaker body
        addBox(group, modSpacing * 0.84, 0.062, 0.012, mx, ry, zBoardFace + gkD + 0.009, plasticWhiteMat);
        // Toggle switch color coding: main switch (red), RCDs (blue), standard MCBs (dark slate)
        let toggleMat = darkSlateMat;
        if (r === 1 && m === 0) toggleMat = accentRedMat;
        else if ((r === 0 && (m === 0 || m === 5)) || (r === 1 && m === 5)) toggleMat = accentBlueMat;
        addBox(group, modSpacing * 0.55, 0.015, 0.012, mx, ry + 0.006, zBoardFace + gkD + 0.016, toggleMat);
      }
      // Subtle circuit label strip below each row
      addBox(group, gkW - 0.065, 0.014, 0.004, gkX, ry - 0.044, zBoardFace + gkD + 0.006, plasticWhiteMat);
    }

    // Exposed vertical 16 mm PVC conduits rising from top of groepenkast to ceiling (§15.4)
    const conduitStartY = gkY + gkH / 2;
    const conduitEndY = height - topCapT;
    const conduitLen = conduitEndY - conduitStartY;
    const conduitCount = 9;
    const conduitSpan = gkW - 0.05;
    for (let i = 0; i < conduitCount; i++) {
      const cx = gkX - conduitSpan / 2 + (i / (conduitCount - 1)) * conduitSpan;
      addCyl(
        group,
        0.0085,
        0.0085,
        conduitLen,
        cx,
        conduitStartY + conduitLen / 2,
        zBoardFace + 0.026,
        pvcConduitMat
      );
    }
    // Horizontal PVC conduit saddle/clamp bar across the risers
    addBox(group, gkW + 0.02, 0.022, 0.016, gkX, conduitStartY + 0.30, zBoardFace + 0.014, aluminiumMat);

    // =========================================================================
    // 5. FACTORY-FINISHED WHITE WOODEN METERKASTFRONT (KOZIJN + BOVENPANEEL)
    // =========================================================================
    const jambW = 0.044;
    const doorClearH = Math.min(2.20, bodyH - 0.25); // Matches adjacent B77b toilet door (220 cm)!
    const headerRailH = 0.044;
    const topPanelH = Math.max(0.01, bodyH - doorClearH - headerRailH);
    const zFrameCenter = zFrontFace - frameDepth / 2;

    // Left & right full-height wooden jambs (stopping cleanly under top cap)
    addBox(group, jambW, bodyH, frameDepth, -width / 2 + jambW / 2, bodyH / 2, zFrameCenter, frameWhiteMat);
    addBox(group, jambW, bodyH, frameDepth, width / 2 - jambW / 2, bodyH / 2, zFrameCenter, frameWhiteMat);
    // Horizontal transom rail above the 220 cm door
    const doorOpenW = width - 2 * jambW;
    addBox(
      group,
      doorOpenW,
      headerRailH,
      frameDepth,
      0,
      doorClearH + headerRailH / 2,
      zFrameCenter,
      frameWhiteMat
    );
    // White factory-finished upper panel (bovenpaneel) from transom rail up to top cap
    const topPanelCenterY = doorClearH + headerRailH + topPanelH / 2;
    addBox(
      group,
      doorOpenW,
      topPanelH,
      frameDepth,
      0,
      topPanelCenterY,
      zFrameCenter,
      doorWhiteMat
    );

    // =========================================================================
    // 6. INTERACTIVE HINGED METERKAST DOOR (LEFT-HINGED, SWINGS OUTWARD +Z)
    // =========================================================================
    const doorGap = 0.003;
    const doorW = doorOpenW - 2 * doorGap;
    const doorH = doorClearH - 0.012; // Small bottom air clearance
    const doorT = 0.036;
    const doorBottomY = 0.008;

    const hingePivot = new THREE.Group();
    // Hinged on the LEFT (-X) jamb at the front outer corner
    hingePivot.position.set(-doorOpenW / 2 + doorGap, 0, zFrontFace);
    group.add(hingePivot);

    // Main flush white door leaf (stompe deur, RAL 9010)
    const doorLeaf = addBox(
      hingePivot,
      doorW,
      doorH,
      doorT,
      doorW / 2,
      doorBottomY + doorH / 2,
      -doorT / 2,
      doorWhiteMat
    );

    // Three subtle aluminium butt hinges along the left hinge edge
    for (const hy of [0.24, 1.12, 1.98]) {
      addCyl(hingePivot, 0.006, 0.006, 0.075, 0.002, hy, 0.004, aluminiumMat);
    }

    // NEN 2768 Top & Bottom Louvered Ventilation Grilles (§15.4 & §20)
    const addVentGrille = (vy: number) => {
      const gw = Math.min(0.40, doorW * 0.58);
      const gh = 0.062;
      const gx = doorW / 2;
      // Outer grille bezel on front (+Z) & back (-Z) of door
      addBox(hingePivot, gw, gh, 0.006, gx, vy, 0.003, ventGrilleMat);
      addBox(hingePivot, gw, gh, 0.006, gx, vy, -doorT - 0.003, ventGrilleMat);
      // Horizontal dark louver shadow slots
      for (let i = -2; i <= 2; i++) {
        addBox(hingePivot, gw - 0.024, 0.005, 0.004, gx, vy + i * 0.010, 0.0065, ventSlotDarkMat);
      }
    };
    addVentGrille(0.13);
    addVentGrille(doorBottomY + doorH - 0.13);

    // Kastslot (cupboard lock, §13) + slim brushed-aluminium cabinet pull on right lock stile
    const lockX = doorW - 0.062;
    const lockY = 1.05;
    // Rectangular aluminium escutcheon plate
    addBox(hingePivot, 0.036, 0.115, 0.006, lockX, lockY, 0.003, aluminiumMat);
    // Keyhole cylinder & dark key slot
    addCyl(hingePivot, 0.009, 0.009, 0.006, lockX, lockY - 0.028, 0.007, aluminiumMat, Math.PI / 2);
    addBox(hingePivot, 0.004, 0.012, 0.004, lockX, lockY - 0.028, 0.0105, darkSlateMat);
    // Compact aluminium pull knob above lock cylinder
    addCyl(hingePivot, 0.006, 0.006, 0.022, lockX, lockY + 0.022, 0.014, aluminiumMat, Math.PI / 2);
    addCyl(hingePivot, 0.013, 0.012, 0.010, lockX, lockY + 0.022, 0.026, aluminiumMat, Math.PI / 2);

    // Stationary invisible doorway trigger so hover/click stays rock-solid while door swings open
    if (registerInteractiveDoor) {
      const triggerGeo = new THREE.BoxGeometry(doorOpenW, doorClearH, 0.16);
      const triggerMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const triggerMesh = new THREE.Mesh(triggerGeo, triggerMat);
      triggerMesh.position.set(0, doorClearH / 2, zFrontFace + 0.02);
      triggerMesh.userData.isInteractiveTrigger = true;
      group.add(triggerMesh);

      registerInteractiveDoor({
        subId: 'door',
        pivots: [
          {
            group: hingePivot,
            openAngle: -Math.PI * 0.52, // Swings ~94° outward (+Z) into Hal, hinged on left (-X)
            closedAngle: 0,
            currentAngle: 0,
          },
        ],
        triggerMeshes: [triggerMesh, doorLeaf],
      });
    }

    return group;
  },
};
