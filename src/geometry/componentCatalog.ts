import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialId } from '../model/materials';
import { FloorLayerId, ProvenanceType } from '../model/houseData';
import { InspectableMetadata, ElementCategory, RegisterMeshFn } from './houseBuilder';
import { InteractiveDoor } from '../viewer/interactiveDoors';
import {
  buildDecorativeBrickArchMeshes,
  buildDoorLeafWithVisionCutout,
  createBrushedSteelLeverHandle,
} from '../assets/items/frontDoorArch';

/**
 * Canonical Architectural Component Prefab IDs
 *
 * Updating a prefab definition or its 3D builder function here automatically
 * updates every instance of that door/window/stair type across the entire house.
 */
export type OpeningPrefabId =
  | 'door_inner_standard_b77b'   // Standard inner door across ground, 1st, and 2nd floor (B77b)
  | 'door_inner_living_glass_b72'// Special oak + 4-light glass door from Hal to Woonkamer (B72, Eetkamer 3.png)
  | 'window_french_balcony_1st'  // 1st floor front & back French balcony double casement windows
  | 'window_gable_slot'          // Narrow vertical slot window (1st floor overloop & 2nd floor front/rear gables)
  | 'window_bathroom_rear'       // 1st floor rear bathroom window
  | 'window_bedroom_side'        // 1st floor side bedroom window
  | 'window_living_front'        // Ground floor wide front living room window
  | 'window_living_side'         // Ground floor side living room window
  | 'door_entrance_front'        // Arched sage-green main entrance door on left facade
  | 'door_garden_double_b13'     // Rear extension double garden doors with sidelights (B13)
  | 'door_berging_garage_double' // Berging front double garage doors
  | 'door_berging_garden_rear'   // Berging rear single garden door
  | 'neighbour_window_ground'    // Neighbour bnr. 56 ground floor window (grey context)
  | 'neighbour_french_balcony';  // Neighbour bnr. 56 1st floor French balcony (grey context)

export interface OpeningPrefabSpec {
  prefabId: OpeningPrefabId;
  defaultLabel: string;
  width: number;
  height: number;
  sillHeight: number;
  frameMaterial: MaterialId;
  panelMaterial: MaterialId;
  hasArchTrim?: boolean;
  hasTerracottaSurround?: boolean;
  provenance: ProvenanceType;
  source: string;
}

/**
 * Single Source of Truth for Reusable Door & Window Prefabs
 */
export const OPENING_PREFABS: Record<OpeningPrefabId, OpeningPrefabSpec> = {
  // 1. Standard Interior Door (B77b stompe deur — shared across Toilet, Slaapkamer, Kast, Badkamer, Kantoor, Zolder)
  door_inner_standard_b77b: {
    prefabId: 'door_inner_standard_b77b',
    defaultLabel: 'Standaard Binnendeur B77b (93 × 231 cm)',
    width: 0.93,
    height: 2.31,
    sillHeight: 0.00,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'interior_wall_plaster',
    provenance: 'verified_drawing',
    source: 'Tekening woonwensen 55.1–55.3 (Optie B77b stompe binnendeuren)',
  },

  // 2. Special Ground Floor Living Room Door (B72 — oak frame with 4 glass panels, as in Eetkamer 3.png)
  door_inner_living_glass_b72: {
    prefabId: 'door_inner_living_glass_b72',
    defaultLabel: 'Houten Glasdeur Hal naar Woonkamer B72 (93 × 231 cm)',
    width: 0.93,
    height: 2.31,
    sillHeight: 0.00,
    frameMaterial: 'door_interior_wood',
    panelMaterial: 'window_glass_day',
    provenance: 'verified_drawing',
    source: 'Tekening woonwensen 55.1 (B72) & Eetkamer 3.png render',
  },

  // 3. First Floor French Balcony Windows (Shared on Front Slaapkamer & Rear Kantoor)
  window_french_balcony_1st: {
    prefabId: 'window_french_balcony_1st',
    defaultLabel: 'Frans Balkon Dubbel Draairaam (136 × 215 cm)',
    width: 1.36,
    height: 2.15,
    sillHeight: 0.15,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 voorgevel/achtergevel & Woning.jpg',
  },

  // 4. Narrow Vertical Slot Window (Shared on 1st Floor Overloop & 2nd Floor Front/Rear Gables)
  window_gable_slot: {
    prefabId: 'window_gable_slot',
    defaultLabel: 'Smalle Verticale Raamstrook (42 × 145 cm)',
    width: 0.42,
    height: 1.45,
    sillHeight: 0.85,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 gevels & Woning.jpg',
  },

  // 5. First Floor Rear Bathroom Window
  window_bathroom_rear: {
    prefabId: 'window_bathroom_rear',
    defaultLabel: 'Badkamerraam Achtergevel (55 × 145 cm)',
    width: 0.55,
    height: 1.45,
    sillHeight: 0.85,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 achtergevel & HomeByMe 1st Floor',
  },

  // 6. First Floor Side Bedroom Window
  window_bedroom_side: {
    prefabId: 'window_bedroom_side',
    defaultLabel: 'Zijraam Slaapkamer 1e Verdieping (126 × 165 cm)',
    width: 1.26,
    height: 1.65,
    sillHeight: 0.65,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel & Woning.jpg',
  },

  // 7. Ground Floor Wide Front Living Room Window
  window_living_front: {
    prefabId: 'window_living_front',
    defaultLabel: 'Voorraam Woonkamer (240 × 185 cm)',
    width: 2.40,
    height: 1.85,
    sillHeight: 0.45,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 voorgevel & Woning.jpg',
  },

  // 8. Ground Floor Side Living Room Window
  window_living_side: {
    prefabId: 'window_living_side',
    defaultLabel: 'Zijraam Woonkamer (165 × 185 cm)',
    width: 1.65,
    height: 1.85,
    sillHeight: 0.45,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel & Woning.jpg',
  },

  // 9. Front Entrance Door with Exterior-Only Decorative Brick Arch
  door_entrance_front: {
    prefabId: 'door_entrance_front',
    defaultLabel: 'Voordeur / Entree Hal (98 × 208 cm + Decoratieve Boog)',
    width: 0.98,
    height: 2.08,
    sillHeight: 0.00,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'door_exterior_sage',
    hasArchTrim: true,
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 linkerzijgevel & Woning.jpg',
  },

  // 10. Rear Double Garden Doors with Sidelights (Option B13)
  door_garden_double_b13: {
    prefabId: 'door_garden_double_b13',
    defaultLabel: 'Dubbele Tuindeuren met Zijlichten B13 (340 × 235 cm)',
    width: 3.40,
    height: 2.35,
    sillHeight: 0.00,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'window_glass_day',
    hasTerracottaSurround: true,
    provenance: 'user_supplied',
    source: 'User specification: 180 cm dubbele tuindeuren + 80 cm zijlichten weerszijden (340 × 235 cm)',
  },

  // 11. Berging Garage Kanteldeur (Up-and-Over Tilt Door)
  door_berging_garage_double: {
    prefabId: 'door_berging_garage_double',
    defaultLabel: 'Garagedeur Kanteldeur (235 × 225 cm)',
    width: 2.35,
    height: 2.25,
    sillHeight: 0.00,
    frameMaterial: 'door_exterior_sage',
    panelMaterial: 'door_exterior_sage',
    hasTerracottaSurround: false, // Top red brick rollaag is built directly into the garage door asset
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 voorgevel & referentiefoto (sage-groene kanteldeur met verticale profilering en rollaag bovenzijde)',
  },

  // 12. Berging Rear Garden Door
  door_berging_garden_rear: {
    prefabId: 'door_berging_garden_rear',
    defaultLabel: 'Achterdeur Berging naar Tuin (100 × 230 cm)',
    width: 1.00,
    height: 2.30,
    sillHeight: 0.00,
    frameMaterial: 'window_frame_cream',
    panelMaterial: 'door_exterior_sage',
    hasTerracottaSurround: false, // Top red brick rollaag is built directly into the door asset
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 achtergevel & technische tekening achterdeur berging',
  },

  // 13. Neighbour Context Ground Window
  neighbour_window_ground: {
    prefabId: 'neighbour_window_ground',
    defaultLabel: 'Buurwoning Voorraam (Begane Grond)',
    width: 1.50,
    height: 1.85,
    sillHeight: 0.45,
    frameMaterial: 'neighbour_window_grey',
    panelMaterial: 'neighbour_glass_grey',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 voorgevel bnr. 56',
  },

  // 14. Neighbour Context 1st Floor French Balcony
  neighbour_french_balcony: {
    prefabId: 'neighbour_french_balcony',
    defaultLabel: 'Buurwoning Frans Balkon (1e Verdieping)',
    width: 1.36,
    height: 2.15,
    sillHeight: 0.15,
    frameMaterial: 'neighbour_window_grey',
    panelMaterial: 'neighbour_glass_grey',
    provenance: 'verified_drawing',
    source: 'Verkooptekening VK-06 voorgevel bnr. 56',
  },
};

