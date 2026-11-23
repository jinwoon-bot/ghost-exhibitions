import {containGeometry,scenePoint,poseBox} from './tracking.mjs';
import {clamp} from './experience.mjs';
const canvas=()=>document.createElement('canvas');
export class Compositor {
  constructor(output,assets,config){
    this.output=output;this.ctx=output.getContext('2d',{alpha:false});this.assets=assets;this.config=config;
    this.ghost=canvas();this.gctx=this.ghost.getContext('2d');this.mask=canvas();this.mctx=this.mask.getContext('2d');this.maskSource=canvas();this.msctx=this.maskSource.getContext('2d');
    this.motion=canvas();this.motion.width=160;this.motion.height=120;this.motionCtx=this.motion.getContext('2d',{willReadFrequently:true});
    this.noise=canvas();this.noise.width=160;this.noise.height=120;this.nctx=this.noise.getContext('2d');
    this.maskTime=-Infinity;this.previousMask=null;this.poses=[];this.lastPlacement=null;this.lastMotion=0;this.frame=0;this.lastNoise=0;this.maskFraction=0;
    this.actorCurrent=canvas();this.actorOld=canvas();for(const c of [this.actorCurrent,this.actorOld]){c.width=432;c.height=768;}this.actorCtx=this.actorCurrent.getContext('2d');this.actorOldCtx=this.actorOld.getContext('2d');this.actorTime=-1;this.actorTransition=-Infinity;this.lastMedia=null;this.revealDone=false;
  }
  resize(width,aspect,sourceAspect=16/9){const ratio=aspect==='source'?sourceAspect:aspect==='16:9'?16/9:4/3;const h=Math.max(1,Math.round(width/ratio));if(this.output.width===width&&this.output.height===h)return;for(const c of [this.output,this.ghost,this.mask]){c.width=width;c.height=h;}this.lastPlacement=null;this.builtMaskTime=null;}
  clear(){this.maskTime=-Infinity;this.previousMask=null;this.poses=[];this.previousMotion=null;this.lastPlacement=null;this.lastMedia=null;this.actorTime=-1;this.revealDone=false;this.mctx.clearRect(0,0,this.mask.width,this.mask.height);}
  ingest(r,now){
    if(r.poses?.length)this.poses=r.poses;
    if(!r.mask||!r.maskWidth||!r.maskHeight){this.maskEmpty=true;this.emptySince??=now;this.maskTime=now;this.maskFraction=0;return;}
    this.maskEmpty=false;this.emptySince=null;
    const w=r.maskWidth,h=r.maskHeight,n=w*h;
    if(this.maskSource.width!==w||this.maskSource.height!==h){this.maskSource.width=w;this.maskSource.height=h;this.maskPixels=this.msctx.createImageData(w,h);this.previousMask=new Uint8Array(n);}
    if(!this.previousMask||this.previousMask.length!==n)this.previousMask=new Uint8Array(n);
    const data=this.maskPixels.data,low=this.config.maskThreshold*255;let count=0;
    for(let i=0;i<n;i++){
      // Hysteresis only releases the old matte for roughly one inference interval.
      const current=clamp((r.mask[i]-low)/(255-low)*1.65)*255;
      const a=Math.max(current,this.previousMask[i]*.42);this.previousMask[i]=a;
      const j=i*4;data[j]=data[j+1]=data[j+2]=255;data[j+3]=a;if(a>100)count++;
    }
    this.maskFraction=count/n;this.msctx.putImageData(this.maskPixels,0,0);this.maskTime=now;
  }
  placement(view,observation,cover){
    const W=this.output.width,H=this.output.height,g=this.assets.geometry,stage=view.stage;
    const entry=this.assets.entries[['ghost_far','ghost_middle','ghost_close'][stage]];
    const b=observation?.box;
    if(view.state==='RESET'&&this.lastPlacement)return this.lastPlacement;
    let anchorX=W*(view.side<0?.24:.76),footY=H*this.config.floor;
    let height=H*entry.height*this.config.ghostScale;
    if(b){
      const c=scenePoint({x:b.x,y:b.shoulderY},cover,W,this.config.mirror);
      const span=b.shoulderSpan*cover.w;
      // Position beside a shoulder; the matte hides the overlapping portion of the figure.
      anchorX=c.x+view.side*Math.max(W*[.22,.14,.055][stage],span*[1.45,1.05,.57][stage]);
      const head=scenePoint(observation.landmarks?.[0]||{x:b.x,y:b.top+.08},cover,W,this.config.mirror);
      const ankle=observation.landmarks?.[27],otherAnkle=observation.landmarks?.[28];
      const feetVisible=b.bottom<.96&&ankle?.visibility>.4&&otherAnkle?.visibility>.4;
      const fullHeight=feetVisible?clamp((cover.y+b.bottom*cover.h-H*.025-(head.y-H*.075))/(g.footY-g.headY),H*.42,H*1.35):clamp(span*4.8,H*.85,H*1.5);
      height=fullHeight*[.38,.69,1][stage]*this.config.ghostScale;
      const nearFoot=head.y-H*.065+fullHeight*(g.footY-g.headY);
      footY=nearFoot-H*[.16,.065,0][stage]+H*(this.config.floor-.91);
    }
    const width=height*g.width/g.height;
    if(stage===0&&!b)footY=H*(this.config.floor-.24);
    anchorX=clamp(anchorX+W*this.config.ghostX,width*.38,W-width*.38);
    footY+=H*this.config.ghostY;
    const place={x:anchorX-width*g.footX,y:footY-height*g.footY,w:width,h:height,footX:anchorX,footY};
    // While visible keep virtual feet in the room; no tracking jitter or lateral skating.
    if(this.lockedStage!==stage||this.lockedSide!==view.side||!this.lastPlacement||view.alpha<.02){this.lastPlacement=place;this.lockedStage=stage;this.lockedSide=view.side;}
    return this.lastPlacement;
  }
  buildMatte(video,cover,now){
    if(this.builtMaskTime===this.maskTime&&now-(this.lastMatteTime??-Infinity)<.085)return;
    this.builtMaskTime=this.maskTime;this.lastMatteTime=now;
    const ctx=this.mctx,W=this.mask.width,H=this.mask.height;ctx.clearRect(0,0,W,H);ctx.save();
    if(this.config.mirror){ctx.translate(W,0);ctx.scale(-1,1);}
    const emptyFade=this.maskEmpty?clamp(1-(now-this.emptySince-1.8)/1.2):1;
    ctx.globalAlpha=emptyFade;
    const grow=this.config.maskExpand;
    ctx.filter='none';
    ctx.drawImage(this.maskSource,cover.x,cover.y,cover.w,cover.h);
    if(grow>0){ctx.drawImage(this.maskSource,cover.x-grow,cover.y-grow,cover.w+grow*2,cover.h+grow*2);}
    ctx.filter='none';ctx.fillStyle='#fff';ctx.strokeStyle='#fff';ctx.lineCap='round';
    for(const l of this.poses){
      const b=poseBox(l);if(!b)continue;
      const sx=x=>cover.x+x*cover.w,sy=y=>cover.y+y*cover.h;
      // Conservative face/shoulder protection remains inside the person's core.
      const nose=l[0],radius=Math.max(10,b.shoulderSpan*cover.w*.27);
      if(nose?.visibility>.3){ctx.beginPath();ctx.ellipse(sx(nose.x),sy(nose.y),radius,radius*1.28,0,0,Math.PI*2);ctx.fill();}
      ctx.lineWidth=Math.max(8,b.shoulderSpan*cover.w*.6);ctx.beginPath();ctx.moveTo(sx(l[11].x),sy(l[11].y));ctx.lineTo(sx(l[12].x),sy(l[12].y));ctx.stroke();
    }
    ctx.restore();
    if(now-this.lastMotion>.085){
      this.motionCtx.drawImage(video,0,0,160,120);const next=this.motionCtx.getImageData(0,0,160,120).data;
      const diff=new Uint8Array(160*120);if(this.previousMotion)for(let i=0;i<diff.length;i++){const j=i*4;diff[i]=(Math.abs(next[j]-this.previousMotion[j])+Math.abs(next[j+1]-this.previousMotion[j+1])+Math.abs(next[j+2]-this.previousMotion[j+2]))/3;}
      this.previousMotion=next;this.motionDiff=diff;this.lastMotion=now;
    }
    // A fast arm/body movement between AI samples must reveal live pixels, never the ghost.
    if(this.motionDiff){ctx.save();ctx.fillStyle='#fff';for(const l of this.poses){const b=poseBox(l);if(!b)continue;const left=Math.max(0,Math.floor((b.left-.08)*160)),right=Math.min(160,Math.ceil((b.right+.08)*160));const top=Math.max(0,Math.floor((b.top-.04)*120)),bottom=Math.min(120,Math.ceil((b.bottom+.04)*120));for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(this.motionDiff[y*160+x]>19){let dx=cover.x+x/160*cover.w;if(this.config.mirror)dx=W-dx;ctx.fillRect(dx-4,cover.y+y/120*cover.h-4,9,9);}}ctx.restore();}
  }
  actorFrame(media,now){
    const stamp=media instanceof HTMLVideoElement?media.currentTime:0;
    const changed=this.lastMedia&&this.lastMedia!==media;
    const wrapped=this.lastMedia===media&&stamp<this.actorTime-.5;
    if(changed||wrapped){this.actorOldCtx.clearRect(0,0,432,768);this.actorOldCtx.drawImage(this.actorCurrent,0,0);this.actorTransition=now;}
    const ctx=this.actorCtx,blend=clamp((now-this.actorTransition)/.65);ctx.clearRect(0,0,432,768);
    ctx.globalAlpha=blend;ctx.drawImage(media,0,0,432,768);
    if(blend<1){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-blend;ctx.drawImage(this.actorOld,0,0);ctx.globalCompositeOperation='source-over';}
    ctx.globalAlpha=1;
    this.actorTime=stamp;this.lastMedia=media;return this.actorCurrent;
  }
  draw(video,view,observation,now,{sourceHealthy=false,showDebug=false,demo=false}={}){
    const ctx=this.ctx,W=this.output.width,H=this.output.height;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    const hasVideo=sourceHealthy&&video.readyState>=2&&video.videoWidth>0;
    const cover=hasVideo?containGeometry(video.videoWidth,video.videoHeight,W,H):{x:0,y:0,w:W,h:H};
    const waiting=view.state==='WAITING';
    if(hasVideo&&(!waiting||this.config.cameraAlways)){ctx.save();if(this.config.mirror){ctx.translate(W,0);ctx.scale(-1,1);}ctx.drawImage(video,cover.x,cover.y,cover.w,cover.h);ctx.restore();}
    const freshness=clamp((1.05-(now-this.maskTime))/.4);
    const alpha=hasVideo&&view.safe?view.alpha*freshness:0;
    if(alpha>.001){
      if(view.stage!==2)this.revealDone=false;
      const revealMedia=this.assets.entries.ghost_face_reveal.media;
      if(view.reveal&&revealMedia instanceof HTMLVideoElement&&revealMedia.ended)this.revealDone=true;
      const place=this.placement(view,observation,cover),key=view.reveal&&!this.revealDone?'ghost_face_reveal':['ghost_far','ghost_middle','ghost_close'][view.stage],entry=this.assets.entries[key];
      const media=this.assets.play(key);
      const gc=this.gctx;gc.clearRect(0,0,W,H);
      gc.save();gc.translate(place.footX,place.footY);gc.scale(place.w*.24,Math.max(2,place.h*.009));
      const shadow=gc.createRadialGradient(0,0,0,0,0,1);shadow.addColorStop(0,`rgba(0,0,0,${alpha*.3})`);shadow.addColorStop(1,'rgba(0,0,0,0)');gc.fillStyle=shadow;gc.fillRect(-1,-1,2,2);gc.restore();
      gc.save();gc.globalAlpha=alpha*entry.opacity;gc.filter=entry.brightness===1&&entry.blur===0?'none':`brightness(${entry.brightness}) blur(${entry.blur}px)`;
      if(media&&(!(media instanceof HTMLVideoElement)||media.readyState>=2))gc.drawImage(this.actorFrame(media,now),place.x,place.y,place.w,place.h);
      gc.restore();
      this.buildMatte(video,cover,now);gc.globalCompositeOperation='destination-out';gc.drawImage(this.mask,0,0);gc.globalCompositeOperation='source-over';
      ctx.save();ctx.beginPath();ctx.rect(cover.x,cover.y,cover.w,cover.h);ctx.clip();ctx.drawImage(this.ghost,0,0);ctx.restore();
      this.lastGhost={...place,key,alpha,maskAge:now-this.maskTime};
    }else this.lastGhost=null;
    // Production feed has no TV frame, rounded mask, vignette, scanlines or crop.
    if(showDebug&&hasVideo){ctx.save();ctx.globalAlpha=.27;ctx.fillStyle='#69d4b2';ctx.globalCompositeOperation='source-over';ctx.drawImage(this.mask,0,0);ctx.restore();for(const l of this.poses){ctx.fillStyle='#b3ada2';for(const p of l)if(p.visibility>.3){const d=scenePoint(p,cover,W,this.config.mirror);ctx.beginPath();ctx.arc(d.x,d.y,2.5,0,Math.PI*2);ctx.fill();}}}
    this.frame++;
    return {alpha,maskAge:now-this.maskTime,maskFraction:this.maskFraction,renderWidth:W,renderHeight:H};
  }
}
