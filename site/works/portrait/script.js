import { Gaze, defaults, sanitize } from "./lib/gaze.js?v=2.0.0";
import { Ambient } from "./lib/ambient.js";
import { NearestViewer } from "./lib/viewer.js?v=2.0.0";
import { EyeComposite } from "./lib/eye-composite.mjs?v=2.0.0";
const $ = (id) => document.getElementById(id),
  video = $("camera"),
  ambient = new Ambient(),
  key = "gogwandaemyeon-portrait-v2";
let config;
try {
  config = sanitize(JSON.parse(localStorage.getItem(key) || "{}"));
} catch {
  config = { ...defaults };
}
const gaze = new Gaze(config);
const viewer = new NearestViewer(config);
let eyeAssets = [],
  started = false,
  mode = "idle",
  cameraState = "off",
  workerState = "off",
  worker = null,
  stream = null,
  generation = 0,
  busy = false,
  lastPost = -Infinity,
  lastFrameAt = -Infinity,
  lastVideoTime = -1,
  lastAnalyzedFrame = -1,
  frameCount = 0,
  videoCallback = null,
  cameraSettings = null,
  lastFace = null,
  frames = [],
  inferences = [],
  lastTick = performance.now(),
  lastDraw = Infinity,
  lastPanel = 0,
  noticeTimer = null,
  workerTimeout = null,
  renderedFrames = 0,
  trackResults = 0,
  faceResults = 0;
// 저장량은 고정: 최근 프레임 600개, 이벤트 150개, 전체 분포 0.5ms 단위 2001칸.
const totals = {
    frames: 0,
    totalMs: 0,
    maxMs: 0,
    over50: 0,
    histogram: new Uint32Array(2001),
  },
  trackingRange = { count: 0, min: 1, max: 0 },
  inferTotal = { count: 0, totalMs: 0, maxMs: 0 };
const events = [];
const event = (type, detail = {}) => {
  events.push({ type, at: performance.now(), ...detail });
  if (events.length > 150) events.shift();
};
const showNotice = (message, ms = 6500) => {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").hidden = false;
  noticeTimer = ms>0 ? setTimeout(() => ($("notice").hidden = true), ms) : null;
};
function save() {
  config = sanitize(config);
  gaze.configure(config);
  viewer.configure(config);
  try {
    localStorage.setItem(key, JSON.stringify(config));
  } catch {}
  lastDraw = Infinity;
  fillPanel();
}
function fillPanel() {
  for (const el of document.querySelectorAll("[data-setting]")) {
    const k = el.dataset.setting;
    if (el.type === "checkbox") el.checked = config[k];
    else el.value = config[k];
    const out = $(k + "Value");
    if (out) out.textContent = Number(config[k]).toFixed(k === "fps" ? 0 : 2);
  }
  $("demoMode").checked = mode === "demo";
  $("debugCanvas").hidden = !config.debug;
}
async function loadAssets() {
  const photo = $("portrait");
  const [response] = await Promise.all([
    fetch("./assets/portrait-v2-eyes.json"),
    photo.decode(),
  ]);
  if (!response.ok) throw new Error("영정의 눈 영역 파일을 읽지 못했습니다.");
  const design = await response.json();
  eyeAssets = design.eyes.map(spec => new EyeComposite(
    $(spec.id === "left" ? "eyeLeft" : "eyeRight"), photo, spec, design,
  ));
  drawEyes(0);
  event("assets-ready");
}
function drawEyes(value) {
  for (const eye of eyeAssets) eye.draw(value * config.maxMovement);
  lastDraw = value;
  renderedFrames++;
}
let pointerInside = false,
  pointerX = 0.5;
