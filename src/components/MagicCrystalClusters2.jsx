// src/components/MagicCrystalClusters2.jsx
import React, { forwardRef, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useControls, folder } from "leva";
import { useThree, useFrame } from "@react-three/fiber";

const CRYSTAL2_GLB = "/models/magicPlantsAndCrystal/CrystalCluster2.glb";
const COUNT = 15;

// ---- 15 baked placements (rotY in degrees; rounded to sensible precision) ----
const BAKED = [
  { px: -2.32, py: -4.66, pz: -1.52, ry: 77.4, s: 0.077 },
  { px: -2.48, py: -4.71, pz: -1.97, ry: 30.7, s: 0.041 },
  { px: -2.23, py: -4.8, pz: -1.69, ry: 0.0, s: 0.068 },
  { px: -2.52, py: -4.62, pz: -2.22, ry: -88.3, s: 0.07 },
  { px: -0.98, py: -4.31, pz: -3.0, ry: -3.4, s: 0.079 },
  { px: -0.99, py: -4.28, pz: -0.19, ry: -16.8, s: 0.128 },
  { px: -1.03, py: -4.54, pz: -2.33, ry: 118.2, s: 0.05 },
  { px: -2.51, py: -4.26, pz: -3.5, ry: 54.6, s: 0.097 },
  { px: -2.54, py: -4.24, pz: -3.39, ry: -180.0, s: 0.077 },
  { px: -2.84, py: -4.59, pz: -2.98, ry: -53.8, s: 0.047 },
  { px: -2.56, py: -4.59, pz: -2.98, ry: -53.8, s: 0.047 },
  { px: -1.02, py: -4.42, pz: -3.14, ry: 11.7, s: 0.072 },
  { px: -2.04, py: -4.47, pz: -3.47, ry: 180.0, s: 0.067 },
  { px: -2.0, py: -4.48, pz: -3.49, ry: 86.6, s: 0.052 },
  { px: -2.45, py: -4.7, pz: -2.28, ry: 134.6, s: 0.052 },
];

