import { writeFile } from 'node:fs/promises';

const rate = 22050;
const output = new URL('../site/works/chang-gwi/exhibit/assets/', import.meta.url);
let state = 6192813;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
}

function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF',0);
  data.writeUInt32LE(data.length-8,4);
  data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20);
  data.writeUInt16LE(1,22);
  data.writeUInt32LE(rate,24);
  data.writeUInt32LE(rate*2,28);
  data.writeUInt16LE(2,32);
  data.writeUInt16LE(16,34);
  data.write('data',36);
  data.writeUInt32LE(samples.length*2,40);
  for (let i=0;i<samples.length;i++) data.writeInt16LE(Math.round(samples[i]*32767),44+i*2);
  return data;
}

const tau = Math.PI * 2;
const room = new Float32Array(rate * 24);
let slow = 0, soft = 0;
for (let i=0;i<room.length;i++) {
  const t=i/rate, white=random()*2-1;
  slow=slow*.994+white*.006;
  soft=soft*.941+white*.059;
  const fade=Math.min(1,i/(rate*.14),(room.length-1-i)/(rate*.14));
  const pressure=.052*Math.sin(tau*41.625*t+.2*Math.sin(tau*.125*t));
  const air=.024*Math.sin(tau*69.75*t)+.010*Math.sin(tau*117.25*t);
  room[i]=pressure+air+fade*(slow*.23+soft*.055);
}
const tear = new Float32Array(Math.round(rate*1.05));
const crackles = Array.from({length:88}, () => ({at:.045+random()*.83, width:.0015+random()*.031, level:.012+random()*.11}));
let low=0,middle=0;
for (let i=0;i<tear.length;i++) {
  const t=i/rate,white=random()*2-1;
  low=low*.92+white*.08;
  middle=middle*.53+white*.47;
  const fiber=crackles.reduce((sum,c)=>{
    const dt=t-c.at;
    return dt>0 && dt<c.width*6 ? sum+c.level*Math.exp(-dt/c.width) : sum;
  },0);
  const rise=Math.min(1,t/.065);
  const tail=Math.min(1,(tear.length-1-i)/(rate*.18));
  const drag=Math.exp(-(((t-.23)/.14)**2))+.58*Math.exp(-(((t-.56)/.21)**2));
  tear[i]=Math.tanh(((middle-low*.78)*(.14*drag+fiber*.74)+low*.16*drag)*.83)*rise*tail;
}
await Promise.all([
  writeFile(new URL('ambient.wav',output),wav(room)),
  writeFile(new URL('hanji-tear.wav',output),wav(tear)),
]);
