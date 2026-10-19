/**
 * GPU effects: a chain of fragment shaders run over a frame (a clip's picture,
 * or the whole composed canvas for effects on the effects track). Each pass
 * reads the previous result; the last one lands on the returned canvas.
 */

export interface ShaderLayer {
  type: string;
  intensity: number; // 0..1
  speed: number; // 0.25..3
  color: string; // '#rrggbb'
}

const HEADER = `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_amt;
uniform float u_speed;
uniform vec3 u_color;
float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 tex(vec2 uv) { return texture2D(u_tex, clamp(uv, 0.0, 1.0)); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float sobel(vec2 uv) {
  vec2 px = 1.0 / u_res;
  float tl = luma(tex(uv + px * vec2(-1.0, 1.0)).rgb), t = luma(tex(uv + px * vec2(0.0, 1.0)).rgb), tr = luma(tex(uv + px * vec2(1.0, 1.0)).rgb);
  float l = luma(tex(uv + px * vec2(-1.0, 0.0)).rgb), r = luma(tex(uv + px * vec2(1.0, 0.0)).rgb);
  float bl = luma(tex(uv + px * vec2(-1.0, -1.0)).rgb), b = luma(tex(uv + px * vec2(0.0, -1.0)).rgb), br = luma(tex(uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return sqrt(gx * gx + gy * gy);
}
`;

/** Shows a tile of the frame cover-cropped into a grid cell, so split screens don't stretch. */
const SPLIT = (cols: string, rows: string) => `
  float cols = ${cols}; float rows = ${rows};
  vec2 cell = fract(v_uv * vec2(cols, rows));
  float ta = (u_res.x / cols) / (u_res.y / rows);
  float sa = u_res.x / u_res.y;
  vec2 s = ta > sa ? vec2(1.0, sa / ta) : vec2(ta / sa, 1.0);
  gl_FragColor = tex(0.5 + (cell - 0.5) * s);`;

