attribute vec4 tangent;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vTangent;
varying vec3 vBitangent;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * modelPosition;

    vec3 modelNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec3 modelTangent = normalize((modelMatrix * vec4(tangent.xyz, 0.0)).xyz);
    vec3 modelBitangent = cross(modelNormal, modelTangent) * tangent.w;

    vUv = uv;
    vNormal = modelNormal;
    vTangent = modelTangent;
    vBitangent = modelBitangent;
    vPosition = modelPosition.xyz;
}
