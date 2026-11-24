import { Camera } from '../src/camera.mjs';
import { FaceInput } from './detector.mjs';
import { COPY, FINALE, Episode, Proximity, clamp, smooth } from './episode.mjs?v=scene-polish';
import { BroadcastAudio } from './audio.mjs?v=hard-cut';
import { NewsPicture, SignalPicture, clearPhoto, drawCover, loadImage, webcamPortrait } from './visual.mjs?v=hard-cut';
import { DistanceReadings, minimumRange, rangeLimit } from './distance.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const cameraSetup = params.get('camera') === '1';
const defaults = { near: .37, far: .11, mirror: true, lowLight: true, volume: .55, device: '' };
const key = 'dongmyeong-missing-exhibit-settings-v1';
const settings = loadSettings();
const screen = $('screen'), panel = $('operator'), video = $('input');
const portrait = $('portrait'), paper = $('paper');
const prox = new Proximity(), episode = new Episode();
const distance = new DistanceReadings();
const audio = new BroadcastAudio('assets/news.wav');
const signal = new SignalPicture($('signal'));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const glyphs = COPY.map(row => Array.from(row.text));
const copyNodes = [$('line-0'), $('line-1'), $('line-2'), $('small-line')];

let mode = 'idle', fallback, defaultPhoto, news, program, filmed;
let latest = null, stableAt = 0, portraitAt = 0, portraitLocked = false;
let cameraState = '카메라 대기', modelState = '', audioError = '', luma = null, faceKind = '';
let generation = 0, busy = false, retryAt = 0, retryCount = 0;
let demo = 0, manual = false, cameraWanted = false, chosenHeadline = -1;
let boot = performance.now(), lastFrame = 0, lastStatus = 0, lastAudio = 0;
let intensity = 0, lastPhase = 'normal', typed = 0;
let detectedAt = null, lastIdentMs = null, lastNoticeMs = null;

function loadSettings() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(key) || localStorage.getItem('dongnam-missing-exhibit-settings-v1') || '{}') || {}; } catch {}
  const number = (value, normal, min, max) => Number.isFinite(value) ? clamp(value, min, max) : normal;
  const far = number(data.far, defaults.far, rangeLimit.farMin, rangeLimit.farMax);
  return {
    far,
    near: number(data.near ?? defaults.near, Math.max(defaults.near, far + minimumRange),
      Math.max(rangeLimit.nearMin, far + minimumRange), rangeLimit.nearMax),
    mirror: typeof data.mirror === 'boolean' ? data.mirror : true,
    lowLight: typeof data.lowLight === 'boolean' ? data.lowLight : true,
    volume: number(data.volume, defaults.volume, 0, .8),
    device: typeof data.device === 'string' ? data.device : '',
  };
}

function save() {
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch {}
  syncSettings();
}

function syncSettings() {
  $('far').value = settings.far;
  $('near').value = settings.near;
  $('far-value').value = settings.far.toFixed(3);
  $('near-value').value = settings.near.toFixed(3);
  $('volume').value = settings.volume;
  $('mirror').checked = settings.mirror;
  $('low-light').checked = settings.lowLight;
  video.classList.toggle('mirror', settings.mirror);
}

const camera = new Camera(video, ({ state, label, message }) => {
  const labels = { off: '카메라 대기', requesting: '카메라 권한 확인 중', connected: '카메라 연결됨', live: label || '카메라 작동 중' };
  cameraState = labels[state] || message || state;
  if (['stalled', 'disconnected'].includes(state)) {
    clearObservation();
    scheduleRetry();
  }
  status();
});

const face = new FaceInput(sample => {
  if (mode === 'camera' && cameraWanted && !document.hidden) receive(sample);
}, message => {
  modelState = message;
  status();
});

