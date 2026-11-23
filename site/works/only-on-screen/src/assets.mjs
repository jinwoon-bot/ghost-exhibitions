export const KEYS=['ghost_far','ghost_middle','ghost_close','ghost_face_reveal'];
export function safeAssetPath(path){
  if(typeof path!=='string'||!path||/^(?:[a-z]+:|\/|\\)/i.test(path)||path.split(/[\\/]/).includes('..'))throw Error('에셋 경로는 이 프로젝트 안의 상대경로여야 합니다.');
  return path;
}
export class GhostAssets {
  constructor(onError){this.onError=onError;this.entries={};this.cache=new Map();this.objectURLs=new Map();}
  async load(){
    const response=await fetch(new URL('../assets/ghosts/manifest.json',import.meta.url),{cache:'no-cache'});
    if(!response.ok)throw Error('assets/ghosts/manifest.json 로딩 실패 HTTP '+response.status);
    this.manifest=await response.json();
    for(const key of KEYS){const entry=this.manifest[key];if(!entry)throw Error('귀신 에셋 누락: '+key);this.entries[key]={...entry,path:safeAssetPath(entry.path)};}
    this.geometry=this.manifest.geometry;
    // Prepare serially so the three depth entries truly share one decoder.
    for(const key of KEYS)await this.prepare(key);
    return this.manifest;
  }
  async prepare(key){
    const entry=this.entries[key],url=this.objectURLs.get(key)||new URL('../'+entry.path,import.meta.url).href;
    if(this.cache.has(url)){entry.media=this.cache.get(url);return;}
    let media;
    if(entry.type==='image'){media=new Image();media.src=url;await media.decode();}
    else {
      media=document.createElement('video');media.muted=true;media.playsInline=true;media.preload='auto';media.loop=entry.loop!==false;media.src=url;
      await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('영상 준비 시간 초과: '+entry.path)),20000);media.addEventListener('loadeddata',()=>{clearTimeout(timeout);resolve();},{once:true});media.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('영상 디코딩 실패: '+entry.path));},{once:true});media.load();});
    }
    this.cache.set(url,media);entry.media=media;
  }
  async replace(key,fileOrPath){
    if(!KEYS.includes(key))throw Error('알 수 없는 에셋 단계');
    const before=this.entries[key],oldURL=this.objectURLs.get(key);let path,type;
    if(typeof fileOrPath==='string'){path=safeAssetPath(fileOrPath);type=/\.(png|webp|jpe?g)$/i.test(path)?'image':'video';this.objectURLs.delete(key);}
    else {
      if(!/^(image\/(png|webp)|video\/(webm|mp4))$/.test(fileOrPath.type)||fileOrPath.size>50*1024*1024)throw Error('투명 WebP/PNG 또는 WebM/MP4, 50MB 이하 파일을 선택하세요. MP4는 알파가 없습니다.');
      type=fileOrPath.type.startsWith('image')?'image':'video';path=fileOrPath.name;this.objectURLs.set(key,URL.createObjectURL(fileOrPath));
    }
    const nextURL=this.objectURLs.get(key);this.entries[key]={...before,path,type};
    try{await this.prepare(key);}catch(e){this.entries[key]=before;if(nextURL)URL.revokeObjectURL(nextURL);if(oldURL)this.objectURLs.set(key,oldURL);else this.objectURLs.delete(key);throw e;}
    if(oldURL&&oldURL!==nextURL){this.cache.get(oldURL)?.pause?.();this.cache.delete(oldURL);URL.revokeObjectURL(oldURL);}
    this.collect();
  }
  collect(){const active=new Set(Object.values(this.entries).map(e=>e.media));for(const [url,m] of this.cache){if(!active.has(m)){m.pause?.();if(m instanceof HTMLVideoElement){m.removeAttribute('src');m.load();}this.cache.delete(url);}}}
  play(key){const m=this.entries[key]?.media;if(m instanceof HTMLVideoElement&&m.paused&&!m.ended)m.play().catch(()=>{});return m;}
  pauseAll(){for(const m of this.cache.values())m.pause?.();}
  reset(){for(const m of this.cache.values())if(m instanceof HTMLVideoElement){m.pause();m.currentTime=0;}}
  dispose(){this.pauseAll();for(const url of this.objectURLs.values())URL.revokeObjectURL(url);this.objectURLs.clear();for(const m of this.cache.values())if(m instanceof HTMLVideoElement){m.removeAttribute('src');m.load();}this.cache.clear();}
}
