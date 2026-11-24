import {SoundDesk} from './audio.js?v=scene-polish';
import {progressiveCalls} from './progressive.js?v=scene-polish';

const desk=new SoundDesk(), call=progressiveCalls[0];
const buttons=[...document.querySelectorAll('[data-profile]')];
const stop=document.querySelector('#stop'), status=document.querySelector('#status'), progress=document.querySelector('#progress');
const labels={fixed:'A · 처음부터 강한 변조',progressive:'B · 점진적 변조',ending:'C · 마지막 변조'};
let bytes, current;

function clearPlayback() {
  if(!current)return;
  current.abort.abort();
  cancelAnimationFrame(current.frame);
  current=null;
  desk.stop();
  stop.disabled=true;
  for(const button of buttons)button.setAttribute('aria-pressed','false');
}

async function play(profile) {
  clearPlayback();
  const run={abort:new AbortController()};
  current=run;
  progress.value=0;
  status.textContent=labels[profile]+' 준비 중';
  stop.disabled=false;
  for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.profile===profile));
  try{
    await desk.unlock();
    try{
      const id=JSON.parse(localStorage.getItem('ghost-phone:settings:v1')||'{}')?.output;
      if(id)await desk.setOutput('voice',id);
    }catch{}
    await desk.play(bytes,{signal:run.abort.signal,volume:.45,progressive:{profile,finalAt:call.finalAt},onStart:duration=>{
      const start=desk.voice.currentTime+.035;
      status.textContent=labels[profile]+' 재생 중';
      const paint=()=>{
        if(current!==run)return;
        progress.value=Math.max(0,(desk.voice.currentTime-start)/duration);
        run.frame=requestAnimationFrame(paint);
      };
      paint();
    }});
    if(current===run){progress.value=1;status.textContent='재생 완료';}
  }catch(error){if(current===run)status.textContent='재생 오류 · '+error.message;}
  finally{if(current===run)clearPlayback();}
}

for(const button of buttons)button.onclick=()=>play(button.dataset.profile);
stop.onclick=()=>{clearPlayback();status.textContent='중단됨';};
window.addEventListener('pagehide',clearPlayback);
fetch(new URL('../'+call.file,import.meta.url),{signal:AbortSignal.timeout(15000)})
  .then(response=>{if(!response.ok)throw Error(response.status);return response.arrayBuffer();})
  .then(buffer=>{bytes=buffer;for(const button of buttons)button.disabled=false;status.textContent='재생할 비교를 선택하세요.';})
  .catch(error=>{status.textContent='창귀 원음 준비 실패 · '+error.message;});
