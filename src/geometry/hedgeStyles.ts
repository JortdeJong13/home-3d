import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MaterialId } from '../model/materials';
import { ProvenanceType } from '../model/units';
import type { RegisterMeshFn } from './houseBuilder';

export type HedgeStyleId =
  | 'bush_cluster'
  | 'bush_v1_fine'
  | 'bush_v1_bold'
  | 'bush_v1_wavy'
  | 'bush_v1_clipped'
  | 'bush_v1_upright_stems';

export interface HedgeStyleMeta {
  id: HedgeStyleId;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
}

export const HEDGE_STYLE_OPTIONS: HedgeStyleMeta[] = [
  {
    id: 'bush_cluster',
    number: 1,
    title: 'Basis struik-cluster (Optie 1)',
    shortTitle: 'Basis (Optie 1)',
    description:
      'Referentie-optie 1: directe struik-clusters met middelgrote, asymmetrisch gedraaide facet-bollen.',
  },
  {
    id: 'bush_v1_fine',
    number: 2,
    title: 'Fijner & dichter blad (var. 1)',
    shortTitle: 'Fijner loof',
    description:
      'Zelfde organische struik-opbouw als 1, maar met meer en kleinere bladclusters voor een fijnere textuur.',
  },
  {
    id: 'bush_v1_bold',
    number: 3,
    title: 'Grof & sculpturaal (var. 1)',
    shortTitle: 'Grof & vol',
    description:
      'Grotere, uitgerekte struik-lobben met rustige, krachtige laag-poly facetten langs de haaglijn.',
  },
  {
    id: 'bush_v1_wavy',
    number: 4,
    title: 'Natuurlijk golvende top (var. 1)',
    shortTitle: 'Golvende top',
    description:
      'Organische struik-haag met een licht golvende bovenlijn en subtiele breedte-variatie.',
  },
  {
    id: 'bush_v1_clipped',
    number: 5,
    title: 'Strak geknipte struikhaag (var. 1)',
    shortTitle: 'Strak geknipt',
    description:
      'Struik-clusters strak binnen een licht taps toelopend profiel en rechte bovenlijn geknipt.',
  },
  {
    id: 'bush_v1_upright_stems',
    number: 6,
    title: 'Opgaande struik + korte takjes (var. 1)',
    shortTitle: 'Opgaand + tak',
    description:
      'Verticaal opgaande struik-toeven op hele korte houten stammetjes (~8 cm boven de grond).',
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
 * Build a hedge segment exploring bush-cluster variations inspired by Option 1.
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
  const trunkGeos: THREE.BufferGeometry[] = [];
  const yFloor = soilMatId ? 0.035 : 0.01;

  if (style === 'bush_cluster') {
    // 1. Reference Option 1: Direct bush-cluster lineage
    const stepZ = Math.min(0.26, Math.max(0.18, width * 0.68));
    const numClusters = Math.max(3, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.56);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.04;
      const clusterH = height * (0.93 + rand() * 0.11);

      const coreR = Math.min(width * 0.44, clusterH * 0.34) * (0.95 + rand() * 0.15);
      const corePuff = new THREE.IcosahedronGeometry(coreR, 1);
      corePuff.scale(0.95 + rand() * 0.16, (clusterH * 0.44) / Math.max(0.12, coreR), 1.15 + rand() * 0.25);
      corePuff.rotateY(rand() * Math.PI * 2);
      corePuff.rotateX((rand() - 0.5) * 0.25);
      corePuff.translate((rand() - 0.5) * width * 0.12, yFloor + clusterH * 0.44, cz);
      mainGeos.push(corePuff);

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
  } else if (style === 'bush_v1_fine') {
    // 2. Finer & denser bush clusters (more smaller rotated puffs)
    const stepZ = 0.16;
    const numClusters = Math.max(4, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.44);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;

      // Solid inner core so there are no gaps
      for (const yr of [0.34, 0.66]) {
        const coreR = Math.min(width * 0.38, height * 0.26);
        const core = new THREE.IcosahedronGeometry(coreR, 1);
        core.scale(0.88 + rand() * 0.12, 1.0 + rand() * 0.14, 1.1 + rand() * 0.2);
        core.rotateY(rand() * Math.PI * 2);
        core.translate((rand() - 0.5) * width * 0.08, yFloor + height * yr, cz);
        mainGeos.push(core);
      }

      // 10 smaller organic outer puffs across height & sides
      const numPuffs = 10;
      for (let ip = 0; ip < numPuffs; ip++) {
        const tierT = ip / (numPuffs - 1);
        const sideSign = ip % 3 === 0 ? 0 : ip % 2 === 0 ? 1 : -1;
        const r = Math.min(width * 0.27, 0.108) * (0.78 + rand() * 0.36);
        const puff = new THREE.IcosahedronGeometry(r, 1);
        puff.scale(0.86 + rand() * 0.24, 0.80 + rand() * 0.28, 0.94 + rand() * 0.30);
        puff.rotateX(rand() * Math.PI);
        puff.rotateY(rand() * Math.PI * 2);
        puff.rotateZ(rand() * Math.PI);

        const px = sideSign * width * (0.18 + rand() * 0.12) * (1 - tierT * 0.18) + (rand() - 0.5) * 0.04;
        const py = yFloor + height * (0.12 + tierT * 0.78) + (rand() - 0.5) * 0.04;
        const pz = cz + (rand() - 0.5) * stepZ * 1.1;
        puff.translate(px, Math.min(height - r * 0.45, Math.max(yFloor + r * 0.45, py)), pz);
        mainGeos.push(puff);
      }
    }
  } else if (style === 'bush_v1_bold') {
    // 3. Bold & chunky sculptural bush lobes (fewer, larger, elongated along hedge)
    const stepZ = 0.28;
    const numClusters = Math.max(3, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.62);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;

      const coreR = Math.min(width * 0.48, height * 0.36) * (0.94 + rand() * 0.14);
      const core = new THREE.IcosahedronGeometry(coreR, 1);
      core.scale(0.92 + rand() * 0.14, (height * 0.46) / Math.max(0.14, coreR), 1.32 + rand() * 0.26);
      core.rotateY(rand() * Math.PI * 2);
      core.rotateZ((rand() - 0.5) * 0.15);
      core.translate((rand() - 0.5) * width * 0.08, yFloor + height * 0.46, cz);
      mainGeos.push(core);

      const numLobes = 4;
      for (let ip = 0; ip < numLobes; ip++) {
        const tierT = ip / (numLobes - 1);
        const sideSign = ip % 2 === 0 ? 1 : -1;
        const r = Math.min(width * 0.42, height * 0.28) * (0.88 + rand() * 0.24);
        const lobe = new THREE.IcosahedronGeometry(r, 1);
        lobe.scale(0.84 + rand() * 0.20, 0.86 + rand() * 0.24, 1.25 + rand() * 0.35);
        lobe.rotateX((rand() - 0.5) * 0.7);
        lobe.rotateY(rand() * Math.PI * 2);
        lobe.rotateZ((rand() - 0.5) * 0.7);

        const px = sideSign * width * (0.13 + rand() * 0.14);
        const py = yFloor + height * (0.22 + tierT * 0.58) + (rand() - 0.5) * 0.04;
        const pz = cz + (rand() - 0.5) * 0.14;
        lobe.translate(px, Math.min(height - r * 0.45, Math.max(yFloor + r * 0.45, py)), pz);
        mainGeos.push(lobe);
      }
    }
  } else if (style === 'bush_v1_wavy') {
    // 4. Natural undulating crown & organic swell (lively hand-pruned bush row)
    const stepZ = 0.21;
    const numClusters = Math.max(4, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.52);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;
      // Distinct organic wave along top (+7 cm / -10 cm) & gentle side breath
      const waveOffset = Math.sin(tz * Math.PI * 2.2 + 0.6) * 0.085 + (rand() - 0.5) * 0.04;
      const clusterH = Math.max(height * 0.76, height * 0.96 + waveOffset);
      const swellW = width * (0.94 + 0.16 * Math.cos(tz * Math.PI * 2.0));

      const coreR = Math.min(swellW * 0.44, clusterH * 0.34);
      const core = new THREE.IcosahedronGeometry(coreR, 1);
      core.scale(0.95 + rand() * 0.14, (clusterH * 0.45) / Math.max(0.12, coreR), 1.15 + rand() * 0.22);
      core.rotateY(rand() * Math.PI * 2);
      core.translate((rand() - 0.5) * swellW * 0.12, yFloor + clusterH * 0.44, cz);
      mainGeos.push(core);

      const numPuffs = 7;
      for (let ip = 0; ip < numPuffs; ip++) {
        const tierT = ip / (numPuffs - 1);
        const sideSign = ip % 2 === 0 ? 1 : -1;
        const r = Math.min(swellW * 0.36, clusterH * 0.24) * (0.76 + rand() * 0.38);
        const puff = new THREE.IcosahedronGeometry(r, 1);
        puff.scale(0.86 + rand() * 0.28, 0.82 + rand() * 0.34, 0.95 + rand() * 0.30);
        puff.rotateX(rand() * Math.PI);
        puff.rotateY(rand() * Math.PI * 2);
        puff.rotateZ(rand() * Math.PI);

        const px = sideSign * swellW * (0.14 + rand() * 0.18) * (1 - tierT * 0.18);
        const py = yFloor + clusterH * (0.18 + tierT * 0.68) + (rand() - 0.5) * 0.04;
        const pz = cz + (rand() - 0.5) * stepZ * 0.9;
        puff.translate(px, Math.min(clusterH - r * 0.42, Math.max(yFloor + r * 0.42, py)), pz);
        mainGeos.push(puff);
      }
    }
  } else if (style === 'bush_v1_clipped') {
    // 5. Disciplined clipped-line bush hedge (Option 1 puffs tightly shaped into a neat tapered hedge)
    const stepZ = 0.18;
    const numClusters = Math.max(4, Math.round(length / stepZ) + 1);
    const zSpan = Math.max(0.05, length - width * 0.44);

    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;

      for (const yr of [0.34, 0.68]) {
        const coreR = Math.min(width * 0.40, height * 0.28);
        const core = new THREE.IcosahedronGeometry(coreR * (0.94 + rand() * 0.08), 1);
        core.scale(0.84 + rand() * 0.10, 1.02 + rand() * 0.12, 1.18 + rand() * 0.16);
        core.rotateY(rand() * Math.PI * 2);
        core.translate((rand() - 0.5) * width * 0.05, yFloor + height * yr, cz);
        mainGeos.push(core);
      }

      const tiers = 4;
      for (let it = 0; it < tiers; it++) {
        const ty = it / (tiers - 1);
        // Subtle inward batter toward top, flat-ish crown
        const rowHalfW = width * (0.29 - ty * 0.07);
        const py = yFloor + 0.09 + ty * (height - 0.19);
        for (const side of [-1, 1] as const) {
          const r = Math.min(width * 0.27, 0.12) * (0.90 + rand() * 0.16);
          const puff = new THREE.IcosahedronGeometry(r, 1);
          puff.scale(0.74 + rand() * 0.14, 0.86 + rand() * 0.16, 1.14 + rand() * 0.20);
          puff.rotateX((rand() - 0.5) * 0.45);
          puff.rotateY(rand() * Math.PI * 2);
          puff.translate(
            side * rowHalfW + (rand() - 0.5) * 0.015,
            Math.min(height - r * 0.52, py + (rand() - 0.5) * 0.02),
            cz + (rand() - 0.5) * 0.06
          );
          mainGeos.push(puff);
        }
      }
    }
  } else {
    // 6. Upright bush tufts + short woody stems (~8 cm visible stems above soil)
    const stemStep = 0.14;
    const stemCount = Math.max(4, Math.round(length / stemStep));
    const zSpan = Math.max(0.05, length - 0.16);

    for (let i = 0; i < stemCount; i++) {
      const tz = stemCount > 1 ? i / (stemCount - 1) : 0.5;
      const sz = -zSpan * 0.5 + tz * zSpan + (rand() - 0.5) * 0.03;
      for (let t = 0; t < 2; t++) {
        const stemH = Math.min(height * 0.22, 0.12 + rand() * 0.045);
        const stem = new THREE.CylinderGeometry(0.011, 0.016, stemH, 6);
        stem.rotateZ((rand() - 0.5) * 0.20);
        stem.rotateX((rand() - 0.5) * 0.16);
        stem.translate((rand() - 0.5) * width * 0.28, yFloor + stemH * 0.45, sz + (rand() - 0.5) * 0.04);
        trunkGeos.push(stem);
      }
    }

    const stepZ = 0.20;
    const numClusters = Math.max(4, Math.round(length / stepZ) + 1);
    const canopyBase = Math.min(0.085, height * 0.11);
    for (let ic = 0; ic < numClusters; ic++) {
      const tz = numClusters > 1 ? ic / (numClusters - 1) : 0.5;
      const cz = -zSpan * 0.5 + tz * zSpan;
      const clusterTop = height * (0.94 + (rand() - 0.5) * 0.08);

      // Upright vertical-oval bush core
      const coreR = Math.min(width * 0.36, height * 0.28);
      const core = new THREE.IcosahedronGeometry(coreR, 1);
      core.scale(0.82 + rand() * 0.14, 1.38 + rand() * 0.24, 1.05 + rand() * 0.18);
      core.rotateY(rand() * Math.PI * 2);
      core.translate((rand() - 0.5) * width * 0.08, canopyBase + (clusterTop - canopyBase) * 0.48, cz);
      mainGeos.push(core);

      // Upright outer tufts reaching skyward
      const numTufts = 6;
      for (let ip = 0; ip < numTufts; ip++) {
        const tierT = ip / (numTufts - 1);
        const sideSign = ip % 2 === 0 ? 1 : -1;
        const r = Math.min(width * 0.30, 0.135) * (0.78 + rand() * 0.32);
        const tuft = new THREE.IcosahedronGeometry(r, 1);
        tuft.scale(0.76 + rand() * 0.18, 1.24 + rand() * 0.34, 0.88 + rand() * 0.22);
        tuft.rotateY(rand() * Math.PI * 2);
        tuft.rotateZ((rand() - 0.5) * 0.24);
        tuft.rotateX((rand() - 0.5) * 0.24);

        const py = canopyBase + (clusterTop - canopyBase) * (0.18 + tierT * 0.70);
        const px = sideSign * width * (0.14 + rand() * 0.14) * (1 - tierT * 0.22);
        tuft.translate(px, Math.min(clusterTop - r * 0.48, py), cz + (rand() - 0.5) * 0.12);
        mainGeos.push(tuft);
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

  if (trunkGeos.length > 0) {
    const trunkMesh = new THREE.Mesh(mergeSafe(trunkGeos), getMat('plot_tree_trunk'));
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    segmentGroup.add(trunkMesh);
  }

  group.add(segmentGroup);
}

/**
 * Small angled garden marker stake + numbered plaque placed in front of each
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
      face.position.set(
        0,
        0.30 + Math.sin(THREE.MathUtils.degToRad(40)) * 0.012,
        0.01 + Math.cos(THREE.MathUtils.degToRad(40)) * 0.012
      );
      face.rotation.x = -THREE.MathUtils.degToRad(40);
      plaqueGroup.add(face);
    }
  }

  group.add(plaqueGroup);
}
