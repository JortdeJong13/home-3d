import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  HOUSE_DIMENSIONS,
  WallSpec,
  RoomFloorSpec,
  FloorLayerId,
  getHouseWalls,
  getRoomFloors,
} from '../model/houseData';
import { MaterialId, MATERIAL_PALETTE } from '../model/materials';
import { ProvenanceType } from '../model/units';
import {
  OPENING_PREFABS,
  ResolvedOpeningInstance,
  instantiateOpeningPrefab3D,
  instantiateWhiteDoubleTurnStaircase3D,
} from './componentCatalog';
import { ASSET_PREFABS, PLACED_ASSETS } from '../assets/assetRegistry';
import { InteractiveDoorManager } from '../viewer/interactiveDoors';

export type ElementCategory = 'construction' | 'furniture' | 'site';

export interface InspectableMetadata {
  id: string;
  label: string;
  dimensionsLabel: string;
  provenance: ProvenanceType;
  source: string;
  floor: FloorLayerId;
  materialId: MaterialId;
  category: ElementCategory;
}

export type RegisterMeshFn = (
  mesh: THREE.Mesh,
  matId: MaterialId,
  meta: Omit<InspectableMetadata, 'materialId' | 'category'> & { category?: ElementCategory },
  cast?: boolean,
  receive?: boolean
) => THREE.Mesh;

export interface StaggeredAssetEntry {
  id: string;
  object: THREE.Object3D;
  floor: FloorLayerId;
  baseY: number;
  /** Deterministic pseudo-random stagger ratio in [0, 1] so items drop at slightly different moments after the floor */
  staggerRatio: number;
}

export interface HouseSceneGroups {
  root: THREE.Group;
  plotGroup: THREE.Group;
  groundGroup: THREE.Group;
  firstGroup: THREE.Group;
  secondGroup: THREE.Group;
  roofGroup: THREE.Group;
  /** Dedicated child sub-groups per floor for placed furniture/interior assets */
  furnitureGroups: Record<FloorLayerId, THREE.Group>;
  /** Individual staggered items (Oprit tiles, Tuinpoort, installations, and placed furniture) */
  staggeredAssets: StaggeredAssetEntry[];
  interiorLights: THREE.PointLight[];
  materialMap: Map<MaterialId, THREE.MeshStandardMaterial>;
  meshRegistry: Array<{
    mesh: THREE.Mesh;
    materialId: MaterialId;
    provenance: ProvenanceType;
    category: ElementCategory;
  }>;
  backdropFadeMaterial: THREE.ShaderMaterial | null;
  doorManager: InteractiveDoorManager;
}

/**
 * Deterministic hash in [0, 1] from a string ID so staggered drop timings feel organic
 * yet remain 100% repeatable when scrubbing scroll forward and backward.
 */
function deterministicStaggerRatio(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/**
 * Compute roof ceiling height (Y in world metres) at any (X, Z) on the 2nd floor (Zolder)
 * accounting for both the main cross-gable (Dwarskap) and perpendicular T-wing (Langskap),
 * so interior Zolder walls and corner knieschotten touch the exact underside of the 3D roof
 * and match the exterior gable & shared party walls at every intersection.
 */
/**
 * Analytically compute the exact 3D roof underside elevation Y at any world coordinate (x, z).
 * Derived directly from the planar geometry of the intersecting Dwarskap and Langskap roofs
 * in buildPitchedRoofSystem so all walls, knieschotten, and openings align natively to the roof
 * with zero manual guessing or clipping.
 */
export function getZolderRoofUndersideY(x: number, z = -5.23): number {
  const Y_EAVES = HOUSE_DIMENSIONS.eavesGutterHeight.metres; // +6.13 m
  const Y_RIDGE = HOUSE_DIMENSIONS.roofRidgeHeight.metres;   // +10.90 m
  const VERTICAL_THICKNESS = 0.28;

  const ridgeInnerY = Y_RIDGE - VERTICAL_THICKNESS; // +10.62 m
  const eavesInnerY = Y_EAVES;                      // +6.13 m
  const rise = ridgeInnerY - eavesInnerY;           // 4.49 m

  const ridgeX = 2.985;
  const leftEavesX = -0.18;
  const rightPartyX = 5.87;

  const ridgeZ = -5.23;
  const spanZ = 5.01; // distance from ridge Z (-5.23) to front/rear eaves (-0.22 / -10.24)

  if (x < ridgeX) {
    // Left slope of Dwarskap
    const t = Math.max(0, Math.min(1, (ridgeX - x) / (ridgeX - leftEavesX)));
    return ridgeInnerY - t * rise;
  }

  // Right side of Bouwnummer 55: analytical intersection of Dwarskap and Langskap roof planes
  // meeting along the diagonal valley lines (Kielkepers).
  const uX = Math.max(0, Math.min(1, (x - ridgeX) / (rightPartyX - ridgeX)));
  const uZ = Math.max(0, Math.min(1, Math.abs(z - ridgeZ) / spanZ));

  // Dwarskap wing covers uZ >= uX (slopes with X).
  // Langskap wing covers uZ < uX (slopes with Z).
  // At the kielkeper (uZ == uX) both planes meet continuously with zero gap.
  const u = uZ >= uX ? uX : uZ;
  return ridgeInnerY - u * rise;
}

/**
 * Create the complete, dimensionally accurate 3D house and site scene graph.
 */
export function buildHouseScene(): HouseSceneGroups {
  const root = new THREE.Group();
  root.name = 'Bouwnummer55_Root';

  const plotGroup = new THREE.Group();
  plotGroup.name = 'Layer_0_PlotAndSurroundings';

  const groundGroup = new THREE.Group();
  groundGroup.name = 'Layer_1_GroundFloor';

  const firstGroup = new THREE.Group();
  firstGroup.name = 'Layer_2_FirstFloor';

  const secondGroup = new THREE.Group();
  secondGroup.name = 'Layer_3_SecondFloor';

  const roofGroup = new THREE.Group();
  roofGroup.name = 'Layer_4_Roof';

  root.add(plotGroup, groundGroup, firstGroup, secondGroup, roofGroup);

  // Create dedicated furniture sub-groups inside each floor layer so furniture moves with its floor
  // and can also be animated independently (e.g. dropping in right after the floor construction!)
  const furnitureGroups: Record<FloorLayerId, THREE.Group> = {
    plot: new THREE.Group(),
    ground: new THREE.Group(),
    first: new THREE.Group(),
    second: new THREE.Group(),
    roof: new THREE.Group(),
  };
  furnitureGroups.plot.name = 'Furniture_Plot';
  furnitureGroups.ground.name = 'Furniture_GroundFloor';
  furnitureGroups.first.name = 'Furniture_FirstFloor';
  furnitureGroups.second.name = 'Furniture_SecondFloor';
  furnitureGroups.roof.name = 'Furniture_Roof';

  plotGroup.add(furnitureGroups.plot);
  groundGroup.add(furnitureGroups.ground);
  firstGroup.add(furnitureGroups.first);
  secondGroup.add(furnitureGroups.second);
  roofGroup.add(furnitureGroups.roof);

  // Material instances (strictly separated from geometry)
  const materialMap = new Map<MaterialId, THREE.MeshStandardMaterial>();
  for (const [id, def] of Object.entries(MATERIAL_PALETTE) as Array<[MaterialId, typeof MATERIAL_PALETTE[MaterialId]]>) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.colorDay),
      roughness: def.roughness,
      metalness: def.metalness,
      transparent: def.transparent ?? false,
      opacity: def.opacity ?? 1.0,
      polygonOffset: true,
      polygonOffsetFactor: id.includes('floor') ? -1 : 0,
      polygonOffsetUnits: id.includes('floor') ? -1 : 0,
    });
    mat.name = id;
    materialMap.set(id, mat);
  }

  const meshRegistry: HouseSceneGroups['meshRegistry'] = [];
  const staggeredAssets: StaggeredAssetEntry[] = [];
  const interiorLights: THREE.PointLight[] = [];
  const doorManager = new InteractiveDoorManager();

  const registerStaggered = (id: string, object: THREE.Object3D, floor: FloorLayerId, baseY: number) => {
    staggeredAssets.push({
      id,
      object,
      floor,
      baseY,
      staggerRatio: deterministicStaggerRatio(id),
    });
  };

  const registerMesh = (
    mesh: THREE.Mesh,
    materialId: MaterialId,
    meta: Omit<InspectableMetadata, 'materialId' | 'category'> & { category?: ElementCategory },
    castShadow = true,
    receiveShadow = true
  ) => {
    const category: ElementCategory =
      meta.category ?? (meta.floor === 'plot' ? 'site' : 'construction');
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.userData = {
      ...meta,
      materialId,
      category,
    } satisfies InspectableMetadata;
    meshRegistry.push({ mesh, materialId, provenance: meta.provenance, category });
    return mesh;
  };

  const getMat = (id: MaterialId) => materialMap.get(id)!;

  // ===========================================================================
  // 1. STATIONARY PLOT, GARDEN & SURROUNDING ENVIRONMENT (plotGroup)
  //    (Tuinpoort and square driveway tiles are placed into groundGroup with staggered drop!)
  // ===========================================================================
  buildPlotAndEnvironment(
    plotGroup,
    groundGroup,
    getMat,
    registerMesh,
    registerStaggered,
    doorManager
  );

  // ===========================================================================
  // 2. ROOM FLOOR SLABS (Ground, 1st, 2nd Floors)
  // ===========================================================================
  const roomFloors = getRoomFloors();
  for (const room of roomFloors) {
    const targetGroup =
      room.floor === 'ground'
        ? groundGroup
        : room.floor === 'first'
        ? firstGroup
        : secondGroup;

    buildRoomSlab(room, targetGroup, getMat, registerMesh);
  }

  // Structural Slab Collars (25 cm structural slabs at Y=0.00m, Y=2.85m, Y=5.70m)
  buildStructuralSlabCollars(groundGroup, firstGroup, secondGroup, getMat, registerMesh);

  // ===========================================================================
  // 3. ARCHITECTURAL WALLS & REUSABLE PREFAB OPENINGS
  // ===========================================================================
  const walls = getHouseWalls();
  for (const wall of walls) {
    const targetGroup =
      wall.floor === 'ground'
        ? groundGroup
        : wall.floor === 'first'
        ? firstGroup
        : secondGroup;

    buildWallWithOpenings(wall, targetGroup, getMat, registerMesh, doorManager);
  }

  // ===========================================================================
  // 4. STAIRCASES (White Double 90°-Turn Staircases: Ground -> 1st & 1st -> 2nd)
  // ===========================================================================
  const stairGfGroup = instantiateWhiteDoubleTurnStaircase3D(
    groundGroup,
    getMat,
    registerMesh,
    'stair_gf_to_ff',
    'Witte Dubbele Kwartslagtrap Begane Grond naar 1e Verdieping (B61.1)',
    'ground',
    0.40,
    -3.96,
    0.00,
    HOUSE_DIMENSIONS.firstFloorElevation.metres
  );

  const stairFfGroup = instantiateWhiteDoubleTurnStaircase3D(
    firstGroup,
    getMat,
    registerMesh,
    'stair_ff_to_sf',
    'Witte Dubbele Kwartslagtrap 1e Verdieping naar Zolder',
    'first',
    0.40,
    -3.96,
    HOUSE_DIMENSIONS.firstFloorElevation.metres,
    HOUSE_DIMENSIONS.secondFloorElevation.metres
  );

  // Staircases are secondary assets: they drop in separately, right behind their floor.
  registerStaggered('stair_gf_to_ff', stairGfGroup, 'ground', 0);
  registerStaggered('stair_ff_to_sf', stairFfGroup, 'first', 0);

  // ===========================================================================
  // 5. ZOLDER TECHNICAL INSTALLATIONS (WP, WTW)
  // ===========================================================================
  buildZolderDetails(secondGroup, getMat, registerMesh, registerStaggered);

  // ===========================================================================
  // 6. FLAT ROOFS OF EXTENSION (B11a) & BERGING -> PART OF 1e VERDIEPING (firstGroup)!
  //    So when inspecting 1 · Begane Grond, the entire ground floor & berging are open!
  // ===========================================================================
  buildExtensionAndBergingFlatRoofs(firstGroup, getMat, registerMesh);

  // ===========================================================================
  // 7. PITCHED INTERSECTING ROOF (Dwarskap bnr. 55 + Langskap Context bnr. 56)
  // ===========================================================================
  buildPitchedRoofSystem(roofGroup, getMat, registerMesh);

  // ===========================================================================
  // 8. PLACED 3D ASSETS (Furniture, Kitchen, Garden Objects from assetRegistry.ts)
  // ===========================================================================
  buildPlacedAssets(furnitureGroups, getMat, registerMesh, registerStaggered, doorManager);

  // ===========================================================================
  // 9. WARM INTERIOR LIGHTS (For Night Mode)
  // ===========================================================================
  const lightPositions: Array<{ pos: [number, number, number]; group: THREE.Group; intensity: number }> = [
    { pos: [2.98, 2.30, -2.10], group: groundGroup, intensity: 4.5 },  // Woonkamer front
    { pos: [2.98, 2.30, -9.80], group: groundGroup, intensity: 5.0 },  // Woonkeuken / Eetkamer
    { pos: [1.65, 2.30, -5.15], group: groundGroup, intensity: 2.5 },  // Hal
    { pos: [2.98, 5.15, -2.10], group: firstGroup, intensity: 4.0 },   // Slaapkamer 2 front
    { pos: [4.00, 5.15, -8.20], group: firstGroup, intensity: 4.0 },   // Kantoor / Slaapkamer 1 rear
    { pos: [1.40, 5.15, -8.20], group: firstGroup, intensity: 2.8 },   // Badkamer
    { pos: [3.25, 8.10, -5.00], group: secondGroup, intensity: 3.5 },  // Zolder
  ];

  for (const lp of lightPositions) {
    const pt = new THREE.PointLight('#ffbe73', 0, 9.5, 1.6);
    pt.position.set(lp.pos[0], lp.pos[1], lp.pos[2]);
    pt.userData = { maxNightIntensity: lp.intensity };
    lp.group.add(pt);
    interiorLights.push(pt);
  }

  return {
    root,
    plotGroup,
    groundGroup,
    firstGroup,
    secondGroup,
    roofGroup,
    furnitureGroups,
    staggeredAssets,
    interiorLights,
    materialMap,
    meshRegistry,
    backdropFadeMaterial: null,
    doorManager,
  };
}

