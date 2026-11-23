const KEY='ghost-phone:operator-lock:v2';
const encode=bytes=>Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function pinDigest(pin,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);return encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:160000,hash:'SHA-256'},key,256)));}
export class AdminLock {
  constructor(){this.until=0;this.pending=null;this.failures=0;this.blockUntil=0;this.onActivity=()=>{if(this.until>Date.now())this.until=Date.now()+10*60000;};if(typeof document!=='undefined'){document.addEventListener('pointerdown',this.onActivity,{passive:true});document.addEventListener('keydown',this.onActivity);}}
  async ensure(){if(Date.now()<this.until)return true;if(this.pending)return this.pending;
    this.pending=new Promise(resolve=>{
      let stored;try{stored=JSON.parse(localStorage.getItem(KEY)||'null');}catch{}
      const dialog=document.createElement('dialog');dialog.className='operator-lock';
      dialog.innerHTML='<form method="dialog"><span class="eyebrow">OPERATOR ACCESS</span><h2>운영실 잠금</h2><p class="fine"></p><label>운영자 PIN<input type="password" inputmode="numeric" minlength="6" maxlength="12" autocomplete="off" required pattern="[0-9]{6,12}" autofocus></label><p class="error" role="alert"></p><div class="two"><button type="submit">열기</button><button type="button">취소</button></div><p class="fine">이 PC의 설정 잠금입니다. 실제 AI 호출은 별도 서버 토큰으로 인증합니다.</p></form>';
      dialog.querySelector('p').textContent=stored?'이 PC에서 설정한6~12자리 PIN을 입력하세요.':'처음 실행입니다. 이 PC의 운영자 PIN6~12자리를 정하세요. 다른 PC에는 자동 동기화되지 않습니다.';
      const done=result=>{dialog.close();dialog.remove();this.pending=null;if(result)this.until=Date.now()+10*60000;resolve(result);};dialog.addEventListener('cancel',e=>{e.preventDefault();done(false);});dialog.querySelector('[type=button]').onclick=()=>done(false);
      dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const pin=dialog.querySelector('input').value;if(!/^\d{6,12}$/.test(pin))return;try{if(Date.now()<this.blockUntil)throw Error('잠시 후 다시 시도하세요.');const salt=stored?.salt||encode(crypto.getRandomValues(new Uint8Array(16))),digest=await pinDigest(pin,salt);if(stored&&stored.digest!==digest){this.failures++;if(this.failures>=5){this.blockUntil=Date.now()+30000;this.failures=0;}throw Error('PIN이 다릅니다.');}if(!stored)localStorage.setItem(KEY,JSON.stringify({salt,digest}));this.failures=0;done(true);}catch(error){dialog.querySelector('.error').textContent=error.message;}};document.body.append(dialog);dialog.showModal();
    });return this.pending;
  }
  lock(){this.until=0;}
}
