// Scene selection never pretends a planned line has an audio performance.
export const sceneNames=Object.freeze({answer:'첫 수신',hesitate:'늦은 수신',return:'중간에 끊고 재수신'});
export const slotKey=(actor,scene)=>actor+':'+scene;
export function readyPerformers(catalog,bank){return catalog.performers.filter(p=>bank.get(slotKey(p.id,'answer'))?.bytes?.byteLength>0);}
export function performanceFor(catalog,bank,actorId,scene){
  const actor=catalog.performers.find(p=>p.id===actorId);if(!actor||!sceneNames[scene])throw Error('인물 또는 반응 종류를 확인하세요.');
  const candidate=bank.get(slotKey(actorId,scene)),exact=candidate?.bytes?.byteLength?candidate:null,record=exact||bank.get(slotKey(actorId,'answer'));
  if(!record?.bytes?.byteLength)return null;
  return {actor,record,requestedScene:scene,fallback:!exact,delayMs:actor.delay[scene],plannedText:actor.lines[scene],spokenText:record.spokenText||null};
}
