import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [exhibit, scratch] = process.argv.slice(2);
const rate = 22050;
const envelopeRate = 25;
const news = JSON.parse(await readFile(join(exhibit, 'program.json'), 'utf8'));

function decode(wav) {
  let format, data;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const type = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4), start = offset + 8;
    if (type === 'fmt ') format = wav.subarray(start, start + size);
    if (type === 'data') data = wav.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !data || format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1 ||
      format.readUInt32LE(4) !== rate || format.readUInt16LE(14) !== 16) {
    throw Error('Expected 22.05 kHz signed 16 bit mono PCM.');
  }
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return samples;
}

function encode(samples) {
  const wav = Buffer.alloc(44 + samples.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) => wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2));
  return wav;
}

function master(samples) {
  const first = Math.max(0, samples.findIndex(value => Math.abs(value) > .016) - .06 * rate);
  const last = Math.min(samples.length, samples.findLastIndex(value => Math.abs(value) > .016) + .11 * rate);
  if (last <= first) throw Error('A dialogue clip is empty.');
  const clip = samples.slice(first, last);
  let sum = 0, count = 0;
  for (const value of clip) {
    if (Math.abs(value) > .022) { sum += value ** 2; count++; }
  }
  const gain = Math.max(.5, Math.min(3.2, .15 / Math.sqrt(sum / count)));
  const ramp = rate * .022;
  return clip.map((sample, i) => {
    const fade = Math.min(1, i / ramp, (clip.length - 1 - i) / ramp);
    return Math.tanh(sample * gain * 1.38) * .69 * fade;
  });
}

const clips = await Promise.all(news.map(async (_, i) => master(decode(await readFile(join(scratch, 'news-' + i + '.wav'))))));
const gap = Math.round(rate * .71), opener = Math.round(rate * .35);
const samples = new Float32Array(opener + clips.reduce((sum, clip) => sum + clip.length + gap, 0));
let cursor = opener;
const stories = clips.map((clip, i) => {
  const start = i ? (cursor - gap * .28) / rate : 0;
  samples.set(clip, cursor);
  cursor += clip.length + gap;
  return { start: +start.toFixed(3), headline: news[i].headline };
});

const envelope = [];
let smoothed = 0;
for (let i = 0; i < samples.length; i += rate / envelopeRate) {
  let sum = 0, count = 0;
  for (let j = Math.floor(i); j < Math.min(samples.length, i + rate * .048); j++) {
    sum += samples[j] ** 2;
    count++;
  }
  const target = Math.min(1, Math.sqrt(sum / count) * 5.6);
  smoothed += (target - smoothed) * (target > smoothed ? .76 : .43);
  envelope.push(Math.round(smoothed * 255));
}
const data = { duration: samples.length / rate, envelopeRate, stories, envelope };
await writeFile(join(exhibit, 'assets/news.wav'), encode(samples));
await writeFile(join(exhibit, 'assets/news.json'), JSON.stringify(data) + '\n');
console.log('News program: ' + data.duration.toFixed(2) + ' seconds, ' + stories.length + ' stories.');
