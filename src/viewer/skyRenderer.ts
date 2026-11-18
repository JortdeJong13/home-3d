import * as THREE from 'three';

/**
 * Physically-placed sky: the sun, moon and stars live at fixed directions on a celestial sphere
 * that rotates (day -> evening) 180 degrees about a horizontal axis. They are projected through the
 * actual camera yaw, so orbiting the house moves the sky accurately (the moon goes behind the camera
 * when you look away from it). The gradient is evaluated per direction, so the day/evening
 * boundary sweeps across the sky during the rotation.
 */

const TAN_V = Math.tan(THREE.MathUtils.degToRad(25)); // 50 deg vertical sky FOV
const SUN_ELEV = THREE.MathUtils.degToRad(24);
const SUN_AZ_OFFSET = THREE.MathUtils.degToRad(34); // sun starts left of the default view direction
const DAY_BIAS = 0.7;

const STOPS: Array<[number, THREE.Color]> = [
  [0.45, new THREE.Color('#bcdbe8')],
  [0.3, new THREE.Color('#e9f1ee')],
  [0.15, new THREE.Color('#f0c9a4')],
  [0.02, new THREE.Color('#d98f78')],
  [-0.12, new THREE.Color('#6a5a8e')],
  [-0.3, new THREE.Color('#2a3a6e')],
  [-0.5, new THREE.Color('#26356a')],
];

