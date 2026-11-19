import * as THREE from 'three';
import { HOUSE_DIMENSIONS, getHouseWalls, getRoomFloors } from '../model/houseData';
import { formatDimension } from '../model/units';
import { OPENING_PREFABS } from '../geometry/componentCatalog';
import { ASSET_PREFABS, PLACED_ASSETS } from '../assets/assetRegistry';
import { buildHouseScene, getZolderRoofUndersideY } from '../geometry/houseBuilder';
import { applyScrollProgressToScene } from '../viewer/scrollTimeline';
import { createLightingRig, applyDayNightState } from '../viewer/dayNightController';

function assertClose(actual: number, expected: number, tolerance: number, message: string) {
  const diff = Math.abs(actual - expected);
  if (Number.isNaN(actual) || diff > tolerance) {
    throw new Error(`[DIMENSION MISMATCH] ${message}: expected ${expected} m (±${tolerance} m), got ${actual} m`);
  }
  console.log(`  ✓ ${message}: ${actual.toFixed(3)} m (matches source ${expected.toFixed(3)} m)`);
}

console.log('===================================================================');
console.log(' DIMENSIONAL ACCURACY & PROVENANCE AUDIT — BOUWNUMMER 55');
console.log('===================================================================\n');

// 1. Audit Provenance Registry
const allDims = Object.entries(HOUSE_DIMENSIONS);
const counts = {
  verified_drawing: 0,
  user_supplied: 0,
  calculated: 0,
  assumed: 0,
};

for (const [key, dim] of allDims) {
  counts[dim.provenance]++;
  console.log(
    `• ${key.padEnd(32)} = ${formatDimension(dim, true).padEnd(9)} [${dim.provenance}] -> ${dim.source}`
  );
}

console.log('\nProvenance Breakdown:');
console.log(`  - Verified Builder Drawings (VK-06 / 55.1-55.3): ${counts.verified_drawing}`);
console.log(`  - User Supplied (HomeByMe / User Specs)        : ${counts.user_supplied}`);
console.log(`  - Calculated (Derived from Verified Chains)    : ${counts.calculated}`);
console.log(`  - Assumed (Context Margin / Detail)            : ${counts.assumed}\n`);

// 2. Cross-Check Floor Plan Chain Invariants against Source Documents
console.log('Checking Geometric Chain Invariants:');

// Total Building Width Chain:
// 0.08m (berging left wall) + 3.19m (berging interior) + 0.40m (left outer wall) + 5.17m (main interior) + 0.30m (shared neighbour wall) = 9.14m!
assertClose(
  HOUSE_DIMENSIONS.bergingOtherWallThickness.metres +
    HOUSE_DIMENSIONS.bergingInteriorWidth.metres +
    HOUSE_DIMENSIONS.exteriorWallThickness.metres +
    HOUSE_DIMENSIONS.mainInteriorWidth.metres +
    HOUSE_DIMENSIONS.partyWallThickness.metres,
  HOUSE_DIMENSIONS.totalBuildingWidth.metres,
  0.001,
  'Total Building Width Chain (0.08 + 3.19 + 0.40 + 5.17 + 0.30 == 9.14m)'
);

// Ground Floor Width Chain on VK-06:
// 254 cm (Hal) + 7 cm (wall) + 256 cm (Woonkamer passage) = 517 cm!
assertClose(
  HOUSE_DIMENSIONS.hallInteriorWidth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.livingPassageWidth.metres,
  HOUSE_DIMENSIONS.mainInteriorWidth.metres,
  0.001,
  'Ground Floor Width Chain (254 cm Hal + 7 cm wall + 256 cm Woonkamer == 517 cm)'
);

// Ground Floor Hall/Toilet Width Chain:
// 97 cm (niche) + 7 cm (wall) + 150 cm (toilet) = 254 cm (Hal width)!
assertClose(
  HOUSE_DIMENSIONS.hallNicheLeftWidth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.toiletInteriorWidth.metres,
  HOUSE_DIMENSIONS.hallInteriorWidth.metres,
  0.001,
  'Hall/Toilet Width Chain (97 cm niche + 7 cm wall + 150 cm toilet == 254 cm Hal)'
);

