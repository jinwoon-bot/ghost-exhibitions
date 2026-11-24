const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = t => t * t * (3 - 2 * t);
const usable = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= .35;

export function geometry(landmarks) {
  const torso = [11, 12, 23, 24].map(index => landmarks[index]).filter(usable);
  if (torso.length < 2) return null;
  const points = landmarks.filter(usable);
  const extent = key => [Math.min(...points.map(p => p[key])), Math.max(...points.map(p => p[key]))];
  const [left, right] = extent("x");
  const [top, bottom] = extent("y");
  const center = {
    x: clamp(torso.reduce((sum, p) => sum + p.x, 0) / torso.length, 0, 1),
    y: clamp(torso.reduce((sum, p) => sum + p.y, 0) / torso.length, 0, 1),
  };
  const feet = [27, 28, 29, 30, 31, 32].map(index => landmarks[index]).filter(usable);
  return {
    center, left, right, top, bottom,
    height: clamp(bottom - top, .07, 1.2),
    feet: feet.length ? { x: feet.reduce((sum, p) => sum + p.x, 0) / feet.length, y: Math.max(...feet.map(p => p.y)) } : null,
    wrists: [15, 16].map(index => usable(landmarks[index]) ? { x: landmarks[index].x, y: landmarks[index].y } : null),
  };
}

export function splitMasks(people, width, height, threshold = .18) {
  if (!people.length || !width || !height) return [];
  const size = width * height;
  const owners = new Uint8Array(size).fill(255);
  const confidence = new Uint8Array(size);
  const boxes = people.map(() => [width, height, -1, -1]);
  const minimum = Math.round(clamp(threshold, .1, .35) * 255);
  const lookup = Uint8Array.from({ length: 256 }, (_, value) =>
    Math.round(255 * smooth(clamp((value - minimum) / (189 - minimum), 0, 1))));
  const columns = new Float32Array(width);
  const rows = new Float32Array(height);
  for (let x = 0; x < width; x++) columns[x] = (x + .5) / width;
  for (let y = 0; y < height; y++) rows[y] = (y + .5) / height;
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      const index = offset + x;
      let best = -Infinity, owner = -1, raw = 0;
      for (let i = 0; i < people.length; i++) {
        const value = people[i].mask[index];
        if (value <= minimum) continue;
        const p = people[i].shape;
        const horizontal = Math.max(0, p.left - columns[x], columns[x] - p.right);
        const vertical = Math.max(0, p.top - rows[y], rows[y] - p.bottom);
        const cost = Math.abs(columns[x] - p.center.x) * 22 + (horizontal + vertical) * 85;
        const score = value - cost;
        if (score > best) {
          best = score;
          raw = value;
          owner = i;
        }
      }
      const alpha = lookup[raw];
      if (owner < 0 || !alpha) continue;
      owners[index] = owner;
      confidence[index] = alpha;
      const box = boxes[owner];
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  return people.flatMap(({ shape }, owner) => {
    const [left, top, right, bottom] = boxes[owner];
    if (right - left < 5 || bottom - top < 10) return [];
    const w = right - left + 1, h = bottom - top + 1;
    const alpha = new Uint8Array(w * h);
    let area = 0;
    const at = index => owners[index] === owner ? confidence[index] : 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const i = y * width + x;
        if (owners[i] !== owner) continue;
        const current = confidence[i];
        const nearby = (x > 0 ? at(i - 1) : 0) + (x < width - 1 ? at(i + 1) : 0) +
          (y > 0 ? at(i - width) : 0) + (y < height - 1 ? at(i + width) : 0);
        // Preserve a high-confidence hand edge. Only soften uncertain pixels.
        const value = current >= 235 ? current : Math.round(current * .76 + nearby * .06);
        alpha[(y - top) * w + x - left] = value;
        if (value >= 112) area++;
      }
    }
    if (area < size * .003 || area > size * .82) return [];
    const anchor = findContact(alpha, w, h, (shape.feet?.x ?? shape.center.x) * width - left);
    return [{ x: left, y: top, w, h, alpha, area: area / size, shape,
      anchor: { x: (left + anchor.x) / width, y: (top + anchor.y) / height } }];
  });
}

function findContact(alpha, width, height, desiredX) {
  let best = -Infinity, contact = { x: width / 2, y: height - 1 };
  for (let y = Math.floor(height * .73); y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < 145) continue;
      const score = y - Math.abs(x - desiredX) * .5;
      if (score > best) {
        best = score;
        contact = { x, y };
      }
    }
  }
  return contact;
}
