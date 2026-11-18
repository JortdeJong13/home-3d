import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Outdoor Floor Lantern for the Lounge Terrace ("Tuinlantaarn")
 * Matte anthracite frame with warm glowing inner candle core in Night mode.
 */
export const loungeLanternPrefab: AssetPrefabDefinition = {
  prefabId: 'lounge_lantern',
  defaultLabel: 'Tuinlantaarn Loungehoek',
  defaultDimensions: {
    width: cm(22, 'user_supplied', 'Lounge terrace floor lantern width 22 cm'),
    depth: cm(22, 'user_supplied', 'Lounge terrace floor lantern depth 22 cm'),
    height: cm(36, 'user_supplied', 'Lounge terrace floor lantern height 36 cm'),
  },
  build3D: ({ width, depth, height, getMat }) => {
    const group = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({
      color: '#2f333a',
      roughness: 0.78,
      metalness: 0.15,
    });
    const glowMat = getMat('garden_lamp_glow');

    const baseH = 0.022;
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, baseH, depth), frameMat);
    base.position.y = baseH / 2;
    group.add(base);

    const bodyH = height - 0.075;
    const postSize = 0.018;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, bodyH, postSize), frameMat);
        post.position.set(sx * (width / 2 - postSize / 2), baseH + bodyH / 2, sz * (depth / 2 - postSize / 2));
        group.add(post);
      }
    }

    const topPlateH = 0.02;
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(width, topPlateH, depth), frameMat);
    topPlate.position.y = baseH + bodyH + topPlateH / 2;
    group.add(topPlate);

    // Subtle arched/rectangular carry handle on top
    const handleH = height - (baseH + bodyH + topPlateH);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.012, 0.014), frameMat);
    handle.position.y = height - 0.006;
    group.add(handle);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.012, handleH, 0.014), frameMat);
      side.position.set(sx * (width * 0.275 - 0.006), height - handleH / 2, 0);
      group.add(side);
    }

    // Warm glowing candle core inside
    const candleH = bodyH * 0.55;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, candleH, 12), glowMat);
    candle.position.y = baseH + candleH / 2 + 0.01;
    group.add(candle);

    return group;
  },
};
