import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Attic Air-to-Water Heat Pump Indoor Unit & 171 L Boilervat — Bouwnummer 55
 *
 * Simplified, sculptural architectural-diorama representation based on
 * Verkooptekening VK-06, Tekening woonwensen 55.3, and Technische omschrijving §19:
 * - 171 liter vertical cylindrical boilervat (twee-onder-één-kapwoning)
 * - Adjacent wall-mounted lucht-water warmtepomp binnenunit (hydrobox, 'wp')
 * - Muted terracotta-red expansievat & clean minimalist connecting conduits
 *
 * Local coordinate convention (origin at bottom-center, Y = 0 on floor):
 * - Back face (Z = -depth/2 = -0.33 m) sits flush against the rear of the Overloop wall (Z = -6.36 m).
 * - Front face (Z = +depth/2 = +0.33 m) faces into the rear attic room (when placed at rotationDeg = 180).
 * - At rotationDeg = 180:
 *   - local -X maps to world +X (171 L cylindrical boilervat near right Overloop corner).
 *   - local +X maps to world -X (wall-mounted 'wp' hydrobox & expansion vessel).
 */
export const atticHeatPumpBoilerPrefab: AssetPrefabDefinition = {
  prefabId: 'attic_heat_pump_boiler',
  defaultLabel: 'Warmtepomp Binnenunit & 171 L Boilervat (WP)',
  defaultDimensions: {
    width: cm(
      120,
      'verified_drawing',
      'VK-06 & 55.3 opstelplaats installaties: 171 L boilervat naast WP-binnenunit (120 cm totaal)'
    ),
    depth: cm(
      66,
      'verified_drawing',
      'VK-06 & 55.3: Ø 58 cm 171 L boilervat met muurspeling (66 cm diep)'
    ),
    height: cm(
      184,
      'verified_drawing',
      'Technische omschrijving §19: 171 L boilervat (~148 cm) + wandgemonteerde WP-binnenunit (184 cm)'
    ),
  },

  build3D: ({ width, depth }) => {
    const group = new THREE.Group();
    const backZ = -depth / 2; // -0.33 m (wall plane)

    // Soft, matte architectural diorama palette (clay/plaster/terracotta aesthetic)
    const matteWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f2efe8',
      roughness: 0.88,
      metalness: 0.0,
    });
    const warmOffWhiteMat = new THREE.MeshStandardMaterial({
      color: '#e8e4dc',
      roughness: 0.90,
      metalness: 0.0,
    });
    const softSlateMat = new THREE.MeshStandardMaterial({
      color: '#3e444c',
      roughness: 0.86,
      metalness: 0.02,
    });
    const conduitGreyMat = new THREE.MeshStandardMaterial({
      color: '#6b7179',
      roughness: 0.88,
      metalness: 0.02,
    });
    const mutedTerracottaMat = new THREE.MeshStandardMaterial({
      color: '#bf5e52',
      roughness: 0.84,
      metalness: 0.0,
    });
    const statusDotMat = new THREE.MeshStandardMaterial({
      color: '#67b88a',
      roughness: 0.60,
      metalness: 0.0,
      emissive: '#4fa374',
      emissiveIntensity: 0.35,
    });

    const addTube = (p1: THREE.Vector3, p2: THREE.Vector3, radius: number, mat: THREE.Material) => {
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      if (len < 0.001) return;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 12), mat);
      mesh.position.copy(p1).addScaledVector(dir, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      group.add(mesh);
    };

    const addPipeRun = (points: THREE.Vector3[], radius: number, mat: THREE.Material) => {
      for (let i = 0; i < points.length - 1; i++) {
        addTube(points[i], points[i + 1], radius, mat);
        if (i > 0) {
          const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 10, 8), mat);
          joint.position.copy(points[i]);
          group.add(joint);
        }
      }
    };

    // =========================================================================
    // 1. 171 L BOILERVAT (Clean sculptural vertical cylinder — local -X side)
    // =========================================================================
    const boilerX = -width * 0.25; // -0.30 m
    const boilerZ = 0.03;          // Front at +0.32 m, back 7 cm off wall
    const boilerR = 0.29;          // Ø 58 cm
    const plinthH = 0.075;
    const bodyH = 1.35;
    const bodyBaseY = plinthH;
    const bodyTopY = bodyBaseY + bodyH; // 1.425 m
    const capH = 0.055;                 // 1.48 m top

    // Recessed dark shadow plinth
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR - 0.02, boilerR - 0.025, plinthH, 32),
      softSlateMat
    );
    plinth.position.set(boilerX, plinthH / 2, boilerZ);
    group.add(plinth);

    // Main matte warm-white insulated cylinder
    const tankBody = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR, boilerR, bodyH, 36),
      matteWhiteMat
    );
    tankBody.position.set(boilerX, bodyBaseY + bodyH / 2, boilerZ);
    group.add(tankBody);

    // Subtle dark collar band + softly tapered top crown
    const topBand = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR - 0.004, boilerR + 0.002, 0.018, 36),
      softSlateMat
    );
    topBand.position.set(boilerX, bodyTopY + 0.009, boilerZ);
    group.add(topBand);

    const topCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(boilerR * 0.82, boilerR - 0.006, capH - 0.014, 36),
      warmOffWhiteMat
    );
    topCrown.position.set(boilerX, bodyTopY + 0.016 + (capH - 0.014) / 2, boilerZ);
    group.add(topCrown);

    // Minimalist front circular dial accent (single clean geometric detail)
    const dialBezel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.036, 0.014, 20),
      softSlateMat
    );
    dialBezel.rotation.x = Math.PI / 2;
    dialBezel.position.set(boilerX, 1.20, boilerZ + boilerR + 0.003);
    group.add(dialBezel);

    const dialInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.004, 20),
      matteWhiteMat
    );
    dialInner.rotation.x = Math.PI / 2;
    dialInner.position.set(boilerX, 1.20, boilerZ + boilerR + 0.010);
    group.add(dialInner);

    // =========================================================================
    // 2. WALL-MOUNTED WARMTEPOMP BINNENUNIT / HYDROBOX (local +X side)
    // =========================================================================
    const hydroW = 0.44;
    const hydroD = 0.28;
    const hydroH = 0.76;
    const hydroX = 0.28;
    const hydroBaseY = 1.06; // Spans Y = 1.06 -> 1.82 m
    const hydroCenterY = hydroBaseY + hydroH / 2;
    const hydroZ = backZ + 0.015 + hydroD / 2;
    const hydroFrontZ = hydroZ + hydroD / 2;

    const bevel = 0.016;
    const innerW = hydroW - bevel * 2;
    const innerH = hydroH - bevel * 2;
    const innerD = hydroD - bevel * 2;
    const r = 0.024;
    const hw = innerW / 2;
    const hh = innerH / 2;

    const hydroShape = new THREE.Shape();
    hydroShape.moveTo(-hw + r, -hh);
    hydroShape.lineTo(hw - r, -hh);
    hydroShape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    hydroShape.lineTo(hw, hh - r);
    hydroShape.quadraticCurveTo(hw, hh, hw - r, hh);
    hydroShape.lineTo(-hw + r, hh);
    hydroShape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    hydroShape.lineTo(-hw, -hh + r);
    hydroShape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    const hydroGeo = new THREE.ExtrudeGeometry(hydroShape, {
      depth: innerD,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 6,
    });
    hydroGeo.translate(0, 0, -innerD / 2);

    const hydroMesh = new THREE.Mesh(hydroGeo, matteWhiteMat);
    hydroMesh.position.set(hydroX, hydroCenterY, hydroZ);
    group.add(hydroMesh);

    // Single clean recessed slate control strip + subtle status dot
    const controlStrip = new THREE.Mesh(
      new THREE.BoxGeometry(hydroW * 0.72, 0.095, 0.008),
      softSlateMat
    );
    controlStrip.position.set(hydroX, hydroBaseY + hydroH * 0.72, hydroFrontZ + 0.002);
    group.add(controlStrip);

    const statusDot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12),
      statusDotMat
    );
    statusDot.rotation.x = Math.PI / 2;
    statusDot.position.set(hydroX + hydroW * 0.25, hydroBaseY + hydroH * 0.72, hydroFrontZ + 0.006);
    group.add(statusDot);

    // =========================================================================
    // 3. SCULPTURAL MUTED-TERRACOTTA EXPANSIEVAT (below-right of hydrobox)
    // =========================================================================
    const expX = 0.42;
    const expZ = backZ + 0.16;
    const expR = 0.13;
    const expCylH = 0.16;
    const expCenterY = 0.62;

    const expBody = new THREE.Mesh(
      new THREE.CylinderGeometry(expR, expR, expCylH, 24),
      mutedTerracottaMat
    );
    expBody.position.set(expX, expCenterY, expZ);
    group.add(expBody);

    const expTop = new THREE.Mesh(
      new THREE.SphereGeometry(expR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mutedTerracottaMat
    );
    expTop.scale.set(1, 0.62, 1);
    expTop.position.set(expX, expCenterY + expCylH / 2, expZ);
    group.add(expTop);

    const expBot = new THREE.Mesh(
      new THREE.SphereGeometry(expR, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      mutedTerracottaMat
    );
    expBot.scale.set(1, 0.62, 1);
    expBot.position.set(expX, expCenterY - expCylH / 2, expZ);
    group.add(expBot);

    // Simple wall mounting stem for expansievat
    const expBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.022, expZ - backZ),
      conduitGreyMat
    );
    expBracket.position.set(expX, expCenterY + expCylH / 2 + expR * 0.62 + 0.015, (backZ + expZ) / 2);
    group.add(expBracket);

    // =========================================================================
    // 4. MINIMALIST ARCHITECTURAL CONDUITS (Clean graphic lines)
    // =========================================================================
    const pipeZ = backZ + 0.045;
    const pipeR = 0.017;

    // Two clean vertical risers from Hydrobox down to floor
    for (const dx of [-0.05, 0.03]) {
      addPipeRun(
        [
          new THREE.Vector3(hydroX + dx, hydroBaseY, hydroZ - 0.04),
          new THREE.Vector3(hydroX + dx, 0.94, hydroZ - 0.04),
          new THREE.Vector3(hydroX + dx, 0.94, pipeZ),
          new THREE.Vector3(hydroX + dx, 0.0, pipeZ),
        ],
        pipeR,
        conduitGreyMat
      );
    }

    // Two clean connecting tubes linking Hydrobox -> top of 171 L Boilervat
    addPipeRun(
      [
        new THREE.Vector3(hydroX - 0.13, hydroBaseY, hydroZ - 0.04),
        new THREE.Vector3(hydroX - 0.13, 0.96, pipeZ),
        new THREE.Vector3(0.03, 0.96, pipeZ),
        new THREE.Vector3(0.03, 1.62, pipeZ),
        new THREE.Vector3(boilerX + 0.04, 1.62, pipeZ),
        new THREE.Vector3(boilerX + 0.04, 1.62, boilerZ - 0.03),
        new THREE.Vector3(boilerX + 0.04, bodyTopY + capH - 0.01, boilerZ - 0.03),
      ],
      pipeR,
      conduitGreyMat
    );

    addPipeRun(
      [
        new THREE.Vector3(boilerX - 0.05, bodyTopY + capH - 0.01, boilerZ - 0.03),
        new THREE.Vector3(boilerX - 0.05, 1.56, boilerZ - 0.03),
        new THREE.Vector3(boilerX - 0.05, 1.56, pipeZ),
        new THREE.Vector3(0.11, 1.56, pipeZ),
        new THREE.Vector3(0.11, 0.0, pipeZ),
      ],
      pipeR * 0.85,
      conduitGreyMat
    );

    // Clean vertical connector from Expansievat up to Hydrobox
    addPipeRun(
      [
        new THREE.Vector3(expX, expCenterY + expCylH / 2 + expR * 0.62, expZ),
        new THREE.Vector3(expX, 0.96, expZ),
        new THREE.Vector3(expX, 0.96, pipeZ),
        new THREE.Vector3(hydroX + 0.11, 0.96, pipeZ),
        new THREE.Vector3(hydroX + 0.11, hydroBaseY, pipeZ),
      ],
      pipeR * 0.8,
      conduitGreyMat
    );

    return group;
  },
};
