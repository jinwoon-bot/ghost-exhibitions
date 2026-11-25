import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Score, STATES, NUMBERS, thresholds, IDLE_RESET_MS } from '../site/works/yagwanggwi/score.mjs';
import { ClapDetector, DEFAULT_CLAP_INTERVAL, DOUBLE_CLAP_WINDOW } from '../site/works/yagwanggwi/clap.mjs';
import { Microphone } from '../site/works/yagwanggwi/microphone.mjs';

const events = [];
const score = new Score((...event) => events.push(event),()=>.4);
for (const time of [950,9000,120000]) score.step(time);
assert.equal(score.state,STATES.IDLE);
assert.equal(events.length,0,'quiet standby does not begin by itself');
let time = 120100;
assert.equal(score.interrupt(time),true);
assert.equal(score.state,STATES.INTERRUPTED);
assert.equal(score.view(time).eyes,1);
assert.equal(score.view(time).hitAge,0);
assert.deepEqual(events.at(-1),['interruption',1,1]);
assert.equal(score.interrupt(time+100),false);
score.step(score.next);
assert.deepEqual(events.at(-1),['count',1,1]);
for (let strike=2;strike<=5;strike++) {
  time += 520;
  assert.equal(score.interrupt(time),true);
  assert.equal(score.view(time).eyes,strike===5 ? 3 : strike>=3 ? 2 : 1);
}
assert.equal(score.state,STATES.REVEAL);
assert.equal(score.interrupt(time+700),false);
score.step(time+2745);
score.step(time+3100);
assert.equal(events.filter(([kind])=>kind==='last-line').length,1);
score.step(score.next);
assert.equal(score.state,STATES.RESET);
assert.equal(score.view(score.entered).returnFrom,STATES.REVEAL);
score.step(score.next);
assert.equal(score.state,STATES.IDLE);
for (let variant=0;variant<6;variant++) {
  time=score.entered+100;
  assert.equal(score.interrupt(time),true);
  score.step(score.next);
  score.step(score.next);
  score.step(score.next);
  assert.equal(score.state,STATES.LUNGE,'one clap finishes the scene');
  assert.equal(score.view(score.entered).variant,variant%3);
  score.step(score.next);
  assert.equal(score.state,STATES.RESET);
  score.step(score.next);
  assert.equal(score.state,STATES.IDLE);
}
time=score.entered+100;
score.interrupt(time);
score.step(time+IDLE_RESET_MS+20);
assert.equal(score.state,STATES.RESET,'unfinished scene expires after inactivity');
score.step(score.next);
assert.equal(score.state,STATES.IDLE);
assert.deepEqual(thresholds({first:8,many:2,final:3}),{first:8,many:9,final:10});

const doubleEvents = [];
const double = new Score(type=>doubleEvents.push(type));
assert.ok(double.interrupt(1000));
assert.equal(double.interrupt(1000+DEFAULT_CLAP_INTERVAL-1),false,'a near echo does not trigger the second clap');
assert.ok(double.interrupt(1000+DOUBLE_CLAP_WINDOW));
assert.equal(double.state,STATES.LUNGE);
assert.deepEqual(doubleEvents,['interruption','lunge']);
assert.equal(double.interrupt(1700),false,'the apparition plays only once');
double.step(double.next);
assert.equal(double.view(double.entered).returnFrom,STATES.LUNGE);
double.step(double.next);
assert.equal(double.state,STATES.IDLE);
assert.ok(double.interrupt(double.entered+100));
assert.equal(double.state,STATES.INTERRUPTED,'the next visitor starts with one eye again');

const meter = [];
const sampleRate = 48000;
const micEvents = [];
const micScore = new Score(type=>micEvents.push(type));
const detector = new ClapDetector(sampleRate, report => {
  if (!report.clap) return;
  const seconds = detector.samples/sampleRate;
  meter.push(seconds);
  micScore.interrupt(seconds*1000);
});
let rng=121;
const short = [1.43, 1.66, 1.79, 2.57];
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
assert.deepEqual(micEvents,['interruption','lunge'],'the first two detected claps trigger the apparition once');
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
const eyes=JSON.parse(await readFile(asset('weave-eyes.json'),'utf8'));
assert.equal(eyes.length,35);
assert.ok(eyes.every(([x,y,w,h])=>x>=645 && y>=249 && x+w<=1015 && y+h<=625));
const mask=await readFile(asset('weave-apertures.png'));
assert.deepEqual([mask.readUInt32BE(16),mask.readUInt32BE(20)],[1672,941]);
const ghost=await readFile(asset('yagwanggwi-lunge.png'));
assert.equal(ghost.toString('ascii',12,16),'IHDR');
assert.equal(ghost[25],6,'the Yagwanggwi layer has an alpha channel');
const clip=await readFile(asset('yagwanggwi-approach.mp4'));
assert.equal(clip.toString('ascii',4,8),'ftyp');
assert.ok(clip.includes('avc1') && clip.includes('mp4a'),'the lunge clip contains H.264 video and AAC audio');
const voice=JSON.parse(await readFile(asset('voice/manifest.json'),'utf8'));
assert.equal(voice.count.length,NUMBERS.length);
assert.equal(voice.reveal,'last-line.wav');
for (const file of [...voice.count,voice.reveal].filter(Boolean)) {
  const wave=await readFile(asset('voice/'+file));
  assert.ok(wave.length>2400 && wave.toString('ascii',0,4)==='RIFF','locally bundled WAV '+file);
}
console.log('PASS one-clap start, three lunge variants, inactivity recovery, five-clap climax, debounce, '+meter.length+' PCM claps (≤56 ms), calibration, 3-hour virtual run ('+cycles+' resets), '+eyes.length+' weave positions, '+voice.count.length+' count WAVs.');
