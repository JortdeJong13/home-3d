import * as THREE from 'three';
import { buildHouseScene, HouseSceneGroups, InspectableMetadata } from './geometry/houseBuilder';
import { PROVENANCE_COLORS } from './model/materials';
import { PROVENANCE_LABELS } from './model/units';
import { IsometricCameraController, CameraPreset } from './viewer/cameraController';
import { EdgeBlurPass } from './viewer/edgeBlur';
import { SkyRenderer } from './viewer/skyRenderer';
import { createLightingRig, applyDayNightState } from './viewer/dayNightController';
import { FLOOR_STOPS, applyScrollProgressToScene } from './viewer/scrollTimeline';

// =============================================================================
// 1. INITIALISE THREE.JS SCENE & SOFT ARCHITECTURAL DIORAMA RENDERER
// =============================================================================
const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
const edgeBlur = new EdgeBlurPass(renderer);
const lightingRig = createLightingRig(scene);
const cameraController = new IsometricCameraController(canvas);

// State
let isNightTarget = false;
let currentNightT = 0.0; // 0.0 = Day, 1.0 = Night

// Scroll state: smooth damped interpolation of physical scroll progress
let rawScrollProgress = 0.0;
let smoothedScrollProgress = 0.0;

const houseGroups: HouseSceneGroups = buildHouseScene();
scene.add(houseGroups.root);

// =============================================================================
// 2. DOM ELEMENTS & UI SYNCHRONISATION
// =============================================================================
const skyRenderer = new SkyRenderer(document.getElementById('sky-canvas') as HTMLCanvasElement, cameraController.camera);
const celestialRotorEl = document.getElementById('celestial-rotor');
const selectorFillEl = document.getElementById('selector-line-fill');
const scrollHintEl = document.getElementById('scroll-hint');
const floorDotBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.floor-dot-btn'));

const btnDayNight = document.getElementById('btn-day-night');
const dayNightIcon = document.getElementById('day-night-icon');
const dayNightLabel = document.getElementById('day-night-label');

const inspectorTitleEl = document.getElementById('inspector-title');
const inspectorDimsEl = document.getElementById('inspector-dims');
const inspectorProvDotEl = document.getElementById('inspector-prov-dot');
const inspectorProvTextEl = document.getElementById('inspector-prov-text');

function getMaxScrollPx(): number {
  return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function syncScrollFromWindow() {
  const maxScroll = getMaxScrollPx();
  rawScrollProgress = THREE.MathUtils.clamp(window.scrollY / maxScroll, 0, 1);
}

window.addEventListener('scroll', syncScrollFromWindow, { passive: true });
syncScrollFromWindow();

// Support trackpad pinch-to-zoom (ctrlKey + wheel) on canvas while letting regular wheel scroll the page
canvas.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 0.94;
      cameraController.zoomByFactor(factor);
    }
  },
  { passive: false }
);

// Slow, eased programmatic scroll for floor-selector clicks (native smooth scroll is too fast).
let scrollAnimId = 0;
function animateScrollTo(targetY: number) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 1) return;
  const levels = Math.abs(distance) / (getMaxScrollPx() * 0.25);
  const durationMs = Math.min(5200, 1700 + levels * 1100);
  const startTime = performance.now();
  const id = ++scrollAnimId;
  const step = (nowMs: number) => {
    if (id !== scrollAnimId) return;
    const p = Math.min(1, (nowMs - startTime) / durationMs);
    const e = 1 - (1 - p) * (1 - p); // ease-out: starts moving immediately, settles gently
    window.scrollTo(0, startY + distance * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Manual wheel / touch input cancels a running click-scroll
window.addEventListener('wheel', () => { scrollAnimId++; }, { passive: true });
window.addEventListener('touchstart', () => { scrollAnimId++; }, { passive: true });

// Manual Floor Selector Dots (Section 5.4)
for (const btn of floorDotBtns) {
  btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.stopIndex ?? 0);
    const stop = FLOOR_STOPS[idx];
    if (!stop) return;
    const targetScrollY = stop.progress * getMaxScrollPx();
    animateScrollTo(targetScrollY);
  });
}

// Day / Night Toggle with Rotating Celestial Backdrop (Section 5.2)
btnDayNight?.addEventListener('click', () => {
  isNightTarget = !isNightTarget;
  document.body.classList.toggle('night-mode', isNightTarget);
  if (dayNightIcon) dayNightIcon.textContent = isNightTarget ? '🌙' : '☀️';
  if (dayNightLabel) dayNightLabel.textContent = isNightTarget ? 'Avond' : 'Dag';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'b' || e.key === 'B') {
    edgeBlur.enabled = !edgeBlur.enabled; // compare with / without edge diffusion
  } else if (e.key === 'n' || e.key === 'N') {
    btnDayNight?.click();
  } else if (e.key === 'r' || e.key === 'R') {
    cameraController.resetToDefault();
  }
});

