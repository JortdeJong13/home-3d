import * as THREE from 'three';
import { buildHouseScene, HouseSceneGroups } from './geometry/houseBuilder';
import { IsometricCameraController, CameraPreset } from './viewer/cameraController';
import { EdgeBlurPass } from './viewer/edgeBlur';
import { SkyRenderer } from './viewer/skyRenderer';
import { createLightingRig, applyDayNightState } from './viewer/dayNightController';
import { FLOOR_STOPS, applyScrollProgressToScene } from './viewer/scrollTimeline';
import { WeatherSystem } from './viewer/weatherSystem';
import { SEASON_ORDER, SeasonId, SeasonWeights, createSeasonWeights } from './model/seasons';

// =============================================================================
// 1. INITIALISE THREE.JS SCENE & SOFT ARCHITECTURAL DIORAMA RENDERER
// =============================================================================
const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
const isTouchDevice =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || /iPad|iPhone|Android/i.test(navigator.userAgent));

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.25 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
const edgeBlur = new EdgeBlurPass(renderer);
edgeBlur.enabled = !isTouchDevice;
const lightingRig = createLightingRig(scene);
const cameraController = new IsometricCameraController(canvas);

// State
let isNightTarget = false;
let targetNightPhase = 0.0; // Increments by +1.0 per toggle (even = Day, odd = Night) for continuous 180° forward rotation
let currentNightPhase = 0.0;

let activeSeason: SeasonId = 'summer';
let targetSeasonWeights: SeasonWeights = createSeasonWeights(activeSeason);
const currentSeasonWeights: SeasonWeights = createSeasonWeights(activeSeason);

// Scroll state: smooth damped interpolation of physical scroll progress
let rawScrollProgress = 0.0;
let smoothedScrollProgress = 0.0;

const houseGroups: HouseSceneGroups = buildHouseScene();
scene.add(houseGroups.root);
const weatherSystem = new WeatherSystem(houseGroups);

// =============================================================================
// 2. DOM ELEMENTS & UI SYNCHRONISATION
// =============================================================================
const skyRenderer = new SkyRenderer(document.getElementById('sky-canvas') as HTMLCanvasElement, cameraController.camera);
const celestialRotorEl = document.getElementById('celestial-rotor');
const selectorFillEl = document.getElementById('selector-line-fill');
const scrollHintEl = document.getElementById('scroll-hint');
const floorDotBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.floor-dot-btn'));
const seasonBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('#season-switcher .season-btn'));

const btnDayNight = document.getElementById('btn-day-night');
const dayNightIcon = document.getElementById('day-night-icon');
const dayNightLabel = document.getElementById('day-night-label');

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
let programmaticTargetIndex: number | null = null;
let activeLabelTimeout: ReturnType<typeof setTimeout> | null = null;

function showFloorLabel(index: number, durationMs = 1800) {
  for (const btn of floorDotBtns) {
    const idx = Number(btn.dataset.stopIndex ?? -1);
    btn.classList.toggle('label-visible', idx === index);
  }
  if (activeLabelTimeout !== null) {
    clearTimeout(activeLabelTimeout);
  }
  activeLabelTimeout = setTimeout(() => {
    for (const btn of floorDotBtns) {
      btn.classList.remove('label-visible');
    }
    activeLabelTimeout = null;
  }, durationMs);
}

function animateScrollTo(targetY: number, targetIdx?: number) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  if (targetIdx !== undefined) {
    programmaticTargetIndex = targetIdx;
    showFloorLabel(targetIdx, 10000);
  }
  if (Math.abs(distance) < 1) {
    if (targetIdx !== undefined) {
      programmaticTargetIndex = null;
      showFloorLabel(targetIdx, 1800);
    }
    return;
  }
  const levels = Math.abs(distance) / (getMaxScrollPx() * 0.25);
  const durationMs = Math.min(5200, 1700 + levels * 1100);
  const startTime = performance.now();
  const id = ++scrollAnimId;
  const step = (nowMs: number) => {
    if (id !== scrollAnimId) return;
    const p = Math.min(1, (nowMs - startTime) / durationMs);
    const e = 1 - (1 - p) * (1 - p); // ease-out: starts moving immediately, settles gently
    window.scrollTo(0, startY + distance * e);
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      if (programmaticTargetIndex !== null) {
        const finalIdx = programmaticTargetIndex;
        programmaticTargetIndex = null;
        showFloorLabel(finalIdx, 1800);
      }
    }
  };
  requestAnimationFrame(step);
}
// Manual wheel / touch input cancels a running click-scroll
window.addEventListener('wheel', () => {
  scrollAnimId++;
  programmaticTargetIndex = null;
}, { passive: true });
window.addEventListener('touchstart', (e) => {
  if ((e.target as Element | null)?.closest?.('#floor-selector')) return;
  scrollAnimId++;
  programmaticTargetIndex = null;
}, { passive: true });