export interface ResolvedOpeningInstance {
  id: string;
  prefabId: OpeningPrefabId;
  label: string;
  offsetAlongWall: number;
  width: number;
  height: number;
  sillHeight: number;
  frameMaterial: MaterialId;
  panelMaterial: MaterialId;
  hasArchTrim?: boolean;
  hasTerracottaSurround?: boolean;
  provenance: ProvenanceType;
  source: string;
}

/**
 * Instantiate the 3D geometry for any opening from the centralized prefab catalog.
 *
 * Coordinate convention inside `wallContainer`:
 * - Local `+Z` (`+wallThickness / 2`) is ALWAYS the OUTSIDE (exterior facade) of the house.
 * - Local `-Z` (`-wallThickness / 2`) is ALWAYS the INSIDE (interior room side) of the house.
 *
 * Therefore, all decorative red-brown brick surrounds (`hasTerracottaSurround`) and the
 * decorative entrance arch (`hasArchTrim`) are applied EXCLUSIVELY onto the exterior surface
 * (`z = +wallThickness / 2`), leaving the wall itself and the interior room completely regular!
 */
/**
 * Build a red-brown facade brick soldier course ("rollaag") exclusively across the top
 * of an exterior opening, matching the front entrance arch's 4.4 cm relief depth.
 */
function buildTopBrickRollaag(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  opts: {
    id: string;
    label: string;
    lintelWidth: number;
    lintelHeight: number;
    openingHeight: number;
    wallThickness: number;
    reliefDepth?: number;
    provenance: ProvenanceType;
    source: string;
    floor: FloorLayerId;
  }
) {
  const {
    id,
    label,
    lintelWidth,
    lintelHeight,
    openingHeight,
    wallThickness,
    reliefDepth = 0.044,
    provenance,
    source,
    floor,
  } = opts;
  const exteriorFaceZ = wallThickness / 2 + reliefDepth / 2 - 0.002;
  const numBricks = Math.max(4, Math.round(lintelWidth / 0.068));
  const brickPitch = lintelWidth / numBricks;
  const brickGeos: THREE.BufferGeometry[] = [];
  for (let b = 0; b < numBricks; b++) {
    const bx = -lintelWidth / 2 + (b + 0.5) * brickPitch;
    const brick = new THREE.BoxGeometry(brickPitch - 0.008, lintelHeight, reliefDepth);
    brick.translate(bx, openingHeight / 2 + lintelHeight / 2, exteriorFaceZ);
    brickGeos.push(brick);
  }
  const mortarBack = new THREE.BoxGeometry(lintelWidth, lintelHeight - 0.01, reliefDepth * 0.55);
  mortarBack.translate(0, openingHeight / 2 + lintelHeight / 2, exteriorFaceZ - reliefDepth * 0.22);
  brickGeos.push(mortarBack);

  const mergedLintel = mergeGeometries(brickGeos, false);
  for (const g of brickGeos) g.dispose();
  const lintelMesh = new THREE.Mesh(mergedLintel, getMat('window_trim_terracotta'));
  registerMesh(lintelMesh, 'window_trim_terracotta', {
    id,
    label,
    dimensionsLabel: `${lintelWidth.toFixed(2)} × ${lintelHeight.toFixed(2)} m`,
    provenance,
    source,
    floor,
  });
  group.add(lintelMesh);
}

