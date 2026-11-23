export const defaults = {
  sensitivity: 1.15,
  smoothing: 0.24,
  maxMovement: 6,
  hold: 1,
  returnTime: 1.6,
  deadband: 0.012,
  mirror: true,
  debug: false,
  sound: false,
  autoDemo: true,
  fps: 10,
  deviceId: "",
  cameraCenter: 0.5,
  viewerMinWidth: 0.035,
  viewerSwitchRatio: 1.35,
  viewerSwitchDelay: 0.65,
  viewerLostGrace: 0.65,
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function sanitize(o = {}) {
  const c = { ...defaults };
  for (const [k, a, b] of [
    ["sensitivity", 0.25, 2.5],
    ["smoothing", 0.04, 1.2],
    ["maxMovement", 1, 10],
    ["hold", 0.2, 3],
    ["returnTime", 0.4, 5],
    ["deadband", 0.004, 0.05],
    ["fps", 5, 15],
    ["cameraCenter", 0.15, 0.85],
    ["viewerMinWidth", 0.025, 0.2],
    ["viewerSwitchRatio", 1.05, 2],
    ["viewerSwitchDelay", 0.2, 2],
    ["viewerLostGrace", 0.2, 1.5],
  ])
    if (Number.isFinite(Number(o[k]))) c[k] = clamp(Number(o[k]), a, b);
  for (const k of ["mirror", "debug", "sound", "autoDemo"])
    if (typeof o[k] === "boolean") c[k] = o[k];
  if (typeof o.deviceId === "string") c.deviceId = o.deviceId.slice(0, 300);
  return c;
}
export class Gaze {
  constructor(config = {}) {
    this.config = sanitize(config);
    this.value = 0;
    this.target = 0;
    this.lastSeen = -Infinity;
    this.acceptedX = null;
    this.mode = "center";
  }
  configure(c) {
    this.config = sanitize(c);
  }
  observe(x, now) {
    if (!Number.isFinite(x)) return;
    this.lastSeen = now;
    this.mode = "follow";
    x = clamp(x, 0, 1);
    if (
      this.acceptedX === null ||
      Math.abs(x - this.acceptedX) >= this.config.deadband
    ) {
      this.acceptedX = x;
      this.target = clamp(
        (x - this.config.cameraCenter) * 2 * this.config.sensitivity,
        -1,
        1,
      );
    }
  }
  step(now, dt) {
    const age = (now - this.lastSeen) / 1000;
    if (age > this.config.hold) {
      this.target = 0;
      this.acceptedX = null;
      this.mode = "return";
    } else if (age > 0.35) this.mode = "hold";
    const tau =
      this.mode === "return" ? this.config.returnTime : this.config.smoothing;
    this.value +=
      (this.target - this.value) *
      (1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) / tau));
    if (Math.abs(this.value - this.target) < 0.0006) this.value = this.target;
    return this.value;
  }
  reset() {
    this.value = this.target = 0;
    this.lastSeen = -Infinity;
    this.acceptedX = null;
    this.mode = "center";
  }
}
