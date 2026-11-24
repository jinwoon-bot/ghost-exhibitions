let landmarker, splitMasks, geometry, files, delegate, people;
let previousTime = -1;
const meter = new OffscreenCanvas(32, 24);
const meterCtx = meter.getContext("2d", { willReadFrequently: true });
const lifted = new OffscreenCanvas(1, 1);
const liftedCtx = lifted.getContext("2d");
const local = resource => new URL("../../shared/mediapipe/" + resource, self.location.href).href;

async function initialize(message) {
  ({ geometry, splitMasks } = await import("./masks.mjs"));
  importScripts(local("vendor/vision_bundle.js"));
  const vision = self.Vision || self.vision;
  files = await vision.FilesetResolver.forVisionTasks(local("vendor/wasm"));
  const create = backend => vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: local("models/pose_landmarker_lite.task"), delegate: backend },
    runningMode: "VIDEO", numPoses: message.people,
    minPoseDetectionConfidence: .44, minPosePresenceConfidence: .43,
    minTrackingConfidence: .5, outputSegmentationMasks: true,
  });
  delegate = message.delegate === "GPU" ? "GPU" : "CPU";
  people = message.people;
  try { landmarker = await create(delegate); }
  catch (error) {
    if (delegate !== "GPU") throw error;
    delegate = "CPU";
    landmarker = await create(delegate);
  }
  postMessage({ type: "ready", delegate });
}

function measure(bitmap) {
  meterCtx.drawImage(bitmap, 0, 0, 32, 24);
  const pixels = meterCtx.getImageData(0, 0, 32, 24).data;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    total += pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
  }
  return total / (32 * 24);
}

async function segment(message) {
  const { bitmap, seq, sourceMs } = message;
  let result;
  try {
    if (!landmarker || sourceMs <= previousTime) {
      postMessage({ type: "skip", seq });
      return;
    }
    previousTime = sourceMs;
    const started = performance.now();
    if (message.people !== people) {
      await landmarker.setOptions({ numPoses: message.people });
      people = message.people;
    }
    const brightness = measure(bitmap);
    let input = bitmap;
    if (brightness >= 4 && brightness < 68) {
      if (lifted.width !== bitmap.width || lifted.height !== bitmap.height) {
        lifted.width = bitmap.width;
        lifted.height = bitmap.height;
      }
      liftedCtx.filter = `brightness(${Math.min(2.15, 88 / brightness)}) contrast(1.05)`;
      liftedCtx.drawImage(bitmap, 0, 0);
      input = lifted;
    }
    const candidates = [];
    let width = bitmap.width, height = bitmap.height;
    if (brightness >= 4) {
      result = landmarker.detectForVideo(input, sourceMs);
      for (const [index, item] of (result.segmentationMasks || []).entries()) {
        const shape = geometry(result.landmarks[index] || []);
        if (!shape) continue;
        if (candidates.length && (item.width !== width || item.height !== height)) continue;
        width = item.width;
        height = item.height;
        const values = item.getAsFloat32Array();
        const mask = new Uint8Array(values.length);
        for (let i = 0; i < values.length; i++) mask[i] = Math.round(Math.min(1, Math.max(0, values[i])) * 255);
        if (mask.length === width * height) candidates.push({ mask, shape });
      }
    }
    const subjects = splitMasks(candidates, width, height, message.threshold);
    postMessage({ type: "result", seq, sourceMs, width, height, people: subjects,
      brightness, inferenceMs: performance.now() - started }, subjects.map(person => person.alpha.buffer));
  } catch (error) {
    postMessage({ type: "error", seq, message: String(error.message || error) });
  } finally {
    result?.close?.();
    bitmap.close();
  }
}
self.onmessage = ({ data: message }) => {
  if (message.type === "init") initialize(message).catch(error => postMessage({ type: "error", message: error.message }));
  else if (message.type === "frame") segment(message);
};
