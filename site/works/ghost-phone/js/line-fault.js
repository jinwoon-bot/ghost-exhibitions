// Local PCM processing: preserve the spoken samples, add one deliberate broken-line pause.
// No microphone, network, inference, voice cloning or pitch shift.
const ids=['songaksi','mongdal','changgwi','gogwandaemyeon','yeopjeon','seongju'];
const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
export function lineProfile(actor,scene='answer',controls={}){
 const index=ids.indexOf(actor);if(index<0||!['answer','hesitate','return'].includes(scene))throw Error('전화선 연출 대상이 올바르지 않습니다.');
 const noise=controls.noise??.55,gap=controls.gap??1.6;if(!Number.isFinite(noise)||noise<0||noise>1||!Number.isFinite(gap)||gap<.6||gap>4)throw Error('노이즈·정적 범위를 확인하세요.');
 return {actor,scene,seed:3917+index*613,ratio:scene==='return'?.40:scene==='hesitate'?.62:.53,gap:bound(gap+(scene==='return'?1.1:scene==='hesitate'?.65:0)+(actor==='gogwandaemyeon'?.35:0),.6,5),noise:noise*.007,band:scene==='return'?2300:scene==='hesitate'?2650:3100,quantizeBits:scene==='return'?8:10};
}
export function findBreak(channels,rate,ratio=.53){
 const n=channels[0]?.length;if(!n||!Number.isFinite(rate)||rate<8000||rate>192000||channels.some(c=>c.length!==n))throw Error('음원 형식 확인 실패');
 const target=Math.round(n*ratio),radius=Math.min(Math.round(rate*.65),Math.round(n*.14)),step=Math.max(1,Math.round(rate*.01)),win=Math.round(rate*.012);
 let best=bound(target,Math.round(n*.2),Math.round(n*.8)),score=Infinity;
 for(let i=Math.max(win,target-radius);i<Math.min(n-win,target+radius);i+=step){let energy=0;for(let j=i-win;j<i+win;j++){let mono=0;for(const c of channels)mono+=c[j]/channels.length;energy+=mono*mono;}energy/=win*2;const weighted=energy*(1+Math.abs(i-target)/Math.max(1,radius)*.4);if(weighted<score){score=weighted;best=i;}}
 return {sample:best,seconds:best/rate,rms:Math.sqrt(Math.max(0,score)),linguisticBoundaryVerified:false};
}
export function renderLineFault(channels,rate,p,bed=[]){
 const cut=findBreak(channels,rate,p.ratio),n=channels[0].length,gap=Math.round(p.gap*rate),fade=Math.max(1,Math.round(rate*.008));
 if(n/rate>24||channels.length>2||!channels.length)throw Error('짧은 모노/스테레오 대사만 처리합니다.');
 const noise=new Float32Array(n);let seed=p.seed,lowNoise=0,previous=0;
 for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=(seed/4294967296)*2-1;lowNoise+=.12*(white-lowNoise);noise[i]=(lowNoise-previous*.8);previous=lowNoise;}
 const result=channels.map((source,ch)=>{
  const out=new Float32Array(n+gap),bedChannel=bed[ch]||bed[0],hpRC=rate/(2*Math.PI*220),hpA=hpRC/(hpRC+1),lpA=1-Math.exp(-2*Math.PI*p.band/rate),reconA=1-Math.exp(-2*Math.PI*3300/rate),steps=2**(p.quantizeBits-1);
  let hp=0,last=0,lp=0,held=0,recon=0,clock=-1;
  for(let i=0;i<n;i++){
   const x=Number.isFinite(source[i])?source[i]:0;hp=hpA*(hp+x-last);last=x;lp+=lpA*(hp-lp);
   const tick=Math.floor(i*8000/rate);if(tick!==clock){clock=tick;held=Math.round(lp*steps)/steps;}recon+=reconA*(held-recon);
   const near=bound(1-Math.abs(i-cut.sample)/(rate*.65),0,1),degrade=.38+.52*near;
   const progress=i<cut.sample?bound((i-cut.sample+rate*.45)/(rate*.45),0,1):bound(1-(i-cut.sample)/(rate*.65),0,1);
   const crackle=progress*progress*noise[i]*p.noise*3.5;
   let value=((1-degrade)*x+degrade*recon)*.88+noise[i]*p.noise+crackle+(bedChannel?.length?bedChannel[i%bedChannel.length]*.16:0);
   let envelope=1;if(i<cut.sample&&i>=cut.sample-fade)envelope=(cut.sample-i)/fade;if(i>=cut.sample&&i<cut.sample+fade)envelope=(i-cut.sample)/fade;
   envelope*=Math.min(1,i/fade,(n-1-i)/fade);value=bound(value*envelope,-.79,.79);
   out[i<cut.sample?i:i+gap]=value;
  }
  return out;
 });
 return {channels:result,metadata:{...p,sourceSeconds:n/rate,seconds:(n+gap)/rate,cutSeconds:cut.seconds,gapSeconds:gap/rate,silenceStartSample:cut.sample,silenceEndSample:cut.sample+gap,linguisticBoundaryVerified:false,pitchShift:0,spokenSamplesDiscarded:0}};
}
export function prepareLineFault({channels,rate,p,bed=[],signal,WorkerClass=globalThis.Worker,timeoutMs=8000}){
 if(signal?.aborted)return Promise.reject(new DOMException('취소됨','AbortError'));
 if(!WorkerClass)return Promise.reject(Error('전화선 효과의 별도 처리 기능이 없습니다. 최신 Chrome을 사용하세요.'));
 return new Promise((resolve,reject)=>{
  const worker=new WorkerClass(new URL('./line-fault-worker.js',import.meta.url),{type:'module'});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(value);};
  const cancel=()=>finish(new DOMException('취소됨','AbortError')),timer=setTimeout(()=>finish(Error('전화선 음원 준비 시간 초과')),timeoutMs);signal?.addEventListener('abort',cancel,{once:true});
  worker.onmessage=e=>e.data?.error?finish(Error(e.data.error)):finish(null,e.data);
  worker.onerror=()=>finish(Error('전화선 효과 파일을 읽지 못했습니다. 로컬 실행 경로를 확인하세요.'));
  const voice=channels.map(c=>c.slice()),world=bed.map(c=>c.slice());
  worker.postMessage({channels:voice,rate,p,bed:world},[...voice,...world].map(c=>c.buffer));
 });
}
export async function playFault(ctx,bytes,{actor,scene,controls,bed,signal,volume=.35,onStart,onLineEvent}={}){
 const check=()=>{if(signal?.aborted)throw new DOMException('취소됨','AbortError');};check();
 const buffer=await ctx.decodeAudioData(bytes.slice(0));check();const begun=performance.now();
 const rendered=await prepareLineFault({channels:Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),rate:buffer.sampleRate,p:lineProfile(actor,scene,controls),bed:bed?Array.from({length:bed.numberOfChannels},(_,i)=>bed.getChannelData(i)):[],signal});check();const copied=performance.now();
 const prepared=ctx.createBuffer(rendered.channels.length,rendered.channels[0].length,buffer.sampleRate);rendered.channels.forEach((c,i)=>prepared.copyToChannel(c,i));rendered.metadata.mainThreadCopyMs=performance.now()-copied;rendered.metadata.preparationMs=performance.now()-begun;check();
 return new Promise((resolve,reject)=>{
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=prepared;gain.gain.value=bound(volume,0,.5);source.connect(gain).connect(ctx.destination);let done=false;const timers=[];
  const finish=error=>{if(done)return;done=true;timers.forEach(clearTimeout);signal?.removeEventListener('abort',cancel);source.onended=null;gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setTargetAtTime(0,ctx.currentTime,.003);try{source.stop(ctx.currentTime+.015);}catch{}setTimeout(()=>{source.disconnect();gain.disconnect();},25);error?reject(error):resolve(rendered.metadata);};
  const cancel=()=>finish(new DOMException('취소됨','AbortError'));signal?.addEventListener('abort',cancel,{once:true});source.onended=()=>finish();source.start();onStart?.(rendered.metadata);
  timers.push(setTimeout(()=>{if(!done)onLineEvent?.('silence',rendered.metadata);},rendered.metadata.cutSeconds*1000));
  timers.push(setTimeout(()=>{if(!done)onLineEvent?.('return',rendered.metadata);},(rendered.metadata.cutSeconds+rendered.metadata.gapSeconds)*1000));
 });
}
