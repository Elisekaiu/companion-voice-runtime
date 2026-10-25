class PCM16CaptureProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.targetRate=16000;
    this.step=sampleRate/this.targetRate;
    this.position=0;
    this.chunk=new Int16Array(1600);
    this.index=0;
  }
  process(inputs){
    const input=inputs[0]?.[0];
    if(!input||!input.length)return true;
    while(this.position<input.length){
      const i=Math.min(input.length-1,Math.floor(this.position));
      const v=Math.max(-1,Math.min(1,input[i]||0));
      this.chunk[this.index++]=v<0?v*0x8000:v*0x7fff;
      if(this.index===this.chunk.length){
        const out=this.chunk;
        this.chunk=new Int16Array(1600);
        this.index=0;
        this.port.postMessage(out.buffer,[out.buffer]);
      }
      this.position+=this.step;
    }
    this.position-=input.length;
    return true;
  }
}
registerProcessor('pcm16-capture',PCM16CaptureProcessor);
