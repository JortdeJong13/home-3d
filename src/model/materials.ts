import * as THREE from 'three';
import { ProvenanceType } from './units';

/**
 * Semantic Material Identifiers
 *
 * Geometry elements reference ONLY these semantic IDs, never colours or textures.
 * This guarantees 100% separation between geometry and visual appearance.
 */
export type MaterialId =
  | 'exterior_brick_main'
  | 'exterior_brick_plinth'
  | 'exterior_arch_brick'
  | 'interior_wall_plaster'
  | 'floor_living_oak'
  | 'floor_hall_warm'
  | 'floor_tile_beige'
  | 'floor_berging_concrete'
  | 'floor_bedroom_soft'
  | 'floor_zolder_wood'
  | 'slab_structural_edge'
  | 'roof_tile_anthracite'
  | 'roof_flat_bitumen'
  | 'roof_daktrim_zinc'
  | 'roof_fascia_white'
  | 'roof_solar_panel'
  | 'window_frame_cream'
  | 'window_trim_terracotta'
  | 'window_glass_day'
  | 'window_glass_unlit'
  | 'door_exterior_sage'
  | 'door_interior_wood'
  | 'stair_wood_oak'
  | 'plot_grass_lawn'
  | 'plot_patio_limestone'
  | 'plot_stepping_stone'
  | 'plot_gravel_warm'
  | 'plot_driveway_gravel'
  | 'plot_driveway_paver'
  | 'plot_soil_border'
  | 'plot_hedge_beech'
  | 'plot_tree_foliage_sage'
  | 'plot_tree_foliage_warm'
  | 'plot_tree_foliage_bolboom'
  | 'plot_tree_foliage_blossom'
  | 'plot_flower_lavender'
  | 'plot_tree_trunk'
  | 'plot_tree_stake_wood'
  | 'plot_gate_timber'
  | 'plot_fence_post'
  | 'garden_lamp_glow'
  | 'plinth_base_white'
  | 'neighbour_wall_grey'
  | 'neighbour_roof_grey'
  | 'neighbour_window_grey'
  | 'neighbour_trim_grey'
  | 'neighbour_glass_grey'
  | 'neighbour_ground_grey'
  | 'neighbour_hedge_grey'
  | 'neighbour_tree_grey'
  | 'neighbour_trunk_grey'
  | 'neighbour_pavement_grey'
  | 'neighbour_kerb_grey';

export interface MaterialStyleDef {
  colorDay: string;
  colorNight: string;
  roughness: number;
  metalness: number;
  opacity?: number;
  opacityNight?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  emissiveNight?: string;
  emissiveIntensityNight?: number;
  isNeighbourContext?: boolean;
}

/**
 * Shared architectural accent definitions so updating a single color updates
 * every matching element across the house and isolated 3D assets:
 * - SHARED_TERRACOTTA_BRICK: Front entrance arch + all exterior window/door brick surrounds
 * - door_exterior_sage: Front door + Berging garage/rear doors + 1st-floor French balcony railings
 */
const SHARED_TERRACOTTA_BRICK = {
  colorDay: '#b5654d',
  colorNight: '#64372b',
  roughness: 0.91,
  metalness: 0.0,
};

/**
 * Soft Architectural Diorama Palette
 * Inspired by Bruno Simon's "My Room in 3D" and the isometric reference renders,
 * combined with the architectural material cues of Wonen aan de Hulk (Woning.jpg).
 */
