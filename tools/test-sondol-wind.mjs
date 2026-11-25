import assert from 'node:assert/strict';
import {CUT, DEFAULTS, keyboardWind, PHASE, revealPose, Score, windBands} from '../site/works/sondol-wind/score.mjs';
import {WindDetector} from '../site/works/sondol-wind/wind.mjs';
import {WindInput} from '../site/works/sondol-wind/microphone.mjs';
import {advanceTravel, surfaceFlow} from '../site/works/sondol-wind/sea.mjs';

function simulate(score,seconds,intensity,seen=new Set()) {
  for (let elapsed=0;elapsed<seconds;elapsed+=.02) {
    score.step(.02,intensity);
    seen.add(score.state);
  }
  return seen;
}

const score=new Score();
assert.deepEqual([...simulate(score,45,0)],[PHASE.CALM]);
simulate(score,.22,1);
assert.equal(score.state,PHASE.WIND);
const charge=score.view.progression;
assert.ok(charge===0 && score.wind>.35,'a short input gives a breeze without a storm');
simulate(score,2.3,0);
assert.equal(score.state,PHASE.CALM);
assert.equal(score.view.progression,0);
for (const [intensity,label] of [[.28,'약'],[.58,'중']]) {
  simulate(score,32,intensity);
  assert.equal(windBands(score.wind).label,label);
  assert.equal(score.state,PHASE.WIND);
  assert.equal(score.charge,0);
}
const stages=simulate(score,31,1);
assert.deepEqual([...stages],[PHASE.WIND,PHASE.STORM,PHASE.BOAT_LOST,PHASE.AFTERMATH,PHASE.HAND_REVEAL,
  PHASE.GHOST_REVEAL,PHASE.RECOVERY,PHASE.CALM]);
assert.equal(score.view.returning,true);
assert.equal(score.view.progression,0);
simulate(score,2,1);
assert.equal(score.state,PHASE.CALM,'continuous input must be released before a second cycle');
simulate(score,.2,0);
simulate(score,.3,1);
assert.equal(score.state,PHASE.WIND);
score.force(PHASE.HAND_REVEAL);
assert.equal(score.cut,CUT.hand);
simulate(score,CUT.ghost-CUT.hand+.04,0);
assert.equal(score.state,PHASE.GHOST_REVEAL);
score.settings={...DEFAULTS,autoReset:false};
simulate(score,CUT.end-CUT.ghost+5,0);
assert.equal(score.state,PHASE.RECOVERY);
score.reset();
assert.equal(score.state,PHASE.CALM);

const rate=48000, readings=[];
const detector=new WindDetector(rate,reading=>readings.push(reading));
let seed=361, turbulence=0;
const pcm=new Float32Array(rate*7);
for (let i=0;i<pcm.length;i++) {
  const t=i/rate;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const random=seed/2147483648-1;
  turbulence += (random-turbulence)*.036;
  const speech=t>1.4&&t<2.8 ?
    (.08*Math.sin(t*2*Math.PI*182)+.023*Math.sin(t*2*Math.PI*364)+.025*Math.sin(t*2*Math.PI*546))*(.58+.40*Math.sin(2*Math.PI*4.6*t)**2) : 0;
  const clap=t>3.15&&t<3.19 ? .52*random*Math.exp(-(t-3.15)*46) : 0;
  const gust=t>3.75&&t<5.3 ? (.27*turbulence+.010*random)*(1+.14*Math.sin(t*4)) : 0;
  pcm[i]=.0017*random+speech+clap+gust;
}
for (let i=0;i<pcm.length;i+=128) detector.feed(pcm.subarray(i,i+128));
const selected=(from,to)=>readings.filter((_,i)=>(i+1)*.04>=from && (i+1)*.04<to).map(x=>x.value);
assert.ok(readings.slice(0,27).every(x=>x.calibrating));
assert.ok(Math.max(...selected(1.5,3.5))<.10,'voice and single impulse must not start wind');
assert.ok(Math.max(...selected(3.98,5.25))>.66,'sustained turbulent input must register');
assert.ok(Math.max(...selected(6.2,6.8))<.06,'wind must release after the input stops');
detector.calibrate();
detector.feed(pcm.subarray(4*rate,5*rate));
assert.equal(readings.at(-1).value,0);

Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{
  async getUserMedia(constraints) {
    assert.equal(constraints.video,false);
    throw new DOMException('No device','NotFoundError');
  },
}}});
const mic=new WindInput();
mic.configure(DEFAULTS);
assert.equal(await mic.connect({audioWorklet:{}}),false);
assert.match(mic.label,/마이크를 찾지 못했습니다/);
assert.equal(mic.data.value,0);

