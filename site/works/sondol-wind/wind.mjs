import { clamp } from './score.mjs';

export class WindDetector {
  constructor(rate, report) {
    this.rate = rate;
    this.report = report;
    this.size = Math.max(128,Math.round(rate*.040));
    this.voicing = new Float32Array(Math.ceil(this.size/4));
    this.lowWeight = 1-Math.exp(-2*Math.PI*310/rate);
    this.midWeight = 1-Math.exp(-2*Math.PI*2100/rate);
    this.sensitivity = .57;
    this.minimum = 210;
    this.calibrate();
  }

  configure(sensitivity,minimum) {
    this.sensitivity = clamp(sensitivity,.15,.95);
    this.minimum = clamp(minimum,100,650);
  }

  calibrate() {
    this.floor = .0024;
    this.seconds = this.duration = this.level = this.value = 0;
    this.low = this.mid = this.count = this.power = this.bass = this.speech = 0;
  }

  feed(samples) {
    for (const sample of samples) {
      this.low += this.lowWeight*(sample-this.low);
      this.mid += this.midWeight*(sample-this.mid);
      const speech = this.mid-this.low;
      this.power += sample*sample;
      this.bass += this.low*this.low;
      this.speech += speech*speech;
      if (!(this.count%4)) this.voicing[this.count/4]=speech;
      if (++this.count===this.size) this.measure();
    }
  }

  voiced() {
    const sample = this.voicing;
    const low = Math.floor(this.rate/(4*385));
    const high = Math.ceil(this.rate/(4*85));
    for (let lag=low;lag<=high;lag+=2) {
      let a=0,b=0,c=0;
      for (let i=0;i<sample.length-lag;i+=3) {
        const x=sample[i],y=sample[i+lag];
        a+=x*x; b+=y*y; c+=x*y;
      }
      if (c>0 && c*c>.65*a*b && a*b>1e-9) return true;
    }
    return false;
  }

  measure() {
    const step = this.size/this.rate;
    this.seconds += step;
    const calibrating = this.seconds<1.12;
    this.level = Math.sqrt(this.power/this.size);
    const lowRatio = Math.sqrt(this.bass/Math.max(1e-9,this.power));
    const limit = Math.max(.013-.009*this.sensitivity,this.floor*(4.2-1.8*this.sensitivity));
    const candidate = !calibrating && this.level>limit && lowRatio>.44 &&
      (this.speech/this.size<.000013 || !this.voiced());
    if (calibrating || (!candidate && this.level<limit*1.25)) {
      const sample = Math.min(this.level,this.floor*2+.002);
      this.floor = Math.max(.001,(1-(calibrating ? .15 : .009))*this.floor+(calibrating ? .15 : .009)*sample);
    }
    this.duration = candidate ? Math.min(this.minimum/1000+step,this.duration+step) : Math.max(0,this.duration-step*1.55);
    if (!candidate && this.duration<this.minimum/1000) this.duration = 0;
    const target = candidate && this.duration>=this.minimum/1000 ?
      clamp(.21+Math.log2(this.level/limit)*.48+(lowRatio-.44)*.31) : 0;
    this.value += (target-this.value)*(target>this.value ? .63 : .30);
    this.report({value:this.value,level:this.level,floor:this.floor,calibrating});
    this.count = this.power = this.bass = this.speech = 0;
  }
}
