import * as THREE from 'three';
import { FloorLayerId } from '../model/houseData';

export interface InteractiveDoorPivot {
  group: THREE.Group;
  openAngle: number;
  closedAngle: number;
  currentAngle: number;
}

export interface InteractiveDoor {
  id: string;
  label: string;
  floor: FloorLayerId;
  pivots: InteractiveDoorPivot[];
  triggerMeshes: THREE.Object3D[];
  isHovered: boolean;
  isPinned: boolean;
}

/**
 * Manages hover and click-to-pin animations for doors and gates in Bouwnummer 55.
 */
export class InteractiveDoorManager {
  private doors: InteractiveDoor[] = [];

  public register(door: InteractiveDoor): void {
    this.doors.push(door);
  }

  public getDoors(): readonly InteractiveDoor[] {
    return this.doors;
  }

  public hasHoveredDoor(): boolean {
    return this.doors.some((d) => d.isHovered);
  }

  /**
   * Check if a door's hierarchy is currently visible in the Three.js scene graph.
   */
  private isDoorVisible(door: InteractiveDoor): boolean {
    const root = door.pivots[0]?.group;
    if (!root) return false;
    let curr: THREE.Object3D | null = root;
    while (curr) {
      if (!curr.visible) return false;
      curr = curr.parent;
    }
    return true;
  }

  /**
   * Raycast against all visible doors to update hover state.
   */
  public handlePointerMove(raycaster: THREE.Raycaster): boolean {
    const candidateMeshes: THREE.Object3D[] = [];
    const meshToDoor = new Map<THREE.Object3D, InteractiveDoor>();

    for (const door of this.doors) {
      if (!this.isDoorVisible(door)) {
        door.isHovered = false;
        continue;
      }
      for (const mesh of door.triggerMeshes) {
        candidateMeshes.push(mesh);
        meshToDoor.set(mesh, door);
      }
    }

    if (candidateMeshes.length === 0) {
      for (const door of this.doors) door.isHovered = false;
      return false;
    }

    const hits = raycaster.intersectObjects(candidateMeshes, true);
    let hoveredDoor: InteractiveDoor | null = null;

    if (hits.length > 0) {
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          const match = meshToDoor.get(obj);
          if (match) {
            hoveredDoor = match;
            break;
          }
          obj = obj.parent;
        }
        if (hoveredDoor) break;
      }
    }

    for (const door of this.doors) {
      door.isHovered = door === hoveredDoor;
    }

    return hoveredDoor !== null;
  }

  /**
   * Clicking a door toggles its pinned open state.
   */
  public handleClick(raycaster: THREE.Raycaster): InteractiveDoor | null {
    const candidateMeshes: THREE.Object3D[] = [];
    const meshToDoor = new Map<THREE.Object3D, InteractiveDoor>();

    for (const door of this.doors) {
      if (!this.isDoorVisible(door)) continue;
      for (const mesh of door.triggerMeshes) {
        candidateMeshes.push(mesh);
        meshToDoor.set(mesh, door);
      }
    }

    const hits = raycaster.intersectObjects(candidateMeshes, true);
    if (hits.length > 0) {
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          const match = meshToDoor.get(obj);
          if (match) {
            match.isPinned = !match.isPinned;
            return match;
          }
          obj = obj.parent;
        }
      }
    }

    return null;
  }

  /**
   * Smoothly interpolate pivot rotation angles toward their target.
   */
  public update(dt: number): void {
    // Easing speed: snappy yet organic swing
    const lambda = 1 - Math.exp(-dt * 9.5);

    for (const door of this.doors) {
      const wantOpen = door.isHovered || door.isPinned;

      for (const pivot of door.pivots) {
        const target = wantOpen ? pivot.openAngle : pivot.closedAngle;
        const diff = target - pivot.currentAngle;

        if (Math.abs(diff) > 0.0005) {
          pivot.currentAngle += diff * lambda;
          pivot.group.rotation.y = pivot.currentAngle;
        } else if (pivot.currentAngle !== target) {
          pivot.currentAngle = target;
          pivot.group.rotation.y = target;
        }
      }
    }
  }
}
