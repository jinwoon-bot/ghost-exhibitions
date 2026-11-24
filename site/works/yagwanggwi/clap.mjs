const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rms = (power, count) => Math.sqrt(power / Math.max(1, count));

export class ClapDetector {
  constructor(rate, result) {
    this.rate = rate;
    this.result = result;
    this.sensitivity = .55;
    this.interval = 290;
    this.low = this.mid = 0;
    this.lowWeight = 1 - Math.exp(-2 * Math.PI * 320 / rate);
    this.midWeight = 1 - Math.exp(-2 * Math.PI * 1750 / rate);
    this.window = Math.round(rate * .008);
    this.samples = 0;
    this.previous = .002;
    this.calibrate();
    this.clearWindow();
  }

  configure(sensitivity, interval) {
    this.sensitivity = clamp(sensitivity, .15, .95);
    this.interval = clamp(interval, 150, 850);
  }

  calibrate() {
    this.floor = .0035;
    this.brightFloor = .0015;
    this.calibratingUntil = this.samples / this.rate * 1000 + 1150;
    this.candidate = null;
    this.lastClap = -Infinity;
  }

  clearWindow() {
    this.power = this.highPower = this.lowPower = this.peak = this.count = 0;
  }

  push(input) {
    for (const value of input) {
      this.low += this.lowWeight * (value - this.low);
      this.mid += this.midWeight * (value - this.mid);
      this.power += value * value;
      this.highPower += (value - this.mid) ** 2;
      this.lowPower += this.low ** 2;
      this.peak = Math.max(this.peak, Math.abs(value));
      this.samples++;
      if (++this.count === this.window) {
        this.analyze(rms(this.power, this.count), rms(this.highPower, this.count), rms(this.lowPower, this.count));
        this.clearWindow();
      }
    }
  }

  analyze(level, bright, low) {
    const now = this.samples / this.rate * 1000;
    const ratio = bright / Math.max(.001, level);
    const calibrating = now < this.calibratingUntil;
    const minimum = .023 - this.sensitivity * .015;
    const threshold = Math.max(minimum, this.floor * (4.7 - this.sensitivity * 2));
    const onset = level > Math.max(threshold, this.previous * 2.18) &&
      bright > Math.max(this.brightFloor * 2.65, .0038) && ratio > .32 && this.peak > level * 1.72;

    let clap = false;
    if (!calibrating && now - this.lastClap >= this.interval) {
      if (!this.candidate && onset) this.candidate = { now, level, ratio, bass: low / level };
      const hit = this.candidate;
      if (hit) {
        hit.level = Math.max(hit.level, level);
        hit.ratio = Math.max(hit.ratio, ratio);
        const elapsed = now - hit.now;
        if (elapsed >= 8 && level < hit.level * .48 && bright < hit.level * .30) {
          clap = hit.ratio > .37 && hit.bass < .66;
          if (clap) this.lastClap = now;
          this.candidate = null;
        } else if (elapsed > 56) this.candidate = null;
      }
    }

    if (!this.candidate && !clap) {
      const weight = calibrating ? .055 : .008;
      this.floor = Math.max(.0011, this.floor + (Math.min(level, this.floor * 3 + .007) - this.floor) * weight);
      this.brightFloor = Math.max(.0006, this.brightFloor + (Math.min(bright, this.brightFloor * 3 + .003) - this.brightFloor) * weight);
    }
    this.previous = level;
    if (clap || (Math.round(this.samples / this.window) % 8 === 0)) {
      this.result({ clap, level, floor: this.floor, calibrating });
    }
  }
}
