import * as THREE from 'three';
import { HouseSceneGroups } from '../geometry/houseBuilder';

export interface FloorStop {
  id: 'plot' | 'ground' | 'first' | 'second' | 'roof';
  index: number;
  progress: number; // 0.00, 0.25, 0.50, 0.75, 1.00
  title: string;
  subtitle: string;
  elevationLabel: string;
}

export const FLOOR_STOPS: FloorStop[] = [
  {
    id: 'plot',
    index: 0,
    progress: 0.0,
    title: 'Kavel',
    subtitle: 'Trapeziumkavel (Achter 10.15 m · Voor 10.87 m) · Achtertuin 7.77 m · Voortuin 5.00 m',
    elevationLabel: 'Peil 0.00 m',
  },
  {
    id: 'ground',
    index: 1,
    progress: 0.25,
    title: 'Begane Grond',
    subtitle: 'Woonkamer (3.44 m) · Hal (2.54 × 2.42 m) · Eetkamer/Keuken (5.02 m) · Totale diepte 12.06 m · Berging (3.19 × 5.71 m)',
    elevationLabel: '0.00 m → +2.60 m',
  },
  {
    id: 'first',
    index: 2,
    progress: 0.5,
    title: '1e Verdieping',
    subtitle: 'Slaapkamer (5.17 × 3.44 m) · Overloop (3.60 × 2.27 m) · Kast (1.50 × 2.27 m) · Badkamer (2.01 m) · Kantoor (3.09 m)',
    elevationLabel: '+2.85 m → +5.45 m',
  },
  {
    id: 'second',
    index: 3,
    progress: 0.75,
    title: '2e Verdieping',
    subtitle: 'Zolderruimte (9.66 m lang) · Overloop (1.78 × 2.25 m met 12.5 cm wanden)',
    elevationLabel: '+5.70 m → +10.90 m',
  },
  {
    id: 'roof',
    index: 4,
    progress: 1.0,
    title: 'Kap',
    subtitle: 'Dwarskap (Goot +6.13 m, Nok +10.90 m) + Aansluitende Langskap bnr. 56',
    elevationLabel: 'Nok +10.90 m',
  },
];

/**
 * Pure, deterministic easing function (smooth cubic ease-out) for a floor's vertical drop.
 * Maps local segment progress t in [0, 1] to vertical offset in metres:
 * - t = 0: +DROP_HEIGHT_METRES (high above the camera frustum, out of the way)
 * - t = 1: 0.000 m (exact architectural elevation)
 */
const DROP_HEIGHT_METRES = 24.0;
const STAGGER_DROP_HEIGHT_METRES = 6.5;

const FLOOR_SEGMENT_RANGES: Record<'ground' | 'first' | 'second' | 'roof', [number, number]> = {
  ground: [0.0, 0.25],
  first: [0.25, 0.5],
  second: [0.5, 0.75],
  roof: [0.75, 1.0],
};

function computeFloorVerticalOffset(
  globalProgress: number,
  segmentStart: number,
  segmentEnd: number
): { offsetY: number; visible: boolean; localT: number } {
  if (globalProgress <= segmentStart + 0.0005) {
    return { offsetY: DROP_HEIGHT_METRES, visible: false, localT: 0 };
  }
  if (globalProgress >= segmentEnd - 0.0005) {
    return { offsetY: 0.0, visible: true, localT: 1 };
  }
  const rawT = (globalProgress - segmentStart) / (segmentEnd - segmentStart);
  const clampedT = Math.max(0, Math.min(1, rawT));

  // Main floor & walls settle over [0.0 -> 0.82] of the floor's scroll segment
  const constrT = Math.min(1, clampedT / 0.82);
  const easedConstrT = 1 - Math.pow(1 - constrT, 2.6);
  const offsetY = (1 - easedConstrT) * DROP_HEIGHT_METRES;

  return {
    offsetY,
    visible: true,
    localT: clampedT,
  };
}

