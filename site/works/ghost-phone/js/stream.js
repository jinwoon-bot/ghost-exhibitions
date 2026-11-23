import {apiURL,boundedBytes} from './api.js?v=4.2.0';import {EffectChain} from './effects.js?v=4.2.0';
export const canStream=()=>typeof MediaSource!=='undefined'&&MediaSource.isTypeSupported('audio/mpeg');
// MP3 MediaSource is feature-detected. Unsupported browsers receive the complete file instead.
export async function liveSpeech(desk,{endpoint,token,body,signal,options,status,fetcher=fetch}){
  if(!canStream())return null;
  const c=new AbortController(),abort=()=>c.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)c.abort();const timer=setTimeout(abort,18000);
  let response,reader,element,url,source,chain,stop,finished=false;
  const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);element?.pause();if(element){element.removeAttribute('src');element.load();}if(url)URL.revokeObjectURL(url);source?.disconnect();chain?.dispose();if(desk.activeStop===stop)desk.activeStop=null;if(desk.activeFX===chain)desk.activeFX=null;};
  try{
    response=await fetcher(apiURL(endpoint,'tts'),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...body,stream:true}),signal:c.signal});if(!response.ok){let msg='AI 스트림 오류 '+response.status;try{msg=(await response.json()).error||msg;}catch{}throw Error(msg);}if(!response.headers.get('Content-Type')?.startsWith('audio/'))throw Error('오디오 스트림 응답 아님');
    const media=new MediaSource();element=new Audio();element.preload='auto';url=URL.createObjectURL(media);element.src=url;
    await new Promise((resolve,reject)=>{media.addEventListener('sourceopen',resolve,{once:true});c.signal.addEventListener('abort',()=>reject(new DOMException('취소됨','AbortError')),{once:true});});
    const buffer=media.addSourceBuffer('audio/mpeg');chain=new EffectChain(desk.voice,desk.voice.destination,{volume:options.volume,preset:options.effectPreset||'old',noise:options.noise});source=desk.voice.createMediaElementSource(element);source.connect(chain.input);desk.activeFX=chain;
    let rejectPlayback;const ended=new Promise((resolve,reject)=>{rejectPlayback=reject;element.onended=resolve;element.onerror=()=>reject(Error('MP3 스트리밍 디코더 오류'));});ended.catch(()=>{});
    stop=()=>{c.abort();reader?.cancel().catch(()=>{});element.pause();rejectPlayback(new DOMException('취소됨','AbortError'));};desk.activeStop=stop;c.signal.addEventListener('abort',()=>{element.pause();rejectPlayback(new DOMException('취소됨','AbortError'));},{once:true});
    reader=response.body.getReader();let count=0,started=false,playPromise;const parts=[];
    while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>2*1024*1024)throw Error('스트림 크기 상한');parts.push(value);
      await new Promise((resolve,reject)=>{const remove=()=>{buffer.removeEventListener('updateend',ok);buffer.removeEventListener('error',bad);c.signal.removeEventListener('abort',bad);},ok=()=>{remove();resolve();},bad=()=>{remove();reject(Error('스트림 추가 중단'));};buffer.addEventListener('updateend',ok,{once:true});buffer.addEventListener('error',bad,{once:true});c.signal.addEventListener('abort',bad,{once:true});try{buffer.appendBuffer(value);}catch(e){remove();reject(e);}});
      if(!started){started=true;element.onplaying=()=>status({phase:'playing',mode:'ai',text:'AI 전송 중 재생 · MP3 스트림'});playPromise=element.play();playPromise.catch(e=>{c.abort();rejectPlayback(e);});}
    }
    clearTimeout(timer);if(!count)throw Error('빈 스트림');if(media.readyState==='open')media.endOfStream();await playPromise;await ended;if(signal.aborted)throw new DOMException('취소됨','AbortError');finished=true;const bytes=new Uint8Array(count);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}return bytes.buffer;
  }catch(e){c.abort();await reader?.cancel().catch(()=>{});if(signal.aborted)throw new DOMException('취소됨','AbortError');throw e;}finally{cleanup();}
}
