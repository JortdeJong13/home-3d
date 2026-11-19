import { AssetPrefabDefinition, PlacedAssetSpec } from './assetTypes';
import { m } from '../model/units';
import { frontDoorArchPrefab } from './items/frontDoorArch';
import { heatPumpOutdoorPrefab } from './items/heatPumpOutdoor';
import { rainPipeHwaPrefab, rainPipeHwaSectionPrefab } from './items/rainPipeHwa';
import { loungeCornerSofaPrefab } from './items/loungeCornerSofa';
import { loungeCoffeeTablePrefab } from './items/loungeCoffeeTable';
import { gardenPlanterClusterPrefab } from './items/gardenPlanterCluster';
import { gardenBollardLightPrefab } from './items/gardenBollardLight';
import { loungeLanternPrefab } from './items/loungeLantern';
import { diningTableOakPrefab } from './items/diningTableOak';

/**
 * CENTRAL ASSET PREFAB CATALOG
 *
 * When creating a new 3D asset (e.g. a couch, dining table, kitchen island, bed) in a new chat:
 * 1. Create `src/assets/items/<name>.ts` exporting an `AssetPrefabDefinition`.
 * 2. Import and register it in `ASSET_PREFABS` below.
 * 3. Add its placement(s) to `PLACED_ASSETS` below.
 */
export const ASSET_PREFABS: Record<string, AssetPrefabDefinition> = {
  front_entrance_portal: frontDoorArchPrefab,
  heat_pump_outdoor: heatPumpOutdoorPrefab,
  rain_pipe_hwa: rainPipeHwaPrefab,
  rain_pipe_hwa_section: rainPipeHwaSectionPrefab,
  lounge_corner_sofa: loungeCornerSofaPrefab,
  lounge_coffee_table: loungeCoffeeTablePrefab,
  garden_planter_cluster: gardenPlanterClusterPrefab,
  garden_bollard_light: gardenBollardLightPrefab,
  lounge_lantern: loungeLanternPrefab,
  dining_table_oak: diningTableOakPrefab,
};

/**
 * PLACED ASSETS IN BOUWNUMMER 55
 *
 * Add `PlacedAssetSpec` entries here to place objects into specific rooms/floors.
 */
