/* No uploads. Frames, landmarks and masks live only in this worker/main memory. */
let pose,face,ready=false,frameIndex=0,lastStamp=-1,analysisCanvas,analysisCtx;
const local=path=>new URL(/^(models|vendor)\//.test(path)?'../../shared/mediapipe/'+path:path,self.location.href).href;
self.onmessage=async ({data:m})=>{
  if(m.type==='init'){
    try{
      importScripts(local('vendor/vision_bundle.js'));
      const lib=self.Vision||self.vision;
      if(!lib?.FilesetResolver)throw Error('vendor/vision_bundle.js: MediaPipe 번들 없음');
      const files=await lib.FilesetResolver.forVisionTasks(local('vendor/wasm'));
      const confidence=.55-(m.sensitivity??.55)*.25;
      let delegate=m.delegate==='GPU'?'GPU':'CPU',fallback='';
      const createPose=d=>lib.PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:local('models/pose_landmarker_lite.task'),delegate:d},runningMode:'VIDEO',numPoses:3,minPoseDetectionConfidence:confidence,minPosePresenceConfidence:confidence,minTrackingConfidence:.4,outputSegmentationMasks:true});
      try{pose=await createPose(delegate);}catch(e){if(delegate!=='GPU')throw e;fallback=String(e.message);delegate='CPU';pose=await createPose(delegate);}
      face=await lib.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:local('models/face_landmarker.task'),delegate:'CPU'},runningMode:'VIDEO',numFaces:3,minFaceDetectionConfidence:.35,minFacePresenceConfidence:.35,minTrackingConfidence:.4,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:true});
      analysisCanvas=new OffscreenCanvas(32,24);analysisCtx=analysisCanvas.getContext('2d',{willReadFrequently:true});
      ready=true;postMessage({type:'ready',delegate,fallback,version:'1.2.3'});
    }catch(e){postMessage({type:'error',message:'로컬 AI 모델/라이브러리 로딩 실패: '+String(e.message||e)});}
    return;
  }
  if(m.type!=='frame')return;
  const bitmap=m.bitmap;let p,f;
  try{
    if(!ready||m.sourceMs<=lastStamp){postMessage({type:'skip',seq:m.seq});return;}
    lastStamp=m.sourceMs;const start=performance.now();
    analysisCtx.drawImage(bitmap,0,0,32,24);
    const px=analysisCtx.getImageData(0,0,32,24).data;let sum=0;
    for(let i=0;i<px.length;i+=4)sum+=px[i]*.2126+px[i+1]*.7152+px[i+2]*.0722;
    const brightness=sum/(32*24);
    // Only inference sees a gently lifted low-light image. The displayed camera stays natural.
    let input=bitmap;
    if(brightness<70){
      if(!self.liftCanvas||self.liftCanvas.width!==bitmap.width||self.liftCanvas.height!==bitmap.height){self.liftCanvas=new OffscreenCanvas(bitmap.width,bitmap.height);self.liftCtx=self.liftCanvas.getContext('2d');}
      self.liftCtx.filter='brightness(1.35) contrast(1.06)';self.liftCtx.drawImage(bitmap,0,0);input=self.liftCanvas;
    }
    p=pose.detectForVideo(input,m.sourceMs);
    const facesUpdated=frameIndex++%2===0;
    if(facesUpdated)f=face.detectForVideo(input,m.sourceMs);
    const faces=(f?.faceLandmarks||[]).map((landmarks,i)=>{
      const matrix=f.facialTransformationMatrixes?.[i]?.data;
      const a=landmarks[33],b=landmarks[263],n=landmarks[1];
      const approximate=Math.atan2((n.x-(a.x+b.x)/2)*2,Math.max(.015,Math.abs(b.x-a.x)))*180/Math.PI;
      const yaw=matrix?Math.atan2(matrix[8],matrix[10])*180/Math.PI:approximate;
      return {nose:{x:n.x,y:n.y},yaw};
    });
    let mask=null,mw=0,mh=0;
    for(const item of p.segmentationMasks||[]){
      if(!mask){mw=item.width;mh=item.height;mask=new Uint8Array(mw*mh);}
      if(item.width!==mw||item.height!==mh)continue;
      const values=item.getAsFloat32Array();
      for(let i=0;i<mask.length;i++){const v=Math.round(values[i]*255);if(v>mask[i])mask[i]=v;}
    }
    const result={type:'result',seq:m.seq,sourceMs:m.sourceMs,poses:p.landmarks||[],world:p.worldLandmarks||[],facesUpdated,faces,brightness,mask,maskWidth:mw,maskHeight:mh,inferenceMs:performance.now()-start};
    postMessage(result,mask?[mask.buffer]:[]);
  }catch(e){postMessage({type:'frame-error',seq:m.seq,message:String(e.message||e)});}
  finally{p?.close?.();f?.close?.();bitmap?.close();}
};
