import React, { useEffect, useRef } from "react";
import { Stars as DreiStars } from "@react-three/drei";
import { useControls } from "leva";
import { useFrame } from "@react-three/fiber";

export default function Stars() {
  const groupRef = useRef();

  const {
    radius,
    depth,
    count,
    factor,
    saturation,
    fade,
    speed,
    cutoffEnabled,
    cutoffY,
  } = useControls(
    "Sky / Stars",
    {
      radius: { value: 360, min: 1, max: 2000, step: 1 },
      depth: { value: 2, min: 1, max: 50, step: 1 },
      count: { value: 10000, min: 0, max: 10000, step: 50 },
      factor: { value: 12, min: 0, max: 20, step: 0.1 },
      saturation: { value: 0, min: 0, max: 1, step: 0.01 },
      fade: { value: true },
      speed: { value: 0, min: 0, max: 1, step: 0.01 },
      cutoffEnabled: { value: true, label: "Cutoff by height" },
      cutoffY: {
        value: 1.3,
        min: -200,
        max: 200,
        step: 0.1,
        label: "Cutoff Y",
      },
    },
    { collapsed: true }
  );

  // Patch the Drei Stars shader to discard stars below cutoffY
  useEffect(() => {
    const root = groupRef.current;
    if (!root) return;

    let patched = false;
    root.traverse((obj) => {
      const mat = obj?.material;
      if (!mat || patched) return;
      const target = Array.isArray(mat) ? mat[0] : mat;
      if (!target || target.userData?._nfStarsPatched) return;

      target.userData._nfStarsPatched = true;

      const prev = target.onBeforeCompile;
      target.onBeforeCompile = function (shader) {
        prev?.call(this, shader);

        if (!/varying\s+float\s+vNF_WorldY\s*;/.test(shader.vertexShader)) {
          shader.vertexShader =
            `varying float vNF_WorldY;\n` + shader.vertexShader;
        }

        if (!/vNF_WorldY\s*=\s*nf_wp\.y/.test(shader.vertexShader)) {
          const vs = shader.vertexShader;
          const mainOpen = vs.indexOf("void main()");
          if (mainOpen >= 0) {
            const braceOpen = vs.indexOf("{", mainOpen);
            let depth = 0;
            let i = braceOpen;
            for (; i < vs.length; i++) {
              const ch = vs[i];
              if (ch === "{") depth++;
              else if (ch === "}") {
                depth--;
                if (depth === 0) break;
              }
            }
            if (i > braceOpen) {
              shader.vertexShader =
                vs.slice(0, i) +
                `\n                // narrative-forest: world-space Y for stars cutoff\n                vec4 nf_wp = modelMatrix * vec4(position, 1.0);\n                vNF_WorldY = nf_wp.y;\n                ` +
                vs.slice(i);
            }
          }
        }

        if (
          !/uniform\s+float\s+uNF_CutoffEnabled/.test(shader.fragmentShader)
        ) {
          shader.fragmentShader =
            `uniform float uNF_CutoffEnabled;\n` + shader.fragmentShader;
        }
        if (!/uniform\s+float\s+uNF_CutoffY/.test(shader.fragmentShader)) {
          shader.fragmentShader =
            `uniform float uNF_CutoffY;\n` + shader.fragmentShader;
        }
        if (!/varying\s+float\s+vNF_WorldY/.test(shader.fragmentShader)) {
          shader.fragmentShader =
            `varying float vNF_WorldY;\n` + shader.fragmentShader;
        }

        if (
          !/uNF_CutoffEnabled\s*>\s*0\.5\s*&&\s*vNF_WorldY\s*<\s*uNF_CutoffY/.test(
            shader.fragmentShader
          )
        ) {
          const fs = shader.fragmentShader;
          const mainIdx = fs.indexOf("void main()");
          if (mainIdx >= 0) {
            const braceOpen = fs.indexOf("{", mainIdx);
            shader.fragmentShader =
              fs.slice(0, braceOpen + 1) +
              `\n              if (uNF_CutoffEnabled > 0.5 && vNF_WorldY < uNF_CutoffY) { discard; }\n` +
              fs.slice(braceOpen + 1);
          }
        }

        shader.uniforms.uNF_CutoffEnabled = { value: cutoffEnabled ? 1 : 0 };
        shader.uniforms.uNF_CutoffY = { value: cutoffY };
        target.userData.uNF_CutoffEnabled = shader.uniforms.uNF_CutoffEnabled;
        target.userData.uNF_CutoffY = shader.uniforms.uNF_CutoffY;
      };

      target.needsUpdate = true;
      patched = true;
    });
  }, [
    cutoffEnabled,
    cutoffY,
    radius,
    depth,
    count,
    factor,
    saturation,
    fade,
    speed,
  ]);

  // Update uniforms each frame based on controls
  useFrame(() => {
    const root = groupRef.current;
    if (!root) return;
    root.traverse((obj) => {
      const mat = obj?.material;
      const target = Array.isArray(mat) ? mat?.[0] : mat;
      const ud = target?.userData;
      if (!ud) return;
      if (ud.uNF_CutoffEnabled)
        ud.uNF_CutoffEnabled.value = cutoffEnabled ? 1 : 0;
      if (ud.uNF_CutoffY) ud.uNF_CutoffY.value = cutoffY;
    });
  });

  return (
    <group ref={groupRef}>
      <DreiStars
        radius={radius}
        depth={depth}
        count={count}
        factor={factor}
        saturation={saturation}
        fade={fade}
        speed={speed}
      />
    </group>
  );
}
