// Local audition director. Uses only call timing, never microphone input or identity.
// The same two source performances have different treatments; these are not new actors.
export class EncounterDirector {
  constructor({now=()=>performance.now(),random=Math.random,hesitateMs=6000,returnMs=45000}={}) {
    Object.assign(this,{now,random,hesitateMs,returnMs});this.reset();
  }
  reset(){this.rangAt=null;this.current=null;this.unfinished=null;this.lastActor=null;this.serial=(this.serial||0)+1;}
  ring(){this.rangAt=this.now();}
  connect(actorIds){
    if(this.current)return this.current;
    const ids=[...new Set(actorIds)];if(!ids.length)throw Error('준비된 귀신 음원이 없습니다.');
    const t=this.now(),ringMs=this.rangAt===null?0:Math.max(0,t-this.rangAt);
    const memory=this.unfinished;
    const returning=memory&&t-memory.at>=0&&t-memory.at<=this.returnMs&&ids.includes(memory.actorId);
    const options=ids.length>1?ids.filter(id=>id!==this.lastActor):ids;
    const actorId=returning?memory.actorId:options[Math.min(options.length-1,Math.max(0,Math.floor(this.random()*options.length)))];
    const scene=returning?'return':ringMs>=this.hesitateMs?'hesitate':'answer';
    const treatment=scene==='answer'?'haunted':'dread';
    this.current={token:++this.serial,actorId,scene,treatment,ringMs,started:false,finished:false};
    this.lastActor=actorId;this.unfinished=null;this.rangAt=null;
    return this.current;
  }
  started(token){if(this.current?.token===token)this.current.started=true;}
  finished(token){if(this.current?.token===token)this.current.finished=true;}
  close(){
    if(this.current?.started&&!this.current.finished)this.unfinished={actorId:this.current.actorId,at:this.now()};
    this.current=null;this.rangAt=null;
  }
}
