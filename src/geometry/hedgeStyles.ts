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
    const soilGeo = new THREE.BoxGeometry(width * 1.25 + 0.06, 0.045, length + 0.04);
    const soilMesh = new THREE.Mesh(soilGeo, getMat(soilMatId));
    soilMesh.position.y = 0.0225;
    soilMesh.receiveShadow = true;
    segmentGroup.add(soilMesh);
  }

  const mainGeos: THREE.BufferGeometry[] = [];
  const yFloor = soilMatId ? 0.035 : 0.01;
  const stepZ = Math.min(0.54, Math.max(0.42, width * 1.35));
  const numBushes = Math.max(3, Math.round(length / stepZ) + 1);
  const zSpan = Math.max(0.05, length - width * 0.75);
  const rx = width * 0.85;
  const rz = Math.max(rx * 1.15, stepZ * 0.85);
  const numPuffs = 5;

  for (let ic = 0; ic < numBushes; ic++) {
    const tz = numBushes > 1 ? ic / (numBushes - 1) : 0.5;
    const cz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.02;
    const cx = (rand() - 0.5) * width * 0.03;
    const clusterH = height * (0.97 + rand() * 0.05);
    const ry = Math.max(0.20, clusterH - yFloor);

    for (let i = 0; i < numPuffs; i++) {
      const a = (i / (numPuffs - 1)) * Math.PI * 2 + rand() * 0.35;
      const distX = i === 0 ? 0 : 0.12 + rand() * 0.12;
      const distZ = i === 0 ? 0 : 0.26 + rand() * 0.20;
      const px = cx + Math.cos(a) * rx * distX;
      const pz = cz + Math.sin(a) * rz * distZ;
      const r = (i === 0 ? 0.88 : 0.66 + rand() * 0.10) * Math.min(rx, rz);
      const py = yFloor + ry * (i === 0 ? 0.50 : 0.40 + rand() * 0.14);
      const yHalf = ry * (i === 0 ? 0.52 : 0.44 + rand() * 0.08);

      const puff = new THREE.IcosahedronGeometry(r, 1);
      puff.scale(1.0 + rand() * 0.08, yHalf / Math.max(0.10, r), 1.02 + rand() * 0.12);
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
