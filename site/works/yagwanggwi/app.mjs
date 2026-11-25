import { Score, STATES, thresholds } from './score.mjs?v=double-clap';
import { Scene } from './scene.mjs?v=approach-film';
import { Sound } from './sound.mjs?v=double-clap';
import { Microphone } from './microphone.mjs?v=double-clap';
import { DEFAULT_CLAP_INTERVAL } from './clap.mjs?v=double-clap';

const element = id => document.getElementById(id);
const panel = element('operator');
const theatre = element('theatre');
const key = 'yagwanggwi-exhibit-v1';
const slider = {
  sensitivity:[.15,.95,.55], interval:[150,850,DEFAULT_CLAP_INTERVAL],
  master:[0,1,.73], voice:[0,1,.85], fx:[0,1,.57], room:[0,1,.32],
};
const booleans = {muted:false,safe:false,hideCursor:true,autoReset:true};
const labels = {
  [STATES.IDLE]:'대기', [STATES.COUNTING]:'숫자 세기', [STATES.INTERRUPTED]:'방해받음',
  [STATES.AGITATED]:'짜증 누적', [STATES.LUNGE]:'야광귀 등장', [STATES.REVEAL]:'클라이맥스',
  [STATES.QUIET]:'정적', [STATES.RESET]:'진정 중',
};
let active = false, starting = false, disposed = false, preferredMic = true;
let error = '', fps = 0, frames = 0, clock = 0, drawAt = 0, sampleAt = 0, low = false, lowSince = 0;
let settings = readSettings();
const scene = new Scene(element('picture'), element('frame'), element('approach-film'), message => announce(message));
const sound = new Sound(() => report());
const microphone = new Microphone(() => clap(), () => report());
const score = new Score((...event) => sound.event(...event));
score.configure(settings);
microphone.configure(settings);

function readSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  const oldPreset = !saved.reactionVersion && saved.first === 2 && saved.many === 4 && saved.final === 7;
  const current = {...booleans,...thresholds(oldPreset ? undefined : saved),device:typeof saved.device === 'string' ? saved.device.slice(0,512) : ''};
  for (const [name,[min,max,start]] of Object.entries(slider)) {
    current[name] = Number.isFinite(saved[name]) ? Math.max(min,Math.min(max,saved[name])) : start;
  }
  if (!saved.doubleClapVersion && saved.interval === 290) current.interval = DEFAULT_CLAP_INTERVAL;
  for (const name of Object.keys(booleans)) if (typeof saved[name] === 'boolean') current[name] = saved[name];
  return current;
}

function saveSettings() {
  try { localStorage.setItem(key,JSON.stringify({...settings,reactionVersion:1,doubleClapVersion:1})); } catch {}
}

function applySettings() {
  score.configure(settings);
  sound.configure(settings);
  microphone.configure(settings);
  theatre.classList.toggle('cursorless',active && settings.hideCursor && !panel.open);
  saveSettings();
  report();
}

function report(now = performance.now()) {
  const view = score.view(now);
  theatre.dataset.state = active ? view.state : 'PREVIEW';
  if (!panel.open) return;
  element('state').textContent = active ? labels[view.state] : '시작 전';
  element('count').textContent = view.count || '—';
  element('strikes').textContent = view.strikes;
  element('eyes').textContent = view.eyes + '단계 · ' + scene.visibleEyes + '개';
  element('mic-status').textContent = microphone.status;
  element('level').value = Math.min(1,Math.sqrt(microphone.level)*1.62);
  element('mic-readings').textContent = '마이크 박수 ' + microphone.count + '회 · 소음 기준 ' +
    (microphone.floor ? Math.round(20*Math.log10(microphone.floor)) + ' dBFS' : '—');
  element('voice-status').textContent = sound.voiceStatus();
  element('perf').textContent = (fps ? fps+' FPS · ' : '') +
    (settings.safe ? '안전 모드' : low ? '자동 저부하' : '전시 품질') +
    ' · 오디오 ' + (sound.ctx?.state === 'running' ? '재생 가능' : '대기');
  element('error').textContent = error;
}

function announce(message) {
  error = message;
  if (!active) element('start-status').textContent = message;
  report();
}

async function fillDevices() {
  const list = await microphone.devices();
  const select = element('device');
  select.replaceChildren(new Option('기본 마이크',''));
  for (const [i,device] of list.entries()) {
    if (device.deviceId) select.add(new Option(device.label || '마이크 '+(i+1),device.deviceId));
  }
  if (settings.device && !list.some(item => item.deviceId === settings.device)) {
    select.add(new Option('저장한 장치',settings.device));
  }
  select.value = settings.device;
}

