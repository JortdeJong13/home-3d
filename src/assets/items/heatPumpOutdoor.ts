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
    depth: cm(30, 'user_supplied', 'User specification: warmtepomp buitenunit 30 cm diep'),
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
    const wallGap = Math.min(0.05, depth * 0.15);
    const bodyD = depth - wallGap;
    const bodyZ = wallGap / 2; // Back of body at -depth/2 + wallGap, front at +depth/2
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

    // Rear wall mounting brackets & insulated conduit stub
    const bracketW = 0.04;
    const bracketH = 0.04;
    for (const side of [-1, 1]) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(bracketW, bracketH, wallGap), zincMat);
      bracket.position.set(side * width * 0.34, footH + bodyH * 0.72, -depth / 2 + wallGap / 2);
      group.add(bracket);
    }
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, wallGap + 0.01, 12),
      feetMat
    );
    conduit.rotation.x = Math.PI / 2;
    conduit.position.set(width * 0.32, footH + bodyH * 0.22, -depth / 2 + wallGap / 2);
    group.add(conduit);

    // 2. Main casing core & subtle grey perimeter frame
    const frameThick = 0.022;
    const bodyBox = new THREE.Mesh(
      new THREE.BoxGeometry(width - frameThick * 0.6, bodyH - frameThick * 0.6, bodyD - 0.01),
      casingMat
    );
    bodyBox.position.set(0, bodyCenterY, bodyZ - 0.004);
    group.add(bodyBox);

    // Top cap
    const topCap = new THREE.Mesh(
      new THREE.BoxGeometry(width, frameThick, bodyD),
      frameMat
    );
    topCap.position.set(0, height - frameThick / 2, bodyZ);
    group.add(topCap);

    // Bottom trim bar
    const bottomCap = new THREE.Mesh(
      new THREE.BoxGeometry(width, frameThick, bodyD),
      frameMat
    );
    bottomCap.position.set(0, footH + frameThick / 2, bodyZ);
    group.add(bottomCap);

    // Left & right vertical frame trims
    for (const side of [-1, 1]) {
      const sideTrim = new THREE.Mesh(
        new THREE.BoxGeometry(frameThick, bodyH, bodyD),
        frameMat
      );
      sideTrim.position.set(side * (width / 2 - frameThick / 2), bodyCenterY, bodyZ);
      group.add(sideTrim);
    }

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
      new THREE.BoxGeometry(0.005, bodyH - frameThick * 2.2, 0.004),
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
