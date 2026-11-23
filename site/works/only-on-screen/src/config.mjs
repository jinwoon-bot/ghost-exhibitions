export const DEFAULTS = Object.freeze({
  mirror: true, cameraId: '', cameraWidth: 1280, aspect: 'source', quality: 'auto',
  monochrome:true, cameraAlways:true, hideUI:true,
  sensitivity: 0.55, turnAngle: 30, turnHold: 0.5, frontHold: 0.55,
  firstDelay: 6, approachSpeed: 1, probability: 1,
  ghostX: 0, ghostY: 0, ghostScale: 1, floor: 0.91,
  maskThreshold: 0.28, maskExpand: 2, maskDebug: false,
  sound: false, volume: 0.18, delegate: 'CPU'
});
const limits = {cameraWidth:[320,1920],sensitivity:[0,1],turnAngle:[15,65],turnHold:[0.25,2],frontHold:[0.3,2],firstDelay:[2,40],approachSpeed:[0.35,2],probability:[0,1],ghostX:[-0.3,0.3],ghostY:[-0.25,0.25],ghostScale:[0.5,1.7],floor:[0.45,1],maskThreshold:[0.1,0.75],maskExpand:[0,5],volume:[0,0.6]};
export function sanitize(input={}) {
  const c={...DEFAULTS};
  for (const key of Object.keys(c)) {
    if (limits[key]) { const n=Number(input[key]); if(Number.isFinite(n))c[key]=Math.max(limits[key][0],Math.min(limits[key][1],n)); }
    else if(typeof c[key]==='boolean'&&typeof input[key]==='boolean')c[key]=input[key];
    else if(typeof input[key]==='string')c[key]=input[key].slice(0,200);
  }
  if(!['source','4:3','16:9'].includes(c.aspect))c.aspect='source';
  if(!['auto','low','normal','high'].includes(c.quality))c.quality='auto';
  if(!['CPU','GPU'].includes(c.delegate))c.delegate='CPU';
  return c;
}
export function loadConfig(){try{const saved=localStorage.getItem('only-screen-v2');if(saved)return sanitize(JSON.parse(saved));const prior=JSON.parse(localStorage.getItem('only-screen-v1'))||{};return sanitize({...prior,aspect:'source',hideUI:true,cameraAlways:true});}catch{return {...DEFAULTS};}}
export function saveConfig(c){try{localStorage.setItem('only-screen-v2',JSON.stringify(sanitize(c)));return true;}catch{return false;}}
export const PRESETS={low:{width:320,hz:8,render:800},normal:{width:480,hz:12,render:1120},high:{width:640,hz:15,render:1440}};