function receive({ candidates, luma: light, now }) {
  if (performance.now() - now > 760) return;
  luma = light;
  const best = candidates.reduce((maximum, item) => !maximum || item.score > maximum.score ? item : maximum, null);
  prox.feed(now, best);
  faceKind = best?.kind || '';
  if (!best) {
    if (latest && now - latest.now > 370) latest = null;
    distance.clear();
    if (episode.phase === 'normal') detectedAt = null;
    return;
  }
  const matching = latest && now - latest.now < 340 && latest.kind === best.kind &&
    Math.hypot(latest.x - best.x, latest.y - best.y) < .105 &&
    Math.abs(latest.score - best.score) < .13;
  if (!matching) {
    stableAt = now;
    distance.clear();
  }
  latest = { ...best, now };
  distance.feed(now, best.kind, best.score);
  if (episode.phase === 'normal' && !manual) detectedAt ??= now;
  if (++receive.count % 12 === 0) status();
}
receive.count = 0;

function clearObservation() {
  latest = null;
  stableAt = 0;
  luma = null;
  faceKind = '';
  distance.clear();
  detectedAt = null;
  prox.lastSeen = prox.lastAnalysis = -Infinity;
}

function clearPortrait() {
  clearPhoto(portrait);
  clearPhoto(paper);
  portraitLocked = false;
  delete screen.dataset.portrait;
}

function resetEpisode() {
  episode.reset();
  clearPortrait();
  manual = false;
  typed = 0;
  portraitAt = 0;
  lastPhase = 'normal';
  detectedAt = null;
  for (const node of copyNodes) {
    node.textContent = '';
    node.classList.remove('typing');
  }
  for (const id of ['station-card', 'notice', 'final-shot', 'shock-cut']) scene(id, 0);
  screen.dataset.phase = 'normal';
}

function scene(id, alpha) {
  const layer = $(id);
  const opacity = alpha < .008 ? '0' : alpha.toFixed(3);
  const hidden = String(alpha < .45);
  if (layer.style.opacity !== opacity) layer.style.opacity = opacity;
  if (layer.getAttribute('aria-hidden') !== hidden) layer.setAttribute('aria-hidden', hidden);
}

function lockPortrait(now) {
  if (portraitLocked) return;
  const canUseFace = mode === 'camera' && !manual && $('allow-face').checked;
  let image = fallback;
  let kind = 'fallback';
  if (canUseFace) {
    portraitAt ||= now;
    const stable = latest?.kind === 'face' && now - latest.now < 335 &&
      latest.now - stableAt >= 195 && video.readyState >= 2 && camera.healthy(now);
    if (stable) {
      try {
        image = webcamPortrait(video, latest, settings.mirror, settings.lowLight ? luma : 95);
        kind = 'audience';
      } catch {}
    }
    if (kind !== 'audience' && faceKind !== 'person' && now - portraitAt < 590) return;
  }
  if (!image) return;
  const photo = portrait.getContext('2d');
  photo.filter = 'saturate(.66) contrast(1.07)';
  drawCover(photo, image, portrait.width, portrait.height);
  const held = paper.getContext('2d');
  held.filter = 'saturate(.46) brightness(1.11)';
  drawCover(held, portrait, paper.width, paper.height);
  if (kind === 'audience') clearPhoto(image);
  portraitLocked = true;
  screen.dataset.portrait = kind;
}

function type(t) {
  let visible = 0;
  for (let i = 0; i < COPY.length; i++) {
    const { start, step } = COPY[i];
    const count = t < start ? 0 : Math.min(glyphs[i].length, 1 + Math.floor((t - start) / step));
    const result = glyphs[i].slice(0, count).join('');
    if (copyNodes[i].textContent !== result) copyNodes[i].textContent = result;
    copyNodes[i].classList.toggle('typing', count > 0 && count < glyphs[i].length);
    visible += count;
  }
  if (visible > typed) audio.type();
  typed = visible;
}