export default forwardRef(function MagicCrystalClusters2(props, ref) {
  const { scene } = useGLTF(CRYSTAL2_GLB);
  const instancedRef = useRef();

  // ===== Instance transforms (prefixed + unique group) =====
  const instanceSchema = useMemo(() => {
    const schema = {};
    for (let i = 0; i < COUNT; i++) {
      const d = BAKED[i] ?? { px: -2, py: -4, pz: -2, ry: 0, s: 0.5 };
      const label = `B / Instance ${String(i + 1).padStart(2, "0")}`;
      schema[label] = folder(
        {
          [`B_pX_${i}`]: {
            value: d.px,
            min: -20,
            max: 20,
            step: 0.001,
            label: "x",
          },
          [`B_pY_${i}`]: {
            value: d.py,
            min: -20,
            max: 20,
            step: 0.001,
            label: "y",
          },
          [`B_pZ_${i}`]: {
            value: d.pz,
            min: -20,
            max: 20,
            step: 0.001,
            label: "z",
          },
          [`B_rY_${i}`]: {
            value: d.ry,
            min: -180,
            max: 180,
            step: 0.1,
            label: "rotY°",
          },
          [`B_s_${i}`]: {
            value: d.s,
            min: 0.01,
            max: 5,
            step: 0.001,
            label: "scale",
          },
        },
        { collapsed: true }
      );
    }
    return schema;
  }, []);
  const ctl = useControls("Crystal B / Instances", instanceSchema, {
    collapsed: false,
  });

  // ===== 2-Color Gradient & Glass controls (prefixed for B) =====
  const {
    B_colorA,
    B_colorB,
    B_mid,
    B_softness,
    B_bottomSatBoost,
    B_bottomEmissiveBoost,
    B_bottomFresnelBoost,
    B_bottomFresnelPower,
  } = useControls("Crystal B / Gradient", {
    B_colorA: { value: "#20c4ff", label: "Bottom Color (A)" },
    B_colorB: { value: "#9600c4", label: "Top Color (B)" },
    B_mid: {
      value: 0.39,
      min: 0.0,
      max: 1.0,
      step: 0.001,
      label: "Blend Midpoint",
    },
    B_softness: {
      value: 0.5,
      min: 0.0,
      max: 0.5,
      step: 0.001,
      label: "Blend Softness",
    },
    B_bottomSatBoost: {
      value: 0.56,
      min: 0.0,
      max: 1.5,
      step: 0.01,
      label: "Bottom Saturation +",
    },
    B_bottomEmissiveBoost: {
      value: 2.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Bottom Glow +",
    },
    B_bottomFresnelBoost: {
      value: 3.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      label: "Bottom Fresnel +",
    },
    B_bottomFresnelPower: {
      value: 1.8,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      label: "Bottom Fresnel Falloff",
    },
  });

  const {
    B_ior,
    B_thickness,
    B_attenuationDistance,
    B_roughness,
    B_emissiveIntensity,
  } = useControls("Crystal B / Glass", {
    B_ior: { value: 1.0, min: 1.0, max: 2.333, step: 0.001 },
    B_thickness: { value: 4.68, min: 0, max: 10, step: 0.01 },
    B_attenuationDistance: { value: 57.5, min: 0.1, max: 200, step: 0.1 },
    B_roughness: { value: 0.61, min: 0, max: 1, step: 0.001 },
    B_emissiveIntensity: { value: 0.3, min: 0, max: 8, step: 0.01 },
  });

  // ===== Hover Glow controls (B-prefixed) =====
  const {
    B_hoverEnabled,
    B_hoverOuterMult,
    B_hoverFalloffExp,
    B_hoverEase,
    B_hoverMinGlow,
    B_hoverMaxGlow,
  } = useControls("Crystal B / Hover Glow", {
    B_hoverEnabled: { value: true, label: "Enabled" },
    B_hoverOuterMult: {
      value: 4.0,
      min: 0.5,
      max: 4.0,
      step: 0.05,
      label: "Outer Radius ×",
    },
    B_hoverFalloffExp: {
      value: 0.5,
      min: 0.5,
      max: 6.0,
      step: 0.1,
      label: "Falloff Exp",
    },
    B_hoverEase: {
      value: 12.0,
      min: 1.0,
      max: 30.0,
      step: 0.5,
      label: "Ease (1/s)",
    },
    B_hoverMinGlow: {
      value: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: "Min Extra Glow",
    },
    B_hoverMaxGlow: {
      value: 2.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Max Extra Glow",
    },
  });

  // ===== Geometry (rotate to Y-up, cache bbox/sphere)
  const { geometry, baseRadius } = useMemo(() => {
    if (!scene) return { geometry: null, baseRadius: 1 };
    let g = null;
    scene.traverse((n) => {
      if (!g && n.isMesh && n.geometry) g = n.geometry.clone();
    });
    if (!g) return { geometry: null, baseRadius: 1 };

    if (g.index) g = g.toNonIndexed();
    const fix = new THREE.Matrix4().makeRotationX(+Math.PI / 2);
    g.applyMatrix4(fix);
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { geometry: g, baseRadius: g.boundingSphere?.radius || 1 };
  }, [scene]);

  // ===== Independent material for Crystal B (+ hover uniforms)
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      transmission: 1.0,
      thickness: B_thickness,
      ior: B_ior,
      roughness: B_roughness,
      metalness: 0.0,
      iridescence: 0.6,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 600],
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      specularIntensity: 1.0,
      color: new THREE.Color("#ffffff"), // base white; tinted in shader
      attenuationColor: new THREE.Color("#ffffff"),
      attenuationDistance: B_attenuationDistance,
      transparent: false,
      opacity: 1.0,
      toneMapped: true,
      flatShading: true,
      side: THREE.FrontSide,
      emissive: new THREE.Color("#000000"),
      emissiveIntensity: B_emissiveIntensity,
    });

    m.onBeforeCompile = (shader) => {
      shader.uniforms.uObjMinY = { value: 0.0 };
      shader.uniforms.uObjMaxY = { value: 1.0 };

      shader.uniforms.uB_ColorA = { value: new THREE.Color(B_colorA) };
      shader.uniforms.uB_ColorB = { value: new THREE.Color(B_colorB) };
      shader.uniforms.uB_Mid = { value: B_mid };
      shader.uniforms.uB_Soft = { value: B_softness };
      shader.uniforms.uB_BottomSatBoost = { value: B_bottomSatBoost };
      shader.uniforms.uB_BottomEmissiveBoost = { value: B_bottomEmissiveBoost };
      shader.uniforms.uB_BottomFresnelBoost = { value: B_bottomFresnelBoost };
      shader.uniforms.uB_BottomFresnelPower = { value: B_bottomFresnelPower };
      shader.uniforms.uB_EmissiveIntensity = { value: B_emissiveIntensity };

      // Hover range
      shader.uniforms.uB_HoverMin = { value: B_hoverMinGlow };
      shader.uniforms.uB_HoverMax = { value: B_hoverMaxGlow };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uObjMinY, uObjMaxY;
        attribute float aHover;
        varying float vH;
        varying float vHover;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vec3 pos = transformed;

        #ifdef USE_INSTANCING
          mat4 MI = modelMatrix * instanceMatrix;
          vec4 wp = MI * vec4(pos, 1.0);
          float ty = MI[3].y;
          float sy = length(vec3(MI[1].x, MI[1].y, MI[1].z));
          float yMin = ty + sy * uObjMinY;
          float yMax = ty + sy * uObjMaxY;
        #else
          mat4 MI = modelMatrix;
          vec4 wp = MI * vec4(pos, 1.0);
          float ty = MI[3].y;
          float sy = length(vec3(MI[1].x, MI[1].y, MI[1].z));
          float yMin = ty + sy * uObjMinY;
          float yMax = ty + sy * uObjMaxY;
        #endif

        vH = clamp((wp.y - yMin) / max(1e-5, (yMax - yMin)), 0.0, 1.0);
        vHover = aHover;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform vec3  uB_ColorA;
        uniform vec3  uB_ColorB;
        uniform float uB_Mid, uB_Soft;
        uniform float uB_BottomSatBoost;
        uniform float uB_BottomEmissiveBoost;
        uniform float uB_BottomFresnelBoost;
        uniform float uB_BottomFresnelPower;
        uniform float uB_EmissiveIntensity;
        uniform float uB_HoverMin;
        uniform float uB_HoverMax;
        varying float vH;
        varying float vHover;

        vec3 boostSaturation(vec3 c, float amount) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float f = clamp(1.0 + amount, 0.0, 2.5);
          return mix(vec3(l), c, f);
        }
        `
      );

      const hook = shader.fragmentShader.includes(
        "#include <tonemapping_fragment>"
      )
        ? "#include <tonemapping_fragment>"
        : "#include <colorspace_fragment>";

      shader.fragmentShader = shader.fragmentShader.replace(
        hook,
        `
        float t = smoothstep(uB_Mid - uB_Soft, uB_Mid + uB_Soft, vH);
        vec3 grad = mix(uB_ColorA, uB_ColorB, t);

        // bottom emphasis
        float bottom = 1.0 - vH;
        grad = boostSaturation(grad, uB_BottomSatBoost * bottom);

        // tint base shading
        gl_FragColor.rgb *= grad;

        // fresnel (stronger near bottom)
        vec3 V = normalize(-vViewPosition);
        float fres = pow(1.0 - abs(dot(normalize(normal), V)), 1.3);
        float fresBoost = 1.0 + uB_BottomFresnelBoost * pow(bottom, uB_BottomFresnelPower);
        gl_FragColor.rgb += grad * fres * fresBoost;

        // base emissive near bottom
        float eBoost = 1.0 + uB_BottomEmissiveBoost * bottom;
        gl_FragColor.rgb += grad * uB_EmissiveIntensity * eBoost;

        // per-instance hover glow
        float hoverGlow = mix(uB_HoverMin, uB_HoverMax, clamp(vHover, 0.0, 1.0));
        gl_FragColor.rgb += grad * hoverGlow;

        ${hook}
        `
      );

      m.userData.shader = shader;
    };

    // 🔒 Force a unique WebGLProgram for Crystal B (hover variant)
    m.customProgramCacheKey = () => "MagicCrystal_B_vGradientHover_1";

    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Instancing: write matrices to GPU whenever controls change
  useEffect(() => {
    const mesh = instancedRef.current;
    if (!mesh) return;

    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const m4 = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler(0, 0, 0, "XYZ");

    for (let i = 0; i < COUNT; i++) {
      const px = ctl[`B_pX_${i}`];
      const py = ctl[`B_pY_${i}`];
      const pz = ctl[`B_pZ_${i}`];
      const ry = THREE.MathUtils.degToRad(ctl[`B_rY_${i}`]);
      const uni = ctl[`B_s_${i}`];

      p.set(px, py, pz);
      e.set(0, ry, 0);
      q.setFromEuler(e);
      s.set(uni, uni, uni);

      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = COUNT;
    mesh.instanceMatrix.needsUpdate = true;
  }, [ctl]);

  // ===== Live uniforms / physical params & seed bbox Y range (B-prefixed)
  useEffect(() => {
    if (!material) return;
    material.ior = B_ior;
    material.thickness = B_thickness;
    material.attenuationDistance = B_attenuationDistance;
    material.roughness = B_roughness;
    material.emissiveIntensity = B_emissiveIntensity;

    const sdr = material.userData.shader;
    if (sdr) {
      sdr.uniforms.uB_ColorA.value.set(B_colorA);
      sdr.uniforms.uB_ColorB.value.set(B_colorB);
      sdr.uniforms.uB_Mid.value = B_mid;
      sdr.uniforms.uB_Soft.value = B_softness;
      sdr.uniforms.uB_BottomSatBoost.value = B_bottomSatBoost;
      sdr.uniforms.uB_BottomEmissiveBoost.value = B_bottomEmissiveBoost;
      sdr.uniforms.uB_BottomFresnelBoost.value = B_bottomFresnelBoost;
      sdr.uniforms.uB_BottomFresnelPower.value = B_bottomFresnelPower;
      sdr.uniforms.uB_EmissiveIntensity.value = B_emissiveIntensity;
      // live hover range updates
      sdr.uniforms.uB_HoverMin.value = B_hoverMinGlow;
      sdr.uniforms.uB_HoverMax.value = B_hoverMaxGlow;

      if (geometry?.boundingBox) {
        sdr.uniforms.uObjMinY.value = geometry.boundingBox.min.y;
        sdr.uniforms.uObjMaxY.value = geometry.boundingBox.max.y;
      }
    }
  }, [material, geometry, B_colorA, B_colorB, B_mid, B_softness, B_bottomSatBoost, B_bottomEmissiveBoost, B_bottomFresnelBoost, B_bottomFresnelPower, B_emissiveIntensity, B_ior, B_thickness, B_attenuationDistance, B_roughness, B_hoverMinGlow, B_hoverMaxGlow]);

  // ===== Per-instance hover attribute (aHover)
  const hoverAttrRef = useRef(null);
  useEffect(() => {
    if (!geometry) return;
    const arr = new Float32Array(COUNT).fill(0);
    const attr = new THREE.InstancedBufferAttribute(arr, 1);
    geometry.setAttribute("aHover", attr);
    hoverAttrRef.current = attr;
  }, [geometry]);

  // ===== Gradual glow on hover (ray-to-instance proximity, eased)
  const { camera, pointer } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpP = useMemo(() => new THREE.Vector3(), []);
  const tmpQ = useMemo(() => new THREE.Quaternion(), []);
  const tmpS = useMemo(() => new THREE.Vector3(), []);
  const hoverTargetRef = useRef(new Float32Array(COUNT).fill(0));

  useFrame((_, dt) => {
    const attr = hoverAttrRef.current;
    const mesh = instancedRef.current;
    if (!attr || !mesh || !geometry) return;

    // Build mouse ray
    const rc = raycasterRef.current;
    rc.setFromCamera(pointer, camera);
    const ray = rc.ray;

    const sphereRadius = baseRadius || 1;

    for (let i = 0; i < COUNT; i++) {
      mesh.getMatrixAt(i, tmpM);
      tmpM.decompose(tmpP, tmpQ, tmpS);

      const maxScale = Math.max(tmpS.x, tmpS.y, tmpS.z);
      const radius = sphereRadius * maxScale * B_hoverOuterMult;

      const d = Math.sqrt(ray.distanceSqToPoint(tmpP));
      let closeness = 1.0 - d / Math.max(1e-6, radius);
      if (closeness < 0) closeness = 0;
      if (closeness > 1) closeness = 1;

      hoverTargetRef.current[i] = Math.pow(closeness, B_hoverFalloffExp);
    }

    // Ease aHover towards target values
    const a = attr.array;
    const t = hoverTargetRef.current;
    const easeK = 1 - Math.exp(-B_hoverEase * dt);
    let dirty = false;

    for (let i = 0; i < COUNT; i++) {
      const target = B_hoverEnabled ? t[i] : 0;
      const ni = a[i] + (target - a[i]) * easeK;
      if (Math.abs(ni - a[i]) > 1e-4) {
        a[i] = ni;
        dirty = true;
      }
    }
    if (dirty) attr.needsUpdate = true;
  });

  if (!geometry) return null;

  return (
    <group ref={ref} name="MagicCrystalClusters2" {...props}>
      <instancedMesh
        ref={instancedRef}
        args={[geometry, material, COUNT]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
    </group>
  );
});

useGLTF.preload(CRYSTAL2_GLB);
