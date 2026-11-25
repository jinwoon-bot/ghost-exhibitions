export const PHASE = Object.freeze({
  CALM:'CALM', WIND:'WIND', STORM:'STORM', BOAT_LOST:'BOAT_LOST',
  SILENCE:'SILENCE', HAND_REVEAL:'HAND_REVEAL', GHOST_REVEAL:'GHOST_REVEAL', RECOVERY:'RECOVERY',
});
export const CUT = Object.freeze({hand:3, ghost:6.25, ghostHigh:7.02, handSound:3.7, drips:7.62, end:15.9});
export const DRIP_OFFSETS = [0,.85,1.79,3.05];
export const DEFAULTS = Object.freeze({sensitivity:.57, minimum:210, storm:.31, lost:1, waves:1, boat:1, mist:.67,
  master:.75, water:.64, wind:.57, effects:.75, muted:false, low:false, autoReset:true, device:''});
export const clamp = (n,a=0,b=1) => Math.min(b,Math.max(a,n));
export function smooth(a,b,n) {
  const t = clamp((n-a)/(b-a));
  return t*t*(3-2*t);
}

export function windBands(value) {
  return {
    label:value>=.70 ? '강' : value>=.39 ? '중' : value>=.052 ? '약' : '대기',
    breeze:smooth(.045,.39,value),
    swell:smooth(.27,.69,value),
    gale:smooth(.64,1,value),
  };
}

export function keyboardWind(seconds) {
  return .37*smooth(0,.75,seconds)+.29*smooth(.65,1.90,seconds)+.34*smooth(1.55,3.15,seconds);
}

export function revealPose(t) {
  const handRise=smooth(CUT.hand,5.25,t), handSink=smooth(5.45,6.60,t);
  const rise=smooth(CUT.ghost+.12,CUT.ghostHigh,t), sink=smooth(11.90,CUT.end,t);
  return {
    hand:{x:.419,y:.958-.254*handRise+.26*handSink, width:.145,
      opacity:.85*handRise*(1-handSink), angle:-.12+.12*handRise-.08*handSink},
    ghost:{x:.515+.002*rise*Math.sin(t*1.05),y:.89-.684*rise+.70*sink+.0025*rise*Math.sin(t*1.12), width:.479,
      opacity:smooth(CUT.ghost+.16,CUT.ghost+.43,t)*(1-.26*sink)*(1-smooth(CUT.end-.60,CUT.end,t)),
      angle:-.022+.016*rise*Math.sin(t*.87)},
  };
}

export function cutPhase(t) {
  if (t<CUT.hand) return PHASE.SILENCE;
  if (t<CUT.ghost) return PHASE.HAND_REVEAL;
  return PHASE.GHOST_REVEAL;
}

export class Score {
  constructor() {
    this.settings = {...DEFAULTS};
    this.serial = 0;
    this.reset();
  }

  reset() {
    this.serial++;
    this.state = PHASE.CALM;
    this.elapsed = this.cut = this.wind = this.charge = this.quiet = 0;
    this.returning = false;
    this.needsRelease = false;
  }

  setState(state) {
    if (this.state!==state) {
      this.state = state;
      this.elapsed = 0;
    }
  }

  launch(at=0) {
    this.serial++;
    this.cut = at;
    this.wind = 0;
    this.charge = this.settings.lost;
    this.setState(cutPhase(at));
  }

  force(state) {
    switch (state) {
      case PHASE.BOAT_LOST:
        this.wind = .9;
        this.charge = this.settings.lost;
        this.setState(state);
        break;
      case PHASE.HAND_REVEAL: this.launch(CUT.hand); break;
      case PHASE.GHOST_REVEAL: this.launch(CUT.ghost); break;
      default: this.reset();
    }
  }

  step(dt,input) {
    dt = clamp(dt,0,.12);
    this.elapsed += dt;
    if (this.state===PHASE.BOAT_LOST) {
      this.wind *= Math.exp(-dt*1.25);
      if (this.elapsed>=1.36) this.launch();
      return;
    }
    if ([PHASE.SILENCE,PHASE.HAND_REVEAL,PHASE.GHOST_REVEAL].includes(this.state)) {
      this.cut += dt;
      if (this.cut>=CUT.end) {
        this.cut = CUT.end;
        this.returning = !this.returning;
        this.setState(PHASE.RECOVERY);
      } else this.setState(cutPhase(this.cut));
      return;
    }
    if (this.state===PHASE.RECOVERY) {
      if (this.elapsed>=2.35 && this.settings.autoReset) {
        this.cut = this.charge = this.quiet = 0;
        this.needsRelease = true;
        this.setState(PHASE.CALM);
      }
      return;
    }
    if (input<.10) this.needsRelease = false;
    const value = this.needsRelease ? 0 : clamp(input);
    const time = value>this.wind ? .37 : .58;
    this.wind += (value-this.wind)*(1-Math.exp(-dt/time));
    if (this.wind>.68) {
      this.quiet = 0;
      this.charge = Math.min(this.settings.lost,this.charge+dt*.30*smooth(.68,.98,this.wind));
    } else {
      this.quiet += dt;
      if (this.quiet>1.5) this.charge = Math.max(0,this.charge-dt*.017);
    }
    if (this.charge>=this.settings.lost-1e-6) this.setState(PHASE.BOAT_LOST);
    else if (this.wind<.052) this.setState(PHASE.CALM);
    else this.setState(this.wind>=.70 && this.charge>=this.settings.storm ? PHASE.STORM : PHASE.WIND);
  }

  get view() {
    const inCut = [PHASE.SILENCE,PHASE.HAND_REVEAL,PHASE.GHOST_REVEAL].includes(this.state);
    const loss = this.state===PHASE.BOAT_LOST ? smooth(.12,1.20,this.elapsed) : 0;
    const recover = this.state===PHASE.RECOVERY ? smooth(.26,2.1,this.elapsed) : 1;
    const progression = this.state===PHASE.RECOVERY ? 0 : clamp(this.charge/this.settings.lost);
    return {state:this.state,elapsed:this.elapsed,cut:this.cut,serial:this.serial,inCut,
      wind:this.wind,progression,loss,recover,returning:this.returning};
  }
}
