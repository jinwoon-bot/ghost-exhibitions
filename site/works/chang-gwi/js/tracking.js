import { motion, intersection, cadence } from './core.js';
import { refineMask } from './mask.js';
export function bounds(mask) {
  const { data, width: w, height: h } = mask;
  let x = w,
    y = h,
    r = 0,
    b = 0,
    area = 0;
  for (let i = 0; i < data.length; i++)
    if (data[i]) {
      const px = i % w,
        py = (i / w) | 0;
      x = Math.min(x, px);
      y = Math.min(y, py);
      r = Math.max(r, px);
      b = Math.max(b, py);
      area++;
    }
  if (area < 90) return null;
  return { x, y, w: r - x + 1, h: b - y + 1, area, cx: (x + r) / 2, cy: (y + b) / 2 };
}
export function snapshot(mask, box, alpha, source) {
  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const ctx = canvas.getContext('2d'),
    image = ctx.createImageData(box.w, box.h),
    edge = [];
  for (let y = 0; y < box.h; y++)
    for (let x = 0; x < box.w; x++) {
      const j = (y * box.w + x) * 4,
        k = (y + box.y) * mask.width + x + box.x;
      const opacity = alpha ? alpha[k] : mask.data[k] ? 255 : 0;
      if (opacity) {
        image.data[j] = image.data[j + 1] = image.data[j + 2] = 255;
        image.data[j + 3] = opacity;
        if (
          x % 2 === 0 &&
          y % 2 === 0 &&
          (!mask.data[k - 2] ||
            !mask.data[k + 2] ||
            !mask.data[k - mask.width * 2] ||
            !mask.data[k + mask.width * 2])
        )
          edge.push({ x, y });
      }
    }
  ctx.putImageData(image, 0, 0);
  if(source){
    const sx=source.width/mask.width,sy=source.height/mask.height;
    const matte=document.createElement('canvas');matte.width=box.w;matte.height=box.h;matte.getContext('2d').drawImage(canvas,0,0);
    canvas.width=Math.max(1,Math.round(box.w*sx));canvas.height=Math.max(1,Math.round(box.h*sy));
    ctx.drawImage(matte,0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-in';
    ctx.drawImage(source,box.x*sx,box.y*sy,box.w*sx,box.h*sy,0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';matte.width=matte.height=0;
  }
  return {
    canvas,
    box: { ...box },
    sourceWidth: mask.width,
    sourceHeight: mask.height,
    edge,
    release() {
      this.canvas.width = this.canvas.height = 0;
      this.paint && (this.paint.width = this.paint.height = 0);
      this.paperPaint && (this.paperPaint.width = this.paperPaint.height = 0);
      this.paperVertices=null;
      this.inkPaint && (this.inkPaint.width = this.inkPaint.height = 0);
      this.tiles = null;
      this.edge = null;
    },
  };
}
function signature(mask) {
  const out = new Uint8Array(64 * 36);
  for (let y = 0; y < 36; y++)
    for (let x = 0; x < 64; x++)
      out[y * 64 + x] = mask.data[
        Math.floor((y * mask.height) / 36) * mask.width + Math.floor((x * mask.width) / 64)
      ]
        ? 1
        : 0;
  return out;
}
export class Tracker {
  constructor(store) {
    this.store = store;
    this.tracks = [];
    this.nextId = 0;
    this.mode = '대기';
    this.activity = 0;
    this.count = 0;
    this.width = 640;
    this.height = 360;
    this.merged = false;
    this.cleanFrames = 0;
  }
  clear() {
    for (const t of this.tracks) t.frame.release();
    this.tracks = [];
    this.activity = 0;
    this.count = 0;
  }
  update(masks, now, s, source) {
    if (masks[0]) {
      this.width = masks[0].width;
      this.height = masks[0].height;
    }
    let people = masks
      .map((m) => ({ mask: m, box: bounds(m) }))
      .filter((x) => x.box)
      .slice(0, s.people);
    let merged = false;
    for (let i = 0; i < people.length; i++)
      for (let j = i + 1; j < people.length; j++)
        if (intersection(people[i].box, people[j].box) > 0.24) merged = true;
    if (people.some((p) => p.mask.pose && p.mask.pose.score < 0.42)) merged = true;
    // Hysteresis prevents rapid split/merge flicker around the overlap threshold.
    if (merged) {
      this.merged = true;
      this.cleanFrames = 0;
    } else if (this.merged && people.length) {
      this.cleanFrames++;
      if (this.cleanFrames >= 6) this.merged = false;
    } else if (!people.length) {
      this.merged = false;
      this.cleanFrames = 0;
    }
    merged = this.merged && people.length > 0;
    if (merged && people.length) {
      const mask = {
        width: people[0].mask.width,
        height: people[0].mask.height,
        data: new Uint8Array(people[0].mask.data.length),
      };
      for (const p of people)
        for (let i = 0; i < mask.data.length; i++) mask.data[i] |= p.mask.data[i];
      people = [{ mask, box: bounds(mask) }];
    }
    const mode = merged
      ? '통합 실루엣 (분리 불안정)'
      : people.length
        ? `${people.length}인 개별 마스크`
        : '대기';
    if ((merged && !this.mode.startsWith('통합')) || (!merged && this.mode.startsWith('통합')))
      this.clear();
    this.mode = mode;
    this.count = people.length;
    const used = new Set(),
      next = [];
    let total = 0;
    for (const p of people) {
      const sig = signature(p.mask);
      let best = null,
        distance = 0.3;
      for (const t of this.tracks) {
        if (used.has(t.id)) continue;
        const d = Math.hypot(
          (t.box.cx - p.box.cx) / p.mask.width,
          (t.box.cy - p.box.cy) / p.mask.height,
        );
        if (d < distance) {
          distance = d;
          best = t;
        }
      }
      const activity = best ? motion(best.signature, sig) : 0;
      total += activity;
      const alpha = refineMask(p.mask.data, p.mask.width, p.mask.height, best?.alpha, activity);
      // Include the feathered edge so smoothing cannot be cropped at the raw bound.
      const bx = Math.max(0, p.box.x - 2),
        by = Math.max(0, p.box.y - 2);
      const frameBox = {
        ...p.box,
        x: bx,
        y: by,
        w: Math.min(p.mask.width, p.box.x + p.box.w + 2) - bx,
        h: Math.min(p.mask.height, p.box.y + p.box.h + 2) - by,
      };
      const frame = snapshot(p.mask, frameBox, alpha,s.effect==='ink'?source:null);
      frame.effect=s.effect||'hanji';
      if (best) {
        used.add(best.id);
        if (activity > 0.045 && now - best.lastCapture > cadence(activity, s.frequency)) {
          // Ownership transfers the previous frozen mask to the clone store.
          const captured = this.store.add(best.frame, best.id, now, s);
          if (captured) {
            best.frame = null;
            best.lastCapture = now;
          }
        }
        best.frame?.release();
        next.push({ ...best, box: p.box, signature: sig, alpha, frame, activity, seen: now });
      } else
        next.push({
          id: ++this.nextId,
          box: p.box,
          signature: sig,
          frame,
          alpha,
          activity: 0,
          seen: now,
          lastCapture: now - 1000,
        });
    }
    // Keep a short presence debounce; no clone is reset when a person departs.
    for (const t of this.tracks)
      if (!used.has(t.id)) {
        if (now - t.seen < 650 && next.length < s.people) next.push({ ...t, activity: 0 });
        else t.frame.release();
      }
    this.tracks = next;
    this.activity = people.length ? total / people.length : 0;
  }
  expire(now) {
    const keep = [];
    for (const t of this.tracks) {
      if (now - t.seen > 700) t.frame.release();
      else keep.push(t);
    }
    this.tracks = keep;
    if (!keep.length) {
      this.activity = 0;
      this.count = 0;
      this.mode = '대기';
    }
  }
}
