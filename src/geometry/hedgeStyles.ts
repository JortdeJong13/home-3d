import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialId } from '../model/materials';
import { ProvenanceType } from '../model/units';
import type { RegisterMeshFn } from './houseBuilder';

export type HedgeStyleId =
  | 'bush_cluster'
  | 'trimmed_faceted'
  | 'two_tone_layered'
  | 'sculpted_poly'
  | 'woody_natural';

export interface HedgeStyleMeta {
  id: HedgeStyleId;
  number: number;
  title: string;
  description: string;
}

export const HEDGE_STYLE_OPTIONS: HedgeStyleMeta[] = [
  {
    id: 'bush_cluster',
    number: 1,
    title: 'Struik-cluster haag',
    description:
      'Direct geïnspireerd op de tuin-struiken: grotere, asymmetrisch geschaalde en gedraaide facet-clusters.',
  },
  {
    id: 'trimmed_faceted',
    number: 2,
    title: 'Strak geschoren facet-haag',
    description:
      'Architecturale taps toelopende haagvorm met subtiel golvende laag-poly vlakken en losse bladaccenten.',
  },
  {
    id: 'two_tone_layered',
    number: 3,
    title: 'Twee-tinten gelaagde haag',
    description:
      'Diepgroene schaduwkern met lichtere bladlagen en frisse groeischeuten bovenop voor extra diepte.',
  },
  {
    id: 'sculpted_poly',
    number: 4,
    title: 'Geometrische laag-poly haag',
    description:
      'Sculpturale kristallijne haag opgebouwd uit gekantelde en uitgerekte laag-poly icosaëders.',
  },
  {
    id: 'woody_natural',
    number: 5,
    title: 'Natuurlijke haag op takbasis',
    description:
      'Luchtige, golvende struikhaag op zichtbare houten stammetjes boven het teelaardebed.',
  },
];

export interface StyledHedgeSegmentOptions {
  id: string;
  label: string;
  style: HedgeStyleId;
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
 * Create a tapered, subdivided, subtly perturbed low-poly hedge prism for the trimmed architectural style.
 */
function createFacetedTrimmedCore(
  width: number,
  height: number,
  length: number,
  rand: () => number
): THREE.BufferGeometry {
  const segX = 4;
  const segY = 5;
  const segZ = Math.max(6, Math.round(length / 0.16));

  const box = new THREE.BoxGeometry(width, height, length, segX, segY, segZ);
  const pos = box.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i) + height * 0.5; // shift to [0, height]
    let z = pos.getZ(i);

    const ty = Math.max(0, Math.min(1, y / height));
    // Classic battered hedge profile: slightly narrower at top + gentle crown arch
    const taperX = 1.0 - ty * 0.16;
    x *= taperX;

    if (y > height * 0.85) {
      const edgeNorm = Math.min(1, Math.abs(x) / Math.max(0.01, (width * taperX) * 0.5));
      y -= edgeNorm * edgeNorm * 0.035;
    }

    // Subtle organic facet perturbation except right on the ground plane
    const isBottom = ty < 0.04;
    if (!isBottom) {
      const amp = 0.015;
      x += (rand() - 0.5) * 2 * amp;
      y += (rand() - 0.5) * 2 * (ty > 0.88 ? amp * 1.15 : amp * 0.8);
      z += (rand() - 0.5) * 2 * amp;
    }

    pos.setXYZ(i, x, Math.max(0.01, y), z);
  }

  const nonIndexed = box.toNonIndexed();
  box.dispose();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

/**
 * Build a hedge segment using one of the 5 bush-inspired architectural styles.
 */
