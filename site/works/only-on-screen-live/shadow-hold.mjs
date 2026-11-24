const offset = (person, wrist) => {
  const point = person.shape.wrists[wrist];
  return point ? (person.shape.center.y - point.y) / person.shape.height : null;
};
const separated = (from, to) => Math.hypot(from.x - to.x, from.y - to.y) > .075;

export class ShadowHold {
  constructor() { this.reset(); }

  reset() {
    this.raised = new Map();
    this.pending = null;
    this.hold = null;
    this.next = 0;
  }

  update(people, now, capture) {
    if (this.hold) {
      const person = people.find(person => person.id === this.hold.id);
      if (!person || separated(this.hold.center, person.shape.center)) this.hold = null;
      if (this.hold || now < this.next) return;
    }
    if (now < this.next) return;
    if (this.pending) {
      const { id, center, wrist } = this.pending;
      const person = people.find(person => person.id === id);
      const height = person ? offset(person, wrist) : null;
      if (!person || height === null || separated(center, person.shape.center) || now - this.pending.captured > 780) {
        this.pending = null;
        this.raised.delete(id);
      } else if (height < -.035) {
        this.hold = { ...this.pending, until: now + 510 };
        this.pending = null;
        this.raised.clear();
        this.next = now + 2800;
        return;
      } else {
        if (height > .10) {
          this.pending.pose = capture(person);
          this.pending.captured = now;
        }
        return;
      }
    }
    const visible = new Set(people.map(person => person.id));
    for (const id of this.raised.keys()) if (!visible.has(id)) this.raised.delete(id);
    for (const person of people) {
      const left = offset(person, 0), right = offset(person, 1);
      const wrist = (left ?? -1) > (right ?? -1) ? 0 : 1;
      if (person.shape.height < .29 || (offset(person, wrist) ?? 0) < .12) {
        this.raised.delete(person.id);
        continue;
      }
      const center = person.shape.center;
      const first = this.raised.get(person.id);
      if (!first || first.wrist !== wrist || separated(first.center, center)) {
        this.raised.set(person.id, { time: now, center, wrist });
      } else if (now - first.time >= 170) {
        this.pending = { id: person.id, center, wrist, pose: capture(person), captured: now };
        return;
      }
    }
  }

  blend(now) {
    if (!this.hold) return 0;
    this.lastPaint = now;
    if (now >= this.hold.until) { this.hold = null; return 0; }
    const remaining = Math.min(1, (this.hold.until - now) / 175);
    return remaining ** 2 * (3 - 2 * remaining);
  }

  needsPaint(now) { return this.hold && now >= this.hold.until - 175 && now - (this.lastPaint ?? -Infinity) >= 33; }
}
