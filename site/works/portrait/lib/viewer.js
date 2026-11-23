// 얼굴 크기로 거리를 추정한다. 얼굴 인식/개인 식별이나 실제 깊이 측정은 하지 않는다.
const area = (f) => f.w * f.h;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function match(reference, faces) {
  let best = null, cost = Infinity;
  for (const f of faces) {
    const ratio = area(f) / area(reference);
    const gate = Math.max(.065, Math.min(.22, Math.max(reference.w, f.w) * 1.3));
    const d = distance(reference, f);
    if (d > gate || ratio < .45 || ratio > 2.2) continue;
    const c = d / gate + Math.abs(Math.log(ratio)) * .3;
    if (c < cost) { best = f; cost = c; }
  }
  return best;
}
export class NearestViewer {
  constructor(config = {}) { this.configure(config); this.reset(); }
  configure(config = {}) {
    this.minWidth = config.viewerMinWidth ?? .035;
    this.switchRatio = config.viewerSwitchRatio ?? 1.35;
    this.switchMs = (config.viewerSwitchDelay ?? .65) * 1000;
    this.lostMs = (config.viewerLostGrace ?? .65) * 1000;
  }
  reset() { this.current = null; this.pending = null; this.count = 0; this.switches = 0; this.reason = '대기'; }
  accept(face, now, reason) {
    if (this.current && reason === '더 가까운 관객으로 전환') this.switches++;
    this.current = { ...face, at: now };
    this.pending = null; this.reason = reason;
    return this.current;
  }
  update(input, now) {
    const faces = input.filter(f => [f.x,f.y,f.w,f.h,f.score].every(Number.isFinite)
      && f.score >= (f.kind === "face" ? .4 : .45) && f.w >= (f.kind?.includes('body') ? Math.min(this.minWidth,.025) : this.minWidth) && f.h >= (f.kind?.includes('body') ? Math.min(this.minWidth,.025) : this.minWidth)
      && f.w <= 1.3 && f.h <= 1.3 && f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1);
    this.count = faces.length;
    const largest = faces.reduce((best, f) => !best || area(f) > area(best) ? f : best, null);
    if (!largest) {
      this.pending = null; this.reason = '관객 미감지';
      if (this.current && now - this.current.at >= this.lostMs) this.current = null;
      return null;
    }
    if (!this.current) return this.accept(largest, now, '가장 가까운 관객 선택');
    const incumbent = match(this.current, faces);
    if (!incumbent) {
      this.pending = null;
      if (now - this.current.at < this.lostMs) { this.reason = '선택 관객 잠시 가림'; return null; }
      return this.accept(largest, now, '가장 가까운 관객 재선택');
    }
    // 비슷한 크기의 옆 사람으로 흔들리지 않는다. 확실히 큰 얼굴이 지속되면 변경한다.
    if (largest === incumbent || area(largest) < area(incumbent) * this.switchRatio) {
      return this.accept(incumbent, now, '선택 관객 유지');
    }
    const sameChallenger = this.pending && match(this.pending.face, [largest]);
    if (!sameChallenger) this.pending = { face: largest, since: now };
    else this.pending.face = largest;
    if (now - this.pending.since >= this.switchMs) return this.accept(largest, now, '더 가까운 관객으로 전환');
    this.current = { ...incumbent, at: now };
    this.reason = '더 가까운 관객 확인 중';
    return this.current;
  }
}
