/**
 * Shared transformers.js env setup — mirrors SubVid (midudev/subvid.app):
 * - allowLocalModels = false
 * - browser Cache API only when actually usable (LAN http://IP has no caches)
 * - hide WebGPU so ORT uses WASM/CPU (SubVid transcriber.worker.ts)
 * - dtype fp32 (SubVid WHISPER_FIX.md)
 */
(function (global) {
  'use strict';

  let gpuHidden = false;

  function hideWebGpuLikeSubVid() {
    if (gpuHidden) return;
    if (typeof navigator === 'undefined') return;
    try {
      if (navigator.gpu) {
        Object.defineProperty(navigator, 'gpu', {
          get: function () {
            return undefined;
          },
          configurable: true
        });
      }
      gpuHidden = true;
    } catch (e) {
      /* ignore — some browsers lock navigator.gpu */
    }
  }

  async function canUseBrowserCache() {
    if (typeof caches === 'undefined' || !caches || typeof caches.open !== 'function') {
      return false;
    }
    try {
      await caches.open('sos-captions-probe');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * @param {typeof import('@huggingface/transformers')} mod
   * @returns {Promise<{cacheOk:boolean}>}
   */
  async function configureTransformersEnv(mod) {
    hideWebGpuLikeSubVid();
    const env = mod.env;
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    const cacheOk = await canUseBrowserCache();
    // SubVid always enables browser cache on HTTPS. We enable only when Cache API works
    // (localhost / secure context). Same cacheKey forever so reloads reuse weights.
    env.useBrowserCache = cacheOk;
    env.useWasmCache = cacheOk;
    env.cacheKey = 'sos-captions-transformers-v1';
    // Avoid wiping remote model cache between Whisper and NLLB configures.
    if (typeof env.backends === 'object' && env.backends && env.backends.onnx) {
      /* leave onnx defaults */
    }
    return { cacheOk: cacheOk };
  }

  /** Options shared by Whisper / NLLB — SubVid: dtype fp32, no explicit device. */
  function pipelineLoadOptions(progressCallback) {
    return {
      dtype: 'fp32',
      progress_callback: progressCallback || undefined
    };
  }

  global.CaptionsHfEnv = {
    configure: configureTransformersEnv,
    pipelineOptions: pipelineLoadOptions,
    canUseBrowserCache: canUseBrowserCache,
    hideWebGpu: hideWebGpuLikeSubVid
  };
})(typeof window !== 'undefined' ? window : globalThis);
