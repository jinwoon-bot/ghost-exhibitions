import { STATES } from './score.mjs?v=double-clap';

const stage = { x:600, y:205, size:460 };
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

function surface(width,height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function isolateSieve(photo) {
  const plate = surface(stage.size,stage.size);
  const ctx = plate.getContext('2d');
  ctx.translate(-stage.x,-stage.y);
  ctx.beginPath();
  ctx.moveTo(827,237);
  ctx.bezierCurveTo(937,236,1017,316,1022,414);
  ctx.bezierCurveTo(1030,531,955,625,851,633);
  ctx.bezierCurveTo(728,646,644,558,637,447);
  ctx.bezierCurveTo(627,338,715,246,827,237);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(photo,0,0);
  const light = ctx.createLinearGradient(682,282,982,613);
  light.addColorStop(0,'rgba(3,5,8,.07)');
  light.addColorStop(.42,'rgba(2,3,5,.16)');
  light.addColorStop(.77,'rgba(0,1,3,.43)');
  light.addColorStop(1,'rgba(0,0,0,.81)');
  ctx.fillStyle = light;
  ctx.fillRect(stage.x,stage.y,stage.size,stage.size);
  return plate;
}

function describe(box,index) {
  const [x,y,w,h] = box;
  const seed = index+1;
  const depth = .28+noise(seed+17)*.72;
  return {
    x:x+w/2-sieve.x, y:y+h/2-sieve.y, w, h, seed,
    tile:index ? Math.floor(noise(seed)*4) : 2,
    depth,
    angle:(noise(seed+8)-.5)*.36,
    light:index ? 'brightness('+(1.25+depth*.74)+')' : 'brightness(2.65)',
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
  constructor(canvas, frame, clip, onError) {
    this.canvas = canvas;
    this.frame = frame;
    this.clip = clip;
    this.ctx = canvas.getContext('2d');
    this.eyes = surface(sieve.width,sieve.height);
    this.eyeContext = this.eyes.getContext('2d');
    this.levels = [];
    this.visibleEyes = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.last = 0;
    this.darkness = 0;
    this.push = 0;
    this.ready = this.load().catch(error => { onError(error.message); return false; });
  }

  async load() {
    const [photo, eyeSheet, mask, response, apparition] = await Promise.all([
      image('gate-oremi.jpg'), image('eye-night.jpg'), image('weave-apertures.png'), fetch(url('weave-eyes.json')),
      image('yagwanggwi-lunge.png'),
    ]);
    if (!response.ok) throw Error('체 구멍 마스크를 불러올 수 없습니다.');
    const boxes = await response.json();
    if (!boxes.length) throw Error('체 구멍 좌표가 비어 있습니다.');
    this.plate = isolateSieve(photo);
    this.eyeSheet = eyeSheet;
    this.mask = mask;
    this.apparition = apparition;
    this.apparition.className = 'apparition';
    this.apparition.alt = '';
    this.apparition.hidden = true;
    this.frame.append(this.apparition);
    this.holes = boxes.map(describe).sort((a,b)=>a.order-b.order);
    this.levels = this.holes.map(()=>0);
    return true;
  }

  resize(low) {
    const { clientWidth: w, clientHeight: h } = this.frame;
    if (!w || !h) return;
    const ratio = Math.min(window.devicePixelRatio || 1,1.5,(low ? 620 : 1050)/w);
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
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,width,height);
    if (!this.holes) return;
    const scaleX = width/stage.size, scaleY = height/stage.size;
    ctx.setTransform(scaleX,0,0,scaleY,-stage.x*scaleX,-stage.y*scaleY);
    safe ||= this.reducedMotion.matches;
    const reveal = view.state === STATES.REVEAL;
    const lunge = view.state === STATES.LUNGE;
    const afterReveal = view.state === STATES.RESET && view.returnFrom === STATES.REVEAL;
    const targetPush = (reveal ? .095 : lunge ? 0 : view.eyes*.022) * (safe ? .25 : 1);
    this.push += (targetPush-this.push)*(1-Math.exp(-dt/(targetPush>this.push ? 740 : 920)));
    const scale = (1+this.push).toFixed(3);
    if (scale !== this.scale) {
      this.frame.style.setProperty('--push',scale);
      this.scale = scale;
    }
    ctx.globalAlpha = lunge ? 1-.58*ease(85,380,view.age)*(1-ease(1040,1930,view.age)) : 1;
    ctx.drawImage(this.plate,stage.x,stage.y);
    ctx.globalAlpha = 1;
    this.drawShadow(ctx,view,dt,safe);
    this.drawEyes(ctx,view,dt,now,low,safe,afterReveal);
    if (lunge) this.drawLunge(ctx,view.age,safe);
    else if (this.lungeMode) {
      this.lungeMode = this.clipAttempt = null;
      this.clip.pause();
      this.clip.hidden = this.apparition.hidden = true;
    }
  }

  drawLunge(ctx,age,safe) {
    const behind = ease(0,90,age)*(1-ease(100,230,age));
    if (behind > .01) {
      const surf = this.eyeContext;
      surf.clearRect(0,0,sieve.width,sieve.height);
      surf.save();
      surf.globalAlpha = behind*.69;
      surf.drawImage(this.apparition,692-sieve.x,342-sieve.y,280,280);
      surf.restore();
      surf.globalCompositeOperation = 'destination-in';
      surf.drawImage(this.mask,sieve.x,sieve.y,sieve.width,sieve.height,0,0,sieve.width,sieve.height);
      surf.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.eyes,sieve.x,sieve.y);
    }

    if (!this.lungeMode) {
      this.lungeMode = safe || this.clip.readyState < 2 ? 'still' : 'video';
      if (this.lungeMode === 'video') {
        this.clip.currentTime = age < 42 ? 0 : age/1000;
        this.clip.hidden = false;
        const attempt = this.clip.play();
        this.clipAttempt = attempt;
        attempt.catch(() => {
          if (this.clipAttempt !== attempt) return;
          this.clip.hidden = true;
          this.lungeMode = 'still';
        });
      }
    }
    if (safe && this.lungeMode === 'video') {
      this.clipAttempt = null;
      this.clip.pause();
      this.clip.hidden = true;
      this.lungeMode = 'still';
    }
    if (this.lungeMode === 'video') {
      this.clip.style.opacity = (ease(49,194,age)*(1-ease(1530,1900,age))).toFixed(3);
      return;
    }

    const advance = 1-(1-clamp((age-72)/(safe ? 440 : 139)))**2.15;
    const retreat = ease(420,1400,age);
    const depth = advance*(1-retreat);
    const front = ease(82,safe ? 440 : 215,age)*(1-ease(1050,1770,age));
    const size = 345+depth*(safe ? 60 : 255);
    const nod = Math.sin(age*.031)*Math.exp(-age/176)*depth*(safe ? 0 : 10);
    const x = (2+nod)*100/stage.size;
    const y = (89.4-depth*80)*100/stage.size;
    this.apparition.hidden = false;
    this.apparition.style.opacity = front.toFixed(3);
    this.apparition.style.transform = `translate3d(${x}%,${y}%,0) scale(${size/stage.size})`;
  }

  drawShadow(ctx,view,dt,safe) {
    const quiet = view.state === STATES.QUIET;
    const reveal = view.state === STATES.REVEAL;
    const lunge = view.state === STATES.LUNGE;
    const attack = ease(0,190,view.hitAge)*(1-ease(400,1050,view.hitAge));
    const target = quiet ? .57*ease(0,2200,view.age) : reveal || lunge ? .68 : view.eyes*.15+attack*.18;
    this.darkness += (target*(safe ? .62 : 1)-this.darkness)*(1-Math.exp(-dt/165));
    if (this.darkness < .003) return;
    const bearing = lunge ? .61 : reveal ? ease(80,2050,view.age) : attack*.69;
    const x = 965-bearing*210;
    const shadow = ctx.createRadialGradient(x,497,20,x,485,245);
    shadow.addColorStop(0,'rgba(0,0,0,.92)');
    shadow.addColorStop(.52,'rgba(0,0,0,.57)');
    shadow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = this.darkness;
    ctx.fillStyle = shadow;
    ctx.fillRect(stage.x,stage.y,stage.size,stage.size);
    ctx.restore();
  }

  drawEyes(ctx, view, dt, now, low, safe, afterReveal) {
    const surf = this.eyeContext;
    surf.clearRect(0,0,sieve.width,sieve.height);
    const amount = this.holes.length;
    const reveal = view.state === STATES.REVEAL;
    const lunge = view.state === STATES.LUNGE || (view.state === STATES.RESET && view.returnFrom === STATES.LUNGE);
    const cap = safe ? Math.min(21,amount) : amount;
    const awake = attention(view.strikes,view.first,view.many,cap);
    const beforeReveal = Math.max(1,attention(view.strikes-1,view.first,view.many,cap));
    const goal = lunge ? 0 : reveal ? Math.round(beforeReveal+(cap-beforeReveal)*ease(0,1450,view.age)) :
      afterReveal ? cap*(1-ease(0,1040,view.age)) : awake;
    const convergence = reveal ? ease(1100,2200,view.age) : 0;
    const listening = (1-ease(125,415,view.hitAge))*(safe ? .5 : 1);
    let visible = 0;
    for (let i=0;i<amount;i++) {
      const hole = this.holes[i];
      const target = i < goal ? 1 : 0;
      const response = i === 0 ? 58 : 92+hole.delay*155;
      this.levels[i] += (target-this.levels[i])*(1-Math.exp(-dt/(target ? response : lunge ? 64 : 370)));
      const opacity = this.levels[i];
      if (opacity < .025) continue;
      visible++;
      const focus = reveal ? ease(.13*hole.delay,1,convergence) : listening;
      this.eye(surf,hole,opacity,now,focus,low,view.hitAge);
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
    const blink = first && hitAge < 1450 ? 0 : (1-ease(.001,.043,Math.abs(clock-.52)))*(1-convergence);
    const opening = (.22+.78*ease(.03,.76,opacity))*(1-blink*.93);
    const drift = 1-convergence;
    const gazeX = (first ? 9 : 0) +
      (Math.sin(now*.0011+seed*6.2)*.075 + (noise(seed+51)-.5)*.11)*w*drift;
    const gazeY = (first ? 7 : 0) + Math.sin(now*.00073+seed*3.7)*h*.073*drift;
    const sx = (tile%2)*500+48;
    const sy = (tile>1 ? 500 : 0)+130;
    const width = w*(first ? 1.55 : .94+depth*.34);
    const height = Math.min(h*(first ? 1.49 : 1.08),w*.96)*opening;
    ctx.save();
    ctx.translate(x+gazeX,y+gazeY);
    ctx.rotate(hole.angle*(1-convergence*.54));
    ctx.globalAlpha = opacity*(first ? 1 : .28+depth*.70);
    ctx.filter = low && !first ? 'brightness(1.60)' : hole.light;
    ctx.drawImage(this.eyeSheet,sx,sy,404,240,-width/2,-height/2,width,height);
    ctx.restore();
  }
}
