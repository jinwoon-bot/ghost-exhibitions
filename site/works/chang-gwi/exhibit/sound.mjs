export class ExhibitionSound {
  constructor() {
    this.buffers = Promise.all(['ambient.wav', 'hanji-tear.wav'].map(async name => {
      const response = await fetch('assets/' + name);
      if (!response.ok) throw Error('음향 파일을 열 수 없습니다.');
      return response.arrayBuffer();
    }));
    this.buffers.catch(() => {});
    this.last = -Infinity;
    this.enabled = false;
  }

  async enable(value) {
    this.enabled = value;
    if (!value) {
      this.master?.gain.setTargetAtTime(0, this.ctx.currentTime, .13);
      return;
    }
    this.ctx ||= new AudioContext();
    await this.ctx.resume();
    if (this.roomGain) return;
    this.setup ||= this.build().catch(error => { this.setup = null; throw error; });
    await this.setup;
  }

  async build() {
    const ctx = this.ctx;
    const [ambient, tear] = await Promise.all((await this.buffers).map(bytes => ctx.decodeAudioData(bytes.slice(0))));
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -25;
    limiter.ratio.value = 8;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(limiter).connect(ctx.destination);
    this.roomGain = ctx.createGain();
    this.roomGain.gain.value = .26;
    this.roomGain.connect(this.master);
    const room = ctx.createBufferSource();
    room.buffer = ambient;
    room.loop = true;
    room.connect(this.roomGain);
    room.start();
    this.room = room;
    this.tear = tear;
  }

  update(activity, present, running) {
    if (!this.roomGain) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled && running ? .61 : 0, now, .13);
    this.roomGain.gain.setTargetAtTime(present ? .46 + Math.min(.32, activity * .56) : .24, now, .68);
  }

  rip(seed) {
    if (!this.tear || !this.enabled || this.ctx.currentTime - this.last < .32) return;
    const ctx = this.ctx;
    this.last = ctx.currentTime;
    const sample = ctx.createBufferSource(), trim = ctx.createGain();
    sample.buffer = this.tear;
    sample.playbackRate.value = .82 + seed * .29;
    trim.gain.value = .49 + seed * .12;
    sample.connect(trim).connect(this.master);
    sample.start();
    sample.onended = () => { sample.disconnect(); trim.disconnect(); };
  }

  dispose() {
    this.room?.stop();
    this.ctx?.close().catch(() => {});
  }
}
