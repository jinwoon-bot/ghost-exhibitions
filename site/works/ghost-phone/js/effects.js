import {effectPresets} from './voices.js?v=4.2.0';import {clamp} from './core.js?v=4.2.0';
export class EffectChain {
  constructor(ctx,destination,{volume=.35,preset='old',noise}={}){
    this.ctx=ctx;this.nodes=[];const add=n=>(this.nodes.push(n),n);
    this.input=add(ctx.createGain());this.dry=add(ctx.createGain());this.wet=add(ctx.createGain());this.hp=add(ctx.createBiquadFilter());this.lp=add(ctx.createBiquadFilter());this.eq=add(ctx.createBiquadFilter());this.drive=add(ctx.createGain());this.shape=add(ctx.createWaveShaper());this.mod=add(ctx.createGain());this.limit=add(ctx.createDynamicsCompressor());this.master=add(ctx.createGain());this.hissGain=add(ctx.createGain());
    this.hp.type='highpass';this.hp.frequency.value=300;this.lp.type='lowpass';this.lp.frequency.value=3300;this.eq.type='peaking';this.eq.frequency.value=1700;this.eq.Q.value=.9;
    const curve=new Float32Array(2048);for(let i=0;i<curve.length;i++){const x=i/1023.5-1;curve[i]=Math.tanh(x);}this.shape.curve=curve;this.shape.oversample='2x';
    this.limit.threshold.value=-18;this.limit.knee.value=12;this.limit.ratio.value=12;this.limit.attack.value=.003;this.limit.release.value=.15;this.master.gain.value=clamp(volume,0,.65);
    this.dry.gain.value=0;this.wet.gain.value=0;this.hissGain.gain.value=0;
    this.input.connect(this.dry).connect(this.limit);this.input.connect(this.hp).connect(this.lp).connect(this.eq).connect(this.drive).connect(this.shape).connect(this.mod).connect(this.wet).connect(this.limit);this.limit.connect(this.master).connect(destination);
    this.lfo=add(ctx.createOscillator());this.depth=add(ctx.createGain());this.depth.gain.value=0;this.lfo.frequency.value=.83;this.lfo.connect(this.depth).connect(this.mod.gain);this.lfo.start();
    const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),v=buffer.getChannelData(0);for(let i=0;i<v.length;i++)v[i]=Math.random()*2-1;this.hiss=add(ctx.createBufferSource());this.hiss.buffer=buffer;this.hiss.loop=true;this.hissFilter=add(ctx.createBiquadFilter());this.hissFilter.type='bandpass';this.hissFilter.frequency.value=1500;this.hiss.connect(this.hissFilter).connect(this.hissGain).connect(this.limit);this.hiss.start();this.noiseOverride=noise;this.set(preset);
  }
  set(preset,overrides={}){
    const p={...(effectPresets[preset]||effectPresets.old),...overrides},t=this.ctx.currentTime;this.preset=preset;
    const set=(node,v)=>{node.cancelScheduledValues(t);node.setTargetAtTime(v,t,.025);};set(this.dry.gain,1-p.mix);set(this.wet.gain,p.mix);set(this.depth.gain,p.tremolo);set(this.mod.gain,1-p.tremolo);set(this.eq.gain,clamp(p.clarity,-3,4));
    set(this.hissGain.gain,p.mix?clamp(this.noiseOverride??p.noise,0,.035):0);set(this.drive.gain,p.drive);
    if(preset==='spirit'){// Brief, bounded emphasis; never an amplitude jump or a scream.
      this.drive.gain.linearRampToValueAtTime(p.drive,t+1.5);this.drive.gain.linearRampToValueAtTime(3.4,t+1.65);this.drive.gain.linearRampToValueAtTime(p.drive,t+1.85);
    }
    return p;
  }
  dispose(){try{this.lfo.stop();this.hiss.stop();}catch{}this.nodes.forEach(n=>n.disconnect());this.nodes=[];}
}
