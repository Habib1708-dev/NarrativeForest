#include ../includes/simplexNoise2d.glsl

uniform float uTime;
uniform float uSpeed;
uniform float uSphereRadius;
uniform float uAuroraHeight;
uniform float uFlutterStrength;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 4; i++) {
        value += amplitude * simplexNoise2d(p);
        p = mat2(1.6, -1.2, 1.2, 1.6) * p + vec2(3.1, 1.7);
        amplitude *= 0.5;
    }

    return value;
}

void main() {
    float t = uTime * uSpeed;
    float heightRatio = uv.y;
    float anchoredHeight = pow(heightRatio, 1.35);

    vec3 sphereDirection = normalize(position);
    float angle = atan(sphereDirection.z, sphereDirection.x);

    float broadWave = fbm(vec2(angle * 1.2 - t * 0.08, heightRatio * 0.9 - t * 0.18));
    float fineFlutter = fbm(vec2(angle * 4.8 + t * 0.16, heightRatio * 3.8 - t * 0.42));

    vec3 tangentDirection = normalize(vec3(-sphereDirection.z, 0.0, sphereDirection.x));
    if (length(tangentDirection) < 0.0001) {
        tangentDirection = vec3(1.0, 0.0, 0.0);
    }

    float radialLift = (broadWave * 0.065 + fineFlutter * 0.03) * anchoredHeight * uFlutterStrength;
    float lateralDrift = fineFlutter * 0.025 * anchoredHeight * uFlutterStrength;

    float projectedRadius = uSphereRadius + heightRatio * uAuroraHeight + radialLift;
    vec3 projected = sphereDirection * projectedRadius + tangentDirection * lateralDrift;
    vec3 projectedNormal = normalize(projected);

    vec4 modelPosition = modelMatrix * vec4(projected, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    vUv = uv;
    vWorldPosition = modelPosition.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(projectedNormal, 0.0)).xyz);
}
