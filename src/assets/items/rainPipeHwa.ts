import * as THREE from 'three';
import { AssetBuilderContext, AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Shared procedural builder for zinc rainwater downspouts (Regenpijp / HWA).
 * Local origin at bottom-center; -Z sits flush against the exterior wall face,
 * +Z faces outward.
 */
function buildRainPipe3D(
  { width, depth, height, getMat }: AssetBuilderContext,
  includeHopper: boolean
): THREE.Group {
  const group = new THREE.Group();
  const zincMat = getMat('roof_daktrim_zinc');

  const pipeRadius = 0.04; // Ø 8 cm standard Dutch HWA downspout
  const wallClearance = 0.02;
  const pipeZ = -depth / 2 + wallClearance + pipeRadius;

  let pipeTopY = height;

  if (includeHopper) {
    // Top collector box (vergaderbak) tucked directly under the roof daktrim / eaves
    const hopperH = Math.min(0.11, height * 0.2);
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

    // Top rim collar of the collector box
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

    pipeTopY = height - hopperH - funnelH - 0.01;
  }

  // Main vertical cylindrical downspout (pure zinc all the way to Y = 0)
  const pipeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(pipeRadius, pipeRadius, pipeTopY, 20),
    zincMat
  );
  pipeMesh.position.set(0, pipeTopY / 2, pipeZ);
  group.add(pipeMesh);

  // Zinc wall mounting brackets (beugels) every ~0.95 m anchoring pipe to brick wall
  const startBracketY = Math.min(0.55, pipeTopY * 0.45);
  const bracketHeights: number[] = [];
  for (let by = startBracketY; by < pipeTopY - 0.12; by += 0.95) {
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

  return group;
}

/**
 * Exterior Zinc Rainwater Downspout & Collector Hopper (Regenpijp / HWA met vergaderbak).
 */
export const rainPipeHwaPrefab: AssetPrefabDefinition = {
  prefabId: 'rain_pipe_hwa',
  defaultLabel: 'Regenpijp (HWA)',
  defaultDimensions: {
    width: cm(15, 'user_supplied', 'HWA vergaderbak & regenpijp breedte (15 cm)'),
    depth: cm(14, 'user_supplied', 'HWA vergaderbak & regenpijp diepte vanaf gevel (14 cm)'),
    height: cm(280, 'verified_drawing', 'Hoogte tot onderkant daktrim berging (+2.80 m)'),
  },
  build3D: (ctx) => buildRainPipe3D(ctx, true),
};

/**
 * Straight Zinc Rainwater Downspout Section (without top collector box) for multi-floor stacking.
 */
export const rainPipeHwaSectionPrefab: AssetPrefabDefinition = {
  prefabId: 'rain_pipe_hwa_section',
  defaultLabel: 'Regenpijp (HWA) Sectie',
  defaultDimensions: {
    width: cm(15, 'user_supplied', 'HWA regenpijp breedte (15 cm)'),
    depth: cm(14, 'user_supplied', 'HWA regenpijp diepte vanaf gevel (14 cm)'),
    height: cm(260, 'verified_drawing', 'Verdiepingshoogte HWA sectie (260 cm)'),
  },
  build3D: (ctx) => buildRainPipe3D(ctx, false),
};
