/* Local face tracking with a pose fallback. Frames stay inside this worker. */
let detector, pose, canvas, ctx, enhance, bodyCandidates;
let lastTime = -1, lastPose = -Infinity;

const local = path => new URL(path, self.location.href).href;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function initialize() {
  ({ enhanceLowLight: enhance } = await import("../portrait/lib/camera-input.js"));
  ({ bodyCandidates } = await import("../portrait/lib/body-candidates.js"));
  importScripts(local("../../shared/mediapipe/vendor/vision_bundle.js"));
  const vision = self.Vision || self.vision;
  const files = await vision.FilesetResolver.forVisionTasks(local("../../shared/mediapipe/vendor/wasm"));
  detector = await vision.FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: local("../portrait/models/face_detector.tflite"), delegate: "CPU" },
    runningMode: "VIDEO", minDetectionConfidence: .4, minSuppressionThreshold: .3,
  });
  pose = await vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: local("../../shared/mediapipe/models/pose_landmarker_lite.task"), delegate: "CPU" },
    runningMode: "VIDEO", numPoses: 3,
    minPoseDetectionConfidence: .4, minPosePresenceConfidence: .4, minTrackingConfidence: .4,
    outputSegmentationMasks: false,
  });
}

function findCandidates(bitmap, input) {
  const { width, height } = bitmap;
  if (!canvas) {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  const light = enhance(pixels.data);
  if (light.unusable) return { faces: [], light, posed: false };
  if (light.gamma < .995) ctx.putImageData(pixels, 0, 0);
  const faces = (detector.detectForVideo(canvas, input.sourceMs).detections || []).map(detection => {
    const box = detection.boundingBox;
    return {
      x: (box.originX + box.width / 2) / width,
      y: (box.originY + box.height / 2) / height,
      w: box.width / width, h: box.height / height,
      score: detection.categories?.[0]?.score || 0, kind: "face",
    };
  });
  const usable = faces.some(face => {
    if (face.score < .42 || face.w < input.minWidth) return false;
    if (!input.target) return Math.abs(face.x - .5) <= input.zone / 2;
    const scale = face.w * face.h / (input.target.w * input.target.h);
    return scale >= .48 && scale <= 2.1 && distance(face, input.target) < .14;
  });
  if (usable || input.sourceMs - lastPose < 260) return { faces, light, posed: false };

  lastPose = input.sourceMs;
  const bodies = bodyCandidates(pose.detectForVideo(canvas, input.sourceMs))
    .filter(body => !faces.some(face => face.score >= .42 && distance(body, face) < .12));
  return { faces: faces.concat(bodies), light, posed: true };
}

self.onmessage = async ({ data: input }) => {
  if (input.type === "init") {
    try {
      await initialize();
      postMessage({ type: "ready" });
    } catch (error) {
      postMessage({ type: "error", message: String(error.message || error) });
    }
    return;
  }
  if (input.type !== "frame") return;
  const bitmap = input.bitmap;
  try {
    if (!detector || !pose || input.sourceMs <= lastTime) {
      postMessage({ type: "skip" });
      return;
    }
    lastTime = input.sourceMs;
    const started = performance.now();
    const result = findCandidates(bitmap, input);
    postMessage({ ...result, type: "result", sourceMs: input.sourceMs, inferenceMs: performance.now() - started });
  } catch (error) {
    postMessage({ type: "frame-error", message: String(error.message || error) });
  } finally {
    bitmap?.close();
  }
};