/**
 * Apply the scroll progress (0.0 to 1.0) deterministically to the 4 building layers
 * and their staggered secondary/furniture assets (Oprit tiles, Tuinpoort, WP/WTW, and placed furniture).
 * - Plot and surrounding environment (plotGroup) NEVER move (always at Y = 0.000 m).
 * - Floors move strictly along the vertical Y axis without scaling or distorting geometry.
 * - Staggered assets drop in a randomized cascade right after their floor structure settles.
 */
export function applyScrollProgressToScene(groups: HouseSceneGroups, progress: number): FloorStop {
  const p = Math.max(0, Math.min(1, progress));

  // Plot group is stationary at all times
  groups.plotGroup.position.set(0, 0, 0);

  // 1. Ground Floor: segment [0.00 -> 0.25]
  const gf = computeFloorVerticalOffset(p, 0.0, 0.25);
  groups.groundGroup.position.set(0, gf.offsetY, 0);
  groups.groundGroup.visible = gf.visible;

  // 2. First Floor: segment [0.25 -> 0.50]
  const ff = computeFloorVerticalOffset(p, 0.25, 0.5);
  groups.firstGroup.position.set(0, ff.offsetY, 0);
  groups.firstGroup.visible = ff.visible;

  // 3. Second Floor (Zolder): segment [0.50 -> 0.75]
  const sf = computeFloorVerticalOffset(p, 0.5, 0.75);
  groups.secondGroup.position.set(0, sf.offsetY, 0);
  groups.secondGroup.visible = sf.visible;

  // 4. Roof: segment [0.75 -> 1.00]
  const rf = computeFloorVerticalOffset(p, 0.75, 1.0);
  groups.roofGroup.position.set(0, rf.offsetY, 0);
  groups.roofGroup.visible = rf.visible;

  // 5. Animate each staggered item (Oprit tiles, Tuinpoort, installations, and furniture)
  // over [0.45 -> 1.00] of its floor's scroll segment with deterministic per-item stagger
  const floorLocalT: Record<string, number> = {
    plot: 1.0,
    ground: gf.localT,
    first: ff.localT,
    second: sf.localT,
    roof: rf.localT,
  };

  const dirtyInstancedMeshes = new Set<THREE.InstancedMesh>();

  for (const item of groups.staggeredAssets) {
    const segRange = FLOOR_SEGMENT_RANGES[item.floor as keyof typeof FLOOR_SEGMENT_RANGES];
    if (!segRange) {
      item.object.position.y = item.baseY;
      item.object.visible = true;
    } else {
      const localT = floorLocalT[item.floor] ?? 1.0;
      // Each item follows closely behind the floor (starting between 8% and 26% of the floor's segment)
      const itemStart = 0.08 + item.staggerRatio * 0.18;
      const itemDuration = 0.74;

      if (localT <= itemStart + 0.001) {
        item.object.visible = false;
        item.object.position.y = item.baseY + STAGGER_DROP_HEIGHT_METRES;
      } else if (localT >= itemStart + itemDuration - 0.001) {
        item.object.visible = true;
        item.object.position.y = item.baseY;
      } else {
        const itemT = (localT - itemStart) / itemDuration;
        const easedItemT = 1 - Math.pow(1 - itemT, 2.5);
        item.object.visible = true;
        item.object.position.y = item.baseY + (1 - easedItemT) * STAGGER_DROP_HEIGHT_METRES;
      }
    }

    if (item.instancedMesh !== undefined && item.instanceIndex !== undefined) {
      item.object.scale.setScalar(item.object.visible ? 1 : 0);
      item.object.updateMatrix();
      item.instancedMesh.setMatrixAt(item.instanceIndex, item.object.matrix);
      dirtyInstancedMeshes.add(item.instancedMesh);
    }
  }

  for (const mesh of dirtyInstancedMeshes) {
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Determine active floor stop for UI synchronization
  let closestStop = FLOOR_STOPS[0];
  let minDiff = Infinity;
  for (const stop of FLOOR_STOPS) {
    const diff = Math.abs(p - stop.progress);
    if (diff < minDiff) {
      minDiff = diff;
      closestStop = stop;
    }
  }
  return closestStop;
}
