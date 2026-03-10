uniform float uSize;
uniform float uPixelRatio;
uniform float uViewportHeight;

attribute float phase;

varying float vPhase;

void main() {
  vPhase = phase / 6.28318530718;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  gl_PointSize = uSize * uPixelRatio * uViewportHeight * 0.5;
  gl_PointSize *= 1.0 / max(0.0001, -mvPosition.z);
}
