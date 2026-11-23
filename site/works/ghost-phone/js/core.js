export const EVENTS = new Set(['visitor_enter','visitor_leave','handset_lifted','handset_replaced']);
export const defaults = Object.freeze({mode:'browser',ghost:'random',ringVolume:0.25,handsetVolume:0.45,noise:0.018,delayMs:900,cooldownMs:5000,ringTimeoutMs:30000,callTimeoutMs:75000,cache:true,endpoint:'',effect:true,effectPreset:'old',fallbackMP3:true,allowBrowserFallback:false,output:'',ringOutput:'',repeatOnLift:true,directed:true,ambientVolume:.045,lineNoise:.35,lineGap:1.15,expandedScenes:true});
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
export function normalizeSettings(s={}) {
  return {...defaults,...Object.fromEntries(Object.keys(defaults).filter(k=>k in s).map(k=>[k,s[k]])),mode:['mp3','ai','hybrid','random','browser'].includes(s.mode)?s.mode:defaults.mode,
    ringVolume:clamp(s.ringVolume??defaults.ringVolume,0,0.5),handsetVolume:clamp(s.handsetVolume??defaults.handsetVolume,0,0.65),noise:clamp(s.noise??defaults.noise,0,0.04),
    delayMs:clamp(s.delayMs??defaults.delayMs,0,6000),cooldownMs:clamp(s.cooldownMs??defaults.cooldownMs,1000,60000),
    ringTimeoutMs:clamp(s.ringTimeoutMs??defaults.ringTimeoutMs,5000,90000),callTimeoutMs:clamp(s.callTimeoutMs??defaults.callTimeoutMs,5000,180000),repeatOnLift:typeof s.repeatOnLift==='boolean'?s.repeatOnLift:true,directed:s.directed!==false,expandedScenes:s.expandedScenes!==false,ambientVolume:clamp(s.ambientVolume??.045,0,.15),lineNoise:clamp(s.lineNoise??.35,0,1),lineGap:clamp(s.lineGap??1.15,.6,4)};
}
export function validateGhosts(config) {
  if(!config||!Array.isArray(config.ghosts)||!config.ghosts.length||config.ghosts.length>30)throw Error('귀신 설정은 1~30개가 필요합니다.');
  const ids=new Set();
  for(const g of config.ghosts){
    if(!/^[a-z0-9_-]{1,40}$/.test(g.id)||ids.has(g.id))throw Error('귀신 ID가 중복되거나 올바르지 않습니다.');ids.add(g.id);
    if(typeof g.name!=='string'||!g.name.trim()||g.name.length>50)throw Error('이름을 확인하세요.');
    if(!Array.isArray(g.lines)||!g.lines.length||g.lines.length>30)throw Error('귀신마다 대사가 필요합니다.');
    const lineIds=new Set();for(const l of g.lines){if(!/^[a-z0-9_-]{1,40}$/.test(l.id)||lineIds.has(l.id)||typeof l.text!=='string'||!l.text.trim()||l.text.length>500)throw Error('대사 ID/내용(1~500자)을 확인하세요.');lineIds.add(l.id);}
    if(!Array.isArray(g.mp3)||g.mp3.length>30||g.mp3.some(a=>typeof a!=='string'||!/^assets\/audio\/[a-zA-Z0-9_./-]+\.(mp3|wav|ogg|webm)$/.test(a)||a.includes('..')))throw Error('음원은 assets/audio/ 아래 상대경로를 사용하세요.');
    if(typeof g.style!=='string'||g.style.length>1200)throw Error('스타일 지시는 1200자 이내입니다.');
    g.rate=clamp(g.rate??0.9,0.6,1.2);g.volume=clamp(g.volume??0.5,0,0.65);
  }return config;
}
export class NoRepeat {
  constructor(random=Math.random){this.last=new Map();this.random=random;}
  pick(items,key){if(!items.length)return null;const options=items.length>1?items.filter(x=>(x.id??x)!==this.last.get(key)):items;const item=options[Math.floor(this.random()*options.length)%options.length];this.last.set(key,item.id??item);return item;}
}
// Hardware and simulator both dispatch these four events. Time is supplied for deterministic tests.
export class Telephone {
  constructor({settings=defaults,onChange=()=>{},now=()=>performance.now()}={}){this.settings=settings;this.onChange=onChange;this.now=now;this.state='IDLE';this.present=false;this.offHook=false;this.armed=true;this.since=now();this.reason='대기';this.session=0;this.pendingLift=false;this.pendingEntry=false;}
  snapshot(){return {state:this.state,present:this.present,offHook:this.offHook,armed:this.armed,since:this.since,session:this.session,reason:this.reason};}
  transition(state,reason){if(state===this.state)return;this.state=state;this.since=this.now();this.reason=reason;this.session++;this.onChange(this.snapshot());}
  dispatch(event){
    if(!EVENTS.has(event))return false;
    const t=this.now();
    if(event==='visitor_enter'){if(this.present)return true;this.present=true;if(this.state==='COOLDOWN')this.pendingEntry=true;if(this.state==='IDLE'&&this.armed&&!this.offHook){this.armed=false;this.transition('RINGING','관객 접근');}}
    if(event==='visitor_leave'){this.present=false;this.pendingEntry=this.pendingLift=false;if(this.state==='RINGING')this.transition('COOLDOWN','관객 퇴장');}
    if(event==='handset_lifted'){if(this.offHook)return true;this.offHook=true;if(this.state==='RINGING')this.transition('CONNECTED','수화기 들기');else if(this.settings.repeatOnLift&&this.present){if(this.state==='IDLE')this.transition('CONNECTED','수화기 다시 들기');else if(this.state==='COOLDOWN')this.pendingLift=true;}}
    if(event==='handset_replaced'){this.offHook=false;this.pendingLift=false;if(this.state==='CONNECTED')this.transition('COOLDOWN','수화기 내려놓음');}
    this.tick(t);return true;
  }
  tick(t=this.now()){
    if(this.state==='RINGING'&&t-this.since>=this.settings.ringTimeoutMs)this.transition('COOLDOWN','응답 시간 초과');
    else if(this.state==='CONNECTED'&&t-this.since>=this.settings.callTimeoutMs)this.transition('COOLDOWN','최대 통화 시간');
    else if(this.state==='COOLDOWN'&&t-this.since>=this.settings.cooldownMs){
      if(this.pendingLift&&this.present&&this.offHook&&this.settings.repeatOnLift){this.pendingLift=this.pendingEntry=false;this.transition('CONNECTED','수화기 다시 들기 · 준비 완료');}
      else if(!this.offHook){const ring=this.pendingEntry&&this.present;this.pendingEntry=false;this.armed=!this.present;this.transition(ring?'RINGING':'IDLE',ring?'준비 중 도착한 다음 관객':this.present?'수화기를 다시 들면 새 통화':'다음 관객 대기');}
    }
    if(this.state==='IDLE'&&!this.present&&!this.offHook)this.armed=true;
  }
  // An authored scene can end remotely. This is not a new hardware/sensor event.
  endCall(reason='상대방 통화 종료'){if(this.state!=='CONNECTED')return false;this.transition('COOLDOWN',reason);return true;}
  reset(reason='운영자 초기화'){this.pendingLift=this.pendingEntry=false;this.present=false;this.offHook=false;this.armed=true;this.state='IDLE';this.since=this.now();this.reason=reason;this.session++;this.onChange(this.snapshot());}
}
export function parseSensorLine(line){
  if(line.length>256)throw Error('센서 메시지가 너무 깁니다.');const packet=JSON.parse(line);
  if(packet.type==='heartbeat')return {type:'heartbeat'};
  if(packet.type==='snapshot'&&typeof packet.present==='boolean'&&typeof packet.offHook==='boolean')return packet;
  if(!EVENTS.has(packet.event))throw Error('허용되지 않은 센서 이벤트');return {event:packet.event};
}
