import * as THREE from 'three';
import { MaterialId, MATERIAL_PALETTE } from './materials';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';
export type SeasonWeights = Record<SeasonId, number>;

export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export interface SeasonMeta {
  id: SeasonId;
  label: string;
  icon: string;
  subtitle: string;
}

export const SEASON_META: Record<SeasonId, SeasonMeta> = {
  spring: {
    id: 'spring',
    label: 'Lente',
    icon: '🌸',
    subtitle: 'Fris groen & zachte bloesem',
  },
  summer: {
    id: 'summer',
    label: 'Zomer',
    icon: '🌿',
    subtitle: 'Heldere zon & zwoele avond',
  },
  autumn: {
    id: 'autumn',
    label: 'Herfst',
    icon: '🍂',
    subtitle: 'Zachte regen & koele rust',
  },
  winter: {
    id: 'winter',
    label: 'Winter',
    icon: '❄️',
    subtitle: 'Stille sneeuw & winterlicht',
  },
};

export function createSeasonWeights(active: SeasonId): SeasonWeights {
  return {
    spring: active === 'spring' ? 1 : 0,
    summer: active === 'summer' ? 1 : 0,
    autumn: active === 'autumn' ? 1 : 0,
    winter: active === 'winter' ? 1 : 0,
  };
}

export const DEFAULT_SEASON_WEIGHTS: SeasonWeights = createSeasonWeights('summer');

export interface SeasonalMaterialVariant {
  colorDay?: string;
  colorNight?: string;
  roughness?: number;
  opacity?: number;
  opacityNight?: number;
}

/**
 * Seasonal overrides for organic, landscape, and weather-exposed materials.
 * Summer intentionally omits overrides so it stays 100% faithful to MATERIAL_PALETTE.
 */
export const SEASON_MATERIAL_OVERRIDES: Partial<
  Record<MaterialId, Partial<Record<SeasonId, SeasonalMaterialVariant>>>
> = {
  plot_grass_lawn: {
    spring: { colorDay: '#b1db9c', colorNight: '#445b3e' },
    autumn: { colorDay: '#a7bc86', colorNight: '#414f38' },
    winter: { colorDay: '#e6edf3', colorNight: '#626f82', roughness: 0.94 },
  },
  plot_hedge_beech: {
    spring: { colorDay: '#90c27a', colorNight: '#374c30' },
    autumn: { colorDay: '#9ba76c', colorNight: '#3e462d' },
    winter: { colorDay: '#79a469', colorNight: '#32442c' },
  },
  plot_hedge_beech_deep: {
    spring: { colorDay: '#70a35c', colorNight: '#293c23' },
    autumn: { colorDay: '#7b8853', colorNight: '#303621' },
    winter: { colorDay: '#5f8751', colorNight: '#253620' },
  },
  plot_hedge_beech_fresh: {
    spring: { colorDay: '#aedf90', colorNight: '#445e38' },
    autumn: { colorDay: '#b4b977', colorNight: '#494d32' },
    winter: { colorDay: '#8eb67a', colorNight: '#3b4e34' },
  },
  plot_tree_foliage_sage: {
    spring: { colorDay: '#a2d48d', colorNight: '#3f5436', opacity: 0.72 },
    autumn: { colorDay: '#b0ae74', colorNight: '#474830', opacity: 0.70 },
    winter: { colorDay: '#84b273', colorNight: '#364a30', opacity: 0.78 },
  },
  plot_tree_foliage_bolboom: {
    spring: { colorDay: '#82b668', colorNight: '#304427', opacity: 0.72 },
    autumn: { colorDay: '#93975c', colorNight: '#3a3d26', opacity: 0.70 },
    winter: { colorDay: '#6d9959', colorNight: '#2c3e25', opacity: 0.78 },
  },
  plot_tree_foliage_blossom: {
    spring: { colorDay: '#fbe2ea', colorNight: '#8b7a80' },
    autumn: { colorDay: '#d6baa4', colorNight: '#62554b' },
    winter: { colorDay: '#e6edf2', colorNight: '#6a7482' },
  },
  plot_tree_foliage_warm: {
    spring: { colorDay: '#eedb6d', colorNight: '#665d2d' },
    autumn: { colorDay: '#c9a966', colorNight: '#54472b' },
    winter: { colorDay: '#c6cfd6', colorNight: '#59616b' },
  },
  plot_flower_lavender: {
    spring: { colorDay: '#b2b6ea', colorNight: '#4c4f73' },
    autumn: { colorDay: '#8e7f96', colorNight: '#403946' },
    winter: { colorDay: '#bbc4ce', colorNight: '#555d68' },
  },
  plot_flower_pink: {
    spring: { colorDay: '#f0b1ba', colorNight: '#704d52' },
    autumn: { colorDay: '#b38b88', colorNight: '#4f3d3c' },
    winter: { colorDay: '#ccd3da', colorNight: '#5c636e' },
  },
  plot_soil_border: {
    autumn: { colorDay: '#86725c', colorNight: '#3d342b' },
    winter: { colorDay: '#dce4eb', colorNight: '#5e6978' },
  },
  plot_gravel_warm: {
    autumn: { colorDay: '#c4b79f', colorNight: '#595348' },
    winter: { colorDay: '#e2e9ef', colorNight: '#616c7b' },
  },
  plot_driveway_gravel: {
    autumn: { colorDay: '#9fa3a9', colorNight: '#474b52' },
    winter: { colorDay: '#cfd6dc', colorNight: '#5a626e' },
  },
  plot_patio_limestone: {
    autumn: { colorDay: '#d7c6bd', colorNight: '#6d625c' },
    winter: { colorDay: '#e3dad6', colorNight: '#77767c' },
  },
  plot_stepping_stone: {
    autumn: { colorDay: '#cec0a7', colorNight: '#645c4e' },
    winter: { colorDay: '#ded7cb', colorNight: '#6f6f74' },
  },
  plot_driveway_paver: {
    autumn: { colorDay: '#c2beb6', colorNight: '#54524e' },
    winter: { colorDay: '#dad9d6', colorNight: '#686b72' },
  },
  // Neutral greyscale neighbour context (kept strictly neutral greyscale across all seasons)
  neighbour_ground_grey: {
    autumn: { colorDay: '#cfd3d6', colorNight: '#393e47' },
    winter: { colorDay: '#eaedf0', colorNight: '#535b68' },
  },
  neighbour_hedge_grey: {
    winter: { colorDay: '#dadde0', colorNight: '#525965' },
  },
  neighbour_tree_grey: {
    winter: { colorDay: '#d4d8dc', colorNight: '#505763' },
  },
  neighbour_roof_grey: {
    winter: { colorDay: '#c4c9ce', colorNight: '#484e58' },
  },
  neighbour_pavement_grey: {
    autumn: { colorDay: '#b8bdc1', colorNight: '#434952' },
    winter: { colorDay: '#d8dce0', colorNight: '#555d69' },
  },
};