/** Fragment shader bodies (the code inside main). t = time scaled by speed. */
const BODIES: Record<string, string> = {
  // ---- lens
  fisheye: `
  vec2 p = v_uv * 2.0 - 1.0; float r = length(p);
  float k = 0.7 * u_amt;
  vec2 q = p * (1.0 - k + k * r * r);
  gl_FragColor = (abs(q.x) > 1.0 || abs(q.y) > 1.0) ? vec4(0.0, 0.0, 0.0, 1.0) : tex(q * 0.5 + 0.5);`,
  mirror: `
  vec2 uv = v_uv; if (uv.x > 0.5) uv.x = 1.0 - uv.x;
  gl_FragColor = mix(tex(v_uv), tex(uv), clamp(u_amt * 2.0, 0.0, 1.0));`,
  kaleido: `
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float n = floor(4.0 + u_amt * 6.0);
  float a = atan(p.y, p.x) + t * 0.25;
  float seg = 6.2831853 / n;
  a = mod(a, seg); a = abs(a - seg * 0.5);
  vec2 q = length(p) * vec2(cos(a), sin(a));
  gl_FragColor = tex(q / vec2(u_res.x / u_res.y, 1.0) + 0.5);`,
  magnify: `
  vec2 c = vec2(0.5 + 0.25 * sin(t * 0.7), 0.5 + 0.2 * cos(t * 0.5));
  vec2 d = (v_uv - c) * vec2(u_res.x / u_res.y, 1.0);
  float r = 0.28;
  float inside = 1.0 - smoothstep(r - 0.01, r, length(d));
  vec2 uv = mix(v_uv, c + (v_uv - c) / (1.0 + 1.5 * u_amt), inside);
  vec4 col = tex(uv);
  float ring = smoothstep(r - 0.012, r - 0.004, length(d)) * (1.0 - smoothstep(r - 0.004, r, length(d)));
  gl_FragColor = mix(col, vec4(1.0), ring * 0.8);`,
  // ---- distort
  ripple: `
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float d = length(p);
  vec2 dir = d > 0.0 ? p / d : vec2(0.0);
  vec2 uv = v_uv + dir * sin(d * 40.0 - t * 6.0) * 0.012 * u_amt / vec2(u_res.x / u_res.y, 1.0);
  gl_FragColor = tex(uv);`,
  swirl: `
  vec2 p = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float r = length(p); float radius = 0.6;
  float k = r < radius ? (1.0 - r / radius) : 0.0;
  float a = k * k * 4.0 * u_amt * sin(t * 0.8 + 1.0);
  vec2 q = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
  gl_FragColor = tex(q / vec2(u_res.x / u_res.y, 1.0) + 0.5);`,
  wave: `
  vec2 uv = v_uv;
  uv.x += sin(uv.y * 14.0 + t * 4.0) * 0.018 * u_amt;
  uv.y += cos(uv.x * 10.0 + t * 3.0) * 0.008 * u_amt;
  gl_FragColor = tex(uv);`,
  pixelate: `
  float block = mix(2.0, 48.0, u_amt * (0.65 + 0.35 * sin(t * 2.0)));
  vec2 cell = floor(v_uv * u_res / block) * block + block * 0.5;
  gl_FragColor = tex(cell / u_res);`,
  // ---- light
  bloom: `
  vec4 c = tex(v_uv); vec3 glow = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.3927; float r = (mod(float(i), 2.0) + 1.0) * 6.0;
    vec3 s = tex(v_uv + vec2(cos(a), sin(a)) * r / u_res * (1.0 + 2.0 * u_amt)).rgb;
    glow += max(s - 0.55, 0.0);
  }
  gl_FragColor = vec4(c.rgb + glow / 16.0 * 4.0 * u_amt, c.a);`,
  'neon-edges': `
  float e = smoothstep(0.08, 0.5, sobel(v_uv));
  vec3 hue = 0.5 + 0.5 * cos(6.2831853 * (v_uv.x * 0.5 + t * 0.15 + vec3(0.0, 0.33, 0.67)));
  vec3 neon = mix(u_color, hue, 0.5) * e * 1.8;
  vec4 c = tex(v_uv);
  gl_FragColor = vec4(mix(c.rgb, c.rgb * 0.15 + neon, u_amt), c.a);`,
  'light-leak': `
  vec4 c = tex(v_uv);
  vec2 a = vec2(0.15 + 0.3 * sin(t * 0.4), 0.85); vec2 b = vec2(0.9, 0.3 + 0.3 * cos(t * 0.3));
  float l1 = exp(-pow(distance(v_uv, a) * 2.2, 2.0)); float l2 = exp(-pow(distance(v_uv, b) * 2.6, 2.0));
  vec3 leak = vec3(1.0, 0.45, 0.15) * l1 + vec3(1.0, 0.2, 0.5) * l2;
  vec3 screen = 1.0 - (1.0 - c.rgb) * (1.0 - leak * u_amt);
  gl_FragColor = vec4(screen, c.a);`,
  'lens-flare': `
  vec4 c = tex(v_uv);
  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 f = vec2(0.25 + 0.5 * (0.5 + 0.5 * sin(t * 0.35)), 0.75);
  vec2 d = (v_uv - f) * asp;
  float core = 0.012 / max(length(d), 0.002);
  vec3 col = vec3(1.0, 0.9, 0.7) * core;
  vec2 axis = (vec2(0.5) - f);
  for (int i = 1; i < 5; i++) {
    vec2 g = f + axis * float(i) * 0.5;
    float r = 0.03 + 0.02 * float(i);
    col += vec3(0.4, 0.6, 1.0) * 0.25 * (1.0 - smoothstep(r * 0.6, r, length((v_uv - g) * asp)));
  }
  gl_FragColor = vec4(c.rgb + col * u_amt, c.a);`,
  // ---- retro
  'film-grain': `
  vec4 c = tex(v_uv + vec2(0.0, (rand(vec2(floor(t * 12.0))) - 0.5) * 0.002));
  float g = (rand(v_uv * u_res + fract(t * 7.0) * 100.0) - 0.5) * 0.28 * u_amt;
  float flick = 1.0 + (rand(vec2(floor(t * 14.0), 3.0)) - 0.5) * 0.12 * u_amt;
  vec3 sepia = vec3(dot(c.rgb, vec3(0.393, 0.769, 0.189)), dot(c.rgb, vec3(0.349, 0.686, 0.168)), dot(c.rgb, vec3(0.272, 0.534, 0.131)));
  vec3 col = mix(c.rgb, sepia, 0.35 * u_amt) * flick + g;
  float sx = floor(v_uv.x * 220.0);
  if (rand(vec2(sx, floor(t * 10.0))) > 0.994) col *= 0.55;
  vec2 p = v_uv - 0.5; col *= 1.0 - dot(p, p) * 1.4 * u_amt;
  gl_FragColor = vec4(col, c.a);`,
  crt: `
  vec2 p = v_uv * 2.0 - 1.0;
  p *= 1.0 + 0.12 * u_amt * dot(p.yx, p.yx);
  vec2 uv = p * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float off = 0.0015 * u_amt;
  vec3 col = vec3(tex(uv + vec2(off, 0.0)).r, tex(uv).g, tex(uv - vec2(off, 0.0)).b);
  col *= 0.8 + 0.2 * sin(uv.y * u_res.y * 1.5 + t * 8.0);
  float m = mod(floor(gl_FragCoord.x), 3.0);
  col *= mix(vec3(1.0), m < 1.0 ? vec3(1.15, 0.9, 0.9) : m < 2.0 ? vec3(0.9, 1.15, 0.9) : vec3(0.9, 0.9, 1.15), u_amt);
  col *= 1.0 - dot(p, p) * 0.25;
  gl_FragColor = vec4(col, 1.0);`,
  'vhs-pro': `
  vec2 uv = v_uv;
  float band = fract(t * 0.25);
  float inBand = 1.0 - smoothstep(0.0, 0.04, abs(uv.y - band));
  uv.x += (rand(vec2(floor(uv.y * 120.0), floor(t * 20.0))) - 0.5) * 0.04 * inBand * u_amt;
  uv.x += sin(uv.y * 40.0 + t * 3.0) * 0.0015 * u_amt;
  float off = 0.006 * u_amt;
  vec3 col = vec3(tex(uv + vec2(off, 0.0)).r, tex(uv).g, tex(uv - vec2(off, 0.0)).b);
  col += (rand(uv * u_res + t) - 0.5) * 0.12 * u_amt;
  col = mix(col, col * vec3(1.05, 0.95, 1.1), u_amt);
  gl_FragColor = vec4(col, 1.0);`,
  // ---- art
  cartoon: `
  vec4 c = tex(v_uv);
  float levels = mix(10.0, 4.0, u_amt);
  vec3 q = floor(c.rgb * levels + 0.5) / levels;
  float e = smoothstep(0.25, 0.6, sobel(v_uv));
  gl_FragColor = vec4(mix(c.rgb, q * (1.0 - e), u_amt), c.a);`,
  halftone: `
  float size = mix(4.0, 14.0, u_amt);
  vec2 px = v_uv * u_res;
  vec2 cellC = (floor(px / size) + 0.5) * size;
  vec3 c = tex(cellC / u_res).rgb;
  float r = (1.0 - luma(c)) * size * 0.7;
  float dot_ = 1.0 - smoothstep(r - 1.0, r, length(px - cellC));
  vec3 ink = mix(vec3(0.08), c * 0.6, 0.5);
  gl_FragColor = vec4(mix(vec3(0.97, 0.95, 0.9), ink, dot_), 1.0);`,
  duotone: `
  vec4 c = tex(v_uv); float l = luma(c.rgb);
  vec3 tone = mix(vec3(0.08, 0.05, 0.25), u_color, smoothstep(0.05, 0.95, l));
  gl_FragColor = vec4(mix(c.rgb, tone, u_amt), c.a);`,
  thermal: `
  vec4 c = tex(v_uv); float l = luma(c.rgb);
  vec3 h = l < 0.25 ? mix(vec3(0.0, 0.0, 0.3), vec3(0.4, 0.0, 0.7), l / 0.25)
         : l < 0.5 ? mix(vec3(0.4, 0.0, 0.7), vec3(1.0, 0.0, 0.2), (l - 0.25) / 0.25)
         : l < 0.75 ? mix(vec3(1.0, 0.0, 0.2), vec3(1.0, 0.8, 0.0), (l - 0.5) / 0.25)
         : mix(vec3(1.0, 0.8, 0.0), vec3(1.0), (l - 0.75) / 0.25);
  gl_FragColor = vec4(mix(c.rgb, h, u_amt), c.a);`,
  sketch: `
  float e = sobel(v_uv);
  float pencil = 1.0 - smoothstep(0.05, 0.45, e);
  float paper = 0.95 + (rand(floor(v_uv * u_res / 2.0)) - 0.5) * 0.06;
  vec3 col = vec3(pencil * paper);
  gl_FragColor = vec4(mix(tex(v_uv).rgb, col, u_amt), 1.0);`,
  posterize: `
  vec4 c = tex(v_uv);
  float levels = mix(12.0, 3.0, u_amt);
  gl_FragColor = vec4(floor(c.rgb * levels + 0.5) / levels, c.a);`,
  // ---- motion
  'motion-blur': `
  vec4 acc = vec4(0.0);
  float span = 0.04 * u_amt * (0.6 + 0.4 * sin(t * 2.0));
  for (int i = 0; i < 16; i++) acc += tex(v_uv + vec2((float(i) / 15.0 - 0.5) * span, 0.0));
  gl_FragColor = acc / 16.0;`,
  'radial-blur': `
  vec4 acc = vec4(0.0);
  vec2 dir = v_uv - 0.5;
  float span = 0.12 * u_amt * (0.6 + 0.4 * sin(t * 2.5));
  for (int i = 0; i < 16; i++) acc += tex(v_uv - dir * span * float(i) / 15.0);
  gl_FragColor = acc / 16.0;`,
  chromatic: `
  vec2 dir = (v_uv - 0.5);
  float k = 0.025 * u_amt * (0.7 + 0.3 * sin(t * 3.0));
  gl_FragColor = vec4(tex(v_uv + dir * k).r, tex(v_uv).g, tex(v_uv - dir * k).b, 1.0);`,
  // ---- split screen
  'split-2': `float portrait = u_res.y > u_res.x ? 1.0 : 0.0;` + SPLIT('portrait > 0.5 ? 1.0 : 2.0', 'portrait > 0.5 ? 2.0 : 1.0'),
  'split-3': `float portrait = u_res.y > u_res.x ? 1.0 : 0.0;` + SPLIT('portrait > 0.5 ? 1.0 : 3.0', 'portrait > 0.5 ? 3.0 : 1.0'),
  'split-4': SPLIT('2.0', '2.0'),
  'split-9': SPLIT('3.0', '3.0'),
};

