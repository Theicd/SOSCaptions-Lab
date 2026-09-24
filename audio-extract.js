/**
 * Decode video/audio ArrayBuffer → mono Float32Array @ 16 kHz (Whisper input).
 */
(function (global) {
  'use strict';

  async function decodeToAudioBuffer(arrayBuffer) {
    const AudioCtx = global.AudioContext || global.webkitAudioContext;
    const ac = new AudioCtx();
    try {
      return await ac.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      if (ac.close) {
        try {
          await ac.close();
        } catch (_) {}
      }
    }
  }

  function mixMono(audioBuffer) {
    const n = audioBuffer.length;
    const out = new Float32Array(n);
    const channels = audioBuffer.numberOfChannels;
    if (channels === 1) {
      out.set(audioBuffer.getChannelData(0));
      return { data: out, sampleRate: audioBuffer.sampleRate };
    }
    const chans = [];
    for (let c = 0; c < channels; c++) chans.push(audioBuffer.getChannelData(c));
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += chans[c][i];
      out[i] = sum / channels;
    }
    return { data: out, sampleRate: audioBuffer.sampleRate };
  }

  async function resampleTo16k(monoData, sampleRate) {
    if (sampleRate === 16000) return monoData;
    const duration = monoData.length / sampleRate;
    const length = Math.max(1, Math.ceil(duration * 16000));
    const offline = new OfflineAudioContext(1, length, 16000);
    const buffer = offline.createBuffer(1, monoData.length, sampleRate);
    buffer.copyToChannel(monoData, 0);
    const src = offline.createBufferSource();
    src.buffer = buffer;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice(0);
  }

  /**
   * @param {ArrayBuffer} arrayBuffer
   * @returns {Promise<Float32Array>}
   */
  async function extractMono16k(arrayBuffer) {
    const decoded = await decodeToAudioBuffer(arrayBuffer);
    const mono = mixMono(decoded);
    return resampleTo16k(mono.data, mono.sampleRate);
  }

  /**
   * @param {string} url
   * @returns {Promise<Float32Array>}
   */
  async function extractMono16kFromUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch audio failed: ' + res.status + ' ' + url);
    const buf = await res.arrayBuffer();
    return extractMono16k(buf);
  }

  /**
   * @param {Blob|File} file
   * @returns {Promise<Float32Array>}
   */
  async function extractMono16kFromFile(file) {
    const buf = await file.arrayBuffer();
    return extractMono16k(buf);
  }

  global.CaptionsAudio = {
    extractMono16k: extractMono16k,
    extractMono16kFromUrl: extractMono16kFromUrl,
    extractMono16kFromFile: extractMono16kFromFile
  };
})(typeof window !== 'undefined' ? window : globalThis);
