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
import { MATERIAL_SURFACE_WEATHER } from '../model/seasons';
import { getExteriorBrickTextures, applyWorldBrickUVs } from '../model/brickTexture';
import { getGroundFloorTileTextures, applyWorldFloorTileUVs } from '../model/floorTileTexture';
import { ProvenanceType } from '../model/units';
import {
  OPENING_PREFABS,
  ResolvedOpeningInstance,
  instantiateOpeningPrefab3D,
  instantiateWhiteDoubleTurnStaircase3D,
} from './componentCatalog';
import { ASSET_PREFABS, PLACED_ASSETS } from '../assets/assetRegistry';
import { InteractiveDoorManager } from '../viewer/interactiveDoors';
import { buildBushHedgeSegment } from './hedgeStyles';

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

export interface SeasonSurfaceUniforms {
  uSeasonSnow: { value: number };
  uSeasonWet: { value: number };
  uSnowColorOwned: { value: THREE.Color };
  uSnowColorNeighbour: { value: THREE.Color };
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
  seasonUniforms: SeasonSurfaceUniforms;
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
 * Shared canonical roof parameters derived from VK-06 Voorgevel, Doorsnede AA & Zolder.
 * Used identically by both `getZolderRoofUndersideY` and `buildPitchedRoofSystem`
 * so the slim outer roof tile layer sits cleanly above the brick walls (zero clipping,
 * slim tile edge in side profile) while the interior ceiling lining spans strictly inside
 * the exterior walls at the true kapelement underside.
 */
export const ROOF_SPEC = {
  /** Outer tile top at wall line (6.13 m goothoogte + 0.10 m tile thickness = 6.23 m, so tile underside = 6.13 m) */
  yEavesTop: HOUSE_DIMENSIONS.eavesGutterHeight.metres + 0.10, // +6.23 m
  yRidge: HOUSE_DIMENSIONS.roofRidgeHeight.metres,            // +10.90 m
  /** Slim 10 cm vertical thickness for the outer roof tile + batten layer (matches photo profile) */
  tileThickness: 0.10,
  /** Total vertical roof build-up from outer tile top to interior ceiling plaster (~0.35 m perp kapelement) */
  verticalThickness: 0.66,
  ridgeX: 2.985,
  leftWallOuterX: 0.00,
  leftTileEdgeX: -0.04,
  rightPartyX: 5.87,
  neighbourMaxX: 10.05,
  /** Main roof tile shell aligns flush to brick gable faces (gevelpannen add the 6.5 cm verge overhang) */
  roofFrontZ: 0.005,
  roofRearZ: -10.465,
  nbRidgeZ: -5.23,
  nbFrontEavesZ: -0.22,
  nbRearEavesZ: -10.24,
} as const;

/**
 * Analytically compute the exact 3D roof outer tile Y at any world coordinate (x, z).
 */
export function getZolderRoofTopY(x: number, z: number = ROOF_SPEC.nbRidgeZ): number {
  const { yEavesTop, yRidge, ridgeX, leftWallOuterX, rightPartyX, nbRidgeZ, nbFrontEavesZ } = ROOF_SPEC;
  const rise = yRidge - yEavesTop; // 4.67 m
  const spanZ = nbFrontEavesZ - nbRidgeZ; // 5.01 m

  if (x < ridgeX) {
    // Left slope passes through (leftWallOuterX=0.00, yEavesTop=6.23) and (ridgeX=2.985, yRidge=10.90),
    // continuing at the same angle over the 6 cm eaves drip lip to leftTileEdgeX=-0.06.
    const t = Math.max(0, (ridgeX - x) / (ridgeX - leftWallOuterX));
    return yRidge - t * rise;
  }

  const uX = Math.max(0, Math.min(1, (x - ridgeX) / (rightPartyX - ridgeX)));
  const uZ = Math.max(0, Math.min(1, Math.abs(z - nbRidgeZ) / spanZ));
  const u = uZ >= uX ? uX : uZ;
  return yRidge - u * rise;
}

/**
 * Analytically compute the exact 3D roof underside elevation Y at any world coordinate (x, z).
 * Derived directly from the planar geometry of the intersecting Dwarskap and Langskap roofs
 * in buildPitchedRoofSystem so all walls, knieschotten, and openings align natively to the roof
 * with zero manual guessing or clipping.
 */
export function getZolderRoofUndersideY(x: number, z: number = ROOF_SPEC.nbRidgeZ): number {
  return getZolderRoofTopY(x, z) - ROOF_SPEC.verticalThickness;
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
  const exteriorBrickTextures = getExteriorBrickTextures();
  const groundTileTextures = getGroundFloorTileTextures();
  const seasonUniforms: SeasonSurfaceUniforms = {
    uSeasonSnow: { value: 0 },
    uSeasonWet: { value: 0 },
    uSnowColorOwned: { value: new THREE.Color('#eef4f8') },
    uSnowColorNeighbour: { value: new THREE.Color('#eaedf0') },
  };
  const materialMap = new Map<MaterialId, THREE.MeshStandardMaterial>();
  for (const [id, def] of Object.entries(MATERIAL_PALETTE) as Array<[MaterialId, typeof MATERIAL_PALETTE[MaterialId]]>) {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.colorDay),
      roughness: def.roughness,
      metalness: def.metalness,
      transparent: def.transparent ?? false,
      opacity: def.opacity ?? 1.0,
      depthWrite: def.depthWrite ?? !(def.transparent ?? false),
      polygonOffset: true,
      polygonOffsetFactor: id.includes('floor') ? -1 : 0,
      polygonOffsetUnits: id.includes('floor') ? -1 : 0,
      ...(id === 'exterior_brick_main'
        ? {
            map: exteriorBrickTextures.map,
            bumpMap: exteriorBrickTextures.bumpMap,
            bumpScale: 0.002,
          }
        : {}),
      ...(id === 'floor_ground_tile'
        ? {
            map: groundTileTextures.map,
            normalMap: groundTileTextures.normalMap,
            normalScale: new THREE.Vector2(0.55, 0.55),
            roughnessMap: groundTileTextures.roughnessMap,
          }
        : {}),
    });

    const weatherSurf = MATERIAL_SURFACE_WEATHER[id];
    if (weatherSurf) {
      const snowStrength = weatherSurf.snow ?? 0;
      const wetStrength = weatherSurf.wet ?? 0;
      const snowColorUniform = weatherSurf.isNeighbour
        ? seasonUniforms.uSnowColorNeighbour
        : seasonUniforms.uSnowColorOwned;

      mat.customProgramCacheKey = () => 'season-surface-v1';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uSeasonSnow = seasonUniforms.uSeasonSnow;
        shader.uniforms.uSeasonWet = seasonUniforms.uSeasonWet;
        shader.uniforms.uSnowColor = snowColorUniform;
        shader.uniforms.uSnowStrength = { value: snowStrength };
        shader.uniforms.uWetStrength = { value: wetStrength };

        shader.vertexShader = shader.vertexShader
          .replace(
            'void main() {',
            `varying vec3 vSeasonWorldNormal;
varying vec3 vSeasonWorldPos;
void main() {`
          )
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
vSeasonWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);`
          )
          .replace(
            '#include <project_vertex>',
            `#include <project_vertex>
vSeasonWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            'void main() {',
            `uniform float uSeasonSnow;
uniform float uSeasonWet;
uniform vec3 uSnowColor;
uniform float uSnowStrength;
uniform float uWetStrength;
varying vec3 vSeasonWorldNormal;
varying vec3 vSeasonWorldPos;
void main() {`
          )
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
float sUp = smoothstep(0.32, 0.78, vSeasonWorldNormal.y);
float sNoise = 0.5 + 0.5 * sin(vSeasonWorldPos.x * 1.9 + sin(vSeasonWorldPos.z * 1.4) * 1.2) * cos(vSeasonWorldPos.z * 1.7);
float snowMask = clamp(uSeasonSnow * uSnowStrength * sUp * (0.86 + 0.14 * sNoise), 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, snowMask);
float wetMask = clamp(uSeasonWet * uWetStrength * sUp, 0.0, 1.0);
diffuseColor.rgb *= mix(1.0, 0.90, wetMask);`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
float sUpR = smoothstep(0.32, 0.78, vSeasonWorldNormal.y);
float wetMaskR = clamp(uSeasonWet * uWetStrength * sUpR, 0.0, 1.0);
float snowMaskR = clamp(uSeasonSnow * uSnowStrength * sUpR, 0.0, 1.0);
roughnessFactor = mix(roughnessFactor, 0.68, wetMaskR);
roughnessFactor = mix(roughnessFactor, 0.92, snowMaskR);`
          );
      };
    }

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

  // Seamless ground-floor tile infill through interior doorways (Hal <-> Woonkamer & Hal <-> Toilet)
  const gfDoorwayThresholds: Array<{ id: string; label: string; bounds: [number, number, number, number] }> = [
    {
      id: 'gf_threshold_hall_to_living',
      label: 'Vloertegels Dorpel Hal naar Woonkamer',
      bounds: [2.94, -6.22, 3.01, -5.42],
    },
    {
      id: 'gf_threshold_toilet',
      label: 'Vloertegels Dorpel Hal naar Toilet',
      bounds: [1.82, -6.45, 2.62, -6.38],
    },
  ];
  for (const strip of gfDoorwayThresholds) {
    const [x0, z0, x1, z1] = strip.bounds;
    const w = x1 - x0;
    const d = z1 - z0;
    const t = 0.03;
    const cx = (x0 + x1) / 2;
    const cy = -t / 2 + 0.005;
    const cz = (z0 + z1) / 2;
    const geo = new THREE.BoxGeometry(w, t, d);
    applyWorldFloorTileUVs(geo, cx, cy, cz);
    const mesh = new THREE.Mesh(geo, getMat('floor_ground_tile'));
    mesh.position.set(cx, cy, cz);
    registerMesh(
      mesh,
      'floor_ground_tile',
      {
        id: strip.id,
        label: strip.label,
        dimensionsLabel: `${(w * 100).toFixed(0)} × ${(d * 100).toFixed(0)} cm`,
        provenance: 'calculated',
        source: 'Doorlopende 150×75 cm vloertegels ter plaatse van binnendeurkozijn',
        floor: 'ground',
      },
      false,
      true
    );
    groundGroup.add(mesh);
  }

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
  // Ground -> 1st fits strictly inside Ground Floor Hal (X: 0.408 plaster..2.940 right wall, Z <= -3.960)
  const stairGfGroup = instantiateWhiteDoubleTurnStaircase3D(
    groundGroup,
    getMat,
    registerMesh,
    'stair_gf_to_ff',
    'Witte Dubbele Kwartslagtrap Begane Grond naar 1e Verdieping (B61.1)',
    'ground',
    0.408,
    -3.960,
    0.00,
    HOUSE_DIMENSIONS.firstFloorElevation.metres,
    2.940,
    0.850,
    0.205
  );

  // 1st -> Zolder is a direct copy-paste right above Ground -> 1st (X: 0.408..2.940 m, frontZ: -3.960 m)
  const stairFfGroup = instantiateWhiteDoubleTurnStaircase3D(
    firstGroup,
    getMat,
    registerMesh,
    'stair_ff_to_sf',
    'Witte Dubbele Kwartslagtrap 1e Verdieping naar Zolder',
    'first',
    0.408,
    -3.960,
    HOUSE_DIMENSIONS.firstFloorElevation.metres,
    HOUSE_DIMENSIONS.secondFloorElevation.metres,
    2.940,
    0.850,
    0.175
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
    { pos: [2.98, 2.30, -2.10], group: groundGroup, intensity: 6.0 },  // Woonkamer front
    { pos: [4.25, 2.30, -5.60], group: groundGroup, intensity: 3.6 },  // Woonkamer passage
    { pos: [2.98, 2.30, -9.80], group: groundGroup, intensity: 6.5 },  // Woonkeuken / Eetkamer
    { pos: [1.65, 2.30, -5.15], group: groundGroup, intensity: 3.4 },  // Hal
    { pos: [2.98, 5.15, -2.10], group: firstGroup, intensity: 5.5 },   // Slaapkamer 2 front
    { pos: [2.40, 5.15, -5.10], group: firstGroup, intensity: 3.2 },   // Overloop 1e verdieping
    { pos: [4.00, 5.15, -8.20], group: firstGroup, intensity: 5.5 },   // Kantoor / Slaapkamer 1 rear
    { pos: [1.40, 5.15, -8.20], group: firstGroup, intensity: 3.6 },   // Badkamer
    { pos: [3.25, 8.10, -5.00], group: secondGroup, intensity: 4.5 },  // Zolder
  ];

  for (const lp of lightPositions) {
    const pt = new THREE.PointLight('#ffc780', 0, 11.5, 1.5);
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
    seasonUniforms,
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

  // Curvy garden path branching perpendicularly from the gravel behind the berging (Z = -14.70)
  // to the front edge of the rear lounge terrace (Z = -17.73)
  const pathP0 = { x: -0.11, y: -gravelRearZ };
  const pathP1 = { x: -0.11, y: 15.70 };
  const pathP2 = { x: 2.46, y: 16.75 };
  const pathP3 = { x: 2.46, y: 17.73 };
  const evalPath = (t: number) => {
    const u = 1 - t;
    const x = u * u * u * pathP0.x + 3 * u * u * t * pathP1.x + 3 * u * t * t * pathP2.x + t * t * t * pathP3.x;
    const y = u * u * u * pathP0.y + 3 * u * u * t * pathP1.y + 3 * u * t * t * pathP2.y + t * t * t * pathP3.y;
    const dx = 3 * u * u * (pathP1.x - pathP0.x) + 6 * u * t * (pathP2.x - pathP1.x) + 3 * t * t * (pathP3.x - pathP2.x);
    const dy = 3 * u * u * (pathP1.y - pathP0.y) + 6 * u * t * (pathP2.y - pathP1.y) + 3 * t * t * (pathP3.y - pathP2.y);
    const len = Math.hypot(dx, dy) || 1;
    // Normal pointing to the right (+X when moving toward +Y / rear)
    return { x, y, nx: dy / len, ny: -dx / len, angle: Math.atan2(dx, dy) };
  };
  const pathHalfW = 0.44;
  const pathSteps = 20;
  const filletStartIdx = 3; // t = 0.15: blend smoothly into the berging gravel path & patio edge
  const leftFilletPt = evalPath(filletStartIdx / pathSteps);
  gravelShape.lineTo(-1.05, -gravelRearZ);
  gravelShape.quadraticCurveTo(
    pathP0.x - pathHalfW,
    -gravelRearZ,
    leftFilletPt.x - leftFilletPt.nx * pathHalfW,
    leftFilletPt.y - leftFilletPt.ny * pathHalfW
  );
  for (let i = filletStartIdx + 1; i <= pathSteps; i++) {
    const t = i / pathSteps;
    const pt = evalPath(t);
    const ex = i === pathSteps ? pathP3.x - pathHalfW : pt.x - pt.nx * pathHalfW;
    const ey = i === pathSteps ? pathP3.y : pt.y - pt.ny * pathHalfW;
    gravelShape.lineTo(ex, ey);
  }
  gravelShape.lineTo(pathP3.x + pathHalfW, pathP3.y);
  for (let i = pathSteps - 1; i >= filletStartIdx; i--) {
    const t = i / pathSteps;
    const pt = evalPath(t);
    gravelShape.lineTo(pt.x + pt.nx * pathHalfW, pt.y + pt.ny * pathHalfW);
  }
  gravelShape.quadraticCurveTo(0.33, -gravelRearZ + 0.10, 0.33, 13.80);
  // Trace around the Berging footprint (X: -3.27..0.33 at Z: -12.86..-13.72, X: -3.27..0.00 at Z: -7.73..-12.86) so gravel never clips inside it
  gravelShape.lineTo(0.33, 13.72);
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

  // Lounge Corner Terrace (5 × 6 tiles of 77 × 47 cm = 3.85 × 2.82 m in rear-right corner: X: 1.87..5.72, Z: -17.73..-20.55)
  const LOUNGE_X0 = 1.87;
  const LOUNGE_Z0 = -17.73;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 5; col++) {
      const id = `lounge_terrace_tile_${row}_${col}`;
      const tileGeo = new THREE.BoxGeometry(PATIO_TILE_X - PATIO_JOINT, 0.045, PATIO_TILE_Z - PATIO_JOINT);
      const tile = new THREE.Mesh(tileGeo, getMat('plot_patio_limestone'));
      tile.position.set(
        LOUNGE_X0 + (col + 0.5) * PATIO_TILE_X,
        0.01,
        LOUNGE_Z0 - (row + 0.5) * PATIO_TILE_Z
      );
      registerMesh(
        tile,
        'plot_patio_limestone',
        {
          id,
          label: 'Terrastegel Loungehoek Achtertuin (77 × 47 cm)',
          dimensionsLabel: '0.77 × 0.47 m',
          provenance: 'user_supplied',
          source: 'Garden layout: lounge corner terrace using matching limestone patio tiles',
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

  // Organic flagstone mosaic along the curvy garden path (varied natural rounded shapes covering most of the gravel)
  const buildRoundedPolyStone = (
    polyTV: Array<[number, number]>,
    stoneIdx: number
  ) => {
    // Map (t, v) -> local (x, y) in shape space, centered around its centroid for clean staggered animation
    const worldPts = polyTV.map(([t, v]) => {
      const pt = evalPath(t);
      return [pt.x + pt.nx * v, pt.y + pt.ny * v] as [number, number];
    });
    const cx = worldPts.reduce((acc, p) => acc + p[0], 0) / worldPts.length;
    const cy = worldPts.reduce((acc, p) => acc + p[1], 0) / worldPts.length;
    const localPts = worldPts.map(([x, y]) => [x - cx, y - cy] as [number, number]);

    const shape = new THREE.Shape();
    const n = localPts.length;
    for (let i = 0; i < n; i++) {
      const prev = localPts[(i - 1 + n) % n];
      const curr = localPts[i];
      const next = localPts[(i + 1) % n];
      const v1x = prev[0] - curr[0];
      const v1y = prev[1] - curr[1];
      const v2x = next[0] - curr[0];
      const v2y = next[1] - curr[1];
      const l1 = Math.hypot(v1x, v1y) || 1;
      const l2 = Math.hypot(v2x, v2y) || 1;
      const r = Math.min(0.055, l1 * 0.34, l2 * 0.34);
      const pStart: [number, number] = [curr[0] + (v1x / l1) * r, curr[1] + (v1y / l1) * r];
      const pEnd: [number, number] = [curr[0] + (v2x / l2) * r, curr[1] + (v2y / l2) * r];
      if (i === 0) shape.moveTo(pStart[0], pStart[1]);
      else shape.lineTo(pStart[0], pStart[1]);
      shape.quadraticCurveTo(curr[0], curr[1], pEnd[0], pEnd[1]);
    }
    shape.closePath();

    const stoneGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.045,
      bevelEnabled: false,
    });
    stoneGeo.rotateX(-Math.PI / 2);
    const stone = new THREE.Mesh(stoneGeo, getMat('plot_stepping_stone'));
    stone.position.set(cx, -0.0125, -cy);

    const id = `garden_path_stone_${stoneIdx}`;
    registerMesh(
      stone,
      'plot_stepping_stone',
      {
        id,
        label: 'Stapsteen Tuinpad naar Loungehoek',
        dimensionsLabel: 'Natuursteen stapsteen',
        provenance: 'user_supplied',
        source: 'Garden layout: natural-shaped stepping-stone mosaic connecting berging gravel path to lounge terrace',
        floor: 'ground',
        category: 'furniture',
      },
      false,
      true
    );
    groundGroup.add(stone);
    registerStaggered(id, stone, 'ground', -0.0125);
  };

  // True 2D Voronoi flagstone mosaic in path-local (u, v) space (u: 0..L along curve, v: -0.40..+0.40 across)
  let pathLen = 0;
  {
    let prev = evalPath(0);
    for (let i = 1; i <= 40; i++) {
      const cur = evalPath(i / 40);
      pathLen += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      prev = cur;
    }
  }
  const pathVMax = 0.40;
  let vs = (4242 * 1664525 + 1013904223) >>> 0;
  const vRand = () => {
    vs = (vs * 1664525 + 1013904223) >>> 0;
    return vs / 4294967296;
  };

  // Non-uniform natural seed distribution: mix of wide-spaced central stones and offset medium/small stones
  const voronoiSeeds: Array<[number, number]> = [];
  let uCursor = 0.20;
  while (uCursor < pathLen - 0.12) {
    const roll = vRand();
    if (roll < 0.42) {
      // Single large full-width flagstone
      voronoiSeeds.push([uCursor, (vRand() - 0.5) * 0.22]);
      uCursor += 0.44 + vRand() * 0.14;
    } else if (roll < 0.80) {
      // Two staggered medium stones
      const side = vRand() < 0.5 ? 1 : -1;
      voronoiSeeds.push([uCursor - 0.04 + vRand() * 0.08, side * (0.16 + vRand() * 0.12)]);
      voronoiSeeds.push([uCursor + 0.12 + vRand() * 0.10, -side * (0.16 + vRand() * 0.12)]);
      uCursor += 0.48 + vRand() * 0.14;
    } else {
      // One medium-large stone + one smaller corner stone
      const side = vRand() < 0.5 ? 1 : -1;
      voronoiSeeds.push([uCursor, -side * (0.08 + vRand() * 0.12)]);
      voronoiSeeds.push([uCursor + 0.08 + vRand() * 0.10, side * (0.24 + vRand() * 0.08)]);
      uCursor += 0.40 + vRand() * 0.12;
    }
  }

  // Sutherland-Hodgman half-plane clip of a convex polygon against (P - M) · N <= 0
  const clipHalfPlane = (
    poly: Array<[number, number]>,
    mx: number,
    my: number,
    nx: number,
    ny: number
  ): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    const len = poly.length;
    for (let i = 0; i < len; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % len];
      const da = (a[0] - mx) * nx + (a[1] - my) * ny;
      const db = (b[0] - mx) * nx + (b[1] - my) * ny;
      if (da <= 0) {
        out.push(a);
        if (db > 0) {
          const frac = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
        }
      } else if (db <= 0) {
        const frac = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
      }
    }
    return out;
  };

  let stoneCounter = 0;
  for (let i = 0; i < voronoiSeeds.length; i++) {
    const [ui, vi] = voronoiSeeds[i];
    let cell: Array<[number, number]> = [
      [0.03, -pathVMax],
      [pathLen - 0.03, -pathVMax],
      [pathLen - 0.03, pathVMax],
      [0.03, pathVMax],
    ];
    for (let j = 0; j < voronoiSeeds.length; j++) {
      if (i === j) continue;
      const [uj, vj] = voronoiSeeds[j];
      cell = clipHalfPlane(cell, (ui + uj) * 0.5, (vi + vj) * 0.5, uj - ui, vj - vi);
      if (cell.length < 3) break;
    }
    if (cell.length < 3) continue;

    // Inset cell uniformly toward its centroid for ~4.5 cm gravel joints, and map (u, v) -> (t, v)
    const cu = cell.reduce((acc, p) => acc + p[0], 0) / cell.length;
    const cv = cell.reduce((acc, p) => acc + p[1], 0) / cell.length;
    const insetCell = cell.map(([u, v]) => {
      const du = u - cu;
      const dv = v - cv;
      const d = Math.hypot(du, dv) || 1;
      const scale = Math.max(0.55, 1 - 0.025 / d);
      return [(cu + du * scale) / pathLen, cv + dv * scale] as [number, number];
    });
    buildRoundedPolyStone(insetCell, stoneCounter++);
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

  // 4. BUSH-CLUSTER ARCHITECTURAL DIORAMA HEDGES ALONG LEFT & FRONT BOUNDARIES
  // Left boundary splits at the Garden Gate ("Tuinpoort", Z = -13.72 m):
  // - Front/side section (Z: +4.92 -> -13.72 m): 90 cm (0.90 m) tall
  // - Rear/garden section (Z: -13.72 -> -20.55 m): 210 cm (2.10 m) tall
  const gateZ = -13.72;
  const gateBoundaryX = leftBoundaryXAtZ(gateZ) + 0.18;

  buildBushHedgeSegment(plotGroup, getMat, registerMesh, {
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

  buildBushHedgeSegment(plotGroup, getMat, registerMesh, {
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
  buildBushHedgeSegment(plotGroup, getMat, registerMesh, {
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
  buildBushHedgeSegment(plotGroup, getMat, registerMesh, {
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
  addStylisedDioramaTree(plotGroup, getMat, -1.65, -17.65, 3.6, 1.65, 'plot_tree_foliage_sage', 'plot_tree_trunk', 20);
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

  // Flowering bushes along the left driveway grass strip next to the 90 cm beech hedge
  buildDrivewayEdgeBushes(plotGroup, getMat, registerMesh, leftBoundaryXAtZ);

  // Back garden curved soil borders with low-polygon bushes, flowers & ornamental grasses
  buildBackGardenFlowerBorders(plotGroup, getMat, registerMesh, leftBoundaryXAtZ);

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
    x0: rightX + 0.05,
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

  const shrubMesh = new THREE.Mesh(mergeGeometries(shrubGeos, false), getMat('plot_hedge_beech'));
  registerMesh(
    shrubMesh,
    'plot_hedge_beech',
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

/**
 * Build flowering bushes along the grass strip between the left boundary beech hedge
 * and the driveway gravel (Z: +2.85 m back to -4.90 m), matching the reference photo:
 * yellow-flowering green shrubs near the street, lavender-blue hydrangeas further back.
 */
function buildDrivewayEdgeBushes(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  leftBoundaryXAtZ: (z: number) => number
) {
  let s = (808 * 1664525 + 1013904223) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const shrubGeos: THREE.BufferGeometry[] = [];
  const yellowFlowerGeos: THREE.BufferGeometry[] = [];
  const lavenderFlowerGeos: THREE.BufferGeometry[] = [];

  const bushes: Array<{
    z: number;
    rx: number;
    ry: number;
    rz: number;
    yellowCount: number;
    lavenderCount: number;
  }> = [
    // First natural cluster of bushes & flowers, then a wide open grass stretch, then one lone bush near the garage
    { z: 2.35, rx: 0.36, ry: 0.58, rz: 0.44, yellowCount: 12, lavenderCount: 0 },
    { z: 1.48, rx: 0.38, ry: 0.62, rz: 0.48, yellowCount: 0, lavenderCount: 16 },
    { z: 0.72, rx: 0.32, ry: 0.48, rz: 0.38, yellowCount: 0, lavenderCount: 11 },
    { z: -3.85, rx: 0.38, ry: 0.58, rz: 0.46, yellowCount: 0, lavenderCount: 14 },
  ];

  for (const bush of bushes) {
    const hedgeInnerX = leftBoundaryXAtZ(bush.z) + 0.35;
    const gravelLeftX = -3.45;
    const cx = (hedgeInnerX + gravelLeftX) * 0.5 - 0.08;

    const numPuffs = 6;
    for (let i = 0; i < numPuffs; i++) {
      const a = (i / numPuffs) * Math.PI * 2 + rand() * 0.5;
      const dist = i === 0 ? 0 : (0.34 + rand() * 0.34);
      const px = cx + Math.cos(a) * bush.rx * dist;
      const pz = bush.z + Math.sin(a) * bush.rz * dist;
      const r = (i === 0 ? 0.72 : 0.48 + rand() * 0.16) * Math.min(bush.rx, bush.rz);
      const py = 0.02 + bush.ry * (i === 0 ? 0.50 : 0.34 + rand() * 0.18);

      const puff = new THREE.IcosahedronGeometry(r, 1);
      puff.scale(1.0 + rand() * 0.18, (bush.ry / Math.max(0.18, r)) * 0.74, 1.0 + rand() * 0.18);
      puff.rotateY(rand() * Math.PI * 2);
      puff.translate(px, py, pz);
      shrubGeos.push(puff);
    }

    const addBlossoms = (count: number, target: THREE.BufferGeometry[], radiusScale: number) => {
      for (let b = 0; b < count; b++) {
        const theta = rand() * Math.PI * 2;
        const phi = rand() * Math.PI * 0.44;
        const bx = cx + Math.sin(phi) * Math.cos(theta) * bush.rx * 0.88;
        const bz = bush.z + Math.sin(phi) * Math.sin(theta) * bush.rz * 0.88;
        const by = 0.04 + Math.cos(phi) * bush.ry * 0.94;
        const br = (0.045 + rand() * 0.035) * radiusScale;
        const blossom = new THREE.IcosahedronGeometry(br, 1);
        blossom.rotateY(rand() * Math.PI);
        blossom.translate(bx, by, bz);
        target.push(blossom);
      }
    };

    addBlossoms(bush.yellowCount, yellowFlowerGeos, 1.0);
    addBlossoms(bush.lavenderCount, lavenderFlowerGeos, 1.35);
  }

  const shrubMesh = new THREE.Mesh(mergeGeometries(shrubGeos, false), getMat('plot_hedge_beech'));
  registerMesh(
    shrubMesh,
    'plot_hedge_beech',
    {
      id: 'driveway_edge_bushes',
      label: 'Struiken & Hortensia’s langs Oprit (Linkererfgrens)',
      dimensionsLabel: '0.85 × 7.90 m',
      provenance: 'user_supplied',
      source: 'Referentiefoto oprit: groene struiken en hortensia’s langs de linker beukenhaag',
      floor: 'plot',
    },
    true,
    true
  );
  group.add(shrubMesh);

  if (yellowFlowerGeos.length > 0) {
    const yellowMesh = new THREE.Mesh(mergeGeometries(yellowFlowerGeos, false), getMat('plot_tree_foliage_warm'));
    yellowMesh.castShadow = true;
    group.add(yellowMesh);
  }

  if (lavenderFlowerGeos.length > 0) {
    const lavenderMesh = new THREE.Mesh(mergeGeometries(lavenderFlowerGeos, false), getMat('plot_flower_lavender'));
    lavenderMesh.castShadow = true;
    lavenderMesh.receiveShadow = true;
    group.add(lavenderMesh);
  }
}

/**
 * Build three curved brown-soil flower borders in the back garden (left beech-hedge border,
 * rear-center kidney bed, and right schutting wavy border), matching the front garden's
 * low-polygon shrubs, flowers, and ornamental grass plumes.
 */
function buildBackGardenFlowerBorders(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  leftBoundaryXAtZ: (z: number) => number
) {
  let s = (1213 * 1664525 + 1013904223) >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // 1. Left hedge border soil bed (Z: -14.85 -> -20.45 m, slim border)
  const leftSteps = 18;
  const leftZ0 = -14.85;
  const leftZ1 = -20.45;
  const leftBedShape = new THREE.Shape();
  for (let i = 0; i <= leftSteps; i++) {
    const t = i / leftSteps;
    const z = leftZ0 + (leftZ1 - leftZ0) * t;
    const x = leftBoundaryXAtZ(z) + 0.36;
    if (i === 0) leftBedShape.moveTo(x, -z);
    else leftBedShape.lineTo(x, -z);
  }
  for (let i = leftSteps; i >= 0; i--) {
    const t = i / leftSteps;
    const z = leftZ0 + (leftZ1 - leftZ0) * t;
    const endTaper = Math.sin(t * Math.PI);
    const width = 0.16 + (0.38 + 0.08 * Math.sin(t * Math.PI * 3.0)) * Math.pow(endTaper, 0.35);
    const x = leftBoundaryXAtZ(z) + 0.36 + width;
    leftBedShape.lineTo(x, -z);
  }
  leftBedShape.closePath();

  // 2. Rear-center kidney soil bed (X: -1.65 -> +1.15 m, Z: -20.52 -> -19.68 m)
  const rearBedShape = new THREE.Shape();
  const rearSteps = 18;
  const rearX0 = -1.65;
  const rearX1 = 1.15;
  rearBedShape.moveTo(rearX0, 20.52);
  rearBedShape.lineTo(rearX1, 20.52);
  for (let i = rearSteps; i >= 0; i--) {
    const t = i / rearSteps;
    const x = rearX0 + (rearX1 - rearX0) * t;
    const lobe = Math.sin(t * Math.PI);
    const depth = 0.12 + 0.72 * Math.pow(lobe, 0.65);
    rearBedShape.lineTo(x, 20.52 - depth);
  }
  rearBedShape.closePath();

  // 3. Right fence wavy soil bed (Z: -14.00 -> -17.55 m, slim border)
  const rightBedShape = new THREE.Shape();
  const rightSteps = 18;
  const rightZ0 = -14.00;
  const rightZ1 = -17.55;
  rightBedShape.moveTo(5.80, -rightZ0);
  rightBedShape.lineTo(5.80, -rightZ1);
  for (let i = rightSteps; i >= 0; i--) {
    const t = i / rightSteps;
    const z = rightZ0 + (rightZ1 - rightZ0) * t;
    const endTaper = Math.pow(Math.sin(t * Math.PI), 0.35);
    const wave = 0.46 + 0.18 * Math.abs(Math.sin(t * Math.PI * 2.0));
    const x = 5.80 - (0.14 + wave * endTaper);
    rightBedShape.lineTo(x, -z);
  }
  rightBedShape.closePath();

  const soilGeos = [leftBedShape, rearBedShape, rightBedShape].map((shape) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const soilMesh = new THREE.Mesh(mergeGeometries(soilGeos, false), getMat('plot_soil_border'));
  registerMesh(
    soilMesh,
    'plot_soil_border',
    {
      id: 'back_garden_soil_borders',
      label: 'Bloemperken Achtertuin (Bruine Teelaarde)',
      dimensionsLabel: '3 borders (links, achter, rechts)',
      provenance: 'user_supplied',
      source: 'Garden layout: organic brown-soil flower borders matching front garden style',
      floor: 'plot',
    },
    false,
    true
  );
  group.add(soilMesh);

  const shrubGeos: THREE.BufferGeometry[] = [];
  const yellowFlowerGeos: THREE.BufferGeometry[] = [];
  const lavenderFlowerGeos: THREE.BufferGeometry[] = [];
  const whiteFlowerGeos: THREE.BufferGeometry[] = [];
  const grassPlumeGeos: THREE.BufferGeometry[] = [];

  const addPlantCluster = (
    cx: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    flowerType: 'white' | 'lavender' | 'yellow' | 'grass' | 'none',
    flowerCount: number
  ) => {
    const numPuffs = 5;
    for (let i = 0; i < numPuffs; i++) {
      const a = (i / numPuffs) * Math.PI * 2 + rand() * 0.6;
      const dist = i === 0 ? 0 : 0.34 + rand() * 0.34;
      const px = cx + Math.cos(a) * rx * dist;
      const pz = cz + Math.sin(a) * rz * dist;
      const r = (i === 0 ? 0.68 : 0.48 + rand() * 0.16) * Math.min(rx, rz);
      const py = 0.04 + ry * (i === 0 ? 0.48 : 0.32 + rand() * 0.18);

      const puff = new THREE.IcosahedronGeometry(r, 1);
      puff.scale(1.0 + rand() * 0.18, (ry / Math.max(0.15, r)) * 0.72, 1.0 + rand() * 0.18);
      puff.rotateY(rand() * Math.PI * 2);
      puff.translate(px, py, pz);
      shrubGeos.push(puff);
    }

    if (flowerType === 'grass') {
      const numPlumes = 10;
      const gh = ry * 2.1;
      for (let p = 0; p < numPlumes; p++) {
        const ang = (p / numPlumes) * Math.PI * 2 + rand() * 0.4;
        const spread = 0.07 + rand() * 0.2;
        const px = cx + Math.cos(ang) * spread;
        const pz = cz + Math.sin(ang) * spread;
        const py = gh * (0.52 + rand() * 0.4);
        const pr = 0.06 + rand() * 0.04;
        const plume = new THREE.IcosahedronGeometry(pr, 1);
        plume.scale(0.85, 1.6 + rand() * 0.4, 0.85);
        plume.rotateZ((rand() - 0.5) * 0.35);
        plume.rotateX((rand() - 0.5) * 0.35);
        plume.translate(px, py, pz);
        grassPlumeGeos.push(plume);
      }
      return;
    }

    if (flowerType === 'none' || flowerCount <= 0) return;
    const target =
      flowerType === 'lavender'
        ? lavenderFlowerGeos
        : flowerType === 'white'
          ? whiteFlowerGeos
          : yellowFlowerGeos;
    const radiusScale = flowerType === 'yellow' ? 1.0 : 1.3;

    for (let b = 0; b < flowerCount; b++) {
      const theta = rand() * Math.PI * 2;
      const phi = rand() * Math.PI * 0.44;
      const bx = cx + Math.sin(phi) * Math.cos(theta) * rx * 0.86;
      const bz = cz + Math.sin(phi) * Math.sin(theta) * rz * 0.86;
      const by = 0.05 + Math.cos(phi) * ry * 0.94;
      const br = (0.044 + rand() * 0.032) * radiusScale;
      const blossom = new THREE.IcosahedronGeometry(br, 1);
      blossom.rotateY(rand() * Math.PI);
      blossom.translate(bx, by, bz);
      target.push(blossom);
    }
  };

  // Left border plantings (along Z: -15.20 -> -20.15 m)
  const leftPlants: Array<{ z: number; rx: number; ry: number; rz: number; type: 'white' | 'lavender' | 'yellow' | 'grass'; count: number }> = [
    { z: -15.25, rx: 0.32, ry: 0.48, rz: 0.36, type: 'white', count: 14 },
    { z: -16.05, rx: 0.34, ry: 0.52, rz: 0.38, type: 'lavender', count: 16 },
    { z: -16.85, rx: 0.30, ry: 0.42, rz: 0.34, type: 'yellow', count: 12 },
    { z: -17.65, rx: 0.35, ry: 0.54, rz: 0.38, type: 'white', count: 15 },
    { z: -18.50, rx: 0.34, ry: 0.50, rz: 0.38, type: 'lavender', count: 16 },
    { z: -19.35, rx: 0.32, ry: 0.46, rz: 0.36, type: 'white', count: 13 },
    { z: -20.05, rx: 0.30, ry: 0.46, rz: 0.32, type: 'grass', count: 0 },
  ];
  for (const p of leftPlants) {
    const cx = leftBoundaryXAtZ(p.z) + 0.62;
    addPlantCluster(cx, p.z, p.rx, p.ry, p.rz, p.type, p.count);
  }

  // Rear-center kidney border plantings
  addPlantCluster(-1.05, -20.15, 0.32, 0.46, 0.30, 'lavender', 14);
  addPlantCluster(-0.32, -20.02, 0.34, 0.50, 0.32, 'grass', 0);
  addPlantCluster(0.32, -20.05, 0.32, 0.50, 0.32, 'white', 15);
  addPlantCluster(0.85, -20.18, 0.28, 0.42, 0.28, 'yellow', 11);

  // Right fence wavy border plantings (Z: -14.35 -> -17.20 m)
  addPlantCluster(5.48, -14.40, 0.30, 0.48, 0.34, 'white', 14);
  addPlantCluster(5.42, -15.05, 0.30, 0.48, 0.32, 'grass', 0);
  addPlantCluster(5.50, -15.75, 0.30, 0.46, 0.32, 'lavender', 14);
  addPlantCluster(5.44, -16.45, 0.32, 0.52, 0.34, 'white', 15);
  addPlantCluster(5.50, -17.12, 0.28, 0.44, 0.30, 'grass', 0);

  const shrubMesh = new THREE.Mesh(mergeGeometries(shrubGeos, false), getMat('plot_hedge_beech'));
  registerMesh(
    shrubMesh,
    'plot_hedge_beech',
    {
      id: 'back_garden_flower_borders',
      label: 'Beplanting Achtertuin (Struiken, Bloemen & Siergras)',
      dimensionsLabel: '3 bloemperken',
      provenance: 'user_supplied',
      source: 'Garden layout: low-polygon bushes, hydrangeas, yellow flowers & ornamental grasses',
      floor: 'plot',
    },
    true,
    true
  );
  group.add(shrubMesh);

  if (yellowFlowerGeos.length > 0) {
    const yellowMesh = new THREE.Mesh(mergeGeometries(yellowFlowerGeos, false), getMat('plot_tree_foliage_warm'));
    yellowMesh.castShadow = true;
    group.add(yellowMesh);
  }
  if (lavenderFlowerGeos.length > 0) {
    const lavenderMesh = new THREE.Mesh(mergeGeometries(lavenderFlowerGeos, false), getMat('plot_flower_lavender'));
    lavenderMesh.castShadow = true;
    lavenderMesh.receiveShadow = true;
    group.add(lavenderMesh);
  }
  if (whiteFlowerGeos.length > 0) {
    const whiteMesh = new THREE.Mesh(mergeGeometries(whiteFlowerGeos, false), getMat('plot_tree_foliage_blossom'));
    whiteMesh.castShadow = true;
    whiteMesh.receiveShadow = true;
    group.add(whiteMesh);
  }
  if (grassPlumeGeos.length > 0) {
    const grassMesh = new THREE.Mesh(mergeGeometries(grassPlumeGeos, false), getMat('plot_tree_stake_wood'));
    grassMesh.castShadow = true;
    grassMesh.receiveShadow = true;
    group.add(grassMesh);
  }
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
 * For `room_ff_overloop` and `room_sf_overloop`, cuts out the exact stairwell (`trapgat`) and
 * top-step exit pocket so the white double-90°-turn staircase below arrives cleanly without clipping.
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
    const isFirstFloor = room.id === 'room_ff_overloop';
    const stairMaxX = 2.94;
    const stairMinZ = -4.81;
    const exitMinX = 2.09;
    const exitMinZ = isFirstFloor ? -5.22 : -5.16;

    const shape = new THREE.Shape();
    // Trace Overloop around the stairwell & exit run in (X, -Z) coordinates
    shape.moveTo(minX, -minZ);
    shape.lineTo(maxX, -minZ);
    if (maxX > stairMaxX + 0.02) {
      shape.lineTo(maxX, -maxZ);
      shape.lineTo(stairMaxX, -maxZ);
      shape.lineTo(stairMaxX, -exitMinZ);
      shape.lineTo(exitMinX, -exitMinZ);
      shape.lineTo(exitMinX, -stairMinZ);
      shape.lineTo(minX, -stairMinZ);
    } else {
      shape.lineTo(maxX, -exitMinZ);
      shape.lineTo(exitMinX, -exitMinZ);
      shape.lineTo(exitMinX, -stairMinZ);
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
  const centerX = (minX + maxX) / 2;
  const centerY = room.elevationY - finishThickness / 2 + 0.005;
  const centerZ = (minZ + maxZ) / 2;

  const finishGeo = new THREE.BoxGeometry(width, finishThickness, depth);
  if (room.topMaterial === 'floor_ground_tile') {
    applyWorldFloorTileUVs(finishGeo, centerX, centerY, centerZ);
  }
  const finishMesh = new THREE.Mesh(finishGeo, getMat(room.topMaterial));
  finishMesh.position.set(centerX, centerY, centerZ);
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
  // with stairwell opening at X: 0.40..2.94, Z: -4.81..-3.96 and exit pocket X: 2.09..2.94, Z: -5.22..-4.81)
  const ffParts: Array<[number, number, number, number]> = [
    [0.40, -3.96, 5.57, -0.40],
    [0.40, -10.06, 5.57, -5.22],
    [0.40, -5.22, 2.09, -4.81],
    [2.94, -5.22, 5.57, -3.96],
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
  // matching the 1st-floor stairwell opening at X: 0.40..2.94, Z: -4.81..-3.96 and exit pocket X: 2.09..2.94, Z: -5.16..-4.81)
  const sfParts: Array<[number, number, number, number]> = [
    [0.40, -3.96, 5.57, -0.40],
    [0.40, -10.06, 5.57, -5.16],
    [0.40, -5.16, 2.09, -4.81],
    [2.94, -5.16, 5.57, -3.96],
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
 * Split upward-facing top-of-wall triangles from an extruded wall geometry so
 * exterior brick walls get a clean white cutaway cap on top (without affecting window sills).
 */
function splitWallTopCapGeometry(
  geo: THREE.BufferGeometry,
  openingRects: Array<{ u0: number; u1: number; v0: number; v1: number }>
): { mainGeo: THREE.BufferGeometry; topCapGeo: THREE.BufferGeometry | null } {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const triCount = Math.floor(pos.count / 3);

  const mainPos: number[] = [];
  const mainNorm: number[] = [];
  const topPos: number[] = [];
  const topNorm: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    const x0 = pos.getX(i0), y0 = pos.getY(i0), z0 = pos.getZ(i0);
    const x1 = pos.getX(i1), y1 = pos.getY(i1), z1 = pos.getZ(i1);
    const x2 = pos.getX(i2), y2 = pos.getY(i2), z2 = pos.getZ(i2);

    const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
    const vx = x2 - x0, vy = y2 - y0, vz = z2 - z0;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const nyUnit = ny / nLen;

    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const isOpeningSill = openingRects.some(
      (r) => Math.abs(cy - r.v0) < 0.02 && cx >= r.u0 - 0.02 && cx <= r.u1 + 0.02
    );

    const isTopCap = nyUnit > 0.45 && cy > 0.05 && !isOpeningSill;
    const targetPos = isTopCap ? topPos : mainPos;
    const targetNorm = isTopCap ? topNorm : mainNorm;

    for (const idx of [i0, i1, i2]) {
      targetPos.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      if (norm) {
        targetNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
      }
    }
  }

  if (topPos.length === 0) {
    return { mainGeo: geo, topCapGeo: null };
  }

  const mainGeo = new THREE.BufferGeometry();
  mainGeo.setAttribute('position', new THREE.Float32BufferAttribute(mainPos, 3));
  if (mainNorm.length > 0) {
    mainGeo.setAttribute('normal', new THREE.Float32BufferAttribute(mainNorm, 3));
  }
  mainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((mainPos.length / 3) * 2), 2));

  const topCapGeo = new THREE.BufferGeometry();
  topCapGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  if (topNorm.length > 0) {
    topCapGeo.setAttribute('normal', new THREE.Float32BufferAttribute(topNorm, 3));
  }

  geo.dispose();
  return { mainGeo, topCapGeo };
}

/**
 * Build a watertight prism geometry for a roof-clipped wall (with optional rectangular openings),
 * placing exact break vertices along any roof ridge / valley (Kielkeper) intersections so
 * mitered corners and ridge junctions triangulate cleanly onto flat planes.
 */
function buildClippedWallPrismGeometry(
  wall: WallSpec,
  length: number,
  dx: number,
  dz: number,
  bottomY: number,
  clipTopHeightAt: (u: number, lz: number) => number,
  openingRects: Array<{ u0: number; u1: number; v0: number; v1: number }> = []
): THREE.BufferGeometry {
  const halfT = wall.thickness / 2;
  const ux = dx / length;
  const uz = dz / length;
  const nx = -dz / length;
  const nz = dx / length;

  const { ridgeX, rightPartyX, nbRidgeZ, nbFrontEavesZ } = ROOF_SPEC;
  const spanX = rightPartyX - ridgeX;
  const spanZ = nbFrontEavesZ - nbRidgeZ;
  const foldLines: Array<[number, number, number]> = [
    [1, 0, -ridgeX],
    [0, 1, -nbRidgeZ],
    [spanZ, -spanX, -spanZ * ridgeX + spanX * nbRidgeZ],
    [spanZ, spanX, -spanZ * ridgeX - spanX * nbRidgeZ],
  ];

  const dedupeSorted = (vals: number[]): number[] => {
    const sorted = [...vals].sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      if (out.length === 0 || v - out[out.length - 1] > 1e-4) {
        out.push(v);
      }
    }
    return out;
  };

  const uCandidates: number[] = [];
  const baseSteps = 24;
  for (let i = 0; i <= baseSteps; i++) {
    uCandidates.push((i / baseSteps) * length);
  }
  for (const op of openingRects) {
    uCandidates.push(op.u0, op.u1);
  }
  for (const lz of [-halfT, 0, halfT]) {
    const sx = wall.start[0] + lz * nx;
    const sz = wall.start[1] + lz * nz;
    for (const [a, b, c] of foldLines) {
      const denom = a * ux + b * uz;
      if (Math.abs(denom) > 1e-6) {
        const u = -(a * sx + b * sz + c) / denom;
        if (u > 1e-4 && u < length - 1e-4) {
          uCandidates.push(u);
        }
      }
    }
  }
  const uBreaks = dedupeSorted(uCandidates);

  const lzCandidates: number[] = [-halfT, halfT];
  for (const u of uBreaks) {
    const px = wall.start[0] + u * ux;
    const pz = wall.start[1] + u * uz;
    for (const [a, b, c] of foldLines) {
      const denom = a * nx + b * nz;
      if (Math.abs(denom) > 1e-6) {
        const lz = -(a * px + b * pz + c) / denom;
        if (lz > -halfT + 1e-4 && lz < halfT - 1e-4) {
          lzCandidates.push(lz);
        }
      }
    }
  }
  const lzBreaks = dedupeSorted(lzCandidates);

  const heights: number[][] = uBreaks.map((u) =>
    lzBreaks.map((lz) => clipTopHeightAt(u, lz))
  );

  const pos: number[] = [];
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };

  // Top surface (+Y) with exact roof-crease diagonal selection
  for (let i = 0; i < uBreaks.length - 1; i++) {
    const u0 = uBreaks[i];
    const u1 = uBreaks[i + 1];
    for (let j = 0; j < lzBreaks.length - 1; j++) {
      const lz0 = lzBreaks[j];
      const lz1 = lzBreaks[j + 1];
      const hA = heights[i][j];
      const hB = heights[i + 1][j];
      const hC = heights[i + 1][j + 1];
      const hD = heights[i][j + 1];
      const hCenter = clipTopHeightAt(0.5 * (u0 + u1), 0.5 * (lz0 + lz1));
      const splitAC = Math.abs(0.5 * (hA + hC) - hCenter) <= Math.abs(0.5 * (hB + hD) - hCenter);
      if (splitAC) {
        pushTri(u0, hA, lz0, u0, hD, lz1, u1, hC, lz1);
        pushTri(u0, hA, lz0, u1, hC, lz1, u1, hB, lz0);
      } else {
        pushTri(u1, hB, lz0, u0, hA, lz0, u0, hD, lz1);
        pushTri(u1, hB, lz0, u0, hD, lz1, u1, hC, lz1);
      }
    }
  }

  // Front (+halfT), Back (-halfT), Bottom (-Y), and opening sill/lintel faces
  const lastLz = lzBreaks.length - 1;
  for (let i = 0; i < uBreaks.length - 1; i++) {
    const u0 = uBreaks[i];
    const u1 = uBreaks[i + 1];
    const uMid = 0.5 * (u0 + u1);
    const hf0 = heights[i][lastLz];
    const hf1 = heights[i + 1][lastLz];
    const hb0 = heights[i][0];
    const hb1 = heights[i + 1][0];
    const op = openingRects.find((r) => uMid > r.u0 && uMid < r.u1);

    if (!op) {
      pushTri(u0, bottomY, halfT, u1, bottomY, halfT, u1, hf1, halfT);
      pushTri(u0, bottomY, halfT, u1, hf1, halfT, u0, hf0, halfT);
      pushTri(u1, bottomY, -halfT, u0, bottomY, -halfT, u0, hb0, -halfT);
      pushTri(u1, bottomY, -halfT, u0, hb0, -halfT, u1, hb1, -halfT);
      pushTri(u0, bottomY, -halfT, u1, bottomY, -halfT, u1, bottomY, halfT);
      pushTri(u0, bottomY, -halfT, u1, bottomY, halfT, u0, bottomY, halfT);
    } else {
      if (op.v0 > bottomY + 1e-4) {
        pushTri(u0, bottomY, halfT, u1, bottomY, halfT, u1, op.v0, halfT);
        pushTri(u0, bottomY, halfT, u1, op.v0, halfT, u0, op.v0, halfT);
        pushTri(u1, bottomY, -halfT, u0, bottomY, -halfT, u0, op.v0, -halfT);
        pushTri(u1, bottomY, -halfT, u0, op.v0, -halfT, u1, op.v0, -halfT);
        pushTri(u0, bottomY, -halfT, u1, bottomY, -halfT, u1, bottomY, halfT);
        pushTri(u0, bottomY, -halfT, u1, bottomY, halfT, u0, bottomY, halfT);
        // Sill (+Y)
        pushTri(u0, op.v0, -halfT, u0, op.v0, halfT, u1, op.v0, halfT);
        pushTri(u0, op.v0, -halfT, u1, op.v0, halfT, u1, op.v0, -halfT);
      }
      // Header above opening
      pushTri(u0, op.v1, halfT, u1, op.v1, halfT, u1, hf1, halfT);
      pushTri(u0, op.v1, halfT, u1, hf1, halfT, u0, hf0, halfT);
      pushTri(u1, op.v1, -halfT, u0, op.v1, -halfT, u0, hb0, -halfT);
      pushTri(u1, op.v1, -halfT, u0, hb0, -halfT, u1, hb1, -halfT);
      // Lintel underside (-Y)
      pushTri(u0, op.v1, -halfT, u1, op.v1, -halfT, u1, op.v1, halfT);
      pushTri(u0, op.v1, -halfT, u1, op.v1, halfT, u0, op.v1, halfT);
    }
  }

  // Opening vertical jambs
  for (const op of openingRects) {
    // Left jamb at u0 (+X normal)
    pushTri(op.u0, op.v0, halfT, op.u0, op.v0, -halfT, op.u0, op.v1, -halfT);
    pushTri(op.u0, op.v0, halfT, op.u0, op.v1, -halfT, op.u0, op.v1, halfT);
    // Right jamb at u1 (-X normal)
    pushTri(op.u1, op.v0, -halfT, op.u1, op.v0, halfT, op.u1, op.v1, halfT);
    pushTri(op.u1, op.v0, -halfT, op.u1, op.v1, halfT, op.u1, op.v1, -halfT);
  }

  // Start (u = 0) & End (u = length) end-caps
  const lastU = uBreaks.length - 1;
  for (let j = 0; j < lzBreaks.length - 1; j++) {
    const lz0 = lzBreaks[j];
    const lz1 = lzBreaks[j + 1];
    const hs0 = heights[0][j];
    const hs1 = heights[0][j + 1];
    pushTri(0, bottomY, lz0, 0, bottomY, lz1, 0, hs1, lz1);
    pushTri(0, bottomY, lz0, 0, hs1, lz1, 0, hs0, lz0);

    const he0 = heights[lastU][j];
    const he1 = heights[lastU][j + 1];
    pushTri(length, bottomY, lz1, length, bottomY, lz0, length, he0, lz0);
    pushTri(length, bottomY, lz1, length, he0, lz0, length, he1, lz1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
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

  const clipTopHeightAt = (u: number, lz: number): number => {
    const t = length > 0 ? u / length : 0;
    const worldX = wall.start[0] + t * dx + lz * (-dz / length);
    const worldZ = wall.start[1] + t * dz + lz * (dx / length);
    const maxH = getZolderRoofUndersideY(worldX, worldZ) - wall.baseY - 0.004;
    return Math.min(wall.height, maxH);
  };

  if (wall.gablePeak) {
    shape.lineTo(length, wall.height);
    shape.lineTo(wall.gablePeak.offsetAlongWall, wall.gablePeak.peakHeight);
    shape.lineTo(0, wall.height);
  } else if (wall.clipToRoof) {
    const steps = 32;
    const halfT = wall.thickness / 2;
    for (let i = steps; i >= 0; i--) {
      const u = (i / steps) * length;
      const topH = Math.max(
        clipTopHeightAt(u, -halfT),
        clipTopHeightAt(u, 0),
        clipTopHeightAt(u, halfT)
      );
      shape.lineTo(u, topH);
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
      const holeBottomMin = extendsDownBesideSlab ? -0.02 : 0.004;
      const v0 = Math.max(holeBottomMin, resolved.sillHeight);
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

  let baseWallGeo: THREE.BufferGeometry;
  if (wall.clipToRoof) {
    baseWallGeo = buildClippedWallPrismGeometry(
      wall,
      length,
      dx,
      dz,
      bottomY,
      clipTopHeightAt,
      openingRects
    );
  } else {
    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: wall.thickness,
      bevelEnabled: false,
    });
    extrudeGeo.translate(0, 0, -wall.thickness / 2);
    baseWallGeo = extrudeGeo;
  }

  const matId = wall.isExterior ? wall.exteriorMaterial : wall.interiorMaterial;
  let mainWallGeo: THREE.BufferGeometry = baseWallGeo;
  if (matId === 'exterior_brick_main') {
    const split = splitWallTopCapGeometry(baseWallGeo, openingRects);
    mainWallGeo = split.mainGeo;
    applyWorldBrickUVs(mainWallGeo, 0, wall.baseY, 0);
    if (split.topCapGeo) {
      const topCapMesh = new THREE.Mesh(split.topCapGeo, getMat('slab_structural_edge'));
      topCapMesh.castShadow = true;
      topCapMesh.receiveShadow = true;
      wallContainer.add(topCapMesh);
    }
  }
  const wallMesh = new THREE.Mesh(mainWallGeo, getMat(matId));
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
    const innerBottomY = -0.04;
    const innerShape = new THREE.Shape();
    innerShape.moveTo(startTrim, innerBottomY);
    innerShape.lineTo(length - endTrim, innerBottomY);
    if (wall.gablePeak) {
      // Match the full gable triangle slope all the way to the top edge so zero exterior brick
      // is ever visible on the inside of the attic gable walls.
      const peakU = wall.gablePeak.offsetAlongWall;
      const peakH = wall.gablePeak.peakHeight;
      const innerGableH = (u: number) => {
        const slopeH =
          u <= peakU
            ? wall.height + (u / Math.max(0.001, peakU)) * (peakH - wall.height)
            : wall.height + ((length - u) / Math.max(0.001, length - peakU)) * (peakH - wall.height);
        return Math.max(0.05, slopeH - 0.004);
      };
      innerShape.lineTo(length - endTrim, innerGableH(length - endTrim));
      innerShape.lineTo(peakU, innerGableH(peakU));
      innerShape.lineTo(startTrim, innerGableH(startTrim));
    } else {
      const innerTopH = Math.max(0.05, wall.height - 0.004);
      innerShape.lineTo(length - endTrim, innerTopH);
      innerShape.lineTo(startTrim, innerTopH);
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
 * Add Zolder technical installation (warmtepomp reservoir) in the rear-left installation zone
 * matching Verkooptekening VK-06.
 */
function buildZolderDetails(
  secondGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  registerStaggered: (id: string, object: THREE.Object3D, floor: FloorLayerId, baseY: number) => void
) {
  const Y2 = HOUSE_DIMENSIONS.secondFloorElevation.metres; // 5.70 m

  // Heat pump buffer tank / boiler reservoir (VK-06 circular 'wp' symbol)
  const wpGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.65, 24);
  const wpMesh = new THREE.Mesh(wpGeo, getMat('window_frame_cream'));
  wpMesh.position.set(2.22, Y2 + 0.825, -6.95);
  registerMesh(wpMesh, 'window_frame_cream', {
    id: 'sf_tech_wp',
    label: 'Warmtepomp Boilervat (WP)',
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
  const Y_WALL_TOP = Y_FLAT - 0.25; // +2.60 m (ground floor wall top)
  const brickH = 0.20;              // +2.60 -> +2.80 m brick fascia under daktrim
  const brickY = Y_WALL_TOP + brickH / 2;
  const trimH = 0.07;               // +2.80 -> +2.87 m thin light-grey daktrim
  const trimY = Y_WALL_TOP + brickH + trimH / 2;
  const bitumenH = 0.24;            // +2.60 -> +2.84 m recessed dark bitumen inside daktrim
  const bitumenY = Y_WALL_TOP + bitumenH / 2;

  const addBox = (
    x1: number,
    x2: number,
    z1: number,
    z2: number,
    yCenter: number,
    height: number,
    matId: MaterialId
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(x2 - x1, height, z2 - z1),
      getMat(matId)
    );
    mesh.position.set((x1 + x2) / 2, yCenter, (z1 + z2) / 2);
    if (matId === 'exterior_brick_main') {
      applyWorldBrickUVs(mesh.geometry, mesh.position.x, mesh.position.y, mesh.position.z);
    }
    firstGroup.add(mesh);
    return mesh;
  };

  // 1. Dark bitumen roof surface (inset inside the perimeter daktrim)
  const extRoof = addBox(0.00, 5.81, -12.80, -10.46, bitumenY, bitumenH, 'roof_flat_bitumen');
  registerMesh(extRoof, 'roof_flat_bitumen', {
    id: 'ff_flat_roof_extension',
    label: 'Plat Dak Uitbouw B11a (5.87 × 2.40 m op +2.85 m)',
    dimensionsLabel: '5.87 × 2.40 m',
    provenance: 'verified_drawing',
    source: 'Tekening woonwensen 55.1 (B11a Uitbreiding 2,4m)',
    floor: 'first',
  });

  const bergingRoof = addBox(-3.21, 0.00, -13.66, -7.79, bitumenY, bitumenH, 'roof_flat_bitumen');
  registerMesh(bergingRoof, 'roof_flat_bitumen', {
    id: 'ff_flat_roof_berging',
    label: 'Plat Dak Berging (3.44 × 5.99 m op +2.85 m)',
    dimensionsLabel: '3.44 × 5.99 m',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 Doorsnede AA & HomeByMe',
    floor: 'first',
  });

  // Rear widening of the berging: X: 0.00 -> 0.27 m, Z: -13.66 -> -12.80 m
  addBox(0.00, 0.27, -13.66, -12.80, bitumenY, bitumenH, 'roof_flat_bitumen');

  // 2. Brick fascia (+2.60 -> +2.80 m) continuing outer walls up to the daktrim
  addBox(-3.27, 0.00, -7.93, -7.73, brickY, brickH, 'exterior_brick_main');     // Berging front
  addBox(-3.27, -3.19, -13.64, -7.93, brickY, brickH, 'exterior_brick_main');   // Berging left
  addBox(-3.27, 0.33, -13.72, -13.64, brickY, brickH, 'exterior_brick_main');   // Berging rear
  addBox(0.25, 0.33, -13.64, -12.86, brickY, brickH, 'exterior_brick_main');    // Berging rear widening right
  addBox(0.33, 5.87, -12.86, -12.46, brickY, brickH, 'exterior_brick_main');    // Extension rear
  addBox(5.57, 5.87, -12.46, -10.46, brickY, brickH, 'exterior_brick_main');    // Extension right

  // 3. Thin light-grey perimeter daktrim (+2.80 -> +2.87 m, 2 cm drip overhang)
  addBox(-3.29, 0.00, -7.79, -7.71, trimY, trimH, 'roof_daktrim_zinc');         // Berging front
  addBox(-3.29, -3.21, -13.66, -7.79, trimY, trimH, 'roof_daktrim_zinc');       // Berging left
  addBox(-3.29, 0.35, -13.74, -13.66, trimY, trimH, 'roof_daktrim_zinc');       // Berging rear
  addBox(0.27, 0.35, -13.66, -12.88, trimY, trimH, 'roof_daktrim_zinc');        // Berging rear widening right
  addBox(0.27, 5.89, -12.88, -12.80, trimY, trimH, 'roof_daktrim_zinc');        // Extension rear
  addBox(5.81, 5.89, -12.80, -10.46, trimY, trimH, 'roof_daktrim_zinc');        // Extension right
}

/**
 * Build a planar 3D roof polygon extruded vertically downward by `verticalThickness`,
 * separating the outer roof tiles/edges (`outerGeo`) from the interior ceiling underside (`ceilingGeo`)
 * so intersecting roof planes share exact 3D ridge/valley vertices while interior ceilings render
 * in clean white plaster (`interior_wall_plaster`).
 */
function buildRoofSlopeGeometries(
  topPoints: Array<[number, number, number]>,
  verticalThickness: number
): { outerGeo: THREE.BufferGeometry; ceilingGeo: THREE.BufferGeometry } {
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
  const outerPositions: number[] = [];
  const ceilingPositions: number[] = [];

  const pushTri = (
    target: number[],
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ) => {
    target.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // Top face (+Y normal)
  for (let i = 1; i < pts.length - 1; i++) {
    pushTri(outerPositions, pts[0], pts[i], pts[i + 1]);
  }
  // Bottom face (-Y normal) -> interior ceiling underside
  for (let i = 1; i < bot.length - 1; i++) {
    pushTri(ceilingPositions, bot[0], bot[i + 1], bot[i]);
  }
  // Perimeter side faces
  for (let k = 0; k < pts.length; k++) {
    const next = (k + 1) % pts.length;
    pushTri(outerPositions, pts[k], bot[k], bot[next]);
    pushTri(outerPositions, pts[k], bot[next], pts[next]);
  }

  const makeGeo = (positions: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  };

  return {
    outerGeo: makeGeo(outerPositions),
    ceilingGeo: makeGeo(ceilingPositions),
  };
}

/**
 * Build an anthracite verge-tile strip (Gevelpan) along a gable slope edge,
 * vertically mitered at `X = ridgeX` so left and right halves meet cleanly at the peak.
 */
function buildMiteredVergeHalf(
  eavesX: number,
  eavesY: number,
  eavesBotY: number,
  ridgeX: number,
  ridgeY: number,
  zCenter: number,
  zDepth: number,
  mat: THREE.Material
): THREE.Mesh {
  const minX = Math.min(eavesX, ridgeX);
  const maxX = Math.max(eavesX, ridgeX);
  const yAtMinX = eavesX < ridgeX ? eavesY : ridgeY;
  const yAtMaxX = eavesX < ridgeX ? ridgeY : eavesY;
  const dropTop = 0.025;
  const dropBotAtRidge = 0.135;
  const botAtMinX = eavesX < ridgeX ? eavesBotY : ridgeY - dropBotAtRidge;
  const botAtMaxX = eavesX < ridgeX ? ridgeY - dropBotAtRidge : eavesBotY;

  const shape = new THREE.Shape();
  shape.moveTo(minX, botAtMinX);
  shape.lineTo(maxX, botAtMaxX);
  shape.lineTo(maxX, yAtMaxX + dropTop);
  shape.lineTo(minX, yAtMinX + dropTop);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: zDepth, bevelEnabled: false });
  geo.translate(0, 0, zCenter - zDepth / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Build a half-round ridge cap (Nokvorst) along an axis ('x' or 'z') with clean end-caps.
 */
function buildHalfRoundRidgeCap(
  axis: 'x' | 'z',
  startCoord: number,
  endCoord: number,
  fixedCoord: number,
  yCenter: number,
  radius: number,
  mat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const length = Math.abs(endCoord - startCoord);
  const mid = (startCoord + endCoord) / 2;

  const capGeo = new THREE.CylinderGeometry(radius, radius, length, 14, 1, false, -Math.PI / 2, Math.PI);
  if (axis === 'z') {
    capGeo.rotateX(Math.PI / 2);
  } else {
    capGeo.rotateZ(Math.PI / 2);
  }
  const capMesh = new THREE.Mesh(capGeo, mat);
  capMesh.position.set(
    axis === 'x' ? mid : fixedCoord,
    yCenter,
    axis === 'z' ? mid : fixedCoord
  );
  capMesh.castShadow = true;
  capMesh.receiveShadow = true;
  group.add(capMesh);

  return group;
}

/**
 * Build a horizontal box gutter (Bakgoot) with recessed zinc lining and spaced rafter tails (Klossen).
 */
function buildBoxGutterAndKlossen(
  parent: THREE.Group,
  axis: 'x' | 'z',
  spanStart: number,
  spanEnd: number,
  eavesCoord: number,
  outwardSign: 1 | -1,
  yTop: number,
  fasciaMat: THREE.Material,
  zincMat: THREE.Material,
  skipZones: number[] = [],
  klossenMat: THREE.Material = fasciaMat
) {
  const length = Math.abs(spanEnd - spanStart);
  const mid = (spanStart + spanEnd) / 2;
  const gutterWidth = 0.20;
  const gutterHeight = 0.16;
  const wallT = 0.025;
  const centerOut = eavesCoord + outwardSign * (gutterWidth / 2);
  const centerY = yTop - gutterHeight / 2;

  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
  };

  if (axis === 'z') {
    // Gutter running along Z (left eaves of bnr. 55)
    addBox(gutterWidth, wallT, length, centerOut, yTop - gutterHeight + wallT / 2, mid, fasciaMat); // Soffit
    addBox(wallT, gutterHeight, length, eavesCoord + outwardSign * (gutterWidth - wallT / 2), centerY, mid, fasciaMat); // Outer face
    addBox(wallT, gutterHeight, length, eavesCoord + outwardSign * (wallT / 2), centerY, mid, fasciaMat); // Inner back
    addBox(gutterWidth - wallT * 2, 0.02, length - 0.04, centerOut, yTop - 0.075, mid, zincMat); // Zinc gutter bed
    for (const zEnd of [spanStart + wallT / 2, spanEnd - wallT / 2]) {
      addBox(gutterWidth, gutterHeight, wallT, centerOut, centerY, zEnd, fasciaMat); // End-caps
    }
    // Rafter tails (klossen) underneath, avoiding HWA downspouts
    const count = Math.max(2, Math.round(length / 0.68));
    for (let i = 0; i <= count; i++) {
      const zPos = spanStart + 0.35 + (i / count) * (length - 0.70);
      if (skipZones.some((sz) => Math.abs(zPos - sz) < 0.16)) continue;
      addBox(0.16, 0.065, 0.055, eavesCoord + outwardSign * 0.08, yTop - gutterHeight - 0.0325, zPos, klossenMat);
    }
  } else {
    // Gutter running along X (front & rear eaves of bnr. 56)
    addBox(length, wallT, gutterWidth, mid, yTop - gutterHeight + wallT / 2, centerOut, fasciaMat); // Soffit
    addBox(length, gutterHeight, wallT, mid, centerY, eavesCoord + outwardSign * (gutterWidth - wallT / 2), fasciaMat); // Outer face
    addBox(length, gutterHeight, wallT, mid, centerY, eavesCoord + outwardSign * (wallT / 2), fasciaMat); // Inner back
    addBox(length - 0.04, 0.02, gutterWidth - wallT * 2, mid, yTop - 0.04, centerOut, zincMat); // Zinc gutter bed
    for (const xEnd of [spanStart + wallT / 2, spanEnd - wallT / 2]) {
      addBox(wallT, gutterHeight, gutterWidth, xEnd, centerY, centerOut, fasciaMat); // End-caps
    }
    const count = Math.max(2, Math.round(length / 0.68));
    for (let i = 0; i <= count; i++) {
      const xPos = spanStart + 0.25 + (i / count) * (length - 0.50);
      addBox(0.055, 0.065, 0.16, xPos, yTop - gutterHeight - 0.0325, eavesCoord + outwardSign * 0.08, klossenMat);
    }
  }
}

/**
 * Build the pitched intersecting roof system:
 * - Slim 10 cm outer roof tile shell (Dwarskap + Langskap + bnr. 56 context) sitting cleanly atop walls
 * - Interior white plaster ceiling lining strictly inside exterior walls at the true kapelement underside
 * - Recessed rear-left Velux dakraam cutting through both shells
 * - Mitered anthracite gevelpannen (verge tiles), half-round nokvorsten (ridge caps), bakgoten + klossen, and roof vents.
 */
function buildPitchedRoofSystem(
  roofGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn
) {
  const {
    yEavesTop,
    yRidge,
    tileThickness,
    verticalThickness,
    ridgeX,
    leftWallOuterX,
    leftTileEdgeX,
    rightPartyX,
    neighbourMaxX,
    roofFrontZ,
    roofRearZ,
    nbRidgeZ,
    nbFrontEavesZ,
    nbRearEavesZ,
  } = ROOF_SPEC;

  const roofLengthZ = roofFrontZ - roofRearZ;
  const leftRunX = ridgeX - leftWallOuterX;
  const leftRiseY = yRidge - yEavesTop;
  const leftSlopeLen = Math.hypot(leftRunX, leftRiseY);
  const leftAngle = Math.atan2(leftRiseY, leftRunX);
  const rightRunX = rightPartyX - ridgeX;
  const rightSlopeLen = Math.hypot(rightRunX, leftRiseY);

  const addTileSlope = (
    id: string,
    label: string,
    dimensionsLabel: string,
    source: string,
    polygons: Array<Array<[number, number, number]>>,
    matId: MaterialId = 'roof_tile_anthracite',
    vThick: number = tileThickness
  ) => {
    const outerParts: THREE.BufferGeometry[] = [];
    const botParts: THREE.BufferGeometry[] = [];
    for (const poly of polygons) {
      const { outerGeo, ceilingGeo } = buildRoofSlopeGeometries(poly, vThick);
      outerParts.push(outerGeo);
      botParts.push(ceilingGeo);
    }
    const merged = mergeGeometries([...outerParts, ...botParts], false);
    outerParts.forEach((g) => g.dispose());
    botParts.forEach((g) => g.dispose());

    const mesh = new THREE.Mesh(merged, getMat(matId));
    registerMesh(mesh, matId, {
      id,
      label,
      dimensionsLabel,
      provenance: 'verified_drawing',
      source,
      floor: 'roof',
    });
    roofGroup.add(mesh);
  };

  // Skylight bounds (rear-left slope, cut through both tile shell and interior ceiling lining)
  // Positioned ~3-4 tile courses above the bakgoot matching the exterior render & VK-06
  const winX0 = 0.72;
  const winX1 = 1.34;
  // Horizontal top reveal (bovendagkant) shifts upper ceiling cutout up-slope so ceiling never blocks the window
  const ceilWinX1 = winX1 + (verticalThickness - tileThickness) * (leftRunX / leftRiseY);
  const winZ0 = -8.60;
  const winZ1 = -7.70;
  const yWallOuter = getZolderRoofTopY(leftWallOuterX); // 6.23 m
  const yTileEdge = getZolderRoofTopY(leftTileEdgeX);   // 6.167 m (strictly above bakgoot yTop=6.12 m)
  const yWin0 = getZolderRoofTopY(winX0);
  const yWin1 = getZolderRoofTopY(winX1);

  // 1. Slim Outer Tile Layer — Left Slope of Bouwnummer 55 (split cleanly around Velux dakraam, X = 0.00..2.985)
  addTileSlope(
    'roof_bnr55_left_slope',
    'Schuine Kap Links bnr. 55 (Goothoogte +6.13 m, Nok +10.90 m)',
    `${leftSlopeLen.toFixed(2)} × ${roofLengthZ.toFixed(2)} m`,
    'Verkooptekening VK-06 Gevels, Zolder & Doorsnede AA',
    [
      [
        [leftWallOuterX, yWallOuter, roofFrontZ],
        [ridgeX, yRidge, roofFrontZ],
        [ridgeX, yRidge, winZ1],
        [leftWallOuterX, yWallOuter, winZ1],
      ],
      [
        [leftWallOuterX, yWallOuter, winZ0],
        [ridgeX, yRidge, winZ0],
        [ridgeX, yRidge, roofRearZ],
        [leftWallOuterX, yWallOuter, roofRearZ],
      ],
      [
        [leftWallOuterX, yWallOuter, winZ1],
        [winX0, yWin0, winZ1],
        [winX0, yWin0, winZ0],
        [leftWallOuterX, yWallOuter, winZ0],
      ],
      [
        [winX1, yWin1, winZ1],
        [ridgeX, yRidge, winZ1],
        [ridgeX, yRidge, winZ0],
        [winX1, yWin1, winZ0],
      ],
    ]
  );

  // Tapered 4 cm eaves drip lip overhanging over the bakgoot (Y >= 6.125 m, strictly above bakgoot top 6.120 m)
  {
    const dripShape = new THREE.Shape();
    dripShape.moveTo(leftTileEdgeX, 6.125);
    dripShape.lineTo(leftWallOuterX, yWallOuter - tileThickness);
    dripShape.lineTo(leftWallOuterX, yWallOuter);
    dripShape.lineTo(leftTileEdgeX, yTileEdge);
    dripShape.closePath();
    const dripGeo = new THREE.ExtrudeGeometry(dripShape, { depth: roofLengthZ, bevelEnabled: false });
    dripGeo.translate(0, 0, roofRearZ);
    const dripMesh = new THREE.Mesh(dripGeo, getMat('roof_tile_anthracite'));
    dripMesh.castShadow = true;
    dripMesh.receiveShadow = true;
    roofGroup.add(dripMesh);
  }

  // 1a. Velux Dakraam (Recessed Skylight bridging slim outer tile shell to interior ceiling lining)
  {
    const skGroup = new THREE.Group();
    const skSlopeLen = Math.hypot(winX1 - winX0, yWin1 - yWin0);
    const skWidthZ = winZ1 - winZ0;
    skGroup.position.set((winX0 + winX1) / 2, (yWin0 + yWin1) / 2, (winZ0 + winZ1) / 2);
    skGroup.rotation.z = leftAngle;

    const frameT = 0.045;
    const sashDepth = 0.06;
    const flashMat = getMat('roof_tile_anthracite');
    const sashMat = getMat('window_frame_cream');

    const addSkPart = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      skGroup.add(m);
    };
    const flashH = 0.055;
    addSkPart(skSlopeLen + 0.12, flashH, 0.065, 0, 0.015, -skWidthZ / 2 - 0.01, flashMat);
    addSkPart(skSlopeLen + 0.12, flashH, 0.065, 0, 0.015, skWidthZ / 2 + 0.01, flashMat);
    addSkPart(0.065, flashH, skWidthZ + 0.12, -skSlopeLen / 2 - 0.01, 0.015, 0, flashMat);
    addSkPart(0.065, flashH, skWidthZ + 0.12, skSlopeLen / 2 + 0.01, 0.015, 0, flashMat);

    // Slim perimeter sash frame around glass pane (does not protrude across ceiling opening)
    addSkPart(skSlopeLen, sashDepth, frameT, 0, -sashDepth / 2, -skWidthZ / 2 + frameT / 2, sashMat);
    addSkPart(skSlopeLen, sashDepth, frameT, 0, -sashDepth / 2, skWidthZ / 2 - frameT / 2, sashMat);
    addSkPart(frameT, sashDepth, skWidthZ - frameT * 2, -skSlopeLen / 2 + frameT / 2, -sashDepth / 2, 0, sashMat);
    addSkPart(frameT, sashDepth, skWidthZ - frameT * 2, skSlopeLen / 2 - frameT / 2, -sashDepth / 2, 0, sashMat);

    const glassMesh = new THREE.Mesh(
      new THREE.BoxGeometry(skSlopeLen - frameT * 2, 0.018, skWidthZ - frameT * 2),
      getMat('window_glass_day')
    );
    glassMesh.position.set(0, -0.025, 0);
    registerMesh(
      glassMesh,
      'window_glass_day',
      {
        id: 'sf_win_zolder_dakraam',
        label: 'Dakraam Zolder (Linker Dakvlak)',
        dimensionsLabel: `${skWidthZ.toFixed(2)} × ${skSlopeLen.toFixed(2)} m`,
        provenance: 'verified_drawing',
        source: 'Verkooptekening VK-06 Zolder, Doorsnede AA & Gevelrender',
        floor: 'roof',
      },
      false,
      false
    );
    skGroup.add(glassMesh);
    roofGroup.add(skGroup);

    // World-aligned interior reveal shaft (vertical lower dagkant + horizontal upper dagkant + trapezoidal cheeks)
    // bridging the skylight frame cleanly down to the ceiling cutout [winX0..ceilWinX1] with zero obstruction.
    const yBotCeil = getZolderRoofUndersideY(winX0, winZ0);
    const yTopInner = yWin1 - tileThickness; // Horizontal top dagkant meets ceiling underside at ceilWinX1
    const yWin0Top = yWin0 - 0.025;
    const yWin1Top = yWin1 - 0.025;
    const shaftPos: number[] = [];
    const pushShaftTri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
      shaftPos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    };
    const pushShaftQuad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number]
    ) => {
      pushShaftTri(a, b, c);
      pushShaftTri(a, c, d);
    };

    // Lower vertical wall (X = winX0, +X normal; starts at yBotCeil + 0.04 above ceilMesh's 4 cm cut face)
    pushShaftQuad(
      [winX0, yBotCeil + 0.04, winZ1],
      [winX0, yBotCeil + 0.04, winZ0],
      [winX0, yWin0Top, winZ0],
      [winX0, yWin0Top, winZ1]
    );
    // Upper horizontal soffit (Y = yTopInner, -Y normal)
    pushShaftQuad(
      [winX1, yTopInner, winZ0],
      [ceilWinX1, yTopInner, winZ0],
      [ceilWinX1, yTopInner, winZ1],
      [winX1, yTopInner, winZ1]
    );
    // Short vertical riser at upper frame edge (X = winX1, -X normal)
    pushShaftQuad(
      [winX1, yTopInner, winZ0],
      [winX1, yTopInner, winZ1],
      [winX1, yWin1Top, winZ1],
      [winX1, yWin1Top, winZ0]
    );
    // Front cheek (Z = winZ1, -Z normal)
    pushShaftQuad(
      [winX0, yBotCeil, winZ1],
      [winX0, yWin0Top, winZ1],
      [winX1, yTopInner, winZ1],
      [ceilWinX1, yTopInner, winZ1]
    );
    pushShaftTri(
      [winX0, yWin0Top, winZ1],
      [winX1, yWin1Top, winZ1],
      [winX1, yTopInner, winZ1]
    );
    // Rear cheek (Z = winZ0, +Z normal)
    pushShaftQuad(
      [winX0, yBotCeil, winZ0],
      [ceilWinX1, yTopInner, winZ0],
      [winX1, yTopInner, winZ0],
      [winX0, yWin0Top, winZ0]
    );
    pushShaftTri(
      [winX0, yWin0Top, winZ0],
      [winX1, yTopInner, winZ0],
      [winX1, yWin1Top, winZ0]
    );

    const shaftGeo = new THREE.BufferGeometry();
    shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute(shaftPos, 3));
    shaftGeo.computeVertexNormals();
    const shaftMesh = new THREE.Mesh(shaftGeo, getMat('interior_wall_plaster'));
    shaftMesh.castShadow = false;
    shaftMesh.receiveShadow = true;
    roofGroup.add(shaftMesh);
  }

  // 1b. Single Curved Roof Exhaust Pipe (Ontluchtingspijp on lower left slope, matching render)
  {
    const ventX = 0.88;
    const ventZ = -4.35;
    const yBase = getZolderRoofTopY(ventX, ventZ);
    const ventMat = getMat('roof_tile_anthracite');
    const ventGroup = new THREE.Group();
    ventGroup.position.set(ventX, yBase, ventZ);

    const collar = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.03, 0.22),
      ventMat
    );
    collar.rotation.z = leftAngle;
    ventGroup.add(collar);

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.06, -0.05, 0),
      new THREE.Vector3(-0.08, 0.14, 0),
      new THREE.Vector3(-0.08, 0.44, 0)
    );
    const tubeGeo = new THREE.TubeGeometry(curve, 14, 0.045, 14, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, ventMat);
    tubeMesh.castShadow = true;
    ventGroup.add(tubeMesh);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.06, 0.035, 16),
      ventMat
    );
    cap.position.set(-0.08, 0.45, 0);
    cap.castShadow = true;
    ventGroup.add(cap);

    roofGroup.add(ventGroup);
  }

  // 2. Slim Outer Tile Layer — Right Dwarskap Wings of Bouwnummer 55
  addTileSlope(
    'roof_bnr55_right_slope',
    'Schuine Kap Rechts bnr. 55 (Dwarskap Voorzijde tot Kielkeper)',
    `${rightSlopeLen.toFixed(2)} × 5.24 m`,
    'Verkooptekening VK-06 Gevels, Zolder & Doorsnede AA',
    [
      [
        [ridgeX, yRidge, roofFrontZ],
        [rightPartyX, yEavesTop, roofFrontZ],
        [rightPartyX, yEavesTop, nbFrontEavesZ],
        [ridgeX, yRidge, nbRidgeZ],
      ],
    ]
  );

  addTileSlope(
    'roof_bnr55_right_rear_slope',
    'Schuine Kap Rechts bnr. 55 (Dwarskap Achterzijde tot Kielkeper)',
    `${rightSlopeLen.toFixed(2)} × 5.24 m`,
    'Verkooptekening VK-06 Gevels, Zolder & Doorsnede AA',
    [
      [
        [ridgeX, yRidge, nbRidgeZ],
        [rightPartyX, yEavesTop, nbRearEavesZ],
        [rightPartyX, yEavesTop, roofRearZ],
        [ridgeX, yRidge, roofRearZ],
      ],
    ]
  );

  // 3. Slim Outer Tile Layer — Bouwnummer 55's Owned Perpendicular Langskap Wing
  addTileSlope(
    'roof_bnr55_langskap_front',
    'Aansluitende Langskap bnr. 55 (Voorzijde boven Eigen Zolder)',
    '2.89 × 5.01 m (tot Kielkeper)',
    'Verkooptekening VK-06 Zolder (kielkeper) & Doorsnede AA',
    [
      [
        [ridgeX, yRidge, nbRidgeZ],
        [rightPartyX, yEavesTop, nbFrontEavesZ],
        [rightPartyX, yRidge, nbRidgeZ],
      ],
    ]
  );

  addTileSlope(
    'roof_bnr55_langskap_rear',
    'Aansluitende Langskap bnr. 55 (Achterzijde boven Eigen Zolder)',
    '2.89 × 5.01 m (tot Kielkeper)',
    'Verkooptekening VK-06 Zolder (kielkeper) & Doorsnede AA',
    [
      [
        [ridgeX, yRidge, nbRidgeZ],
        [rightPartyX, yRidge, nbRidgeZ],
        [rightPartyX, yEavesTop, nbRearEavesZ],
      ],
    ]
  );

  // 4. Slim Interior White Ceiling Lining (strictly inside exterior walls: X 0.40..5.57, Z -10.06..-0.40)
  //    plus perimeter closure walls connecting the ceiling lining up to the outer roof tile shell so
  //    lifting the roof halfway during scroll reveals a sealed white ceiling assembly with no open cavity.
  {
    const inMinX = 0.40;
    const inMaxX = 5.58;   // Tucked 1 cm inside 30 cm party wall (behind inner plaster face at X = 5.577)
    const inFrontZ = -0.39; // Tucked 1 cm inside 40 cm front gable (behind inner plaster face at Z = -0.393)
    const inRearZ = -10.07; // Tucked 1 cm inside 40 cm rear gable (behind inner plaster face at Z = -10.067)
    // Exact Z where diagonal kielkeper (uX == uZ) intersects X = inMaxX
    const uXIn = (inMaxX - ridgeX) / (rightPartyX - ridgeX);
    const spanZ = nbFrontEavesZ - nbRidgeZ;
    const kielFrontZ = nbRidgeZ + uXIn * spanZ;
    const kielRearZ = nbRidgeZ - uXIn * spanZ;

    const ptUnder = (x: number, z: number): [number, number, number] => [
      x,
      getZolderRoofUndersideY(x, z) + 0.04,
      z,
    ];

    const ceilingPolys: Array<Array<[number, number, number]>> = [
      // Left slope ceiling around skylight opening
      [ptUnder(inMinX, inFrontZ), ptUnder(ridgeX, inFrontZ), ptUnder(ridgeX, winZ1), ptUnder(inMinX, winZ1)],
      [ptUnder(inMinX, winZ0), ptUnder(ridgeX, winZ0), ptUnder(ridgeX, inRearZ), ptUnder(inMinX, inRearZ)],
      [ptUnder(inMinX, winZ1), ptUnder(winX0, winZ1), ptUnder(winX0, winZ0), ptUnder(inMinX, winZ0)],
      [ptUnder(ceilWinX1, winZ1), ptUnder(ridgeX, winZ1), ptUnder(ridgeX, winZ0), ptUnder(ceilWinX1, winZ0)],
      // Right Dwarskap front & rear wings
      [ptUnder(ridgeX, inFrontZ), ptUnder(inMaxX, inFrontZ), ptUnder(inMaxX, kielFrontZ), ptUnder(ridgeX, nbRidgeZ)],
      [ptUnder(ridgeX, nbRidgeZ), ptUnder(inMaxX, kielRearZ), ptUnder(inMaxX, inRearZ), ptUnder(ridgeX, inRearZ)],
      // Right Langskap front & rear triangles
      [ptUnder(ridgeX, nbRidgeZ), ptUnder(inMaxX, kielFrontZ), ptUnder(inMaxX, nbRidgeZ)],
      [ptUnder(ridgeX, nbRidgeZ), ptUnder(inMaxX, nbRidgeZ), ptUnder(inMaxX, kielRearZ)],
    ];

    const ceilGeos = ceilingPolys.map((poly) => {
      const { outerGeo, ceilingGeo } = buildRoofSlopeGeometries(poly, 0.04);
      const merged = mergeGeometries([outerGeo, ceilingGeo], false);
      outerGeo.dispose();
      ceilingGeo.dispose();
      return merged;
    });

    // Build perimeter edge closure connecting ceiling underside up into the 10 cm outer roof tile shell
    const closurePos: number[] = [];
    const pushQuad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number]
    ) => {
      closurePos.push(
        a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
        a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]
      );
    };
    const yShellIn = (x: number, z: number) => getZolderRoofTopY(x, z) - tileThickness + 0.01;
    const pushVerticalClosureSeg = (
      x0: number, z0: number, yBot0: number,
      x1: number, z1: number, yBot1: number
    ) => {
      pushQuad(
        [x0, yBot0, z0],
        [x1, yBot1, z1],
        [x1, yShellIn(x1, z1), z1],
        [x0, yShellIn(x0, z0), z0]
      );
    };

    const eavesLeftX = 0.005;
    const eavesLeftBotY = 6.135; // 1.5 cm above sf_wall_left_outer top (6.120 m), meeting tile underside
    const yUnderLeft = getZolderRoofUndersideY(inMinX, inFrontZ);

    // Front gable closure (Z = inFrontZ, +Z outward)
    pushVerticalClosureSeg(eavesLeftX, inFrontZ, eavesLeftBotY, inMinX, inFrontZ, yUnderLeft);
    pushVerticalClosureSeg(inMinX, inFrontZ, yUnderLeft, ridgeX, inFrontZ, getZolderRoofUndersideY(ridgeX, inFrontZ));
    pushVerticalClosureSeg(ridgeX, inFrontZ, getZolderRoofUndersideY(ridgeX, inFrontZ), inMaxX, inFrontZ, getZolderRoofUndersideY(inMaxX, inFrontZ));

    // Rear gable closure (Z = inRearZ, -Z outward)
    pushVerticalClosureSeg(inMaxX, inRearZ, getZolderRoofUndersideY(inMaxX, inRearZ), ridgeX, inRearZ, getZolderRoofUndersideY(ridgeX, inRearZ));
    pushVerticalClosureSeg(ridgeX, inRearZ, getZolderRoofUndersideY(ridgeX, inRearZ), inMinX, inRearZ, yUnderLeft);
    pushVerticalClosureSeg(inMinX, inRearZ, yUnderLeft, eavesLeftX, inRearZ, eavesLeftBotY);

    // Left eaves closure (X = inMinX vertical + bottom soffit out to eavesLeftX, -X/-Y outward)
    pushVerticalClosureSeg(inMinX, inRearZ, yUnderLeft, inMinX, inFrontZ, yUnderLeft);
    pushQuad(
      [eavesLeftX, eavesLeftBotY, inRearZ],
      [inMinX, yUnderLeft, inRearZ],
      [inMinX, yUnderLeft, inFrontZ],
      [eavesLeftX, eavesLeftBotY, inFrontZ]
    );

    // Right party-wall line closure (X = inMaxX following Dwarskap/Kielkeper/Langskap contour, +X outward)
    const rightZBreaks = [inFrontZ, kielFrontZ, nbRidgeZ, kielRearZ, inRearZ];
    for (let i = 0; i < rightZBreaks.length - 1; i++) {
      const z0 = rightZBreaks[i];
      const z1 = rightZBreaks[i + 1];
      pushVerticalClosureSeg(
        inMaxX, z0, getZolderRoofUndersideY(inMaxX, z0),
        inMaxX, z1, getZolderRoofUndersideY(inMaxX, z1)
      );
    }

    const closureGeo = new THREE.BufferGeometry();
    closureGeo.setAttribute('position', new THREE.Float32BufferAttribute(closurePos, 3));
    closureGeo.computeVertexNormals();
    ceilGeos.push(closureGeo);

    const mergedCeil = mergeGeometries(ceilGeos, false);
    ceilGeos.forEach((g) => g.dispose());
    const ceilMesh = new THREE.Mesh(mergedCeil, getMat('interior_wall_plaster'));
    ceilMesh.castShadow = false;
    ceilMesh.receiveShadow = true;
    roofGroup.add(ceilMesh);
  }

  // 5. Attached Neighbour bnr. 56 Slim Pitched Roof (Langskap X: 5.87 -> 10.05 m in Neutral Grey)
  const nbStartX = rightPartyX + 0.002;
  addTileSlope(
    'roof_nb56_front_slope',
    'Buurwoning bnr. 56 Langskap (Voorzijde Context)',
    '4.18 × 6.89 m',
    'Verkooptekening VK-06 voorgevel & doorsnede AA bnr. 56',
    [
      [
        [nbStartX, yRidge, nbRidgeZ],
        [nbStartX, yEavesTop, nbFrontEavesZ],
        [neighbourMaxX, yEavesTop, nbFrontEavesZ],
        [neighbourMaxX, yRidge, nbRidgeZ],
      ],
    ],
    'neighbour_roof_grey'
  );

  addTileSlope(
    'roof_nb56_rear_slope',
    'Buurwoning bnr. 56 Langskap (Achterzijde Context)',
    '4.18 × 6.89 m',
    'Verkooptekening VK-06 achtergevel & doorsnede AA bnr. 56',
    [
      [
        [nbStartX, yRidge, nbRidgeZ],
        [neighbourMaxX, yRidge, nbRidgeZ],
        [neighbourMaxX, yEavesTop, nbRearEavesZ],
        [nbStartX, yEavesTop, nbRearEavesZ],
      ],
    ],
    'neighbour_roof_grey'
  );

  // 5a. Neighbour bnr. 56 Ceiling Lining & Perimeter Closure (connects grey roof shell cleanly to nb_sf_front/rear)
  {
    const nbInFrontZ = -0.61; // Tucked 1 cm inside nb_sf_front (Z: -0.62..-0.22)
    const nbInRearZ = -9.85;  // Tucked 1 cm inside nb_sf_rear (Z: -10.24..-9.84)
    const nbEavesFrontZ = nbFrontEavesZ - 0.005; // -0.225 m
    const nbEavesRearZ = nbRearEavesZ + 0.005;   // -10.235 m
    const nbEavesBotY = 6.135; // 1.5 cm above nb_sf_front/rear top (6.120 m)

    const nbUnderY = (z: number) => getZolderRoofUndersideY(neighbourMaxX, z);
    const nbShellInY = (z: number) => getZolderRoofTopY(neighbourMaxX, z) - tileThickness + 0.01;
    const ptNbUnder = (x: number, z: number): [number, number, number] => [x, nbUnderY(z) + 0.04, z];

    const nbCeilGeos = [
      [ptNbUnder(nbStartX, nbInFrontZ), ptNbUnder(neighbourMaxX, nbInFrontZ), ptNbUnder(neighbourMaxX, nbRidgeZ), ptNbUnder(nbStartX, nbRidgeZ)],
      [ptNbUnder(nbStartX, nbRidgeZ), ptNbUnder(neighbourMaxX, nbRidgeZ), ptNbUnder(neighbourMaxX, nbInRearZ), ptNbUnder(nbStartX, nbInRearZ)],
    ].map((poly) => {
      const { outerGeo, ceilingGeo } = buildRoofSlopeGeometries(poly, 0.04);
      const merged = mergeGeometries([outerGeo, ceilingGeo], false);
      outerGeo.dispose();
      ceilingGeo.dispose();
      return merged;
    });

    const nbClosurePos: number[] = [];
    const pushNbQuad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number]
    ) => {
      nbClosurePos.push(
        a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
        a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]
      );
    };
    const pushNbVert = (x0: number, z0: number, yBot0: number, x1: number, z1: number, yBot1: number) => {
      pushNbQuad(
        [x0, yBot0, z0],
        [x1, yBot1, z1],
        [x1, nbShellInY(z1), z1],
        [x0, nbShellInY(z0), z0]
      );
    };

    // Front & rear vertical closures along inner wall line (Z = nbInFrontZ, nbInRearZ)
    pushNbVert(nbStartX, nbInFrontZ, nbUnderY(nbInFrontZ), neighbourMaxX, nbInFrontZ, nbUnderY(nbInFrontZ));
    pushNbVert(neighbourMaxX, nbInRearZ, nbUnderY(nbInRearZ), nbStartX, nbInRearZ, nbUnderY(nbInRearZ));

    // Front & rear horizontal eaves soffits (strictly above nb_sf_front/rear top 6.120 m, -Y outward)
    pushNbQuad(
      [nbStartX, nbEavesBotY, nbInFrontZ],
      [neighbourMaxX, nbEavesBotY, nbInFrontZ],
      [neighbourMaxX, nbEavesBotY, nbEavesFrontZ],
      [nbStartX, nbEavesBotY, nbEavesFrontZ]
    );
    pushNbQuad(
      [nbStartX, nbEavesBotY, nbEavesRearZ],
      [neighbourMaxX, nbEavesBotY, nbEavesRearZ],
      [neighbourMaxX, nbEavesBotY, nbInRearZ],
      [nbStartX, nbEavesBotY, nbInRearZ]
    );

    // Right cutaway face (X = neighbourMaxX, +X outward) & Left party face (X = nbStartX, -X outward)
    pushNbVert(neighbourMaxX, nbEavesFrontZ, nbEavesBotY, neighbourMaxX, nbInFrontZ, nbEavesBotY);
    pushNbVert(neighbourMaxX, nbInFrontZ, nbUnderY(nbInFrontZ), neighbourMaxX, nbRidgeZ, nbUnderY(nbRidgeZ));
    pushNbVert(neighbourMaxX, nbRidgeZ, nbUnderY(nbRidgeZ), neighbourMaxX, nbInRearZ, nbUnderY(nbInRearZ));
    pushNbVert(neighbourMaxX, nbInRearZ, nbEavesBotY, neighbourMaxX, nbEavesRearZ, nbEavesBotY);

    pushNbVert(nbStartX, nbEavesRearZ, nbEavesBotY, nbStartX, nbInRearZ, nbEavesBotY);
    pushNbVert(nbStartX, nbInRearZ, nbUnderY(nbInRearZ), nbStartX, nbRidgeZ, nbUnderY(nbRidgeZ));
    pushNbVert(nbStartX, nbRidgeZ, nbUnderY(nbRidgeZ), nbStartX, nbInFrontZ, nbUnderY(nbInFrontZ));
    pushNbVert(nbStartX, nbInFrontZ, nbEavesBotY, nbStartX, nbEavesFrontZ, nbEavesBotY);

    const nbClosureGeo = new THREE.BufferGeometry();
    nbClosureGeo.setAttribute('position', new THREE.Float32BufferAttribute(nbClosurePos, 3));
    nbClosureGeo.computeVertexNormals();
    nbCeilGeos.push(nbClosureGeo);

    const mergedNbCeil = mergeGeometries(nbCeilGeos, false);
    nbCeilGeos.forEach((g) => g.dispose());
    const nbCeilMesh = new THREE.Mesh(mergedNbCeil, getMat('neighbour_wall_grey'));
    nbCeilMesh.castShadow = false;
    nbCeilMesh.receiveShadow = true;
    roofGroup.add(nbCeilMesh);
  }

  // Neighbour bnr. 56 front-slope skylight (neutral greyscale context, visible in Render)
  const nbLangsAngle = Math.atan2(yRidge - yEavesTop, nbFrontEavesZ - nbRidgeZ);
  const nbSkZ = -2.25;
  const nbSkY = yEavesTop + ((nbFrontEavesZ - nbSkZ) / (nbFrontEavesZ - nbRidgeZ)) * (yRidge - yEavesTop);
  const nbSk = new THREE.Group();
  nbSk.position.set(7.35, nbSkY + 0.02, nbSkZ);
  nbSk.rotation.x = nbLangsAngle;
  nbSk.add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.055, 1.18), getMat('neighbour_trim_grey')));
  nbSk.add(new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.065, 1.06), getMat('neighbour_glass_grey')));
  roofGroup.add(nbSk);

  // 6. Mitered Anthracite Verge Tiles (Gevelpannen) strictly outside brick gable faces
  //    Front: Z = +0.005..+0.071, Rear: Z = -10.531..-10.465 (zero overlap with brick, bakgoot, or main tile shell!)
  const gutterTopY = yEavesTop - tileThickness - 0.01; // 6.120 m
  const vergeMat = getMat('roof_tile_anthracite');
  for (const zCenter of [0.038, -10.498]) {
    roofGroup.add(buildMiteredVergeHalf(leftTileEdgeX, yTileEdge, gutterTopY + 0.005, ridgeX, yRidge, zCenter, 0.066, vergeMat));
    roofGroup.add(buildMiteredVergeHalf(rightPartyX, yEavesTop, gutterTopY + 0.005, ridgeX, yRidge, zCenter, 0.066, vergeMat));
  }

  // 7. Half-Round Ridge Caps (Nokvorsten) at the Top Apex (Y = +10.90 m)
  const ridgeRadius = 0.095;
  const ridgeCapY = yRidge - 0.015;
  roofGroup.add(buildHalfRoundRidgeCap('z', -10.535, 0.075, ridgeX, ridgeCapY, ridgeRadius, vergeMat));
  roofGroup.add(buildHalfRoundRidgeCap('x', ridgeX, rightPartyX, nbRidgeZ, ridgeCapY, ridgeRadius, vergeMat));
  roofGroup.add(buildHalfRoundRidgeCap('x', rightPartyX, neighbourMaxX, nbRidgeZ, ridgeCapY, ridgeRadius, getMat('neighbour_roof_grey')));

  // 8. Horizontal Box Gutters (Bakgoten) & Rafter Tails (Klossen) along Eaves
  //    yTop = 6.120 m keeps all gutters strictly below the roof tile underside (6.125–6.130 m) with zero clipping!
  buildBoxGutterAndKlossen(
    roofGroup,
    'z',
    -10.455,
    -0.005,
    -0.005,
    -1,
    gutterTopY,
    getMat('roof_daktrim_zinc'),
    getMat('roof_daktrim_zinc'),
    [-0.22, -10.24],
    getMat('roof_fascia_white')
  );
  buildBoxGutterAndKlossen(
    roofGroup,
    'x',
    rightPartyX + 0.005,
    neighbourMaxX,
    nbFrontEavesZ + 0.005,
    1,
    gutterTopY,
    getMat('neighbour_trim_grey'),
    getMat('neighbour_trim_grey')
  );
  buildBoxGutterAndKlossen(
    roofGroup,
    'x',
    rightPartyX + 0.005,
    neighbourMaxX,
    nbRearEavesZ - 0.005,
    -1,
    gutterTopY,
    getMat('neighbour_trim_grey'),
    getMat('neighbour_trim_grey')
  );
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
