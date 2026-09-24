import { readFileSync, writeFileSync } from 'fs';
import { pipeline } from '@huggingface/transformers';

function decodeWavPcm16(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 12;
  let dataOffset = 0;
  let dataSize = 0;
  let sampleRate = 16000;
  let channels = 1;
  let bits = 16;
  while (offset + 8 <= buf.length) {
    const id = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
    const size = dv.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      channels = dv.getUint16(offset + 10, true);
      sampleRate = dv.getUint32(offset + 12, true);
      bits = dv.getUint16(offset + 22, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  const samples = dataSize / (bits / 8);
  const f32 = new Float32Array(samples / channels);
  let j = 0;
  for (let i = 0; i < samples; i += channels) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const s = dv.getInt16(dataOffset + (i + c) * 2, true);
      sum += s / 32768;
    }
    f32[j++] = sum / channels;
  }
  return { audio: f32, sampleRate };
}

const wav = readFileSync('SAMPLE/work/test1-16k.wav');
const { audio, sampleRate } = decodeWavPcm16(wav);
console.log('[gt] audio frames=', audio.length, 'sr=', sampleRate, 'dur=', (audio.length / sampleRate).toFixed(2));
console.log('[gt] loading Xenova/whisper-tiny.en ...');
const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', { dtype: 'fp32' });
console.log('[gt] model ready, transcribing...');
const out = await asr(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
console.log('[gt] RESULT text:', out.text);
console.log('[gt] chunks:', JSON.stringify(out.chunks || out, null, 2));
writeFileSync('SAMPLE/work/test1-transcript.json', JSON.stringify(out, null, 2));
console.log('[gt] wrote SAMPLE/work/test1-transcript.json');
