import React, { useRef, useEffect } from "react";
import * as THREE from "three";

export default function Terrain() {
  const materialRef = useRef();

  useEffect(() => {
    if (materialRef.current) {
      // Create a material animation loop
      let clock = new THREE.Clock();

      const animate = () => {
        if (materialRef.current) {
          materialRef.current.userData.time = clock.getElapsedTime();
        }
        requestAnimationFrame(animate);
      };

      animate();

      materialRef.current.onBeforeCompile = (shader) => {
        console.log("onBeforeCompile called - shader modification starting");
        // Add custom uniforms
        shader.uniforms.time = { value: 0.0 };

        // Update time value in the render loop
        const oldOnBeforeRender = materialRef.current.onBeforeRender;
        materialRef.current.onBeforeRender = (
          renderer,
          scene,
          camera,
          geometry,
          material
        ) => {
          shader.uniforms.time.value = materialRef.current.userData.time || 0;
          if (oldOnBeforeRender)
            oldOnBeforeRender(renderer, scene, camera, geometry, material);
        };

        // Add simplex noise implementation to the top of the vertex shader
        shader.vertexShader = `
          // Simplex noise implementation
          vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
          
          float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
            
            // First corner
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v -   i + dot(i, C.xx);
            
            // Other corners
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            
            // Permutations
            i = mod(i, 289.0);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
              + i.x + vec3(0.0, i1.x, 1.0 ));
              
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
              dot(x12.zw,x12.zw)), 0.0);
            m = m*m;
            m = m*m;
            
            // Gradients
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            
            // Normalise gradients
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0+h*h);
            
            // Final noise value
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }
          
          // Fractal Brownian Motion for multi-layered terrain
          float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 0.005;  // Decreased frequency for larger features
            
            // Add several octaves of noise
            for (int i = 0; i < 5; i++) {  // Added one more octave
              value += amplitude * snoise(p * frequency);
              frequency *= 2.0;
              amplitude *= 0.5;
            }
            
            return value;
          }
          
          ${shader.vertexShader}
        `;

        // Replace vertex displacement with simplex noise
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          
          // Scale factors for noise
          float heightScale = 50.0;  // Increased height scale for more dramatic elevation
          
          // Add terrain height displacement using simplex noise
          float displacement = fbm(position.xy) * heightScale;
          
          // Make sure displacement is always positive to create hills
          displacement = abs(displacement) + 5.0;
          
          // Apply displacement to Z axis (vertical after rotation)
          transformed.z += displacement;  // FIXED: Use z-axis for height after rotation
          
          // We need to update the normal since we changed the geometry
          #ifdef USE_NORMAL
            // Compute approximate new normal by central differences
            float dx = 0.1;
            float displacementPlusX = fbm(vec2(position.x + dx, position.y)) * heightScale;
            float displacementMinusX = fbm(vec2(position.x - dx, position.y)) * heightScale;
            float displacementPlusY = fbm(vec2(position.x, position.y + dx)) * heightScale;
            float displacementMinusY = fbm(vec2(position.x, position.y - dx)) * heightScale;
            
            // Calculate normal from gradient - adjusted for Z displacement
            vec3 newNormal = normalize(vec3(
              displacementMinusX - displacementPlusX,
              displacementMinusY - displacementPlusY,
              2.0 * dx  // Z component is now the "up" direction
            ));
            
            // Apply the new normal
            objectNormal = newNormal;
          #endif
          `
        );

        // After shader modification
        console.log(
          "Shader modified successfully - vertex shader length:",
          shader.vertexShader.length
        );
      };
    }

    materialRef.current.needsUpdate = true;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]}>
      <planeGeometry args={[300, 300, 1024, 1024]} />
      <meshStandardMaterial
        ref={materialRef}
        color={"#4b7d23"}
        wireframe={false}
        flatShading={true}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