/**
 * Build the stationary plot, garden, driveway, neighbouring context ground,
 * and soft outer diffusion plinth.
 */
function buildPlotAndEnvironment(
  plotGroup: THREE.Group,
  groundGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  registerStaggered: (id: string, object: THREE.Object3D, floor: FloorLayerId, baseY: number) => void,
  doorManager?: InteractiveDoorManager
): void {
  // Trapezoidal Owned Plot (User Supplied Measurements):
  // - Right boundary (inline with shared wall): straight at X = +5.87 m
  // - Rear boundary (777 cm behind -12.86 m extended house): Z = -20.63 m, width = 10.15 m (X: -4.28 to +5.87 m)
  // - Front boundary (500 cm in front of 0.00 m front wall): Z = +5.00 m, width = 10.87 m (X: -5.00 to +5.87 m)
  // - Left boundary: straight slanted line from (-4.28, -20.63) to (-5.00, +5.00)
  const rightX = 5.87;
  const rearZ = -20.63;
  const frontZ = 5.00;
  const rearLeftX = rightX - 10.15;  // -4.28 m
  const frontLeftX = rightX - 10.87; // -5.00 m
  const totalDepthZ = frontZ - rearZ; // 25.63 m

  const leftBoundaryXAtZ = (z: number) => {
    const t = (z - rearZ) / totalDepthZ;
    return rearLeftX + t * (frontLeftX - rearLeftX);
  };

  // 2. Trapezoidal Architectural Diorama Plinth under Owned Plot
  // Shape in (X, -Z) so ExtrudeGeometry rotated by -PI/2 around X maps cleanly to world (X, Y, Z)
  const plinthShape = new THREE.Shape();
  plinthShape.moveTo(rearLeftX, -rearZ);
  plinthShape.lineTo(rightX, -rearZ);
  plinthShape.lineTo(rightX, -frontZ);
  plinthShape.lineTo(frontLeftX, -frontZ);
  plinthShape.closePath();

  const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
    depth: 0.24,
    bevelEnabled: false,
  });
  plinthGeo.rotateX(-Math.PI / 2);
  const plinthMesh = new THREE.Mesh(plinthGeo, getMat('plinth_base_white'));
  plinthMesh.position.y = -0.26;
  registerMesh(plinthMesh, 'plinth_base_white', {
    id: 'plot_plinth_owned',
    label: 'Kavel Bouwnummer 55 (Achter 10.15 m, Voor 10.87 m, Diepte 25.63 m)',
    dimensionsLabel: '10.15–10.87 × 25.63 m',
    provenance: 'user_supplied',
    source: 'User plot plan: 1015 cm top, 1087 cm bottom, 777 cm back garden, 500 cm front garden',
    floor: 'plot',
  });
  plotGroup.add(plinthMesh);

  // Surrounding context ground in neutral grey: a ring around the owned plot.
  // Right side (bnr. 56): 2.18 m strip + 2.00 m extra = 4.18 m; same width on the front, rear and left sides.
  const CONTEXT_MARGIN = 4.18;
  const ctx = new THREE.Shape();
  // Outer boundary is a true rectangle (90 degree corners), even though the owned plot is a trapezoid.
  const outerLeftX = Math.min(rearLeftX, frontLeftX) - CONTEXT_MARGIN;
  ctx.moveTo(outerLeftX, -(rearZ - CONTEXT_MARGIN));
  ctx.lineTo(rightX + CONTEXT_MARGIN, -(rearZ - CONTEXT_MARGIN));
  ctx.lineTo(rightX + CONTEXT_MARGIN, -(frontZ + CONTEXT_MARGIN));
  ctx.lineTo(outerLeftX, -(frontZ + CONTEXT_MARGIN));
  ctx.closePath();
  const ctxHole = new THREE.Path();
  ctxHole.moveTo(rearLeftX, -rearZ);
  ctxHole.lineTo(rightX, -rearZ);
  ctxHole.lineTo(rightX, -frontZ);
  ctxHole.lineTo(frontLeftX, -frontZ);
  ctxHole.closePath();
  ctx.holes.push(ctxHole);

  const ctxGeo = new THREE.ExtrudeGeometry(ctx, { depth: 0.22, bevelEnabled: false });
  ctxGeo.rotateX(-Math.PI / 2);
  const ctxMesh = new THREE.Mesh(ctxGeo, getMat('neighbour_ground_grey'));
  ctxMesh.position.y = -0.26;
  registerMesh(ctxMesh, 'neighbour_ground_grey', {
    id: 'plot_plinth_neighbour',
    label: 'Omgeving buiten kavel (neutraal grijs, 4.18 m rondom, rechthoekig)',
    dimensionsLabel: `${CONTEXT_MARGIN.toFixed(2)} m rondom de kavel`,
    provenance: 'assumed',
    source: 'Context beyond the owned plot in neutral grey (neighbour strip 2.18 m + 2.00 m extension, all sides)',
    floor: 'plot',
  });
  plotGroup.add(ctxMesh);

  // 3. Trapezoidal Grass Lawn covering the Owned Plot (inset 3 cm from plinth edge)
  const lawnShape = new THREE.Shape();
  lawnShape.moveTo(rearLeftX + 0.03, -(rearZ + 0.03));
  lawnShape.lineTo(rightX - 0.02, -(rearZ + 0.03));
  lawnShape.lineTo(rightX - 0.02, -(frontZ - 0.03));
  lawnShape.lineTo(frontLeftX + 0.03, -(frontZ - 0.03));
  lawnShape.closePath();

  const lawnGeo = new THREE.ExtrudeGeometry(lawnShape, {
    depth: 0.04,
    bevelEnabled: false,
  });
  lawnGeo.rotateX(-Math.PI / 2);
  const lawnMesh = new THREE.Mesh(lawnGeo, getMat('plot_grass_lawn'));
  lawnMesh.position.y = -0.04;
  registerMesh(
    lawnMesh,
    'plot_grass_lawn',
    {
      id: 'garden_trapezoidal_lawn',
      label: 'Kavel Gazon (Achtertuin 7.77 × 10.15 m · Voortuin 5.00 × 10.87 m)',
      dimensionsLabel: '10.15–10.87 × 25.63 m',
      provenance: 'user_supplied',
      source: 'User plot plan (1015 cm top, 1087 cm bottom, 777 cm back, 500 cm front)',
      floor: 'plot',
    },
    false,
    true
  );
  plotGroup.add(lawnMesh);

  const addGroundZone = (
    id: string,
    label: string,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    height: number,
    yTop: number,
    matId: MaterialId,
    prov: ProvenanceType,
    source: string
  ) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const geo = new THREE.BoxGeometry(w, height, d);
    const mesh = new THREE.Mesh(geo, getMat(matId));
    mesh.position.set((minX + maxX) / 2, yTop - height / 2, (minZ + maxZ) / 2);
    registerMesh(
      mesh,
      matId,
      {
        id,
        label,
        dimensionsLabel: `${w.toFixed(2)} × ${d.toFixed(2)} m`,
        provenance: prov,
        source,
        floor: 'plot',
      },
      false,
      true
    );
    plotGroup.add(mesh);
  };

  // Driveway & Berging Perimeter Crushed Gravel Bed ("Oprit & Pad Grindbed") in the Kavel layer
  const gravelMat = getMat('plot_driveway_gravel');
  if (typeof document !== 'undefined' && !gravelMat.map) {
    const { map, bumpMap } = createGravelTextures(1.15, 1.15);
    gravelMat.map = map;
    gravelMat.bumpMap = bumpMap;
    gravelMat.bumpScale = 0.025;
    gravelMat.needsUpdate = true;
  }

  const gravelRearZ = -14.70;
  const gravelCurveEndZ = -7.10;
  const gravelCurveEndX = leftBoundaryXAtZ(gravelCurveEndZ) + 0.32;
  const gravelShape = new THREE.Shape();
  gravelShape.moveTo(0.00, -frontZ);
  gravelShape.lineTo(-3.45, -frontZ);
  gravelShape.lineTo(-3.45, 5.80);
  gravelShape.bezierCurveTo(
    -3.45, 6.45,
    gravelCurveEndX, 6.45,
    gravelCurveEndX, -gravelCurveEndZ
  );
  gravelShape.lineTo(leftBoundaryXAtZ(gravelRearZ) + 0.32, -gravelRearZ);
  gravelShape.lineTo(0.33, -gravelRearZ);
  gravelShape.lineTo(0.33, 12.86);
  gravelShape.lineTo(0.00, 12.86);
  // Trace around the Berging footprint (X: -3.27..0.00, Z: -7.73..-13.72) so gravel never clips inside it
  gravelShape.lineTo(0.00, 13.72);
  gravelShape.lineTo(-3.27, 13.72);
  gravelShape.lineTo(-3.27, 7.73);
  gravelShape.lineTo(0.00, 7.73);
  // Branch across the front garden between the flower border (Z: 0..1.05 m) and lawn (Z: 1.95..4.82 m)
  // Tuck slightly under the 0.20 m rounded corner of the soil bed at (0.00, 1.05) so gravel shows cleanly
  gravelShape.lineTo(0.00, -0.83);
  gravelShape.lineTo(0.22, -0.83);
  gravelShape.lineTo(0.22, -1.05);
  gravelShape.lineTo(5.85, -1.05);
  gravelShape.lineTo(5.85, -1.95);
  gravelShape.lineTo(0.20, -1.95);
  gravelShape.quadraticCurveTo(0.00, -1.95, 0.00, -2.15);
  gravelShape.closePath();

  const gravelGeo = new THREE.ExtrudeGeometry(gravelShape, {
    depth: 0.048,
    bevelEnabled: false,
  });
  gravelGeo.rotateX(-Math.PI / 2);
  const gravelMesh = new THREE.Mesh(gravelGeo, gravelMat);
  gravelMesh.position.y = -0.04;
  registerMesh(
    gravelMesh,
    'plot_driveway_gravel',
    {
      id: 'driveway_gravel_bed',
      label: 'Oprit & Pad Grindbed (rondom Berging naar Terras)',
      dimensionsLabel: '3.45 m oprit + 0.98 m pad',
      provenance: 'user_supplied',
      source: 'Reference photo & Garden layout: crushed grey gravel bed under oprit, through garden gate, and behind berging',
      floor: 'plot',
    },
    false,
    true
  );
  plotGroup.add(gravelMesh);

  // Stone Patio directly behind Kitchen Double Doors B13: 14 individual tiles (staggered secondary assets).
  // Area 5.39 x 0.94 m = 7 tiles of 77 cm (X: 0.33 -> 5.72 m) x 2 tiles of 47 cm (Z: -12.86 -> -13.80 m).
  const PATIO_TILE_X = 0.77;
  const PATIO_TILE_Z = 0.47;
  const PATIO_JOINT = 0.015;
  const PATIO_X0 = 0.33;
  const PATIO_Z0 = -12.86;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 7; col++) {
      const id = `patio_tile_${row}_${col}`;
      const tileGeo = new THREE.BoxGeometry(PATIO_TILE_X - PATIO_JOINT, 0.045, PATIO_TILE_Z - PATIO_JOINT);
      const tile = new THREE.Mesh(tileGeo, getMat('plot_patio_limestone'));
      tile.position.set(
        PATIO_X0 + (col + 0.5) * PATIO_TILE_X,
        0.01,
        PATIO_Z0 - (row + 0.5) * PATIO_TILE_Z
      );
      registerMesh(
        tile,
        'plot_patio_limestone',
        {
          id,
          label: 'Terrastegel achter Dubbele Tuindeuren (77 × 47 cm)',
          dimensionsLabel: '0.77 × 0.47 m',
          provenance: 'user_supplied',
          source: 'Garden layout.png & User: terras 539 × 94 cm = 7 × 77 cm bij 2 × 47 cm',
          floor: 'ground',
          category: 'furniture',
        },
        false,
        true
      );
      groundGroup.add(tile);
      registerStaggered(id, tile, 'ground', 0.01);
    }
  }

  // Garden Gate ("Tuinpoort" at Z = -13.72 m between Berging X = -3.27 m and Left Hedge) -> Staggered drop on Ground Floor!
  const gateLeftX = leftBoundaryXAtZ(-13.72) + 0.32;
  const gateW = Math.abs(-3.27 - gateLeftX);
  const gateH = 1.90;

  const gatePivot = new THREE.Group();
  gatePivot.position.set(gateLeftX, gateH / 2, -13.72);

  // Simple Dutch wooden-plank garden door ("Tuindeur" with vertical planks, backing ledges, diagonal brace & hardware)
  const plankCount = Math.max(6, Math.round(gateW / 0.13));
  const plankPitch = gateW / plankCount;
  const plankW = plankPitch - 0.006;
  const plankH = gateH;
  const plankD = 0.024;

  const plankGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < plankCount; i++) {
    const pGeo = new THREE.BoxGeometry(plankW, plankH, plankD);
    pGeo.translate((i + 0.5) * plankPitch, 0, plankD / 2);
    plankGeos.push(pGeo);
  }
  const gateGeo = mergeGeometries(plankGeos, false);
  const gateMesh = new THREE.Mesh(gateGeo, getMat('plot_gate_timber'));
  gatePivot.add(gateMesh);

  // Two horizontal backing ledges ("klampen") + diagonal brace ("schoor") on the garden side (-Z)
  const frameGeos: THREE.BufferGeometry[] = [];
  const ledgeH = 0.085;
  const ledgeD = 0.024;
  const ledgeZ = -ledgeD / 2;
  const ledgeY = 0.64;
  for (const ly of [ledgeY, -ledgeY]) {
    const ledge = new THREE.BoxGeometry(gateW - 0.04, ledgeH, ledgeD);
    ledge.translate(gateW / 2, ly, ledgeZ);
    frameGeos.push(ledge);
  }
  // Diagonal brace from bottom hinge side (hedge) to top latch side (berging)
  const braceDx = gateW - 0.12;
  const braceDy = ledgeY * 2 - ledgeH;
  const braceLen = Math.hypot(braceDx, braceDy);
  const braceAngle = Math.atan2(braceDy, braceDx);
  const braceGeo = new THREE.BoxGeometry(braceLen, 0.07, ledgeD);
  braceGeo.rotateZ(braceAngle);
  braceGeo.translate(gateW / 2, 0, ledgeZ);
  frameGeos.push(braceGeo);

  const gateFrameMesh = new THREE.Mesh(mergeGeometries(frameGeos, false), getMat('plot_fence_post'));
  gateFrameMesh.castShadow = true;
  gateFrameMesh.receiveShadow = true;
  gatePivot.add(gateFrameMesh);

  // Dark metal strap hinges ("hengsels") near the hedge and simple latch ("klink") near the berging
  const hardwareGeos: THREE.BufferGeometry[] = [];
  for (const hy of [ledgeY, -ledgeY]) {
    const strap = new THREE.BoxGeometry(0.32, 0.032, 0.008);
    strap.translate(0.17, hy, -ledgeD - 0.004);
    hardwareGeos.push(strap);
  }
  const latchPlate = new THREE.BoxGeometry(0.035, 0.12, 0.01);
  latchPlate.translate(gateW - 0.07, 0.06, plankD + 0.005);
  hardwareGeos.push(latchPlate);
  const latchHandleFront = new THREE.BoxGeometry(0.09, 0.022, 0.032);
  latchHandleFront.translate(gateW - 0.10, 0.06, plankD + 0.02);
  hardwareGeos.push(latchHandleFront);
  const latchHandleBack = new THREE.BoxGeometry(0.09, 0.022, 0.032);
  latchHandleBack.translate(gateW - 0.10, 0.06, -0.02);
  hardwareGeos.push(latchHandleBack);

  const gateHardwareMesh = new THREE.Mesh(mergeGeometries(hardwareGeos, false), getMat('roof_tile_anthracite'));
  gateHardwareMesh.castShadow = true;
  gatePivot.add(gateHardwareMesh);

  registerMesh(gateMesh, 'plot_gate_timber', {
    id: 'garden_gate',
    label: `Tuinpoort naast Berging (${gateW.toFixed(2)} × ${gateH.toFixed(2)} m)`,
    dimensionsLabel: `${gateW.toFixed(2)} × ${gateH.toFixed(2)} m`,
    provenance: 'user_supplied',
    source: 'Garden layout.png "Garden gate" (Onderdeel van Begane Grond opbouw)',
    floor: 'ground',
    category: 'furniture',
  });

  const gateTrigger = new THREE.Mesh(
    new THREE.BoxGeometry(gateW + 0.15, gateH + 0.10, 0.45),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  gateTrigger.position.set(gateW / 2, 0, 0);
  gatePivot.add(gateTrigger);

  if (doorManager) {
    doorManager.register({
      id: 'garden_gate',
      label: `Tuinpoort naast Berging (${gateW.toFixed(2)} × ${gateH.toFixed(2)} m)`,
      floor: 'ground',
      pivots: [
        {
          group: gatePivot,
          openAngle: Math.PI * 0.45,
          closedAngle: 0,
          currentAngle: 0,
        },
      ],
      triggerMeshes: [gateTrigger, gateMesh],
      isHovered: false,
      isPinned: false,
    });
  }

  groundGroup.add(gatePivot);
  registerStaggered('garden_gate', gatePivot, 'ground', gateH / 2);

  // Square Driveway Paver Tiles ("Oprit tegels") -> Staggered drop on Ground Floor!
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 2; col++) {
      const id = `driveway_paver_${row}_${col}`;
      const padGeo = new THREE.BoxGeometry(1.30, 0.045, 1.35);
      const pad = new THREE.Mesh(padGeo, getMat('plot_driveway_paver'));
      pad.position.set(-2.45 + col * 1.55, 0.01, -6.30 + row * 1.65);
      registerMesh(
        pad,
        'plot_driveway_paver',
        {
          id,
          label: 'Oprit Tegels (1.30 × 1.35 m)',
          dimensionsLabel: '1.30 × 1.35 m',
          provenance: 'verified_drawing',
          source: 'Woning.jpg & VK-06 situatie (Onderdeel van Begane Grond opbouw)',
          floor: 'ground',
          category: 'furniture',
        },
        false,
        true
      );
      groundGroup.add(pad);
      registerStaggered(id, pad, 'ground', 0.01);
    }
  }

  // 4. STYLISED ARCHITECTURAL MAQUETTE HEDGES ALONG LEFT & FRONT BOUNDARIES
  // Left boundary splits at the Garden Gate ("Tuinpoort", Z = -13.72 m):
  // - Front/side section (Z: +4.92 -> -13.72 m): 90 cm (0.90 m) tall
  // - Rear/garden section (Z: -13.72 -> -20.55 m): 210 cm (2.10 m) tall
  const gateZ = -13.72;
  const gateBoundaryX = leftBoundaryXAtZ(gateZ) + 0.18;

  buildMaquetteHedgeSegment(plotGroup, getMat, registerMesh, {
    id: 'hedge_left_front_beech',
    label: 'Beukenhaag Links Voorzijde (tot Tuinpoort · 90 cm hoog)',
    matId: 'plot_hedge_beech',
    soilMatId: 'plot_soil_border',
    x0: frontLeftX + 0.18,
    z0: frontZ - 0.08,
    x1: gateBoundaryX,
    z1: gateZ,
    width: 0.34,
    height: 0.90,
    seed: 101,
    provenance: 'user_supplied',
    source: 'User specification: 90 cm side hedge up to garden door next to garage',
  });

  buildMaquetteHedgeSegment(plotGroup, getMat, registerMesh, {
    id: 'hedge_left_rear_beech',
    label: 'Beukenhaag Links Achtertuin (vanaf Tuinpoort · 2.10 m hoog)',
    matId: 'plot_hedge_beech',
    soilMatId: 'plot_soil_border',
    x0: gateBoundaryX,
    z0: gateZ,
    x1: rearLeftX + 0.18,
    z1: rearZ + 0.08,
    width: 0.40,
    height: 2.10,
    seed: 202,
    provenance: 'user_supplied',
    source: 'User specification: 2.10 m hedge from garden door to the back',
  });

  // Front street low hedge on right half of front boundary (X: 0.40 -> +5.85 m at Z = +4.82 m, 75 cm tall)
  buildMaquetteHedgeSegment(plotGroup, getMat, registerMesh, {
    id: 'hedge_front_beech',
    label: 'Beukenhaag Voorzijde (75 cm hoog)',
    matId: 'plot_hedge_beech',
    soilMatId: 'plot_soil_border',
    x0: 0.40,
    z0: frontZ - 0.18,
    x1: 5.85,
    z1: frontZ - 0.18,
    width: 0.34,
    height: 0.75,
    seed: 303,
    provenance: 'user_supplied',
    source: 'User specification: 75 cm front hedge',
  });

  // Neighbour front street low hedge (neutral grey, 75 cm tall)
  buildMaquetteHedgeSegment(plotGroup, getMat, registerMesh, {
    id: 'hedge_front_neighbour',
    label: 'Haag Voorzijde Buurkavel (75 cm hoog)',
    matId: 'neighbour_hedge_grey',
    x0: 5.87,
    z0: frontZ - 0.18,
    x1: 10.02,
    z1: frontZ - 0.18,
    width: 0.34,
    height: 0.75,
    seed: 404,
    provenance: 'assumed',
    source: 'Neighbour context matching 75 cm front hedge',
  });

  // 5. SOFT ARCHITECTURAL DIORAMA TREES (Matching positions in user's plot screenshot & front photo)
  // Two trees in back garden + two young standard trees ("Bolbomen" with twin wooden stakes) flanking the front living room window
  addStylisedDioramaTree(plotGroup, getMat, -1.65, -16.85, 3.6, 1.65, 'plot_tree_foliage_sage', 'plot_tree_trunk', 20);
  addStylisedDioramaTree(plotGroup, getMat, 3.15, -16.10, 3.1, 1.40, 'plot_tree_foliage_sage', 'plot_tree_trunk', 145);
  addFrontBolboomTree(plotGroup, getMat, registerMesh, {
    id: 'front_bolboom_left',
    label: 'Bolboom Voortuin Links (met boompalen)',
    x: 1.55,
    z: 3.55,
    totalHeight: 2.22,
    crownRadius: 0.44,
    rotationDeg: 18,
    seed: 501,
  });
  addFrontBolboomTree(plotGroup, getMat, registerMesh, {
    id: 'front_bolboom_right',
    label: 'Bolboom Voortuin Rechts (met boompalen)',
    x: 4.35,
    z: 3.60,
    totalHeight: 2.26,
    crownRadius: 0.42,
    rotationDeg: -14,
    seed: 502,
  });

  // Front garden planted flower & ornamental grass border against the house front wall (Z: 0.00 -> 1.05 m)
  buildFrontGardenFlowerBorder(plotGroup, getMat, registerMesh);

  // 6. SURROUNDINGS (outside the owned plot, neutral grey): pavement strip & garden fences (schuttingen)
  const ctxRightX = rightX + CONTEXT_MARGIN;
  const ctxLeftX = Math.min(rearLeftX, frontLeftX) - CONTEXT_MARGIN;
  const addCtxBox = (
    id: string,
    label: string,
    matId: MaterialId,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), getMat(matId));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    registerMesh(mesh, matId, {
      id,
      label,
      dimensionsLabel: `${(x1 - x0).toFixed(2)} × ${(z1 - z0).toFixed(2)} m`,
      provenance: 'assumed',
      source: 'Surroundings in neutral grey (reference photos: pavement and hedges along the street)',
      floor: 'plot',
    }, false, true);
    plotGroup.add(mesh);
  };

  // Pavement (1.80 m) + kerb along the street side
  addCtxBox('ctx_pavement', 'Trottoir langs straat (1.80 m)', 'neighbour_pavement_grey',
    ctxLeftX, ctxRightX, frontZ, frontZ + 1.8, -0.04, 0.0);
  addCtxBox('ctx_kerb', 'Stoeprand', 'neighbour_kerb_grey',
    ctxLeftX, ctxRightX, frontZ + 1.8, frontZ + 1.95, -0.04, 0.03);

  // Timber & concrete garden fences ("Schutting") at rear boundary and right boundary with neighbours
  buildSchuttingSegment(plotGroup, getMat, registerMesh, {
    id: 'schutting_rear_plot',
    label: 'Schutting Achterzijde Kavel (2.00 m hoog)',
    panelMatId: 'plot_gate_timber',
    postMatId: 'plot_fence_post',
    x0: rearLeftX + 0.18,
    z0: rearZ + 0.08,
    x1: rightX - 0.05,
    z1: rearZ + 0.08,
    height: 2.00,
    provenance: 'user_supplied',
    source: 'User specification: schutting at back of garden',
  });

  buildSchuttingSegment(plotGroup, getMat, registerMesh, {
    id: 'schutting_right_plot',
    label: 'Schutting Rechter Kavelgrens met Buren (2.00 m hoog)',
    panelMatId: 'plot_gate_timber',
    postMatId: 'plot_fence_post',
    x0: rightX - 0.05,
    z0: rearZ + 0.08,
    x1: rightX - 0.05,
    z1: -12.86,
    height: 2.00,
    provenance: 'user_supplied',
    source: 'User specification: schutting on backgarden side with neighbors',
  });

  buildSchuttingSegment(plotGroup, getMat, registerMesh, {
    id: 'schutting_rear_neighbour',
    label: 'Schutting Achterzijde Buurkavel (2.00 m hoog)',
    panelMatId: 'neighbour_wall_grey',
    postMatId: 'neighbour_roof_grey',
    x0: rightX,
    z0: rearZ + 0.08,
    x1: ctxRightX - 0.3,
    z1: rearZ + 0.08,
    height: 2.00,
    provenance: 'assumed',
    source: 'Neighbour rear boundary schutting in neutral grey',
  });

  // Context trees: part of the base plot layer (stationary environment)
  addStylisedDioramaTree(plotGroup, getMat, ctxLeftX + 1.9, frontZ + 0.95, 4.6, 1.5, 'neighbour_tree_grey', 'neighbour_trunk_grey', 60);
}

