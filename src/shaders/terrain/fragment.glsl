uniform vec3 uColor;
uniform float uElevation;

// Add lighting uniform controls
uniform vec3 uLightDirection;
uniform float uAmbientIntensity;
uniform float uDiffuseIntensity;

// Receive data from vertex shader
varying vec3 vNormal;
varying float vElevation; // Add this to receive the elevation

void main() {
    // Use light direction from uniform instead of hardcoded value
    vec3 lightDirection = normalize(uLightDirection);
    
    // Calculate diffuse lighting
    float diffuse = max(dot(vNormal, lightDirection), 0.0);
    
    // Add ambient light with controlled intensity
    float light = uAmbientIntensity + diffuse * uDiffuseIntensity;
    
    // Base color - use the elevation data directly for coloring
    // This is independent of viewing angle
    vec3 baseColor = mix(
        uColor * 0.7,  // Darker color for valleys
        uColor * 1.3,  // Brighter color for peaks
        vElevation     // Use actual height data
    );
    
    // Apply lighting after the height-based coloring
    vec3 finalColor = baseColor * light;
    
    gl_FragColor = vec4(finalColor, 1.0);
}