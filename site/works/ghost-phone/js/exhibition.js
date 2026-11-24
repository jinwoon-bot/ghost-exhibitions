import {SignalLibrary,SignalDeck} from './signals.js?v=4.2.0';
import {NightLibrary,HiddenSelector} from './night-pack.js?v=4.2.0';
import {EncounterDirector} from './encounter.js?v=4.2.0';
import {AmbientBus} from './ambience.js?v=4.2.0';
import {runCallScene,callProfiles} from './call-scene.js?v=4.2.0';
import {playFault} from './line-fault.js?v=4.2.0';
import {abortError,wait} from './audio.js?v=scene-polish';
import {PROGRESSIVE_HAUNT} from './progressive.js?v=scene-polish';
const root=new URL('../',import.meta.url);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
// Fixed local performances. No API, microphone or audience recording.
export class ExhibitionProgram {
 constructor({desk,status=()=>{},fetcher=fetch,now,random}={}){Object.assign(this,{desk,status});this.fetcher=(...args)=>fetcher(...args);this.director=new EncounterDirector({now,random});this.catalog=null;this.bytes=new Map();this.ambient=null;this.loading=null;this.session=0;this.phase='idle';this.signals=new SignalLibrary({fetcher});this.night=new NightLibrary({fetcher});this.hiddenSelector=new HiddenSelector({random});this.deck=new SignalDeck(random);this.currentEpisode=null;this.episodeMemory=null;}
 getEpisode(id){return this.signals.get(id)||this.night.get(id);}
 async init(){const r=await this.fetcher(new URL('config/exhibition.json',root));if(!r.ok)throw Error('공연 음원 목록을 읽지 못했습니다. '+r.status);const c=await r.json();if(!Array.isArray(c.actors)||c.actors.length!==6||new Set(c.actors.map(a=>a.id)).size!==6||c.actors.some(a=>!callProfiles[a.id]||a.voice!==`assets/audio/cast/${a.id}.mp3`||a.world!==`assets/soundscapes/${a.id}.mp3`||!Number.isSafeInteger(a.bytes)||a.bytes<100||a.bytes>2*1024*1024||!/^[a-f0-9]{64}$/.test(a.sha256)))throw Error('공연 음원 목록 형식 오류');this.catalog=c;try{await this.signals.init();}catch(e){this.status({warning:e.message+' · 기본6통화 유지'});}try{const n=await this.night.init();this.hiddenSelector.probability=n.hiddenProbability;this.hiddenSelector.minimumGap=n.minimumCallsBetweenHidden;}catch(e){this.status({warning:e.message+' · 기존26통화 유지'});}return c;}
 async prepare(){if(this.bytes.size===6)return;if(this.loading)return this.loading;this.loading=(async()=>{if(!this.catalog)await this.init();for(const a of this.catalog.actors){const r=await this.fetcher(new URL(a.voice,root),{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(a.name+' 음원 누락 '+r.status);const bytes=await r.arrayBuffer();if(bytes.byteLength!==a.bytes||bytes.byteLength>2*1024*1024)throw Error(a.name+' 음원 크기 불일치');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==a.sha256)throw Error(a.name+' 음원 검증 실패');this.bytes.set(a.id,bytes);}})().finally(()=>{this.loading=null;});return this.loading;}
 ring(){this.director.ring();}
 stop(){this.session++;this.ambient?.stop();this.phase='idle';}
 close(){const call=this.director.current,episode=this.currentEpisode;this.stop();this.director.close();if(call)this.episodeMemory=call.started&&!call.finished?episode:null;this.currentEpisode=null;}
 reset(){this.close();this.director.reset();this.episodeMemory=null;}
 nextVisitor(){this.close();this.director.unfinished=null;this.episodeMemory=null;}
 async runProgressive({call,settings,signal,end}){
  this.phase='arrival';
  this.status({phase:'arrival',episode:call.id,episodeTitle:call.title,episodeKind:PROGRESSIVE_HAUNT,text:'회선 연결 중'});
  const ticket=++this.session;
  const check=()=>{if(signal.aborted||ticket!==this.session)throw abortError();};
  let bytes=this.progressiveBytes?.id===call.id?this.progressiveBytes.buffer:null;
  await wait(165,signal);
  if(!bytes){
   const response=await this.fetcher(new URL(call.file,root),{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error('대표 통화 원음 읽기 실패 '+response.status);
   bytes=await response.arrayBuffer();
   if(!bytes.byteLength||bytes.byteLength>3*1024*1024)throw Error('대표 통화 원음 크기 오류');
   check();
   this.progressiveBytes={id:call.id,buffer:bytes};
  }
  check();
  await this.desk.play(bytes,{signal,volume:settings.progressiveVolume,
   progressive:{start:settings.progressiveStart,speed:settings.progressiveSpeed,max:settings.progressiveMax,noise:settings.progressiveNoise,finalAt:call.finalAt},
   onStart:()=>{this.phase='speech';this.status({phase:'speech',playbackStarted:true,actor:call.actor,scene:call.title,text:'통화 연결'});}});
  check();
  this.phase='remote_end';
  this.status({phase:'remote_end',lineEvent:'disconnected',text:'상대방 종료'});
  end();
 }
 async run({settings,allowed,signal,end,episodeChoice='auto'}){
  if(signal.aborted)throw abortError();await this.prepare();if(signal.aborted)throw abortError();
  const ids=allowed.filter(id=>this.bytes.has(id));
  const classic=this.catalog.actors.filter(a=>ids.includes(a.id)).map(a=>({id:'base-'+a.id,actorId:a.id,kind:'classic',title:a.name+' · 기본 통화'}));
  let selected,call;
  if(episodeChoice==='classic'){call=this.director.connect(ids);selected=classic.find(e=>e.actorId===call.actorId);}
  else if(episodeChoice!=='auto'){selected=this.getEpisode(episodeChoice);if(!selected||!ids.includes(selected.actorId))throw Error('선택한 통화와 발신자를 확인하세요.');call=this.director.connect([selected.actorId]);}
  else{const memory=this.director.unfinished,age=memory?this.director.now()-memory.at:Infinity;
   selected=memory&&age>=0&&age<=this.director.returnMs&&ids.includes(memory.actorId)&&this.episodeMemory?this.episodeMemory:(this.hiddenSelector.pick(this.night.episodes,ids)||this.deck.pick([...classic,...this.signals.episodes.filter(e=>ids.includes(e.actorId)),...this.night.episodes.filter(e=>!e.hidden&&ids.includes(e.actorId))]));
   call=this.director.connect([selected.actorId]);
  }
  this.currentEpisode=selected;
  const actor=this.catalog.actors.find(a=>a.id===call.actorId),ticket=++this.session;
  if(!this.ambient)this.ambient=new AmbientBus(this.desk.voice);
  const ambient=this.ambient,world=selected.kind==='noise'?0:clamp(settings.ambientVolume??.045,0,.15),level=clamp(settings.handsetVolume,0,.5);
  const check=()=>{if(signal.aborted||ticket!==this.session)throw abortError();};
  try{
   const context=this.desk.voice;if(context?.state==='suspended'){let timer;try{await Promise.race([context.resume(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('오디오 재개 지연 · 시작 버튼을 다시 눌러 주세요.')),3000);})]);}finally{clearTimeout(timer);}}
   check();if(context?.state!=='running')throw Error('오디오 출력이 잠겼습니다. 오디오 활성화 후 다시 시작하세요.');
   // A missing background must never block a valid voice.
   if(world>0&&!ambient.buffers.has(actor.id))try{const r=await this.fetcher(new URL(actor.world,root),{signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});if(!r.ok)throw Error('HTTP '+r.status);await ambient.load(actor.id,await r.arrayBuffer());}catch(e){check();this.status({warning:'배경음 없이 통화 · '+e.message});}
   check();if(world>0&&ambient.buffers.has(actor.id)){ambient.setVolume(world);ambient.start(actor.id);}
   await runCallScene({actor:actor.id,scene:call.scene,signal,timing:selected.kind==='classic'?undefined:selected.timing,hooks:{
    phase:phase=>{check();this.phase=phase;this.status({phase,actor:actor.name,scene:call.scene,episode:selected.id,episodeTitle:selected.title,episodeKind:selected.kind,text:selected.title+' · '+({arrival:'선이 연결되는 중',speech:selected.kind==='noise'?'비음성 회선·기척':'목소리',response_gap:'대답을 기다리는 침묵',trace:'통화 너머의 기척',remote_end:'상대방 종료'}[phase])});},
    world:({tone,level})=>{ambient.colour(tone);ambient.setVolume(world*level);},
    speak:async()=>{ambient.duck(true);const onStart=metadata=>{this.director.started(call.token);this.status({playbackStarted:true,actor:actor.name,scene:call.scene,prepared:metadata&&typeof metadata==='object'?metadata:null});};try{
     if(selected.kind!=='classic')await this.desk.play(await (selected.catalog==='night'?this.night:this.signals).load(selected.id,signal),{signal,volume:level,telephone:false,effectPreset:'clean',noise:0,rate:1,onStart});
     else if(settings.effect===false)await this.desk.play(this.bytes.get(actor.id),{signal,volume:level,telephone:false,effectPreset:'clean',noise:0,rate:1,onStart});
     else await playFault(this.desk.voice,this.bytes.get(actor.id),{actor:actor.id,scene:call.scene,signal,volume:level,controls:{noise:clamp(settings.lineNoise??.35,0,1),gap:clamp(settings.lineGap??1.15,.6,4)},onStart,onLineEvent:event=>{check();ambient.setVolume(event==='silence'?0:world);this.status({lineEvent:event});}});
     check();this.director.finished(call.token);
    }finally{if(ticket===this.session){ambient.setVolume(world);ambient.duck(false);}}},
    accent:accent=>ambient.accent({...accent,volume:Math.min(world*.8,.08)}),
    end:()=>{check();end();}
   }});
   return {actor:actor.id,scene:call.scene,episode:selected.id};
  }finally{if(ticket===this.session)ambient.stop();}
 }
 dispose(){this.close();this.ambient?.dispose();this.bytes.clear();this.progressiveBytes=null;this.signals.clear();this.night.clear();this.deck.clear();}
}
