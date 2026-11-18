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

  constructor(private canvas: HTMLCanvasElement, private camera: THREE.Camera) {
    this.ctx = canvas.getContext('2d')!;
    this.low.width = 112;
    this.low.height = 64;
    this.lowCtx = this.low.getContext('2d')!;
    this.lowImg = this.lowCtx.createImageData(112, 64);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) {
      const y = rnd() * 2 - 1;
      const phi = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      this.stars.push(new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi)));
      this.starSize.push(0.6 + rnd() * 1.6);
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

    // 2. Stars (only visible where the sky is dark)
    for (let i = 0; i < this.stars.length; i++) {
      rot(this.stars[i], this.v);
      const D = dayness(this.v);
      const a = THREE.MathUtils.smoothstep(-D, 0.15, 0.5);
      if (a <= 0.01) continue;
      const pt = project(this.v);
      if (!pt) continue;
      this.ctx.globalAlpha = a * (0.55 + 0.45 * ((i * 37) % 10) / 10);
      this.ctx.fillStyle = '#fff';
      this.ctx.beginPath();
      this.ctx.arc(pt[0], pt[1], this.starSize[i], 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1;

    // 3. Sun and Moon (moon is exactly opposite the sun on the celestial sphere)
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
