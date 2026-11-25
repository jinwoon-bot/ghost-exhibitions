const sampleOffsets = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  [-2, 0], [2, 0], [0, -2], [0, 2],
];

// Fit a mixed edge pixel between nearby foreground and background samples.
// A low-contrast edge keeps the segmentation model's original matte.
export function cleanCutout(rgba, pixels, width, height) {
  const alpha = pixels.slice();
  const color = new Uint8Array(pixels.length * 3);
  const foregrounds = new Uint32Array(4), backgrounds = new Uint32Array(4);
  for (let i = 0; i < pixels.length; i++) {
    const mask = pixels[i];
    if (mask < 16) { alpha[i] = 0; continue; }

    const pixel = i * 4;
    const rgb = i * 3;
    color[rgb] = rgba[pixel];
    color[rgb + 1] = rgba[pixel + 1];
    color[rgb + 2] = rgba[pixel + 2];
    if (mask >= 245) continue;

    const x = i % width;
    const y = Math.floor(i / width);
    let foregroundCount = 0;
    let backgroundCount = 0;
    for (const [dx, dy] of sampleOffsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighbor = ny * width + nx;
      if (pixels[neighbor] >= 245 && foregroundCount < 4) foregrounds[foregroundCount++] = neighbor * 4;
      if (pixels[neighbor] <= 12 && backgroundCount < 4) backgrounds[backgroundCount++] = neighbor * 4;
    }

    const model = mask / 255;
    let foreground = -1, background = -1, guess = model, best = Infinity;
    for (let f = 0; f < foregroundCount; f++) for (let b = 0; b < backgroundCount; b++) {
      const fg = foregrounds[f], bg = backgrounds[b];
      const red = rgba[fg] - rgba[bg];
      const green = rgba[fg + 1] - rgba[bg + 1];
      const blue = rgba[fg + 2] - rgba[bg + 2];
      const separation = red * red + green * green + blue * blue;
      if (separation < 1800) continue;
      const observedRed = rgba[pixel] - rgba[bg];
      const observedGreen = rgba[pixel + 1] - rgba[bg + 1];
      const observedBlue = rgba[pixel + 2] - rgba[bg + 2];
      const fit = (observedRed * red + observedGreen * green + observedBlue * blue) / separation;
      if (fit < -.15 || fit > 1.15) continue;
      const error = (observedRed - fit * red) ** 2 +
        (observedGreen - fit * green) ** 2 + (observedBlue - fit * blue) ** 2;
      if (error > 1800 + separation * .07) continue;
      const score = error + (fit - model) ** 2 * 1700 + (f + b) * 40;
      if (score >= best) continue;
      best = score;
      foreground = fg;
      background = bg;
      guess = Math.max(0, Math.min(1, fit));
    }
    if (foreground < 0) continue;
    const coverage = model + Math.max(-.42, Math.min(.26, (guess - model) * .68));
    alpha[i] = Math.round(coverage * 255);
    if (alpha[i] < 16) {
      alpha[i] = color[rgb] = color[rgb + 1] = color[rgb + 2] = 0;
      continue;
    }
    for (let channel = 0; channel < 3; channel++) {
      const correction = (rgba[foreground + channel] - rgba[background + channel]) * (1 - guess) * .70;
      color[rgb + channel] = Math.round(Math.max(0, Math.min(255, rgba[pixel + channel] + correction)));
    }
  }
  return { alpha, color };
}
