import { clamp, CUT, DEFAULTS, PHASE, Score, smooth } from './score.mjs';
import { Sea } from './sea.mjs?v=river-travel';
import { Sound } from './sound.mjs';
import { WindInput } from './microphone.mjs';

const get=id=>document.getElementById(id);
const theatre=get('theatre'), panel=get('operator'), entry=get('entry'), video=get('cut');
const cache='sondol-wind.exhibit.v1';
const controls={sensitivity:'sensitivity',minimum:'minimum',storm:'storm',lost:'lost',waves:'waves',
  boat:'boat',mist:'mist',master:'master',water:'water-volume',wind:'wind-volume',effects:'effects'};
const labels={CALM:'잔잔한 물길',WIND:'바람',STORM:'폭풍',BOAT_LOST:'배 소실',SILENCE:'정적',
  HAND_REVEAL:'손 등장',GHOST_REVEAL:'손돌의 응시',RECOVERY:'물길 복귀'};
const score=new Score();
const sea=new Sea(get('screen'),get('water'),get('stage'));
const sound=new Sound();
const mic=new WindInput();
const settings={...DEFAULTS};
let active=false, pressed=false, manual=0, noticeTimer, disposed=false;
let frameAt=0, last=0, reportAt=0, soundAt=0, fpsAt=0, frames=0, fps=0, slowWindows=0, autoLow=false;

class Film {
  constructor(element) {
    this.element=element;
    this.serial=-1;
    this.mode='idle';
    this.serialAtError=-1;
    element.addEventListener('error',()=>{
      if (this.mode==='video') this.fallback();
    });
  }

  start(view, now) {
    this.serial=view.serial;
    this.startTime=view.cut;
    this.changedAt=now;
    this.lastTime=view.cut;
    const el=this.element;
    if (el.readyState<2 || el.error) { this.fallback(); return; }
    this.mode='video';
    try {
      el.currentTime=view.cut;
      el.hidden=false;
      const serial=this.serial;
      el.play().catch(()=>{if (serial===this.serial && this.mode==='video' && !document.hidden) this.fallback();});
    } catch { this.fallback(); }
  }

  fallback() {
    this.serialAtError=this.serial;
    this.mode='still';
    this.element.pause();
    this.element.hidden=true;
  }

  clock(view,now) {
    if (!view.inCut) return null;
    if (this.serial!==view.serial) this.start(view,now);
    if (this.mode!=='video') return null;
    const el=this.element;
    if (!el.seeking && el.currentTime>this.lastTime+.005) {
      this.changedAt=now;
      this.lastTime=el.currentTime;
    }
    if (now-this.changedAt>1550 && !el.ended) { this.fallback(); return null; }
    if (el.ended) return CUT.end;
    return el.seeking ? this.startTime : Math.max(this.startTime,el.currentTime);
  }

  compose(view) {
    const el=this.element;
    if (this.mode!=='video') return;
    if (!view.inCut) { this.clear(); return; }
    const focus=view.state===PHASE.HAND_REVEAL ? 'hand' : 'ghost';
    if (el.dataset.focus!==focus) el.dataset.focus=focus;
    const opacity=smooth(CUT.hand,CUT.hand+.38,view.cut)*(1-smooth(12.1,CUT.end,view.cut));
    el.style.opacity=opacity.toFixed(3);
  }

  clear() {
    this.serial=-1;
    this.mode='idle';
    this.element.pause();
    this.element.hidden=true;
    this.element.style.opacity=0;
  }

  resume(now) {
    this.changedAt=now;
    if (this.mode==='video' && score.view.inCut) this.element.play().catch(()=>this.fallback());
  }
}

const movie=new Film(video);
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
  pressed=false;
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
  pressed=false;
  movie.clear();
  score.force(state);
  display(performance.now());
}

