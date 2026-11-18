import { m, cm, Dimension, ProvenanceType } from './units';
import { MaterialId } from './materials';
import { OpeningPrefabId } from '../geometry/componentCatalog';

export type { ProvenanceType };

/**
 * SOURCE OF TRUTH: Bouwnummer 55 — Wonen aan de Hulk, Scharwoude
 * Type D, Es | Twee-onder-één-kapwoning (with Meerwerk B11a 2.40m extension, B13 garden doors)
 *
 * Coordinate System (Canonical Metres):
 * - X axis (West -> East / Left -> Right when viewed from the front street):
 *     X =  0.00 m  : Left outer face of the main house exterior wall (Linkerzijgevel)
 *     X = +0.40 m  : Left inner face of main house (40 cm outer wall)
 *     X = +5.57 m  : Right inner face of main house (0.40 + 5.17 m interior width)
 *     X = +5.87 m  : Right outer face of shared party wall with neighbour (30 cm thick)
 *     X = -3.19 m  : Left inner face of attached Berging (3.19 m interior width)
 *     X = -3.27 m  : Left outer face of attached Berging (8 cm outer wall; total building width = 3.27 + 5.87 = 9.14 m!)
 *     X = -4.28 m  : Rear-Left Plot Corner at Z = -20.63 m (1015 cm rear plot width from X = +5.87 m)
 *     X = -5.00 m  : Front-Left Plot Corner at Z = +5.00 m (1087 cm front plot width from X = +5.87 m)
 *
 * - Y axis (Vertical elevation above Peil = 0.00 m):
 *     Y =  0.00 m  : Ground floor finished floor level (Begane Grond peil)
 *     Y = +2.60 m  : Ground floor ceiling level (260 cm height)
 *     Y = +2.85 m  : First floor finished floor level (1e Verdieping, 2.60 m + 0.25 m slab) & Berging/Extension roof top
 *     Y = +5.45 m  : First floor ceiling level (260 cm height)
 *     Y = +5.70 m  : Second floor finished floor level (2e Verdieping / Zolder, 2.85 + 2.60 + 0.25 m slab)
 *     Y = +6.13 m  : Eaves / gutter height (Goothoogte)
 *     Y = +10.90 m : Roof ridge height (Nokhoogte, 5.20 m above Zolder floor)
 *
 * - Z axis (North/Rear -> South/Front):
 *     Z = +5.00 m  : Front Plot Boundary (500 cm front garden in front of Z = 0.00 m house facade)
 *     Z =  0.00 m  : Front exterior face of main house (Voorgevel)
 *     Z = -0.40 m  : Front interior face of main house (40 cm outer wall)
 *     Z = -3.84 m  : Front face of 12 cm stair-front wall (-0.40 - 3.44 m front room depth)
 *     Z = -3.96 m  : Rear face of 12 cm stair-front wall (-3.84 - 0.12 m)
 *     Z = -10.06 m : Rear interior face of Base House (-0.40 - 9.66 m interior length = -10.06 m!)
 *     Z = -10.46 m : Rear exterior face of 1st & 2nd floor (-10.06 - 0.40 m outer wall = -10.46 m)
 *     Z = -12.46 m : Rear interior face of extended ground floor (-0.40 - 12.06 m = -12.46 m; 966 + 240 = 1206 cm!)
 *     Z = -12.86 m : Rear exterior face of extended ground floor (-12.46 - 0.40 m outer wall = -12.86 m)
 *     Z = -13.72 m : Rear exterior face of Berging (protrudes 0.86 m behind extended house; 5.99 m total length)
 *     Z = -20.63 m : Rear Plot Boundary (777 cm back garden behind Z = -12.86 m extended house; total right boundary = 25.63 m)
 */