function status() {
  const now = performance.now();
  const observation = luma === null ? '' : ' · 밝기 ' + Math.round(luma);
  const delayed = luma !== null && now - prox.lastAnalysis > 700;
  const detection = delayed ? ' · 분석 결과 지연' : faceKind === 'face' ? ' · 얼굴 감지' :
    faceKind === 'person' ? ' · 사람 영역 감지 / 대체 사진 적용' : '';
  const dark = !delayed && luma !== null && luma < 22 && !faceKind ? ' · 어두운 상태 / 수동 송출 가능' : '';
  $('status').value = (mode === 'demo' ? '마우스 데모' : cameraState) + (mode === 'camera' && modelState ? ' · ' + modelState : '') + observation + detection + dark + audioError;
  $('connect').disabled = $('start-camera-exhibit').disabled = busy || !news;
  $('intensity').value = intensity;
  const reading = mode === 'camera' ? distance.read(now) : null;
  $('mark-far').disabled = !reading?.stable;
  $('mark-near').disabled = !reading?.stable;
  const distanceStatus = reading
    ? `${reading.kind === 'face' ? '얼굴 폭' : '사람 영역'} ${reading.score.toFixed(3)} · ${reading.stable ? '기록 가능' : '자세 유지 중'} · 강도 ${Math.round(intensity * 100)}%`
    : '현재 거리값 없음';
  if ($('distance-status').textContent !== distanceStatus) $('distance-status').textContent = distanceStatus;
  const timing = lastIdentMs === null ? '' : `최근 자동 송출 · 안내 카드 ${lastIdentMs}ms${lastNoticeMs === null ? '' : ` · 실종 공지 ${lastNoticeMs}ms`}`;
  if ($('notice-timing').textContent !== timing) $('notice-timing').textContent = timing;
}

async function devices() {
  const select = $('device');
  try {
    const inputs = await camera.devices();
    select.replaceChildren(new Option('기본 웹캠', ''));
    for (const [i, device] of inputs.entries()) {
      if (device.deviceId) select.append(new Option(device.label || '웹캠 ' + (i + 1), device.deviceId));
    }
    select.value = settings.device;
    if (select.selectedIndex < 0) select.value = '';
  } catch {}
}

function scheduleRetry() {
  if (!cameraWanted || retryAt || retryCount >= 3) return;
  retryAt = performance.now() + 1600 * (retryCount + 1);
}

function stopInputs() {
  generation++;
  busy = false;
  cameraWanted = false;
  retryAt = 0;
  retryCount = 0;
  camera.stop();
  face.stop();
  modelState = '';
  clearObservation();
}

async function connect(retry = false) {
  if (busy || !news) return false;
  if (!retry) {
    stopInputs();
    resetEpisode();
  }
  const request = ++generation;
  busy = true;
  cameraWanted = true;
  mode = 'camera';
  status();
  try {
    await camera.start({ cameraId: settings.device, cameraWidth: 960 });
    if (request !== generation) return false;
    const connectedId = camera.stream?.getVideoTracks()[0]?.getSettings().deviceId;
    if (settings.device && connectedId && connectedId !== settings.device) {
      camera.stop();
      throw Error('선택한 웹캠이 연결되지 않았습니다. 다른 장치를 선택하세요.');
    }
    await devices();
    if (request !== generation) return false;
    await face.start(settings.lowLight);
    if (request !== generation) return false;
    retryCount = 0;
    return true;
  } catch (error) {
    if (request !== generation) return false;
    camera.stop();
    face.stop();
    cameraState = error.message;
    if (retry) scheduleRetry();
    return false;
  } finally {
    if (request === generation) {
      busy = false;
      status();
    }
  }
}

async function setAudio(enabled) {
  audioError = '';
  try {
    if (enabled && !audio.enabled) await audio.start(programTime(performance.now()));
    if (!enabled) audio.enabled = false;
    $('sound-toggle').textContent = audio.enabled ? '소리 끄기' : '소리 켜기';
  } catch (error) {
    audioError = ' · 소리 연결 실패: ' + error.message;
  }
  status();
  return audio.enabled === enabled;
}

