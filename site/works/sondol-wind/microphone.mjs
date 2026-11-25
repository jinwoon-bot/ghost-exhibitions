const zero = {value:0,level:0,floor:0,calibrating:false};

const errors = {
  NotAllowedError:'마이크 권한이 거부됐습니다.',
  SecurityError:'이 환경에서는 마이크 권한을 사용할 수 없습니다.',
  NotFoundError:'사용 가능한 마이크를 찾지 못했습니다.',
  NotReadableError:'마이크를 읽을 수 없습니다. 장치의 연결 상태를 확인하세요.',
};

export class WindInput {
  constructor() {
    this.generation = 0;
    this.data = {...zero};
    this.label = '연결 대기';
  }

  async devices() {
    try {
      return (await navigator.mediaDevices?.enumerateDevices() ?? []).filter(d=>d.kind==='audioinput' &&
        !['default','communications'].includes(d.deviceId));
    } catch { return []; }
  }

  configure(settings) {
    this.settings = settings;
    this.node?.port.postMessage({sensitivity:settings.sensitivity,minimum:settings.minimum});
  }

  async connect(context) {
    this.stop('마이크 권한 대기');
    const serial = this.generation;
    if (!context?.audioWorklet || !navigator.mediaDevices?.getUserMedia) {
      this.label = '마이크를 사용할 수 없습니다. Space로 시연하세요.';
      return false;
    }
    const id = this.settings.device;
    const audio = {channelCount:{ideal:1},echoCancellation:true,noiseSuppression:false,autoGainControl:false};
    const open = () => navigator.mediaDevices.getUserMedia({audio,video:false});
    let timer, expired = false;
    const request = id ? navigator.mediaDevices.getUserMedia({audio:{...audio,deviceId:{exact:id}},video:false})
      .catch(error=>['NotFoundError','OverconstrainedError'].includes(error.name) ? open() : Promise.reject(error)) : open();
    request.then(stream=>{
      if (expired || serial!==this.generation) stream.getTracks().forEach(track=>track.stop());
    },()=>{});
    try {
      const stream = await Promise.race([request,new Promise((_,reject)=>{
        timer=setTimeout(()=>{expired=true; reject(Error('마이크 권한 응답 시간이 지났습니다.'));},16000);
      })]);
      if (serial!==this.generation) return false;
      this.stream = stream;
      if (this.workletContext!==context) {
        this.workletContext = context;
        this.loading = context.audioWorklet.addModule(new URL('./wind-worklet.mjs',import.meta.url)).catch(error=>{
          this.workletContext=null;
          throw error;
        });
      }
      await this.loading;
      if (serial!==this.generation) return false;
      this.source = context.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(context,'sondol-wind');
      this.output = context.createGain();
      this.output.gain.value=0;
      this.source.connect(this.node).connect(this.output).connect(context.destination);
      this.node.port.onmessage = ({data})=>{
        if (serial!==this.generation) return;
        this.data=data;
        this.label=data.calibrating ? '주변 소음 측정 중' : '바람 감지 중';
      };
      this.node.onprocessorerror = ()=>this.stop('바람 분석을 다시 연결하세요. Space로 시연할 수 있습니다.');
      this.stream.getAudioTracks().forEach(track=>{
        track.onended=()=>this.stop('마이크 연결이 끊겼습니다. 장치를 다시 선택하세요.');
      });
      this.configure(this.settings);
      this.calibrate();
      return true;
    } catch (error) {
      if (serial===this.generation) this.stop((errors[error.name] || error.message)+' Space로 시연할 수 있습니다.');
      return false;
    } finally { clearTimeout(timer); }
  }

  calibrate() {
    if (!this.node) return false;
    this.data = {...zero,calibrating:true};
    this.label = '주변 소음 측정 중';
    this.node.port.postMessage({calibrate:true});
    return true;
  }

  stop(label='키보드 시연 · Space') {
    this.generation++;
    if (this.node) {
      this.node.port.onmessage=null;
      this.node.onprocessorerror=null;
      this.node.port.close();
    }
    this.source?.disconnect();
    this.node?.disconnect();
    this.output?.disconnect();
    this.stream?.getTracks().forEach(track=>{track.onended=null; track.stop();});
    this.source=this.node=this.output=this.stream=null;
    this.data={...zero};
    this.label=label;
  }
}
