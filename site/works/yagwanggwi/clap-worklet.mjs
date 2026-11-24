import { ClapDetector } from './clap.mjs';

class Claps extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = new ClapDetector(sampleRate, data => this.port.postMessage(data));
    this.port.onmessage = ({data}) => {
      if (data.calibrate) this.detector.calibrate();
      if (data.sensitivity !== undefined) this.detector.configure(data.sensitivity, data.interval);
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) this.detector.push(channel);
    return true;
  }
}

registerProcessor('yagwanggwi-claps', Claps);
