(() => {
 const status=document.getElementById('setupStatus');
 const fail=text=>{status.textContent=text;for(const id of ['startCamera','startDemo','setupCheck'])document.getElementById(id).disabled=true;};
 if(location.protocol==='file:'){fail('index.html 직접 열기는 지원하지 않습니다. 압축을 모두 푼 뒤 00_전시시작.cmd를 실행하거나 Chrome에서 온라인 전시 URL을 여세요.');return;}
 let ready=false;const timer=setTimeout(()=>{if(!ready)fail('실행 코드를 읽지 못했습니다. js 폴더 누락/배포 경로를 확인하고 시작 파일로 다시 실행하세요.');},12000);
 document.addEventListener('chang-gwi-ready',()=>{ready=true;clearTimeout(timer);},{once:true});
 const script=document.createElement('script');script.type='module';script.src=new URL('./app.js',document.currentScript.src).href;script.onerror=()=>{clearTimeout(timer);fail('앱 코드를 불러오지 못했습니다. 배포 파일과 js/app.js 경로를 확인하세요.');};document.body.append(script);
})();
