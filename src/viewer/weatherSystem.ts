import * as THREE from 'three';
import { HouseSceneGroups, ROOF_SPEC, getZolderRoofTopY } from '../geometry/houseBuilder';
import { SeasonWeights } from '../model/seasons';
import { EdgeBlurPass } from './edgeBlur';

function createDeterministicRng(seedInit: number) {
  let s = seedInit >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SHARED_DEPTH_CHUNK = /* glsl */ `
uniform sampler2D tSceneDepth;
uniform vec2 uResolution;
uniform float uUseDepthTex;

bool isOccludedByScene() {
  if (uUseDepthTex < 0.5) return false;
  float sceneDepth = texture2D(tSceneDepth, gl_FragCoord.xy / uResolution).x;
  return (sceneDepth < 0.9999 && gl_FragCoord.z > sceneDepth + 0.0004);
}
`;

interface QuadFieldSpec {
  count: number;
  seed: number;
  xRange: [number, number];
  yRange: [number, number];
  zRange: [number, number];
  sizeRange: [number, number];
  speedRange: [number, number];
  palette?: string[];
}

function buildBillboardParticleGeometry(spec: QuadFieldSpec): THREE.BufferGeometry {
  const rand = createDeterministicRng(spec.seed);
  const { count, xRange, yRange, zRange, sizeRange, speedRange, palette } = spec;

  const corners = new Float32Array(count * 4 * 2);
  const origins = new Float32Array(count * 4 * 3);
  const params = new Float32Array(count * 4 * 4); // speed, size, phase, swayAmp
  const colors = new Float32Array(count * 4 * 3);
  const indices: number[] = [];

  const tmpColor = new THREE.Color('#ffffff');

  for (let i = 0; i < count; i++) {
    const ox = THREE.MathUtils.lerp(xRange[0], xRange[1], rand());
    const oy = THREE.MathUtils.lerp(yRange[0], yRange[1], rand());
    const oz = THREE.MathUtils.lerp(zRange[0], zRange[1], rand());

    const speed = THREE.MathUtils.lerp(speedRange[0], speedRange[1], rand());
    const size = THREE.MathUtils.lerp(sizeRange[0], sizeRange[1], rand());
    const phase = rand() * Math.PI * 2;
    const swayAmp = 0.25 + rand() * 0.75;

    if (palette && palette.length > 0) {
      tmpColor.set(palette[Math.floor(rand() * palette.length)]);
    } else {
      tmpColor.set('#ffffff');
    }

    const baseVertex = i * 4;
    const cornerCoords = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];

    for (let c = 0; c < 4; c++) {
      const vIdx = baseVertex + c;
      corners[vIdx * 2] = cornerCoords[c][0];
      corners[vIdx * 2 + 1] = cornerCoords[c][1];

      origins[vIdx * 3] = ox;
      origins[vIdx * 3 + 1] = oy;
      origins[vIdx * 3 + 2] = oz;

      params[vIdx * 4] = speed;
      params[vIdx * 4 + 1] = size;
      params[vIdx * 4 + 2] = phase;
      params[vIdx * 4 + 3] = swayAmp;

      colors[vIdx * 3] = tmpColor.r;
      colors[vIdx * 3 + 1] = tmpColor.g;
      colors[vIdx * 3 + 2] = tmpColor.b;
    }

    indices.push(
      baseVertex,
      baseVertex + 1,
      baseVertex + 2,
      baseVertex,
      baseVertex + 2,
      baseVertex + 3
    );
  }

  const geo = new THREE.BufferGeometry();
  // Use dummy position attribute for Three.js frustum culling / attribute binding
  geo.setAttribute('position', new THREE.BufferAttribute(origins, 3));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  geo.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
  geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

function buildRippleGeometry(
  spots: Array<{ x: number; y: number; z: number; size: number; phase: number }>
): THREE.BufferGeometry {
  const count = spots.length;
  const positions = new Float32Array(count * 4 * 3);
  const uvs = new Float32Array(count * 4 * 2);
  const phases = new Float32Array(count * 4);
  const indices: number[] = [];

  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  for (let i = 0; i < count; i++) {
    const s = spots[i];
    const base = i * 4;
    for (let c = 0; c < 4; c++) {
      const v = base + c;
      positions[v * 3] = s.x + corners[c][0] * s.size;
      positions[v * 3 + 1] = s.y;
      positions[v * 3 + 2] = s.z + corners[c][1] * s.size;

      uvs[v * 2] = corners[c][0];
      uvs[v * 2 + 1] = corners[c][1];
      phases[v] = s.phase;
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setIndex(indices);
  return geo;
}

interface SlantedRippleSpot {
  x: number;
  z: number;
  sizeAcross: number;
  sizeDown: number;
  phase: number;
}

function buildSlantedRoofRippleGeometry(spots: SlantedRippleSpot[]): THREE.BufferGeometry {
  const count = spots.length;
  const positions = new Float32Array(count * 4 * 3);
  const uvs = new Float32Array(count * 4 * 2);
  const phases = new Float32Array(count * 4);
  const indices: number[] = [];

  const { yEavesTop, yRidge, ridgeX, leftWallOuterX, rightPartyX, nbRidgeZ, nbFrontEavesZ } = ROOF_SPEC;
  const rise = yRidge - yEavesTop;
  const spanZ = nbFrontEavesZ - nbRidgeZ;

  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  const across = new THREE.Vector3();
  const down = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const s = spots[i];
    const y = getZolderRoofTopY(s.x, s.z);

    if (s.x < ridgeX) {
      const run = ridgeX - leftWallOuterX;
      across.set(0, 0, 1);
      down.set(-run, -rise, 0).normalize();
      normal.set(-rise, run, 0).normalize();
    } else {
      const uX = (s.x - ridgeX) / (rightPartyX - ridgeX);
      const uZ = Math.abs(s.z - nbRidgeZ) / spanZ;
      if (uZ >= uX) {
        const run = rightPartyX - ridgeX;
        across.set(0, 0, 1);
        down.set(run, -rise, 0).normalize();
        normal.set(rise, run, 0).normalize();
      } else {
        const zSign = s.z >= nbRidgeZ ? 1 : -1;
        across.set(1, 0, 0);
        down.set(0, -rise, zSign * spanZ).normalize();
        normal.set(0, spanZ, zSign * rise).normalize();
      }
    }

    const base = i * 4;
    for (let c = 0; c < 4; c++) {
      const v = base + c;
      const cx = corners[c][0] * s.sizeAcross;
      const cy = corners[c][1] * s.sizeDown;

      positions[v * 3] = s.x + across.x * cx + down.x * cy + normal.x * 0.015;
      positions[v * 3 + 1] = y + across.y * cx + down.y * cy + normal.y * 0.015;
      positions[v * 3 + 2] = s.z + across.z * cx + down.z * cy + normal.z * 0.015;

      uvs[v * 2] = corners[c][0];
      uvs[v * 2 + 1] = corners[c][1];
      phases[v] = s.phase;
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setIndex(indices);
  return geo;
}

/**
 * Peaceful, GPU-driven seasonal weather system tailored to the soft architectural diorama:
 * - Spring: drifting pastel blossom petals
 * - Summer: clean sunny day & warm pulsing fireflies in the evening
 * - Autumn: gentle multi-layered raindrops & expanding water splash ripples on patio/driveway/flat roofs
 * - Winter: unhurried, pillowy snowfall
 */
export class WeatherSystem {
  private weatherScene = new THREE.Scene();
  private sharedCamRight = new THREE.Vector3(1, 0, 0);
  private sharedCamUp = new THREE.Vector3(0, 1, 0);
  private sharedCamBack = new THREE.Vector3(0, 0, 1);

  private sharedUniforms: {
    uTime: { value: number };
    uNightFactor: { value: number };
    uCamRight: { value: THREE.Vector3 };
    uCamUp: { value: THREE.Vector3 };
    tSceneDepth: { value: THREE.Texture | null };
    uResolution: { value: THREE.Vector2 };
    uUseDepthTex: { value: number };
  };

  private rainMesh: THREE.Mesh;
  private snowMesh: THREE.Mesh;
  private petalsMesh: THREE.Mesh;
  private firefliesMesh: THREE.Mesh;
  private plotRipplesMesh: THREE.Mesh;
  private roofRipplesMesh: THREE.Mesh;
  private pitchedRoofRipplesMesh: THREE.Mesh;
  private firstGroupRef: THREE.Group;
  private roofGroupRef: THREE.Group;

  private rainAlphaUniform = { value: 0 };
  private snowAlphaUniform = { value: 0 };
  private petalAlphaUniform = { value: 0 };
  private fireflyAlphaUniform = { value: 0 };
  private rippleAlphaUniform = { value: 0 };

  constructor(houseGroups: HouseSceneGroups) {
    this.firstGroupRef = houseGroups.firstGroup;
    this.roofGroupRef = houseGroups.roofGroup;
    this.sharedUniforms = {
      uTime: { value: 0 },
      uNightFactor: { value: 0 },
      uCamRight: { value: this.sharedCamRight },
      uCamUp: { value: this.sharedCamUp },
      tSceneDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uUseDepthTex: { value: 1 },
    };

    // 1. Autumn Raindrops (calm, soft multi-density raindrops)
    this.rainMesh = this.createRainMesh();
    this.weatherScene.add(this.rainMesh);

    // 2. Winter Snowflakes (pillowy radial discs with slow sinusoidal drift)
    this.snowMesh = this.createSnowMesh();
    this.weatherScene.add(this.snowMesh);

    // 3. Spring Blossom Petals (delicate pastel pink & cream petals wafting on a breeze)
    this.petalsMesh = this.createPetalMesh({
      count: 42,
      seed: 101,
      xRange: [-4.8, 7.0],
      yRange: [0.5, 5.2],
      zRange: [-20.5, 5.0],
      sizeRange: [0.056, 0.092],
      speedRange: [0.95, 1.55],
      palette: ['#fce4ec', '#f8c8d8', '#fff5f8', '#f5d4df'],
    });
    this.weatherScene.add(this.petalsMesh);

    // 4. Summer Evening Fireflies (clean/plain in daytime)
    this.firefliesMesh = this.createFirefliesMesh();
    this.weatherScene.add(this.firefliesMesh);

    // 5. Calm Rain Ripples & Splashes on Plot Surfaces, Flat Roofs, and Slanted Main Roof
    const { plotRipples, roofRipples, pitchedRoofRipples } = this.createRainRippleMeshes();
    this.plotRipplesMesh = plotRipples;
    this.roofRipplesMesh = roofRipples;
    this.pitchedRoofRipplesMesh = pitchedRoofRipples;
    houseGroups.plotGroup.add(this.plotRipplesMesh);
    houseGroups.firstGroup.add(this.roofRipplesMesh);
    houseGroups.roofGroup.add(this.pitchedRoofRipplesMesh);
  }

  private createRainMesh(): THREE.Mesh {
    const geo = buildBillboardParticleGeometry({
      count: 185,
      seed: 404,
      xRange: [-4.8, 7.2],
      yRange: [0.0, 14.0],
      zRange: [-20.6, 5.1],
      sizeRange: [0.30, 0.54],
      speedRange: [4.8, 6.8],
    });

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        ...this.sharedUniforms,
        uAlpha: this.rainAlphaUniform,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aCorner;
        attribute vec3 aOrigin;
        attribute vec4 aParams; // speed, length, phase, swayAmp
        uniform float uTime;
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        varying vec2 vUv;
        varying float vHeightFade;

        void main() {
          float speed = aParams.x;
          float streakLen = aParams.y;
          float phase = aParams.z;

          float span = 14.0;
          float y = mod(aOrigin.y - uTime * speed + phase * 3.0, span);
          float fallDist = span - y;
          // Gentle calm breeze slant
          vec3 worldCenter = vec3(
            aOrigin.x + fallDist * 0.065,
            y,
            aOrigin.z + fallDist * 0.03
          );

          vec3 rainDir = normalize(vec3(0.065, -1.0, 0.03));
          vec2 rawDir = vec2(dot(rainDir, uCamRight), dot(rainDir, uCamUp));
          vec2 screenDir = length(rawDir) > 0.001 ? normalize(rawDir) : vec2(0.0, -1.0);
          // Positive-determinant perpendicular so quad keeps CCW front-facing winding
          vec2 screenPerp = vec2(screenDir.y, -screenDir.x);

          float halfW = 0.017;
          float halfL = streakLen * 0.5;
          vec3 offset = uCamRight * (screenPerp.x * aCorner.x * halfW + screenDir.x * aCorner.y * halfL)
                      + uCamUp    * (screenPerp.y * aCorner.x * halfW + screenDir.y * aCorner.y * halfL);

          vUv = aCorner * 0.5 + 0.5;
          vHeightFade = smoothstep(0.05, 0.80, y) * smoothstep(14.0, 11.8, y);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(worldCenter + offset, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${SHARED_DEPTH_CHUNK}
        uniform float uAlpha;
        uniform float uNightFactor;
        varying vec2 vUv;
        varying float vHeightFade;

        void main() {
          if (isOccludedByScene()) discard;
          // Teardrop-tapered raindrop: soft fine tail at vUv.y=0, fuller bead near vUv.y=0.85
          float widthScale = mix(0.28, 1.0, smoothstep(0.0, 0.85, vUv.y));
          float xNorm = abs(vUv.x * 2.0 - 1.0) / widthScale;
          if (xNorm > 1.0) discard;

          float across = smoothstep(1.0, 0.15, xNorm);
          float along = smoothstep(0.0, 0.78, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
          float shape = across * along;
          float alpha = uAlpha * vHeightFade * shape * 0.38;
          if (alpha < 0.004) discard;

          vec3 colDay = vec3(0.92, 0.96, 1.0);
          vec3 colNight = vec3(0.72, 0.82, 0.96);
          vec3 col = mix(colDay, colNight, uNightFactor);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private createSnowMesh(): THREE.Mesh {
    const geo = buildBillboardParticleGeometry({
      count: 240,
      seed: 505,
      xRange: [-4.8, 7.2],
      yRange: [0.0, 14.0],
      zRange: [-20.6, 5.1],
      sizeRange: [0.042, 0.098],
      speedRange: [0.68, 1.15],
    });

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      uniforms: {
        ...this.sharedUniforms,
        uAlpha: this.snowAlphaUniform,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aCorner;
        attribute vec3 aOrigin;
        attribute vec4 aParams; // speed, radius, phase, swayAmp
        uniform float uTime;
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        varying vec2 vCorner;
        varying float vFade;

        void main() {
          float speed = aParams.x;
          float radius = aParams.y;
          float phase = aParams.z;
          float swayAmp = aParams.w;

          float span = 14.0;
          float y = mod(aOrigin.y - uTime * speed + phase * 4.0, span);

          float swayX = sin(uTime * 0.65 + phase) * 0.32 * swayAmp
                      + sin(uTime * 0.28 + phase * 1.7) * 0.20;
          float swayZ = cos(uTime * 0.55 + phase * 1.3) * 0.28 * swayAmp;

          vec3 worldCenter = vec3(aOrigin.x + swayX, y, aOrigin.z + swayZ);
          vec3 offset = (uCamRight * aCorner.x + uCamUp * aCorner.y) * radius;

          vCorner = aCorner;
          vFade = smoothstep(0.08, 0.90, y) * smoothstep(14.0, 11.6, y);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(worldCenter + offset, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${SHARED_DEPTH_CHUNK}
        uniform float uAlpha;
        uniform float uNightFactor;
        varying vec2 vCorner;
        varying float vFade;

        void main() {
          if (isOccludedByScene()) discard;
          float r2 = dot(vCorner, vCorner);
          if (r2 > 1.0) discard;

          float soft = exp(-r2 * 4.2) * (1.0 - r2);
          float alpha = uAlpha * vFade * soft * 0.88;
          if (alpha < 0.003) discard;

          vec3 colDay = vec3(0.99, 0.995, 1.0);
          vec3 colNight = vec3(0.84, 0.90, 1.0);
          vec3 col = mix(colDay, colNight, uNightFactor);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private createPetalMesh(spec: QuadFieldSpec): THREE.Mesh {
    const geo = buildBillboardParticleGeometry(spec);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      uniforms: {
        ...this.sharedUniforms,
        uAlpha: this.petalAlphaUniform,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aCorner;
        attribute vec3 aOrigin;
        attribute vec4 aParams; // speed, size, phase, swayAmp
        attribute vec3 aColor;
        uniform float uTime;
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        varying vec2 vCorner;
        varying vec3 vColor;
        varying float vFade;

        void main() {
          float breezeSpeed = aParams.x;
          float size = aParams.y;
          float phase = aParams.z;
          float swayAmp = aParams.w;

          // Waft predominantly horizontally along a gentle spring breeze (X & Z),
          // while floating up and down on light thermal eddies instead of dropping straight down.
          float xSpan = 11.8;
          float zSpan = 25.5;
          float ySpan = 4.9;

          float wx = mod((aOrigin.x + 4.8) + uTime * breezeSpeed + sin(uTime * 0.55 + phase) * 0.65 * swayAmp, xSpan) - 4.8;
          float wz = mod((aOrigin.z + 20.5) + uTime * (breezeSpeed * 0.38) + cos(uTime * 0.62 + phase * 1.3) * 0.90 * swayAmp, zSpan) - 20.5;

          // Gentle slow settle + buoyant lift/dip wave
          float baseY = mod((aOrigin.y - 0.35) - uTime * (0.12 + swayAmp * 0.08) + phase * 2.0, ySpan) + 0.35;
          float liftWave = sin(uTime * 0.95 + phase * 1.7) * 0.42 * swayAmp
                         + cos(uTime * 0.48 + phase * 2.3) * 0.25;
          float wy = clamp(baseY + liftWave, 0.22, 5.8);

          vec3 worldCenter = vec3(wx, wy, wz);

          // Gentle flutter & tilt along the breeze
          float angle = uTime * (1.4 + swayAmp * 1.0) + phase * 2.0 + sin(uTime * 1.1 + phase) * 0.5;
          float flutter = 0.48 + 0.52 * cos(uTime * 2.6 + phase * 3.0);
          float ca = cos(angle);
          float sa = sin(angle);

          vec2 local = vec2(aCorner.x, aCorner.y * flutter);
          vec2 rotated = vec2(local.x * ca - local.y * sa, local.x * sa + local.y * ca);

          vec3 offset = (uCamRight * rotated.x + uCamUp * rotated.y) * size;

          vCorner = aCorner;
          vColor = aColor;

          // Smooth fade along all entry/exit boundaries so petals waft in & out seamlessly
          float fadeX = smoothstep(-4.8, -3.5, wx) * smoothstep(7.0, 5.7, wx);
          float fadeZ = smoothstep(-20.5, -18.5, wz) * smoothstep(5.0, 3.2, wz);
          float fadeY = smoothstep(0.22, 0.75, wy) * smoothstep(5.8, 4.7, wy);
          vFade = fadeX * fadeZ * fadeY;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(worldCenter + offset, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${SHARED_DEPTH_CHUNK}
        uniform float uAlpha;
        uniform float uNightFactor;
        varying vec2 vCorner;
        varying vec3 vColor;
        varying float vFade;

        void main() {
          if (isOccludedByScene()) discard;
          // Distinct elongated blossom petal silhouette
          float dist = length(vec2(vCorner.x * 1.45, vCorner.y * 0.82));
          if (dist > 1.0) discard;

          float edge = smoothstep(1.0, 0.62, dist);
          float alpha = uAlpha * vFade * edge * 0.92;
          if (alpha < 0.003) discard;

          vec3 col = mix(vColor, vColor * 0.48, uNightFactor);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private createFirefliesMesh(): THREE.Mesh {
    const rand = createDeterministicRng(707);
    const count = 28;

    const corners = new Float32Array(count * 4 * 2);
    const origins = new Float32Array(count * 4 * 3);
    const params = new Float32Array(count * 4 * 4);
    const indices: number[] = [];

    const cornerCoords = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];

    for (let i = 0; i < count; i++) {
      // Half in back garden around trees/borders, half in front flower border/bolbomen
      const inBack = i < 18;
      const ox = inBack
        ? THREE.MathUtils.lerp(-3.8, 5.2, rand())
        : THREE.MathUtils.lerp(-1.2, 5.4, rand());
      const oz = inBack
        ? THREE.MathUtils.lerp(-19.8, -13.3, rand())
        : THREE.MathUtils.lerp(0.6, 4.4, rand());
      const oy = THREE.MathUtils.lerp(0.45, 2.55, rand());

      const pulseFreq = 0.75 + rand() * 0.9;
      const radius = 0.075 + rand() * 0.055;
      const phase = rand() * Math.PI * 2;
      const driftAmp = 0.30 + rand() * 0.45;

      const base = i * 4;
      for (let c = 0; c < 4; c++) {
        const v = base + c;
        corners[v * 2] = cornerCoords[c][0];
        corners[v * 2 + 1] = cornerCoords[c][1];
        origins[v * 3] = ox;
        origins[v * 3 + 1] = oy;
        origins[v * 3 + 2] = oz;
        params[v * 4] = pulseFreq;
        params[v * 4 + 1] = radius;
        params[v * 4 + 2] = phase;
        params[v * 4 + 3] = driftAmp;
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(origins, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
    geo.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
    geo.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
    geo.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      uniforms: {
        ...this.sharedUniforms,
        uAlpha: this.fireflyAlphaUniform,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aCorner;
        attribute vec3 aOrigin;
        attribute vec4 aParams; // pulseFreq, radius, phase, driftAmp
        uniform float uTime;
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        varying vec2 vCorner;
        varying float vPulse;

        void main() {
          float freq = aParams.x;
          float radius = aParams.y;
          float phase = aParams.z;
          float amp = aParams.w;

          vec3 center = aOrigin + vec3(
            sin(uTime * 0.48 + phase) * amp,
            sin(uTime * 0.72 + phase * 1.6) * (amp * 0.42),
            cos(uTime * 0.41 + phase * 1.3) * amp
          );
          vec3 offset = (uCamRight * aCorner.x + uCamUp * aCorner.y) * radius;

          vCorner = aCorner;
          vPulse = pow(0.5 + 0.5 * sin(uTime * freq + phase * 2.0), 2.4);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(center + offset, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${SHARED_DEPTH_CHUNK}
        uniform float uAlpha;
        uniform float uNightFactor;
        varying vec2 vCorner;
        varying float vPulse;

        void main() {
          if (isOccludedByScene()) discard;
          float r2 = dot(vCorner, vCorner);
          if (r2 > 1.0) discard;

          float core = exp(-r2 * 14.0);
          float halo = exp(-r2 * 3.6) * 0.55;
          float glow = core + halo;

          // Plain summer daytime; cozy glowing fireflies only in Summer Evening
          float modeIntensity = smoothstep(0.35, 0.85, uNightFactor);
          float alpha = uAlpha * modeIntensity * (0.25 + 0.75 * vPulse) * glow;
          if (alpha < 0.003) discard;

          vec3 dayCol = vec3(1.0, 0.96, 0.76);
          vec3 nightCol = mix(vec3(1.0, 0.85, 0.44), vec3(1.0, 0.97, 0.78), core);
          vec3 col = mix(dayCol, nightCol, uNightFactor);
          gl_FragColor = vec4(col, min(1.0, alpha));
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  private createRainRippleMeshes(): {
    plotRipples: THREE.Mesh;
    roofRipples: THREE.Mesh;
    pitchedRoofRipples: THREE.Mesh;
  } {
    const rand = createDeterministicRng(808);
    const plotSpots: Array<{ x: number; y: number; z: number; size: number; phase: number }> = [];
    const roofSpots: Array<{ x: number; y: number; z: number; size: number; phase: number }> = [];
    const pitchedSpots: SlantedRippleSpot[] = [];

    // Patio limestone spots (X: 0.2..5.5, Z: -16.1..-13.0, Y: 0.044)
    for (let i = 0; i < 12; i++) {
      plotSpots.push({
        x: THREE.MathUtils.lerp(0.3, 5.5, rand()),
        y: 0.044,
        z: THREE.MathUtils.lerp(-16.1, -13.1, rand()),
        size: 0.20 + rand() * 0.12,
        phase: rand(),
      });
    }
    // Driveway pavers & front path (X: -4.2..-0.3, Z: -7.2..4.6, Y: 0.036)
    for (let i = 0; i < 10; i++) {
      plotSpots.push({
        x: THREE.MathUtils.lerp(-4.1, -0.35, rand()),
        y: 0.036,
        z: THREE.MathUtils.lerp(-7.0, 4.5, rand()),
        size: 0.18 + rand() * 0.11,
        phase: rand(),
      });
    }
    // Flat roofs: Berging (-3.0..-0.2, Z: -13.4..-8.0) & B11a extension (0.2..5.5, Z: -12.6..-10.7) at Y = 2.916
    for (let i = 0; i < 5; i++) {
      roofSpots.push({
        x: THREE.MathUtils.lerp(-3.0, -0.2, rand()),
        y: 2.916,
        z: THREE.MathUtils.lerp(-13.4, -8.1, rand()),
        size: 0.20 + rand() * 0.12,
        phase: rand(),
      });
    }
    for (let i = 0; i < 4; i++) {
      roofSpots.push({
        x: THREE.MathUtils.lerp(0.3, 5.5, rand()),
        y: 2.916,
        z: THREE.MathUtils.lerp(-12.5, -10.7, rand()),
        size: 0.20 + rand() * 0.12,
        phase: rand(),
      });
    }

    // Slanted main roof splashes (elliptical, elongated downhill along the roof tiles)
    // Left slope (avoiding Velux skylight X: 0.6..1.5, Z: -8.8..-7.5 and vent pipe X: 0.6..1.2, Z: -4.7..-4.0)
    const leftSlopeCoords: Array<[number, number]> = [
      [1.85, -1.35],
      [0.85, -2.55],
      [2.30, -3.70],
      [1.75, -5.85],
      [0.60, -6.55],
      [2.20, -9.25],
    ];
    for (const [x, z] of leftSlopeCoords) {
      pitchedSpots.push({
        x,
        z,
        sizeAcross: 0.15 + rand() * 0.06,
        sizeDown: 0.24 + rand() * 0.08,
        phase: rand(),
      });
    }
    // Right Dwarskap & Langskap wings
    const rightSlopeCoords: Array<[number, number]> = [
      [3.60, -1.20],
      [4.55, -2.10],
      [5.10, -3.55],
      [4.75, -7.25],
      [3.80, -8.90],
      [5.20, -9.20],
    ];
    for (const [x, z] of rightSlopeCoords) {
      pitchedSpots.push({
        x,
        z,
        sizeAcross: 0.15 + rand() * 0.06,
        sizeDown: 0.24 + rand() * 0.08,
        phase: rand(),
      });
    }

    const createRippleMat = (isSlanted: boolean) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: this.sharedUniforms.uTime,
          uAlpha: this.rippleAlphaUniform,
          uNightFactor: this.sharedUniforms.uNightFactor,
          uIsSlanted: { value: isSlanted ? 1.0 : 0.0 },
        },
        vertexShader: /* glsl */ `
          attribute float aPhase;
          varying vec2 vUv;
          varying float vPhase;
          void main() {
            vUv = uv;
            vPhase = aPhase;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uAlpha;
          uniform float uNightFactor;
          uniform float uIsSlanted;
          varying vec2 vUv;
          varying float vPhase;

          void main() {
            float life = fract(uTime * 0.44 + vPhase);
            float alpha = 0.0;
            if (uIsSlanted > 0.5) {
              // Slanted roof splash: uphill top rim stays pinned at impact point (vUv.y = 0, never moves uphill),
              // while the splash fans downward and widens on the bottom (downhill, vUv.y > 0) side.
              float R = 0.07 + life * 0.52;
              float cy = R * 0.4545;
              float dy = vUv.y - cy;
              float yNorm = dy < 0.0 ? dy * 2.2 : dy * 0.88;
              float widthScale = mix(0.54, 1.32, smoothstep(0.0, 0.85, vUv.y));
              float xNorm = vUv.x / widthScale;
              float r = length(vec2(xNorm, yNorm));
              float ring = exp(-pow((r - R) / 0.065, 2.0));
              float splash = exp(-dot(vec2(xNorm, vUv.y * 1.4), vec2(xNorm, vUv.y * 1.4)) * 30.0) * (1.0 - smoothstep(0.0, 0.24, life));
              float env = smoothstep(0.0, 0.16, life) * (1.0 - smoothstep(0.45, 1.0, life));
              float topClip = smoothstep(-0.12, 0.02, vUv.y);
              alpha = uAlpha * topClip * (ring * env * 0.24 + splash * 0.28);
            } else {
              float r = length(vUv);
              float targetR = 0.08 + life * 0.78;
              float ring = exp(-pow((r - targetR) / 0.075, 2.0));
              float splash = exp(-dot(vUv, vUv) * 34.0) * (1.0 - smoothstep(0.0, 0.24, life));
              float env = smoothstep(0.0, 0.16, life) * (1.0 - smoothstep(0.45, 1.0, life));
              alpha = uAlpha * (ring * env * 0.22 + splash * 0.28);
            }
            if (alpha < 0.003) discard;

            vec3 col = mix(vec3(0.92, 0.96, 0.99), vec3(0.68, 0.78, 0.90), uNightFactor);
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });

    const plotRipples = new THREE.Mesh(buildRippleGeometry(plotSpots), createRippleMat(false));
    plotRipples.userData.skipEdgeBlurDepth = true;
    plotRipples.renderOrder = 2;

    const roofRipples = new THREE.Mesh(buildRippleGeometry(roofSpots), createRippleMat(false));
    roofRipples.userData.skipEdgeBlurDepth = true;
    roofRipples.renderOrder = 2;

    const pitchedRoofRipples = new THREE.Mesh(
      buildSlantedRoofRippleGeometry(pitchedSpots),
      createRippleMat(true)
    );
    pitchedRoofRipples.userData.skipEdgeBlurDepth = true;
    pitchedRoofRipples.renderOrder = 2;

    return { plotRipples, roofRipples, pitchedRoofRipples };
  }

  /**
   * Returns true when any seasonal particle or rain-ripple effect is visibly animating.
   */
  hasActiveWeather(seasonWeights: SeasonWeights, nightFactor: number): boolean {
    return (
      seasonWeights.autumn > 0.003 ||
      seasonWeights.winter > 0.003 ||
      seasonWeights.spring > 0.003 ||
      (seasonWeights.summer > 0.003 && nightFactor > 0.32)
    );
  }

  /**
   * Update seasonal weather animation state and render airborne particles cleanly over the diorama.
   */
  updateAndRender(
    renderer: THREE.WebGLRenderer,
    camera: THREE.OrthographicCamera,
    edgeBlur: EdgeBlurPass,
    nowSec: number,
    seasonWeights: SeasonWeights,
    nightFactor: number,
    scrollProgress: number
  ) {
    camera.updateMatrixWorld();
    camera.matrixWorld.extractBasis(this.sharedCamRight, this.sharedCamUp, this.sharedCamBack);

    this.sharedUniforms.uTime.value = nowSec;
    this.sharedUniforms.uNightFactor.value = nightFactor;
    this.sharedUniforms.uUseDepthTex.value = edgeBlur.enabled ? 1.0 : 0.0;
    if (edgeBlur.enabled) {
      this.sharedUniforms.tSceneDepth.value = edgeBlur.getSceneDepthTexture();
      this.sharedUniforms.uResolution.value.copy(edgeBlur.getDrawingSize());
    }

    const rainW = seasonWeights.autumn;
    const snowW = seasonWeights.winter;
    const springW = seasonWeights.spring;
    const summerW = seasonWeights.summer;

    this.rainAlphaUniform.value = rainW;
    this.rippleAlphaUniform.value = rainW;
    this.snowAlphaUniform.value = snowW;
    this.petalAlphaUniform.value = springW;
    this.fireflyAlphaUniform.value = summerW;

    this.rainMesh.visible = rainW > 0.003;
    this.plotRipplesMesh.visible = rainW > 0.003;
    this.roofRipplesMesh.visible =
      rainW > 0.003 &&
      this.firstGroupRef.visible &&
      Math.abs(this.firstGroupRef.position.y) < 0.08 &&
      scrollProgress > 0.40;
    this.pitchedRoofRipplesMesh.visible =
      rainW > 0.003 &&
      this.roofGroupRef.visible &&
      Math.abs(this.roofGroupRef.position.y) < 0.08 &&
      scrollProgress > 0.90;
    this.snowMesh.visible = snowW > 0.003;
    this.petalsMesh.visible = springW > 0.003;
    this.firefliesMesh.visible = summerW > 0.003 && nightFactor > 0.32;

    const depthTestMode = !edgeBlur.enabled;
    for (const mesh of [
      this.rainMesh,
      this.snowMesh,
      this.petalsMesh,
      this.firefliesMesh,
    ]) {
      const mat = mesh.material as THREE.ShaderMaterial;
      if (mat.depthTest !== depthTestMode) {
        mat.depthTest = depthTestMode;
      }
    }

    const anyAirborneVisible =
      this.rainMesh.visible ||
      this.snowMesh.visible ||
      this.petalsMesh.visible ||
      this.firefliesMesh.visible;

    if (!anyAirborneVisible) return;

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(this.weatherScene, camera);
    renderer.autoClear = prevAutoClear;
  }
}