/**
 * Per-material snow accumulation factor in Winter (0 = no snow, 1 = full upward blanket)
 * and rain wetness factor in Autumn (0 = dry, 1 = damp sheen).
 */
export const MATERIAL_SURFACE_WEATHER: Partial<
  Record<MaterialId, { snow?: number; wet?: number; isNeighbour?: boolean }>
> = {
  roof_tile_anthracite: { snow: 0.85, wet: 0.30 },
  roof_flat_bitumen: { snow: 0.88, wet: 0.35 },
  roof_daktrim_zinc: { snow: 0.55, wet: 0.35 },
  roof_fascia_white: { snow: 0.50, wet: 0.25 },
  roof_solar_panel: { snow: 0.14, wet: 0.25 },
  plot_grass_lawn: { snow: 0.92, wet: 0.15 },
  plot_patio_limestone: { snow: 0.34, wet: 0.60 },
  plot_stepping_stone: { snow: 0.36, wet: 0.55 },
  plot_gravel_warm: { snow: 0.78, wet: 0.25 },
  plot_driveway_gravel: { snow: 0.62, wet: 0.30 },
  plot_driveway_paver: { snow: 0.36, wet: 0.60 },
  plot_soil_border: { snow: 0.85, wet: 0.20 },
  plot_hedge_beech: { snow: 0.80, wet: 0.15 },
  plot_hedge_beech_deep: { snow: 0.76, wet: 0.15 },
  plot_hedge_beech_fresh: { snow: 0.84, wet: 0.15 },
  plot_tree_foliage_sage: { snow: 0.84, wet: 0.10 },
  plot_tree_foliage_bolboom: { snow: 0.84, wet: 0.10 },
  plot_tree_foliage_blossom: { snow: 0.55, wet: 0.10 },
  plot_tree_foliage_warm: { snow: 0.50, wet: 0.10 },
  plot_flower_lavender: { snow: 0.55, wet: 0.10 },
  plot_flower_pink: { snow: 0.55, wet: 0.10 },
  plot_gate_timber: { snow: 0.62, wet: 0.35 },
  plot_fence_post: { snow: 0.62, wet: 0.35 },
  neighbour_roof_grey: { snow: 0.82, wet: 0.25, isNeighbour: true },
  neighbour_ground_grey: { snow: 0.88, wet: 0.20, isNeighbour: true },
  neighbour_hedge_grey: { snow: 0.78, wet: 0.15, isNeighbour: true },
  neighbour_tree_grey: { snow: 0.80, wet: 0.10, isNeighbour: true },
  neighbour_pavement_grey: { snow: 0.45, wet: 0.55, isNeighbour: true },
  neighbour_kerb_grey: { snow: 0.60, wet: 0.45, isNeighbour: true },
};

const _tmpC = new THREE.Color();

/**
 * Blend a material's day & night colors, opacity, and base roughness across the current SeasonWeights.
 */
