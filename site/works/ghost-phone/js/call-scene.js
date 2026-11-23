// Authored, mono-compatible dramaturgy. No microphone, speech recognition or runtime AI.
import {wait as pause,abortError} from './audio.js?v=4.2.0';
export const callProfiles=Object.freeze({
 songaksi:{name:'기다리는 혼례',arrival:1200,listen:4200,after:2600,openingTone:.75,closingTone:.35,closingLevel:.82,accent:{offset:2.8,duration:1.0,volume:.12}},
 mongdal:{name:'막차가 지나간 뒤',arrival:700,listen:2400,after:1900,openingTone:.3,closingTone:.12,closingLevel:.3,accent:null},
 changgwi:{name:'친절한 유인',arrival:450,listen:1700,after:2400,openingTone:.8,closingTone:.22,closingLevel:.55,accent:{offset:4.5,duration:1.4,volume:.1}},
 gogwandaemyeon:{name:'응답을 허락하는 사람',arrival:2300,listen:6100,after:2900,openingTone:.4,closingTone:.1,closingLevel:.9,accent:null},
 yeopjeon:{name:'아직 돌려주지 않은 것',arrival:1000,listen:1300,after:2600,openingTone:.55,closingTone:.4,closingLevel:.65,accent:{offset:4,duration:1.1,volume:.13}},
 seongju:{name:'집 안쪽의 경고',arrival:650,listen:2300,after:1700,openingTone:.7,closingTone:.5,closingLevel:.4,accent:null}
});
export function directedProfile(actor,scene='answer'){
 const p=callProfiles[actor];if(!p)throw Error('연출 프로필이 없습니다.');
 return {...p,arrival:scene==='return'?Math.min(450,p.arrival):scene==='hesitate'?p.arrival+500:p.arrival,listen:scene==='return'?Math.max(1000,p.listen-700):p.listen};
}
export async function runCallScene({actor,scene,hooks,signal,wait=pause,timing}){
 const p=directedProfile(actor,scene);if(timing)for(const [key,min,max] of [['arrival',100,3000],['listen',200,6000],['after',200,3000]]){const n=timing[key];if(!Number.isFinite(n)||n<min||n>max)throw Error('통화 연출 시간 범위 오류');p[key]=key==='arrival'?(scene==='return'?Math.min(250,n):scene==='hesitate'?n+350:n):n;}const check=()=>{if(signal?.aborted)throw abortError();};
 const phase=name=>{check();hooks.phase?.(name);};
 phase('arrival');hooks.world?.({tone:p.openingTone,level:1});await wait(p.arrival,signal);check();
 phase('speech');await hooks.speak();check();
 // This gap is composed silence for the listener, not detected or understood speech.
 phase('response_gap');await wait(p.listen,signal);check();
 phase('trace');hooks.world?.({tone:p.closingTone,level:p.closingLevel});if(p.accent)hooks.accent?.(p.accent);
 await wait(p.after,signal);check();phase('remote_end');hooks.end();
 return {actor,scene,ended:true};
}
