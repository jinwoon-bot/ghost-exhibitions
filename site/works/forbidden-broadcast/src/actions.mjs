import {poseBox} from './tracking.mjs';
const seen=(p,v=.45)=>p&&p.visibility>=v&&Number.isFinite(p.x)&&Number.isFinite(p.y);
// Proximity is an image-size proxy, not a metric distance or person identification.
export class ActionObserver{
 constructor(config){this.config=config;this.clear();}
 clear(){this.primary=null;this.lastResult=-Infinity;this.lastSeen=-Infinity;this.history=[];this.action='generic';this.candidate='generic';this.candidateSince=0;this.confirmedSince=0;this.people=0;this.brightness=0;this.track=0;}
 ingest(r,now){
  this.lastResult=now;this.brightness=r.brightness;
  const people=(r.poses||[]).map((landmarks,i)=>({landmarks,box:poseBox(landmarks),i})).filter(p=>p.box&&p.box.shoulderSpan>.035);
  this.people=people.length;if(!people.length){this.primary=null;this.history=[];this.action='generic';return;}
  people.sort((a,b)=>b.box.area-a.box.area);let next=people[0];const old=this.primary;
  if(old){const same=people.find(p=>Math.hypot(p.box.x-old.box.x,p.box.y-old.box.y)<.18);if(same&&same.box.area>=next.box.area*.72)next=same;}
  const switched=!old||Math.hypot(next.box.x-old.box.x,next.box.y-old.box.y)>.23;
  if(switched){this.track++;this.history=[];this.action='generic';this.candidate='generic';this.candidateSince=now;}
  this.primary=next;this.lastSeen=now;
  const l=next.landmarks,b=next.box;
  const oneUp=(w,s)=>seen(l[w])&&seen(l[s])&&l[w].y<l[s].y-.055;
  const hands=Number(oneUp(15,11))+Number(oneUp(16,12));
  const wrists=[15,16].filter(i=>seen(l[i])).map(i=>({i,x:l[i].x,y:l[i].y}));
  this.history.push({t:now,x:b.x,y:b.shoulderY,size:b.shoulderSpan,wrists});
  while(this.history.length&&now-this.history[0].t>3.3)this.history.shift();
  const earlier=this.history.find(h=>now-h.t<=1.1)||this.history[0],dt=Math.max(.15,now-earlier.t);
  const vx=(b.x-earlier.x)/dt,vs=(b.shoulderSpan-earlier.size)/dt;
  const range=this.history.filter(h=>now-h.t<=2.4);
  const stable=range.length>=5&&now-range[0].t>=1.8&&range.every(h=>Math.hypot(h.x-b.x,h.y-b.shoulderY)<.023&&Math.abs(h.size-b.shoulderSpan)<.022&&h.wrists.length===wrists.length&&h.wrists.every(w=>{const current=wrists.find(a=>a.i===w.i);return current&&Math.hypot(w.x-current.x,w.y-current.y)<.035;}));
  let action=hands===2?'both':hands===1?'hand':vs>.017?'approach':vs<-.017?'retreat':Math.abs(vx)>.045?((vx*(this.config.mirror?-1:1))<0?'left':'right'):stable?'still':'generic';
  if(action!==this.candidate){this.candidate=action;this.candidateSince=now;}
  if(now-this.candidateSince>=this.config.actionHold&&this.action!==action){this.action=action;this.confirmedSince=now;}
 }
 sample(now){const valid=now-this.lastResult<1.2,p=this.primary;if(!valid||!p)return {valid,present:false,people:valid?this.people:0,action:'generic',box:null,track:this.track};return {valid,present:true,people:this.people,box:p.box,landmarks:p.landmarks,near:p.box.shoulderSpan>=this.config.approachSize,action:this.action,actionAge:now-this.confirmedSince,track:this.track,brightness:this.brightness};}
}
