// 파일 더블클릭/모듈 실패를 무반응 시작 버튼으로 남겨두지 않는다.
(() => {
  const status = document.getElementById('startupStatus');
  const buttons = ['startCamera','startDemo'].map(id => document.getElementById(id));
  const fail = text => { status.textContent = text; buttons.forEach(b => b.disabled = true); };
  if (location.protocol === 'file:') {
    fail('카메라를 사용하려면 GitHub Pages 또는 localhost 주소로 이 작품을 열어주세요.');
    return;
  }
  let ready = false;
  const timer = setTimeout(() => {
    if (!ready) fail('전시 코드를 불러오지 못했습니다. 작품 폴더를 통째로 준비하고 페이지를 새로고침해 주세요.');
  },12000);
  document.addEventListener('gogwan-app-ready',()=>{ready=true;clearTimeout(timer);},{once:true});
  const script = document.createElement('script');
  script.type='module';script.src='./script.js?v=2.3.1';
  script.onerror=()=>{clearTimeout(timer);fail('전시 코드가 없습니다. index.html과 script.js, lib 폴더를 함께 복사하고 실행 파일로 다시 열어주세요.');};
  document.body.append(script);
})();