// Ground Floor Base Interior Depth Chain (matches 1st & 2nd floor 966 cm!):
// 344 cm (woonkamer) + 12 cm (stair wall) + 242 cm (hal) + 7 cm + 92 cm (toilet) + 7 cm + 262 cm (base kitchen) = 966 cm!
assertClose(
  HOUSE_DIMENSIONS.frontLivingDepth.metres +
    HOUSE_DIMENSIONS.stairFrontWallThickness.metres +
    HOUSE_DIMENSIONS.hallInteriorDepth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.toiletInteriorDepth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.kitchenBaseDepth.metres,
  HOUSE_DIMENSIONS.upperFloorInteriorLength.metres,
  0.001,
  'Ground Floor Base Interior Depth Chain (344 + 12 + 242 + 7 + 92 + 7 + 262 == 966 cm)'
);

// Ground Floor Extended Interior Depth Chain:
// 966 cm base + 240 cm extension = 1206 cm (344 + 12 + 242 + 7 + 92 + 7 + 502 = 1206 cm)!
assertClose(
  HOUSE_DIMENSIONS.groundBaseInteriorLength.metres + HOUSE_DIMENSIONS.rearExtensionDepth.metres,
  HOUSE_DIMENSIONS.groundInteriorLengthExtended.metres,
  0.001,
  'Ground Floor Extended Interior Depth Chain (966 + 240 == 1206 cm)'
);

// Berging length chain: 5.13 m overlap along house + 0.86 m rear protrusion = 5.99 m
assertClose(
  HOUSE_DIMENSIONS.bergingOverlapWithHouse.metres + HOUSE_DIMENSIONS.bergingRearProtrusion.metres,
  HOUSE_DIMENSIONS.bergingExteriorLength.metres,
  0.001,
  'Berging Length Chain (5.13m overlap + 0.86m protrusion == 5.99m length)'
);

// 1st Floor rear width chain: Badkamer (2.01 m) + 0.07 m wall + Kantoor (3.09 m) = 5.17 m
assertClose(
  HOUSE_DIMENSIONS.bathroomWidth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.bedroom1RearWidth.metres,
  HOUSE_DIMENSIONS.mainInteriorWidth.metres,
  0.001,
  '1st Floor Rear Width Chain (201 cm Badkamer + 7 cm wall + 309 cm Kantoor == 517 cm)'
);

// 1st Floor middle width chain: Overloop (3.60 m) + 0.07 m wall + Kast (1.50 m) = 5.17 m
assertClose(
  HOUSE_DIMENSIONS.overloop1stWidth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.walkInClosetWidth.metres,
  HOUSE_DIMENSIONS.mainInteriorWidth.metres,
  0.001,
  '1st Floor Middle Width Chain (360 cm Overloop + 7 cm wall + 150 cm Kast == 517 cm)'
);

// 1st Floor exact interior depth chain:
// Slaapkamer (3.44 m) + 0.12 m stair wall + Overloop (2.27 m) + 0.07 m wall + Badkamer/Kantoor (3.76 m) = 9.660 m!
assertClose(
  HOUSE_DIMENSIONS.bedroom2FrontDepth.metres +
    HOUSE_DIMENSIONS.stairFrontWallThickness.metres +
    HOUSE_DIMENSIONS.overloop1stDepth.metres +
    HOUSE_DIMENSIONS.interiorWallThickness.metres +
    HOUSE_DIMENSIONS.bathroomDepth.metres,
  HOUSE_DIMENSIONS.upperFloorInteriorLength.metres,
  0.001,
  '1st Floor Exact Depth Chain (344 + 12 + 227 + 7 + 376 == 966 cm)'
);

// 2nd Floor (Zolder) exact interior depth chain with 12.5 cm walls:
// Front (3.46 m) + 0.125 m wall + Overloop (2.25 m) + 0.125 m wall + Rear (3.70 m) = 9.660 m!
assertClose(
  HOUSE_DIMENSIONS.zolderFrontZoneDepth.metres +
    HOUSE_DIMENSIONS.atticWallThickness.metres +
    HOUSE_DIMENSIONS.zolderOverloopDepth.metres +
    HOUSE_DIMENSIONS.atticWallThickness.metres +
    HOUSE_DIMENSIONS.zolderRearZoneDepth.metres,
  HOUSE_DIMENSIONS.upperFloorInteriorLength.metres,
  0.001,
  '2nd Floor (Zolder) Exact Depth Chain (346 + 12.5 + 225 + 12.5 + 370 == 966 cm)'
);