/**
 * Generate a seamless procedural crushed-gravel ("grind") diffuse + bump texture pair.
 * Neutral greyscale values allow the material's Day/Night color to tint it cleanly.
 */
function createGravelTextures(repeatX: number, repeatZ: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  // Base mortar / fine crushed stone bed
  cCtx.fillStyle = '#c8c8c8';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#707070';
  bCtx.fillRect(0, 0, size, size);

  // Deterministic pseudo-random generator for reproducible gravel grain
  let seed = 5517;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 3400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 1.4 + rand() * 2.4;
    const ry = 1.2 + rand() * 2.0;
    const rot = rand() * Math.PI;
    const tone = Math.floor(115 + rand() * 125); // dark charcoal to light grey stone
    const bump = Math.floor(110 + rand() * 145);

    // Draw wrapped across tile edges for seamless tiling
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -6 || px > size + 6 || py < -6 || py > size + 6) continue;

        cCtx.save();
        cCtx.translate(px, py);
        cCtx.rotate(rot);
        cCtx.fillStyle = `rgb(${tone},${tone},${tone})`;
        cCtx.fillRect(-rx / 2, -ry / 2, rx, ry);
        cCtx.restore();

        bCtx.save();
        bCtx.translate(px, py);
        bCtx.rotate(rot);
        bCtx.fillStyle = `rgb(${bump},${bump},${bump})`;
        bCtx.fillRect(-rx / 2, -ry / 2, rx, ry);
        bCtx.restore();
      }
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatZ);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeatX, repeatZ);

  return { map, bumpMap };
}