function enter() {
  ambient.set(config.sound).catch(() => {});
  started = true;
  document.body.classList.add("started");
  $("startScreen").hidden = true;
  fillPanel();
}
function stopWorker() {
  clearTimeout(workerTimeout);
  worker?.terminate();
  worker = null;
  workerState = "off";
  busy = false;
}
function stopCamera() {
  generation++;
  stopWorker();
  if (videoCallback !== null && video.cancelVideoFrameCallback)
    video.cancelVideoFrameCallback(videoCallback);
  videoCallback = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  cameraState = "off";
  lastFrameAt = -Infinity;
  lastFace = null;
  viewer.reset();
  $("startCamera").disabled = false;
  $("cancelStart").hidden = true;
  if (mode === "camera") mode = "idle";
}
function demo(reason = "operator") {
  stopCamera();
  if(reason==='operator'){clearTimeout(noticeTimer);$("notice").hidden=true;}
  mode = "demo";
  pointerInside = false;
  gaze.reset();
  enter();
  event("demo", { reason });
  if (reason !== "operator")
    showNotice(
      "카메라를 사용할 수 없어 마우스 시연으로 전환했어요. 운영 설정(D)에서 다시 연결할 수 있어요.",
    );
}
function fault(message) {
  event("camera-error", { message });
  cameraState = "error";
  $("startupStatus").textContent = message;
  if (config.autoDemo) {demo("camera-error");showNotice(message+" · 현재 마우스 시연 중 / 카메라 인식 아님 · D 설정에서 다시 연결하세요.",0);}
  else {
    stopCamera();
    showNotice(message, 12000);
    $("startScreen").hidden = false;
    document.body.classList.remove("started");
  }
}
async function requestCamera(constraints, token) {
  let expired = false, timer;
  const pending = navigator.mediaDevices.getUserMedia(constraints);
  pending.then(input=>{
    if(expired || token !== generation) input.getTracks().forEach(t=>t.stop());
  },()=>{});
  try {
    return await Promise.race([pending,new Promise((_,reject)=>{
      timer=setTimeout(()=>{expired=true;reject(Error("카메라 권한 응답이 없습니다. Chrome 주소 왼쪽의 카메라 권한을 확인한 뒤 다시 시작해 주세요."));},30000);
    })]);
  } finally { clearTimeout(timer); }
}
async function devices() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices(),
      s = $("cameraSelect");
    s.replaceChildren(new Option("기본 카메라", ""));
    for (const [i, d] of list.filter((d) => d.kind === "videoinput").entries())
      s.append(new Option(d.label || `카메라 ${i + 1}`, d.deviceId));
    s.value = config.deviceId;
  } catch {}
}
function countFrames(token) {
  if (token !== generation || !stream) return;
  lastFrameAt = performance.now();
  frameCount++;
  if (video.requestVideoFrameCallback)
    videoCallback = video.requestVideoFrameCallback(() => countFrames(token));
}
async function camera() {
  stopCamera();
  clearTimeout(noticeTimer);$("notice").hidden=true;
  const token = generation;
  mode = "camera";
  cameraState = "requesting";
  $("startCamera").disabled = true;
  $("cancelStart").hidden = false;
  $("startScreen").hidden = false;
  $("startupStatus").textContent = "Chrome의 카메라 권한 요청을 확인해 주세요.";
  event("camera-request");
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw Error("카메라는 HTTPS 또는 localhost 주소에서 사용할 수 있어요.");
    const input = await requestCamera({
      audio: false,
      video: {
        ...(config.deviceId ? { deviceId: { exact: config.deviceId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    }, token);
    if (token !== generation) {
      input.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = input;
    video.srcObject = input;
    cameraState = "connecting";
    await video.play();
    await new Promise((resolve, reject) => {
      let done = false;
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          reject(Error("실제 카메라 프레임이 도착하지 않았어요."));
        }
      }, 5000);
      const ready = () => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve();
      };
      if (video.requestVideoFrameCallback)
        video.requestVideoFrameCallback(ready);
      else if (video.readyState >= 2 && video.videoWidth) ready();
      else video.addEventListener("loadeddata", ready, { once: true });
    });
    if (token !== generation) return;
    cameraState = "live";
    lastFrameAt = performance.now();
    countFrames(token);
    cameraSettings = input.getVideoTracks()[0].getSettings();
    input.getVideoTracks()[0].addEventListener(
      "ended",
      () => {
        if (token === generation) fault("카메라 연결이 종료됐어요.");
      },
      { once: true },
    );
    await devices();
    if (token !== generation) return;
    workerState = "loading";
    $("startupStatus").textContent =
      "카메라 프레임 수신 · 로컬 얼굴·전신 감지 준비 중";
    worker = new Worker(new URL("./tracking-worker.js?v=1.2.0", import.meta.url));
    worker.onmessage = (e) => workerMessage(e.data, token);
    worker.onerror = () => {
      if (token === generation) fault("얼굴·전신 감지 도구를 시작하지 못했어요.");
    };
    worker.postMessage({ type: "init" });
    workerTimeout = setTimeout(() => {
      if (token === generation && workerState !== "ready")
        fault("로컬 얼굴·전신 감지 준비 시간이 초과됐어요. 모델 파일과 연결을 확인하세요.");
    }, 60000);
  } catch (e) {
    if (token === generation) {
      const names = {
        NotAllowedError: "카메라 권한이 허용되지 않았어요.",
        NotFoundError: "연결된 카메라를 찾을 수 없어요.",
        NotReadableError:
          "다른 앱에서 카메라를 사용 중이거나 장치를 열 수 없어요.",
        OverconstrainedError:
          "저장된 카메라가 없어요. 기본 카메라를 선택해 주세요.",
      };
      fault(names[e.name] || e.message);
    }
  }
}
function workerMessage(m, token) {
  if (token !== generation) return;
  if (m.type === "ready") {
    workerState = "warming";
    $("startupStatus").textContent = "카메라 연결됨 · 첫 프레임 분석 중";
    return;
  }
  busy = false;
  if (m.type === "error" || m.type === "frame-error") {
    fault("얼굴·전신 감지 오류: " + m.message);
    return;
  }
  if (m.type !== "result") return;
  if (workerState === "warming") {
    clearTimeout(workerTimeout);
    workerState = "ready";
    $("startCamera").disabled = false;
    $("cancelStart").hidden = true;
    gaze.reset();
    enter();
    event("tracking-ready");
  }
  trackResults++;
  inferTotal.count++;
  inferTotal.totalMs += m.inferenceMs;
  inferTotal.maxMs = Math.max(inferTotal.maxMs, m.inferenceMs);
  inferences.push(m.inferenceMs);
  if (inferences.length > 120) inferences.shift();
  if (performance.now() - m.sourceMs > 700) return;
  const selected = viewer.update(m.faces, m.sourceMs);
  if (!selected) return;
  lastFace = { ...selected, at: m.sourceMs };
  faceResults++;
  trackingRange.count++;
  const mapped = config.mirror ? 1 - selected.x : selected.x;
  trackingRange.min = Math.min(trackingRange.min, mapped);
  trackingRange.max = Math.max(trackingRange.max, mapped);
  gaze.observe(config.mirror ? 1 - selected.x : selected.x, m.sourceMs);
}
async function analyze(now) {
  if (
    busy ||
    mode !== "camera" ||
    (workerState !== "ready" && workerState !== "warming") ||
    cameraState !== "live" ||
    document.hidden ||
    video.readyState < 2 ||
    frameCount === lastAnalyzedFrame ||
    now - lastPost < 1000 / config.fps
  )
    return;
  busy = true;
  lastAnalyzedFrame = frameCount;
  lastPost = now;
  const token = generation;
  try {
    const w = Math.min(640, video.videoWidth),
      h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w)),
      bitmap = await createImageBitmap(video, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: "high",
      });
    if (token !== generation || !worker) {
      bitmap.close();
      return;
    }
    worker.postMessage({ type: "frame", bitmap, sourceMs: now }, [bitmap]);
  } catch (e) {
    if (token === generation) {
      busy = false;
      fault("카메라 프레임을 분석용으로 읽지 못했어요.");
    }
  }
}
function allFrameStats() {
  let n = 0,
    p99 = 0;
  for (let i = 0; i < totals.histogram.length; i++) {
    n += totals.histogram[i];
    if (n >= totals.frames * 0.99) {
      p99 = (i + 1) / 2;
      break;
    }
  }
  return {
    frames: totals.frames,
    measuredSeconds: totals.totalMs / 1000,
    fps: totals.totalMs ? (totals.frames / totals.totalMs) * 1000 : 0,
    p99UpperMs: p99,
    maxMs: totals.maxMs,
    over50: totals.over50,
    note: "시작 이후 화면이 보일 때의 rAF 간격. 백그라운드/1초 이상 중단 제외. 모니터 표시 FPS와 다름.",
  };
}
function frameStats() {
  const a = [...frames].sort((a, b) => a - b),
    mean = a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0;
  return {
    samples: a.length,
    fps: mean ? 1000 / mean : 0,
    p99Ms: a[Math.floor((a.length - 1) * 0.99)] || 0,
    maxMs: a.at(-1) || 0,
    over50: a.filter((x) => x > 50).length,
  };
}
function panel(now) {
  if ($("operator").hidden) return;
  const stats = frameStats(),
    map = {
      입력:
        mode === "camera"
          ? "실제 카메라"
          : mode === "demo"
            ? "마우스 시연"
            : "대기",
      카메라: cameraState === "live" ? "실제 프레임 수신" : cameraState,
      감지도구: workerState,
      추적방식: lastFace?.kind || "미감지",
      관객:
        lastFace && now - lastFace.at < 700 ? (lastFace.kind?.includes('body')?'전신 관객 감지':'얼굴 관객 감지') : "미감지/정면 복귀",
      선택방식: config.viewerPolicy === "center"
        ? "중앙에 있는 관객 한 명"
        : "가까운 관객 한 명 · 얼굴/몸통 크기 기준",
      감지인원: viewer.count,
      선택상태: viewer.reason,
      관객변경: viewer.switches,
      시선: gaze.mode,
      위치: gaze.value.toFixed(3),
      카메라프레임: frameCount,
      분석결과: trackResults,
      관객검출: faceResults,
      화면FPS: stats.fps.toFixed(1),
      최대프레임: stats.maxMs.toFixed(1) + "ms",
      분석평균: inferences.length
        ? (inferences.reduce((n, x) => n + x, 0) / inferences.length).toFixed(
            1,
          ) + "ms"
        : "대기",
    };
  const dl = $("statusValues");
  dl.replaceChildren();
  for (const [k, v] of Object.entries(map)) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
  }
  if (config.debug) {
    const c = $("debugCanvas"),
      x = c.getContext("2d");
    x.fillStyle = "#050805";
    x.fillRect(0, 0, c.width, c.height);
    if (cameraState === "live" && video.readyState >= 2) {
      x.save();
      if (config.mirror) {
        x.translate(c.width, 0);
        x.scale(-1, 1);
      }
      x.drawImage(video, 0, 0, c.width, c.height);
      x.restore();
      if (lastFace && now - lastFace.at < 700) {
        const f = lastFace,
          cx = config.mirror ? 1 - f.x : f.x;
        x.strokeStyle = "#c5cba4";
        x.strokeRect(
          (cx - f.w / 2) * c.width,
          (f.y - f.h / 2) * c.height,
          f.w * c.width,
          f.h * c.height,
        );
      }
    }
  }
}
function loop(now) {
  const dt = (now - lastTick) / 1000;
  if (!document.hidden && dt > 0 && dt < 1) {
    frames.push(dt * 1000);
    if (frames.length > 600) frames.shift();
    if (started) {
      const ms = dt * 1000;
      totals.frames++;
      totals.totalMs += ms;
      totals.maxMs = Math.max(totals.maxMs, ms);
      if (ms > 50) totals.over50++;
      totals.histogram[Math.min(2000, Math.floor(ms * 2))]++;
    }
  }
  lastTick = now;
  if (mode === "demo" && pointerInside) gaze.observe(pointerX, now);
  if (
    mode === "camera" &&
    cameraState === "live" &&
    !document.hidden &&
    now - lastFrameAt > 2500
  )
    fault("카메라 영상이 멈췄어요.");
  if (!document.hidden && busy && now - lastPost > 3000)
    fault("관객 분석이 멈춰 마우스 시연으로 전환합니다.");
  if (
    mode === "camera" &&
    !video.requestVideoFrameCallback &&
    video.currentTime !== lastVideoTime
  ) {
    lastVideoTime = video.currentTime;
    lastFrameAt = now;
    frameCount++;
  }
  analyze(now);
  const value = gaze.step(now, dt);
  if (
    eyeAssets.length &&
    (lastDraw === Infinity || (value === 0 && lastDraw !== 0) || Math.abs(value - lastDraw) > 0.0008)
  )
    drawEyes(value);
  if (now - lastPanel > 250) {
    panel(now);
    lastPanel = now;
  }
  requestAnimationFrame(loop);
}
function togglePanel(force) {
  $("operator").hidden = force === undefined ? !$("operator").hidden : !force;
  document.body.classList.toggle("operator-open", !$("operator").hidden);
  fillPanel();
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showNotice("전체화면을 사용할 수 없어요. Chrome에서 F11을 눌러주세요.");
  }
}
document.addEventListener(
  "pointermove",
  (e) => {
    if (mode !== "demo" || !started) return;
    if (e.target.closest("#operator")) {
      pointerInside = false;
      return;
    }
    pointerX = e.clientX / window.innerWidth;
    pointerInside = true;
    gaze.observe(pointerX, performance.now());
  },
  { passive: true },
);
document.addEventListener("pointerout", (e) => {
  if (!e.relatedTarget && mode === "demo") {
    pointerInside = false;
    event("pointer-left");
  }
});
$("startCamera").onclick = camera;
$("cancelStart").onclick = ()=>{
  stopCamera();gaze.reset();
  $("startupStatus").textContent="카메라 시작을 취소했습니다. 다시 시작하거나 마우스 시연을 선택하세요.";
};
$("startDemo").onclick = () => demo();
$("startFullscreen").onclick = fullscreen;
$("startScreen").onclick = (e) => {
  if (e.target === $("startScreen")) camera();
};
$("operatorHandle").onclick = () => togglePanel();
$("closePanel").onclick = () => togglePanel(false);
$("fullscreen").onclick = fullscreen;
$("reconnect").onclick = camera;
$("stopCamera").onclick = () => {
  stopCamera();
  gaze.reset();
  fillPanel();
};
$("demoMode").onchange = (e) => {
  if (e.target.checked) demo();
  else camera();
};
for (const el of document.querySelectorAll("[data-setting]"))
  el.addEventListener("input", () => {
    config[el.dataset.setting] =
      el.type === "checkbox" ? el.checked :
        el.type === "select-one" ? el.value : Number(el.value);
    save();
    if (el.dataset.setting === "sound")
      ambient
        .set(config.sound)
        .catch(() => showNotice("소리를 시작하지 못했어요."));
  });
