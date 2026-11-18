import { AssetPrefabDefinition, PlacedAssetSpec } from './assetTypes';
import { frontDoorArchPrefab } from './items/frontDoorArch';
import { heatPumpOutdoorPrefab } from './items/heatPumpOutdoor';
import { rainPipeHwaPrefab } from './items/rainPipeHwa';

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
    positionXZ: [-2.20, -13.92],
    rotationDeg: 180,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 achtergevel berging: warmtepomp buitenunit rechts naast tuindeur',
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
];
