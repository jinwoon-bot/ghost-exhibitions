import { createInkStamp, drawGrains, paintErosion, smooth } from './material.mjs?v=contour';
import { InkPlume } from './plume.mjs?v=contour';

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

export function layout(w, h, size) {
  const sw = size?.width || 16, sh = size?.height || 9;
  const scale = Math.min(w / sw, h / sh);
  return { x: (w - sw * scale) / 2, y: (h - sh * scale) / 2, width: sw * scale, height: sh * scale };
}

function project(frame, view) {
  const sx = view.width / frame.sourceWidth, sy = view.height / frame.sourceHeight;
  return { x: view.x + frame.x * sx, y: view.y + frame.y * sy, w: frame.w * sx, h: frame.h * sy };
}

export class ExhibitionPicture {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paper = image('assets/hanji-fibers.png');
    this.ink = image('assets/ink-bloom.png');
    this.atlas = image('../assets/paper/hanji.png');
    this.texture = {};
    this.current = new WeakMap();
    this.stamps = new Map();
    this.plume = new InkPlume();
    this.pieces = 0;
    for (const [name, img] of [['paper', this.paper], ['ink', this.ink]]) {
      img.decode().then(() => { this.texture[name] = sample(img); }).catch(() => {});
    }
  }

  resize(maxWidth) {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.25, maxWidth / innerWidth, maxWidth * .72 / innerHeight);
    const w = Math.max(1, Math.round(innerWidth * ratio));
    const h = Math.max(1, Math.round(innerHeight * ratio));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  buildMatte(frame) {
    const { w, h, pixels } = frame;
    const surface = document.createElement('canvas');
    surface.width = w;
    surface.height = h;
    const ctx = surface.getContext('2d');
    const matte = ctx.createImageData(w, h);
    for (let i = 0; i < pixels.length; i++) matte.data[i * 4 + 3] = pixels[i];
    ctx.putImageData(matte, 0, 0);
    return surface;
  }

  draw(history, now, profile, video) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    this.pieces = 0;
    if (!history.echoes.length) return;
    // Use the same centered, letterboxed projection as the unfiltered video underneath.
    const size = video?.videoWidth ? {width:video.videoWidth, height:video.videoHeight} : history.size;
    const view = layout(width, height, size);
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.width, view.height);
    ctx.clip();
    this.plume.begin(width, height, profile.plumeScale, history.echoes.length, view);
    const visible = [];
    for (const echo of history.echoes) {
      if (!this.stamps.has(echo.id)) {
        const stamp = createInkStamp(echo.snapshot, this.texture, echo.seed, profile.grains, echo.drift, echo.lift);
        this.stamps.set(echo.id, stamp);
        echo.dispose = () => {
          stamp.surface.width = stamp.surface.height = 0;
          this.stamps.delete(echo.id);
          this.plume.release(echo.id);
        };
      }
      const stamp = this.stamps.get(echo.id);
      const age = (now - echo.born) / (echo.until - echo.born);
      const progress = smooth(.075, .74, age) ** (1.27 - echo.strength * .27);
      const frame = echo.snapshot;
      const drifting = progress + smooth(.68, 1, age) * .57;
      const box = project(frame, view);
      this.plume.draw(echo, stamp, box, drifting);
      visible.push({echo, stamp, progress, drifting, box});
    }
    if (this.plume.enabled) ctx.drawImage(this.plume.canvas, 0, 0, width, height);
    for (const {echo, stamp, progress, drifting, box} of visible) {
      paintErosion(stamp, echo.snapshot, progress, echo.strength);
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.scale(box.w / echo.snapshot.w, box.h / echo.snapshot.h);
      ctx.drawImage(stamp.surface, 0, 0);
      const budget = Math.max(0, profile.totalGrains - this.pieces);
      this.pieces += drawGrains(ctx, this.atlas, stamp.grains, drifting, echo.strength, budget);
      ctx.restore();
    }
    ctx.restore();
    if (!video) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (const track of history.tracks) {
      if (track.missing) continue;
      const alpha = 1 - smooth(130, 310, now - track.seen);
      if (alpha < .02) continue;
      if (!this.current.has(track.frame)) this.current.set(track.frame, this.buildMatte(track.frame));
      const box = project(track.frame, view);
      ctx.globalAlpha = alpha;
      ctx.drawImage(this.current.get(track.frame), box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  }

  dispose() {
    for (const stamp of this.stamps.values()) stamp.surface.width = stamp.surface.height = 0;
    this.stamps.clear();
    this.plume.dispose();
    this.current = new WeakMap();
  }
}
