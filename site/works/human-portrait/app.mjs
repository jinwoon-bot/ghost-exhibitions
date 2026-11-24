import { EyeComposite } from "../dokkaebi/lib/eye-composite.mjs?v=2.3.1";
import { Gaze } from "../dokkaebi/lib/gaze.js?v=2.3.1";
import { Audience, frameInterval, lostMs } from "./audience.mjs";

const $ = id => document.getElementById(id);
const clock = () => performance.now();
const video = $("camera");
const portrait = $("portrait");
const panel = $("operator");
const key = "gogwandaemyeon-human-portrait-v1";
const maxMovement = 16;
const gaze = new Gaze({ hold: lostMs / 1000, smoothing: .48 });
const audience = new Audience();
const controls = ["cameraSelect", "mirror", "priority", "zone", "minWidth"];
const errors = {
  NotAllowedError: "카메라 권한을 허용한 뒤 다시 시작해 주세요.",
  NotFoundError: "연결된 카메라가 없습니다. 마우스 시연을 선택할 수 있습니다.",
  NotReadableError: "카메라를 열 수 없습니다. 카메라를 사용하는 다른 앱을 확인해 주세요.",
  OverconstrainedError: "선택한 카메라를 사용할 수 없습니다. 기본 카메라로 시도해 주세요.",
};

let eyes = [], stream, worker, workerReady = false, ready = false;
let mode = "idle", cameraNote = "연결 전", token = 0, startTimer, noticeTimer;
let busy = false, submittedAt = 0, captureTime = -1, frameAt = 0, requestAt = -Infinity;
let videoTime = -1, average = 0, lastPanel = -Infinity, lastTick = clock(), lastShift = Infinity;
let mouseX = null, cameraId = "";

function settings() {
  cameraId = $("cameraSelect").value;
  audience.configure({
    zone: Number($("zone").value) / 100,
    minWidth: Number($("minWidth").value) / 100,
    priority: $("priority").value,
  });
  $("zoneValue").textContent = `${$("zone").value}%`;
  $("minWidthValue").textContent = `${$("minWidth").value}%`;
  $("aimZone").style.width = $("zoneValue").textContent;
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
    for (const id of controls) {
      const el = $(id);
      if (id === "cameraSelect" && typeof stored[id] === "string") {
        cameraId = stored[id].slice(0, 300);
        el.append(new Option("저장된 카메라", cameraId));
        el.value = cameraId;
      } else if (el.type === "checkbox" && typeof stored[id] === "boolean") el.checked = stored[id];
      else if (typeof stored[id] === "number" || id === "priority" && stored[id] === "nearest") el.value = stored[id];
    }
  } catch {}
}
for (const id of controls) $(id).addEventListener("change", () => {
  settings();
  if (id === "mirror") gaze.reset();
  try {
    const values = Object.fromEntries(controls.map(name => {
      const el = $(name);
      return [name, el.type === "checkbox" ? el.checked : el.type === "range" ? Number(el.value) : el.value];
    }));
    localStorage.setItem(key, JSON.stringify(values));
  } catch {}
});
$("zone").addEventListener("input", settings);
$("minWidth").addEventListener("input", settings);
loadSettings();
settings();

function showPanel(open) {
  panel.hidden = !open;
  document.body.classList.toggle("operator-open", open);
  if (open) drawPanel(clock(), gaze.value);
}
function enter() {
  clearTimeout(startTimer);
  $("startScreen").hidden = true;
  $("cancelCamera").hidden = true;
  document.body.classList.add("started");
}
function stopInput(note = "연결 전") {
  token++;
  clearTimeout(startTimer);
  worker?.terminate();
  worker = null;
  workerReady = false;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  busy = false;
  mode = "idle";
  cameraNote = note;
  requestAt = -Infinity;
  captureTime = videoTime = -1;
  average = 0;
  mouseX = null;
  gaze.reset();
  audience.reset();
  $("startCamera").disabled = $("reconnectCamera").disabled = !ready;
  $("cancelCamera").hidden = true;
}
function welcome(message) {
  document.body.classList.remove("started");
  $("startScreen").hidden = false;
  $("startupStatus").textContent = message;
}
function fail(message) {
  stopInput(message);
  welcome(message);
  showPanel(false);
}