// Manual Floor Selector Dots (Section 5.4) + Touch/Pointer Swipe-to-Step
const floorSelectorEl = document.getElementById('floor-selector');
let suppressSelectorClick = false;

if (floorSelectorEl) {
  let swipePointerId: number | null = null;
  let swipeStartY = 0;

  const getCurrentStopIndex = (): number => {
    if (programmaticTargetIndex !== null) return programmaticTargetIndex;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < FLOOR_STOPS.length; i++) {
      const d = Math.abs(rawScrollProgress - FLOOR_STOPS[i].progress);
      if (d < closestDist) {
        closestDist = d;
        closestIdx = i;
      }
    }
    return closestIdx;
  };

  floorSelectorEl.addEventListener('pointerdown', (e) => {
    swipePointerId = e.pointerId;
    swipeStartY = e.clientY;
  });

  window.addEventListener('pointerup', (e) => {
    if (swipePointerId !== e.pointerId) return;
    const dy = e.clientY - swipeStartY;
    swipePointerId = null;

    if (Math.abs(dy) > 24) {
      suppressSelectorClick = true;
      setTimeout(() => {
        suppressSelectorClick = false;
      }, 80);
      const currentIdx = getCurrentStopIndex();
      const nextIdx = dy > 0
        ? Math.min(FLOOR_STOPS.length - 1, currentIdx + 1)
        : Math.max(0, currentIdx - 1);
      const stop = FLOOR_STOPS[nextIdx];
      if (stop) {
        animateScrollTo(stop.progress * getMaxScrollPx(), nextIdx);
      }
    }
  });

  window.addEventListener('pointercancel', (e) => {
    if (swipePointerId === e.pointerId) {
      swipePointerId = null;
    }
  });
}

for (const btn of floorDotBtns) {
  btn.addEventListener('click', () => {
    if (suppressSelectorClick) return;
    const idx = Number(btn.dataset.stopIndex ?? 0);
    const stop = FLOOR_STOPS[idx];
    if (!stop) return;
    const targetScrollY = stop.progress * getMaxScrollPx();
    animateScrollTo(targetScrollY, idx);
  });
}

// Season Switcher (Spring / Summer / Autumn / Winter)
function setSeason(season: SeasonId) {
  activeSeason = season;
  targetSeasonWeights = createSeasonWeights(season);
  for (const btn of seasonBtns) {
    btn.classList.toggle('active', btn.dataset.season === season);
  }
}

for (const btn of seasonBtns) {
  btn.addEventListener('click', () => {
    const s = btn.dataset.season as SeasonId | undefined;
    if (s && SEASON_ORDER.includes(s)) {
      setSeason(s);
    }
  });
}

// Day / Night Toggle with Rotating Celestial Backdrop (Section 5.2)
btnDayNight?.addEventListener('click', () => {
  isNightTarget = !isNightTarget;
  targetNightPhase += 1.0;
  document.body.classList.toggle('night-mode', isNightTarget);
  if (dayNightIcon) {
    dayNightIcon.textContent = isNightTarget ? '🌙' : '☀️';
    dayNightIcon.style.transform = `rotate(${targetNightPhase * 180}deg)`;
  }
  if (dayNightLabel) dayNightLabel.textContent = isNightTarget ? 'Avond' : 'Dag';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'b' || e.key === 'B') {
    edgeBlur.enabled = !edgeBlur.enabled; // compare with / without edge diffusion
  } else if (e.key === 'n' || e.key === 'N') {
    btnDayNight?.click();
  } else if (e.key === 's' || e.key === 'S') {
    const nextIdx = (SEASON_ORDER.indexOf(activeSeason) + 1) % SEASON_ORDER.length;
    setSeason(SEASON_ORDER[nextIdx]);
  } else if (e.key === 'r' || e.key === 'R') {
    cameraController.resetToDefault();
  }
});

// Camera Presets & Reset
const camPresetBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-cam-preset]'));
for (const btn of camPresetBtns) {
  btn.addEventListener('click', () => {
    const presetId = btn.dataset.camPreset as CameraPreset['id'];
    cameraController.autoRotate = false; // choosing a camera view stops the auto-orbit
    cameraController.transitionToPreset(presetId);
    for (const b of camPresetBtns) b.classList.toggle('active', b === btn);
  });
}

document.getElementById('btn-cam-reset')?.addEventListener('click', () => {
  cameraController.resetToDefault();
  for (const b of camPresetBtns) {
    b.classList.toggle('active', b.dataset.camPreset === 'default_iso');
  }
});

// =============================================================================
// 3. INTERACTIVE DOOR & GATE POINTER RAYCASTING (Hover-to-open / Click-to-pin)
// =============================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function updatePointerRay(clientX: number, clientY: number) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, cameraController.camera);
}

