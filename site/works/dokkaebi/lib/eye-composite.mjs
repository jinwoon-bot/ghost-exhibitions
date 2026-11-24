const smooth = t => t * t * (3 - 2 * t);

// Move the pupil at unit scale and ease the nearby stone back to its source.
// The outer stone stays fixed, including at the ends of a gaze.
export function sourceX(x, left, right, center, radius, shift) {
  if (right - left < 3) return x;
  const near = Math.max(left, center - radius);
  const far = Math.min(right, center + radius);
  const margin = 1.1;
  if (far <= near || near - left <= margin || right - far <= margin) return x;
  shift = shift > 0
    ? Math.min(shift, right - far - margin, (near - left) * 1.8)
    : -Math.min(-shift, near - left - margin, (right - far) * 1.8);
  if (shift === 0) return x;
  const first = near + shift;
  const last = far + shift;
  if (x < first) return x - shift * smooth((x - left) / (first - left));
  if (x > last) return x - shift * smooth((right - x) / (right - last));
  return x - shift;
}

export class EyeComposite {
  constructor(canvas, photo, spec, design) {
    const [x, y, w, h] = spec.bounds;
    const horizontal = photo.naturalWidth / design.width;
    const vertical = photo.naturalHeight / design.height;
    const pitch = Math.min(spec.rasterScale ?? 2, horizontal, vertical);
    this.width = canvas.width = Math.round(w * pitch);
    this.height = canvas.height = Math.round(h * pitch);
    this.pitch = this.width / w;
    const rowPitch = this.height / h;
    this.center = (spec.centerX - x) * this.pitch;
    this.radius = spec.irisRadius * this.pitch + 2;
    this.centerY = (spec.centerY - y) * rowPitch;
    canvas.style.left = `${x / design.width * 100}%`;
    canvas.style.top = `${y / design.height * 100}%`;
    canvas.style.width = `${w / design.width * 100}%`;
    canvas.style.height = `${h / design.height * 100}%`;
    this.ctx = canvas.getContext("2d");
    const scratch = document.createElement("canvas");
    scratch.width = this.width;
    scratch.height = this.height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(photo, x * horizontal, y * vertical, w * horizontal, h * vertical,
      0, 0, this.width, this.height);
    this.texture = ctx.getImageData(0, 0, this.width, this.height).data;
    this.frame = ctx.createImageData(this.width, this.height);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.setTransform(this.pitch, 0, 0, rowPitch, -x * this.pitch, -y * rowPitch);
    ctx.fillStyle = "#fff";
    ctx.filter = `blur(${.4 * this.pitch}px)`;
    ctx.fill(new Path2D(spec.aperture));
    this.mask = ctx.getImageData(0, 0, this.width, this.height).data;
    this.rows = Array.from({ length: this.height }, (_, row) => {
      let left = 0;
      let right = this.width - 1;
      const alpha = col => this.mask[(row * this.width + col) * 4 + 3];
      while (left < right && alpha(left) < 32) left++;
      while (right > left && alpha(right) < 32) right--;
      return [left, right];
    });
  }

  draw(shift) {
    const { width, height, mask, texture, rows, frame, pitch } = this;
    if (Math.abs(shift) < .035) {
      this.ctx.clearRect(0, 0, width, height);
      return;
    }
    const pixels = frame.data;
    pixels.fill(0);
    for (let row = 0; row < height; row++) {
      const distance = Math.abs(row - this.centerY);
      const taper = Math.min(1, Math.max(0, (distance - this.radius) / 11));
      if (taper === 1) continue;
      const rowShift = shift * pitch * (1 - smooth(taper));
      const radius = Math.sqrt(Math.max(3, this.radius ** 2 - distance ** 2));
      const support = radius + 25 * pitch + Math.abs(rowShift) * .66;
      const left = Math.max(rows[row][0], Math.floor(this.center - support));
      const right = Math.min(rows[row][1], Math.ceil(this.center + support));
      const start = row * width;
      for (let col = left; col <= right; col++) {
        const offset = (start + col) * 4;
        const opacity = mask[offset + 3];
        const sample = sourceX(col, left, right, this.center, radius, rowShift);
        const a = Math.floor(sample);
        const b = Math.min(right, a + 1);
        const fraction = sample - a;
        for (let channel = 0; channel < 3; channel++) {
          const base = (start + a) * 4 + channel;
          const next = (start + b) * 4 + channel;
          pixels[offset + channel] = texture[base] * (1 - fraction) + texture[next] * fraction;
        }
        pixels[offset + 3] = opacity * Math.min(1, Math.abs(sample - col) * 2);
      }
    }
    this.ctx.putImageData(frame, 0, 0);
  }
}