// Camera Presets & Zoom Buttons
const camPresetBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-cam-preset]'));
for (const btn of camPresetBtns) {
  btn.addEventListener('click', () => {
    const presetId = btn.dataset.camPreset as CameraPreset['id'];
    cameraController.autoRotate = false; // choosing a camera view stops the auto-orbit
    cameraController.transitionToPreset(presetId);
    for (const b of camPresetBtns) b.classList.toggle('active', b === btn);
  });
}

document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
  cameraController.zoomByFactor(1.18);
});

document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
  cameraController.zoomByFactor(1 / 1.18);
});

document.getElementById('btn-cam-reset')?.addEventListener('click', () => {
  cameraController.resetToDefault();
  for (const b of camPresetBtns) {
    b.classList.toggle('active', b.dataset.camPreset === 'default_iso');
  }
});

// =============================================================================
// 3. RAYCASTING ELEMENT INSPECTOR (Hover / Click to inspect exact dimensions)
// =============================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function inspectAtPointer(clientX: number, clientY: number) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, cameraController.camera);

  // Interactive doors: update hover state & cursor feedback
  const hasDoorHover = houseGroups.doorManager.handlePointerMove(raycaster);
  canvas.style.cursor = hasDoorHover ? 'pointer' : 'default';

  const visibleMeshes = houseGroups.meshRegistry
    .filter((entry) => {
      let obj: THREE.Object3D | null = entry.mesh;
      while (obj) {
        if (!obj.visible) return false;
        obj = obj.parent;
      }
      return true;
    })
    .map((entry) => entry.mesh);

  const hits = raycaster.intersectObjects(visibleMeshes, false);
  if (hits.length > 0) {
    const hitMesh = hits[0].object as THREE.Mesh;
    const meta = hitMesh.userData as InspectableMetadata | undefined;
    if (meta && meta.label) {
      if (inspectorTitleEl) inspectorTitleEl.textContent = meta.label;
      if (inspectorDimsEl) inspectorDimsEl.textContent = meta.dimensionsLabel;
      if (inspectorProvDotEl) {
        inspectorProvDotEl.style.background = PROVENANCE_COLORS[meta.provenance] ?? '#52b788';
      }
      if (inspectorProvTextEl) {
        inspectorProvTextEl.textContent = `${PROVENANCE_LABELS[meta.provenance]} · ${meta.source}`;
      }
    }
  }
}

let pointerDownX = 0;
let pointerDownY = 0;

canvas.addEventListener('pointerdown', (e) => {
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
});

canvas.addEventListener('pointermove', (e) => {
  if (e.buttons === 0) {
    inspectAtPointer(e.clientX, e.clientY);
  }
});

canvas.addEventListener('pointerleave', () => {
  houseGroups.doorManager.clearHover();
  canvas.style.cursor = 'default';
});

canvas.addEventListener('click', (e) => {
  const dragDist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
  if (dragDist > 5) return;

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, cameraController.camera);
  houseGroups.doorManager.handleClick(raycaster);

  inspectAtPointer(e.clientX, e.clientY);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraController.handleResize(window.innerWidth, window.innerHeight);
});

// =============================================================================
// 4. MAIN ANIMATION LOOP
// =============================================================================
let lastTime = performance.now();
applyDayNightState(lightingRig, houseGroups, 0, celestialRotorEl);
applyScrollProgressToScene(houseGroups, 0);

function animate(now: number) {
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // 1. Smoothly damp scroll progress toward actual scroll bar position
  const diffScroll = rawScrollProgress - smoothedScrollProgress;
  if (Math.abs(diffScroll) > 0.0001) {
    smoothedScrollProgress += diffScroll * (1 - Math.exp(-dt * 4.8));
  } else {
    smoothedScrollProgress = rawScrollProgress;
  }

  const activeStop = applyScrollProgressToScene(houseGroups, smoothedScrollProgress);

  // 2. Smoothly animate interactive doors & assets
  houseGroups.doorManager.update(dt);

  // Sync Floor Selector UI
  if (selectorFillEl) {
    const clampedProgress = Math.max(0, Math.min(1, smoothedScrollProgress));
    selectorFillEl.style.height = `${(clampedProgress * 100).toFixed(1)}%`;
  }
  if (scrollHintEl) {
    scrollHintEl.classList.toggle('hidden', smoothedScrollProgress > 0.05);
  }
  for (const btn of floorDotBtns) {
    const idx = Number(btn.dataset.stopIndex ?? -1);
    btn.classList.toggle('active', idx === activeStop.index);
  }

  // 2. Smoothly animate Day / Night transition & Rotating Celestial Backdrop
  const targetT = isNightTarget ? 1.0 : 0.0;
  if (Math.abs(targetT - currentNightT) > 0.0005) {
    currentNightT += (targetT - currentNightT) * (1 - Math.exp(-dt * 3.2));
    applyDayNightState(lightingRig, houseGroups, currentNightT, celestialRotorEl);
  }

  // 3. Update Camera Controls & Render
  cameraController.update(dt);
  skyRenderer.update(currentNightT);
  edgeBlur.render(scene, cameraController.camera);
}

requestAnimationFrame(animate);
