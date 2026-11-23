import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Gaze } from '../site/works/portrait/lib/gaze.js';
import { NearestViewer } from '../site/works/portrait/lib/viewer.js';
import { sourceX } from '../site/works/portrait/lib/eye-composite.mjs';
import { portraitShift, updateAttention } from '../site/works/portrait/lib/group-gaze.mjs';

test('the gaze steadies, holds on exit, and returns to the original neutral', () => {
  for (const fps of [30, 60, 144]) {
    const gaze = new Gaze();
    const dt = 1 / fps;
    let now = 0;
    const advance = (seconds, x) => {
      for (let i = 0; i < seconds * fps; i++) {
        now += dt * 1000;
        if (x !== undefined) gaze.observe(x, now);
        gaze.step(now, dt);
      }
    };
    advance(1.5, .15);
    assert.ok(gaze.value < -.79);
    const held = gaze.value;
    advance(.5, .154);
    assert.equal(gaze.value, held);
    advance(.85);
    assert.equal(gaze.value, held);
    advance(.7);
    assert.ok(held < gaze.value && gaze.value < 0);
    advance(4);
    assert.equal(gaze.value, 0);
    advance(1, .86);
    assert.ok(gaze.value > .8);
  }
});

test('selection prefers one viewer and confirms a durable challenger', () => {
  const face = (x, w) => ({ x, y: .4, w, h: w * 1.2, score: .97, kind: 'face' });
  const left = face(.19, .19);
  const central = face(.52, .15);
  const right = face(.86, .27);
  const nearest = new NearestViewer();
  assert.equal(nearest.update([central, left], 0).x, left.x);
  for (const now of [100, 420, 700]) assert.equal(nearest.update([left, right], now).x, left.x);
  assert.equal(nearest.update([left, right], 780).x, right.x);
  assert.equal(nearest.switches, 1);
  assert.equal(new NearestViewer({ viewerPolicy: 'center' }).update([left, central, right], 0).x, central.x);
  assert.equal(nearest.update([], 820), null);
});

test('eye mapping holds both lid endpoints and never reverses direction in narrow rows', () => {
  for (const [left, right] of [[0, 80], [10, 64], [31, 55], [42, 55], [26, 44]]) {
    for (const shift of [-10, -2, 0, 2, 10]) {
      assert.equal(sourceX(left, left, right, 41, 11, shift), left);
      assert.equal(sourceX(right, left, right, 41, 11, shift), right);
      let previous = left;
      for (let x = left; x <= right; x++) {
        const sample = sourceX(x, left, right, 41, 11, shift);
        assert.ok(sample >= previous - 1e-9 && sample <= right + 1e-9);
        assert.ok((x - sample) * shift >= -1e-9);
        previous = sample;
      }
    }
  }
  assert.equal(sourceX(48, 0, 80, 41, 11, 7), 41);
});

test('both eye regions are inside the native portrait coordinate space', async () => {
  for (const id of ['v2', 'group-left', 'group-right', 'ink', 'dokkaebi']) {
    const path = new URL(`../site/works/portrait/assets/portrait-${id}-eyes.json`, import.meta.url);
    const photo = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(photo.eyes.map(eye => eye.id), ['left', 'right']);
    for (const { bounds: [x, y, width, height], centerX, irisRadius } of photo.eyes) {
      assert.ok(x > 0 && y > 0 && x + width < photo.width && y + height < photo.height);
      assert.ok(centerX - irisRadius > x && centerX + irisRadius < x + width);
    }
  }
});

test('three frames converge toward one position and settle forward after release', () => {
  const shifts = (position, attention) =>
    [-1, 0, 1].map(frame => portraitShift(position, attention, frame, 10));
  assert.deepEqual(shifts(0, 0), [0, 0, 0]);
  const [left, center, right] = shifts(0, 1);
  assert.ok(left > 0 && center === 0 && right < 0);
  assert.ok(shifts(-.95, 1).every(value => value < 0));
  assert.ok(shifts(.95, 1).every(value => value > 0));
  let attention = 0;
  for (let i = 0; i < 110; i++) attention = updateAttention(attention, true, .42, 1 / 60);
  assert.equal(attention, 1);
  for (let i = 0; i < 180; i++) attention = updateAttention(attention, false, 1.6, 1 / 60);
  assert.equal(attention, 0);
});

test('a closer bystander cannot steal the group gaze from the tracked guest', () => {
  const face = (x, w) => ({ x, y: .4, w, h: w * 1.2, score: .97, kind: 'face' });
  const first = face(.24, .15);
  const bystander = face(.8, .29);
  const viewer = new NearestViewer({ lockTarget: true, viewerLostGrace: 1 });
  assert.equal(viewer.update([first], 0).x, first.x);
  for (const now of [100, 600, 900]) {
    assert.equal(viewer.update([first, bystander], now).x, first.x);
  }
  assert.equal(viewer.update([bystander], 1850), null);
  assert.equal(viewer.update([bystander], 1950).x, bystander.x);
  assert.equal(viewer.switches, 1);
});

test('the family photograph has three calibrated eye pairs inside one image', async () => {
  const path = new URL('../site/works/portrait/assets/portrait-family-eyes.json', import.meta.url);
  const photo = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(photo.width / photo.height, 1.5);
  assert.deepEqual(photo.eyes.map(eye => eye.position), [-1, -1, 0, 0, 1, 1]);
  let previous = 0;
  for (const { bounds: [x, y, width, height], centerX, irisRadius } of photo.eyes) {
    assert.ok(x > previous && y > 0 && x + width < photo.width && y + height < photo.height);
    assert.ok(centerX - irisRadius > x && centerX + irisRadius < x + width);
    previous = x + width;
  }
});