export function instantiateOpeningPrefab3D(
  wallContainer: THREE.Group,
  op: ResolvedOpeningInstance,
  wallThickness: number,
  floor: FloorLayerId,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: (
    mesh: THREE.Mesh,
    matId: MaterialId,
    meta: Omit<InspectableMetadata, 'materialId' | 'category'> & { category?: ElementCategory },
    cast?: boolean,
    receive?: boolean
  ) => THREE.Mesh,
  onRegisterDoor?: (door: InteractiveDoor) => void
) {
  const group = new THREE.Group();
  group.position.set(op.offsetAlongWall, op.sillHeight + op.height / 2, 0);

  const isInteriorDoor =
    op.prefabId === 'door_inner_standard_b77b' || op.prefabId === 'door_inner_living_glass_b72';

  // Exterior windows/doors have an 11 cm realistic frame recessed ~7 cm from the outer brick face;
  // interior doors wrap the thin interior wall.
  const frameDepth = isInteriorDoor ? wallThickness + 0.025 : Math.min(wallThickness, 0.11);
  const frameCenterZ = isInteriorDoor ? 0.0 : wallThickness / 2 - 0.11;
  const frameThick = 0.065;

  // 1. Standard Window / Door Casing Frame (omitted for the frameless kanteldeur garage door)
  if (op.prefabId !== 'door_berging_garage_double') {
    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(op.width, frameThick, frameDepth),
      getMat(op.frameMaterial)
    );
    topBar.position.set(0, op.height / 2 - frameThick / 2, frameCenterZ);
    group.add(topBar);

    const leftBar = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, op.height, frameDepth),
      getMat(op.frameMaterial)
    );
    leftBar.position.set(-op.width / 2 + frameThick / 2, 0, frameCenterZ);
    group.add(leftBar);

    const rightBar = new THREE.Mesh(
      new THREE.BoxGeometry(frameThick, op.height, frameDepth),
      getMat(op.frameMaterial)
    );
    rightBar.position.set(op.width / 2 - frameThick / 2, 0, frameCenterZ);
    group.add(rightBar);

    if (op.sillHeight > 0.05) {
      const sillBar = new THREE.Mesh(
        new THREE.BoxGeometry(op.width, frameThick, frameDepth + 0.02),
        getMat(op.frameMaterial)
      );
      sillBar.position.set(0, -op.height / 2 + frameThick / 2, frameCenterZ + 0.01);
      group.add(sillBar);
    }
  }

  // 2. Decorative Red-Brown Brick Surround (ONLY on the exterior facade surface, z = +wallThickness / 2!)
  if (op.hasTerracottaSurround) {
    const bandWidth = 0.105; // 10.5 cm brick border width around window opening
    const reliefDepth = 0.032; // 3.2 cm decorative relief applied onto the outside face of the brick wall
    const exteriorFaceZ = wallThickness / 2 + reliefDepth / 2 - 0.002;

    // Top horizontal brick lintel band (rollaag)
    const surroundTop = new THREE.Mesh(
      new THREE.BoxGeometry(op.width + bandWidth * 2, bandWidth * 1.15, reliefDepth),
      getMat('window_trim_terracotta')
    );
    surroundTop.position.set(0, op.height / 2 + (bandWidth * 1.15) / 2, exteriorFaceZ);
    surroundTop.castShadow = true;
    group.add(surroundTop);

    // Left vertical brick jamb band
    const hasBottomBand = op.sillHeight > 0.05;
    const sideHeight = op.height + (hasBottomBand ? bandWidth * 0.9 : 0);
    const sideCenterY = hasBottomBand ? -(bandWidth * 0.9) / 2 : 0;

    const surroundL = new THREE.Mesh(
      new THREE.BoxGeometry(bandWidth, sideHeight, reliefDepth),
      getMat('window_trim_terracotta')
    );
    surroundL.position.set(-op.width / 2 - bandWidth / 2, sideCenterY, exteriorFaceZ);
    surroundL.castShadow = true;
    group.add(surroundL);

    // Right vertical brick jamb band
    const surroundR = new THREE.Mesh(
      new THREE.BoxGeometry(bandWidth, sideHeight, reliefDepth),
      getMat('window_trim_terracotta')
    );
    surroundR.position.set(op.width / 2 + bandWidth / 2, sideCenterY, exteriorFaceZ);
    surroundR.castShadow = true;
    group.add(surroundR);

    // Bottom horizontal brick sill (onderdorpel/waterslag) for all windows above ground level
    if (hasBottomBand) {
      const surroundBottom = new THREE.Mesh(
        new THREE.BoxGeometry(op.width, bandWidth * 0.9, reliefDepth + 0.012),
        getMat('window_trim_terracotta')
      );
      surroundBottom.position.set(0, -op.height / 2 - (bandWidth * 0.9) / 2, exteriorFaceZ + 0.004);
      surroundBottom.castShadow = true;
      group.add(surroundBottom);
    }
  }

  // 3. Decorative Red-Brown Brick Portal & Arch around Front Entrance Door (ONLY on the exterior facade surface!)
  if (op.hasArchTrim) {
    // Door opening (0.98 m) sits asymmetrically on the left of the 1.50 m portal:
    // Portal center is +13.0 cm to the right of the door center.
    const archResult = buildDecorativeBrickArchMeshes(getMat, 0.076, 0.044);
    archResult.group.position.set(0.13, -op.height / 2, wallThickness / 2 - 0.002);

    registerMesh(archResult.outerBorderMesh, 'exterior_arch_brick', {
      id: `${op.id}_arch_border`,
      label: 'Decoratieve Gemetselde Boog (Rollaag)',
      dimensionsLabel: '1.50 × 2.83 m (Asymmetrisch Portaal)',
      provenance: op.provenance,
      source: op.source,
      floor,
    });
    registerMesh(archResult.recessedInfillMesh, 'exterior_arch_brick', {
      id: `${op.id}_arch_infill`,
      label: 'Gemetseld Boogveld & Rechter Penant',
      dimensionsLabel: 'Verdiept metselwerk (1.6 cm terugliggend)',
      provenance: op.provenance,
      source: op.source,
      floor,
    });
    group.add(archResult.group);
  }

  const innerW = Math.max(0.1, op.width - frameThick * 2);
  const innerH = Math.max(0.1, op.height - frameThick * (op.sillHeight > 0.05 ? 2 : 1));

  const createTrigger = (depth = Math.max(0.40, wallThickness + 0.18)) => {
    const trigger = new THREE.Mesh(
      new THREE.BoxGeometry(op.width, op.height, depth),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    trigger.position.set(0, 0, frameCenterZ);
    group.add(trigger);
    return trigger;
  };

  const buildSingleSwingingDoor = (leafThickness: number, openAngle: number, hasVisionGlass = false) => {
    const pivot = new THREE.Group();
    pivot.position.set(-innerW / 2, -frameThick / 2, frameCenterZ);

    let leaf: THREE.Mesh;
    if (hasVisionGlass) {
      const handleMat = new THREE.MeshStandardMaterial({
        color: '#a8aeb5',
        roughness: 0.35,
        metalness: 0.75,
        name: 'door_handle_steel',
      });
      const built = buildDoorLeafWithVisionCutout({
        innerW,
        innerH,
        leafThickness,
        doorMat: getMat(op.panelMaterial),
        frameMat: getMat(op.frameMaterial),
        glassMat: getMat('window_glass_day'),
        handleMat,
      });
      leaf = built.leafMesh;
      pivot.add(built.leafPivotContent);
    } else {
      leaf = new THREE.Mesh(
        new THREE.BoxGeometry(innerW, innerH, leafThickness),
        getMat(op.panelMaterial)
      );
      leaf.position.set(innerW / 2, 0, 0);
      pivot.add(leaf);

      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.02, 0.09),
        getMat('roof_tile_anthracite')
      );
      handle.position.set(innerW - 0.08, -0.12 - (-frameThick / 2), 0);
      pivot.add(handle);
    }

    registerMesh(leaf, op.panelMaterial, {
      id: op.id,
      label: op.label,
      dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
      provenance: op.provenance,
      source: op.source,
      floor,
    });
    group.add(pivot);

    const trigger = createTrigger();
    if (onRegisterDoor) {
      onRegisterDoor({
        id: op.id,
        label: op.label,
        floor,
        pivots: [{ group: pivot, openAngle, closedAngle: 0, currentAngle: 0 }],
        triggerMeshes: [trigger, leaf],
        isHovered: false,
        isPinned: false,
      });
    }
  };

  // 4. Prefab-Specific 3D Inner Assembly
  switch (op.prefabId) {
    case 'door_inner_standard_b77b': {
      const openAngle =
        op.id === 'ff_door_badkamer' || op.id === 'ff_door_kantoor'
          ? Math.PI * 0.44
          : -Math.PI * 0.44;
      buildSingleSwingingDoor(0.042, openAngle);
      break;
    }

    case 'door_inner_living_glass_b72': {
      const stileW = 0.075;
      const pivot = new THREE.Group();
      pivot.position.set(-innerW / 2, -frameThick / 2, frameCenterZ);

      const leftStile = new THREE.Mesh(
        new THREE.BoxGeometry(stileW, innerH, 0.045),
        getMat('door_interior_wood')
      );
      leftStile.position.set(stileW / 2, 0, 0);
      pivot.add(leftStile);

      const rightStile = new THREE.Mesh(
        new THREE.BoxGeometry(stileW, innerH, 0.045),
        getMat('door_interior_wood')
      );
      rightStile.position.set(innerW - stileW / 2, 0, 0);
      pivot.add(rightStile);

      const railHeights = [-innerH * 0.46, -innerH * 0.22, innerH * 0.04, innerH * 0.28, innerH * 0.47];
      for (const ry of railHeights) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(innerW - stileW * 2, 0.045, 0.045),
          getMat('door_interior_wood')
        );
        rail.position.set(innerW / 2, ry - (-frameThick / 2), 0);
        pivot.add(rail);
      }

      const glassPane = new THREE.Mesh(
        new THREE.BoxGeometry(innerW - stileW * 2, innerH - 0.08, 0.02),
        getMat('window_glass_day')
      );
      glassPane.position.set(innerW / 2, 0, 0);
      registerMesh(
        glassPane,
        'window_glass_day',
        {
          id: op.id,
          label: op.label,
          dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
          provenance: op.provenance,
          source: op.source,
          floor,
        },
        false,
        false
      );
      pivot.add(glassPane);

      const handleGeo = new THREE.BoxGeometry(0.11, 0.02, 0.09);
      const handle = new THREE.Mesh(handleGeo, getMat('roof_tile_anthracite'));
      handle.position.set(innerW - 0.08, -0.12 - (-frameThick / 2), 0);
      pivot.add(handle);
      group.add(pivot);

      const trigger = createTrigger();
      if (onRegisterDoor) {
        onRegisterDoor({
          id: op.id,
          label: op.label,
          floor,
          pivots: [
            {
              group: pivot,
              openAngle: -Math.PI * 0.45,
              closedAngle: 0,
              currentAngle: 0,
            },
          ],
          triggerMeshes: [trigger, glassPane, leftStile, rightStile],
          isHovered: false,
          isPinned: false,
        });
      }
      break;
    }

    case 'window_french_balcony_1st':
    case 'neighbour_french_balcony': {
      const centerMullion = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, innerH, frameDepth * 0.9),
        getMat(op.frameMaterial)
      );
      centerMullion.position.z = frameCenterZ;
      group.add(centerMullion);

      const railMat = op.prefabId === 'neighbour_french_balcony' ? 'neighbour_window_grey' : 'door_exterior_sage';
      const railZ = wallThickness / 2 - 0.015;
      const topRailY = -0.05;
      const botRailY = -op.height / 2 + 0.10;

      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(op.width - 0.04, 0.032, 0.032),
        getMat(railMat)
      );
      topRail.position.set(0, topRailY, railZ);
      group.add(topRail);

      const botRail = new THREE.Mesh(
        new THREE.BoxGeometry(op.width - 0.04, 0.028, 0.028),
        getMat(railMat)
      );
      botRail.position.set(0, botRailY, railZ);
      group.add(botRail);

      const barCount = 9;
      const barH = topRailY - botRailY;
      for (let i = 0; i < barCount; i++) {
        const bx = -innerW * 0.44 + (i / (barCount - 1)) * (innerW * 0.88);
        const baluster = new THREE.Mesh(
          new THREE.BoxGeometry(0.015, barH, 0.015),
          getMat(railMat)
        );
        baluster.position.set(bx, (topRailY + botRailY) / 2, railZ);
        group.add(baluster);
      }

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(innerW, innerH, 0.025),
        getMat(op.panelMaterial)
      );
      glass.position.z = frameCenterZ;
      registerMesh(
        glass,
        op.panelMaterial,
        {
          id: op.id,
          label: op.label,
          dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
          provenance: op.provenance,
          source: op.source,
          floor,
        },
        false,
        false
      );
      group.add(glass);
      break;
    }

    case 'door_garden_double_b13': {
      // 1.80 m center double doors (2 x 0.90 m leaves) flanked by 0.80 m sidelights on each side (3.40 m total)
      const doorOpeningHalfW = 0.90; // 1.80 m clear double-door opening
      const mullionW = 0.055;
      const mullionCenterX = doorOpeningHalfW + mullionW / 2; // 0.9275 m
      const sidelightInnerX = mullionCenterX + mullionW / 2; // 0.955 m
      const sidelightOuterX = innerW / 2; // 1.635 m
      const sidelightGlassW = Math.max(0.20, sidelightOuterX - sidelightInnerX);
      const sidelightCenterX = (sidelightInnerX + sidelightOuterX) / 2;
      const sidelightSillH = 0.045;

      // Fixed sidelights + bottom sill bars on outer edges
      for (const side of [-1, 1]) {
        const sidelight = new THREE.Mesh(
          new THREE.BoxGeometry(sidelightGlassW, innerH - sidelightSillH, 0.022),
          getMat(op.panelMaterial)
        );
        sidelight.position.set(side * sidelightCenterX, sidelightSillH / 2, frameCenterZ);
        group.add(sidelight);

        const bottomSill = new THREE.Mesh(
          new THREE.BoxGeometry(sidelightGlassW, sidelightSillH, frameDepth * 0.9),
          getMat(op.frameMaterial)
        );
        bottomSill.position.set(side * sidelightCenterX, -innerH / 2 + sidelightSillH / 2, frameCenterZ);
        group.add(bottomSill);

        // Mullion bar separating sidelight from center French doors
        const mBar = new THREE.Mesh(
          new THREE.BoxGeometry(mullionW, innerH, frameDepth * 0.9),
          getMat(op.frameMaterial)
        );
        mBar.position.set(side * mullionCenterX, 0, frameCenterZ);
        group.add(mBar);
      }

      // Center French double doors (each leaf 0.90 m wide, slim white/cream frame with vertical white window-style handles)
      const doorW = doorOpeningHalfW; // 0.90 m
      const leafThick = 0.052;
      const stileW = 0.062;
      const topRailH = 0.062;
      const bottomRailH = 0.075;
      const glassW = doorW - stileW * 2;
      const glassH = innerH - topRailH - bottomRailH;
      const glassCenterY = (bottomRailH - topRailH) / 2;

      const whiteHandleMat = getMat(op.frameMaterial);

      const createVerticalWindowHandle = () => {
        const hGroup = new THREE.Group();
        // Compact rounded vertical escutcheon plate
        const plateW = 0.026;
        const plateR = plateW / 2;
        const plateStraightH = 0.048;
        const plateShape = new THREE.Shape();
        plateShape.absarc(0, plateStraightH / 2, plateR, 0, Math.PI, false);
        plateShape.absarc(0, -plateStraightH / 2, plateR, Math.PI, Math.PI * 2, false);
        plateShape.closePath();
        const plateDepth = leafThick + 0.012;
        const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
          depth: plateDepth,
          bevelEnabled: false,
          curveSegments: 14,
        });
        plateGeo.translate(0, 0, -plateDepth / 2);
        hGroup.add(new THREE.Mesh(plateGeo, whiteHandleMat));

        // Cylindrical neck through both sides
        const neckOffsetZ = leafThick / 2 + 0.028;
        const neckR = 0.0075;
        const neckGeo = new THREE.CylinderGeometry(neckR, neckR, neckOffsetZ * 2, 14);
        neckGeo.rotateX(Math.PI / 2);
        const neck = new THREE.Mesh(neckGeo, whiteHandleMat);
        neck.position.set(0, 0.016, 0);
        hGroup.add(neck);

        // Vertical downward-pointing grip on both sides
        const gripLen = 0.105;
        const gripGeo = new THREE.CylinderGeometry(neckR, neckR, gripLen, 14);
        const jointGeo = new THREE.SphereGeometry(neckR, 12, 10);
        for (const zSide of [1, -1]) {
          const zPos = zSide * neckOffsetZ;
          const elbow = new THREE.Mesh(jointGeo, whiteHandleMat);
          elbow.position.set(0, 0.016, zPos);
          hGroup.add(elbow);

          const grip = new THREE.Mesh(gripGeo, whiteHandleMat);
          grip.position.set(0, 0.016 - gripLen / 2, zPos);
          hGroup.add(grip);

          const tip = new THREE.Mesh(jointGeo, whiteHandleMat);
          tip.position.set(0, 0.016 - gripLen, zPos);
          hGroup.add(tip);
        }
        return hGroup;
      };

      const buildFrenchDoorLeaf = (side: -1 | 1) => {
        // side = -1: left leaf hinged at -doorOpeningHalfW, extends +X to 0
        // side = +1: right leaf hinged at +doorOpeningHalfW, extends -X to 0
        const pivot = new THREE.Group();
        pivot.position.set(side * doorOpeningHalfW, -frameThick / 2, frameCenterZ);

        const dir = -side; // +1 for left leaf, -1 for right leaf
        const leafCenterX = dir * (doorW / 2);

        const frameGeos: THREE.BufferGeometry[] = [];
        const addBar = (w: number, h: number, d: number, x: number, y: number) => {
          const g = new THREE.BoxGeometry(w, h, d);
          g.translate(x, y, 0);
          frameGeos.push(g);
        };

        // Hinge stile, meeting stile, top rail, bottom rail
        addBar(stileW, innerH, leafThick, dir * (stileW / 2), 0);
        addBar(stileW, innerH, leafThick, dir * (doorW - stileW / 2), 0);
        addBar(glassW, topRailH, leafThick, leafCenterX, innerH / 2 - topRailH / 2);
        addBar(glassW, bottomRailH, leafThick, leafCenterX, -innerH / 2 + bottomRailH / 2);

        const mergedFrame = mergeGeometries(frameGeos, false);
        for (const g of frameGeos) g.dispose();
        const frameMesh = new THREE.Mesh(mergedFrame, getMat(op.frameMaterial));
        frameMesh.castShadow = true;
        frameMesh.receiveShadow = true;
        pivot.add(frameMesh);

        // Full-height transparent glass pane (inset cleanly inside the white door frame)
        const glassMesh = new THREE.Mesh(
          new THREE.BoxGeometry(glassW + 0.008, glassH + 0.008, 0.014),
          getMat(op.panelMaterial)
        );
        glassMesh.position.set(leafCenterX, glassCenterY, 0);
        pivot.add(glassMesh);

        // White vertical window-style handle pointing down on the meeting stile
        const handleGroup = createVerticalWindowHandle();
        handleGroup.position.set(dir * (doorW - stileW / 2), -0.02, 0);
        pivot.add(handleGroup);

        group.add(pivot);
        return { pivot, frameMesh, glassMesh };
      };

      const leftLeaf = buildFrenchDoorLeaf(-1);
      const rightLeaf = buildFrenchDoorLeaf(1);

      const meta = {
        id: op.id,
        label: op.label,
        dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
        provenance: op.provenance,
        source: op.source,
        floor,
      };
      registerMesh(leftLeaf.glassMesh, op.panelMaterial, meta, false, false);
      registerMesh(rightLeaf.glassMesh, op.panelMaterial, meta, false, false);

      const trigger = createTrigger();
      if (onRegisterDoor) {
        onRegisterDoor({
          id: op.id,
          label: op.label,
          floor,
          pivots: [
            {
              group: leftLeaf.pivot,
              openAngle: -Math.PI * 0.45, // swings outward (+Z) to garden
              closedAngle: 0,
              currentAngle: 0,
            },
            {
              group: rightLeaf.pivot,
              openAngle: Math.PI * 0.45, // swings outward (+Z) to garden
              closedAngle: 0,
              currentAngle: 0,
            },
          ],
          triggerMeshes: [trigger, leftLeaf.frameMesh, rightLeaf.frameMesh, leftLeaf.glassMesh, rightLeaf.glassMesh],
          isHovered: false,
          isPinned: false,
        });
      }
      break;
    }

    case 'door_berging_garage_double': {
      // 1. Red-brown facade brick soldier course (rollaag) ONLY across the top, matching front door arch relief (0.044 m)
      buildTopBrickRollaag(group, getMat, registerMesh, {
        id: `${op.id}_top_rollaag`,
        label: 'Gemetselde Rollaag boven Garagedeur',
        lintelWidth: op.width + 0.06,
        lintelHeight: 0.19,
        openingHeight: op.height,
        wallThickness,
        provenance: op.provenance,
        source: op.source,
        floor,
      });

      // 2. Frameless single-piece sage-green kanteldeur (up-and-over tilt door) with crisp vertical ribs
      const doorW = op.width;
      const doorH = op.height;
      const doorPivot = new THREE.Group();
      doorPivot.position.set(0, 0, frameCenterZ);

      const doorGeos: THREE.BufferGeometry[] = [];
      const plateDepth = 0.036;
      const backingPlate = new THREE.BoxGeometry(doorW, doorH, plateDepth);
      doorGeos.push(backingPlate);

      const numSlats = 25;
      const slatPitch = doorW / numSlats;
      const slatW = slatPitch - 0.012; // 1.2 cm vertical shadow groove between slats
      const slatDepth = 0.016;
      for (let i = 0; i < numSlats; i++) {
        const sx = -doorW / 2 + (i + 0.5) * slatPitch;
        const slat = new THREE.BoxGeometry(slatW, doorH - 0.01, slatDepth);
        slat.translate(sx, 0, plateDepth / 2 + slatDepth / 2);
        doorGeos.push(slat);
      }

      const mergedDoorGeo = mergeGeometries(doorGeos, false);
      for (const g of doorGeos) g.dispose();
      const doorPanel = new THREE.Mesh(mergedDoorGeo, getMat(op.panelMaterial));
      doorPivot.add(doorPanel);

      // Centered simple horizontal brushed-steel grab handle (matching front door steel color)
      const garageHandleMat = new THREE.MeshStandardMaterial({
        color: '#a8aeb5',
        roughness: 0.35,
        metalness: 0.75,
        name: 'door_handle_steel',
      });
      const garageHandleGroup = new THREE.Group();
      const handleBaseZ = plateDepth / 2 + slatDepth;
      garageHandleGroup.position.set(0, -doorH / 2 + 0.72, handleBaseZ);

      const grabLen = 0.15;
      const barRadius = 0.0085;
      const barOffsetZ = 0.028;

      const grabGeo = new THREE.CylinderGeometry(barRadius, barRadius, grabLen, 14);
      grabGeo.rotateZ(Math.PI / 2);
      const grabMesh = new THREE.Mesh(grabGeo, garageHandleMat);
      grabMesh.position.set(0, 0, barOffsetZ);
      garageHandleGroup.add(grabMesh);

      const postGeo = new THREE.CylinderGeometry(barRadius * 0.85, barRadius * 0.85, barOffsetZ + 0.004, 12);
      postGeo.rotateX(Math.PI / 2);
      const capGeo = new THREE.SphereGeometry(barRadius, 12, 10);
      for (const side of [-1, 1]) {
        const px = side * (grabLen / 2 - 0.015);
        const post = new THREE.Mesh(postGeo, garageHandleMat);
        post.position.set(px, 0, barOffsetZ / 2);
        garageHandleGroup.add(post);

        const cap = new THREE.Mesh(capGeo, garageHandleMat);
        cap.position.set(side * (grabLen / 2), 0, barOffsetZ);
        garageHandleGroup.add(cap);
      }

      doorPivot.add(garageHandleGroup);

      group.add(doorPivot);

      const meta = {
        id: op.id,
        label: op.label,
        dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
        provenance: op.provenance,
        source: op.source,
        floor,
      };
      registerMesh(doorPanel, op.panelMaterial, meta);

      const trigger = createTrigger();
      if (onRegisterDoor) {
        onRegisterDoor({
          id: op.id,
          label: op.label,
          floor,
          pivots: [
            {
              group: doorPivot,
              openAngle: -Math.PI * 0.48, // tilts top inward (-Z) and bottom outward (+Z)
              closedAngle: 0,
              currentAngle: 0,
              onUpdate: (angle, t) => {
                doorPivot.rotation.x = angle;
                // Keep top edge gliding cleanly below the lintel while retracting ~65% into the garage
                doorPivot.position.y = (doorH / 2) * (1 - Math.cos(angle)) - 0.03 * t;
                doorPivot.position.z = frameCenterZ - (doorH * 0.35) * Math.sin(-angle);
              },
            },
          ],
          triggerMeshes: [trigger, doorPanel],
          isHovered: false,
          isPinned: false,
        });
      }
      break;
    }

    case 'door_entrance_front': {
      // Sage-green front entrance door with vertical glass vision panel, swings inward (-Z) into Hal
      buildSingleSwingingDoor(0.055, Math.PI * 0.45, true);
      break;
    }

    case 'door_berging_garden_rear': {
      // 1. Red-brown facade brick soldier course (rollaag) ONLY across the top, flush with opening width
      buildTopBrickRollaag(group, getMat, registerMesh, {
        id: `${op.id}_top_rollaag`,
        label: 'Gemetselde Rollaag boven Achterdeur Berging',
        lintelWidth: op.width,
        lintelHeight: 0.19,
        openingHeight: op.height,
        wallThickness,
        provenance: op.provenance,
        source: op.source,
        floor,
      });

      // Dark bottom threshold (onderdorpel)
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(op.width, 0.035, frameDepth + 0.02),
        getMat('roof_tile_anthracite')
      );
      sill.position.set(0, -op.height / 2 + 0.0175, frameCenterZ + 0.006);
      group.add(sill);

      // 2. Sage-green rear berging door leaf: upper glass (~60%), lower horizontal-grooved panel (~40%)
      // Hinged on the right (+X) in exterior view, swinging outward (+Z) into the garden
      const doorPivot = new THREE.Group();
      doorPivot.position.set(innerW / 2, -frameThick / 2, frameCenterZ);

      const leafThick = 0.054;
      const stileW = 0.115;
      const topRailH = 0.115;
      const bottomRailH = 0.11;
      const midRailH = 0.075;
      const lowerZoneH = innerH * 0.38; // lower horizontal-slat panel + bottom rail
      const glassW = Math.max(0.10, innerW - stileW * 2);
      const glassH = Math.max(0.20, innerH - topRailH - lowerZoneH - midRailH);
      const glassCenterY = innerH / 2 - topRailH - glassH / 2;
      const midRailCenterY = glassCenterY - glassH / 2 - midRailH / 2;
      const slatAreaH = Math.max(0.10, lowerZoneH - bottomRailH);
      const slatAreaBottomY = -innerH / 2 + bottomRailH;

      const leafGeos: THREE.BufferGeometry[] = [];
      const addPart = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y, z);
        leafGeos.push(g);
      };

      // Left & right stiles, top, middle, and bottom rails (centered at x = -innerW / 2)
      addPart(stileW, innerH, leafThick, -innerW + stileW / 2, 0);
      addPart(stileW, innerH, leafThick, -stileW / 2, 0);
      addPart(glassW, topRailH, leafThick, -innerW / 2, innerH / 2 - topRailH / 2);
      addPart(glassW, midRailH, leafThick, -innerW / 2, midRailCenterY);
      addPart(glassW, bottomRailH, leafThick, -innerW / 2, -innerH / 2 + bottomRailH / 2);

      // Recessed backing behind the lower horizontal slats
      const backingD = 0.028;
      addPart(glassW, slatAreaH, backingD, -innerW / 2, slatAreaBottomY + slatAreaH / 2);

      // 6 horizontal tongue-and-groove slats with crisp shadow grooves on exterior & interior faces
      const numSlats = 6;
      const slatPitch = slatAreaH / numSlats;
      const slatH = slatPitch - 0.008;
      const slatRelief = 0.011;
      for (let s = 0; s < numSlats; s++) {
        const sy = slatAreaBottomY + (s + 0.5) * slatPitch;
        addPart(glassW, slatH, slatRelief, -innerW / 2, sy, backingD / 2 + slatRelief / 2);
        addPart(glassW, slatH, slatRelief, -innerW / 2, sy, -backingD / 2 - slatRelief / 2);
      }

      const mergedLeaf = mergeGeometries(leafGeos, false);
      for (const g of leafGeos) g.dispose();
      const leafMesh = new THREE.Mesh(mergedLeaf, getMat(op.panelMaterial));
      doorPivot.add(leafMesh);

      // Upper glass pane
      const glassPane = new THREE.Mesh(
        new THREE.BoxGeometry(glassW, glassH, 0.014),
        getMat('window_glass_day')
      );
      glassPane.position.set(-innerW / 2, glassCenterY, 0);
      doorPivot.add(glassPane);

      // Rounded brushed-steel door handle on left stile (matching front door)
      const rearHandleMat = new THREE.MeshStandardMaterial({
        color: '#a8aeb5',
        roughness: 0.35,
        metalness: 0.75,
        name: 'door_handle_steel',
      });
      const rearHandle = createBrushedSteelLeverHandle({
        leafThickness: leafThick,
        handleMat: rearHandleMat,
        leverDirection: 1,
      });
      rearHandle.position.set(-innerW + stileW / 2, -0.02, 0);
      doorPivot.add(rearHandle);

      group.add(doorPivot);

      registerMesh(leafMesh, op.panelMaterial, {
        id: op.id,
        label: op.label,
        dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
        provenance: op.provenance,
        source: op.source,
        floor,
      });

      const trigger = createTrigger();
      if (onRegisterDoor) {
        onRegisterDoor({
          id: op.id,
          label: op.label,
          floor,
          pivots: [
            {
              group: doorPivot,
              openAngle: Math.PI * 0.45, // swings outward (+Z) into the garden
              closedAngle: 0,
              currentAngle: 0,
            },
          ],
          triggerMeshes: [trigger, leafMesh, glassPane],
          isHovered: false,
          isPinned: false,
        });
      }
      break;
    }

    default: {
      // Exterior Windows & Exterior Single Doors
      const isGlassWindow = op.panelMaterial.includes('glass');
      if (isGlassWindow && op.width >= 1.2) {
        // Asymmetrical vertical mullion (matching the photo!)
        const mullion = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, innerH, frameDepth * 0.9),
          getMat(op.frameMaterial)
        );
        mullion.position.set(op.width * 0.14, 0, frameCenterZ);
        group.add(mullion);
      }

      const thickness = isGlassWindow ? 0.025 : 0.055;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(innerW, innerH, thickness),
        getMat(op.panelMaterial)
      );
      panel.position.z = frameCenterZ;
      registerMesh(
        panel,
        op.panelMaterial,
        {
          id: op.id,
          label: op.label,
          dimensionsLabel: `${op.width.toFixed(2)} × ${op.height.toFixed(2)} m`,
          provenance: op.provenance,
          source: op.source,
          floor,
        },
        !isGlassWindow,
        !isGlassWindow
      );
      group.add(panel);
      break;
    }
  }

  wallContainer.add(group);
}

