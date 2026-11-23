const visible=p=>p&&p.visibility>.25;
export function poseBox(l){
  const points=l.filter(visible);if(points.length<6||!visible(l[11])||!visible(l[12]))return null;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
  return {x:(left+right)/2,y:(top+bottom)/2,left,right,top,bottom,area:Math.max(.001,(right-left)*(bottom-top)),shoulderY:(l[11].y+l[12].y)/2,shoulderSpan:Math.abs(l[11].x-l[12].x)};
}
export class Observer {
  constructor(config){this.config=config;this.primary=null;this.lastSeen=0;this.yaw=0;this.lastResult=0;this.faceTime=-Infinity;this.latestFace=null;}
  clear(){this.primary=null;this.lastSeen=0;this.latestFace=null;this.faceTime=-Infinity;}
  ingest(r,now){
    this.lastResult=now;this.brightness=r.brightness;
    const candidates=r.poses.map((p,i)=>({landmarks:p,box:poseBox(p),i})).filter(p=>p.box);
    if(!candidates.length){this.primary=null;this.latestFace=null;this.faceTime=-Infinity;return this.sample(now);}
    const prior=this.primary?.box;
    // Prefer the largest nearby body; retain a track through small competing detections.
    candidates.sort((a,b)=>b.box.area-a.box.area);let best=candidates[0];
    if(prior){const current=candidates.find(p=>Math.hypot(p.box.x-prior.x,p.box.y-prior.y)<.19);if(current&&current.box.area>=best.box.area*.65)best=current;}
    const switched=!prior||Math.hypot(best.box.x-prior.x,best.box.y-prior.y)>.22;
    this.primary=best;this.lastSeen=now;
    if(switched){this.latestFace=null;this.faceTime=-Infinity;this.yaw=0;}
    if(r.facesUpdated){
      const nose=best.landmarks[0],matches=(r.faces||[]).filter(f=>f.nose&&Math.hypot(f.nose.x-nose.x,f.nose.y-nose.y)<.18).sort((a,b)=>Math.hypot(a.nose.x-nose.x,a.nose.y-nose.y)-Math.hypot(b.nose.x-nose.x,b.nose.y-nose.y));
      this.latestFace=matches[0]||null;this.faceTime=now;
      if(this.latestFace){const target=this.latestFace.yaw;this.yaw=switched?target:this.yaw*.35+target*.65;}
    }
    return this.sample(now);
  }
  sample(now){
    const valid=now-this.lastResult<1.2;
    if(!valid||!this.primary)return {valid,present:false,facing:'unknown',turnEvidence:false,box:null};
    const l=this.primary.landmarks,box=this.primary.box;
    const face=this.latestFace&&now-this.faceTime<.75;
    const span=Math.max(.04,box.shoulderSpan),nose=l[0],mid=(l[11].x+l[12].x)/2;
    const offset=visible(nose)?(nose.x-mid)/span:0;
    const leftEar=visible(l[7]),rightEar=visible(l[8]);
    const torsoTurn=box.shoulderSpan<.075&&box.bottom-box.top>.35;
    let facing='unknown',turnEvidence=false;
    if(face){
      if(Math.abs(this.yaw)>this.config.turnAngle){facing='away';turnEvidence=true;}
      else if(Math.abs(this.yaw)<this.config.turnAngle*.65)facing='front';
    }else if((Math.abs(offset)>.42&&leftEar!==rightEar)||torsoTurn){facing='away';turnEvidence=true;}
    else if(nose?.visibility>.65&&l[7]?.visibility>.65&&l[8]?.visibility>.65&&Math.abs(offset)<.2&&box.shoulderSpan>.07){facing='front';}
    return {valid,present:true,facing,turnEvidence,box,landmarks:l,yaw:face?this.yaw:null,people:this.people||1,brightness:this.brightness};
  }
}
export function coverGeometry(sw,sh,dw,dh){const scale=Math.max(dw/sw,dh/sh);return {x:(dw-sw*scale)/2,y:(dh-sh*scale)/2,w:sw*scale,h:sh*scale};}
// Full input frame, never zoom/crop. Black padding is preferable to losing camera edges.
export function containGeometry(sw,sh,dw,dh){const scale=Math.min(dw/sw,dh/sh);return {x:(dw-sw*scale)/2,y:(dh-sh*scale)/2,w:sw*scale,h:sh*scale};}
export function scenePoint(p,cover,width,mirror){const x=cover.x+p.x*cover.w;return {x:mirror?width-x:x,y:cover.y+p.y*cover.h};}
