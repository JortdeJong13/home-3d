import * as THREE from 'three';
import { FloorLayerId } from '../model/houseData';

export interface InteractiveDoorPivot {
  group: THREE.Group;
  openAngle: number;
  closedAngle: number;
  currentAngle: number;
  /** Optional custom transform callback (e.g. for tilt/slide kanteldeur kinematics). */
  onUpdate?: (currentAngle: number, t: number) => void;
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
 * Manages hover-to-open and click-to-pin animations for doors, gates, and
 * interactive furniture assets in Bouwnummer 55.
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
   * Clear hover state across all doors (e.g. when the pointer leaves the canvas).
   */
  public clearHover(): void {
    for (const door of this.doors) {
      door.isHovered = false;
    }
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

  private findHitDoor(raycaster: THREE.Raycaster): InteractiveDoor | null {
    const candidateMeshes: THREE.Object3D[] = [];
    const meshToDoor = new Map<THREE.Object3D, InteractiveDoor>();

    for (const door of this.doors) {
      if (!this.isDoorVisible(door)) continue;
      for (const mesh of door.triggerMeshes) {
        candidateMeshes.push(mesh);
        meshToDoor.set(mesh, door);
      }
    }

    if (candidateMeshes.length === 0) return null;

    const hits = raycaster.intersectObjects(candidateMeshes, false);
    for (const hit of hits) {
      const match = meshToDoor.get(hit.object);
      if (match) return match;
    }
    return null;
  }

  /**
   * Raycast against all visible doors to update hover state.
   */
  public handlePointerMove(raycaster: THREE.Raycaster): boolean {
    const hoveredDoor = this.findHitDoor(raycaster);
    for (const door of this.doors) {
      door.isHovered = door === hoveredDoor;
    }
    return hoveredDoor !== null;
  }

  /**
   * Clicking a door toggles its pinned-open state.
   */
  public handleClick(raycaster: THREE.Raycaster): InteractiveDoor | null {
    const hitDoor = this.findHitDoor(raycaster);
    if (hitDoor) {
      hitDoor.isPinned = !hitDoor.isPinned;
      return hitDoor;
    }
    return null;
  }

  /**
   * Smoothly interpolate pivot rotation angles toward their target using
   * frame-rate-independent exponential damping.
   */
  public update(dt: number): void {
    const lambda = 1 - Math.exp(-dt * 5.7);

    for (const door of this.doors) {
      const wantOpen = door.isHovered || door.isPinned;

      for (const pivot of door.pivots) {
        const target = wantOpen ? pivot.openAngle : pivot.closedAngle;
        const diff = target - pivot.currentAngle;

        if (Math.abs(diff) > 0.0005) {
          pivot.currentAngle += diff * lambda;
        } else if (pivot.currentAngle !== target) {
          pivot.currentAngle = target;
        } else {
          continue;
        }

        if (pivot.onUpdate) {
          const span = pivot.openAngle - pivot.closedAngle;
          const t = Math.abs(span) > 1e-6 ? (pivot.currentAngle - pivot.closedAngle) / span : 0;
          pivot.onUpdate(pivot.currentAngle, t);
        } else {
          pivot.group.rotation.y = pivot.currentAngle;
        }
      }
    }
  }
}
