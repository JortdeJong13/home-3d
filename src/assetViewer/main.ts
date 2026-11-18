import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ASSET_PREFABS, PLACED_ASSETS } from '../assets/assetRegistry';
import { MATERIAL_PALETTE, MaterialId } from '../model/materials';
import { InteractiveDoorManager } from '../viewer/interactiveDoors';

declare const __DEFAULT_ASSET__: string;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const panel = document.getElementById('panel')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#eceae6');
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a4', 1.1));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(3, 5, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 20 });
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.25 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(10, 100, '#999999', '#cccccc'); // 10 cm cells
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.6;
scene.add(grid);
scene.add(new THREE.AxesHelper(0.5)); // X red, Y green, Z blue (+Z = front)

// Semantic materials (same palette as the house, day colours)
const matCache = new Map<MaterialId, THREE.MeshStandardMaterial>();
const getMat = (id: MaterialId) => {
  let mat = matCache.get(id);
  if (!mat) {
    const def = MATERIAL_PALETTE[id];
    mat = new THREE.MeshStandardMaterial({
      color: def.colorDay, roughness: def.roughness, metalness: def.metalness,
      transparent: def.transparent ?? false, opacity: def.opacity ?? 1,
      depthWrite: def.depthWrite ?? !(def.transparent ?? false),
    });
    mat.name = id;
    matCache.set(id, mat);
  }
  return mat;
};

// Reference human (1.75 m) for scale
const human = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: '#8aa4c8', transparent: true, opacity: 0.45 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.3, 4, 12), mat);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat);
  head.position.y = 1.64;
  human.add(body, head);
}
scene.add(human);

const state = {
  id: '', wireframe: false, bbox: true, target: true, human: false, grid: true, shadows: true, explode: false,
};
const params = new URLSearchParams(location.search);
const ids = Object.keys(ASSET_PREFABS);
state.id = params.get('asset') || __DEFAULT_ASSET__ || ids[0] || '';

let current: THREE.Group | null = null;
let helpers: THREE.Object3D[] = [];
let info = '';
let doorManager = new InteractiveDoorManager();
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

const fmt = (v: number) => (v * 100).toFixed(1);

function load(id: string) {
  if (current) scene.remove(current);
  helpers.forEach((h) => scene.remove(h));
  helpers = [];
  current = null;
  doorManager = new InteractiveDoorManager();
  const prefab = ASSET_PREFABS[id];
  if (!prefab) { info = ids.length ? '' : '<p>No assets registered in <code>ASSET_PREFABS</code> yet.</p>'; renderPanel(null); return; }

  const d = prefab.defaultDimensions;
  const placed = PLACED_ASSETS.find((p) => p.prefabId === id);
  const o = placed?.dimensionsOverride;
  const w = o?.width?.metres ?? d.width.metres;
  const dp = o?.depth?.metres ?? d.depth.metres;
  const h = o?.height?.metres ?? d.height.metres;

  current = prefab.build3D({
    width: w,
    depth: dp,
    height: h,
    getMat,
    registerInteractiveDoor: (reg) => {
      doorManager.register({
        id: reg.subId ? `${id}_${reg.subId}` : id,
        label: prefab.defaultLabel,
        floor: 'ground',
        pivots: reg.pivots,
        triggerMeshes: reg.triggerMeshes,
        isHovered: false,
        isPinned: false,
      });
    },
  });
  current.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh && !m.userData.isInteractiveTrigger) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  scene.add(current);

  const box = new THREE.Box3();
  current.updateMatrixWorld(true);
  current.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh && !m.userData.isInteractiveTrigger) {
      box.expandByObject(m);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const tgt = new THREE.Box3(new THREE.Vector3(-w / 2, 0, -dp / 2), new THREE.Vector3(w / 2, h, dp / 2));

  const targetHelper = new THREE.Box3Helper(tgt, new THREE.Color('#1a7f37'));
  const actualHelper = new THREE.Box3Helper(box, new THREE.Color('#e08a00'));
  // front arrow (+Z)
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.002, dp / 2 + 0.02), 0.3, 0x2563eb);
  helpers.push(targetHelper, actualHelper, arrow);
  helpers.forEach((x) => scene.add(x));
  (targetHelper as any).userData.kind = 'target';
  (actualHelper as any).userData.kind = 'bbox';

  const tol = 0.005;
  const rows = [
    ['Width X', w, size.x], ['Depth Z', dp, size.z], ['Height Y', h, size.y],
  ].map(([n, t, a]) => {
    const diff = (a as number) - (t as number);
    const cls = Math.abs(diff) <= tol ? 'ok' : 'bad';
    return `<tr><td>${n}</td><td>${fmt(t as number)}</td><td>${fmt(a as number)}</td><td class="${cls}">${diff >= 0 ? '+' : ''}${fmt(diff)}</td></tr>`;
  }).join('');
  const minY = box.min.y;
  const centred = Math.abs((box.min.x + box.max.x) / 2) < tol && Math.abs((box.min.z + box.max.z) / 2) < tol;
  let tris = 0, meshes = 0;
  const mats = new Set<string>();
  current.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh || m.userData.isInteractiveTrigger) return;
    meshes++;
    const idx = m.geometry.index;
    tris += (idx ? idx.count : m.geometry.attributes.position.count) / 3;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x.name || `#${(x as any).color?.getHexString?.() ?? '?'}`));
  });
  const doorCount = doorManager.getDoors().length;
  info = `
    <table><tr><th>cm</th><th>target</th><th>actual</th><th>Δ</th></tr>${rows}</table>
    <div class="${Math.abs(minY) <= tol ? 'ok' : 'bad'}">Base Y = ${fmt(minY)} cm (should be 0)</div>
    <div class="${centred ? 'ok' : 'bad'}">XZ centre ${centred ? 'centred ✓' : 'NOT centred on origin'}</div>
    <div>${meshes} meshes · ${Math.round(tris)} tris · ${mats.size} materials</div>
    ${doorCount > 0 ? `<div style="margin-top:4px"><button id="toggle-doors">Toggle door animation (hover/click in 3D)</button></div>` : ''}
    <div style="color:#666;font-size:11px">green = target box, orange = actual bbox, blue arrow = front (+Z)</div>
    ${placed ? `<div style="font-size:11px">Placed: <code>${placed.id}</code> on ${placed.floor} @ ${placed.positionXZ.join(', ')} rot ${placed.rotationDeg ?? 0}°</div>` : '<div style="font-size:11px">Not placed in house yet.</div>'}`;

  human.position.set(w / 2 + 0.5, 0, 0);
  frame(Math.max(w, dp, h), h);
  applyToggles();
  renderPanel(prefab.defaultLabel);
}

