export const clamp = (n, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
export function approach(current, target, seconds, timeConstant) {
  return current + (target - current) * (1 - Math.exp(-seconds / timeConstant));
}
export function smooth(lo, hi, n) {
  const x = clamp((n - lo) / (hi - lo));
  return x * x * (3 - 2 * x);
}

export const COPY = [
  { start: .35, step: .062, text: '접수 번호  04–017' },
  { start: 1.58, step: .057, text: '마지막 목격  방금 전' },
  { start: 3.0, step: .064, text: '확인 상태  응답 대기 중' },
  { start: 4.72, step: .084, text: '본인은 아직 실종 사실을 모릅니다.' },
];
export const READ_TIME = COPY.at(-1).start + Array.from(COPY.at(-1).text).length * COPY.at(-1).step + .78;

export class Proximity {
  constructor() {
    this.filtered = 0;
    this.raw = 0;
    this.lastSeen = -Infinity;
    this.lastKind = '';
  }

  feed(now, sample) {
    if (sample) {
      this.raw = sample.score;
      this.lastKind = sample.kind;
      this.lastSeen = now;
    }
  }

  update(now, dt, far, near, override = null) {
    const hold = now - this.lastSeen < 640;
    let target = hold ? clamp((this.raw - far) / (near - far)) : 0;
    if (override !== null) target = override;
    this.filtered = approach(this.filtered, target, dt, target > this.filtered ? .20 : .47);
    if (this.filtered < .002) this.filtered = 0;
    return this.filtered;
  }
}

export class Episode {
  constructor() { this.reset(); }

  reset() {
    this.phase = 'normal';
    this.age = 0;
    this.dossierTime = 0;
    this.nearTime = 0;
    this.leaveTime = 0;
    this.alpha = { notice: 0, reveal: 0 };
  }

  enter(phase) {
    this.phase = phase;
    this.age = 0;
  }

  update(dt, p) {
    this.age += dt;
    this.leaveTime = p < .21 ? this.leaveTime + dt : 0;
    this.nearTime = p >= .76 ? this.nearTime + dt : 0;

    if (this.phase === 'normal' && p >= .34) this.enter('notice');
    if (this.phase === 'notice' && p >= .28) {
      this.dossierTime += dt * (.84 + p * .2);
      if (this.dossierTime >= READ_TIME && this.nearTime >= .31) this.enter('reveal');
    }
    if (this.phase === 'reveal' && this.age >= 2.35) this.enter('cooldown');

    if (!['normal', 'leaving'].includes(this.phase) && this.leaveTime >= .49) this.enter('leaving');

    const notice = this.phase === 'notice' ? smooth(.15, .34, p) : 0;
    const reveal = this.phase === 'reveal' ? smooth(.24, .68, p) : 0;
    this.alpha.notice = approach(this.alpha.notice, notice, dt, notice ? .045 : .25);
    this.alpha.reveal = approach(this.alpha.reveal, reveal, dt, reveal ? .065 : .36);

    return this.phase === 'leaving' && Math.max(...Object.values(this.alpha)) < .025;
  }
}
