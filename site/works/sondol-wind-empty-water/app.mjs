import { clamp, DEFAULTS, keyboardWind, PHASE, Score, windBands } from './score.mjs?v=wet-lens';
import { Sea } from './sea.mjs?v=wet-lens';
import { Sound } from './sound.mjs?v=wet-lens';
import { WindInput } from '../sondol-wind/microphone.mjs';

const get=id=>document.getElementById(id);
const theatre=get('theatre'), panel=get('operator'), entry=get('entry');
const cache='sondol-wind.empty-water.v1';
const controls={sensitivity:'sensitivity',minimum:'minimum',storm:'storm',lost:'lost',waves:'waves',
  boat:'boat',mist:'mist',master:'master',water:'water-volume',wind:'wind-volume',effects:'effects'};
const labels={CALM:'잔잔한 물길',WIND:'바람',STORM:'폭풍',BOAT_LOST:'배 소실',AFTERMATH:'배가 사라진 뒤 돌풍',
  EMPTY_WATER:'빈 물길',RECOVERY:'물길 복귀'};
const score=new Score();
const sea=new Sea(get('screen'),get('water'),get('stage'));
const sound=new Sound();
const mic=new WindInput();
const settings={...DEFAULTS};
let active=false, pressedAt=null, manual=0, noticeTimer, disposed=false;
let frameAt=0, last=0, reportAt=0, soundAt=0, fpsAt=0, frames=0, fps=0, slowWindows=0, autoLow=false;

let saved;
try { saved=JSON.parse(localStorage.getItem(cache)) ?? {}; } catch { saved={}; }
if (typeof saved.device==='string') settings.device=saved.device.slice(0,512);
for (const [key,id] of Object.entries(controls)) {
  const el=get(id), output=get(key+'-value');
  settings[key]=Number.isFinite(saved[key]) ? clamp(saved[key],Number(el.min),Number(el.max)) : DEFAULTS[key];
  el.value=settings[key];
  const show=()=>{output.value=key==='minimum' ? settings[key]+' ms' : Math.round(settings[key]*100)+'%';};
  show();
  el.addEventListener('input',()=>{settings[key]=Number(el.value); show(); apply();});
}
for (const key of ['muted','low','autoReset']) {
  const el=get(key);
  if (typeof saved[key]==='boolean') settings[key]=saved[key];
  el.checked=settings[key];
  el.addEventListener('change',()=>{settings[key]=el.checked; apply();});
}
score.settings=settings;
mic.configure(settings);

function apply() {
  mic.configure(settings);
  try { localStorage.setItem(cache,JSON.stringify(settings)); } catch {}
  if (active) sound.update(score.view,settings);
}

function notice(message) {
  clearTimeout(noticeTimer);
  get('notice').value=message;
  noticeTimer=setTimeout(()=>{get('notice').value='';},5700);
}

function fullscreen() {
  const operation=document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.();
  operation?.catch(()=>notice('전체 화면이 제한된 환경에서는 브라우저 전체 화면을 사용하세요.'));
}

async function fillDevices() {
  const list=await mic.devices(), select=get('device');
  select.replaceChildren(new Option('기본 마이크',''),...list.map((device,index)=>new Option(device.label||'마이크 '+(index+1),device.deviceId)));
  if (settings.device && !list.some(device=>device.deviceId===settings.device))
    select.add(new Option('이전에 선택한 마이크',settings.device));
  select.value=settings.device;
}

function activate() {
  if (active) return sound.open();
  active=true;
  const ctx=sound.open();
  entry.inert=true;
  theatre.classList.add('active');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  return ctx;
}

