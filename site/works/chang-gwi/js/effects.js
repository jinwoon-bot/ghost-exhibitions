import { clamp } from './core.js';
import {paperPose,paperBlend} from './paper-motion.js';
import {PaperGPU,writePaperQuad} from './paper-gpu.js';
import {DissolveGPU} from './dissolve-gpu.js';
import {dissolveTimeline,ribbonPose} from './dissolve-motion.js';
import {Foreground} from './foreground.js';
const hash = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function tiles(snapshot, size, seed, budget=650) {
  // 흩어지는 도중 품질이 바뀌어도 이미 생긴 종이 조각의 위치/크기를 다시 뽑지 않는다.
  if (snapshot.tiles) return snapshot.tiles;
  const { canvas } = snapshot,
    ctx = canvas.getContext('2d'),
    d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(size, Math.ceil(Math.sqrt((canvas.width * canvas.height) / budget)));
  const out = [];
  let i = 0;
  for (let y = 0; y < canvas.height; y += step)
    for (let x = 0; x < canvas.width; x += step) {
      let filled = false;
      for (let by = y; by < Math.min(y + step, canvas.height) && !filled; by += 2)
        for (let bx = x; bx < Math.min(x + step, canvas.width); bx += 2)
          if (d[(by * canvas.width + bx) * 4 + 3]) {
            filled = true;
            break;
          }
      if (filled) {
        const n = hash(seed + i++);
        out.push({
          x,
          y,
          w: Math.min(step, canvas.width - x),
          h: Math.min(step, canvas.height - y),
          n,
          vx: (hash(i + seed + 2) - 0.5) * 30,
          vy: -7 - hash(i + seed + 7) * 26,
          spin: (n - 0.5) * 2,
        });
      }
    }
  snapshot.tiles = out;
  snapshot.tileSize = size;
  snapshot.tileBudget = budget;
  return out;
}
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ghosts=document.createElement('canvas');this.ghostCtx=this.ghosts.getContext('2d');
    this.paperGPU=new PaperGPU();
    this.inkGPU=new DissolveGPU();
    this.foreground=new Foreground();
    this.paper=new Image();this.paperReady=false;this.paperError=null;
    this.paper.onload=()=>{this.paperReady=true;};this.paper.onerror=()=>{this.paperError='assets/paper/hanji.png 파일을 확인하세요.';};
    this.paper.src=new URL('../assets/paper/hanji.png',import.meta.url).href;
    this.scale = 1;
    this.renderScale = 1;
    this.bg = document.createElement('canvas');
    this.noise = document.createElement('canvas');
    this.noise.width = this.noise.height = 128;
    const n = this.noise.getContext('2d'),
      im = n.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.random() * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 12;
    }
    n.putImageData(im, 0, 0);
    this.background = '';
    this.resize();
  }
  resize() {
    const ratio=Math.min(1,1920/innerWidth,1080/innerHeight)*this.renderScale;
    this.canvas.width = Math.max(1,Math.round(innerWidth * ratio));
    this.canvas.height = Math.max(1,Math.round(innerHeight * ratio));
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    this.ghosts.width=this.canvas.width;this.ghosts.height=this.canvas.height;
    this.background = '';
  }
  backgroundImage(s) {
    if (this.background === s.background) return;
    this.background = s.background;
    const c = this.bg.getContext('2d'),
      w = this.bg.width,
      h = this.bg.height;
    c.fillStyle = s.background;
    c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, w * 0.6);
    glow.addColorStop(0, '#667a7b24');
    glow.addColorStop(0.7, '#43535a09');
    glow.addColorStop(1, '#00000000');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 0.24;
    c.fillStyle = c.createPattern(this.noise, 'repeat');
    c.fillRect(0, 0, w, h);
    c.globalAlpha = 1;
  }
  draw(store, tracker, now, s, source) {
    if(!source&&this.foreground.key)this.foreground.dispose();
    this.paperGPU.begin(this.canvas.width,this.canvas.height,s.gpuParticles!==false);
    this.inkGPU.begin(this.canvas.width,this.canvas.height,s.gpuParticles!==false&&store.items.some(c=>(c.effect||s.effect)==='ink'));
    this.stats={clones:store.items.length,validSnapshots:0,fragmentDraws:0,paperCaches:0,inkClones:0,maxAgeRatio:0,backend:this.paperGPU.enabled?'WebGL batch':'Canvas 2D',inkBackend:this.inkGPU.enabled?'WebGL advection':'Canvas 2D ribbons',gpuReason:this.paperGPU.reason,inkReason:this.inkGPU.reason};
    this.backgroundImage(s);
    const display = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height;
    display.drawImage(this.bg, 0, 0);
    const iw = tracker.width,
      ih = tracker.height;
    // 카메라 배경은 AI 입력 축소본과 분리. 인식 0명/모델 오류여도 원본 프레임을 표시한다.
    const sw=source?.videoWidth||iw,sh=source?.videoHeight||ih;
    const viewScale=Math.min(w/sw,h/sh),vw=sw*viewScale,vh=sh*viewScale,ox=(w-vw)/2,oy=(h-vh)/2;
    if(source){display.save();display.translate(ox,oy);if(s.mirror){display.translate(vw,0);display.scale(-1,1);}display.drawImage(source,0,0,vw,vh);display.restore();}
    const ctx=this.ghostCtx;ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(vw/iw,vh/ih);
    this.scale = vw/iw;
    for (const clone of store.items) {
      const sw = clone.snapshot.sourceWidth || iw,
        sh = clone.snapshot.sourceHeight || ih;
      const localScale = Math.min(iw / sw, ih / sh);
      ctx.save();
      ctx.translate((iw - sw * localScale) / 2, (ih - sh * localScale) / 2);
      ctx.scale(localScale, localScale);
      this.clone(ctx, clone, now, s, tracker.activity);
      ctx.restore();
    }
    const paperLayer=this.paperGPU.flush();if(paperLayer){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(paperLayer,0,0);ctx.restore();}
    const inkLayer=this.inkGPU.flush();if(inkLayer){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(inkLayer,0,0);ctx.restore();}
    // 현재 관객 위의 잔상만 지워 실제 카메라 속 얼굴/몸을 가리지 않는다.
    if(source&&!s.foreground)ctx.globalCompositeOperation='destination-out';
    for (const t of (!source||!s.foreground?tracker.tracks:[])) {
      ctx.save();
      ctx.globalAlpha = (source?1:.88)*clamp(1 - Math.max(0, now - t.seen - 120) / 500, 0, 1);
      if(!source){ctx.shadowColor='#c7d7d450';ctx.shadowBlur=4;}
      ctx.drawImage(t.frame.canvas,t.frame.box.x,t.frame.box.y,t.frame.box.w,t.frame.box.h);
      ctx.restore();
    }
    ctx.restore();
    display.drawImage(this.ghosts,0,0);
    if(source&&s.foreground)this.foreground.draw(display,source,tracker,now,{x:ox,y:oy,width:vw,height:vh,mirror:s.mirror});
  }
  clone(ctx, c, now, s, activity) {
    const snapshot = c.snapshot,
      { canvas, box } = snapshot;
    if (!canvas.width) return;
    this.stats.validSnapshots++;
    if((c.effect||s.effect)==='ink'){this.dissolve(ctx,c,now,s);return;}
    const p = clamp((now - c.born) / c.life, 0, 1),
      progress = clamp(((p - 0.45) * s.decay) / 0.55, 0, 1);
    const ink = clamp(p * 1.85, 0, 1),
      color = rgb(s.cloneColor),
      dark = [26, 37, 41];
    this.stats.maxAgeRatio=Math.max(this.stats.maxAgeRatio,p);if(snapshot.paperPaint)this.stats.paperCaches++;
    const tone = color.map((v, i) => Math.round(v + (dark[i] - v) * ink));
    if (!snapshot.paint) {
      snapshot.paint = document.createElement('canvas');
      snapshot.paint.width = canvas.width;
      snapshot.paint.height = canvas.height;
    }
    const g = snapshot.paint.getContext('2d');
    const paintKey=[Math.floor(p*80),s.cloneColor,s.ink,s.decay].join(':');
    if(snapshot.paintKey!==paintKey){
    snapshot.paintKey=paintKey;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(canvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${tone.join(',')})`;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'source-over';
    // The contour erodes before the body separates: breakup is not only opacity.
    if (p > 0.2 && s.ink > 0) {
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      for (let i = 0; i < snapshot.edge.length; i++) {
        const e = snapshot.edge[i],
          r = ((0.15 + progress * 1.2) * (0.4 + hash(i + c.seed) * 0.8) * s.ink) / 5;
        g.moveTo(e.x + r, e.y);
        g.arc(e.x, e.y, r, 0, Math.PI * 2);
      }
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    }
    ctx.save();
    ctx.translate(box.x, box.y);
    const alpha = s.opacity * Math.min(1, p * 18 + 0.3);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = `rgba(7,13,15,${0.4 + ink * 0.4})`;
    ctx.shadowBlur = s.ink * (0.2 + ink * 0.5);
    const sway = c.prolonged && activity < 0.07 ? Math.sin(now * 0.0008 + c.seed) * 0.9 : 0;
    // A residual stain is a dark local imprint, independent of the intact body.
    if (progress > 0.3) {
      ctx.save();
      ctx.globalAlpha = s.trace * (1 - p);
      ctx.drawImage(snapshot.paint, 0, 0.7);
      ctx.restore();
    }
    const blend=paperBlend(progress);
    if (blend < 1) {
      ctx.globalAlpha=alpha*(1-blend);
      const cut = Math.round(canvas.height * 0.31);
      ctx.drawImage(snapshot.paint, 0, 0, canvas.width, cut, sway, 0, canvas.width, cut);
      ctx.drawImage(
        snapshot.paint,
        0,
        cut,
        canvas.width,
        canvas.height - cut,
        0,
        cut,
        canvas.width,
        canvas.height - cut,
      );
    }
    if (blend > 0) {
      const pieces = tiles(snapshot, Math.max(2, Math.round(s.fragment / 2)), c.seed,s.particleBudget||650);
      if(this.paperReady&&!snapshot.paperPaint){
        const paper=snapshot.paperPaint||document.createElement('canvas');paper.width=canvas.width;paper.height=canvas.height;
        const pc=paper.getContext('2d'),cw=this.paper.naturalWidth/4,ch=this.paper.naturalHeight/2;
        for(let i=0;i<pieces.length;i++){const t=pieces[i],variant=Math.floor(hash(c.seed+i*13)*8);pc.drawImage(this.paper,(variant%4)*cw,Math.floor(variant/4)*ch,cw,ch,t.x,t.y,t.w,t.h);}
        pc.globalCompositeOperation='destination-in';pc.drawImage(canvas,0,0);pc.globalCompositeOperation='source-over';
        snapshot.paperPaint=paper;snapshot.paperPaintBudget=s.particleBudget;snapshot.paperPaintSize=s.fragment;
      }
      ctx.shadowBlur = 0;
      const gpu=this.paperGPU.enabled&&snapshot.paperPaint,matrix=gpu?ctx.getTransform():null;
      if(gpu&&!snapshot.paperVertices)snapshot.paperVertices=new Float32Array(pieces.length*30);
      let vertexCount=0;
      for (const tile of pieces) {
        const pose=paperPose(tile,progress,now-c.born,c.seed);
        ctx.globalAlpha=Math.min(.85,alpha*blend*pose.alpha*1.35);
        if (ctx.globalAlpha < 0.005) continue;
        this.stats.fragmentDraws++;
        if(gpu){vertexCount=writePaperQuad(snapshot.paperVertices,vertexCount,tile,pose,matrix,this.canvas.width,this.canvas.height,canvas.width,canvas.height,ctx.globalAlpha);continue;}
        ctx.save();
        ctx.translate(tile.x+tile.w/2+pose.x,tile.y+tile.h/2+pose.y);
        ctx.rotate(pose.angle);ctx.scale(pose.width*pose.flutter,pose.height);
        ctx.drawImage(
          snapshot.paperPaint||snapshot.paint,
          tile.x,
          tile.y,
          tile.w,
          tile.h,
          -tile.w/2,
          -tile.h/2,
          tile.w,
          tile.h,
        );
        ctx.restore();
      }
      if(gpu)this.paperGPU.add(snapshot.paperPaint,snapshot.paperVertices,vertexCount);
    }
    ctx.restore();
  }
  dissolve(ctx,c,now,s){
    const snapshot=c.snapshot,{canvas,box}=snapshot,p=clamp((now-c.born)/c.life,0,1),elapsed=now-c.born;
    this.stats.inkClones++;this.stats.maxAgeRatio=Math.max(this.stats.maxAgeRatio,p);
    ctx.save();ctx.translate(box.x,box.y);ctx.scale(box.w/canvas.width,box.h/canvas.height);
    if(this.inkGPU.enabled){this.inkGPU.add(canvas,ctx.getTransform(),p,elapsed,c.seed,s);ctx.restore();return;}
    // Deterministic low-cost fallback: the real cutout separates into long ink ribbons.
    const timeline=dissolveTimeline(p,s.decay);
    if(!snapshot.inkPaint){snapshot.inkPaint=document.createElement('canvas');snapshot.inkPaint.width=canvas.width;snapshot.inkPaint.height=canvas.height;}
    const paint=snapshot.inkPaint,g=paint.getContext('2d'),key=Math.floor(p*40);
    if(snapshot.inkKey!==key){snapshot.inkKey=key;g.clearRect(0,0,paint.width,paint.height);g.drawImage(canvas,0,0);g.globalCompositeOperation='source-atop';g.fillStyle=`rgba(5,9,13,${Math.min(.97,p*1.3)})`;g.fillRect(0,0,paint.width,paint.height);g.globalCompositeOperation='source-over';}
    const step=Math.max(2,Math.ceil(canvas.height/75)),direction=Math.sin(c.seed*13)<0?-1:1;
    for(let y=0;y<canvas.height;y+=step){const h=Math.min(step,canvas.height-y),pose=ribbonPose(y,p,elapsed,c.seed,direction);if(hash(y+c.seed)<timeline.erosion*.78)continue;ctx.globalAlpha=s.opacity*pose.alpha;ctx.drawImage(paint,0,y,canvas.width,h,pose.x,y+pose.y,canvas.width*pose.stretch,h*(1-timeline.flow*.35));}
    ctx.restore();
  }
  dispose() {
    this.paperGPU.dispose();
    this.inkGPU.dispose();
    this.foreground.dispose();
    this.canvas.width =
      this.canvas.height =
      this.bg.width =
      this.bg.height =
      this.noise.width =
      this.noise.height =
      this.ghosts.width = this.ghosts.height =
        0;
  }
}
