#include ../includes/simplexNoise2d.glsl

uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform float uRayDensity;
uniform float uRaySharpness;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uSunDirection;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
        value += amplitude * simplexNoise2d(p);
        p = mat2(1.6, -1.2, 1.2, 1.6) * p + vec2(2.7, 5.1);
        amplitude *= 0.5;
    }

    return value;
}

void main() {
    float t = uTime * uSpeed;
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

    // Low-frequency coverage so the aurora breaks into broad arcs
    float coverageNoise = fbm(vec2(vUv.x * 1.1 - t * 0.03, 4.2));
    float coverage = smoothstep(-0.15, 0.25, coverageNoise);

    // Domain warp adds flowing motion and keeps the curtain from reading like a flat band
    float warp = fbm(vec2(vUv.x * 2.2 + t * 0.04, vUv.y * 1.35 - t * 0.18));

    // Build vertical curtain rays by using ridge noise mostly along x,
    // then modulating their brightness with slower masks so some columns flare
    // while others stay dim.
    float yCurve = pow(vUv.y, 0.75);
    float rayDrift = warp * 2.4 + fbm(vec2(vUv.x * 1.7 - t * 0.08, vUv.y * 2.4 + t * 0.22)) * 0.7;
    float streakCoord = vUv.x * uRayDensity + rayDrift * (0.6 + yCurve * 1.4);

    float ridgeA = 1.0 - abs(simplexNoise2d(vec2(streakCoord - t * 0.18, 0.35)));
    float ridgeB = 1.0 - abs(simplexNoise2d(vec2(streakCoord * 1.9 + 13.7 - t * 0.27, 4.8)));
    float ridgeC = 1.0 - abs(simplexNoise2d(vec2(streakCoord * 3.6 - 8.2 + t * 0.11, 9.4)));

    float rayCore = ridgeA * 0.58 + ridgeB * 0.28 + ridgeC * 0.14;
    rayCore = pow(smoothstep(0.28, 0.95, rayCore), uRaySharpness);

    float intensityBands = fbm(vec2(vUv.x * 2.1 - t * 0.04, 2.3)) * 0.5 + 0.5;
    float verticalVariation = fbm(vec2(vUv.x * 0.9 + 6.0, vUv.y * 4.6 - t * 0.3)) * 0.5 + 0.5;
    float rayIntensity = smoothstep(0.15, 0.95, intensityBands * 0.7 + verticalVariation * 0.3);

    float darkGaps = fbm(vec2(vUv.x * 3.4 + 11.2, vUv.y * 1.3 + t * 0.06)) * 0.5 + 0.5;
    darkGaps = 1.0 - smoothstep(0.58, 0.88, darkGaps);

    float rays = rayCore * mix(0.25, 1.35, rayIntensity) * mix(1.0, 0.35, darkGaps);

    // Folded sheet profile with an irregular upper edge
    float curtainShape = fbm(vec2(vUv.x * 1.6 + warp * 0.8, vUv.y * 0.85 + t * 0.1));
    float curtainTop = 0.22 + coverage * 0.48 + curtainShape * 0.12;
    float curtainMask = 1.0 - smoothstep(curtainTop - 0.24, curtainTop + 0.03, vUv.y);

    float bottomAnchor = smoothstep(0.0, 0.06, vUv.y);
    float upperFade = 1.0 - smoothstep(0.72, 1.0, vUv.y);
    float bodyFade = pow(1.0 - vUv.y, 0.42);
    float lowerGlow = exp(-vUv.y * 5.5);
    float pulse = 0.72 + 0.28 * sin(vUv.y * 28.0 + t * 2.0 + warp * 5.0);
    float sheetDepth = 0.78 + 0.22 * fbm(vec2(vUv.x * 1.4 - t * 0.05, vUv.y * 2.2 + 3.0));

    float bodyMask = coverage * curtainMask * bottomAnchor * upperFade * bodyFade;
    float rayBody = bodyMask * (0.05 + 1.25 * rays) * pulse * sheetDepth;

    // Favor the nightside so the aurora reads against the dark hemisphere
    float sunFacing = dot(normal, normalize(uSunDirection));
    float nightMask = 1.0 - smoothstep(-0.2, 0.2, sunFacing);

    // Fresnel helps the curtain glow near the silhouette
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 2.4);

    float colorMixMid = smoothstep(0.04, 0.55, vUv.y);
    float colorMixTop = smoothstep(0.42, 0.95, vUv.y);
    vec3 auroraColor = mix(uColor1, uColor2, colorMixMid);
    auroraColor = mix(auroraColor, uColor3, colorMixTop);
    auroraColor = mix(auroraColor * 0.72, auroraColor * 1.35, clamp(rays, 0.0, 1.0));

    float emission = (
        rayBody * 1.8 +
        lowerGlow * coverage * 0.28 +
        fresnel * bodyMask * 0.45
    ) * nightMask * uIntensity;

    vec3 color = auroraColor * emission;
    color += uColor1 * lowerGlow * rays * coverage * 0.18 * nightMask * uIntensity;

    gl_FragColor = vec4(color, clamp(emission, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
