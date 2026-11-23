// Entirely synthesized: no samples, network or recording.
export class Sound {
  async enable(enabled) {
    if (!enabled) {
      if (this.ctx) await this.ctx.suspend();
      return;
    }
    if (!this.ctx) {
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      this.ctx = new A();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
      this.oscillators = [43, 65.2, 86.4].map((f, i) => {
        const o = this.ctx.createOscillator(),
          g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.value = 0.025 / (i + 1);
        o.connect(g);
        g.connect(this.gain);
        o.start();
        return o;
      });
    }
    await this.ctx.resume();
  }
  update(activity, count) {
    if (this.ctx?.state === 'running')
      this.gain.gain.setTargetAtTime(
        count ? 0.2 + Math.min(activity, 1) * 0.5 : 0,
        this.ctx.currentTime,
        2,
      );
  }
  dispose() {
    this.oscillators?.forEach((o) => o.stop());
    this.ctx?.close();
  }
}
