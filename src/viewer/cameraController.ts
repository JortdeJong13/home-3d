import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const UP_AXIS = new THREE.Vector3(0, 1, 0);

export interface CameraPreset {
  id: 'default_iso' | 'garden_iso' | 'front_street' | 'top_plan';
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
}

/**
 * Center of the house & plot in world metres:
 * X: ~1.10 m (centered across Berging [-3.44] to neighbour context [+5.65])
 * Y: ~4.30 m (vertical center framing full house + roof with headroom above)
 * Z: ~-7.20 m (centered along house & garden)
 */
export const CAMERA_PRESETS: Record<CameraPreset['id'], CameraPreset> = {
  default_iso: {
    id: 'default_iso',
    label: 'Isometrisch (Voorzijde)',
    position: [-24.0, 24.0, 22.0],
    target: [1.1, 4.3, -7.2],
    zoom: 1.08,
  },
  garden_iso: {
    id: 'garden_iso',
    label: 'Tuinzijde (Achtergevel)',
    position: [-23.0, 24.2, -34.0],
    target: [1.0, 4.3, -9.2],
    zoom: 1.08,
  },
  front_street: {
    id: 'front_street',
    label: 'Straatzijde (Rechtsvoor)',
    position: [25.0, 21.8, 22.0],
    target: [1.5, 4.3, -6.5],
    zoom: 1.12,
  },
  top_plan: {
    id: 'top_plan',
    label: 'Plattegrond (Bovenaanzicht)',
    position: [1.1, 38.0, -7.0],
    target: [1.1, 0.0, -7.2],
    zoom: 1.18,
  },
};

export class IsometricCameraController {
  public readonly camera: THREE.OrthographicCamera;
  public readonly controls: OrbitControls;
  /** Slow automatic orbit around the house (radians per second). */
  public autoRotate = true;
  public autoRotateSpeed = 0.1;
  private frustumSize = 24.5;

  private animActive = false;
  private animStartPos = new THREE.Vector3();
  private animEndPos = new THREE.Vector3();
  private animStartTarget = new THREE.Vector3();
  private animEndTarget = new THREE.Vector3();
  private animStartZoom = 1.0;
  private animEndZoom = 1.0;
  private animProgress = 0;

  // Pan bounds around house center so model always stays centered and never gets lost
  private readonly minTarget = new THREE.Vector3(-4.5, -0.5, -15.5);
  private readonly maxTarget = new THREE.Vector3(6.5, 6.5, 1.5);

