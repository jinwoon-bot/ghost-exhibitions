// 종이 조각을 조각별 Canvas API 호출 대신 분신당 한 번의 GPU 호출로 합성한다.
export class PaperGPU{
 constructor(){
  this.canvas=document.createElement('canvas');this.available=false;this.textures=new Map();this.commands=[];this.reason='';
  try{
   const gl=this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false});
   if(!gl)throw Error('WebGL 미지원');
   const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const vs=shader(gl.VERTEX_SHADER,'attribute vec2 a_position;attribute vec2 a_uv;attribute float a_alpha;varying vec2 v_uv;varying float v_alpha;void main(){gl_Position=vec4(a_position,0.,1.);v_uv=a_uv;v_alpha=a_alpha;}');
   const fs=shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D u_image;varying vec2 v_uv;varying float v_alpha;void main(){vec4 c=texture2D(u_image,v_uv);float a=c.a*v_alpha;gl_FragColor=vec4(c.rgb*a,a);}');
   this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);
   gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
   this.buffer=gl.createBuffer();this.position=gl.getAttribLocation(this.program,'a_position');this.uv=gl.getAttribLocation(this.program,'a_uv');this.alpha=gl.getAttribLocation(this.program,'a_alpha');
   this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.available=false;this.reason='종이 GPU 문맥 손실 · CPU 합성으로 전환';this.textures.clear();});
   this.available=true;
  }catch(e){this.reason=e.message;}
 }
 begin(w,h,enabled){
  this.enabled=enabled&&this.available;this.commands.length=0;
  if(!this.enabled){if(this.gl)for(const t of this.textures.values())this.gl.deleteTexture(t);this.textures.clear();return;}
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  const gl=this.gl;gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 }
 add(source,vertices,count){this.commands.push({source,vertices,count});}
 flush(){
  if(!this.enabled)return null;
  const gl=this.gl,used=new Set();gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.enableVertexAttribArray(this.position);gl.enableVertexAttribArray(this.uv);gl.enableVertexAttribArray(this.alpha);
  gl.vertexAttribPointer(this.position,2,gl.FLOAT,false,20,0);gl.vertexAttribPointer(this.uv,2,gl.FLOAT,false,20,8);gl.vertexAttribPointer(this.alpha,1,gl.FLOAT,false,20,16);
  gl.activeTexture(gl.TEXTURE0);
  for(const c of this.commands){
   if(!c.count)continue;used.add(c.source);let texture=this.textures.get(c.source);
   if(!texture){texture=gl.createTexture();this.textures.set(c.source,texture);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c.source);}else gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.bufferData(gl.ARRAY_BUFFER,c.vertices.subarray(0,c.count),gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,c.count/5);
  }
  for(const [source,texture]of this.textures)if(!used.has(source)||!source.width){gl.deleteTexture(texture);this.textures.delete(source);}
  return this.canvas;
 }
 dispose(){if(this.gl){for(const t of this.textures.values())this.gl.deleteTexture(t);this.gl.deleteBuffer(this.buffer||null);this.gl.deleteProgram(this.program||null);}this.textures.clear();this.commands.length=0;this.canvas.width=this.canvas.height=0;}
}
export function writePaperQuad(out,index,tile,pose,matrix,width,height,textureWidth,textureHeight,alpha){
 const cx=tile.x+tile.w/2+pose.x,cy=tile.y+tile.h/2+pose.y,co=Math.cos(pose.angle),si=Math.sin(pose.angle),sx=pose.width*pose.flutter,sy=pose.height;
 const u0=tile.x/textureWidth,v0=tile.y/textureHeight,u1=(tile.x+tile.w)/textureWidth,v1=(tile.y+tile.h)/textureHeight;
 for(let i=0;i<6;i++){const j=i===3?0:i===4?2:i===5?3:i,right=j===1||j===2,bottom=j>=2,x=(right?tile.w/2:-tile.w/2)*sx,y=(bottom?tile.h/2:-tile.h/2)*sy,rx=cx+x*co-y*si,ry=cy+x*si+y*co;out[index++]=(matrix.a*rx+matrix.c*ry+matrix.e)/width*2-1;out[index++]=1-(matrix.b*rx+matrix.d*ry+matrix.f)/height*2;out[index++]=right?u1:u0;out[index++]=bottom?v1:v0;out[index++]=alpha;}
 return index;
}