function addStylisedDioramaTree(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  x: number,
  z: number,
  height: number,
  crownRadius: number,
  foliageMat: MaterialId,
  trunkMat: MaterialId = 'plot_tree_trunk',
  rotationDeg = 0
): THREE.Group {
  const treeGroup = new THREE.Group();
  treeGroup.position.set(x, 0, z);
  treeGroup.rotation.y = THREE.MathUtils.degToRad(rotationDeg);

  const trunkH = height * 0.48;
  const trunkGeo = new THREE.CylinderGeometry(0.07, 0.11, trunkH, 10);
  const trunk = new THREE.Mesh(trunkGeo, getMat(trunkMat));
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  treeGroup.add(trunk);

  const puffs: Array<[number, number, number, number]> = [
    [0, height * 0.68, 0, crownRadius * 0.78],
    [-crownRadius * 0.38, height * 0.60, crownRadius * 0.25, crownRadius * 0.58],
    [crownRadius * 0.40, height * 0.62, -crownRadius * 0.20, crownRadius * 0.56],
    [0.1, height * 0.84, 0.1, crownRadius * 0.54],
    [-crownRadius * 0.22, height * 0.64, -crownRadius * 0.35, crownRadius * 0.52],
  ];

  for (const [px, py, pz, pr] of puffs) {
    const puffGeo = new THREE.IcosahedronGeometry(pr, 2);
    puffGeo.scale(1.0, 0.82, 1.0);
    const puff = new THREE.Mesh(puffGeo, getMat(foliageMat));
    puff.position.set(px, py, pz);
    puff.castShadow = true;
    puff.receiveShadow = true;
    treeGroup.add(puff);
  }

  group.add(treeGroup);
  return treeGroup;
}

interface FrontBolboomTreeOptions {
  id: string;
  label: string;
  x: number;
  z: number;
  totalHeight: number;
  crownRadius: number;
  rotationDeg: number;
  seed: number;
}

/**
 * Build a young standard ball-crown tree ("Bolboom") with a slender straight trunk,
 * compact ovoid leafy crown made of overlapping maquette foliage clusters, and twin
 * weathered wooden stakes ("boompalen") connected by a horizontal tie strap ("boomband").
 */
function addFrontBolboomTree(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  opts: FrontBolboomTreeOptions
): THREE.Group {
  const { id, label, x, z, totalHeight, crownRadius, rotationDeg, seed } = opts;
  const treeGroup = new THREE.Group();
  treeGroup.position.set(x, 0, z);
  treeGroup.rotation.y = THREE.MathUtils.degToRad(rotationDeg);

  // Deterministic LCG PRNG for organic cluster placement
  let s = (seed * 1664525 + 1013904223) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Crown vertical span: slightly taller-than-wide ovoid sitting atop ~1.95 m clear trunk
  const crownHeight = crownRadius * 2.28;
  const crownCenterY = totalHeight - crownHeight * 0.5;
  const trunkTopY = crownCenterY + crownHeight * 0.12;

  // 1. Slender straight trunk
  const trunkGeo = new THREE.CylinderGeometry(0.026, 0.036, trunkTopY, 10);
  const trunk = new THREE.Mesh(trunkGeo, getMat('plot_tree_trunk'));
  trunk.position.y = trunkTopY / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  treeGroup.add(trunk);

  // 2. Twin wooden stakes ("boompalen") flanking the trunk + horizontal tie strap ("boomband")
  const stakeOffset = 0.21;
  const stakeHeight = 0.88;
  const stakeTiltRad = THREE.MathUtils.degToRad(1.5);
  const stakeGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const stake = new THREE.CylinderGeometry(0.025, 0.028, stakeHeight, 8);
    stake.rotateZ(side * stakeTiltRad);
    stake.translate(side * stakeOffset, stakeHeight / 2, 0);
    stakeGeos.push(stake);
  }
  const stakesMesh = new THREE.Mesh(mergeGeometries(stakeGeos, false), getMat('plot_tree_stake_wood'));
  stakesMesh.castShadow = true;
  stakesMesh.receiveShadow = true;
  treeGroup.add(stakesMesh);

  const strapY = 0.76;
  const strapGeos: THREE.BufferGeometry[] = [];
  const crossStrap = new THREE.BoxGeometry(stakeOffset * 2 + 0.055, 0.042, 0.024).toNonIndexed();
  crossStrap.translate(0, strapY, 0);
  strapGeos.push(crossStrap);

  const trunkCollar = new THREE.CylinderGeometry(0.042, 0.042, 0.048, 10).toNonIndexed();
  trunkCollar.translate(0, strapY, 0);
  strapGeos.push(trunkCollar);

  for (const side of [-1, 1] as const) {
    const stakeLoop = new THREE.CylinderGeometry(0.034, 0.034, 0.046, 8).toNonIndexed();
    stakeLoop.translate(side * (stakeOffset - Math.sin(stakeTiltRad) * (strapY - stakeHeight / 2)), strapY, 0);
    strapGeos.push(stakeLoop);
  }
  const strapMesh = new THREE.Mesh(mergeGeometries(strapGeos, false), getMat('roof_tile_anthracite'));
  strapMesh.castShadow = true;
  treeGroup.add(strapMesh);

  // 3. Compact rounded-ovoid leafy crown built from overlapping maquette clusters
  const crownGeos: THREE.BufferGeometry[] = [];
  const coreGeo = new THREE.IcosahedronGeometry(crownRadius * 0.72, 2);
  coreGeo.scale(0.92, 1.12, 0.92);
  coreGeo.translate(0, crownCenterY, 0);
  crownGeos.push(coreGeo);

  const numClusters = 32;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < numClusters; i++) {
    const t = (i + 0.5) / numClusters;
    const phi = Math.acos(1 - 2 * t);
    const theta = goldenAngle * i + (rand() - 0.5) * 0.25;

    const radialScale = 0.62 + rand() * 0.16;
    const ox = Math.sin(phi) * Math.cos(theta) * crownRadius * radialScale;
    const oy = Math.cos(phi) * (crownHeight * 0.5) * radialScale;
    const oz = Math.sin(phi) * Math.sin(theta) * crownRadius * radialScale;

    const clusterR = crownRadius * (0.28 + rand() * 0.12);
    const cluster = new THREE.IcosahedronGeometry(clusterR, 1);
    cluster.scale(0.92 + rand() * 0.18, 0.88 + rand() * 0.20, 0.92 + rand() * 0.18);
    cluster.rotateY(rand() * Math.PI * 2);
    cluster.translate(ox, crownCenterY + oy, oz);
    crownGeos.push(cluster);
  }

  const crownMesh = new THREE.Mesh(mergeGeometries(crownGeos, false), getMat('plot_tree_foliage_bolboom'));
  registerMesh(
    crownMesh,
    'plot_tree_foliage_bolboom',
    {
      id,
      label,
      dimensionsLabel: `H ${totalHeight.toFixed(2)} m · Kroon Ø ${(crownRadius * 2).toFixed(2)} m`,
      provenance: 'user_supplied',
      source: 'Referentiefoto voortuin: bolbomen met dubbele boompalen en boomband',
      floor: 'plot',
    },
    true,
    true
  );
  treeGroup.add(crownMesh);

  group.add(treeGroup);
  return treeGroup;
}

/**
 * Build the front-facade planted border (Z: 0.00..1.05 m, X: 0.05..5.85 m) behind the gravel path:
 * soil bed, low green shrub mounds, warm yellow flower clusters on the left/center, and
 * pale ornamental grass plumes to the right of the living room window.
 */
