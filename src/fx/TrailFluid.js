// src/fx/TrailFluid.js
import * as THREE from "three";

/**
 * TrailFluid — dye + timestamp fields (ping-pong), progressive tail fade.
 * Pass .texture (ink) to your lake fragment as uTrailMap.
 */
export class TrailFluid {
  constructor(
    renderer,
    {
      size = 512,
      decay = 0.975, // multiplicative fade of dye
      diffusion = 0.15, // Laplacian strength on dye
      stampDiffusion = 0.02, // slight blur so stamp isn't too blocky
      flowScale = 0.0035,
      flowFrequency = 3.0,
      fadeWindow = 1.25, // seconds; width of the tail "front"
      splatRadius = 0.04,
      splatStrength = 0.9,
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

    // Ink (dye) ping-pong
    this.inkA = new THREE.WebGLRenderTarget(size, size, opts);
    this.inkB = new THREE.WebGLRenderTarget(size, size, opts);

    // Stamp (timestamp) ping-pong
    this.stampA = new THREE.WebGLRenderTarget(size, size, opts);
    this.stampB = new THREE.WebGLRenderTarget(size, size, opts);

    this._swapInk = false;
    this._swapStamp = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Fullscreen quad
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    // --- Common flow function in both shaders
    const flowGLSL = `
      vec2 flow(vec2 uv, float t, float freq, float scale){
        float a = sin((uv.y + t*0.05)*freq) * 1.3;
        float b = cos((uv.x - t*0.06)*freq) * 1.1;
        return vec2(a, b) * scale;
      }
    `;

    // STAMP material (advect timestamps; write now inside splats)
    this.matStamp = new THREE.ShaderMaterial({
      uniforms: {
        uPrevStamp: { value: this.stampA.texture },
        uTime: { value: 0 },
        uDt: { value: 1 / 60 },
        uFlowScale: { value: flowScale },
        uFlowFreq: { value: flowFrequency },
        uStampDiff: { value: stampDiffusion },
        uSplatUv: { value: new THREE.Vector2(-10, -10) },
        uSplatRadius: { value: splatRadius },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uPrevStamp;
        uniform float uTime, uDt, uFlowScale, uFlowFreq, uStampDiff;
        uniform vec2 uSplatUv;
        uniform float uSplatRadius;
        varying vec2 vUv;
        ${flowGLSL}
        void main(){
          vec2 texel = 1.0 / vec2(textureSize(uPrevStamp, 0));
          // Advect timestamp
          vec2 vel = flow(vUv, uTime, uFlowFreq, uFlowScale);
          float stamp = texture2D(uPrevStamp, vUv - vel * uDt).r;

          // Small diffusion so stamp edges soften
          float n = texture2D(uPrevStamp, vUv + vec2(0.0,  texel.y)).r;
          float s = texture2D(uPrevStamp, vUv + vec2(0.0, -texel.y)).r;
          float e = texture2D(uPrevStamp, vUv + vec2( texel.x, 0.0)).r;
          float w = texture2D(uPrevStamp, vUv + vec2(-texel.x, 0.0)).r;
          float lap = (n + s + e + w - 4.0*stamp);
          stamp += uStampDiff * lap;

          // Splat: write current time inside the radius (hard write to "now")
          float d = distance(vUv, uSplatUv);
          float mask = step(d, uSplatRadius);
          // If mask>0, set to current time; else keep advected value
          stamp = mix(stamp, uTime, mask);

          gl_FragColor = vec4(stamp, 0.0, 0.0, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    // INK material (advect dye; progressive erase vs stamp; add splat)
    this.matInk = new THREE.ShaderMaterial({
      uniforms: {
        uPrevInk: { value: this.inkA.texture },
        uStamp: { value: this.stampA.texture }, // latest stamp field
        uTime: { value: 0 },
        uDt: { value: 1 / 60 },
        uDecay: { value: decay },
        uDiffusion: { value: diffusion },
        uFlowScale: { value: flowScale },
        uFlowFreq: { value: flowFrequency },
        uFadeWindow: { value: fadeWindow },
        uSplatUv: { value: new THREE.Vector2(-10, -10) },
        uSplatRadius: { value: splatRadius },
        uSplatStrength: { value: splatStrength },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uPrevInk;
        uniform sampler2D uStamp;
        uniform float uTime, uDt, uDecay, uDiffusion, uFlowScale, uFlowFreq, uFadeWindow;
        uniform vec2 uSplatUv;
        uniform float uSplatRadius, uSplatStrength;
        varying vec2 vUv;
        ${flowGLSL}
        void main(){
          vec2 texel = 1.0 / vec2(textureSize(uPrevInk, 0));

          // Advect ink
          vec2 vel = flow(vUv, uTime, uFlowFreq, uFlowScale);
          float ink = texture2D(uPrevInk, vUv - vel * uDt).r;

          // Diffusion (watercolor bleed)
          float n = texture2D(uPrevInk, vUv + vec2(0.0,  texel.y)).r;
          float s = texture2D(uPrevInk, vUv + vec2(0.0, -texel.y)).r;
          float e = texture2D(uPrevInk, vUv + vec2( texel.x, 0.0)).r;
          float w = texture2D(uPrevInk, vUv + vec2(-texel.x, 0.0)).r;
          float lap = (n + s + e + w - 4.0*ink);
          ink += uDiffusion * lap;

          // Baseline decay
          ink *= uDecay;

          // Progressive tail erase based on stamp age:
          // keep where stamp in [now - window, now]
          float stamp = texture2D(uStamp, vUv).r;
          float surv = smoothstep(uTime - uFadeWindow, uTime, stamp);
          ink *= surv;

          // Splat fresh dye
          float d = distance(vUv, uSplatUv);
          float sigma = uSplatRadius * 0.6;
          float g = exp(-(d*d) / (2.0*sigma*sigma));
          ink = clamp(ink + g * uSplatStrength, 0.0, 1.0);

          gl_FragColor = vec4(ink, ink, ink, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });

    this.quad = new THREE.Mesh(quadGeo, this.matInk);
    this.scene.add(this.quad);

    this._queuedSplat = null;
    this._time = 0;

    // public knobs
    this.params = {
      decay,
      diffusion,
      stampDiffusion,
      flowScale,
      flowFrequency,
      fadeWindow,
      splatRadius,
      splatStrength,
    };

    // Expose ink texture
    this.texture = this.inkA.texture;
  }

  setParams({
    decay,
    diffusion,
    stampDiffusion,
    flowScale,
    flowFrequency,
    fadeWindow,
    splatRadius,
    splatStrength,
  } = {}) {
    if (decay !== undefined) this.matInk.uniforms.uDecay.value = decay;
    if (diffusion !== undefined)
      this.matInk.uniforms.uDiffusion.value = diffusion;
    if (stampDiffusion !== undefined)
      this.matStamp.uniforms.uStampDiff.value = stampDiffusion;
    if (flowScale !== undefined) {
      this.matInk.uniforms.uFlowScale.value = flowScale;
      this.matStamp.uniforms.uFlowScale.value = flowScale;
    }
    if (flowFrequency !== undefined) {
      this.matInk.uniforms.uFlowFreq.value = flowFrequency;
      this.matStamp.uniforms.uFlowFreq.value = flowFrequency;
    }
    if (fadeWindow !== undefined)
      this.matInk.uniforms.uFadeWindow.value = fadeWindow;
    if (splatRadius !== undefined) {
      this.matInk.uniforms.uSplatRadius.value = splatRadius;
      this.matStamp.uniforms.uSplatRadius.value = splatRadius;
    }
    if (splatStrength !== undefined)
      this.matInk.uniforms.uSplatStrength.value = splatStrength;
    Object.assign(this.params, {
      decay,
      diffusion,
      stampDiffusion,
      flowScale,
      flowFrequency,
      fadeWindow,
      splatRadius,
      splatStrength,
    });
  }

  splat(
    uv,
    strength = this.params.splatStrength,
    radius = this.params.splatRadius
  ) {
    this._queuedSplat = { uv, strength, radius };
  }

  update(dt) {
    this._time += dt;

    // --- PASS 1: STAMP (timestamps)
    const srcStamp = this._swapStamp ? this.stampB : this.stampA;
    const dstStamp = this._swapStamp ? this.stampA : this.stampB;
    this._swapStamp = !this._swapStamp;

    this.matStamp.uniforms.uPrevStamp.value = srcStamp.texture;
    this.matStamp.uniforms.uTime.value = this._time;
    this.matStamp.uniforms.uDt.value = dt;

    if (this._queuedSplat) {
      this.matStamp.uniforms.uSplatUv.value.copy(this._queuedSplat.uv);
      this.matStamp.uniforms.uSplatRadius.value = this._queuedSplat.radius;
    } else {
      this.matStamp.uniforms.uSplatUv.value.set(-10, -10);
    }

    this.quad.material = this.matStamp;
    this.renderer.setRenderTarget(dstStamp);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    // --- PASS 2: INK (dye)
    const srcInk = this._swapInk ? this.inkB : this.inkA;
    const dstInk = this._swapInk ? this.inkA : this.inkB;
    this._swapInk = !this._swapInk;

    this.matInk.uniforms.uPrevInk.value = srcInk.texture;
    this.matInk.uniforms.uStamp.value = dstStamp.texture; // use latest stamp
    this.matInk.uniforms.uTime.value = this._time;
    this.matInk.uniforms.uDt.value = dt;

    if (this._queuedSplat) {
      this.matInk.uniforms.uSplatUv.value.copy(this._queuedSplat.uv);
      this.matInk.uniforms.uSplatRadius.value = this._queuedSplat.radius;
      this.matInk.uniforms.uSplatStrength.value = this._queuedSplat.strength;
      this._queuedSplat = null; // consume once for both passes this frame
    } else {
      this.matInk.uniforms.uSplatUv.value.set(-10, -10);
    }

    this.quad.material = this.matInk;
    this.renderer.setRenderTarget(dstInk);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    this.texture = dstInk.texture;
  }

  dispose() {
    this.inkA.dispose();
    this.inkB.dispose();
    this.stampA.dispose();
    this.stampB.dispose();
    this.quad.geometry.dispose();
    this.matInk.dispose();
    this.matStamp.dispose();
  }
}
