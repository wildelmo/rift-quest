import * as THREE from 'three';

// Xortex's arena is wrapped in giant hexagonal LED screens. In mixed reality we hang those
// screens on your real walls: dot-matrix hex panels that switch on cell by cell from the
// centre, scroll neon stripes, and spell out wave announcements in giant LED letters.

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const frag = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime;
uniform float uOn;
uniform float uAspect;
uniform vec2 uOffset;
uniform float uScale;
varying vec2 vUv;

vec4 hexCoords(vec2 uv) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(uv - hC.xy * s, uv - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}
float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, vec2(0.5, 0.8660254)), p.x);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 P = vec2(vUv.x * uAspect, vUv.y) * uScale;
  vec4 h = hexCoords(P);
  vec2 center = P - h.xy;
  float d = hexDist(h.xy);
  float rnd = hash(h.zw);
  // cells light up outward from the middle of the panel
  vec2 mid = vec2(uAspect, 1.0) * uScale * 0.5;
  float far = length((center - mid) / (vec2(uAspect, 1.0) * uScale * 0.5));
  float on = smoothstep(far * 0.85 + rnd * 0.15, far * 0.85 + rnd * 0.15 + 0.05, uOn * 1.15);
  float flicker = on < 0.99 ? step(0.5, fract(rnd * 31.0 + uTime * 12.0)) : 1.0;
  // ragged oval silhouette, so it reads as screens bolted to the wall rather than a rectangle
  float mask = 1.0 - smoothstep(0.86, 1.0, far + rnd * 0.12);
  if (mask <= 0.0) discard;

  // LED dot matrix inside each cell
  float res = 26.0;
  vec2 cell = floor(P * res) + 0.5;
  vec2 duv = cell / res / uScale;
  duv.x /= uAspect;
  vec3 led = texture2D(uTex, fract(duv + uOffset)).rgb;
  float dotm = smoothstep(0.46, 0.28, length(fract(P * res) - 0.5));
  vec3 col = vec3(0.012, 0.016, 0.03) + led * (dotm * 1.25 + 0.06);
  col *= 0.75 + 0.25 * rnd;
  col *= on * flicker;

  // metal hex frame
  float frame = smoothstep(0.44, 0.47, d);
  float bevel = smoothstep(0.47, 0.5, d);
  vec3 frameCol = mix(vec3(0.32, 0.4, 0.5), vec3(0.08, 0.1, 0.13), bevel);
  col = mix(col, frameCol, frame);

  float a = mask * mix(0.92 * max(on, 0.25), 0.95, frame);
  gl_FragColor = vec4(col * a, a);
}
`;

const SLOTS = [
  { name: 'front', dir: [0, 0.14, -1], dist: 3.4, w: 3.6, h: 1.9, offset: [0, 0] },
  { name: 'left', dir: [-1, 0.12, -0.45], dist: 2.5, w: 2.6, h: 1.7, offset: [0.37, 0.11] },
  { name: 'right', dir: [1, 0.12, -0.45], dist: 2.5, w: 2.6, h: 1.7, offset: [0.61, 0.53] },
];

export class Screens {
  constructor(room) {
    this.room = room;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 176;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.panels = [];
    for (const s of SLOTS) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
        uniforms: {
          uTex: { value: this.texture }, uTime: { value: 0 }, uOn: { value: 0 }, uAspect: { value: s.w / s.h },
          uOffset: { value: new THREE.Vector2(...s.offset) }, uScale: { value: 3.4 },
        },
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
      mesh.renderOrder = -5;
      mesh.visible = false;
      room.arena.add(mesh);
      this.panels.push({ slot: s, mesh, mat });
    }
    this.on = 0;
    this.target = 0;
    this.mode = 'idle';
    this.text = '';
    this.sub = '';
    this.textT = 0;
    this.drawTimer = 0;
    this.t = 0;
    this.layout();
  }

  layout() {
    const room = this.room;
    for (const p of this.panels) {
      const dir = new THREE.Vector3(...p.slot.dir).normalize();
      const hit = room.raycastWalls(dir, p.slot.dist + 2);
      let pos, normal;
      if (hit && Math.abs(hit.normal.y) < 0.5) {
        normal = hit.normal.clone();
        pos = hit.point.clone().addScaledVector(normal, 0.004);
      } else {
        pos = dir.clone().multiplyScalar(p.slot.dist);
        normal = new THREE.Vector3(-dir.x, 0, -dir.z).normalize();
      }
      // keep panels between the floor and a typical ceiling
      const lo = room.floorY + p.slot.h * 0.5 + 0.15, hi = room.floorY + 2.45 - p.slot.h * 0.5;
      pos.y = Math.min(Math.max(pos.y, lo), Math.max(lo, hi));
      p.mesh.position.copy(pos);
      p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    }
  }

  /** mode: idle | wave | warning | boss | clear */
  setMode(mode) {
    this.mode = mode;
  }

  announce(text, sub = '', seconds = 3) {
    this.text = text;
    this.sub = sub;
    this.textT = seconds;
  }

  setOn(v) {
    this.target = v;
  }

  _draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    const t = this.t;
    const m = this.mode;
    ctx.fillStyle = m === 'warning' || m === 'boss' ? '#120205' : '#04060f';
    ctx.fillRect(0, 0, W, H);
    // big diagonal neon swathes
    const palettes = {
      idle: ['#33e1ff', '#2236ff', '#e8203a', '#9fb7ff'],
      wave: ['#33e1ff', '#2236ff', '#e8203a', '#ffffff'],
      clear: ['#ffd23a', '#33e1ff', '#ff8a1a', '#ffffff'],
      warning: ['#ff1030', '#3a0008', '#ff5060', '#200004'],
      boss: ['#e8203a', '#5a0a18', '#33e1ff', '#2a0610'],
    };
    const pal = palettes[m] || palettes.idle;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.5);
    const speed = m === 'warning' ? 160 : 26;
    for (let i = -8; i < 8; i++) {
      const x = ((i * 46 + t * speed) % 736) - 368;
      ctx.fillStyle = pal[(i + 8) % pal.length];
      ctx.globalAlpha = 0.9;
      ctx.fillRect(x, -240, (i % 3 === 0 ? 14 : 34), 480);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (m === 'warning') {
      ctx.fillStyle = Math.floor(t * 3) % 2 ? 'rgba(255,20,40,0.35)' : 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.textT > 0 && this.text) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, H * 0.22, W, H * 0.56);
      ctx.fillStyle = m === 'warning' ? '#ff4050' : '#ffffff';
      ctx.font = `900 ${this.sub ? 58 : 72}px "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.text, W / 2, H * (this.sub ? 0.43 : 0.5), W * 0.94);
      if (this.sub) {
        ctx.font = '700 24px "Courier New", monospace';
        ctx.fillStyle = '#9ff0ff';
        ctx.fillText(this.sub, W / 2, H * 0.66, W * 0.94);
      }
    }
    this.texture.needsUpdate = true;
  }

  update(dt) {
    this.t += dt;
    this.on += (this.target - this.on) * (1 - Math.exp(-(this.target > this.on ? 0.9 : 2.5) * dt));
    if (Math.abs(this.on - this.target) < 0.002) this.on = this.target;
    if (this.textT > 0) this.textT -= dt;
    this.drawTimer -= dt;
    const visible = this.on > 0.01;
    if (visible && this.drawTimer <= 0) {
      this.drawTimer = 1 / 20;
      this._draw();
    }
    for (const p of this.panels) {
      p.mesh.visible = visible;
      p.mat.uniforms.uOn.value = this.on;
      p.mat.uniforms.uTime.value = this.t;
    }
  }
}
