const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
// Stateless: dropped rendering frames cannot change a clone's pose or lifetime.
export function dissolveTimeline(age,decay=1){
 age=clamp(age);
 return {age,flow:smooth((age-.12)/.8),erosion:clamp((age-.22)*decay/.78),
  visibility:(.25+.75*smooth(age/.065))*(1-smooth((age-.82)/.18)),
  rim:(1-smooth(age/.32))*.75};
}
export function ribbonPose(row,age,elapsed,seed,direction=1){
 const p=dissolveTimeline(age),phase=row*.33+seed;
 return {x:direction*p.flow*p.flow*42+Math.sin(phase+elapsed*.0008)*p.flow*11,
  y:-p.flow*p.flow*25+Math.cos(phase*.7+elapsed*.0006)*p.flow*4,
  stretch:1+p.flow*(.35+.4*Math.sin(phase)**2),alpha:p.visibility*(1-p.erosion*.65)};
}
