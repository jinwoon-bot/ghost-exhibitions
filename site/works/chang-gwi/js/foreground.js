// Foreground is the *current camera frame*, not a frozen RGB cutout.
// The AI matte and short-lived motion coverage protect fast motion between inferences.
export function updateCoverage(rgba,previous,body,coverage,elapsed,first=false){
 const n=coverage.length;let mean=0;
 if(!first){for(let i=0;i<n;i++){const k=i*4;mean+=(rgba[k]*.2126+rgba[k+1]*.7152+rgba[k+2]*.0722)-previous[i];}mean/=n;}
 const fall=Math.max(0,elapsed)*255/360;
 for(let i=0;i<n;i++){const k=i*4,l=rgba[k]*.2126+rgba[k+1]*.7152+rgba[k+2]*.0722;
  const moving=!first&&Math.abs(l-previous[i]-mean)>16;
  coverage[i]=Math.max(body[i]>16?255:0,moving?255:Math.max(0,coverage[i]-fall));previous[i]=l;
 }
}
export function dilateCoverage(source,work,out,w,h,r=2){
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=0;for(let d=-r;d<=r;d++)m=Math.max(m,source[y*w+Math.max(0,Math.min(w-1,x+d))]);work[y*w+x]=m;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=0;for(let d=-r;d<=r;d++)m=Math.max(m,work[Math.max(0,Math.min(h-1,y+d))*w+x]);out[y*w+x]=Math.round(Math.min(255,m*255/80));}
}
export class Foreground{
 constructor(){this.small=document.createElement('canvas');this.sample=this.small.getContext('2d',{willReadFrequently:true});this.bodyCanvas=document.createElement('canvas');this.bodyCtx=this.bodyCanvas.getContext('2d',{willReadFrequently:true});this.mask=document.createElement('canvas');this.maskCtx=this.mask.getContext('2d');this.layer=document.createElement('canvas');this.layerCtx=this.layer.getContext('2d');this.key=null;this.lastTime=-1;this.at=0;this.frames=[];this.stats={};}
 resize(w,h){for(const c of [this.small,this.bodyCanvas,this.mask]){c.width=w;c.height=h;}this.previous=new Float32Array(w*h);this.body=new Uint8Array(w*h);this.coverage=new Float32Array(w*h);this.work=new Float32Array(w*h);this.alpha=new Uint8Array(w*h);this.pixels=this.maskCtx.createImageData(w,h);this.first=true;this.frames=[];this.lastTime=-1;}
 draw(display,video,tracker,now,{x,y,width,height,mirror}){
  const ratio=Math.min(1,176/Math.max(video.videoWidth,video.videoHeight)),w=Math.max(1,Math.round(video.videoWidth*ratio)),h=Math.max(1,Math.round(video.videoHeight*ratio));
  const key=video.srcObject||video.currentSrc||video;
  if(this.small.width!==w||this.small.height!==h||this.key!==key||this.mirror!==mirror){this.resize(w,h);this.key=key;this.mirror=mirror;}
  const changed=this.frames.length!==tracker.tracks.length||tracker.tracks.some((t,i)=>this.frames[i]!==t.frame.canvas);
  if(changed){const c=this.bodyCtx;c.clearRect(0,0,w,h);for(const t of tracker.tracks){const b=t.frame.box;c.drawImage(t.frame.canvas,b.x*w/tracker.width,b.y*h/tracker.height,b.w*w/tracker.width,b.h*h/tracker.height);}const px=c.getImageData(0,0,w,h).data;for(let i=0;i<this.body.length;i++)this.body[i]=px[i*4+3];this.frames=tracker.tracks.map(t=>t.frame.canvas);}
  if(video.currentTime!==this.lastTime||changed){
   const c=this.sample;c.save();if(mirror){c.translate(w,0);c.scale(-1,1);}c.drawImage(video,0,0,w,h);c.restore();
   updateCoverage(c.getImageData(0,0,w,h).data,this.previous,this.body,this.coverage,Math.min(1000,now-this.at),this.first);
   dilateCoverage(this.coverage,this.work,this.alpha,w,h);const pixels=this.pixels.data;let protectedPixels=0;for(let i=0;i<this.alpha.length;i++){pixels[i*4]=pixels[i*4+1]=pixels[i*4+2]=255;pixels[i*4+3]=this.alpha[i];if(this.alpha[i]>240)protectedPixels++;}this.maskCtx.putImageData(this.pixels,0,0);this.first=false;this.at=now;this.lastTime=video.currentTime;
   this.stats={width:w,height:h,protectedPixels,mask:'AI + short motion hold',currentVideo:true};
  }
  const cw=Math.max(1,Math.round(width)),ch=Math.max(1,Math.round(height));if(this.layer.width!==cw||this.layer.height!==ch){this.layer.width=cw;this.layer.height=ch;}
  const c=this.layerCtx;c.clearRect(0,0,cw,ch);c.save();if(mirror){c.translate(cw,0);c.scale(-1,1);}c.drawImage(video,0,0,cw,ch);c.restore();c.globalCompositeOperation='destination-in';c.drawImage(this.mask,0,0,cw,ch);c.globalCompositeOperation='source-over';display.drawImage(this.layer,x,y,width,height);
 }
 dispose(){for(const c of [this.small,this.bodyCanvas,this.mask,this.layer])c.width=c.height=0;this.frames=[];this.key=null;this.stats={};this.previous=this.body=this.coverage=this.work=this.alpha=this.pixels=null;}
}
