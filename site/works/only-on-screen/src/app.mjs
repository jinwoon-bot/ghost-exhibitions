import {loadConfig,saveConfig,PRESETS,sanitize} from './config.mjs';
import {Experience} from './experience.mjs';
import {Observer} from './tracking.mjs';
import {GhostAssets} from './assets.mjs';
import {Vision} from './vision.mjs';
import {Camera} from './camera.mjs';
import {Compositor} from './compositor.mjs';
import {RoomSound} from './sound.mjs';

const $=id=>document.getElementById(id),config=loadConfig(),video=$('input-video');
const assets=new GhostAssets(),observer=new Observer(config),experience=new Experience(config);
const compositor=new Compositor($('exhibition'),assets,config),sound=new RoomSound();
const metrics={startedAt:new Date().toISOString(),frames:[],inferences:[],transitions:[],errors:[],cameraFrames:0,resultCount:0};
let mode='off',sourceGeneration=0,loading=false,visionState='off',cameraState='off',started=false,lastResult=null;
let clock=0,lastFrame=performance.now(),sessionStart=0,lastUi=0,lastAdapt=0,sourceURL=null,restarts=0,lastSampleVideoTime=-1,sampleLastFrame=0;
let lastState='WAITING',lastView=experience.view(0),lastObservation={valid:false,present:false,facing:'unknown'},lastRender={},reportedWatchdog=false;
let qualityName=config.quality==='auto'?'normal':config.quality,qaScene='auto',scripted=false;
const stageNames=['먼 흔적','중간 거리','어깨 뒤'];
const labels={WAITING:'대기',MIRROR:'거울',FIRST_PRESENCE:'첫 존재',OBSERVATION_BREAK:'관찰 중단',CLOSE_PRESENCE:'근접',RESET:'초기화'};
const camera=new Camera(video,s=>{
  cameraState=s.state;
  if(s.state==='requesting'){$('source-state').textContent='WAITING CAMERA';notice('Chrome의 카메라 권한 창에서 허용하세요. 권한 응답을 기다리고 있습니다. 취소하려면 운영 설정의 입력 중지.');}
  if(s.message)notice(s.message);
  if(s.state==='live'){$('source-state').textContent='CAMERA LIVE';$('signal-led').classList.add('live');notice('');refreshDevices();}
  if(['disconnected','stalled','error'].includes(s.state)){$('signal-led').classList.remove('live');observer.clear();}
});
const vision=new Vision((r)=>{
  lastResult=r;visionState='ready';const now=clock;metrics.resultCount++;metrics.inferences.push(r.inferenceMs);if(metrics.inferences.length>3600)metrics.inferences.shift();
  const age=(performance.now()-r.sourceMs)/1000;
  if(age>1.2)return;
  observer.people=r.poses.length;observer.ingest(r,now);compositor.ingest(r,now-age);
},s=>{
  visionState=s.state;
  if(s.message){metrics.errors.push({time:clock,message:s.message});if(metrics.errors.length>30)metrics.errors.shift();notice(s.message);}
  if(s.state==='loading')notice('로컬 인물 분리·얼굴 방향 모델 준비 중… 카메라 영상과 AI 분석은 별도 실행됩니다.');
  if(s.state==='ready')notice('');
});

