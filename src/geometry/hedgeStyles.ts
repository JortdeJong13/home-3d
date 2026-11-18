import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialId } from '../model/materials';
import { ProvenanceType } from '../model/units';
import type { RegisterMeshFn } from './houseBuilder';

export interface BushHedgeSegmentOptions {
  id: string;
  label: string;
  matId: MaterialId;
  soilMatId?: MaterialId;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  width: number;
  height: number;
  seed: number;
  provenance: ProvenanceType;
  source: string;
}

function createSeededRand(seed: number): () => number {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mergeSafe(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(normalized, false);
  for (let i = 0; i < geos.length; i++) {
    if (normalized[i] !== geos[i]) normalized[i].dispose();
    geos[i].dispose();
  }
  merged.computeBoundingBox();
  return merged;
}

/**
 * Build an architectural diorama hedge using overlapping multi-scale faceted bush clusters
 * (matching the garden shrub style) over an optional planted soil/mulch strip.
 * Scales vertically for both low front hedges (75–90 cm) and tall rear hedges (2.10 m).
 */
export function buildBushHedgeSegment(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  opts: BushHedgeSegmentOptions
) {
  const { id, label, matId, soilMatId, x0, z0, x1, z1, width, height, seed, provenance, source } = opts;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);
  const centerX = (x0 + x1) / 2;
  const centerZ = (z0 + z1) / 2;
  const rand = createSeededRand(seed);

  const segmentGroup = new THREE.Group();
  segmentGroup.position.set(centerX, 0, centerZ);
  segmentGroup.rotation.y = angle;

  if (soilMatId) {
    const soilGeo = new THREE.BoxGeometry(width + 0.06, 0.045, length + 0.04);
    const soilMesh = new THREE.Mesh(soilGeo, getMat(soilMatId));
    soilMesh.position.y = 0.0225;
    soilMesh.receiveShadow = true;
    segmentGroup.add(soilMesh);
  }

  const mainGeos: THREE.BufferGeometry[] = [];
  const yFloor = soilMatId ? 0.035 : 0.01;
  const stepZ = Math.min(0.26, Math.max(0.18, width * 0.68));
  const numClusters = Math.max(3, Math.round(length / stepZ) + 1);
  const zSpan = Math.max(0.05, length - width * 0.68);

  for (let ic = 0; ic < numClusters; ic++) {
    const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
    const cz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.04;
    const clusterH = height * (0.94 + rand() * 0.09);

    const isTall = clusterH > 1.10;
    if (!isTall) {
      // Low hedge (0.75–0.90 m): exact Option 1 single-core bush-cluster recipe
      const coreR = Math.min(width * 0.42, clusterH * 0.34) * (0.94 + rand() * 0.14);
      const corePuff = new THREE.IcosahedronGeometry(coreR, 1);
      corePuff.scale(0.92 + rand() * 0.14, (clusterH * 0.44) / Math.max(0.12, coreR), 1.15 + rand() * 0.25);
      corePuff.rotateY(rand() * Math.PI * 2);
      corePuff.rotateX((rand() - 0.5) * 0.25);
      corePuff.translate((rand() - 0.5) * width * 0.10, yFloor + clusterH * 0.44, cz);
      mainGeos.push(corePuff);

      const numPuffs = 6;
      for (let ip = 0; ip < numPuffs; ip++) {
        const tierT = ip / (numPuffs - 1);
        const sideSign = ip % 2 === 0 ? 1 : -1;
        const px = sideSign * width * (0.11 + rand() * 0.14);
        const py = yFloor + clusterH * (0.16 + tierT * 0.70) + (rand() - 0.5) * 0.05;
        const pz = cz + (rand() - 0.5) * stepZ * 0.95;

        const r = Math.min(width * 0.34, clusterH * 0.24) * (0.78 + rand() * 0.34);
        const puff = new THREE.IcosahedronGeometry(r, 1);
        puff.scale(0.84 + rand() * 0.26, 0.80 + rand() * 0.34, 0.95 + rand() * 0.32);
        puff.rotateX(rand() * Math.PI);
        puff.rotateY(rand() * Math.PI * 2);
        puff.rotateZ(rand() * Math.PI);
        puff.translate(px, Math.min(clusterH - r * 0.45, Math.max(yFloor + r * 0.45, py)), pz);
        mainGeos.push(puff);
      }
    } else {
      // Tall hedge (e.g. 2.10 m): heavily overlapping multi-core spine (no middle pinch/seam)
      // plus stratified, vertically proportioned bush tufts across the full height.
      const numCores = Math.max(3, Math.ceil(clusterH / 0.55));
      const coreRadiusY = clusterH * 0.26;
      for (let k = 0; k < numCores; k++) {
        const kt = numCores > 1 ? k / (numCores - 1) : 0.5;
        const coreR = width * (0.38 + rand() * 0.08) * (1 - Math.max(0, kt - 0.65) * 0.25);
        const corePuff = new THREE.IcosahedronGeometry(coreR, 1);
        corePuff.scale(0.90 + rand() * 0.12, coreRadiusY / Math.max(0.12, coreR), 1.15 + rand() * 0.25);
        corePuff.rotateY(rand() * Math.PI * 2);
        corePuff.rotateX((rand() - 0.5) * 0.22);
        const cy = yFloor + clusterH * (0.18 + kt * 0.62) + (rand() - 0.5) * 0.06;
        corePuff.translate((rand() - 0.5) * width * 0.08, cy, cz + (rand() - 0.5) * 0.06);
        mainGeos.push(corePuff);
      }

      const numPuffs = Math.max(12, Math.round(clusterH * 9));
      const vScaleBoost = Math.min(1.45, Math.max(1.05, clusterH / 1.55));
      for (let ip = 0; ip < numPuffs; ip++) {
        // Stratified + jittered height so puffs bridge smoothly across mid-height with no horizontal seam
        const baseT = (ip + rand()) / numPuffs;
        const sideSign = ip % 2 === 0 ? 1 : -1;
        const crownTaper = 1 - Math.max(0, baseT - 0.72) * 0.45;
        const px = sideSign * width * (0.11 + rand() * 0.14) * crownTaper;
        const py = yFloor + clusterH * (0.07 + baseT * 0.85);
        const pz = cz + (rand() - 0.5) * stepZ * 1.05;

        const r = width * 0.34 * (0.78 + rand() * 0.36);
        const puff = new THREE.IcosahedronGeometry(r, 1);
        puff.scale(
          0.84 + rand() * 0.24,
          (0.90 + rand() * 0.34) * vScaleBoost,
          0.95 + rand() * 0.34
        );
        puff.rotateX(rand() * Math.PI);
        puff.rotateY(rand() * Math.PI * 2);
        puff.rotateZ(rand() * Math.PI);
        puff.translate(px, Math.min(clusterH - r * 0.48, Math.max(yFloor + r * 0.45, py)), pz);
        mainGeos.push(puff);
      }
    }
  }

  const mainMesh = new THREE.Mesh(mergeSafe(mainGeos), getMat(matId));
  registerMesh(
    mainMesh,
    matId,
    {
      id,
      label,
      dimensionsLabel: `${width.toFixed(2)} × ${length.toFixed(2)} × ${height.toFixed(2)} m`,
      provenance,
      source,
      floor: 'plot',
    },
    true,
    true
  );
  segmentGroup.add(mainMesh);

  group.add(segmentGroup);
}
