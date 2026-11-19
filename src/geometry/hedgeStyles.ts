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
 * Build an architectural diorama hedge as a close-packed row of overlapping
 * low-poly garden bushes (matching the driveway & back-garden bush style).
 * Works uniformly for both low front hedges (75–90 cm) and tall rear hedges (2.10 m).
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
  const stepZ = Math.min(0.28, Math.max(0.20, width * 0.72));
  const numBushes = Math.max(3, Math.round(length / stepZ) + 1);
  const zSpan = Math.max(0.05, length - width * 0.60);
  const rx = width * 0.50;
  const rz = Math.max(rx * 1.15, stepZ * 0.95);
  const numPuffs = 5;

  for (let ic = 0; ic < numBushes; ic++) {
    const tz = numBushes > 1 ? ic / (numBushes - 1) : 0.5;
    const cz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.03;
    const cx = (rand() - 0.5) * width * 0.08;
    const clusterH = height * (0.95 + rand() * 0.08);
    const ry = Math.max(0.20, clusterH - yFloor);

    for (let i = 0; i < numPuffs; i++) {
      const a = (i / (numPuffs - 1)) * Math.PI * 2 + rand() * 0.6;
      const dist = i === 0 ? 0 : 0.32 + rand() * 0.28;
      const px = cx + Math.cos(a) * rx * dist;
      const pz = cz + Math.sin(a) * rz * dist;
      const r = (i === 0 ? 0.72 : 0.50 + rand() * 0.14) * Math.min(rx, rz);
      const py = yFloor + ry * (i === 0 ? 0.50 : 0.36 + rand() * 0.18);
      const yHalf = ry * (i === 0 ? 0.52 : 0.42 + rand() * 0.10);

      const puff = new THREE.IcosahedronGeometry(r, 1);
      puff.scale(1.0 + rand() * 0.16, yHalf / Math.max(0.10, r), 1.0 + rand() * 0.18);
      puff.rotateY(rand() * Math.PI * 2);
      puff.translate(px, py, pz);
      mainGeos.push(puff);
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
