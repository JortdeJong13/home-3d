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
  private depthTarget: THREE.WebGLRenderTarget;
  private depthOnlyMat: THREE.MeshBasicMaterial;
  private material: THREE.ShaderMaterial;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private size = new THREE.Vector2();
  private cachedScene: THREE.Scene | null = null;
  private cachedSkipDepthObjects: THREE.Object3D[] = [];
  private hiddenHitboxes: THREE.Object3D[] = [];

  constructor(private renderer: THREE.WebGLRenderer) {
    const isTouchDevice =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || /iPad|iPhone|Android/i.test(navigator.userAgent));
    const blurTaps = isTouchDevice ? 14 : 28;

    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      samples: 2,
      depthBuffer: true,
    });
    this.target.depthTexture = new THREE.DepthTexture(4, 4);
    this.target.depthTexture.type = THREE.UnsignedIntType;

    // Non-MSAA depth-only target that captures ALL visible geometry (including semi-transparent
    // tree canopies & window glass) so elevated transparent objects against the sky retain
    // their true 3D depth instead of falling back to the Y = -0.15 plinth plane.
    this.depthTarget = new THREE.WebGLRenderTarget(4, 4, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.depthTarget.depthTexture = new THREE.DepthTexture(4, 4);
    this.depthTarget.depthTexture.type = THREE.UnsignedIntType;

    this.depthOnlyMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
    });

    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tFullDepth: { value: this.depthTarget.depthTexture },
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
        uniform sampler2D tFullDepth;
        uniform mat4 uCamWorld;
        uniform mat4 uProjInv;
        uniform vec2 uTexel;
        uniform float uMaxBlurPx;
        uniform vec4 uPlot;       // rearZ, frontZ, rightX
        uniform vec2 uPlotLeft;   // rearLeftX, frontLeftX
        uniform vec3 uRanges;     // blurStart, blurFull, fadeStart
        varying vec2 vUv;

        float outsideDistance(vec2 p, float rightEdgeX) {
          float tZ = clamp((p.y - uPlot.x) / (uPlot.y - uPlot.x), 0.0, 1.0);
          float leftX = mix(uPlotLeft.x, uPlotLeft.y, tZ);
          vec2 dMin = vec2(leftX - p.x, uPlot.x - p.y);
          vec2 dMax = vec2(p.x - rightEdgeX, p.y - uPlot.y);
          vec2 d = max(max(dMin, dMax), vec2(0.0));
          return length(d);
        }

        float sampleMinDepth(vec2 uv) {
          return min(texture2D(tDepth, uv).x, texture2D(tFullDepth, uv).x);
        }

        void main() {
          vec4 base = texture2D(tColor, vUv);
          if (base.a <= 0.0001) {
            gl_FragColor = vec4(0.0);
            return;
          }

          float depth = sampleMinDepth(vUv);
          if (depth >= 0.99999) {
            // Preserve MSAA silhouette fringes (e.g. tree canopies against sky) by checking
            // 1-px cardinal neighbors before falling back to the ground plinth projection.
            depth = min(
              min(sampleMinDepth(vUv + vec2(uTexel.x, 0.0)), sampleMinDepth(vUv - vec2(uTexel.x, 0.0))),
              min(sampleMinDepth(vUv + vec2(0.0, uTexel.y)), sampleMinDepth(vUv - vec2(0.0, uTexel.y)))
            );
          }

          float blurDist = 0.0;
          float fadeDist = 0.0;
          if (depth < 0.99999) {
            vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec4 view = uProjInv * ndc;
            view /= view.w;
            vec3 world = (uCamWorld * view).xyz;
            blurDist = outsideDistance(world.xz, uPlot.z);
            // Keep ground fade unchanged (0% at X=9.87m), but extend above-ground building fade
            // by +2.0m so the white section-cut wall at X=10.05m stays softly visible instead of invisible.
            float buildingMask = smoothstep(0.02, 0.35, world.y);
            fadeDist = outsideDistance(world.xz, uPlot.z + buildingMask * 2.0);
          } else {
            // Silhouette edge where MSAA resolved depth to clear depth (1.0).
            // Reconstruct the world ray and find where it hits the ground plinth level (Y = -0.15).
            vec4 ndc0 = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
            vec4 v0 = uProjInv * ndc0;
            vec3 rayOrigin = (uCamWorld * vec4(v0.xyz, 1.0)).xyz;
            vec3 rayDir = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
            float tG = abs(rayDir.y) > 0.0001 ? (-0.15 - rayOrigin.y) / rayDir.y : 0.0;
            vec3 hitPos = rayOrigin + rayDir * tG;
            blurDist = outsideDistance(hitPos.xz, uPlot.z);
            fadeDist = blurDist;
          }

          float blurAmt = smoothstep(uRanges.x, uRanges.y, blurDist);
          float fade = 1.0 - smoothstep(uRanges.z, uRanges.y, fadeDist);
          if (fade <= 0.0001) {
            gl_FragColor = vec4(0.0);
            return;
          }

          vec4 acc = vec4(0.0);
          float wsum = 0.0;
          const int TAPS = ${blurTaps};
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

  getSceneDepthTexture(): THREE.Texture {
    return this.depthTarget.depthTexture!;
  }

  getDrawingSize(): THREE.Vector2 {
    return this.size;
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
      this.depthTarget.setSize(Math.max(2, Math.floor(this.size.x * 0.5)), Math.max(2, Math.floor(this.size.y * 0.5)));
      this.material.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
      this.material.uniforms.uMaxBlurPx.value = Math.max(6, this.size.y * 0.016);
    }
    camera.updateMatrixWorld();
    this.material.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    this.material.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);

    // 1. Render full colour + MSAA opaque depth
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);

    // 2. Render Z-only pass for all visible geometry (including transparent trees & glass)
    if (this.cachedScene !== scene) {
      this.cachedScene = scene;
      this.cachedSkipDepthObjects.length = 0;
      scene.traverse((obj) => {
        if (obj.userData?.skipEdgeBlurDepth) {
          this.cachedSkipDepthObjects.push(obj);
          return;
        }
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material;
          const isInvisible = Array.isArray(mat)
            ? mat.every((m) => m.transparent && m.opacity <= 0.001)
            : Boolean(mat && mat.transparent && mat.opacity <= 0.001);
          if (isInvisible) {
            this.cachedSkipDepthObjects.push(obj);
          }
        }
      });
    }

    this.hiddenHitboxes.length = 0;
    for (let i = 0; i < this.cachedSkipDepthObjects.length; i++) {
      const obj = this.cachedSkipDepthObjects[i];
      if (obj.visible) {
        obj.visible = false;
        this.hiddenHitboxes.push(obj);
      }
    }

    const prevOverride = scene.overrideMaterial;
    const prevShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    const prevShadowNeedsUpdate = this.renderer.shadowMap.needsUpdate;
    scene.overrideMaterial = this.depthOnlyMat;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = false;
    try {
      this.renderer.setRenderTarget(this.depthTarget);
      this.renderer.clear();
      this.renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = prevOverride;
      this.renderer.shadowMap.autoUpdate = prevShadowAutoUpdate;
      this.renderer.shadowMap.needsUpdate = prevShadowNeedsUpdate;
      for (let i = 0; i < this.hiddenHitboxes.length; i++) {
        this.hiddenHitboxes[i].visible = true;
      }
      this.hiddenHitboxes.length = 0;
    }

    // 3. Composite with plot-edge blur & fade
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.quadScene, this.quadCamera);
  }
}