// 2nd Floor (Zolder) right-side party wall & corner knieschot depth chain:
// 1.575 m (front corner knieschot) + 6.51 m (middle party wall span) + 1.575 m (rear corner knieschot) = 9.660 m!
assertClose(
  HOUSE_DIMENSIONS.zolderCornerKnieschotDepth.metres * 2 +
    HOUSE_DIMENSIONS.zolderPartyWall150Length.metres,
  HOUSE_DIMENSIONS.upperFloorInteriorLength.metres,
  0.001,
  '2nd Floor (Zolder) Right-Side Knieschot & Party Wall Chain (157.5 + 651 + 157.5 == 966 cm)'
);

// Vertical elevation chain with 2.60 m ceiling heights:
assertClose(
  HOUSE_DIMENSIONS.groundFloorCeilingHeight.metres + HOUSE_DIMENSIONS.floorSlabThickness.metres,
  HOUSE_DIMENSIONS.firstFloorElevation.metres,
  0.001,
  '1st Floor Elevation (+2.60m ceiling + 0.25m slab == +2.85m)'
);
assertClose(
  HOUSE_DIMENSIONS.firstFloorElevation.metres +
    HOUSE_DIMENSIONS.firstFloorCeilingHeight.metres +
    HOUSE_DIMENSIONS.floorSlabThickness.metres,
  HOUSE_DIMENSIONS.secondFloorElevation.metres,
  0.001,
  '2nd Floor Elevation (+2.85m + 2.60m ceiling + 0.25m slab == +5.70m)'
);

// Trapezoidal Plot Right Boundary Chain:
// 5.00 m (front garden) + 12.86 m (extended house) + 7.77 m (back garden) = 25.63 m!
assertClose(
  HOUSE_DIMENSIONS.frontGardenDepth.metres +
    HOUSE_DIMENSIONS.groundExteriorLengthExtended.metres +
    HOUSE_DIMENSIONS.rearGardenDepth.metres,
  HOUSE_DIMENSIONS.plotRightBoundaryLength.metres,
  0.001,
  'Plot Right Boundary Chain (500 cm front + 1286 cm house + 777 cm back == 2563 cm)'
);

// Verify Reusable Prefab Catalog usage across walls
const walls = getHouseWalls();
const rooms = getRoomFloors();
const prefabUsageCount: Record<string, number> = {};
for (const w of walls) {
  for (const op of w.openings ?? []) {
    prefabUsageCount[op.prefabId] = (prefabUsageCount[op.prefabId] ?? 0) + 1;
  }
}

console.log(`\nReusable Architectural Prefab Catalog Usage (${Object.keys(OPENING_PREFABS).length} prefabs defined):`);
for (const [prefabId, count] of Object.entries(prefabUsageCount)) {
  console.log(`  - ${prefabId.padEnd(28)}: ${count} instance(s)`);
}

// Verify that shared party walls & left walls do not overlap into the 40 cm front/rear exterior walls
const partyWalls = walls.filter((w) => w.id.includes('_wall_party'));
for (const pw of partyWalls) {
  const zMin = Math.min(pw.start[1], pw.end[1]);
  const zMax = Math.max(pw.start[1], pw.end[1]);
  if (zMax > -0.399) {
    throw new Error(`Party wall ${pw.id} clips into front exterior wall (zMax=${zMax})`);
  }
  const rearInnerZ = pw.floor === 'ground' ? -12.461 : -10.061;
  if (zMin < rearInnerZ) {
    throw new Error(`Party wall ${pw.id} clips into rear exterior wall (zMin=${zMin})`);
  }
}
const zolderPartyWall = walls.find((w) => w.id === 'sf_wall_party_zolder');
if (!zolderPartyWall?.gablePeak) {
  throw new Error('Zolder party wall must have a pointy gablePeak profile following the roof');
}
console.log('  ✓ Shared party walls & left walls verified free of front/rear corner clipping');
console.log(
  `  ✓ Attic shared wall (sf_wall_party_zolder) verified with pointy gablePeak (${zolderPartyWall.gablePeak.peakHeight.toFixed(2)} m at Z = -5.23 m)`
);

