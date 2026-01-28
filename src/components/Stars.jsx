import React, { useEffect, useRef } from "react";
import { Stars as DreiStars } from "@react-three/drei";

// Hardcoded defaults for maximum performance (no leva overhead, no per-frame updates)
const STARS_CONFIG = {
  radius: 360,
  depth: 2,
  count: 10000,
  factor: 12,
  saturation: 0,
  fade: true,
  speed: 0,
  cutoffEnabled: true,
  cutoffY: 1.3,
};

export default function Stars() {
  const groupRef = useRef();

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

        shader.uniforms.uNF_CutoffEnabled = { value: STARS_CONFIG.cutoffEnabled ? 1 : 0 };
        shader.uniforms.uNF_CutoffY = { value: STARS_CONFIG.cutoffY };
      };

      target.needsUpdate = true;
      patched = true;
    });
  }, []);

  return (
    <group ref={groupRef}>
      <DreiStars
        radius={STARS_CONFIG.radius}
        depth={STARS_CONFIG.depth}
        count={STARS_CONFIG.count}
        factor={STARS_CONFIG.factor}
        saturation={STARS_CONFIG.saturation}
        fade={STARS_CONFIG.fade}
        speed={STARS_CONFIG.speed}
      />
    </group>
  );
}