export const HOUSE_DIMENSIONS = {
  // 1. Core Wall Thicknesses & Building Widths (X)
  mainInteriorWidth: m(5.17, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground/1st Floor (5,17 m)'),
  exteriorWallThickness: cm(40, 'user_supplied', 'User specification: Outer wall of the house is 40 cm thick'),
  partyWallThickness: cm(30, 'user_supplied', 'User specification: Shared wall with the neighbours is 30 cm thick'),
  stairFrontWallThickness: cm(12, 'user_supplied', 'User specification: Load-bearing wall in front of staircase is 12 cm thick (Ground & 1st floor)'),
  interiorWallThickness: cm(7, 'verified_drawing', 'Verified across Ground & 1st Floor on VK-06: Standard inner walls are 7 cm thick'),
  atticWallThickness: cm(12.5, 'user_supplied', 'User specification: Inner walls around the attic stair hall (Overloop) are 12.5 cm thick'),
  bergingFrontWallThickness: cm(20, 'user_supplied', 'User specification: Wall with the garage door is 20 cm thick'),
  bergingOtherWallThickness: cm(8, 'user_supplied', 'User specification: Other berging walls are 8 cm thick'),
  bergingExteriorWidth: m(3.44, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground Floor (3.44 m)'),
  bergingInteriorWidth: m(3.19, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground Floor (3.19 m)'),
  totalBuildingWidth: m(9.14, 'calculated', 'Exact chain: 0.08m (berging left) + 3.19m (berging) + 0.40m (left outer) + 5.17m (house) + 0.30m (shared wall) = 9.14 m'),

  // 2. Ground Floor Dimensions (Begane Grond — 7 cm standard inner walls, 12 cm stair-front wall)
  // Exact front-to-back interior chain: 344 + 12 + 242 + 7 + 92 + 7 + 262 (base) + 240 (extension) = 1206 cm (12.06 m)!
  groundBaseInteriorLength: m(9.66, 'calculated', 'Exact chain: 344 + 12 + 242 + 7 + 92 + 7 + 262 = 966 cm (matches 1st & 2nd floor 966 cm!)'),
  groundInteriorLengthExtended: m(12.06, 'calculated', 'Exact chain: 966 cm base + 240 cm (B11a extension) = 1206 cm (12.06 m)'),
  groundExteriorLengthExtended: m(12.86, 'calculated', '0.40m (front wall) + 12.06m (interior) + 0.40m (rear wall) = 12.86 m'),
  groundExteriorLengthWithBerging: m(13.72, 'calculated', '12.86m (extended house) + 0.86m (berging protrusion) = 13.72 m'),
  rearExtensionDepth: m(2.40, 'verified_drawing', 'Tekening woonwensen 55.1 Option B11a (Uitbreiding 2,4m)'),
  frontLivingDepth: m(3.44, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground Floor front living zone (3.44 m)'),
  hallTotalBlockDepth: m(3.60, 'calculated', 'Exact chain: 0.12m (stair wall) + 2.42m (hal) + 0.07m (wall) + 0.92m (toilet) + 0.07m (wall) = 3.60 m'),
  hallInteriorDepth: m(2.42, 'verified_drawing', 'Verkooptekening VK-06 Hal interior depth (2,42 m)'),
  hallInteriorWidth: m(2.54, 'verified_drawing', 'Verkooptekening VK-06 Hal interior width (2,54 m; 254 + 7 + 256 = 517 cm!)'),
  hallBlockWidth: m(2.61, 'calculated', 'Exact chain: 2.54m (hal inner width) + 0.07m (right hall wall) = 2.61 m'),
  livingPassageWidth: m(2.56, 'verified_drawing', 'Verkooptekening VK-06 living room width alongside hall (2,56 m; 254 + 7 + 256 = 517 cm!)'),
  stairWidth: m(2.54, 'verified_drawing', 'Matches Hal interior width 2.54 m on VK-06'),
  stairDepth: cm(95, 'verified_drawing', 'Verkooptekening VK-06 ground floor quarter-turn stair run depth (95 cm)'),
  toiletInteriorWidth: m(1.50, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground Floor toilet width (1.50 m)'),
  toiletInteriorDepth: cm(92, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground Floor toilet depth (0.92 m)'),
  hallNicheLeftWidth: cm(97, 'calculated', 'Exact chain: 254 cm (Hal width) - 150 cm (Toilet) - 7 cm (wall) = 97 cm'),
  hallNicheLeftDepth: cm(99, 'calculated', 'Exact chain: 7 cm (toilet front wall) + 92 cm (toilet depth) = 99 cm'),
  kitchenBaseDepth: m(2.62, 'verified_drawing', 'Verkooptekening VK-06 base kitchen depth before extension (2,62 m)'),
  kitchenDiningDepthExtended: m(5.02, 'calculated', 'Exact chain: 2.62 m (VK-06 base kitchen) + 2.40 m (B11a extension) = 5.02 m (502 cm)'),
  kitchenTallCabinetNicheWidth: m(1.60, 'verified_drawing', 'Tekening woonwensen 55.1 ID55.1 kitchen cabinet wall (1600 mm)'),
  bergingExteriorLength: m(5.99, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Ground Floor Berging length (5.99 m)'),
  bergingOverlapWithHouse: m(5.13, 'calculated', '5.99 m Berging length - 0.86 m rear protrusion = 5.13 m overlap along house'),
  bergingRearProtrusion: cm(86, 'user_supplied', 'HomeByMe Ground Floor Berging protrusion past extended rear wall (0.86 m)'),

  // 3. First Floor Dimensions (1e Verdieping — 7 cm standard inner walls, 12 cm stair-front wall)
  // Exact front-to-back interior chain: 344 + 12 + 227 + 7 + 376 = 966 cm (9.66 m)!
  upperFloorInteriorLength: m(9.66, 'verified_drawing', 'Verkooptekening VK-06 1st/2nd floor interior length (344 + 12 + 227 + 7 + 376 = 966 cm!)'),
  upperFloorExteriorLength: m(10.46, 'calculated', 'Exact chain: 0.40m (front wall) + 9.66m (interior) + 0.40m (rear wall) = 10.46 m'),
  bedroom2FrontDepth: m(3.44, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor front master bedroom depth (3.44 m)'),
  bedroom2FrontWidth: m(5.17, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor front master bedroom width (5.17 m)'),
  overloop1stDepth: m(2.27, 'verified_drawing', 'Verkooptekening VK-06 & User specification: 1st Floor Overloop & Kast depth is 227 cm (2.27 m)'),
  overloop1stWidth: m(3.60, 'verified_drawing', 'Verkooptekening VK-06 & User specification: 1st Floor Overloop width is 360 cm (3.60 m; 360 + 7 + 150 = 517 cm)'),
  walkInClosetWidth: m(1.50, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor Kast width (1.50 m)'),
  walkInClosetDepth: m(2.27, 'verified_drawing', 'Matches Overloop depth 227 cm (2.27 m)'),
  bathroomWidth: m(2.01, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor Badkamer width (2.01 m)'),
  bathroomDepth: m(3.76, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor Badkamer depth (3.76 m)'),
  bathroomShaftDepth: cm(92, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor Badkamer pipe chase (0.92 m)'),
  bathroomWidthAtToilet: m(1.67, 'user_supplied', 'HomeByMe 1st Floor Badkamer width beside pipe shaft (1.67 m)'),
  bedroom1RearWidth: m(3.09, 'verified_drawing', 'Verkooptekening VK-06 & User specification: Kantoor / Slaapkamer 1 width is 309 cm (201 + 7 + 309 = 517 cm)'),
  bedroom1RearDepth: m(3.76, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe 1st Floor Kantoor / Slaapkamer 1 depth (3.76 m)'),

  // 4. Second Floor Dimensions (2e Verdieping / Zolder)
  // Exact front-to-back interior chain: 346 + 12.5 + 225 + 12.5 + 370 = 966 cm (9.66 m)!
  zolderFrontZoneDepth: m(3.46, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Zolder front zone depth (3.46 m)'),
  zolderOverloopDepth: m(2.25, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Zolder Overloop depth (2.25 m)'),
  zolderRearZoneDepth: m(3.70, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Zolder rear zone depth (3.70 m; 3.46 + 0.125 + 2.25 + 0.125 + 3.70 = 9.66 m!)'),
  zolderOverloopWidth150: m(1.78, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Zolder Overloop inner width from 1.50m line (1.78 m)'),
  zolderRightClearWidth: m(2.53, 'verified_drawing', 'Verkooptekening VK-06 Zolder width right of Overloop (2.53 m)'),
  zolderWidthBetween150Lines: m(3.64, 'verified_drawing', 'Verkooptekening VK-06 & HomeByMe Zolder width between 1.50m roof lines (3.64 m)'),
  zolderWidthFromLeft150ToParty: m(4.43, 'verified_drawing', 'Verkooptekening VK-06 Zolder width from left 1.50m knieschot to shared party wall (4.43 m)'),
  zolderPartyWall150Length: m(6.51, 'verified_drawing', 'Verkooptekening VK-06 Zolder length along party wall between neighbour roof slopes (6.51 m)'),
  zolderCornerKnieschotDepth: m(1.575, 'calculated', 'Exact chain: (9.66 m interior length - 6.51 m party wall span) / 2 = 1.575 m corner knieschot depth'),

  // 5. Vertical Heights (Y) — 260 cm Level Ceiling Height per User Specification
  groundFloorCeilingHeight: m(2.60, 'user_supplied', 'User specification: Level ceiling height is 260 cm (2.60 m)'),
  floorSlabThickness: cm(25, 'verified_drawing', 'Verkooptekening VK-06 Doorsnede AA structural floor slab + screed (25 cm)'),
  firstFloorElevation: m(2.85, 'calculated', 'Ground ceiling 2.60 m + 0.25 m slab = +2.85 m'),
  firstFloorCeilingHeight: m(2.60, 'user_supplied', 'User specification: Level ceiling height is 260 cm (2.60 m)'),
  secondFloorElevation: m(5.70, 'calculated', '1st floor +2.85 m + 2.60 m ceiling + 0.25 m slab = +5.70 m'),
  bergingRoofHeight: m(2.85, 'calculated', 'Berging & Extension flat roof flush with 1st floor slab (+2.85 m)'),
  eavesGutterHeight: m(6.13, 'verified_drawing', 'Verkooptekening VK-06 Doorsnede AA eaves height (+6.13 m above peil)'),
  roofRidgeHeight: m(10.90, 'verified_drawing', 'Verkooptekening VK-06 Doorsnede AA ridge height (+10.90 m above peil; 5.20 m above Zolder)'),
  zolderKneeWallHeight: m(1.50, 'verified_drawing', 'Verkooptekening VK-06 & 55.3 explicit line H = 1.500 mm + vloer'),
  zolderMidSlopeHeight: m(2.60, 'verified_drawing', 'Verkooptekening VK-06 & 55.3 explicit line H = 2.600 mm + vloer'),

  // 6. Plot, Garden & Context Surroundings (Trapezoidal Plot — User Supplied)
  plotRearWidth: cm(1015, 'user_supplied', 'User plot plan: Back garden width at top is 1015 cm (10.15 m)'),
  plotFrontWidth: cm(1087, 'user_supplied', 'User plot plan: Front garden width at bottom is 1087 cm (10.87 m)'),
  rearGardenDepth: cm(777, 'user_supplied', 'User plot plan: Back garden depth behind extended house is 777 cm (7.77 m)'),
  frontGardenDepth: cm(500, 'user_supplied', 'User plot plan: Front garden depth in front of house is 500 cm (5.00 m)'),
  plotRightBoundaryLength: m(25.63, 'calculated', 'Exact chain: 5.00 m (front garden) + 12.86 m (extended house) + 7.77 m (back garden) = 25.63 m'),
  beechHedgeHeight: m(1.50, 'user_supplied', 'Garden layout.png "Beech hedge · 1.5 m"'),
  sideAccessPathWidth: cm(96, 'user_supplied', 'Garden layout.png "Access around berging" & Garden gate width'),
  neighbourContextSectionWidth: m(2.20, 'assumed', 'Project requirement: ~2.0 m cutaway section of attached neighbour bnr. 56'),
  surroundingContextMargin: m(1.85, 'assumed', 'Project requirement: 1–2 m surrounding environment margin on all sides with soft fade'),
  neighbourFrontStepBack: cm(22, 'verified_drawing', 'Verkooptekening VK-06 bnr. 56 front/rear facade recession (3.44 m - 3.22 m = 22 cm)'),
} as const;

export type FloorLayerId = 'plot' | 'ground' | 'first' | 'second' | 'roof';

/**
 * Wall opening placement referencing a canonical prefab from `componentCatalog.ts`.
 * Optional overrides allow customizing sillHeight or width only when needed.
 */
export interface WallOpeningPlacement {
  id: string;
  prefabId: OpeningPrefabId;
  label?: string;
  /** Offset along the wall from the wall's start point (in metres, measured to opening center) */
  offsetAlongWall: number;
  widthOverride?: number;
  heightOverride?: number;
  sillHeightOverride?: number;
}

export interface WallSpec {
  id: string;
  label: string;
  floor: FloorLayerId;
  /** Start point (x, z) in metres along wall centerline */
  start: [number, number];
  /** End point (x, z) in metres along wall centerline */
  end: [number, number];
  thickness: number;
  baseY: number;
  height: number;
  /** Optional gable peak [offsetAlongWall, peakHeightAboveBase] for triangular/trapezoidal gable walls */
  gablePeak?: {
    offsetAlongWall: number;
    peakHeight: number;
  };
  /** Optional roof slope clip at top of interior attic walls */
  clipToRoof?: boolean;
  exteriorMaterial: MaterialId;
  interiorMaterial: MaterialId;
  isExterior?: boolean;
  isNeighbour?: boolean;
  openings?: WallOpeningPlacement[];
  provenance: ProvenanceType;
  source: string;
}

export interface RoomFloorSpec {
  id: string;
  label: string;
  floor: FloorLayerId;
  /** Axis-aligned bounding box [minX, minZ, maxX, maxZ] in metres */
  bounds: [number, number, number, number];
  elevationY: number;
  thickness: number;
  topMaterial: MaterialId;
  edgeMaterial: MaterialId;
  isNeighbour?: boolean;
  areaSqm: number;
  dimensionsLabel: string;
  provenance: ProvenanceType;
  source: string;
}

/**
 * Complete Architectural Wall Definitions for Bouwnummer 55 (+ Attached Neighbour 56 Context)
 *
 * Exact Mathematical Alignment Across All 3 Floors:
 * - Outer walls of main house: 40 cm (0.40 m)
 * - Shared neighbour wall: 30 cm (0.30 m)
 * - Front Berging wall with garage door: 20 cm (0.20 m)
 * - Other Berging walls: 8 cm (0.08 m)
 * - Stair-front load-bearing wall (Ground & 1st floor): 12 cm (0.12 m)
 * - Standard inner walls (Ground & 1st floor): 7 cm (0.07 m)
 *     • Ground Floor Depth: 344 + 12 + 242 + 7 + 92 + 7 + 262 = 966 cm (+ 240 cm extension = 1206 cm!)
 *     • Ground Floor Width: 254 (Hal) + 7 (wall) + 256 (Woonkamer) = 517 cm!
 *     • 1st Floor Depth   : 344 + 12 + 227 + 7 + 376 = 966 cm!
 *     • 1st Floor Widths  : 360 + 7 + 150 = 517 cm (Middle), 201 + 7 + 309 = 517 cm (Rear)!
 * - Attic stair-hall (Overloop) inner walls: 12.5 cm (0.125 m)
 *     • Attic Depth       : 346 + 12.5 + 225 + 12.5 + 370 = 966 cm!
 */
export function getHouseWalls(): WallSpec[] {
  const H0 = HOUSE_DIMENSIONS.groundFloorCeilingHeight.metres; // 2.60 m
  const Y1 = HOUSE_DIMENSIONS.firstFloorElevation.metres;      // 2.85 m
  const H1 = HOUSE_DIMENSIONS.firstFloorCeilingHeight.metres;  // 2.60 m
  const Y2 = HOUSE_DIMENSIONS.secondFloorElevation.metres;     // 5.70 m
  const H_GABLE = HOUSE_DIMENSIONS.roofRidgeHeight.metres - Y2; // 5.20 m

  const walls: WallSpec[] = [
    // =========================================================================
    // GROUND FLOOR (BEGANE GROND) — BaseY = 0.00 m, Ceiling Height = 2.60 m
    // Z-chain (966 cm base + 240 cm extension = 1206 cm interior, 1286 cm exterior):
    //   0.00..-0.40   : Front exterior wall (40 cm)
    //  -0.40..-3.84   : Woonkamer voorzijde (344 cm)
    //  -3.84..-3.96   : Trapwand (12 cm)
    //  -3.96..-6.38   : Hal (242 cm)
    //  -6.38..-6.45   : Voorwand toilet (7 cm)
    //  -6.45..-7.37   : Toilet (92 cm)
    //  -7.37..-7.44   : Achterwand toilet (7 cm)
    //  -7.44..-12.46  : Eetkamer / Keuken (262 + 240 = 502 cm) -> Total interior = 1206 cm!
    // -12.46..-12.86  : Rear exterior wall (40 cm)
    // =========================================================================

    // 1. Front Exterior Wall (Voorgevel, thickness = 0.40 m, Z: 0.00..-0.40 m, centerline Z = -0.20 m, X: 0.00 -> 5.87 m)
    {
      id: 'gf_wall_front',
      label: 'Voorgevel (Begane Grond — 40 cm dik)',
      floor: 'ground',
      start: [0.00, -0.20],
      end: [5.87, -0.20],
      thickness: 0.40,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + VK-06 (5.17 m interior)',
      openings: [
        {
          id: 'gf_win_front_living',
          prefabId: 'window_living_front',
          offsetAlongWall: 3.00,
        },
      ],
    },

    // 2. Left Exterior Wall (Linkerzijgevel, thickness = 0.40 m, X: 0.00..+0.40 m, centerline X = +0.20 m, Z: -12.46 -> -0.40 m)
    // Oriented counter-clockwise (Rear -> Front) so local +Z is OUTSIDE (X = 0.00 m) and local -Z is INSIDE (X = +0.40 m)!
    {
      id: 'gf_wall_left',
      label: 'Linkerzijgevel (Begane Grond — 40 cm dik)',
      floor: 'ground',
      start: [0.20, -12.46],
      end: [0.20, -0.40],
      thickness: 0.40,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + 12.06 m interior depth',
      openings: [
        {
          id: 'gf_door_entrance',
          prefabId: 'door_entrance_front',
          offsetAlongWall: 6.96, // Z = -12.46 + 6.96 = -5.50 m (in Hal)
        },
        {
          id: 'gf_win_side_living',
          prefabId: 'window_living_side',
          offsetAlongWall: 10.31, // Z = -12.46 + 10.31 = -2.15 m (in Woonkamer voorzijde)
        },
      ],
    },

    // 3. Rear Exterior Wall (Achtergevel Uitbouw B11a, thickness = 0.40 m, Z: -12.46..-12.86 m, centerline Z = -12.66 m, X: 0.00 -> 5.87 m)
    {
      id: 'gf_wall_rear',
      label: 'Achtergevel Uitbouw B11a (Begane Grond — 40 cm dik)',
      floor: 'ground',
      start: [5.87, -12.66],
      end: [0.00, -12.66],
      thickness: 0.40,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + Tekening 55.1 (B11a + B13)',
      openings: [
        {
          id: 'gf_door_rear_garden',
          prefabId: 'door_garden_double_b13',
          offsetAlongWall: 2.93,
        },
      ],
    },

    // 4. Shared Party Wall with Neighbour bnr. 56 (thickness = 0.30 m, X: 5.57..5.87 m, centerline X = 5.72 m, Z: -12.46 -> -0.40 m)
    // Spans strictly between the inner faces of the 40 cm front and rear walls so the ends never clip through the facades!
    {
      id: 'gf_wall_party',
      label: 'Woningscheidende Wand met Buren (Begane Grond — 30 cm dik)',
      floor: 'ground',
      start: [5.72, -12.46],
      end: [5.72, -0.40],
      thickness: 0.30,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: false,
      provenance: 'user_supplied',
      source: 'User specification: Shared wall with the neighbours is 30 cm thick',
    },

    // 5. Interior Ground Floor Walls (7 cm standard, 12 cm stair-front wall):
    // 5a. Exception: Wall behind the staircase (facing front living room) = 12 cm thick!
    // Z: -3.84 to -3.96 m (centerline Z = -3.90 m), X: 0.40 to 3.01 m (width = 2.61 m = 254 cm Hal + 7 cm wall)
    {
      id: 'gf_int_hall_front',
      label: 'Dragende Trapwand naar Woonkamer (2.61 m breed — 12 cm dik)',
      floor: 'ground',
      start: [0.40, -3.90],
      end: [3.01, -3.90],
      thickness: 0.12,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification: Wall behind the staircase (facing front) is 12 cm thick',
    },
    // 5b. Right wall of Hall/Toilet separating Hal (254 cm) from Woonkamer (256 cm) = 7 cm thick!
    // X: 2.94 to 3.01 m (centerline X = 2.975 m), Z: -3.84 to -7.44 m (total span = 3.60 m: 12 + 242 + 7 + 92 + 7 = 360 cm)
    {
      id: 'gf_int_hall_right',
      label: 'Tussenwand Hal & Toilet / Woonkamer (3.60 m — 7 cm dik)',
      floor: 'ground',
      start: [2.975, -3.84],
      end: [2.975, -7.44],
      thickness: 0.07,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'VK-06 & User specification: 254 cm (Hal) + 7 cm (wall) + 256 cm (Woonkamer) = 517 cm',
      openings: [
        {
          id: 'gf_door_hall_to_living',
          prefabId: 'door_inner_living_glass_b72',
          offsetAlongWall: 1.98,
        },
      ],
    },
    // 5c. Rear wall of Toilet/Hall backing the Kitchen tall cabinets = 7 cm thick!
    // Z: -7.37 to -7.44 m (centerline Z = -7.405 m), X: 0.40 to 3.01 m (width = 2.61 m)
    {
      id: 'gf_int_toilet_rear',
      label: 'Achterwand Toilet / Keukennis (2.61 m — 7 cm dik)',
      floor: 'ground',
      start: [0.40, -7.405],
      end: [3.01, -7.405],
      thickness: 0.07,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'VK-06 & User specification (7 cm inner wall): 344 + 12 + 242 + 7 + 92 + 7 + 262 = 966 cm',
    },
    // 5d. Front wall of Toilet (separating Toilet 1.50×0.92m from Hal 2.42m) = 7 cm thick!
    // Z: -6.38 to -6.45 m (centerline Z = -6.415 m), X: 1.37 to 3.01 m
    {
      id: 'gf_int_toilet_front',
      label: 'Voorwand Toilet met Deur (1.64 m — 7 cm dik)',
      floor: 'ground',
      start: [1.37, -6.415],
      end: [3.01, -6.415],
      thickness: 0.07,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'VK-06 & User specification (7 cm inner wall, Toilet 1.50 × 0.92 m)',
      openings: [
        {
          id: 'gf_door_toilet',
          prefabId: 'door_inner_standard_b77b',
          label: 'Toiletdeur B77b (93 × 231 cm)',
          offsetAlongWall: 0.85,
        },
      ],
    },
    // 5e. Left wall of Toilet (separating Toilet 1.50m from 0.97m Hal niche, length = 0.99 m) = 7 cm thick!
    // X: 1.37 to 1.44 m (centerline X = 1.405 m), Z: -6.38 to -7.44 m
    {
      id: 'gf_int_toilet_left',
      label: 'Zijwand Toilet / Meterkast (0.99 m — 7 cm dik)',
      floor: 'ground',
      start: [1.405, -6.38],
      end: [1.405, -7.44],
      thickness: 0.07,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'VK-06 & User specification (97 cm niche + 7 cm wall + 150 cm toilet = 254 cm Hal)',
    },

    // 6. Attached Berging (Garage) Walls:
    // - Front wall with garage door: 20 cm (0.20 m) thick!
    // - Other berging walls (left, rear, right 0.86m protrusion): 8 cm (0.08 m) thick!
    // Interior width = 3.19 m (X: -3.19 to 0.00 m), Left 8cm wall X: -3.27 to -3.19 m (centerline X = -3.23 m).
    // Length = 5.99 m (Z: -7.73 to -13.72 m, protruding 0.86 m behind -12.86 m).
    {
      id: 'gf_berging_front',
      label: 'Voorgevel Berging met Garagedeur (3.27 m — 20 cm dik)',
      floor: 'ground',
      start: [-3.27, -7.83],
      end: [0.00, -7.83],
      thickness: 0.20,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'floor_berging_concrete',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification: Wall with the garage door is 20 cm thick (3.19 m interior)',
      openings: [
        {
          id: 'gf_door_berging_front',
          prefabId: 'door_berging_garage_double',
          offsetAlongWall: 1.635,
        },
      ],
    },
    {
      id: 'gf_berging_left',
      label: 'Linkerzijgevel Berging (5.99 m — 8 cm dik)',
      floor: 'ground',
      start: [-3.23, -13.72],
      end: [-3.23, -7.73],
      thickness: 0.08,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'floor_berging_concrete',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification: Other berging walls are 8 cm thick; length 5.99 m',
    },
    {
      id: 'gf_berging_rear',
      label: 'Achtergevel Berging met Tuindeur (3.27 m — 8 cm dik)',
      floor: 'ground',
      start: [0.08, -13.68],
      end: [-3.27, -13.68],
      thickness: 0.08,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'floor_berging_concrete',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification: Other berging walls are 8 cm thick',
      openings: [
        {
          id: 'gf_door_berging_rear',
          prefabId: 'door_berging_garden_rear',
          offsetAlongWall: 1.25,
        },
      ],
    },
    {
      id: 'gf_berging_right_protrusion',
      label: 'Rechtermuur Berging voorbij Uitbouw (0.86 m — 8 cm dik)',
      floor: 'ground',
      start: [0.04, -12.86],
      end: [0.04, -13.72],
      thickness: 0.08,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'floor_berging_concrete',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (8 cm berging wall) + HomeByMe (0.86 m protrusion)',
    },

    // =========================================================================
    // FIRST FLOOR (1e VERDIEPING) — BaseY = +2.85 m, Ceiling Height = 2.60 m
    // Exact Z-chain (966 cm interior, 1046 cm exterior):
    //   0.00..-0.40   : Front exterior wall (40 cm)
    //  -0.40..-3.84   : Slaapkamer voorzijde (344 cm)
    //  -3.84..-3.96   : Trapwand (12 cm)
    //  -3.96..-6.23   : Overloop & Kast (227 cm)
    //  -6.23..-6.30   : Tussenwand Overloop / Badkamer & Kantoor (7 cm)
    //  -6.30..-10.06  : Badkamer & Kantoor (376 cm) -> 344 + 12 + 227 + 7 + 376 = 966 cm!
    // -10.06..-10.46  : Rear exterior wall (40 cm)
    // =========================================================================

    // 1. Front Exterior Wall (1e Verdieping — 40 cm dik, Z = -0.20 m, X: 0.00 -> 5.87 m)
    {
      id: 'ff_wall_front',
      label: 'Voorgevel (1e Verdieping — 40 cm dik)',
      floor: 'first',
      start: [0.00, -0.20],
      end: [5.87, -0.20],
      thickness: 0.40,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + VK-06 (5.17 m interior)',
      openings: [
        {
          id: 'ff_win_front_french',
          prefabId: 'window_french_balcony_1st',
          label: 'Frans Balkon Slaapkamer Voorzijde (136 × 215 cm)',
          offsetAlongWall: 3.76,
        },
      ],
    },

    // 2. Left Exterior Wall (1e Verdieping — 40 cm dik, X = +0.20 m, Z: -10.06 -> -0.40 m)
    // Oriented counter-clockwise (Rear -> Front) so local +Z is OUTSIDE (X = 0.00 m) and local -Z is INSIDE (X = +0.40 m)!
    {
      id: 'ff_wall_left',
      label: 'Linkerzijgevel (1e Verdieping — 40 cm dik)',
      floor: 'first',
      start: [0.20, -10.06],
      end: [0.20, -0.40],
      thickness: 0.40,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + VK-06 (9.66 m interior, 10.46 m exterior)',
      openings: [
        {
          id: 'ff_win_side_overloop',
          prefabId: 'window_gable_slot',
          label: 'Smalle Raamstrook Overloop (42 × 145 cm)',
          offsetAlongWall: 4.96, // Z = -10.06 + 4.96 = -5.10 m (in Overloop)
        },
        {
          id: 'ff_win_side_bedroom2',
          prefabId: 'window_bedroom_side',
          offsetAlongWall: 7.94, // Z = -10.06 + 7.94 = -2.12 m (in Slaapkamer 2)
        },
      ],
    },

    // 3. Rear Exterior Wall (1e Verdieping — 40 cm dik, Z: -10.06..-10.46 m, centerline Z = -10.26 m, X: 0.00 -> 5.87 m)
    {
      id: 'ff_wall_rear',
      label: 'Achtergevel (1e Verdieping — 40 cm dik)',
      floor: 'first',
      start: [5.87, -10.26],
      end: [0.00, -10.26],
      thickness: 0.40,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + VK-06 achtergevel',
      openings: [
        {
          id: 'ff_win_rear_kantoor',
          prefabId: 'window_french_balcony_1st',
          label: 'Frans Balkon Kantoor Achterzijde (136 × 215 cm)',
          offsetAlongWall: 2.05,
        },
        {
          id: 'ff_win_rear_badkamer',
          prefabId: 'window_bathroom_rear',
          offsetAlongWall: 4.45,
        },
      ],
    },

    // 4. Shared Party Wall with Neighbour (1e Verdieping — 30 cm dik, X = 5.72 m, Z: -10.06 -> -0.40 m)
    // Spans strictly between the inner faces of the 40 cm front and rear walls so the ends never clip through the facades!
    {
      id: 'ff_wall_party',
      label: 'Woningscheidende Wand met Buren (1e Verdieping — 30 cm dik)',
      floor: 'first',
      start: [5.72, -10.06],
      end: [5.72, -0.40],
      thickness: 0.30,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification: Shared wall with the neighbours is 30 cm thick',
    },

    // 5. Interior Walls on 1st Floor (7 cm thick, except 12 cm stair-front wall):
    // 5a. Exception: Wall behind the stairs (facing front bedroom Slaapkamer) = 12 cm thick!
    {
      id: 'ff_int_bedroom2_overloop',
      label: 'Dragende Trapwand Slaapkamer / Overloop (3.60 m — 12 cm dik)',
      floor: 'first',
      start: [0.40, -3.90],
      end: [4.035, -3.90],
      thickness: 0.12,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification: Wall behind stairs facing front of house is 12 cm thick (matches wall below)',
      openings: [
        {
          id: 'ff_door_bedroom2',
          prefabId: 'door_inner_standard_b77b',
          label: 'Deur Slaapkamer Voorzijde B77b (93 × 231 cm)',
          offsetAlongWall: 2.95,
        },
      ],
    },
    // 5b. Wall between Front Slaapkamer and Kast (1.50 m inner width, 7 cm thick)
    {
      id: 'ff_int_kast_front',
      label: 'Wand Slaapkamer / Kast (1.54 m — 7 cm dik)',
      floor: 'first',
      start: [4.035, -3.925],
      end: [5.57, -3.925],
      thickness: 0.07,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (7 cm inner wall) + VK-06 & HomeByMe (1.50 m Kast)',
    },
    // 5c. Wall between Overloop (360 cm) and Kast (150 cm), depth 227 cm = 7 cm thick!
    {
      id: 'ff_int_overloop_kast',
      label: 'Tussenwand Overloop / Kast (2.27 m — 7 cm dik)',
      floor: 'first',
      start: [4.035, -3.90],
      end: [4.035, -6.265],
      thickness: 0.07,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification & VK-06: 360 cm (Overloop) + 7 cm (wall) + 150 cm (Kast) = 517 cm; depth 227 cm',
      openings: [
        {
          id: 'ff_door_kast',
          prefabId: 'door_inner_standard_b77b',
          label: 'Deur Inloopkast B77b (93 × 231 cm)',
          offsetAlongWall: 1.18,
        },
      ],
    },
    // 5d. Wall separating Overloop + Kast (depth 227 cm) from Badkamer + Kantoor (depth 376 cm) = 7 cm thick!
    {
      id: 'ff_int_rear_rooms_front',
      label: 'Wand Overloop / Badkamer & Kantoor (5.17 m — 7 cm dik)',
      floor: 'first',
      start: [0.40, -6.265],
      end: [5.57, -6.265],
      thickness: 0.07,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (7 cm inner wall): 344 + 12 + 227 + 7 + 376 = 966 cm',
      openings: [
        {
          id: 'ff_door_badkamer',
          prefabId: 'door_inner_standard_b77b',
          label: 'Badkamerdeur B77b (93 × 231 cm)',
          offsetAlongWall: 1.45,
        },
        {
          id: 'ff_door_kantoor',
          prefabId: 'door_inner_standard_b77b',
          label: 'Deur Kantoor B77b (93 × 231 cm)',
          offsetAlongWall: 2.95,
        },
      ],
    },
    // 5e. Wall between Badkamer (201 cm wide) and Kantoor (309 cm wide), depth 376 cm = 7 cm thick!
    {
      id: 'ff_int_badkamer_kantoor',
      label: 'Tussenwand Badkamer / Kantoor (3.76 m — 7 cm dik)',
      floor: 'first',
      start: [2.445, -6.265],
      end: [2.445, -10.06],
      thickness: 0.07,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification & VK-06: 201 cm (Badkamer) + 7 cm (wall) + 309 cm (Kantoor) = 517 cm',
    },
    // 5f. Pipe chase walls in front-left corner of Badkamer (0.92 m × 0.34 m, 7 cm walls)
    {
      id: 'ff_int_badkamer_shaft_right',
      label: 'Leidingkoker Badkamer Zijwand (0.92 m — 7 cm dik)',
      floor: 'first',
      start: [0.705, -6.30],
      end: [0.705, -7.22],
      thickness: 0.07,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (7 cm inner wall) + VK-06 (0.92 m shaft)',
    },
    {
      id: 'ff_int_badkamer_shaft_rear',
      label: 'Leidingkoker Badkamer Voorwand (0.55 m — 7 cm dik)',
      floor: 'first',
      start: [0.40, -7.255],
      end: [0.95, -7.255],
      thickness: 0.07,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (7 cm inner wall) + HomeByMe 1st Floor',
    },

    // =========================================================================
    // SECOND FLOOR (2e VERDIEPING / ZOLDER) — BaseY = +5.70 m, Gable Peak = +10.90 m
    // Inner walls around the stair hall (Overloop) are all 12.5 cm (0.125 m) thick!
    // Exact Z-chain (966 cm interior, 1046 cm exterior):
    //   0.00..-0.40     : Front exterior gable wall (40 cm)
    //  -0.40..-3.86     : Zolder voorzijde (346 cm)
    //  -3.86..-3.985    : Voorwand Overloop (12.5 cm)
    //  -3.985..-6.235   : Overloop (225 cm)
    //  -6.235..-6.36    : Achterwand Overloop (12.5 cm)
    //  -6.36..-10.06    : Zolder achterzijde (370 cm) -> 346 + 12.5 + 225 + 12.5 + 370 = 966 cm!
    // -10.06..-10.46    : Rear exterior gable wall (40 cm)
    // =========================================================================

    // 1. Front Gable Wall (Voorgevel Tuitgevel Zolder — 40 cm dik, Z = -0.20 m, X: 0.00 -> 5.87 m)
    {
      id: 'sf_wall_front_gable',
      label: 'Voorgevel Tuitgevel (Zolder — 40 cm dik)',
      floor: 'second',
      start: [0.00, -0.20],
      end: [5.87, -0.20],
      thickness: 0.40,
      baseY: Y2,
      height: 0.43,
      gablePeak: {
        offsetAlongWall: 2.985,
        peakHeight: 4.92,
      },
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + VK-06 voorgevel',
      openings: [
        {
          id: 'sf_win_front_slot',
          prefabId: 'window_gable_slot',
          label: 'Topgevelraam Voorzijde Zolder (42 × 145 cm)',
          offsetAlongWall: 2.985,
          sillHeightOverride: 1.35,
        },
      ],
    },

    // 2. Rear Gable Wall (Achtergevel Tuitgevel Zolder — 40 cm dik, Z = -10.26 m, X: 0.00 -> 5.87 m)
    {
      id: 'sf_wall_rear_gable',
      label: 'Achtergevel Tuitgevel (Zolder — 40 cm dik)',
      floor: 'second',
      start: [5.87, -10.26],
      end: [0.00, -10.26],
      thickness: 0.40,
      baseY: Y2,
      height: 0.43,
      gablePeak: {
        offsetAlongWall: 2.885,
        peakHeight: 4.92,
      },
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'user_supplied',
      source: 'User specification (40 cm outer wall) + VK-06 achtergevel',
      openings: [
        {
          id: 'sf_win_rear_slot',
          prefabId: 'window_gable_slot',
          label: 'Topgevelraam Achterzijde Zolder (42 × 145 cm)',
          offsetAlongWall: 2.885,
          sillHeightOverride: 1.35,
        },
      ],
    },

    // 3. Left Exterior Eaves Wall on Zolder (40 cm dik, X = 0.20 m, Z: -10.06 -> -0.40 m)
    // Extends 25 cm downward (Y: +5.45 -> +5.70 m) to cover the 2nd-floor slab & stairwell gap on the exterior,
    // and rises 0.43 m above the Zolder floor to the eaves at +6.13 m!
    {
      id: 'sf_wall_left_outer',
      label: 'Linkerzijgevel Borstwering (Zolder — 40 cm dik)',
      floor: 'second',
      start: [0.20, -10.06],
      end: [0.20, -0.40],
      thickness: 0.40,
      baseY: Y2,
      height: 0.43,
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      isExterior: true,
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Doorsnede AA & Linkerzijgevel (borstwering tot goothoogte +6.13 m)',
    },

    // 3a. Left Inner Knee Wall (Knieschot at inner face X = 1.14 m, Z: -0.40 -> -10.06 m, touching roof underside)
    {
      id: 'sf_wall_left_eaves',
      label: 'Linker Borstwering / Knieschot (onderzijde kap)',
      floor: 'second',
      start: [1.105, -0.40],
      end: [1.105, -10.06],
      thickness: 0.07,
      baseY: Y2,
      height: 4.92,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & Doorsnede AA (4.43 m van woningscheidende wand, aansluitend tegen kap)',
    },

    // 3b. Front-Right Corner Knieschotten (Clipped directly to roof underside & matching exterior/party wall heights at intersections)
    {
      id: 'sf_knieschot_front_right_x',
      label: 'Rechter Knieschot Voorhoek langs Kap (1.575 m — aansluitend tegen kap & voorgevel)',
      floor: 'second',
      start: [4.815, -0.40],
      end: [4.815, -1.975],
      thickness: 0.07,
      baseY: Y2,
      height: 4.92,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (3.64 m tussen knieschotten; diepte 1.575 m, tot onderzijde kap)',
    },
    {
      id: 'sf_knieschot_front_right_z',
      label: 'Rechter Knieschot Voorhoek Dwars (0.79 m — schuin meelopend met kap tot woningscheidende wand)',
      floor: 'second',
      start: [4.78, -1.94],
      end: [5.57, -1.94],
      thickness: 0.07,
      baseY: Y2,
      height: 4.92,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (4.43 m - 3.64 m = 0.79 m naar woningscheidende wand, tot onderzijde kap)',
    },

    // 3c. Rear-Right Corner Knieschotten (Clipped directly to roof underside & matching exterior/party wall heights at intersections)
    {
      id: 'sf_knieschot_rear_right_x',
      label: 'Rechter Knieschot Achterhoek langs Kap (1.575 m — aansluitend tegen kap & achtergevel)',
      floor: 'second',
      start: [4.815, -8.485],
      end: [4.815, -10.06],
      thickness: 0.07,
      baseY: Y2,
      height: 4.92,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (3.64 m tussen knieschotten; diepte 1.575 m, tot onderzijde kap)',
    },
    {
      id: 'sf_knieschot_rear_right_z',
      label: 'Rechter Knieschot Achterhoek Dwars (0.79 m — schuin meelopend met kap tot woningscheidende wand)',
      floor: 'second',
      start: [4.78, -8.52],
      end: [5.57, -8.52],
      thickness: 0.07,
      baseY: Y2,
      height: 4.92,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (4.43 m - 3.64 m = 0.79 m; 6.51 m tussen voor- en achterhoek, tot onderzijde kap)',
    },

    // 4. Right Shared Party Wall on Zolder (30 cm dik, X = 5.72 m, Z: -10.06 -> -0.40 m, length = 9.66 m)
    // Pointy gable profile matching the intersecting roof (0.43 m at front & back eaves, rising to 4.92 m peak at center Z = -5.23 m)!
    {
      id: 'sf_wall_party_zolder',
      label: 'Woningscheidende Wand met Buren (Zolder — 30 cm dik, Puntgevel onder Kap)',
      floor: 'second',
      start: [5.72, -10.06],
      end: [5.72, -0.40],
      thickness: 0.30,
      baseY: Y2,
      height: 0.43,
      gablePeak: {
        offsetAlongWall: 4.83,
        peakHeight: 4.92,
      },
      exteriorMaterial: 'exterior_brick_main',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification: Shared wall with neighbours (30 cm thick) with pointy gable shape following the roof',
    },

    // 5. Attic Stair Hall (Overloop) Inner Walls — All 12.5 cm (0.125 m) thick, clipped directly to roof underside!
    {
      id: 'sf_int_overloop_front',
      label: 'Voorwand Overloop Zolder (1.90 m — 12.5 cm dik)',
      floor: 'second',
      start: [1.14, -3.9225],
      end: [3.045, -3.9225],
      thickness: 0.125,
      baseY: Y2,
      height: 4.95,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (12.5 cm inner walls) + VK-06 Doorsnede AA (doorlopend tot onderzijde kap)',
    },
    {
      id: 'sf_int_overloop_rear',
      label: 'Achterwand Overloop Zolder (1.90 m — 12.5 cm dik)',
      floor: 'second',
      start: [1.14, -6.2975],
      end: [3.045, -6.2975],
      thickness: 0.125,
      baseY: Y2,
      height: 4.95,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (12.5 cm inner walls) + VK-06 Doorsnede AA (doorlopend tot onderzijde kap)',
    },
    {
      id: 'sf_int_overloop_right',
      label: 'Rechterwand Overloop Zolder met Deur (2.50 m — 12.5 cm dik)',
      floor: 'second',
      start: [2.9825, -3.86],
      end: [2.9825, -6.36],
      thickness: 0.125,
      baseY: Y2,
      height: 4.95,
      clipToRoof: true,
      exteriorMaterial: 'interior_wall_plaster',
      interiorMaterial: 'interior_wall_plaster',
      provenance: 'user_supplied',
      source: 'User specification (12.5 cm inner walls) + VK-06 Doorsnede AA (tot in de nok)',
      openings: [
        {
          id: 'sf_door_overloop_to_zolder',
          prefabId: 'door_inner_standard_b77b',
          label: 'Deur Overloop naar Zolder B77b (93 × 231 cm — 19.6 cm van achterwand)',
          offsetAlongWall: 1.714, // Rear edge is 19.6 cm from inner rear wall (32.1 cm from outer corner)
        },
      ],
    },

    // =========================================================================
    // ATTACHED NEIGHBOUR CONTEXT (Bouwnummer 56 — 2.20 m section in Neutral Grey)
    // =========================================================================
    {
      id: 'nb_gf_front',
      label: 'Buurwoning bnr. 56 Voorgevel (Begane Grond — 22 cm terugliggend)',
      floor: 'ground',
      start: [5.87, -0.42],
      end: [8.05, -0.42],
      thickness: 0.40,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'neighbour_wall_grey',
      interiorMaterial: 'neighbour_wall_grey',
      isExterior: true,
      isNeighbour: true,
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 bnr. 56 (0.22 m facade setback)',
      openings: [
        {
          id: 'nb_gf_win_front',
          prefabId: 'neighbour_window_ground',
          offsetAlongWall: 1.25,
        },
      ],
    },
    {
      id: 'nb_gf_rear',
      label: 'Buurwoning bnr. 56 Achtergevel (Begane Grond)',
      floor: 'ground',
      start: [8.05, -10.04],
      end: [5.87, -10.04],
      thickness: 0.40,
      baseY: 0.00,
      height: H0,
      exteriorMaterial: 'neighbour_wall_grey',
      interiorMaterial: 'neighbour_wall_grey',
      isExterior: true,
      isNeighbour: true,
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 bnr. 56 base rear wall',
    },
    {
      id: 'nb_ff_front',
      label: 'Buurwoning bnr. 56 Voorgevel (1e Verdieping)',
      floor: 'first',
      start: [5.87, -0.42],
      end: [8.05, -0.42],
      thickness: 0.40,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'neighbour_wall_grey',
      interiorMaterial: 'neighbour_wall_grey',
      isExterior: true,
      isNeighbour: true,
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 voorgevel bnr. 56',
      openings: [
        {
          id: 'nb_ff_win_front',
          prefabId: 'neighbour_french_balcony',
          offsetAlongWall: 1.20,
        },
      ],
    },
    {
      id: 'nb_ff_rear',
      label: 'Buurwoning bnr. 56 Achtergevel (1e Verdieping)',
      floor: 'first',
      start: [8.05, -10.04],
      end: [5.87, -10.04],
      thickness: 0.40,
      baseY: Y1,
      height: H1,
      exteriorMaterial: 'neighbour_wall_grey',
      interiorMaterial: 'neighbour_wall_grey',
      isExterior: true,
      isNeighbour: true,
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 achtergevel bnr. 56',
    },
  ];

  return walls;
}

export function getRoomFloors(): RoomFloorSpec[] {
  const Y1 = HOUSE_DIMENSIONS.firstFloorElevation.metres;  // 2.85 m
  const Y2 = HOUSE_DIMENSIONS.secondFloorElevation.metres; // 5.70 m

  return [
    // =========================================================================
    // GROUND FLOOR ROOMS (Y = 0.00 m)
    // Exact chains:
    //   Depth : 344 (Woonkamer) + 12 + 242 (Hal) + 7 + 92 (Toilet) + 7 + 502 (Keuken 262+240) = 1206 cm
    //   Width : 254 (Hal) + 7 (wall) + 256 (Woonkamer passage) = 517 cm
    //   Toilet: 97 (Niche) + 7 (wall) + 150 (Toilet) = 254 cm
    // =========================================================================
    {
      id: 'room_gf_woonkamer_front',
      label: 'Woonkamer (Voorzijde)',
      floor: 'ground',
      bounds: [0.40, -3.84, 5.57, -0.40],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_living_oak',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((5.17 * 3.44).toFixed(2)),
      dimensionsLabel: '5.17 × 3.44 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & HomeByMe Ground Floor',
    },
    {
      id: 'room_gf_woonkamer_passage',
      label: 'Woonkamer (Doorkijk naast Hal)',
      floor: 'ground',
      bounds: [3.01, -7.44, 5.57, -3.84],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_living_oak',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((2.56 * 3.60).toFixed(2)),
      dimensionsLabel: '2.56 × 3.60 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 (254 + 7 + 256 = 517 cm; depth 360 cm)',
    },
    {
      id: 'room_gf_keuken_eetkamer',
      label: 'Woonkeuken & Eetkamer (2.62 m + 2.40 m Uitbouw = 5.02 m)',
      floor: 'ground',
      bounds: [0.40, -12.46, 5.57, -7.44],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_living_oak',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((5.17 * 5.02).toFixed(2)),
      dimensionsLabel: '5.17 × 5.02 m (totale diepte 12.06 m)',
      provenance: 'verified_drawing',
      source: 'VK-06 (2.62 m keuken) + Tekening 55.1 (2.40 m B11a) = 5.02 m (966 + 240 = 1206 cm)',
    },
    {
      id: 'room_gf_hal',
      label: 'Entree / Hal',
      floor: 'ground',
      bounds: [0.40, -6.38, 2.94, -3.96],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_hall_warm',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((2.54 * 2.42).toFixed(2)),
      dimensionsLabel: '2.54 × 2.42 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 (2.54 m breed × 2.42 m diep)',
    },
    {
      id: 'room_gf_hal_niche',
      label: 'Garderobe / Meterkast Nis',
      floor: 'ground',
      bounds: [0.40, -7.37, 1.37, -6.38],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_hall_warm',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((0.97 * 0.99).toFixed(2)),
      dimensionsLabel: '0.97 × 0.99 m',
      provenance: 'calculated',
      source: 'Derived from 254 cm Hal - 150 cm Toilet - 7 cm wall = 97 cm',
    },
    {
      id: 'room_gf_toilet',
      label: 'Toiletruimte (Terra Maestricht 300×300)',
      floor: 'ground',
      bounds: [1.44, -7.37, 2.94, -6.45],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_tile_beige',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((1.50 * 0.92).toFixed(2)),
      dimensionsLabel: '1.50 × 0.92 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06, Tekening 55.1 (T11b) & HomeByMe',
    },
    {
      id: 'room_gf_berging',
      label: 'Aangebouwde Berging / Garage',
      floor: 'ground',
      bounds: [-3.19, -13.64, 0.00, -7.93],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'floor_berging_concrete',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((3.19 * 5.71).toFixed(2)),
      dimensionsLabel: '3.19 × 5.71 m (uitw. 3.44 × 5.99 m)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & HomeByMe Ground Floor',
    },
    {
      id: 'room_gf_neighbour',
      label: 'Buurwoning bnr. 56 (Begane Grond Context)',
      floor: 'ground',
      bounds: [5.87, -10.24, 8.05, -0.22],
      elevationY: 0.00,
      thickness: 0.25,
      topMaterial: 'neighbour_ground_grey',
      edgeMaterial: 'neighbour_wall_grey',
      isNeighbour: true,
      areaSqm: Number((2.18 * 10.02).toFixed(2)),
      dimensionsLabel: 'Context 2.20 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 bnr. 56',
    },

    // =========================================================================
    // FIRST FLOOR ROOMS (Y = +2.85 m)
    // =========================================================================
    {
      id: 'room_ff_slaapkamer2',
      label: 'Slaapkamer 2 (Master Bedroom Voorzijde)',
      floor: 'first',
      bounds: [0.40, -3.84, 5.57, -0.40],
      elevationY: Y1,
      thickness: 0.25,
      topMaterial: 'floor_bedroom_soft',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((5.17 * 3.44).toFixed(2)),
      dimensionsLabel: '5.17 × 3.44 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & HomeByMe 1st Floor',
    },
    {
      id: 'room_ff_overloop',
      label: 'Overloop (1e Verdieping)',
      floor: 'first',
      bounds: [0.40, -6.23, 4.00, -3.96],
      elevationY: Y1,
      thickness: 0.25,
      topMaterial: 'floor_bedroom_soft',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((3.60 * 2.27).toFixed(2)),
      dimensionsLabel: '3.60 × 2.27 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & User specification (360 × 227 cm)',
    },
    {
      id: 'room_ff_kast',
      label: 'Inloopkast / Kast',
      floor: 'first',
      bounds: [4.07, -6.23, 5.57, -3.96],
      elevationY: Y1,
      thickness: 0.25,
      topMaterial: 'floor_hall_warm',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((1.50 * 2.27).toFixed(2)),
      dimensionsLabel: '1.50 × 2.27 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 (150 × 227 cm; 360 + 7 + 150 = 517 cm)',
    },
    {
      id: 'room_ff_badkamer',
      label: 'Badkamer (Terra Maestricht 300×300)',
      floor: 'first',
      bounds: [0.40, -10.06, 2.41, -6.30],
      elevationY: Y1,
      thickness: 0.25,
      topMaterial: 'floor_tile_beige',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((2.01 * 3.76).toFixed(2)),
      dimensionsLabel: '2.01 × 3.76 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06, Tekening 55.2 & HomeByMe 1st Floor',
    },
    {
      id: 'room_ff_kantoor',
      label: 'Kantoor / Slaapkamer 1 (Achterzijde)',
      floor: 'first',
      bounds: [2.48, -10.06, 5.57, -6.30],
      elevationY: Y1,
      thickness: 0.25,
      topMaterial: 'floor_tile_beige',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((3.09 * 3.76).toFixed(2)),
      dimensionsLabel: '3.09 × 3.76 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & User specification (201 + 7 + 309 = 517 cm, depth 376 cm)',
    },
    {
      id: 'room_ff_neighbour',
      label: 'Buurwoning bnr. 56 (1e Verdieping Context)',
      floor: 'first',
      bounds: [5.87, -10.24, 8.05, -0.22],
      elevationY: Y1,
      thickness: 0.25,
      topMaterial: 'neighbour_ground_grey',
      edgeMaterial: 'neighbour_wall_grey',
      isNeighbour: true,
      areaSqm: Number((2.18 * 10.02).toFixed(2)),
      dimensionsLabel: 'Context 2.20 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 bnr. 56',
    },

    // =========================================================================
    // SECOND FLOOR ROOMS (2e VERDIEPING / ZOLDER, Y = +5.70 m)
    // Per Technische Omschrijving §15.1: "Bij het toepassen van knieschotten wordt achter het knieschot geen afwerkvloer aangebracht."
    // =========================================================================
    {
      id: 'room_sf_zolder_front_narrow',
      label: 'Zolder (Voorzijde tussen Knieschotten — 3.64 m breed)',
      floor: 'second',
      bounds: [1.14, -1.975, 4.78, -0.40],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'floor_zolder_wood',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((3.64 * 1.575).toFixed(2)),
      dimensionsLabel: '3.64 × 1.58 m (tussen 1.50m-knieschotten)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (3,64* tussen H=1.500mm lijnen)',
    },
    {
      id: 'room_sf_zolder_front_wide',
      label: 'Zolder (Voorzijde onder Langskap — 4.43 m breed)',
      floor: 'second',
      bounds: [1.14, -3.86, 5.57, -1.975],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'floor_zolder_wood',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((4.43 * 1.885).toFixed(2)),
      dimensionsLabel: '4.43 × 1.89 m (totale diepte voorzijde 3.46 m)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (4,43* tot woningscheidende wand)',
    },
    {
      id: 'room_sf_zolder_right',
      label: 'Zolder (Hoofdruimte Rechts naast Overloop)',
      floor: 'second',
      bounds: [3.045, -6.36, 5.57, -3.86],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'floor_zolder_wood',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((2.525 * 2.50).toFixed(2)),
      dimensionsLabel: '2.53 × 6.51 m (tot 9.66 m)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (2.53 m breedte naast overloop)',
    },
    {
      id: 'room_sf_zolder_rear_wide',
      label: 'Zolder (Achterzijde incl. Opstelplaats Installaties — 4.43 m breed)',
      floor: 'second',
      bounds: [1.14, -8.485, 5.57, -6.36],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'floor_zolder_wood',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((4.43 * 2.125).toFixed(2)),
      dimensionsLabel: '4.43 × 2.13 m (totale diepte achterzijde 3.70 m)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (4,43* breed, 3.70 m achter overloop)',
    },
    {
      id: 'room_sf_zolder_rear_narrow',
      label: 'Zolder (Achterzijde tussen Knieschotten — 3.64 m breed)',
      floor: 'second',
      bounds: [1.14, -10.06, 4.78, -8.485],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'floor_zolder_wood',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((3.64 * 1.575).toFixed(2)),
      dimensionsLabel: '3.64 × 1.58 m (tussen 1.50m-knieschotten)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 Zolder (3,64* tussen H=1.500mm lijnen)',
    },
    {
      id: 'room_sf_overloop',
      label: 'Overloop (2e Verdieping — 12.5 cm wanden)',
      floor: 'second',
      bounds: [1.14, -6.235, 2.92, -3.985],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'floor_zolder_wood',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((1.78 * 2.25).toFixed(2)),
      dimensionsLabel: '1.78 × 2.25 m (uitw. 1.90 × 2.50 m)',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 & HomeByMe Zolder (1.78 × 2.25 m)',
    },
    {
      id: 'room_sf_eaves_storage',
      label: 'Bergruimte achter Linker Knieschot (< 1.50 m — geen afwerkvloer)',
      floor: 'second',
      bounds: [0.40, -10.06, 1.14, -0.40],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'slab_structural_edge',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((0.74 * 9.66).toFixed(2)),
      dimensionsLabel: '0.74 × 9.66 m',
      provenance: 'calculated',
      source: 'Derived from 5.17 m interior width - 4.43 m to 1.50m line = 0.74 m (Technische Omschrijving §15.1)',
    },
    {
      id: 'room_sf_eaves_storage_front_right',
      label: 'Bergruimte achter Rechter Knieschot Voorhoek (< 1.50 m — geen afwerkvloer)',
      floor: 'second',
      bounds: [4.78, -1.975, 5.57, -0.40],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'slab_structural_edge',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((0.79 * 1.575).toFixed(2)),
      dimensionsLabel: '0.79 × 1.58 m',
      provenance: 'calculated',
      source: 'Derived from 4.43 m - 3.64 m = 0.79 m width × 1.575 m depth (Technische Omschrijving §15.1)',
    },
    {
      id: 'room_sf_eaves_storage_rear_right',
      label: 'Bergruimte achter Rechter Knieschot Achterhoek (< 1.50 m — geen afwerkvloer)',
      floor: 'second',
      bounds: [4.78, -10.06, 5.57, -8.485],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'slab_structural_edge',
      edgeMaterial: 'slab_structural_edge',
      areaSqm: Number((0.79 * 1.575).toFixed(2)),
      dimensionsLabel: '0.79 × 1.58 m',
      provenance: 'calculated',
      source: 'Derived from 4.43 m - 3.64 m = 0.79 m width × 1.575 m depth (Technische Omschrijving §15.1)',
    },
    {
      id: 'room_sf_neighbour',
      label: 'Buurwoning bnr. 56 (Zoldervloer Context)',
      floor: 'second',
      bounds: [5.87, -10.24, 8.05, -0.22],
      elevationY: Y2,
      thickness: 0.25,
      topMaterial: 'neighbour_ground_grey',
      edgeMaterial: 'neighbour_wall_grey',
      isNeighbour: true,
      areaSqm: Number((2.18 * 10.02).toFixed(2)),
      dimensionsLabel: 'Context 2.20 m',
      provenance: 'verified_drawing',
      source: 'Verkooptekening VK-06 bnr. 56',
    },
  ];
}