function notice(text){$('notice')?.remove();if(!text)return;const node=document.createElement('div');node.id='notice';node.className='notice';node.setAttribute('role','status');node.textContent=text;$('screen').append(node);}
function resizeOutput(){const p=PRESETS[qualityName]||PRESETS.normal;const ratio=video.videoWidth&&video.videoHeight?video.videoWidth/video.videoHeight:16/9;compositor.resize(p.render,config.aspect,ratio);document.body.classList.toggle('monochrome',config.monochrome);}
function setQuality(name){qualityName=name;const p=PRESETS[name]||PRESETS.normal;vision.width=p.width;vision.hz=p.hz;resizeOutput();}
function syncControls(){for(const el of document.querySelectorAll('[data-config]')){const k=el.dataset.config;if(el.type==='checkbox')el.checked=config[k];else el.value=String(config[k]);if(el.nextElementSibling?.tagName==='OUTPUT')el.nextElementSibling.value=config[k];}for(const el of document.querySelectorAll('input[type=range][data-config]')){const out=el.parentElement.querySelector('output');if(out)out.textContent=config[el.dataset.config];}$('sound').checked=config.sound;$('mask-debug').checked=config.maskDebug;}
function persist(){saveConfig(config);compositor.lastPlacement=null;}
function reset(){experience.reset(clock);observer.clear();compositor.clear();assets.reset();lastState='WAITING';sessionStart=clock;metrics.transitions.push({time:clock,state:'MANUAL_RESET'});}
function panel(open=!(!$('operator').hidden)){$('operator').hidden=!open;$('operator-toggle').setAttribute('aria-expanded',String(open));}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else {await document.documentElement.requestFullscreen();document.body.classList.add('exhibit');panel(false);}}catch(e){notice('전체화면을 열지 못했습니다. Chrome F11을 사용하세요.');}}
function busy(value){loading=value;for(const id of ['start-camera','start-demo','reconnect','demo-mode'])$(id).disabled=value;}
async function stopSource(){camera.stop();video.pause();video.srcObject=null;video.removeAttribute('src');video.load();if(sourceURL){URL.revokeObjectURL(sourceURL);sourceURL=null;}vision.stop();observer.clear();compositor.clear();assets.reset();started=false;lastSampleVideoTime=-1;$('signal-led').classList.remove('live');}
async function refreshDevices(){try{const selected=config.cameraId,devices=await camera.devices(),select=$('camera-select');select.replaceChildren(new Option('기본 카메라 자동 선택',''));for(const [i,d] of devices.entries())select.add(new Option(d.label||`카메라 ${i+1}`,d.deviceId));select.value=devices.some(d=>d.deviceId===selected)?selected:'';}catch{}}
async function startSource(nextMode,file){
  if(loading)return;const gen=++sourceGeneration;busy(true);await stopSource();mode=nextMode;reset();$('report-view').hidden=true;notice('');
  qaScene='auto';$('qa-scene').value='auto';scripted=false;$('scripted-demo').checked=false;
  $('qa-scene').disabled=nextMode!=='demo';$('scripted-demo').disabled=nextMode!=='demo';
  $('demo-label').hidden=nextMode!=='demo';
  try{
    await assetReady;
    if(nextMode==='camera'){
      if(!isSecureContext)throw Error('카메라는 HTTPS 배포 주소 또는 localhost에서 실행하세요. file:// 직접 열기는 지원하지 않습니다.');
      await camera.start(config);
    }else{
      video.loop=true;video.muted=true;video.src=file?(sourceURL=URL.createObjectURL(file)):new URL('../assets/demo/pose_1.mp4',import.meta.url).href;
      await video.play();sampleLastFrame=performance.now();$('source-state').textContent='SAMPLE VIDEO';$('signal-led').classList.add('live');
    }
    if(gen!==sourceGeneration)return;
    started=true;$('entry').hidden=true;sessionStart=clock;setQuality(config.quality==='auto'?'normal':config.quality);document.body.classList.toggle('exhibit',config.hideUI);
    if(config.sound)await sound.start();
    try{await vision.start(config);restarts=0;reportedWatchdog=false;}catch(e){notice('AI를 시작하지 못했습니다. '+e.message+' 운영 설정에서 시스템 진단·다시 연결을 사용하세요.');}
    refreshDevices();
  }catch(e){if(gen!==sourceGeneration)return;camera.stop();notice(e.message);metrics.errors.push({time:clock,message:e.message});$('entry').hidden=false;mode='off';started=false;}
  finally{if(gen===sourceGeneration)busy(false);}
}
function scriptedObservation(age,actual){
  const t=age%43,present=t>=1&&t<33,away=(t>12&&t<15)||(t>21&&t<24);
  return {...actual,valid:true,present,facing:away?'away':'front',turnEvidence:away,synthetic:true};
}
function qaView(scene,actual){
  if(scene==='auto')return actual;
  const base={...actual,state:'FIRST_PRESENCE',safe:true,side:1,age:8,alpha:1,stage:0,reveal:false};
  if(scene==='mirror')return {...base,state:'MIRROR',alpha:0};
  if(scene==='middle')return {...base,stage:1};
  if(scene==='close')return {...base,state:'CLOSE_PRESENCE',stage:2,reveal:true};
  if(scene==='reset')return {...base,state:'RESET',stage:2,alpha:.45};
  if(scene==='failure')return {...base,state:'FIRST_PRESENCE',stage:2,safe:false};
  return base;
}
function summarize(samples){if(!samples.length)return null;const a=[...samples].sort((a,b)=>a-b);return {count:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,p95:a[Math.floor((a.length-1)*.95)],p99:a[Math.floor((a.length-1)*.99)],max:a.at(-1),over50:a.filter(x=>x>50).length};}
function report(){return {work:'THE ONE ONLY ON SCREEN',version:'1.0.0',time:new Date().toISOString(),mode,scripted:mode==='demo'&&scripted,qaScene,privacy:'수치만 포함. 카메라 이미지 없음.',browser:navigator.userAgent,secureContext:isSecureContext,camera:{state:cameraState,width:video.videoWidth,height:video.videoHeight,frames:camera.frames||0},ai:{state:visionState,delegate:vision.delegate,frames:metrics.resultCount,inferenceMs:summarize(metrics.inferences),mask:compositor.maskFraction},render:{quality:qualityName,rafFrameMs:summarize(metrics.frames),dimensions:[$('exhibition').width,$('exhibition').height],note:'rAF 간격이며 카메라/AI FPS와 별도.'},interaction:{state:lastView.state,stage:lastView.stage,transitions:metrics.transitions.slice(-100)},errors:metrics.errors,limits:['얼굴/몸 방향 추정이며 실제 시선 추적 아님','단일 RGB 카메라의 가상 깊이; 실제 3D 재구성 아님','다른 PC·어두운 현장·다인 실관객 시험은 별도 필요']};}
async function diagnose(){
  const lines=[];lines.push(`Chrome: ${/Chrome|Chromium|CriOS/.test(navigator.userAgent)?'감지':'Chrome 권장'}`);lines.push(`HTTPS/localhost: ${isSecureContext?'정상':'오류 — HTTPS URL 또는 동봉 실행기 사용'}`);
  let permission='확인 불가';try{permission=(await navigator.permissions.query({name:'camera'})).state;}catch{}
  lines.push(`카메라 권한: ${permission}`,`입력: ${mode} / ${cameraState} / ${video.videoWidth}×${video.videoHeight}`);
  for(const path of ['vendor/vision_bundle.js','vendor/wasm/vision_wasm_internal.wasm','models/pose_landmarker_lite.task','models/face_landmarker.task','assets/ghosts/manifest.json']){try{const r=await fetch(new URL(/^(models|vendor)\//.test(path)?'../../../shared/mediapipe/'+path:'../'+path,import.meta.url),{method:'HEAD'});lines.push(`${r.ok?'정상':'누락 HTTP '+r.status}: ${path}`);}catch{lines.push(`경로/네트워크 오류: ${path}`);}}
  const glCanvas=document.createElement('canvas'),gl=glCanvas.getContext('webgl2')||glCanvas.getContext('webgl');lines.push(`WebGL: ${gl?'지원 (AI '+(vision.delegate||config.delegate)+')':'불가 — 기본 CPU 분석 사용'}`);gl?.getExtension('WEBGL_lose_context')?.loseContext();
  lines.push(`AI: ${visionState} / 분리 비율 ${(compositor.maskFraction*100).toFixed(1)}%`, `분석 p95: ${summarize(metrics.inferences)?.p95?.toFixed(1)||'—'}ms`, `프레임 p99: ${summarize(metrics.frames)?.p99?.toFixed(1)||'—'}ms`);
  if(performance.memory)lines.push(`JS 힙: ${(performance.memory.usedJSHeapSize/1048576).toFixed(1)}MB (영상/GPU 메모리 제외)`);
  if(observer.brightness<45)lines.push('저조도 경고: 작은 보조 조명·노출 설정 필요. 분석 밝기 보정만으로 암흑 해결 불가.');
  if(!observer.primary&&started)lines.push('관객 미검출: 얼굴·어깨가 프레임 안에 보이는지 확인, 저사양/민감도 조절.');
  lines.push('원본 영상/얼굴은 서버 전송·영구 저장하지 않음.','D 설정 닫기 · F 전체화면 · R 초기화 · H 전시 화면');$('diagnostics').textContent=lines.join('\n');
}
function updateUI(now){
  if(now-lastUi<.45)return;lastUi=now;
  const m=summarize(metrics.frames.slice(-120)),fps=m?1000/m.mean:0;
  $('runtime-status').textContent=started?`${mode==='camera'?'실제 카메라':'시연 영상'} · ${visionState==='ready'?'AI 연결':'AI '+visionState} · ${fps.toFixed(0)} FPS`:'카메라 연결 후 시작';
  const text=`${labels[lastView.state]} / ${stageNames[lastView.stage]}\n${lastObservation.present?'관객 감지':'관객 없음'} · ${lastObservation.facing} · ${lastObservation.yaw===null?'—':(lastObservation.yaw??0).toFixed(1)+'°'}\n${observer.people||0}명 · 추론 ${vision.hz}Hz / ${vision.width}px\n마스크 ${Math.max(0,lastRender.maskAge||0).toFixed(2)}s · ${(lastRender.maskFraction*100||0).toFixed(1)}%\n${fps.toFixed(1)} rAF FPS · ${$('exhibition').width}×${$('exhibition').height}\n${mode==='demo'?(scripted?'모의 고개/퇴장 입력':'실제 AI / 샘플 영상'):'실제 카메라 / 방향 추정'}`;
  $('debug-overlay').textContent=text;$('debug-overlay').hidden=!(config.maskDebug||!$('operator').hidden);
  const data=$('exhibition').dataset;data.state=lastView.state;data.stage=String(lastView.stage);data.results=String(metrics.resultCount);data.mask=String(lastRender.maskFraction||0);data.errors=String(metrics.errors.length);
  if(mode==='demo')$('demo-label').textContent=qaScene!=='auto'?`합성 검수 · ${$('qa-scene').selectedOptions[0].text}`:scripted?'시연 영상 · 고개/퇴장 모의 입력':'시연 영상 · 실제 AI 분석';
}
function animate(now){
  requestAnimationFrame(animate);const elapsed=now-lastFrame;lastFrame=now;
  if(document.hidden)return;
  clock+=Math.min(elapsed,150)/1000;
  if(started){metrics.frames.push(elapsed);if(metrics.frames.length>18000)metrics.frames.shift();}
  let healthy=false;
  if(started){
    if(mode==='camera')healthy=camera.healthy(now);
    else {if(video.currentTime!==lastSampleVideoTime){lastSampleVideoTime=video.currentTime;sampleLastFrame=now;}healthy=video.readyState>=2&&!video.paused&&now-sampleLastFrame<1800;}
    if(healthy)vision.tick(video,now);
    lastObservation=observer.sample(clock);if(!healthy)lastObservation={...lastObservation,valid:false,present:false};
    if(mode==='demo'&&scripted&&healthy&&vision.ready)lastObservation=scriptedObservation(clock-sessionStart,lastObservation);
    lastView=experience.update(clock,lastObservation);
    if(!vision.ready)lastView={...lastView,state:'MIRROR',alpha:0,safe:false};
    if(mode==='demo'&&qaScene!=='auto')lastView=qaView(qaScene,lastView);
    if(lastView.state!==lastState){metrics.transitions.push({time:clock,state:lastView.state,stage:lastView.stage,mode,scripted,qaScene});lastState=lastView.state;if(lastState==='WAITING'){assets.reset();compositor.lastPlacement=null;}}
    if(vision.watchdog(now)&&!reportedWatchdog){reportedWatchdog=true;notice('AI 분석이 응답하지 않아 귀신 합성을 보류했습니다. 운영 설정에서 다시 연결하세요.');if(restarts<1){restarts++;vision.start(config).then(()=>{reportedWatchdog=false;}).catch(()=>{});}}
    if(config.quality==='auto'&&clock-lastAdapt>12){lastAdapt=clock;const cost=summarize(metrics.inferences.slice(-30))?.mean||0,frameCost=summarize(metrics.frames.slice(-180))?.p95||0;if(qualityName==='normal'&&(cost>145||frameCost>38))setQuality('low');}
  }else lastView={state:'WAITING',stage:0,alpha:0,safe:false,side:1};
  resizeOutput();
  try{lastRender=compositor.draw(video,lastView,lastObservation,clock,{sourceHealthy:healthy,showDebug:config.maskDebug,demo:mode==='demo'});}catch(e){if(!metrics.errors.some(x=>x.message===e.message)){metrics.errors.push({time:clock,message:e.message});notice('합성 오류: '+e.message);}}
  sound.set(config.sound&&started,config.volume,lastView.stage);updateUI(clock);
}

// Bind operator controls. No participant movement instructions are shown during the work.
$('operator').hidden=true;
$('start-camera').onclick=()=>startSource('camera');$('start-demo').onclick=()=>startSource('demo');$('demo-mode').onclick=()=>startSource('demo');$('reconnect').onclick=()=>startSource('camera');
$('operator-toggle').onclick=()=>panel();$('fullscreen').onclick=fullscreen;$('reset').onclick=reset;$('diagnose').onclick=diagnose;
$('hide-ui').onclick=()=>{document.body.classList.toggle('exhibit');panel(false);};
$('close-panel').onclick=()=>panel(false);$('stop').onclick=async()=>{sourceGeneration++;await stopSource();mode='off';visionState='off';reset();busy(false);notice('');$('entry').hidden=false;$('source-state').textContent='INPUT OFF';$('report-view').hidden=true;};
$('camera-select').onchange=e=>{config.cameraId=e.target.value;persist();};
for(const el of document.querySelectorAll('[data-config]'))el.addEventListener('change',()=>{
  const key=el.dataset.config,value=el.type==='checkbox'?el.checked:el.type==='number'||el.type==='range'||key==='cameraWidth'?Number(el.value):el.value;
  Object.assign(config,sanitize({...config,[key]:value}));persist();syncControls();if(['quality','aspect','monochrome'].includes(key))setQuality(config.quality==='auto'?'normal':config.quality);if(key==='hideUI')document.body.classList.toggle('exhibit',config.hideUI);
  if(key==='sensitivity'||key==='delegate')notice('AI 민감도/처리 변경은 “카메라 다시 연결 / 설정 적용” 후 반영됩니다.');
});
for(const id of ['sensitivity','turnAngle','firstDelay','approachSpeed','probability','maskThreshold']){const el=document.querySelector(`[data-config="${id}"]`);if(el)continue;}
// Controls use explicit data keys even when their IDs differ from configuration names.
for(const [id,key] of Object.entries({'sound':'sound','mask-debug':'maskDebug'}))$(id).onchange=async e=>{config[key]=e.target.checked;if(key==='sound'&&config.sound)await sound.start();persist();};
$('scripted-demo').onchange=e=>{scripted=mode==='demo'&&e.target.checked;reset();};
$('qa-scene').onchange=async e=>{
  if(mode!=='demo')return;const before=qaScene;qaScene=e.target.value;compositor.lastPlacement=null;
  const kind=qaScene==='dark'?'dark':qaScene==='multi'?'multi':'pose_1';
  const priorKind=before==='dark'?'dark':before==='multi'?'multi':'pose_1';
  if(kind!==priorKind){video.pause();observer.clear();compositor.clear();lastSampleVideoTime=-1;video.src=new URL(`../assets/demo/${kind}.mp4`,import.meta.url).href;try{await video.play();sampleLastFrame=performance.now();}catch(error){notice('검수 영상 로딩 실패: '+error.message);}}
};
$('test-video').onchange=e=>{const file=e.target.files?.[0];if(file)startSource('demo',file);e.target.value='';};
$('asset-file').onchange=async e=>{try{const f=e.target.files?.[0];if(f){await assets.replace($('asset-key').value,f);$('asset-status').textContent='로컬 메모리 에셋 교체 완료. 새로고침하면 기본 에셋으로 복귀.';compositor.lastPlacement=null;}}catch(error){$('asset-status').textContent=error.message;}finally{e.target.value='';}};
$('apply-asset').onclick=async()=>{try{await assets.replace($('asset-key').value,$('asset-path').value.trim());$('asset-status').textContent='상대경로 에셋 적용 완료.';compositor.lastPlacement=null;}catch(e){$('asset-status').textContent=e.message;}};
$('download-report').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='only-screen-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('show-report').onclick=()=>{$('report-view').hidden=false;$('report-view').textContent=JSON.stringify(report(),null,2);};
$('reset-metrics').onclick=()=>{metrics.frames=[];metrics.inferences=[];metrics.resultCount=0;metrics.errors=[];metrics.transitions=[];lastAdapt=clock;notice('성능 측정을 다시 시작했습니다. 수치 보기를 누르면 최신 결과를 확인할 수 있습니다.');};
window.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName))return;if(e.key.toLowerCase()==='d')panel();if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='h'){document.body.classList.toggle('exhibit');panel(false);}});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden){assets.pauseAll();sound.set(false,0,0);}else {observer.clear();compositor.clear();}});
window.addEventListener('pagehide',()=>{camera.stop();vision.stop();assets.dispose();sound.stop();if(sourceURL)URL.revokeObjectURL(sourceURL);});
navigator.mediaDevices?.addEventListener('devicechange',()=>refreshDevices());
window.addEventListener('unhandledrejection',e=>{metrics.errors.push({time:clock,message:String(e.reason?.message||e.reason)});notice('처리를 완료하지 못했습니다. 운영 설정의 시스템 진단을 확인하세요.');});
syncControls();setQuality(qualityName);refreshDevices();
const assetReady=assets.load().then(m=>{$('asset-status').textContent=m.credit;$('start-camera').textContent='카메라 연결';$('start-camera').disabled=false;$('start-demo').disabled=false;return m;}).catch(e=>{notice(e.message);$('start-camera').textContent='에셋 준비 실패';throw e;});
requestAnimationFrame(animate);
