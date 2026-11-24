import { CameraInput } from '../js/camera.js';
import { cameraHelp } from '../js/environment.js';
import { ScreenAwake } from '../js/awake.js';
import { PoseHistory } from './history.mjs?v=clones';
import { ExhibitionPicture } from './picture.mjs?v=clones';
import { ExhibitionSound } from './sound.mjs';

const element = id => document.getElementById(id);
const screen = element('exhibition');
const setup = element('setup');
const panel = element('settings');
const video = element('video');
const camera = new CameraInput(video, announce);
const awake = new ScreenAwake();
const history = new PoseHistory();
const picture = new ExhibitionPicture(element('stage'));
const audio = new ExhibitionSound();
const input = document.createElement('canvas');
const inputCtx = input.getContext('2d', { willReadFrequently: true });
const key = 'chang-gwi-frozen-poses-v1';
const defaults = {device:'', mirror:true, frequency:1.6, lifetime:5.5, erosion:1, people:1, sensitivity:.55, quality:'auto', sound:false, awake:true};
const ranges = {frequency:[.35, 2.6], lifetime:[3, 16], erosion:[0, 1.6], sensitivity:[.2, .85]};
const prof = {
  low: { resolution: 320, every: 205, stage: 920, grains: 185, totalGrains: 620, maxEchoes: 7, fps: 24, plumeScale: .50 },
  high: { resolution: 512, every: 75, stage: 1550, grains: 510, totalGrains: 1850, maxEchoes: 13, fps: 36, plumeScale: .83 },
};
const sample = '../assets/demo/pose_1.mp4';
let settings = savedSettings(), mode = 'idle', request = 0, running = false, starting = false;
video.classList.toggle('mirror', settings.mirror);
let chosenSource = null, sourceURL = null, wantCamera = false, retries = 0, tryAgain = 0;
let frameBusy = null, previousVideoTime = -1, inferenceAt = 0, lastDraw = 0, lastStatus = 0;
let averageInference = 0, renderingFPS = 0, frames = 0, outputs = 0, errors = 0, failureText = '';
let retryProfile = false, ended = false;

function savedSettings() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
  const copy = {...defaults};
  for (const [name, [min,max]] of Object.entries(ranges)) {
    if (Number.isFinite(data[name])) copy[name] = Math.max(min, Math.min(max, data[name]));
  }
  for (const name of ['mirror','sound','awake']) if (typeof data[name] === 'boolean') copy[name] = data[name];
  if (['auto','low','high'].includes(data.quality)) copy.quality = data.quality;
  if ([1,2,3].includes(data.people)) copy.people = data.people;
  if (typeof data.device === 'string') copy.device = data.device.slice(0, 512);
  return copy;
}

function save() {
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
}

function quality() {
  if (settings.quality === 'low') return prof.low;
  if (settings.quality === 'high') return prof.high;
  return (camera.net && camera.backend !== 'webgl') || averageInference > 155 ? prof.low : prof.high;
}

function announce(message) {
  failureText = message;
  element('setup-status').textContent = message;
  report();
}

function report() {
  screen.dataset.mode = running ? mode : starting ? 'starting' : 'idle';
  screen.dataset.captures = String(history.captures);
  screen.dataset.released = String(history.released);
  screen.dataset.echoes = String(history.echoes.length);
  screen.dataset.live = String(history.tracks.filter(track => !track.missing).length);
  screen.dataset.results = String(outputs);
  const q = quality();
  element('status').textContent = [
    failureText || '입력 대기',
    '실시간 마스크 ' + screen.dataset.live + ' · 잔상 ' + history.echoes.length + '/' + q.maxEchoes +
      ' · 흩어진 조각 ' + picture.pieces,
    (camera.net ? camera.backend.toUpperCase() + ' 인물 분리 · ' : '') +
      Math.round(renderingFPS) + ' 화면 FPS · ' + Math.round(averageInference) + 'ms 분석 · ' +
      (picture.plume.enabled ? 'WebGL 먹 입자' : 'Canvas 2D 합성'),
    history.ambiguous ? '관객이 겹쳐 있는 동안 새 잔상 생성을 보류합니다.' : '',
  ].filter(Boolean).join('\n');
  for (const id of ['camera-start','sample-start','reconnect','panel-sample']) element(id).disabled = starting;
  element('sample-label').hidden = !(running && mode === 'demo');
}

async function listDevices() {
  const select = element('devices');
  try {
    const all = await navigator.mediaDevices?.enumerateDevices() || [];
    select.replaceChildren(new Option('이 PC의 기본 카메라', ''));
    for (const [i, device] of all.filter(d => d.kind === 'videoinput').entries()) {
      if (device.deviceId) select.append(new Option(device.label || '웹캠 ' + (i + 1), device.deviceId));
    }
    select.value = settings.device;
    if (select.selectedIndex < 0) select.value = '';
  } catch {}
}

