import { refineMask } from '../js/mask.js';

const GRID_WIDTH = 64;
const GRID_HEIGHT = 36;
const TRACK_HOLD = 760;
const REASSOCIATE = 540;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function shape(mask) {
  const { data, width, height } = mask;
  const grid = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  let left = width, top = height, right = -1, bottom = -1, area = 0, totalX = 0, totalY = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const gridRow = Math.floor(y * GRID_HEIGHT / height) * GRID_WIDTH;
    for (let x = 0; x < width; x++) {
      if (!data[row + x]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      totalX += x;
      totalY += y;
      area++;
      grid[gridRow + Math.floor(x * GRID_WIDTH / width)]++;
    }
  }
  if (area < width * height * .0018) return null;
  for (let i = 0; i < grid.length; i++) grid[i] = Number(grid[i] >= 2);
  return {
    x: left, y: top, width: right - left + 1, height: bottom - top + 1,
    cx: totalX / area / width, cy: totalY / area / height, area, grid,
  };
}

export function difference(a, b) {
  let union = 0, changed = 0;
  for (let i = 0; i < a.grid.length; i++) {
    union += a.grid[i] | b.grid[i];
    changed += a.grid[i] ^ b.grid[i];
  }
  return changed / Math.max(1, union);
}

function distance(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

function overlap(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h / Math.min(a.width * a.height, b.width * b.height);
}

function saveMask(mask, pose, alpha, source) {
  const x = Math.max(0, pose.x - 2);
  const y = Math.max(0, pose.y - 2);
  const w = Math.min(mask.width, pose.x + pose.width + 2) - x;
  const h = Math.min(mask.height, pose.y + pose.height + 2) - y;
  const pixels = new Uint8Array(w * h);
  for (let row = 0; row < h; row++) {
    const begin = (y + row) * mask.width + x;
    pixels.set(alpha.subarray(begin, begin + w), row * w);
  }
  let color = null;
  if (source?.canvas.width === mask.width && source.canvas.height === mask.height) {
    const rgba = source.getImageData(x, y, w, h).data;
    color = new Uint8Array(w * h * 3);
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] < 16) continue;
      color[i * 3] = rgba[i * 4];
      color[i * 3 + 1] = rgba[i * 4 + 1];
      color[i * 3 + 2] = rgba[i * 4 + 2];
    }
  }
  return Object.freeze({ x, y, w, h, pixels, color, sourceWidth: mask.width, sourceHeight: mask.height });
}

export class PoseHistory {
  constructor(random = Math.random) {
    this.random = random;
    this.tracks = [];
    this.echoes = [];
    this.size = null;
    this.captures = 0;
    this.released = 0;
    this.serial = 0;
    this.activity = 0;
    this.ambiguous = false;
  }

  clear() {
    for (const echo of this.echoes) this.release(echo);
    this.tracks = [];
    this.echoes = [];
    this.size = null;
    this.activity = 0;
    this.ambiguous = false;
  }

  release(echo) {
    echo.dispose?.();
    this.released++;
  }

  prune(now) {
    this.tracks = this.tracks.filter(track => now - track.seen < TRACK_HOLD);
    this.echoes = this.echoes.filter(echo => {
      if (now < echo.until) return true;
      this.release(echo);
      return false;
    });
    if (!this.tracks.length) this.activity = 0;
  }

  remember(track, currentPose, now, settings) {
    if (this.echoes.length >= settings.maxEchoes) return;
    const seed = this.random();
    this.echoes.push({
      id: ++this.captures,
      snapshot: track.reference,
      born: now,
      until: now + settings.lifetime * 1000 * (.86 + seed * .28),
      seed,
      strength: settings.erosion,
      drift: clamp((track.referencePose.cx - currentPose.cx) * 10, -1, 1),
      lift: clamp((track.referencePose.cy - currentPose.cy) * 9, -.5, .5),
    });
  }

  update(masks, now, settings, source) {
    this.prune(now);
    const candidates = masks.map(mask => ({ mask, pose: shape(mask) }))
      .filter(person => person.pose)
      .sort((a, b) => b.pose.area - a.pose.area)
      .slice(0, settings.people);
    const first = candidates[0]?.mask;
    if (first && this.size && (first.width !== this.size.width || first.height !== this.size.height)) {
      // A resolution change retains existing normalized positions, but cannot compare masks from two grids.
      this.tracks = [];
    }
    if (first) this.size = { width: first.width, height: first.height };
    this.ambiguous = candidates.some((person, i) => candidates.slice(0, i)
      .some(other => overlap(person.pose, other.pose) > .58 && distance(person.pose, other.pose) < .15));

    const prior = this.tracks;
    const unmatched = new Set(prior);
    const next = [];
    let activity = 0;
    for (const { mask, pose } of candidates) {
      let track, cost = .40;
      for (const item of unmatched) {
        if (now - item.seen > REASSOCIATE) continue;
        const sizeRatio = pose.area / item.pose.area;
        if (sizeRatio < .37 || sizeRatio > 2.7) continue;
        const score = distance(pose, item.pose) + Math.abs(Math.log(sizeRatio)) * .065;
        if (score < cost) { track = item; cost = score; }
      }
      const recentChange = track ? difference(track.pose, pose) : 0;
      const alpha = refineMask(mask.data, mask.width, mask.height, track?.alpha, recentChange);
      const frame = saveMask(mask, pose, alpha, source);
      activity += recentChange;

      if (!track) {
        next.push({ id: ++this.serial, pose, alpha, frame, reference: frame, referencePose: pose, seen: now, missing: false, changes: 0, lastCapture: -Infinity });
        continue;
      }

      unmatched.delete(track);
      const poseDelta = difference(track.referencePose, pose);
      const shift = distance(track.referencePose, pose);
      const meaningful = poseDelta >= .084 || shift >= .018;
      const abrupt = poseDelta >= .195 || shift >= .040;
      const gap = now - track.seen;
      let { reference, referencePose, lastCapture } = track;
      let changes = meaningful ? track.changes + 1 : 0;
      if (track.missing || this.ambiguous || gap > 500) {
        reference = frame;
        referencePose = pose;
        changes = 0;
      } else if (meaningful && (abrupt || changes >= 2)) {
        const cadence = clamp((abrupt ? 142 : 275) / settings.frequency, 75, 1100);
        if (now - lastCapture >= cadence) {
          this.remember(track, pose, now, settings);
          lastCapture = now;
          reference = frame;
          referencePose = pose;
          changes = 0;
        }
      } else if (!meaningful && poseDelta < .038 && shift < .009) {
        // During a held pose, the most recent mask is the source of the next echo.
        reference = frame;
        referencePose = pose;
      }

      next.push({ ...track, pose, alpha, frame, reference, referencePose, seen: now, missing: false, changes, lastCapture });
    }
    for (const lost of unmatched) {
      if (next.length < settings.people) next.push({ ...lost, missing: true, changes: 0 });
    }
    this.tracks = next;
    this.activity = candidates.length ? activity / candidates.length : 0;
  }
}
