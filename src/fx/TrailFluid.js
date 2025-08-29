import * as THREE from "three";

export class TrailFluid {
  constructor(
    renderer,
    {
      size = 512,
      decay = 0.975, // 0..1 (closer to 1 = longer trail)
      diffusion = 0.15, // 0..1 (how strongly to blur/Laplacian)
      flowScale = 0.0035, // UV offset scale
      flowFrequency = 3.0, // flow field frequency
    } = {}
  ) {
    this.renderer = renderer;
    this.size = size;

    const opts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.rtA = new THREE.WebGLRenderTarget(size, size, opts);
    this.rtB = new THREE.WebGLRenderTarget(size, size, opts);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: this.rtA.texture },
        uTime: { value: 0 },
        uDt: { value: 1 / 60 },
        uDecay: { value: decay },
        uDiffusion: { value: diffusion },
        uFlowScale: { value: flowScale },
        uFlowFreq: { value: flowFrequency },
        uSplatUv: { value: new THREE.Vector2(-10, -10) },
        uSplatRadius: { value: 0.04 },
        uSplatStrength: { value: 0.9 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uPrev;
        uniform float uTime, uDt;
        uniform float uDecay, uDiffusion;
        uniform float uFlowScale, uFlowFreq;
        uniform vec2 uSplatUv;
        uniform float uSplatRadius, uSplatStrength;
        varying vec2 vUv;

        // Simple smooth flow field (watercolor-like swirl)
        vec2 flow(vec2 uv, float t){
          float a = sin((uv.y + t*0.05)*uFlowFreq) * 1.3;
          float b = cos((uv.x - t*0.06)*uFlowFreq) * 1.1;
          return vec2(a, b) * uFlowScale;
        }

        void main(){
          vec2 texel = 1.0 / vec2(textureSize(uPrev, 0));

          // Semi-Lagrangian advection (sample from where the dye came from)
          vec2 vel = flow(vUv, uTime);
          float center = texture2D(uPrev, vUv - vel * uDt).r;

          // Diffusion via a tiny Laplacian (watercolor bleed)
          float n = texture2D(uPrev, vUv + vec2(0.0,  texel.y)).r;
          float s = texture2D(uPrev, vUv + vec2(0.0, -texel.y)).r;
          float e = texture2D(uPrev, vUv + vec2( texel.x, 0.0)).r;
          float w = texture2D(uPrev, vUv + vec2(-texel.x, 0.0)).r;
          float lap = (n + s + e + w - 4.0*center);

          float advected = center + uDiffusion * lap;

          // Decay
          float trail = max(advected, 0.0) * uDecay;

          // Soft Gaussian-ish splat
          float splat = 0.0;
          if (uSplatUv.x > -1.0) {
            float d = distance(vUv, uSplatUv);
            float sigma = uSplatRadius * 0.6;
            float g = exp(- (d*d) / (2.0*sigma*sigma));
            splat = g * uSplatStrength;
          }

          trail = clamp(trail + splat, 0.0, 1.0);
          gl_FragColor = vec4(trail, trail, trail, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);

    this._swap = false;
    this.texture = this.rtA.texture; // initial
    this._queuedSplat = null;
    this._time = 0;
  }

  setParams({ decay, diffusion, flowScale, flowFrequency }) {
    if (decay !== undefined) this.material.uniforms.uDecay.value = decay;
    if (diffusion !== undefined)
      this.material.uniforms.uDiffusion.value = diffusion;
    if (flowScale !== undefined)
      this.material.uniforms.uFlowScale.value = flowScale;
    if (flowFrequency !== undefined)
      this.material.uniforms.uFlowFreq.value = flowFrequency;
  }

  splat(uv, strength = 0.9, radius = 0.04) {
    this._queuedSplat = { uv, strength, radius };
  }

  update(dt) {
    this._time += dt;
    const src = this._swap ? this.rtB : this.rtA;
    const dst = this._swap ? this.rtA : this.rtB;
    this._swap = !this._swap;

    // advance uniforms
    this.material.uniforms.uPrev.value = src.texture;
    this.material.uniforms.uTime.value = this._time;
    this.material.uniforms.uDt.value = dt;

    if (this._queuedSplat) {
      this.material.uniforms.uSplatUv.value.copy(this._queuedSplat.uv);
      this.material.uniforms.uSplatRadius.value = this._queuedSplat.radius;
      this.material.uniforms.uSplatStrength.value = this._queuedSplat.strength;
      this._queuedSplat = null;
    } else {
      this.material.uniforms.uSplatUv.value.set(-10, -10);
    }

    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.texture = dst.texture;
  }

  dispose() {
    this.rtA.dispose();
    this.rtB.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
