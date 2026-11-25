export const PHASE = Object.freeze({
  CALM:'CALM', WIND:'WIND', STORM:'STORM', BOAT_LOST:'BOAT_LOST',
  AFTERMATH:'AFTERMATH', EMPTY_WATER:'EMPTY_WATER', RECOVERY:'RECOVERY',
});
const cutPhases = new Set([PHASE.AFTERMATH,PHASE.EMPTY_WATER]);
export const CUT = Object.freeze({empty:2.7, end:15.7});
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

export function stormAfterLoss(t) {
  const gusts=(.018*Math.sin(t*4.8)+.009*Math.sin(t*8.2))*smooth(0,.6,t);
  const below=.13*(1-smooth(10.8,14.8,t));
  return below+(.90+gusts-below)*(1-smooth(1.15,4.45,t));
}

export function emptyWater(t) {
  return {
    haze:smooth(1.15,5.2,t)*(1-smooth(10.4,15.55,t)),
    quiet:smooth(1.9,4.2,t)*(1-smooth(10.9,15.6,t)),
    wake:smooth(2.55,4.65,t)*(1-smooth(9.8,13.45,t)),
    distance:smooth(2.55,13.15,t),
  };
}

export function breathTension(view) {
  if (view.inCut) return .90*(1-smooth(.1,5.7,view.cut));
  return smooth(.24,.94,view.wind)*(.52+.48*smooth(.06,.87,view.progression));
}

export function cutPhase(t) {
  return t<CUT.empty ? PHASE.AFTERMATH : PHASE.EMPTY_WATER;
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
    this.wind = stormAfterLoss(at);
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
      case PHASE.EMPTY_WATER: this.launch(CUT.empty); break;
      default: this.reset();
    }
  }

  step(dt,input) {
    dt = clamp(dt,0,.12);
    this.elapsed += dt;
    if (this.state===PHASE.BOAT_LOST) {
      this.wind += (stormAfterLoss(0)-this.wind)*(1-Math.exp(-dt/.48));
      if (this.elapsed>=1.36) this.launch();
      return;
    }
    if (cutPhases.has(this.state)) {
      this.cut += dt;
      this.wind = stormAfterLoss(this.cut);
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
    const inCut = cutPhases.has(this.state);
    const loss = this.state===PHASE.BOAT_LOST ? smooth(.12,1.20,this.elapsed) : 0;
    const recover = this.state===PHASE.RECOVERY ? smooth(.26,2.1,this.elapsed) : 1;
    const progression = this.state===PHASE.RECOVERY ? 0 : clamp(this.charge/this.settings.lost);
    return {state:this.state,elapsed:this.elapsed,cut:this.cut,serial:this.serial,inCut,
      wind:this.wind,progression,loss,recover,returning:this.returning};
  }
}