async function refreshCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(item => item.kind === "videoinput");
    const select = $("cameraSelect");
    select.replaceChildren(new Option("기본 카메라", ""));
    for (const [index, camera] of cameras.entries()) {
      if (camera.deviceId && camera.deviceId !== "default") select.append(new Option(camera.label || `카메라 ${index + 1}`, camera.deviceId));
    }
    if (cameraId && ![...select.options].some(option => option.value === cameraId)) {
      select.append(new Option("이전 카메라", cameraId));
    }
    select.value = cameraId;
  } catch {}
}

async function openCamera() {
  if (!ready) return;
  stopInput("권한 확인 중");
  showPanel(false);
  welcome("브라우저에서 카메라 권한을 허용해 주세요.");
  mode = "camera";
  $("startCamera").disabled = $("reconnectCamera").disabled = true;
  $("cancelCamera").hidden = false;
  const active = token;
  startTimer = setTimeout(() => fail("카메라 또는 분석 도구 연결 시간이 초과됐습니다."), 40000);
  try {
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      fail("카메라는 HTTPS 또는 localhost 주소에서 열 수 있습니다.");
      return;
    }
    const input = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
    });
    if (active !== token) {
      input.getTracks().forEach(track => track.stop());
      return;
    }
    stream = input;
    video.srcObject = input;
    const [track] = input.getVideoTracks();
    track.addEventListener("ended", () => {
      if (active === token) fail("카메라 연결이 끊겼습니다. 다시 연결하거나 마우스로 시연할 수 있습니다.");
    }, { once: true });
    await video.play();
    if (active !== token) return;
    frameAt = clock();
    await refreshCameras();
    if (active !== token) return;
    cameraNote = "분석 도구 준비 중";
    $("startupStatus").textContent = "카메라가 연결됐습니다. 첫 화면을 분석하고 있습니다.";
    worker = new Worker(new URL("./vision.js", import.meta.url));
    worker.onmessage = event => receive(event.data, active);
    worker.onerror = () => {
      if (active === token) fail("카메라 분석 도구를 시작하지 못했습니다.");
    };
    worker.postMessage({ type: "init" });
  } catch (error) {
    if (active === token) fail(errors[error.name] ?? "카메라를 시작하지 못했습니다.");
  }
}

function receive(result, active) {
  if (active !== token) return;
  if (result.type === "ready") {
    workerReady = true;
    return;
  }
  busy = false;
  if (result.type === "error" || result.type === "frame-error") {
    fail("카메라 분석을 계속할 수 없습니다. 다시 연결하거나 마우스 시연을 선택해 주세요.");
    return;
  }
  if (result.type !== "result") return;
  average = average ? average * .8 + result.inferenceMs * .2 : result.inferenceMs;
  if (!$("startScreen").hidden) {
    enter();
    $("reconnectCamera").disabled = false;
  }
  const dark = result.light?.unusable;
  const dim = result.light?.gamma < .995;
  const old = clock() - result.sourceMs > 750;
  const lowResolution = video.videoHeight < 360;
  const limitations = [
    dark ? "영상이 너무 어두움" : dim ? "저조도 보정" : "",
    lowResolution ? "낮은 해상도" : "",
    old ? "분석 지연" : "",
    result.posed ? "몸통 보조" : "",
  ].filter(Boolean);
  cameraNote = `${video.videoWidth}×${video.videoHeight}` + (limitations.length ? ` · ${limitations.join(" · ")}` : "");
  const selected = audience.update(dark || old ? [] : result.faces, result.sourceMs);
  if (selected) gaze.observe($("mirror").checked ? 1 - selected.x : selected.x, result.sourceMs);
}

