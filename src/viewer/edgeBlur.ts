import * as THREE from 'three';

/**
 * Screen-space edge diffusion overlay (no 3D asset is modified).
 * The scene is rendered into an off-screen target (colour + depth). A full-screen pass then
 * reconstructs each pixel's world position from the depth buffer, measures how far it lies
 * outside the owned plot (XZ trapezoid) and, over the 4 m beyond the plot,
 * blurs it progressively and fades it into the transparent background (sky).
 */

const PLOT = {
  rearZ: -20.63,
  frontZ: 5.0,
  rightX: 5.87,
  rearLeftX: -4.28,
  frontLeftX: -5.0,
};

export const EDGE_BLUR_START = 0.0; // metres beyond the plot where blur starts
export const EDGE_BLUR_FULL = 4.0; // metres beyond the plot where blur is at its maximum
export const EDGE_FADE_START = 0.0; // metres beyond the plot where the fade-out begins

export class EdgeBlurPass {
  public enabled = true;
  private target: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new THREE.Vector2();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(4, 4);
    this.target.depthTexture.type = THREE.UnsignedIntType;

    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        uCamWorld: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uMaxBlurPx: { value: 14 },
        uPlot: { value: new THREE.Vector4(PLOT.rearZ, PLOT.frontZ, PLOT.rightX, 0) },
        uPlotLeft: { value: new THREE.Vector2(PLOT.rearLeftX, PLOT.frontLeftX) },
        uRanges: { value: new THREE.Vector3(EDGE_BLUR_START, EDGE_BLUR_FULL, EDGE_FADE_START) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform mat4 uCamWorld;
        uniform mat4 uProjInv;
        uniform vec2 uTexel;
        uniform float uMaxBlurPx;
        uniform vec4 uPlot;       // rearZ, frontZ, rightX
        uniform vec2 uPlotLeft;   // rearLeftX, frontLeftX
        uniform vec3 uRanges;     // blurStart, blurFull, fadeStart
        varying vec2 vUv;

        float outsideDistance(vec2 p) {
          float tZ = clamp((p.y - uPlot.x) / (uPlot.y - uPlot.x), 0.0, 1.0);
          float leftX = mix(uPlotLeft.x, uPlotLeft.y, tZ);
          vec2 dMin = vec2(leftX - p.x, uPlot.x - p.y);
          vec2 dMax = vec2(p.x - uPlot.z, p.y - uPlot.y);
          vec2 d = max(max(dMin, dMax), vec2(0.0));
          return length(d);
        }

        void main() {
          vec4 base = texture2D(tColor, vUv);
          float depth = texture2D(tDepth, vUv).x;

          float dist = 0.0;
          if (depth < 0.99999) {
            vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 view = uProjInv * ndc;
            view /= view.w;
            vec3 world = (uCamWorld * view).xyz;
            dist = outsideDistance(world.xz);
          }

          float blurAmt = smoothstep(uRanges.x, uRanges.y, dist);
          float fade = 1.0 - smoothstep(uRanges.z, uRanges.y, dist);

          vec4 acc = vec4(0.0);
          float wsum = 0.0;
          const int TAPS = 28;
          float radius = blurAmt * uMaxBlurPx;
          if (radius > 0.25) {
            for (int i = 0; i < TAPS; i++) {
              float fi = float(i) + 0.5;
              float r = sqrt(fi / float(TAPS));
              float a = fi * 2.399963;
              vec2 off = vec2(cos(a), sin(a)) * r * radius * uTexel;
              vec4 s = texture2D(tColor, vUv + off);
              acc.rgb += s.rgb;
              acc.a += s.a;
              wsum += 1.0;
            }
            acc /= wsum;
            // colour is premultiplied by alpha in the target -> keep it premultiplied
          } else {
            acc = base;
          }

          vec3 straight = acc.a > 0.0001 ? acc.rgb / acc.a : acc.rgb;
          float alpha = acc.a * fade;
          gl_FragColor = vec4(straight, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
        }
      `,
    });
    this.material.toneMapped = true;

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  render(scene: THREE.Scene, camera: THREE.OrthographicCamera) {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) {
      this.target.setSize(this.size.x, this.size.y);
      this.material.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
      this.material.uniforms.uMaxBlurPx.value = Math.max(6, this.size.y * 0.016);
    }
    camera.updateMatrixWorld();
    this.material.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    this.material.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);

    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}