function frame(span: number, h: number) {
  const dist = span * 2.6 + 0.6;
  controls.target.set(0, h / 2, 0);
  camera.position.set(dist * 0.75, h / 2 + dist * 0.45, dist * 0.8);
  sun.shadow.camera.updateProjectionMatrix();
}

function setView(v: string, w = 1, d = 1, h = 1) {
  if (!current) return;
  const b = new THREE.Box3().setFromObject(current);
  const s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const dist = Math.max(s.x, s.y, s.z) * 2.6 + 0.4;
  const dir: Record<string, [number, number, number]> = {
    front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.001], iso: [0.75, 0.55, 0.8],
  };
  const [x, y, z] = dir[v];
  controls.target.copy(c);
  camera.position.copy(c).add(new THREE.Vector3(x, y, z).normalize().multiplyScalar(dist));
}

function applyToggles() {
  helpers.forEach((h) => {
    if (h.userData.kind === 'target') h.visible = state.target;
    else if (h.userData.kind === 'bbox') h.visible = state.bbox;
  });
  human.visible = state.human;
  grid.visible = state.grid;
  floor.visible = state.shadows;
  current?.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh || m.userData.isInteractiveTrigger) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x: any) => { x.wireframe = state.wireframe; });
  });
}

function renderPanel(label: string | null) {
  const opts = ids.map((i) => `<option value="${i}" ${i === state.id ? 'selected' : ''}>${i}</option>`).join('');
  const tog = (k: keyof typeof state, t: string) =>
    `<label><input type="checkbox" data-k="${k}" ${state[k] ? 'checked' : ''}/> ${t}</label>`;
  panel.innerHTML = `<h1>Asset Inspector ${label ? `— ${label}` : ''}</h1>
    <select id="sel">${opts}</select><br/>
    ${['iso', 'front', 'back', 'left', 'right', 'top'].map((v) => `<button data-v="${v}">${v}</button>`).join('')}
    ${tog('wireframe', 'Wireframe')}${tog('target', 'Target box')}${tog('bbox', 'Actual bbox')}${tog('human', 'Human 1.75 m')}${tog('grid', 'Grid (10 cm)')}${tog('shadows', 'Ground shadow')}
    ${info}`;
  (panel.querySelector('#sel') as HTMLSelectElement | null)?.addEventListener('change', (e) => {
    state.id = (e.target as HTMLSelectElement).value;
    history.replaceState(null, '', `?asset=${state.id}`);
    load(state.id);
  });
  panel.querySelectorAll('input[data-k]').forEach((el) => el.addEventListener('change', () => {
    (state as any)[(el as HTMLInputElement).dataset.k!] = (el as HTMLInputElement).checked;
    applyToggles();
  }));
  panel.querySelectorAll('button[data-v]').forEach((el) => el.addEventListener('click', () => setView((el as HTMLElement).dataset.v!)));
  panel.querySelector('#toggle-doors')?.addEventListener('click', () => {
    const doors = doorManager.getDoors();
    const anyPinned = doors.some((d) => d.isPinned);
    for (const d of doors) {
      d.isPinned = !anyPinned;
    }
  });
}

let pointerDownPos: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons !== 0) return;
  pointerNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  const hovered = doorManager.handlePointerMove(raycaster);
  canvas.style.cursor = hovered ? 'pointer' : '';
});
canvas.addEventListener('click', (e) => {
  if (pointerDownPos) {
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) > 6) return;
  }
  pointerNDC.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNDC, camera);
  doorManager.handleClick(raycaster);
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
load(state.id);

let lastTime = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  doorManager.update(dt);
  controls.update();
  renderer.render(scene, camera);
});
