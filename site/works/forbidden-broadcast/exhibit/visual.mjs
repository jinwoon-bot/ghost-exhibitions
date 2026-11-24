import { clamp } from './episode.mjs?v=signal-cut';

export function loadImage(source) {
  const image = new Image();
  image.src = source;
  return image.decode().then(() => image);
}

export function drawCover(ctx, image, width, height) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.max(width / iw, height / ih);
  const sw = width / scale, sh = height / scale;
  ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, width, height);
}

export class NewsPicture {
  constructor(canvas, plate) {
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.plate = new OffscreenCanvas(this.width, this.height);
    const grade = this.plate.getContext('2d');
    grade.filter = 'saturate(.82) contrast(1.045)';
    grade.drawImage(plate, 0, 0, this.width, this.height);
    this.mouth = new OffscreenCanvas(88, 51);
    this.mouthCtx = this.mouth.getContext('2d');
  }

  draw(time, voice, stress, reduced) {
    const { ctx, width: w, height: h } = this;
    const shift = reduced ? 0 : Math.sin(time * .72) * .68;
    const stretch = 1.003 + .0018 * Math.sin(time * 1.06);
    ctx.save();
    ctx.translate(w / 2 + shift, h / 2);
    ctx.scale(stretch, stretch);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(this.plate, 0, 0, w, h);

    if (!reduced && voice > .03) this.lips(clamp(voice) * (1 - stress * .38), time);
    const blinkTime = (time + .14 * Math.sin(time * .37)) % 5.31;
    if (!reduced && blinkTime > 4.98) {
      const close = Math.sin(Math.PI * (blinkTime - 4.98) / .33) ** 3 * (1 - stress * .80);
      this.blink(.460, .262, close);
      this.blink(.529, .258, close);
    }
    if (stress > .17) {
      ctx.fillStyle = 'rgba(19,29,19,' + (stress ** 2 * .28).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  crop(ctx, x, y, sw, sh, dx, dy, dw, dh) {
    ctx.drawImage(this.plate, x, y, sw, sh, dx, dy, dw, dh);
  }

  lips(amount, time) {
    const out = this.ctx, m = this.mouthCtx;
    const cx = this.width * .498, cy = this.height * .3586;
    const x = cx - 44, y = cy - 25.5, open = 2.4 * amount;
    m.clearRect(0, 0, 88, 51);
    m.save();
    this.crop(m, x, y, 88, 51, 0, 0, 88, 51);
    m.fillStyle = 'rgba(48,21,24,.78)';
    m.beginPath();
    m.ellipse(44, 26, 17 + 2 * Math.sin(time * 23) * amount, .28 + open * .77, .015, 0, Math.PI * 2);
    m.fill();
    m.beginPath();
    m.ellipse(44, 32 + open, 27, 11, 0, 0, Math.PI * 2);
    m.clip();
    this.crop(m, x, cy + .9, 88, 23, 0, 26.4 + open, 88, 23);
    m.restore();
    m.globalCompositeOperation = 'destination-in';
    const mask = m.createRadialGradient(44, 26, 12, 44, 26, 39);
    mask.addColorStop(0, '#fff');
    mask.addColorStop(1, '#fff0');
    m.fillStyle = mask;
    m.fillRect(0, 0, 88, 51);
    m.globalCompositeOperation = 'source-over';
    out.drawImage(this.mouth, x, y);
  }

  blink(x, y, close) {
    if (close < .1) return;
    const { ctx, width, height } = this;
    ctx.save();
    ctx.globalAlpha = close * .88;
    ctx.fillStyle = '#9c7768';
    ctx.beginPath();
    ctx.ellipse(width * x, height * y, 11.4, 3.3 * close, -.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class SignalPicture {
  constructor(canvas) {
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.pixels = this.ctx.createImageData(this.width, this.height);
    this.tick = 0;
  }

  draw(now, intensity, reveal, reduced, burst = 0) {
    if (now - this.tick < (reduced ? 230 : burst > .04 ? 39 : 88)) return;
    this.tick = now;
    const { width, height, ctx, pixels } = this;
    const amount = 6 + intensity ** 1.9 * (reduced ? 13 : 35) + burst * (reduced ? 37 : 171);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = Math.random();
      pixels.data[i] = 181;
      pixels.data[i + 1] = 187;
      pixels.data[i + 2] = 173;
      pixels.data[i + 3] = value > .44 ? (value - .44) * amount : 0;
    }
    ctx.putImageData(pixels, 0, 0);
    if (burst > .015 && !reduced) {
      const bands = [height * .24, height * .55, height * .79];
      for (const [i, base] of bands.entries()) {
        const y = Math.floor(base + (Math.random() - .5) * 14);
        const bandHeight = 4 + i * 3;
        const glow = ctx.createLinearGradient(0, y, 0, y + bandHeight);
        glow.addColorStop(0, 'rgba(222,226,207,0)');
        glow.addColorStop(.20, 'rgba(222,226,207,' + (burst * .72) + ')');
        glow.addColorStop(1, 'rgba(222,226,207,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, y, width, bandHeight);
        ctx.fillStyle = 'rgba(222,226,207,' + (burst * .22) + ')';
        ctx.fillRect(0, y + bandHeight + 2, width * (.45 + Math.random() * .55), 1);
      }
    }
    if (intensity > .29 && !reduced) {
      const row = (now / (30 - intensity * 11)) % height;
      const gradient = ctx.createLinearGradient(0, row, 0, row + 13);
      gradient.addColorStop(0, '#a1ac9900');
      gradient.addColorStop(.21, 'rgba(176,182,152,' + (intensity * .19) + ')');
      gradient.addColorStop(1, '#a1ac9900');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, row, width, 13);
      ctx.fillStyle = 'rgba(195,201,180,' + (reveal * .19) + ')';
      ctx.fillRect(0, 128, width, 1);
    }
  }
}

export function webcamPortrait(video, box, mirror, luma) {
  const frame = new OffscreenCanvas(360, 450);
  const ctx = frame.getContext('2d', { alpha: false });
  const { videoWidth: w, videoHeight: h } = video;
  const ih = Math.min(h, Math.max(box.h * h * 1.63, box.w * w * 1.74 / .8));
  const iw = ih * .8;
  const x = clamp(box.x * w - iw * .5, 0, w - iw);
  const y = clamp(box.y * h - ih * .48, 0, h - ih);
  if (mirror) { ctx.translate(frame.width, 0); ctx.scale(-1, 1); }
  const lift = Math.min(1.76, Math.max(1, 87 / Math.max(luma, 28)));
  ctx.filter = 'brightness(' + lift + ') contrast(1.08) saturate(.72)';
  ctx.drawImage(video, x, y, iw, ih, 0, 0, frame.width, frame.height);
  return frame;
}

export function clearPhoto(canvas) {
  canvas.width = canvas.width;
}