function clearInput() {
  request++;
  running = false;
  starting = false;
  frameBusy = null;
  previousVideoTime = -1;
  inferenceAt = 0;
  averageInference = 0;
  errors = 0;
  video.hidden = true;
  camera.stop();
  camera.stopWorker();
  if (sourceURL) URL.revokeObjectURL(sourceURL);
  sourceURL = null;
  video.removeAttribute('src');
  video.load();
  inputCtx.clearRect(0,0,input.width,input.height);
  const preview = element('preview');
  preview.getContext('2d').clearRect(0,0,preview.width,preview.height);
  history.clear();
}

async function start(sourceMode, source = sample, retry = false) {
  if (starting) return;
  clearInput();
  if (!retry) retries = 0;
  mode = sourceMode;
  chosenSource = sourceMode === 'demo' ? source : null;
  if (!retry) wantCamera = false;
  starting = true;
  const token = request;
  setup.hidden = false;
  announce(sourceMode === 'camera' ? '카메라와 인물 분리 준비 중…' : '시연 영상과 인물 분리 준비 중…');
  if (settings.sound) audio.enable(true).catch(e => announce(e.message));
  const q = quality();
  const ai = { backend:settings.quality === 'low' || retryProfile ? 'cpu' : 'auto', model:settings.quality === 'low' ? 'mobile' : 'resnet', inputSize:q.resolution, quality:'high' };
  try {
    if (sourceMode === 'camera') {
      video.loop = false;
      if (!(await camera.start(settings.device, ai))) return;
    } else {
      sourceURL = typeof source === 'string' ? null : URL.createObjectURL(source);
      video.src = sourceURL || source;
      video.loop = true;
      await video.play();
      if (request !== token) return;
      await camera.load(ai);
    }
    if (request !== token) return;
    wantCamera = sourceMode === 'camera';
    if (wantCamera) {
      settings.device = camera.selectedId;
      save();
      listDevices();
    }
    running = true;
    retries = 0;
    setup.hidden = true;
    panel.close();
    awake.enable(settings.awake);
    announce(wantCamera ? '실시간 웹캠 · 움직이면 이전 자세를 남깁니다.' : '시연 영상에서 실제 인물 마스크를 추출 중입니다.');
  } catch (error) {
    if (request !== token) return;
    running = false;
    camera.stop();
    camera.stopWorker();
    const cause = cameraHelp(error);
    announce(cause.message || error.message);
    if (retry && ['permission','permission-pending','security','ai-error','ai-timeout','worker-error'].includes(cause.code)) wantCamera = false;
    tryAgain = performance.now() + 3000 * Math.max(1, retries);
  } finally {
    if (request === token) {
      starting = false;
      report();
    }
  }
}

function stop() {
  wantCamera = false;
  retries = 0;
  mode = 'idle';
  chosenSource = null;
  clearInput();
  setup.hidden = false;
  awake.enable(false);
  announce('입력을 종료했습니다.');
}

function frameCanvas(resolution) {
  const sw = video.videoWidth, sh = video.videoHeight;
  if (!sw || !sh) return false;
  const scale = Math.min(1, resolution / Math.max(sw, sh));
  const w = Math.max(64, Math.round(sw * scale)), h = Math.max(64, Math.round(sh * scale));
  if (input.width !== w || input.height !== h) { input.width = w; input.height = h; }
  inputCtx.save();
  if (settings.mirror) { inputCtx.translate(w, 0); inputCtx.scale(-1, 1); }
  inputCtx.drawImage(video, 0, 0, w, h);
  inputCtx.restore();
  return true;
}

async function analyze(now, q) {
  const stamp = video.currentTime;
  if (frameBusy || !camera.net || now - inferenceAt < q.every || stamp === previousVideoTime) return;
  if (!frameCanvas(q.resolution)) return;
  if (mode === 'demo' && stamp + .22 < previousVideoTime) history.tracks = [];
  previousVideoTime = stamp;
  inferenceAt = now;
  const token = request;
  const job = {};
  frameBusy = job;
  try {
    const masks = await camera.segment(input, settings, 'high');
    if (request !== token || frameBusy !== job || document.hidden) return;
    const finish = performance.now();
    const spent = finish - now;
    averageInference = averageInference ? averageInference * .82 + spent * .18 : spent;
    history.update(masks, finish, {...settings, maxEchoes:q.maxEchoes}, inputCtx);
    outputs++;
    errors = 0;
  } catch (error) {
    if (request !== token || error.code === 'cancelled') return;
    if (++errors >= 2 || error.code === 'ai-timeout') {
      running = false;
      retryProfile = true;
      setup.hidden = false;
      announce('인물 분리 지연 · 저사양으로 다시 시작하거나 영상을 선택하세요.');
      if (wantCamera) tryAgain = performance.now() + 2500;
    }
  } finally {
    if (frameBusy === job) frameBusy = null;
  }
}

