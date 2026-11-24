import { smooth } from './material.mjs?v=contour';

function surface(read = false) {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: read }) };
}

function distance(rgba, background, pixel) {
  const i = pixel * 4;
  const j = pixel * 3;
  const r = rgba[i] - background[j];
  const g = rgba[i + 1] - background[j + 1];
  const b = rgba[i + 2] - background[j + 2];
  return Math.max(Math.abs((r + 2 * g + b) * .25), Math.abs(r - g) * .75, Math.abs(b - g) * .75);
}

function globalChange(rgba, background, known, zone) {
  let stable = 0;
  let changed = 0;
  for (let i = 0; i < known.length; i += 11) {
    if (!known[i] || zone[i]) continue;
    stable++;
    changed += Number(distance(rgba, background, i) > 24);
  }
  return stable > 20 && changed / stable > .38;
}

// Fast current-frame check within the area where the last person was detected.
// No bounding box is drawn into the matte.
export function alignForeground(base, zone, rgba, background, known, width, height, age, working, tight, soft) {
  const moved = smooth(22, 105, age);
  const useBackground = !globalChange(rgba, background, known, zone);
  for (let i = 0; i < base.length; i++) {
    if (!zone[i] || !known[i] || !useBackground) {
      working[i] = base[i];
      continue;
    }
    const delta = distance(rgba, background, i);
    const departed = (1 - smooth(8, 22, delta)) * moved;
    const arrived = smooth(23, 53, delta);
    working[i] = Math.round(Math.max(base[i] * (1 - departed), arrived * 255));
  }

  // Remove isolated motion pixels, then feather the smoke mask by one sample pixel.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const left = x ? working[i - 1] : 0;
      const right = x + 1 < width ? working[i + 1] : 0;
      const above = y ? working[i - width] : 0;
      const below = y + 1 < height ? working[i + width] : 0;
      const support = (left + right + above + below) * .25;
      const core = working[i] * (.32 + .68 * smooth(20, 120, support));
      tight[i] = Math.round(core);
      soft[i] = Math.round(Math.max(core, support * .69));
    }
  }
}

function projectMasks(tracks, width, height, now, base, blocked, zone) {
  base.fill(0);
  blocked.fill(0);
  zone.fill(0);
  let visible = false;
  for (const { frame, seen, missing } of tracks) {
    const sx = width / frame.sourceWidth;
    const sy = height / frame.sourceHeight;
    const x0 = Math.max(0, Math.floor(frame.x * sx));
    const y0 = Math.max(0, Math.floor(frame.y * sy));
    const x1 = Math.min(width, Math.ceil((frame.x + frame.w) * sx));
    const y1 = Math.min(height, Math.ceil((frame.y + frame.h) * sy));
    const grace = missing ? 1 - smooth(85, 205, now - seen) : 1;
    visible ||= grace > 0;
    for (let y = y0; y < y1; y++) {
      const row = Math.min(frame.h - 1, Math.max(0, Math.floor((y + .5) / sy - frame.y))) * frame.w;
      for (let x = x0; x < x1; x++) {
        const col = Math.min(frame.w - 1, Math.max(0, Math.floor((x + .5) / sx - frame.x)));
        const value = frame.pixels[row + col];
        const i = y * width + x;
        blocked[i] = Math.max(blocked[i], value);
        base[i] = Math.max(base[i], Math.round(value * grace));
      }
    }
    if (grace <= 0) continue;
    const padX = Math.ceil(width * .075);
    const padY = Math.ceil(height * .085);
    for (let y = Math.max(0, y0 - padY); y < Math.min(height, y1 + padY); y++) {
      zone.fill(1, y * width + Math.max(0, x0 - padX), y * width + Math.min(width, x1 + padX));
    }
  }
  return visible;
}

export class LiveForeground {
  constructor() {
    this.capture = surface(true);
    this.tight = surface();
    this.soft = surface();
    this.width = this.height = 0;
    this.reset();
  }

  reset() {
    this.available = false;
    this.sampledAt = -Infinity;
    this.known?.fill(0);
    this.background?.fill(0);
    this.capture.ctx.clearRect(0, 0, this.width, this.height);
  }

  resize(sourceWidth, sourceHeight) {
    const scale = 176 / Math.max(sourceWidth, sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    for (const { canvas } of [this.capture, this.tight, this.soft]) {
      canvas.width = width;
      canvas.height = height;
    }
    const area = width * height;
    this.background = new Uint8Array(area * 3);
    this.known = new Uint8Array(area);
    this.base = new Uint8Array(area);
    this.blocked = new Uint8Array(area);
    this.zone = new Uint8Array(area);
    this.working = new Uint8Array(area);
    this.tightAlpha = new Uint8Array(area);
    this.softAlpha = new Uint8Array(area);
    this.tightPlate = this.tight.ctx.createImageData(width, height);
    this.softPlate = this.soft.ctx.createImageData(width, height);
  }

  pixels(source, mirror) {
    const { ctx } = this.capture;
    ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? this.width : 0, 0);
    ctx.drawImage(source, 0, 0, this.width, this.height);
    ctx.resetTransform();
    return ctx.getImageData(0, 0, this.width, this.height).data;
  }

  sample(video, mirror) {
    this.resize(video.videoWidth, video.videoHeight);
    return this.pixels(video, mirror);
  }

  observe(rgba, tracks, sampledAt, now) {
    const { width, height, base, blocked, zone, background, known } = this;
    this.available = projectMasks(tracks, width, height, now, base, blocked, zone);
    this.sampledAt = sampledAt;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        // Avoid learning mixed edge colors into the background model.
        if (blocked[i] > 12 || (x && blocked[i - 1] > 12) ||
          (x + 1 < width && blocked[i + 1] > 12) || (y && blocked[i - width] > 12) ||
          (y + 1 < height && blocked[i + width] > 12)) continue;
        const rate = known[i] ? .24 : 1;
        for (let c = 0; c < 3; c++) {
          const j = i * 3 + c;
          background[j] = Math.round(background[j] + (rgba[i * 4 + c] - background[j]) * rate);
        }
        known[i] = 1;
      }
    }
  }

  update(video, mirror, now) {
    const age = now - this.sampledAt;
    const opacity = 1 - smooth(370, 590, age);
    if (!this.available || opacity < .02) return 0;
    const rgba = this.pixels(video, mirror);
    alignForeground(this.base, this.zone, rgba, this.background, this.known, this.width, this.height,
      age, this.working, this.tightAlpha, this.softAlpha);
    for (let i = 0; i < this.base.length; i++) {
      this.tightPlate.data[i * 4 + 3] = this.tightAlpha[i];
      this.softPlate.data[i * 4 + 3] = this.softAlpha[i];
    }
    this.tight.ctx.putImageData(this.tightPlate, 0, 0);
    this.soft.ctx.putImageData(this.softPlate, 0, 0);
    return opacity;
  }
}
