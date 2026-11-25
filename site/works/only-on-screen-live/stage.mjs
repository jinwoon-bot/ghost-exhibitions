import { containGeometry, coverGeometry } from "../only-on-screen/src/tracking.mjs";
import { ShadowHold } from "./shadow-hold.mjs?v=floor-rehearsal";

const make = () => new OffscreenCanvas(1, 1);
const size = (canvas, w, h) => {
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
};
const shadows = [
  { lean: -.19, wide: 1.04, tall: 1.03, opacity: .88, soft: false },
  { lean: .21, wide: .98, tall: 1.11, opacity: .77, soft: false },
  { lean: -.34, wide: .88, tall: 1.18, opacity: .55, soft: true },
  { lean: .34, wide: 1.13, tall: .98, opacity: .43, soft: true },
];
const colors = {
  ink: { dark: "#080a0c", mid: "#192027", veil: "rgba(121,139,143,.33)" },
  paper: { dark: "#12100e", mid: "#28231e", veil: "rgba(153,135,111,.35)" },
  rust: { dark: "#130d0e", mid: "#301c1e", veil: "rgba(147,101,103,.32)" },
};

class Subject {
  constructor() {
    this.alpha = make();
    this.core = make();
    this.color = make();
    this.ink = make();
    this.smoke = make();
    this.maskCtx = this.alpha.getContext("2d");
    this.coreCtx = this.core.getContext("2d");
    this.colorCtx = this.color.getContext("2d");
    this.inkCtx = this.ink.getContext("2d");
    this.smokeCtx = this.smoke.getContext("2d");
  }
  clear() {
    if (!this.pixels) return;
    this.pixels = this.corePixels = null;
    for (const canvas of [this.alpha, this.core, this.color, this.ink, this.smoke]) size(canvas, 1, 1);
  }

  update(person, frame, packet, paper, palette, contrast, extra) {
    const { x, y, w, h, alpha } = person;
    for (const canvas of [this.alpha, this.core, this.color, this.ink]) size(canvas, w, h);
    if (!this.pixels || this.pixels.width !== w || this.pixels.height !== h) {
      this.pixels = this.maskCtx.createImageData(w, h);
      this.corePixels = this.coreCtx.createImageData(w, h);
    }
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const i = row * w + col;
        const value = alpha[i];
        this.pixels.data[i * 4 + 3] = value;
        // Keep the silhouette alpha. Suppress camera-background color near the edge.
        const across = col > 0 && col + 1 < w ? Math.min(alpha[i - 1], alpha[i + 1]) : 0;
        const along = row > 0 && row + 1 < h ? Math.min(alpha[i - w], alpha[i + w]) : 0;
        const core = col > 1 && col < w - 2 && row > 1 && row < h - 2
          ? Math.min(alpha[i - 2], alpha[i + 2], alpha[i - 2 * w], alpha[i + 2 * w]) : 0;
        // Keep some lighting along thin fingers and strands, without exposing the source background.
        const near = Math.max(core, .48 * Math.max(across, along));
        this.corePixels.data[i * 4 + 3] = value ? 22 + Math.round(Math.max(0, Math.min(value, near) - 90) * 233 / 165) : 0;
      }
    }
    this.maskCtx.putImageData(this.pixels, 0, 0);
    this.coreCtx.putImageData(this.corePixels, 0, 0);
    const rx = frame.width / packet.width, ry = frame.height / packet.height;
    const c = this.colorCtx;
    c.clearRect(0, 0, w, h);
    c.filter = `grayscale(1) contrast(${contrast}) brightness(1.09)`;
    c.drawImage(frame, x * rx, y * ry, w * rx, h * ry, 0, 0, w, h);
    c.filter = "none";
    c.globalCompositeOperation = "destination-in";
    c.drawImage(this.core, 0, 0);
    c.globalCompositeOperation = "destination-over";
    c.fillStyle = "#202825";
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "source-atop";
    const lift = c.createLinearGradient(0, 0, w * .22, h);
    lift.addColorStop(0, palette.veil);
    lift.addColorStop(1, "rgba(72,77,74,.19)");
    c.fillStyle = lift;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(this.alpha, 0, 0);
    c.globalCompositeOperation = "source-over";

    const ink = this.inkCtx;
    ink.clearRect(0, 0, w, h);
    const wash = ink.createLinearGradient(0, 0, w * .6, h);
    wash.addColorStop(0, palette.mid);
    wash.addColorStop(.57, palette.dark);
    wash.addColorStop(1, "#050607");
    ink.fillStyle = wash;
    ink.fillRect(0, 0, w, h);
    if (paper.complete && paper.naturalWidth) {
      ink.globalAlpha = .28;
      ink.globalCompositeOperation = "screen";
      ink.drawImage(paper, 0, 0, w, h);
      ink.globalAlpha = 1;
    }
    ink.globalCompositeOperation = "destination-in";
    ink.drawImage(this.alpha, 0, 0);
    ink.globalCompositeOperation = "source-over";
    if (extra) {
      size(this.smoke, w, h);
      const smoke = this.smokeCtx;
      smoke.clearRect(0, 0, w, h);
      smoke.filter = "blur(1.5px)";
      smoke.drawImage(this.ink, 0, 0);
      smoke.filter = "none";
    }
  }
}

