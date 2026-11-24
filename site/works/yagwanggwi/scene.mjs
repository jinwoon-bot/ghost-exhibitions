import { STATES } from './score.mjs';

export const FRAME = { width:1672, height:941 };
const sieve = { x:650, y:246, width:363, height:376 };
const clamp = (x, low=0, high=1) => Math.min(high,Math.max(low,x));
function ease(a,b,x) {
  const t = clamp((x-a)/(b-a));
  return t*t*(3-2*t);
}
const fraction = x => x-Math.floor(x);
const noise = x => fraction(Math.sin(x*67.531+.94)*43758.5453);
const url = name => new URL('./assets/'+name,import.meta.url);

async function image(name) {
  const photo = new Image();
  photo.src = url(name).href;
  await photo.decode();
  return photo;
}

function describe(box,index) {
  const [x,y,w,h] = box;
  const seed = index+1;
  return {
    x:x+w/2-sieve.x, y:y+h/2-sieve.y, w, h, seed,
    tile:Math.floor(noise(seed)*4),
    depth:.71+noise(seed+17)*.26,
    delay:noise(seed+33),
    order:Math.hypot((x+w/2-850)*.87,y+h/2-420)+noise(seed+57)*77,
  };
}

export class Scene {
  constructor(canvas, frame, onError) {
    this.canvas = canvas;
    this.frame = frame;
    this.ctx = canvas.getContext('2d');
    this.eyes = document.createElement('canvas');
    this.eyes.width = sieve.width;
    this.eyes.height = sieve.height;
    this.eyeContext = this.eyes.getContext('2d');
    this.levels = [];
    this.visibleEyes = 0;
    this.last = 0;
    this.shoeVisible = 1;
    this.shoeProgress = 0;
    this.ready = this.load().catch(error => { onError(error.message); return false; });
  }

  async load() {
    const [shoe, eyeSheet, mask, response] = await Promise.all([
      image('jipsin.png'), image('eye-sheet.jpg'), image('apertures.png'), fetch(url('apertures.json')),
    ]);
    if (!response.ok) throw Error('체 구멍 마스크를 불러올 수 없습니다.');
    const boxes = await response.json();
    if (!boxes.length) throw Error('체 구멍 좌표가 비어 있습니다.');
    this.shoe = shoe;
    this.eyeSheet = eyeSheet;
    this.mask = mask;
    this.holes = boxes.map(describe).sort((a,b)=>a.order-b.order);
    this.levels = this.holes.map(()=>0);
    return true;
  }

  resize(low) {
    const { clientWidth: w, clientHeight: h } = this.frame;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1,1.35,(low ? 1280 : 1920)/w);
    const width = Math.max(1,Math.round(w*ratio)), height = Math.max(1,Math.round(h*ratio));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  draw(now, view, low, safe) {
    const dt = this.last ? Math.min(100, now-this.last) : 16;
    this.last = now;
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.setTransform(width/FRAME.width,0,0,height/FRAME.height,0,0);
    ctx.clearRect(0,0,FRAME.width,FRAME.height);
    if (!this.holes) return;
    const reveal = view.state === STATES.REVEAL;
    const afterReveal = view.state === STATES.RESET && view.returnFrom === STATES.REVEAL;
    const light = (.033 + .013*Math.sin(now*.00057) + (reveal ? .073 * ease(0,5400,view.age) : 0));
    ctx.fillStyle = 'rgba(0,4,8,'+light+')';
    ctx.fillRect(0,0,FRAME.width,FRAME.height);
    this.drawShoes(ctx,view,dt,now);
    this.drawEyes(ctx,view,dt,now,low,safe,afterReveal);
  }