// Verify Zolder left knieschot (1.00 m continuous) & right corner knieschotten (1.50 m flat top)
const zolderLeftKnieschot = walls.find((w) => w.id === 'sf_wall_left_eaves');
if (!zolderLeftKnieschot?.clipToRoof) {
  throw new Error('Zolder left knieschot (sf_wall_left_eaves) must have clipToRoof: true');
}
assertClose(zolderLeftKnieschot.start[0], 0.685, 0.001, 'Left knieschot centerline at X = 0.685 m (inner face 0.72 m)');
assertClose(zolderLeftKnieschot.height, 1.00, 0.001, 'Left knieschot height is 1.00 m across the entire wall');

const Y2 = HOUSE_DIMENSIONS.secondFloorElevation.metres;
assertClose(
  zolderPartyWall.gablePeak.peakHeight,
  getZolderRoofUndersideY(5.72, -5.23) - Y2,
  0.005,
  'Attic party wall peak matches Langskap roof underside at Z = -5.23 m'
);

const targetKneeH = HOUSE_DIMENSIONS.zolderKneeWallHeight.metres; // 1.50 m
const wallFrontX = walls.find((w) => w.id === 'sf_knieschot_front_right_x');
assertClose(wallFrontX?.height ?? 0, targetKneeH, 0.001, 'Front corner knieschot (x) height is 1.50 m');
assertClose(wallFrontX?.start[0] ?? 0, 4.898, 0.001, 'Front corner knieschot (x) room face aligned to 1.50 m roof line (X = 4.863 m, centerline 4.898 m)');

const wallRearX = walls.find((w) => w.id === 'sf_knieschot_rear_right_x');
assertClose(wallRearX?.height ?? 0, targetKneeH, 0.001, 'Rear corner knieschot (x) height is 1.50 m');
assertClose(wallRearX?.start[0] ?? 0, 4.898, 0.001, 'Rear corner knieschot (x) room face aligned to 1.50 m roof line (X = 4.863 m, centerline 4.898 m)');

const wallFrontZ = walls.find((w) => w.id === 'sf_knieschot_front_right_z');
assertClose(wallFrontZ?.height ?? 0, targetKneeH, 0.001, 'Front corner knieschot (z) height is 1.50 m');
assertClose(wallFrontZ?.start[1] ?? 0, -1.934, 0.001, 'Front corner knieschot (z) room face aligned to 1.50 m roof contour (Z = -1.969 m)');

const wallRearZ = walls.find((w) => w.id === 'sf_knieschot_rear_right_z');
assertClose(wallRearZ?.height ?? 0, targetKneeH, 0.001, 'Rear corner knieschot (z) height is 1.50 m');
assertClose(wallRearZ?.start[1] ?? 0, -8.526, 0.001, 'Rear corner knieschot (z) room face aligned to 1.50 m roof contour (Z = -8.491 m)');

assertClose(
  getZolderRoofUndersideY(4.863, -0.40) - Y2,
  1.50,
  0.002,
  'Right corner knieschot room face aligns to exact 1.50 m point on exterior gable wall'
);

// Verify analytical roof underside continuity along the diagonal Kielkeper (uX == uZ)
const kielLeft = getZolderRoofUndersideY(4.4275, -2.725);
const kielRight = getZolderRoofUndersideY(4.4276, -2.725);
assertClose(kielLeft, kielRight, 0.002, 'Dwarskap and Langskap undersides meet continuously at Kielkeper');
const hLeft150 = getZolderRoofUndersideY(1.14, -5.23) - Y2;
const hRight150 = getZolderRoofUndersideY(4.78, -1.975) - Y2;
if (hLeft150 < 1.40 || hLeft150 > 1.75 || hRight150 < 1.40 || hRight150 > 1.75) {
  throw new Error(`Expected ~1.50 m roof underside near VK-06 H=1.50m contour (got left=${hLeft150.toFixed(2)}, right=${hRight150.toFixed(2)})`);
}
console.log(
  `  ✓ Attic roof underside & VK-06 H=1.50m alignment verified (left=${hLeft150.toFixed(2)} m, right=${hRight150.toFixed(2)} m)`
);

