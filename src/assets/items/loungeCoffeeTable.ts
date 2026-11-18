import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Slatted Timber Outdoor Coffee Table with a small potted plant ("Loungetafel")
 */
export const loungeCoffeeTablePrefab: AssetPrefabDefinition = {
  prefabId: 'lounge_coffee_table',
  defaultLabel: 'Tuin Loungetafel (Hout)',
  defaultDimensions: {
    width: cm(95, 'user_supplied', 'Back garden lounge coffee table width 95 cm'),
    depth: cm(95, 'user_supplied', 'Back garden lounge coffee table depth 95 cm'),
    height: cm(38, 'user_supplied', 'Back garden lounge coffee table height 38 cm'),
  },
  build3D: ({ width, depth, height, getMat }) => {
    const group = new THREE.Group();
    const woodMat = getMat('plot_gate_timber');
    const frameMat = getMat('plot_fence_post');

    const tableH = height - 0.12; // reserve top 12 cm for decorative bowl plant, wait: let's keep table top at height = 38 cm or 36 cm
    const topY = 0.34;
    const slatThick = 0.032;
    const legH = topY - slatThick;

    // 4 Corner legs
    const legSize = 0.055;
    const inset = 0.06;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(legSize, legH, legSize), frameMat);
        leg.position.set(sx * (width / 2 - inset), legH / 2, sz * (depth / 2 - inset));
        group.add(leg);
      }
    }

    // Recessed apron rails
    const apronH = 0.045;
    const apronY = legH - apronH / 2;
    const railX = new THREE.Mesh(new THREE.BoxGeometry(width - inset * 2, apronH, 0.03), frameMat);
    railX.position.set(0, apronY, depth / 2 - inset);
    group.add(railX);
    const railX2 = railX.clone();
    railX2.position.z = -depth / 2 + inset;
    group.add(railX2);

    const railZ = new THREE.Mesh(new THREE.BoxGeometry(0.03, apronH, depth - inset * 2), frameMat);
    railZ.position.set(width / 2 - inset, apronY, 0);
    group.add(railZ);
    const railZ2 = railZ.clone();
    railZ2.position.x = -width / 2 + inset;
    group.add(railZ2);

    // 6 Slatted timber tabletop planks
    const numSlats = 6;
    const gap = 0.014;
    const slatD = (depth - gap * (numSlats - 1)) / numSlats;
    for (let i = 0; i < numSlats; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(width, slatThick, slatD), woodMat);
      const sz = -depth / 2 + (i + 0.5) * slatD + i * gap;
      slat.position.set(0, topY - slatThick / 2, sz);
      group.add(slat);
    }

    // Small matte ceramic bowl + low-poly succulent on center of table
    const potMat = new THREE.MeshStandardMaterial({
      color: '#d8d1c5',
      roughness: 0.88,
      metalness: 0.0,
    });
    const potH = 0.07;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, potH, 12), potMat);
    pot.position.set(0, topY + potH / 2, 0);
    group.add(pot);

    const plantMat = getMat('plot_hedge_beech');
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.095, 1), plantMat);
    plant.scale.set(1.1, 0.65, 1.1);
    plant.position.set(0, topY + potH + 0.02, 0);
    group.add(plant);

    return group;
  },
};