const longRun=new Score();
let recoveries=0,last=longRun.state;
for (let i=0;i<=3*60*60*20;i++) {
  const time=i/20;
  const hour=time%54;
  longRun.step(.05,hour>=6 && hour<13 ? .95 : 0);
  if (longRun.state===PHASE.RECOVERY && last!==PHASE.RECOVERY) recoveries++;
  last=longRun.state;
  assert.ok(longRun.view.progression>=0 && longRun.view.progression<=1);
}
assert.ok(recoveries>=185);
const keyboard=new Score(), bands=new Set();
let boatLostAt;
for (let t=.02;t<7;t+=.02) {
  keyboard.step(.02,keyboardWind(t));
  bands.add(windBands(keyboard.wind).label);
  if (keyboard.state===PHASE.BOAT_LOST) boatLostAt??=t;
}
assert.deepEqual([...bands].slice(0,4),['대기','약','중','강']);
assert.ok(boatLostAt>5.95 && boatLostAt<6.18,'keyboard wind loses the boat after about six seconds');
const storm=new Score();
storm.force(PHASE.BOAT_LOST);
for (let i=0;i<380;i++) {
  storm.step(.02,0);
  assert.ok(storm.wind>.87,'the storm persists after the input is released and up to the apparition');
}
assert.equal(storm.state,PHASE.HAND_REVEAL);
simulate(storm,5.9,0);
assert.equal(storm.state,PHASE.GHOST_REVEAL);
assert.ok(storm.wind<.12,'the storm eases during the gaze');
const ghostTimes=[CUT.ghost,CUT.impact-.036,CUT.impact+.08,CUT.ghostHigh];
const poses=ghostTimes.map(time=>revealPose(time).ghost);
assert.equal(poses[0].opacity,0);
assert.equal(poses[1].opacity,0,'ghost is concealed immediately before the impact');
assert.ok(poses[2].opacity>.98 && poses[2].y<.30 && poses[3].width>.67,'the face appears abruptly and surges toward the foreground');
const gaze=revealPose(CUT.ghostHigh+2).ghost;
assert.ok(gaze.opacity>.98 && gaze.width<poses[3].width && gaze.width>.53,'the ghost stops near the camera and holds its gaze');
assert.equal(revealPose(CUT.end).ghost.opacity,0);
assert.ok(revealPose(5).hand.opacity>.7 && revealPose(7.4).hand.opacity===0);

function displacement(depth,wind) {
  const samples=Array.from({length:128},(_,i)=>surfaceFlow(.48,depth,i*.14,wind,0));
  const range=axis=>Math.max(...samples.map(sample=>sample[axis]))-Math.min(...samples.map(sample=>sample[axis]));
  return {x:range('x'),y:range('y')};
}
assert.ok(Object.values(surfaceFlow(.48,0,7,1,0)).every(value=>value===0),'horizon remains fixed');
const depths=[.15,.45,.92];
const calmWaves=depths.map(depth=>displacement(depth,0));
assert.ok(calmWaves.every(({x,y})=>x>.003 && y>.004),'all three layers move without input');
assert.ok(calmWaves[2].x>calmWaves[1].x && calmWaves[1].x>calmWaves[0].x,'parallax grows toward the camera');
assert.ok(depths.every((depth,i)=>displacement(depth,1).y>calmWaves[i].y*3),'wind lifts every layer');
assert.ok(Math.abs(surfaceFlow(.48,.94,30000,0,0).y-surfaceFlow(.48,.94,30000.07,0,0).y)>.0002,'foreground still moves after hours');
const origin={shore:0,water:0};
const drift=advanceTravel(origin,1,0,0);
const gale=advanceTravel(origin,1,1,0);
const stillness=advanceTravel(origin,1,0,1);
assert.ok(drift.shore>.01 && drift.water>drift.shore);
assert.equal(gale.shore,drift.shore);
assert.ok(gale.water>drift.water*2 && stillness.water>0 && stillness.water<drift.water);
const loop=advanceTravel({shore:2.235,water:2.235},1,0,0);
assert.ok(loop.shore>0 && loop.shore<.02 && loop.water>0 && loop.water<.025,'travel phases wrap after the whole plate');
console.log('PASS three wind bands; sustained pre-reveal storm; sudden close apparition; moving parallax; all 8 phases; voice/clap rejection; mic fallback; '+recoveries+' virtual recoveries.');