async function analyze(now) {
  if (!workerReady || busy || document.hidden || video.readyState < 2 ||
      video.currentTime === captureTime || now - requestAt < frameInterval(average)) return;
  busy = true;
  submittedAt = requestAt = now;
  captureTime = video.currentTime;
  const active = token;
  try {
    const size = Math.min(640, video.videoWidth);
    const bitmap = await createImageBitmap(video, { resizeWidth: size,
      resizeHeight: Math.max(1, Math.round(video.videoHeight * size / video.videoWidth)), resizeQuality: "high" });
    if (active !== token || !worker) {
      bitmap.close();
      return;
    }
    const target = audience.current;
    worker.postMessage({
      type: "frame", bitmap, sourceMs: now, zone: audience.zone, minWidth: audience.minWidth,
      target: target ? { x: target.x, y: target.y, w: target.w, h: target.h } : null,
    }, [bitmap]);
  } catch {
    if (active === token) fail("카메라 화면을 읽을 수 없습니다. 다시 연결해 주세요.");
  }
}
function drawPanel(now, position) {
  if (panel.hidden) return;
  $("inputStatus").textContent = { camera: "카메라", demo: "마우스 시연", idle: "대기" }[mode];
  $("cameraStatus").textContent = cameraNote;
  $("viewStatus").textContent = audience.status;
  $("viewCount").textContent = audience.count;
  $("selectionCount").textContent = audience.selections;
  $("gazeValue").textContent = position.toFixed(3);
  $("sampleRate").textContent = mode === "camera" && average ? `${Math.round(frameInterval(average))}ms` : "—";
  const dot = $("aimDot");
  const selected = audience.current;
  dot.hidden = !selected || now - selected.at > lostMs;
  if (!dot.hidden) dot.style.left = `${($("mirror").checked ? 1 - selected.x : selected.x) * 100}%`;
}
function loop(now) {
  const dt = (now - lastTick) / 1000;
  lastTick = now;
  if (mode === "demo" && mouseX !== null) gaze.observe(mouseX, now);
  if (mode === "camera" && stream && !document.hidden) {
    if (video.currentTime !== videoTime) {
      videoTime = video.currentTime;
      frameAt = now;
    }
    if (now - frameAt > 3200 || busy && now - submittedAt > 3800) {
      fail("카메라 입력이 멈췄습니다. 연결 상태를 확인해 주세요.");
    } else analyze(now);
  }
  const position = gaze.step(now, dt);
  const shift = position * maxMovement;
  if (Math.abs(shift - lastShift) > .02 || shift === 0 && lastShift !== 0) {
    for (const eye of eyes) eye.draw(shift);
    lastShift = shift;
  }
  if (now - lastPanel > 200) {
    drawPanel(now, position);
    lastPanel = now;
  }
  requestAnimationFrame(loop);
}

function startDemo() {
  if (!ready) return;
  stopInput();
  mode = "demo";
  showPanel(false);
  enter();
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    clearTimeout(noticeTimer);
    $("notice").textContent = "전체화면은 Chrome의 F11 키로 열 수 있습니다.";
    $("notice").hidden = false;
    noticeTimer = setTimeout(() => $("notice").hidden = true, 4400);
  }
}
const reset = () => { gaze.reset(); audience.reset(); };
$("startCamera").onclick = $("reconnectCamera").onclick = openCamera;
$("startDemo").onclick = startDemo;
$("cancelCamera").onclick = $("stopCamera").onclick = () => {
  stopInput();
  showPanel(false);
  welcome("카메라 또는 마우스 시연을 선택하세요.");
};
$("fullscreen").onclick = fullscreen;
$("operatorHandle").onclick = () => showPanel(true);
$("closeOperator").onclick = () => showPanel(false);
$("resetGaze").onclick = reset;
addEventListener("keydown", event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  switch (event.key.toLowerCase()) {
    case "d": showPanel(panel.hidden); break;
    case "f": fullscreen(); break;
    case "r": reset(); break;
    case "escape": showPanel(false); break;
  }
});
addEventListener("pointermove", event => {
  if (mode === "demo") mouseX = event.target.closest?.("#operator") ? null : event.clientX / innerWidth;
}, { passive: true });
document.addEventListener("pointerout", event => { if (!event.relatedTarget) mouseX = null; });
addEventListener("blur", () => { mouseX = null; });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    frameAt = submittedAt = clock();
    lastTick = frameAt;
  }
});
addEventListener("pagehide", () => stopInput());
addEventListener("pageshow", event => {
  if (event.persisted) welcome("카메라 또는 마우스 시연을 선택하세요.");
});
navigator.mediaDevices?.addEventListener("devicechange", refreshCameras);
refreshCameras();

try {
  const [config] = await Promise.all([fetch("./assets/eyes.json"), portrait.decode()]);
  if (!config.ok) throw new Error("눈 영역 파일을 열 수 없습니다.");
  const calibration = await config.json();
  eyes = calibration.eyes.map(eye => new EyeComposite($(`${eye.id}Eye`), portrait, eye, calibration));
  ready = true;
  $("startCamera").disabled = $("startDemo").disabled = $("reconnectCamera").disabled = false;
  welcome("중앙에 선 관객 한 명의 움직임을 따라봅니다.");
} catch {
  welcome(location.protocol === "file:" ? "이 작품을 localhost나 HTTPS 주소에서 열어 주세요." : "영정 파일을 불러오지 못했습니다.");
}
requestAnimationFrame(loop);
