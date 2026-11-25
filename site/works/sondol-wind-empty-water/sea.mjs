import { breathTension, clamp, emptyWater, PHASE, smooth, windBands } from './score.mjs?v=wet-lens';
import { WetLens } from './lens.mjs?v=wet-lens';

const horizon=.366, sourceHorizon=.443;
const panoramaSpan=2.24;
const layers=[
  {frequency:39, angle:8.2, speed:.83, lift:.30, drift:.26},
  {frequency:26, angle:6.0, speed:1.31, lift:.73, drift:.63},
  {frequency:17, angle:4.6, speed:2.02, lift:1.24, drift:1.05},
];
const midRange=[.11,.48], nearRange=[.44,.86];
const vector=values=>values.map(value=>value.toFixed(3)).join(',');
const wrapPhase=value=>value%(Math.PI*2);
const wrapTravel=value=>((value%panoramaSpan)+panoramaSpan)%panoramaSpan;

export function advanceTravel(travel,dt,wind,quiet) {
  return {
    shore:wrapTravel(travel.shore+dt*.015),
    water:wrapTravel(travel.water+dt*.019*(1+1.2*wind)*(1-.45*quiet)),
  };
}

export function surfaceFlow(x,z,motion,wind,quiet) {
  const depth=z/(.32+.68*z);
  const mid=smooth(...midRange,z), near=smooth(...nearRange,z);
  let lift=0, drift=0;
  for (const [index,layer] of layers.entries()) {
    const weight=index===0 ? (1-mid)*(1-near) : index===1 ? mid*(1-near) : near;
    const phase=layer.frequency*depth+layer.angle*x-wrapPhase(layer.speed*motion);
    lift+=weight*layer.lift*(Math.sin(phase)+.28*Math.sin(2*phase+5.2*x));
    drift+=weight*layer.drift*Math.cos(phase+2.3*x);
  }
  const fade=smooth(0,.075,z);
  const energy=1-.49*quiet;
  return {
    x:drift*(.011+.019*wind)*fade*energy,
    y:lift*(.009+.021*wind)*fade*energy,
  };
}