function display(now) {
  reportAt=now;
  theatre.dataset.phase=score.state;
  theatre.dataset.renderer=sea.mode;
  if (!panel.open) return;
  get('phase').textContent=labels[score.state];
  get('charge').textContent=Math.round(score.view.progression*100)+'%';
  get('level').value=clamp(Math.sqrt(mic.data.level)*1.55);
  get('gust').value=score.wind;
  get('mic-status').value=mic.label+(mic.data.floor ? ' · 기준 '+Math.round(20*Math.log10(mic.data.floor))+' dBFS' : '');
  get('audio-status').value=sound.context?.state==='running' ?
    (sound.ready ? '재생 가능 · '+sound.buffers.size+'개 음향' : '음향 불러오는 중') : '오디오 대기';
  get('performance').value=(fps ? fps+' FPS · ' : '')+sea.mode+(autoLow && !settings.low ? ' · 자동 저부하' : '');
  get('media-status').value=video.error || movie.serialAtError===score.serial ?
    '영상 읽기 오류 · 합성 장면으로 계속 진행' : video.readyState>=2 ? '등장 영상 준비됨' : '등장 영상 불러오는 중';
}

function loop(now) {
  if (disposed) return;
  requestAnimationFrame(loop);
  if (document.hidden) return;
  let dt=last ? Math.min(1.1,(now-last)/1000) : .016;
  last=now;
  if (active) {
    const before=score.view;
    const time=movie.clock(before,now);
    const input=Math.max(pressed ? 1 : 0,manual,mic.data.value);
    while (dt>.12 && time===null && (!score.view.inCut || movie.mode==='still')) {
      score.step(.12,input);
      dt-=.12;
    }
    if (score.view.inCut && time===null && movie.mode!=='still') dt=0;
    score.step(dt,input,time);
    if (score.state!==before.state) display(now);
    if (now-soundAt>72 || score.state!==before.state) {
      sound.update(score.view,settings);
      soundAt=now;
    }
  }
  const view=score.view;
  movie.compose(view);
  const low=settings.low || autoLow;
  if (!frameAt || now-frameAt>=(low ? 1000/30-1 : 1000/60-2)) {
    const delta=frameAt ? Math.min(1.1,(now-frameAt)/1000) : .016;
    sea.draw(delta,view,low===settings.low ? settings : {...settings,low},movie.mode==='still');
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
get('storm-test').onclick=()=>{test(PHASE.CALM); score.charge=settings.storm+.045; setManual(.84);};
get('lost-test').onclick=()=>test(PHASE.BOAT_LOST);
get('hand-test').onclick=()=>test(PHASE.HAND_REVEAL);
get('ghost-test').onclick=()=>test(PHASE.GHOST_REVEAL);
get('reset').onclick=()=>test(PHASE.CALM);
get('fullscreen').onclick=fullscreen;
get('resume').onclick=activate;
panel.addEventListener('close',()=>{pressed=false; setManual(0);});
window.addEventListener('keydown',event=>{
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const editing=event.target instanceof Element && Boolean(event.target.closest('input, select, textarea, [contenteditable]'));
  if (event.code==='KeyD' && !event.repeat && !editing) { event.preventDefault(); operator(); }
  if (event.code==='KeyF' && !event.repeat && !editing) { event.preventDefault(); fullscreen(); }
  if (event.code==='Space' && !panel.open && !editing) {
    event.preventDefault();
    if (!active) { activate(); mic.stop(); }
    pressed=true;
  }
});
window.addEventListener('keyup',event=>{if (event.code==='Space') pressed=false;});
window.addEventListener('blur',()=>{pressed=false;});
document.addEventListener('visibilitychange',()=>{
  pressed=false;
  if (document.hidden) { video.pause(); sound.context?.suspend().catch(()=>{}); }
  else {
    last=frameAt=fpsAt=frames=0;
    if (active) { sound.context?.resume().catch(()=>{}); movie.resume(performance.now()); }
  }
});
navigator.mediaDevices?.addEventListener('devicechange',fillDevices);
window.addEventListener('pagehide',()=>{disposed=true; movie.clear(); mic.stop(); sound.close();},{once:true});
window.addEventListener('pageshow',event=>{if (event.persisted) location.reload();});
requestAnimationFrame(loop);
