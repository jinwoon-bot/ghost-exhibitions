const names = ['songaksi', 'mongdal'];
// Media seconds from the approved walking clips. Pausing the clip pauses its cues.
const steps = { songaksi: [1.52, 2.55, 3.29, 4.2], mongdal: [1.37, 2.38, 3.24, 4.48, 5.55] };

export class WeddingFoley {
  constructor() {
    this.nodes = new Set();
    this.lastState = '';
    this.step = [0, 0];
    this.revealed = [false, false];
  }

  async unlock() {
    if (!window.AudioContext) return;
    if (!this.context) {
      const ctx = this.context = new AudioContext();
      this.output = ctx.createGain();
      this.output.gain.value = 0;
      this.output.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const values = this.noise.getChannelData(0);
      let seed = 2941;
      for (let i = 0; i < values.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        values[i] = seed / 2147483648 - 1;
      }
    }
    await this.context.resume();
  }

  level(value) {
    if (this.output) this.output.gain.setTargetAtTime(value, this.context.currentTime, .03);
  }

  cue(kind, index, delay = 0) {
    const ctx = this.context;
    if (ctx?.state !== 'running') return;
    const foot = kind === 'step';
    const reveal = kind === 'paper';
    const duration = foot ? .25 : reveal ? .49 : .64;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(foot ? index ? 116 : 165 : reveal ? 1330 : 550, t);
    filter.frequency.exponentialRampToValueAtTime(foot ? 76 : reveal ? 530 : 310, t + duration);
    filter.Q.value = foot ? .55 : .9;
    pan.pan.value = index ? .56 : -.56;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(foot ? .35 : reveal ? .20 : .18, t + (foot ? .017 : .102));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter).connect(gain).connect(pan).connect(this.output);
    this.nodes.add(source);
    source.onended = () => {
      this.nodes.delete(source);
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan.disconnect();
    };
    source.start(t, index * .16);
    source.stop(t + duration);
  }

  stop() {
    for (const source of this.nodes) {
      try { source.stop(); } catch {}
    }
  }

  update(state, actors, options) {
    if (state !== this.lastState) {
      this.lastState = state;
      if (state === 'WAITING') {
        this.step.fill(0);
        this.revealed.fill(false);
        if (options.enabled) {
          this.cue('cloth', 0, .22);
          this.cue('cloth', 1, .59);
        }
      }
      if (['IDLE', 'EXIT', 'RESET'].includes(state)) this.stop();
    }
    if (!options.enabled || document.hidden) return;
    for (const [index, name] of names.entries()) {
      const actor = actors[name];
      if (!actor) continue;
      if (state === 'GHOST_ENTER' && actor.active === 'walk') {
        const cue = steps[name][this.step[index]];
        if (actor.walk.currentTime >= cue) {
          this.step[index]++;
          if (actor.walk.currentTime - cue < .32) this.cue('step', index);
        }
      }
      if (state === 'GHOST_REVEAL' && actor.active === 'reveal' && !this.revealed[index]) {
        this.revealed[index] = true;
        this.cue('paper', index, .19);
      }
    }
  }
}