  drawShoes(ctx, view, dt, now) {
    const theft = view.state === STATES.SHOE_THEFT;
    const hiding = (view.state === STATES.RESET && view.returnFrom === STATES.SHOE_THEFT);
    if (theft) this.shoeProgress = ease(1920,5480,view.age);
    if (!theft && !hiding) this.shoeProgress = this.shoeVisible < .03 ? 0 : this.shoeProgress*Math.exp(-dt/250);
    const target = theft ? 1-ease(.76,1,this.shoeProgress) : Number(!hiding);
    this.shoeVisible += (target-this.shoeVisible)*(1-Math.exp(-dt/(theft ? 110 : 440)));
    if (this.shoeVisible < .013) return;
    const slide = this.shoeProgress;
    const x = 630 - slide*77;
    const y = 883 - slide*122;
    const width = 137 - slide*69;
    const drift = theft ? Math.sin(now*.009)*1.1*Math.sin(Math.PI*slide) : 0;
    const height = width*this.shoe.height/this.shoe.width*.77;
    ctx.save();
    ctx.translate(x,y);
    ctx.globalAlpha = this.shoeVisible*(1-slide*.55);
    ctx.scale(1,.27);
    const shadow = ctx.createRadialGradient(0,0,0,0,0,width*.66);
    shadow.addColorStop(0,'rgba(0,0,0,.83)');
    shadow.addColorStop(.65,'rgba(0,0,0,.43)');
    shadow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-width,-width,2*width,2*width);
    ctx.restore();
    ctx.save();
    ctx.translate(x,y+drift);
    ctx.rotate(-.077+slide*.16);
    ctx.globalAlpha = this.shoeVisible;
    ctx.filter = 'brightness(' + (.63-slide*.39) + ') saturate(.53)';
    ctx.drawImage(this.shoe,-width/2,-height*.84,width,height);
    ctx.restore();
  }

  drawEyes(ctx, view, dt, now, low, safe, afterReveal) {
    const surf = this.eyeContext;
    surf.clearRect(0,0,sieve.width,sieve.height);
    const amount = this.holes.length;
    const reveal = view.state === STATES.REVEAL;
    const cap = safe ? Math.min(30,amount) : amount;
    const goal = reveal ? Math.round(2+(cap-2)*ease(80,4940,view.age)) :
      afterReveal ? cap*(1-ease(0,2600,view.age)) :
      view.eyes === 2 ? Math.min(cap, 6 + Math.max(0,view.strikes-4)*3) : view.eyes === 1 ? 1 : 0;
    const convergence = reveal ? ease(3750,5250,view.age) : 0;
    let visible = 0;
    for (let i=0;i<amount;i++) {
      const hole = this.holes[i];
      const target = i < goal ? 1 : 0;
      this.levels[i] += (target-this.levels[i])*(1-Math.exp(-dt/(target ? 290+hole.delay*480 : 630)));
      const opacity = this.levels[i];
      if (opacity < .025) continue;
      visible++;
      this.eye(surf,hole,opacity,now,convergence,low);
    }
    this.visibleEyes = visible;
    if (!visible) return;
    surf.globalCompositeOperation = 'destination-in';
    surf.drawImage(this.mask,sieve.x,sieve.y,sieve.width,sieve.height,0,0,sieve.width,sieve.height);
    surf.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.eyes,sieve.x,sieve.y);
  }

  eye(ctx, hole, opacity, now, convergence, low) {
    const {x,y,w,h,tile,seed,depth} = hole;
    const clock = (now*.001 / (3.1+noise(seed+14)*5.4) + seed*.362) % 1;
    const blink = 1-ease(.001,.081,Math.abs(clock-.52));
    const opening = 1-blink*.93;
    const drift = 1-convergence*.88;
    const gazeX = Math.sin(now*.0011 + seed*6.2)*w*.068*drift;
    const gazeY = Math.sin(now*.00073 + seed*3.7)*h*.035*drift;
    const sx = (tile%2)*500+38;
    const sy = (tile>1 ? 500 : 0) + [122,112,105,110][tile];
    const width = w*1.25;
    const height = Math.min(h*.90,w*.69)*opening;
    ctx.save();
    ctx.globalAlpha = opacity*depth;
    ctx.filter = low ? 'brightness(1.16)' : 'brightness(1.33) saturate(.72)';
    ctx.drawImage(this.eyeSheet,sx,sy,424,262,x-width/2+gazeX,y-height/2+gazeY,width,height);
    ctx.restore();
  }
}
