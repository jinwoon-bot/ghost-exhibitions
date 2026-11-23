// Pure state: no audience timeline, no session ending, no accumulating history.
export const DEFAULTS = Object.freeze({
  preset: 'dark',
  camera: '',
  mirror: true,
  people: 3,
  sensitivity: 0.5,
  frequency: 1,
  maxClones: 24,
  lifetime: 8,
  opacity: 0.58,
  fragment: 7,
  decay: 1,
  ink: 5,
  trace: 0.24,
  cloneColor: '#c2cccb',
  background: '#080b0d',
  haunt: 0.07,
  sound: false,
  demo: false,
  fps: false,
  raw: true,
  stayAwake: true,
  gpuParticles: true,
  foreground: true,
  effect: 'hanji',
  performance: 'auto',
  backend: 'auto',
  cameraResolution: 'auto',
  inputSize: 480,
  aiQuality: 'high',
  aiModel:'resnet',
  inferFps: 8,
  renderScale: .85,
  particleBudget: 750,
  lifeScale: 1,
  preview: false,
});
export const PRESETS = {
  beautiful: {
    frequency: 0.75,
    lifetime: 7,
    opacity: 0.48,
    ink: 2,
    trace: 0.16,
    haunt: 0.015,
    cloneColor: '#d5dfda',
    decay: 0.8,
  },
  dark: {
    frequency: 1,
    lifetime: 8,
    opacity: 0.58,
    ink: 5,
    trace: 0.24,
    haunt: 0.07,
    cloneColor: '#c2cccb',
    decay: 1,
  },
  horror: {
    frequency: 1.3,
    lifetime: 10,
    opacity: 0.68,
    ink: 8,
    trace: 0.35,
    haunt: 0.16,
    cloneColor: '#abbac0',
    decay: 1.2,
  },
};
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function validateSettings(raw = {}) {
  const s = { ...DEFAULTS };
  for (const k in DEFAULTS) {
    if (typeof DEFAULTS[k] === 'boolean') {
      if (typeof raw[k] === 'boolean') s[k] = raw[k];
    } else if (typeof DEFAULTS[k] === 'number') {
      if (Number.isFinite(raw[k])) s[k] = raw[k];
    } else if (typeof raw[k] === 'string') s[k] = raw[k];
  }
  for (const [k, a, b] of [
    ['people', 1, 3],
    ['sensitivity', 0.2, 0.95],
    ['frequency', 0.2, 3],
    ['maxClones', 4, 40],
    ['lifetime', 3, 18],
    ['opacity', 0.1, 0.95],
    ['fragment', 3, 18],
    ['decay', 0.4, 2],
    ['ink', 0, 12],
    ['trace', 0, 0.7],
    ['haunt', 0, 0.3],
    ['inputSize',256,640],
    ['inferFps',1,15],
    ['renderScale',.4,1],
    ['particleBudget',100,1600],
    ['lifeScale',.5,1],
  ])
    s[k] = clamp(s[k], a, b);
  for (const k of ['people', 'maxClones', 'fragment','inputSize','particleBudget']) s[k] = Math.round(s[k]);
  for (const k of ['background', 'cloneColor'])
    if (!/^#[0-9a-f]{6}$/i.test(s[k])) s[k] = DEFAULTS[k];
  if (!PRESETS[s.preset]) s.preset = 'dark';
  if(!['hanji','ink'].includes(s.effect))s.effect='hanji';
  for(const [k,values] of [['performance',['auto','low','normal','high','custom']],['backend',['auto','webgl','cpu']],['cameraResolution',['auto','vga','hd','fullhd']],['aiQuality',['low','medium','high']],['aiModel',['resnet','mobile']]])if(!values.includes(s[k]))s[k]=DEFAULTS[k];
  s.camera=s.camera.slice(0,512);
  return s;
}
export function motion(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let diff = 0,
    area = 0;
  for (let i = 0; i < a.length; i++) {
    diff += a[i] !== b[i] ? 1 : 0;
    area += a[i] || b[i] ? 1 : 0;
  }
  return area ? diff / area : 0;
}
export function cadence(activity, frequency) {
  return 1000 / clamp((0.35 + activity * 5) * frequency, 0.2, 7);
}
export function intersection(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)),
    h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (w * h) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}
export class CloneStore {
  constructor(random = Math.random) {
    this.items = [];
    this.random = random;
    this.serial = 0;
    this.released = 0;
  }
  add(snapshot, owner, now, settings) {
    if (this.items.length >= settings.maxClones) return null;
    const prolonged = this.random() < settings.haunt;
    const life =
      settings.lifetime * 1000 * (prolonged ? 2 + this.random() : 0.85 + this.random() * 0.3);
    const c = {
      id: ++this.serial,
      owner,
      snapshot,
      effect: snapshot.effect || settings.effect || 'hanji',
      born: now,
      life,
      prolonged,
      seed: this.random() * 1000,
    };
    this.items.push(c);
    return c;
  }
  update(now, max) {
    const keep = [];
    for (const c of this.items) {
      if (now - c.born >= c.life) {
        c.snapshot.release?.();
        this.released++;
      } else keep.push(c);
    }
    this.items = keep;
    // Reducing the limit only blocks new captures; existing masks finish naturally.
    return this.items;
  }
  clear() {
    for (const c of this.items) c.snapshot.release?.();
    this.released += this.items.length;
    this.items = [];
  }
}