export function evaluateSeasonalMaterial(
  id: MaterialId,
  weights: SeasonWeights,
  outDay: THREE.Color,
  outNight: THREE.Color
): { roughness: number; opacity?: number; opacityNight?: number } {
  const base = MATERIAL_PALETTE[id];
  const overrides = SEASON_MATERIAL_OVERRIDES[id];

  outDay.setRGB(0, 0, 0);
  outNight.setRGB(0, 0, 0);

  let roughness = 0;
  let opacitySum = 0;
  let opacityNightSum = 0;
  const hasOpacity = base.opacity !== undefined;

  for (const season of SEASON_ORDER) {
    const w = weights[season];
    if (w <= 0.0001) continue;
    const ov = overrides?.[season];

    _tmpC.set(ov?.colorDay ?? base.colorDay);
    outDay.r += _tmpC.r * w;
    outDay.g += _tmpC.g * w;
    outDay.b += _tmpC.b * w;

    _tmpC.set(ov?.colorNight ?? base.colorNight);
    outNight.r += _tmpC.r * w;
    outNight.g += _tmpC.g * w;
    outNight.b += _tmpC.b * w;

    roughness += (ov?.roughness ?? base.roughness) * w;

    if (hasOpacity) {
      const opDay = ov?.opacity ?? base.opacity!;
      const opNight = ov?.opacityNight ?? base.opacityNight ?? opDay;
      opacitySum += opDay * w;
      opacityNightSum += opNight * w;
    }
  }

  return hasOpacity
    ? { roughness, opacity: opacitySum, opacityNight: opacityNightSum }
    : { roughness };
}

export interface SeasonLightingPreset {
  daySunColor: string;
  duskSunColor: string;
  nightMoonColor: string;
  sunIntensityDay: number;
  sunIntensityNight: number;
  hemiSkyDay: string;
  hemiSkyNight: string;
  hemiGroundDay: string;
  hemiGroundNight: string;
  hemiIntensityDay: number;
  hemiIntensityNight: number;
  ambDay: string;
  ambNight: string;
  ambIntensityDay: number;
  ambIntensityNight: number;
  rimIntensityDay: number;
  rimIntensityNight: number;
  interiorGlowBoost: number;
}

export const SEASON_LIGHTING_PRESETS: Record<SeasonId, SeasonLightingPreset> = {
  spring: {
    daySunColor: '#fff8ea',
    duskSunColor: '#f2d9c8',
    nightMoonColor: '#a9bce8',
    sunIntensityDay: 1.88,
    sunIntensityNight: 1.0,
    hemiSkyDay: '#eef9fd',
    hemiSkyNight: '#7a8fc4',
    hemiGroundDay: '#f2e8d4',
    hemiGroundNight: '#3c405e',
    hemiIntensityDay: 1.24,
    hemiIntensityNight: 1.05,
    ambDay: '#fffaf2',
    ambNight: '#7f89b4',
    ambIntensityDay: 0.42,
    ambIntensityNight: 0.75,
    rimIntensityDay: 0.52,
    rimIntensityNight: 0.25,
    interiorGlowBoost: 1.0,
  },
  summer: {
    daySunColor: '#fff5e4',
    duskSunColor: '#edd8c8',
    nightMoonColor: '#a9b8e8',
    sunIntensityDay: 1.85,
    sunIntensityNight: 1.0,
    hemiSkyDay: '#eef7fa',
    hemiSkyNight: '#7b8fc4',
    hemiGroundDay: '#f3e5d0',
    hemiGroundNight: '#3b3f5c',
    hemiIntensityDay: 1.20,
    hemiIntensityNight: 1.05,
    ambDay: '#fff8ee',
    ambNight: '#7d86b0',
    ambIntensityDay: 0.42,
    ambIntensityNight: 0.75,
    rimIntensityDay: 0.52,
    rimIntensityNight: 0.25,
    interiorGlowBoost: 1.0,
  },
  autumn: {
    daySunColor: '#f2e2ce',
    duskSunColor: '#deb89f',
    nightMoonColor: '#98a9d4',
    sunIntensityDay: 1.26,
    sunIntensityNight: 0.85,
    hemiSkyDay: '#cdd9e0',
    hemiSkyNight: '#6b7aa8',
    hemiGroundDay: '#cdb99f',
    hemiGroundNight: '#383b50',
    hemiIntensityDay: 1.32,
    hemiIntensityNight: 1.02,
    ambDay: '#f5ece0',
    ambNight: '#757ea3',
    ambIntensityDay: 0.56,
    ambIntensityNight: 0.78,
    rimIntensityDay: 0.44,
    rimIntensityNight: 0.22,
    interiorGlowBoost: 1.18,
  },
  winter: {
    daySunColor: '#f5f8ff',
    duskSunColor: '#e2d7ea',
    nightMoonColor: '#b9cef7',
    sunIntensityDay: 1.56,
    sunIntensityNight: 1.12,
    hemiSkyDay: '#e1ecf6',
    hemiSkyNight: '#8398cc',
    hemiGroundDay: '#dce3ec',
    hemiGroundNight: '#4a536b',
    hemiIntensityDay: 1.30,
    hemiIntensityNight: 1.12,
    ambDay: '#f4f8ff',
    ambNight: '#8996c2',
    ambIntensityDay: 0.50,
    ambIntensityNight: 0.82,
    rimIntensityDay: 0.56,
    rimIntensityNight: 0.30,
    interiorGlowBoost: 1.22,
  },
};