export const SHADER_TYPES = new Set(Object.keys(BODIES));

const VERT = `attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

interface Program {
  prog: WebGLProgram;
  loc: Record<string, WebGLUniformLocation | null>;
}

let gl: WebGLRenderingContext | null = null;
let glCanvas: HTMLCanvasElement | null = null;
let failed = false;
const programs = new Map<string, Program | null>();
let srcTex: WebGLTexture | null = null;
const targets: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }[] = [];

function init(): WebGLRenderingContext | null {
  if (gl || failed) return gl;
  try {
    glCanvas = document.createElement('canvas');
    gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false }) as WebGLRenderingContext | null;
    if (!gl) throw new Error('no webgl');
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    srcTex = makeTexture(gl);
  } catch {
    failed = true;
    gl = null;
  }
  return gl;
}

function makeTexture(g: WebGLRenderingContext): WebGLTexture {
  const t = g.createTexture()!;
  g.bindTexture(g.TEXTURE_2D, t);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  return t;
}

function program(g: WebGLRenderingContext, type: string): Program | null {
  if (programs.has(type)) return programs.get(type)!;
  const body = BODIES[type];
  let result: Program | null = null;
  if (body) {
    const compile = (kind: number, src: string) => {
      const s = g.createShader(kind)!;
      g.shaderSource(s, src);
      g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) {
        console.warn(`Effect "${type}" failed to compile:`, g.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = compile(g.VERTEX_SHADER, VERT);
    const fs = compile(g.FRAGMENT_SHADER, `${HEADER}\nvoid main() {\n  float t = u_time * u_speed;\n${body}\n}`);
    if (vs && fs) {
      const prog = g.createProgram()!;
      g.attachShader(prog, vs);
      g.attachShader(prog, fs);
      g.bindAttribLocation(prog, 0, 'a_pos');
      g.linkProgram(prog);
      if (g.getProgramParameter(prog, g.LINK_STATUS)) {
        const loc: Program['loc'] = {};
        for (const name of ['u_tex', 'u_res', 'u_time', 'u_amt', 'u_speed', 'u_color']) loc[name] = g.getUniformLocation(prog, name);
        result = { prog, loc };
      }
    }
  }
  programs.set(type, result);
  return result;
}

function target(g: WebGLRenderingContext, i: number, w: number, h: number) {
  let t = targets[i];
  if (!t) {
    t = { tex: makeTexture(g), fb: g.createFramebuffer()!, w: 0, h: 0 };
    targets[i] = t;
  }
  if (t.w !== w || t.h !== h) {
    g.bindTexture(g.TEXTURE_2D, t.tex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    g.bindFramebuffer(g.FRAMEBUFFER, t.fb);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t.tex, 0);
    t.w = w;
    t.h = h;
  }
  return t;
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt((hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Runs the shader layers over a frame of w×h and returns the canvas holding the
 * result (valid until the next call), or null when WebGL isn't available.
 */
export function runShaders(src: TexImageSource, w: number, h: number, layers: ShaderLayer[], time: number): HTMLCanvasElement | null {
  const g = init();
  const passes = layers.map((l) => ({ l, p: g ? program(g, l.type) : null })).filter((x) => x.p);
  if (!g || !glCanvas || !passes.length) return null;
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  if (glCanvas.width !== w || glCanvas.height !== h) {
    glCanvas.width = w;
    glCanvas.height = h;
  }
  g.bindTexture(g.TEXTURE_2D, srcTex);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
  g.enableVertexAttribArray(0);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  let input = srcTex;
  passes.forEach(({ l, p }, i) => {
    const last = i === passes.length - 1;
    const out = last ? null : target(g, i % 2, w, h);
    g.bindFramebuffer(g.FRAMEBUFFER, out ? out.fb : null);
    g.viewport(0, 0, w, h);
    g.useProgram(p!.prog);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, input);
    g.uniform1i(p!.loc.u_tex, 0);
    g.uniform2f(p!.loc.u_res, w, h);
    g.uniform1f(p!.loc.u_time, time);
    g.uniform1f(p!.loc.u_amt, Math.min(1, Math.max(0, l.intensity)));
    g.uniform1f(p!.loc.u_speed, l.speed || 1);
    g.uniform3f(p!.loc.u_color, ...hexRgb(l.color));
    g.drawArrays(g.TRIANGLES, 0, 6);
    if (out) input = out.tex;
  });
  return glCanvas;
}