export function buildStyledHedgeSegment(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  registerMesh: RegisterMeshFn,
  opts: StyledHedgeSegmentOptions
) {
  const { id, label, style, matId, soilMatId, x0, z0, x1, z1, width, height, seed, provenance, source } = opts;
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

  // Soil / mulch bed under the hedge
  if (soilMatId) {
    const soilGeo = new THREE.BoxGeometry(width + 0.08, 0.045, length + 0.06);
    const soilMesh = new THREE.Mesh(soilGeo, getMat(soilMatId));
    soilMesh.position.y = 0.0225;
    soilMesh.receiveShadow = true;
    segmentGroup.add(soilMesh);
  }

  const mainGeos: THREE.BufferGeometry[] = [];
  const deepGeos: THREE.BufferGeometry[] = [];
  const freshGeos: THREE.BufferGeometry[] = [];
  const trunkGeos: THREE.BufferGeometry[] = [];

  const yFloor = soilMatId ? 0.035 : 0.01;
  const isNeighbour = matId === 'neighbour_hedge_grey';

  if (style === 'bush_cluster') {
    // Style 1: Direct bush-cluster lineage (overlapping multi-scale rotated icosahedron mounds)
    const stepZ = Math.min(0.26, Math.max(0.18, width * 0.68));
    const numClusters = Math.max(3, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.56);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.04;
      const clusterH = height * (0.93 + rand() * 0.11);

      // Core bush mound (larger, anchoring the volume like addShrubMound i===0)
      const coreR = Math.min(width * 0.44, clusterH * 0.34) * (0.95 + rand() * 0.15);
      const corePuff = new THREE.IcosahedronGeometry(coreR, 1);
      corePuff.scale(0.95 + rand() * 0.16, (clusterH * 0.44) / Math.max(0.12, coreR), 1.15 + rand() * 0.25);
      corePuff.rotateY(rand() * Math.PI * 2);
      corePuff.rotateX((rand() - 0.5) * 0.25);
      corePuff.translate((rand() - 0.5) * width * 0.12, yFloor + clusterH * 0.44, cz);
      mainGeos.push(corePuff);

      // 5–6 asymmetrical secondary bush puffs around sides & crown
      const numPuffs = 6;
      for (let ip = 0; ip < numPuffs; ip++) {
        const tierT = ip / (numPuffs - 1);
        const sideSign = ip % 2 === 0 ? 1 : -1;
        const px = sideSign * width * (0.14 + rand() * 0.16);
        const py = yFloor + clusterH * (0.20 + tierT * 0.64) + (rand() - 0.5) * 0.05;
        const pz = cz + (rand() - 0.5) * stepZ * 0.95;

        const r = Math.min(width * 0.36, clusterH * 0.24) * (0.78 + rand() * 0.34);
        const puff = new THREE.IcosahedronGeometry(r, 1);
        puff.scale(0.85 + rand() * 0.28, 0.80 + rand() * 0.34, 0.95 + rand() * 0.32);
        puff.rotateX(rand() * Math.PI);
        puff.rotateY(rand() * Math.PI * 2);
        puff.rotateZ(rand() * Math.PI);
        puff.translate(px, Math.min(clusterH - r * 0.45, Math.max(yFloor + r * 0.45, py)), pz);
        mainGeos.push(puff);
      }
    }
  } else if (style === 'trimmed_faceted') {
    // Style 2: Clean architectural tapered prism with faceted perturbation + flattened leaf-tuft accents
    const core = createFacetedTrimmedCore(width, height, length, rand);
    mainGeos.push(core);

    const accentStep = 0.22;
    const count = Math.max(4, Math.round(length / accentStep));
    for (let i = 0; i < count; i++) {
      const z = -length * 0.44 + (i / Math.max(1, count - 1)) * length * 0.88 + (rand() - 0.5) * 0.06;
      // Side & shoulder flat-ish bush tufts breaking straight silhouette lines subtly
      for (const side of [-1, 1] as const) {
        if (rand() < 0.25) continue;
        const r = 0.095 + rand() * 0.045;
        const tuft = new THREE.IcosahedronGeometry(r, 1);
        tuft.scale(0.55 + rand() * 0.2, 0.9 + rand() * 0.35, 1.15 + rand() * 0.35);
        tuft.rotateY(rand() * Math.PI * 2);
        tuft.rotateX((rand() - 0.5) * 0.4);
        const ty = 0.22 + rand() * 0.68;
        const tx = side * width * (0.43 - ty * 0.07);
        tuft.translate(tx, ty * height, z);
        mainGeos.push(tuft);
      }
      // Subtle top ridge tufts
      if (i % 2 === 0) {
        const r = 0.085 + rand() * 0.04;
        const topTuft = new THREE.IcosahedronGeometry(r, 1);
        topTuft.scale(1.0 + rand() * 0.25, 0.58 + rand() * 0.2, 1.2 + rand() * 0.35);
        topTuft.rotateY(rand() * Math.PI * 2);
        topTuft.translate((rand() - 0.5) * width * 0.24, height - r * 0.28, z);
        mainGeos.push(topTuft);
      }
    }
  } else if (style === 'two_tone_layered') {
    // Style 3: Deep shaded beech core + medium sage outer bush tufts + fresh lighter top shoots
    const stepZ = 0.24;
    const numClusters = Math.max(3, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.52);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;

      // Deep shaded lower/inner mounds
      for (let k = 0; k < 2; k++) {
        const rDeep = Math.min(width * 0.42, height * 0.30) * (0.9 + rand() * 0.18);
        const deepPuff = new THREE.IcosahedronGeometry(rDeep, 1);
        deepPuff.scale(0.95 + rand() * 0.15, (height * 0.36) / Math.max(0.12, rDeep), 1.15 + rand() * 0.2);
        deepPuff.rotateY(rand() * Math.PI * 2);
        deepPuff.translate(
          (rand() - 0.5) * width * 0.18,
          yFloor + height * (0.28 + k * 0.28),
          cz + (rand() - 0.5) * 0.08
        );
        (isNeighbour ? mainGeos : deepGeos).push(deepPuff);
      }

      // Main mid-tone outer leafy lobes (bush-inspired)
      for (let side of [-1, 1] as const) {
        for (let row = 0; row < 2; row++) {
          const rMid = Math.min(width * 0.34, height * 0.22) * (0.82 + rand() * 0.30);
          const midPuff = new THREE.IcosahedronGeometry(rMid, 1);
          midPuff.scale(0.80 + rand() * 0.22, 0.85 + rand() * 0.30, 1.05 + rand() * 0.30);
          midPuff.rotateX((rand() - 0.5) * 0.8);
          midPuff.rotateY(rand() * Math.PI * 2);
          midPuff.translate(
            side * width * (0.19 + rand() * 0.10) * (1 - row * 0.15),
            yFloor + height * (0.28 + row * 0.36 + (rand() - 0.5) * 0.08),
            cz + (rand() - 0.5) * 0.14
          );
          mainGeos.push(midPuff);
        }
      }

      // Fresh lighter crown shoots along top third
      const freshCount = 2;
      for (let f = 0; f < freshCount; f++) {
        const rFresh = Math.min(width * 0.28, height * 0.16) * (0.78 + rand() * 0.30);
        const freshPuff = new THREE.IcosahedronGeometry(rFresh, 1);
        freshPuff.scale(0.95 + rand() * 0.22, 0.72 + rand() * 0.22, 1.10 + rand() * 0.30);
        freshPuff.rotateY(rand() * Math.PI * 2);
        freshPuff.rotateZ((rand() - 0.5) * 0.4);
        freshPuff.translate(
          (rand() - 0.5) * width * 0.32,
          height * (0.78 + rand() * 0.14),
          cz + (rand() - 0.5) * 0.14
        );
        (isNeighbour ? mainGeos : freshGeos).push(freshPuff);
      }
    }
  } else if (style === 'sculpted_poly') {
    // Style 4: Crisp geometric low-poly crystal foliage (detail=0 icosahedra + elongated faceted chunks)
    const stepZ = 0.22;
    const numCols = Math.max(4, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.45);

    for (let ic = 0; ic < numCols; ic++) {
      const tz = numCols > 1 ? ic / (numCols - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;

      const layers = Math.max(3, Math.round(height / 0.24));
      for (let iy = 0; iy < layers; iy++) {
        const ty = layers > 1 ? iy / (layers - 1) : 0.5;
        const py = yFloor + 0.12 + ty * (height - 0.22);
        const rowSpreadX = width * 0.22 * (1 - ty * 0.28);

        for (const side of [-1, 0, 1] as const) {
          if (side === 0 && iy < layers - 1 && rand() < 0.4) continue;
          const r = Math.min(width * 0.36, 0.175) * (0.82 + rand() * 0.32);
          // Alternate between crisp 20-face detail=0 crystals and detail=1 chunks
          const detail = (ic + iy + side) % 2 === 0 ? 0 : 1;
          const chunk = new THREE.IcosahedronGeometry(r, detail);
          chunk.scale(0.80 + rand() * 0.25, 0.85 + rand() * 0.30, 1.20 + rand() * 0.45);
          chunk.rotateX(rand() * Math.PI);
          chunk.rotateY(rand() * Math.PI * 2);
          chunk.rotateZ(rand() * Math.PI);
          chunk.translate(
            side * rowSpreadX + (rand() - 0.5) * 0.04,
            Math.min(height - r * 0.45, Math.max(yFloor + r * 0.45, py + (rand() - 0.5) * 0.05)),
            cz + (rand() - 0.5) * 0.08
          );
          mainGeos.push(chunk);
        }
      }
    }
  } else {
    // Style 5: Woody-base natural beech hedge (visible slender stems below airy undulating bush canopy)
    const stemStep = 0.15;
    const stemCount = Math.max(4, Math.round(length / stemStep));
    const zSpan = Math.max(0.05, length - 0.18);

    for (let i = 0; i < stemCount; i++) {
      const tz = stemCount > 1 ? i / (stemCount - 1) : 0.5;
      const sz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.04;
      // 2 slender angled twigs per station
      for (let t = 0; t < 2; t++) {
        const stemH = Math.min(height * 0.45, 0.28 + rand() * 0.10);
        const stem = new THREE.CylinderGeometry(0.011, 0.017, stemH, 6);
        stem.rotateZ((rand() - 0.5) * 0.26);
        stem.rotateX((rand() - 0.5) * 0.22);
        stem.translate((rand() - 0.5) * width * 0.34, yFloor + stemH * 0.46, sz + (rand() - 0.5) * 0.05);
        trunkGeos.push(stem);
      }
    }

    // Airy bush-mound canopy starting above Y = 0.15 m with gentle natural wave
    const stepZ = 0.24;
    const numClusters = Math.max(3, Math.round(length / stepZ) + 1);
    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;
      const waveTop = height * (0.91 + 0.10 * Math.sin(tz * Math.PI * 2.5 + seed) + (rand() - 0.5) * 0.05);
      const canopyBase = Math.min(0.18, height * 0.22);

      // Lower deep-green underside mounds
      const rLow = Math.min(width * 0.38, height * 0.28) * (0.85 + rand() * 0.22);
      const lowPuff = new THREE.IcosahedronGeometry(rLow, 1);
      lowPuff.scale(0.95 + rand() * 0.2, 0.78 + rand() * 0.2, 1.15 + rand() * 0.25);
      lowPuff.rotateY(rand() * Math.PI * 2);
      lowPuff.translate((rand() - 0.5) * width * 0.16, canopyBase + rLow * 0.72, cz);
      (isNeighbour ? mainGeos : deepGeos).push(lowPuff);

      // Outer & top organic bush puffs
      const numPuffs = 5;
      for (let ip = 0; ip < numPuffs; ip++) {
        const tierT = ip / (numPuffs - 1);
        const r = Math.min(width * 0.35, height * 0.24) * (0.78 + rand() * 0.34);
        const puff = new THREE.IcosahedronGeometry(r, 1);
        puff.scale(0.88 + rand() * 0.24, 0.82 + rand() * 0.32, 0.98 + rand() * 0.30);
        puff.rotateX((rand() - 0.5) * 0.6);
        puff.rotateY(rand() * Math.PI * 2);
        puff.rotateZ((rand() - 0.5) * 0.6);

        const py = canopyBase + (waveTop - canopyBase) * (0.22 + tierT * 0.68);
        const px = (ip % 2 === 0 ? 1 : -1) * width * (0.12 + rand() * 0.16) * (1 - tierT * 0.25);
        puff.translate(px, Math.min(waveTop - r * 0.40, py), cz + (rand() - 0.5) * 0.16);
        mainGeos.push(puff);
      }
    }
  }

  if (mainGeos.length > 0) {
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
  }

  if (deepGeos.length > 0) {
    const deepMesh = new THREE.Mesh(mergeSafe(deepGeos), getMat('plot_hedge_beech_deep'));
    deepMesh.castShadow = true;
    deepMesh.receiveShadow = true;
    segmentGroup.add(deepMesh);
  }

  if (freshGeos.length > 0) {
    const freshMesh = new THREE.Mesh(mergeSafe(freshGeos), getMat('plot_hedge_beech_fresh'));
    freshMesh.castShadow = true;
    freshMesh.receiveShadow = true;
    segmentGroup.add(freshMesh);
  }

  if (trunkGeos.length > 0) {
    const trunkMesh = new THREE.Mesh(mergeSafe(trunkGeos), getMat('plot_tree_trunk'));
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    segmentGroup.add(trunkMesh);
  }

  group.add(segmentGroup);
}