/**
 * Reusable Prefab: White Dutch Double-Quarter-Turn Staircase (Dubbele Kwartslagtrap, B61.1)
 *
 * Matches Verkooptekening VK-06 (1e verdieping / zolder) and HomeByMe 3D views:
 * - Total footprint: X from `minX` (0.40 m) to `minX + totalWidth` (2.87 m -> 2.47 m wide),
 *   Z from `frontZ` (-3.96 m, against the 12 cm stair-front wall) back to `frontZ - totalDepth` (-5.18 m -> 1.22 m deep).
 * - Run width = 0.88 m.
 * - Geometry sequence (15 risers total from `baseY` to `topY`):
 *   1. Step 1 (Entry tread at bottom-left, X: 0.40..1.28 m, Z: -5.18..-4.84 m, walking +Z toward front wall)
 *   2. Steps 2..5 (First 90° winder turn in front-left corner, X: 0.40..1.28 m, Z: -4.84..-3.96 m, pivoting around left newel post at [1.28, -4.84])
 *   3. Steps 6..9 (Middle straight treads along the 12 cm front wall, X: 1.28..1.99 m, Z: -4.84..-3.96 m, walking +X)
 *   4. Steps 10..13 (Second 90° winder turn in front-right corner, X: 1.99..2.87 m, Z: -4.84..-3.96 m, pivoting around right newel post at [1.99, -4.84])
 *   5. Step 14 (Top exit tread at rear-right, X: 1.99..2.87 m, Z: -5.12..-4.84 m, arriving onto upper landing)
 * - Rendered in clean white (`window_frame_cream` / `interior_wall_plaster`) with closed risers,
 *   central newel posts (`spillen`), stringers (`trapbomen`), and vertical baluster railings (`spijlenhekwerk`).
 */