function toggleAudio() {
  return setAudio(!audio.enabled);
}

async function startCameraExhibit() {
  const [soundReady, connected] = await Promise.all([setAudio(true), connect()]);
  if (soundReady && connected && mode === 'camera' && camera.stream && panel.open) panel.close();
}

function programTime(now) {
  const clock = audio.time() ?? (now - boot) / 1000;
  return clock % (program?.duration || 1);
}

function setHeadline(time) {
  const index = program.stories.findLastIndex(story => time >= story.start);
  if (index !== chosenHeadline) {
    chosenHeadline = index;
    $('headline').textContent = program.stories[index]?.headline || program.stories[0].headline;
  }
  const minute = Math.floor(time / 60) + 42;
  const clock = '18:' + String(minute).padStart(2, '0');
  if ($('clock').textContent !== clock) $('clock').textContent = clock;
}

function syncFilm(time) {
  if (!filmed || filmed.readyState < 2) return false;
  if (Math.abs(filmed.currentTime - time) > .36 && !filmed.seeking) filmed.currentTime = time;
  if (filmed.paused) filmed.play().catch(() => {});
  const ctx = $('anchor').getContext('2d');
  drawCover(ctx, filmed, 960, 720);
  return true;
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !news) return;
  if (now - lastFrame < 29) return;
  const step = Math.min(.58, (now - (lastFrame || now)) / 1000);
  lastFrame = now;

  if (mode === 'camera' && cameraWanted) {
    const live = camera.healthy(now);
    if (live) face.tick(video, now, settings.lowLight);
    if (face.stalled(now)) {
      modelState = '인식이 멈춰 재연결 대기 중';
      face.stop();
      scheduleRetry();
    }
    if (retryAt && now >= retryAt && !busy) {
      retryAt = 0;
      retryCount++;
      connect(true);
    }
  }

  const override = manual ? .98 : mode === 'demo' ? demo : null;
  intensity = prox.update(now, step, settings.far, settings.near, override);
  const present = manual || (mode === 'demo' && demo >= .34) ||
    (mode === 'camera' && cameraWanted && prox.present(now));
  if (episode.update(step, intensity, present)) resetEpisode();
  const { phase, age, alpha } = episode;
  if (phase !== lastPhase) {
    if (phase === 'ident') {
      audio.ident();
      if (detectedAt !== null && !manual) {
        const delay = now - detectedAt;
        lastIdentMs = delay <= 1000 ? Math.round(delay) : null;
        lastNoticeMs = null;
      }
    }
    if (phase === 'reveal') audio.shutter();
    if (phase === 'scare') audio.scare();
    if (phase === 'cooldown') {
      manual = false;
      clearPortrait();
    }
    lastPhase = phase;
    screen.dataset.phase = phase;
  }

  const t = programTime(now);
  const burst = phase === 'notice' ? 1 - smooth(.035, .56, age)
    : phase === 'scare' ? .88 * (1 - smooth(.035, .21, age)) : 0;
  const overlay = Math.max(...Object.values(alpha));
  const stress = ['notice', 'reveal', 'scare'].includes(phase) ? .27 + .65 * intensity : 0;
  const voice = program.envelope[Math.floor(t * program.envelopeRate)] / 255 || 0;
  if (overlay < .994) {
    if (!syncFilm(t)) news.draw(t, voice, stress * .55, reduced.matches);
    setHeadline(t);
  }
  scene('station-card', alpha.ident);
  scene('notice', alpha.notice);
  scene('final-shot', alpha.reveal);
  scene('shock-cut', alpha.interrupt);
  if (phase === 'notice' && alpha.notice >= .45 && detectedAt !== null && !manual) {
    const delay = now - detectedAt;
    lastNoticeMs = lastIdentMs !== null && delay < 3800 ? Math.round(delay) : null;
    detectedAt = null;
  }
  if (phase === 'notice') {
    lockPortrait(now);
    const campusOpacity = (1 - smooth(.64, 2.15, episode.dossierTime)).toFixed(3);
    if ($('notice-campus').style.opacity !== campusOpacity) $('notice-campus').style.opacity = campusOpacity;
    type(episode.dossierTime);
  }
  const silent = phase === 'cut' || (phase === 'reveal' && age >= FINALE.corridor - FINALE.silence);
  signal.draw(now, phase === 'cut' ? 0 : stress, phase === 'cut' ? 0 : alpha.reveal, reduced.matches, burst, phase);
  if (now - lastAudio >= 57) {
    lastAudio = now;
    audio.update(settings.volume, stress, overlay, alpha.reveal, reduced.matches ? burst * .35 : burst, silent);
  }

  if (panel.open && now - lastStatus >= 580) {
    lastStatus = now;
    status();
  }
}

