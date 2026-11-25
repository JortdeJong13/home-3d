import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Attic Air-to-Water Heat Pump Indoor Unit (Hydrobox) & 171 L Boilervat — Bouwnummer 55
 *
 * Built per Verkooptekening VK-06, Tekening woonwensen 55.3, and Technische omschrijving:
 * - §19 Centrale verwarming: Lucht-water warmtepomp binnenunit (wp) inclusief 171 liter
 *   verticale boilervat voor warm tapwater (twee-onder-één-kapwoning).
 * - §21.1 Waterleidingen: Koudwateraansluiting op boilervat, warmwaterafvoer, en
 *   vulkraan / inlaatcombinatie met manometer.
 * - §6 Riolering: Condens- en overstortafvoer met trechter/sifon in hittebestendig PVC.
 * - §22.1 Elektrische installatie: Opbouw wandcontactdoos (WCD) en opbouw PVC leidingwerk
 *   in de opstelplaats installaties op zolder.
 *
 * Local coordinate convention (origin at bottom-center, Y = 0 on floor):
 * - Back face (Z = -depth/2 = -0.33 m) sits flush against the rear of the Overloop wall (Z = -6.36 m).
 * - Front face (Z = +depth/2 = +0.33 m) faces into the rear attic room (when placed at rotationDeg = 180).
 * - At rotationDeg = 180:
 *   - local -X maps to world +X (right side of Overloop rear wall -> 171 L cylindrical boilervat per VK-06 / 55.3).
 *   - local +X maps to world -X (left side of Overloop rear wall -> 'wp' hydrobox, expansion vessel & piping).
 */
