// One background layer independent of speech. Fade/duck with scheduled audio gains.
export function spliceLoop(channels,fadeFrames){
 const n=channels[0].length,f=Math.min(fadeFrames,Math.floor(n/4)),length=n-f;
 return channels.map(source=>{const out=new Float32Array(length);out.set(source.subarray(0,length));for(let i=0;i<f;i++){const w=.5-.5*Math.cos(Math.PI*i/Math.max(1,f-1));out[i]=source[length+i]*(1-w)+source[i]*w;}return out;});
}
export class AmbientBus {
 constructor(ctx,destination=ctx.destination){this.ctx=ctx;this.destination=destination;this.buffers=new Map();this.volume=.18;this.ducked=false;this.current=null;this.accents=new Map();}
 async load(id,bytes){if(this.buffers.has(id))return;const decoded=await this.ctx.decodeAudioData(bytes.slice(0)),parts=spliceLoop(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),Math.floor(decoded.sampleRate*.6));const buffer=this.ctx.createBuffer(parts.length,parts[0].length,decoded.sampleRate);parts.forEach((p,i)=>buffer.copyToChannel(p,i));if(this.buffers.size>=6)this.buffers.delete(this.buffers.keys().next().value);this.buffers.set(id,buffer);}
 start(id){this.stop();const buffer=this.buffers.get(id);if(!buffer)throw Error('배경음이 아직 준비되지 않았습니다.');const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=20000;source.buffer=buffer;source.loop=true;gain.gain.value=0;source.connect(filter).connect(gain).connect(this.destination);this.current={id,source,gain,filter};source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};this.ducked=false;source.start();this.update(.22);}
 colour(value){if(!this.current)return;const amount=Math.max(0,Math.min(1,Number(value)||0)),p=this.current.filter.frequency,t=this.ctx.currentTime;p.cancelScheduledValues(t);p.setTargetAtTime(650*Math.pow(10,amount),t,.4);}
 accent({offset=0,duration=1,volume=.1}={}){if(!this.current)return;const buffer=this.current.source.buffer;if(!buffer?.duration)return;const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),t=this.ctx.currentTime;source.buffer=buffer;const start=Math.min(Math.max(0,offset),buffer.duration-.1),length=Math.min(Math.max(.1,duration),buffer.duration-start);gain.gain.value=0;gain.gain.setTargetAtTime(Math.min(.16,Math.max(0,volume)),t,.04);gain.gain.setTargetAtTime(0,t+Math.max(.05,length-.14),.03);source.connect(gain).connect(this.destination);this.accents.set(source,gain);source.onended=()=>{this.accents.delete(source);source.disconnect();gain.disconnect();};source.start(t,start,length);}
 setVolume(value){this.volume=Math.max(0,Math.min(.3,Number(value)||0));this.update(.08);}
 duck(value){this.ducked=!!value;this.update(value ? .1 : .35);}
 update(seconds){if(!this.current)return;const p=this.current.gain.gain,t=this.ctx.currentTime;p.cancelScheduledValues(t);p.setTargetAtTime(this.volume*(this.ducked ? .42 : 1),t,seconds);}
 stop(){const t=this.ctx.currentTime;for(const [source,gain] of this.accents){gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.005);try{source.stop(t+.03);}catch{}}this.accents.clear();if(!this.current)return;const {source,gain}=this.current;this.current=null;gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.015);source.stop(t+.08);}
 dispose(){this.stop();this.buffers.clear();}
}
