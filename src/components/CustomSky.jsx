// src/components/CustomSky.jsx
import React, { useEffect, useRef } from "react";
import { Sky } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

/**
 * CustomSky
 * Mirrors <Sky /> props; adds `darken` [0..1] that multiplies the sky RGB.
 * Defaults match your Experience.jsx control defaults.
 */
export default function CustomSky({
  darken = 0.0, //set it to 0.82 for night mode
  sunPosition = [5.0, -1.0, 30.0],
  rayleigh = 0.01,
  turbidity = 1.1,
  mieCoefficient = 0.0,
  mieDirectionalG = 0.0,
  ...rest
}) {
  const skyRef = useRef();

  useEffect(() => {
    const mesh = skyRef.current;
    const mat = mesh?.material;
    if (!mat || mat.userData?._darkenPatched) return;

    const originalOBC = mat.onBeforeCompile;

    mat.onBeforeCompile = (shader) => {
      // Preserve any existing hook first
      originalOBC?.(shader);

      // 1) Always declare our uniform at the very top
      shader.fragmentShader = `uniform float uSkyDarken;\n${shader.fragmentShader}`;

      // 2) Rewrite the final assignment to gl_FragColor inside main()
      // Pattern A: gl_FragColor = vec4( COLOR , ALPHA );
      let fs = shader.fragmentShader;
      const patA =
        /gl_FragColor\s*=\s*vec4\s*\(\s*([^,]+)\s*,\s*([^)]+)\s*\)\s*;/m;
      if (patA.test(fs)) {
        fs = fs.replace(
          patA,
          "gl_FragColor = vec4( ( $1 ) * ( 1.0 - clamp(uSkyDarken, 0.0, 1.0) ), $2 );"
        );
      } else {
        // Pattern B: gl_FragColor = vec4( VEC4 );
        const patB = /gl_FragColor\s*=\s*vec4\s*\(\s*([^)]+)\s*\)\s*;/m;
        if (patB.test(fs)) {
          fs = fs.replace(
            patB,
            "gl_FragColor = vec4( ( $1 ).rgb * ( 1.0 - clamp(uSkyDarken, 0.0, 1.0) ), ( $1 ).a );"
          );
        } else {
          // Fallback: inject multiplication just before the end of main()
          // This searches for the closing brace of main() specifically.
          const mainOpen = fs.indexOf("void main()");
          if (mainOpen >= 0) {
            // naive brace matching from the "void main()" occurrence
            const braceOpen = fs.indexOf("{", mainOpen);
            let depth = 0,
              i = braceOpen;
            for (; i < fs.length; i++) {
              const ch = fs[i];
              if (ch === "{") depth++;
              else if (ch === "}") {
                depth--;
                if (depth === 0) break;
              }
            }
            if (i > braceOpen) {
              fs =
                fs.slice(0, i) +
                `
                // Darken only the sky
                gl_FragColor.rgb *= (1.0 - clamp(uSkyDarken, 0.0, 1.0));
                ` +
                fs.slice(i);
            }
          }
        }
      }

      shader.fragmentShader = fs;

      // Keep a ref to update from React
      shader.uniforms.uSkyDarken = { value: darken };
      mat.userData.uSkyDarken = shader.uniforms.uSkyDarken;
    };

    mat.userData._darkenPatched = true;
    mat.needsUpdate = true;

    return () => {
      // cleanup: restore original hook if this component unmounts
      if (mat) mat.onBeforeCompile = originalOBC;
    };
  }, [
    darken,
    sunPosition,
    rayleigh,
    turbidity,
    mieCoefficient,
    mieDirectionalG,
  ]);

  // Live updates (cheap)
  useFrame(() => {
    const u = skyRef.current?.material?.userData?.uSkyDarken;
    if (u) u.value = darken;
  });

  return (
    <Sky
      ref={skyRef}
      sunPosition={sunPosition}
      rayleigh={rayleigh}
      turbidity={turbidity}
      mieCoefficient={mieCoefficient}
      mieDirectionalG={mieDirectionalG}
      {...rest}
    />
  );
}