function updatePreview() {
  const preview = element('preview');
  if (!panel.open || !preview.parentElement.open || video.readyState < 2) return;
  const ctx = preview.getContext('2d');
  ctx.save();
  if (settings.mirror) { ctx.translate(preview.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, preview.width, preview.height);
  ctx.restore();
}

function loop(now) {
  if (ended) return;
  requestAnimationFrame(loop);
  if (document.hidden) return;
  const q = quality();
  history.prune(now);
  const live = mode === 'camera' ? camera.healthy(now) : video.readyState >= 2 && !video.paused;
  const showVideo = running && live;
  if (video.hidden === showVideo) video.hidden = !showVideo;
  if (running && live) analyze(now, q);
  if (wantCamera && !starting && (!running || !live) && now >= tryAgain) {
    if (retries < 3) {
      retries++;
      tryAgain = now + retries * 3500;
      start('camera', null, true);
    } else {
      wantCamera = false;
      running = false;
      setup.hidden = false;
      announce('카메라 연결을 확인한 뒤 다시 시작하세요.');
    }
  }
  if (frameBusy && now - inferenceAt > 18000) {
    camera.stopWorker();
    frameBusy = null;
    running = false;
    retryProfile = true;
    setup.hidden = false;
    tryAgain = now + 2500;
    announce('인물 모델 응답 지연 · 저사양으로 다시 시작할 수 있습니다.');
  }
  if (now - lastDraw >= 1000 / q.fps - 1) {
    picture.resize(q.stage);
    picture.draw(history, now, q, showVideo ? video : null);
    lastDraw = now;
    frames++;
  }
  for (const echo of history.echoes) {
    if (!echo.sounded && now - echo.born > (echo.until - echo.born) * .23) {
      echo.sounded = true;
      audio.rip(echo.seed);
    }
  }
  if (now - lastStatus >= 650) {
    renderingFPS = frames * 1000 / (now - lastStatus);
    frames = 0;
    lastStatus = now;
    report();
    updatePreview();
    audio.update(history.activity, history.tracks.length, running);
  }
}

function togglePanel() {
  if (panel.open) panel.close();
  else { listDevices(); report(); panel.showModal(); }
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    announce('전체화면 권한을 확인하거나 F11을 사용하세요.');
  }
}

element('camera-start').onclick = element('reconnect').onclick = () => { retryProfile = false; start('camera'); };
element('sample-start').onclick = element('panel-sample').onclick = () => { retryProfile = false; start('demo'); };
element('settings-open').onclick = togglePanel;
element('fullscreen').onclick = fullscreen;
element('stop').onclick = stop;
element('file').onchange = ({target}) => {
  const file = target.files?.[0];
  target.value = '';
  if (file) { retryProfile = false; start('demo', file); }
};
for (const id of Object.keys(ranges)) {
  const field = element(id), out = element(id + '-value');
  field.value = String(settings[id]);
  out.value = settings[id].toFixed(id === 'lifetime' ? 1 : 2);
  field.oninput = () => {
    settings[id] = Number(field.value);
    out.value = settings[id].toFixed(id === 'lifetime' ? 1 : 2);
    save();
  };
}
for (const name of ['mirror','sound','awake']) element(name).checked = settings[name];
for (const name of ['people','quality']) element(name).value = String(settings[name]);
element('devices').onchange = ({target}) => {
  settings.device = target.value;
  save();
  if (mode === 'camera') { retryProfile = false; start('camera'); }
};
element('mirror').onchange = ({target}) => {
  settings.mirror = target.checked;
  video.classList.toggle('mirror', settings.mirror);
  save();
  history.clear();
  previousVideoTime = -1;
  if (frameBusy) request++;
};
element('people').onchange = ({target}) => { settings.people = Number(target.value); history.tracks = []; save(); };
element('quality').onchange = ({target}) => {
  settings.quality = target.value;
  save();
  retryProfile = false;
  if (running) start(mode, chosenSource);
};
element('sound').onchange = ({target}) => {
  settings.sound = target.checked;
  save();
  audio.enable(settings.sound).catch(e => announce(e.message));
};
element('awake').onchange = ({target}) => { settings.awake = target.checked; save(); awake.enable(running && settings.awake); };
screen.addEventListener('dblclick', togglePanel);
window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
  if (e.key.toLowerCase() === 'd') togglePanel();
  if (e.key.toLowerCase() === 'f') fullscreen();
});
navigator.mediaDevices?.addEventListener('devicechange', listDevices);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.update(0, false, false);
    return;
  }
  lastStatus = lastDraw = 0;
  if (running) awake.enable(settings.awake);
});
window.addEventListener('pagehide', () => {
  ended = true;
  clearInput();
  awake.enable(false);
  audio.dispose();
  picture.dispose();
});
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
if (new URLSearchParams(location.search).has('operator')) togglePanel();
listDevices();
requestAnimationFrame(loop);
