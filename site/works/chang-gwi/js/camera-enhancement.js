// 추론용 픽셀만 보정한다. 표시되는 원본 카메라는 바꾸지 않는다.
export function enhanceLowLight(rgba) {
  const histogram=new Uint32Array(256);let count=0,sum=0;
  for(let p=0;p<rgba.length;p+=16){const y=Math.round(.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2]);histogram[y]++;sum+=y;count++;}
  if(!count)return {mean:0,median:0,gamma:1,unusable:true};
  let total=0,median=0;for(;median<255;median++){total+=histogram[median];if(total>=count*.5)break;}
  const mean=sum/count;
  const gamma=median>=88||mean<5?1:Math.max(.6,Math.min(1,Math.log(105/255)/Math.log(Math.max(8,median)/255)));
  if(gamma<.995){
    const gains=new Float32Array(256);for(let y=1;y<256;y++)gains[y]=Math.min(2.5,255*Math.pow(y/255,gamma)/y);
    for(let p=0;p<rgba.length;p+=4){const y=Math.round(.2126*rgba[p]+.7152*rgba[p+1]+.0722*rgba[p+2]);const gain=gains[y]||1;rgba[p]=Math.min(255,rgba[p]*gain);rgba[p+1]=Math.min(255,rgba[p+1]*gain);rgba[p+2]=Math.min(255,rgba[p+2]*gain);}
  }
  return {mean:Math.round(mean),median,gamma,unusable:mean<5};
}
