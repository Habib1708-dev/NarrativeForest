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

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

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

    // Day/night blend
    float dayMix = smoothstep(-0.25, 0.5, sunOrientation);
    vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
    dayColor = mix(dayColor, dayColor * uDayTintColor, uDayTintIntensity);
    float dayLuma = dot(dayColor, vec3(0.299, 0.587, 0.114));
    dayColor = mix(vec3(dayLuma), dayColor, uDaySaturation);
    vec3 nightColor = texture2D(uNightTexture, vUv).rgb * uNightLightIntensity;
    color = mix(nightColor, dayColor, dayMix);

    // Clouds (standalone texture)
    float cloudsValue = texture2D(uCloudsTexture, vUv).r;
    float cloudsMix = smoothstep(0.4, 1.0, cloudsValue);
    cloudsMix *= dayMix;
    cloudsMix *= uCloudOpacity;
    color = mix(color, vec3(1.0), cloudsMix);

    // Atmosphere fresnel
    float fresnel = dot(viewDirection, normal) + 1.0;
    fresnel = pow(fresnel, 2.0);

    float atmosphereDayMix = smoothstep(-0.5, 1.0, sunOrientation);
    vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, atmosphereDayMix);
    color = mix(color, atmosphereColor, fresnel * atmosphereDayMix);

    // Specular highlights masked to oceans via specular map
    float specularMask = texture2D(uSpecularMap, vUv).r;
    vec3 reflection = reflect(-uSunDirection, normal);
    float specular = -dot(reflection, viewDirection);
    specular = max(specular, 0.0);
    specular = pow(specular, 32.0);
    specular *= specularMask;
    specular *= uSpecularStrength;
    specular *= (1.0 - cloudsMix);

    vec3 specularColor = mix(vec3(1.0), atmosphereColor, fresnel);
    color += specular * specularColor;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
