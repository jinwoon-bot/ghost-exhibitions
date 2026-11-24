import {liveSpeech,canStream} from './stream.js?v=4.2.0';
import {EffectChain} from './effects.js?v=4.2.0';
import {effectPresets,sourceFor} from './voices.js?v=4.2.0';
import {boundedBytes} from './api.js?v=4.2.0';
import {clamp,NoRepeat} from './core.js?v=4.2.0';
import {ProgressiveHaunt} from './progressive.js?v=scene-polish';
export const abortError=()=>new DOMException('취소됨','AbortError');
export function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(abortError());const cancel=()=>{clearTimeout(timer);reject(abortError());};const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);signal?.addEventListener('abort',cancel,{once:true});});}
export class AudioMemory {
  constructor(limit=12*1024*1024){this.limit=limit;this.items=new Map();this.bytes=0;}
  get(k){const v=this.items.get(k);if(v){this.items.delete(k);this.items.set(k,v);}return v;}
  put(k,v){if(v.byteLength>this.limit)return;this.delete(k);while(this.bytes+v.byteLength>this.limit)this.delete(this.items.keys().next().value);this.items.set(k,v);this.bytes+=v.byteLength;}
  delete(k){const v=this.items.get(k);if(v)this.bytes-=v.byteLength;this.items.delete(k);}
  clear(){this.items.clear();this.bytes=0;}
}
export async function requestSpeech({endpoint,token,ghost,line,revision,cache,signal,presetId='default',fetcher=fetch}){
  if(!endpoint)throw Error('AI 서버 주소가 없습니다. MP3/브라우저 테스트로 전환합니다.');
  const url=new URL(endpoint);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('AI 서버는 HTTPS 주소가 필요합니다.');
  const timeout=new AbortController(),timer=setTimeout(()=>timeout.abort(),18000);
  const abort=()=>timeout.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)timeout.abort();
  try{
    const response=await fetcher(new URL('tts',url.href.endsWith('/')?url:new URL(url.href+'/')),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({ghostId:ghost.id,lineId:line.id,presetId,revision,cache:!!cache}),signal:timeout.signal});
    if(!response.ok){let message='AI 서버 오류 '+response.status;try{message=(await response.json()).error||message;}catch{}throw Error(message);}
    if(!response.headers.get('content-type')?.startsWith('audio/'))throw Error('AI 서버가 오디오를 반환하지 않았습니다.');
    const reader=response.body.getReader();let count=0;const chunks=[];try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.byteLength;if(count>2*1024*1024)throw Error('AI 음원 크기 제한 초과');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
    const bytes=new Uint8Array(count);let p=0;for(const v of chunks){bytes.set(v,p);p+=v.length;}if(!count)throw Error('AI 음원이 비어 있습니다.');return bytes.buffer;
  }catch(e){if(signal?.aborted)throw abortError();if(timeout.signal.aborted)throw Error('AI 응답 시간 초과');throw e;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
// A future dialogue adapter can replace prepare/play/stop without changing Telephone.
export class DialogueAdapter { async prepare(){throw Error('실시간 대화 모드는 아직 구현되지 않았습니다.');} stop(){} }
export class SoundDesk {
  constructor(){this.voice=null;this.ring=null;this.ringTimer=null;this.ringNodes=[];this.activeStop=null;this.unlocked=false;}
  async unlock(){
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw Error('Web Audio를 사용할 수 없습니다. Chrome을 사용하세요.');
    if(!this.voice||this.voice.state==='closed')this.voice=new Context();if(!this.ring||this.ring.state==='closed')this.ring=new Context();await Promise.all([this.voice.resume(),this.ring.resume()]);
    if(this.voice.state!=='running'||this.ring.state!=='running')throw Error('소리가 잠겨 있습니다. 시작 버튼을 다시 눌러 주세요.');this.unlocked=true;
  }
  async setOutput(kind,id){const ctx=kind==='ring'?this.ring:this.voice;if(!ctx?.setSinkId){if(id)throw Error('이 브라우저는 앱별 출력 선택을 지원하지 않습니다. Windows 사운드 설정에서 출력 장치를 지정하세요.');return;}await ctx.setSinkId(id||'');}
  tone(context,hz,start,duration,volume){const o=context.createOscillator(),g=context.createGain();o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(volume,start+.02);g.gain.setValueAtTime(volume,start+Math.max(.02,duration-.03));g.gain.linearRampToValueAtTime(0,start+duration);o.connect(g).connect(context.destination);o.start(start);o.stop(start+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};return o;}
  startRing(volume){this.stopRing();if(!this.unlocked)throw Error('먼저 오디오를 활성화하세요.');const strike=()=>{const t=this.ring.currentTime;this.ringNodes=this.ringNodes.filter(x=>x._end>t);for(const offset of [0,.34,.68,1.02])for(const hz of [480,620]){const node=this.tone(this.ring,hz,t+offset,.22,clamp(volume,0,.5)*.12);node._end=t+offset+.3;this.ringNodes.push(node);}};strike();this.ringTimer=setInterval(strike,4200);}
  stopRing(){clearInterval(this.ringTimer);this.ringTimer=null;for(const n of this.ringNodes)try{n.stop();}catch{}this.ringNodes=[];}
  cue(end=false,volume=.3){if(!this.unlocked)return;this.tone(this.voice,end?300:420,this.voice.currentTime,.12,clamp(volume,0,.5)*.06);}
  setEffect(preset){this.activeFX?.set(preset);}
  async play(bytes,{signal,volume=.45,telephone=true,noise,rate=1,effectPreset,onStart,progressive}={}){
    if(signal?.aborted)throw abortError();const ctx=this.voice;
    if(ctx?.state==='suspended'&&this.unlocked){let timer;try{await Promise.race([ctx.resume(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('오디오 재개가 지연됩니다. 시작 버튼을 다시 눌러 주세요.')),3000);})]);}finally{clearTimeout(timer);}}
    if(signal?.aborted)throw abortError();if(!ctx||ctx.state!=='running')throw Error('오디오가 잠겨 있습니다. 시작 버튼으로 활성화하세요.');
    const buffer=await ctx.decodeAudioData(bytes.slice(0));if(signal?.aborted)throw abortError();const name=effectPreset||(telephone?'old':'clean'),p=progressive?{before:0,after:0}:effectPresets[name]||effectPresets.old;
    await wait(p.before,signal);if(signal?.aborted)throw abortError();
    if(progressive)return this.playProgressive(buffer,{signal,volume,options:progressive,onStart});
    const source=ctx.createBufferSource(),fade=ctx.createGain(),chain=new EffectChain(ctx,ctx.destination,{volume,preset:name,noise});source.buffer=buffer;source.playbackRate.value=clamp(rate,.6,1.2);source.connect(fade).connect(chain.input);this.activeFX=chain;
    const t=ctx.currentTime,duration=buffer.duration/source.playbackRate.value;fade.gain.setValueAtTime(0,t);fade.gain.linearRampToValueAtTime(1,t+.02);fade.gain.setValueAtTime(1,t+Math.max(.02,duration-.035));fade.gain.linearRampToValueAtTime(0,t+duration);
    return new Promise((resolve,reject)=>{let settled=false,tailTimer;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(tailTimer);signal?.removeEventListener('abort',cancel);try{source.stop();}catch{}source.disconnect();fade.disconnect();chain.dispose();if(this.activeFX===chain)this.activeFX=null;if(this.activeStop===cancel)this.activeStop=null;error?reject(error):resolve();};const cancel=()=>finish(abortError());this.activeStop=cancel;signal?.addEventListener('abort',cancel,{once:true});source.onended=()=>{tailTimer=setTimeout(()=>finish(),p.after);};source.start();onStart?.(buffer.duration);
    });
  }  speak(text,{signal,voiceURI,volume,rate}){
    if(!window.speechSynthesis)throw Error('브라우저 음성을 지원하지 않습니다. MP3를 등록하세요.');if(signal?.aborted)throw abortError();
    const voices=speechSynthesis.getVoices(),voice=voices.find(v=>v.voiceURI===voiceURI)||voices.find(v=>v.lang.toLowerCase().startsWith('ko'));
    if(!voice)throw Error('한국어 브라우저 목소리가 없습니다. Windows 한국어 음성 팩 또는 MP3가 필요합니다.');
    return new Promise((resolve,reject)=>{const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';u.voice=voice;u.rate=clamp(rate,.6,1.2);u.volume=clamp(volume,0,.65);let settled=false;
      const finish=e=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);if(this.activeStop===cancel)this.activeStop=null;e?reject(e):resolve();};
      const cancel=()=>{speechSynthesis.cancel();finish(abortError());};u.onend=()=>finish();u.onerror=e=>finish(Error('브라우저 음성: '+e.error));this.activeStop=cancel;signal?.addEventListener('abort',cancel,{once:true});speechSynthesis.speak(u);
    });
  }
  playProgressive(buffer,{signal,volume,options,onStart}){
    if(signal?.aborted)throw abortError();
    const ctx=this.voice,start=ctx.currentTime+.035;
    if(buffer.duration<.2)throw Error('점진적 변조 원음이 너무 짧습니다.');
    const source=ctx.createBufferSource();source.buffer=buffer;
    const chain=new ProgressiveHaunt(ctx,ctx.destination,volume,options,start,buffer.duration);
    source.connect(chain.input);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=error=>{
        if(settled)return;
        settled=true;
        clearTimeout(stopTimer);
        signal?.removeEventListener('abort',cancel);
        if(this.activeStop===cancel)this.activeStop=null;
        source.disconnect();chain.dispose();
        error?reject(error):resolve();
      };
      const cancel=()=>{
        if(settled||finishCallWithAbort)return;
        finishCallWithAbort=true;
        const t=ctx.currentTime;
        chain.master.cancelAndHoldAtTime(t);
        chain.master.setTargetAtTime(0,t,.002);
        try{source.stop(t+.012);}catch{}
        stopTimer=setTimeout(()=>finish(abortError()),24);
      };
      let finishCallWithAbort=false,stopTimer;
      this.activeStop=cancel;
      signal?.addEventListener('abort',cancel,{once:true});
      source.onended=()=>finish(finishCallWithAbort?abortError():null);
      source.start(start);
      onStart?.(buffer.duration);
    });
  }
  stop(){this.activeStop?.();this.stopRing();}
}
export class VoiceService {
  constructor({desk,status,fetcher=fetch}){Object.assign(this,{desk,status});this.fetcher=(...args)=>fetcher(...args);this.cache=new AudioMemory();this.choose=new NoRepeat();this.files=new Map();this.token='';this.voiceURI='';}
  register(ghostId,files){const old=this.files.get(ghostId)||[];old.forEach(x=>URL.revokeObjectURL(x.url));this.files.set(ghostId,files.map(f=>({url:URL.createObjectURL(f),name:f.name})));}
  clear(){this.cache.clear();for(const list of this.files.values())list.forEach(x=>URL.revokeObjectURL(x.url));this.files.clear();this.token='';}
  async mp3(g,options){
    let records=[];if(this.bank)try{records=await this.bank.all();}catch(e){this.status({error:'브라우저 음원 저장소 접근 실패 · 프로젝트/탭 음원은 계속 사용합니다.'});}const valid=records.filter(r=>r.ghostId===g.id&&!r.mock&&r.enabled!==false);
    const list=[...valid.map(r=>({...r,bank:true})),...(this.files.get(g.id)||[]).map(r=>({...r,id:r.url})),...g.mp3.map(url=>({id:url,url,name:url}))];
    if(!list.length)throw Error('등록된 MP3가 없습니다.');this.sequences??=new Map();let track;
    if(options.recordId)track=list.find(r=>r.id===options.recordId);
    if(!track&&g.mp3Order==='sequence'){const index=this.sequences.get(g.id)||0;track=list[index%list.length];this.sequences.set(g.id,(index+1)%list.length);}track??=this.choose.pick(list,g.id+':mp3');
    this.status({phase:'loading',text:'MP3 준비 · '+track.name,mode:'mp3'});
    let bytes;if(track.bank)bytes=await (await this.bank.blob(track.id)).arrayBuffer();else{const r=await this.fetcher(track.url,{signal:options.signal});if(!r.ok)throw Error('MP3 읽기 실패 '+r.status);bytes=await boundedBytes(r);}
    if(options.signal.aborted)throw abortError();await this.desk.play(bytes,{...options,onStart:()=>this.status({phase:'playing',text:'MP3 재생 · '+track.name,mode:'mp3'})});return 'mp3';
  }
  async run(g,settings,{signal,revision}){
    let records=[];if(this.bank)try{records=await this.bank.all();}catch(e){this.status({error:'저장 음원 접근 실패: '+e.message});}
    const selected=g.candidates?sourceFor(g,settings,records,this.choose):{mode:settings.mode},candidate=selected.candidate;
    const actor=candidate?{...g,...candidate,id:g.id,lines:g.lines,mp3:g.mp3,volume:g.volume,telephone:g.telephone}:g;
    const line=this.choose.pick(g.lines,g.id+':line'),options={signal,volume:Math.min(.65,settings.handsetVolume*g.volume),telephone:settings.effect&&g.telephone,noise:settings.noise,rate:actor.rate,effectPreset:settings.effect===false?'clean':settings.effectPreset||'old',recordId:selected.recordId};
    const browser=async()=>{this.status({phase:'playing',text:'브라우저 한국어 음성 테스트 · 전화선 효과/출력 분리 미지원',mode:'browser',line:line.text});await this.desk.speak(line.text,{...options,voiceURI:this.voiceURI});return 'browser';};
    const allowBrowser=settings.allowBrowserFallback===true||!g.candidates;
    if(selected.mode==='browser')return browser();
    if(selected.mode==='mp3'){try{return await this.mp3(g,options);}catch(e){if(signal.aborted)throw abortError();if(!allowBrowser)throw e;this.status({phase:'fallback',text:e.message+' → 브라우저 음성 테스트',error:e.message});return browser();}}
    try{
      const presetId=candidate?.id||'default',key=JSON.stringify([settings.endpoint,revision,g.id,line.id,presetId,actor.model,actor.voiceId,actor.rate,actor.style]);let bytes=settings.cache?this.cache.get(key):null;
      this.status({phase:bytes?'cached':'generating',text:bytes?'캐시된 AI 음원':'AI 생성 요청 중',mode:'ai',line:line.text});
      if(!bytes&&candidate?.streaming&&canStream()){
        bytes=await liveSpeech(this.desk,{endpoint:settings.endpoint,token:this.token,body:{ghostId:g.id,lineId:line.id,presetId,revision,cache:!!settings.cache},signal,options:{...options,rate:1},status:this.status,fetcher:this.fetcher});
        if(bytes){if(signal.aborted)throw abortError();if(settings.cache)this.cache.put(key,bytes);return 'ai';}
      }
      if(!bytes){bytes=await requestSpeech({endpoint:settings.endpoint,token:this.token,ghost:g,line,revision,presetId,cache:settings.cache,signal,fetcher:this.fetcher});if(signal.aborted)throw abortError();if(settings.cache)this.cache.put(key,bytes);}
      await this.desk.play(bytes,{...options,rate:1,onStart:()=>this.status({phase:'playing',text:'AI 음원 재생 · 전체 다운로드'+(candidate?.streaming&&!canStream()?' / 이 브라우저 스트리밍 미지원':''),mode:'ai'})});return 'ai';
    }catch(e){if(signal.aborted)throw abortError();if(settings.fallbackMP3===false)throw e;this.status({phase:'fallback',text:e.message+' → MP3 대체 시도',error:e.message});try{return await this.mp3(g,options);}catch(f){if(signal.aborted)throw abortError();if(!allowBrowser)throw Error(e.message+' / 대체 MP3 없음');this.status({phase:'fallback',text:f.message+' → 브라우저 음성 테스트',error:f.message});return browser();}}
  }
}
