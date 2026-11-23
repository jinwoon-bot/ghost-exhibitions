export class ScreenAwake{
 constructor(){this.lock=null;this.enabled=false;this.state='대기';this.pending=false;}
 async enable(enabled){
  this.enabled=enabled;if(!enabled){await this.lock?.release();this.lock=null;this.state='꺼짐';return;}
  if(this.lock||this.pending||document.hidden)return;
  if(!navigator.wakeLock){this.state='브라우저 미지원 · Windows 절전 설정 확인';return;}
  this.pending=true;try{const lock=await navigator.wakeLock.request('screen');if(!this.enabled){await lock.release();return;}this.lock=lock;this.state='화면 켜짐 유지 중';lock.addEventListener('release',()=>{if(this.lock===lock){this.lock=null;this.state='해제됨 · 탭/절전 상태 확인';}});}
  catch{this.state='요청 불가 · Windows 절전 설정 확인';}finally{this.pending=false;}
 }
}
