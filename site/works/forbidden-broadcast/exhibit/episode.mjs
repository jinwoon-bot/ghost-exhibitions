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
export const FINALE = { ident: 1.65, corridor: 2.30, silence: .54, rush: .82, blackout: .58, cooldown: 1.15 };

export class Proximity {
  constructor() {
    this.filtered = 0;
    this.raw = 0;
    this.lastSeen = -Infinity;
    this.lastAnalysis = -Infinity;
    this.lastKind = '';
  }

  feed(now, sample) {
    this.lastAnalysis = now;
    if (sample) {
      this.raw = sample.score;
      this.lastKind = sample.kind;
      this.lastSeen = now;
    }
  }

  present(now) {
    // A delayed analysis and a confirmed empty frame have different grace periods.
    return now - this.lastSeen < (now - this.lastAnalysis > 420 ? 1500 : 640);
  }

  update(now, dt, far, near, override = null) {
    let target = this.present(now) ? clamp((this.raw - far) / (near - far)) : 0;
    if (override !== null) target = override;
    this.filtered = approach(this.filtered, target, dt, target > this.filtered ? .20 : .47);
    if (this.filtered < .002) this.filtered = 0;
    return this.filtered;
  }
}

export class Episode {
  constructor() { this.reset(); }

  reset(armed = true) {
    this.phase = 'normal';
    this.age = 0;
    this.dossierTime = 0;
    this.leaveTime = 0;
    this.armed = armed;
    this.alpha = { ident: 0, notice: 0, reveal: 0, interrupt: 0 };
  }

  enter(phase) {
    this.phase = phase;
    this.age = 0;
  }

  update(dt, p, present) {
    this.age += dt;
    this.leaveTime = present ? 0 : this.leaveTime + dt;
    if (this.phase === 'normal' && this.leaveTime >= .35) this.armed = true;
    if (!['normal', 'leaving'].includes(this.phase) && this.leaveTime >= .36) {
      this.enter('leaving');
    } else if (this.phase === 'normal' && this.armed && present) {
      this.armed = false;
      this.enter('ident');
    } else if (this.phase === 'ident' && present && this.age >= FINALE.ident) {
      this.enter('notice');
      this.alpha.notice = 1;
    } else if (this.phase === 'notice' && present) {
      this.dossierTime += dt * (.96 + p * .11);
      if (this.dossierTime >= READ_TIME) this.enter('reveal');
    } else if (this.phase === 'reveal' && present && this.age >= FINALE.corridor) {
      this.enter('scare');
    } else if (this.phase === 'scare' && this.age >= FINALE.rush) {
      this.enter('cut');
    } else if (this.phase === 'cut' && this.age >= FINALE.blackout) {
      this.enter('cooldown');
    } else if (this.phase === 'cooldown' && this.age >= FINALE.cooldown) {
      return 'cycle-complete';
    }
    const notice = this.phase === 'notice' ? 1 : 0;
    const reveal = this.phase === 'reveal' ? 1 : 0;
    this.alpha.notice = approach(this.alpha.notice, notice, dt, notice ? .045 : .25);
    this.alpha.reveal = approach(this.alpha.reveal, reveal, dt, reveal ? .065 : .36);
    this.alpha.ident = this.phase === 'ident' ? 1 : 0;
    this.alpha.interrupt = this.phase === 'scare' || this.phase === 'cut' ? 1 : 0;

    return this.phase === 'leaving' && Math.max(...Object.values(this.alpha)) < .025 ? 'departure' : null;
  }
}
