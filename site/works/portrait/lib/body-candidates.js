// 몸통 폭으로 얼굴 크기를 환산한다. 실제 깊이나 개인 식별은 아니다.
export function bodyCandidates(result) {
  return (result?.landmarks||[]).flatMap(p=>{
    const good=i=>p[i]&&Number.isFinite(p[i].x)&&Number.isFinite(p[i].y)&&(p[i].visibility??0)>=.45;
    if(![11,12,23,24].every(good))return [];
    const shoulder={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2};
    const hip={x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2};
    const torso=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y),span=Math.hypot(p[11].x-p[12].x,p[11].y-p[12].y);
    if(torso<.055||span<.035||hip.y<shoulder.y+.035)return [];
    const w=Math.max(span*.48,torso*.36),x=good(0)?p[0].x:shoulder.x,y=good(0)?p[0].y:Math.max(0,shoulder.y-torso*.35);
    const score=Math.min(...[11,12,23,24].map(i=>p[i].visibility??0));
    return [{x,y,w,h:w*1.2,score,kind:'body'}];
  });
}
export function combineCandidates(faces,bodies) {
  const used=new Set();
  const people=bodies.map(body=>{
    let near=-1,d=.14;for(let i=0;i<faces.length;i++){if(used.has(i))continue;const f=faces[i],dist=Math.hypot(f.x-body.x,f.y-body.y);if(dist<d){d=dist;near=i;}}
    if(near>=0){used.add(near);return {...faces[near],w:body.w,h:body.h,kind:'face+body'};}
    return body;
  });
  return people.concat(faces.filter((_,i)=>!used.has(i)));
}
