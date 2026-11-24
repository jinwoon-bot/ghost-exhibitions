import { STATES } from './score.mjs?v=clap-response';

export const FRAME = { width:1672, height:941 };
const sieve = { x:645, y:249, width:370, height:376 };
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
  const depth = .52+noise(seed+17)*.46;
  return {
    x:x+w/2-sieve.x, y:y+h/2-sieve.y, w, h, seed,
    tile:index ? Math.floor(noise(seed)*4) : 2,
    depth,
    angle:(noise(seed+8)-.5)*.36,
    light:index ? 'brightness('+(1.43+depth*.83)+') saturate(.55)' : 'brightness(2.4) contrast(1.09) saturate(.35)',
    delay:noise(seed+33),
    order:index ? Math.hypot((x+w/2-831)*.76,y+h/2-438)+noise(seed+57)*125 : -1,
  };
}

function attention(strikes, first, many, cap) {
  if (strikes < first) return 0;
  if (strikes < many) return Math.min(cap,1 + (strikes-first)*3);
  return Math.min(cap,9 + (strikes-many)*7);
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
    this.darkness = 0;
    this.push = 0;
    this.ready = this.load().catch(error => { onError(error.message); return false; });
  }

  async load() {
    const [shoe, eyeSheet, mask, response] = await Promise.all([
      image('jipsin.png'), image('eye-sheet.jpg'), image('weave-apertures.png'), fetch(url('weave-eyes.json')),
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
    const targetPush = (reveal ? .21 : view.eyes ? .115+view.eyes*.015 : 0) * (safe ? .25 : 1);
    this.push += (targetPush-this.push)*(1-Math.exp(-dt/(targetPush>this.push ? 250 : 600)));
    const scale = (1+this.push).toFixed(3);
    if (scale !== this.scale) {
      this.frame.style.setProperty('--push',scale);
      this.scale = scale;
    }
    const light = .028 + .012*Math.sin(now*.00057);
    ctx.fillStyle = 'rgba(0,4,8,'+light+')';
    ctx.fillRect(0,0,FRAME.width,FRAME.height);
    this.drawShoes(ctx,view,dt,now);
    const targetDarkness = (reveal ? .55 : view.eyes*.13) * (safe ? .69 : 1);
    this.darkness += (targetDarkness-this.darkness)*(1-Math.exp(-dt/(targetDarkness>this.darkness ? 180 : 410)));
    if (this.darkness > .006) {
      const shadow = ctx.createRadialGradient(831,433,138,831,456,850);
      shadow.addColorStop(0,'rgba(0,3,6,'+(this.darkness*.18)+')');
      shadow.addColorStop(.47,'rgba(0,3,6,'+(this.darkness*.58)+')');
      shadow.addColorStop(1,'rgba(0,2,5,'+this.darkness+')');
      ctx.fillStyle = shadow;
      ctx.fillRect(0,0,FRAME.width,FRAME.height);
    }
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
    const cap = safe ? Math.min(21,amount) : amount;
    const awake = attention(view.strikes,view.first,view.many,cap);
    const beforeReveal = Math.max(1,attention(view.strikes-1,view.first,view.many,cap));
    const goal = reveal ? Math.round(beforeReveal+(cap-beforeReveal)*ease(0,1450,view.age)) :
      afterReveal ? cap*(1-ease(0,1040,view.age)) : awake;
    const convergence = reveal ? ease(1380,2310,view.age) : 0;
    const listening = (1-ease(125,415,view.hitAge))*(safe ? .5 : 1);
    let visible = 0;
    for (let i=0;i<amount;i++) {
      const hole = this.holes[i];
      const target = i < goal ? 1 : 0;
      const response = i === 0 ? 58 : 92+hole.delay*155;
      this.levels[i] += (target-this.levels[i])*(1-Math.exp(-dt/(target ? response : 370)));
      const opacity = this.levels[i];
      if (opacity < .025) continue;
      visible++;
      this.eye(surf,hole,opacity,now,Math.max(convergence,listening),low,view.hitAge);
    }
    this.visibleEyes = visible;
    if (!visible) return;
    surf.globalCompositeOperation = 'destination-in';
    surf.drawImage(this.mask,sieve.x,sieve.y,sieve.width,sieve.height,0,0,sieve.width,sieve.height);
    surf.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.eyes,sieve.x,sieve.y);
  }

  eye(ctx, hole, opacity, now, convergence, low, hitAge) {
    const {x,y,w,h,tile,seed,depth} = hole;
    const first = seed === 1;
    const clock = (now*.001 / (3.1+noise(seed+14)*5.4) + seed*.362) % 1;
    const blink = first && hitAge < 1450 ? 0 : (1-ease(.001,.062,Math.abs(clock-.52)))*(1-convergence*.88);
    const opening = (.22+.78*ease(.03,.76,opacity))*(1-blink*.93);
    const drift = 1-convergence;
    const gazeX = (Math.sin(now*.0011+seed*6.2)*.075 + (noise(seed+51)-.5)*.11)*w*drift;
    const gazeY = Math.sin(now*.00073+seed*3.7)*h*.073*drift;
    const sx = (tile%2)*500+38;
    const sy = (tile>1 ? 500 : 0) + [122,112,105,110][tile];
    const width = w*(first ? 1.64 : 1.04+depth*.25);
    const height = Math.min(h*(first ? 1.46 : 1.04),w*.95)*opening;
    ctx.save();
    ctx.translate(x+gazeX,y+gazeY);
    ctx.rotate(hole.angle*(1-convergence*.54));
    ctx.globalAlpha = opacity*(first ? .98 : .42+depth*.57);
    ctx.filter = low && !first ? 'brightness(1.81) saturate(.55)' : hole.light;
    ctx.drawImage(this.eyeSheet,sx,sy,424,262,-width/2,-height/2,width,height);
    ctx.restore();
  }
}
