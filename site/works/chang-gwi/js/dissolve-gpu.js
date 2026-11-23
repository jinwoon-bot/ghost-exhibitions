import {dissolveTimeline} from './dissolve-motion.js';

// A frozen cutout is advected and eroded on the GPU. No video generation or history framebuffer.
const vertex=`precision mediump float;attribute vec2 a_corner;uniform vec2 u_size;uniform vec4 u_x,u_y;uniform vec2 u_source;varying vec2 v_uv;
void main(){v_uv=mix(vec2(-.62,-.36),vec2(1.62,1.36),a_corner);vec2 p=v_uv*u_source;vec2 screen=vec2(dot(u_x.xyz,vec3(p,1.)),dot(u_y.xyz,vec3(p,1.)));gl_Position=vec4(screen/u_size*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`;
const fragment=`precision mediump float;uniform sampler2D u_image;uniform vec2 u_source;uniform vec4 u_time;uniform vec4 u_style;varying vec2 v_uv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*437.5853);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return .57*noise(p)+.29*noise(p*2.03+17.)+.14*noise(p*4.11+31.);}
vec4 cut(vec2 p){float inside=step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);return texture2D(u_image,clamp(p,0.,1.))*inside;}
void main(){
 float flow=u_time.x,erode=u_time.y,age=u_time.z,t=u_time.w,seed=u_style.w;
 float dir=sin(seed*13.)<0.?-1.:1.;vec2 q=v_uv;
 q-=vec2(dir*flow*flow*.3,-flow*flow*.16);
 q.x=.5+(q.x-.5)/(1.+flow*.48);
 vec2 curl=vec2(noise(vec2(q.y*9.+t*.16+seed,q.x*3.))-0.5,noise(q*vec2(4.,8.)+seed-t*.11)-.5);
 q+=curl*vec2(.34,.1)*flow;
 vec4 c=cut(q);float plume=0.;
 plume+=cut(q+vec2(dir*.035,-.012)*flow).a*.38;
 plume+=cut(q+vec2(dir*.09,-.028)*flow).a*.20;
 plume+=cut(q+vec2(dir*.16,-.055)*flow).a*.10;
 float grain=fbm(q*vec2(26.,19.)+vec2(seed,t*.17));
 float erosion=smoothstep(erode*.92-.12,erode*.92+.09,grain);
 float a=max(c.a*erosion,plume*flow*smoothstep(.18,.76,grain));
 vec2 pixel=vec2(1.8)/u_source;
 float nearA=max(max(cut(q+vec2(pixel.x,0.)).a,cut(q-vec2(pixel.x,0.)).a),max(cut(q+vec2(0.,pixel.y)).a,cut(q-vec2(0.,pixel.y)).a));
 float rim=max(0.,nearA-c.a)*u_style.z;
 vec3 ink=vec3(.021,.029,.038);float luminance=dot(c.rgb,vec3(.2126,.7152,.0722));
 vec3 original=mix(vec3(luminance),c.rgb,.88);vec3 color=mix(original,ink,smoothstep(.1,.86,age)*.96);
 color=mix(color,vec3(.57,.77,.94),rim*.85);
 a=max(a*(1.-flow*.32),rim*.72)*(u_style.x*u_style.y);
 gl_FragColor=vec4(color*a,a);
}`;

export class DissolveGPU{
 constructor(){
  this.canvas=document.createElement('canvas');this.textures=new Map();this.commands=[];this.available=false;this.reason='';
  try{
   const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false});if(!gl)throw Error('먹 용해 GPU 미지원');
   const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment),p=this.program=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
   this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);this.corner=gl.getAttribLocation(p,'a_corner');
   this.uniform=Object.fromEntries(['size','x','y','source','time','style','image'].map(n=>[n,gl.getUniformLocation(p,'u_'+n)]));
   this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.available=false;this.reason='먹 용해 GPU 문맥 손실 · 2D 대체';this.textures.clear();});this.available=true;
  }catch(e){this.reason=e.message;}
 }
 begin(w,h,enabled){
  this.enabled=enabled&&this.available;this.commands.length=0;
  if(!this.enabled){if(this.gl)for(const t of this.textures.values())this.gl.deleteTexture(t);this.textures.clear();return;}
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  const gl=this.gl;gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 }
 add(source,matrix,age,elapsed,seed,settings){this.commands.push({source,matrix,age,elapsed,seed,settings});}
 flush(){
  if(!this.enabled)return null;const gl=this.gl,u=this.uniform,used=new Set();gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(this.corner);gl.vertexAttribPointer(this.corner,2,gl.FLOAT,false,0,0);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.uniform2f(u.size,this.canvas.width,this.canvas.height);gl.activeTexture(gl.TEXTURE0);gl.uniform1i(u.image,0);
  for(const c of this.commands){
   const s=c.source;if(!s.width||!s.height)continue;used.add(s);let tex=this.textures.get(s);
   if(!tex){tex=gl.createTexture();this.textures.set(s,tex);gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,s);}else gl.bindTexture(gl.TEXTURE_2D,tex);
   const m=c.matrix,p=dissolveTimeline(c.age,c.settings.decay);gl.uniform4f(u.x,m.a,m.c,m.e,0);gl.uniform4f(u.y,m.b,m.d,m.f,0);gl.uniform2f(u.source,s.width,s.height);gl.uniform4f(u.time,p.flow,p.erosion,c.age,c.elapsed*.001);gl.uniform4f(u.style,Math.min(.92,c.settings.opacity*1.3),p.visibility,p.rim, c.seed%100);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  for(const [s,t]of this.textures)if(!used.has(s)||!s.width){gl.deleteTexture(t);this.textures.delete(s);}return this.canvas;
 }
 dispose(){if(this.gl){for(const t of this.textures.values())this.gl.deleteTexture(t);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}this.textures.clear();this.commands.length=0;this.canvas.width=this.canvas.height=0;}
}
