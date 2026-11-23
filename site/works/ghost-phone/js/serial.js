import {parseSensorLine} from './core.js?v=4.2.0';
export class SerialInput {
  constructor({event,status,lost,snapshot}){Object.assign(this,{event,status,lost,snapshot});this.port=null;this.reader=null;this.closing=false;this.lastSeen=0;this.timer=null;this.connecting=false;this.generation=0;}
  async connect(){
    if(!('serial'in navigator))throw Error('이 브라우저는 Web Serial을 지원하지 않습니다. Windows Chrome의 HTTPS/localhost에서 연결하세요.');
    if(this.port||this.connecting)throw Error('이미 센서가 연결되어 있거나 선택 중입니다.');
    this.closing=false;this.connecting=true;const generation=++this.generation;
    try{const port=await navigator.serial.requestPort();if(generation!==this.generation)throw new DOMException('USB 선택 취소','AbortError');await port.open({baudRate:115200});if(generation!==this.generation){await port.close();throw new DOMException('USB 연결 취소','AbortError');}this.port=port;this.lastSeen=performance.now();
      this.status('USB 연결 · 최초 상태 수신 대기');this.timer=setInterval(()=>{if(performance.now()-this.lastSeen>5000)this.disconnect(true);},1000);this.read();
    }finally{if(generation===this.generation)this.connecting=false;}
  }
  async read(){let pending='';const decoder=new TextDecoder();
    try{this.reader=this.port.readable.getReader();while(!this.closing){const {value,done}=await this.reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});if(pending.length>1024)throw Error('센서 버퍼 초과');let p;while((p=pending.indexOf('\n'))>=0){const line=pending.slice(0,p).trim();pending=pending.slice(p+1);if(!line)continue;const packet=parseSensorLine(line);this.lastSeen=performance.now();this.status('USB 센서 · 수신 중');if(packet.type==='snapshot')this.snapshot(packet);else if(packet.event)this.event(packet.event);}}
    }catch(e){if(!this.closing)this.status('USB 수신 오류: '+e.message);}finally{this.reader?.releaseLock();this.reader=null;if(!this.closing)await this.disconnect(true);}
  }
  async disconnect(unexpected=false){if(this.closing&&!this.connecting)return;this.closing=true;this.connecting=false;this.generation++;clearInterval(this.timer);try{await this.reader?.cancel();}catch{}try{await this.port?.close();}catch{}this.port=null;this.status(unexpected?'센서 연결 끊김 · 체험 중단':'가상 센서 모드');this.lost(unexpected);}
}