export const MATERIAL_PALETTE: Record<MaterialId, MaterialStyleDef> = {
  // Owned House Exterior (Warm sand-ochre brick & soft plaster)
  // Note: exterior_brick_main uses a procedural running-bond DataTexture map,
  // so colorDay is neutral white (#ffffff) and colorNight dims the texture.
  exterior_brick_main: {
    colorDay: '#ffffff',
    colorNight: '#706a61',
    roughness: 0.92,
    metalness: 0.0,
  },
  exterior_brick_plinth: {
    colorDay: '#b89f7d',
    colorNight: '#594e40',
    roughness: 0.94,
    metalness: 0.0,
  },
  exterior_arch_brick: {
    ...SHARED_TERRACOTTA_BRICK,
  },

  // Interior Walls (Warm powdery off-white plaster)
  interior_wall_plaster: {
    colorDay: '#f7f4ee',
    colorNight: '#e8dccb',
    roughness: 0.94,
    metalness: 0.0,
    emissiveNight: '#ffcf96',
    emissiveIntensityNight: 0.14,
  },

  // Floors & Slabs
  floor_living_oak: {
    colorDay: '#dfc7a4',
    colorNight: '#c4ab89',
    roughness: 0.85,
    metalness: 0.0,
    emissiveNight: '#ffca85',
    emissiveIntensityNight: 0.16,
  },
  floor_hall_warm: {
    colorDay: '#e9d8b4',
    colorNight: '#ccb894',
    roughness: 0.86,
    metalness: 0.0,
    emissiveNight: '#ffca85',
    emissiveIntensityNight: 0.14,
  },
  floor_tile_beige: {
    colorDay: '#dfd9ce',
    colorNight: '#b5afa4',
    roughness: 0.8,
    metalness: 0.02,
    emissiveNight: '#ffd6a1',
    emissiveIntensityNight: 0.12,
  },
  floor_berging_concrete: {
    colorDay: '#e3e1dc',
    colorNight: '#585b63',
    roughness: 0.92,
    metalness: 0.0,
  },
  floor_bedroom_soft: {
    colorDay: '#ead7cf',
    colorNight: '#c4b0a7',
    roughness: 0.88,
    metalness: 0.0,
    emissiveNight: '#ffcaa0',
    emissiveIntensityNight: 0.14,
  },
  floor_zolder_wood: {
    colorDay: '#e2cbb5',
    colorNight: '#b8a28d',
    roughness: 0.88,
    metalness: 0.0,
    emissiveNight: '#ffc994',
    emissiveIntensityNight: 0.11,
  },
  slab_structural_edge: {
    colorDay: '#f2efe9',
    colorNight: '#8f8b84',
    roughness: 0.92,
    metalness: 0.0,
  },

  // Roofs
  roof_tile_anthracite: {
    colorDay: '#42474d',
    colorNight: '#23272b',
    roughness: 0.88,
    metalness: 0.04,
  },
  roof_flat_bitumen: {
    colorDay: '#3a3e42',
    colorNight: '#1e2124',
    roughness: 0.92,
    metalness: 0.02,
  },
  roof_daktrim_zinc: {
    colorDay: '#b8bec4',
    colorNight: '#5e6369',
    roughness: 0.55,
    metalness: 0.25,
  },
  roof_fascia_white: {
    colorDay: '#f7f5f0',
    colorNight: '#94928d',
    roughness: 0.85,
    metalness: 0.0,
  },
  roof_solar_panel: {
    colorDay: '#2c3540',
    colorNight: '#171c24',
    roughness: 0.4,
    metalness: 0.15,
  },

  // Windows & Doors
  window_frame_cream: {
    colorDay: '#f5f2eb',
    colorNight: '#a8a49d',
    roughness: 0.82,
    metalness: 0.02,
  },
  window_trim_terracotta: {
    ...SHARED_TERRACOTTA_BRICK,
  },
  window_glass_day: {
    colorDay: '#8fbcd4',
    colorNight: '#ffdba8',
    roughness: 0.16,
    metalness: 0.08,
    opacity: 0.44,
    opacityNight: 0.24,
    transparent: true,
    depthWrite: false,
    emissiveNight: '#ffbe6b',
    emissiveIntensityNight: 0.18,
  },
  window_glass_unlit: {
    colorDay: '#8fbcd4',
    colorNight: '#384659',
    roughness: 0.18,
    metalness: 0.1,
    opacity: 0.46,
    opacityNight: 0.36,
    transparent: true,
    depthWrite: false,
  },
  door_exterior_sage: {
    colorDay: '#8ab393',
    colorNight: '#49614e',
    roughness: 0.85,
    metalness: 0.02,
  },
  door_interior_wood: {
    colorDay: '#d1b08a',
    colorNight: '#9e8467',
    roughness: 0.84,
    metalness: 0.0,
  },
  stair_wood_oak: {
    colorDay: '#dcc29e',
    colorNight: '#a89376',
    roughness: 0.85,
    metalness: 0.0,
  },

  // Plot, Garden & Landscaping (Full warm pastel diorama colours)
  plot_grass_lawn: {
    colorDay: '#b4d6a4',
    colorNight: '#43573d',
    roughness: 0.95,
    metalness: 0.0,
  },
  plot_patio_limestone: {
    colorDay: '#ebe1cf',
    colorNight: '#787166',
    roughness: 0.9,
    metalness: 0.0,
  },
  plot_stepping_stone: {
    colorDay: '#e6dac4',
    colorNight: '#70695d',
    roughness: 0.9,
    metalness: 0.0,
  },
  plot_gravel_warm: {
    colorDay: '#d9ccb4',
    colorNight: '#635d52',
    roughness: 0.95,
    metalness: 0.0,
  },
  plot_driveway_gravel: {
    colorDay: '#b4b7bc',
    colorNight: '#52555c',
    roughness: 0.96,
    metalness: 0.0,
  },
  plot_driveway_paver: {
    colorDay: '#d4d0c8',
    colorNight: '#5e5c58',
    roughness: 0.92,
    metalness: 0.0,
  },
  plot_soil_border: {
    colorDay: '#a89279',
    colorNight: '#473e33',
    roughness: 0.96,
    metalness: 0.0,
  },
  plot_hedge_beech: {
    colorDay: '#8bb87a',
    colorNight: '#34472d',
    roughness: 0.94,
    metalness: 0.0,
  },
  plot_tree_foliage_sage: {
    colorDay: '#9ec989',
    colorNight: '#3c4f33',
    roughness: 0.92,
    metalness: 0.0,
    opacity: 0.68,
    transparent: true,
  },
  plot_tree_foliage_warm: {
    colorDay: '#d9c46c',
    colorNight: '#59502b',
    roughness: 0.92,
    metalness: 0.0,
  },
  plot_tree_foliage_bolboom: {
    colorDay: '#79a662',
    colorNight: '#2c3d24',
    roughness: 0.92,
    metalness: 0.0,
    opacity: 0.68,
    transparent: true,
  },
  plot_tree_foliage_blossom: {
    colorDay: '#f2f5f0',
    colorNight: '#7d827a',
    roughness: 0.9,
    metalness: 0.0,
  },
  plot_flower_lavender: {
    colorDay: '#a4a8dc',
    colorNight: '#444766',
    roughness: 0.90,
    metalness: 0.0,
  },
  plot_tree_trunk: {
    colorDay: '#6e5846',
    colorNight: '#362b22',
    roughness: 0.94,
    metalness: 0.0,
  },
  plot_tree_stake_wood: {
    colorDay: '#cfc0a8',
    colorNight: '#5e564a',
    roughness: 0.92,
    metalness: 0.0,
  },
  plot_gate_timber: {
    colorDay: '#c29b70',
    colorNight: '#5c4935',
    roughness: 0.88,
    metalness: 0.0,
  },
  plot_fence_post: {
    colorDay: '#947350',
    colorNight: '#463626',
    roughness: 0.90,
    metalness: 0.0,
  },
  garden_lamp_glow: {
    colorDay: '#f4efe6',
    colorNight: '#fff0c4',
    roughness: 0.35,
    metalness: 0.0,
    emissiveNight: '#ffd180',
    emissiveIntensityNight: 2.4,
  },
  plinth_base_white: {
    colorDay: '#f4f2ed',
    colorNight: '#3b404a',
    roughness: 0.9,
    metalness: 0.0,
  },

  // Neighbouring Property (bnr. 56) & Surrounding Context -> Strictly Neutral Greyscale!
  neighbour_wall_grey: {
    colorDay: '#d4d6d8',
    colorNight: '#50545c',
    roughness: 0.94,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_roof_grey: {
    colorDay: '#9ea3a8',
    colorNight: '#383c42',
    roughness: 0.92,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_window_grey: {
    colorDay: '#bfc3c7',
    colorNight: '#484c54',
    roughness: 0.9,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_trim_grey: {
    colorDay: '#adb0b4',
    colorNight: '#43474e',
    roughness: 0.91,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_glass_grey: {
    colorDay: '#aeb5bc',
    colorNight: '#434852',
    roughness: 0.5,
    metalness: 0.05,
    opacity: 0.65,
    transparent: true,
    depthWrite: false,
    isNeighbourContext: true,
  },
  neighbour_ground_grey: {
    colorDay: '#dfe2e4',
    colorNight: '#3e434d',
    roughness: 0.96,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_hedge_grey: {
    colorDay: '#c2c6ca',
    colorNight: '#474c56',
    roughness: 0.95,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_tree_grey: {
    colorDay: '#b4babe',
    colorNight: '#454b56',
    roughness: 0.95,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_trunk_grey: {
    colorDay: '#9da3a8',
    colorNight: '#383d46',
    roughness: 0.95,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_pavement_grey: {
    colorDay: '#c9cdd0',
    colorNight: '#4b515b',
    roughness: 0.95,
    metalness: 0.0,
    isNeighbourContext: true,
  },
  neighbour_kerb_grey: {
    colorDay: '#eef0f1',
    colorNight: '#5b616c',
    roughness: 0.9,
    metalness: 0.0,
    isNeighbourContext: true,
  },
};

export const PROVENANCE_COLORS: Record<ProvenanceType, string> = {
  verified_drawing: '#52b788', // Emerald green
  user_supplied: '#4ea8de',    // Sky blue
  calculated: '#a78bfa',       // Soft violet
  assumed: '#f4a261',          // Warm amber
};
