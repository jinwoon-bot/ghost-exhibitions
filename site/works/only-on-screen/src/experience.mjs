// All clocks are monotonic seconds. Only a sustained, evidenced turn can advance depth.
export class Experience {
  constructor(config,random=Math.random){this.config=config;this.random=random;this.history=[];this.reset(0);}
  reset(t){this.state='WAITING';this.since=t;this.stage=0;this.alpha=0;this.presentSince=null;this.absentSince=null;this.frontSince=null;this.awaySince=null;this.armed=false;this.breakCommitted=false;this.side=this.random()<.5?-1:1;this.transitions=0;this.sessionEnabled=true;this.revealSince=null;}
  enter(state,t){if(state===this.state)return;this.state=state;this.since=t;this.history.push({state,t,stage:this.stage});if(this.history.length>300)this.history.shift();}
  update(t,observation){
    const c=this.config,o=observation||{},valid=o.valid===true,present=valid&&o.present===true;
    this.safe=valid;
    if(!valid){this.frontSince=null;this.awaySince=null;this.armed=false;return this.view(t);}
    if(present){this.absentSince=null;this.presentSince??=t;}else{this.presentSince=null;this.absentSince??=t;this.frontSince=null;this.awaySince=null;this.armed=false;}
    if(this.state==='WAITING'){
      this.alpha=0;
      if(present&&t-this.presentSince>=.75){this.stage=0;this.sessionEnabled=this.random()<c.probability;this.side=this.random()<.5?-1:1;this.enter('MIRROR',t);}
      return this.view(t);
    }
    if(this.state==='RESET'){
      const age=t-this.since;
      this.alpha=this.exitAlpha*(1-clamp((age-1.4)/2.6));
      if(age>=4){this.reset(t);if(present)this.presentSince=t;}
      return this.view(t);
    }
    if(!present){if(t-this.absentSince>=1.8){this.exitAlpha=this.alpha;this.enter('RESET',t);}return this.view(t);}
    if(o.facing==='front') {this.frontSince??=t;this.awaySince=null;if(t-this.frontSince>=c.frontHold)this.armed=true;}
    else if(o.facing==='away'&&o.turnEvidence){this.awaySince??=t;this.frontSince=null;}
    else {this.frontSince=null;this.awaySince=null;}
    if(this.state==='MIRROR'){
      if(this.sessionEnabled&&t-this.since>=c.firstDelay){this.alpha=0;this.enter('FIRST_PRESENCE',t);}
    }else if(this.state==='OBSERVATION_BREAK'){
      const age=t-this.since,hide=.24/c.approachSpeed;
      this.alpha=this.breakAlpha*(1-clamp(age/hide));
      if(o.facing==='away'&&o.turnEvidence&&age>=hide+.35/c.approachSpeed&&!this.breakCommitted){
        this.stage=Math.min(2,this.stage+1);this.breakCommitted=true;this.transitions++;this.alpha=0;
      }
      // A premature return cancels the move; do not snap an already visible figure.
      if(o.facing==='front'){
        this.alpha=0;this.armed=false;this.awaySince=null;this.frontSince=t;
        this.revealSince=this.stage===2&&this.breakCommitted?t:null;
        this.enter(this.stage===2?'CLOSE_PRESENCE':'FIRST_PRESENCE',t);
      }
    }else{
      this.alpha=clamp((t-this.since)/2.6);
      if(this.stage<2&&this.armed&&this.awaySince!==null&&t-this.awaySince>=c.turnHold){
        this.breakAlpha=this.alpha;this.breakCommitted=false;this.armed=false;this.enter('OBSERVATION_BREAK',t);
      }
    }
    return this.view(t);
  }
  view(t){return {state:this.state,stage:this.stage,alpha:this.alpha,side:this.side,age:t-this.since,safe:this.safe,transitions:this.transitions,reveal:this.state==='CLOSE_PRESENCE'&&this.revealSince!==null&&t-this.revealSince>1.6};}
}
export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
