import {ExhibitionProgram} from './exhibition.js?v=scene-polish';
import {migrateVoices} from './voices.js?v=4.2.0';
import {AdminLock} from './admin.js?v=4.2.0';
import {VoiceBank} from './bank.js?v=4.2.0';
import {Telephone,NoRepeat,normalizeSettings,validateGhosts} from './core.js?v=scene-polish';
import {SoundDesk,VoiceService,wait} from './audio.js?v=scene-polish';
import {PROGRESSIVE_HAUNT,progressiveCalls} from './progressive.js?v=scene-polish';
import {SerialInput} from './serial.js?v=4.2.0';
const $=id=>document.getElementById(id),version='5.0.0';
const params=new URLSearchParams(location.search);
const classicEdition=params.get('edition')==='classic'||Boolean(params.get('actor'));
const progressiveFields=['progressiveEnabled','progressiveMax','progressiveStart','progressiveSpeed','progressiveNoise','progressiveVolume','progressiveCall'];
document.body.dataset.edition=classicEdition?'classic':'progressive';
let settings=normalizeSettings(),config,ready=false,controller=null,testController=null,ringTestTimer=null,logs=[],lastVoice='없음',serialReady=false,firstSnapshot=true,wakeLock=null,externalDirty=false;
const choice=new NoRepeat(),desk=new SoundDesk(),adminLock=new AdminLock(),voiceBank=new VoiceBank();
function log(message){const text=String(message).slice(0,350);logs.push({at:new Date().toLocaleTimeString('ko-KR'),text});if(logs.length>70)logs.shift();$('log').replaceChildren(...logs.slice().reverse().map(x=>{const li=document.createElement('li');li.textContent=x.at+' · '+x.text;return li;}));$('logCount').textContent=logs.length;}
function notice(s){if(s.error){$('voiceError').textContent=s.error;log('음성 대체/오류: '+s.error);}if(s.text){$('voiceState').textContent=s.text;lastVoice=s.text;}if(s.mode)$('voiceState').dataset.mode=s.mode;}
const voices=new VoiceService({desk,status:notice}); voices.bank=voiceBank;
let preview=false,lastPhoneState='IDLE',starting=false,playingProgressive=false;
const program=new ExhibitionProgram({desk,status:s=>{if(s.phase)document.body.dataset.phase=s.phase;if(s.episode)document.body.dataset.episode=s.episode;if(s.episodeKind)document.body.dataset.episodeKind=s.episodeKind;if(s.episodeTitle)document.body.dataset.episodeTitle=s.episodeTitle;if(s.scene)document.body.dataset.scene=s.scene;if(s.actor)document.body.dataset.actor=s.actor;if(s.playbackStarted){document.body.dataset.audio='playing';log('실제 음원 재생 · '+s.actor+' · '+s.scene);}if(s.lineEvent)document.body.dataset.line=s.lineEvent;if(s.text)notice({text:s.text});if(s.warning)log(s.warning);}});
const phone=new Telephone({settings,onChange:changed});
function stopEverything(){controller?.abort();controller=null;testController?.abort();testController=null;clearTimeout(ringTestTimer);desk.stop();program.stop();}
function refresh(){const s=phone.snapshot();$('state').textContent=s.state;$('stateDetail').textContent=s.reason;$('presence').textContent=s.present?'관객 있음':'관객 없음';$('hook').textContent=s.offHook?'수화기 들림':'수화기 내려놓음';$('armed').textContent=s.armed?'재호출 준비':s.present&&!s.offHook?'수화기 다시 들기 가능':'수화기 내려놓기 대기';document.body.dataset.state=s.state;
  document.querySelectorAll('[data-event]').forEach(b=>b.disabled=!ready||!!serial.port);
  $('previewAnswer').disabled=!preview||!['RINGING','IDLE','COOLDOWN'].includes(s.state)||s.offHook;$('previewHangup').disabled=!preview||!s.offHook;
  $('ringTest').disabled=!ready||s.state!=='IDLE';$('mp3Test').disabled=$('aiTest').disabled=!ready||s.state!=='IDLE';
}
function chosen(){const enabled=config.ghosts.filter(g=>g.enabled);if(!enabled.length)throw Error('사용 중인 귀신이 없습니다. 목소리 설정에서 활성화하세요.');const selected=enabled.find(g=>g.id===settings.ghost);return selected||choice.pick(enabled,'ghost');}
function reloadSharedSettings(){try{const saved=localStorage.getItem('ghost-phone:config:v1');if(saved){config=migrateVoices(JSON.parse(saved));fillGhostMenus();}settings=normalizeSettings(JSON.parse(localStorage.getItem('ghost-phone:settings:v1')||'{}'));phone.settings=settings;syncUI();externalDirty=false;}catch(e){log('다른 창 설정 동기화 실패');}}
function selectedProgressive(){
  if(classicEdition)return null;
  const requested=preview?$('previewEpisode').value:settings.progressiveEnabled&&settings.mode==='mp3'?settings.progressiveCall:null;
  return progressiveCalls.find(call=>call.id===requested)||(!preview&&requested?progressiveCalls[0]:null);
}
function changed(snapshot){const previous=lastPhoneState,wasProgressive=playingProgressive;playingProgressive=false;lastPhoneState=snapshot.state;stopEverything();document.body.dataset.phase='idle';document.body.dataset.line='idle';document.body.dataset.audio='idle';if(previous==='CONNECTED'&&snapshot.state!=='CONNECTED')program.close();if(snapshot.state==='RINGING')program.ring();if(snapshot.state==='IDLE'&&externalDirty)reloadSharedSettings();refresh();log(snapshot.state+' · '+snapshot.reason);$('voiceError').textContent='';
  if(snapshot.state==='RINGING'){try{desk.startRing(settings.ringVolume);notice({text:'전화벨 재생 중 · 수화기 대기'});}catch(e){notice({error:e.message,text:'벨 재생 실패'});}}
  else if(snapshot.state==='CONNECTED'){
    const current=new AbortController();controller=current;const progressive=selectedProgressive();
    if(progressive){
      playingProgressive=true;
      const callSettings=settings;
      notice({text:'대표 통화 연결 중',mode:PROGRESSIVE_HAUNT});
      (async()=>{try{
        await wait(callSettings.delayMs,current.signal);desk.cue(false,callSettings.progressiveVolume);
        await program.runProgressive({call:progressive,settings:callSettings,signal:current.signal,end:()=>phone.endCall('상대방이 전화를 끊었습니다')});
      }catch(error){if(!current.signal.aborted){
        phone.endCall('대표 통화 실패 · 재시도 대기');
        notice({text:'대표 통화를 재생할 수 없습니다.',error:error.message});
      }}})();
      return;
    }
    let ghost;try{ghost=chosen();}catch(e){phone.endCall('음성 설정 오류 · 재시도 대기');notice({error:e.message});return;}
    notice({text:ghost.name+' 연결 · '+settings.delayMs+'ms 후 음성 시작'});
    (async()=>{try{await wait(settings.delayMs,current.signal);desk.cue(false,settings.handsetVolume);if((preview||settings.directed&&settings.mode==='mp3')&&program.catalog?.actors.some(a=>a.id===ghost.id)){
      const episodeChoice=preview?$('previewEpisode').value:settings.expandedScenes===false?'classic':'auto';
      const forced=program.getEpisode(episodeChoice)?.actorId;
      const allowed=forced?[forced]:preview&&$('previewGhost').value!=='random'?[$('previewGhost').value]:settings.ghost==='random'?config.ghosts.filter(g=>g.enabled&&program.catalog.actors.some(a=>a.id===g.id)).map(g=>g.id):[ghost.id];
      await program.run({settings,allowed,episodeChoice,signal:current.signal,end:()=>phone.endCall('상대방이 통화를 마쳤습니다')});
    }else await voices.run(ghost,settings,{signal:current.signal,revision:config.revision});if(!current.signal.aborted){notice({text:'음성 종료 · 수화기를 내려놓고 다시 들면 새 통화'});log(ghost.name+' 음성 종료');}}
    catch(e){if(e.name!=='AbortError'&&!current.signal.aborted){phone.endCall('음성 실패 · 재시도 대기');notice({text:'음성 오류 · 수화기를 내려놓고 다시 들어 재시도하세요.',error:e.message});}}})();
  }else if(snapshot.state==='COOLDOWN'){
    if(!wasProgressive||snapshot.reason!=='수화기 내려놓음')desk.cue(true,wasProgressive?settings.progressiveVolume:settings.handsetVolume);
    notice({text:'통화 중단 · 다음 호출 준비 중'});
  }
  else notice({text:ready?'오디오 준비 · 다음 관객 대기':'오디오 활성화 전'});
}
function dispatch(event,source='가상 센서'){
  if(!ready){notice({error:'먼저 오디오 활성화하고 시작을 누르세요.'});return;}
  if(source==='가상 센서'&&serial.port){notice({error:'USB 연결 중에는 가상 센서 입력을 차단합니다.'});return;}
  if(event==='handset_replaced'&&phone.state==='IDLE'){testController?.abort();desk.activeStop?.();clearTimeout(ringTestTimer);desk.stopRing();}
  phone.dispatch(event);log(source+' · '+event);refresh();
}
const serial=new SerialInput({event:e=>{if(serialReady)dispatch(e,'ESP32');else log('USB 최초 snapshot 대기 · 이전 이벤트 무시');},status:s=>{$('sensor').textContent=s;},lost:unexpected=>{serialReady=false;firstSnapshot=true;phone.reset(unexpected?'센서 단절 · 음성 중단':'USB 해제 · 가상 센서 대기');if(unexpected)phone.armed=false;refresh();},snapshot:p=>{
  if(firstSnapshot){firstSnapshot=false;serialReady=true;phone.reset('USB 최초 상태 동기화 · 퇴장 후 재접근 대기');phone.present=p.present;phone.offHook=p.offHook;phone.armed=!p.present&&!p.offHook;refresh();return;}
  if(p.present!==phone.present)dispatch(p.present?'visitor_enter':'visitor_leave','ESP32');if(p.offHook!==phone.offHook)dispatch(p.offHook?'handset_lifted':'handset_replaced','ESP32');
}});
function persist(){try{localStorage.setItem('ghost-phone:settings:v1',JSON.stringify(settings));localStorage.setItem('ghost-phone:config:v1',JSON.stringify(config));}catch(e){log('설정 저장 불가 · 현재 탭만 사용');}}
function fillGhostMenus(){const old=$('editGhost').value;$('ghost').replaceChildren(new Option('회차마다 다른 귀신','random'),...config.ghosts.filter(g=>g.enabled).map(g=>new Option(g.name,g.id)));$('ghost').value=settings.ghost;if(!$('ghost').value){settings.ghost='random';$('ghost').value='random';}$('editGhost').replaceChildren(...config.ghosts.map(g=>new Option(g.name,g.id)));$('editGhost').value=config.ghosts.some(g=>g.id===old)?old:config.ghosts[0].id;editGhost();}
function editGhost(){const g=config.ghosts.find(g=>g.id===$('editGhost').value);if(!g)return;$('ghostName').value=g.name;$('ghostMode').value=g.mode;$('enabled').checked=g.enabled;$('provider').value=g.provider;$('model').value=g.model;$('voiceId').value=g.voiceId;$('style').value=g.style;$('rate').value=g.rate;$('ghostVolume').value=g.volume;$('telephone').checked=g.telephone;$('lines').value=g.lines.map(l=>l.text).join('\n');$('mp3Paths').value=g.mp3.join('\n');$('fileNote').textContent='이 탭에 가져온 파일: '+((voices.files.get(g.id)||[]).map(f=>f.name).join(', ')||'없음')+' · 파일은 탭을 닫으면 해제됩니다.';}
function syncUI(){for(const k of ['mode','ghost','ringVolume','handsetVolume','noise','delayMs','cooldownMs','ringTimeoutMs','callTimeoutMs','endpoint','output','ringOutput','ambientVolume','lineNoise','lineGap',...progressiveFields.slice(1)])if($(k))$(k).value=settings[k];for(const k of ['cache','effect','directed','expandedScenes','progressiveEnabled'])$(k).checked=settings[k];for(const k of ['ringVolume','handsetVolume','noise'])$(k+'Value').textContent=settings[k].toFixed(3);}
async function panel(open){if(open&&!await adminLock.ensure())return;$('panel').hidden=!open;if(open)refresh();}
async function start(){if(starting)return false;starting=true;try{$('start').disabled=$('previewStart').disabled=true;await desk.unlock();await outputs();for(const [kind,id] of [['voice',settings.output],['ring',settings.ringOutput]])try{await desk.setOutput(kind,id);}catch(e){log(e.message);}
    await program.prepare();ready=true;$('setup').hidden=true;phone.reset('운영 시작 · 가상 센서로 시험 가능');$('setupError').textContent='';try{if(!wakeLock||wakeLock.released)wakeLock=await navigator.wakeLock?.request('screen');}catch{}log('오디오 활성화 · 실제 전화기/ESP32 없음');
  }catch(e){ready=false;$('setupError').textContent=e.message;log(e.message);}finally{starting=false;$('start').disabled=$('previewStart').disabled=false;}return ready;}
