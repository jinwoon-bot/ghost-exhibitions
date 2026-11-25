import { breathTension, emptyWater, PHASE, windBands } from './score.mjs?v=wet-lens';

const files = {
  calm:'sea-calm.wav', near:'wind-near.wav', gale:'wind-gale.wav', surf:'sea-breakers.wav',
  creak:'ferry-creak.wav', wash:'ferry-wash.wav',
};
const ambient = {calm:'water',surf:'water',near:'wind',gale:'wind'};
const emptyCues = [
  {id:'swell', at:2.8, name:'underwash', volume:.38, pan:.10, rate:.56, cutoff:460},
  {id:'wood-near', at:5.25, name:'creak', volume:.33, pan:.36, rate:.66, cutoff:700},
  {id:'wood-far', at:8.55, name:'creak', volume:.22, pan:-.28, rate:.52, cutoff:320},
];

export class Sound {
  constructor() {
    this.buffers = new Map();
    this.loops = new Map();
    this.active = new Set();
    this.ready = false;
    this.serial = 0;
    this.cutCues = new Set();
  }

  open() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    if (!this.context) {
      const ctx = this.context = new Audio();
      this.master = ctx.createGain();
      this.beds = ctx.createGain();
      this.water = ctx.createGain();
      this.wind = ctx.createGain();
      this.effects = ctx.createGain();
      this.depthFilter = ctx.createBiquadFilter();
      this.depthFilter.type = 'lowpass';
      this.depthFilter.frequency.value = 164;
      this.depth = ctx.createGain();
      this.depth.gain.value = 0;
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -13;
      limit.ratio.value = 9;
      this.master.connect(limit).connect(ctx.destination);
      this.water.connect(this.beds);
      this.wind.connect(this.beds);
      this.beds.connect(this.master);
      this.effects.connect(this.master);
      this.depthFilter.connect(this.depth).connect(this.water);
      this.master.gain.value = this.beds.gain.value = 0;
      this.loading = this.load(ctx);
    }
    this.context.resume().catch(()=>{});
    return this.context;
  }

  async load(ctx) {
    await Promise.allSettled(Object.entries(files).map(async ([name,file])=>{
      const response = await fetch(new URL('../sondol-wind/assets/sound/'+file,import.meta.url));
      if (!response.ok) throw Error(file);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (ctx.state==='closed') return;
      this.buffers.set(name,buffer);
      if (name==='wash') {
        const reversed=ctx.createBuffer(buffer.numberOfChannels,buffer.length,buffer.sampleRate);
        for (let i=0;i<buffer.numberOfChannels;i++) {
          reversed.copyToChannel(buffer.getChannelData(i),i);
          reversed.getChannelData(i).reverse();
        }
        this.buffers.set('underwash',reversed);
      }
      if (ambient[name]) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value=0;
        source.buffer=buffer;
        source.loop=true;
        source.connect(gain).connect(this[ambient[name]]);
        if (name==='calm') source.connect(this.depthFilter);
        source.start();
        this.loops.set(name,{source,gain});
      }
    }));
    this.ready = true;
  }

  play(name,volume,pan=0,offset=0,rate=1,cutoff=null) {
    const ctx=this.context, buffer=this.buffers.get(name);
    if (ctx?.state!=='running' || !buffer || offset>=buffer.duration) return;
    const source=ctx.createBufferSource(), mix=ctx.createGain(), place=ctx.createStereoPanner();
    source.buffer=buffer;
    source.playbackRate.value=rate;
    mix.gain.value=volume;
    place.pan.value=pan;
    source.connect(mix).connect(place);
    const filter=cutoff ? ctx.createBiquadFilter() : null;
    if (filter) {
      filter.type='lowpass';
      filter.frequency.value=cutoff;
      place.connect(filter).connect(this.effects);
    } else place.connect(this.effects);
    this.active.add(source);
    source.onended=()=>{
      this.active.delete(source);
      source.disconnect();
      mix.disconnect();
      place.disconnect();
      filter?.disconnect();
    };
    source.start(0,offset);
  }

  cancel() {
    for (const source of this.active) source.stop();
    this.active.clear();
  }

  update(view,settings) {
    const ctx=this.context;
    if (ctx?.state!=='running') return;
    const now=ctx.currentTime;
    const {breeze,swell,gale}=windBands(view.wind);
    const set=(node,level,time=.14)=>node?.gain.setTargetAtTime(level,now,time);
    set(this.master,settings.muted ? 0 : settings.master);
    set(this.water,settings.water);
    set(this.wind,settings.wind);
    set(this.effects,settings.effects);
    const quiet=view.inCut ? emptyWater(view.cut).quiet : 0;
    const tension=breathTension(view);
    set(this.beds,1-.47*quiet,.40);
    set(this.depth,.38*quiet+.39*tension,.44);
    set(this.loops.get('calm')?.gain,(.80-.32*swell-.19*gale)*(1-.66*quiet),.40);
    set(this.loops.get('near')?.gain,(.30*breeze+.17*swell-.11*gale)*(1-.24*tension),.32);
    set(this.loops.get('gale')?.gain,.59*gale,.38);
    set(this.loops.get('surf')?.gain,.26*swell+.42*gale,.36);
    if (view.serial!==this.serial) {
      this.serial=view.serial;
      this.cutCues.clear();
      this.cancel();
    }
    if (view.state!==this.lastState) {
      if (view.state===PHASE.BOAT_LOST) this.play('wash',.58,.23);
      this.lastState=view.state;
    }
    if (swell>.56 && !view.inCut && view.state!==PHASE.BOAT_LOST && now>(this.nextCreak??0) && this.buffers.has('creak')) {
      this.play('creak',(.19*swell+.12*gale),.21);
      this.nextCreak=now+2.8+Math.random()*1.9;
    }
    if (view.inCut) for (const {id,name,at,volume,pan,rate,cutoff} of emptyCues) {
      if (view.cut<at || this.cutCues.has(id)) continue;
      if (this.buffers.has(name)) {
        this.play(name,volume,pan*(view.returning ? -1 : 1),(view.cut-at)*rate,rate,cutoff);
        this.cutCues.add(id);
      }
    }
  }

  close() {
    this.cancel();
    this.context?.close().catch(()=>{});
  }
}
