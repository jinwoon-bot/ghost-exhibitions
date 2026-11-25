const offset = (person, wrist) => {
  const point = person.shape.wrists[wrist];
  return point ? (person.shape.center.y - point.y) / person.shape.height : null;
};
const separated = (from, to) => Math.hypot(from.x - to.x, from.y - to.y) > .075;

export class ShadowHold {
  constructor() { this.reset(); }

  reset() {
    this.tracks = new Map();
    this.lastPaint = -Infinity;
  }

  update(people, now, capture) {
    const visible = new Set(people.map(person => person.id));
    for (const id of this.tracks.keys()) if (!visible.has(id)) this.tracks.delete(id);
    for (const person of people) this.observe(person, now, capture);
  }

  observe(person, now, capture) {
    const { id, shape } = person;
    let track = this.tracks.get(id);
    if (!track) {
      track = { raised: null, pending: null, hold: null, next: 0 };
      this.tracks.set(id, track);
    }
    if (track.hold && (now >= track.hold.until || separated(track.hold.center, shape.center))) track.hold = null;
    if (track.hold || now < track.next) return;
    if (track.pending) {
      const { center, wrist, captured } = track.pending;
      const height = offset(person, wrist);
      if (height === null || separated(center, shape.center) || now - captured > 780) {
        track.raised = track.pending = null;
      } else if (height < -.035) {
        track.hold = { ...track.pending, from: now, until: now + 860 };
        track.raised = track.pending = null;
        track.next = now + 2800;
        return;
      } else {
        if (height > .10) {
          track.pending.pose = capture(person, track.pending.pose);
          track.pending.captured = now;
        }
        return;
      }
    }
    const left = offset(person, 0), right = offset(person, 1);
    const wrist = (left ?? -1) > (right ?? -1) ? 0 : 1;
    if (shape.height < .29 || (offset(person, wrist) ?? 0) < .12) {
      track.raised = null;
      return;
    }
    const { center } = shape, first = track.raised;
    if (!first || first.wrist !== wrist || separated(first.center, center)) {
      track.raised = { time: now, center, wrist };
    } else if (now - first.time >= 170) {
      track.pending = { id, center, wrist, pose: capture(person), captured: now };
    }
  }

  get(id, now) {
    const track = this.tracks.get(id), hold = track?.hold;
    if (!hold) return null;
    if (now >= hold.until) {
      track.hold = null;
      return null;
    }
    const remainder = Math.min(1, (hold.until - now) / 175);
    const phase = Math.max(0, Math.min(1, (now - hold.from) / (hold.until - hold.from)));
    return { pose: hold.pose, weight: remainder ** 2 * (3 - 2 * remainder),
      lean: (hold.wrist === 0 ? -.13 : .13) * Math.sin(Math.PI * phase) ** 2 };
  }

  needsPaint(now) {
    return now - this.lastPaint >= 33 && Array.from(this.tracks.values()).some(track => track.hold);
  }
}
