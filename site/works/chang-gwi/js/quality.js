export const PERFORMANCE = Object.freeze({
  low: {label:'저사양 컴퓨터',model:'mobile',inputSize:320,quality:'high',inferFps:3,maxClones:12,lifetimeScale:.75,particleBudget:300,renderScale:.6},
  normal: {label:'일반 컴퓨터',model:'resnet',inputSize:480,quality:'high',inferFps:8,maxClones:24,lifetimeScale:1,particleBudget:750,renderScale:.85},
  high: {label:'고성능 전시 컴퓨터',model:'resnet',inputSize:640,quality:'high',inferFps:12,maxClones:40,lifetimeScale:1,particleBudget:1200,renderScale:1},
});
const order=['low','normal','high'];
export function inheritManual(settings,p){return {...settings,performance:'custom',inputSize:p.inputSize,aiModel:p.model,aiQuality:p.quality,inferFps:p.inferFps,renderScale:p.renderScale,particleBudget:p.particleBudget,lifeScale:p.lifetimeScale,maxClones:Math.min(settings.maxClones,p.maxClones)};}
export class QualityController {
  constructor(){this.level='normal';this.ceiling=2;this.lastChange=0;this.bad=0;this.good=0;this.reason='일반 품질에서 자동 측정';}
  observe({now,inferMs,fps,renderMs,backend},automatic=true){
    if(!automatic||!Number.isFinite(inferMs)||inferMs<=0)return false;
    if((backend==='cpu'||backend==='wasm')&&this.level!=='low'){this.level='low';this.reason='CPU 대체 경로에 맞춰 부하 감소';this.lastChange=now;this.bad=this.good=0;return true;}
    if(now-this.lastChange<5000)return false;
    const bad=inferMs>350||fps<42||renderMs>15;
    const good=inferMs<105&&fps>55&&renderMs<6&&backend!=='cpu'&&backend!=='wasm';
    this.bad=bad?this.bad+1:0;this.good=good?this.good+1:0;
    const i=order.indexOf(this.level);
    if(this.bad>=2&&i>0){if(inferMs>350&&i===1)this.ceiling=0;this.level=order[i-1];this.reason='추론/렌더 지연이 지속되어 품질 낮춤';this.lastChange=now;this.bad=this.good=0;return true;}
    if(this.good>=6&&i<2&&i<this.ceiling){this.level=order[i+1];this.reason='30초간 성능 여유를 확인해 품질 높임';this.lastChange=now;this.bad=this.good=0;return true;}
    return false;
  }
  profile(settings){
    if(settings.performance==='custom')return {label:'수동 조절',model:settings.aiModel,inputSize:settings.inputSize,quality:settings.aiQuality,inferFps:settings.inferFps,maxClones:settings.maxClones,lifetimeScale:settings.lifeScale,particleBudget:settings.particleBudget,renderScale:settings.renderScale};
    return {...PERFORMANCE[settings.performance==='auto'?this.level:settings.performance]};
  }
  effective(settings){const p=this.profile(settings);return {...settings,maxClones:Math.min(settings.maxClones,p.maxClones),lifetime:settings.lifetime*p.lifetimeScale,particleBudget:p.particleBudget};}
}