export const PLACED_ASSETS: PlacedAssetSpec[] = [
  {
    id: 'gf_berging_warmtepomp_buitenunit',
    prefabId: 'heat_pump_outdoor',
    label: 'Warmtepomp Buitenunit (Achtergevel Berging)',
    floor: 'ground',
    positionXZ: [-2.28, -13.925],
    rotationDeg: 180,
    provenance: 'user_supplied',
    source: 'User specification (75 × 25 × 55 cm, 8 cm van achtergevel berging)',
  },
  {
    id: 'gf_berging_regenpijp_achter',
    prefabId: 'rain_pipe_hwa',
    label: 'Regenpijp / HWA (Achtergevel Berging)',
    floor: 'ground',
    positionXZ: [-2.85, -13.79],
    rotationDeg: 180,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 achtergevel berging: HWA regenpijp met vergaderbak bij buitenhoek',
  },
  {
    id: 'gf_linkerzijgevel_regenpijp_voor',
    prefabId: 'rain_pipe_hwa_section',
    label: 'Regenpijp / HWA (Linkerzijgevel Voorhoek · Begane Grond)',
    floor: 'ground',
    positionXZ: [-0.07, -0.22],
    rotationDeg: 270,
    dimensionsOverride: {
      height: m(2.60, 'verified_drawing', 'Begane grond hoogte (0.00 -> +2.60 m)'),
    },
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel: HWA regenpijp bij voorhoek (begane grond)',
  },
  {
    id: 'ff_linkerzijgevel_regenpijp_voor',
    prefabId: 'rain_pipe_hwa_section',
    label: 'Regenpijp / HWA (Linkerzijgevel Voorhoek · 1e Verdieping)',
    floor: 'first',
    positionXZ: [-0.07, -0.22],
    elevationOffsetY: -0.25,
    rotationDeg: 270,
    dimensionsOverride: {
      height: m(2.85, 'verified_drawing', '1e verdieping incl. vloerrand (+2.60 -> +5.45 m)'),
    },
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel: HWA regenpijp bij voorhoek (1e verdieping)',
  },
  {
    id: 'sf_linkerzijgevel_regenpijp_voor',
    prefabId: 'rain_pipe_hwa',
    label: 'Regenpijp / HWA (Linkerzijgevel Voorhoek · Zolder / Goot)',
    floor: 'second',
    positionXZ: [-0.07, -0.22],
    elevationOffsetY: -0.25,
    rotationDeg: 270,
    dimensionsOverride: {
      height: m(0.52, 'verified_drawing', 'Zolder borstwering incl. vloerrand tot onderkant bakgoot (+5.45 -> +5.97 m)'),
    },
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel: HWA regenpijp bij voorhoek (zolder tot goot +6.13 m)',
  },
  {
    id: 'ff_linkerzijgevel_regenpijp_achter',
    prefabId: 'rain_pipe_hwa_section',
    label: 'Regenpijp / HWA (Linkerzijgevel Achterhoek · 1e Verdieping tot Plat Dak Berging)',
    floor: 'first',
    positionXZ: [-0.07, -10.24],
    elevationOffsetY: -0.01,
    rotationDeg: 270,
    dimensionsOverride: {
      height: m(2.61, 'verified_drawing', 'Van plat dak berging (+2.84 m) tot bovenkant 1e verdieping (+5.45 m)'),
    },
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel: HWA regenpijp eindigend op plat dak berging',
  },
  {
    id: 'sf_linkerzijgevel_regenpijp_achter',
    prefabId: 'rain_pipe_hwa',
    label: 'Regenpijp / HWA (Linkerzijgevel Achterhoek · Zolder / Goot)',
    floor: 'second',
    positionXZ: [-0.07, -10.24],
    elevationOffsetY: -0.25,
    rotationDeg: 270,
    dimensionsOverride: {
      height: m(0.52, 'verified_drawing', 'Zolder borstwering incl. vloerrand tot onderkant bakgoot (+5.45 -> +5.97 m)'),
    },
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel: HWA regenpijp bij achterhoek (zolder tot goot +6.13 m)',
  },
  {
    id: 'back_garden_lounge_sofa',
    prefabId: 'lounge_corner_sofa',
    label: 'Loungeset Hoekbank (Achtertuin Terras)',
    floor: 'ground',
    positionXZ: [4.275, -19.355],
    elevationOffsetY: 0.0325,
    rotationDeg: 0,
    provenance: 'user_supplied',
    source: 'Garden layout: L-shaped lounge corner in rear-right of back garden on limestone terrace',
  },
  {
    id: 'back_garden_lounge_table',
    prefabId: 'lounge_coffee_table',
    label: 'Loungetafel Hout (Achtertuin Terras)',
    floor: 'ground',
    positionXZ: [3.85, -18.95],
    elevationOffsetY: 0.0325,
    rotationDeg: 0,
    provenance: 'user_supplied',
    source: 'Garden layout: wooden coffee table in front of lounge corner sofa',
  },
  {
    id: 'back_garden_terrace_planters',
    prefabId: 'garden_planter_cluster',
    label: 'Bloempotten Lounge Terras (Set van 3)',
    floor: 'ground',
    positionXZ: [2.42, -19.75],
    elevationOffsetY: 0.0325,
    rotationDeg: 25,
    provenance: 'user_supplied',
    source: 'Garden layout: potted plants on left side of rear lounge terrace',
  },
  {
    id: 'back_garden_lounge_lantern',
    prefabId: 'lounge_lantern',
    label: 'Tuinlantaarn (Loungehoek)',
    floor: 'ground',
    positionXZ: [5.42, -18.02],
    elevationOffsetY: 0.0325,
    rotationDeg: -15,
    provenance: 'user_supplied',
    source: 'Garden layout: outdoor floor lantern beside lounge corner sofa',
  },
  {
    id: 'back_garden_light_path_1',
    prefabId: 'garden_bollard_light',
    label: 'Tuinverlichting Pad (Start bij Berging)',
    floor: 'ground',
    positionXZ: [-0.62, -14.88],
    provenance: 'user_supplied',
    source: 'Back garden path bollard light near berging gravel junction',
  },
  {
    id: 'back_garden_light_path_2',
    prefabId: 'garden_bollard_light',
    label: 'Tuinverlichting Pad (Midden)',
    floor: 'ground',
    positionXZ: [1.56, -16.22],
    provenance: 'user_supplied',
    source: 'Back garden path bollard light along S-curve',
  },
  {
    id: 'back_garden_light_path_3',
    prefabId: 'garden_bollard_light',
    label: 'Tuinverlichting Pad (Bij Lounge Terras)',
    floor: 'ground',
    positionXZ: [1.84, -17.48],
    provenance: 'user_supplied',
    source: 'Back garden path bollard light at lounge terrace entry',
  },
  {
    id: 'back_garden_light_border_left',
    prefabId: 'garden_bollard_light',
    label: 'Tuinverlichting Border Links',
    floor: 'ground',
    positionXZ: [-3.68, -17.90],
    provenance: 'user_supplied',
    source: 'Back garden bollard light along left beech-hedge flower border',
  },
  {
    id: 'back_garden_light_border_rear',
    prefabId: 'garden_bollard_light',
    label: 'Tuinverlichting Border Achter',
    floor: 'ground',
    positionXZ: [-0.35, -19.55],
    provenance: 'user_supplied',
    source: 'Back garden bollard light at rear-center flower border',
  },
  {
    id: 'back_garden_light_border_right',
    prefabId: 'garden_bollard_light',
    label: 'Tuinverlichting Border Rechts',
    floor: 'ground',
    positionXZ: [5.15, -14.18],
    provenance: 'user_supplied',
    source: 'Back garden bollard light near patio & right flower border',
  },
  {
    id: 'gf_eetkamer_eettafel',
    prefabId: 'dining_table_oak',
    label: 'Eiken Eettafel (220 × 105 cm)',
    floor: 'ground',
    positionXZ: [4.215, -10.18],
    rotationDeg: 270,
    provenance: 'user_supplied',
    source: 'User specification: 220 × 105 × 77 cm oak table, 118 cm from rear wall (-12.46 m) and 83 cm from shared party wall (+5.57 m)',
  },
];
