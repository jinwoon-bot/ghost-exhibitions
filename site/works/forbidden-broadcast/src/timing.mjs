// Keep a 60 Hz schedule on 60/120/144 Hz displays without tying animation time to it.
export class FrameCadence {
 constructor(fps=60){this.period=1000/fps;this.reset();}
 reset(){this.next=null;this.last=null;}
 tick(now){if(this.next!==null&&now<this.next-.3)return null;const elapsed=this.last===null?this.period:now-this.last;this.next=this.next===null||now-this.next>this.period*2?now+this.period:this.next+this.period;this.last=now;return elapsed;}
}