  constructor(domElement: HTMLElement) {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumSize * aspect) / 2,
      (this.frustumSize * aspect) / 2,
      this.frustumSize / 2,
      -this.frustumSize / 2,
      -60,
      140
    );

    const def = CAMERA_PRESETS.default_iso;
    this.camera.position.set(...def.position);
    this.camera.zoom = def.zoom;
    this.camera.updateProjectionMatrix();

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.target.set(...def.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.75;
    this.controls.panSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;

    // Crucial: Disable wheel zoom on OrbitControls so mouse wheel scrolling drives the floor construction sequence!
    // We handle trackpad pinch-to-zoom (ctrlKey + wheel) in main.ts and two-finger touch pinch-to-zoom below.
    this.controls.enableZoom = false;

    // Limit zoom range: allow zooming in closely for room/furniture inspection while keeping diorama overview
    this.controls.minZoom = 0.68;
    this.controls.maxZoom = 6.5;

    // Limit vertical orbit angle so camera stays above ground level
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.43;

    // Cancel preset animation if user manually drags camera
    this.controls.addEventListener('start', () => {
      this.animActive = false;
      if (this.autoRotate) {
        this.autoRotate = false;
      }
    });

    // Mobile two-finger pinch-to-zoom (OrbitControls skips dolly when enableZoom = false)
    let lastPinchDist = 0;
    const getPinchDistance = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    domElement.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length === 2) {
          lastPinchDist = getPinchDistance(e.touches);
          this.animActive = false;
          this.autoRotate = false;
        } else {
          lastPinchDist = 0;
        }
      },
      { passive: true }
    );

    domElement.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const dist = getPinchDistance(e.touches);
          if (lastPinchDist > 0 && dist > 0) {
            this.zoomByFactor(dist / lastPinchDist);
          }
          lastPinchDist = dist;
        }
      },
      { passive: false }
    );

    const handleTouchEnd = (e: TouchEvent) => {
      lastPinchDist = e.touches.length === 2 ? getPinchDistance(e.touches) : 0;
    };
    domElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    domElement.addEventListener('touchcancel', handleTouchEnd, { passive: true });
  }

  public handleResize(width: number, height: number) {
    const aspect = width / Math.max(1, height);
    this.camera.left = (-this.frustumSize * aspect) / 2;
    this.camera.right = (this.frustumSize * aspect) / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = -this.frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }

  public zoomByFactor(factor: number) {
    this.animActive = false;
    const nextZoom = THREE.MathUtils.clamp(
      this.camera.zoom * factor,
      this.controls.minZoom,
      this.controls.maxZoom
    );
    if (Math.abs(nextZoom - this.camera.zoom) > 1e-6) {
      this.camera.zoom = nextZoom;
      this.camera.updateProjectionMatrix();
      this.zoomDirty = true;
    }
  }

  public transitionToPreset(presetId: CameraPreset['id']) {
    const preset = CAMERA_PRESETS[presetId];
    if (!preset) return;

    this.animStartPos.copy(this.camera.position);
    this.animEndPos.set(...preset.position);
    this.animStartTarget.copy(this.controls.target);
    this.animEndTarget.set(...preset.target);
    this.animStartZoom = this.camera.zoom;
    this.animEndZoom = preset.zoom;
    this.animProgress = 0;
    this.animActive = true;
  }

  public resetToDefault() {
    this.autoRotate = true;
    this.transitionToPreset('default_iso');
  }

  private prevPos = new THREE.Vector3();
  private prevTarget = new THREE.Vector3();
  private prevZoom = -1;
  private zoomDirty = false;

  public update(dt: number): boolean {
    const wasZoomDirty = this.zoomDirty;
    this.zoomDirty = false;
    this.prevPos.copy(this.camera.position);
    this.prevTarget.copy(this.controls.target);
    this.prevZoom = this.camera.zoom;

    if (this.animActive) {
      this.animProgress = Math.min(1, this.animProgress + dt * 2.1);
      // Smooth quintic ease-out
      const t = 1 - Math.pow(1 - this.animProgress, 3.5);
      this.camera.position.lerpVectors(this.animStartPos, this.animEndPos, t);
      this.controls.target.lerpVectors(this.animStartTarget, this.animEndTarget, t);
      this.camera.zoom = THREE.MathUtils.lerp(this.animStartZoom, this.animEndZoom, t);
      this.camera.updateProjectionMatrix();
      if (this.animProgress >= 0.999) {
        this.animActive = false;
      }
    }

    // Auto-orbit around the house (time based => identical speed at 60 / 120 Hz)
    if (this.autoRotate && !this.animActive) {
      this.camera.position
        .sub(this.controls.target)
        .applyAxisAngle(UP_AXIS, -this.autoRotateSpeed * dt)
        .add(this.controls.target);
    }
    // Frame-rate independent damping (dampingFactor is defined per 60 Hz frame)
    this.controls.dampingFactor = 1 - Math.pow(1 - 0.075, Math.max(dt, 1e-4) * 60);

    // Clamp pan target softly within house bounds
    this.controls.target.clamp(this.minTarget, this.maxTarget);
    this.controls.update();

    return (
      wasZoomDirty ||
      this.animActive ||
      this.autoRotate ||
      this.prevPos.distanceToSquared(this.camera.position) > 1e-8 ||
      this.prevTarget.distanceToSquared(this.controls.target) > 1e-8 ||
      Math.abs(this.prevZoom - this.camera.zoom) > 1e-5
    );
  }
}
