export function liveStatus({mode,cameraLive,modelReady,active,people,lastResultAt,now,inferMs,error,recovering}){
 if(mode==='idle')return {stage:'idle',camera:'입력 대기',ai:'분석 대기',audience:'인식 대기',ready:false};
 const camera=mode==='video'?'영상 점검 · 실제 카메라 아님':cameraLive?'실제 카메라 수신 중':'카메라 입력 확인 필요';
 if(mode==='camera'&&!cameraLive)return {stage:'camera',camera,ai:'실제 입력 대기',audience:'판정 보류',ready:false};
 if(recovering||!modelReady)return {stage:recovering||error?'recovering':'loading',camera,ai:recovering?'인물 분리 자동 복구 중':'인물 분리 준비 중',audience:'판정 보류',ready:false};
 const fresh=lastResultAt>0&&now-lastResultAt<Math.max(2200,Math.min(6000,inferMs*4));
 if(!active||!fresh)return {stage:'waiting-ai',camera,ai:error?'인물 분리 복구 필요':'분석 결과 대기',audience:'판정 보류',ready:false};
 return {stage:'ready',camera,ai:'인물 분리 작동',audience:people?`${people}인 감지 · 움직임에 따라 잔상 생성`:'관객 대기',ready:true};
}
