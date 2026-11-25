import { clamp, smooth } from './score.mjs?v=wet-lens';

const landingZones=[[.20,.38],[.83,.56],[.35,.66],[.75,.23],[.56,.45],[.11,.61],[.92,.37]];

export class LensDrops {
  constructor(random=Math.random) {
    this.random=random;
    this.drops=[];
    this.untilSplash=.28;
    this.zone=0;
  }

  step(dt,wind,low=false) {
    const spray=smooth(.52,.97,wind);
    for (const drop of this.drops) drop.age+=dt;
    this.drops=this.drops.filter(drop=>drop.age<drop.life);
    if (spray<.02) { this.untilSplash=.23; return; }
    this.untilSplash-=dt*spray;
    if (this.untilSplash>0) return;
    this.untilSplash=.80+this.random()*.70;
    if (this.drops.length>=(low ? 5 : 8)) return;
    const zone=this.zone++%landingZones.length;
    const [x,y]=landingZones[zone];
    const radius=.018+this.random()*.013+spray*(zone%3===0 ? .020 : .008);
    this.drops.push({
      x:x+(this.random()-.5)*.089, y:y+(this.random()-.5)*.088,
      radius, age:0, life:3.8+this.random()*2.0,
      slide:.64+this.random()*.9, tilt:(this.random()-.5)*.43,
    });
  }
}

export function lensPose(drop) {
  const slippage=Math.max(0,drop.age-drop.slide);
  return {
    x:drop.x+slippage*.005*Math.sin(drop.tilt*9),
    y:drop.y+slippage*(.016+slippage*.009),
    radius:drop.radius*(.74+.26*smooth(0,.12,drop.age)),
    stretch:1.02+.43*smooth(.02,2.3,slippage),
    trail:smooth(.25,2.25,slippage),
    alpha:smooth(0,.09,drop.age)*(1-smooth(drop.life-.75,drop.life,drop.age)),
  };
}

export class WetLens {
  constructor() {
    this.motion=new LensDrops();
    this.plate=document.createElement('canvas');
    this.plateContext=this.plate.getContext('2d',{alpha:false});
  }

  draw(c,water,scene,w,h,dt,wind,low) {
    this.motion.step(dt,wind,low);
    if (!this.motion.drops.length) return;
    const pw=Math.round(w*(low ? .45 : .55)), ph=Math.round(h*(low ? .45 : .55));
    if(this.plate.width!==pw || this.plate.height!==ph) {
      this.plate.width=pw;
      this.plate.height=ph;
    }
    const sample=this.plateContext;
    if(!water.hidden) sample.drawImage(water,0,0,pw,ph);
    sample.drawImage(scene,0,0,pw,ph);
    for (const drop of this.motion.drops) {
      const p=lensPose(drop);
      if(p.alpha<.01 || p.y>1.10) continue;
      const x=p.x*w, y=p.y*h, rx=p.radius*h, ry=rx*p.stretch;
      const sw=Math.max(1,2*rx/w*pw*.67), sh=Math.max(1,2*ry/h*ph*.63);
      const sx=clamp((p.x-.012)*pw-sw*.50,0,pw-sw), sy=clamp((p.y+.027)*ph-sh*.50,0,ph-sh);
      if(p.trail>.015) {
        c.strokeStyle=`rgba(155,176,188,${.16*p.alpha*p.trail})`;
        c.lineWidth=Math.max(.7,rx*.10);
        c.beginPath();
        c.moveTo(x+rx*.13,y-ry*(1.2+2.7*p.trail));
        c.quadraticCurveTo(x-rx*.15,y-ry*1.65,x+rx*.02,y-ry*.83);
        c.stroke();
      }
      c.save();
      c.translate(x,y);
      c.rotate(drop.tilt);
      c.globalAlpha=p.alpha;
      c.beginPath();
      c.moveTo(-rx*.08,-ry);
      c.bezierCurveTo(rx*.62,-ry*1.09,rx*.96,-ry*.52,rx*.96,ry*.13);
      c.bezierCurveTo(rx*.97,ry*.73,rx*.53,ry*.99,rx*.02,ry);
      c.bezierCurveTo(-rx*.53,ry*.95,-rx,ry*.54,-rx,-ry*.10);
      c.bezierCurveTo(-rx*.99,-ry*.66,-rx*.60,-ry*.99,-rx*.08,-ry);
      c.closePath();
      c.clip();
      c.drawImage(this.plate,sx,sy,sw,sh,-rx,-ry,rx*2,ry*2);
      const optics=c.createRadialGradient(rx*.12,-ry*.11,rx*.18,0,0,Math.max(rx,ry));
      optics.addColorStop(0,'rgba(179,194,201,.035)');
      optics.addColorStop(.62,'rgba(16,22,28,.09)');
      optics.addColorStop(1,'rgba(2,7,10,.57)');
      c.fillStyle=optics;
      c.fillRect(-rx,-ry,rx*2,ry*2);
      c.strokeStyle='rgba(153,172,186,.42)';
      c.lineWidth=Math.max(.8,rx*.062);
      c.beginPath();
      c.ellipse(-rx*.065,-ry*.03,rx*.86,ry*.83,.01,3.63,4.92);
      c.stroke();
      c.strokeStyle='rgba(184,200,205,.30)';
      c.lineWidth=Math.max(.55,rx*.034);
      c.beginPath();
      c.ellipse(-rx*.09,-ry*.07,rx*.79,ry*.77,-.10,4.14,4.65);
      c.stroke();
      c.restore();
    }
  }
}
