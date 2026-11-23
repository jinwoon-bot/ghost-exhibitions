export const defaults = {
  sensitivity: 1.15,
  smoothing: 0.42,
  maxMovement: 8,
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
  viewerPolicy: "nearest",
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function sanitize(o = {}) {
  const c = { ...defaults };
  for (const [k, a, b] of [
    ["sensitivity", 0.25, 2.5],
    ["smoothing", 0.04, 1.2],
    ["maxMovement", 1, 40],
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
  if (o.viewerPolicy === "center") c.viewerPolicy = "center";
  return c;
}
export class Gaze {
  constructor(config = {}) {
    this.config = sanitize(config);
    this.value = 0;
    this.velocity = 0;
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
    if (age > this.config.hold && this.mode !== "center") {
      this.target = 0;
      this.acceptedX = null;
      this.mode = "return";
    } else if (age > 0.35 && this.mode === "follow") this.mode = "hold";
    const settlingTime =
      this.mode === "return" ? this.config.returnTime : this.config.smoothing;
    const delta = clamp(dt, 0, 0.1);
    const rate = 3.89 / settlingTime;
    const offset = this.value - this.target;
    const drive = this.velocity + rate * offset;
    const damping = Math.exp(-rate * delta);
    const next = (offset + drive * delta) * damping;
    this.velocity = (this.velocity - rate * drive * delta) * damping;
    this.value = clamp(this.target + next, -1, 1);
    if (offset * next < 0 || (Math.abs(next) < 0.0006 && Math.abs(this.velocity) < 0.004)) {
      this.value = this.target;
      this.velocity = 0;
      if (this.mode === "return") this.mode = "center";
    }
    return this.value;
  }
  reset() {
    this.value = this.target = 0;
    this.velocity = 0;
    this.lastSeen = -Infinity;
    this.acceptedX = null;
    this.mode = "center";
  }
}
