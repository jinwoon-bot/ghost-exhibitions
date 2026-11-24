import { LAST_LINE, NUMBERS } from './score.mjs?v=clap-response';

const voiceRoot = new URL('./assets/voice/', import.meta.url);
const audioFile = /^[a-z0-9_-]+\.(wav|mp3|ogg)$/i;

function makeSample(ctx, duration, shape, seed = 137, channels = 1) {
  const buffer = ctx.createBuffer(channels, Math.ceil(duration * ctx.sampleRate), ctx.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0, middle = 0;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      low += (white - low) * .007;
      middle += (white - middle) * .093;
      data[i] = shape(i / ctx.sampleRate, white, low, middle, ch);
    }
  }
  return buffer;
}

function envelope(t, attack, release, duration) {
  return Math.min(1, t / attack, Math.max(0, (duration - t) / release));
}

export class Sound {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.effects = new Set();
    this.recordings = new Map();
  }

  async start(settings) {
    if (!this.ctx || this.ctx.state === 'closed') this.build();
    this.configure(settings);
    await this.ctx.resume();
    if (!this.voiceLoading) this.voiceLoading = this.loadVoice();
    return this.ctx;
  }

  build() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('이 브라우저는 Web Audio를 지원하지 않습니다.');
    const ctx = this.ctx = new Audio({latencyHint:'interactive'});
    this.main = ctx.createGain();
    this.voice = ctx.createGain();
    this.room = ctx.createGain();
    this.foley = ctx.createGain();
    this.pressure = ctx.createGain();
    this.roomGate = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -11;
    limiter.knee.value = 5;
    limiter.ratio.value = 15;
    limiter.attack.value = .003;
    limiter.release.value = .22;
    const ceiling = ctx.createWaveShaper();
    ceiling.curve = Float32Array.from({length:1025},(_,i) => {
      const value = (i-512)/512, magnitude = Math.abs(value);
      return Math.sign(value) * (magnitude <= .76 ? magnitude : .76+(magnitude-.76)*.50);
    });
    for (const bus of [this.room,this.pressure]) bus.connect(this.roomGate);
    for (const bus of [this.roomGate,this.voice,this.foley]) bus.connect(this.main);
    this.main.connect(limiter).connect(ceiling).connect(ctx.destination);
    this.atmos = [
      this.loop(makeSample(ctx, 6.6, (t, white, low, mid, channel) =>
        (low * .58 + mid * .12) * (.69 + .17 * Math.sin(t * 1.7 + channel * 1.4)) *
        envelope(t, .34, .43, 6.6), 8051, 2), this.room, 480),
      this.loop(makeSample(ctx, 5.1, (t, white, low) =>
        (.094 * Math.sin(t * Math.PI * 2 * 57) + low * .48) *
        (.64 + .26 * Math.sin(t * 1.9)) * envelope(t, .42, .50, 5.1), 341), this.pressure, 125),
    ];
    this.pressure.gain.value = 0;
    this.bank = {
      touch: makeSample(ctx,.23,(t, w, l, m) => (m*.66+(w-m)*.18)*Math.exp(-t*28) +
        .10*Math.sin(t*2*Math.PI*590)*Math.exp(-t*43), 807),
      scratch: makeSample(ctx,1.05,(t,w,l,m) => (m*.92+(w-m)*.19)*
        (.13 + .78*Math.max(0,Math.sin(t*36+.8*Math.sin(t*19)))**3)*envelope(t,.09,.22,1.05), 245),
      breath: makeSample(ctx,1.55,(t,w,l,m) => (l*.38+m*.74+w*.059)*
        (.61+.16*Math.sin(t*17.9))*envelope(t,.31,.63,1.55), 414),
      wood: makeSample(ctx,.90,(t,w,l,m) => (m*.66 + .08*Math.sin(t*1700+t*t*250))*
        (.21+.29*Math.sin(t*27)**2)*envelope(t,.13,.34,.90), 97),
      drag: makeSample(ctx,3.8,(t,w,l,m) => (m*.69+(w-m)*.11)*
        (.19+.83*Math.max(0,Math.sin(6.2*t+.65*Math.sin(t*3.7)))**2)*envelope(t,.17,.48,3.8), 400),
      step: makeSample(ctx,.24,(t,w,l,m) => Math.exp(-t*20)*
        (l*.71+m*.44+.26*Math.sin(Math.PI*2*(78*t-71*t*t))), 218),
    };
  }

  loop(buffer, bus, cutoff) {
    const source = this.ctx.createBufferSource();
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = cutoff;
    source.buffer = buffer;
    source.loop = true;
    source.connect(tone).connect(bus);
    source.start();
    return {source,tone};
  }

  async loadVoice() {
    let config = {};
    try {
      const response = await fetch(new URL('manifest.json', voiceRoot));
      if (response.ok) config = await response.json();
    } catch {}
    const ctx = this.ctx;
    const entries = [
      ...NUMBERS.map((_, i) => [String(i + 1), config.count?.[i]]),
      ['reveal', config.reveal],
    ].filter(([,file]) => typeof file === 'string' && audioFile.test(file));
    await Promise.all(entries.map(async ([slot,file]) => {
      try {
        const response = await fetch(new URL(file, voiceRoot));
        if (response.ok && this.ctx === ctx && ctx.state !== 'closed') {
          this.recordings.set(slot, await ctx.decodeAudioData(await response.arrayBuffer()));
        }
      } catch {}
    }));
    this.onStatus();
  }

  localKorean() {
    return window.speechSynthesis?.getVoices().find(voice => voice.localService && /^ko(?:-|$)/i.test(voice.lang));
  }

  voiceStatus() {
    if (this.recordings.size === NUMBERS.length + 1) return '동봉 한국어 합성 음원';
    if (this.localKorean()) return this.recordings.size ? '동봉 음원 및 기기 한국어 음성' : '기기의 한국어 음성';
    return this.recordings.size ? '일부 동봉 음원' : '한국어 음성 없음 · 효과음 재생';
  }

  configure(settings) {
    this.settings = settings;
    if (!this.ctx) return;
    const { currentTime:now } = this.ctx;
    const target = (node,value) => node.gain.setTargetAtTime(value,now,.06);
    target(this.main, settings.muted ? 0 : settings.master * (settings.safe ? .59 : .81));
    target(this.voice, settings.voice * .85);
    target(this.room, settings.room * .55);
    target(this.foley, settings.fx * .73);
    if (settings.muted || !settings.voice || !settings.master) this.stopVoice();
  }

  play(buffer, { bus=this.foley, volume=.2, pitch=1, pan=0, cutoff=4500, when=0, voice=false, reflection=0 } = {}) {
    if (!buffer || this.ctx?.state !== 'running') return;
    const ctx = this.ctx, start = ctx.currentTime + when;
    const source = ctx.createBufferSource(), tone = ctx.createBiquadFilter();
    const trim = ctx.createGain(), panner = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    tone.type = 'lowpass';
    tone.frequency.value = cutoff;
    tone.Q.value = .32;
    panner.pan.value = pan;
    trim.gain.setValueAtTime(0,start);
    trim.gain.linearRampToValueAtTime(volume,start+.021);
    source.connect(tone).connect(trim).connect(panner).connect(bus);
    const echo = reflection ? ctx.createDelay(.12) : null;
    const reflectionTrim = reflection ? ctx.createGain() : null;
    if (echo) {
      echo.delayTime.value = .058;
      reflectionTrim.gain.value = reflection;
      panner.connect(echo).connect(reflectionTrim).connect(bus);
    }
    const note = {source,trim,start};
    const shelf = voice ? null : this.effects;
    if (voice) this.currentVoice = note;
    else {
      if (shelf.size >= 18) this.stop(shelf.values().next().value);
      shelf.add(note);
    }
    source.onended = () => {
      source.disconnect(); tone.disconnect(); trim.disconnect(); panner.disconnect();
      if (echo) { echo.disconnect(); reflectionTrim.disconnect(); }
      shelf?.delete(note);
      if (this.currentVoice === note) this.currentVoice = null;
    };
    source.start(start);
  }

  stop(note) {
    if (!note || !this.ctx) return;
    const now = this.ctx.currentTime;
    note.trim.gain.cancelScheduledValues(now);
    note.trim.gain.setTargetAtTime(0,now,.004);
    note.source.stop(now+.024);
    this.effects.delete(note);
  }

  stopVoice() {
    if (this.currentVoice) this.stop(this.currentVoice);
    this.currentVoice = null;
    if (this.utterance) window.speechSynthesis?.cancel();
    this.utterance = null;
  }

  speak(slot, anger = 0) {
    this.stopVoice();
    if (!this.ctx || !this.settings?.voice || this.settings.muted || !this.settings.master) return;
    const reveal = slot === 'reveal';
    const buffer = this.recordings.get(String(slot));
    if (buffer) {
      this.play(buffer, {bus:this.voice, volume:reveal ? .61 : .53,
        cutoff:reveal ? 6600 : 1550 + anger * 580,
        pan:reveal ? .025 : -.20 + anger * .07,
        pitch:reveal ? .95 : .94 - anger * .033,
        reflection:reveal ? 0 : .18-anger*.05, voice:true});
      return;
    }
    const voice = this.localKorean();
    if (!voice || this.ctx.state !== 'running') return;
    const utterance = new SpeechSynthesisUtterance(reveal ? LAST_LINE : NUMBERS[slot - 1]);
    utterance.lang = 'ko-KR';
    utterance.voice = voice;
    utterance.volume = Math.min(.44, this.settings.voice * this.settings.master * (this.settings.safe ? .35 : .60));
    utterance.rate = reveal ? .77 : .81 - anger * .025;
    utterance.pitch = reveal ? .71 : .77 - anger * .05;
    utterance.onend = utterance.onerror = () => { if (this.utterance === utterance) this.utterance = null; };
    this.utterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  event(type, count = 0, anger = 0) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sample = (name,opts) => this.play(this.bank[name],opts);
    if (type === 'count') {
      this.roomGate.gain.setTargetAtTime(1,now,.40);
      this.pressure.gain.setTargetAtTime(anger * .033,now,1.1);
      this.speak(count,anger);
      if (count % 3 !== 0) sample('touch',{volume:.19,pan:-.24,when:.52+Math.random()*.32,cutoff:1800});
      if (count % 4 === 3) sample('wood',{volume:.18,pan:.35,when:.72,cutoff:1230});
      return;
    }
    this.stopVoice();
    for (const note of this.effects) this.stop(note);
    if (type === 'interruption') {
      this.roomGate.gain.setTargetAtTime(.10,now,.058);
      this.pressure.gain.setTargetAtTime(anger*.063,now,.73);
      const side = count%2 ? .24 : -.30;
      sample('touch',{volume:.34,pan:side,cutoff:1880+count*220,pitch:.69+count*.058});
      if (count > 1) sample('breath',{volume:.18,pan:side*.67,when:.12,cutoff:1400+anger*300,pitch:1.34});
      if (anger > 1) sample('scratch',{volume:.20,pan:-side,when:.16,cutoff:2350,pitch:1.17});
    } else if (type === 'reveal') {
      this.roomGate.gain.setTargetAtTime(.035,now,.082);
      this.pressure.gain.setTargetAtTime(0,now,.25);
      sample('touch',{volume:.31,pan:-.10,cutoff:1600,pitch:.65});
      sample('wood',{volume:.27,pan:.21,cutoff:1850,when:.10,pitch:.76});
      sample('breath',{volume:.24,pan:.08,cutoff:2070,when:.81,pitch:.89});
    } else if (type === 'last-line') {
      this.speak('reveal');
    } else if (type === 'theft') {
      this.roomGate.gain.setTargetAtTime(.83,now,.10);
      [ .71, 1.35, 5.46, 6.09, 6.85 ].forEach((when,i) =>
        sample('step',{volume:.37-i*.054,pan:-.22-i*.07,cutoff:1290-i*137,when,pitch:.97-i*.04}));
      sample('drag',{volume:.43,pan:-.32,cutoff:2400,when:1.77});
      sample('wood',{volume:.18,pan:-.50,cutoff:1320,when:4.25});
    } else if (type === 'reset') {
      this.roomGate.gain.setTargetAtTime(1,now,.55);
      this.pressure.gain.setTargetAtTime(0,now,.45);
    }
  }

  dispose() {
    this.stopVoice();
    for (const note of this.effects) this.stop(note);
    for (const {source} of this.atmos || []) source.stop();
    this.ctx?.close().catch(() => {});
  }
}
