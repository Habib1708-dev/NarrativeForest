uniform float uTime;
uniform float uElevation;
uniform float uFrequency;
uniform float uSeed;
uniform float uZoomFactor;
uniform float uFocusX;
uniform float uFocusY;
uniform float uFlatThreshold; // Threshold for creating flat areas (0.0-1.0)
uniform float uFlatStrength; // How flat to make the flat areas (0.0-1.0)

varying vec3 vNormal;
varying float vElevation;

//
// Description : Array and textureless GLSL 2D/3D/4D simplex 
// noise functions.
// Author : Ian McEwan, Ashima Arts.
// Maintainer : ijm
// Lastmod : 20110822 (ijm)
// License : MIT
//
vec4 permute(vec4 x) {
    return mod(((x*34.0)+1.0)*x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) { 
    const vec2 C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

    // Permutations
    i = mod(i, 289.0 ); 
    vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    // Gradients
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    // Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

// Function to create flat areas by clamping noise values
float createFlatArea(float noise, float threshold, float strength) {
    // If noise value is close to 0 (within threshold), flatten it
    if (abs(noise) < threshold) {
        // Lerp between original noise and 0 based on strength
        return mix(noise, 0.0, strength);
    }
    return noise;
}

void main() {
    // Use the original vertex position
    vec3 newPosition = position;
    
    // Add seed offset to create different terrains with same noise pattern
    vec3 seedOffset = vec3(uSeed * 100.0, uSeed * 50.0, uSeed * 25.0);
    
    // Use the uniform values from React for zoom and focus
    float zoom = 1.0 / uZoomFactor; // Invert so higher values = more zoom
    vec2 focusPoint = vec2(uFocusX, uFocusY); // Use the focus point from uniforms
    
    // Calculate the scaled and offset position for noise sampling
    vec2 scaledPos = position.xy * zoom + focusPoint;
    
    // Calculate raw noise without any flat area processing
    float rawNoise1 = snoise(vec3(scaledPos.x * 0.02 * uFrequency, scaledPos.y * 0.02 * uFrequency, 0.0) + seedOffset * 0.1);
    float rawNoise2 = snoise(vec3(scaledPos.x * 0.1 * uFrequency, scaledPos.y * 0.1 * uFrequency, 0.0) + seedOffset * 0.2);
    float rawNoise3 = snoise(vec3(scaledPos.x * 0.3 * uFrequency, scaledPos.y * 0.3 * uFrequency, 0.0) + seedOffset * 0.3);
    
    // Apply flat areas by clamping noise values
    // If noise is within threshold range, flatten it
    float noise1 = createFlatArea(rawNoise1, uFlatThreshold, uFlatStrength);
    float noise2 = createFlatArea(rawNoise2, uFlatThreshold, uFlatStrength);
    float noise3 = rawNoise3; // Keep small details unflattened
    
    // Add noise-based elevation - apply multiple octaves of noise for more detail
    float elevation = 0.0;
    
    // First noise layer - large features (flattened)
    elevation += noise1 * 3.0;
    
    // Second noise layer - medium features (flattened)
    elevation += noise2 * 1.5;
    
    // Third noise layer - small details (unmodified)
    elevation += noise3 * 0.5;
    
    // Apply elevation to z component
    newPosition.z += elevation * uElevation;
    
    // Pass normalized elevation to fragment shader
    vElevation = clamp((elevation + 5.0) / 10.0, 0.0, 1.0);
    
    // Calculate new normal by using derivatives
    // This recreates proper normals for lighting calculations
    vec3 tangent = normalize(vec3(1.0, 0.0, noise3 * uElevation));
    vec3 bitangent = normalize(vec3(0.0, 1.0, noise2 * uElevation));
    vec3 newNormal = normalize(cross(tangent, bitangent));
    
    // Pass normal to fragment shader
    vNormal = normalMatrix * newNormal;
    
    // Apply model-view-projection matrix
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}

