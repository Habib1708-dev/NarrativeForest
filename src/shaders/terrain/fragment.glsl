uniform vec3 uColor;
uniform float uElevation;

// We'll receive the normal from the vertex shader
varying vec3 vNormal;

void main() {
    // Calculate light direction (simple directional light)
    vec3 lightDirection = normalize(vec3(0.5, 1.0, 0.3));
    
    // Calculate diffuse lighting
    float diffuse = max(dot(vNormal, lightDirection), 0.0);
    
    // Add ambient light
    float light = 0.3 + diffuse * 0.7;
    
    // Base color (dark gray)
    vec3 color = uColor;
    
    // Apply height-based coloring
    // Higher areas are slightly lighter
    float heightFactor = clamp(vNormal.y * 0.5 + 0.5, 0.0, 1.0);
    color = mix(color * 0.8, color * 1.2, heightFactor);
    
    // Apply lighting
    color = color * light;
    
    gl_FragColor = vec4(color, 1.0);
}