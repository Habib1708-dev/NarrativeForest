uniform vec3 uColor;
uniform float uOpacity;
uniform float uFullOpacityY;
uniform float uFadeBlendRange;
uniform float uFadeAtTop;

varying float vY;

void main() {
  // Top of funnel = higher Y; fade at top, full opacity below uFullOpacityY.
  // t = 1 when y <= uFullOpacityY, t = 0 when y >= uFullOpacityY + uFadeBlendRange
  float t = smoothstep(uFullOpacityY + uFadeBlendRange, uFullOpacityY, vY);
  float opacity = mix(uOpacity * (1.0 - uFadeAtTop), uOpacity, t);

  gl_FragColor = vec4(uColor, opacity);
}
