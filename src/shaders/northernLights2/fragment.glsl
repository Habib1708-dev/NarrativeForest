#include ../includes/simplexNoise2d.glsl

uniform float uTime;
uniform float uSpeed;
uniform float uIntensity;
uniform float uDensity;
uniform float uNoiseScaleX;
uniform float uNoiseScaleY;
uniform float uStreakLow;
uniform float uStreakHigh;
uniform float uBandStrength;
uniform float uBottomFadeStart;
uniform float uBottomFadeEnd;
uniform float uTopFadeStart;
uniform float uTopFadeEnd;
uniform float uGapFill;
uniform float uRadialBlend;
uniform float uFresnelStrength;
uniform float uTransitionOpacity;
uniform vec3 uColorBottom;
uniform vec3 uColorTop;

varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vNoiseMask;
varying float vRadialGradient;
varying vec2 vAngleWrap;

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int i = 0; i < 5; i++) {
        value += amplitude * simplexNoise2d(p);
        p = mat2(1.6, -1.1, 1.1, 1.6) * p + vec2(3.4, 1.9);
        amplitude *= 0.55;
    }

    return value;
}

void main() {
    float t = uTime * uSpeed;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vWorldNormal);

    vec2 noiseUv = vec2(
        vAngleWrap.x * uNoiseScaleX * 0.5 + t * 0.06,
        vUv.y * uNoiseScaleY - t * 0.26
    );

    float invertedNoise = 1.0 - clamp(fbm(noiseUv) * 0.5 + 0.5, 0.0, 1.0);
    float streaks = smoothstep(uStreakLow, uStreakHigh, invertedNoise);
    float brightBands = smoothstep(0.22, 0.88, 1.0 - clamp(fbm(vec2(vAngleWrap.x * 1.4 - t * 0.04, 4.0)) * 0.5 + 0.5, 0.0, 1.0));
    float intensityVariation = mix(0.35, 1.25, brightBands * uBandStrength);

    // Vertical alpha: softly fade in from the bottom and out at the top.
    float bottomFade = smoothstep(uBottomFadeStart, uBottomFadeEnd, vUv.y);
    float topFade = 1.0 - smoothstep(uTopFadeStart, uTopFadeEnd, vUv.y);
    float edgeFade = bottomFade * topFade;

    // Curtain profile: brightest and most opaque near the base, gradually
    // becoming thinner and more transparent toward the top.
    float baseBias = pow(1.0 - vUv.y, 1.4);
    float curtainAlpha = edgeFade * baseBias;

    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 2.1);

    float verticalGradient = smoothstep(0.0, 1.0, vUv.y);
    vec3 color = mix(uColorBottom, uColorTop, verticalGradient);
    color = mix(color, uColorTop, uRadialBlend * vRadialGradient);

    float streakEnergy = streaks * vNoiseMask * intensityVariation;
    streakEnergy = mix(streakEnergy, max(streakEnergy, curtainAlpha * 0.7), uGapFill);
    float emission = (
        streakEnergy * curtainAlpha * 1.85 +
        fresnel * curtainAlpha * uFresnelStrength
    ) * uIntensity * uDensity;
    emission *= uTransitionOpacity;

    color *= mix(0.75, 1.35, streakEnergy);
    gl_FragColor = vec4(
        color * emission,
        clamp(emission * uTransitionOpacity, 0.0, 1.0)
    );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