const vertex=`
attribute vec2 position;
varying vec2 uv;
void main(){
  gl_Position=vec4(position,0.0,1.0);
  uv=vec2(position.x*.5+.5,.5-position.y*.5);
}`;
const fragment=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D stillSea, stormSea;
uniform vec3 wavePhase;
uniform vec2 travel;
uniform float wind, roughness, mist, mistPhase, darkness, tension, tensionCenter;
const float panoramaSpan=${panoramaSpan};
vec2 positionOnPlate(float x,float y){
  return vec2(fract(x/panoramaSpan),y);
}
vec3 movingWater(float x,float y,float amount){
  vec2 p=positionOnPlate(x,y);
  vec3 photo=texture2D(stillSea,p).rgb;
  if(amount>.005) photo=mix(photo,texture2D(stormSea,p).rgb,amount);
  return photo;
}
vec2 layer(float x,float z,vec2 travel,vec2 gain,float time){
  float phase=travel.x*z+travel.y*x-time;
  float lift=(sin(phase)+.28*sin(2.0*phase+5.2*x))*gain.x;
  float drift=cos(phase+2.3*x)*gain.y;
  return vec2(lift,drift);
}
void main(){
  const float horizon=.366, source=.443;
  float z=clamp((uv.y-horizon)/(1.0-horizon),0.0,1.0);
  vec3 color;
  if(uv.y>horizon){
    float depth=z/(.32+.68*z);
    ${layers.map(({frequency,angle,lift,drift},i)=>
      `vec2 wave${i}=layer(uv.x,depth,vec2(${vector([frequency,angle])}),vec2(${vector([lift,drift])}),wavePhase[${i}]);`).join('\n    ')}
    vec2 flow=mix(mix(wave0,wave1,smoothstep(${vector(midRange)},z)),wave2,smoothstep(${vector(nearRange)},z));
    float fade=smoothstep(0.0,.075,z);
    float energy=(1.0-.49*darkness)*fade;
    float x=uv.x+flow.y*(.011+.019*wind)*energy;
    float weight=1.0-smoothstep(.03,1.0,length(vec2((uv.x-tensionCenter)/.215,(uv.y-.63)/.135)));
    float y=source+z*(1.0-source)-smoothstep(.62,1.0,z)*(.017+.038*wind)+flow.x*(.009+.021*wind)*energy+weight*tension*.028;
    y=clamp(y,source,.999);
    float mid=smoothstep(${vector(midRange)},z);
    float near=smoothstep(${vector(nearRange)},z);
    float storm=roughness*fade;
    color=vec3(0.0);
    if(mid<1.0) color+=(1.0-mid)*(1.0-near)*movingWater(x-travel.y,y,storm);
    if(mid>0.0 && near<1.0) color+=mid*(1.0-near)*movingWater(x-2.0*travel.y,y,storm);
    if(near>0.0) color+=near*movingWater(x-4.0*travel.y,y,storm);
    if(fade<1.0) color=mix(texture2D(stillSea,positionOnPlate(uv.x+travel.x,y)).rgb,color,fade);
    float crest=max(0.0,flow.x-.10)*energy;
    float glint=smoothstep(.10,.90,sin(x*63.0+depth*17.0)*.50+sin(x*141.0-depth*27.0)*.28+.23);
    color*=1.0+flow.x*(.085+.12*wind)*energy;
    color+=vec3(.38,.48,.55)*crest*crest*glint*(.052+.14*wind);
  }else{
    float y=uv.y*source/horizon;
    color=texture2D(stillSea,positionOnPlate(uv.x+travel.x,y)).rgb;
    float shoreline=smoothstep(.16,.29,uv.y);
    if(shoreline<1.0) color=mix(texture2D(stillSea,positionOnPlate(uv.x,y)).rgb,color,shoreline);
  }
  float mistDepth=(uv.y-horizon)/.019;
  float haze=exp(-mistDepth*mistDepth)*(.58+.42*sin(uv.x*19.0+mistPhase));
  color+=vec3(.12,.15,.17)*haze*mist*(.24+.4*wind);
  gl_FragColor=vec4(color*(1.0-.085*darkness),1.0);
}`;

function loadImage(name) {
  const image=new Image();
  image.src=new URL('../sondol-wind/assets/'+name,import.meta.url);
  return image.decode().then(()=>image);
}

function repeatablePlate(image) {
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(image.width*panoramaSpan);
  canvas.height=image.height;
  const c=canvas.getContext('2d',{alpha:false});
  c.drawImage(image,0,0);
  c.setTransform(-1,0,0,1,canvas.width,0);
  c.drawImage(image,0,0,canvas.width-image.width,canvas.height);
  return canvas;
}

function fixedSky(image) {
  const canvas=document.createElement('canvas');
  canvas.width=image.width;
  canvas.height=Math.round(image.height*sourceHorizon);
  const c=canvas.getContext('2d');
  c.drawImage(image,0,0);
  const fade=c.createLinearGradient(0,canvas.height*.16/horizon,0,canvas.height*.29/horizon);
  fade.addColorStop(0,'#000');
  fade.addColorStop(.5,'#0008');
  fade.addColorStop(1,'#0000');
  c.globalCompositeOperation='destination-in';
  c.fillStyle=fade;
  c.fillRect(0,0,canvas.width,canvas.height);
  return canvas;
}

function drawTravelStrip(c,image,sourceY,sourceHeight,width,height,top,start,end=start) {
  const span=width*panoramaSpan;
  const shift=wrapTravel(start)*width;
  const shear=(start-end)*width/height;
  c.setTransform(1,0,shear,1,-shift,top);
  c.drawImage(image,0,sourceY,image.width,sourceHeight,0,0,span,height+.6);
  if(shift+width+Math.max(0,-shear*height)>span)
    c.drawImage(image,0,sourceY,image.width,sourceHeight,span,0,span,height+.6);
  if(shift<Math.max(0,shear*height))
    c.drawImage(image,0,sourceY,image.width,sourceHeight,-span,0,span,height+.6);
}

function shader(gl,type,source) {
  const section=gl.createShader(type);
  gl.shaderSource(section,source);
  gl.compileShader(section);
  if (!gl.getShaderParameter(section,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(section));
  return section;
}

function seaProgram(gl,assets) {
  const program=gl.createProgram();
  for (const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const section=shader(gl,type,source);
    gl.attachShader(program,section);
    gl.deleteShader(section);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const vbo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(program,'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  [assets.calm,assets.storm].forEach((image,i)=>{
    const texture=gl.createTexture();
    gl.activeTexture(gl.TEXTURE0+i);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    gl.uniform1i(gl.getUniformLocation(program,i ? 'stormSea' : 'stillSea'),i);
  });
  return Object.fromEntries(['wind','roughness','wavePhase','travel','mist','mistPhase','darkness','tension','tensionCenter'].map(key=>[key,gl.getUniformLocation(program,key)]));
}

export class Sea {
  constructor(screen,water,scene) {
    this.screen=screen;
    this.water=water;
    this.scene=scene;
    this.ctx=scene.getContext('2d',{alpha:true});
    this.lens=new WetLens();
    this.motion=0;
    this.ferryDrift=0;
    this.travel={shore:0,water:0};
    this.ready=false;
    this.mode='대기';
    water.addEventListener('webglcontextlost',e=>{e.preventDefault();this.uniforms=null;});
    water.addEventListener('webglcontextrestored',()=>this.setupGL());
    this.load();
  }

  async load() {
    const names={calm:'sea-calm.png',storm:'sea-storm.png',boat:'ferry.png',
      spray:'fx/wind-spray.png',mist:'fx/low-mist.png'};
    this.assets={};
    await Promise.allSettled(Object.entries(names).map(async ([key,file])=>{this.assets[key]=await loadImage(file);}));
    if (this.assets.calm) this.upperSky=fixedSky(this.assets.calm);
    this.plates={calm:this.assets.calm && repeatablePlate(this.assets.calm),storm:this.assets.storm && repeatablePlate(this.assets.storm)};
    this.ready=Boolean(this.assets.calm);
    if (this.assets.boat) {
      const crop=document.createElement('canvas');
      crop.width=1440; crop.height=572;
      crop.getContext('2d').drawImage(this.assets.boat,54,350,1440,572,0,0,1440,572);
      this.boat=crop;
    }
    this.setupGL();
  }

  setupGL() {
    if (!this.assets?.calm || !this.assets.storm) return;
    try {
      const gl=this.gl ?? this.water.getContext('webgl',{alpha:false,depth:false,antialias:false,failIfMajorPerformanceCaveat:true});
      if (!gl) return;
      this.gl=gl;
      if (this.plates.calm.width>gl.getParameter(gl.MAX_TEXTURE_SIZE)) return;
      this.uniforms=seaProgram(gl,this.plates);
    } catch {
      this.uniforms=null;
    }
  }

  resize(low) {
    const width=Math.min(low ? 960 : 1920,Math.max(2,Math.round(this.screen.clientWidth*(low ? 1 : Math.min(devicePixelRatio,1.5)))));
    const height=Math.round(width*9/16);
    if (this.scene.width===width && this.scene.height===height) return;
    this.scene.width=this.water.width=width;
    this.scene.height=this.water.height=height;
  }

  draw(dt,view,settings) {
    if (!this.ready) return;
    const low=settings.low;
    this.resize(low);
    const w=this.scene.width,h=this.scene.height, c=this.ctx;
    const {breeze,swell,gale}=windBands(view.wind);
    const wind=clamp((.17*breeze+.29*swell+.43*gale)*settings.waves);
    const roughness=clamp((.045*breeze+.27*swell+.39*gale)*settings.waves,0,.86);
    const weather=view.inCut ? emptyWater(view.cut) : null;
    const calm=weather ? .45*weather.haze : 0;
    const tension=breathTension(view);
    const drift=view.state===PHASE.BOAT_LOST ? .95 : !view.inCut && view.state!==PHASE.RECOVERY ? .73*view.progression+.18*swell+.09*gale : 0;
    this.ferryDrift+=(drift-this.ferryDrift)*(1-Math.exp(-dt/1.25));
    const useGL=Boolean(this.uniforms && !low);
    this.water.hidden=!useGL;
    this.mode=useGL ? 'WebGL · 수면 3개 레이어' : 'Canvas 2D · 수면 3개 레이어';
    this.motion+=dt*(1.28+wind*2.25)*(1-.60*calm);
    this.travel=advanceTravel(this.travel,dt,wind,calm);
    const tensionCenter=.53+.027*Math.sin(this.motion*.24);
    c.clearRect(0,0,w,h);
    if (useGL) {
      const gl=this.gl;
      gl.viewport(0,0,w,h);
      for (const [name,value] of Object.entries({wind,roughness,mist:settings.mist,mistPhase:wrapPhase(this.motion*.15),darkness:calm,tension,tensionCenter}))
        gl.uniform1f(this.uniforms[name],value);
      const [far,middle,near]=layers;
      gl.uniform3f(this.uniforms.wavePhase,wrapPhase(far.speed*this.motion),wrapPhase(middle.speed*this.motion),wrapPhase(near.speed*this.motion));
      gl.uniform2f(this.uniforms.travel,this.travel.shore,this.travel.water);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    } else this.strips(c,w,h,wind,roughness,calm,settings.mist,low);
    if (!view.inCut) this.drawBoat(c,w,h,view,wind,settings);
    if (gale>.02) this.drawSpray(c,w,h,gale,settings.mist,low);
    if (tension>.015) this.drawPressure(c,w,h,tension,tensionCenter);
    if (weather) this.drawEmptyWater(c,w,h,view,settings,weather);
    this.lens.draw(c,this.water,this.scene,w,h,dt,view.inCut ? Math.min(view.wind,tension) : view.wind,low);
  }

  drawPressure(c,w,h,tension,center) {
    const vignette=c.createRadialGradient(w*.53,h*.58,w*.097,w*.53,h*.52,w*.72);
    vignette.addColorStop(0,'rgba(3,8,11,0)');
    vignette.addColorStop(.65,`rgba(3,8,11,${tension*.17})`);
    vignette.addColorStop(1,`rgba(1,4,8,${tension*.55})`);
    c.fillStyle=vignette;
    c.fillRect(0,0,w,h);
    c.save();
    c.translate(w*center,h*.645);
    c.scale(1,.32);
    const ellipse=c.createRadialGradient(0,0,0,0,0,w*.22);
    ellipse.addColorStop(0,`rgba(2,8,12,${tension*.42})`);
    ellipse.addColorStop(.60,`rgba(4,12,16,${tension*.24})`);
    ellipse.addColorStop(1,'rgba(9,17,22,0)');
    c.fillStyle=ellipse;
    c.fillRect(-w*.23,-w*.23,w*.46,w*.46);
    c.restore();
    const roll=(this.motion*.18)%1;
    c.strokeStyle=`rgba(152,174,181,${tension*Math.sin(roll*Math.PI)**2*.19})`;
    c.lineWidth=Math.max(.65,h*.0013);
    c.beginPath();
    c.ellipse(w*center,h*(.635+.045*roll),w*(.08+.097*roll),h*(.009+.017*roll),-.071,.14,Math.PI*.86);
    c.stroke();
  }

  strips(c,w,h,wind,roughness,calm,mist,low) {
    const {calm:photo,storm}=this.plates;
    const {shore,water}=this.travel;
    const sky=h*horizon, s=photo.height*sourceHorizon;
    drawTravelStrip(c,photo,0,s,w,sky,0,shore);
    c.resetTransform();
    c.drawImage(this.upperSky,0,0,w,sky);
    const count=low ? 36 : 54;
    const bandHeight=(h-sky)/count;
    const stormScale=storm ? storm.height/photo.height : 1;
    const sampleBandEdge=z=>{
      const flow=surfaceFlow(.46+z*.19,z,this.motion,wind,calm);
      const reserve=smooth(.62,1,z)*(.017+.038*wind);
      return {x:flow.x,y:s+z*(photo.height-s)+(flow.y-reserve)*photo.height};
    };
    let start=sampleBandEdge(0), sourceRow=s;
    for (let i=0;i<count;i++) {
      const z=i/count;
      const end=sampleBandEdge((i+1)/count);
      const nextRow=clamp(end.y,sourceRow+.8,photo.height-count+i);
      const sourceHeight=nextRow-sourceRow;
      const center=z+.5/count;
      const mid=smooth(...midRange,center), near=smooth(...nearRange,center);
      const fade=smooth(0,.075,center);
      const rough=storm ? roughness*fade : 0;
      const top=sky+bandHeight*i;
      let total=0;
      const blend=(image,weight,offset,scale=1,drift=true)=>{
        if (weight<=.001) return;
        total+=weight;
        c.globalAlpha=weight/total;
        drawTravelStrip(c,image,sourceRow*scale,sourceHeight*scale,w,bandHeight,top,offset+(drift?start.x:0),offset+(drift?end.x:0));
      };
      blend(photo,1-fade,shore,1,false);
      const bands=[[-water,(1-mid)*(1-near)*fade],[-2*water,mid*(1-near)*fade],[-4*water,near*fade]];
      for (const [offset,weight] of bands) {
        blend(photo,weight*(1-rough),offset);
        blend(storm,weight*rough,offset,stormScale);
      }
      start=end;
      sourceRow=nextRow;
    }
    c.resetTransform();
    c.globalAlpha=1;
    if (this.assets.mist) {
      c.globalAlpha=mist*(.25+wind*.51);
      c.drawImage(this.assets.mist,-w*.035,sky-h*.061,w*1.07,h*.13);
      c.globalAlpha=1;
    }
    if (calm) {
      c.fillStyle=`rgba(0,0,0,${calm*.085})`;
      c.fillRect(0,0,w,h);
    }
  }

  drawBoat(c,w,h,view,wind,settings) {
    if (!this.boat) return;
    const p=smooth(0,1,this.ferryDrift);
    const side=view.returning ? -1 : 1;
    const x=w*(.5+side*(.045+.106*p));
    const draft=.433-.044*p;
    const swell=surfaceFlow(x/w,(draft-horizon)/(1-horizon),this.motion,wind,0);
    const y=h*(draft-swell.y*settings.boat*.55+Math.sin(this.motion*1.91)*(.0015+.0045*wind)*settings.boat);
    const width=w*(.079-.044*p);
    const length=width*this.boat.height/this.boat.width;
    const crest=y+h*(.007-.030*view.loss);
    const show=view.recover;
    if (show<.006 || view.loss>.992) return;
    c.save();
    c.beginPath();
    c.moveTo(x-width,0); c.lineTo(x+width,0);
    c.lineTo(x+width,crest+h*.005);
    c.quadraticCurveTo(x+width*.13,crest-h*.004,x-width,crest+h*.002);
    c.closePath();
    c.clip();
    c.translate(x,y);
    c.rotate(Math.sin(this.motion*1.78)*(.007+.105*wind)*settings.boat);
    c.scale(side,1);
    c.globalAlpha=(.94-.22*p)*show;
    c.filter='brightness(.83) saturate(.68)';
    c.drawImage(this.boat,-width/2,-length*.75,width,length);
    c.restore();
    c.save();
    c.strokeStyle=`rgba(150,166,176,${(.06+wind*.12)*(1-view.loss)*show})`;
    c.lineWidth=Math.max(.7,h*.0013);
    c.beginPath();
    c.ellipse(x-width*.08,crest+h*.003,width*.62,heightForWake(h,wind),0,.09,Math.PI-.1);
    c.stroke();
    if (view.state===PHASE.BOAT_LOST) {
      const opacity=Math.sin(Math.PI*smooth(0,1.35,view.elapsed));
      c.strokeStyle=`rgba(159,175,183,${.26*opacity})`;
      c.beginPath();
      c.moveTo(x-width*1.1,crest+h*.014);
      c.quadraticCurveTo(x-width*.15,crest-h*.011,x+width*1.2,crest+h*.010);
      c.stroke();
      if (this.assets.spray) {
        c.globalAlpha=.39*opacity;
        c.drawImage(this.assets.spray,x-width,crest-h*.042,width*2,h*.086);
      }
    }
    c.restore();
  }

  drawSpray(c,w,h,gale,mist,low) {
    if (!this.assets.spray) return;
    c.save();
    const count=low ? 3 : 7;
    for (let i=0;i<count;i++) {
      const t=(this.motion*.115+i*.392)%1;
      const x=((i*.711+t*.13)%1)*w;
      const y=(.43+(i*.163)% .46)*h;
      c.globalAlpha=gale*Math.sin(Math.PI*t)**2*.25*(.52+mist*.48);
      c.drawImage(this.assets.spray,x-w*.16,y-h*.028,w*(.11+(i*.037)% .19),h*.062);
    }
    c.restore();
  }

  drawEmptyWater(c,w,h,view,settings,weather) {
    const {haze,wake,distance}=weather;
    if (haze>.005) {
      const shade=c.createRadialGradient(w*.53,h*.48,w*.08,w*.53,h*.47,w*.68);
      shade.addColorStop(0,`rgba(2,7,10,${haze*.15})`);
      shade.addColorStop(1,`rgba(2,6,8,${haze*.47})`);
      c.fillStyle=shade;
      c.fillRect(0,0,w,h);
    }
    if (settings.mist>.01 && haze>.005 && this.assets.mist) {
      const fog=c.createLinearGradient(0,h*.17,0,h*.61);
      fog.addColorStop(0,'rgba(22,32,39,0)');
      fog.addColorStop(.37,`rgba(32,44,51,${haze*settings.mist*.54})`);
      fog.addColorStop(.56,`rgba(29,40,46,${haze*settings.mist*.29})`);
      fog.addColorStop(1,'rgba(22,32,39,0)');
      c.fillStyle=fog;
      c.fillRect(0,h*.17,w,h*.44);
      c.globalAlpha=haze*settings.mist*.85;
      const drift=Math.sin(view.cut*.37)*w*.09;
      c.drawImage(this.assets.mist,-w*.22-drift,h*.253,w*1.58,h*.245);
      c.globalAlpha=haze*settings.mist*.57;
      c.drawImage(this.assets.mist,-w*.15+drift*.65,h*.31,w*1.42,h*.24);
      c.globalAlpha=1;
    }
    if (wake<.005) return;
    const side=view.returning ? -1 : 1;
    const headX=w*(.5+side*(.137-.195*distance));
    const headY=h*(.433+.32*distance);
    const breadth=w*(.018+.139*distance);
    const length=h*(.031+.125*distance);
    const pressure=Math.sin(view.cut*1.6)*.10+.90;
    c.save();
    c.lineCap='round';
    for (const bank of [-1,1]) {
      for (let n=0;n<7;n++) {
        const start=n/7+.019;
        const end=(n+1)/7-.038-.016*Math.sin(view.cut*1.18+n*2.6);
        const bend=q=>[
          headX+bank*breadth*q**1.33+w*.013*q*Math.sin(view.cut*.81+q*4.4),
          headY-length*q+h*.009*q*Math.sin(q*12.4+bank-view.cut*2.2),
        ];
        const [x0,y0]=bend(start), [xc,yc]=bend((start+end)/2), [x1,y1]=bend(end);
        c.beginPath();
        c.moveTo(x0,y0);
        c.quadraticCurveTo(xc,yc,x1,y1);
        const opacity=wake*pressure*(1-start*.62)*(.58+.42*Math.sin(n*3.8+bank+view.cut*1.05));
        c.lineWidth=h*(.0035+.004*distance)*(1-start*.56);
        c.strokeStyle=`rgba(4,9,12,${.20*opacity})`;
        c.stroke();
        c.lineWidth=Math.max(.65,h*.0015);
        c.strokeStyle=`rgba(150,172,179,${.28*opacity})`;
        c.stroke();
      }
    }
    const spread=w*(.018+.04*distance);
    c.lineWidth=Math.max(.65,h*.0013);
    c.strokeStyle=`rgba(144,167,175,${wake*.16})`;
    c.beginPath();
    c.ellipse(headX+w*.012,headY-h*.012,spread,h*.013,Math.sin(view.cut*.65)*.14,.28,Math.PI*.77);
    c.stroke();
    c.restore();
  }
}

function heightForWake(h,wind) {
  return h*(.0031+wind*.006);
}