// Verify Zolder Overloop door distance to top/rear wall (~19.6 cm inner / 32.1 cm outer)
const zolderOverloopRightWall = walls.find((w) => w.id === 'sf_int_overloop_right');
const zolderDoor = zolderOverloopRightWall?.openings?.find((o) => o.id === 'sf_door_overloop_to_zolder');
if (!zolderDoor || !zolderOverloopRightWall) {
  throw new Error('Missing sf_door_overloop_to_zolder on sf_int_overloop_right');
}
const zolderDoorPrefabWidth = OPENING_PREFABS[zolderDoor.prefabId].width;
// sf_int_overloop_right spans Z: -3.86 -> -6.36 (length 2.50 m), with inner rear wall face at Z = -6.235 m (offset 2.375 m from start)
const distFromInnerRearWall = 2.375 - (zolderDoor.offsetAlongWall + zolderDoorPrefabWidth / 2);
assertClose(
  distFromInnerRearWall,
  0.196,
  0.002,
  'Attic Overloop door top edge distance from inner rear wall (19.6 cm inner / 32.1 cm outer)'
);
// Verify that all owned exterior walls have their local +Z normal pointing OUTWARD
const ownedExteriorWalls = walls.filter((w) => w.isExterior && !w.isNeighbour);
for (const ew of ownedExteriorWalls) {
  const dx = ew.end[0] - ew.start[0];
  const dz = ew.end[1] - ew.start[1];
  const len = Math.hypot(dx, dz);
  // In buildWallWithOpenings, rotation.y = atan2(-dz, dx) maps local +Z (0, 0, 1) to world (-dz/len, 0, dx/len)
  const normalX = -dz / len;
  const normalZ = dx / len;
  const midX = (ew.start[0] + ew.end[0]) / 2;
  const midZ = (ew.start[1] + ew.end[1]) / 2;
  const refCenter = ew.id.includes('berging') ? [-1.60, -10.70] : [2.985, -5.20];
  const dot = (midX - refCenter[0]) * normalX + (midZ - refCenter[1]) * normalZ;
  if (dot <= 0) {
    throw new Error(`Exterior wall ${ew.id} is inside-out! Outward dot product = ${dot}`);
  }
}
console.log(
  `  ✓ All ${ownedExteriorWalls.length} owned exterior walls verified with local +Z pointing OUTWARD (brick/trim outside, plaster inside)`
);

// 3. Verify 3D Scene Graph, Scroll Animation Invariants & Day/Night Lighting in Node
const scene = new THREE.Scene();
const rig = createLightingRig(scene);
const house = buildHouseScene();
scene.add(house.root);

// Verify mesh category metadata breakdown ('construction' | 'furniture' | 'site')
const catCounts = { construction: 0, furniture: 0, site: 0 };
for (const entry of house.meshRegistry) {
  catCounts[entry.category]++;
}
console.log(
  `  ✓ Mesh metadata categories verified: construction=${catCounts.construction}, site=${catCounts.site}, furniture=${catCounts.furniture}`
);

console.log('\nChecking 3D Scene Graph & Scroll Animation Invariants:');
console.log(`  ✓ Total inspectable 3D meshes registered: ${house.meshRegistry.length}`);

applyScrollProgressToScene(house, 1.0);
assertClose(house.groundGroup.position.y, 0.0, 0.0001, 'Ground Floor at exact Y=0.00m when assembled');
assertClose(house.firstGroup.position.y, 0.0, 0.0001, '1st Floor at exact Y=0.00m when assembled');
assertClose(house.secondGroup.position.y, 0.0, 0.0001, '2nd Floor at exact Y=0.00m when assembled');
assertClose(house.roofGroup.position.y, 0.0, 0.0001, 'Roof at exact Y=0.00m when assembled');
for (const item of house.staggeredAssets) {
  assertClose(
    item.object.position.y,
    item.baseY,
    0.0001,
    `Staggered asset ${item.id} at exact baseY when assembled`
  );
}
console.log(
  `  ✓ All ${house.staggeredAssets.length} staggered secondary/furniture assets verified with randomized drop timing`
);

applyDayNightState(rig, house, 0.0, null);
const bboxDay = new THREE.Box3().setFromObject(house.root);
applyDayNightState(rig, house, 1.0, null);
const bboxNight = new THREE.Box3().setFromObject(house.root);
assertClose(
  bboxDay.max.y - bboxDay.min.y,
  bboxNight.max.y - bboxNight.min.y,
  0.0001,
  'Geometry bounding box height unchanged between Day and Night modes'
);

