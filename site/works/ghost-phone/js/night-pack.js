import {SignalLibrary} from './signals.js?v=4.2.0';
const root=new URL('../',import.meta.url),ids=new Set(['n01','n02','n03','n04','h01','h02']);
export function validateNightPack(c){
 if(c?.version!==1||!Array.isArray(c.clips)||c.clips.length!==6||new Set(c.clips.map(e=>e.id)).size!==6||!Number.isFinite(c.hiddenProbability)||c.hiddenProbability<0||c.hiddenProbability>.1||!Number.isInteger(c.minimumCallsBetweenHidden)||c.minimumCallsBetweenHidden<8)throw Error('신규 공포 음원 목록 형식 오류');
 for(const e of c.clips){if(!ids.has(e.id)||!['songaksi','mongdal'].includes(e.actorId)||!['voice','laughter'].includes(e.kind)||typeof e.hidden!=='boolean'||e.hidden!==e.id.startsWith('h')||e.file!==`assets/audio/night/${e.id}.mp3`||!Number.isSafeInteger(e.bytes)||e.bytes<100||e.bytes>2000000||!/^[a-f0-9]{64}$/.test(e.sha256)||!Number.isFinite(e.duration)||e.duration<.5||e.duration>60)throw Error('신규 공포 음원 항목 오류');
  for(const [key,min,max] of [['arrival',100,3000],['listen',200,6000],['after',200,3000]])if(!Number.isFinite(e.timing?.[key])||e.timing[key]<min||e.timing[key]>max)throw Error('신규 통화 시간 오류');
 }return c;
}
export class NightLibrary extends SignalLibrary{
 async init(){const r=await this.fetcher(new URL('config/night-pack.json?v=4.2.0',root),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('신규 음원 목록 HTTP '+r.status);const c=validateNightPack(await r.json());this.episodes=c.clips.map(e=>({...e,catalog:'night'}));this.config=c;return c;}
}
// 드문 히든은 일반 셔플에서 제외하고, 명시적 선택은 언제든 허용한다.
// 관객 신원·마이크·현재 날짜를 읽지 않는다. 새로운 관객도 이 쿨다운을 공유한다.
export class HiddenSelector{
 constructor({random=Math.random,probability=.02,minimumGap=8}={}){if(!Number.isFinite(probability)||probability<0||probability>.1||!Number.isInteger(minimumGap)||minimumGap<8)throw Error('히든 빈도 오류');Object.assign(this,{random,probability,minimumGap});this.sinceHidden=minimumGap;this.lastActor=null;}
 pick(items,allowed){const eligible=items.filter(e=>e.hidden&&allowed.includes(e.actorId));this.sinceHidden++;if(!eligible.length||this.sinceHidden<=this.minimumGap||this.random()>=this.probability)return null;const other=eligible.filter(e=>e.actorId!==this.lastActor),pool=other.length?other:eligible;const index=Math.min(pool.length-1,Math.max(0,Math.floor(this.random()*pool.length))),selected=pool[index];this.sinceHidden=0;this.lastActor=selected.actorId;return selected;}
}
