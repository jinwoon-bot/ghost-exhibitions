import {SignalLibrary} from './signals.js?v=4.2.0';
const library=new SignalLibrary(),status=document.getElementById('status'),cards=document.getElementById('cards'),filter=document.getElementById('filter');let playing=null;
const names={songaksi:'손각시',mongdal:'몽달귀신',changgwi:'창귀',gogwandaemyeon:'고관대면',yeopjeon:'엽전사귀',seongju:'성주신'};
function render(){playing?.pause();playing=null;cards.replaceChildren();const episodes=library.episodes.filter(e=>filter.value==='all'||e.kind===filter.value);status.className='';status.textContent=episodes.length+'편 · 하나씩 골라 듣거나 실제 통화에 연결하세요.';
 for(const e of episodes){const article=document.createElement('article');article.className='card';const meta=document.createElement('span');meta.className='meta';meta.textContent=e.id.toUpperCase()+' · '+(e.kind==='voice'?'짧은 음성':'잡음만')+' · '+e.duration.toFixed(1)+'초';const title=document.createElement('h2');title.textContent=e.title;const p=document.createElement('p');p.textContent=e.description;
 const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=new URL('../'+e.file+'?sha='+e.sha256,import.meta.url);audio.setAttribute('aria-label',e.title+' 듣기');audio.onplay=()=>{if(playing&&playing!==audio)playing.pause();playing=audio;};audio.onerror=()=>{status.className='error';status.textContent=e.title+' 음원을 읽지 못했습니다. 전체 파일 복사/연결 상태를 확인하세요.';};
 const link=document.createElement('a');link.href='./?episode='+encodeURIComponent(e.id)+'&v=4.0.0';link.textContent=(e.kind==='voice'?names[e.actorId]+' · ':'')+'이 연출로 전화 받기 →';article.append(meta,title,p,audio,link);cards.append(article);
 }}
filter.onchange=render;window.addEventListener('pagehide',()=>{playing?.pause();library.clear();});
library.init().then(render).catch(e=>{status.className='error';status.textContent='목록 준비 실패 · '+e.message;filter.disabled=true;});
