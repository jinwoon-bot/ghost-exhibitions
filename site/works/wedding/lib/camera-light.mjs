const sampleWidth = 32;
const sampleHeight = 24;
const sampleCount = sampleWidth * sampleHeight;

// Keep a separate, same-size input for the model so the camera display and
// the coordinates returned by the model retain the original framing.
export class CameraLight {
  constructor() {
    this.meter = new OffscreenCanvas(sampleWidth, sampleHeight);
    this.meterContext = this.meter.getContext("2d", { willReadFrequently: true });
    this.histogram = new Uint16Array(256);
    this.lifted = new OffscreenCanvas(1, 1);
    this.liftContext = this.lifted.getContext("2d");
  }

  prepare(bitmap, enabled = true) {
    const context = this.meterContext;
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const histogram = this.histogram;
    histogram.fill(0);
    let total = 0;
    for (let p = 0; p < pixels.length; p += 4) {
      const luma = Math.round(pixels[p] * .2126 + pixels[p + 1] * .7152 + pixels[p + 2] * .0722);
      histogram[luma]++;
      total += luma;
    }
    let cumulative = 0, median = 0, upper = 0;
    for (; upper < 255; upper++) {
      cumulative += histogram[upper];
      if (cumulative < sampleCount * .5) median = upper + 1;
      if (cumulative >= sampleCount * .85) break;
    }

    const brightness = total / sampleCount;
    const unusable = brightness < 5 && upper < 7;
    const reference = Math.max(median, upper * .65);
    // The highlights and shadow floor keep a dark border or a few noisy
    // pixels from causing extreme gain.
    const gain = enabled && !unusable && reference < 72
      ? Math.min(3.4, 86 / Math.max(18, reference), 205 / Math.max(1, upper))
      : 1;
    if (gain < 1.12) return { input: bitmap, brightness, unusable };

    if (this.lifted.width !== bitmap.width || this.lifted.height !== bitmap.height) {
      this.lifted.width = bitmap.width;
      this.lifted.height = bitmap.height;
    }
    this.liftContext.filter = `brightness(${gain})`;
    this.liftContext.drawImage(bitmap, 0, 0);
    return { input: this.lifted, brightness, unusable };
  }
}
