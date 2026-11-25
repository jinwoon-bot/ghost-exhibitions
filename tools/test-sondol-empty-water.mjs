import assert from 'node:assert/strict';
import {breathTension, CUT, DEFAULTS, emptyWater, keyboardWind, PHASE, Score, windBands} from '../site/works/sondol-wind-empty-water/score.mjs';
import {LensDrops, lensPose} from '../site/works/sondol-wind-empty-water/lens.mjs';
import {Sound} from '../site/works/sondol-wind-empty-water/sound.mjs';
import {WindDetector} from '../site/works/sondol-wind/wind.mjs';
import {WindInput} from '../site/works/sondol-wind/microphone.mjs';
import {advanceTravel, surfaceFlow} from '../site/works/sondol-wind-empty-water/sea.mjs';

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
assert.deepEqual([...stages],[PHASE.WIND,PHASE.STORM,PHASE.BOAT_LOST,PHASE.AFTERMATH,
  PHASE.EMPTY_WATER,PHASE.RECOVERY,PHASE.CALM]);
assert.equal(score.view.returning,true);
assert.equal(score.view.progression,0);
simulate(score,2,1);
assert.equal(score.state,PHASE.CALM,'continuous input must be released before a second cycle');
simulate(score,.2,0);
simulate(score,.3,1);
assert.equal(score.state,PHASE.WIND);
score.force(PHASE.EMPTY_WATER);
assert.equal(score.cut,CUT.empty);
assert.equal(score.state,PHASE.EMPTY_WATER);
score.settings={...DEFAULTS,autoReset:false};
simulate(score,CUT.end-CUT.empty+5,0);
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
simulate(storm,2,0);
assert.equal(storm.state,PHASE.AFTERMATH);
assert.ok(storm.wind>.8,'the storm persists immediately after input is released');
simulate(storm,5,0);
assert.equal(storm.state,PHASE.EMPTY_WATER);
assert.ok(storm.wind>.08 && storm.wind<.2,'the wind eases over a still moving sea');
assert.ok(emptyWater(storm.cut).haze>.9 && emptyWater(storm.cut).wake>.9);
assert.equal(emptyWater(CUT.end).haze,0);
assert.equal(emptyWater(CUT.end).wake,0);

const sound=new Sound();
const gain=()=>({gain:{setTargetAtTime(value){this.target=value;}}});
sound.context={state:'running',currentTime:0};
sound.beds=gain();
sound.depth=gain();
for(const name of ['calm','near','gale','surf']) sound.loops.set(name,{gain:gain()});
for(const name of ['creak','wash','underwash']) sound.buffers.set(name,{duration:3});
const cues=[];
sound.play=(name,volume,pan)=>cues.push({name,volume,pan});
const audioScore=new Score();
audioScore.force(PHASE.EMPTY_WATER);
for(let i=0;i<380;i++) {
  audioScore.step(.02,0);
  sound.context.currentTime=i*.02;
  sound.update(audioScore.view,DEFAULTS);
}
assert.deepEqual(cues.map(cue=>cue.name),['underwash','creak','creak']);
assert.ok(cues[1].pan>0 && cues[2].pan<0 && cues[2].volume<cues[1].volume);
assert.ok(sound.depth.gain.target>.28 && sound.beds.gain.target<.65);

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
const still=new Score();
assert.equal(breathTension(still.view),0);
simulate(still,4,.6);
const swell=breathTension(still.view);
simulate(still,3,.93);
assert.ok(swell>.2 && breathTension(still.view)>swell*1.9);
simulate(still,3,0);
assert.ok(breathTension(still.view)<.01,'an interrupted breath releases the tension');

const lens=new LensDrops(()=>.4);
for(let i=0;i<80;i++) lens.step(.05,.45);
assert.equal(lens.drops.length,0,'calm and weak wind leave the lens clear');
for(let i=0;i<55;i++) lens.step(.05,1);
assert.ok(lens.drops.length>=2 && lens.drops.length<=8);
const drop=lens.drops[0], previous=lensPose(drop);
for(let i=0;i<15;i++) lens.step(.05,0);
assert.ok(lensPose(drop).y>previous.y && lensPose(drop).stretch>previous.stretch);
for(let i=0;i<120;i++) lens.step(.05,0);
assert.equal(lens.drops.length,0);
console.log('PASS breath-linked tension; lens impact, slide and decay; three wind bands; empty wake and fog; depth audio; mic fallback; '+recoveries+' virtual recoveries.');
