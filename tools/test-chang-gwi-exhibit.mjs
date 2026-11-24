import assert from 'node:assert/strict';
import { PoseHistory } from '../site/works/chang-gwi/exhibit/history.mjs';
import { createInkStamp, paintErosion } from '../site/works/chang-gwi/exhibit/material.mjs';

const width = 100, height = 72;

function mask(x, arm = false) {
  const data = new Uint8Array(width * height);
  function rect(a, b, c, d) {
    for (let y = b; y < d; y++) {
      for (let px = Math.max(0, a); px < Math.min(width, c); px++) data[y * width + px] = 1;
    }
  }
  rect(x - 4, 10, x + 5, 21);
  rect(x - 7, 21, x + 8, 44);
  rect(x - 6, 44, x - 1, 65);
  rect(x + 2, 44, x + 7, 65);
  rect(x - 11, 23, x - 7, 45);
  if (arm) {
    rect(x + 7, 21, x + 20, 25);
    rect(x + 16, 9, x + 20, 25);
  } else {
    rect(x + 8, 23, x + 12, 45);
  }
  return { width, height, data };
}

const settings = { frequency: 1.6, lifetime: 5.5, maxEchoes: 7, people: 2, erosion: 1 };
function repeat(history, from, to, masks, source) {
  for (let t = from; t <= to; t += 100) history.update(masks, t, settings, source);
}

const still = mask(35), raised = mask(35, true), right = mask(68);
const source = {
  canvas: {width, height},
  getImageData(x, y, w, h) {
    return {data: new Uint8ClampedArray(w * h * 4).fill(91)};
  },
};
const pose = new PoseHistory(() => .53);
repeat(pose, 0, 1700, [still], source);
assert.equal(pose.echoes.length, 0, 'stationary silhouettes do not generate echoes');
repeat(pose, 1800, 2300, [raised], source);
assert.ok(pose.echoes.length > 0, 'raising an arm leaves the previous pose');
const earlierCount = pose.echoes.length;
repeat(pose, 2400, 2900, [still], source);
assert.ok(pose.echoes.length > earlierCount, 'lowering an arm leaves the raised pose');
const frozen = pose.echoes.at(-1).snapshot;
const was = [frozen.x, frozen.y, frozen.w, frozen.h, ...frozen.pixels];
assert.ok(frozen.y < pose.tracks[0].frame.y);
assert.ok(frozen.color instanceof Uint8Array);
for (let i = 0; i < frozen.pixels.length; i++) {
  if (frozen.pixels[i] === 0) assert.equal(frozen.color[i * 3], 0, 'background RGB is discarded');
}
repeat(pose, 3000, 3500, [right], source);
assert.ok(pose.echoes.some(echo => echo.drift < -.65), 'rapid sideways motion retains the earlier location');
assert.deepEqual([frozen.x, frozen.y, frozen.w, frozen.h, ...frozen.pixels], was, 'saved mask is immutable across later input');
pose.update([], 3600, settings);
pose.prune(4500);
assert.equal(pose.tracks.length, 0);
assert.ok(pose.echoes.length > 0, 'departed audience leaves naturally decaying echoes');
pose.prune(10000);
assert.equal(pose.echoes.length, 0);
assert.equal(pose.released, pose.captures);

const people = new PoseHistory(() => .52);
repeat(people, 0, 400, [mask(20), mask(77)]);
assert.equal(people.tracks.length, 2);
repeat(people, 500, 900, [mask(47), mask(52)]);
assert.equal(people.ambiguous, true);
const overlapCount = people.captures;
repeat(people, 1000, 1700, [mask(45), mask(50)]);
assert.equal(people.captures, overlapCount, 'ambiguous overlap suppresses new captures');

globalThis.document = {
  createElement() {
    return {getContext: () => ({
      createImageData: (w, h) => ({data: new Uint8ClampedArray(w * h * 4)}),
      putImageData() {},
    })};
  },
};
const stamp = createInkStamp(frozen, {}, .45, 130);
const alpha = () => stamp.paint.data.filter((_, i) => i % 4 === 3);
const start = alpha();
paintErosion(stamp, frozen, .41);
const middle = alpha();
assert.ok(middle.some((v, i) => v === 0 && start[i] > 180));
assert.ok(middle.some(v => v > 180));
assert.ok(middle.every((v, i) => v <= start[i]), 'erosion only removes from the fixed-position mask');
assert.ok(stamp.grains.length > 0 && stamp.grains.some(grain => grain.start > 0));
paintErosion(stamp, frozen, 1);
assert.ok(alpha().every(value => !value), 'all material disappears');

const soak = new PoseHistory(() => .5);
const a = mask(28), b = mask(58);
let peak = 0;
for (let t = 0; t < 3600000; t += 250) {
  soak.update([t % 1000 < 500 ? a : b], t, settings);
  peak = Math.max(peak, soak.echoes.length);
}
soak.prune(3620000);
assert.ok(soak.captures > 1000);
assert.ok(peak > 0 && peak <= settings.maxEchoes);
assert.equal(soak.echoes.length, 0);
assert.equal(soak.released, soak.captures);
console.log('PASS stationary, raised arm, lateral and fast motion, overlap, erosion, departure, and virtual 60 minutes. Peak echoes ' +
  peak + ', released ' + soak.released + '.');
