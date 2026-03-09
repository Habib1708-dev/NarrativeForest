uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform sampler2D uCloudsTexture;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;
uniform sampler2D uElevBumpMap;
uniform sampler2D uCitiesMask;
uniform float uSpecularViewElevMix;
uniform float uElevContrast;
uniform float uCitiesMode;
uniform float uCitiesOpacity;
uniform vec3 uCitiesColor;
uniform vec2 uTurkishOriginUV;
uniform vec2 uArabicOriginUV;
uniform vec2 uScandinavianOriginUV;
uniform vec2 uEnglishOriginUV;
uniform vec2 uLebanonRippleUV;
uniform vec2 uIraqRippleUV;
uniform vec2 uDenmarkRippleUV;
uniform float uTurkishRippleProgress;
uniform float uArabicRippleProgress;
uniform float uScandinavianRippleProgress;
uniform float uEnglishRippleProgress;
uniform float uPointRippleScale;
uniform float uPointRippleOpacity;
uniform float uPointRippleVisibility;
uniform vec3 uPointRippleColor;
uniform float uDissolveOpacity;
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uAtmosphereDayColor;
uniform vec3 uAtmosphereTwilightColor;
uniform float uNightLightIntensity;
uniform float uCloudOpacity;
uniform float uSpecularStrength;
uniform float uNormalScale;
uniform vec3 uDayTintColor;
uniform float uDayTintIntensity;
uniform float uDaySaturation;
uniform float uSpecularViewMix;
uniform float uScandinavianMix;
uniform float uArabicMix;
uniform float uTurkishMix;
uniform float uBlueMix;
uniform vec3 uLanguageColor;
uniform float uLanguageOverlayOpacity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

const float PI = 3.14159265358979323846;

float getSaturation(vec3 color)
{
    float cMax = max(max(color.r, color.g), color.b);
    float cMin = min(min(color.r, color.g), color.b);
    return cMax <= 0.0 ? 0.0 : (cMax - cMin) / cMax;
}

vec4 getLanguageMasks(vec3 color)
{
    float cMax = max(max(color.r, color.g), color.b);
    float saturation = getSaturation(color);
    float colorPresence = smoothstep(0.18, 0.35, saturation) * smoothstep(0.12, 0.3, cMax);

    float redMask = colorPresence * smoothstep(0.08, 0.22, color.r - max(color.g, color.b));
    float yellowMask = colorPresence * smoothstep(0.08, 0.2, min(color.r, color.g) - color.b);
    float cyanMask = colorPresence * smoothstep(0.08, 0.2, min(color.g, color.b) - color.r);
    float blueMask = colorPresence * smoothstep(0.08, 0.2, color.b - max(color.r, color.g));

    return clamp(vec4(redMask, yellowMask, cyanMask, blueMask), 0.0, 1.0);
}

vec4 getExpandedLanguageMasks(vec2 uv)
{
    vec2 texel = vec2(1.0 / 8192.0);
    vec4 masks = vec4(0.0);

    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + vec2(texel.x, 0.0)).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + vec2(-texel.x, 0.0)).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + vec2(0.0, texel.y)).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + vec2(0.0, -texel.y)).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + texel).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv - texel).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + vec2(texel.x, -texel.y)).rgb));
    masks = max(masks, getLanguageMasks(texture2D(uSpecularMap, uv + vec2(-texel.x, texel.y)).rgb));

    float total = masks.r + masks.g + masks.b + masks.a;
    if (total > 0.0) {
        masks /= total;
    }

    return clamp(masks, 0.0, 1.0);
}

float uvDistance(vec2 a, vec2 b)
{
    vec2 d = abs(a - b);
    d = min(d, 1.0 - d);
    return length(d);
}

vec3 uvToSphereDirection(vec2 uv)
{
    float phi = (uv.x - 0.5) * PI * 2.0;
    float theta = (uv.y - 0.5) * PI;
    float cosTheta = cos(theta);
    return normalize(vec3(
        sin(phi) * cosTheta,
        sin(theta),
        cos(phi) * cosTheta
    ));
}

float sphericalDistance(vec2 a, vec2 b)
{
    vec3 dirA = uvToSphereDirection(a);
    vec3 dirB = uvToSphereDirection(b);
    return acos(clamp(dot(dirA, dirB), -1.0, 1.0));
}

float rippleFill(vec2 originUV, float progress, float maxRadius, float edge)
{
    float d = uvDistance(vUv, originUV);
    float r = progress * maxRadius;
    return 1.0 - smoothstep(r - edge, r + edge, d);
}

float ringPulse(vec2 originUV, float time, float maxRadius, float width)
{
    float d = sphericalDistance(vUv, originUV);
    float cycle = fract(time / 2.2);
    float radius = cycle * maxRadius;
    float spacing = max(width * 3.5, maxRadius * 0.18);
    float ring0 = 1.0 - smoothstep(width, width * 1.6, abs(d - radius));
    float ring1 = 1.0 - smoothstep(width, width * 1.6, abs(d - max(0.0, radius - spacing)));
    float ring2 = 1.0 - smoothstep(width, width * 1.6, abs(d - max(0.0, radius - spacing * 2.0)));
    float fadeAtBoundary = 1.0 - smoothstep(maxRadius * 0.65, maxRadius, radius);
    return max(ring0, max(ring1, ring2)) * fadeAtBoundary;
}