$("cameraSelect").onchange = (e) => {
  config.deviceId = e.target.value;
  save();
};
$("resetCenter").onclick = () => {
  gaze.reset();
  lastFace = null;
};
$("calibrateCenter").onclick = () => {
  if (!lastFace || performance.now() - lastFace.at > 700) {
    showNotice("실제 얼굴이 감지된 뒤 중앙 기준을 저장하세요.");
    return;
  }
  config.cameraCenter = config.mirror ? 1 - lastFace.x : lastFace.x;
  save();
  gaze.reset();
  showNotice("현재 위치를 중앙 기준으로 저장했어요.");
};
$("resetSettings").onclick = () => {
  config = { ...defaults };
  save();
  gaze.reset();
  ambient.set(false);
};
$("exportLog").onclick = () => {
  const log = {
      date: new Date().toISOString(),
      mode,
      camera: {
        state: cameraState,
        frames: frameCount,
        settings: cameraSettings
          ? {
              width: cameraSettings.width,
              height: cameraSettings.height,
              frameRate: cameraSettings.frameRate,
            }
          : null,
      },
      tracking: { worker: workerState, results: trackResults, faceResults },
      selection: {policy:config.viewerPolicy,count:viewer.count,switches:viewer.switches,reason:viewer.reason},
      render: frameStats(),
      renderAll: allFrameStats(),
      inferenceAll: {
        count: inferTotal.count,
        meanMs: inferTotal.count ? inferTotal.totalMs / inferTotal.count : 0,
        maxMs: inferTotal.maxMs,
      },
      trackingRange: trackingRange.count ? trackingRange : null,
      inferenceSamples: inferences.length,
      eyeRedraws: renderedFrames,
      config: { ...config, deviceId: undefined },
      events,
      note: "카메라 이미지·영상·얼굴 특징/관절 기록 없음. 실제 관객 정확도는 현장 시험 필요.",
    },
    a = document.createElement("a"),
    u = URL.createObjectURL(
      new Blob([JSON.stringify(log, null, 2)], { type: "application/json" }),
    );
  a.href = u;
  a.download = "gogwan-validation.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};
document.addEventListener("keydown", (e) => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key.toLowerCase() === "d") togglePanel();
  if (e.key.toLowerCase() === "f") fullscreen();
  if (e.key.toLowerCase() === "r") gaze.reset();
  if (e.key === "Escape" && !$("operator").hidden) togglePanel(false);
});
document.addEventListener("visibilitychange", () => {
  event(document.hidden ? "hidden" : "visible");
  if (!document.hidden) {
    lastFrameAt = performance.now();
    lastPost = lastFrameAt;
    lastTick = lastFrameAt;
  }
});
window.addEventListener("beforeunload", () => {
  stopCamera();
  ambient.close();
});
fillPanel();
loadAssets().then(()=>{
  $("startCamera").disabled = $("startDemo").disabled = false;
  $("startupStatus").textContent = "관객 한 명의 좌우 움직임을 따라봅니다.";
}).catch((e) => {
  $("startupStatus").textContent = `영정을 준비하지 못했습니다. ${e.message}`;
  $("startCamera").disabled = $("startDemo").disabled = true;
});
requestAnimationFrame(loop);
document.dispatchEvent(new Event("gogwan-app-ready"));
