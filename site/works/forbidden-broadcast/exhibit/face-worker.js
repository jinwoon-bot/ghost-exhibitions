let face;
let pose;
let poseLoading;
let sampleCanvas;
let sampleContext;
let gainCanvas;
let gainContext;
let lastPose = -Infinity;
let lastFace = -Infinity;
let fallback = null;

const root = new URL('../../../shared/mediapipe/', self.location.href);
const asset = path => new URL(path, root).href;

async function getPose(files, lib) {
  try {
    pose = await lib.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: asset('models/pose_landmarker_lite.task'), delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 3,
      minPoseDetectionConfidence: .48,
      minPosePresenceConfidence: .49,
      minTrackingConfidence: .42,
      outputSegmentationMasks: false,
    });
    self.postMessage({ type: 'backup-ready' });
  } catch (error) {
    self.postMessage({ type: 'backup-warning', message: error.message });
  }
}

function brightness(bitmap) {
  sampleContext.drawImage(bitmap, 0, 0, 32, 24);
  const points = sampleContext.getImageData(0, 0, 32, 24).data;
  let sum = 0;
  for (let i = 0; i < points.length; i += 4) sum += points[i] * .213 + points[i + 1] * .715 + points[i + 2] * .072;
  return sum / (points.length / 4);
}

function boxes(faces) {
  return faces.flatMap(points => {
    const left = points[234].x, right = points[454].x;
    const top = points[10].y, bottom = points[152].y;
    const x = (left + right) / 2, y = (top + bottom) / 2;
    const w = right - left, h = bottom - top;
    if (w < .038 || h < .038 || w > .96 || h > .96 || x < .01 || x > .99 || y < .01 || y > .99) return [];
    return [{ x, y, w, h, score: w, kind: 'face' }];
  });
}

function personCandidates(poses, ratio) {
  return poses.flatMap(points => {
    const [left, right] = [points[11], points[12]];
    if (!left || !right || Math.min(left.visibility, right.visibility) < .56) return [];
    const w = Math.hypot(left.x - right.x, (left.y - right.y) * ratio);
    const x = (left.x + right.x) / 2, y = (left.y + right.y) / 2;
    if (w < .105 || x < 0 || x > 1 || y < .02 || y > .99) return [];
    return [{ x, y, w, h: w, score: Math.min(.74, w * .50), kind: 'person' }];
  });
}

async function initialize() {
  importScripts(asset('vendor/vision_bundle.js'));
  const lib = self.Vision || self.vision;
  const files = await lib.FilesetResolver.forVisionTasks(asset('vendor/wasm'));
  face = await lib.FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: asset('models/face_landmarker.task'), delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 4,
    minFaceDetectionConfidence: .48,
    minFacePresenceConfidence: .55,
    minTrackingConfidence: .44,
  });
  sampleCanvas = new OffscreenCanvas(32, 24);
  sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
  self.postMessage({ type: 'ready' });
  poseLoading = () => getPose(files, lib);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try { await initialize(); }
    catch (error) { self.postMessage({ type: 'fatal', message: error.message }); }
    return;
  }
  if (data.type === 'backup') {
    const start = poseLoading;
    poseLoading = null;
    if (start) await start();
    return;
  }
  const { bitmap, now, lowLight } = data;
  try {
    if (!face || now <= lastFace) {
      self.postMessage({ type: 'skip' });
      return;
    }
    lastFace = now;
    const luma = brightness(bitmap);
    let input = bitmap;
    if (lowLight && luma < 82 && luma > 3.5) {
      if (!gainCanvas || gainCanvas.width !== bitmap.width || gainCanvas.height !== bitmap.height) {
        gainCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        gainContext = gainCanvas.getContext('2d');
      }
      const gain = Math.min(2.75, 93 / luma);
      gainContext.filter = 'brightness(' + gain.toFixed(2) + ') contrast(1.07)';
      gainContext.drawImage(bitmap, 0, 0);
      input = gainCanvas;
    }
    const faces = luma > 3.5 ? boxes(face.detectForVideo(input, now).faceLandmarks) : [];
    if (faces.length) fallback = null;
    if (pose && lowLight && !faces.length && now - lastPose >= 180 && luma > 3.5) {
      lastPose = now;
      fallback = personCandidates(pose.detectForVideo(input, now).landmarks, bitmap.height / bitmap.width);
    }
    const people = lowLight && now - lastPose < 360 && !faces.length ? fallback || [] : [];
    self.postMessage({ type: 'sample', now, luma, candidates: [...faces, ...people] });
  } catch (error) {
    self.postMessage({ type: 'frame-error', message: error.message });
  } finally {
    bitmap?.close();
    if (gainCanvas) gainContext.clearRect(0, 0, gainCanvas.width, gainCanvas.height);
    sampleContext?.clearRect(0, 0, 32, 24);
  }
};