async function previewCall(){if(serial.port){notice({error:'USB 실제 센서 연결 중에는 시연을 시작할 수 없습니다.'});return;}const started=await start();if(!started)return;preview=true;document.body.dataset.preview='true';$('previewControls').hidden=false;program.nextVisitor();phone.reset('장비 없는 시연 · 새 가상 관객');dispatch('visitor_enter');}
async function testVoice(mode){if(!ready||phone.state!=='IDLE')return;stopEverything();const c=new AbortController();testController=c;try{const ghost=chosen();$('voiceError').textContent='';log(mode+' 음성 시험 · '+ghost.name);await voices.run(ghost,{...settings,mode},{signal:c.signal,revision:config.revision});if(!c.signal.aborted)notice({text:'음성 시험 종료'});}catch(e){if(!c.signal.aborted)notice({text:'음성 시험 실패',error:e.message});}}
async function outputs(){if(!navigator.mediaDevices?.enumerateDevices)return;const items=await navigator.mediaDevices.enumerateDevices();for(const id of ['output','ringOutput']){const old=settings[id];$(id).replaceChildren(new Option('Windows 기본 출력',''),...items.filter(d=>d.kind==='audiooutput'&&d.deviceId!=='default').map((d,i)=>new Option(d.label||'오디오 출력 '+(i+1),d.deviceId)));$(id).value=old;if(!$(id).value&&old){settings[id]='';log('이 PC에 저장된 출력 장치 없음 · 기본 출력 사용');}}}
async function backendCheck(){
  try{if(!settings.endpoint)throw Error('AI 서버 주소를 먼저 설정하세요.');const u=new URL(settings.endpoint);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('HTTPS 서버 주소가 필요합니다.');const c=new AbortController(),timer=setTimeout(()=>c.abort(),7000);
    try{const res=await fetch(new URL('catalog',u.href.endsWith('/')?u:new URL(u.href+'/')),{headers:{Authorization:'Bearer '+voices.token},signal:c.signal});const data=await res.json();if(!res.ok)throw Error(data.error||('서버 '+res.status));$('backendState').textContent='서버 응답 확인 · '+data.revision+' · '+data.presets.filter(p=>p.ready).length+'개 음성 설정 준비 · 실제 생성/재생은 아직 미검증';log('AI catalog 응답 · 생성 미실행');}finally{clearTimeout(timer);}
  }catch(e){$('backendState').textContent='AI 연결 실패 · '+e.message;log('AI 점검 실패: '+e.message);}
}
function browserVoices(){const list=window.speechSynthesis?.getVoices().filter(v=>v.lang.toLowerCase().startsWith('ko'))||[];const prev=$('browserVoice').value;$('browserVoice').replaceChildren(new Option('한국어 자동 선택',''),...list.map(v=>new Option(v.name+' · '+(v.localService?'기기 내 음성':'네트워크 음성일 수 있음'),v.voiceURI)));$('browserVoice').value=prev;$('browserVoiceNote').textContent=list.length?list.length+'개 한국어 목소리 · PC마다 음색/인터넷 요구가 다릅니다.':'한국어 목소리를 찾지 못했습니다. MP3를 등록하거나 Windows 한국어 음성 팩을 설치하세요.';}
function diagnostics(){const data={version,location:location.protocol==='file:'?'file:// 미지원 · localhost/Pages 사용':location.protocol+' · '+location.host,audio:desk.voice?.state||'잠김',ringAudio:desk.ring?.state||'잠김',ringActive:!!desk.ringTimer,audioActive:!!desk.activeStop,mode:settings.mode,sensor:serial.port?(serialReady?'USB 상태 수신됨':'USB 최초 상태 대기'):'가상 센서 · 하드웨어 미검증',webSerial:'serial'in navigator,outputSelection:!!desk.voice?.setSinkId,browserKoreanVoices:window.speechSynthesis?.getVoices().filter(v=>v.lang.startsWith('ko')).length||0,mp3:config.ghosts.map(g=>({id:g.id,project:g.mp3.length,session:(voices.files.get(g.id)||[]).length})),aiEndpoint:settings.endpoint?'설정됨 · 별도 연결 시험 필요':'미설정',providerKeys:'클라이언트에 없음',cacheBytes:voices.cache.bytes,phone:phone.snapshot(),lastVoice,exhibition:{phase:program.phase,preparedVoices:program.bytes.size,extraScenes:program.signals.episodes.length,sceneCacheBytes:program.signals.bytes,sceneCacheFiles:program.signals.cache.size,scene:program.director.current?.scene,preview},hardware:'실제 전화기·ESP32·거리센서·수화기 스피커 미검증'};$('diagnostics').textContent=JSON.stringify(data,null,2);return data;}
async function init(){
  try{await program.init();const r=await fetch(new URL('../config/ghosts.json?v=4.2.0',import.meta.url));if(!r.ok)throw Error('귀신 설정 파일 '+r.status);config=migrateVoices(await r.json());const shipped=structuredClone(config);try{const saved=localStorage.getItem('ghost-phone:config:v1');if(saved)config=migrateVoices(JSON.parse(saved));settings=normalizeSettings(JSON.parse(localStorage.getItem('ghost-phone:settings:v1')||'{}'));}catch(e){log('저장 설정 무시: '+e.message);}for(const actor of program.catalog.actors){
      let g=config.ghosts.find(x=>x.id===actor.id);
      if(!g){g={...structuredClone(shipped.ghosts[0]),id:actor.id,name:actor.name,lines:[{id:'recorded_first',text:actor.spokenText}],candidates:undefined,preferred:undefined,enabled:true};config.ghosts.push(g);}
      if(!g.mp3.length){g.mp3=[actor.voice];g.rate=1;}if(g.mp3.includes(actor.voice)&&g.mode==='browser')g.mode='mp3';
    }
    try{if(localStorage.getItem('ghost-phone:exhibition-edition')!=='3'){
      if(settings.mode==='browser')settings.mode='mp3';settings.directed=true;localStorage.setItem('ghost-phone:exhibition-edition','3');persist();
    }}catch{settings.mode='mp3';}
    $('previewGhost').replaceChildren(new Option('회차마다 다른 귀신','random'),...program.catalog.actors.map(a=>new Option(a.name,a.id)));
    $('previewEpisode').replaceChildren(new Option('자동 선택 · 기존26+신규4 · 희귀 히든2','auto'),new Option('기존 여섯 귀신 전체 대사','classic'),...program.signals.episodes.map(e=>new Option(e.title+' · '+(e.kind==='voice'?'짧은 음성':'잡음만'),e.id)),...program.night.episodes.map(e=>new Option(e.title+' · '+(e.hidden?'히든 대사':e.kind==='laughter'?'웃음':'새 대사'),e.id)));
    const requested=params.get('episode');
    $('progressiveCall').replaceChildren(...progressiveCalls.map(call=>new Option(call.title,call.id)));
    if(!progressiveCalls.some(call=>call.id===settings.progressiveCall))settings.progressiveCall=progressiveCalls[0].id;
    if(!classicEdition)$('previewEpisode').prepend(...progressiveCalls.map(call=>new Option(call.title+' · 점진적 변조',call.id)));
    if(program.getEpisode(requested)){$('previewEpisode').value=requested;$('previewGhost').value=program.getEpisode(requested).actorId;}
    else if(!classicEdition)$('previewEpisode').value=progressiveCalls.some(call=>call.id===requested)?requested:settings.progressiveEnabled?settings.progressiveCall:'auto';
    const requestedActor=params.get('actor');if(classicEdition&&program.catalog.actors.some(actor=>actor.id===requestedActor)){
      $('previewEpisode').value='classic';$('previewGhost').value=requestedActor;
    }
    const previewActor=()=>{const id=$('previewEpisode').value;return (program.getEpisode(id)||progressiveCalls.find(call=>call.id===id))?.actorId;};
    $('previewEpisode').onchange=()=>{const actor=previewActor();if(actor)$('previewGhost').value=actor;};
    $('previewGhost').onchange=()=>{const actor=previewActor();if(actor&&$('previewGhost').value!==actor)$('previewEpisode').value='auto';};
    $('previewEpisode').onchange();
    phone.settings=settings;fillGhostMenus();syncUI();browserVoices();}
  catch(e){$('setupError').textContent='초기화 실패: '+e.message+' · file:// 대신 localhost 또는 GitHub Pages로 실행하세요.';$('start').disabled=true;return;}
  $('start').onclick=start;$('previewStart').onclick=previewCall;$('previewAnswer').onclick=()=>dispatch('handset_lifted');$('previewHangup').onclick=()=>dispatch('handset_replaced');$('previewNext').onclick=previewCall;$('previewExit').onclick=()=>{preview=false;document.body.dataset.preview='false';$('previewControls').hidden=true;dispatch('handset_replaced');dispatch('visitor_leave');};$('openSetup').onclick=()=>panel(true);$('operatorHandle').onclick=()=>panel(true);$('closePanel').onclick=()=>panel(false);
  if(classicEdition){$('progressiveControls').hidden=true;$('editionLink').href='./';$('editionLink').textContent='새 전시판';$('operatorVersion').textContent='이전판';}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('selected',x===b));document.querySelectorAll('[data-pane]').forEach(x=>x.hidden=x.dataset.pane!==b.dataset.tab);});
  document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>dispatch(b.dataset.event));
  for(const k of ['mode','ghost','ringVolume','handsetVolume','noise','delayMs','cooldownMs','ringTimeoutMs','callTimeoutMs','endpoint','cache','effect','directed','ambientVolume','lineNoise','lineGap','expandedScenes',...progressiveFields])$(k).addEventListener('change',()=>{const v=$(k).type==='checkbox'?$(k).checked:$(k).value;settings=normalizeSettings({...settings,[k]:v});phone.settings=settings;persist();syncUI();log('설정 변경 · '+k+' · 다음 재생에 적용');});
  $('ghost').onchange=()=>{const g=config.ghosts.find(g=>g.id===settings.ghost);if(g){settings.mode=g.mode;syncUI();persist();}};
  $('editGhost').onchange=editGhost;
  $('saveGhost').onclick=()=>{try{const clone=structuredClone(config),g=clone.ghosts.find(g=>g.id===$('editGhost').value),texts=$('lines').value.split('\n').map(t=>t.trim()).filter(Boolean);Object.assign(g,{name:$('ghostName').value,mode:$('ghostMode').value,enabled:$('enabled').checked,provider:$('provider').value,model:$('model').value.trim(),voiceId:$('voiceId').value.trim(),style:$('style').value,rate:Number($('rate').value),volume:Number($('ghostVolume').value),telephone:$('telephone').checked,mp3:$('mp3Paths').value.split('\n').map(t=>t.trim()).filter(Boolean),lines:texts.map((text,i)=>({id:g.lines[i]?.id||('line'+(i+1)),text}))});clone.revision='operator-'+Date.now();config=validateGhosts(clone);voices.cache.clear();persist();fillGhostMenus();log('귀신 설정 저장 · AI는 백엔드 허용 목록 재배포 필요');}catch(e){notice({error:e.message});}};
  $('newGhost').onclick=()=>{if(config.ghosts.length>=30)return notice({error:'귀신은 최대30개입니다.'});const id='ghost_'+Date.now();config.ghosts.push({...structuredClone(config.ghosts[0]),id,name:'새 귀신',voiceId:'',mp3:[],enabled:false,lines:[{id:'line1',text:'여보세요. 아직 듣고 계신가요.'}]});config.revision='operator-'+Date.now();persist();fillGhostMenus();$('editGhost').value=id;editGhost();};
  $('mp3Files').onchange=()=>{const files=[...$('mp3Files').files];if(files.some(f=>f.size>20*1024*1024)||files.length>20)return notice({error:'한 파일20MB·한 귀신20개 이내로 등록하세요.'});voices.register($('editGhost').value,files);editGhost();log('이 탭에 음원 '+files.length+'개 등록');};
  $('exportConfig').onclick=()=>{const blob=new Blob([JSON.stringify(config,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ghosts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
  $('importConfig').onchange=async()=>{try{const f=$('importConfig').files[0];if(!f)return;if(f.size>100000)throw Error('설정 파일100KB 초과');config=migrateVoices(JSON.parse(await f.text()));voices.clear();persist();fillGhostMenus();log('설정 가져오기 완료 · 서버 허용 목록도 동기화하세요.');}catch(e){notice({error:e.message});}};
  $('browserVoice').onchange=()=>voices.voiceURI=$('browserVoice').value;window.speechSynthesis?.addEventListener('voiceschanged',browserVoices);
  $('ringTest').onclick=()=>{if(!ready||phone.state!=='IDLE')return;stopEverything();desk.startRing(settings.ringVolume);ringTestTimer=setTimeout(()=>desk.stopRing(),4500);notice({text:'벨 시험 · 약4.5초 후 정지'});};$('mp3Test').onclick=()=>testVoice('mp3');$('aiTest').onclick=()=>testVoice('ai');$('stopTest').onclick=()=>{stopEverything();if(phone.state==='CONNECTED'||phone.state==='RINGING')phone.transition('COOLDOWN','운영자 중단');notice({text:'재생·요청 중단'});refresh();};$('reset').onclick=()=>{program.reset();const {present,offHook}=phone;phone.reset();if(serial.port){phone.present=present;phone.offHook=offHook;phone.armed=!present&&!offHook;refresh();}};
  $('connectSerial').onclick=async()=>{try{if(!ready)throw Error('먼저 오디오를 활성화하세요.');preview=false;document.body.dataset.preview='false';$('previewControls').hidden=true;program.reset();phone.reset('실제 센서 연결 준비');firstSnapshot=true;await serial.connect();refresh();}catch(e){notice({error:'USB 연결: '+e.message});}};$('disconnectSerial').onclick=()=>serial.disconnect();
  $('token').oninput=()=>voices.token=$('token').value;$('checkBackend').onclick=backendCheck;$('clearCache').onclick=()=>{voices.cache.clear();log('음원 캐시 해제');};$('refreshOutputs').onclick=()=>outputs().catch(e=>notice({error:e.message}));
  for(const k of ['output','ringOutput'])$(k).onchange=async()=>{try{await desk.setOutput(k==='output'?'voice':'ring',$(k).value);settings[k]=$(k).value;persist();log('오디오 출력 변경');}catch(e){notice({error:e.message});$(k).value=settings[k];}};
  $('diagnose').onclick=diagnostics;$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(e=>notice({error:e.message}));
  window.addEventListener('keydown',e=>{if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;if(e.key.toLowerCase()==='d')panel($('panel').hidden);if(e.key.toLowerCase()==='f')$('fullscreen').click();if(e.key.toLowerCase()==='r')$('reset').click();if(e.key==='Escape')$('stopTest').click();});
  window.addEventListener('pagehide',()=>{stopEverything();program.dispose();voices.clear();serial.disconnect();wakeLock?.release().catch(()=>{});});
  window.addEventListener('storage',e=>{if(!['ghost-phone:config:v1','ghost-phone:settings:v1'].includes(e.key))return;if(phone.state!=='IDLE'){externalDirty=true;return;}reloadSharedSettings();});
  navigator.mediaDevices?.addEventListener('devicechange',async()=>{try{await outputs();await desk.setOutput('voice',settings.output);await desk.setOutput('ring',settings.ringOutput);log('출력 장치 변경 반영');}catch(e){notice({error:e.message});}});
  setInterval(()=>{if(!$('panel').hidden&&Date.now()>adminLock.until)$('panel').hidden=true;},15000);
  setInterval(()=>phone.tick(),100);refresh();for(const id of ['start','previewStart','openSetup'])$(id).disabled=false;log('기본 데이터 준비 · 공급자 API 호출 없음');
}
init();