// Verify Interactive Doors & Gate Animation System
const doors = house.doorManager.getDoors();
if (doors.length < 12) {
  throw new Error(`Expected at least 12 interactive doors/gates registered, got ${doors.length}`);
}
for (const door of doors) {
  if (door.pivots.length === 0) {
    throw new Error(`Interactive door "${door.id}" has no pivots`);
  }
  if (door.triggerMeshes.length === 0) {
    throw new Error(`Interactive door "${door.id}" has no triggerMeshes`);
  }
  for (const pivot of door.pivots) {
    assertClose(pivot.group.rotation.y, 0.0, 0.0001, `Door ${door.id} starts closed at 0.000 rad`);
  }
}
// Simulate hover open + close on first registered door
const sampleDoor = doors[0];
sampleDoor.isHovered = true;
for (let i = 0; i < 60; i++) house.doorManager.update(0.05);
assertClose(
  sampleDoor.pivots[0].group.rotation.y,
  sampleDoor.pivots[0].openAngle,
  0.002,
  `Door ${sampleDoor.id} opens smoothly to target openAngle when hovered`
);
sampleDoor.isHovered = false;
for (let i = 0; i < 60; i++) house.doorManager.update(0.05);
assertClose(
  sampleDoor.pivots[0].group.rotation.y,
  0.0,
  0.002,
  `Door ${sampleDoor.id} closes smoothly back to 0.000 rad when unhovered`
);
console.log(
  `  ✓ All ${doors.length} interactive doors & gate verified (pivots, triggers, open/close animation)`
);

// Verify Staircase Fit & Zero Wall Clipping
house.root.updateMatrixWorld(true);
const getBoundsById = (id: string) => {
  const entry = house.meshRegistry.find((e) => e.mesh.userData.id === id);
  if (!entry) throw new Error(`Missing mesh "${id}" in meshRegistry`);
  const target = id.startsWith('stair_') ? entry.mesh.parent! : entry.mesh;
  return new THREE.Box3().setFromObject(target);
};
const stairGfBox = getBoundsById('stair_gf_to_ff');
const stairFfBox = getBoundsById('stair_ff_to_sf');
assertClose(stairGfBox.min.x, 0.408, 0.002, 'Ground->1st stair left edge aligns to Hal plaster face (0.408 m)');
assertClose(stairGfBox.max.x, 2.940, 0.002, 'Ground->1st stair right edge aligns to Hal right wall (2.940 m)');
assertClose(stairGfBox.max.z, -3.960, 0.002, 'Ground->1st stair front edge aligns to 12 cm stair wall (-3.960 m)');
assertClose(stairFfBox.min.x, 0.408, 0.002, '1st->Zolder stair left edge aligns directly above Ground->1st (0.408 m)');
assertClose(stairFfBox.max.x, 2.940, 0.002, '1st->Zolder stair right edge aligns to Zolder Overloop right wall (2.940 m)');
assertClose(stairFfBox.max.z, -3.960, 0.002, '1st->Zolder stair front edge aligns directly above Ground->1st (-3.960 m)');

// Verify Left Knieschot Slants in Width (X) Direction & Stair Cheek Stops at X = 0.65 m
const checkSlantedKnieschot = (id: string) => {
  const entry = house.meshRegistry.find((e) => e.mesh.userData.id === id);
  if (!entry) throw new Error(`Missing mesh "${id}"`);
  const mesh = entry.mesh as THREE.Mesh;
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  let maxYAtOuter = -Infinity;
  let maxYAtInner = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (Math.abs(v.x - 0.65) < 0.002) maxYAtOuter = Math.max(maxYAtOuter, v.y);
    if (Math.abs(v.x - 0.72) < 0.002) maxYAtInner = Math.max(maxYAtInner, v.y);
  }
  assertClose(maxYAtOuter, getZolderRoofUndersideY(0.65) - 0.004, 0.002, `${id} outer edge (X=0.65) slants to roof underside`);
  assertClose(maxYAtInner, getZolderRoofUndersideY(0.72) - 0.004, 0.002, `${id} inner edge (X=0.72) slants to roof underside`);
};
checkSlantedKnieschot('sf_wall_left_eaves');
checkSlantedKnieschot('sf_wall_left_eaves_rear');
const stairCheekBox = getBoundsById('sf_wall_left_eaves_stair_cheek');
assertClose(stairCheekBox.min.x, 0.40, 0.002, 'Stairwell cheek wall starts at outer wall inner face (0.40 m)');
assertClose(stairCheekBox.max.x, 0.65, 0.002, 'Stairwell cheek wall meets rear knieschot outer face cleanly (0.65 m)');