function buildFrontGardenFlowerBorder(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn
) {
  let s = (707 * 1664525 + 1013904223) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Soil / mulch bed against the front wall (flush with driveway gravel at X = 0.00 m, with 0.20 m rounded corner)
  const bedW = 5.85;
  const bedD = 1.05;
  const soilShape = new THREE.Shape();
  soilShape.moveTo(0.00, 0.00);
  soilShape.lineTo(bedW, 0.00);
  soilShape.lineTo(bedW, -bedD);
  soilShape.lineTo(0.20, -bedD);
  soilShape.quadraticCurveTo(0.00, -bedD, 0.00, -(bedD - 0.20));
  soilShape.closePath();

  const soilGeo = new THREE.ExtrudeGeometry(soilShape, {
    depth: 0.045,
    bevelEnabled: false,
  });
  soilGeo.rotateX(-Math.PI / 2);
  const soilMesh = new THREE.Mesh(soilGeo, getMat('plot_soil_border'));
  soilMesh.receiveShadow = true;
  group.add(soilMesh);

  const shrubGeos: THREE.BufferGeometry[] = [];
  const flowerGeos: THREE.BufferGeometry[] = [];
  const grassPlumeGeos: THREE.BufferGeometry[] = [];

  const addShrubMound = (cx: number, cz: number, rx: number, ry: number, rz: number, blossoms: number) => {
    const numPuffs = 5;
    for (let i = 0; i < numPuffs; i++) {
      const a = (i / numPuffs) * Math.PI * 2 + rand() * 0.6;
      const dist = i === 0 ? 0 : (0.35 + rand() * 0.35);
      const px = cx + Math.cos(a) * rx * dist;
      const pz = cz + Math.sin(a) * rz * dist;
      const r = (i === 0 ? 0.68 : 0.48 + rand() * 0.18) * Math.min(rx, rz);
      const py = 0.04 + ry * (i === 0 ? 0.48 : 0.32 + rand() * 0.18);

      const puff = new THREE.IcosahedronGeometry(r, 1);
      puff.scale(1.0 + rand() * 0.2, (ry / Math.max(0.15, r)) * 0.72, 1.0 + rand() * 0.2);
      puff.rotateY(rand() * Math.PI * 2);
      puff.translate(px, py, pz);
      shrubGeos.push(puff);
    }

    for (let b = 0; b < blossoms; b++) {
      const theta = rand() * Math.PI * 2;
      const phi = rand() * Math.PI * 0.42;
      const bx = cx + Math.sin(phi) * Math.cos(theta) * rx * 0.85;
      const bz = cz + Math.sin(phi) * Math.sin(theta) * rz * 0.85;
      const by = 0.06 + Math.cos(phi) * ry * 0.92;
      const br = 0.042 + rand() * 0.032;
      const blossom = new THREE.IcosahedronGeometry(br, 0);
      blossom.rotateY(rand() * Math.PI);
      blossom.translate(bx, by, bz);
      flowerGeos.push(blossom);
    }
  };

  // Left side near driveway (X: 0.25 -> 1.25 m): fluffy pale ornamental grass plumes + low bush
  addShrubMound(0.38, 0.56, 0.32, 0.42, 0.34, 4);

  const grassCenters: Array<[number, number, number]> = [
    [0.62, 0.46, 0.98],
    [0.88, 0.54, 1.04],
    [1.12, 0.44, 0.88],
  ];
  for (const [gx, gz, gh] of grassCenters) {
    // Low green base tuft
    addShrubMound(gx, gz, 0.26, 0.34, 0.26, 0);
    // Wispy pale cream-beige plumes arching upward
    const numPlumes = 11;
    for (let p = 0; p < numPlumes; p++) {
      const ang = (p / numPlumes) * Math.PI * 2 + rand() * 0.4;
      const spread = 0.08 + rand() * 0.22;
      const px = gx + Math.cos(ang) * spread;
      const pz = gz + Math.sin(ang) * spread;
      const py = gh * (0.52 + rand() * 0.42);
      const pr = 0.065 + rand() * 0.045;
      const plume = new THREE.IcosahedronGeometry(pr, 1);
      plume.scale(0.85, 1.55 + rand() * 0.4, 0.85);
      plume.rotateZ((rand() - 0.5) * 0.35);
      plume.rotateX((rand() - 0.5) * 0.35);
      plume.translate(px, py, pz);
      grassPlumeGeos.push(plume);
    }
  }

  // Low groundcover under the living room window (X: 1.31 -> 3.71 m, stays below 0.45 m window sill)
  addShrubMound(1.65, 0.42, 0.34, 0.32, 0.28, 4);
  addShrubMound(2.45, 0.38, 0.38, 0.28, 0.26, 3);
  addShrubMound(3.25, 0.44, 0.34, 0.34, 0.28, 5);

  // Right side (X: 3.95 -> 5.65 m): bushes with warm yellow flowers
  addShrubMound(4.10, 0.56, 0.38, 0.46, 0.35, 10);
  addShrubMound(4.78, 0.48, 0.44, 0.56, 0.40, 14);
  addShrubMound(5.42, 0.55, 0.40, 0.50, 0.38, 12);

  const shrubMesh = new THREE.Mesh(mergeGeometries(shrubGeos, false), getMat('plot_tree_foliage_bolboom'));
  registerMesh(
    shrubMesh,
    'plot_tree_foliage_bolboom',
    {
      id: 'front_garden_flower_border',
      label: 'Beplanting Voorgevel (Bloemstruiken & Siergras)',
      dimensionsLabel: '5.80 × 1.05 m',
      provenance: 'user_supplied',
      source: 'Referentiefoto voortuin: groene struiken met gele bloemen en siergras langs voorgevel',
      floor: 'plot',
    },
    true,
    true
  );
  group.add(shrubMesh);

  if (flowerGeos.length > 0) {
    const flowerMesh = new THREE.Mesh(mergeGeometries(flowerGeos, false), getMat('plot_tree_foliage_warm'));
    flowerMesh.castShadow = true;
    group.add(flowerMesh);
  }

  if (grassPlumeGeos.length > 0) {
    const grassMesh = new THREE.Mesh(mergeGeometries(grassPlumeGeos, false), getMat('plot_tree_stake_wood'));
    grassMesh.castShadow = true;
    grassMesh.receiveShadow = true;
    group.add(grassMesh);
  }
}

interface MaquetteHedgeSegmentOptions {
  id: string;
  label: string;
  matId: MaterialId;
  soilMatId?: MaterialId;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  width: number;
  height: number;
  seed: number;
  provenance: ProvenanceType;
  source: string;
}

/**
 * Build an architectural diorama hedge composed of tightly overlapping foliage balls
 * over a planted soil/mulch strip so the surface is richly organic without harsh gaps.
 */
function buildMaquetteHedgeSegment(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  opts: MaquetteHedgeSegmentOptions
) {
  const { id, label, matId, soilMatId, x0, z0, x1, z1, width, height, seed, provenance, source } = opts;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const centerX = (x0 + x1) / 2;
  const centerZ = (z0 + z1) / 2;

  // Deterministic LCG PRNG so foliage clusters are reproducible across rebuilds
  let s = (seed * 1664525 + 1013904223) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Optional planted soil/mulch bed at the base
  if (soilMatId) {
    const soilGeo = new THREE.BoxGeometry(width + 0.06, 0.045, length + 0.04);
    const soilMesh = new THREE.Mesh(soilGeo, getMat(soilMatId));
    soilMesh.position.set(centerX, 0.0225, centerZ);
    soilMesh.rotation.y = angle;
    soilMesh.receiveShadow = true;
    group.add(soilMesh);
  }

  // Tightly overlapping foliage balls (~55% overlap along Z and Y, heavy center overlap in X)
  const baseR = Math.min(0.145, Math.max(0.11, width * 0.36));
  const yStart = (soilMatId ? 0.025 : 0.0) + baseR * 0.65;
  const yEnd = Math.max(yStart + 0.05, height - baseR * 0.78);
  const numY = Math.max(4, Math.round((yEnd - yStart) / (baseR * 0.86)) + 1);
  const zStart = -length / 2 + baseR * 0.65;
  const zEnd = length / 2 - baseR * 0.65;
  const numZ = Math.max(4, Math.round(length / (baseR * 0.88)) + 1);

  const geometries: THREE.BufferGeometry[] = [];
  const baseHalfSpan = Math.max(0.03, width * 0.19);

  for (let iy = 0; iy < numY; iy++) {
    const ty = numY > 1 ? iy / (numY - 1) : 0.5;
    const baseY = yStart + ty * (yEnd - yStart);
    // Subtle inward taper toward the top of the hedge
    const rowHalfSpan = baseHalfSpan * (1.0 - ty * 0.28);

    for (let ix = 0; ix < 2; ix++) {
      const baseX = ix === 0 ? -rowHalfSpan : rowHalfSpan;
      const staggerZ = ((iy + ix) % 2) * (baseR * 0.42);

      for (let iz = 0; iz < numZ; iz++) {
        const tz = numZ > 1 ? iz / (numZ - 1) : 0.5;
        let pz = zStart + tz * (zEnd - zStart) + (iz > 0 && iz < numZ - 1 ? staggerZ * 0.5 : 0);
        pz = Math.max(zStart, Math.min(zEnd, pz));

        const r = baseR * (0.88 + rand() * 0.26);
        const ballGeo = new THREE.IcosahedronGeometry(r, 1);
        ballGeo.scale(0.95 + rand() * 0.12, 0.86 + rand() * 0.16, 0.95 + rand() * 0.12);

        const jx = (rand() - 0.5) * baseR * 0.24;
        const jy = (rand() - 0.5) * baseR * 0.22;
        const jz = (rand() - 0.5) * baseR * 0.24;
        const finalY = Math.max(r * 0.60, Math.min(height - r * 0.55, baseY + jy));

        ballGeo.translate(baseX + jx, finalY, pz + jz);
        geometries.push(ballGeo);
      }
    }
  }

  const mergedGeo = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  mergedGeo.computeBoundingBox();

  const mesh = new THREE.Mesh(mergedGeo, getMat(matId));
  mesh.position.set(centerX, 0, centerZ);
  mesh.rotation.y = angle;
  registerMesh(
    mesh,
    matId,
    {
      id,
      label,
      dimensionsLabel: `${width.toFixed(2)} × ${length.toFixed(2)} × ${height.toFixed(2)} m`,
      provenance,
      source,
      floor: 'plot',
    },
    true,
    true
  );
  group.add(mesh);
}

interface SchuttingSegmentOptions {
  id: string;
  label: string;
  panelMatId: MaterialId;
  postMatId: MaterialId;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  height: number;
  provenance: ProvenanceType;
  source: string;
}

/**
 * Build a fully wooden Dutch garden fence ("Houten schutting") with timber posts,
 * horizontal backing rails, top cap, and alternating vertical planks ("om-en-om").
 */