export const atticHeatPumpBoilerPrefab: AssetPrefabDefinition = {
  prefabId: 'attic_heat_pump_boiler',
  defaultLabel: 'Warmtepomp Binnenunit & 171 L Boilervat (WP)',
  defaultDimensions: {
    width: cm(
      120,
      'verified_drawing',
      'VK-06 & 55.3 opstelplaats installaties: 171 L boilervat (Ø 59 cm) naast WP-binnenunit & expansievat (120 cm totaal)'
    ),
    depth: cm(
      66,
      'verified_drawing',
      'VK-06 & 55.3: Ø 59 cm 171 L boilervat + 7 cm muurspeling & leidingwerk (66 cm diep)'
    ),
    height: cm(
      190,
      'verified_drawing',
      'Technische omschrijving §19: 171 L boilervat (~148 cm) + wandgemonteerde WP-binnenunit & bovenleidingwerk (190 cm)'
    ),
  },

  build3D: ({ width, depth, height }) => {
    const group = new THREE.Group();

    const backZ = -depth / 2; // -0.33 m (wall plane)

    // -------------------------------------------------------------------------
    // Soft Architectural Diorama Materials
    // -------------------------------------------------------------------------
    const casingWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f2f1ec',
      roughness: 0.72,
      metalness: 0.04,
    });
    const casingOffWhiteMat = new THREE.MeshStandardMaterial({
      color: '#e7e6e0',
      roughness: 0.78,
      metalness: 0.03,
    });
    const darkAnthraciteMat = new THREE.MeshStandardMaterial({
      color: '#2c3138',
      roughness: 0.62,
      metalness: 0.12,
    });
    const rubberFeetMat = new THREE.MeshStandardMaterial({
      color: '#32353a',
      roughness: 0.90,
      metalness: 0.02,
    });
    const trimGreyMat = new THREE.MeshStandardMaterial({
      color: '#aeb4bc',
      roughness: 0.48,
      metalness: 0.28,
    });
    const steelBracketMat = new THREE.MeshStandardMaterial({
      color: '#b8bec6',
      roughness: 0.45,
      metalness: 0.42,
    });
    const expansionRedMat = new THREE.MeshStandardMaterial({
      color: '#b84239',
      roughness: 0.56,
      metalness: 0.10,
    });
    const insulationMat = new THREE.MeshStandardMaterial({
      color: '#3c4047',
      roughness: 0.92,
      metalness: 0.0,
    });
    const copperPipeMat = new THREE.MeshStandardMaterial({
      color: '#c4835b',
      roughness: 0.44,
      metalness: 0.45,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: '#cca856',
      roughness: 0.42,
      metalness: 0.48,
    });
    const pvcGreyMat = new THREE.MeshStandardMaterial({
      color: '#bcc2c8',
      roughness: 0.70,
      metalness: 0.02,
    });
    const valveBlueMat = new THREE.MeshStandardMaterial({
      color: '#3d79ad',
      roughness: 0.58,
      metalness: 0.06,
    });
    const valveRedMat = new THREE.MeshStandardMaterial({
      color: '#c44b42',
      roughness: 0.58,
      metalness: 0.06,
    });
    const screenBgMat = new THREE.MeshStandardMaterial({
      color: '#20384c',
      roughness: 0.35,
      metalness: 0.08,
      emissive: '#16354d',
      emissiveIntensity: 0.35,
    });
    const ledGreenMat = new THREE.MeshStandardMaterial({
      color: '#4ec483',
      roughness: 0.35,
      metalness: 0.0,
      emissive: '#35a869',
      emissiveIntensity: 0.6,
    });
    const dialFaceMat = new THREE.MeshStandardMaterial({
      color: '#f7f6f2',
      roughness: 0.65,
      metalness: 0.0,
    });

    // Helper: add a cylinder pipe between two 3D points
    const addPipeSegment = (
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      radius: number,
      mat: THREE.Material,
      radialSegments = 10
    ) => {
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      if (len < 0.001) return;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, len, radialSegments),
        mat
      );
      mesh.position.copy(p1).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      group.add(mesh);
    };

    // Helper: add an elbow sphere joint so 90-degree bends look seamless
    const addPipeJoint = (p: THREE.Vector3, radius: number, mat: THREE.Material) => {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.06, 10, 8), mat);
      joint.position.copy(p);
      group.add(joint);
    };

    // Helper: route a polyline of pipes with smooth spherical elbows
    const addPipeRun = (points: THREE.Vector3[], radius: number, mat: THREE.Material) => {
      for (let i = 0; i < points.length - 1; i++) {
        addPipeSegment(points[i], points[i + 1], radius, mat);
        if (i > 0) {
          addPipeJoint(points[i], radius, mat);
        }
      }
    };

    // =========================================================================
    // 1. 171 LITER BOILERVAT (Vertical Hot Water Cylinder — local -X side)
    // =========================================================================
    const boilerX = -width * 0.25; // -0.30 m (world X = +2.60 m at 180 deg)
    const boilerZ = 0.025;         // Back at -0.27 m (6 cm from wall), front at +0.32 m
    const boilerR = 0.295;         // Ø 59 cm insulated 171 L cylinder
    const footH = 0.042;
    const plinthH = 0.045;
    const bodyBaseY = footH + plinthH; // 0.087 m
    const bodyH = 1.34;                // 0.087 -> 1.427 m
    const bodyTopY = bodyBaseY + bodyH;
    const capH = 0.055;                // 1.427 -> 1.482 m domed insulated top cap
    const capTopY = bodyTopY + capH;

    // 1a. Three adjustable anti-vibration leveling feet (120 deg spacing)
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 + Math.PI / 6;
      const fx = boilerX + Math.cos(angle) * (boilerR * 0.72);
      const fz = boilerZ + Math.sin(angle) * (boilerR * 0.72);

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.036, 0.016, 12),
        rubberFeetMat
      );
      pad.position.set(fx, 0.008, fz);
      group.add(pad);

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, footH - 0.014, 10),
        steelBracketMat
      );
      stem.position.set(fx, 0.014 + (footH - 0.014) / 2, fz);
      group.add(stem);
    }

    // 1b. Recessed lower plinth skirt
    const lowerSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR - 0.012, boilerR - 0.018, plinthH, 32),
      darkAnthraciteMat
    );
    lowerSkirt.position.set(boilerX, footH + plinthH / 2, boilerZ);
    group.add(lowerSkirt);

    // 1c. Main matte-white insulated jacket cylinder
    const tankBody = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR, boilerR, bodyH, 36),
      casingWhiteMat
    );
    tankBody.position.set(boilerX, bodyBaseY + bodyH / 2, boilerZ);
    group.add(tankBody);

    // Lower & upper brushed metallic trim rings around jacket
    for (const ringY of [bodyBaseY + 0.01, bodyTopY - 0.008]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(boilerR + 0.001, 0.006, 8, 36),
        trimGreyMat
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(boilerX, ringY, boilerZ);
      group.add(ring);
    }

    // 1d. Gently tapered insulated top crown + anthracite outer rim
    const topRim = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR - 0.008, boilerR + 0.002, 0.022, 36),
      darkAnthraciteMat
    );
    topRim.position.set(boilerX, bodyTopY + 0.011, boilerZ);
    group.add(topRim);

    const topCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR * 0.80, boilerR - 0.010, capH - 0.016, 36),
      casingOffWhiteMat
    );
    topCrown.position.set(boilerX, bodyTopY + 0.018 + (capH - 0.016) / 2, boilerZ);
    group.add(topCrown);

    // 1e. Front upper temperature gauge & brand badge (facing +Z into Zolder)
    const gaugeY = 1.18;
    const gaugeZ = boilerZ + boilerR + 0.004;

    const gaugeBezel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.038, 0.016, 20),
      darkAnthraciteMat
    );
    gaugeBezel.rotation.x = Math.PI / 2;
    gaugeBezel.position.set(boilerX, gaugeY, gaugeZ);
    group.add(gaugeBezel);

    const gaugeDial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.029, 0.029, 0.004, 20),
      dialFaceMat
    );
    gaugeDial.rotation.x = Math.PI / 2;
    gaugeDial.position.set(boilerX, gaugeY, gaugeZ + 0.008);
    group.add(gaugeDial);

    const gaugeNeedle = new THREE.Mesh(
      new THREE.BoxGeometry(0.004, 0.024, 0.003),
      valveRedMat
    );
    gaugeNeedle.position.set(boilerX + 0.005, gaugeY + 0.005, gaugeZ + 0.011);
    gaugeNeedle.rotation.z = -0.55;
    group.add(gaugeNeedle);

    // Subtle brand badge bar above temperature gauge
    const tankBadge = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.020, 0.006),
      darkAnthraciteMat
    );
    tankBadge.position.set(boilerX, 1.29, boilerZ + boilerR - 0.001);
    group.add(tankBadge);

    const tankBadgeStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.008, 0.007),
      valveBlueMat
    );
    tankBadgeStripe.position.set(boilerX - 0.034, 1.29, boilerZ + boilerR);
    group.add(tankBadgeStripe);

    // 1f. Lower front inspection flange / magnesium anode cover
    const flangeY = 0.44;
    const flangePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.082, 0.014, 20),
      casingOffWhiteMat
    );
    flangePlate.rotation.x = Math.PI / 2;
    flangePlate.position.set(boilerX, flangeY, boilerZ + boilerR - 0.002);
    group.add(flangePlate);

    const flangeRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.078, 0.004, 8, 24),
      trimGreyMat
    );
    flangeRim.position.set(boilerX, flangeY, boilerZ + boilerR + 0.005);
    group.add(flangeRim);

    // 1g. Four top brass connection bosses on boiler crown (DHW hot/cold + coil flow/return)
    const tankPorts = [
      { x: boilerX - 0.09, z: boilerZ - 0.04, r: 0.016 }, // Cold water in
      { x: boilerX - 0.02, z: boilerZ - 0.07, r: 0.016 }, // Hot tapwater out
      { x: boilerX + 0.06, z: boilerZ - 0.06, r: 0.019 }, // Coil supply (from WP)
      { x: boilerX + 0.12, z: boilerZ - 0.02, r: 0.019 }, // Coil return (to WP)
    ];
    for (const port of tankPorts) {
      const boss = new THREE.Mesh(
        new THREE.CylinderGeometry(port.r, port.r * 1.15, 0.045, 12),
        brassMat
      );
      boss.position.set(port.x, capTopY + 0.018, port.z);
      group.add(boss);
    }

    // =========================================================================
    // 2. WALL-MOUNTED WARMTEPOMP BINNENUNIT / HYDROBOX (local +X side)
    // =========================================================================
    const hydroW = 0.44;
    const hydroD = 0.30;
    const hydroH = 0.78;
    const hydroX = 0.28;                     // X spans [+0.06, +0.50]
    const hydroBaseY = 1.06;                 // Y spans [1.06, 1.84] (well below sloped roof)
    const hydroCenterY = hydroBaseY + hydroH / 2;
    const hydroZ = backZ + 0.015 + hydroD / 2; // 1.5 cm wall mounting rail behind hydrobox
    const hydroFrontZ = hydroZ + hydroD / 2;

    // 2a. Galvanized steel wall mounting rail behind hydrobox
    const wallRail = new THREE.Mesh(
      new THREE.BoxGeometry(hydroW + 0.04, 0.045, 0.015),
      steelBracketMat
    );
    wallRail.position.set(hydroX, hydroBaseY + hydroH - 0.09, backZ + 0.0075);
    group.add(wallRail);

    const wallRailLower = new THREE.Mesh(
      new THREE.BoxGeometry(hydroW - 0.04, 0.035, 0.015),
      steelBracketMat
    );
    wallRailLower.position.set(hydroX, hydroBaseY + 0.08, backZ + 0.0075);
    group.add(wallRailLower);

    // 2b. Softly beveled matte-white powder-coated hydrobox casing
    const bevel = 0.010;
    const innerW = hydroW - bevel * 2;
    const innerH = hydroH - bevel * 2;
    const innerD = hydroD - bevel * 2;
    const cornerR = 0.018;
    const hw = innerW / 2;
    const hh = innerH / 2;

    const hydroShape = new THREE.Shape();
    hydroShape.moveTo(-hw + cornerR, -hh);
    hydroShape.lineTo(hw - cornerR, -hh);
    hydroShape.quadraticCurveTo(hw, -hh, hw, -hh + cornerR);
    hydroShape.lineTo(hw, hh - cornerR);
    hydroShape.quadraticCurveTo(hw, hh, hw - cornerR, hh);
    hydroShape.lineTo(-hw + cornerR, hh);
    hydroShape.quadraticCurveTo(-hw, hh, -hw, hh - cornerR);
    hydroShape.lineTo(-hw, -hh + cornerR);
    hydroShape.quadraticCurveTo(-hw, -hh, -hw + cornerR, -hh);

    const hydroGeo = new THREE.ExtrudeGeometry(hydroShape, {
      depth: innerD,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 6,
    });
    hydroGeo.translate(0, 0, -innerD / 2);

    const hydroMesh = new THREE.Mesh(hydroGeo, casingWhiteMat);
    hydroMesh.position.set(hydroX, hydroCenterY, hydroZ);
    group.add(hydroMesh);

    // 2c. Front recessed anthracite control fascia + backlit LCD display + status LED
    const fasciaW = hydroW * 0.78;
    const fasciaH = 0.135;
    const fasciaY = hydroBaseY + hydroH * 0.72;

    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(fasciaW, fasciaH, 0.008),
      darkAnthraciteMat
    );
    fascia.position.set(hydroX, fasciaY, hydroFrontZ + 0.003);
    group.add(fascia);

    // LCD display screen on left side of fascia
    const lcd = new THREE.Mesh(
      new THREE.BoxGeometry(0.115, 0.072, 0.004),
      screenBgMat
    );
    lcd.position.set(hydroX - 0.068, fasciaY, hydroFrontZ + 0.007);
    group.add(lcd);

    // Control dial & buttons on right side of fascia
    const ctrlDial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.008, 16),
      trimGreyMat
    );
    ctrlDial.rotation.x = Math.PI / 2;
    ctrlDial.position.set(hydroX + 0.065, fasciaY, hydroFrontZ + 0.008);
    group.add(ctrlDial);

    const statusLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.007, 0.004),
      ledGreenMat
    );
    statusLed.position.set(hydroX + 0.125, fasciaY + 0.036, hydroFrontZ + 0.007);
    group.add(statusLed);

    // Subtle horizontal front service-cover seam
    const frontSeam = new THREE.Mesh(
      new THREE.BoxGeometry(hydroW - 0.03, 0.004, 0.003),
      trimGreyMat
    );
    frontSeam.position.set(hydroX, hydroBaseY + hydroH * 0.24, hydroFrontZ + 0.0015);
    group.add(frontSeam);

    // 2d. Bottom hydraulic connection bar & isolation valves under hydrobox
    const bottomManifoldXs = [
      hydroX - 0.14, // Primary flow (CV/coil)
      hydroX - 0.06, // Primary return
      hydroX + 0.04, // Outdoor unit flow
      hydroX + 0.12, // Outdoor unit return
    ];
    for (let i = 0; i < bottomManifoldXs.length; i++) {
      const mx = bottomManifoldXs[i];
      const mz = hydroZ - 0.05;
      const nut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.038, 8),
        brassMat
      );
      nut.position.set(mx, hydroBaseY - 0.019, mz);
      group.add(nut);

      // Color-coded quarter-turn ball valve handle (red = flow, blue = return)
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.008, 0.010),
        i % 2 === 0 ? valveRedMat : valveBlueMat
      );
      handle.position.set(mx, hydroBaseY - 0.048, mz + 0.018);
      group.add(handle);
    }

    // =========================================================================
    // 3. RED EXPANSIEVAT (Heating Expansion Vessel, wall-mounted below-right of hydrobox)
    // =========================================================================
    const expX = 0.44;         // X spans [+0.30, +0.58]
    const expZ = backZ + 0.16; // -0.17 m (3 cm clearance from wall)
    const expR = 0.135;        // Ø 27 cm standard 18-25 L CV expansion vessel
    const expCylH = 0.18;
    const expCenterY = 0.62;   // Spans Y = 0.44 -> 0.80 m

    const expBody = new THREE.Mesh(
      new THREE.CylinderGeometry(expR, expR, expCylH, 24),
      expansionRedMat
    );
    expBody.position.set(expX, expCenterY, expZ);
    group.add(expBody);

    // Rounded top & bottom domes (squashed spheres)
    const expTopDome = new THREE.Mesh(
      new THREE.SphereGeometry(expR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      expansionRedMat
    );
    expTopDome.scale.set(1, 0.62, 1);
    expTopDome.position.set(expX, expCenterY + expCylH / 2, expZ);
    group.add(expTopDome);

    const expBotDome = new THREE.Mesh(
      new THREE.SphereGeometry(expR, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      expansionRedMat
    );
    expBotDome.scale.set(1, 0.62, 1);
    expBotDome.position.set(expX, expCenterY - expCylH / 2, expZ);
    group.add(expBotDome);

    // Central weld seam ring
    const expWeld = new THREE.Mesh(
      new THREE.TorusGeometry(expR + 0.001, 0.004, 6, 24),
      expansionRedMat
    );
    expWeld.rotation.x = Math.PI / 2;
    expWeld.position.set(expX, expCenterY, expZ);
    group.add(expWeld);

    // Galvanized wall console bracket & top brass union
    const expConsole = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.024, expZ - backZ + 0.02),
      steelBracketMat
    );
    expConsole.position.set(expX, expCenterY + expCylH / 2 + expR * 0.62 + 0.02, (backZ + expZ) / 2);
    group.add(expConsole);

    const expBackPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.010),
      steelBracketMat
    );
    expBackPlate.position.set(expX, expCenterY + expCylH / 2 + expR * 0.62 + 0.02, backZ + 0.005);
    group.add(expBackPlate);

    const expUnion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.035, 8),
      brassMat
    );
    expUnion.position.set(expX, expCenterY + expCylH / 2 + expR * 0.62 + 0.015, expZ);
    group.add(expUnion);

    // =========================================================================
    // 4. PIPING, INSULATED LINES, SAFETY GROUP & CONDENSATE DRAIN (§6, §19, §21.1)
    // =========================================================================
    const pipeWallZ = backZ + 0.036; // 3.6 cm off rear wall
    const insulR = 0.017;            // Ø 34 mm EPDM insulated primary pipe
    const copperR = 0.0095;          // Ø 19 mm copper tapwater/CV pipe

    // 4a. Insulated primary flow & return connecting Hydrobox -> Boilervat coil
    addPipeRun(
      [
        new THREE.Vector3(bottomManifoldXs[0], hydroBaseY - 0.035, hydroZ - 0.05),
        new THREE.Vector3(bottomManifoldXs[0], 0.94, hydroZ - 0.05),
        new THREE.Vector3(bottomManifoldXs[0], 0.94, pipeWallZ),
        new THREE.Vector3(0.02, 0.94, pipeWallZ),
        new THREE.Vector3(0.02, 1.66, pipeWallZ),
        new THREE.Vector3(tankPorts[2].x, 1.66, pipeWallZ),
        new THREE.Vector3(tankPorts[2].x, 1.66, tankPorts[2].z),
        new THREE.Vector3(tankPorts[2].x, capTopY + 0.03, tankPorts[2].z),
      ],
      insulR,
      insulationMat
    );

    addPipeRun(
      [
        new THREE.Vector3(bottomManifoldXs[1], hydroBaseY - 0.035, hydroZ - 0.05),
        new THREE.Vector3(bottomManifoldXs[1], 0.87, hydroZ - 0.05),
        new THREE.Vector3(bottomManifoldXs[1], 0.87, pipeWallZ),
        new THREE.Vector3(0.075, 0.87, pipeWallZ),
        new THREE.Vector3(0.075, 1.60, pipeWallZ),
        new THREE.Vector3(tankPorts[3].x, 1.60, pipeWallZ),
        new THREE.Vector3(tankPorts[3].x, 1.60, tankPorts[3].z),
        new THREE.Vector3(tankPorts[3].x, capTopY + 0.03, tankPorts[3].z),
      ],
      insulR,
      insulationMat
    );

    // 4b. Insulated outdoor-unit supply/return risers dropping to floor slab (towards Berging)
    for (const idx of [2, 3]) {
      const mx = bottomManifoldXs[idx];
      addPipeRun(
        [
          new THREE.Vector3(mx, hydroBaseY - 0.035, hydroZ - 0.05),
          new THREE.Vector3(mx, 0.92 - (idx - 2) * 0.05, hydroZ - 0.05),
          new THREE.Vector3(mx, 0.92 - (idx - 2) * 0.05, pipeWallZ),
          new THREE.Vector3(mx - 0.14, 0.92 - (idx - 2) * 0.05, pipeWallZ),
          new THREE.Vector3(mx - 0.14, 0.0, pipeWallZ),
        ],
        insulR,
        insulationMat
      );
    }

    // 4c. Copper line to Expansion Vessel + Pressure Gauge (Manometer)
    addPipeRun(
      [
        new THREE.Vector3(expX, expCenterY + expCylH / 2 + expR * 0.62 + 0.03, expZ),
        new THREE.Vector3(expX, 0.94, expZ),
        new THREE.Vector3(expX, 0.94, pipeWallZ),
        new THREE.Vector3(bottomManifoldXs[1], 0.94, pipeWallZ),
      ],
      copperR,
      copperPipeMat
    );

    // Small brass pressure gauge (manometer) on expansion pipe
    const manoY = 0.94;
    const manoX = 0.36;
    const manoBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.016, 16),
      brassMat
    );
    manoBody.rotation.x = Math.PI / 2;
    manoBody.position.set(manoX, manoY + 0.026, pipeWallZ + 0.008);
    group.add(manoBody);

    const manoDial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.004, 16),
      dialFaceMat
    );
    manoDial.rotation.x = Math.PI / 2;
    manoDial.position.set(manoX, manoY + 0.026, pipeWallZ + 0.017);
    group.add(manoDial);

    // 4d. Copper cold water supply & hot tapwater lines from Boilervat top (§21.1)
    // Cold water supply dropping down behind tank with inlaatcombinatie & vulkraan
    addPipeRun(
      [
        new THREE.Vector3(tankPorts[0].x, capTopY + 0.03, tankPorts[0].z),
        new THREE.Vector3(tankPorts[0].x, 1.74, tankPorts[0].z),
        new THREE.Vector3(tankPorts[0].x, 1.74, pipeWallZ),
        new THREE.Vector3(0.14, 1.74, pipeWallZ),
        new THREE.Vector3(0.14, 0.0, pipeWallZ),
      ],
      copperR,
      copperPipeMat
    );

    // Hot tapwater supply dropping down behind tank to bathroom/kitchen riser
    addPipeRun(
      [
        new THREE.Vector3(tankPorts[1].x, capTopY + 0.03, tankPorts[1].z),
        new THREE.Vector3(tankPorts[1].x, 1.80, tankPorts[1].z),
        new THREE.Vector3(tankPorts[1].x, 1.80, pipeWallZ),
        new THREE.Vector3(0.09, 1.80, pipeWallZ),
        new THREE.Vector3(0.09, 0.0, pipeWallZ),
      ],
      copperR,
      copperPipeMat
    );

    // Inlaatcombinatie (safety relief valve) + Vulkraan on cold water riser
    const inlaatValve = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.052, 0.034),
      brassMat
    );
    inlaatValve.position.set(0.14, 0.72, pipeWallZ + 0.014);
    group.add(inlaatValve);

    const inlaatKnob = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.020, 12),
      valveBlueMat
    );
    inlaatKnob.rotation.x = Math.PI / 2;
    inlaatKnob.position.set(0.14, 0.73, pipeWallZ + 0.036);
    group.add(inlaatKnob);

    // 4e. PVC Condensate & Safety-Relief Funnel / Siphon Drain (§6 Riolering)
    const drainX = 0.14;
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.016, 0.055, 14),
      pvcGreyMat
    );
    funnel.position.set(drainX, 0.62, pipeWallZ + 0.022);
    group.add(funnel);

    // Siphon U-bend + vertical PVC drain pipe to floor
    addPipeRun(
      [
        new THREE.Vector3(drainX, 0.595, pipeWallZ + 0.022),
        new THREE.Vector3(drainX, 0.44, pipeWallZ + 0.022),
        new THREE.Vector3(drainX + 0.055, 0.44, pipeWallZ + 0.022),
        new THREE.Vector3(drainX + 0.055, 0.49, pipeWallZ + 0.022),
        new THREE.Vector3(drainX + 0.055, 0.49, pipeWallZ),
        new THREE.Vector3(drainX + 0.055, 0.0, pipeWallZ),
      ],
      0.016,
      pvcGreyMat
    );

    // Wall pipe mounting rail bars (keeping vertical risers neat against wall)
    for (const clampY of [0.30, 0.78, 1.32]) {
      const clampRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.016, 0.012),
        steelBracketMat
      );
      clampRail.position.set(0.18, clampY, backZ + 0.008);
      group.add(clampRail);
    }

    // =========================================================================
    // 5. SURFACE-MOUNTED ELECTRICAL (Opbouw WCD + PVC Conduit, §22.1)
    // =========================================================================
    const wcdX = 0.545; // Just outside hydrobox right edge (+0.50 m), within +0.60 m bound
    const wcdY = 1.28;
    const wcdZ = backZ + 0.022;

    const wcdBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.128, 0.042),
      casingWhiteMat
    );
    wcdBox.position.set(wcdX, wcdY, wcdZ);
    group.add(wcdBox);

    // Two socket recesses
    for (const dy of [-0.030, 0.030]) {
      const socketRecess = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.005, 16),
        casingOffWhiteMat
      );
      socketRecess.rotation.x = Math.PI / 2;
      socketRecess.position.set(wcdX, wcdY + dy, wcdZ + 0.021);
      group.add(socketRecess);
    }

    // Vertical opbouw PVC electrical conduit rising from WCD
    addPipeSegment(
      new THREE.Vector3(wcdX, wcdY + 0.064, backZ + 0.014),
      new THREE.Vector3(wcdX, Math.min(height - 0.02, 1.88), backZ + 0.014),
      0.009,
      pvcGreyMat,
      10
    );

    // Black power cord from upper socket into side of hydrobox
    addPipeRun(
      [
        new THREE.Vector3(wcdX, wcdY + 0.030, wcdZ + 0.026),
        new THREE.Vector3(wcdX - 0.02, wcdY + 0.010, wcdZ + 0.040),
        new THREE.Vector3(hydroX + hydroW / 2 - 0.01, wcdY + 0.010, hydroZ - 0.08),
      ],
      0.005,
      rubberFeetMat
    );

    return group;
  },
};
