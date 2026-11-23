import {APP_VERSION,permissionState,webglSupport,localResource} from './environment.js';
const root=new URL('../',import.meta.url);
export class Diagnostics {
 constructor({camera,getState,modelOptions,output}){Object.assign(this,{camera,getState,modelOptions,output});this.results=[];this.running=false;}
 add(name,state,detail,help=''){this.results.push({name,state,detail,help});this.draw();}
 draw(){
  this.output.replaceChildren();
  for(const item of this.results){const li=document.createElement('li');li.className='diag-'+item.state;const title=document.createElement('strong');title.textContent=item.name+' · '+({pass:'정상',warn:'확인 필요',fail:'오류',wait:'진행 중'}[item.state]);const p=document.createElement('p');p.textContent=item.detail;li.append(title,p);if(item.help){const tip=document.createElement('p');tip.className='diag-help';tip.textContent=item.help;li.append(tip);}this.output.append(li);}
 }
 async run(){
  if(this.running)return;this.running=true;this.results=[];
  try{
   const secure=isSecureContext&&!!navigator.mediaDevices?.getUserMedia;
   this.add('실행 주소',secure?'pass':'fail',location.protocol+' · '+location.origin,secure?'':'Chrome HTTPS 주소 또는 동봉된 시작 파일로 실행하세요. file:// 직접 열기는 지원하지 않습니다.');
   this.add('브라우저',/Chrome|Chromium|Edg\//.test(navigator.userAgent)?'pass':'warn',navigator.userAgent,'최신 Windows Chrome에서 운영하세요. 다른 PC에서 같은 설정값을 보장하지 않습니다.');
   this.add('로컬 파일','wait','버전/모델/가중치 경로 확인 중');
   try{
    const response=await fetch(new URL('ASSET_HASHES.json',root),{cache:'no-cache'});if(!response.ok)throw Error('ASSET_HASHES.json HTTP '+response.status);const manifest=await response.json();
    const needed=Object.keys(manifest).filter(p=>/\.bin$|\.wasm$|model\.json$|vendor\/.*\.js$|assets\/paper\/hanji\.png$/.test(p));
    let checked=0;
    for(let i=0;i<needed.length;i+=4)await Promise.all(needed.slice(i,i+4).map(async path=>{const r=await fetch(localResource(root,path),{method:'HEAD',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(path+' HTTP '+r.status);/* HEAD 길이는 CDN 압축/전송 인코딩 때문에 원본 크기와 다를 수 있다. 내용 해시는 배포/ZIP에서 검증한다. */checked++;}));
    this.results.pop();this.add('로컬 파일','pass',checked+'개 필수 라이브러리/모델 파일 응답 확인','파일 내용 전체 해시는 배포/패키지 검사에서 별도로 검증합니다.');
   }catch(e){this.results.pop();this.add('로컬 파일','fail',e.message,'ZIP을 모두 풀었는지, GitHub 하위 폴더 구조와 models/vendor 파일 누락, OneDrive의 다운로드 완료 상태를 확인하세요.');}
   const permission=await permissionState();this.add('카메라 권한',permission==='granted'?'pass':permission==='denied'?'fail':'warn',permission,permission==='granted'?'':'카메라 연결을 누른 뒤 Chrome 주소 왼쪽 사이트 설정과 Windows 카메라 개인정보 설정을 확인하세요.');
   let devices=[];try{devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');}catch{}
   const live=this.camera.healthy();this.add('카메라 연결',live?'pass':devices.length?'warn':'fail',live?`${this.camera.video.videoWidth}×${this.camera.video.videoHeight} 실제 프레임 수신 · ${devices.length}개 카메라`:devices.length+'개 카메라 탐색 · 아직 실제 입력 미확인',live?'':'USB 연결을 확인하고 카메라 목록에서 장치를 선택해 다시 연결하세요. 영상 점검 모드는 실제 웹캠 검사와 다릅니다.');
   const gpu=webglSupport();this.add('WebGL',gpu?'pass':'warn',gpu?'브라우저 WebGL 지원':'WebGL 지원을 확인하지 못했습니다.','GPU 오류가 있으면 CPU/저사양 프리셋을 사용하세요. 실제 AI 백엔드는 모델 준비 결과로 확인합니다.');
   try{await this.camera.load(this.modelOptions());this.add('AI 모델','pass',`${this.camera.info.model} · TensorFlow ${this.camera.info.tfVersion} · ${this.camera.backend.toUpperCase()}`,this.camera.backend!=='webgl'?('CPU 대체 경로가 작동 중입니다. '+(this.camera.info.fallbackReason||this.camera.info.wasmReason||'')+' · 실제 속도는 현재 수치에서 확인하세요.'):('반복 예열 '+Math.round(this.camera.info.warmMs||0)+'ms'));}catch(e){this.add('AI 모델','fail',e.message,'모델 파일 경로를 확인하고 GPU/CPU 설정을 바꿔 다시 진단하세요.');}
   const state=this.getState();
   this.add('인물 분리',state.results>0&&state.active?'pass':'warn',state.results>0?`실제 추론 ${state.results}회 · 최근 마스크 ${state.detected} · ${state.lastInferenceSource==='video'?'영상 점검(웹캠 아님)':'카메라 입력'}${state.active?'':' · 현재 입력 분석 중지'}`:'모델 준비와 실제 인물 분리 확인은 다릅니다. 아직 입력 추론 결과가 없습니다.',state.detected?'머리/손/발·여러 관객의 분리는 현장에서 확인하세요.':'관객이 보이는 입력에서 마스크가 생기는지 확인하세요. 빈 공간의 0명 결과는 모델 오류가 아닙니다.');
   if(state.brightness!==null&&state.brightness<8)this.add('입력 밝기','warn','카메라 화면이 거의 검정입니다.','렌즈 덮개/카메라 차단 키/Windows 개인정보 설정/전시장 조명을 확인하세요. 밝기만으로 고장을 확정하지 않습니다.');
   const memory=this.camera.info.memory;
   this.add('메모리/렌더링',state.fps<30||!memory?'warn':'pass',`화면 ${state.fps.toFixed(1)}FPS · 텐서 ${memory?.numTensors??'미확인'} · 분신 ${state.clones}/${state.limit} · 처리 중 입력 ${state.busy?1:0}`,'이는 현재 수치입니다. 수시간 메모리 누수나 모든 PC의 60FPS를 보장하지 않습니다.');
  }finally{this.running=false;}
 }
 export(){return {version:APP_VERSION,at:new Date().toISOString(),checks:this.results,state:this.getState(),note:'카메라 사진/영상·얼굴·원본 마스크·장치 ID/이름을 포함하지 않음. 실제 타 PC 시험과 구분.'};}
}
