export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const STATES=['NORMAL_BROADCAST','SIGNAL_INTERRUPTION','LIVE_OBSERVATION','BEHAVIOR_REPORTING','IMPOSSIBLE_REPORT','ARCHIVAL_FAILURE'];
const ease=v=>{v=clamp(v);return v*v*(3-2*v);};
export class BroadcastExperience{
 constructor(config,captions){this.config=config;this.captions=captions;this.transitions=[];this.reset(0);}
 reset(t){this.state='NORMAL_BROADCAST';this.since=t;this.nearSince=null;this.singleSince=null;this.absentSince=null;this.lostSince=null;this.session=null;this.served=false;this.completed=false;this.captionKey='generic';this.captionAt=t;this.actionCount=0;this.lastAction='';this.forced=false;this.transitions.push({t,state:this.state});}
 enter(state,t){this.state=state;this.since=t;this.transitions.push({t,state});if(this.transitions.length>100)this.transitions.shift();}
 update(t,o,ghostReady=true){
  if(!o.valid){this.nearSince=null;this.lostSince??=t;return this.view(t,o,false,ghostReady);}
  this.lostSince=null;
  this.singleSince=o.present&&o.people===1?(this.singleSince??t):null;
  if(o.present){this.absentSince=null;}else{this.absentSince??=t;if(t-this.absentSince>=this.config.returnDelay){if(this.state!=='NORMAL_BROADCAST')this.enter('NORMAL_BROADCAST',t);this.served=false;this.completed=false;this.session=null;this.nearSince=null;}}
  if(this.state==='NORMAL_BROADCAST'){
   if(o.present&&o.near&&!this.served){this.nearSince??=t;if(t-this.nearSince>=this.config.entryHold){this.served=true;this.session=t;this.captionKey='new';this.actionCount=0;this.lastAction='';this.enter('SIGNAL_INTERRUPTION',t);}}else this.nearSince=null;
  }else if(o.present){
   const age=t-this.since;
   if(this.state==='SIGNAL_INTERRUPTION'&&age>=2.6)this.enter('LIVE_OBSERVATION',t);
   else if(this.state==='LIVE_OBSERVATION'&&age>=this.config.firstDelay)this.enter('BEHAVIOR_REPORTING',t);
   else if(this.state==='BEHAVIOR_REPORTING'){
    const a=o.action||'generic';
    if(a!=='generic'&&a!==this.lastAction&&t-this.captionAt>=this.config.actionCooldown){this.captionKey=a;this.lastAction=a;this.captionAt=t;this.actionCount++;}
    // A stable single audience and a renderable ghost are mandatory for the authored contradiction.
    if(!this.completed&&age>=this.config.impossibleDelay&&(this.actionCount>=2||age>=this.config.impossibleDelay+18)&&o.people===1&&this.singleSince!==null&&t-this.singleSince>=1.5&&ghostReady)this.enter('IMPOSSIBLE_REPORT',t);
   }else if(this.state==='IMPOSSIBLE_REPORT'&&age>=13)this.enter('ARCHIVAL_FAILURE',t);
   else if(this.state==='ARCHIVAL_FAILURE'&&age>=6){this.captionKey='generic';this.enter('BEHAVIOR_REPORTING',t);this.completed=true;}
  }
  if(this.completed&&this.state==='BEHAVIOR_REPORTING')this.served=true;
  return this.view(t,o,true,ghostReady);
 }
 view(t,o,safe=true,ghostReady=true){
  const age=t-this.since,state=this.state,live=!['NORMAL_BROADCAST','SIGNAL_INTERRUPTION'].includes(state);
  let captionKey=state==='NORMAL_BROADCAST'?'generic':state==='SIGNAL_INTERRUPTION'?'interruption':state==='LIVE_OBSERVATION'?'new':state==='IMPOSSIBLE_REPORT'?'awareness':state==='ARCHIVAL_FAILURE'?'archive':this.captionKey;
  // Absence and stale AI never masquerade as a recognized action or two-person count.
  if(live&&(!safe||!o.present))captionKey=o.valid&&!o.present?'leave':'generic';
  let alpha=0;
  if(state==='IMPOSSIBLE_REPORT'&&safe&&o.present&&o.people===1&&(this.forced||this.singleSince!==null&&t-this.singleSince>=1.5)&&ghostReady){alpha=ease((age-4.8)/1.8)*(1-ease((age-10.4)/1.3));if(alpha>.18&&age>=5.8)captionKey='two';}
  if(state==='BEHAVIOR_REPORTING'&&t-this.captionAt>6)captionKey='generic';
  return {state,age,live,captionKey,caption:this.captions[captionKey]||this.captions.generic,ghostAlpha:alpha,safe:safe&&o.present,freeze:state==='ARCHIVAL_FAILURE'&&age<3.6,signal:state==='SIGNAL_INTERRUPTION',fade:state==='SIGNAL_INTERRUPTION'?ease(age/.2):1};
 }
 test(state,t){if(!STATES.includes(state))return;this.enter(state,t);this.served=true;this.session=t;this.forced=true;this.completed=false;this.captionKey='hand';}
}
