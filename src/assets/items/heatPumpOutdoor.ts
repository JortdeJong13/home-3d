import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Outdoor Air-to-Water Heat Pump Unit (Warmtepomp Buitenunit).
 * Local origin at bottom-center; +Z is the front fan face (away from the wall),
 * -Z sits flush against the exterior wall face.
 */
export const heatPumpOutdoorPrefab: AssetPrefabDefinition = {
  prefabId: 'heat_pump_outdoor',
  defaultLabel: 'Warmtepomp Buitenunit',
  defaultDimensions: {
    width: cm(75, 'user_supplied', 'User specification: warmtepomp buitenunit 75 cm breed'),
    depth: cm(25, 'user_supplied', 'User specification: warmtepomp buitenunit 25 cm diep'),
    height: cm(55, 'user_supplied', 'User specification: warmtepomp buitenunit 55 cm hoog'),
  },
  build3D: ({ width, depth, height, getMat }) => {
    const group = new THREE.Group();

    const casingMat = new THREE.MeshStandardMaterial({
      color: '#eceef0',
      roughness: 0.8,
      metalness: 0.06,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: '#a3aab2',
      roughness: 0.65,
      metalness: 0.15,
    });
    const darkRecessMat = new THREE.MeshStandardMaterial({
      color: '#252a30',
      roughness: 0.88,
      metalness: 0.05,
    });
    const feetMat = new THREE.MeshStandardMaterial({
      color: '#32363c',
      roughness: 0.9,
      metalness: 0.05,
    });
    const zincMat = getMat('roof_daktrim_zinc');

    const footH = Math.min(0.06, height * 0.09);
    const bodyD = depth;
    const bodyZ = 0;
    const bodyH = height - footH;
    const bodyCenterY = footH + bodyH / 2;

    // 1. Two anti-vibration mounting blocks (opstelbalken) at base
    const footW = width * 0.11;
    const footD = bodyD * 0.96;
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(footW, footH, footD), feetMat);
      foot.position.set(side * width * 0.34, footH / 2, bodyZ);
      group.add(foot);
    }

    // Insulated conduit stub extending 8 cm from rear of unit to the wall
    const conduitLen = 0.08;
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, conduitLen, 12),
      feetMat
    );
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(width * 0.32, footH + bodyH * 0.22, -depth / 2 - conduitLen / 2);
    group.add(conduit);

    // 2. Main white casing with smoothly rounded corners & beveled edges
    const bevel = 0.01;
    const innerW = width - bevel * 2;
    const innerH = bodyH - bevel * 2;
    const innerD = bodyD - bevel * 2;
    const r = Math.min(0.026, innerW * 0.08, innerH * 0.08);
    const hw = innerW / 2;
    const hh = innerH / 2;

    const casingShape = new THREE.Shape();
    casingShape.moveTo(-hw + r, -hh);
    casingShape.lineTo(hw - r, -hh);
    casingShape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    casingShape.lineTo(hw, hh - r);
    casingShape.quadraticCurveTo(hw, hh, hw - r, hh);
    casingShape.lineTo(-hw + r, hh);
    casingShape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    casingShape.lineTo(-hw, -hh + r);
    casingShape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    const casingGeo = new THREE.ExtrudeGeometry(casingShape, {
      depth: innerD,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 8,
    });
    // Center along Z so front/back faces sit at ±depth/2
    casingGeo.translate(0, 0, -innerD / 2);

    const casingMesh = new THREE.Mesh(casingGeo, casingMat);
    casingMesh.position.set(0, bodyCenterY, bodyZ);
    group.add(casingMesh);

    // 3. Circular fan housing & grille on the front face (+Z)
    const fanCenterX = -width * 0.11;
    const fanCenterY = footH + bodyH * 0.5;
    const fanRadius = Math.min(width * 0.28, bodyH * 0.37);
    const frontZ = depth / 2;

    // Dark recessed fan cavity
    const fanCavity = new THREE.Mesh(
      new THREE.CylinderGeometry(fanRadius, fanRadius, 0.014, 28),
      darkRecessMat
    );
    fanCavity.rotation.x = Math.PI / 2;
    fanCavity.position.set(fanCenterX, fanCenterY, frontZ - 0.007);
    group.add(fanCavity);

    // Fan hub + 3 blades inside cavity
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(fanRadius * 0.2, fanRadius * 0.2, 0.016, 16),
      frameMat
    );
    hub.rotation.x = Math.PI / 2;
    hub.position.set(fanCenterX, fanCenterY, frontZ - 0.004);
    group.add(hub);

    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(fanRadius * 0.72, fanRadius * 0.2, 0.006),
        feetMat
      );
      const angle = (i * Math.PI * 2) / 3 + 0.35;
      blade.position.set(
        fanCenterX + Math.cos(angle) * fanRadius * 0.44,
        fanCenterY + Math.sin(angle) * fanRadius * 0.44,
        frontZ - 0.005
      );
      blade.rotation.z = angle;
      group.add(blade);
    }

    // Outer circular bezel ring
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(fanRadius, 0.01, 10, 32),
      frameMat
    );
    bezel.position.set(fanCenterX, fanCenterY, frontZ);
    group.add(bezel);

    // Horizontal protective grille bars across fan opening
    const barCount = 5;
    for (let i = -2; i <= 2; i++) {
      const dy = (i / (barCount - 1)) * fanRadius * 1.45;
      const chordHalf = Math.sqrt(Math.max(0, fanRadius * fanRadius - dy * dy));
      if (chordHalf < 0.03) continue;
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(chordHalf * 1.96, 0.007, 0.006),
        frameMat
      );
      bar.position.set(fanCenterX, fanCenterY + dy, frontZ + 0.003);
      group.add(bar);
    }

    // 4. Right-hand service panel seam & subtle badge
    const seamLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, bodyH - 0.05, 0.004),
      frameMat
    );
    seamLine.position.set(width * 0.23, bodyCenterY, frontZ - 0.001);
    group.add(seamLine);

    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.018, 0.004),
      darkRecessMat
    );
    badge.position.set(width * 0.35, footH + bodyH * 0.78, frontZ);
    group.add(badge);

    return group;
  },
};