let pointerDownX = 0;
let pointerDownY = 0;

canvas.addEventListener('pointerdown', (e) => {
  pointerDownX = e.clientX;
  pointerDownY = e.clientY;
});

canvas.addEventListener('pointermove', (e) => {
  if (e.buttons === 0) {
    updatePointerRay(e.clientX, e.clientY);
    const hasDoorHover = houseGroups.doorManager.handlePointerMove(raycaster);
    canvas.style.cursor = hasDoorHover ? 'pointer' : 'default';
  }
});

canvas.addEventListener('pointerleave', () => {
  houseGroups.doorManager.clearHover();
  canvas.style.cursor = 'default';
});

canvas.addEventListener('click', (e) => {
  const dragDist = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
  if (dragDist > 5) return;

  updatePointerRay(e.clientX, e.clientY);
  houseGroups.doorManager.handleClick(raycaster);
});

window.addEventListener('resize', () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.25 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  cameraController.handleResize(window.innerWidth, window.innerHeight);
  needsRender = true;
});

// =============================================================================
// 4. MAIN ANIMATION LOOP
// =============================================================================
let lastTime = performance.now();
let lastTrackedStopIndex = -1;
let lastUiScrollProgress = -1;
let needsRender = true;
applyDayNightState(lightingRig, houseGroups, 0, celestialRotorEl, currentSeasonWeights);
applyScrollProgressToScene(houseGroups, 0);

function animate(now: number) {
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  // 1. Smoothly damp scroll progress toward actual scroll bar position
  const diffScroll = rawScrollProgress - smoothedScrollProgress;
  let scrollChanged = false;
  if (Math.abs(diffScroll) > 0.0001) {
    smoothedScrollProgress += diffScroll * (1 - Math.exp(-dt * 4.8));
    scrollChanged = true;
  } else if (smoothedScrollProgress !== rawScrollProgress) {
    smoothedScrollProgress = rawScrollProgress;
    scrollChanged = true;
  }

  const activeStop = scrollChanged
    ? applyScrollProgressToScene(houseGroups, smoothedScrollProgress)
    : undefined;

  // 2. Smoothly animate interactive doors & assets
  const doorsMoved = houseGroups.doorManager.update(dt);

  // Sync Floor Selector UI only when scroll progress changes
  if (activeStop && Math.abs(smoothedScrollProgress - lastUiScrollProgress) > 0.0001) {
    lastUiScrollProgress = smoothedScrollProgress;
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
    if (lastTrackedStopIndex === -1) {
      lastTrackedStopIndex = activeStop.index;
    } else if (activeStop.index !== lastTrackedStopIndex) {
      lastTrackedStopIndex = activeStop.index;
      if (programmaticTargetIndex === null) {
        showFloorLabel(activeStop.index, 1800);
      }
    }
  }

  // 3. Smoothly animate Day / Night transition & Season weights
  let lightingDirty = false;
  if (Math.abs(targetNightPhase - currentNightPhase) > 0.0005) {
    currentNightPhase += (targetNightPhase - currentNightPhase) * (1 - Math.exp(-dt * 3.2));
    lightingDirty = true;
  }

  const seasonDamp = 1 - Math.exp(-dt * 2.4);
  for (const s of SEASON_ORDER) {
    const diff = targetSeasonWeights[s] - currentSeasonWeights[s];
    if (Math.abs(diff) > 0.0004) {
      currentSeasonWeights[s] += diff * seasonDamp;
      lightingDirty = true;
    } else if (currentSeasonWeights[s] !== targetSeasonWeights[s]) {
      currentSeasonWeights[s] = targetSeasonWeights[s];
      lightingDirty = true;
    }
  }

  if (lightingDirty) {
    applyDayNightState(lightingRig, houseGroups, currentNightPhase, celestialRotorEl, currentSeasonWeights);
  }

  const cycle = ((currentNightPhase % 2) + 2) % 2;
  const nightFactor = cycle <= 1 ? cycle : 2 - cycle;

  // 4. Update Camera Controls & skip heavy GPU passes when completely idle
  const cameraMoved = cameraController.update(dt);
  const weatherActive = weatherSystem.hasActiveWeather(currentSeasonWeights, nightFactor);

  if (scrollChanged || doorsMoved || lightingDirty) {
    renderer.shadowMap.needsUpdate = true;
  }

  if (!needsRender && !scrollChanged && !doorsMoved && !lightingDirty && !cameraMoved && !weatherActive) {
    return;
  }
  needsRender = false;

  skyRenderer.update(currentNightPhase, currentSeasonWeights);
  edgeBlur.render(scene, cameraController.camera);
  weatherSystem.updateAndRender(
    renderer,
    cameraController.camera,
    edgeBlur,
    now * 0.001,
    currentSeasonWeights,
    nightFactor,
    smoothedScrollProgress
  );
}

requestAnimationFrame(animate);
