export class FaceInput {
  constructor(onSample, onStatus) {
    this.onSample = onSample;
    this.onStatus = onStatus;
    this.clock = 0;
  }

  start(backup) {
    this.stop();
    const worker = new Worker(new URL('./face-worker.js', import.meta.url));
    this.worker = worker;
    this.onStatus('얼굴 모델 준비 중');
    return new Promise((resolve, reject) => {
      const finish = (error = null) => {
        clearTimeout(this.timer);
        this.pending = null;
        if (error) { this.onStatus(error.message); reject(error); }
        else resolve();
      };
      const fail = error => {
        if (worker !== this.worker) return;
        this.ready = false;
        this.onStatus(error.message);
        if (this.pending) finish(error);
      };
      this.pending = finish;
      this.timer = setTimeout(() => fail(Error('얼굴 모델 응답 시간이 초과됐습니다.')), 30000);
      worker.onerror = e => fail(Error(e.message || '카메라 분석 Worker 오류'));
      worker.onmessage = ({ data }) => {
        if (worker !== this.worker) return;
        switch (data.type) {
          case 'ready':
            this.ready = true;
            this.onStatus('얼굴 감지 준비');
            if (backup) this.enableBackup();
            if (this.pending) finish();
            break;
          case 'backup-ready':
            this.onStatus('얼굴 및 사람 영역 감지 준비');
            break;
          case 'backup-warning':
            this.onStatus('사람 영역 모델 준비 실패. 얼굴 감지와 수동 송출을 사용할 수 있습니다.');
            break;
          case 'sample':
            this.busy = false;
            this.errors = 0;
            this.onSample(data);
            break;
          case 'skip':
            this.busy = false;
            break;
          case 'frame-error':
            this.busy = false;
            this.errors++;
            if (this.errors >= 3) fail(Error('카메라 분석이 반복 실패했습니다. 다시 연결하거나 수동 송출을 사용하세요.'));
            break;
          case 'fatal':
            fail(Error('얼굴 모델을 준비하지 못했습니다. ' + data.message));
            break;
        }
      };
      worker.postMessage({ type: 'init' });
    });
  }

  enableBackup() {
    if (this.ready && !this.backup) {
      this.backup = true;
      this.worker.postMessage({ type: 'backup' });
    }
  }

  async tick(video, now, lowLight) {
    if (!this.ready || this.busy || now - this.clock < 83 || video.readyState < 2 || this.videoTime === video.currentTime) return;
    const worker = this.worker;
    const width = Math.min(544, video.videoWidth);
    const height = Math.round(video.videoHeight * width / video.videoWidth);
    if (!width || !height) return;
    this.clock = now;
    this.videoTime = video.currentTime;
    this.busy = true;
    try {
      const bitmap = await createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' });
      if (worker === this.worker && this.ready) worker.postMessage({ type: 'frame', now, bitmap, lowLight }, [bitmap]);
      else bitmap.close();
    } catch {
      if (worker === this.worker) this.busy = false;
    }
  }

  stalled(now) { return this.ready && this.busy && now - this.clock > 4200; }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.busy = false;
    this.backup = false;
    this.errors = 0;
    this.clock = 0;
    this.videoTime = -1;
    clearTimeout(this.timer);
    if (this.pending) this.pending(Error('카메라 분석이 종료됐습니다.'));
  }
}
