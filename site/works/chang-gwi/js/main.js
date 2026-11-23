import {DEFAULTS,PRESETS,validateSettings,CloneStore} from './core.js';
import {CameraInput} from './input.js';
import {Tracker} from './tracking.js';
import {Renderer} from './effects.js';
import {Sound} from './sound.js';
import {ScreenAwake} from './awake.js';
import {QualityController,inheritManual} from './quality.js';
import {Diagnostics} from './diagnostics.js';
import {APP_VERSION,cameraHelp,permissionState,requestedBackend} from './environment.js';
import {liveStatus} from './live-status.js';
const $=id=>document.getElementById(id),key='chang-gwi-settings-v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
// V2.1 migration: the full camera is the default, including old browser profiles.
if(saved.cameraEdition!=='full-hanji-v1'){saved.raw=true;saved.cameraEdition='full-hanji-v1';}
let settings=validateSettings(saved);
const requestedEffect=new URLSearchParams(location.search).get('effect');
if(['ink','hanji'].includes(requestedEffect))settings.effect=requestedEffect;
const awake=new ScreenAwake();
const store=new CloneStore(),tracker=new Tracker(store),renderer=new Renderer($('stage')),sound=new Sound();
const camera=new CameraInput($('camera'),setStatus),qualityControl=new QualityController();
const input=document.createElement('canvas'),inputCtx=input.getContext('2d',{willReadFrequently:true});
const colorInput=document.createElement('canvas'),colorCtx=colorInput.getContext('2d');
const luminance=document.createElement('canvas');luminance.width=16;luminance.height=9;
const luminanceCtx=luminance.getContext('2d',{willReadFrequently:true});
let profile=qualityControl.profile(settings),effective=qualityControl.effective(settings);
let lastInferenceSource='none',runtimePlainCPU=false;
let active=false,mode='idle',busy=false,stopped=false,cameraPending=false,wantsCamera=false,reconnectBlocked=false;
let message='운영자 초기 설정 대기',videoURL=null,analysisEpoch=0,connectionEpoch=0,runtimeBackend=null;
let lastInfer=0,inferStarted=0,inferMs=0,workerMs=0,lastSourceTime=-1,lastFrame=performance.now(),lastStatus=0,lastQuality=0;
let fps=60,renderCost=0,results=0,detected=0,lastResultAt=0,brightness=null,nextRetry=0,retries=0,errorCount=0,lastError=null;
let inferTicket=0,aiRecoveryToken=0,aiRecovering=false,aiRecoveryAttempts=0,nextAIRecovery=0,aiStableSince=0;
const events=[],frames=[];const allFrames={count:0,sum:0,max:0,over50:0,histogram:new Uint32Array(2001)};
const event=(name,detail={})=>{events.push({name,at:performance.now(),...detail});if(events.length>100)events.shift();};
function setStatus(text){message=text;$('setupStatus').textContent=text;}
function persist(){try{localStorage.setItem(key,JSON.stringify({...settings,cameraEdition:'full-hanji-v1'}));}catch{setStatus('설정을 저장할 수 없습니다. 현재 탭에서는 조절값이 유지됩니다.');}}
function modelOptions(){const backend=requestedBackend(settings.effect,settings.backend,runtimeBackend),low=backend==='cpu'&&settings.performance==='auto';return {backend,inputSize:low?320:profile.inputSize,model:profile.model,quality:low?'high':profile.quality,plainCPU:runtimePlainCPU};}
function clearRecognition(){inferTicket++;if(busy)camera.stopWorker();busy=false;detected=0;lastResultAt=0;lastInferenceSource='none';lastSourceTime=-1;aiStableSince=0;}
function applyQuality(){
 const next=qualityControl.profile(settings),modelChanged=profile.model!==next.model,shapeChanged=profile.inputSize!==next.inputSize||profile.quality!==next.quality;
 profile=next;effective=qualityControl.effective(settings);
 if(shapeChanged){analysisEpoch++;tracker.clear();}
 if(Math.abs(renderer.renderScale-profile.renderScale)>.01){renderer.renderScale=profile.renderScale;renderer.resize();}
 if(modelChanged&&camera.net&&camera.backend==='webgl'&&camera.info.modelType!==profile.model)restartAI();
}
applyQuality();
function uiFlags(){
 $('startEffect').value=settings.effect;
 $('demoBadge').hidden=mode!=='video';$('fps').hidden=!settings.fps;$('cameraPreview').hidden=!settings.preview;
 $('startCamera').disabled=cameraPending;for(const id of ['startDemo','startSample','setupCheck'])$(id).disabled=false;$('cancelStart').hidden=!cameraPending;
}
const controls=[
 ['effect','잔상 표현','select',{hanji:'한지 흩어짐 (기존)',ink:'먹 용해 · 참고 영상형'}],
 ['performance','컴퓨터 성능','select',{auto:'자동 최적화',low:'저사양 컴퓨터',normal:'일반 컴퓨터',high:'고성능 전시 컴퓨터',custom:'수동 조절'}],
 ['backend','AI 처리 장치','select',{auto:'자동 · 효과에 맞춰 GPU/CPU',webgl:'GPU 우선',cpu:'CPU 대체 경로'}],
 ['inputSize','수동 AI 입력 긴 변','range',256,640,16],
 ['aiModel','수동 AI 모델','select',{resnet:'고정밀 ResNet50',mobile:'경량 MobileNet'}],
 ['aiQuality','수동 AI 내부 해상도','select',{low:'낮음',medium:'중간',high:'높음'}],
 ['inferFps','수동 최대 분석 횟수/초','range',1,15,1],
 ['renderScale','수동 렌더 해상도 비율','range',.4,1,.05],
 ['particleBudget','수동 분신당 한지 조각 상한','range',100,1600,25],
 ['lifeScale','수동 새 분신 수명 비율','range',.5,1,.05],
 ['preset','효과 프리셋','select',{beautiful:'아름다운 잔상',dark:'어두운 원혼',horror:'공포 연출 강화'}],
 ['camera','카메라 선택','select',{'':'기본 카메라'}],
 ['cameraResolution','카메라 요청 해상도','select',{auto:'자동 (권장)',vga:'640×480 요청',hd:'1280×720 요청',fullhd:'1920×1080 요청'}],
 ['mirror','좌우 반전','checkbox'],['preview','운영자 카메라 미리보기','checkbox'],
 ['people','최대 추적 인원','range',1,3,1],['sensitivity','실루엣 임계값','range',.2,.95,.01],
 ['frequency','분신 생성 빈도','range',.2,3,.1],['maxClones','최대 분신 수','range',4,40,1],
 ['lifetime','기본 수명 (초)','range',3,18,.5],['opacity','분신 불투명도','range',.1,.95,.01],
 ['fragment','파편 크기','range',3,18,1],['decay','파편화 속도','range',.4,2,.1],
 ['ink','먹물 확산','range',0,12,.5],['trace','잔류 흔적','range',0,.7,.01],
 ['cloneColor','분신 색상','color'],['background','배경색','color'],['haunt','장기 잔류 확률','range',0,.3,.01],
 ['sound','사운드','checkbox'],['raw','전체 카메라 화면','checkbox'],['foreground','움직이는 관객을 항상 앞에','checkbox'],['stayAwake','화면 켜짐 유지','checkbox'],['gpuParticles','잔상 GPU 합성','checkbox'],['demo','실제 인물 영상 점검','checkbox'],['fps','FPS 표시','checkbox'],
];
const manualKeys=new Set(['inputSize','aiModel','aiQuality','inferFps','renderScale','particleBudget','lifeScale']);
function makeControls(){
 const root=$('controls');root.replaceChildren();
 for(const [name,title,type,...args] of controls){
  const label=document.createElement('label');label.className='control';const text=document.createElement('span');text.textContent=title;
  const value=document.createElement('output');if(type==='range'){value.textContent=settings[name];text.append(value);}
  const el=document.createElement(type==='select'?'select':'input');el.id='control-'+name;
  if(type==='select'){for(const [v,t] of Object.entries(args[0]))el.add(new Option(t,v));el.value=settings[name];}
  else{el.type=type;if(type==='range')[el.min,el.max,el.step]=args;if(type==='checkbox')el.checked=settings[name];else el.value=settings[name];}
  el.addEventListener('input',()=>{
   const previous=settings[name],changedValue=type==='checkbox'?el.checked:type==='range'?Number(el.value):el.value;
   if(manualKeys.has(name)&&settings.performance!=='custom')settings=inheritManual(settings,profile);
   settings[name]=changedValue;
   if(manualKeys.has(name)){settings.performance='custom';const p=$('control-performance');if(p)p.value='custom';}
   settings=validateSettings(settings);value.textContent=settings[name];
   if(manualKeys.has(name))for(const other of manualKeys){if(other===name)continue;const control=$('control-'+other);if(control){control.value=settings[other];const out=control.closest('label').querySelector('output');if(out)out.textContent=settings[other];}}
   if(name==='preset'){Object.assign(settings,PRESETS[settings.preset]);makeControls();refreshCameras();}
   if(name==='mirror'&&previous!==settings.mirror){analysisEpoch++;tracker.clear();}
   if(name==='sound')sound.enable(settings.sound).catch(e=>setStatus(e.message));
   if(name==='stayAwake')awake.enable(settings.stayAwake);
   if(name==='demo'){if(settings.demo){settings.demo=mode==='video';$('testVideo').click();}else startCamera();}
   if((name==='camera'||name==='cameraResolution')&&mode==='camera')startCamera();
   if(name==='backend'){runtimeBackend=null;runtimePlainCPU=false;restartAI();}
   applyQuality();persist();uiFlags();
  });label.append(text,el);root.append(label);
 }
}
async function refreshCameras(){
 try{const list=await navigator.mediaDevices?.enumerateDevices();if(!list)return;
  for(const select of [$('control-camera'),$('startDevice')]){if(!select)continue;select.replaceChildren(new Option('이 PC의 기본 카메라',''));
   list.filter(d=>d.kind==='videoinput').forEach((d,i)=>select.add(new Option(d.label||`카메라 ${i+1} · 권한 허용 후 이름 표시`,d.deviceId)));
   select.value=settings.camera;if(select.selectedIndex<0)select.value='';}
 }catch{}
}
function cpuQuality(){if(camera.backend!=='webgl'&&camera.backend!=='none'&&settings.backend==='auto')runtimeBackend='cpu';if((camera.backend==='cpu'||camera.backend==='wasm')&&settings.performance==='auto'){qualityControl.observe({now:performance.now(),inferMs:1,fps:60,renderMs:0,backend:'cpu'},true);applyQuality();}}
async function restartAI(override=null){
 if(override)runtimeBackend=override;const operation=++aiRecoveryToken,sourceEpoch=connectionEpoch;aiRecovering=true;analysisEpoch++;clearRecognition();camera.stopWorker();tracker.clear();
 setStatus(override==='cpu'?'인물 분리를 CPU 가속 경로에서 다시 준비합니다.':'AI 처리 장치를 다시 준비합니다.');
 try{await camera.load(modelOptions());if(operation!==aiRecoveryToken||sourceEpoch!==connectionEpoch)return false;cpuQuality();errorCount=0;lastError=null;active=mode==='video'?$('camera').readyState>=2:(wantsCamera&&camera.healthy());if(active){reconnectBlocked=false;$('setup').hidden=true;}setStatus('인물 분리 준비 완료 · '+camera.backend.toUpperCase());return active;}
 catch(e){if(e.code!=='cancelled'&&operation===aiRecoveryToken){lastError={code:e.code||'ai-error',message:e.message};setStatus('모델 오류: '+e.message);}return false;}
 finally{if(operation===aiRecoveryToken){aiRecovering=false;nextAIRecovery=performance.now()+Math.min(60000,5000*2**aiRecoveryAttempts);}}
}
async function startCamera(manual=true){
 if(cameraPending)return;cameraPending=true;const token=++connectionEpoch;wantsCamera=true;reconnectBlocked=false;
 if(manual)retries=0;active=false;mode='camera';analysisEpoch++;clearRecognition();tracker.clear();aiRecoveryAttempts=0;lastError=null;
 if(videoURL){$('camera').removeAttribute('src');URL.revokeObjectURL(videoURL);videoURL=null;}
 $('camera').loop=false;settings.demo=false;uiFlags();setStatus('카메라와 로컬 모델 준비 중…');
 try{
  const ok=await camera.start(settings.camera,{...modelOptions(),cameraResolution:settings.cameraResolution});
  if(!ok||token!==connectionEpoch||mode!=='camera')return;
  active=true;$('setup').hidden=true;settings.camera=camera.selectedId;cpuQuality();errorCount=0;lastError=null;retries=0;
  try{localStorage.setItem(key+'-authorized','yes');}catch{}
  setStatus('실시간 카메라 · '+camera.backend.toUpperCase()+' 인물 감지 중');event('camera-ready',{backend:camera.backend});
  if(settings.sound)sound.enable(true).catch(()=>setStatus('카메라는 연결되어 있습니다. 사운드는 운영자 패널에서 다시 켜세요.'));
 }catch(e){
  if(token!==connectionEpoch||e.code==='cancelled')return;
  if(!e.aiFailure)camera.stop();lastError=cameraHelp(e);reconnectBlocked=['permission','permission-pending','security','ai-error','ai-timeout','worker-error'].includes(lastError.code);
  setStatus(lastError.message);event('camera-error',{code:lastError.code,message:lastError.message});retries++;if(lastError.code==='permission')$('cameraHelp').open=true;
  if(e.aiFailure&&camera.healthy())setStatus('카메라 영상은 계속 표시됩니다. AI 복구 필요: '+e.message);
  else if(!active)$('setup').hidden=false;
 }finally{
  if(token===connectionEpoch){cameraPending=false;nextRetry=performance.now()+Math.min(30000,5000*2**Math.min(3,retries));persist();makeControls();refreshCameras();uiFlags();}
 }
}
camera.onFramesReady=()=>{if(mode==='camera'&&wantsCamera){$('setup').hidden=true;setStatus('실제 카메라 수신 중 · 인물 분리 모델 준비 중');awake.enable(settings.stayAwake);}};
function cancelStart(){connectionEpoch++;analysisEpoch++;cameraPending=false;wantsCamera=false;active=false;clearRecognition();camera.stop();camera.stopWorker();tracker.clear();$('setup').hidden=false;setStatus('연결을 취소했습니다. 다시 연결하거나 시스템 진단을 실행하세요.');uiFlags();}
async function startVideo(file){
 if(!file)return;connectionEpoch++;cameraPending=false;wantsCamera=false;camera.stop();analysisEpoch++;clearRecognition();tracker.clear();active=false;mode='video';settings.demo=true;aiRecoveryAttempts=0;lastError=null;awake.enable(settings.stayAwake);
 if(videoURL)URL.revokeObjectURL(videoURL);
 setStatus('선택한 실제 영상과 인물 분리 모델 준비 중…');
 try{videoURL=typeof file==='string'?file:URL.createObjectURL(file);$('camera').src=videoURL;$('camera').loop=true;await $('camera').play();await camera.load(modelOptions());
  if(mode!=='video')return;cpuQuality();active=true;$('setup').hidden=true;setStatus('실제 인물 영상 점검 · AI 추출 · 웹캠 라이브 아님');event('video-ready',{backend:camera.backend});
 }catch(e){settings.demo=false;lastError={code:e.code||'video-error',message:e.message};nextAIRecovery=performance.now()+5000;setStatus('영상 점검 실패: '+e.message+' · H.264 MP4/WebM과 모델 파일을 확인하세요.');$('setup').hidden=false;}
 persist();makeControls();refreshCameras();uiFlags();if(settings.sound)sound.enable(true).catch(()=>{});
}
function drawCamera(){
 const v=$('camera'),sw=v.videoWidth,sh=v.videoHeight;if(!sw||!sh)return false;
 const ratio=profile.inputSize/Math.max(sw,sh),w=Math.max(64,Math.round(sw*ratio)),h=Math.max(64,Math.round(sh*ratio));
 if(input.width!==w||input.height!==h){input.width=w;input.height=h;tracker.clear();tracker.width=w;tracker.height=h;}
 inputCtx.save();inputCtx.fillStyle='#000';inputCtx.fillRect(0,0,w,h);if(settings.mirror){inputCtx.translate(w,0);inputCtx.scale(-1,1);}inputCtx.drawImage(v,0,0,w,h);inputCtx.restore();
 if(effective.effect==='ink'){const r=Math.min(1,960/Math.max(sw,sh)),cw=Math.max(1,Math.round(sw*r)),ch=Math.max(1,Math.round(sh*r));if(colorInput.width!==cw||colorInput.height!==ch){colorInput.width=cw;colorInput.height=ch;}colorCtx.save();if(settings.mirror){colorCtx.translate(cw,0);colorCtx.scale(-1,1);}colorCtx.drawImage(v,0,0,cw,ch);colorCtx.restore();}
 return true;
}
async function infer(now){
 const interval=Math.max(1000/profile.inferFps,Math.min(4000,inferMs*1.05));
 if(busy||!active||document.hidden||now-lastInfer<interval||!camera.net||$('camera').readyState<2)return;
 if(mode==='camera'&&!camera.healthy(now))return;
 if($('camera').currentTime===lastSourceTime)return;
 busy=true;const ticket=++inferTicket;inferStarted=performance.now();lastInfer=now;lastSourceTime=$('camera').currentTime;
 const epoch=analysisEpoch,generation=camera.generation,modelGeneration=camera.modelGeneration,sourceMode=mode;
 let fallback=false;
 try{
  if(!drawCamera())return;const captureEffect=effective.effect,captureColor=captureEffect==='ink'?colorInput:null;const masks=await camera.segment(input,effective,profile.quality);
  if(epoch!==analysisEpoch||generation!==camera.generation||modelGeneration!==camera.modelGeneration||sourceMode!==mode)return;
  const finished=performance.now();detected=masks.length;tracker.update(masks,finished,{...effective,effect:captureEffect},captureColor);results++;lastInferenceSource=sourceMode;lastResultAt=finished;inferMs=performance.now()-inferStarted;workerMs=camera.info.inferMs;errorCount=0;lastError=null;if(!aiStableSince)aiStableSince=finished;else if(finished-aiStableSince>30000)aiRecoveryAttempts=0;
 }catch(e){
  if(e.code==='cancelled'||epoch!==analysisEpoch)return;
  errorCount++;aiStableSince=0;lastError={code:e.code||'ai-error',message:e.message};setStatus('인물 추출 오류: '+e.message);
  if(e.canFallback&&camera.backend!=='cpu'){if(e.suggestPlainCPU)runtimePlainCPU=true;fallback=true;}
  else if(errorCount>=2||e.code==='ai-timeout'){active=false;reconnectBlocked=true;camera.stopWorker();setStatus('AI 추출을 중지했습니다. 저사양/CPU 설정과 시스템 진단을 확인한 뒤 재연결하세요.');}
 }finally{if(ticket===inferTicket)busy=false;if(fallback)restartAI('cpu');}
}
function frameSummary(){
 const sorted=[...frames].sort((a,b)=>a-b);let count=0,p99=0;
 for(let i=0;i<allFrames.histogram.length;i++){count+=allFrames.histogram[i];if(count>=allFrames.count*.99){p99=i===2000?allFrames.max:(i+1)/2;break;}}
 return {samples:allFrames.count,visibleSeconds:allFrames.sum/1000,meanFPS:allFrames.sum?allFrames.count/allFrames.sum*1000:0,p99UpperMs:p99,maxMs:allFrames.max,over50:allFrames.over50,recentP99Ms:sorted[Math.floor((sorted.length-1)*.99)]||0,note:'표시 중 rAF 간격. 모니터 표시 FPS나 AI 분석 FPS와 다름.'};
}
function state(){return {version:APP_VERSION,foreground:{enabled:settings.foreground,...renderer.foreground.stats},ink:{gpuTextures:renderer.inkGPU.textures.size,available:renderer.inkGPU.available,reason:renderer.inkGPU.reason},effect:settings.effect,paper:{ready:renderer.paperReady,error:renderer.paperError,variants:8,budget:profile.particleBudget,draw:renderer.stats,gpuTextures:renderer.paperGPU.textures.size},live:liveStatus({mode,cameraLive:camera.healthy(),modelReady:!!camera.net,active,people:tracker.count,lastResultAt,now:performance.now(),inferMs,error:lastError,recovering:aiRecovering}),cameraInput:camera.inputInfo(),aiRecovering,aiRecoveryAttempts,continuity:'continuous',wakeLock:awake.state,fullCamera:settings.raw,lastInferenceSource,mode,active,busy,results,detected,people:tracker.count,tracking:tracker.mode,activity:tracker.activity,clones:store.items.length,limit:effective.maxClones,captured:store.serial,released:store.released,fps,inferMs,workerMs,quality:profile.quality,performance:profile.label,automatic:settings.performance==='auto',qualityReason:qualityControl.reason,renderScale:renderer.renderScale,backend:camera.backend,aiWarmMs:camera.info.warmMs??null,aiFallbackReason:camera.info.fallbackReason??null,tensors:camera.info.memory?.numTensors??null,tensorBytes:camera.info.memory?.numBytes??null,brightness,cameraLive:camera.healthy(),cameraFrames:camera.frames,cameraResolution:[$('camera').videoWidth,$('camera').videoHeight],lastResultAge:lastResultAt?performance.now()-lastResultAt:null,input:{width:input.width,height:input.height,model:camera.info.model||'준비 전',source:mode,refinedEdges:true,lastSourceTime:$('camera').currentTime},settings:{...settings,camera:undefined},render:frameSummary(),error:lastError};}
const diagnostics=new Diagnostics({camera,getState:state,modelOptions,output:$('diagnosticList')});
function updatePreview(){
 const v=$('camera');if(v.readyState<2||!v.videoWidth)return;
 try{luminanceCtx.drawImage(v,0,0,16,9);const p=luminanceCtx.getImageData(0,0,16,9).data;let total=0;for(let i=0;i<p.length;i+=4)total+=(p[i]+p[i+1]+p[i+2])/3;brightness=total/(16*9);
  if(settings.preview&&!$('panel').hidden){const c=$('cameraPreview'),ctx=c.getContext('2d');ctx.save();if(settings.mirror){ctx.translate(c.width,0);ctx.scale(-1,1);}ctx.drawImage(v,0,0,c.width,c.height);ctx.restore();}
 }catch{brightness=null;}
}
function frame(now){
 if(stopped)return;
 const dt=now-lastFrame;lastFrame=now;
 if(!document.hidden&&dt>0){frames.push(dt);if(frames.length>600)frames.shift();allFrames.count++;allFrames.sum+=dt;allFrames.max=Math.max(allFrames.max,dt);if(dt>50)allFrames.over50++;allFrames.histogram[Math.min(2000,Math.floor(dt*2))]++;if(dt<1000)fps=fps*.96+(1000/Math.max(1,dt))*.04;}
 const begin=performance.now();store.update(now,effective.maxClones);
 if(active){tracker.expire(now);infer(now);}
 const video=$('camera'),sourceReady=video.readyState>=2&&video.videoWidth>0&&(mode==='video'||camera.healthy(now));
 const fullCamera=settings.raw&&sourceReady;document.body.classList.toggle('camera-live',fullCamera);
 renderer.draw(store,tracker,now,effective,fullCamera?video:null);sound.update(tracker.activity,tracker.count);renderCost=renderCost*.95+(performance.now()-begin)*.05;
 if(now-lastQuality>5000&&results>0){lastQuality=now;if(qualityControl.observe({now,inferMs,fps,renderMs:renderCost,backend:camera.backend},settings.performance==='auto')){applyQuality();event('quality',{level:profile.label,reason:qualityControl.reason});}}
 if(now-lastStatus>650){
  lastStatus=now;updatePreview();
  const readiness=liveStatus({mode,cameraLive:camera.healthy(now),modelReady:!!camera.net,active,people:tracker.count,lastResultAt,now,inferMs,error:lastError,recovering:aiRecovering});$('liveChecks').dataset.stage=readiness.stage;$('liveChecks').textContent=[readiness.camera,readiness.ai,readiness.audience].join(' · ');
  if((mode==='video'||wantsCamera&&camera.healthy(now))&&!active&&!cameraPending&&!aiRecovering&&lastError&&now>nextAIRecovery&&aiRecoveryAttempts<3){aiRecoveryAttempts++;event('ai-auto-recovery',{attempt:aiRecoveryAttempts});restartAI('cpu');}
  const notice=$('connectionNotice');notice.hidden=!(wantsCamera&&mode==='camera'&&(!camera.healthy(now)||lastError||cameraPending));notice.textContent=cameraPending?'카메라/AI 준비 중 · D 운영자 패널':camera.healthy(now)?'카메라 영상 표시 중 · 잔상 분석 복구 필요 · D 운영자 패널':'카메라 입력 확인 필요 · 재연결/권한 설정은 D 운영자 패널';$('fps').textContent=`${fps.toFixed(0)} FPS · ${inferMs.toFixed(0)} ms`;
  if(!$('diagnostics').hidden)$('technicalStats').textContent=JSON.stringify(state(),null,2);
  $('status').textContent=`${message}\n${mode==='video'?'실제 영상 점검 · 웹캠 아님':mode==='camera'?(camera.healthy(now)?'실제 카메라 프레임 수신':'카메라 입력 확인 필요'):'입력 대기'}\n${tracker.mode} · 최근 AI 마스크 ${detected} / 최대 ${settings.people}인\n분신 ${store.items.length}/${effective.maxClones} · ${profile.label} · ${camera.backend}\n${fps.toFixed(0)} 화면FPS · 분석 ${inferMs.toFixed(0)}ms · ${profile.inputSize}px/${profile.quality}\n렌더 ${Math.round(renderer.renderScale*100)}% · 텐서 ${camera.info.memory?.numTensors??'대기'}${brightness!==null&&brightness<8?'\n입력 화면이 매우 어두움 · 렌즈/차단 키/조명 확인':''}${busy&&now-inferStarted>15000?'\n추론 응답 지연 · 시스템 진단/CPU 설정 확인':''}`;
  if(wantsCamera&&mode==='camera'&&!document.hidden&&!camera.healthy(now)&&!cameraPending&&!reconnectBlocked&&now>nextRetry)startCamera(false);
 }
 requestAnimationFrame(frame);
}
function panel(force){$('panel').hidden=force===undefined?!$('panel').hidden:!force;if(!$('panel').hidden)refreshCameras();}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){setStatus('전체화면 실패: '+e.message+' · Chrome F11도 사용할 수 있습니다.');}}
async function runDiagnostics(){panel(true);$('diagnostics').hidden=false;$('systemCheck').disabled=true;try{await diagnostics.run();cpuQuality();}finally{$('systemCheck').disabled=false;}}
function exportDiagnostics(){const data=diagnostics.export();data.events=events;const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='chang-gwi-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function resetMetrics(){frames.length=0;allFrames.count=allFrames.sum=allFrames.max=allFrames.over50=0;allFrames.histogram.fill(0);lastFrame=performance.now();event('metrics-reset');}
$('startCamera').onclick=()=>startCamera();$('cancelStart').onclick=cancelStart;$('startDemo').onclick=()=>$('testVideo').click();
$('startDevice').onchange=e=>{settings.camera=e.target.value;persist();makeControls();refreshCameras();};$('startFullscreen').onclick=fullscreen;$('startOperator').onclick=()=>panel(true);
$('startSample').onclick=()=>startVideo(new URL('../assets/demo/pose_1.mp4',import.meta.url).href);
$('startEffect').onchange=e=>{settings.effect=e.target.value;settings=validateSettings(settings);applyQuality();persist();makeControls();refreshCameras();uiFlags();setStatus('잔상 표현 변경 · 기존 분신은 원래 재질로 자연 소멸합니다.');};
$('testVideo').onchange=e=>startVideo(e.target.files[0]);$('testVideo').addEventListener('cancel',()=>{settings.demo=mode==='video';makeControls();refreshCameras();});
$('closePanel').onclick=()=>panel();$('fullscreen').onclick=fullscreen;$('retry').onclick=()=>startCamera();
$('refreshCameras').onclick=refreshCameras;$('systemCheck').onclick=runDiagnostics;$('setupCheck').onclick=runDiagnostics;$('exportDiagnostics').onclick=exportDiagnostics;
$('resetMetrics').onclick=resetMetrics;
$('retryAI').onclick=()=>{if(mode==='idle'||mode==='camera'&&!camera.healthy()){setStatus('실제 카메라를 먼저 연결하세요.');return;}aiRecoveryAttempts=0;restartAI('cpu');};
$('stopCamera').onclick=()=>{connectionEpoch++;analysisEpoch++;cameraPending=false;wantsCamera=false;active=false;mode='idle';clearRecognition();camera.stop();camera.stopWorker();tracker.clear();$('setup').hidden=false;uiFlags();setStatus('카메라를 껐습니다. 남은 분신은 각자의 수명으로 소멸합니다.');};
$('reset').onclick=()=>{settings={...DEFAULTS,demo:mode==='video'};runtimeBackend=null;sound.enable(false);analysisEpoch++;tracker.clear();applyQuality();persist();makeControls();refreshCameras();uiFlags();setStatus('기본 설정 복원 · 기존 분신은 자연 소멸합니다.');};
document.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea'))return;if(e.key.toLowerCase()==='d')panel();if(e.key.toLowerCase()==='f')fullscreen();});
window.addEventListener('resize',()=>renderer.resize());navigator.mediaDevices?.addEventListener('devicechange',()=>{refreshCameras();nextRetry=performance.now()+1500;});
document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden)sound.enable(false);else {nextRetry=lastFrame+5000;if(settings.sound)sound.enable(true).catch(()=>{});if(wantsCamera||mode==='video')awake.enable(settings.stayAwake);}});
window.addEventListener('pagehide',()=>{stopped=true;connectionEpoch++;tracker.clear();store.clear();camera.dispose();awake.enable(false);if(videoURL)URL.revokeObjectURL(videoURL);sound.dispose();renderer.dispose();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
window.changGwi=Object.freeze({stats:state});
makeControls();refreshCameras();uiFlags();requestAnimationFrame(frame);document.dispatchEvent(new Event('chang-gwi-ready'));
try{if(localStorage.getItem(key+'-authorized')==='yes')permissionState().then(p=>{if(p==='granted')startCamera(false);});}catch{}
