const limit = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const fract = value => value - Math.floor(value);
const subjectColor = [1.04, 1, .95];
export const randomAt = seed => fract(Math.sin(seed * 127.1 + 31.7) * 43758.5453);

export function smooth(from, to, value) {
  const t = limit((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

function noise(x, y, seed) {
  const a = Math.floor(x), b = Math.floor(y);
  const u = smooth(0, 1, x - a), v = smooth(0, 1, y - b);
  const index = a + b * 503 + seed * 1741;
  const upper = randomAt(index) * (1 - u) + randomAt(index + 1) * u;
  const lower = randomAt(index + 503) * (1 - u) + randomAt(index + 504) * u;
  return upper * (1 - v) + lower * v;
}

function distanceToContour(snapshot) {
  const { w, h, pixels } = snapshot;
  const field = new Uint16Array(w * h);
  for (let i = 0; i < field.length; i++) field[i] = pixels[i] >= 130 ? 10000 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      field[i] = Math.min(field[i],
        (x ? field[i - 1] : 0) + 3,
        (y ? field[i - w] : 0) + 3,
        (y && x ? field[i - w - 1] : 0) + 4,
        (y && x + 1 < w ? field[i - w + 1] : 0) + 4);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      field[i] = Math.min(field[i],
        (x + 1 < w ? field[i + 1] : 0) + 3,
        (y + 1 < h ? field[i + w] : 0) + 3,
        (y + 1 < h && x ? field[i + w - 1] : 0) + 4,
        (y + 1 < h && x + 1 < w ? field[i + w + 1] : 0) + 4);
    }
  }
  return field;
}

function shadeAt(texture, x, y) {
  if (!texture) return .43;
  const i = (((Math.floor(y) % 256 + 256) % 256) * 256 + (Math.floor(x) % 256 + 256) % 256) * 4;
  return (texture[i] * .22 + texture[i + 1] * .70 + texture[i + 2] * .08) / 255;
}

function thresholdAt(distance, x, y, w, h, seed, ink) {
  const low = noise(x / 25, y / 29, seed);
  const high = noise(x / 6, y / 8, seed + .442);
  const angle = seed * 6.283;
  const wind = (x / w - .5) * Math.sin(angle) + (y / h - .5) * Math.cos(angle);
  return limit(.041 + distance * .54 + low * .15 + high * .12 + ink * .12 + wind * .13, .025, .96);
}

export function createInkStamp(snapshot, texture, seed, budget, drift = 0) {
  const { w, h, pixels, color } = snapshot;
  const surface = document.createElement('canvas');
  surface.width = w;
  surface.height = h;
  const ctx = surface.getContext('2d');
  const paint = ctx.createImageData(w, h);
  const threshold = new Uint8Array(w * h);
  const darkness = new Uint8Array(w * h);
  const tone = new Uint8Array(w * h * 3);
  const field = distanceToContour(snapshot);
  const depth = Math.max(22, Math.min(w, h) * .38) * 3;
  const sx = seed * 321, sy = seed * 493;
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i]) continue;
    const x = i % w, y = Math.floor(i / w);
    const ink = shadeAt(texture.ink, x * .87 + sx, y * .73 + sy);
    const fiber = shadeAt(texture.paper, x * 1.36 - sy, y * 1.25 + sx);
    const edge = 1 - limit(field[i] / 24);
    const rough = randomAt(i + seed * 1679);
    const gray = 8 + ink * 31 + fiber * 6 + edge * (6 + ink * 8) + rough * 3;
    darkness[i] = gray;
    for (let channel = 0; channel < 3; channel++) {
      const cloth = color ? color[i * 3 + channel] : 117;
      const value = Math.min(255, cloth * subjectColor[channel] * 1.17 + 20 + fiber * 11 + edge * 8);
      tone[i * 3 + channel] = value;
      paint.data[i * 4 + channel] = value;
    }
    paint.data[i * 4 + 3] = pixels[i];
    threshold[i] = Math.round(thresholdAt(limit(field[i] / depth), x, y, w, h, seed, ink) * 255);
  }
  ctx.putImageData(paint, 0, 0);
  const grains = [];
  const stride = Math.max(3, Math.ceil(Math.sqrt(w * h / Math.max(1, budget))));
  for (let j = 0; j < budget * 2 && grains.length < budget; j++) {
    const col = j % Math.ceil(w / stride);
    const row = Math.floor(j / Math.ceil(w / stride));
    const n = randomAt(j + seed * 1901);
    const x = Math.floor((col + n) * stride), y = Math.floor((row + 1 - n) * stride);
    if (x >= w) continue;
    if (y >= h) break;
    const index = y * w + x;
    if (pixels[index] < 128) continue;
    const paper = n > .74;
    const vector = Math.abs(drift) > .07 ? Math.sign(drift) * (.25 + Math.abs(drift) * .75) : (seed - .5) * 1.7;
    grains.push({
      x, y, paper, start: threshold[index] / 255,
      size: paper ? (1.25 + n * 2.3) : (.52 + n * 2.8),
      tile: Math.floor(randomAt(j + seed * 287 + 4) * 8),
      vx: (randomAt(j + seed * 46 + 6) - .5) * (paper ? 129 : 183) + vector * (paper ? 93 : 143),
      vy: (paper ? -36 : 14) - randomAt(j + seed * 78 + 9) * (paper ? 55 : 118),
      angle: n * 6.283, spin: (n - .52) * 4,
      travel: .27 + randomAt(j + seed * 252 + 17) * .48,
    });
  }
  return { surface, ctx, paint, threshold, darkness, tone, grains, step: 0 };
}

