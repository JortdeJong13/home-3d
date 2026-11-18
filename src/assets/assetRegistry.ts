import { AssetPrefabDefinition, PlacedAssetSpec } from './assetTypes';
import { m } from '../model/units';
import { frontDoorArchPrefab } from './items/frontDoorArch';
import { heatPumpOutdoorPrefab } from './items/heatPumpOutdoor';
import { rainPipeHwaPrefab, rainPipeHwaSectionPrefab } from './items/rainPipeHwa';

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
    positionXZ: [-2.28, -13.95],
    rotationDeg: 180,
    provenance: 'user_supplied',
    source: 'User specification (75 × 30 × 55 cm, 8 cm van achtergevel berging)',
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
      height: m(0.68, 'verified_drawing', 'Zolder borstwering incl. vloerrand tot goothoogte (+5.45 -> +6.13 m)'),
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
      height: m(0.68, 'verified_drawing', 'Zolder borstwering incl. vloerrand tot goothoogte (+5.45 -> +6.13 m)'),
    },
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel: HWA regenpijp bij achterhoek (zolder tot goot +6.13 m)',
  },
];
