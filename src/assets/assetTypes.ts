import * as THREE from 'three';
import { Dimension, ProvenanceType } from '../model/units';
import { MaterialId } from '../model/materials';
import { FloorLayerId } from '../model/houseData';

/**
 * Target Dimensions for an Asset in Canonical Metres.
 * Every asset builder MUST construct its geometry to fit these exact dimensions:
 * - X spans [-width/2, +width/2]
 * - Y spans [0, height] (Y = 0 rests flush on the floor slab)
 * - Z spans [-depth/2, +depth/2] (+Z is the front of the asset when rotationDeg = 0)
 */
export interface AssetDimensions {
  width: Dimension;  // X-axis size at 0° rotation
  depth: Dimension;  // Z-axis size at 0° rotation
  height: Dimension; // Y-axis vertical height from floor
}

export interface AssetBuilderContext {
  /** Exact target width (X), depth (Z), and height (Y) in metres */
  width: number;
  depth: number;
  height: number;
  /** Retrieve a shared scene material by semantic MaterialId (or create a custom diorama material) */
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial;
}

export interface AssetPrefabDefinition {
  prefabId: string;
  defaultLabel: string;
  defaultDimensions: AssetDimensions;
  /**
   * Procedural 3D builder returning a THREE.Group with origin (0, 0, 0) at bottom-center.
   */
  build3D: (ctx: AssetBuilderContext) => THREE.Group;
}

export interface PlacedAssetSpec {
  id: string;
  prefabId: string;
  label?: string;
  /** Which floor layer this object belongs to (moves with that floor during scroll!) */
  floor: FloorLayerId;
  /** World X and Z coordinates (in metres) of the asset's center point */
  positionXZ: [number, number];
  /** Optional vertical offset above the floor's finished elevation (default 0.00 m) */
  elevationOffsetY?: number;
  /** Rotation around the vertical Y axis in degrees (counter-clockwise from +Z) */
  rotationDeg?: number;
  /** Optional instance-specific dimension overrides */
  dimensionsOverride?: Partial<AssetDimensions>;
  provenance?: ProvenanceType;
  source?: string;
}