void main()
{
    vec3 viewDirection = normalize(vPosition - cameraPosition);

    // Normal mapping: sample tangent-space normal and transform to world space
    vec3 normalMapSample = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
    normalMapSample.xy *= uNormalScale;
    mat3 tbn = mat3(normalize(vTangent), normalize(vBitangent), normalize(vNormal));
    vec3 normal = normalize(tbn * normalMapSample);

    vec3 color = vec3(0.0);

    float sunOrientation = dot(uSunDirection, normal);
    vec3 specularMapColor = texture2D(uSpecularMap, vUv).rgb;
    vec4 languageMasks = getExpandedLanguageMasks(vUv);
    float combinedLanguageMask = clamp(languageMasks.r + languageMasks.g + languageMasks.b + languageMasks.a, 0.0, 1.0);
    // Single specular map: languages texture as B&W (colored regions = no specular)
    float specularMask = dot(specularMapColor, vec3(0.299, 0.587, 0.114));
    specularMask *= (1.0 - smoothstep(0.05, 0.2, combinedLanguageMask));

    // Day/night blend
    float dayMix = smoothstep(-0.25, 0.5, sunOrientation);
    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    dayColor = mix(dayColor, dayColor * uDayTintColor, uDayTintIntensity);
    float dayLuma = dot(dayColor, vec3(0.299, 0.587, 0.114));
    dayColor = mix(vec3(dayLuma), dayColor, uDaySaturation);
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb * uNightLightIntensity;
    color = mix(nightColor, dayColor, dayMix);
    // Specular view: combine specular (water vs land) + elevation for clear sea/land distinction
    // Specular: water bright, land darker. Elevation: land has height detail, ocean low/dark.
    // Combined: sea = white (from specular), land = elevation grayscale (terrain shading).
    float elevLuma = dot(texture2D(uElevBumpMap, vUv).rgb, vec3(0.299, 0.587, 0.114));
    elevLuma = (elevLuma - 0.5) * uElevContrast + 0.5;
    elevLuma = clamp(elevLuma, 0.0, 1.0);
    float seaLandBase = mix(elevLuma, 1.0, specularMask);
    float specularViewBase = mix(specularMask, seaLandBase, uSpecularViewElevMix);
    color = mix(color, vec3(specularViewBase), uSpecularViewMix);

    // Clouds (standalone texture)
    float cloudsValue = texture2D(uCloudsTexture, vUv).r;
    float cloudsMix = smoothstep(0.4, 1.0, cloudsValue);
    cloudsMix *= dayMix;
    cloudsMix *= uCloudOpacity;
    cloudsMix *= (1.0 - uSpecularViewMix);
    color = mix(color, vec3(1.0), cloudsMix);

    // Cities: overlay on specular+elev only, or day/night style (follow sun)
    float cityMask = texture2D(uCitiesMask, vUv).r;
    float citiesMix = cityMask * uCitiesOpacity;
    citiesMix *= (1.0 - uCitiesMode) * uSpecularViewMix + uCitiesMode * dayMix;
    color = mix(color, uCitiesColor, clamp(citiesMix, 0.0, 1.0));

    // Atmosphere fresnel
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 2.0);

    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color = mix(color, atmosphereColor, fresnel * atmosphereDayMix);

    float pointRippleWidth = max(0.0009, uPointRippleScale * 0.035);
    float pointRippleLebanon = ringPulse(uLebanonRippleUV, uTime, uPointRippleScale, pointRippleWidth);
    float pointRippleIraq = ringPulse(uIraqRippleUV, uTime + 0.8, uPointRippleScale, pointRippleWidth);
    float pointRippleDenmark = ringPulse(uDenmarkRippleUV, uTime + 1.6, uPointRippleScale, pointRippleWidth);
    float pointRippleMask = max(pointRippleLebanon, max(pointRippleIraq, pointRippleDenmark));
    color = mix(
        color,
        uPointRippleColor,
        pointRippleMask * uPointRippleOpacity * uPointRippleVisibility
    );

    // Radial ripple: per-language wave expands from origin UV; each animates on its own
    // Max radius must cover full UV extent with wraparound (diagonal 0.5^2+0.5^2 = 0.707)
    float maxRadius = 0.72;
    float rippleEdge = 0.03;
    float rippleScandinavian = rippleFill(uScandinavianOriginUV, uScandinavianRippleProgress, maxRadius, rippleEdge);
    float rippleArabic = rippleFill(uArabicOriginUV, uArabicRippleProgress, maxRadius, rippleEdge);
    float rippleTurkish = rippleFill(uTurkishOriginUV, uTurkishRippleProgress, maxRadius, rippleEdge);
    float rippleEnglish = rippleFill(uEnglishOriginUV, uEnglishRippleProgress, maxRadius, rippleEdge);

    float selectedLanguageMask = languageMasks.r * uScandinavianMix * rippleScandinavian;
    selectedLanguageMask += languageMasks.g * uArabicMix * rippleArabic;
    selectedLanguageMask += languageMasks.b * uTurkishMix * rippleTurkish;
    selectedLanguageMask += languageMasks.a * uBlueMix * rippleEnglish;
    selectedLanguageMask = clamp(selectedLanguageMask, 0.0, 1.0);
    // Single opacity for language cover in all modes (specular view + day/night overlay)
    color = mix(color, uLanguageColor, selectedLanguageMask * uLanguageOverlayOpacity);

    // Specular highlights masked to oceans via specular map
    vec3 reflection = reflect(-uSunDirection, normal);
    float specular = -dot(reflection, viewDirection);
    specular = max(specular, 0.0);
    specular = pow(specular, 32.0);
    specular *= specularMask;
    specular *= uSpecularStrength;
    specular *= (1.0 - cloudsMix);
    specular *= (1.0 - uSpecularViewMix);

    vec3 specularColor = mix(vec3(1.0), atmosphereColor, fresnel);
    color += specular * specularColor;

    gl_FragColor = vec4(color, uDissolveOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
