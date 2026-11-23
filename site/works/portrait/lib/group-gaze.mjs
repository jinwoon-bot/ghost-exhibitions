const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

export function updateAttention(previous, isPresent, transitionTime, seconds) {
  const target = isPresent ? 1 : 0;
  const remaining = (previous - target) *
    Math.exp(-5 * Math.max(0, Math.min(seconds, .1)) / transitionTime);
  return Math.abs(remaining) < .001 ? target : target + remaining;
}

// The same viewer is evaluated relative to each frame. At rest every portrait
// returns to the pupil placement in its original image.
export function portraitShift(value, attention, position, maxMovement) {
  const convergence = position * .42 * attention;
  return clamp(value - convergence, 1) * maxMovement;
}
