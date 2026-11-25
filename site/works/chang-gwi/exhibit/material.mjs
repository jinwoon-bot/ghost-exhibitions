const limit = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const fract = value => value - Math.floor(value);
const subjectColor = [1.04, 1, .95];
export const randomAt = seed => fract(Math.sin(seed * 127.1 + 31.7) * 43758.5453);

export function smooth(from, to, value) {
  const t = limit((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

const cutoutOpacity = alpha => 255 * smooth(34, 225, alpha);

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

function thresholdAt(distance, x, y, w, h, seed, ink, wind, lift) {
  const bloom = noise(x / 24, y / 34, seed);
  const tears = noise(x / 7, y / 11, seed + .442);
  const bias = (x / w - .5) * wind * .27 + (y / h - .5) * (.21 + lift * .2);
  return limit(.034 + distance * .51 + bloom * .26 + tears * .16 + ink * .09 - bias, .025, .96);
}

export function createInkStamp(snapshot, texture, seed, budget, drift = 0, lift = 0) {
  const { w, h, pixels, color } = snapshot;
  const surface = document.createElement('canvas');
  surface.width = w;
  surface.height = h;
  const ctx = surface.getContext('2d');
  const paint = ctx.createImageData(w, h);
  const threshold = new Uint8Array(w * h);
  const contour = new Uint8Array(w * h);
  const textureTone = new Uint8Array(w * h);
  const tone = new Uint8Array(w * h * 3);
  const field = distanceToContour(snapshot);
  const depth = Math.max(22, Math.min(w, h) * .38) * 3;
  const sx = seed * 321, sy = seed * 493;
  const wind = Math.abs(drift) > .065 ? Math.sign(drift) * (.34 + Math.abs(drift) * .66) : (seed - .5) * 1.68;
  for (let i = 0; i < pixels.length; i++) {
    if (!pixels[i]) continue;
    const x = i % w, y = Math.floor(i / w);
    const ink = shadeAt(texture.ink, x * .87 + sx, y * .73 + sy);
    const fiber = shadeAt(texture.paper, x * 1.36 - sy, y * 1.25 + sx);
    const edge = 1 - smooth(2, 14, field[i]);
    const grain = randomAt(i + seed * 1679);
    const light = (.16 + .84 * noise(x / 18, y / 26, seed)) * edge;
    contour[i] = Math.round(light * 255);
    textureTone[i] = Math.round((fiber * .66 + grain * .34) * 255);
    for (let channel = 0; channel < 3; channel++) {
      const cloth = color ? color[i * 3 + channel] : 117;
      const value = Math.min(255, cloth * subjectColor[channel] * .97 + fiber * 8);
      tone[i * 3 + channel] = value;
      paint.data[i * 4 + channel] = value;
    }
    paint.data[i * 4 + 3] = cutoutOpacity(pixels[i]);
    threshold[i] = Math.round(thresholdAt(limit(field[i] / depth), x, y, w, h, seed, ink, wind, lift) * 255);
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
    const paper = n > .59;
    const u = randomAt(j + seed * 46 + 6), v = randomAt(j + seed * 78 + 9);
    const spread = .52 + v * .64;
    grains.push({
      x, y, paper, start: threshold[index] / 255,
      size: paper ? (.48 + u * u * 2.7) : (.50 + u * u * 2.35),
      tile: Math.floor(randomAt(j + seed * 287 + 4) * 8),
      vx: w * ((u - .5) * (paper ? 1.0 : 1.65) + wind * spread * (paper ? .95 : 1.65)),
      vy: h * (paper ? -.12 - v * .35 + lift * .26 : -.17 + v * .25 + lift * .13),
      angle: n * 6.283, spin: (n - .52) * 4,
      travel: .38 + randomAt(j + seed * 252 + 17) * .55,
    });
  }
  return { surface, ctx, paint, threshold, contour, textureTone, tone, grains, wind, lift, step: -1, strength: -1 };
}

export function paintErosion(stamp, snapshot, progress, strength = 1) {
  const step = Math.round(progress * 68);
  if (stamp.step === step && stamp.strength === strength) return;
  stamp.step = step;
  stamp.strength = strength;
  const cut = step / 68 * 255;
  const { paint, threshold, contour, textureTone, tone } = stamp;
  const rim = Math.min(strength, 1.35) * smooth(.02, .18, progress) * (1 - smooth(.18, .64, progress));
  const tearing = Math.min(strength, 1.35) * smooth(.01, .085, progress);
  for (let i = 0; i < threshold.length; i++) {
    const remaining = threshold[i] - cut;
    const a = cutoutOpacity(snapshot.pixels[i]) * limit((remaining + 7) / 9);
    paint.data[i * 4 + 3] = a;
    if (!a) continue;
    const torn = (1 - smooth(1, 20, remaining)) * tearing;
    const glow = contour[i] / 255 * rim * .21 + torn * (.12 + textureTone[i] * .0019);
    for (let channel = 0; channel < 3; channel++) {
      const value = tone[i * 3 + channel] * (1 - torn * .25);
      paint.data[i * 4 + channel] = value + (228 + channel * 13 - value) * glow;
    }
  }
  stamp.ctx.putImageData(paint, 0, 0);
}

export function drawGrains(ctx, atlas, grains, progress, strength, budget) {
  if (strength <= .01 || progress <= 0) return 0;
  let drawn = 0;
  for (const grain of grains) {
    if (drawn >= budget) break;
    const age = (progress - grain.start) / grain.travel;
    if (age <= 0 || age >= 1) continue;
    const flight = 1 - (1 - age) ** 1.6;
    const drift = (Math.sin(age * 8 + grain.angle) - Math.sin(grain.angle)) * age * grain.size * 3.4;
    const x = grain.x + strength * (grain.vx * flight + drift);
    const y = grain.y + strength * (grain.vy * flight + age * age * (grain.paper ? 10 : 47) + drift * .45);
    ctx.globalAlpha = smooth(0, .065, age) * (1 - smooth(.46, 1, age)) * (grain.paper ? .84 : .89);
    if (grain.paper && grain.size > 1.55 && atlas?.complete && atlas.naturalWidth) {
      const cellW = atlas.naturalWidth / 4, cellH = atlas.naturalHeight / 2;
      const size = grain.size * (1 + strength * .47);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(grain.angle + age * grain.spin);
      ctx.drawImage(atlas, (grain.tile % 4) * cellW, Math.floor(grain.tile / 4) * cellH, cellW, cellH,
        -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = grain.paper ? '#f5f1e7' : '#101017';
      ctx.beginPath();
      ctx.ellipse(x, y, grain.size * (1 + age * .68), grain.size * .39,
        Math.atan2(grain.vy, grain.vx), 0, Math.PI * 2);
      ctx.fill();
    }
    drawn++;
  }
  ctx.globalAlpha = 1;
  return drawn;
}