async function fullScreen(onlyEnter = false) {
  try {
    if (document.fullscreenElement) {
      if (!onlyEnter) await document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch {
    announce('전체 화면 권한을 사용할 수 없습니다. 전시 브라우저에서 F11을 사용할 수 있습니다.');
  }
}

async function openAudio() {
  try {
    const ctx = await sound.start(settings);
    if (ctx.state !== 'running') announce('오디오가 대기 중입니다. 운영실에서 오디오를 다시 켜세요.');
    return ctx;
  } catch (cause) {
    announce(cause.message || '오디오를 시작할 수 없습니다.');
    return null;
  }
}

async function attachMic() {
  const ctx = sound.ctx?.state === 'running' ? sound.ctx : await openAudio();
  if (!preferredMic || !active || disposed) return false;
  if (!ctx) { microphone.stop('오디오 연결 실패 · Space로 체험'); return false; }
  const ok = await microphone.start(ctx,settings.device);
  await fillDevices();
  return ok;
}

async function start(useMic, goFullScreen) {
  if (starting || disposed || active) return active;
  starting = true;
  preferredMic = useMic;
  element('start').disabled = true;
  const audio = openAudio();
  if (goFullScreen) fullScreen(true);
  await scene.ready;
  if (disposed) return false;
  active = true;
  starting = false;
  score.reset(performance.now());
  element('welcome').hidden = true;
  theatre.classList.toggle('cursorless',settings.hideCursor && !panel.open);
  if (useMic) audio.then(() => attachMic());
  else microphone.stop();
  report();
  return true;
}

function clap() {
  if (!active || document.hidden || !score.interrupt(performance.now(),settings.interval)) return;
  report();
}

function operate(action) {
  if (active) { action(); return; }
  start(false,false).then(started => { if (started) action(); });
}

function togglePanel() {
  if (panel.open) { panel.close(); return; }
  theatre.classList.remove('cursorless');
  panel.showModal();
  fillDevices();
  report();
}

function loop(now) {
  if (disposed) return;
  requestAnimationFrame(loop);
  if (document.hidden) return;
  if (active) score.step(now);
  const isLow = low || settings.safe;
  if (!drawAt || now-drawAt >= (isLow ? 1000/30-1 : 1000/60-2)) {
    scene.resize(isLow);
    scene.draw(now,score.view(now),isLow,settings.safe);
    drawAt = now;
    frames++;
  }
  if (!clock) clock = now;
  if (now-clock >= 1800) {
    fps = Math.round(frames*1000/(now-clock));
    if (!settings.safe) {
      if (!low && fps < 41) { low = true; lowSince = now; }
      if (low && now-lowSince > 10000 && fps >= 29 && scene.visibleEyes < 3 && score.state === STATES.IDLE) low = false;
    }
    clock = now;
    frames = 0;
  }
  if (now-sampleAt > 180) {
    report(now);
    sampleAt = now;
  }
}

for (const [name] of Object.entries(slider)) {
  const input = element(name), output = element(name+'-value');
  const valueText = () => { output.value = name === 'interval' ? settings[name]+' ms' : Math.round(settings[name]*100)+'%'; };
  input.value = settings[name];
  valueText();
  input.oninput = () => { settings[name] = Number(input.value); valueText(); applySettings(); };
}
for (const name of Object.keys(booleans)) {
  const checkbox = element(name);
  checkbox.checked = settings[name];
  checkbox.onchange = () => { settings[name] = checkbox.checked; applySettings(); };
}
for (const name of ['first','many','final']) {
  const input = element(name);
  input.value = settings[name];
  input.onchange = () => {
    settings = {...settings,...thresholds({...settings,[name]:input.value})};
    for (const id of ['first','many','final']) element(id).value = settings[id];
    applySettings();
  };
}
element('device').onchange = ({target}) => {
  settings.device = target.value;
  saveSettings();
  if (active && preferredMic) attachMic();
};
element('start').onclick = () => start(true,true);
element('connect').onclick = () => {
  if (!active) start(true,false);
  else { preferredMic = true; attachMic(); }
};
element('calibrate').onclick = () => {
  if (!microphone.calibrate()) announce('먼저 마이크를 연결하세요.');
};
element('keyboard').onclick = () => {
  preferredMic = false;
  microphone.stop();
};
element('clap-test').onclick = () => operate(clap);
element('reveal').onclick = () => operate(() => { score.reveal(performance.now()); report(); });
element('quiet').onclick = () => operate(() => { score.quiet(performance.now()); report(); });
element('reset').onclick = () => {
  if (!active) return;
  score.reset(performance.now());
  sound.event('reset');
  report();
};
element('fullscreen').onclick = () => fullScreen();
element('resume').onclick = () => openAudio();
panel.addEventListener('close',() => theatre.classList.toggle('cursorless',active && settings.hideCursor));
window.addEventListener('keydown',event => {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key.toLowerCase() === 'd') { event.preventDefault(); togglePanel(); }
  else if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullScreen(); }
  else if (event.code === 'Space' && (!active || !panel.open)) {
    event.preventDefault();
    operate(clap);
  }
});
navigator.mediaDevices?.addEventListener('devicechange',fillDevices);
window.speechSynthesis?.addEventListener('voiceschanged',() => report());
document.addEventListener('visibilitychange',() => {
  if (!active || disposed) return;
  if (document.hidden) sound.ctx?.suspend().catch(()=>{});
  else {
    drawAt = clock = frames = 0;
    score.reset(performance.now());
    sound.ctx?.resume().then(()=>sound.event('reset')).catch(()=>announce('운영실에서 오디오를 다시 켜세요.'));
  }
});
window.addEventListener('pagehide',() => { disposed = true; microphone.stop(); sound.dispose(); }, {once:true});
window.addEventListener('pageshow',event => { if (event.persisted) location.reload(); });
scene.ready.then(ok => {
  element('start').disabled = false;
  if (!ok) announce('시각 소스를 읽지 못했습니다. 오디오와 박수는 운영실에서 확인할 수 있습니다.');
});
requestAnimationFrame(loop);
