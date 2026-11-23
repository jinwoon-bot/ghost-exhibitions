const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function paperBlend(progress){const t=clamp((progress-.02)/.32);return t*t*(3-2*t);}
export function paperPose(tile,progress,now,seed){
 const detach=clamp((progress-tile.n*.52)/.48),age=detach*detach;
 const phase=now*.0016+tile.n*17+seed;
 const accent=Math.pow(tile.n,12)*detach;
 return {detach,x:tile.vx*age*3.6+Math.sin(phase)*age*5,y:tile.vy*age*3.2+24*age*age,
  angle:tile.spin*age*2.8+Math.sin(phase*.73)*age*.28,
  width:(.55+tile.n*1.2+accent*3)*(1-detach*.22),height:(.65+(1-tile.n)*.9+accent*2)*(1-detach*.35),
  flutter:1-Math.sin(phase*1.3)*Math.sin(phase*1.3)*detach*.65,alpha:Math.pow(1-detach,.68)};
}
