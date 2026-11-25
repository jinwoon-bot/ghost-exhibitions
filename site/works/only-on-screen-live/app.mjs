import { Camera } from "../only-on-screen/src/camera.mjs";
import { RoomSound } from "../only-on-screen/src/sound.mjs";
import { Stage } from "./stage.mjs?v=floor-rehearsal";
import { Tracks } from "./tracks.mjs?v=distance-matte";

const byId = id => document.getElementById(id);
const defaults = {
  quality: "auto", delegate: "CPU", cameraId: "", mirror: true,
  shadows: 3, strength: .9, spread: 1.15, contrast: 1.12, tone: "ink", threshold: .2, sound: false, volume: .12,
};
const presets = {
  high: { people: 3, input: 768, hz: 30, output: 1280, edgeDetail: true },
  balanced: { people: 3, input: 576, hz: 18, output: 1120, edgeDetail: true },
  medium: { people: 3, input: 480, hz: 12, output: 960, edgeDetail: true },
  low: { people: 3, input: 384, hz: 10, output: 864 },
};
const autoOrder = ["high", "balanced", "medium", "low"];
const qualityNames = { high: "높음", balanced: "중간 · 3명 유지", medium: "보통", low: "낮음" };
const key = "only-on-screen-live.settings.v1";
const video = byId("video");
const controls = [...document.querySelectorAll("[data-setting]")];
const settings = { ...defaults };
const paper = new Image();
const stage = new Stage(byId("stage"), paper);
const tracks = new Tracks();
const sound = new RoomSound();
const snapshot = new OffscreenCanvas(1, 1);
const capture = snapshot.getContext("2d", { alpha: false });
let mode = "idle", currentQuality = "high", generation = 0, sequence = 0;
let worker, backend, workerPreference, pending, localUrl, connectedAt, status, lastFrameAt, lastSubmit, lastVideoTime;
let stats = createStats(), dirty = true, renderUntil = 0, overBudget = 0, lastReport = 0, lastTick = 0, previousPaint = 0;
let loadTimer, demoWait, soundState, framingPreview = false;

const active = () => presets[currentQuality];
const setStatus = message => {
  if (status === message) return;
  status = message;
  byId("state").textContent = message;
  byId("notice").textContent = message;
};
function updateSound(enabled, volume, count) {
  const next = enabled ? volume * (.13 + .025 * count) : 0;
  if (next === soundState || !sound.context) return;
  soundState = next;
  sound.set(enabled, volume, count);
}
const camera = new Camera(video, event => {
  if (mode !== "camera") return;
  if (event.state === "requesting") setStatus("카메라 권한 대기");
  if (event.state === "connected") void listCameras();
  if (event.state === "live") {
    connectedAt = performance.now();
    setStatus(backend ? "웹캠 연결 · 관객 추적 중" : "웹캠 연결 · 인물 분리 준비 중");
  }
  if (event.state === "disconnected" || event.state === "stalled") fail(event.message);
});

function createStats() {
  return { inference: [], render: [], prepare: [], rAF: [], captures: [], lag: [], samples: 0, enhanced: 0, focused: 0, brightness: null };
}
function record(series, value, max = 120) {
  series.push(value);
  if (series.length > max) series.shift();
}
function readSetting(control, value) {
  const name = control.dataset.setting;
  if (control.type === "checkbox") return typeof value === "boolean" ? value : defaults[name];
  if (typeof defaults[name] === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) return defaults[name];
    if (control.type === "range") return Math.min(+control.max, Math.max(+control.min, number));
    if ([...control.options].some(option => +option.value === number)) return number;
    return defaults[name];
  }
  if (name === "cameraId") return typeof value === "string" ? value : "";
  return [...control.options].some(option => option.value === value) ? value : defaults[name];
}
function syncControls() {
  for (const control of controls) {
    const value = settings[control.dataset.setting];
    if (control.type === "checkbox") control.checked = value;
    else control.value = String(value);
    if (control.id === "device" && control.selectedIndex < 0) control.value = "";
  }
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* storage may be unavailable */ }
}
function initialQuality() { return settings.quality === "auto" ? "high" : settings.quality; }
try {
  const saved = JSON.parse(localStorage.getItem(key)) || {};
  for (const control of controls) {
    const name = control.dataset.setting;
    settings[name] = readSetting(control, saved[name] ?? defaults[name]);
  }
} catch { /* missing or invalid storage */ }
currentQuality = initialQuality();
syncControls();

