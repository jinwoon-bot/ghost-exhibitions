const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function subjectCrop(shape, width, height) {
  const side = Math.max(24, Math.ceil(Math.max(
    (shape.right - shape.left) * width, (shape.bottom - shape.top) * height,
  ) * 1.24));
  return {
    x: Math.round((shape.left + shape.right) * width / 2 - side / 2),
    y: Math.round((shape.top + shape.bottom) * height / 2 - side / 2),
    w: side, h: side,
  };
}

export function projectPose(landmarks, crop, width, height) {
  return landmarks.map(point => ({
    ...point, x: (crop.x + point.x * crop.w) / width, y: (crop.y + point.y * crop.h) / height,
  }));
}

function region(crop, width, height, maskWidth, maskHeight) {
  const left = Math.max(0, crop.x), top = Math.max(0, crop.y);
  const right = Math.min(width, crop.x + crop.w), bottom = Math.min(height, crop.y + crop.h);
  const columns = Int32Array.from({ length: Math.max(0, right - left) }, (_, i) =>
    clamp(Math.floor((left + i + .5 - crop.x) / crop.w * maskWidth), 0, maskWidth - 1));
  const rows = Int32Array.from({ length: Math.max(0, bottom - top) }, (_, i) =>
    maskWidth * clamp(Math.floor((top + i + .5 - crop.y) / crop.h * maskHeight), 0, maskHeight - 1));
  return { left, top, columns, rows };
}

export function projectMask(values, maskWidth, maskHeight, crop, width, height) {
  const { left, top, columns, rows } = region(crop, width, height, maskWidth, maskHeight);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < rows.length; y++) {
    const offset = (top + y) * width + left;
    for (let x = 0; x < columns.length; x++) {
      mask[offset + x] = Math.round(clamp(values[rows[y] + columns[x]], 0, 1) * 255);
    }
  }
  return mask;
}

export function blendDetail(mask, detail, width, height, crop) {
  const { left, top, columns, rows } = region(crop, width, height, detail.width, detail.height);
  let poseCount = 0, detailCount = 0, overlap = 0;
  for (let y = 0; y < rows.length; y++) {
    const offset = (top + y) * width + left;
    for (let x = 0; x < columns.length; x++) {
      const pose = mask[offset + x] >= 128;
      const body = detail.data[rows[y] + columns[x]] >= .55;
      poseCount += pose;
      detailCount += body;
      overlap += pose && body;
    }
  }
  // Reject portraits of bystanders and unreliable full-body cutouts.
  if (!poseCount || overlap < poseCount * .62 || overlap < detailCount * .53) return false;
  const original = mask.slice();
  const step = Math.max(1, Math.min(5, Math.round(crop.w * .014)));
  for (let y = 0; y < rows.length; y++) {
    const py = top + y, offset = py * width + left;
    for (let x = 0; x < columns.length; x++) {
      const px = left + x, i = offset + x, pose = original[i];
      const body = Math.round(255 * clamp(detail.data[rows[y] + columns[x]], 0, 1));
      if (pose >= 190) continue;
      if (pose < 40) {
        if (body < 164) continue;
        const support = Math.max(
          px >= step ? original[i - step] : 0,
          px + step < width ? original[i + step] : 0,
          py >= step ? original[i - step * width] : 0,
          py + step < height ? original[i + step * width] : 0,
        );
        if (support < 95) continue;
      }
      mask[i] = Math.round(pose * .56 + body * .44);
    }
  }
  return true;
}
