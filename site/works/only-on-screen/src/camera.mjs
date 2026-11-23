const messages={NotAllowedError:'카메라 권한이 거부됐습니다. Chrome 주소창의 사이트 설정에서 카메라를 허용하고 다시 연결하세요.',NotFoundError:'연결된 카메라가 없습니다. USB 케이블과 Windows 카메라 앱을 확인하세요.',NotReadableError:'다른 앱이 카메라를 사용 중이거나 장치를 읽을 수 없습니다. Teams·Zoom·카메라 앱을 닫으세요.',OverconstrainedError:'이 카메라가 선택한 설정을 지원하지 않습니다. 자동 장치·낮은 해상도로 다시 연결하세요.',SecurityError:'HTTPS 또는 localhost에서 실행하세요.'};
export class Camera {
  constructor(video,onState){this.video=video;this.onState=onState;this.generation=0;this.stream=null;this.lastFrame=0;this.frames=0;this.state='off';this.frameRequest=null;}
  notify(state,extra={}){this.state=state;this.onState({state,...extra});}
  async devices(){return (await navigator.mediaDevices?.enumerateDevices()||[]).filter(d=>d.kind==='videoinput');}
  stop(){this.generation++;if(this.frameRequest!==null)this.video.cancelVideoFrameCallback?.(this.frameRequest);this.frameRequest=null;for(const t of this.stream?.getTracks()||[])t.stop();this.stream=null;this.video.srcObject=null;this.frames=0;this.lastFrame=0;this.notify('off');}
  async start(config){
    this.stop();this.video.removeAttribute('src');this.video.load();const gen=this.generation;
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS 또는 localhost에서 Chrome으로 실행하세요. file:// 직접 실행은 지원하지 않습니다.');
    this.notify('requesting');
    const constraints={width:{ideal:config.cameraWidth},resizeMode:{ideal:'none'},frameRate:{ideal:30,max:60}};
    if(config.cameraId)constraints.deviceId={exact:config.cameraId};
    try{
      let stream;
      try{stream=await navigator.mediaDevices.getUserMedia({video:constraints,audio:false});}
      catch(e){if(e.name!=='OverconstrainedError')throw e;stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},frameRate:{ideal:30}},audio:false});}
      if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();if(gen!==this.generation)return;
      const track=stream.getVideoTracks()[0];track.addEventListener('ended',()=>{if(gen===this.generation)this.notify('disconnected',{message:'카메라 연결이 끊겼습니다. USB 연결을 확인하고 다시 연결하세요.'});});
      this.notify('connected',{settings:track.getSettings(),label:track.label});
      const frame=(now)=>{if(gen!==this.generation)return;this.frames++;this.lastFrame=now;if(this.state!=='live')this.notify('live',{settings:track.getSettings(),label:track.label});this.frameRequest=this.video.requestVideoFrameCallback(frame);};
      if(this.video.requestVideoFrameCallback)this.frameRequest=this.video.requestVideoFrameCallback(frame);
    }catch(e){this.notify('error',{message:messages[e.name]||e.message});throw e;}
  }
  healthy(now){
    if(!this.video.requestVideoFrameCallback&&this.stream&&this.video.readyState>=2&&!this.video.paused){if(this.lastTime!==this.video.currentTime){this.lastTime=this.video.currentTime;this.lastFrame=now;this.frames++;this.state='live';}}
    if(this.stream&&this.lastFrame&&now-this.lastFrame>2000&&this.state==='live')this.notify('stalled',{message:'카메라 영상이 멈췄습니다. 판정·귀신 합성을 중지했습니다. 다시 연결하세요.'});
    return this.state==='live'&&now-this.lastFrame<2000;
  }
}
