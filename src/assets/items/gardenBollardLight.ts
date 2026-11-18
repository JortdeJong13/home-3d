import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Architectural Outdoor Bollard Path/Border Light ("Tuinpad Boldertje")
 * Anthracite post with frosted diffuser that glows warmly in Night mode.
 */
export const gardenBollardLightPrefab: AssetPrefabDefinition = {
  prefabId: 'garden_bollard_light',
  defaultLabel: 'Tuinpad Boldertje (Buitenverlichting)',
  defaultDimensions: {
    width: cm(10, 'user_supplied', 'Garden bollard light base width 10 cm'),
    depth: cm(10, 'user_supplied', 'Garden bollard light base depth 10 cm'),
    height: cm(45, 'user_supplied', 'Garden bollard light height 45 cm'),
  },
  build3D: ({ height, getMat }) => {
    const group = new THREE.Group();

    const postMat = new THREE.MeshStandardMaterial({
      color: '#2f333a',
      roughness: 0.78,
      metalness: 0.12,
    });
    const glowMat = getMat('garden_lamp_glow');

    const baseH = 0.025;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.05, baseH, 14), postMat);
    base.position.y = baseH / 2;
    group.add(base);

    const stemH = height - 0.145;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, stemH, 12), postMat);
    stem.position.y = baseH + stemH / 2;
    group.add(stem);

    const lensH = 0.095;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, lensH, 14), glowMat);
    lens.position.y = baseH + stemH + lensH / 2;
    group.add(lens);

    const capH = 0.025;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, capH, 14), postMat);
    cap.position.y = baseH + stemH + lensH + capH / 2;
    group.add(cap);

    return group;
  },
};
