#include ../includes/simplexNoise2d.glsl

uniform float uTime;
uniform float uSpeed;
uniform float uSphereRadius;
uniform float uAuroraHeight;
uniform float uDisplacementStrength;
uniform float uNoiseScaleX;
uniform float uNoiseScaleY;
uniform float uBaseInset;
uniform float uTopOutset;
uniform float uBaseDistortionStrength;
uniform float uBaseDistortionScale;
uniform float uBaseDistortionSpeed;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vNoiseMask;
varying float vRadialGradient;
varying vec2 vAngleWrap;

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
        value += amplitude * simplexNoise2d(p);
        p = mat2(1.7, -1.2, 1.2, 1.7) * p + vec2(2.8, 5.3);
        amplitude *= 0.55;
    }

    return value;
}

void main() {
    vec3 localPosition = position;
    float t = uTime * uSpeed;
    float angularCoord = uv.x * 6.28318530718;
    float heightRatio = uv.y;
    float baseMask = 1.0 - smoothstep(0.0, 0.3, heightRatio);
    float radialProfile = mix(1.0 - uBaseInset, 1.0 + uTopOutset, heightRatio);

    float baseDistortion = simplexNoise2d(
        vec2(
            cos(angularCoord) * uBaseDistortionScale * 0.5 + t * uBaseDistortionSpeed,
            sin(angularCoord) * uBaseDistortionScale * 0.5 + 1.7
        )
    );
    baseDistortion *= uBaseDistortionStrength * baseMask;

    localPosition.xz *= radialProfile + baseDistortion;

    float angleCos = cos(angularCoord);
    float angleSin = sin(angularCoord);
    vec2 noiseUv = vec2(
        angleCos * uNoiseScaleX * 0.5 + t * 0.04,
        heightRatio * uNoiseScaleY - t * 0.32
    );

    float baseNoise = fbm(noiseUv);
    float invertedNoise = 1.0 - clamp(baseNoise * 0.5 + 0.5, 0.0, 1.0);
    float fineNoise = 1.0 - clamp(
        simplexNoise2d(vec2(angleCos * uNoiseScaleX * 1.35 - t * 0.06, uv.y * uNoiseScaleY * 2.2 - t * 0.48)) * 0.5 + 0.5,
        0.0,
        1.0
    );

    float streakMask = smoothstep(0.18, 0.9, invertedNoise);
    float streakDetail = smoothstep(0.3, 0.95, fineNoise);
    float noiseMask = mix(streakMask, streakMask * streakDetail, 0.5);

    // Apply animated displacement on the cylinder's Y axis before the sphere projection.
    float verticalDisplacement = noiseMask * uDisplacementStrength * (0.25 + pow(heightRatio, 1.4));
    localPosition.y += verticalDisplacement;

    vec3 sphereDirection = normalize(localPosition);
    float projectedRadius = uSphereRadius + heightRatio * uAuroraHeight;
    vec3 projected = sphereDirection * projectedRadius;
    vec3 projectedNormal = normalize(projected);

    vec4 modelPosition = modelMatrix * vec4(projected, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    vUv = uv;
    vWorldPosition = modelPosition.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(projectedNormal, 0.0)).xyz);
    vNoiseMask = noiseMask;
    vRadialGradient = 0.5 + 0.5 * cos(angularCoord);
    vAngleWrap = vec2(angleCos, angleSin);
}