export function paintErosion(stamp, snapshot, progress) {
  const step = Math.round(progress * 68);
  if (stamp.step === step) return;
  stamp.step = step;
  const cut = step / 68 * 255;
  const { paint, threshold, darkness, tone } = stamp;
  const ink = smooth(.05, .65, progress);
  for (let i = 0; i < threshold.length; i++) {
    const a = snapshot.pixels[i] * limit((threshold[i] - cut + 7) / 9);
    paint.data[i * 4 + 3] = a;
    if (!a) continue;
    const edge = 1 - smooth(4, 25, threshold[i] - cut);
    for (let channel = 0; channel < 3; channel++) {
      paint.data[i * 4 + channel] = tone[i * 3 + channel] * (1 - ink) + darkness[i] * ink
        + edge * (channel + 2) * (1 - ink);
    }
  }
  stamp.ctx.putImageData(paint, 0, 0);
}

export function drawGrains(ctx, atlas, grains, progress, strength, seed, budget) {
  if (strength <= .01 || progress <= 0) return 0;
  let drawn = 0;
  for (const grain of grains) {
    if (drawn >= budget) break;
    const age = (progress - grain.start) / grain.travel;
    if (age <= 0 || age >= 1) continue;
    const drift = Math.sin(age * 8 + grain.angle) * age * (9 + strength * 14);
    const x = grain.x + strength * (grain.vx * age * (.5 + age * .5) + drift);
    const y = grain.y + strength * (grain.vy * age + age * age * 26 + Math.cos(age * 6 + grain.angle) * age * 11);
    ctx.globalAlpha = (1 - smooth(.35, 1, age)) * (grain.paper ? .64 : .78);
    if (grain.paper && atlas?.complete && atlas.naturalWidth) {
      const cellW = atlas.naturalWidth / 4, cellH = atlas.naturalHeight / 2;
      const size = grain.size * (1 + strength * .47);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(grain.angle + age * grain.spin);
      ctx.drawImage(atlas, (grain.tile % 4) * cellW, Math.floor(grain.tile / 4) * cellH, cellW, cellH,
        -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = grain.paper ? '#ece7dd' : (seed > .5 ? '#161d32' : '#0b0c12');
      ctx.fillRect(x, y, grain.size * (1.2 + age * .7), grain.size * .62);
      if (age < .62 && !grain.paper) {
        ctx.globalAlpha *= .37;
        ctx.fillRect(x - grain.vx * age * .08, y - grain.vy * age * .07, grain.size * 2.7, grain.size * .43);
      }
    }
    drawn++;
  }
  ctx.globalAlpha = 1;
  return drawn;
}
