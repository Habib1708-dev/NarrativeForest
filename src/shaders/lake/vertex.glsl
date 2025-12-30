precision highp float;

uniform float uTime;

uniform float uWavesAmplitude;
uniform float uWavesSpeed;
uniform float uWavesFrequency;
uniform float uWavesPersistence;
uniform float uWavesLacunarity;
uniform float uWavesIterations;

varying vec3 vNormalW;        // world-space normal
varying vec3 vWorldPosition;  // world-space position
// vUv0 removed - was only used for dye system

// --- simplex 2D noise helpers ---
vec4 permute(vec4 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
vec3 taylorInvSqrt(vec3 r) {
  return vec3(1.79284291400159) - vec3(0.85373472095314) * r;
}

vec3 permute(vec3 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p*C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= taylorInvSqrt(a0*a0 + h*h);
  vec3 g;
  g.x = a0.x*x0.x + h.x*x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0 * dot(m,g);
}

float getElevation(float x, float z){
  float elevation = 0.0;
  float amplitude = 1.0;
  float frequency = uWavesFrequency;
  vec2 p = vec2(x, z);
  for (float i = 0.0; i < 32.0; i += 1.0) {
    if (i >= uWavesIterations) break;
    float n = snoise(p * frequency + uTime * uWavesSpeed);
    elevation += amplitude * n;
    amplitude *= uWavesPersistence;
    frequency *= uWavesLacunarity;
  }
  return elevation * uWavesAmplitude;
}

void main(){
  // world position
  vec4 wp = modelMatrix * vec4(position, 1.0);

  // displace in world Y by fBm on world XZ
  float elev = getElevation(wp.x, wp.z);
  wp.y += elev;

  // normal from partials in world space
  float eps = 0.001;
  float elev_dx = getElevation(wp.x - eps, wp.z);
  float elev_dz = getElevation(wp.x, wp.z - eps);
  vec3 t = normalize(vec3(eps, elev_dx - elev, 0.0));
  vec3 b = normalize(vec3(0.0, elev_dz - elev, eps));
  vec3 nW = normalize(cross(t, b));

  vNormalW = nW;
  vWorldPosition = wp.xyz;
  // vUv0 removed - was only used for dye system

  gl_Position = projectionMatrix * viewMatrix * wp;
}