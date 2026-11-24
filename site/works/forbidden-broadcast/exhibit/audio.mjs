const gainAt = (parameter, context, value, seconds = .11) => {
  parameter.setTargetAtTime(value, context.currentTime, seconds);
};

export class BroadcastAudio {
  constructor(voiceURL) {
    this.voiceRequest = fetch(voiceURL).then(response => {
      if (!response.ok) throw Error('뉴스 음원 파일을 찾을 수 없습니다.');
      return response.arrayBuffer();
    });
    this.voiceRequest.catch(() => {});
    this.enabled = false;
    this.lastType = -Infinity;
  }

  connect(node, volume, destination = this.master) {
    const gain = this.context.createGain();
    gain.gain.value = volume;
    node.connect(gain).connect(destination);
    return gain;
  }

  filter(type, frequency, q) {
    const node = this.context.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  async start(offset) {
    if (this.context && this.started) {
      await this.context.resume();
      this.enabled = true;
      return;
    }
    if (this.starting) return this.starting;
    this.context ||= new AudioContext();
    const ctx = this.context;
    this.starting = (async () => {
      await ctx.resume();
      const voice = await ctx.decodeAudioData((await this.voiceRequest).slice(0));
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -17;
      limit.knee.value = 10;
      limit.ratio.value = 12;
      limit.attack.value = .006;
      limit.release.value = .24;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(limit).connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = voice;
      source.loop = true;
      const speechBand = this.filter('highpass', 110, .7);
      this.speech = this.filter('lowpass', 5200, .7);
      source.connect(speechBand).connect(this.speech);
      this.voice = this.connect(this.speech, .78);
      const delay = ctx.createDelay(.4);
      delay.delayTime.value = .135;
      const echoBand = this.filter('bandpass', 900, .95);
      speechBand.connect(delay).connect(echoBand);
      this.echo = this.connect(echoBand, 0);

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; ++i) {
        const white = Math.random() * 2 - 1;
        last = last * .67 + white * .33;
        samples[i] = last * .57 + white * .22;
      }
      const tape = ctx.createBufferSource();
      tape.buffer = noiseBuffer;
      tape.loop = true;
      const staticBand = this.filter('bandpass', 1760, .8);
      tape.connect(staticBand);
      this.tape = this.connect(staticBand, 0);

      const room = ctx.createOscillator();
      room.type = 'sine';
      room.frequency.value = 56.2;
      this.room = this.connect(room, 0);
      const basement = ctx.createOscillator();
      basement.type = 'triangle';
      basement.frequency.value = 39.4;
      const low = this.filter('lowpass', 165, .62);
      basement.connect(low);
      this.basement = this.connect(low, 0);
      this.sources = [source, tape, room, basement];
      this.started = { at: ctx.currentTime, offset: offset % voice.duration, duration: voice.duration };
      source.start(0, this.started.offset);
      for (const oscillator of [tape, room, basement]) oscillator.start();
      this.enabled = true;
    })();
    try { await this.starting; }
    finally { this.starting = null; }
  }

  time() {
    if (!this.started) return null;
    const { at, offset, duration } = this.started;
    return (this.context.currentTime - at + offset) % duration;
  }

  update(volume, stress, overlay, reveal, burst = 0, silent = false) {
    if (!this.started) return;
    const ctx = this.context;
    gainAt(this.master.gain, ctx, this.enabled && !silent ? volume : 0, silent || burst > .05 ? .022 : .095);
    gainAt(this.voice.gain, ctx, .78 * (1 - overlay * .97));
    gainAt(this.speech.frequency, ctx, 5200 - stress * 2100);
    gainAt(this.echo.gain, ctx, stress * .052 * (1 - overlay * .6));
    gainAt(this.tape.gain, ctx, .012 + stress ** 2 * .21 + reveal * .09 + burst * .38, .032);
    gainAt(this.room.gain, ctx, .019 + stress * .036);
    gainAt(this.basement.gain, ctx, stress ** 2 * .14 + reveal * .05, .2);
  }

  tone(frequency, end, length, level, type = 'sine', delay = 0) {
    if (!this.enabled || !this.started) return;
    const ctx = this.context, now = ctx.currentTime + delay;
    const source = ctx.createOscillator(), gain = ctx.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, now);
    source.frequency.exponentialRampToValueAtTime(end, now + length);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + .017);
    gain.gain.exponentialRampToValueAtTime(.0001, now + length);
    source.connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + length + .02);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
  }

  shutter() { this.tone(92, 46, .62, .17, 'triangle'); }

  ident() {
    this.tone(527, 505, .25, .047, 'triangle');
    this.tone(403, 377, .42, .061, 'triangle', .19);
  }

  scare() {
    this.tone(187, 41, .48, .22, 'triangle');
    this.tone(639, 88, .26, .095, 'sawtooth');
  }

  type() {
    if (!this.started || this.context.currentTime - this.lastType < .145) return;
    this.lastType = this.context.currentTime;
    this.tone(930, 530, .060, .033, 'triangle');
  }

  close() { this.context?.close().catch(() => {}); }
}
