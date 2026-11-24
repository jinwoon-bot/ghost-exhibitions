import assert from "node:assert/strict";
import test from "node:test";
import { geometry, splitMasks } from "../site/works/only-on-screen-live/masks.mjs";
import { Tracks } from "../site/works/only-on-screen-live/tracks.mjs";
import { ShadowHold } from "../site/works/only-on-screen-live/shadow-hold.mjs";
import { blendDetail, projectMask, projectPose, subjectCrop } from "../site/works/only-on-screen-live/subject-detail.mjs";

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
test("connected legs and shoes extend past the last usable landmark", () => {
  const person = actor(.35, 27, 56);
  person.shape.bottom = .53;
  person.shape.height = .38;
  person.shape.feet = null;
  for (let y = 68; y < 84; y++) {
    person.mask.fill(230, y * width + 28, y * width + 35);
    person.mask.fill(223, y * width + 46, y * width + 53);
  }
  for (let y = 73; y < 86; y++) person.mask.fill(255, y * width + 73, y * width + 77);
  const [mask] = splitMasks([person], width, height);
  assert.ok(at(mask, 32, 83) > 220);
  assert.ok(at(mask, 49, 83) > 220);
  assert.equal(at(mask, 74, 80), 0);
  assert.equal(at(mask, 40, 80), 0);
  assert.ok(mask.anchor.y > .9);
});
test("camera color guides the feathering across a sharp clothing boundary", () => {
  const person = actor(.27, 14, 49);
  const i = 40 * width + 49;
  person.mask[i] = 113;
  const colors = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < 3; x++) colors[(i - 1) * 4 + x] = 240;
  const [uniform] = splitMasks([person], width, height, .18);
  const [contrast] = splitMasks([person], width, height, .18, colors);
  assert.ok(at(contrast, 49, 40) < at(uniform, 49, 40));
  assert.equal(at(contrast, 48, 40), 255);
});
test("a small credible silhouette survives the size check", () => {
  const smallWidth = 640, smallHeight = 400;
  const mask = new Uint8Array(smallWidth * smallHeight);
  for (let y = 143; y < 187; y++) mask.fill(217, y * smallWidth + 421, y * smallWidth + 428);
  const tiny = { center: { x: .663, y: .40 }, left: .654, right: .674, top: .355, bottom: .47, height: .115 };
  const [person] = splitMasks([{ mask, shape: tiny }], smallWidth, smallHeight);
  assert.ok(person.area < .003);
  assert.ok(person.h >= 44);
});
test("a focused crop projects its landmark and mask back into the camera frame", () => {
  const crop = { x: 70, y: 35, w: 50, h: 50 };
  const [pose] = projectPose([{ x: .5, y: .9, visibility: .9 }], crop, 200, 100);
  assert.deepEqual(pose, { x: .475, y: .8, visibility: .9 });
  const mask = projectMask(Float32Array.of(0, 1, 1, 0), 2, 2, crop, 200, 100);
  assert.equal(mask[50 * 200 + 108], 255);
  assert.equal(mask[50 * 200 + 75], 0);
  assert.equal(mask[85 * 200 + 90], 0);
  assert.equal(subjectCrop({ left: .3, right: .4, top: .2, bottom: .9 }, 200, 100).w, 87);
});
test("a second mask can refine a thin boundary and cannot replace the actor", () => {
  const w = 12, h = 12, crop = { x: 0, y: 0, w, h };
  const pose = new Uint8Array(w * h);
  for (let y = 3; y <= 9; y++) pose.fill(230, y * w + 4, y * w + 8);
  const bystander = new Float32Array(w * h).fill(1, 0, w * 2);
  assert.equal(blendDetail(pose, { width:w, height:h, data:bystander }, w, h, crop), false);
  const detail = Float32Array.from(pose, alpha => alpha / 255);
  detail[5 * w + 8] = .96;
  assert.equal(blendDetail(pose, { width:w, height:h, data:detail }, w, h, crop), true);
  assert.equal(pose[5 * w + 7], 230);
  assert.ok(pose[5 * w + 8] > 80);
  assert.equal(pose[5 * w + 9], 0);
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
test("a slow inference can reconnect the same visitor without showing a stale mask", () => {
  const tracks = new Tracks();
  const [first] = tracks.update([obs(.51)], 0);
  const [afterWarmup] = tracks.update([obs(.52)], 740, 3, 570);
  assert.equal(afterWarmup.id, first.id);
  assert.deepEqual(tracks.update([], 850, 3, 570), []);
  assert.notEqual(tracks.update([obs(.52)], 1900, 3, 570)[0].id, first.id);
});
test('only one shadow retains its raised arm and releases it after that person lowers the arm', () => {
  const beat = new ShadowHold();
  const pose = (id, x, wristY) => ({id, shape:{center:{x,y:.46},height:.65,wrists:[{x,y:wristY},null]}});
  const person = pose(1,.27,.28), neighbor = pose(2,.65,.63);
  beat.update([person,neighbor],0,p => p);
  beat.update([person,neighbor],210,p => p);
  beat.update([pose(1,.27,.62),neighbor],320,p => p);
  assert.equal(beat.hold.id,1);
  assert.equal(beat.hold.pose.shape.wrists[0].y,.28);
  assert.equal(beat.blend(570),1);
  assert.ok(beat.blend(760)>0 && beat.blend(760)<1);
  assert.equal(beat.blend(830),0);
  assert.equal(beat.hold,null);

  beat.update([person,neighbor],3400,p => p);
  beat.update([person,neighbor],3600,p => p);
  beat.update([neighbor],3700,p => p);
  assert.equal(beat.hold,null);

  beat.update([person,neighbor],4200,p => p);
  beat.update([person,neighbor],4400,p => p);
  beat.update([pose(1,.27,.43),neighbor],4800,p => p);
  beat.update([pose(1,.27,.62),neighbor],5300,p => p);
  assert.equal(beat.hold,null);
});