async function listCameras() {
  try {
    const devices = await camera.devices();
    byId("device").replaceChildren(new Option("기본 카메라", ""),
      ...devices.map((device, i) => new Option(device.label || `카메라 ${i + 1}`, device.deviceId)));
    syncControls();
  } catch { /* camera access status is reported when connecting */ }
}
function resetFrame() {
  tracks.reset();
  stage.clear();
  lastFrameAt = 0;
  renderUntil = 0;
  dirty = true;
}
function stopInput() {
  setFramingPreview(false);
  generation++;
  mode = "idle";
  clearTimeout(loadTimer);
  demoWait?.();
  worker?.terminate();
  worker = backend = pending = null;
  camera.stop();
  video.pause();
  video.removeAttribute("src");
  video.load();
  if (localUrl) URL.revokeObjectURL(localUrl);
  localUrl = null;
  snapshot.width = snapshot.height = 1;
  connectedAt = lastSubmit = 0;
  lastVideoTime = -1;
  stats = createStats();
  previousPaint = 0;
  overBudget = 0;
  currentQuality = initialQuality();
  resetFrame();
  byId("entry").hidden = false;
  byId("demo-mark").hidden = true;
  updateSound(false, 0, 0);
}
function fail(message) {
  stopInput();
  setStatus(message || "입력에 문제가 생겼습니다. 다시 연결하거나 샘플로 확인하세요.");
}
function recoverAnalysis(message) {
  if (backend === "CPU" || workerPreference !== "GPU") {
    fail(message);
    return;
  }
  worker?.terminate();
  clearTimeout(loadTimer);
  worker = pending = backend = null;
  lastSubmit = 0;
  lastVideoTime = -1;
  setStatus("GPU 분석 지연 · CPU로 전환 중");
  try { bootWorker("CPU"); } catch (error) { fail(error.message); }
}
function bootWorker(preferred = settings.delegate) {
  const instance = new Worker(new URL("./segment-worker.js?v=distance-matte", import.meta.url));
  worker = instance;
  workerPreference = preferred;
  loadTimer = setTimeout(() => {
    if (worker === instance) recoverAnalysis("인물 분리 모델 응답이 없습니다. 네트워크를 확인하고 다시 연결하세요.");
  }, 30000);
  instance.onerror = () => {
    if (worker === instance) recoverAnalysis("인물 분리 모듈을 시작하지 못했습니다. 최신 Chrome으로 다시 열어 주세요.");
  };
  instance.onmessage = ({ data }) => {
    if (worker !== instance) return;
    if (data.type === "ready") {
      clearTimeout(loadTimer);
      backend = data.delegate;
      setStatus(mode === "camera" && !connectedAt ? "카메라 권한 또는 영상 대기"
        : "인물 분리 연결" + (settings.delegate !== backend ? " · CPU 대체" : ""));
      return;
    }
    if (data.type === "error") {
      const detail = String(data.message || "").slice(0, 160);
      recoverAnalysis(`인물 분리 오류 (${detail || "모델 확인 필요"}). 모델 경로를 확인하거나 CPU로 다시 연결하세요.`);
      return;
    }
    if (!pending || data.seq !== pending.seq) return;
    const frame = pending;
    pending = null;
    if (data.type !== "result" || frame.discard) return;
    if (document.hidden || (mode === "camera" && camera.state !== "live")) return;
    const now = performance.now();
    record(stats.inference, data.inferenceMs);
    record(stats.lag, now - frame.started);
    stats.brightness = data.brightness;
    stats.samples++;
    if (data.enhanced) stats.enhanced++;
    if (data.focused) stats.focused++;
    const composeStarted = performance.now();
    data.people = tracks.update(data.people, frame.started, active().people, data.inferenceMs);
    if (data.people.length) {
      stage.update(data, snapshot, settings, active());
    } else stage.clear();
    record(stats.prepare, performance.now() - composeStarted);
    lastFrameAt = now;
    renderUntil = 0;
    dirty = true;
    if (!byId("entry").hidden) byId("entry").hidden = true;
    setStatus((mode === "camera" ? "웹캠 연결 · 관객 추적 중" : "샘플 입력 · 관객 추적 중") +
      (settings.delegate !== backend ? " · CPU 대체" : ""));
    adjustQuality(data.inferenceMs, data.people.length);
  };
  worker.postMessage({ type: "init", delegate: preferred, people: active().people });
}
function adjustQuality(inference, count) {
  if (settings.quality !== "auto") return;
  const maxTime = currentQuality === "high" ? 105 : count >= active().people ? 205 : 160;
  if (inference > maxTime || previousPaint > 25) overBudget++;
  else overBudget = Math.max(0, overBudget - 1);
  const cheaper = autoOrder[autoOrder.indexOf(currentQuality) + 1];
  if (overBudget < 20 || !cheaper) return;
  currentQuality = cheaper;
  overBudget = 0;
  stage.rebuild(settings, active());
}
async function ensureSound() {
  if (settings.sound) {
    try { await sound.start(); soundState = null; } catch { setStatus("브라우저에서 공간음을 시작할 수 없습니다."); }
  }
}
async function startInput(next, chosen = byId("sample").value, file) {
  stopInput();
  const session = generation;
  mode = next;
  const sample = next === "demo";
  byId("demo-mark").hidden = !sample;
  void ensureSound();
  setStatus(sample ? "샘플 영상 준비 중" : "카메라 연결 중");
  try {
    if (sample) {
      localUrl = file ? URL.createObjectURL(file) : null;
      video.loop = true;
      video.src = localUrl || new URL(`../only-on-screen/assets/demo/${chosen}.mp4`, import.meta.url).href;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish("샘플 영상 로딩 시간이 초과됐습니다."), 15000);
        const finish = error => {
          clearTimeout(timer);
          demoWait = null;
          if (error) reject(Error(error));
          else resolve();
        };
        demoWait = () => finish();
        video.play().then(() => finish(), () => finish("이 영상을 열 수 없습니다. 다른 샘플을 선택하세요."));
      });
      if (session !== generation) return;
      connectedAt = performance.now();
    } else {
      video.loop = false;
      await camera.start({ cameraId: settings.cameraId, cameraWidth: 1280 });
      if (session !== generation) return;
      connectedAt = performance.now();
    }
    bootWorker();
  } catch (error) {
    if (session === generation) {
      const messages = {
        NotAllowedError: "Chrome 주소창의 사이트 설정에서 카메라를 허용한 뒤 다시 연결하세요.",
        NotFoundError: "카메라가 없습니다. USB 연결이나 Windows 카메라 설정을 확인하세요.",
        NotReadableError: "카메라를 읽을 수 없습니다. 다른 카메라 앱을 닫고 다시 연결하세요.",
      };
      fail(messages[error.name] || error.message);
    }
  }
}
async function submit(now) {
  const current = { seq: ++sequence, started: now };
  pending = current;
  lastSubmit = now;
  lastVideoTime = video.currentTime;
  let bitmap;
  try {
    const w = Math.min(active().input, video.videoWidth);
    const h = Math.max(2, Math.round(w * video.videoHeight / video.videoWidth));
    if (snapshot.width !== w || snapshot.height !== h) { snapshot.width = w; snapshot.height = h; }
    capture.drawImage(video, 0, 0, w, h);
    bitmap = await createImageBitmap(snapshot);
    if (pending !== current) { bitmap.close(); return; }
    worker.postMessage({ type: "frame", seq: current.seq, sourceMs: now, bitmap,
      people: active().people, threshold: settings.threshold, edgeDetail: !!active().edgeDetail }, [bitmap]);
  } catch {
    bitmap?.close();
    if (pending === current) fail("영상 프레임을 처리할 수 없습니다. 카메라나 샘플을 다시 연결하세요.");
  }
}
const rounded = n => typeof n === "number" && Number.isFinite(n) ? +n.toFixed(2) : null;
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const rate = times => times.length > 1 ? (times.length - 1) * 1000 / (times.at(-1) - times[0]) : null;
function report(now) {
  if (now - lastReport < 250) return;
  lastReport = now;
  const packet = stage.packet;
  const people = packet?.people || [];
  byId("framing-preview").disabled = mode === "idle" || !video.videoWidth;
  const framing = mode === "idle" ? "입력을 시작하면 머리와 발이 들어오는지 확인할 수 있습니다."
    : people.some(person => person.framing === "edge") ? "윤곽이 카메라 위나 아래에 닿습니다. 원본 화면에서 머리와 발 주변의 여백을 확인하세요."
    : people.length && people.every(person => person.framing === "feet") ? `발까지 감지된 관객 ${people.length}명`
    : people.length ? "일부 발의 위치를 확인하지 못했습니다. 카메라 원본과 화면의 윤곽을 비교해 보세요."
    : "분리된 관객이 없습니다. 원본 화면에서 위치와 밝기를 확인하세요.";
  if (byId("framing-status").textContent !== framing) byId("framing-status").textContent = framing;
  byId("metrics").textContent = JSON.stringify({
    input: mode, status, quality: qualityNames[currentQuality], maxPeople: active().people, backend,
    source: video.videoWidth ? [video.videoWidth, video.videoHeight] : null,
    cameraFrames: camera.frames, samples: stats.samples, enhancedMasks: stats.enhanced, zoomDetections: stats.focused,
    brightness: rounded(stats.brightness),
    browserFPS: rounded(stats.rAF.length ? 1000 / average(stats.rAF) : null),
    compositeFPS: rounded(rate(stats.captures)), inferenceMs: rounded(average(stats.inference)),
    captureToResultMs: rounded(average(stats.lag)), maskComposeMs: rounded(average(stats.prepare)),
    outputPaintMs: rounded(average(stats.render)),
    jsHeapMiB: rounded(performance.memory?.usedJSHeapSize / 1048576),
    people: people.map(p => ({
      id: p.id, center: p.shape.center, wrists: p.shape.wrists, area: p.area,
      bounds: [p.x, p.y, p.w, p.h], anchor: p.anchor, framing: p.framing, shadows: settings.shadows,
    })),
  }, null, 2);
}
function tick(now) {
  requestAnimationFrame(tick);
  if (document.hidden) { lastTick = 0; return; }
  if (lastTick && mode !== "idle") record(stats.rAF, now - lastTick);
  lastTick = now;
  const healthy = mode === "demo" ? !video.paused && video.readyState >= 2
    : mode === "camera" && camera.healthy(now);
  if (pending && now - pending.started > 5000) recoverAnalysis("인물 분리 응답이 멈췄습니다. 낮은 성능 모드로 다시 연결하세요.");
  if (!healthy && mode === "camera" && connectedAt && !camera.frames && now - connectedAt > 5000) {
    fail("카메라에서 영상이 들어오지 않습니다. 다른 카메라를 선택하고 다시 연결하세요.");
  }
  if (backend && healthy && !pending && video.videoWidth && video.currentTime !== lastVideoTime &&
      now - lastSubmit >= 1000 / active().hz - 3) void submit(now);
  if (lastFrameAt && now - lastFrameAt > 480 && !renderUntil) renderUntil = now + 180;
  if (dirty || renderUntil || stage.delay.needsPaint(now)) {
    const opacity = renderUntil ? Math.max(0, (renderUntil - now) / 180) : 1;
    const start = performance.now();
    if (opacity === 0) {
      stage.clear();
      lastFrameAt = renderUntil = 0;
    }
    const newComposite = dirty && lastFrameAt && opacity === 1;
    stage.paint(settings, active(), opacity, now);
    previousPaint = performance.now() - start;
    if (newComposite) {
      record(stats.render, previousPaint);
      record(stats.captures, now);
    }
    dirty = false;
  }
  updateSound(mode !== "idle" && settings.sound, settings.volume, stage.active.length);
  if (framingPreview && healthy && video.videoWidth) stage.preview(video, active(), settings.mirror);
  report(now);
}
function setFramingPreview(enabled) {
  framingPreview = enabled;
  byId("framing-preview").setAttribute("aria-pressed", String(enabled));
  byId("framing-preview").textContent = enabled ? "그림자 화면으로 돌아가기" : "카메라 원본 확인";
  dirty = true;
}
function toggleOperator(force = byId("operator").hidden) {
  byId("operator").hidden = !force;
  if (!force) setFramingPreview(false);
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { setStatus("전체화면 전환을 할 수 없습니다. 작품을 새 탭으로 열어 주세요."); }
}
for (const control of controls) {
  const name = control.dataset.setting;
  control.addEventListener(control.type === "range" ? "input" : "change", () => {
    settings[name] = readSetting(control, control.type === "checkbox" ? control.checked : control.value);
    save();
    if (name === "delegate" && worker) {
      worker.terminate();
      clearTimeout(loadTimer);
      worker = backend = pending = null;
      lastSubmit = 0;
      lastVideoTime = -1;
      try { bootWorker(); } catch (error) { fail(error.message); }
    }
    if (name === "quality") {
      currentQuality = initialQuality();
      overBudget = 0;
    }
    if (name === "sound" && mode !== "idle") void ensureSound();
    if (["quality", "tone", "contrast", "shadows"].includes(name)) stage.rebuild(settings, active());
    dirty = true;
  });
}
byId("camera-start").onclick = () => { toggleOperator(false); void startInput("camera"); };
byId("demo-start").onclick = () => { toggleOperator(false); void startInput("demo"); };
byId("sample-start").onclick = () => void startInput("demo");
byId("local-file").onchange = event => {
  const file = event.target.files[0];
  if (file) void startInput("demo", "", file);
  event.target.value = "";
};
byId("reconnect").onclick = () => void startInput("camera");
byId("stop").onclick = () => { stopInput(); setStatus("입력 중지 · 다시 시작할 수 있습니다."); };
byId("operator-open").onclick = () => toggleOperator(true);
byId("operator-close").onclick = byId("screen-only").onclick = () => toggleOperator(false);
byId("framing-preview").onclick = () => setFramingPreview(!framingPreview);
byId("fullscreen").onclick = byId("operator-fullscreen").onclick = fullscreen;
document.addEventListener("keydown", event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  if (event.code === "KeyD") toggleOperator();
  if (event.code === "KeyF") void fullscreen();
  if (event.code === "KeyR") {
    if (pending) pending.discard = true;
    resetFrame();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    updateSound(false, 0, 0);
    resetFrame();
  } else {
    if (pending && performance.now() - pending.started > 5000) pending.started = performance.now();
    connectedAt = performance.now();
  }
});
navigator.mediaDevices?.addEventListener("devicechange", listCameras);
window.addEventListener("pagehide", () => { stopInput(); void sound.stop(); });
paper.onload = () => { stage.rebuild(settings, active()); dirty = true; };
paper.src = new URL("./assets/hanji-wall.webp", import.meta.url).href;
setStatus("카메라 연결 대기");
for (const id of ["camera-start", "demo-start", "fullscreen", "operator-open"]) byId(id).disabled = false;
void listCameras();
requestAnimationFrame(tick);
