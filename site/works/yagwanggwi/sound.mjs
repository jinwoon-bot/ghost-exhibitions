import { LAST_LINE, NUMBERS } from './score.mjs?v=double-clap';

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
        (.11 * Math.sin(t * Math.PI * 2 * 57) + .047 * Math.sin(t * Math.PI * 2 * 111.4) + low * .48) *
        (.64 + .26 * Math.sin(t * 1.9)) * envelope(t, .42, .50, 5.1), 341), this.pressure, 125),
    ];
    this.pressure.gain.value = 0;
    this.bank = {
      touch: makeSample(ctx,.23,(t, w, l, m) => (m*.66+(w-m)*.18)*Math.exp(-t*28) +
        .10*Math.sin(t*2*Math.PI*590)*Math.exp(-t*43), 807),
      scratch: makeSample(ctx,1.05,(t,w,l,m) => (m*.92+(w-m)*.19)*
        (.13 + .78*Math.max(0,Math.sin(t*36+.8*Math.sin(t*19)))**3)*envelope(t,.09,.22,1.05), 245),
      breath: makeSample(ctx,1.83,(t,w,l,m) =>
        (l*.49 + m*.71 + (w-m)*.082) *
        (.67+.21*Math.sin(t*13.9+Math.sin(t*6.3))+.065*Math.sin(t*102)) *
        Math.sin(Math.PI*Math.min(1,t/1.83))**1.35, 414),
      wood: makeSample(ctx,.90,(t,w,l,m) => (m*.66 + .08*Math.sin(t*1700+t*t*250))*
        (.21+.29*Math.sin(t*27)**2)*envelope(t,.13,.34,.90), 97),
      reed: makeSample(ctx,1.45,(t,w,l,m) => {
        const phase = 2*Math.PI*(216*t-37*t*t)+1.3*Math.sin(t*12);
        const strain = .15+.85*Math.max(0,Math.sin(t*9.5+.8*Math.sin(t*17)))**2;
        return (m*.58+(w-m)*.09+.11*Math.sin(phase)+.02*Math.sin(phase*2.73)) *
          strain*envelope(t,.08,.44,1.45);
      }, 579),
      impact: makeSample(ctx,.64,(t,w,l,m) => {
        const crack = (m*.55+(w-m)*.22)*Math.exp(-t*39);
        const thud = (.43*Math.sin(2*Math.PI*(112*t-39*t*t))+.51*l)*Math.exp(-t*8.6);
        return (crack+thud)*envelope(t,.009,.18,.64);
      }, 3107),
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

  play(buffer, { bus=this.foley, volume=.2, pitch=1, pan=0, panEnd=pan, cutoff=4500, when=0, voice=false, reflection=0 } = {}) {
    if (!buffer || this.ctx?.state !== 'running') return;
    const ctx = this.ctx, start = ctx.currentTime + when;
    const source = ctx.createBufferSource(), tone = ctx.createBiquadFilter();
    const trim = ctx.createGain(), panner = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    tone.type = 'lowpass';
    tone.frequency.value = cutoff;
    tone.Q.value = .32;
    panner.pan.setValueAtTime(pan,start);
    if (panEnd !== pan) panner.pan.linearRampToValueAtTime(panEnd,start+buffer.duration/pitch);
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
      this.roomGate.gain.setTargetAtTime(anger ? .51 : 1,now,.67);
      this.pressure.gain.setTargetAtTime(anger * .085,now,1.1);
      this.speak(count,anger);
      if (count % 3 !== 0) sample('touch',{volume:.19,pan:-.24,when:.52+Math.random()*.32,cutoff:1800});
      if (count % 4 === 3) sample('wood',{volume:.18,pan:.35,when:.72,cutoff:1230});
      return;
    }
    this.stopVoice();
    for (const note of this.effects) this.stop(note);
    if (type === 'interruption') {
      this.roomGate.gain.setTargetAtTime(.065,now,.064);
      this.pressure.gain.setTargetAtTime(anger*.100,now,.73);
      const side = count%2 ? -.27 : .24;
      sample('touch',{volume:.29,pan:side,cutoff:1580+count*220,pitch:.73+count*.043});
      sample('breath',{volume:.23+anger*.050,pan:side*.83,panEnd:side*.11,when:.074,cutoff:1650+anger*360,pitch:1.23});
      if (anger > 1) sample('reed',{volume:.23,pan:-side,panEnd:side*.32,when:.14,cutoff:1820,pitch:.87});
    } else if (type === 'lunge') {
      this.roomGate.gain.setTargetAtTime(.018,now,.044);
      this.pressure.gain.setTargetAtTime(0,now,.16);
      sample('reed',{volume:.22,pan:-.26,panEnd:0,when:.012,pitch:1.22,cutoff:1750});
      sample('impact',{volume:this.settings.safe ? .24 : .57,when:.11,cutoff:3050});
      sample('breath',{volume:.33,pan:.13,panEnd:0,when:.14,cutoff:2880,pitch:1.15});
    } else if (type === 'reveal') {
      this.roomGate.gain.setTargetAtTime(.02,now,.095);
      this.pressure.gain.setTargetAtTime(0,now,.25);
      sample('touch',{volume:.27,pan:-.12,cutoff:1470,pitch:.66});
      sample('reed',{volume:.27,pan:.31,panEnd:-.16,cutoff:1950,when:.095,pitch:.81});
      sample('scratch',{volume:.16,pan:-.29,panEnd:.035,cutoff:2300,when:.48,pitch:.79});
      sample('breath',{volume:.40,pan:-.38,panEnd:.025,cutoff:2780,when:.55,pitch:.92});
    } else if (type === 'last-line') {
      this.speak('reveal');
    } else if (type === 'quiet') {
      this.roomGate.gain.setTargetAtTime(.14,now,.65);
      this.pressure.gain.setTargetAtTime(0,now,.35);
      sample('reed',{volume:.13,pan:.13,panEnd:.31,when:.68,cutoff:950,pitch:.77});
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