function operator() {
  if (panel.open) panel.close();
  else { panel.showModal(); devices(); status(); }
}

function full() {
  const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  request?.catch(error => { cameraState = error.message; status(); });
}

function manualStart() {
  if (!news) return;
  resetEpisode();
  manual = true;
  if (panel.open) panel.close();
}

function demoMode() {
  stopInputs();
  resetEpisode();
  mode = 'demo';
  demo = 0;
  $('demo-distance').value = '0';
  status();
}

function calibrate(side, score) {
  if (side === 'near') settings.near = clamp(score, Math.max(rangeLimit.nearMin, settings.far + minimumRange), rangeLimit.nearMax);
  else settings.far = clamp(score, rangeLimit.farMin, Math.min(rangeLimit.farMax, settings.near - minimumRange));
  save();
}

$('connect').onclick = () => connect();
$('start-camera-exhibit').onclick = startCameraExhibit;
$('disconnect').onclick = () => { stopInputs(); mode = 'idle'; resetEpisode(); status(); };
$('manual').onclick = manualStart;
$('reset').onclick = () => { resetEpisode(); prox.filtered = 0; demo = 0; $('demo-distance').value = '0'; clearObservation(); };
$('sound-toggle').onclick = toggleAudio;
$('fullscreen').onclick = full;
$('mirror').onchange = e => { settings.mirror = e.target.checked; save(); };
$('allow-face').onchange = () => { if (screen.dataset.portrait === 'audience') resetEpisode(); };
$('low-light').onchange = e => { settings.lowLight = e.target.checked; if (settings.lowLight) face.enableBackup(); save(); };
$('device').onchange = e => { settings.device = e.target.value; save(); if (mode === 'camera') connect(); };
$('volume').oninput = e => { settings.volume = Number(e.target.value); save(); };
for (const side of ['far', 'near']) {
  $(side).oninput = e => {
    calibrate(side, Number(e.target.value));
    $('calibration-feedback').textContent = '';
  };
  $('mark-' + side).onclick = () => {
    const measurement = distance.read(performance.now());
    if (!measurement?.stable || mode !== 'camera') return;
    const { score, kind } = measurement;
    if (side === 'near' && score - settings.far < minimumRange) {
      $('calibration-feedback').textContent = '가까운 점과 먼 점의 차이가 너무 작습니다. 조금 더 가까이 서거나 먼 점을 다시 기록하세요.';
      return;
    }
    calibrate(side, score);
    $('calibration-feedback').textContent = `${side === 'far' ? '먼 점' : '가까운 점'} ${settings[side].toFixed(3)} 기록 · ${kind === 'face' ? '얼굴 기준' : '사람 영역 기준'}`;
  };
}