function buildSchuttingSegment(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  opts: SchuttingSegmentOptions
) {
  const { id, label, panelMatId, postMatId, x0, z0, x1, z1, height, provenance, source } = opts;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);

  const numPanels = Math.max(1, Math.round(length / 1.80));
  const panelLen = length / numPanels;
  const postSize = 0.09;
  const topRailH = 0.04;
  const plankBottomY = 0.02;
  const plankH = height - topRailH - plankBottomY;

  const postGeos: THREE.BufferGeometry[] = [];
  const panelGeos: THREE.BufferGeometry[] = [];

  for (let i = 0; i <= numPanels; i++) {
    const pz = -length / 2 + i * panelLen;
    const post = new THREE.BoxGeometry(postSize, height + 0.03, postSize);
    post.translate(0, (height + 0.03) / 2, pz);
    postGeos.push(post);
  }

  for (let i = 0; i < numPanels; i++) {
    const bayStartZ = -length / 2 + i * panelLen + postSize * 0.5;
    const bayEndZ = -length / 2 + (i + 1) * panelLen - postSize * 0.5;
    const bayLen = Math.max(0.10, bayEndZ - bayStartZ);
    const centerZ = (bayStartZ + bayEndZ) / 2;

    // Two horizontal backing rails between the posts
    for (const railY of [0.42, height - 0.45]) {
      const rail = new THREE.BoxGeometry(0.032, 0.065, bayLen);
      rail.translate(0, railY, centerZ);
      postGeos.push(rail);
    }

    // Top wood cap ("afdeklat")
    const topRail = new THREE.BoxGeometry(0.072, topRailH, bayLen + 0.02);
    topRail.translate(0, height - topRailH / 2, centerZ);
    postGeos.push(topRail);

    // Individual vertical planks alternating front/back ("om-en-om")
    const targetPitch = 0.125;
    const numPlanks = Math.max(3, Math.round(bayLen / targetPitch));
    const pitch = bayLen / numPlanks;
    const plankWidth = pitch * 1.12; // slight overlap for om-en-om look
    const plankThickness = 0.018;

    for (let p = 0; p < numPlanks; p++) {
      const pz = bayStartZ + (p + 0.5) * pitch;
      const offsetX = (p % 2 === 0 ? 1 : -1) * 0.018;
      const w = p === 0 || p === numPlanks - 1 ? pitch * 0.94 : plankWidth;
      const plank = new THREE.BoxGeometry(plankThickness, plankH, w);
      plank.translate(offsetX, plankBottomY + plankH / 2, pz);
      panelGeos.push(plank);
    }
  }

  const mergedPosts = mergeGeometries(postGeos, false);
  const mergedPanels = mergeGeometries(panelGeos, false);
  for (const g of postGeos) g.dispose();
  for (const g of panelGeos) g.dispose();

  const fenceGroup = new THREE.Group();
  fenceGroup.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  fenceGroup.rotation.y = angle;

  const postMesh = new THREE.Mesh(mergedPosts, getMat(postMatId));
  postMesh.castShadow = true;
  postMesh.receiveShadow = true;
  fenceGroup.add(postMesh);

  const panelMesh = new THREE.Mesh(mergedPanels, getMat(panelMatId));
  registerMesh(
    panelMesh,
    panelMatId,
    {
      id,
      label,
      dimensionsLabel: `0.10 × ${length.toFixed(2)} × ${height.toFixed(2)} m`,
      provenance,
      source,
      floor: 'plot',
    },
    true,
    true
  );
  fenceGroup.add(panelMesh);

  group.add(fenceGroup);
}

/**
 * Build a room floor slab with accurate dimensions and elevation.
 * For `room_ff_overloop` and `room_sf_overloop`, cuts out the stairwell (`trapgat`, X: 0.40..2.87 m, Z: -4.84..-3.96 m)
 * so the white double-90°-turn staircase below is completely visible through the landing!
 */
function buildRoomSlab(
  room: RoomFloorSpec,
  targetGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn
) {
  const [minX, minZ, maxX, maxZ] = room.bounds;
  const finishThickness = 0.03;

  if (room.id === 'room_ff_overloop' || room.id === 'room_sf_overloop') {
    // Cut stairwell opening (X: minX..2.87, Z: -4.84..maxZ) out of the Overloop floor finish
    const stairMaxX = Math.min(maxX, 2.87);
    const stairMinZ = -4.84;

    const shape = new THREE.Shape();
    // Trace L-shaped Overloop around the stairwell in (X, -Z) coordinates
    shape.moveTo(minX, -minZ);
    shape.lineTo(maxX, -minZ);
    shape.lineTo(maxX, -maxZ);
    if (maxX > stairMaxX + 0.02) {
      shape.lineTo(stairMaxX, -maxZ);
      shape.lineTo(stairMaxX, -stairMinZ);
      shape.lineTo(minX, -stairMinZ);
    } else {
      shape.moveTo(minX, -minZ);
      shape.lineTo(maxX, -minZ);
      shape.lineTo(maxX, -stairMinZ);
      shape.lineTo(minX, -stairMinZ);
    }
    shape.closePath();

    const finishGeo = new THREE.ExtrudeGeometry(shape, {
      depth: finishThickness,
      bevelEnabled: false,
    });
    finishGeo.rotateX(-Math.PI / 2);
    const finishMesh = new THREE.Mesh(finishGeo, getMat(room.topMaterial));
    finishMesh.position.y = room.elevationY - finishThickness + 0.005;
    registerMesh(
      finishMesh,
      room.topMaterial,
      {
        id: room.id,
        label: `${room.label} (${room.areaSqm} m²)`,
        dimensionsLabel: room.dimensionsLabel,
        provenance: room.provenance,
        source: room.source,
        floor: room.floor,
      },
      false,
      true
    );
    targetGroup.add(finishMesh);
    return;
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;

  const finishGeo = new THREE.BoxGeometry(width, finishThickness, depth);
  const finishMesh = new THREE.Mesh(finishGeo, getMat(room.topMaterial));
  finishMesh.position.set(
    (minX + maxX) / 2,
    room.elevationY - finishThickness / 2 + 0.005,
    (minZ + maxZ) / 2
  );
  registerMesh(
    finishMesh,
    room.topMaterial,
    {
      id: room.id,
      label: `${room.label} (${room.areaSqm} m²)`,
      dimensionsLabel: room.dimensionsLabel,
      provenance: room.provenance,
      source: room.source,
      floor: room.floor,
    },
    false,
    true
  );
  targetGroup.add(finishMesh);
}

/**
 * Build structural floor slabs strictly INSIDE the exterior walls (X: 0.40..5.57 m)
 * while the exterior walls extend 25 cm down around them, so the white floor slab
 * and stairwell cutout never show on the outside of the yellow brick facade!
 */
function buildStructuralSlabCollars(
  groundGroup: THREE.Group,
  firstGroup: THREE.Group,
  secondGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn
) {
  const Y1 = HOUSE_DIMENSIONS.firstFloorElevation.metres;  // 2.85 m
  const Y2 = HOUSE_DIMENSIONS.secondFloorElevation.metres; // 5.70 m

  // Ground floor structural slab (strictly inside outer walls: X 0.40..5.57, Z -12.46..-0.40 -> 5.17 × 12.06 m)
  const gfSlabGeo = new THREE.BoxGeometry(5.17, 0.22, 12.06);
  const gfSlab = new THREE.Mesh(gfSlabGeo, getMat('slab_structural_edge'));
  gfSlab.position.set((0.40 + 5.57) / 2, -0.13, (-12.46 + -0.40) / 2);
  registerMesh(gfSlab, 'slab_structural_edge', {
    id: 'slab_gf_main',
    label: 'Systeemvloer Begane Grond (5.17 × 12.06 × 0.25 m)',
    dimensionsLabel: '5.17 × 12.06 m',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Doorsnede AA + B11a',
    floor: 'ground',
  });
  groundGroup.add(gfSlab);

  // First floor structural slab at Y1 = +2.85 m (strictly inside outer walls X: 0.40..5.57, Z: -10.06..-0.40,
  // with stairwell opening at X: 0.40..2.87, Z: -4.84..-3.96)
  const ffParts: Array<[number, number, number, number]> = [
    [0.40, -3.96, 5.57, -0.40],
    [0.40, -10.06, 5.57, -4.84],
    [2.87, -4.84, 5.57, -3.96],
  ];
  for (let i = 0; i < ffParts.length; i++) {
    const [x0, z0, x1, z1] = ffParts[i];
    const geo = new THREE.BoxGeometry(x1 - x0, 0.22, z1 - z0);
    const mesh = new THREE.Mesh(geo, getMat('slab_structural_edge'));
    mesh.position.set((x0 + x1) / 2, Y1 - 0.13, (z0 + z1) / 2);
    registerMesh(mesh, 'slab_structural_edge', {
      id: `slab_ff_part_${i}`,
      label: 'Breedplaatvloer 1e Verdieping (+2.85 m)',
      dimensionsLabel: '5.17 × 9.66 × 0.25 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Doorsnede AA',
      floor: 'first',
    });
    firstGroup.add(mesh);
  }

  // Second floor structural slab at Y2 = +5.70 m (strictly inside outer walls X: 0.40..5.57, Z: -10.06..-0.40,
  // with stairwell opening inside the Zolder Overloop at X: 1.14..2.87, Z: -4.84..-3.96)
  const sfParts: Array<[number, number, number, number]> = [
    [0.40, -3.96, 5.57, -0.40],
    [0.40, -10.06, 5.57, -4.84],
    [0.40, -4.84, 1.14, -3.96],
    [2.87, -4.84, 5.57, -3.96],
  ];
  for (let i = 0; i < sfParts.length; i++) {
    const [x0, z0, x1, z1] = sfParts[i];
    const geo = new THREE.BoxGeometry(x1 - x0, 0.22, z1 - z0);
    const mesh = new THREE.Mesh(geo, getMat('slab_structural_edge'));
    mesh.position.set((x0 + x1) / 2, Y2 - 0.13, (z0 + z1) / 2);
    registerMesh(mesh, 'slab_structural_edge', {
      id: `slab_sf_part_${i}`,
      label: 'Breedplaatvloer 2e Verdieping / Zolder (+5.70 m)',
      dimensionsLabel: '5.17 × 9.66 × 0.25 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Doorsnede AA',
      floor: 'second',
    });
    secondGroup.add(mesh);
  }
}

/**
 * Build a wall (rectangular, roof-clipped trapezoidal, or gable-peaked) with exact openings
 * resolved from the centralized `OPENING_PREFABS` catalog (`src/geometry/componentCatalog.ts`).
 */
function buildWallWithOpenings(
  wall: WallSpec,
  targetGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  doorManager?: InteractiveDoorManager
) {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(-dz, dx);

  const wallContainer = new THREE.Group();
  wallContainer.position.set(wall.start[0], wall.baseY, wall.start[1]);
  wallContainer.rotation.y = angle;

  // Exterior & party walls extend 25 cm downward (bottomY = -0.25 m) so the wall sits NEXT to the
  // structural floor slab, covering the slab edge and stairwell gap with continuous exterior brick!
  const extendsDownBesideSlab = wall.isExterior || wall.id.includes('_wall_party');
  const bottomY = extendsDownBesideSlab ? -0.25 : 0.0;

  const shape = new THREE.Shape();
  shape.moveTo(0, bottomY);
  shape.lineTo(length, bottomY);

  if (wall.gablePeak) {
    shape.lineTo(length, wall.height);
    shape.lineTo(wall.gablePeak.offsetAlongWall, wall.gablePeak.peakHeight);
    shape.lineTo(0, wall.height);
  } else if (wall.clipToRoof) {
    const steps = 16;
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const u = t * length;
      const worldX = wall.start[0] + t * dx;
      const worldZ = wall.start[1] + t * dz;
      const maxH = getZolderRoofUndersideY(worldX, worldZ) - wall.baseY - 0.004;
      shape.lineTo(u, Math.min(wall.height, maxH));
    }
  } else {
    shape.lineTo(length, wall.height);
    shape.lineTo(0, wall.height);
  }
  shape.closePath();

  const openingRects: Array<{ u0: number; u1: number; v0: number; v1: number }> = [];
  if (wall.openings && wall.openings.length > 0) {
    for (const placement of wall.openings) {
      const prefab = OPENING_PREFABS[placement.prefabId];
      const resolved: ResolvedOpeningInstance = {
        id: placement.id,
        prefabId: placement.prefabId,
        label: placement.label ?? prefab.defaultLabel,
        offsetAlongWall: placement.offsetAlongWall,
        width: placement.widthOverride ?? prefab.width,
        height: placement.heightOverride ?? prefab.height,
        sillHeight: placement.sillHeightOverride ?? prefab.sillHeight,
        frameMaterial: prefab.frameMaterial,
        panelMaterial: prefab.panelMaterial,
        hasArchTrim: prefab.hasArchTrim,
        hasTerracottaSurround: prefab.hasTerracottaSurround,
        provenance: prefab.provenance,
        source: prefab.source,
      };

      const u0 = Math.max(0.04, resolved.offsetAlongWall - resolved.width / 2);
      const u1 = Math.min(length - 0.04, resolved.offsetAlongWall + resolved.width / 2);
      const v0 = Math.max(0.015, resolved.sillHeight);
      const v1 = resolved.sillHeight + resolved.height;
      openingRects.push({ u0, u1, v0, v1 });

      const hole = new THREE.Path();
      hole.moveTo(u0, v0);
      hole.lineTo(u1, v0);
      hole.lineTo(u1, v1);
      hole.lineTo(u0, v1);
      hole.closePath();
      shape.holes.push(hole);

      instantiateOpeningPrefab3D(
        wallContainer,
        resolved,
        wall.thickness,
        wall.floor,
        getMat,
        registerMesh,
        (door) => doorManager?.register(door)
      );
    }
  }

  const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: wall.thickness,
    bevelEnabled: false,
  });
  extrudeGeo.translate(0, 0, -wall.thickness / 2);

  const matId = wall.isExterior ? wall.exteriorMaterial : wall.interiorMaterial;
  const wallMesh = new THREE.Mesh(extrudeGeo, getMat(matId));
  registerMesh(wallMesh, matId, {
    id: wall.id,
    label: wall.label,
    dimensionsLabel: `${length.toFixed(2)} × ${wall.height.toFixed(2)} × ${(wall.thickness * 100).toFixed(1).replace('.0', '')} cm`,
    provenance: wall.provenance,
    source: wall.source,
    floor: wall.floor,
  });
  wallContainer.add(wallMesh);

  if (wall.isExterior && !wall.isNeighbour && wall.interiorMaterial === 'interior_wall_plaster') {
    const startTrim = wall.interiorStartTrim ?? 0;
    const endTrim = wall.interiorEndTrim ?? 0;
    const innerShape = new THREE.Shape();
    innerShape.moveTo(startTrim, 0);
    innerShape.lineTo(length - endTrim, 0);
    if (wall.gablePeak) {
      innerShape.lineTo(length - endTrim, wall.height);
      innerShape.lineTo(wall.gablePeak.offsetAlongWall, wall.gablePeak.peakHeight - 0.05);
      innerShape.lineTo(startTrim, wall.height);
    } else {
      innerShape.lineTo(length - endTrim, wall.height);
      innerShape.lineTo(startTrim, wall.height);
    }
    innerShape.closePath();
    for (const h of shape.holes) {
      innerShape.holes.push(h);
    }

    const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
      depth: 0.015,
      bevelEnabled: false,
    });
    innerGeo.translate(0, 0, -wall.thickness / 2 - 0.008);
    const innerMesh = new THREE.Mesh(innerGeo, getMat('interior_wall_plaster'));
    innerMesh.castShadow = false;
    innerMesh.receiveShadow = true;
    wallContainer.add(innerMesh);

    if (openingRects.length > 0) {
      const frameDepth = Math.min(wall.thickness, 0.11);
      const frameCenterZ = wall.thickness / 2 - 0.11;
      const zInner = -wall.thickness / 2 - 0.008;
      const zOuter = frameCenterZ - frameDepth / 2 + 0.005;
      const revealDepth = zOuter - zInner;
      const revealCenterZ = (zInner + zOuter) / 2;
      const revealThick = 0.008;

      if (revealDepth > 0.01) {
        const revealGeos: THREE.BufferGeometry[] = [];
        const addRevealBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
          const g = new THREE.BoxGeometry(w, h, d);
          g.translate(x, y, z);
          revealGeos.push(g);
        };

        for (const { u0, u1, v0, v1 } of openingRects) {
          const openW = u1 - u0;
          const openH = v1 - v0;
          const centerU = (u0 + u1) / 2;
          const centerV = (v0 + v1) / 2;

          addRevealBox(revealThick, openH, revealDepth, u0 + revealThick / 2 - 0.002, centerV, revealCenterZ);
          addRevealBox(revealThick, openH, revealDepth, u1 - revealThick / 2 + 0.002, centerV, revealCenterZ);
          addRevealBox(openW, revealThick, revealDepth, centerU, v1 - revealThick / 2 + 0.002, revealCenterZ);
          if (v0 > 0.02) {
            addRevealBox(openW, revealThick, revealDepth, centerU, v0 + revealThick / 2 - 0.002, revealCenterZ);
          }
        }

        const mergedReveals = mergeGeometries(revealGeos, false);
        for (const g of revealGeos) g.dispose();
        const revealMesh = new THREE.Mesh(mergedReveals, getMat('interior_wall_plaster'));
        revealMesh.castShadow = false;
        revealMesh.receiveShadow = true;
        wallContainer.add(revealMesh);
      }
    }
  }

  targetGroup.add(wallContainer);
}