export class Stage {
  constructor(output, paper) {
    this.output = output;
    this.ctx = output.getContext("2d", { alpha: false });
    this.paper = paper;
    this.frame = make();
    this.wall = make();
    this.frameCtx = this.frame.getContext("2d");
    this.subjects = [new Subject(), new Subject(), new Subject()];
    this.active = [];
    this.delay = new ShadowHold();
  }
  update(packet, frame, config, preset) {
    if (this.packet && (this.packet.width !== packet.width || this.packet.height !== packet.height)) this.delay.reset();
    this.packet = packet;
    size(this.frame, frame.width, frame.height);
    this.frameCtx.drawImage(frame, 0, 0);
    this.rebuild(config, preset);
    this.delay.update(this.active, performance.now(), (person, previous) => {
      const source = this.subjects[this.active.indexOf(person)].ink;
      const ink = previous?.ink ?? make();
      size(ink, source.width, source.height);
      const ctx = ink.getContext("2d");
      ctx.clearRect(0, 0, source.width, source.height);
      ctx.drawImage(source, 0, 0);
      return { ink, x: person.x, y: person.y, w: person.w, h: person.h };
    });
  }
  rebuild(config, preset) {
    this.active = (this.packet?.people ?? []).slice(0, preset.people);
    const palette = colors[config.tone] || colors.ink;
    for (const [i, person] of this.active.entries()) {
      this.subjects[i].update(person, this.frame, this.packet, this.paper, palette, config.contrast, config.shadows > 2 && preset.output >= 960);
    }
    for (let i = this.active.length; i < this.subjects.length; i++) this.subjects[i].clear();
  }
  clear() {
    if (this.packet) {
      this.frame.width = this.frame.height = 1;
      for (const subject of this.subjects) subject.clear();
    }
    this.packet = null;
    this.active = [];
    this.delay.reset();
  }
  prepareWall(width, height) {
    const hasTexture = this.paper.complete && this.paper.naturalWidth;
    if (this.wall.width === width && this.wall.height === height && this.wallTexture === hasTexture) return;
    size(this.wall, width, height);
    this.wallTexture = hasTexture;
    const ctx = this.wall.getContext("2d");
    ctx.fillStyle = "#101514";
    ctx.fillRect(0, 0, width, height);
    if (hasTexture) {
      const p = coverGeometry(this.paper.naturalWidth, this.paper.naturalHeight, width, height);
      ctx.drawImage(this.paper, p.x, p.y, p.w, p.h);
    }
    const spill = ctx.createRadialGradient(width * .51, height * .46, height * .09, width * .51, height * .46, width * .58);
    spill.addColorStop(0, "rgba(135,134,124,.28)");
    spill.addColorStop(.58, "rgba(42,44,42,.09)");
    spill.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = spill;
    ctx.fillRect(0, 0, width, height);
  }
  preview(video, preset, mirror) {
    const width = preset.output, height = Math.round(width * 9 / 16);
    size(this.output, width, height);
    const ctx = this.ctx;
    const fit = containGeometry(video.videoWidth, video.videoHeight, width, height);
    ctx.fillStyle = "#101514";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    if (mirror) { ctx.translate(width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, fit.x, fit.y, fit.w, fit.h);
    ctx.restore();
    ctx.strokeStyle = "rgba(181, 216, 200, .75)";
    ctx.setLineDash([9, 7]);
    ctx.strokeRect(fit.x + fit.w * .06, fit.y + fit.h * .06, fit.w * .88, fit.h * .88);
    ctx.setLineDash([]);
  }
  paint(config, preset, opacity = 1, now = performance.now()) {
    const width = preset.output;
    const height = Math.round(width * 9 / 16);
    size(this.output, width, height);
    this.prepareWall(width, height);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.wall, 0, 0);
    if (!this.packet || opacity <= 0) return;
    const { width: maskW, height: maskH } = this.packet;
    const fit = containGeometry(maskW, maskH, width, height);
    ctx.save();
    if (config.mirror) { ctx.translate(width, 0); ctx.scale(-1, 1); }
    const scaleX = fit.w / maskW, scaleY = fit.h / maskH;
    this.delay.lastPaint = now;
    for (const [index, person] of this.active.entries()) {
      const subject = this.subjects[index];
      const x = fit.x + person.x * scaleX, y = fit.y + person.y * scaleY;
      const w = person.w * scaleX, h = person.h * scaleY;
      const anchorX = fit.x + person.anchor.x * fit.w, anchorY = fit.y + person.anchor.y * fit.h;
      const delayed = this.delay.get(person.id, now);
      for (let i = config.shadows - 1; i >= 0; i--) {
        const layer = shadows[i];
        ctx.save();
        ctx.translate(anchorX, anchorY);
        ctx.transform(1 + (layer.wide - 1) * config.spread, 0, layer.lean * config.spread,
          1 + (layer.tall - 1) * config.spread, 0, 0);
        const weight= i === Math.min(1,config.shadows-1) ? (delayed?.weight ?? 0) : 0;
        const alpha = opacity * layer.opacity * config.strength;
        if (weight) {
          const pose = delayed.pose;
          const lean = delayed.lean;
          ctx.save();
          ctx.transform(1, 0, lean, 1, 0, 0);
          ctx.globalAlpha = alpha * weight;
          ctx.drawImage(pose.ink, fit.x + pose.x * scaleX - anchorX, fit.y + pose.y * scaleY - anchorY,
            pose.w * scaleX, pose.h * scaleY);
          ctx.restore();
        }
        ctx.globalAlpha = alpha * (1-weight);
        ctx.drawImage(layer.soft && preset.output >= 960 && config.shadows > 2 ? subject.smoke : subject.ink,
          x - anchorX, y - anchorY, w, h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = opacity;
    for (const [index, person] of this.active.entries()) {
      ctx.drawImage(this.subjects[index].color, fit.x + person.x * scaleX, fit.y + person.y * scaleY,
        person.w * scaleX, person.h * scaleY);
    }
    ctx.restore();
  }
}
