import { DEFAULT_CLAP_INTERVAL } from './clap.mjs?v=double-clap';

const link = new URL('./clap-worklet.mjs?v=double-clap',import.meta.url);

function help(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '권한이 거부됐습니다. 브라우저 주소창의 마이크 설정을 확인하세요.';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return '마이크 장치를 찾을 수 없습니다.';
  if (error.name === 'NotReadableError') return '마이크를 읽지 못했습니다. 다른 앱에서 사용 중인지 확인하세요.';
  return error.message || '마이크를 연결하지 못했습니다.';
}

export class Microphone {
  constructor(onClap, onStatus) {
    this.onClap = onClap;
    this.onStatus = onStatus;
    this.generation = 0;
    this.status = '연결 대기';
    this.level = this.floor = 0;
    this.count = 0;
    this.sensitivity = .55;
    this.interval = DEFAULT_CLAP_INTERVAL;
  }

  configure(settings) {
    this.sensitivity = settings.sensitivity;
    this.interval = settings.interval;
    this.node?.port.postMessage({sensitivity:this.sensitivity, interval:this.interval});
  }

  statusIs(text) {
    if (text === this.status) return;
    this.status = text;
    this.onStatus();
  }

  async devices() {
    try {
      return ((await navigator.mediaDevices?.enumerateDevices()) || [])
        .filter(device => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== 'communications');
    } catch { return []; }
  }

  stop(status = '키보드 체험 · Space') {
    this.generation++;
    this.audio?.disconnect();
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.port.close();
      this.node.disconnect();
    }
    this.silence?.disconnect();
    for (const track of this.stream?.getTracks() || []) {
      track.onended = null;
      track.stop();
    }
    this.audio = this.node = this.silence = this.stream = null;
    this.level = this.floor = 0;
    this.statusIs(status);
  }

  async start(ctx, device) {
    this.stop('마이크 권한 대기');
    const attempt = this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !ctx?.audioWorklet) {
      this.statusIs('마이크를 시작할 수 없습니다. HTTPS 또는 localhost에서 열거나 Space를 사용하세요.');
      return false;
    }
    let timer, expired = false;
    const constraints = (choice) => ({
      audio: {noiseSuppression:false, autoGainControl:false, echoCancellation:true, channelCount:{ideal:1},
        ...(choice ? {deviceId:{exact:choice}} : {})},
      video:false,
    });
    const acquire = async () => {
      try { return await navigator.mediaDevices.getUserMedia(constraints(device)); }
      catch (error) {
        if (!device || !['OverconstrainedError','NotFoundError'].includes(error.name)) throw error;
        return navigator.mediaDevices.getUserMedia(constraints(''));
      }
    };
    const request = acquire();
    request.then(stream => {
      if (expired || attempt !== this.generation) stream.getTracks().forEach(track=>track.stop());
    },()=>{});
    try {
      const stream = await Promise.race([request, new Promise((_,reject) => {
        timer = setTimeout(() => { expired = true; reject(Error('마이크 권한 응답 시간 초과')); },16000);
      })]);
      if (attempt !== this.generation) return false;
      this.stream = stream;
      if (this.moduleContext !== ctx) {
        this.moduleContext = ctx;
        this.module = ctx.audioWorklet.addModule(link).catch(error => {
          this.moduleContext = null;
          throw error;
        });
      }
      await this.module;
      if (attempt !== this.generation) return false;
      this.node = new AudioWorkletNode(ctx,'yagwanggwi-claps');
      this.silence = ctx.createGain();
      this.silence.gain.value = 0;
      this.audio = ctx.createMediaStreamSource(stream);
      this.audio.connect(this.node).connect(this.silence).connect(ctx.destination);
      this.node.port.onmessage = ({data}) => {
        if (attempt !== this.generation) return;
        this.level = data.level;
        this.floor = data.floor;
        this.statusIs(data.calibrating ? '주변 소음 측정 중' : '마이크 감지 중');
        if (data.clap) { this.count++; this.onClap(); }
      };
      for (const track of stream.getAudioTracks()) track.onended = () =>
        this.stop('마이크 연결이 끊겼습니다. 장치를 다시 연결하거나 Space를 사용하세요.');
      this.configure(this);
      this.statusIs('주변 소음 측정 중');
      return true;
    } catch (error) {
      if (attempt === this.generation) this.stop(help(error) + ' Space로 체험할 수 있습니다.');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  calibrate() {
    if (!this.node) return false;
    this.node.port.postMessage({calibrate:true});
    this.statusIs('주변 소음 측정 중');
    return true;
  }
}
