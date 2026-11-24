import test from "node:test";
import assert from "node:assert/strict";
import { Audience, frameInterval, lostMs } from "../site/works/human-portrait/audience.mjs";
import { enhanceLowLight } from "../site/works/portrait/lib/camera-input.js";

const face = (x, w = .13, fields = {}) => ({ x, y: .42, w, h: w * 1.5, score: .8, kind: "face", ...fields });
const acquire = (tracker, faces, now = 0) => {
  assert.equal(tracker.update(faces, now), null);
  return tracker.update(faces, now + 260);
};

test("central selection ignores edges and stable visitors win over passersby", () => {
  const tracker = new Audience();
  const central = face(.48), passing = face(.76, .28);
  assert.equal(acquire(tracker, [passing, central]).x, .48);
  assert.equal(tracker.update([passing, face(.44)], 390).x, .44);
  assert.equal(tracker.update([passing, face(.39)], 530).x, .39);
  assert.equal(tracker.selections, 1);
  assert.equal(new Audience().update([face(.05, .3)], 500), null);
});

test("nearer mode and stable targets", () => {
  const tracker = new Audience();
  tracker.configure({ priority: "nearest" });
  assert.equal(acquire(tracker, [face(.51), face(.71, .25)]).x, .71);
  assert.equal(tracker.update([face(.71, .25), face(.4, .4)], 420).x, .71);
});

test("overlap and brief misses preserve the target, then allow a new selection", () => {
  const tracker = new Audience();
  acquire(tracker, [face(.41)]);
  assert.equal(tracker.update([face(.405), face(.415)], 530), null);
  assert.equal(tracker.update([], 800), null);
  assert.equal(tracker.update([face(.42)], 1050).x, .42);
  assert.equal(tracker.selections, 1);
  assert.equal(tracker.update([face(.69)], 1050 + lostMs - 1), null);
  assert.equal(acquire(tracker, [face(.69)], 1050 + lostMs).x, .69);
  assert.equal(tracker.selections, 2);
});

test("a consistent torso can carry the gaze while ambiguous or tiny observations do not", () => {
  const tracker = new Audience();
  acquire(tracker, [face(.48)]);
  assert.equal(tracker.update([face(.47, .12, {kind:"body"})], 390).kind, "body");
  assert.equal(tracker.update([face(.49, .02), face(.5, .12, {score:.3})], 450), null);
  assert.equal(tracker.selections, 1);
});

test("real low-light preprocessing brightens dim input and rejects unusable darkness", () => {
  const pixels = value => Uint8ClampedArray.from({length:64}, (_,i) => i % 4 === 3 ? 255 : value);
  const dim = pixels(27);
  const bad = pixels(2);
  assert.equal(enhanceLowLight(dim).unusable, false);
  assert.ok(dim[0] > 27);
  assert.equal(enhanceLowLight(bad).unusable, true);
  assert.equal(frameInterval(30),100);
  assert.ok(frameInterval(250) > frameInterval(140));
  assert.equal(frameInterval(900),450);
});
