import * as THREE from 'three';

// One draw call for thousands of camera-facing sprites. Used for enemy bullets, player shots,
// sparks, glows, smoke, shockwave rings and score stars.
//
// Every sprite writes premultiplied colour. The `additive` parameter blends between normal
// alpha compositing (0) and pure additive light (1). Passthrough rooms are often bright, so
// anything the player must read (bullets) keeps a dark rim and real alpha instead of relying on glow.

export const SHAPE = {
  ORB: 0, // enemy bullet: white core, coloured body, dark rim
  GLOW: 1, // soft radial light
  SPARK: 2, // hot streak (use stretch)
  RING: 3, // thin shockwave ring
  SMOKE: 4, // soft dark puff
  STAR: 5, // four-point flare
  BOLT: 6, // player shot: bright capsule with coloured edge
  HEX: 7, // pickup / score star
};

const vertexShader = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aColor;   // rgb, alpha
attribute vec4 aParams;  // size, additive, shape, stretch
attribute vec4 aVel;     // velocity xyz (for stretch), rotation
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vShape;
void main() {
  vUv = position.xy + 0.5;
  vColor = aColor;
  vShape = aParams.yz;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vec2 corner = position.xy;
  float c = cos(aVel.w), s = sin(aVel.w);
  corner = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
  float size = aParams.x;
  vec2 offset = corner * size;
  if (aParams.w > 0.0) {
    // Motion streak: stretch along the on-screen velocity, trailing behind the head.
    vec3 vv = (modelViewMatrix * vec4(aVel.xyz, 0.0)).xyz;
    vec3 p1 = mv.xyz + vv * aParams.w;
    float z0 = max(-mv.z, 0.01);
    float z1 = max(-p1.z, 0.01);
    vec2 dir = (p1.xy / z1 - mv.xy / z0) * z0;
    float len = length(dir);
    if (len > 1e-5) {
      vec2 d = dir / len;
      vec2 n = vec2(-d.y, d.x);
      offset = d * (position.y * (size + len) - len * 0.5) + n * position.x * size;
    }
  }
  mv.xy += offset;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying vec2 vShape;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  int shape = int(vShape.y + 0.5);
  vec3 col = vColor.rgb;
  float a = 0.0;
  if (shape == 0) {
    if (r > 1.0) discard;
    float core = smoothstep(0.46, 0.30, r);
    float body = smoothstep(0.80, 0.70, r);
    float rim = smoothstep(1.0, 0.88, r);
    vec3 c = mix(vec3(0.03, 0.0, 0.04), col, body);
    c = mix(c, vec3(1.0), core);
    col = c;
    a = rim;
  } else if (shape == 1) {
    a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.85, 1.0, r));
  } else if (shape == 2) {
    a = exp(-r * r * 6.0) * (1.0 - smoothstep(0.8, 1.0, r));
    col = mix(col, vec3(1.0), exp(-r * r * 30.0));
  } else if (shape == 3) {
    float d = abs(r - 0.82);
    a = smoothstep(0.16, 0.0, d);
    col = mix(col, vec3(1.0), smoothstep(0.05, 0.0, d) * 0.6);
  } else if (shape == 4) {
    a = smoothstep(1.0, 0.1, r) * 0.85;
  } else if (shape == 5) {
    float arms = max(exp(-abs(p.x) * 18.0) * (1.0 - abs(p.y)), exp(-abs(p.y) * 18.0) * (1.0 - abs(p.x)));
    float core = exp(-r * r * 9.0);
    a = clamp(arms + core, 0.0, 1.0) * (1.0 - smoothstep(0.9, 1.0, r));
    col = mix(col, vec3(1.0), core);
  } else if (shape == 6) {
    if (r > 1.0) discard;
    float core = smoothstep(0.55, 0.25, r);
    float body = smoothstep(1.0, 0.6, r);
    col = mix(col, vec3(1.0), core);
    a = body;
  } else {
    // hexagon-ish gem
    vec2 q = abs(p);
    float h = max(q.x * 0.866 + q.y * 0.5, q.y);
    if (h > 1.0) discard;
    float edge = smoothstep(1.0, 0.85, h);
    float inner = smoothstep(0.55, 0.35, h);
    col = mix(col * 0.35, col, edge);
    col = mix(col, vec3(1.0), inner);
    a = edge;
  }
  a *= vColor.a;
  float additive = vShape.x;
  gl_FragColor = vec4(col * a, a * (1.0 - additive * 0.85));
}
`;

export class Billboards {
  constructor(capacity, { renderOrder = 10, depthTest = true } = {}) {
    this.capacity = capacity;
    this.count = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.par = new Float32Array(capacity * 4);
    this.vel = new Float32Array(capacity * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(this.par, 4).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(this.vel, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aParams', this.aPar);
    geo.setAttribute('aVel', this.aVel);
    geo.instanceCount = 0;
    this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin() {
    this.count = 0;
  }

  /** Append one sprite. Silently drops when full. */
  push(x, y, z, size, r, g, b, a, shape = SHAPE.GLOW, additive = 0, vx = 0, vy = 0, vz = 0, stretch = 0, rot = 0) {
    const i = this.count;
    if (i >= this.capacity) return;
    this.count++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.par[i4] = size; this.par[i4 + 1] = additive; this.par[i4 + 2] = shape; this.par[i4 + 3] = stretch;
    this.vel[i4] = vx; this.vel[i4 + 1] = vy; this.vel[i4 + 2] = vz; this.vel[i4 + 3] = rot;
  }

  end() {
    const n = this.count;
    this.geometry.instanceCount = n;
    for (const [attr, w] of [[this.aPos, 3], [this.aCol, 4], [this.aPar, 4], [this.aVel, 4]]) {
      attr.clearUpdateRanges();
      if (n > 0) attr.addUpdateRange(0, n * w);
      attr.needsUpdate = true;
    }
  }
}