/**
 * Build a dimensionally accurate Dutch quarter-turn staircase.
 */
function buildQuarterTurnStaircase(
  targetGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  id: string,
  label: string,
  floor: FloorLayerId,
  minX: number,
  frontZ: number,
  widthX: number,
  depthZ: number,
  baseY: number,
  topY: number
) {
  const stairGroup = new THREE.Group();
  const totalRise = topY - baseY; // 2.85 m
  const stepsCount = 14;
  const stepRise = totalRise / stepsCount;
  const stepRun = widthX / stepsCount;

  for (let i = 0; i < stepsCount; i++) {
    const treadGeo = new THREE.BoxGeometry(stepRun + 0.03, 0.045, depthZ);
    const tread = new THREE.Mesh(treadGeo, getMat('stair_wood_oak'));
    const xPos = minX + widthX - (i + 0.5) * stepRun;
    const yPos = baseY + (i + 1) * stepRise;
    const zPos = frontZ - depthZ / 2;
    tread.position.set(xPos, yPos, zPos);

    const riserGeo = new THREE.BoxGeometry(0.025, stepRise, depthZ);
    const riser = new THREE.Mesh(riserGeo, getMat('interior_wall_plaster'));
    riser.position.set(xPos + stepRun / 2, yPos - stepRise / 2, zPos);
    stairGroup.add(riser);

    if (i === 7) {
      registerMesh(tread, 'stair_wood_oak', {
        id,
        label,
        dimensionsLabel: `${widthX.toFixed(2)} × ${depthZ.toFixed(2)} m (H=${totalRise.toFixed(2)} m)`,
        provenance: 'verified_drawing',
        source: 'Verkooptekening VK-06 & Tekening 55.1 (B61.1)',
        floor,
      });
    } else {
      tread.castShadow = true;
      tread.receiveShadow = true;
    }
    stairGroup.add(tread);
  }

  targetGroup.add(stairGroup);
}

/**
 * Add Zolder technical installations (WP, WTW) in the rear-left installation zone.
 */
function buildZolderDetails(
  secondGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  registerStaggered: (id: string, object: THREE.Object3D, floor: FloorLayerId, baseY: number) => void
) {
  const Y2 = HOUSE_DIMENSIONS.secondFloorElevation.metres; // 5.70 m

  const wpGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.65, 20);
  const wpMesh = new THREE.Mesh(wpGeo, getMat('window_frame_cream'));
  wpMesh.position.set(2.15, Y2 + 0.825, -6.85);
  registerMesh(wpMesh, 'window_frame_cream', {
    id: 'sf_tech_wp',
    label: 'Warmtepomp (WP) Opstelplaats',
    dimensionsLabel: 'Ø 0.64 × 1.65 m',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 & Tekening 55.3 (wp)',
    floor: 'second',
    category: 'furniture',
  });
  secondGroup.add(wpMesh);
  registerStaggered('sf_tech_wp', wpMesh, 'second', Y2 + 0.825);
}

/**
 * Build the flat roofs of the 2.40 m Rear Extension (B11a) and the Attached Berging
 * as part of the 1st Floor layer (`firstGroup`, step 2) so that when viewing `1 · Begane Grond`,
 * the entire ground floor plan (including the extension and inside of the Berging) is open and unobstructed!
 */
function buildExtensionAndBergingFlatRoofs(
  firstGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn
) {
  const Y_FLAT = HOUSE_DIMENSIONS.bergingRoofHeight.metres; // +2.85 m

  // 1. Flat Roof over 2.40 m Rear Extension (B11a): X: 0.00 -> 5.87 m, Z: -12.86 -> -10.46 m (2.40 m span)
  const extRoofGeo = new THREE.BoxGeometry(5.87, 0.25, 2.40);
  const extRoof = new THREE.Mesh(extRoofGeo, getMat('roof_flat_bitumen'));
  extRoof.position.set(5.87 / 2, Y_FLAT - 0.125, (-12.86 + -10.46) / 2);
  registerMesh(extRoof, 'roof_flat_bitumen', {
    id: 'ff_flat_roof_extension',
    label: 'Plat Dak Uitbouw B11a (5.87 × 2.40 m op +2.85 m)',
    dimensionsLabel: '5.87 × 2.40 m',
    provenance: 'verified_drawing',
    source: 'Tekening woonwensen 55.1 (B11a Uitbreiding 2,4m)',
    floor: 'first',
  });
  firstGroup.add(extRoof);

  // 2. Flat Roof over Attached Berging: X: -3.27 -> 0.00 m, Z: -13.72 -> -7.73 m (3.27 × 5.99 m)
  const bergingRoofGeo = new THREE.BoxGeometry(3.27, 0.25, 5.99);
  const bergingRoof = new THREE.Mesh(bergingRoofGeo, getMat('roof_flat_bitumen'));
  bergingRoof.position.set(-3.27 / 2, Y_FLAT - 0.125, (-13.72 + -7.73) / 2);
  registerMesh(bergingRoof, 'roof_flat_bitumen', {
    id: 'ff_flat_roof_berging',
    label: 'Plat Dak Berging (3.44 × 5.99 m op +2.85 m)',
    dimensionsLabel: '3.44 × 5.99 m',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Doorsnede AA & HomeByMe',
    floor: 'first',
  });
  firstGroup.add(bergingRoof);

  // 2b. Rear widening of the berging (33 cm): X: 0.00 -> 0.33 m, Z: -13.72 -> -12.86 m
  const widenRoof = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.25, 0.86), getMat('roof_flat_bitumen'));
  widenRoof.position.set(0.33 / 2, Y_FLAT - 0.125, (-13.72 + -12.86) / 2);
  firstGroup.add(widenRoof);
}

/**
 * Build a planar 3D roof polygon extruded vertically downward by `verticalThickness`
 * so intersecting roof planes (ridges, diagonal valleys / kielkepers, and party-wall seams)
 * share the exact same 3D top and bottom vertices with zero gaps or interior overhang.
 */
