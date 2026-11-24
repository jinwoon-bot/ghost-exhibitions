export const minimumRange = .025;
export const rangeLimit = { farMin: .03, farMax: .48, nearMin: .055, nearMax: .80 };

export class DistanceReadings {
  constructor() { this.clear(); }

  clear() { this.samples = []; }

  feed(now, kind, score) {
    if (!Number.isFinite(score)) return;
    if (this.samples.at(-1)?.kind !== kind) this.clear();
    this.samples.push({ now, kind, score });
    this.samples = this.samples.filter(sample => now - sample.now <= 900).slice(-9);
  }

  read(now) {
    const last = this.samples.at(-1);
    if (!last || now - last.now > 430) return null;
    const recent = this.samples.filter(sample => now - sample.now <= 900);
    const scores = recent.map(sample => sample.score).sort((a, b) => a - b);
    const mid = Math.floor(scores.length / 2);
    const score = scores.length % 2 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
    const stable = recent.length >= 3 && last.now - recent[0].now >= 180 &&
      scores.at(-1) - scores[0] <= Math.max(.018, score * .18);
    return { kind: last.kind, score, stable };
  }
}
