const area = face => face.w * face.h;
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const acquireMs = 240;
export const lostMs = 1300;

function eligible(face, minWidth) {
  const { x, y, w, h, score, kind } = face;
  const body = kind === "body";
  const width = body ? minWidth * .75 : minWidth;
  return [x, y, w, h, score].every(Number.isFinite) &&
    x >= 0 && x <= 1 && y >= 0 && y <= 1 && w >= width && w <= 1.2 &&
    h >= width && h <= 1.2 && score >= (body ? .52 : .42);
}

function candidatesNear(reference, faces, now) {
  const elapsed = clamp((now - reference.at) / 1000, 0, .55);
  const predictedX = reference.x + (reference.vx ?? 0) * elapsed;
  const xGate = clamp(reference.w * .7 + elapsed * .12, .055, .16);
  const yGate = clamp(reference.h * .6, .065, .2);
  return faces.flatMap(face => {
    const ratio = area(face) / area(reference);
    const dx = Math.abs(face.x - predictedX);
    const dy = Math.abs(face.y - reference.y);
    if (dx > xGate || dy > yGate || ratio < .48 || ratio > 2.1) return [];
    return [{ face, cost: Math.hypot(dx / xGate, dy / yGate) + Math.abs(Math.log(ratio)) * .28 }];
  }).sort((a, b) => a.cost - b.cost);
}

export class Audience {
  constructor() {
    this.configure();
    this.reset();
  }

  configure({ zone = .6, minWidth = .055, priority = "center" } = {}) {
    this.zone = zone;
    this.minWidth = minWidth;
    this.priority = priority;
  }

  reset() {
    this.current = null;
    this.pending = null;
    this.count = 0;
    this.selections = 0;
    this.status = "관객 대기";
  }

  update(input, now) {
    const faces = input.filter(face => eligible(face, this.minWidth));
    this.count = faces.length;
    if (this.current) {
      const [best, second] = candidatesNear(this.current, faces, now);
      const ambiguous = second && second.cost - best.cost < .23;
      if (best && !ambiguous) {
        const face = best.face;
        const dt = Math.max(.02, (now - this.current.at) / 1000);
        const vx = clamp((face.x - this.current.x) / dt, -.8, .8);
        this.current = { ...face, at: now, vx: this.current.vx * .55 + vx * .45 };
        this.status = face.kind === "body" ? "몸통으로 추적 중" : "관객 한 명 추적 중";
        return this.current;
      }
      this.status = ambiguous ? "관객이 겹쳐 마지막 시선 유지" : "선택 관객을 잠시 놓침";
      if (now - this.current.at < lostMs) return null;
      this.current = null;
    }

    const inZone = faces.filter(face => Math.abs(face.x - .5) <= this.zone / 2);
    if (!inZone.length) {
      this.pending = null;
      this.status = faces.length ? "중앙 관람 구역 대기" : "관객 미감지";
      return null;
    }

    const continued = this.pending && candidatesNear(this.pending.face, inZone, now)[0];
    if (!continued) {
      const centrality = face => Math.abs(face.x - .5);
      const central = Math.min(...inZone.map(centrality));
      const pool = this.priority === "nearest" ? inZone : inZone.filter(face => centrality(face) <= central + .045);
      const face = pool.sort((a, b) => area(b) - area(a) || centrality(a) - centrality(b) || a.x - b.x)[0];
      this.pending = { face: { ...face, at: now }, since: now, frames: 1 };
    } else {
      this.pending.face = { ...continued.face, at: now };
      this.pending.frames++;
    }

    if (this.pending.frames >= 2 && now - this.pending.since >= acquireMs) {
      this.current = { ...this.pending.face, vx: 0 };
      this.pending = null;
      this.selections++;
      this.status = "관객 선택";
      return this.current;
    }
    this.status = "관객 위치 확인 중";
    return null;
  }
}

export function frameInterval(inferenceMs) {
  return clamp(inferenceMs * 1.35, 100, 450);
}