function buildVerticalExtrudedRoofPolygon(
  topPoints: Array<[number, number, number]>,
  verticalThickness: number
): THREE.BufferGeometry {
  const pts = topPoints.map((p) => [...p] as [number, number, number]);
  // Ensure top face winding produces an upward (+Y) normal:
  // cross(pts[1] - pts[0], pts[2] - pts[0]).y > 0
  const ux = pts[1][0] - pts[0][0];
  const uz = pts[1][2] - pts[0][2];
  const vx = pts[2][0] - pts[0][0];
  const vz = pts[2][2] - pts[0][2];
  const normalY = uz * vx - ux * vz;
  if (normalY < 0) {
    pts.reverse();
  }

  const bot = pts.map(([x, y, z]) => [x, y - verticalThickness, z] as [number, number, number]);
  const positions: number[] = [];

  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // Top face (+Y normal)
  for (let i = 1; i < pts.length - 1; i++) {
    pushTri(pts[0], pts[i], pts[i + 1]);
  }
  // Bottom face (-Y normal)
  for (let i = 1; i < bot.length - 1; i++) {
    pushTri(bot[0], bot[i + 1], bot[i]);
  }
  // Perimeter side faces
  for (let k = 0; k < pts.length; k++) {
    const next = (k + 1) % pts.length;
    pushTri(pts[k], bot[k], bot[next]);
    pushTri(pts[k], bot[next], pts[next]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build the pitched intersecting roof system:
 * - Bouwnummer 55's front-to-back Cross-Gable Roof (Dwarskap, left slope + front/rear right wings)
 * - Bouwnummer 55's owned perpendicular T-wing (Langskap over X: 2.985 -> 5.87 m in Anthracite)
 * - Bouwnummer 56's perpendicular Side-Gable Roof (Langskap over X: 5.87 -> 10.05 m in Neutral Grey)
 */
function buildPitchedRoofSystem(
  roofGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn
) {
  const Y_EAVES = HOUSE_DIMENSIONS.eavesGutterHeight.metres; // +6.13 m
  const Y_RIDGE = HOUSE_DIMENSIONS.roofRidgeHeight.metres;   // +10.90 m
  const ridgeX = 2.985;
  const leftEavesX = -0.18;
  const rightPartyX = 5.87;
  const neighbourMaxX = 10.05;
  const roofFrontZ = 0.16;
  const roofRearZ = -10.62;
  const roofLengthZ = roofFrontZ - roofRearZ; // 10.78 m
  const nbRidgeZ = -5.23;
  const nbFrontEavesZ = -0.22;
  const nbRearEavesZ = -10.24;
  const VERTICAL_THICKNESS = 0.28;

  // 1. Left Slope of Bouwnummer 55 (X: -0.18 -> 2.985 m, Z: +0.16 -> -10.62 m)
  const leftRunX = ridgeX - leftEavesX;
  const leftRiseY = Y_RIDGE - Y_EAVES;
  const leftSlopeLen = Math.hypot(leftRunX, leftRiseY);
  const leftAngle = Math.atan2(leftRiseY, leftRunX);

  const leftSlopeGeo = buildVerticalExtrudedRoofPolygon(
    [
      [leftEavesX, Y_EAVES, roofFrontZ],
      [ridgeX, Y_RIDGE, roofFrontZ],
      [ridgeX, Y_RIDGE, roofRearZ],
      [leftEavesX, Y_EAVES, roofRearZ],
    ],
    VERTICAL_THICKNESS
  );
  const leftSlopeMesh = new THREE.Mesh(leftSlopeGeo, getMat('roof_tile_anthracite'));
  registerMesh(leftSlopeMesh, 'roof_tile_anthracite', {
    id: 'roof_bnr55_left_slope',
    label: 'Schuine Kap Links bnr. 55 (Goothoogte +6.13 m, Nok +10.90 m)',
    dimensionsLabel: `${leftSlopeLen.toFixed(2)} × ${roofLengthZ.toFixed(2)} m`,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Gevels & Doorsnede AA',
    floor: 'roof',
  });
  roofGroup.add(leftSlopeMesh);

  const panelGeo = new THREE.BoxGeometry(1.15, 0.06, 1.05);
  const panelMesh = new THREE.Mesh(panelGeo, getMat('roof_solar_panel'));
  panelMesh.position.set(1.28, 8.42, -7.85);
  panelMesh.rotation.z = leftAngle;
  roofGroup.add(panelMesh);

  // 2. Right Slope of Bouwnummer 55 (Front & Rear Dwarskap Wings meeting the diagonal Kielkepers)
  const rightRunX = rightPartyX - ridgeX;
  const rightEavesY = Y_EAVES + VERTICAL_THICKNESS; // +6.41 m top surface (+6.13 m underside, matching gable & party walls!)
  const rightRiseY = Y_RIDGE - rightEavesY;
  const rightSlopeLen = Math.hypot(rightRunX, rightRiseY);
  const rightAngle = -Math.atan2(rightRiseY, rightRunX);

  const rightFrontWingGeo = buildVerticalExtrudedRoofPolygon(
    [
      [ridgeX, Y_RIDGE, roofFrontZ],
      [rightPartyX, rightEavesY, roofFrontZ],
      [rightPartyX, rightEavesY, nbFrontEavesZ],
      [ridgeX, Y_RIDGE, nbRidgeZ],
    ],
    VERTICAL_THICKNESS
  );
  const rightFrontWingMesh = new THREE.Mesh(rightFrontWingGeo, getMat('roof_tile_anthracite'));
  registerMesh(rightFrontWingMesh, 'roof_tile_anthracite', {
    id: 'roof_bnr55_right_slope',
    label: 'Schuine Kap Rechts bnr. 55 (Dwarskap Voorzijde tot Kielkeper)',
    dimensionsLabel: `${rightSlopeLen.toFixed(2)} × 5.39 m`,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Gevels, Zolder & Doorsnede AA',
    floor: 'roof',
  });
  roofGroup.add(rightFrontWingMesh);

  const rightRearWingGeo = buildVerticalExtrudedRoofPolygon(
    [
      [ridgeX, Y_RIDGE, nbRidgeZ],
      [rightPartyX, rightEavesY, nbRearEavesZ],
      [rightPartyX, rightEavesY, roofRearZ],
      [ridgeX, Y_RIDGE, roofRearZ],
    ],
    VERTICAL_THICKNESS
  );
  const rightRearWingMesh = new THREE.Mesh(rightRearWingGeo, getMat('roof_tile_anthracite'));
  registerMesh(rightRearWingMesh, 'roof_tile_anthracite', {
    id: 'roof_bnr55_right_rear_slope',
    label: 'Schuine Kap Rechts bnr. 55 (Dwarskap Achterzijde tot Kielkeper)',
    dimensionsLabel: `${rightSlopeLen.toFixed(2)} × 5.39 m`,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Gevels, Zolder & Doorsnede AA',
    floor: 'roof',
  });
  roofGroup.add(rightRearWingMesh);

  // White bargeboards (windveren) at front and rear gable edges
  for (const zPos of [roofFrontZ - 0.06, roofRearZ + 0.06]) {
    const bargeL = new THREE.Mesh(
      new THREE.BoxGeometry(leftSlopeLen + 0.1, 0.26, 0.14),
      getMat('roof_fascia_white')
    );
    bargeL.position.set((leftEavesX + ridgeX) / 2, (Y_EAVES + Y_RIDGE) / 2 - 0.12, zPos);
    bargeL.rotation.z = leftAngle;
    roofGroup.add(bargeL);

    const bargeR = new THREE.Mesh(
      new THREE.BoxGeometry(rightSlopeLen + 0.1, 0.26, 0.14),
      getMat('roof_fascia_white')
    );
    bargeR.position.set((ridgeX + rightPartyX) / 2, (Y_RIDGE + rightEavesY) / 2 - 0.12, zPos);
    bargeR.rotation.z = rightAngle;
    roofGroup.add(bargeR);
  }

  // 3. Bouwnummer 55's Owned Perpendicular Roof Wing (Langskap above bnr. 55's Zolder floor: X 2.985 -> 5.87 m)
  // Colored in bnr. 55's anthracite roof tile material and meeting the Dwarskap along the exact Kielkepers!
  const ownedLangsFrontGeo = buildVerticalExtrudedRoofPolygon(
    [
      [ridgeX, Y_RIDGE, nbRidgeZ],
      [rightPartyX, rightEavesY, nbFrontEavesZ],
      [rightPartyX, Y_RIDGE, nbRidgeZ],
    ],
    VERTICAL_THICKNESS
  );
  const ownedLangsFrontMesh = new THREE.Mesh(ownedLangsFrontGeo, getMat('roof_tile_anthracite'));
  registerMesh(ownedLangsFrontMesh, 'roof_tile_anthracite', {
    id: 'roof_bnr55_langskap_front',
    label: 'Aansluitende Langskap bnr. 55 (Voorzijde boven Eigen Zolder)',
    dimensionsLabel: '2.89 × 5.01 m (tot Kielkeper)',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Zolder (kielkeper) & Doorsnede AA',
    floor: 'roof',
  });
  roofGroup.add(ownedLangsFrontMesh);

  const ownedLangsRearGeo = buildVerticalExtrudedRoofPolygon(
    [
      [ridgeX, Y_RIDGE, nbRidgeZ],
      [rightPartyX, Y_RIDGE, nbRidgeZ],
      [rightPartyX, rightEavesY, nbRearEavesZ],
    ],
    VERTICAL_THICKNESS
  );
  const ownedLangsRearMesh = new THREE.Mesh(ownedLangsRearGeo, getMat('roof_tile_anthracite'));
  registerMesh(ownedLangsRearMesh, 'roof_tile_anthracite', {
    id: 'roof_bnr55_langskap_rear',
    label: 'Aansluitende Langskap bnr. 55 (Achterzijde boven Eigen Zolder)',
    dimensionsLabel: '2.89 × 5.01 m (tot Kielkeper)',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Zolder (kielkeper) & Doorsnede AA',
    floor: 'roof',
  });
  roofGroup.add(ownedLangsRearMesh);

  // 4. Attached Neighbour bnr. 56 Perpendicular Pitched Roof (Langskap X: 5.87 -> 10.05 m in Neutral Grey)
  const nbFrontSlopeGeo = buildVerticalExtrudedRoofPolygon(
    [
      [rightPartyX, Y_RIDGE, nbRidgeZ],
      [rightPartyX, rightEavesY, nbFrontEavesZ],
      [neighbourMaxX, rightEavesY, nbFrontEavesZ],
      [neighbourMaxX, Y_RIDGE, nbRidgeZ],
    ],
    VERTICAL_THICKNESS
  );
  const nbFrontSlope = new THREE.Mesh(nbFrontSlopeGeo, getMat('neighbour_roof_grey'));
  registerMesh(nbFrontSlope, 'neighbour_roof_grey', {
    id: 'roof_nb56_front_slope',
    label: 'Buurwoning bnr. 56 Langskap (Voorzijde Context)',
    dimensionsLabel: '2.18 × 6.65 m',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 voorgevel & doorsnede AA bnr. 56',
    floor: 'roof',
  });
  roofGroup.add(nbFrontSlope);

  const nbRearSlopeGeo = buildVerticalExtrudedRoofPolygon(
    [
      [rightPartyX, Y_RIDGE, nbRidgeZ],
      [neighbourMaxX, Y_RIDGE, nbRidgeZ],
      [neighbourMaxX, rightEavesY, nbRearEavesZ],
      [rightPartyX, rightEavesY, nbRearEavesZ],
    ],
    VERTICAL_THICKNESS
  );
  const nbRearSlope = new THREE.Mesh(nbRearSlopeGeo, getMat('neighbour_roof_grey'));
  registerMesh(nbRearSlope, 'neighbour_roof_grey', {
    id: 'roof_nb56_rear_slope',
    label: 'Buurwoning bnr. 56 Langskap (Achterzijde Context)',
    dimensionsLabel: '2.18 × 6.65 m',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 achtergevel & doorsnede AA bnr. 56',
    floor: 'roof',
  });
  roofGroup.add(nbRearSlope);
}

/**
 * Instantiate all placed 3D assets from `src/assets/assetRegistry.ts` onto their respective floor furniture sub-groups.
 */
function buildPlacedAssets(
  furnitureGroups: Record<FloorLayerId, THREE.Group>,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  registerStaggered: (id: string, object: THREE.Object3D, floor: FloorLayerId, baseY: number) => void,
  doorManager?: InteractiveDoorManager
) {
  const floorBaseY: Record<FloorLayerId, number> = {
    plot: 0.0,
    ground: 0.0,
    first: HOUSE_DIMENSIONS.firstFloorElevation.metres,
    second: HOUSE_DIMENSIONS.secondFloorElevation.metres,
    roof: HOUSE_DIMENSIONS.roofRidgeHeight.metres,
  };

  for (const placed of PLACED_ASSETS) {
    const prefab = ASSET_PREFABS[placed.prefabId];
    if (!prefab) {
      console.warn(`[AssetRegistry] Unknown asset prefabId: "${placed.prefabId}"`);
      continue;
    }

    const wDim = placed.dimensionsOverride?.width ?? prefab.defaultDimensions.width;
    const dDim = placed.dimensionsOverride?.depth ?? prefab.defaultDimensions.depth;
    const hDim = placed.dimensionsOverride?.height ?? prefab.defaultDimensions.height;

    const width = wDim.metres;
    const depth = dDim.metres;
    const height = hDim.metres;

    const label = placed.label ?? prefab.defaultLabel;
    const assetGroup = prefab.build3D({
      width,
      depth,
      height,
      getMat,
      registerInteractiveDoor: doorManager
        ? (reg) => {
            doorManager.register({
              id: reg.subId ? `${placed.id}_${reg.subId}` : placed.id,
              label,
              floor: placed.floor,
              pivots: reg.pivots,
              triggerMeshes: reg.triggerMeshes,
              isHovered: false,
              isPinned: false,
            });
          }
        : undefined,
    });
    const baseY = floorBaseY[placed.floor] + (placed.elevationOffsetY ?? 0.0);
    assetGroup.position.set(placed.positionXZ[0], baseY, placed.positionXZ[1]);
    if (placed.rotationDeg) {
      assetGroup.rotation.y = THREE.MathUtils.degToRad(placed.rotationDeg);
    }

    const dimsLabel = `${width.toFixed(2)} × ${depth.toFixed(2)} × ${height.toFixed(2)} m`;
    const prov = placed.provenance ?? wDim.provenance;
    const src = placed.source ?? wDim.source;

    assetGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.userData?.isInteractiveTrigger) return;
        const matName = (mesh.material as THREE.Material)?.name as MaterialId | undefined;
        registerMesh(mesh, matName && MATERIAL_PALETTE[matName] ? matName : 'interior_wall_plaster', {
          id: placed.id,
          label,
          dimensionsLabel: dimsLabel,
          provenance: prov,
          source: src,
          floor: placed.floor,
          category: 'furniture',
        });
      }
    });

    furnitureGroups[placed.floor].add(assetGroup);
    registerStaggered(placed.id, assetGroup, placed.floor, baseY);
  }
}
