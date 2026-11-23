export const APP_VERSION='2.3.1';
export function requestedBackend(effect,selected,override){return override||(effect==='ink'&&selected==='auto'?'cpu':selected);}
export const LIBRARIES={tensorflow:'4.22.0',bodypix:'2.2.0'};
export function localResource(root,relative){
  if(typeof relative!=='string'||!relative||relative.includes('\\')||relative.split('/').includes('..')||/^[a-z]+:|^\//i.test(relative))throw Error('허용되지 않은 리소스 경로: '+relative);
  const url=new URL(relative,root);
  if(url.origin!==new URL(root).origin)throw Error('외부 리소스는 실행 중 사용하지 않습니다.');
  return url.href;
}
export function cameraHelp(error){
  const table={
    NotAllowedError:['permission','카메라 권한이 거부됐습니다. Chrome 주소 왼쪽의 사이트 설정에서 카메라를 허용하고, Windows 개인정보 보호 > 카메라의 데스크톱 앱 사용을 켜세요.'],
    NotFoundError:['missing-camera','연결된 카메라가 없습니다. USB 연결을 확인한 뒤 카메라 목록을 새로고침하세요.'],
    NotReadableError:['busy-camera','카메라를 열 수 없습니다. 카메라를 쓰는 화상회의/카메라 앱을 닫거나 다른 장치를 선택하세요.'],
    OverconstrainedError:['camera-setting','저장된 카메라 설정을 사용할 수 없습니다. 기본 카메라와 자동 해상도로 다시 연결하세요.'],
    SecurityError:['security','Chrome의 HTTPS 또는 localhost 주소에서 실행하고 조직의 카메라 정책을 확인하세요.'],
  };
  const item=table[error?.name];return {code:item?.[0]||error?.code||'camera-error',message:item?.[1]||error?.message||String(error)};
}
export async function permissionState(){try{return (await navigator.permissions.query({name:'camera'})).state;}catch{return '확인 불가';}}
export function webglSupport(){
  try{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');const ok=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();return ok;}catch{return false;}
}
