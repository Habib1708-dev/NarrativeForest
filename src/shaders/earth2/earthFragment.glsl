uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform sampler2D uCloudsTexture;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;
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

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

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
    color = mix(color, vec3(specularMask), uSpecularViewMix);

    // Clouds (standalone texture)
    float cloudsValue = texture2D(uCloudsTexture, vUv).r;
    float cloudsMix = smoothstep(0.4, 1.0, cloudsValue);
    cloudsMix *= dayMix;
    cloudsMix *= uCloudOpacity;
    cloudsMix *= (1.0 - uSpecularViewMix);
    color = mix(color, vec3(1.0), cloudsMix);

    // Atmosphere fresnel
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 2.0);

    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color = mix(color, atmosphereColor, fresnel * atmosphereDayMix);

    float selectedLanguageMask = languageMasks.r * uScandinavianMix;
    selectedLanguageMask += languageMasks.g * uArabicMix;
    selectedLanguageMask += languageMasks.b * uTurkishMix;
    selectedLanguageMask += languageMasks.a * uBlueMix;
    selectedLanguageMask = clamp(selectedLanguageMask, 0.0, 1.0);
    color = mix(color, uLanguageColor, selectedLanguageMask * uSpecularViewMix);

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

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
