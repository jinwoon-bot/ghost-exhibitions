export const PROGRESSIVE_HAUNT = 'PROGRESSIVE_HAUNT';

export const progressiveCalls = [{
  id: 'changgwi-crossing',
  actorId: 'changgwi',
  actor: '창귀',
  title: '창귀 · 길 건너편',
  file: 'assets/audio/progressive/changgwi-crossing.wav',
  finalAt: 18.54,
},
  {id:"songaksi-floor",actorId:"songaksi",actor:"손각시",title:"손각시 · 옆에 비워 둔 자리",file:"assets/audio/progressive/songaksi-floor.wav",finalAt:15.69},
  {id:"mongdal-floor",actorId:"mongdal",actor:"몽달귀신",title:"몽달귀신 · 문을 닫아 주세요",file:"assets/audio/progressive/mongdal-floor.wav",finalAt:12.8},
  {id:"gogwandaemyeon-floor",actorId:"gogwandaemyeon",actor:"고관대면",title:"고관대면 · 사진을 돌려 주세요",file:"assets/audio/progressive/gogwandaemyeon-floor.wav",finalAt:14.39},
  {id:"yeopjeon-floor",actorId:"yeopjeon",actor:"엽전사귀",title:"엽전사귀 · 천천히 세어 보세요",file:"assets/audio/progressive/yeopjeon-floor.wav",finalAt:14.07},
  {id:"seongju-floor",actorId:"seongju",actor:"성주신",title:"성주신 · 집에 들어오시면",file:"assets/audio/progressive/seongju-floor.wav",finalAt:14.48},
];

const unit = n => Math.max(0, Math.min(1, n));
const smooth = n => unit(n) ** 2 * (3 - 2 * unit(n));

export function hauntIntensity(seconds, duration, {start = 7, speed = 1, max = 1, profile = 'progressive', finalAt} = {}) {
  if (profile === 'fixed') return max;
  if (profile === 'ending') {
    const onset = Math.max(0, finalAt === undefined ? duration - 5.2 : finalAt - .72);
    return max * smooth((seconds - onset) / 1.4);
  }
  const onset = Math.min(start, Math.max(0, duration - 4));
  const peakAt = Math.min(duration - 1.4, (finalAt ?? duration - 5.4) + 2);
  const span = Math.max(.4, (peakAt - onset) / speed);
  return max * smooth((seconds - onset) / span);
}

export class ProgressiveHaunt {
  constructor(context, destination, volume, options, start, duration) {
    this.nodes = [];
    this.sources = [];
    const add = node => (this.nodes.push(node), node);
    const gain = value => {
      const node = add(context.createGain());
      node.gain.value = value;
      return node;
    };
    const filter = (type, frequency, q = .707) => {
      const node = add(context.createBiquadFilter());
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      return node;
    };
    const source = node => (this.sources.push(node), add(node));

    this.input = gain(1);
    const high = filter('highpass', 165);
    const low = filter('lowpass', 4300);
    const presence = filter('peaking', 1950, .9);
    this.input.connect(high).connect(low).connect(presence);

    const direct = gain(1), rough = gain(0), rumble = gain(0);
    const limiter = add(context.createDynamicsCompressor());
    limiter.threshold.value = -14;
    limiter.knee.value = 15;
    limiter.ratio.value = 8;
    limiter.attack.value = .004;
    limiter.release.value = .14;
    const master = gain(0);
    this.master = master.gain;
    limiter.connect(master).connect(destination);
    this.master.setValueAtTime(0, start);
    this.master.linearRampToValueAtTime(volume, start + .018);
    this.master.setValueAtTime(volume, start + duration - .06);
    this.master.linearRampToValueAtTime(0, start + duration);
    presence.connect(direct).connect(limiter);

    const drive = gain(1), flutter = gain(1);
    const shape = add(context.createWaveShaper());
    shape.curve = Float32Array.from({length: 2048}, (_, i) => Math.tanh(3.1 * (i / 1023.5 - 1)) / Math.tanh(3.1));
    shape.oversample = '2x';
    presence.connect(drive).connect(shape).connect(flutter).connect(rough).connect(limiter);
    const wobble = source(context.createOscillator()), depth = gain(0);
    wobble.connect(depth).connect(flutter.gain);
    wobble.start(start);

    // Two overlapping delay ramps lower the pitch from the same voice, in
    // sync with the intelligible lead. Each ramp resets while its window is zero.
    const layer = filter('lowpass', 1120);
    layer.connect(filter('highpass', 140)).connect(rumble).connect(limiter);
    const grain = context.createBuffer(2, Math.round(context.sampleRate * .146), context.sampleRate);
    const times = grain.getChannelData(0), windows = grain.getChannelData(1);
    for (let i = 0; i < times.length; i++) {
      const phase = i / times.length;
      times[i] = .016 + .046 * phase;
      windows[i] = Math.sin(Math.PI * phase) ** 2;
    }
    for (const offset of [0, grain.duration / 2]) {
      const control = source(context.createBufferSource());
      control.buffer = grain;
      control.loop = true;
      const channels = add(context.createChannelSplitter(2));
      const delay = add(context.createDelay(.12));
      delay.delayTime.value = 0;
      const window = gain(0);
      control.connect(channels);
      channels.connect(delay.delayTime, 0);
      channels.connect(window.gain, 1);
      presence.connect(delay).connect(window).connect(layer);
      control.start(start, offset);
    }

    let seed = 21716;
    const staticBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const staticSamples = staticBuffer.getChannelData(0);
    for (let i = 0; i < staticSamples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      staticSamples[i] = seed / 2147483648 - 1;
    }
    const hiss = source(context.createBufferSource()), hissLevel = gain(0);
    hiss.buffer = staticBuffer;
    hiss.loop = true;
    hiss.connect(filter('bandpass', 1460, 1.2)).connect(hissLevel).connect(limiter);
    hiss.start(start);

    const diction = (x,t) => options.finalAt === undefined ? 0 : x * smooth((t-options.finalAt+.16)/.6);
    const automation = [
      [high.frequency, x => 165 + 65 * x],
      [low.frequency, x => 4300 - 1590 * x],
      [presence.gain, (x,t) => 2.1 * x + 1.15 * diction(x,t)],
      [direct.gain, (x,t) => 1 - .29 * x + .07 * diction(x,t)],
      [drive.gain, x => 1 + 1.8 * x],
      [rough.gain, x => .28 * x ** 1.6],
      [rumble.gain, (x,t) => .43 * smooth((x - .24) / .76) * (1 - .19 * diction(x,t))],
      [depth.gain, x => .32 * x ** 1.35],
      [wobble.frequency, (x, t) => 7 + 12 * x + 2.2 * x * Math.sin(t * 2.7)],
      [hissLevel.gain, (x, t) => {
        const interference = smooth((x - .59) / .41);
        const surge = .5 + .5 * Math.sin(t * 8 + Math.sin(t * 2));
        return (options.noise ?? .36) * x ** 1.7 * (.010 + interference * .040 * surge ** 2) * (1 - .28 * diction(x,t));
      }],
    ];
    const steps = Math.max(2, Math.ceil(duration * 48) + 1);
    const intensities = Float32Array.from({length: steps}, (_, i) => hauntIntensity(duration * i / (steps - 1), duration, options));
    for (const [parameter, value] of automation) {
      const curve = intensities.map((amount, i) => value(amount, duration * i / (steps - 1)));
      parameter.setValueCurveAtTime(curve, start, duration);
    }
  }

  dispose() {
    for (const source of this.sources) {
      try { source.stop(); } catch {}
    }
    for (const node of this.nodes) node.disconnect();
  }
}