/**
 * Small angled garden marker stake + numbered plaque (1..5) placed in front of each
 * comparison hedge so options are immediately identifiable in the 3D viewport.
 */
export function buildHedgeSamplePlaque(
  group: THREE.Group,
  getMat: (id: MaterialId) => THREE.MeshStandardMaterial,
  x: number,
  z: number,
  numberLabel: number,
  shortTitle: string
) {
  const plaqueGroup = new THREE.Group();
  plaqueGroup.position.set(x, 0, z);

  // Wooden stake
  const stake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.018, 0.30, 8),
    getMat('plot_tree_stake_wood')
  );
  stake.position.y = 0.15;
  stake.castShadow = true;
  plaqueGroup.add(stake);

  // Backing plate
  const plateW = 0.36;
  const plateH = 0.19;
  const plateMat = getMat('plinth_base_white');
  const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, plateH, 0.02), plateMat);
  plate.position.set(0, 0.30, 0.01);
  plate.rotation.x = -THREE.MathUtils.degToRad(40);
  plate.castShadow = true;
  plate.receiveShadow = true;
  plaqueGroup.add(plate);

  // Crisp number + label face in browser environments
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 136;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f7f5f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#6d9b5c';
      ctx.lineWidth = 6;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

      ctx.fillStyle = '#2d4626';
      ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${numberLabel}`, canvas.width / 2, 52);

      ctx.fillStyle = '#475544';
      ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(shortTitle, canvas.width / 2, 106);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const faceMat = new THREE.MeshBasicMaterial({ map: tex });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(plateW - 0.012, plateH - 0.012), faceMat);
      face.position.set(0, 0.30 + Math.sin(THREE.MathUtils.degToRad(40)) * 0.012, 0.01 + Math.cos(THREE.MathUtils.degToRad(40)) * 0.012);
      face.rotation.x = -THREE.MathUtils.degToRad(40);
      plaqueGroup.add(face);
    }
  }

  group.add(plaqueGroup);
}
