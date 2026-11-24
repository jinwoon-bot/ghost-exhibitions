import assert from "node:assert/strict";
import test from "node:test";
import { geometry, splitMasks } from "../site/works/only-on-screen-live/masks.mjs";
import { Tracks } from "../site/works/only-on-screen-live/tracks.mjs";

const width = 120, height = 90;
function shape(x) {
  return { center: { x, y: .47 }, height: .69, left: x - .16, right: x + .16,
    top: .15, bottom: .86, feet: { x, y: .86 } };
}
function actor(x, left, right, top = 25, raised = false) {
  const mask = new Uint8Array(width * height);
  for (let y = top; y < 77; y++) mask.fill(255, y * width + left, y * width + right);
  if (raised) for (let y = 12; y < top; y++) mask.fill(255, y * width + left, y * width + left + 3);
  return { shape: shape(x), mask };
}
function at(person, x, y) {
  if (x < person.x || x >= person.x + person.w || y < person.y || y >= person.y + person.h) return 0;
  return person.alpha[(y - person.y) * person.w + x - person.x];
}
const obs = (x, area = .06) => ({ shape: shape(x), area });

test("three current masks maintain independent wrists and never share pixels", () => {
  const actors = [actor(.27, 14, 49, 25, true), actor(.51, 40, 72), actor(.79, 80, 106)];
  const masks = splitMasks(actors, width, height);
  assert.equal(masks.length, 3);
  assert.equal(at(masks[0], 15, 12), 255);
  assert.equal(at(masks[1], 15, 12), 0);
  assert.equal(at(masks[2], 15, 12), 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    assert.ok(masks.filter(person => at(person, x, y)).length <= 1);
  }
  assert.ok(masks.every(person => person.anchor.y > .81 && at(person,
    Math.round(person.anchor.x * width), Math.round(person.anchor.y * height)) > 0));
});
test("uncertain pixels feather without dropping a confident fingertip", () => {
  const person = actor(.27, 14, 49, 25, true);
  person.mask[20 * width + 17] = 116;
  person.mask[20 * width + 18] = 1;
  const [mask] = splitMasks([person], width, height, .2);
  assert.equal(at(mask, 16, 20), 255);
  assert.ok(at(mask, 17, 20) > 0 && at(mask, 17, 20) < 160);
  assert.equal(at(mask, 18, 20), 0);
});
test("confident floor artifacts outside the pose cannot drag an actor's shadows away", () => {
  const person = actor(.27, 14, 49, 25, true);
  for (let y = 83; y < 89; y++) person.mask.fill(255, y * width + 86, y * width + 104);
  const [mask] = splitMasks([person], width, height);
  assert.equal(at(mask, 99, 86), 0);
  assert.ok(Math.abs(mask.anchor.x - person.shape.feet.x) < .04);
  assert.ok(Math.abs(mask.anchor.y - person.shape.feet.y) < .04);
});
test("landmarks require a visible torso and expose hands separately", () => {
  const pose = Array(33);
  pose[11] = { x: .25, y: .3, visibility: .95 };
  assert.equal(geometry(pose), null);
  pose[23] = { x: .25, y: .6, visibility: .95 };
  pose[15] = { x: .15, y: .2, visibility: .9 };
  pose[16] = { x: .40, y: .2, visibility: .05 };
  assert.deepEqual(geometry(pose).wrists, [{ x: .15, y: .2 }, null]);
});
test("stable assignment survives changing order and separated crossing trajectories", () => {
  const tracks = new Tracks();
  const first = tracks.update([obs(.35, .1), obs(.65)], 0);
  const [a,b] = first.map(p => p.id);
  assert.deepEqual(tracks.update([obs(.58, .1), obs(.42)], 140).map(p => p.id), [b,a]);
  assert.deepEqual(tracks.update([obs(.51, .1), obs(.49)], 280).map(p => p.id), [b,a]);
  assert.deepEqual(tracks.update([obs(.57, .1), obs(.43)], 420).map(p => p.id), [a,b]);
});
test("missing viewers are hidden immediately, with an ID grace window only", () => {
  const tracks = new Tracks();
  const [a,b] = tracks.update([obs(.3), obs(.6)], 0);
  assert.deepEqual(tracks.update([obs(.6)], 100).map(p=>p.id), [b.id]);
  assert.deepEqual(tracks.update([], 150), []);
  assert.equal(tracks.update([obs(.3)], 300)[0].id, a.id);
  assert.notEqual(tracks.update([obs(.3)], 1000)[0].id, a.id);
  assert.equal(tracks.update([obs(.7), obs(.2)], 1100, 1).length, 1);
});
