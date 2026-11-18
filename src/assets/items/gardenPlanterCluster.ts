import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Trio of Matte Ceramic Terrace Planter Pots with low-poly bushes, white flowers & ornamental grass
 */
export const gardenPlanterClusterPrefab: AssetPrefabDefinition = {
  prefabId: 'garden_planter_cluster',
  defaultLabel: 'Terras Bloempotten (Set van 3)',
  defaultDimensions: {
    width: cm(115, 'user_supplied', 'Terrace planter cluster width 115 cm'),
    depth: cm(95, 'user_supplied', 'Terrace planter cluster depth 95 cm'),
    height: cm(105, 'user_supplied', 'Terrace planter cluster height 105 cm'),
  },
  build3D: ({ getMat }) => {
    const group = new THREE.Group();

    const potMat = new THREE.MeshStandardMaterial({
      color: '#cfc5b4',
      roughness: 0.88,
      metalness: 0.0,
    });
    const soilMat = getMat('plot_soil_border');
    const bushMat = getMat('plot_hedge_beech');
    const blossomMat = getMat('plot_tree_foliage_blossom');
    const grassMat = getMat('plot_tree_stake_wood');

    let s = (919 * 1664525 + 1013904223) >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    const pots: Array<{
      x: number;
      z: number;
      rTop: number;
      rBot: number;
      h: number;
      hasGrass?: boolean;
      blossoms?: number;
    }> = [
      { x: -0.24, z: -0.16, rTop: 0.24, rBot: 0.18, h: 0.44, hasGrass: true, blossoms: 0 },
      { x: 0.26, z: -0.10, rTop: 0.20, rBot: 0.15, h: 0.34, blossoms: 9 },
      { x: 0.02, z: 0.24, rTop: 0.18, rBot: 0.13, h: 0.28, blossoms: 7 },
    ];

    for (const p of pots) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(p.rTop, p.rBot, p.h, 14), potMat);
      pot.position.set(p.x, p.h / 2, p.z);
      group.add(pot);

      const soil = new THREE.Mesh(new THREE.CylinderGeometry(p.rTop * 0.9, p.rTop * 0.9, 0.02, 12), soilMat);
      soil.position.set(p.x, p.h - 0.015, p.z);
      group.add(soil);

      // Green shrub mound inside pot
      const numPuffs = 5;
      for (let i = 0; i < numPuffs; i++) {
        const ang = (i / numPuffs) * Math.PI * 2 + rand() * 0.5;
        const dist = i === 0 ? 0 : p.rTop * 0.45;
        const r = p.rTop * (i === 0 ? 0.72 : 0.48);
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), bushMat);
        puff.position.set(
          p.x + Math.cos(ang) * dist,
          p.h + r * (i === 0 ? 0.65 : 0.45),
          p.z + Math.sin(ang) * dist
        );
        puff.rotation.y = rand() * Math.PI;
        group.add(puff);
      }

      if (p.hasGrass) {
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + rand() * 0.4;
          const dist = 0.04 + rand() * 0.12;
          const plume = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055 + rand() * 0.03, 1), grassMat);
          plume.scale.set(0.8, 1.8, 0.8);
          plume.position.set(p.x + Math.cos(ang) * dist, p.h + 0.34 + rand() * 0.18, p.z + Math.sin(ang) * dist);
          plume.rotation.set((rand() - 0.5) * 0.35, 0, (rand() - 0.5) * 0.35);
          group.add(plume);
        }
      }

      if (p.blossoms && p.blossoms > 0) {
        for (let b = 0; b < p.blossoms; b++) {
          const ang = rand() * Math.PI * 2;
          const dist = rand() * p.rTop * 0.78;
          const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.038 + rand() * 0.02, 0), blossomMat);
          blossom.position.set(
            p.x + Math.cos(ang) * dist,
            p.h + 0.12 + rand() * 0.12,
            p.z + Math.sin(ang) * dist
          );
          group.add(blossom);
        }
      }
    }

    return group;
  },
};
