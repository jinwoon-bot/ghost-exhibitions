// Small spatial kernel + edge-only temporal filtering. No generated body geometry.
// Returns byte alpha; raw binary masks remain the source of motion/association.
export function refineMask(binary, width, height, previous, activity = 1) {
  const count = width * height;
  const horizontal = new Float32Array(count);
  const alpha = new Uint8Array(count);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      horizontal[row + x] =
        ((binary[row + Math.max(0, x - 1)] || 0) +
          2 * (binary[row + x] || 0) +
          (binary[row + Math.min(width - 1, x + 1)] || 0)) *
        63.75;
    }
  }
  const historyWeight = activity > 0.16 ? 0.06 : activity > 0.06 ? 0.16 : 0.32;
  const canBlend = previous?.length === count;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v =
        (horizontal[Math.max(0, y - 1) * width + x] +
          2 * horizontal[i] +
          horizontal[Math.min(height - 1, y + 1) * width + x]) /
        4;
      // Preserve opaque body interiors and clear newly empty background immediately.
      if (canBlend && v > 20 && v < 235 && previous[i] > 20)
        v = v * (1 - historyWeight) + previous[i] * historyWeight;
      alpha[i] = v < 16 ? 0 : v > 239 ? 255 : Math.round(v);
    }
  return alpha;
}
