import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Low-Profile 360° Garden Path & Border Light ("Lage Tuinlamp")
 * Compact matte-anthracite base and gently overhanging cap with a warm 360° frosted diffuser.
 * Non-directional and low-slung (26 cm tall) so it blends naturally along paths and flower borders.
 */
export const gardenPathLightPrefab: AssetPrefabDefinition = {
  prefabId: 'garden_path_light',
  defaultLabel: 'Lage Tuinlamp (Buitenverlichting)',
  defaultDimensions: {
    width: cm(12, 'user_supplied', 'Low garden light cap diameter 12 cm'),
    depth: cm(12, 'user_supplied', 'Low garden light cap diameter 12 cm'),
    height: cm(26, 'user_supplied', 'Low garden light total height 26 cm'),
  },
  build3D: ({ height, getMat }) => {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#2b2f36',
      roughness: 0.72,
      metalness: 0.22,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: '#3a3f48',
      roughness: 0.55,
      metalness: 0.35,
    });
    const glowMat = getMat('garden_lamp_glow');

    // 1. Compact ground plinth resting flush at Y = 0
    const baseH = 0.018;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, baseH, 16), bodyMat);
    base.position.y = baseH / 2;
    group.add(base);

    // 2. Short matte-anthracite lower column
    const capTotalH = 0.028;
    const lensH = 0.078;
    const collarH = 0.01;
    const stemH = Math.max(0.08, height - baseH - collarH - lensH - capTotalH);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.029, stemH, 16), bodyMat);
    stem.position.y = baseH + stemH / 2;
    group.add(stem);

    // Subtle stepped ring beneath the diffuser
    const collarY = baseH + stemH;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, collarH, 16), trimMat);
    collar.position.y = collarY + collarH / 2;
    group.add(collar);

    // 3. 360° warm frosted diffuser core
    const lensY = collarY + collarH;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, lensH, 18), glowMat);
    lens.position.y = lensY + lensH / 2;
    group.add(lens);

    // Three slim vertical support ribs around the diffuser (120° apart)
    const ribRadius = 0.0365;
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, lensH + 0.006, 8), bodyMat);
      rib.position.set(Math.cos(angle) * ribRadius, lensY + lensH / 2, Math.sin(angle) * ribRadius);
      group.add(rib);
    }

    // 4. Gently overhanging sloped cap (shields glare from above, radiates 360° downward)
    const capY = lensY + lensH;
    const capRimH = 0.012;
    const capRim = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.062, capRimH, 20), bodyMat);
    capRim.position.y = capY + capRimH / 2;
    group.add(capRim);

    const capTopH = capTotalH - capRimH;
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.056, capTopH, 20), bodyMat);
    capTop.position.y = capY + capRimH + capTopH / 2;
    group.add(capTop);

    return group;
  },
};
