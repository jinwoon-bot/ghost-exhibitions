const keepMs = 560;
const unmatched = 1.2;
const clamp = (x, limit) => Math.min(limit, Math.max(-limit, x));

function cost(track, observation, now) {
  const dt = Math.min(.4, (now - track.at) / 1000);
  const { center, height } = observation.shape;
  const dx = center.x - (track.center.x + track.vx * dt);
  const dy = center.y - (track.center.y + track.vy * dt);
  const scale = Math.abs(Math.log(height / track.height));
  const gate = .085 + dt * .35;
  if (Math.abs(dx) > gate || Math.abs(dy) > .16 || scale > .86) return Infinity;
  return Math.hypot(dx / gate, dy / .19) + scale * .24;
}

export class Tracks {
  reset() {
    this.items = [];
    this.nextId = 1;
  }

  constructor() { this.reset(); }

  update(people, now, limit = 3) {
    const current = this.items.filter(track => now - track.at < keepMs);
    const observations = people.slice().sort((a, b) => b.area - a.area).slice(0, limit);
    let best = Infinity, assignment = [];
    const find = (index, used, score, taken) => {
      if (score >= best) return;
      if (index === observations.length) {
        best = score;
        assignment = taken.slice();
        return;
      }
      for (let i = 0; i < current.length; i++) {
        if (used & (1 << i)) continue;
        const price = cost(current[i], observations[index], now);
        if (!Number.isFinite(price)) continue;
        find(index + 1, used | (1 << i), score + price, [...taken, i]);
      }
      find(index + 1, used, score + unmatched, [...taken, -1]);
    };
    find(0, 0, 0, []);
    const updated = [];
    const visible = observations.map((person, i) => {
      const before = current[assignment[i]];
      const { center, height } = person.shape;
      const dt = before ? Math.max(.045, (now - before.at) / 1000) : 1;
      const id = before?.id ?? this.nextId++;
      const velocity = key => before
        ? before["v" + key] * .35 + clamp((center[key] - before.center[key]) / dt, 1.4) * .65 : 0;
      current[assignment[i]] = null;
      updated.push({ id, center, height, vx: velocity("x"), vy: velocity("y"), at: now });
      return { ...person, id };
    });
    this.items = [...updated, ...current.filter(Boolean)].slice(0, 6);
    return visible;
  }
}
