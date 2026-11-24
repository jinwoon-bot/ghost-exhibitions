const vertex = `
attribute vec2 corner;
uniform vec2 screen;
uniform vec4 bounds;
varying vec2 uv;
void main() {
  uv = mix(vec2(-1.9, -.67), vec2(2.9, 1.63), corner);
  vec2 point = bounds.xy + uv * bounds.zw;
  gl_Position = vec4(point / screen * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const fragment = `
precision mediump float;
uniform sampler2D mask;
uniform vec4 effect;
varying vec2 uv;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 437.585);
}
float noise(vec2 p) {
  vec2 f = fract(p), i = floor(p);
  f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float powder(vec2 p, float delay) {
  float inside = step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);
  vec4 info = texture2D(mask, clamp(p, 0., 1.));
  float age = effect.x - info.r - delay;
  return inside * info.g * smoothstep(.005,.095,age) * (1.-smoothstep(.21,.66,age));
}
void main() {
  float life = effect.x;
  float strength = effect.y;
  float wind = effect.z;
  float seed = effect.w;
  float flow = smoothstep(.05,1.12,life) * strength;
  float current = noise(uv * vec2(2.8,5.) + vec2(seed, life*.94));
  float eddy = noise(uv * vec2(9.,13.) + seed);
  float flecks = noise(uv*vec2(119.,143.) + seed*.2);
  float threads = noise(vec2(uv.x*27.-uv.y*18., uv.y*83.) + seed*3.);
  float tail = (1.-smoothstep(1.04,1.50,life)) * min(1., strength);
  float bodyBand = smoothstep(.40,.91,uv.y);

  // Detached dense grains spread horizontally and fall toward the bottom of the frame.
  vec2 dark = uv - vec2(wind*(.59 + current*.89) + (current-.5)*.56,
                        bodyBand*.21 + (eddy-.43)*.43) * flow;
  dark.x = .5 + (dark.x-.5)/(1. + flow*.70);
  float ink = powder(dark,0.) * .98;
  ink = max(ink, powder(dark+vec2(wind*.25,-.03)*flow,.065)*.76);
  ink = max(ink, powder(dark+vec2(-wind*.18,.07)*flow,.14)*.49);
  ink *= smoothstep(.17,.70,flecks*.62+threads*.38) * (.70+bodyBand*.27) * tail;

  // The thinner fibers curl upward independently of the graphite-colored layer.
  vec2 arc = uv - vec2(wind*(.21+current*.37)+(eddy-.49)*.56,
                       -.42+(current-.41)*.36) * flow;
  float fiber = powder(arc,0.) + .47 * powder(arc+vec2(.045,-.06)*flow,.032);
  fiber *= smoothstep(.59,.91,flecks*.38+threads*.49+eddy*.21) * (1.-bodyBand*.55) * tail;
  fiber = min(.88,fiber);
  ink = min(.88,ink) * (1.-fiber);

  vec3 charcoal = vec3(.021,.025,.049) + current*.075;
  vec3 filament = mix(vec3(.69,.74,1.), vec3(1.,.96,.86), smoothstep(.42,.87,eddy));
  gl_FragColor = vec4(charcoal*ink + filament*fiber, ink+fiber);
}`;

export class InkPlume {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.textures = new Map();
    this.enabled = false;
    try {
      const gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false });
      if (!gl) return;
      const program = gl.createProgram();
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex],[gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      this.gl = gl;
      this.program = program;
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);
      const corner = gl.getAttribLocation(program, 'corner');
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = Object.fromEntries(['screen','bounds','effect','mask'].map(name => [name,gl.getUniformLocation(program, name)]));
      this.canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.enabled = false;
        this.gl = null;
        this.textures.clear();
      });
    } catch {
      this.gl = null;
    }
  }

  begin(width, height, allowed) {
    const gl = this.gl;
    this.enabled = Boolean(allowed && gl);
    if (!this.enabled) return;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.uniforms.screen, width, height);
  }

  draw(echo, stamp, box, progress) {
    if (!this.enabled || progress < .04 || echo.strength <= .01) return;
    const gl = this.gl, { w, h, pixels } = echo.snapshot;
    let texture = this.textures.get(echo.id);
    if (!texture) {
      const data = new Uint8Array(w * h * 4);
      for (let i = 0; i < pixels.length; i++) {
        data[i * 4] = stamp.threshold[i];
        data[i * 4 + 1] = pixels[i];
        data[i * 4 + 3] = 255;
      }
      texture = gl.createTexture();
      this.textures.set(echo.id, texture);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    } else gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uniforms.mask, 0);
    gl.uniform4f(this.uniforms.bounds, box.x, box.y, box.w, box.h);
    const wind = Math.abs(echo.drift) > .065
      ? Math.sign(echo.drift) * (.34 + Math.abs(echo.drift) * .66) : (echo.seed -.5)*1.68;
    gl.uniform4f(this.uniforms.effect, progress, echo.strength, wind, echo.seed * 27);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  release(id) {
    const texture = this.textures.get(id);
    if (texture) this.gl?.deleteTexture(texture);
    this.textures.delete(id);
  }

  dispose() {
    for (const id of this.textures.keys()) this.release(id);
    this.gl?.deleteBuffer(this.buffer);
    this.gl?.deleteProgram(this.program);
  }
}