export function instantiateWhiteDoubleTurnStaircase3D(
  targetGroup: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  id: string,
  label: string,
  floor: FloorLayerId,
  minX: number,
  frontZ: number,
  baseY: number,
  topY: number
): THREE.Group {
  const stairGroup = new THREE.Group();
  const totalRise = topY - baseY; // 2.85 m
  const totalSteps = 14;
  const stepRise = totalRise / (totalSteps + 1); // 15 risers (~19 cm each)
  const treadThickness = 0.04;

  const runWidth = 0.88; // 88 cm clear stair width
  const leftCornerPivotX = minX + runWidth; // 0.40 + 0.88 = 1.28 m
  const middleSpanX = 0.71; // 71 cm middle straight section (4 steps)
  const rightCornerPivotX = leftCornerPivotX + middleSpanX; // 1.28 + 0.71 = 1.99 m
  const maxX = rightCornerPivotX + runWidth; // 1.99 + 0.88 = 2.87 m (total width = 2.47 m, matching VK-06!)
  const pivotZ = frontZ - runWidth; // -3.96 - 0.88 = -4.84 m
  const entryZ = pivotZ - 0.34; // -5.18 m

  const whiteTreadMat = getMat('window_frame_cream');
  const whiteRiserMat = getMat('interior_wall_plaster');

  // Helper to create a 2D polygon tread in world (X, Z) extruded vertically
  const polygonsXZ: Array<Array<[number, number]>> = [];

  // 1. Step 1: Bottom entry straight tread on left (X: minX..leftCornerPivotX, Z: entryZ..pivotZ)
  polygonsXZ.push([
    [minX, entryZ],
    [leftCornerPivotX, entryZ],
    [leftCornerPivotX, pivotZ],
    [minX, pivotZ],
  ]);

  // 2. Steps 2..5: First 90° Winder Turn in front-left corner around (leftCornerPivotX, pivotZ)
  // Ray angles from (leftCornerPivotX, pivotZ):
  // Angle 0 = (-runWidth, 0) [points left to minX along pivotZ]
  // Angle PI/2 = (0, +runWidth) [points forward to frontZ along leftCornerPivotX]
  const corner1Rays: Array<[number, number]> = [
    [minX, pivotZ],
    [minX, pivotZ + runWidth * 0.42],
    [minX, frontZ], // Outer corner (chamfered/beveled slightly like VK-06)
    [minX + runWidth * 0.58, frontZ],
    [leftCornerPivotX, frontZ],
  ];
  for (let i = 0; i < 4; i++) {
    const pA = corner1Rays[i];
    const pB = corner1Rays[i + 1];
    if (i === 1) {
      // Include outer corner vertex (minX, frontZ)
      polygonsXZ.push([
        [leftCornerPivotX, pivotZ],
        pA,
        [minX, frontZ - 0.14],
        [minX + 0.14, frontZ],
        pB,
      ]);
    } else {
      polygonsXZ.push([[leftCornerPivotX, pivotZ], pA, pB]);
    }
  }

  // 3. Steps 6..8: Middle straight treads along the 12 cm front wall (X: leftCornerPivotX..rightCornerPivotX, Z: pivotZ..frontZ)
  const midSteps = 3;
  const midStepW = middleSpanX / midSteps;
  for (let i = 0; i < midSteps; i++) {
    const x0 = leftCornerPivotX + i * midStepW;
    const x1 = x0 + midStepW;
    polygonsXZ.push([
      [x0, pivotZ],
      [x0, frontZ],
      [x1, frontZ],
      [x1, pivotZ],
    ]);
  }

  // 4. Steps 9..12: Second 90° Winder Turn in front-right corner around (rightCornerPivotX, pivotZ)
  const corner2Rays: Array<[number, number]> = [
    [rightCornerPivotX, frontZ],
    [rightCornerPivotX + runWidth * 0.42, frontZ],
    [maxX, frontZ],
    [maxX, pivotZ + runWidth * 0.58],
    [maxX, pivotZ],
  ];
  for (let i = 0; i < 4; i++) {
    const pA = corner2Rays[i];
    const pB = corner2Rays[i + 1];
    if (i === 1) {
      polygonsXZ.push([
        [rightCornerPivotX, pivotZ],
        pA,
        [maxX - 0.14, frontZ],
        [maxX, frontZ - 0.14],
        pB,
      ]);
    } else {
      polygonsXZ.push([[rightCornerPivotX, pivotZ], pA, pB]);
    }
  }

  // 5. Steps 13..14: Top exit straight treads on right (X: rightCornerPivotX..maxX, Z: pivotZ..entryZ)
  const exitStepD = 0.24;
  for (let i = 0; i < 2; i++) {
    const z0 = pivotZ - i * exitStepD;
    const z1 = z0 - exitStepD;
    polygonsXZ.push([
      [rightCornerPivotX, z0],
      [maxX, z0],
      [maxX, z1],
      [rightCornerPivotX, z1],
    ]);
  }

  // Build each step: overhanging white tread plate + vertical front riser board (stootbord)
  // so the space underneath the upper run of the stairs remains open and architectural!
  for (let i = 0; i < polygonsXZ.length; i++) {
    const poly = polygonsXZ[i];
    const stepTopY = baseY + (i + 1) * stepRise;
    const stepBotY = baseY + i * stepRise;

    const shape = new THREE.Shape();
    shape.moveTo(poly[0][0], -poly[0][1]);
    for (let k = 1; k < poly.length; k++) {
      shape.lineTo(poly[k][0], -poly[k][1]);
    }
    shape.closePath();

    // 1. Vertical Front Riser Board (Stootbord, 2.5 cm thick) along the front edge (poly[0] -> poly[1])
    const p0 = poly[0];
    const p1 = poly[1];
    const edgeDx = p1[0] - p0[0];
    const edgeDz = p1[1] - p0[1];
    const edgeLen = Math.hypot(edgeDx, edgeDz);
    const edgeAngle = Math.atan2(-edgeDz, edgeDx);
    const riserH = stepRise;

    const riserGeo = new THREE.BoxGeometry(edgeLen, riserH, 0.025);
    const riserMesh = new THREE.Mesh(riserGeo, whiteRiserMat);
    riserMesh.position.set(
      (p0[0] + p1[0]) / 2,
      stepBotY + riserH / 2 - treadThickness / 2,
      (p0[1] + p1[1]) / 2
    );
    riserMesh.rotation.y = edgeAngle;
    riserMesh.castShadow = true;
    riserMesh.receiveShadow = true;
    stairGroup.add(riserMesh);

    // 2. White Tread Plate (Trede, 4 cm thick) at top of step
    const treadGeo = new THREE.ExtrudeGeometry(shape, {
      depth: treadThickness,
      bevelEnabled: false,
    });
    treadGeo.rotateX(-Math.PI / 2);
    const treadMesh = new THREE.Mesh(treadGeo, whiteTreadMat);
    treadMesh.position.y = stepTopY - treadThickness;

    if (i === 6) {
      registerMesh(treadMesh, 'window_frame_cream', {
        id,
        label,
        dimensionsLabel: `2.47 × 1.22 m (H=${totalRise.toFixed(2)} m · Dubbele kwartslag)`,
        provenance: 'verified_drawing',
        source: 'Verkooptekening VK-06 & HomeByMe (Witte dubbele kwartslagtrap B61.1)',
        floor,
      });
    } else {
      treadMesh.castShadow = true;
      treadMesh.receiveShadow = true;
    }
    stairGroup.add(treadMesh);
  }

  // Outer Wall Stringers (Trapbomen against left wall, front 12cm wall, and right side)
  const stringerMat = whiteTreadMat;
  // Front wall stringer (rising from step 3 at X=minX to step 11 at X=maxX along Z=frontZ)
  const frontStrRise = stepRise * 8;
  const frontStrSpan = maxX - minX;
  const frontStrLen = Math.hypot(frontStrSpan, frontStrRise);
  const frontStr = new THREE.Mesh(
    new THREE.BoxGeometry(frontStrLen, 0.22, 0.04),
    stringerMat
  );
  frontStr.position.set(
    (minX + maxX) / 2,
    baseY + stepRise * 7.0 - 0.06,
    frontZ - 0.02
  );
  frontStr.rotation.z = Math.atan2(frontStrRise, frontStrSpan);
  stairGroup.add(frontStr);

  // White Central Newel Posts (Spillen) & Balustrade Railings (matching HomeByMe 3D views!)
  const postW = 0.075;

  // 1. Entry bottom post at (leftCornerPivotX, entryZ)
  const entryPostH = stepRise * 2 + 0.92;
  const entryPost = new THREE.Mesh(
    new THREE.BoxGeometry(postW, entryPostH, postW),
    whiteTreadMat
  );
  entryPost.position.set(leftCornerPivotX, baseY + entryPostH / 2, entryZ);
  entryPost.castShadow = true;
  stairGroup.add(entryPost);

  // 2. Left Winder Corner Newel Post at (leftCornerPivotX, pivotZ) rising from floor to mid-stair + railing
  const leftPostH = stepRise * 7 + 0.95;
  const leftPost = new THREE.Mesh(
    new THREE.BoxGeometry(postW, leftPostH, postW),
    whiteTreadMat
  );
  leftPost.position.set(leftCornerPivotX, baseY + leftPostH / 2, pivotZ);
  leftPost.castShadow = true;
  stairGroup.add(leftPost);

  // 3. Right Winder Corner Newel Post at (rightCornerPivotX, pivotZ) rising from floor to upper floor + railing
  const rightPostH = totalRise + 0.95;
  const rightPost = new THREE.Mesh(
    new THREE.BoxGeometry(postW, rightPostH, postW),
    whiteTreadMat
  );
  rightPost.position.set(rightCornerPivotX, baseY + rightPostH / 2, pivotZ);
  rightPost.castShadow = true;
  stairGroup.add(rightPost);

  // 4. Lower Balustrade (between entryPost and leftPost)
  const lowerHandrailLen = Math.abs(pivotZ - entryZ);
  const lowerHandrail = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.045, lowerHandrailLen + 0.04),
    whiteTreadMat
  );
  lowerHandrail.position.set(
    leftCornerPivotX,
    baseY + stepRise * 2.2 + 0.85,
    (entryZ + pivotZ) / 2
  );
  lowerHandrail.rotation.x = 0.42;
  stairGroup.add(lowerHandrail);

  // Vertical balusters on lower section
  for (let b = 1; b <= 3; b++) {
    const t = b / 4;
    const bz = THREE.MathUtils.lerp(entryZ, pivotZ, t);
    const byBot = baseY + stepRise * (1 + t * 1.5);
    const byTop = baseY + stepRise * 2.2 + 0.85;
    const bal = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, byTop - byBot, 0.022),
      whiteTreadMat
    );
    bal.position.set(leftCornerPivotX, (byBot + byTop) / 2, bz);
    stairGroup.add(bal);
  }

  // 5. Middle Balustrade (between leftPost and rightPost along Z = pivotZ, with vertical balusters as seen in HomeByMe!)
  const midRailY0 = baseY + stepRise * 5.5 + 0.82;
  const midRailY1 = baseY + stepRise * 9.0 + 0.82;
  const midRailRise = midRailY1 - midRailY0;
  const midRailLen = Math.hypot(middleSpanX, midRailRise);
  const midRailAngle = Math.atan2(midRailRise, middleSpanX);

  const midHandrail = new THREE.Mesh(
    new THREE.BoxGeometry(midRailLen, 0.048, 0.055),
    whiteTreadMat
  );
  midHandrail.position.set(
    (leftCornerPivotX + rightCornerPivotX) / 2,
    (midRailY0 + midRailY1) / 2,
    pivotZ
  );
  midHandrail.rotation.z = midRailAngle;
  stairGroup.add(midHandrail);

  const midBottomStringer = new THREE.Mesh(
    new THREE.BoxGeometry(midRailLen, 0.16, 0.045),
    whiteTreadMat
  );
  midBottomStringer.position.set(
    (leftCornerPivotX + rightCornerPivotX) / 2,
    (midRailY0 + midRailY1) / 2 - 0.78,
    pivotZ
  );
  midBottomStringer.rotation.z = midRailAngle;
  stairGroup.add(midBottomStringer);

  for (let b = 1; b <= 4; b++) {
    const t = b / 5;
    const bx = THREE.MathUtils.lerp(leftCornerPivotX, rightCornerPivotX, t);
    const byTop = THREE.MathUtils.lerp(midRailY0, midRailY1, t);
    const byBot = byTop - 0.78;
    const bal = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, byTop - byBot, 0.022),
      whiteTreadMat
    );
    bal.position.set(bx, (byBot + byTop) / 2, pivotZ);
    stairGroup.add(bal);
  }

  targetGroup.add(stairGroup);
  return stairGroup;
}