function skyColor(D: number, out: THREE.Color) {
  if (D >= STOPS[0][0]) return out.copy(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    if (D >= STOPS[i][0]) {
      const [d0, c0] = STOPS[i - 1];
      const [d1, c1] = STOPS[i];
      return out.lerpColors(c1, c0, (D - d1) / (d0 - d1));
    }
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}

interface CloudPuff {
  dx: number;
  dy: number;
  r: number;
  isBase?: boolean;
}

interface CloudDef {
  baseAzimuth: number;
  elevation: number;
  driftSpeed: number;
  scale: number;
  puffs: CloudPuff[];
}

const CLOUD_DEFS: CloudDef[] = [
  {
    baseAzimuth: 0.35,
    elevation: 0.38,
    driftSpeed: 0.0006,
    scale: 1.15,
    puffs: [
      { dx: 0, dy: -0.012, r: 0.040, isBase: true },
      { dx: -0.032, dy: 0.005, r: 0.028 },
      { dx: -0.005, dy: 0.020, r: 0.036 },
      { dx: 0.032, dy: 0.008, r: 0.026 },
      { dx: 0.012, dy: 0.026, r: 0.022 },
    ],
  },
  {
    baseAzimuth: 1.30,
    elevation: 0.32,
    driftSpeed: 0.0005,
    scale: 0.95,
    puffs: [
      { dx: -0.028, dy: -0.008, r: 0.032, isBase: true },
      { dx: 0.026, dy: -0.008, r: 0.030, isBase: true },
      { dx: -0.006, dy: 0.014, r: 0.032 },
      { dx: 0.022, dy: 0.008, r: 0.024 },
    ],
  },
  {
    baseAzimuth: 2.35,
    elevation: 0.44,
    driftSpeed: 0.0007,
    scale: 1.05,
    puffs: [
      { dx: 0, dy: -0.008, r: 0.034, isBase: true },
      { dx: -0.020, dy: 0.010, r: 0.025 },
      { dx: 0.014, dy: 0.016, r: 0.030 },
    ],
  },
  {
    baseAzimuth: 3.30,
    elevation: 0.35,
    driftSpeed: 0.00055,
    scale: 0.90,
    puffs: [
      { dx: 0, dy: -0.006, r: 0.028, isBase: true },
      { dx: -0.016, dy: 0.006, r: 0.020 },
      { dx: 0.010, dy: 0.012, r: 0.024 },
    ],
  },
  {
    baseAzimuth: 4.35,
    elevation: 0.42,
    driftSpeed: 0.00065,
    scale: 1.10,
    puffs: [
      { dx: -0.026, dy: -0.008, r: 0.030, isBase: true },
      { dx: 0.024, dy: -0.008, r: 0.028, isBase: true },
      { dx: -0.004, dy: 0.016, r: 0.034 },
      { dx: 0.022, dy: 0.008, r: 0.024 },
      { dx: 0.008, dy: 0.024, r: 0.020 },
    ],
  },
  {
    baseAzimuth: 5.35,
    elevation: 0.34,
    driftSpeed: 0.0005,
    scale: 1.00,
    puffs: [
      { dx: 0, dy: -0.008, r: 0.034, isBase: true },
      { dx: -0.020, dy: 0.010, r: 0.025 },
      { dx: 0.014, dy: 0.016, r: 0.030 },
    ],
  },
];

export class SkyRenderer {
  private ctx: CanvasRenderingContext2D;
  private low = document.createElement('canvas');
  private lowCtx: CanvasRenderingContext2D;
  private lowImg: ImageData;
  private stars: THREE.Vector3[] = [];
  private starSize: number[] = [];
  private H: THREE.Vector3 | null = null; // horizontal direction towards the sun
  private readonly Y = new THREE.Vector3(0, 1, 0);
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  private v_cloud = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, private camera: THREE.Camera) {
    this.ctx = canvas.getContext('2d')!;
    this.low.width = 112;
    this.low.height = 64;
    this.lowCtx = this.low.getContext('2d')!;
    this.lowImg = this.lowCtx.createImageData(112, 64);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 850; i++) {
      // Night zenith is initially along -Y (which rotates to +Y at night t=1).
      // Bias elevation towards the top of the night dome (higher density near the zenith).
      const u = rnd();
      const elev = 0.05 + 0.95 * Math.sqrt(u); // elev in [0.05, 1.0], denser towards 1.0
      const phi = rnd() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - elev * elev));
      // In initial unrotated frame, night zenith is -Y, so y = -elev
      this.stars.push(new THREE.Vector3(r * Math.cos(phi), -elev, r * Math.sin(phi)));
      this.starSize.push(0.5 + rnd() * 1.5);
    }
  }

  private basis() {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    const elevDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-f.y, -1, 1)));
    const fh = new THREE.Vector3(f.x, 0, f.z).normalize();
    const r = new THREE.Vector3(-fh.z, 0, fh.x);
    return { fh, r, elevDeg };
  }

  update(t: number) {
    const W = (this.canvas.width = window.innerWidth);
    const Hh = (this.canvas.height = window.innerHeight);
    const { fh, r, elevDeg } = this.basis();
    if (!this.H) {
      // First call = default camera: put the sun to the left of the initial view direction
      this.H = fh.clone().multiplyScalar(Math.cos(SUN_AZ_OFFSET)).addScaledVector(r, -Math.sin(SUN_AZ_OFFSET)).normalize();
    }
    const H = this.H;
    const aspect = W / Hh;
    const tanH = TAN_V * aspect;
    const p = THREE.MathUtils.degToRad(14 - 0.3 * elevDeg); // sky camera pitch (up)
    const fs = fh.clone().multiplyScalar(Math.cos(p)).addScaledVector(this.Y, Math.sin(p));
    const us = fh.clone().multiplyScalar(-Math.sin(p)).addScaledVector(this.Y, Math.cos(p));

    const theta = t * Math.PI;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const A = new THREE.Vector3().crossVectors(this.Y, H);
    const Urot = this.Y.clone().multiplyScalar(cosT).addScaledVector(H, sinT);
    const rot = (src: THREE.Vector3, out: THREE.Vector3) => {
      const dot = A.dot(src);
      const cr = new THREE.Vector3().crossVectors(A, src);
      return out.copy(src).multiplyScalar(cosT).addScaledVector(cr, sinT).addScaledVector(A, dot * (1 - cosT));
    };
    const dayness = (d: THREE.Vector3) => d.dot(Urot) + DAY_BIAS * cosT;

    // 1. Gradient (low-res, upscaled with smoothing)
    const lw = this.low.width;
    const lh = this.low.height;
    const d = new THREE.Vector3();
    for (let j = 0; j < lh; j++) {
      const ny = 1 - ((j + 0.5) / lh) * 2;
      for (let i = 0; i < lw; i++) {
        const nx = ((i + 0.5) / lw) * 2 - 1;
        d.copy(fs).addScaledVector(r, nx * tanH).addScaledVector(us, ny * TAN_V).normalize();
        skyColor(dayness(d), this.c);
        const k = (j * lw + i) * 4;
        this.lowImg.data[k] = this.c.r * 255;
        this.lowImg.data[k + 1] = this.c.g * 255;
        this.lowImg.data[k + 2] = this.c.b * 255;
        this.lowImg.data[k + 3] = 255;
      }
    }
    this.lowCtx.putImageData(this.lowImg, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(this.low, 0, 0, W, Hh);

    const project = (dir: THREE.Vector3): [number, number] | null => {
      const z = dir.dot(fs);
      if (z < 0.05) return null;
      const x = dir.dot(r) / (z * tanH);
      const y = dir.dot(us) / (z * TAN_V);
      if (Math.abs(x) > 1.3 || Math.abs(y) > 1.3) return null;
      return [(x * 0.5 + 0.5) * W, (0.5 - y * 0.5) * Hh];
    };

    // 2. Daytime Clouds (soft stylized diorama puffs, drifting slowly, fading at dusk/night)
    const cloudDayFactor = 1 - THREE.MathUtils.smoothstep(t, 0.48, 0.76);
    if (cloudDayFactor > 0.005) {
      const nowSec = performance.now() * 0.001;
      const sunsetFactor = Math.sin(t * Math.PI); // peaks at golden hour (t = 0.5)

      // Interpolate puff color tones between crisp daylight white and warm sunset peach/mauve
      const hlR = Math.round(THREE.MathUtils.lerp(255, 255, sunsetFactor));
      const hlG = Math.round(THREE.MathUtils.lerp(255, 242, sunsetFactor));
      const hlB = Math.round(THREE.MathUtils.lerp(255, 222, sunsetFactor));

      const bodyR = Math.round(THREE.MathUtils.lerp(242, 255, sunsetFactor));
      const bodyG = Math.round(THREE.MathUtils.lerp(248, 208, sunsetFactor));
      const bodyB = Math.round(THREE.MathUtils.lerp(254, 180, sunsetFactor));

      const baseR = Math.round(THREE.MathUtils.lerp(218, 212, sunsetFactor));
      const baseG = Math.round(THREE.MathUtils.lerp(232, 162, sunsetFactor));
      const baseB = Math.round(THREE.MathUtils.lerp(244, 182, sunsetFactor));

      const pxPerRadY = (0.5 * Hh) / TAN_V;
      const pxPerRadX = (0.5 * W) / tanH;

      for (const cloud of CLOUD_DEFS) {
        // Slow celestial drift across the sky
        const az = cloud.baseAzimuth + cloud.driftSpeed * nowSec;
        const cosEl = Math.cos(cloud.elevation);
        const sinEl = Math.sin(cloud.elevation);
        const S_cloud = new THREE.Vector3(cosEl * Math.cos(az), sinEl, cosEl * Math.sin(az));

        rot(S_cloud, this.v_cloud);

        // Horizon fade: smoothly dissolve if dipped near the physical horizon
        const horizonFade = THREE.MathUtils.smoothstep(this.v_cloud.y, 0.04, 0.20);
        if (horizonFade <= 0.01) continue;

        const pt = project(this.v_cloud);
        if (!pt) continue;

        const [cx, cy] = pt;

        // Screen vertical fade: keep clouds in the upper sky above the house,
        // ensuring zero clouds near the bottom or below the house.
        const normY = cy / Hh;
        const screenFade = 1 - THREE.MathUtils.smoothstep(normY, 0.32, 0.54);
        if (screenFade <= 0.01) continue;

        const totalAlpha = cloudDayFactor * horizonFade * screenFade;
        if (totalAlpha <= 0.01) continue;

        this.ctx.globalAlpha = totalAlpha;

        // Render each puff within this cloud formation
        for (const puff of cloud.puffs) {
          const px = cx + puff.dx * cloud.scale * pxPerRadX;
          const py = cy - puff.dy * cloud.scale * pxPerRadY;
          const pr = puff.r * cloud.scale * pxPerRadY;
          if (pr <= 2) continue;

          if (puff.isBase) {
            // Soft shaded underside base of the cloud
            const g = this.ctx.createRadialGradient(px, py + pr * 0.15, 0, px, py, pr);
            g.addColorStop(0, `rgba(${bodyR}, ${bodyG}, ${bodyB}, 0.72)`);
            g.addColorStop(0.65, `rgba(${baseR}, ${baseG}, ${baseB}, 0.52)`);
            g.addColorStop(1, `rgba(${baseR}, ${baseG}, ${baseB}, 0)`);
            this.ctx.fillStyle = g;
          } else {
            // Upper pillowy billow with soft sunny highlight
            const hx = px - pr * 0.22;
            const hy = py - pr * 0.26;
            const g = this.ctx.createRadialGradient(hx, hy, pr * 0.08, px, py, pr);
            g.addColorStop(0, `rgba(${hlR}, ${hlG}, ${hlB}, 0.88)`);
            g.addColorStop(0.52, `rgba(${bodyR}, ${bodyG}, ${bodyB}, 0.74)`);
            g.addColorStop(0.82, `rgba(${baseR}, ${baseG}, ${baseB}, 0.32)`);
            g.addColorStop(1, `rgba(${baseR}, ${baseG}, ${baseB}, 0)`);
            this.ctx.fillStyle = g;
          }

          this.ctx.beginPath();
          this.ctx.arc(px, py, pr, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
      this.ctx.globalAlpha = 1;
    }

    // 3. Stars (only visible where the sky is dark, in the upper sky above the house)
    for (let i = 0; i < this.stars.length; i++) {
      rot(this.stars[i], this.v);
      const D = dayness(this.v);
      const a = THREE.MathUtils.smoothstep(-D, 0.15, 0.5);
      if (a <= 0.01) continue;

      // Horizon fade: smoothly vanish as stars approach the astronomical horizon
      const horizonFade = THREE.MathUtils.smoothstep(this.v.y, 0.02, 0.18);
      if (horizonFade <= 0.01) continue;

      const pt = project(this.v);
      if (!pt) continue;

      // Screen vertical fade: keep stars concentrated in the upper sky above the house,
      // softly fading as they approach the ground plane, and ensuring zero stars near the bottom / below the house.
      const normY = pt[1] / Hh;
      const screenFade = 1 - THREE.MathUtils.smoothstep(normY, 0.35, 0.58);
      if (screenFade <= 0.01) continue;

      this.ctx.globalAlpha = a * horizonFade * screenFade * (0.55 + 0.45 * ((i * 37) % 10) / 10);
      this.ctx.fillStyle = '#fff';
      this.ctx.beginPath();
      this.ctx.arc(pt[0], pt[1], this.starSize[i], 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;

    // 4. Sun and Moon (moon is exactly opposite the sun on the celestial sphere)
    const S0 = H.clone().multiplyScalar(Math.cos(SUN_ELEV)).addScaledVector(this.Y, Math.sin(SUN_ELEV));
    const sun = rot(S0, new THREE.Vector3());
    const moon = rot(S0.clone().negate(), new THREE.Vector3());
    const body = (dir: THREE.Vector3, size: number, inner: string, mid: string, glow: string) => {
      const pt = project(dir);
      if (!pt) return;
      const g = this.ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], size * 2.6);
      g.addColorStop(0, inner);
      g.addColorStop(0.2, mid);
      g.addColorStop(0.38, glow);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.arc(pt[0], pt[1], size * 2.6, 0, Math.PI * 2);
      this.ctx.fill();
    };
    body(sun, 44, '#fffdf5', '#ffe6a3', 'rgba(255,226,150,0.35)');
    body(moon, 32, '#fefce8', '#f3f0d0', 'rgba(186,214,255,0.3)');
  }
}
