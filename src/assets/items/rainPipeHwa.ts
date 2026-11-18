import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Exterior Zinc Rainwater Downspout & Collector Hopper (Regenpijp / HWA met vergaderbak).
 * Local origin at bottom-center; -Z sits flush against the exterior wall face,
 * +Z faces outward. Top (Y = height) meets the underside of the flat roof daktrim (+2.80 m).
 */
export const rainPipeHwaPrefab: AssetPrefabDefinition = {
  prefabId: 'rain_pipe_hwa',
  defaultLabel: 'Regenpijp (HWA) Berging',
  defaultDimensions: {
    width: cm(15, 'user_supplied', 'HWA vergaderbak & regenpijp breedte (15 cm)'),
    depth: cm(14, 'user_supplied', 'HWA vergaderbak & regenpijp diepte vanaf gevel (14 cm)'),
    height: cm(280, 'verified_drawing', 'Hoogte tot onderkant daktrim berging (+2.80 m)'),
  },
  build3D: ({ width, depth, height, getMat }) => {
    const group = new THREE.Group();

    const zincMat = getMat('roof_daktrim_zinc');
    const darkDrainMat = new THREE.MeshStandardMaterial({
      color: '#32363c',
      roughness: 0.88,
      metalness: 0.05,
    });

    const pipeRadius = 0.04; // Ø 8 cm standard Dutch HWA downspout
    const wallClearance = 0.02;
    const pipeZ = -depth / 2 + wallClearance + pipeRadius;

    // 1. Top collector box (vergaderbak) tucked directly under the roof daktrim
    const hopperH = Math.min(0.11, height * 0.06);
    const hopperW = Math.min(width * 0.9, 0.135);
    const hopperD = Math.min(depth * 0.9, 0.125);
    const hopperY = height - hopperH / 2 - 0.015;
    const hopperZ = -depth / 2 + hopperD / 2;

    const hopperBody = new THREE.Mesh(
      new THREE.BoxGeometry(hopperW, hopperH, hopperD),
      zincMat
    );
    hopperBody.position.set(0, hopperY, hopperZ);
    group.add(hopperBody);

    // Top rim collar of the collector box (meeting daktrim at Y = height)
    const rimH = 0.022;
    const hopperRim = new THREE.Mesh(
      new THREE.BoxGeometry(width, rimH, depth),
      zincMat
    );
    hopperRim.position.set(0, height - rimH / 2, 0);
    group.add(hopperRim);

    // Tapered transition collar from collector box to round downspout
    const funnelH = 0.045;
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(pipeRadius * 1.45, pipeRadius * 1.08, funnelH, 18),
      zincMat
    );
    funnel.position.set(0, height - hopperH - funnelH / 2 - 0.01, pipeZ);
    group.add(funnel);

    // 2. Main vertical cylindrical downspout (Y = 0 to bottom of funnel)
    const pipeTopY = height - hopperH - funnelH - 0.01;
    const pipeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(pipeRadius, pipeRadius, pipeTopY, 20),
      zincMat
    );
    pipeMesh.position.set(0, pipeTopY / 2, pipeZ);
    group.add(pipeMesh);

    // 3. Zinc wall mounting brackets (beugels) every ~0.95 m anchoring pipe to brick wall
    const bracketHeights: number[] = [];
    for (let by = 0.55; by < pipeTopY - 0.12; by += 0.95) {
      bracketHeights.push(by);
    }
    for (const by of bracketHeights) {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(pipeRadius + 0.005, pipeRadius + 0.005, 0.022, 20),
        zincMat
      );
      collar.position.set(0, by, pipeZ);
      group.add(collar);

      const stemLen = wallClearance + pipeRadius;
      const stem = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.018, stemLen),
        zincMat
      );
      stem.position.set(0, by, -depth / 2 + stemLen / 2);
      group.add(stem);
    }

    // 4. Base ground drain sleeve (sok) at Y = 0..0.09 m
    const sleeveH = 0.09;
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(pipeRadius + 0.009, pipeRadius + 0.011, sleeveH, 20),
      darkDrainMat
    );
    sleeve.position.set(0, sleeveH / 2, pipeZ);
    group.add(sleeve);

    return group;
  },
};
