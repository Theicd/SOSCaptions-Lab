/**
 * Whisper ASR worker via jsDelivr ESM (resolves onnxruntime bare imports).
 */
import { env, pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = true;
env.cacheKey = 'sos-captions-transformers-v1';

const MODEL = 'Xenova/whisper-tiny.en';

/** @type {any} */
let recognizer = null;

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

function log(message) {
  post({ type: 'log', message: String(message) });
}

self.onmessage = async (event) => {
  const { id, type, audio } = event.data || {};
  try {
    if (type === 'ensure' || type === 'transcribe') {
      if (!recognizer) {
        log('loading model ' + MODEL);
        recognizer = await pipeline('automatic-speech-recognition', MODEL, {
          dtype: 'fp32',
          progress_callback: (p) => post({ type: 'progress', payload: p })
        });
        log('model ready');
      }
      if (type === 'ensure') {
        post({ id, type: 'done' });
        return;
      }
      if (!audio || !(audio instanceof Float32Array)) {
        throw new Error('transcribe requires Float32Array audio');
      }
      log('transcribing frames=' + audio.length + ' dur~' + (audio.length / 16000).toFixed(2) + 's');
      const result = await recognizer(audio, {
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5
      });
      log('done text_len=' + String(result && result.text ? result.text.length : 0));
      post({ id, type: 'done', result: result });
      return;
    }
    post({ id, type: 'error', error: 'unknown type: ' + type });
  } catch (err) {
    post({ id, type: 'error', error: String(err && err.message ? err.message : err) });
  }
};
