const vertex = `
attribute vec2 corner;
uniform vec2 screen;
uniform vec4 bounds;
varying vec2 uv;
void main() {
  uv = mix(vec2(-2.7, -1.08), vec2(3.7, 1.9), corner);
  vec2 point = bounds.xy + uv * bounds.zw;
  gl_Position = vec4(point / screen * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const fragment = `
precision mediump float;
uniform sampler2D mask;
uniform vec3 effect;
uniform vec2 motion;
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
vec3 silhouette(vec2 p) {
  float inside = step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);
  return texture2D(mask, clamp(p, 0., 1.)).rgb * inside;
}
float powder(vec2 p, float delay) {
  vec3 info = silhouette(p);
  float age = effect.x - info.r - delay;
  return info.g * smoothstep(-.015,.10,age) * (1.-smoothstep(.23,.72,age));
}
void main() {
  float life = effect.x;
  float strength = effect.y;
  float seed = effect.z;
  float flow = smoothstep(.055,.80,life) * min(strength,1.45);
  float current = noise(uv*vec2(2.3,4.1) + vec2(seed,life*.72));
  float eddy = noise(uv*vec2(6.4,8.5) + vec2(seed*.71,-life*.53));
  float flecks = noise(uv*vec2(105.,211.) + seed*.2);
  float threads = noise(vec2(uv.x*46.-uv.y*33.,uv.y*81.) - life*2.3 + seed*3.);
  float tail = (1.-smoothstep(.98,1.55,life)) * min(1.,strength);
  float floorBand = smoothstep(.33,.98,uv.y);

  // Dark material spreads from the feet in a broad, irregular wake.
  vec2 dark = uv - vec2(motion.x*(.58+current*.92)+(eddy-.46)*.51,
                        .19+floorBand*.12+(current-.5)*.59+motion.y*.19)*flow;
  dark.x = .5+(dark.x-.5)/(1.+flow*(.68+floorBand*.85));
  float ink = .89*powder(dark,0.)
    + .49*powder(dark+vec2(motion.x*.41,-.11)*flow,.045)
    + .37*powder(dark+vec2(-motion.x*.24,.105)*flow,.11);
  float granulate = smoothstep(.23,.76,flecks*.57+threads*.43);
  float lowerFalloff = 1.-smoothstep(1.06,1.41,uv.y);
  ink *= (.12+.88*granulate)*(.61+floorBand*.39)*lowerFalloff*tail;

  // Pale strands twist upward from the parts of the silhouette that just broke away.
  vec2 arc = uv - vec2(motion.x*(.39+current*.68)+(eddy-.47)*.88,
                       -.51+(current-.48)*.47+motion.y*.50)*flow;
  float fiber = powder(arc,0.) + .54*powder(arc+vec2(-motion.x*.33,.12)*flow,.027);
  float wisps = smoothstep(.35,.73,threads*.54+eddy*.28+flecks*.18);
  float sparks = smoothstep(.68,.96,flecks)*smoothstep(.23,.66,eddy);
  fiber *= (.66*wisps+.83*sparks)*(1.-floorBand*.63)*tail;
  float edge = silhouette(uv).b;
  edge = max(edge, .44*(silhouette(uv+vec2(.026,0.)).b+silhouette(uv-vec2(.026,0.)).b));
  float bloom = edge*smoothstep(0.,.09,life)*(1.-smoothstep(.17,.48,life))*.48*strength;
  fiber = min(.94, fiber+bloom);
  ink = min(.92,ink)*(1.-fiber);

  vec3 charcoal = vec3(.018,.018,.036) + current*.072;
  vec3 filament = mix(vec3(.72,.81,1.),vec3(1.,.97,.90),smoothstep(.35,.75,eddy));
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
      this.uniforms = Object.fromEntries(['screen','bounds','effect','motion','mask'].map(name => [name,gl.getUniformLocation(program, name)]));
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

  begin(width, height, scale) {
    const gl = this.gl;
    this.enabled = Boolean(scale && gl);
    if (!this.enabled) return;
    const renderWidth = Math.max(1, Math.round(width * scale));
    const renderHeight = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== renderWidth || this.canvas.height !== renderHeight) {
      this.canvas.width = renderWidth;
      this.canvas.height = renderHeight;
    }
    gl.viewport(0, 0, renderWidth, renderHeight);
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
        data[i * 4 + 2] = stamp.contour[i];
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
    gl.uniform3f(this.uniforms.effect, progress, echo.strength, echo.seed * 27);
    gl.uniform2f(this.uniforms.motion, stamp.wind, stamp.lift);
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