$('fallback').onchange = async ({ target }) => {
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  const label = $('fallback-status');
  if (file.size > 20 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    label.textContent = '20MB 이하 PNG, JPEG, WebP 파일을 선택하세요.';
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const decoded = await loadImage(url);
    const thumb = new OffscreenCanvas(360, 450);
    drawCover(thumb.getContext('2d'), decoded, 360, 450);
    fallback = thumb;
    label.textContent = '대체 사진 적용 · 현재 탭에서 사용';
  } catch {
    label.textContent = '사진을 열 수 없습니다. 다른 파일을 선택하세요.';
  } finally {
    URL.revokeObjectURL(url);
  }
};

$('restore-fallback').onclick = () => { fallback = defaultPhoto; $('fallback-status').textContent = '기본 창작 인물 사진'; };
$('mouse-mode').onclick = demoMode;
$('demo-distance').oninput = ({ target }) => {
  const value = Number(target.value);
  if (mode !== 'demo') demoMode();
  demo = value;
  target.value = String(value);
};

screen.addEventListener('pointermove', e => {
  if (mode !== 'demo' || panel.open) return;
  const rect = screen.getBoundingClientRect();
  demo = clamp(1 - (e.clientY - rect.top) / rect.height);
  $('demo-distance').value = demo.toFixed(2);
});
screen.addEventListener('pointerleave', () => {
  if (mode === 'demo') { demo = 0; $('demo-distance').value = '0'; }
});
screen.addEventListener('dblclick', () => operator());
window.addEventListener('keydown', e => {
  const target = e.target;
  const typing = target?.isContentEditable || target?.tagName === 'TEXTAREA' ||
    (target?.tagName === 'INPUT' && /^(text|search|email|password|tel|url|number)$/.test(target.type));
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || typing) return;
  const letter = e.key.toLowerCase();
  if (letter === 'd') operator();
  if (letter === 'f') full();
  if (letter === 'm') toggleAudio();
  if (e.code === 'Space' && !target?.closest?.('button,input,select,summary')) {
    e.preventDefault();
    manualStart();
  }
});
navigator.mediaDevices?.addEventListener('devicechange', () => {
  devices();
  if (cameraWanted && !['live', 'connected', 'requesting'].includes(camera.state)) {
    retryCount = 0;
    scheduleRetry();
  }
});
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  if (document.hidden) {
    audio.update(0, 0, 0, 0);
    clearObservation();
    prox.filtered = 0;
    resetEpisode();
  }
});
window.addEventListener('pagehide', () => {
  stopInputs();
  clearPortrait();
  audio.close();
});
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

syncSettings();
if (!cameraSetup && params.has('demo')) demoMode();
if (cameraSetup || params.has('operator') || params.has('demo')) operator();
$('camera-start-hint').hidden = !cameraSetup;

Promise.all([
  loadImage('assets/anchor-plate.png'),
  loadImage('assets/sample-portrait.jpg'),
  fetch('assets/news.json').then(response => {
    if (!response.ok) throw Error('뉴스 편성 파일을 찾을 수 없습니다.');
    return response.json();
  }),
  ...['campus', 'hall-day', 'hall-night'].map(name => loadImage('assets/' + name + '.jpg')),
  loadImage('assets/hall-close.webp'),
]).then(([anchor, sample, rundown]) => {
  news = new NewsPicture($('anchor'), anchor);
  defaultPhoto = fallback = sample;
  program = rundown;
  if (program.video) {
    filmed = document.createElement('video');
    filmed.muted = true;
    filmed.loop = true;
    filmed.playsInline = true;
    filmed.src = program.video;
  }
  connectReady();
  boot = performance.now();
  requestAnimationFrame(frame);
}).catch(error => {
  $('fault').hidden = false;
  $('fault').textContent = '방송 자료를 열 수 없습니다.';
  cameraState = error.message;
  status();
});

function connectReady() {
  screen.dataset.phase = 'normal';
  screen.dataset.ready = 'true';
  status();
  if (cameraSetup && panel.open) $('start-camera-exhibit').focus();
}
