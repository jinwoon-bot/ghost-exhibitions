const vertex = `
attribute vec2 corner;
uniform vec2 screen;
uniform vec4 bounds;
uniform vec4 spread;
varying mediump vec2 uv;
void main() {
  uv = mix(spread.xy,spread.zw,corner);
  vec2 point = bounds.xy + uv * bounds.zw;
  gl_Position = vec4(point / screen * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`;

const fragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D mask;
uniform sampler2D flowField;
uniform float density;
uniform vec3 effect;
uniform vec2 motion;
varying mediump vec2 uv;
float noise(vec2 p) {
  vec2 f = fract(p);
  f = f*f*(3.-2.*f);
  return texture2D(flowField,(floor(p)+f+.5)/64.).r;
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
vec2 turbulence(vec2 p, float seed, float phase) {
  vec2 domain = p*vec2(4.8,7.0) + vec2(seed,-phase*2.1);
  return vec2(noise(domain),noise(domain*.93+vec2(2.5,8.06))) - .5;
}
void main() {
  float life = effect.x;
  float strength = effect.y;
  float seed = effect.z;
  float flow = smoothstep(.055,.80,life) * min(strength,1.45);
  float current = noise(uv*vec2(2.3,4.1) + vec2(seed,life*.72));
  float eddy = noise(uv*vec2(6.4,8.5) + vec2(seed*.71,-life*.53));
  float tail = (1.-smoothstep(.98,1.55,life)) * min(1.,strength);
  float floorBand = smoothstep(.33,.98,uv.y);
  vec2 curl = turbulence(uv,seed,life);

  // Dark material spreads from the feet in a broad, irregular wake.
  vec2 dark = uv - vec2(motion.x*(.47+current*.79)+curl.y*.65,
                        .14+floorBand*.12+curl.x*.44+motion.y*.19)*flow;
  dark.x = .5+(dark.x-.5)/(1.+flow*(.45+floorBand*.88));
  float ink = .84*powder(dark,0.)
    + .47*powder(dark+vec2(motion.x*.38,-.105)*flow,.045)
    + .29*powder(dark+vec2(-motion.x*.26,.08)*flow,.12);
  float soot = noise(dark*vec2(132.,192.)+vec2(seed,life*11.));
  float clumps = noise(dark*vec2(27.,42.)+seed);
  float granulate = smoothstep(.27,.79,soot*.68+clumps*.32);
  float lowerFalloff = 1.-smoothstep(1.02,1.39,uv.y);
  ink *= (.08+.92*granulate)*(.52+floorBand*.48)*lowerFalloff*tail*density;

  // Pale strands twist upward from the parts of the silhouette that just broke away.
  vec2 arc = uv - vec2(motion.x*(.31+current*.51)+curl.y*.84,
                       -.47+curl.x*.43+motion.y*.49)*flow;
  float fiber = powder(arc,0.) + .46*powder(arc+vec2(-motion.x*.36,.117)*flow,.038);
  float thread = noise(vec2(arc.x*53.-arc.y*31.,arc.y*65.)+seed*3.);
  float splinters = noise(arc*vec2(144.,177.)+seed);
  float wisps = smoothstep(.36,.76,thread*.61+eddy*.39);
  float sparks = smoothstep(.64,.94,splinters)*smoothstep(.23,.66,eddy);
  fiber *= (.62*wisps+.72*sparks)*(1.-floorBand*.65)*tail*density;
  float edge = silhouette(uv).b;
  edge = max(edge, .44*(silhouette(uv+vec2(.026,0.)).b+silhouette(uv-vec2(.026,0.)).b));
  float bloom = edge*smoothstep(0.,.09,life)*(1.-smoothstep(.17,.48,life))*.48*strength;
  fiber = min(.94, fiber+bloom);
  ink = min(.92,ink)*(1.-fiber);

  vec3 charcoal = mix(vec3(.018,.017,.021),vec3(.16,.145,.135), current*.50+soot*.50);
  vec3 filament = mix(vec3(.78,.83,.92),vec3(1.,.97,.89),smoothstep(.35,.75,eddy));
  gl_FragColor = vec4(charcoal*ink + filament*fiber, ink+fiber);
}`;

function makeFlowField(gl) {
  const size = 64;
  const pixels = new Uint8Array(size * size);
  let seed = 172933;
  for (let i = 0; i < pixels.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[i] = seed >>> 24;
  }
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
  gl.activeTexture(gl.TEXTURE0);
  return texture;
}

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
      this.uniforms = Object.fromEntries(['screen','bounds','spread','density','effect','motion','mask','flowField']
        .map(name => [name,gl.getUniformLocation(program, name)]));
      this.flowField = makeFlowField(gl);
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

  begin(width, height, scale, echoCount, view) {
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
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const scaleX = renderWidth / width;
    const scaleY = renderHeight / height;
    gl.scissor(Math.floor(view.x * scaleX), Math.floor((height - view.y - view.height) * scaleY),
      Math.ceil(view.width * scaleX), Math.ceil(view.height * scaleY));
    gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.uniforms.screen, width, height);
    gl.uniform1f(this.uniforms.density, 1 / Math.sqrt(1 + Math.max(0, echoCount - 3) * .12));
    gl.uniform1i(this.uniforms.flowField, 1);
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
    // The raster bounds grow with the flow so a fresh echo touches only nearby pixels.
    const phase = Math.max(0, Math.min(1, (progress - .055) / .745));
    const flow = phase * phase * (3 - 2 * phase) * Math.min(echo.strength, 1.45);
    const reach = .08 + flow * (.72 + Math.abs(stamp.wind) * 1.66);
    gl.uniform4f(this.uniforms.spread,
      -reach, -.075 - flow * .74, 1 + reach, Math.min(1.42, 1.055 + flow * .54));
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
    this.gl?.deleteTexture(this.flowField);
    this.gl?.deleteProgram(this.program);
  }
}