async function connect({expand=false,notify=false}={}) {
  const ctx=activate();
  const connection=mic.connect(ctx);
  if (expand && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
  const ok=await connection;
  await fillDevices();
  if (!ok && notify && mic.generation>0) notice(mic.label);
}

function operator() {
  pressedAt=null;
  if (panel.open) panel.close();
  else { panel.showModal(); fillDevices(); display(performance.now()); }
}

function setManual(value) {
  manual=value;
  get('manual').value=String(value);
  get('manual-value').value=Math.round(value*100)+'%';
}

function test(state) {
  activate();
  setManual(0);
  pressedAt=null;
  score.force(state);
  display(performance.now());
}

function display(now) {
  reportAt=now;
  theatre.dataset.phase=score.state;
  theatre.dataset.renderer=sea.mode;
  const strength=windBands(score.wind).label;
  theatre.dataset.wind=strength;
  if (!panel.open) return;
  get('phase').textContent=labels[score.state];
  get('charge').textContent=Math.round(score.view.progression*100)+'%';
  get('level').value=clamp(Math.sqrt(mic.data.level)*1.55);
  get('gust').value=score.wind;
  get('wind-band').value=strength;
  get('mic-status').value=mic.label+(mic.data.floor ? ' · 기준 '+Math.round(20*Math.log10(mic.data.floor))+' dBFS' : '');
  get('audio-status').value=sound.context?.state==='running' ?
    (sound.ready ? '재생 가능 · '+sound.buffers.size+'개 음향' : '음향 불러오는 중') : '오디오 대기';
  get('performance').value=(fps ? fps+' FPS · ' : '')+sea.mode+(autoLow && !settings.low ? ' · 자동 저부하' : '');
  get('media-status').value=sea.ready ? (sea.boat ? '수면과 나룻배 준비됨' : '나룻배 이미지 불러오기 오류') : '장면 불러오는 중';
}

function loop(now) {
  if (disposed) return;
  requestAnimationFrame(loop);
  if (document.hidden) return;
  let dt=last ? Math.min(1.1,(now-last)/1000) : .016;
  last=now;
  if (active) {
    const before=score.view;
    const inputAt=time=>Math.max(pressedAt===null ? 0 : keyboardWind((time-pressedAt)/1000),manual,mic.data.value);
    while (dt>.12) {
      score.step(.12,inputAt(now-(dt-.12)*1000));
      dt-=.12;
    }
    score.step(dt,inputAt(now));
    if (score.state!==before.state) display(now);
    if (now-soundAt>72 || score.state!==before.state) {
      sound.update(score.view,settings);
      soundAt=now;
    }
  }
  const view=score.view;
  const low=settings.low || autoLow;
  if (!frameAt || now-frameAt>=(low ? 1000/30-1 : 1000/60-2)) {
    const delta=frameAt ? Math.min(1.1,(now-frameAt)/1000) : .016;
    sea.draw(delta,view,low===settings.low ? settings : {...settings,low});
    frameAt=now;
    frames++;
  }
  if (!fpsAt) fpsAt=now;
  if (now-fpsAt>=1600) {
    fps=Math.round(frames*1000/(now-fpsAt));
    if (!low && !view.inCut && sea.ready && sea.water.hidden===false) {
      slowWindows=fps<38 ? slowWindows+1 : 0;
      if (slowWindows>=3) autoLow=true;
    }
    frames=0;
    fpsAt=now;
  }
  if (now-reportAt>140) display(now);
}

get('start').onclick=()=>connect({expand:true,notify:true});
get('preview').onclick=()=>{activate(); mic.stop();};
get('connect').onclick=()=>connect();
get('keyboard').onclick=()=>{activate(); mic.stop();};
get('calibrate').onclick=()=>{if (!mic.calibrate()) notice('마이크를 연결한 뒤 소음 기준을 측정하세요.');};
get('device').onchange=event=>{settings.device=event.target.value; apply(); if (active) connect();};
get('manual').oninput=event=>{activate(); setManual(Number(event.target.value));};
get('storm-test').onclick=()=>{test(PHASE.CALM); score.charge=settings.storm+.045; setManual(.91);};
get('lost-test').onclick=()=>test(PHASE.BOAT_LOST);
get('empty-test').onclick=()=>test(PHASE.EMPTY_WATER);
get('reset').onclick=()=>test(PHASE.CALM);
get('fullscreen').onclick=fullscreen;
get('resume').onclick=activate;
panel.addEventListener('close',()=>{pressedAt=null; setManual(0);});
window.addEventListener('keydown',event=>{
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const editing=event.target instanceof Element && Boolean(event.target.closest('input, select, textarea, [contenteditable]'));
  if (event.code==='KeyD' && !event.repeat && !editing) { event.preventDefault(); operator(); }
  if (event.code==='KeyF' && !event.repeat && !editing) { event.preventDefault(); fullscreen(); }
  if (event.code==='Space' && !panel.open && !editing) {
    event.preventDefault();
    if (!active) { activate(); mic.stop(); }
    pressedAt??=performance.now();
  }
});
window.addEventListener('keyup',event=>{if (event.code==='Space') pressedAt=null;});
window.addEventListener('blur',()=>{pressedAt=null;});
document.addEventListener('visibilitychange',()=>{
  pressedAt=null;
  if (document.hidden) sound.context?.suspend().catch(()=>{});
  else {
    last=frameAt=fpsAt=frames=0;
    if (active) sound.context?.resume().catch(()=>{});
  }
});
navigator.mediaDevices?.addEventListener('devicechange',fillDevices);
window.addEventListener('pagehide',()=>{disposed=true; mic.stop(); sound.close();},{once:true});
window.addEventListener('pageshow',event=>{if (event.persisted) location.reload();});
requestAnimationFrame(loop);
