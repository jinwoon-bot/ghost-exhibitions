import { createInkStamp, drawGrains, paintErosion, smooth } from './material.mjs';
import { InkPlume } from './plume.mjs';

function image(url) {
  const img = new Image();
  img.src = url;
  return img;
}

function sample(image) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 256, 256);
  return ctx.getImageData(0, 0, 256, 256).data;
}

function cover(ctx, img, w, h) {
  if (!img.complete || !img.naturalWidth) return;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
}

export function layout(w, h, size) {
  const sw = size?.width || 16, sh = size?.height || 9;
  const scale = Math.min(w / sw, h / sh);
  return { x: (w - sw * scale) / 2, y: (h - sh * scale) / 2, scale };
}

export class ExhibitionPicture {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false});
    this.paper = image('assets/hanji-fibers.png');
    this.ink = image('assets/ink-bloom.png');
    this.atlas = image('../assets/paper/hanji.png');
    this.background = document.createElement('canvas');
    this.texture = {};
    this.current = new WeakMap();
    this.stamps = new Map();
    this.plume = new InkPlume();
    this.dirty = true;
    this.pieces = 0;
    for (const [name, img] of [['paper', this.paper], ['ink', this.ink]]) {
      img.decode().then(() => { this.texture[name] = sample(img); this.dirty = true; }).catch(() => {});
    }
  }

  resize(maxWidth) {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25, maxWidth / innerWidth, maxWidth * .72 / innerHeight);
    const w = Math.max(1, Math.round(innerWidth * ratio));
    const h = Math.max(1, Math.round(innerHeight * ratio));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.background.width = w;
    this.background.height = h;
    this.dirty = true;
  }

  paintBackground() {
    const { width: w, height: h } = this.background;
    const ctx = this.background.getContext('2d');
    ctx.fillStyle = '#070a13';
    ctx.fillRect(0, 0, w, h);
    const lamp = ctx.createRadialGradient(w * .51, h * .57, h * .09, w * .51, h * .57, Math.max(w * .57, h * .88));
    lamp.addColorStop(0, '#c8cad5');
    lamp.addColorStop(.32, '#aeb9d2');
    lamp.addColorStop(.55, '#65708b');
    lamp.addColorStop(.78, '#252b41');
    lamp.addColorStop(1, '#080a12');
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = .21;
    cover(ctx, this.paper, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = .09;
    cover(ctx, this.ink, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const hood = ctx.createLinearGradient(0, 0, 0, h);
    hood.addColorStop(0, '#060810df');
    hood.addColorStop(.28, '#07091220');
    hood.addColorStop(.65, '#12142b00');
    hood.addColorStop(.93, '#151b37a5');
    hood.addColorStop(1, '#080a14c8');
    ctx.fillStyle = hood;
    ctx.fillRect(0, 0, w, h);
    this.dirty = false;
  }

  buildLive(frame) {
    const { w, h, pixels, color } = frame;
    const surface = document.createElement('canvas');
    surface.width = w;
    surface.height = h;
    const ctx = surface.getContext('2d');
    const photo = ctx.createImageData(w, h);
    for (let i = 0; i < pixels.length; i++) {
      if (!pixels[i]) continue;
      const v = i * 4, j = i * 3;
      const r = color?.[j] ?? 105, g = color?.[j + 1] ?? 108, b = color?.[j + 2] ?? 112;
      const rim = smooth(18, 144, pixels[i]) * (1 - smooth(125, 253, pixels[i]));
      photo.data[v] = r * 1.07 + 12 + rim * 167;
      photo.data[v + 1] = g * 1.09 + 15 + rim * 189;
      photo.data[v + 2] = b * 1.15 + 22 + rim * 200;
      photo.data[v + 3] = pixels[i];
    }
    ctx.putImageData(photo, 0, 0);
    return surface;
  }

  place(ctx, frame) {
    const { x, y, scale } = layout(this.canvas.width, this.canvas.height, {width: frame.sourceWidth, height: frame.sourceHeight});
    ctx.translate(x + frame.x * scale, y + frame.y * scale);
    ctx.scale(scale, scale);
  }

  draw(history, now, profile) {
    if (this.dirty) this.paintBackground();
    const ctx = this.ctx;
    ctx.drawImage(this.background, 0, 0);
    this.pieces = 0;
    this.plume.begin(this.canvas.width, this.canvas.height, profile.grains > 200 && history.echoes.length > 0);
    const visible = [];
    for (const echo of history.echoes) {
      if (!this.stamps.has(echo.id)) {
        const stamp = createInkStamp(echo.snapshot, this.texture, echo.seed, profile.grains, echo.drift);
        this.stamps.set(echo.id, stamp);
        echo.dispose = () => {
          stamp.surface.width = stamp.surface.height = 0;
          this.stamps.delete(echo.id);
          this.plume.release(echo.id);
        };
      }
      const stamp = this.stamps.get(echo.id);
      const age = (now - echo.born) / (echo.until - echo.born);
      const progress = smooth(.15, .86, age) ** (1.37 - echo.strength * .37);
      const frame = echo.snapshot;
      const drifting = progress + smooth(.76, 1, age) * .5;
      const pos = layout(this.canvas.width, this.canvas.height, {width:frame.sourceWidth,height:frame.sourceHeight});
      const box = { x:pos.x + frame.x * pos.scale, y:pos.y + frame.y * pos.scale, w:frame.w * pos.scale, h:frame.h * pos.scale };
      this.plume.draw(echo, stamp, box, drifting);
      visible.push({echo, stamp, progress, drifting});
    }
    if (this.plume.enabled) ctx.drawImage(this.plume.canvas, 0, 0);
    for (const {echo, stamp, progress, drifting} of visible) {
      paintErosion(stamp, echo.snapshot, progress);
      ctx.save();
      this.place(ctx, echo.snapshot);
      ctx.drawImage(stamp.surface, 0, 0);
      const budget = Math.max(0, profile.totalGrains - this.pieces);
      this.pieces += drawGrains(ctx, this.atlas, stamp.grains, drifting, echo.strength, echo.seed, budget);
      ctx.restore();
    }
    for (const track of history.tracks) {
      const alpha = 1 - smooth(200, 750, now - track.seen);
      if (alpha < .02) continue;
      if (!this.current.has(track.frame)) this.current.set(track.frame, this.buildLive(track.frame));
      ctx.save();
      this.place(ctx, track.frame);
      ctx.globalAlpha = alpha;
      const motionLight = smooth(.025, .30, history.activity);
      ctx.shadowColor = 'rgba(153,175,255,' + (.40 + motionLight * .46) + ')';
      ctx.shadowBlur = 7 + motionLight * 21;
      ctx.drawImage(this.current.get(track.frame), 0, 0);
      ctx.restore();
    }
  }

  dispose() {
    for (const stamp of this.stamps.values()) stamp.surface.width = stamp.surface.height = 0;
    this.stamps.clear();
    this.plume.dispose();
    this.current = new WeakMap();
  }
}
