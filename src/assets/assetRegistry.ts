import { AssetPrefabDefinition, PlacedAssetSpec } from './assetTypes';

/**
 * CENTRAL ASSET PREFAB CATALOG
 *
 * When creating a new 3D asset (e.g. a couch, dining table, kitchen island, bed) in a new chat:
 * 1. Create `src/assets/items/<name>.ts` exporting an `AssetPrefabDefinition`.
 * 2. Import and register it in `ASSET_PREFABS` below.
 * 3. Add its placement(s) to `PLACED_ASSETS` below.
 */
export const ASSET_PREFABS: Record<string, AssetPrefabDefinition> = {
  // Register reusable 3D furniture / interior / garden prefabs here
};

/**
 * PLACED ASSETS IN BOUWNUMMER 55
 *
 * Currently empty for Version 1 (architectural fundamentals only).
 * Add `PlacedAssetSpec` entries here to place objects into specific rooms/floors.
 */
export const PLACED_ASSETS: PlacedAssetSpec[] = [
  // Example placement (uncomment when adding an asset):
  // {
  //   id: 'living_couch_main',
  //   prefabId: 'couch_corner_soft',
  //   floor: 'ground',
  //   positionXZ: [3.20, -2.10],
  //   rotationDeg: 180,
  // }
];
