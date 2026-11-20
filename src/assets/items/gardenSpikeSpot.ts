import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { cm } from '../../model/units';

/**
 * Discreet Garden Spike Spotlight ("Tuinprikspot / Grondspot")
 * Low-profile matte-black cylindrical swivel spotlight on a ground spike,
 * angled slightly upward with an anti-glare visor and warm recessed lens in Night mode.
 */
export const gardenSpikeSpotPrefab: AssetPrefabDefinition = {
  prefabId: 'garden_spike_spot',
  defaultLabel: 'Tuinprikspot (Buitenverlichting)',
  defaultDimensions: {
    width: cm(7, 'user_supplied', 'Garden spike spotlight width 7 cm'),
    depth: cm(11, 'user_supplied', 'Garden spike spotlight depth 11 cm'),
    height: cm(18, 'user_supplied', 'Garden spike spotlight height 18 cm'),
  },
  build3D: ({ height, getMat }) => {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#22252a',
      roughness: 0.62,
      metalness: 0.35,
    });
    const hardwareMat = new THREE.MeshStandardMaterial({
      color: '#3a3f47',
      roughness: 0.45,
      metalness: 0.55,
    });
    const glowMat = getMat('garden_lamp_glow');

    // 1. Ground collar resting flush at Y = 0
    const collarH = 0.012;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.022, collarH, 14), bodyMat);
    collar.position.y = collarH / 2;
    group.add(collar);

    // 2. Slim ground-spike stem
    const stemH = Math.max(0.055, height * 0.44);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0085, stemH, 10), bodyMat);
    stem.position.y = collarH + stemH / 2;
    group.add(stem);

    // 3. U-shaped swivel yoke bracket
    const yokeBaseY = collarH + stemH;
    const yokeW = 0.064;
    const yokeThick = 0.005;
    const yokeDepth = 0.014;
    const yokeArmH = 0.044;

    const yokeBase = new THREE.Mesh(new THREE.BoxGeometry(yokeW, yokeThick, yokeDepth), bodyMat);
    yokeBase.position.y = yokeBaseY + yokeThick / 2;
    group.add(yokeBase);

    const pivotY = yokeBaseY + yokeThick + yokeArmH - 0.008;
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(yokeThick, yokeArmH, yokeDepth), bodyMat);
      arm.position.set(sx * (yokeW / 2 - yokeThick / 2), yokeBaseY + yokeThick + yokeArmH / 2, 0);
      group.add(arm);

      // Side locking thumbscrew knob
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 10), hardwareMat);
      knob.rotation.z = Math.PI / 2;
      knob.position.set(sx * (yokeW / 2 + 0.0025), pivotY, 0);
      group.add(knob);
    }

    // 4. Tilted cylindrical spotlight head (aimed along +Z, pitched upward 28°)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, pivotY, 0);
    headGroup.rotation.x = -THREE.MathUtils.degToRad(28);
    group.add(headGroup);

    const barrelR = 0.026;
    const barrelLen = 0.076;

    // Main aluminum barrel (local Z axis)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(barrelR, barrelR, barrelLen, 18), bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.004;
    headGroup.add(barrel);

    // Subtle stepped rear cap
    const rearCapLen = 0.012;
    const rearCap = new THREE.Mesh(
      new THREE.CylinderGeometry(barrelR * 0.84, barrelR * 0.94, rearCapLen, 16),
      hardwareMat,
    );
    rearCap.rotation.x = Math.PI / 2;
    rearCap.position.z = 0.004 - barrelLen / 2 - rearCapLen / 2 + 0.001;
    headGroup.add(rearCap);

    // Front bezel ring
    const frontZ = 0.004 + barrelLen / 2;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(barrelR - 0.0025, 0.0028, 8, 20), hardwareMat);
    bezel.position.z = frontZ;
    headGroup.add(bezel);

    // Recessed warm glowing lens
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(barrelR - 0.004, barrelR - 0.004, 0.006, 16), glowMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = frontZ - 0.002;
    headGroup.add(lens);

    // Upper anti-glare visor hood extending forward over the top half of the lens
    const visorLen = 0.022;
    const visorGeo = new THREE.CylinderGeometry(
      barrelR + 0.001,
      barrelR + 0.001,
      visorLen,
      16,
      1,
      true,
      -Math.PI * 0.55,
      Math.PI * 1.1,
    );
    const visorMat = new THREE.MeshStandardMaterial({
      color: '#22252a',
      roughness: 0.62,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    // Rotate so cylinder axis is along Z and the open-ended arc covers the top (+Y)
    visor.rotation.x = -Math.PI / 2;
    visor.position.z = frontZ + visorLen / 2 - 0.002;
    headGroup.add(visor);

    return group;
  },
};
