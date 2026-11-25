import { WindDetector } from './wind.mjs';

class WindProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = new WindDetector(sampleRate, result => this.port.postMessage(result));
    this.port.onmessage = ({data}) => {
      if (data.calibrate) this.detector.calibrate();
      else this.detector.configure(data.sensitivity,data.minimum);
    };
  }
  process(inputs) {
    if (inputs[0]?.[0]) this.detector.feed(inputs[0][0]);
    return true;
  }
}

registerProcessor('sondol-wind',WindProcessor);
