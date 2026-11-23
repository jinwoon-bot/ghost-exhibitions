export class Vision {
  constructor(onResult,onState){this.onResult=onResult;this.onState=onState;this.worker=null;this.ready=false;this.busy=false;this.hz=12;this.width=480;this.generation=0;this.lastSent=0;this.lastVideoTime=-1;this.seq=0;this.errors=0;this.samples=[];}
  async start(config){
    this.stop();const gen=this.generation;
    this.worker=new Worker(new URL('../vision-worker.js',import.meta.url));
    this.onState({state:'loading'});
    return new Promise((resolve,reject)=>{
      let settled=false;
      const fail=message=>{if(gen!==this.generation)return;this.ready=false;this.busy=false;this.onState({state:'error',message});if(!settled){settled=true;clearTimeout(this.loadTimeout);reject(Error(message));}};
      this.loadTimeout=setTimeout(()=>{fail('AI 모델 로딩 45초 초과. 모델 경로/장치 메모리 확인 후 다시 연결하세요.');this.worker?.terminate();},45000);
      this.worker.onerror=e=>fail(e.message||'AI Worker 오류');
      this.worker.onmessage=({data:m})=>{
        if(gen!==this.generation)return;
        if(m.type==='ready'){clearTimeout(this.loadTimeout);this.ready=true;this.delegate=m.delegate;this.onState({state:'ready',...m});if(!settled){settled=true;resolve(m);}return;}
        if(m.type==='error'){fail(m.message);return;}
        if(['result','skip','frame-error'].includes(m.type))this.busy=false;
        if(m.type==='result'){this.errors=0;this.lastResult=performance.now();this.samples.push(m.inferenceMs);if(this.samples.length>120)this.samples.shift();this.onResult(m);}
        if(m.type==='frame-error'){this.errors++;this.onState({state:'warning',message:m.message});if(this.errors>=3)fail('AI 분석 반복 실패. CPU 모드 또는 낮은 품질로 다시 시작하세요. '+m.message);}
      };
      this.worker.postMessage({type:'init',sensitivity:config.sensitivity,delegate:config.delegate});
    });
  }
  async tick(video,now){
    if(!this.ready||this.busy||video.readyState<2||video.paused||now-this.lastSent<1000/this.hz||video.currentTime===this.lastVideoTime)return;
    const gen=this.generation;this.busy=true;this.lastSent=now;this.lastVideoTime=video.currentTime;
    try{
      const width=Math.min(this.width,video.videoWidth),height=Math.round(width*video.videoHeight/video.videoWidth);
      const bitmap=await createImageBitmap(video,{resizeWidth:width,resizeHeight:height,resizeQuality:'low'});
      if(gen!==this.generation||!this.worker){bitmap.close();return;}
      this.worker.postMessage({type:'frame',bitmap,sourceMs:now,seq:++this.seq},[bitmap]);
    }catch(e){this.busy=false;this.onState({state:'warning',message:'분석 프레임 수신 실패: '+e.message});}
  }
  watchdog(now){return this.busy&&now-this.lastSent>7000;}
  stop(){this.generation++;clearTimeout(this.loadTimeout);this.worker?.terminate();this.worker=null;this.ready=false;this.busy=false;this.lastSent=0;this.lastVideoTime=-1;this.samples=[];}
}
