import { DEFAULT_CLAP_INTERVAL, DOUBLE_CLAP_WINDOW } from './clap.mjs?v=double-clap';

export const STATES = Object.freeze({
  IDLE: 'IDLE', COUNTING: 'COUNTING', INTERRUPTED: 'INTERRUPTED',
  AGITATED: 'AGITATED', LUNGE: 'LUNGE', REVEAL: 'REVEAL', QUIET: 'QUIET', RESET: 'RESET',
});
export const NUMBERS = Object.freeze(['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열하나', '열둘']);
export const LAST_LINE = '이번엔 너를 셀게.';
const limit = (value, min, max) => Math.min(max, Math.max(min, value));

export function thresholds(values = {}) {
  const first = limit(Math.round(Number(values.first) || 1), 1, 8);
  const many = limit(Math.round(Number(values.many) || 3), first + 1, 11);
  return { first, many, final: limit(Math.round(Number(values.final) || 5), many + 1, 15) };
}

export class Score {
  constructor(emit, random = Math.random) {
    this.emit = emit;
    this.random = random;
    this.settings = thresholds();
    this.autoReset = true;
    this.total = 0;
    this.reset(0);
  }

  configure(values) {
    this.settings = thresholds(values);
    this.autoReset = values.autoReset !== false;
  }

  enter(state, now, delay) {
    this.state = state;
    this.entered = now;
    this.next = now + delay;
  }

  reset(now) {
    this.count = 0;
    this.interruptions = [];
    this.lastClap = -Infinity;
    this.spokenReveal = false;
    this.peak = 0;
    this.returnFrom = null;
    this.enter(STATES.IDLE, now, 950);
  }

  eyeStage(now) {
    if (this.state === STATES.REVEAL) return 3;
    const strikes = this.interruptions.filter(time => now - time < 18000).length;
    return strikes >= this.settings.many ? 2 : Number(strikes >= this.settings.first);
  }

  interrupt(now, interval = DEFAULT_CLAP_INTERVAL) {
    const gap = now - this.lastClap;
    if (gap < interval || this.state === STATES.LUNGE || this.state === STATES.REVEAL || this.state === STATES.RESET) return false;
    this.lastClap = now;
    this.total++;
    this.interruptions = this.interruptions.filter(time => now - time < 18000);
    this.interruptions.push(now);
    this.count = 0;
    if (gap <= DOUBLE_CLAP_WINDOW) {
      this.enter(STATES.LUNGE, now, 2020);
      this.emit('lunge');
    } else if (this.interruptions.length >= this.settings.final) this.reveal(now);
    else {
      const anger = this.eyeStage(now);
      this.enter(STATES.INTERRUPTED, now, 430 + anger * 130);
      this.emit('interruption', this.interruptions.length, anger);
    }
    return true;
  }

  reveal(now) {
    this.peak = 3;
    this.spokenReveal = false;
    this.enter(STATES.REVEAL, now, 5300);
    this.emit('reveal');
  }

  quiet(now) {
    this.peak = this.eyeStage(now);
    this.enter(STATES.QUIET, now, 3900);
    this.emit('quiet');
  }

  settle(now) {
    this.returnFrom = this.state;
    this.enter(STATES.RESET, now, this.returnFrom === STATES.LUNGE ? 780 : 1450);
    this.emit('reset');
  }

  step(now) {
    if (this.state === STATES.REVEAL && !this.spokenReveal && now - this.entered >= 2740 && now < this.next) {
      this.spokenReveal = true;
      this.emit('last-line');
    }
    if (now < this.next) return;
    if (this.state === STATES.RESET) { if (this.autoReset) this.reset(now); return; }
    if (this.state === STATES.LUNGE || this.state === STATES.REVEAL || this.state === STATES.QUIET) { this.settle(now); return; }
    if (this.count >= NUMBERS.length) { this.quiet(now); return; }
    const anger = this.eyeStage(now);
    const hold = 1390 + this.random() * 900 + (this.count % 4 === 2 ? 410 : 0) - anger * 155;
    this.enter(anger ? STATES.AGITATED : STATES.COUNTING, now, hold);
    this.count++;
    this.emit('count', this.count, anger);
  }

  view(now) {
    return {
      state: this.state, count: this.count, total: this.total,
      strikes: this.interruptions.filter(time => now - time < 18000).length,
      eyes: this.eyeStage(now), peak: this.peak, returnFrom:this.returnFrom, hitAge:now-this.lastClap,
      first:this.settings.first, many:this.settings.many,
      age: Math.max(0, now - this.entered),
    };
  }
}
