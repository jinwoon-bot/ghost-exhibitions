/* 얼굴/전신 추론 전용. 카메라 영상 저장/전송 없음. */
let detector,pose,lastTime=-1,enhance,bodyCandidates,combineCandidates,canvas,ctx;
self.onmessage=async({data:m})=>{
 if(m.type==='init')try{
  ({enhanceLowLight:enhance}=await import('./lib/camera-input.js'));
  ({bodyCandidates,combineCandidates}=await import('./lib/body-candidates.js'));
  importScripts(new URL('../../shared/mediapipe/vendor/vision_bundle.js',self.location.href).href);
  const lib=self.Vision||self.vision;
  const files=await lib.FilesetResolver.forVisionTasks(new URL('../../shared/mediapipe/vendor/wasm',self.location.href).href);
  detector=await lib.FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/face_detector.tflite',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.4,minSuppressionThreshold:.3});
  pose=await lib.PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../../shared/mediapipe/models/pose_landmarker_lite.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numPoses:3,minPoseDetectionConfidence:.4,minPosePresenceConfidence:.4,minTrackingConfidence:.4,outputSegmentationMasks:false});
  postMessage({type:'ready'});
 }catch(e){postMessage({type:'error',message:String(e.message||e)});}
 if(m.type==='frame'){
  const b=m.bitmap;
  try{
   if(!detector||!pose||m.sourceMs<=lastTime){postMessage({type:'skip'});return;}
   lastTime=m.sourceMs;const start=performance.now();
   if(!canvas){canvas=new OffscreenCanvas(b.width,b.height);ctx=canvas.getContext('2d',{willReadFrequently:true});}
   if(canvas.width!==b.width||canvas.height!==b.height){canvas.width=b.width;canvas.height=b.height;}
   ctx.drawImage(b,0,0);const pixels=ctx.getImageData(0,0,b.width,b.height),light=enhance(pixels.data);ctx.putImageData(pixels,0,0);
   const raw=detector.detectForVideo(canvas,m.sourceMs);
   const faces=(raw.detections||[]).map(d=>({x:(d.boundingBox.originX+d.boundingBox.width/2)/b.width,y:(d.boundingBox.originY+d.boundingBox.height/2)/b.height,w:d.boundingBox.width/b.width,h:d.boundingBox.height/b.height,score:d.categories?.[0]?.score||0,kind:'face'}));
   const bodies=bodyCandidates(pose.detectForVideo(canvas,m.sourceMs));
   postMessage({type:'result',sourceMs:m.sourceMs,inferenceMs:performance.now()-start,faces:combineCandidates(faces,bodies),light,bodyCount:bodies.length,faceCount:faces.length});
  }catch(e){postMessage({type:'frame-error',message:String(e.message||e)});}
  finally{b?.close();}
 }
};
