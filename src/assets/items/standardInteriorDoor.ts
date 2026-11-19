import * as THREE from 'three';
import { AssetPrefabDefinition } from '../assetTypes';
import { m } from '../../model/units';
import { OPENING_PREFABS, instantiateOpeningPrefab3D } from '../../geometry/componentCatalog';

/**
 * Isolated Asset Viewer wrapper for the standard interior door (`door_inner_standard_b77b`).
 * Delegates directly to `instantiateOpeningPrefab3D` so the workbench renders the exact
 * same geometry, white door finish, and rounded metal rosette handle as the main house.
 */
export const standardInteriorDoorPrefab: AssetPrefabDefinition = {
  prefabId: 'standard_interior_door',
  defaultLabel: OPENING_PREFABS.door_inner_standard_b77b.defaultLabel,
  defaultDimensions: {
    width: m(
      OPENING_PREFABS.door_inner_standard_b77b.width,
      'verified_drawing',
      OPENING_PREFABS.door_inner_standard_b77b.source
    ),
    depth: m(0.095, 'calculated', '7 cm interior wall frame + 2.5 cm wrap'),
    height: m(
      OPENING_PREFABS.door_inner_standard_b77b.height,
      'verified_drawing',
      OPENING_PREFABS.door_inner_standard_b77b.source
    ),
  },

  build3D(ctx) {
    const group = new THREE.Group();
    const spec = OPENING_PREFABS.door_inner_standard_b77b;

    instantiateOpeningPrefab3D(
      group,
      {
        id: 'asset_viewer_standard_door',
        prefabId: 'door_inner_standard_b77b',
        label: spec.defaultLabel,
        width: ctx.width,
        height: ctx.height,
        sillHeight: spec.sillHeight,
        offsetAlongWall: 0,
        frameMaterial: spec.frameMaterial,
        panelMaterial: spec.panelMaterial,
        provenance: spec.provenance,
        source: spec.source,
      },
      0.07,
      'ground',
      ctx.getMat,
      (mesh) => mesh,
      ctx.registerInteractiveDoor
        ? (door) => {
            ctx.registerInteractiveDoor!({
              pivots: door.pivots,
              triggerMeshes: door.triggerMeshes,
            });
          }
        : undefined
    );

    return group;
  },
};
