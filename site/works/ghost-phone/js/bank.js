import {validateScores} from './voices.js?v=4.2.0';
export const MAX_RECORD=20*1024*1024,MAX_BANK=180*1024*1024;
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export class VoiceBank {
  constructor(){this.db=null;}
  async open(){if(this.db)return this.db;if(!globalThis.indexedDB)throw Error('이 브라우저는 음원 저장소를 지원하지 않습니다.');this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ghost-phone:voice-bank',1);r.onupgradeneeded=()=>{r.result.createObjectStore('records',{keyPath:'id'});r.result.createObjectStore('blobs');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.db;}
  async all(){const db=await this.open();return request(db.transaction('records').objectStore('records').getAll());}
  async blob(id){const db=await this.open();return request(db.transaction('blobs').objectStore('blobs').get(id));}
  async put(record,blob){
    if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_RECORD)throw Error('음원은20MiB 이하입니다.');
    const all=await this.all();if(all.filter(r=>r.id!==record.id).reduce((n,r)=>n+r.bytes,0)+blob.size>MAX_BANK)throw Error('음원 저장소180MiB 상한입니다. 불필요한 음원을 지우세요.');
    const r={...record,bytes:blob.size,enabled:record.enabled!==false,scores:validateScores(record.scores||Array(6).fill(null)),createdAt:record.createdAt||Date.now()};
    if(!/^[a-zA-Z0-9_-]{1,80}$/.test(r.id)||!r.ghostId||typeof r.name!=='string')throw Error('음원 메타데이터 오류');
    const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction(['records','blobs'],'readwrite');tx.objectStore('records').put(r);tx.objectStore('blobs').put(blob,r.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('음원 저장 취소'));});return r;
  }
  async update(id,patch){const all=await this.all(),r=all.find(x=>x.id===id);if(!r)throw Error('음원이 없습니다.');if(patch.scores)validateScores(patch.scores);return this.put({...r,...patch,id},await this.blob(id));}
  async delete(id){const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction(['records','blobs'],'readwrite');tx.objectStore('records').delete(id);tx.objectStore('blobs').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  close(){this.db?.close();this.db=null;}
}
