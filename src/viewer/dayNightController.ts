import * as THREE from 'three';
import { HouseSceneGroups } from '../geometry/houseBuilder';
import { MATERIAL_PALETTE, MaterialId } from '../model/materials';

export interface SceneLightingRig {
  hemiLight: THREE.HemisphereLight;
  ambientLight: THREE.AmbientLight;
  sunLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
}

export function createLightingRig(scene: THREE.Scene): SceneLightingRig {
  // Soft warm-to-cool architectural diorama hemisphere light (inspired by Bruno Simon's My Room in 3D)
  const hemiLight = new THREE.HemisphereLight('#eef7fa', '#f3e5d0', 1.45);
  hemiLight.position.set(0, 25, 0);
  scene.add(hemiLight);

  // Subtle ambient fill to keep shadows powdery and readable, never harsh black
  const ambientLight = new THREE.AmbientLight('#fff8ee', 0.55);
  scene.add(ambientLight);

  // Primary Directional Sun / Moon light with high-resolution soft shadow map
  const sunLight = new THREE.DirectionalLight('#fff5e4', 2.15);
  sunLight.position.set(-14, 24, 15);
  sunLight.target.position.set(1.2, 1.5, -6.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 2;
  sunLight.shadow.camera.far = 60;
  const d = 17.5;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.025;
  sunLight.shadow.radius = 3.5;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Secondary soft bounce/rim light from opposite diagonal for clay/diorama softness
  const rimLight = new THREE.DirectionalLight('#d8ecf5', 0.65);
  rimLight.position.set(18, 14, -18);
  scene.add(rimLight);

  return { hemiLight, ambientLight, sunLight, rimLight };
}

/**
 * Update the 3D lighting, material colours, window glow, outer ground diffusion,
 * and the rotating celestial backdrop disc for a continuous phase `nightPhase`
 * (0, 2, 4... = Day; 1, 3, 5... = Evening), always advancing forward by +1 per toggle.
 */
export function applyDayNightState(
  rig: SceneLightingRig,
  groups: HouseSceneGroups,
  nightPhase: number,
  celestialRotorEl: HTMLElement | null
) {
  const cycle = ((nightPhase % 2) + 2) % 2;
  const t = cycle <= 1 ? cycle : 2 - cycle;

  // 1. The sky itself (rotation, stars, sun, moon) is drawn by SkyRenderer in the render loop.

  // 2. Orbit the 3D Directional Light along a full 360° celestial circle to match the rotating sky
  // At phase=0 (Day): sun is at (-14, 24, 15). As phase->0.5 (Dusk): sun sweeps low.
  // At phase=1 (Night): moon is at (14, 20, -15). As phase->1.5 (Dawn): continues forward to (-14, 24, 15) at phase=2.
  const arcAngle = nightPhase * Math.PI;
  const sunX = -14 * Math.cos(arcAngle) + 6 * Math.sin(arcAngle);
  const sunZ = 15 * Math.cos(arcAngle) - 8 * Math.sin(arcAngle);
  // Keep vertical elevation high enough to cast clean shadows while dipping slightly during golden hour (dusk & dawn)
  const dip = Math.sin(t * Math.PI); // peaks at t = 0.5 (sunset/sunrise)
  const sunY = THREE.MathUtils.lerp(24, 20, t) - dip * 7.5;
  rig.sunLight.position.set(sunX, Math.max(8, sunY), sunZ);

  // 3. Interpolate light colours and intensities (including subtle golden-hour warmth at t ~ 0.5)
  const daySunColor = new THREE.Color('#fff5e4');
  const duskSunColor = new THREE.Color('#edd8c8');
  const nightMoonColor = new THREE.Color('#a9b8e8');

  const currentSunColor = new THREE.Color();
  if (t < 0.5) {
    currentSunColor.lerpColors(daySunColor, duskSunColor, t * 2);
  } else {
    currentSunColor.lerpColors(duskSunColor, nightMoonColor, (t - 0.5) * 2);
  }
  rig.sunLight.color.copy(currentSunColor);
  rig.sunLight.intensity = THREE.MathUtils.lerp(2.15, 1.0, t) * (1 - dip * 0.35);

  const dayHemiSky = new THREE.Color('#eef7fa');
  const nightHemiSky = new THREE.Color('#7b8fc4');
  const dayHemiGround = new THREE.Color('#f3e5d0');
  const nightHemiGround = new THREE.Color('#3b3f5c');
  rig.hemiLight.color.lerpColors(dayHemiSky, nightHemiSky, t);
  rig.hemiLight.groundColor.lerpColors(dayHemiGround, nightHemiGround, t);
  rig.hemiLight.intensity = THREE.MathUtils.lerp(1.45, 1.05, t);

  const dayAmb = new THREE.Color('#fff8ee');
  const nightAmb = new THREE.Color('#7d86b0');
  rig.ambientLight.color.lerpColors(dayAmb, nightAmb, t);
  rig.ambientLight.intensity = THREE.MathUtils.lerp(0.55, 0.75, t);

  rig.rimLight.intensity = THREE.MathUtils.lerp(0.65, 0.25, t);

  // 4. Interior Warm Point Lights (smoothly turn on as dusk/night arrives)
  const interiorFactor = THREE.MathUtils.smoothstep(t, 0.25, 0.85);
  for (const pt of groups.interiorLights) {
    const maxI = (pt.userData.maxNightIntensity as number) ?? 4.0;
    pt.intensity = maxI * interiorFactor;
  }

  // 5. Outer Ground Diffusion Shader Colour
  if (groups.backdropFadeMaterial) {
    const cDay = new THREE.Color(MATERIAL_PALETTE.neighbour_ground_grey.colorDay);
    const cNight = new THREE.Color(MATERIAL_PALETTE.neighbour_ground_grey.colorNight);
    groups.backdropFadeMaterial.uniforms.uColor.value.lerpColors(cDay, cNight, t);
  }

  // 6. Interpolate Material Palette Colours & Emissive Window Glow
  const tempDay = new THREE.Color();
  const tempNight = new THREE.Color();
  const ZeroColor = new THREE.Color('#000000');

  for (const [id, mat] of groups.materialMap.entries()) {
    const def = MATERIAL_PALETTE[id as MaterialId];
    if (!def) continue;
    tempDay.set(def.colorDay);
    tempNight.set(def.colorNight);
    mat.color.lerpColors(tempDay, tempNight, t);

    if (def.emissiveNight) {
      const emColor = new THREE.Color(def.emissiveNight);
      mat.emissive.lerpColors(ZeroColor, emColor, interiorFactor);
      mat.emissiveIntensity = (def.emissiveIntensityNight ?? 0.3) * interiorFactor;
    }
  }
}
