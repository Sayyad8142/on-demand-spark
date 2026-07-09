// Push-to-talk WAV recorder using Web Audio API.
// Produces a complete, decodable 16 kHz mono WAV every time — works in
// Capacitor WebView and desktop browsers, including iOS Safari.

export type Recorder = {
  stop: () => Promise<Blob>;
  cancel: () => void;
  onLevel?: (level: number) => void;
};

const TARGET_SAMPLE_RATE = 16000;

function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return input;
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcStart = Math.floor(i * ratio);
    const srcEnd = Math.floor((i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = srcStart; j < srcEnd && j < input.length; j++) {
      sum += input[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const byteLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, byteLength, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function startRecorder(opts?: { onLevel?: (level: number) => void }): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but works everywhere including the Capacitor
  // WebView. AudioWorklet needs bundling in a separate module — skip for Phase 1.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let stopped = false;

  node.onaudioprocess = (e) => {
    const raw = e.inputBuffer.getChannelData(0);
    // Copy — the underlying buffer is reused.
    chunks.push(new Float32Array(raw));
    if (opts?.onLevel) {
      let peak = 0;
      for (let i = 0; i < raw.length; i++) {
        const v = Math.abs(raw[i]);
        if (v > peak) peak = v;
      }
      opts.onLevel(peak);
    }
  };
  source.connect(node);
  // Route through a gain-of-0 to satisfy some browsers that require a destination.
  const gain = ctx.createGain();
  gain.gain.value = 0;
  node.connect(gain);
  gain.connect(ctx.destination);

  const cleanup = async () => {
    try { node.disconnect(); } catch { /* noop */ }
    try { source.disconnect(); } catch { /* noop */ }
    try { gain.disconnect(); } catch { /* noop */ }
    stream.getTracks().forEach((t) => t.stop());
    try { await ctx.close(); } catch { /* noop */ }
  };

  return {
    stop: async () => {
      if (stopped) return new Blob([], { type: "audio/wav" });
      stopped = true;
      const inputRate = ctx.sampleRate;
      await cleanup();
      let total = 0;
      for (const c of chunks) total += c.length;
      const merged = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) { merged.set(c, offset); offset += c.length; }
      const down = downsampleTo16k(merged, inputRate);
      return encodeWav(down, TARGET_SAMPLE_RATE);
    },
    cancel: () => {
      if (stopped) return;
      stopped = true;
      void cleanup();
    },
  };
}
