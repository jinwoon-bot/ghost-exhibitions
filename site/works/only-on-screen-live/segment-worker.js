let landmarker, focusLandmarker, segmenter, vision, splitMasks, geometry, projectPose, projectMask, subjectCrop, blendDetail, files, delegate, people;
let detailRequested = false;
let previousTime = -1;
let searchIndex = 0, focusRegion = null, emptySince = null, lastSearch = -Infinity;
let frameWidth = 0, frameHeight = 0;
const meter = new OffscreenCanvas(32, 24);
const meterCtx = meter.getContext("2d", { willReadFrequently: true });
const lifted = new OffscreenCanvas(1, 1);
const liftedCtx = lifted.getContext("2d");
const detail = new OffscreenCanvas(1, 1);
const detailCtx = detail.getContext("2d", { willReadFrequently: true });
const cropImage = new OffscreenCanvas(256, 256);
const cropCtx = cropImage.getContext("2d", { alpha: false });
const local = resource => new URL("../../shared/mediapipe/" + resource, self.location.href).href;

function createPose(backend, runningMode, numPoses) {
  return vision.PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: local("models/pose_landmarker_lite.task"), delegate: backend },
    runningMode, numPoses,
    minPoseDetectionConfidence: runningMode === "IMAGE" ? .39 : .44,
    minPosePresenceConfidence: .43, minTrackingConfidence: .5, outputSegmentationMasks: true,
  });
}

async function initialize(message) {
  ({ geometry, splitMasks } = await import("./masks.mjs?v=distance-matte"));
  ({ projectPose, projectMask, subjectCrop, blendDetail } = await import("./subject-detail.mjs?v=distance-matte"));
  importScripts(local("vendor/vision_bundle.js"));
  vision = self.Vision || self.vision;
  files = await vision.FilesetResolver.forVisionTasks(local("vendor/wasm"));
  delegate = message.delegate === "GPU" ? "GPU" : "CPU";
  people = message.people;
  try { landmarker = await createPose(delegate, "VIDEO", people); }
  catch (error) {
    if (delegate !== "GPU") throw error;
    delegate = "CPU";
    landmarker = await createPose(delegate, "VIDEO", people);
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

function candidatesFrom(result, width, height, crop = { x: 0, y: 0, w: width, h: height }) {
  return (result.segmentationMasks || []).flatMap((item, index) => {
    const shape = geometry(projectPose(result.landmarks[index] || [], crop, width, height));
    if (!shape) return [];
    const values = item.getAsFloat32Array();
    const mask = projectMask(values, item.width, item.height, crop, width, height);
    return [{ shape, mask }];
  });
}

function drawCrop(input, crop) {
  cropCtx.imageSmoothingQuality = "high";
  cropCtx.fillStyle = "#32332f";
  cropCtx.fillRect(0, 0, 256, 256);
  cropCtx.drawImage(input, -crop.x * 256 / crop.w, -crop.y * 256 / crop.h,
    input.width * 256 / crop.w, input.height * 256 / crop.h);
}

async function focus(input, width, height, now) {
  emptySince ??= now;
  if (!focusRegion && (now - emptySince < 160 || now - lastSearch < 180)) return [];
  lastSearch = now;
  const positions = [.5, .235, .765];
  const cx = positions[searchIndex % positions.length];
  const cy = searchIndex % 6 < 3 ? .51 : .68;
  const w = Math.round(width * .48), h = Math.round(height * .65);
  const crop = focusRegion ?? {
    x: Math.max(0, Math.min(width - w, Math.round(cx * width - w / 2))),
    y: Math.max(0, Math.min(height - h, Math.round(cy * height - h / 2))), w, h,
  };
  if (!focusRegion) searchIndex++;
  let result;
  try {
    focusLandmarker ??= createPose("CPU", "IMAGE", 1).catch(() => null);
    const detector = await focusLandmarker;
    if (!detector) return [];
    drawCrop(input, crop);
    result = detector.detect(cropImage);
    const subjects = candidatesFrom(result, width, height, crop);
    focusRegion = subjects.length ? crop : null;
    return subjects;
  } catch {
    focusLandmarker = Promise.resolve(null);
    return [];
  } finally {
    result?.close?.();
  }
}

function refine(input, candidates, width, height) {
  // This extra pass is limited to one isolated subject to avoid borrowing a bystander's silhouette.
  if (candidates.length !== 1) return false;
  if (!detailRequested) {
    detailRequested = true;
    void vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL("./assets/selfie_segmenter.tflite", self.location.href).href, delegate: "CPU" },
      runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false,
    }).then(model => { segmenter = model; }).catch(() => {});
  }
  if (!segmenter) return false;
  const actor = candidates[0], crop = subjectCrop(actor.shape, width, height);
  let applied = false;
  try {
    drawCrop(input, crop);
    segmenter.segment(cropImage, result => {
      const mask = result.confidenceMasks?.at(-1);
      if (mask) applied = blendDetail(actor.mask,
        { data: mask.getAsFloat32Array(), width: mask.width, height: mask.height }, width, height, crop);
    });
  } catch {
    // Keep the current pose mask if the second model fails.
    segmenter.close();
    segmenter = null;
  }
  return applied;
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
    let candidates = [], focused = false;
    const { width, height } = bitmap;
    if (width !== frameWidth || height !== frameHeight) {
      frameWidth = width;
      frameHeight = height;
      focusRegion = null;
      emptySince = null;
    }
    if (brightness >= 4) {
      const tryFocusFirst = focusRegion && seq % 3 !== 0;
      if (tryFocusFirst) {
        candidates = await focus(input, width, height, sourceMs);
        focused = candidates.length > 0;
      }
      if (!focused) {
        result = landmarker.detectForVideo(input, sourceMs);
        candidates = candidatesFrom(result, width, height);
        if (candidates.length) {
          focusRegion = null;
          emptySince = null;
        } else if (!tryFocusFirst) {
          candidates = await focus(input, width, height, sourceMs);
          focused = candidates.length > 0;
        }
      }
    } else {
      focusRegion = null;
      emptySince = null;
    }
    const enhanced = message.edgeDetail && refine(input, candidates, width, height);
    let colors = null;
    if (candidates.length && message.edgeDetail) {
      if (detail.width !== width || detail.height !== height) {
        detail.width = width;
        detail.height = height;
      }
      detailCtx.drawImage(bitmap, 0, 0, width, height);
      colors = detailCtx.getImageData(0, 0, width, height).data;
    }
    const subjects = splitMasks(candidates, width, height, message.threshold, colors);
    postMessage({ type: "result", seq, sourceMs, width, height, people: subjects,
      brightness, focused, enhanced, inferenceMs: performance.now() - started }, subjects.map(person => person.alpha.buffer));
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
