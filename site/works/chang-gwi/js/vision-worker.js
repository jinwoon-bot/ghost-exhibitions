/* TensorFlow/BodyPix 전용 작업자. 영상과 마스크는 업로드/녹화하지 않는다. */
let net=null,backend='none',processing=false,canvas=null,ctx=null;
let wasmReason='',enhanceLowLight;

const root=new URL('../',self.location.href);
const report=(phase,detail)=>postMessage({type:'progress',phase,detail});
const originalFetch=self.fetch.bind(self);
self.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,root);
  if(url.origin!==root.origin||!url.href.startsWith(root.href))throw Error('외부/상위 경로 리소스 차단: '+url.pathname);
  const response=await originalFetch(input,init);
  if(!response.ok)throw Error('HTTP '+response.status+' · '+url.pathname+' · 배포 파일 누락/경로/OneDrive 다운로드 상태를 확인하세요.');
  return response;
};
async function preflight(cpu){
  report('assets','로컬 모델 파일 확인 중');
  const url=new URL(cpu?'models/cpu/model.json':'models/model.json',root);
  const r=await fetch(url,{cache:'no-cache'});let model;
  try{model=await r.json();}catch{throw Error(url.pathname+'이 올바른 JSON이 아닙니다. 오류 페이지가 저장됐는지 확인하세요.');}
  const paths=model.weightsManifest?.flatMap(x=>x.paths)||[];
  if(paths.length!==(cpu?1:12))throw Error('모델 가중치 목록이 선택한 모델의 예상 파일 수와 다릅니다. 모델과 가중치를 함께 복사하세요.');
  for(const path of paths)if(!/^group1-shard\d+of(?:12|1)\.bin$/.test(path))throw Error('모델의 외부/잘못된 가중치 경로: '+path);
  // 실제 추론을 시작하기 전에 누락된 파일 이름을 정확히 알린다.
  for(let i=0;i<paths.length;i+=4)await Promise.all(paths.slice(i,i+4).map(path=>fetch(new URL(path,url),{method:'HEAD',signal:AbortSignal.timeout(20000)})));
  return url.href;
}
async function initialize(options){
  ({enhanceLowLight}=await import('./camera-enhancement.js'));
  report('libraries','고정 버전 TensorFlow.js/BodyPix 읽는 중');
  importScripts(new URL('vendor/tf.min.js',root).href,new URL('vendor/body-pix.min.js',root).href);
  if(!self.tf||!self.bodyPix)throw Error('vendor의 TensorFlow.js/BodyPix를 읽지 못했습니다. 전체 폴더를 복사하세요.');
  if(tf.version.tfjs!=='4.22.0')throw Error('TensorFlow.js 버전이 4.22.0과 다릅니다.');
  report('backend','GPU 지원 확인 중');
  if(options.backend!=='cpu'&&typeof OffscreenCanvas!=='undefined'){
    try{if(!await tf.setBackend('webgl'))throw Error('WebGL 초기화 실패');await tf.ready();backend=tf.getBackend();}catch{backend='cpu';}
  }else backend='cpu';
  if(backend==='cpu'){
    if(!options.plainCPU){try{importScripts(new URL('vendor/wasm/tf-backend-wasm.min.js',root).href);tf.wasm.setWasmPaths(new URL('vendor/wasm/',root).href);tf.wasm.setThreadsCount(1);tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT',false);if(!await tf.setBackend('wasm'))throw Error('WASM 초기화 실패');await tf.ready();backend='wasm';}catch(e){wasmReason=e.message;backend='cpu';}}
    if(backend==='cpu'){await tf.setBackend('cpu');await tf.ready();}
  }
  const mobile=backend!=='webgl'||options.model==='mobile',modelUrl=await preflight(mobile);
  report('model','로컬 '+(mobile?'MobileNet 0.50':'ResNet50')+' 모델 준비 중 · '+backend.toUpperCase());
  net=await bodyPix.load({architecture:mobile?'MobileNetV1':'ResNet50',multiplier:mobile?.5:1,outputStride:16,quantBytes:2,modelUrl});
  report('warmup','첫 추론 준비 중 · 화면 렌더링은 별도 실행');
  const long=Math.min(640,options.inputSize||480),aspect=options.warmAspect||16/9;
  const width=Math.max(64,Math.round(aspect>=1?long:long*aspect)),height=Math.max(64,Math.round(aspect>=1?long/aspect:long));
  const warm=tf.zeros([height,width,3],'int32');
  let warmMs=0;
  try{const args={internalResolution:options.quality||(backend!=='webgl'?'medium':'high'),maxDetections:3};await net.segmentMultiPerson(warm,args);const t=performance.now();await net.segmentMultiPerson(warm,args);warmMs=performance.now()-t;}finally{warm.dispose();}
  if(options.backend==='auto'&&backend==='webgl'&&warmMs>250)throw Error('GPU 반복 예열 '+Math.round(warmMs)+'ms · 화면 출력과 분리하기 위해 CPU 가속 경로를 선택합니다.');
  return {backend,warmMs,wasmReason,modelType:mobile?'mobile':'resnet',model:mobile?'BodyPix MobileNetV1 0.50 stride16 quant2':'BodyPix ResNet50 stride16 quant2',tfVersion:tf.version.tfjs,bodyPixVersion:bodyPix.version||'2.2.0 (고정 파일)',offscreen:typeof OffscreenCanvas!=='undefined',memory:memory()};
}
function memory(){const m=tf.memory();return {numTensors:m.numTensors,numBytes:m.numBytes,unreliable:m.unreliable};}
self.onmessage=async({data:m})=>{
  if(m.type==='init'){
    try{const info=await initialize(m.options||{});postMessage({id:m.id,type:'ready',...info});}
    catch(e){postMessage({id:m.id,type:'error',message:e.message,backend,canFallback:backend==='webgl'||backend==='wasm'});}
    return;
  }
  if(m.type!=='segment')return;
  const bitmap=m.bitmap;let tensor;
  try{
    if(processing||!net)throw Error('인물 분리 모델이 아직 준비되지 않았습니다.');processing=true;
    const start=performance.now();let pixels,width,height;
    if(bitmap){
      width=bitmap.width;height=bitmap.height;
      if(!canvas){canvas=new OffscreenCanvas(width,height);ctx=canvas.getContext('2d',{willReadFrequently:true});}
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      ctx.drawImage(bitmap,0,0);pixels=ctx.getImageData(0,0,width,height).data;
    }else{width=m.width;height=m.height;pixels=new Uint8ClampedArray(m.pixels);}
    const light=enhanceLowLight(pixels);
    const rgb=new Uint8Array(width*height*3);
    for(let p=0,j=0;p<pixels.length;p+=4){rgb[j++]=pixels[p];rgb[j++]=pixels[p+1];rgb[j++]=pixels[p+2];}
    tensor=tf.tensor3d(rgb,[height,width,3],'int32');
    const masks=await net.segmentMultiPerson(tensor,{flipHorizontal:false,internalResolution:m.quality||'medium',segmentationThreshold:m.settings.sensitivity,maxDetections:Math.min(3,m.settings.people),scoreThreshold:.25,nmsRadius:20,minKeypointScore:.2,refineSteps:10});
    tensor.dispose();tensor=null;
    const output=masks.map(x=>({width:x.width,height:x.height,data:x.data instanceof Uint8Array?x.data:new Uint8Array(x.data),pose:x.pose}));
    postMessage({id:m.id,type:'result',masks:output,inferMs:performance.now()-start,light,backend,memory:memory()},output.map(x=>x.data.buffer));
  }catch(e){postMessage({id:m.id,type:'error',message:e.message,backend,canFallback:backend==='webgl'||backend==='wasm'});}
  finally{tensor?.dispose();bitmap?.close();processing=false;}
};
