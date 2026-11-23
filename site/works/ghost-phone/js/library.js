// 한 음원만 재생한다. 페이지 진입 시 MP3는 내려받지 않는다.
const actors=new Set(['songaksi','mongdal','changgwi','gogwandaemyeon','yeopjeon','seongju']);
export function validateLibrary(c){
 if(c?.version!==1||!Array.isArray(c.items)||!c.items.length||c.items.length>200||c.count!==c.items.length)throw Error('통합 음원 목록 형식 오류');
 const ids=new Set(),hashes=new Set();
 for(const e of c.items){if(!/^clip-[a-f0-9]{16}$/.test(e.id)||ids.has(e.id)||hashes.has(e.sha256)||!actors.has(e.actorId)||!['voice','noise','background','laughter'].includes(e.kind)||!/^assets\/(?:audio\/(?:cast|source|signals|library|night)|soundscapes)\/[a-z0-9_-]+\.mp3$/.test(e.file)||!Number.isSafeInteger(e.bytes)||e.bytes<100||e.bytes>2000000||!/^[a-f0-9]{64}$/.test(e.sha256))throw Error('잘못된 통합 음원 항목');ids.add(e.id);hashes.add(e.sha256);}
 return c;
}
export function orderedQueue(items,{shuffle=false,random=Math.random}={}){const ids=items.map(e=>e.id);if(shuffle)for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;}
export function nextClip(queue,current,step=1){if(!queue.length)return null;const i=queue.indexOf(current);return queue[((i<0?step<0?0:-1:i)+step+queue.length)%queue.length];}
