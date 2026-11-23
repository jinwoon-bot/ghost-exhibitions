import {abortError} from './audio.js?v=4.2.0';
const root=new URL('../',import.meta.url),actors=new Set(['songaksi','mongdal','changgwi','gogwandaemyeon','yeopjeon','seongju']);
export function validateSignals(c){
 if(c?.version!==1||!Array.isArray(c.episodes)||c.episodes.length!==20||new Set(c.episodes.map(e=>e.id)).size!==20)throw Error('추가 통화 목록은 고유한20편이 필요합니다.');
 for(const e of c.episodes){if(!/^s(?:0[1-9]|1[0-9]|20)$/.test(e.id)||!actors.has(e.actorId)||!['voice','noise'].includes(e.kind)||e.file!==`assets/audio/signals/${e.id}.mp3`||!Number.isSafeInteger(e.bytes)||e.bytes<100||e.bytes>512000||!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isFinite(e.duration)||e.duration<1||e.duration>15)throw Error('추가 통화 리소스 형식 오류');
 for(const [key,min,max] of [['arrival',100,3000],['listen',200,6000],['after',200,3000]])if(!Number.isFinite(e.timing?.[key])||e.timing[key]<min||e.timing[key]>max)throw Error('추가 통화 시간 범위 오류');
 }return c;
}
export class SignalLibrary {
 constructor({fetcher=fetch,limit=2*1024*1024,maxItems=6}={}){this.fetcher=(...args)=>fetcher(...args);this.limit=limit;this.maxItems=maxItems;this.cache=new Map();this.bytes=0;this.episodes=[];}
 async init(){const r=await this.fetcher(new URL('config/signals.json?v=4.0.0',root),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('추가 통화 목록 HTTP '+r.status);const c=validateSignals(await r.json());this.episodes=c.episodes;return c;}
 get(id){return this.episodes.find(e=>e.id===id);}
 async load(id,signal){if(signal?.aborted)throw abortError();const e=this.get(id);if(!e)throw Error('준비되지 않은 추가 통화');
 if(this.cache.has(id)){const b=this.cache.get(id);this.cache.delete(id);this.cache.set(id,b);return b;}
 const r=await this.fetcher(new URL(e.file+'?sha='+e.sha256,root),{signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)])});if(!r.ok)throw Error(e.title+' 음원 HTTP '+r.status);
 const b=await r.arrayBuffer();if(signal?.aborted)throw abortError();if(b.byteLength!==e.bytes)throw Error(e.title+' 음원 크기 오류');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');if(signal?.aborted)throw abortError();if(sha!==e.sha256)throw Error(e.title+' 음원 해시 오류');
 if(b.byteLength<=this.limit){if(this.cache.has(id)){this.bytes-=this.cache.get(id).byteLength;this.cache.delete(id);}while(this.cache.size>=this.maxItems||this.bytes+b.byteLength>this.limit){const key=this.cache.keys().next().value;this.bytes-=this.cache.get(key).byteLength;this.cache.delete(key);}this.cache.set(id,b);this.bytes+=b.byteLength;}
 return b;
 }
 clear(){this.cache.clear();this.bytes=0;}
}
// 고정된 목록을 회차마다 섞는다. 개인 식별/행동 녹화/발화 분석은 하지 않는다.
export class SignalDeck {
 constructor(random=Math.random){this.random=random;this.bags=new Map();this.last=null;this.lastActor=null;}
 pick(items){if(!items.length)throw Error('선택 가능한 통화가 없습니다.');const key=items.map(e=>e.id).sort().join('|');let bag=this.bags.get(key);
 if(!bag?.length){bag=items.slice();for(let i=bag.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(this.random()*(i+1))));[bag[i],bag[j]]=[bag[j],bag[i]];}if(this.bags.size>=8&&!this.bags.has(key))this.bags.delete(this.bags.keys().next().value);this.bags.set(key,bag);}
 let at=bag.findIndex(e=>e.id!==this.last&&e.actorId!==this.lastActor);if(at<0)at=bag.findIndex(e=>e.id!==this.last);if(at<0)at=0;
 const [e]=bag.splice(at,1);this.last=e.id;this.lastActor=e.actorId;return e;
 }
 clear(){this.bags.clear();this.last=this.lastActor=null;}
}
