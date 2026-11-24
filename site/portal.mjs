// Only the selected work is loaded. Replacing its browsing context releases camera/audio.
const $=id=>document.getElementById(id);let entries=[],frame=null,roomId=null;
function teardown(){if(frame){frame.src='about:blank';frame.remove();frame=null;}roomId=null;$('room').hidden=true;document.body.classList.remove('room-active');}
function directWorkUrl(entry){if(!entry.cameraSetup&&!entry.standalone)return null;const url=new URL(entry.entry,document.baseURI);if(entry.cameraSetup)url.searchParams.set('camera','1');return url.href;}
function openRoom(id){const entry=entries.find(e=>e.id===id);if(!entry){teardown();return;}const direct=directWorkUrl(entry);if(direct){teardown();location.replace(direct);return;}if(roomId===id&&frame)return;teardown();roomId=id;$('room-title').textContent=entry.title;$('room-note').textContent=id==='ghost-phone'?'브라우저 음량과 수화기 출력을 확인한 뒤 통화를 시작하세요.':'작품 안에서 카메라 시작을 누르고 권한을 허용하세요.';
 frame=document.createElement('iframe');frame.title=entry.title;frame.allow='camera; microphone; fullscreen; autoplay';frame.allowFullscreen=true;frame.src=new URL(entry.entry,document.baseURI).href;$('frame-host').append(frame);$('room').hidden=false;document.body.classList.add('room-active');$('leave-room').focus();}
function route(){openRoom(decodeURIComponent(location.hash.slice(1)));}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;}
function draw(){
 const nodes=entries.map(e=>{
  const item=element('article','work');
  item.append(element('p','input',e.input),element('h3','',e.title),element('p','tagline',e.tagline),element('p','description',e.description));
  const actions=element('div','actions');
  const label=e.cameraSetup?'웹캠 전시 시작':'전시실 들어가기';
  const link=element('a','enter',label);
  link.href=directWorkUrl(e)??'#'+encodeURIComponent(e.id);
  link.setAttribute('aria-label',e.title+' '+label);
  actions.append(link);
  if(e.extra){
   const label=e.extraLabel??(e.id==='wedding'?'귀신 동작만 보기':e.id==='ghost-phone'?'전체 음원 듣기':'옛 뉴스 소스 보기');
   const extra=element('a','extra',label);
   extra.href=new URL(e.extra,document.baseURI).href;
   actions.append(extra);
  }
  if(e.legacy){
   const legacy=element('a','extra','이전 전시 열기');
   legacy.href=new URL(e.legacy,document.baseURI).href;
   actions.append(legacy);
  }
  item.append(actions);
  return item;
 });
 $('works').replaceChildren(...nodes);
}
$('leave-room').addEventListener('click',()=>{location.hash='';});$('room-fullscreen').addEventListener('click',async()=>{try{await frame?.requestFullscreen();}catch{$('room-note').textContent='전체화면을 열 수 없습니다. Chrome에서 F11을 사용하세요.';}});addEventListener('hashchange',route);addEventListener('pagehide',teardown);
try{const r=await fetch(new URL('./catalog.json',import.meta.url),{cache:'no-cache'});if(!r.ok)throw Error('전시 목록 HTTP '+r.status);entries=await r.json();draw();route();}catch(e){$('works').replaceChildren();$('portal-error').hidden=false;$('portal-error').textContent='전시 목록을 불러오지 못했습니다. 주소와 파일을 확인한 뒤 새로고침하세요. '+e.message;}
