const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = t => t * t * (3 - 2 * t);
const usable = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && (point.visibility ?? 1) >= .35;
const inFrame = point => usable(point) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;

export function geometry(landmarks) {
  const torso = [11, 12, 23, 24].map(index => landmarks[index]).filter(inFrame);
  if (torso.length < 2) return null;
  const points = landmarks.filter(inFrame);
  const extent = key => [Math.min(...points.map(p => p[key])), Math.max(...points.map(p => p[key]))];
  const [left, right] = extent("x");
  const [top, bottom] = extent("y");
  const center = {
    x: clamp(torso.reduce((sum, p) => sum + p.x, 0) / torso.length, 0, 1),
    y: clamp(torso.reduce((sum, p) => sum + p.y, 0) / torso.length, 0, 1),
  };
  const feet = [27, 28, 29, 30, 31, 32].map(index => landmarks[index]).filter(inFrame);
  return {
    center, left, right, top, bottom,
    height: clamp(bottom - top, .07, 1.2),
    feet: feet.length ? { x: feet.reduce((sum, p) => sum + p.x, 0) / feet.length, y: Math.max(...feet.map(p => p.y)) } : null,
    wrists: [15, 16].map(index => inFrame(landmarks[index]) ? { x: landmarks[index].x, y: landmarks[index].y } : null),
  };
}

export function splitMasks(people, width, height, threshold = .18, rgb = null) {
  if (!people.length || !width || !height) return [];
  const size = width * height;
  const owners = new Uint8Array(size).fill(255);
  const confidence = new Uint8Array(size);
  const queue = new Int32Array(size);
  const minimum = Math.round(clamp(threshold, .1, .35) * 255);
  const lookup = Uint8Array.from({ length: 256 }, (_, value) =>
    Math.round(255 * smooth(clamp((value - minimum) / (189 - minimum), 0, 1))));
  const columns = new Float32Array(width);
  const rows = new Float32Array(height);
  for (let x = 0; x < width; x++) columns[x] = (x + .5) / width;
  for (let y = 0; y < height; y++) rows[y] = (y + .5) / height;
  const regions = people.map(({ shape }) => {
    const padX = clamp(shape.height * .15, .04, .14);
    const padY = clamp(shape.height * .10, .035, .09);
    return {
      x0: Math.floor((shape.left - padX) * width), x1: Math.ceil((shape.right + padX) * width),
      y0: Math.floor((shape.top - padY) * height), y1: Math.ceil((shape.bottom + padY) * height),
    };
  });
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      const index = offset + x;
      let best = -Infinity, owner = -1, raw = 0;
      for (let i = 0; i < people.length; i++) {
        const value = people[i].mask[index];
        if (value <= minimum) continue;
        const region = regions[i];
        const outside = x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1;
        // A strong mask may extend beyond unreliable foot or wrist landmarks.
        if (outside && value < Math.max(110, minimum + 38)) continue;
        const p = people[i].shape;
        const horizontal = Math.max(0, p.left - columns[x], columns[x] - p.right);
        const vertical = Math.max(0, p.top - rows[y], rows[y] - p.bottom);
        const cost = Math.abs(columns[x] - p.center.x) * 22 + Math.min(39, (horizontal + vertical) * 85);
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
    }
  }
  return people.flatMap(({ shape }, owner) => {
    const bounds = connectedBody(shape, owner, owners, confidence, queue, width, height);
    if (!bounds) return [];
    const [left, top, right, bottom] = bounds;
    if (right - left < 5 || bottom - top < 10) return [];
    const w = right - left + 1, h = bottom - top + 1;
    const alpha = new Uint8Array(w * h);
    let area = 0;
    const member = owner + 128;
    const at = index => owners[index] === member ? confidence[index] : 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const i = y * width + x;
        if (owners[i] !== member) continue;
        const current = confidence[i];
        const value = current >= 238 ? current : refineEdge(current, i, x, y, width, height, at, rgb);
        alpha[(y - top) * w + x - left] = value;
        if (value >= 112) area++;
      }
    }
    if (area < size * .003 || area > size * .82) return [];
    const expectedX = (shape.feet?.x ?? shape.center.x) * width - left;
    const expectedY = shape.feet ? clamp(shape.feet.y * height - top, 0, h - 1) : h - 1;
    const anchor = findContact(alpha, w, h, expectedX, expectedY);
    const framing = top < height * .02 || bottom >= height * .98 ? "edge" : shape.feet &&
      bottom >= shape.feet.y * height - Math.max(3, h * .08) ? "feet" : "partial";
    return [{ x: left, y: top, w, h, alpha, area: area / size, shape, framing,
      anchor: { x: (left + anchor.x) / width, y: (top + anchor.y) / height } }];
  });
}

function connectedBody(shape, owner, owners, confidence, queue, width, height) {
  const cx = Math.round(shape.center.x * (width - 1)), cy = Math.round(shape.center.y * (height - 1));
  const rx = Math.max(4, Math.ceil(width * Math.min(.11, shape.height * .20)));
  const ry = Math.max(5, Math.ceil(height * Math.min(.14, shape.height * .22)));
  let seed = -1, best = -Infinity;
  for (let y = Math.max(0, cy - ry); y <= Math.min(height - 1, cy + ry); y++) {
    for (let x = Math.max(0, cx - rx); x <= Math.min(width - 1, cx + rx); x++) {
      const i = y * width + x;
      if (owners[i] !== owner || confidence[i] < 95) continue;
      const score = confidence[i] - Math.abs(x - cx) * 35 / rx - Math.abs(y - cy) * 35 / ry;
      if (score > best) { best = score; seed = i; }
    }
  }
  if (seed < 0) return null;
  let end = 0;
  const add = index => {
    if (owners[index] !== owner) return;
    owners[index] = owner + 128;
    queue[end++] = index;
  };
  add(seed);
  let left = width, top = height, right = -1, bottom = -1;
  for (let start = 0; start < end; start++) {
    const i = queue[start], x = i % width, y = (i - x) / width;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x > 0) add(i - 1);
    if (x + 1 < width) add(i + 1);
    if (y > 0) add(i - width);
    if (y + 1 < height) add(i + width);
  }
  return [left, top, right, bottom];
}

function refineEdge(value, index, x, y, width, height, alpha, rgb) {
  let sum = value * 3, total = 3;
  const p = index * 4;
  const include = neighbor => {
    const q = neighbor * 4;
    const difference = rgb ? Math.abs(rgb[p] - rgb[q]) + Math.abs(rgb[p + 1] - rgb[q + 1]) + Math.abs(rgb[p + 2] - rgb[q + 2]) : 0;
    const weight = 1 / (1 + difference * .075);
    sum += alpha(neighbor) * weight;
    total += weight;
  };
  if (x > 0) include(index - 1);
  if (x + 1 < width) include(index + 1);
  if (y > 0) include(index - width);
  if (y + 1 < height) include(index + width);
  return Math.round(sum / total);
}

function findContact(alpha, width, height, desiredX, desiredY) {
  let best = -Infinity, contact = { x: width / 2, y: height - 1 };
  for (let y = Math.floor(Math.min(height * .73, desiredY * .88)); y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] < 145) continue;
      const score = y - Math.abs(x - desiredX) * .7 - Math.max(0, y - desiredY) * 1.7;
      if (score > best) {
        best = score;
        contact = { x, y };
      }
    }
  }
  return contact;
}
