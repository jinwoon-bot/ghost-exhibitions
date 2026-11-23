import {cameraHelp} from './environment.js';
export class CameraInput {
  constructor(video,onStatus){
    this.video=video;this.onStatus=onStatus;this.stream=null;this.net=null;this.generation=0;this.modelGeneration=0;
    this.worker=null;this.pending=new Map();this.serial=0;this.loading=null;this.backend='none';this.backendRequest='auto';this.info={};this.frameAt=0;this.frames=0;this.callback=null;this.selectedId='';this.lastError=null;
    this.frameWindow=[];this.cancelAcquire=null;this.cancelFrameWait=null;
  }
  rpc(type,data={},transfer=[],timeout=120000){
    if(!this.worker)return Promise.reject(Object.assign(Error('분석 작업이 취소됐습니다.'),{code:'cancelled'}));
    const id=++this.serial;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);const e=Error(type==='init'?'모델 준비 시간이 초과됐습니다. 저사양/CPU 설정과 모델 파일을 확인하고 다시 연결하세요.':'인물 분리 응답이 지연됩니다. 저사양 프리셋으로 재연결하세요.');e.code='ai-timeout';reject(e);},timeout);
      this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({id,type,...data},transfer);}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
    });
  }
  stopWorker(cancelLoad=true){
    if(cancelLoad)this.loading=null;
    this.modelGeneration++;this.worker?.terminate();this.worker=null;this.net=null;this.backend='none';this.info={};
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error('이전 분석 작업 취소'),{code:'cancelled'}));}this.pending.clear();
  }
  async load(options={}){
    const requested=options.backend||'auto',model=requested==='cpu'?'mobile':(options.model||'resnet');
    if(this.net&&this.backendRequest===requested&&this.modelRequest===model)return this.net;
    if(this.loading&&this.backendRequest===requested&&this.modelRequest===model)return this.loading;
    this.backendRequest=requested;this.modelRequest=model;this.fallbackReason=null;
    const operation=(async()=>{
      for(const choice of options.plainCPU?['cpu-plain']:requested==='cpu'?['cpu','cpu-plain']:[requested,'cpu','cpu-plain']){
        const backend=choice==='cpu-plain'?'cpu':choice;
        this.stopWorker(false);this.worker=new Worker(new URL('./vision-worker.js',import.meta.url),{name:'창귀 인물 분리'});
        const generation=this.modelGeneration;
        this.worker.onmessage=({data:m})=>{
          if(m.type==='progress'){this.onStatus(m.detail);return;}
          const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);
          if(m.type==='error'){const e=Object.assign(Error(m.message),{code:'ai-error',canFallback:m.canFallback,suggestPlainCPU:m.backend==='wasm'});p.reject(e);}else p.resolve(m);
        };
        this.worker.onerror=e=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(Error('인물 분리 작업자를 시작하지 못했습니다. js/vision-worker.js와 vendor 경로를 확인하세요. '+e.message),{code:'worker-error'}));}this.pending.clear();};
        try{const info=await this.rpc('init',{options:{...options,backend,plainCPU:choice==='cpu-plain'||options.plainCPU,warmAspect:this.video.videoWidth&&this.video.videoHeight?this.video.videoWidth/this.video.videoHeight:16/9}});if(generation!==this.modelGeneration)throw Object.assign(Error('이전 모델 준비 취소'),{code:'cancelled'});this.info={...info,fallbackReason:this.fallbackReason};this.backend=info.backend;if(info.backend!=='webgl'){this.backendRequest='cpu';this.modelRequest='mobile';}this.net=true;return true;}
        catch(e){if(generation!==this.modelGeneration)throw Object.assign(Error('이전 모델 준비 취소'),{code:'cancelled'});this.fallbackReason=e.message;this.stopWorker(false);if(choice!=='cpu-plain'&&e.canFallback){this.onStatus('GPU 처리 지연/호환성 · 로컬 CPU 대체 경로를 준비합니다.');continue;}throw e;}
      }
    })();
    this.loading=operation;
    try{return await operation;}finally{if(this.loading===operation)this.loading=null;}
  }
  stopStream(){
    this.cancelAcquire?.();this.cancelFrameWait?.();
    if(this.callback!==null&&this.video.cancelVideoFrameCallback)this.video.cancelVideoFrameCallback(this.callback);this.callback=null;
    this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;this.video.pause();this.video.srcObject=null;this.frameAt=0;
    this.frames=0;this.frameWindow.length=0;this.lastVideoTime=-1;
  }
  stop(){this.generation++;this.stopStream();}
  heartbeat(token){
    if(token!==this.generation||!this.stream)return;this.frameAt=performance.now();this.frames++;
    this.frameWindow.push(this.frameAt);while(this.frameWindow.length>120||this.frameWindow[0]<this.frameAt-2000)this.frameWindow.shift();
    if(this.video.requestVideoFrameCallback)this.callback=this.video.requestVideoFrameCallback(()=>this.heartbeat(token));
  }
  async start(device='',options={}){
    const token=++this.generation;this.stopStream();this.lastError=null;
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Object.assign(Error('카메라는 HTTPS 또는 localhost에서 실행하세요. index.html을 직접 열면 사용할 수 없습니다.'),{name:'SecurityError'});
    const sizes={auto:[1280,720],vga:[640,480],hd:[1280,720],fullhd:[1920,1080]},[w,h]=sizes[options.cameraResolution]||sizes.auto;
    const constraints=(id,relaxed=false)=>({audio:false,video:relaxed?(id?{deviceId:{exact:id}}:true):{width:{ideal:w},height:{ideal:h},frameRate:{ideal:30},...(id?{deviceId:{exact:id}}:{facingMode:{ideal:'user'}})}});
    const acquire=async(id,relaxed=false)=>{
      let expired=false,timer,cancel;const task=navigator.mediaDevices.getUserMedia(constraints(id,relaxed));
      task.then(s=>{if(expired||token!==this.generation)s.getTracks().forEach(t=>t.stop());},()=>{});
      const cancelled=new Promise((_,reject)=>{cancel=()=>{expired=true;reject(Object.assign(Error('카메라 연결 취소'),{code:'cancelled'}));};this.cancelAcquire=cancel;});
      try{return await Promise.race([task,cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Object.assign(Error('카메라 권한 응답이 없습니다. Chrome 사이트 설정을 확인하고 다시 연결하세요.'),{code:'permission-pending'}));},45000);})]);}finally{clearTimeout(timer);if(this.cancelAcquire===cancel)this.cancelAcquire=null;}
    };
    this.onStatus('카메라 권한과 실제 프레임 확인 중…');
    let stream;
    try{stream=await acquire(device);}catch(e){
      if(e.name==='OverconstrainedError'){this.onStatus('이 카메라가 지원하는 기본 해상도로 다시 연결합니다.');try{stream=await acquire(device,true);}catch(retry){if(device&&['NotFoundError','OverconstrainedError'].includes(retry.name))stream=await acquire('',true);else{this.lastError=cameraHelp(retry);throw retry;}}}
      else if(device&&e.name==='NotFoundError'){this.onStatus('저장한 카메라가 없어 현재 PC의 기본 카메라를 사용합니다.');stream=await acquire('',true);}
      else{this.lastError=cameraHelp(e);throw e;}
    }
    if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return false;}
    this.stream=stream;this.video.srcObject=stream;await this.video.play();
    if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return false;}
    await new Promise((resolve,reject)=>{
      let done=false,callback=null;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);this.video.removeEventListener('loadeddata',ready);if(callback!==null)this.video.cancelVideoFrameCallback?.(callback);if(this.cancelFrameWait===cancel)this.cancelFrameWait=null;error?reject(error):resolve();};
      const ready=()=>{if(token!==this.generation)return finish(Object.assign(Error('이전 카메라 프레임 취소'),{code:'cancelled'}));if(this.video.readyState>=2&&this.video.videoWidth)finish();};
      const cancel=()=>finish(Object.assign(Error('카메라 입력 대기 취소'),{code:'cancelled'}));this.cancelFrameWait=cancel;
      const timer=setTimeout(()=>finish(Object.assign(Error('실제 카메라 프레임이 오지 않습니다. 다른 카메라/개인정보 보호 설정을 확인하세요.'),{code:'camera-frame-timeout'})),8000);
      if(this.video.requestVideoFrameCallback)callback=this.video.requestVideoFrameCallback(ready);else if(this.video.readyState>=2&&this.video.videoWidth)ready();else this.video.addEventListener('loadeddata',ready,{once:true});
    });
    if(token!==this.generation)return false;
    this.selectedId=stream.getVideoTracks()[0].getSettings().deviceId||'';this.heartbeat(token);
    this.onFramesReady?.();
    stream.getVideoTracks()[0].onended=()=>this.onStatus('카메라 연결이 끊겼습니다. 장치 확인 후 자동 재연결을 시도합니다.');
    try{await this.load(options);}catch(e){e.aiFailure=true;throw e;}return token===this.generation;
  }
  healthy(now=performance.now()){
    if(!this.stream)return false;
    if(!this.video.requestVideoFrameCallback&&this.video.currentTime!==this.lastVideoTime){this.lastVideoTime=this.video.currentTime;this.frameAt=now;this.frames++;}
    return !!this.stream?.getVideoTracks().some(t=>t.readyState==='live')&&this.video.readyState>=2&&now-this.frameAt<4000;
  }
  inputInfo(){const track=this.stream?.getVideoTracks()[0],s=track?.getSettings()||{},times=this.frameWindow;return {width:s.width||0,height:s.height||0,reportedFPS:s.frameRate??null,observedFPS:times.length>1&&times.at(-1)>times[0]?(times.length-1)*1000/(times.at(-1)-times[0]):null,frames:this.frames,trackLive:track?.readyState==='live',muted:track?.muted===true};}
  async segment(canvas,settings,quality){
    if(!this.net)throw Error('인물 분리 모델 준비가 필요합니다.');
    let result;
    if(this.info.offscreen){const generation=this.modelGeneration,bitmap=await createImageBitmap(canvas);if(generation!==this.modelGeneration||!this.net){bitmap.close();throw Object.assign(Error('이전 입력 취소'),{code:'cancelled'});}result=await this.rpc('segment',{bitmap,settings:{sensitivity:settings.sensitivity,people:settings.people},quality},[bitmap],60000);}
    else{const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);result=await this.rpc('segment',{pixels:image.data.buffer,width:canvas.width,height:canvas.height,settings:{sensitivity:settings.sensitivity,people:settings.people},quality},[image.data.buffer],60000);}
    this.info={...this.info,memory:result.memory,inferMs:result.inferMs,light:result.light};return result.masks;
  }
  dispose(){this.stop();this.stopWorker();}
}
