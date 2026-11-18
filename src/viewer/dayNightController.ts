import * as THREE from 'three';
import { HouseSceneGroups } from '../geometry/houseBuilder';
import { MATERIAL_PALETTE, MaterialId } from '../model/materials';
import {
  DEFAULT_SEASON_WEIGHTS,
  SEASON_LIGHTING_PRESETS,
  SEASON_ORDER,
  SeasonWeights,
  evaluateSeasonalMaterial,
} from '../model/seasons';

export interface SceneLightingRig {
  hemiLight: THREE.HemisphereLight;
  ambientLight: THREE.AmbientLight;
  sunLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
}

export function createLightingRig(scene: THREE.Scene): SceneLightingRig {
  // Soft warm-to-cool architectural diorama hemisphere light (inspired by Bruno Simon's My Room in 3D)
  const hemiLight = new THREE.HemisphereLight('#eef7fa', '#f3e5d0', 1.20);
  hemiLight.position.set(0, 25, 0);
  scene.add(hemiLight);

  // Subtle ambient fill to keep shadows powdery and readable, never harsh black
  const ambientLight = new THREE.AmbientLight('#fff8ee', 0.42);
  scene.add(ambientLight);

  // Primary Directional Sun / Moon light with high-resolution soft shadow map
  const sunLight = new THREE.DirectionalLight('#fff5e4', 1.85);
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
  const rimLight = new THREE.DirectionalLight('#d8ecf5', 0.52);
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
  celestialRotorEl: HTMLElement | null,
  seasonWeights: SeasonWeights = DEFAULT_SEASON_WEIGHTS
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

  // 3. Blend seasonal lighting parameters cleanly
  const daySunColor = new THREE.Color(0, 0, 0);
  const duskSunColor = new THREE.Color(0, 0, 0);
  const nightMoonColor = new THREE.Color(0, 0, 0);
  const dayHemiSky = new THREE.Color(0, 0, 0);
  const nightHemiSky = new THREE.Color(0, 0, 0);
  const dayHemiGround = new THREE.Color(0, 0, 0);
  const nightHemiGround = new THREE.Color(0, 0, 0);
  const dayAmb = new THREE.Color(0, 0, 0);
  const nightAmb = new THREE.Color(0, 0, 0);
  const scratchColor = new THREE.Color();
  const addScaledColor = (dst: THREE.Color, src: THREE.Color, w: number) => {
    dst.r += src.r * w;
    dst.g += src.g * w;
    dst.b += src.b * w;
  };

  let sunIntDay = 0;
  let sunIntNight = 0;
  let hemiIntDay = 0;
  let hemiIntNight = 0;
  let ambIntDay = 0;
  let ambIntNight = 0;
  let rimIntDay = 0;
  let rimIntNight = 0;
  let interiorGlowBoost = 0;

  for (const s of SEASON_ORDER) {
    const w = seasonWeights[s];
    if (w <= 0.0001) continue;
    const p = SEASON_LIGHTING_PRESETS[s];

    scratchColor.set(p.daySunColor);
    addScaledColor(daySunColor, scratchColor, w);
    scratchColor.set(p.duskSunColor);
    addScaledColor(duskSunColor, scratchColor, w);
    scratchColor.set(p.nightMoonColor);
    addScaledColor(nightMoonColor, scratchColor, w);

    scratchColor.set(p.hemiSkyDay);
    addScaledColor(dayHemiSky, scratchColor, w);
    scratchColor.set(p.hemiSkyNight);
    addScaledColor(nightHemiSky, scratchColor, w);
    scratchColor.set(p.hemiGroundDay);
    addScaledColor(dayHemiGround, scratchColor, w);
    scratchColor.set(p.hemiGroundNight);
    addScaledColor(nightHemiGround, scratchColor, w);

    scratchColor.set(p.ambDay);
    addScaledColor(dayAmb, scratchColor, w);
    scratchColor.set(p.ambNight);
    addScaledColor(nightAmb, scratchColor, w);

    sunIntDay += p.sunIntensityDay * w;
    sunIntNight += p.sunIntensityNight * w;
    hemiIntDay += p.hemiIntensityDay * w;
    hemiIntNight += p.hemiIntensityNight * w;
    ambIntDay += p.ambIntensityDay * w;
    ambIntNight += p.ambIntensityNight * w;
    rimIntDay += p.rimIntensityDay * w;
    rimIntNight += p.rimIntensityNight * w;
    interiorGlowBoost += p.interiorGlowBoost * w;
  }

  const currentSunColor = new THREE.Color();
  if (t < 0.5) {
    currentSunColor.lerpColors(daySunColor, duskSunColor, t * 2);
  } else {
    currentSunColor.lerpColors(duskSunColor, nightMoonColor, (t - 0.5) * 2);
  }
  rig.sunLight.color.copy(currentSunColor);
  rig.sunLight.intensity = THREE.MathUtils.lerp(sunIntDay, sunIntNight, t) * (1 - dip * 0.35);

  rig.hemiLight.color.lerpColors(dayHemiSky, nightHemiSky, t);
  rig.hemiLight.groundColor.lerpColors(dayHemiGround, nightHemiGround, t);
  rig.hemiLight.intensity = THREE.MathUtils.lerp(hemiIntDay, hemiIntNight, t);

  rig.ambientLight.color.lerpColors(dayAmb, nightAmb, t);
  rig.ambientLight.intensity = THREE.MathUtils.lerp(ambIntDay, ambIntNight, t);

  rig.rimLight.intensity = THREE.MathUtils.lerp(rimIntDay, rimIntNight, t);

  // 4. Interior Warm Point Lights (smoothly turn on as dusk/night arrives; subtly warmer in autumn/winter)
  const interiorFactor = THREE.MathUtils.smoothstep(t, 0.25, 0.85);
  for (const pt of groups.interiorLights) {
    const maxI = (pt.userData.maxNightIntensity as number) ?? 4.0;
    pt.intensity = maxI * interiorFactor * interiorGlowBoost;
  }

  // 5. Outer Ground Diffusion Shader Colour & Surface Snow/Wet Uniforms
  groups.seasonUniforms.uSeasonSnow.value = seasonWeights.winter;
  groups.seasonUniforms.uSeasonWet.value = seasonWeights.autumn;
  groups.seasonUniforms.uSnowColorOwned.value.lerpColors(
    scratchColor.set('#eef4f8'),
    new THREE.Color('#6b7a8f'),
    t
  );
  groups.seasonUniforms.uSnowColorNeighbour.value.lerpColors(
    scratchColor.set('#eaedf0'),
    new THREE.Color('#535b68'),
    t
  );

  if (groups.backdropFadeMaterial) {
    const cDay = new THREE.Color();
    const cNight = new THREE.Color();
    evaluateSeasonalMaterial('neighbour_ground_grey', seasonWeights, cDay, cNight);
    groups.backdropFadeMaterial.uniforms.uColor.value.lerpColors(cDay, cNight, t);
  }

  // 6. Interpolate Material Palette Colours, Seasonal Foliage/Ground, & Emissive Window Glow
  const tempDay = new THREE.Color();
  const tempNight = new THREE.Color();
  const ZeroColor = new THREE.Color('#000000');

  for (const [id, mat] of groups.materialMap.entries()) {
    const matId = id as MaterialId;
    const def = MATERIAL_PALETTE[matId];
    if (!def) continue;

    const seasonal = evaluateSeasonalMaterial(matId, seasonWeights, tempDay, tempNight);
    mat.color.lerpColors(tempDay, tempNight, t);
    mat.roughness = seasonal.roughness;

    if (seasonal.opacity !== undefined) {
      const opDay = seasonal.opacity;
      const opNight = seasonal.opacityNight ?? opDay;
      mat.opacity = THREE.MathUtils.lerp(opDay, opNight, interiorFactor);
    }

    if (def.emissiveNight) {
      const emColor = new THREE.Color(def.emissiveNight);
      mat.emissive.lerpColors(ZeroColor, emColor, interiorFactor);
      mat.emissiveIntensity = (def.emissiveIntensityNight ?? 0.3) * interiorFactor * interiorGlowBoost;
    }
  }
}
