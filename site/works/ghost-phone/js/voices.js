import {validateGhosts,clamp} from './core.js?v=4.2.0';
export const providers=Object.freeze({
  elevenlabs:{name:'ElevenLabs',models:['eleven_v3','eleven_multilingual_v2','eleven_flash_v2_5'],stream:true,design:true,note:'한국어 / 계정 Voice ID 필요. 발성 태그는 v3에서만 선택 적용.'},
  fish:{name:'Fish Audio',models:['s2.1-pro','s2.1-pro-free','s2-pro'],stream:true,design:false,note:'한국어 자동 감지 / reference_id 필요. 복제·디자인은 공식 웹에서 권리 확인 후 ID 등록.'},
  custom:{name:'운영자 TTS 게이트웨이',models:[],stream:false,design:false,note:'서버에 고정한 HTTPS 어댑터만 허용.'}
});
export const criteria=['한국어 발음','사람 같은 연기','속삭임·호흡','섬세한 감정','공포 분위기','전화선 적합성'];
export const effectPresets={clean:{label:'Clean',mix:0,noise:0,drive:1,tremolo:0,clarity:0,before:0,after:0},old:{label:'Old Telephone',mix:1,noise:.008,drive:1.12,tremolo:.012,clarity:1.5,before:180,after:200},haunted:{label:'Haunted Telephone',mix:1,noise:.016,drive:1.3,tremolo:.04,clarity:1,before:380,after:550},spirit:{label:'Distorted Spirit',mix:1,noise:.014,drive:1.5,tremolo:.035,clarity:1.2,before:500,after:650}};
const idOK=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);
export function migrateVoices(input){
  const c=validateGhosts(structuredClone(input));
  if(c.version!==2){c.version=2;c.revision='2026-11-14-studio-a';}
  for(const g of c.ghosts){
    g.candidates??=[
      {id:g.id+'-a',name:'A · 가까운 속삭임',provider:g.provider||'elevenlabs',model:g.model||'eleven_v3',voiceId:g.voiceId||'',style:g.style,designPrompt:g.style,enabled:true,rate:g.rate},
      {id:g.id+'-b',name:'B · 감정을 누른 목소리',provider:'elevenlabs',model:'eleven_v3',voiceId:'',style:g.style,designPrompt:g.style,enabled:true,rate:.9},
      {id:g.id+'-c',name:'C · Fish 비교 후보',provider:'fish',model:'s2.1-pro',voiceId:'',style:g.style,designPrompt:g.style,enabled:true,rate:1}
    ];
    g.preferred??=g.candidates[0].id;g.mp3Order??='random';
  }return validateVoices(c);
}
export function validateVoices(c){
  validateGhosts(c);if(c.version!==2||typeof c.revision!=='string'||c.revision.length>100)throw Error('V2 설정 버전을 확인하세요.');
  const candidateIds=new Set();for(const g of c.ghosts){
    if(!Array.isArray(g.candidates)||!g.candidates.length||g.candidates.length>12)throw Error('귀신별 목소리 후보는1~12개입니다.');
    for(const p of g.candidates){
      if(!idOK(p.id)||candidateIds.has(p.id))throw Error('목소리 후보 ID 중복/형식 오류');candidateIds.add(p.id);
      if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!providers[p.provider])throw Error('후보 이름/제공자를 확인하세요.');
      if(typeof p.model!=='string'||p.model.length>100||p.provider!=='custom'&&!providers[p.provider].models.includes(p.model))throw Error('지원되는 모델을 선택하세요.');
      if(typeof p.voiceId!=='string'||p.voiceId.length>100||p.voiceId&&!idOK(p.voiceId))throw Error('Voice ID 형식을 확인하세요.');
      if(typeof p.style!=='string'||p.style.length>1200||typeof p.designPrompt!=='string'||p.designPrompt.length>1000)throw Error('스타일/디자인 지시 길이를 확인하세요.');
      if(p.recordId&&!idOK(p.recordId))throw Error('음원 ID 형식 오류');
      p.rate=clamp(p.rate??g.rate,.7,1.2);p.stability=clamp(p.stability??.5,0,1);p.similarity=clamp(p.similarity??.65,0,1);p.styleAmount=clamp(p.styleAmount??.08,0,1);
      p.enabled=!!p.enabled;p.streaming=!!p.streaming;p.delivery=p.delivery||'plain';if(!['plain','whisper','restrained'].includes(p.delivery))throw Error('발성 태그 오류');
    }
    if(!g.candidates.some(p=>p.id===g.preferred))g.preferred=g.candidates[0].id;
    if(!['random','sequence'].includes(g.mp3Order))g.mp3Order='random';
    for(const l of g.lines)if(l.designText&&(typeof l.designText!=='string'||l.designText.length>1000||l.designText.length<100))throw Error('Voice Design 미리듣기 대사는100~1000자입니다.');
  }return c;
}
export function candidateFor(g,id){return g.candidates?.find(p=>p.enabled&&p.id===(id||g.preferred));}
export function sourceFor(g,settings,records=[],picker){
  const preferred=candidateFor(g),available=new Set(records.filter(r=>r.ghostId===g.id&&!r.mock&&r.enabled!==false).map(r=>r.id));
  if(settings.mode==='random'){
    const items=g.candidates.filter(p=>p.enabled&&(p.voiceId||available.has(p.recordId)));
    if(!items.length)return {mode:'mp3'};const p=picker.pick(items,g.id+':candidate');return {mode:available.has(p.recordId)?'mp3':'ai',candidate:p,recordId:available.has(p.recordId)?p.recordId:undefined};
  }
  if(settings.mode==='hybrid')return {mode:preferred?.recordId&&available.has(preferred.recordId)||!preferred?.voiceId&&records.some(r=>r.ghostId===g.id&&!r.mock&&r.enabled!==false)?'mp3':'ai',candidate:preferred,recordId:available.has(preferred?.recordId)?preferred.recordId:undefined};
  return {mode:settings.mode,candidate:preferred,recordId:settings.mode==='mp3'&&available.has(preferred?.recordId)?preferred.recordId:undefined};
}
export const textHash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function validateScores(scores){if(!Array.isArray(scores)||scores.length!==6||scores.some(v=>v!==null&&(!Number.isInteger(v)||v<1||v>5)))throw Error('평가는 비워 두거나1~5점으로 직접 입력하세요.');return scores;}
export class VoiceProvider {constructor(id){this.id=id;}async generate(){throw Error('구현되지 않은 VoiceProvider');}async listVoices(){return [];}async design(){throw Error('이 제공자는 앱 내 Voice Design을 지원하지 않습니다.');}}
export class SecureVoiceProvider extends VoiceProvider {
  constructor(id,client){super(id);this.client=client;}
  async generate(ids,options){return this.client.audio('tts',{...ids},options);}
  async listVoices(library=false,search=''){return this.client.json('admin/voices?provider='+this.id+'&library='+(library?'1':'0')+'&search='+encodeURIComponent(search));}
  async design(ids,options){if(!providers[this.id]?.design)return super.design();return this.client.json('admin/design',{method:'POST',body:ids,...options});}
}