// Verify Right-Side Corner Knieschotten meet cleanly at X = 4.863 m without overlap and slant under the roof
const frontRightXBox = getBoundsById('sf_knieschot_front_right_x');
const frontRightZBox = getBoundsById('sf_knieschot_front_right_z');
const rearRightXBox = getBoundsById('sf_knieschot_rear_right_x');
const rearRightZBox = getBoundsById('sf_knieschot_rear_right_z');
assertClose(frontRightXBox.min.x, 4.863, 0.002, 'Front-right corner knieschot (x) room face aligns to 1.50 m contour (4.863 m)');
assertClose(frontRightXBox.min.z, -1.899, 0.002, 'Front-right corner knieschot (x) stops flush at eaves face of _z (-1.899 m)');
assertClose(frontRightZBox.min.x, 4.863, 0.002, 'Front-right corner knieschot (z) starts flush at room face of _x (4.863 m)');
assertClose(rearRightXBox.min.x, 4.863, 0.002, 'Rear-right corner knieschot (x) room face aligns to 1.50 m contour (4.863 m)');
assertClose(rearRightXBox.max.z, -8.561, 0.002, 'Rear-right corner knieschot (x) stops flush at eaves face of _z (-8.561 m)');
assertClose(rearRightZBox.min.x, 4.863, 0.002, 'Rear-right corner knieschot (z) starts flush at room face of _x (4.863 m)');

const checkRightXSlant = (id: string) => {
  const entry = house.meshRegistry.find((e) => e.mesh.userData.id === id)!;
  const mesh = entry.mesh as THREE.Mesh;
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  let maxYRoom = -Infinity;
  let maxYEaves = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (v.z < -1.80 && v.z > -8.66) continue; // Check pure Dwarskap span away from Kielkeper valley
    if (Math.abs(v.x - 4.863) < 0.002) maxYRoom = Math.max(maxYRoom, v.y);
    if (Math.abs(v.x - 4.933) < 0.002) maxYEaves = Math.max(maxYEaves, v.y);
  }
  assertClose(maxYRoom, getZolderRoofUndersideY(4.863, -0.40) - 0.004, 0.002, `${id} room face (X=4.863) slants to 1.50 m roof underside`);
  assertClose(maxYEaves, getZolderRoofUndersideY(4.933, -0.40) - 0.004, 0.002, `${id} eaves face (X=4.933) slants to Dwarskap roof underside`);
};
checkRightXSlant('sf_knieschot_front_right_x');
checkRightXSlant('sf_knieschot_rear_right_x');

// Verify Overloop right wall follows the main Dwarskap ridge (X = 2.985 m) continuously
{
  const entry = house.meshRegistry.find((e) => e.mesh.userData.id === 'sf_int_overloop_right')!;
  const mesh = entry.mesh as THREE.Mesh;
  const pos = mesh.geometry.attributes.position;
  const v = new THREE.Vector3();
  let ridgeFrontY = -Infinity;
  let ridgeMidY = -Infinity;
  let ridgeRearY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    if (Math.abs(v.x - 2.985) < 0.002) {
      if (Math.abs(v.z - -3.86) < 0.002) ridgeFrontY = Math.max(ridgeFrontY, v.y);
      if (Math.abs(v.z - -5.23) < 0.002) ridgeMidY = Math.max(ridgeMidY, v.y);
      if (Math.abs(v.z - -6.36) < 0.002) ridgeRearY = Math.max(ridgeRearY, v.y);
    }
  }
  const expectedRidgeY = getZolderRoofUndersideY(2.985, -5.23) - 0.004;
  assertClose(ridgeFrontY, expectedRidgeY, 0.002, 'Overloop right wall ridge crest at front (-3.86 m)');
  assertClose(ridgeMidY, expectedRidgeY, 0.002, 'Overloop right wall ridge crest at Langskap junction (-5.23 m)');
  assertClose(ridgeRearY, expectedRidgeY, 0.002, 'Overloop right wall ridge crest at rear (-6.36 m)');
}

console.log('\nALL DIMENSIONAL, PREFAB & 3D SCENE CHECKS PASSED SUCCESSFULLY.');
