import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Score, STATES, NUMBERS, thresholds } from '../site/works/yagwanggwi/score.mjs';
import { ClapDetector } from '../site/works/yagwanggwi/clap.mjs';
import { Microphone } from '../site/works/yagwanggwi/microphone.mjs';

const events = [];
const score = new Score((...event) => events.push(event),()=>.4);
score.step(2850);
assert.equal(score.state,STATES.COUNTING);
assert.deepEqual(events.at(-1),['count',1,0]);
score.step(score.next);
assert.equal(score.count,2);
let time = score.entered + 100;
assert.equal(score.interrupt(time),true);
assert.equal(score.count,0);
assert.equal(score.state,STATES.INTERRUPTED);
assert.equal(score.interrupt(time+100),false);
score.step(score.next);
assert.deepEqual(events.at(-1),['count',1,0]);
for (let strike=2;strike<=7;strike++) {
  time += 1580;
  assert.equal(score.interrupt(time),true);
  assert.equal(score.view(time).eyes,strike===7 ? 3 : strike>=4 ? 2 : 1);
}
assert.equal(score.state,STATES.REVEAL);
assert.equal(score.interrupt(time+700),false);
score.step(time+5555);
score.step(time+6000);
assert.equal(events.filter(([kind])=>kind==='last-line').length,1);
score.step(score.next);
assert.equal(score.state,STATES.RESET);
assert.equal(score.view(score.entered).returnFrom,STATES.REVEAL);
score.step(score.next);
assert.equal(score.state,STATES.IDLE);
for (let n=0;n<NUMBERS.length;n++) { score.step(score.next); assert.equal(score.count,n+1); }
score.step(score.next);
assert.equal(score.state,STATES.SHOE_THEFT);
score.step(score.next);
assert.equal(score.state,STATES.RESET);
score.step(score.next);
assert.equal(score.state,STATES.IDLE);
score.configure({autoReset:false});
score.theft(score.next);
score.step(score.next);
score.step(score.next);
assert.equal(score.state,STATES.RESET,'operator can hold the settled scene');
score.reset(score.next + 100);
assert.equal(score.state,STATES.IDLE);
assert.deepEqual(thresholds({first:8,many:2,final:3}),{first:8,many:9,final:10});

const meter = [];
const sampleRate = 48000;
const detector = new ClapDetector(sampleRate, report => { if (report.clap) meter.push(detector.samples/sampleRate); });
let rng=121;
const short = [1.43, 1.93, 2.06, 2.57];
const signal = new Float32Array(sampleRate*5);
for (let i=0;i<signal.length;i++) {
  const t=i/sampleRate;
  rng=(Math.imul(rng,1664525)+1013904223)>>>0;
  const noise=rng/2147483648-1;
  const speech = t>3 ? Math.min(1,(t-3)*6) * (.079*Math.sin(t*2*Math.PI*172)+.023*Math.sin(t*2*Math.PI*490)) : 0;
  const music = .012*Math.sin(t*2*Math.PI*86)*(.5+.5*Math.sin(t*11));
  let clap = 0;
  for (const onset of short) {
    const age = t-onset;
    if (age>=0 && age<.038) clap += noise*.66*Math.exp(-age*93)*Math.min(1,age*1100);
  }
  signal[i] = noise*.004+music+speech+clap;
}
for (let i=0;i<signal.length;i+=128) detector.push(signal.subarray(i,i+128));
assert.equal(meter.length,3,'three distinct transients, with the close duplicate rejected');
for (const [event,hit] of [short[0],short[1],short[3]].entries()) {
  assert.ok(meter[event]-hit<.056 && meter[event]>=hit,'clap acknowledged promptly');
}
detector.calibrate();
detector.push(signal.subarray(sampleRate*1.4,sampleRate*2.52));
assert.equal(meter.length,3,'recalibration ignores incoming test hits');

Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{
  async getUserMedia(constraints) {
    assert.equal(constraints.video,false);
    assert.equal(constraints.audio.autoGainControl,false);
    throw new DOMException('no microphone','NotFoundError');
  },
}}});
globalThis.window = {isSecureContext:true};
const absentMic = new Microphone(()=>assert.fail('no phantom clap'),()=>{});
assert.equal(await absentMic.start({audioWorklet:{}},''),false);
assert.match(absentMic.status,/마이크 장치를 찾을 수 없습니다/);
assert.match(absentMic.status,/Space/);
assert.equal(absentMic.level,0);

let cycles=0;
const longRun = new Score(type => { if (type==='reset') cycles++; },()=>.51);
for (let t=0;t<=3*60*60*1000;t+=60) {
  const period = t%120000;
  if (period>=54000 && period<=58800 && period%600===0) longRun.interrupt(t);
  longRun.step(t);
  assert.ok(longRun.interruptions.length<=longRun.settings.final);
}
assert.ok(cycles>=90,'independent scenes reset repeatedly throughout the virtual shift');
const asset = name => new URL('../site/works/yagwanggwi/assets/'+name,import.meta.url);
const holes=JSON.parse(await readFile(asset('apertures.json'),'utf8'));
assert.equal(holes.length,51);
assert.ok(holes.every(([x,y,w,h])=>x>=650 && y>=246 && x+w<=1013 && y+h<=622));
const voice=JSON.parse(await readFile(asset('voice/manifest.json'),'utf8'));
assert.equal(voice.count.length,NUMBERS.length);
assert.equal(voice.reveal,'last-line.wav');
for (const file of [...voice.count,voice.reveal].filter(Boolean)) {
  const wave=await readFile(asset('voice/'+file));
  assert.ok(wave.length>2400 && wave.toString('ascii',0,4)==='RIFF','locally bundled WAV '+file);
}
console.log('PASS score transitions, debounce, '+meter.length+' PCM claps (≤56 ms), calibration, 3-hour virtual run ('+cycles+' resets), '+holes.length+' aligned apertures, '+voice.count.length+' count WAVs.');
