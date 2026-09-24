/**
 * Multilingual Whisper ASR + real auto language detection
 * (transformers.js 4.3 still defaults to English when language is omitted).
 * Load path aligned with SubVid: fp32 + WASM, Cache API only when available.
 */
(function (global) {
  'use strict';

  let recognizer = null;
  let ensurePromise = null;
  let hfMod = null;
  const MODEL = (global.CaptionsPolicy && global.CaptionsPolicy.whisperModel) || 'Xenova/whisper-tiny';

  async function ensurePipeline(onProgress, onLog) {
    if (recognizer) return recognizer;
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async function () {
      hfMod = await import('@huggingface/transformers');
      const hfEnv = global.CaptionsHfEnv;
      const configured = hfEnv
        ? await hfEnv.configure(hfMod)
        : { cacheOk: false };
      onLog &&
        onLog(
          'main: loading ' +
            MODEL +
            ' wasm/fp32' +
            (configured.cacheOk ? ' · cache on' : ' · cache off')
        );
      if (global.CaptionsHfEnv && global.CaptionsHfEnv.hideWebGpu) {
        global.CaptionsHfEnv.hideWebGpu();
      }
      const opts = hfEnv
        ? hfEnv.pipelineOptions(function (p) {
            onProgress && onProgress(p);
          })
        : {
            dtype: 'fp32',
            progress_callback: onProgress
          };
      recognizer = await hfMod.pipeline('automatic-speech-recognition', MODEL, opts);
      onLog && onLog('main: model ready');
      return recognizer;
    })();

    try {
      return await ensurePromise;
    } catch (err) {
      ensurePromise = null;
      throw err;
    }
  }

  function resolveWhisperLanguage(appCode) {
    const map = (global.CaptionsPolicy && global.CaptionsPolicy.whisperLanguages) || {};
    if (!appCode || appCode === 'auto') return null;
    return map[appCode] || null;
  }

  /** Map Whisper ISO code / name → app lang (en, ru, de…). */
  function whisperTokenToAppCode(tokenOrCode) {
    const raw = String(tokenOrCode || '')
      .toLowerCase()
      .replace(/[<>|]/g, '')
      .trim();
    if (!raw) return '';

    const NAME_TO_CODE = {
      english: 'en',
      chinese: 'zh',
      german: 'de',
      spanish: 'es',
      russian: 'ru',
      korean: 'ko',
      french: 'fr',
      japanese: 'ja',
      portuguese: 'pt',
      turkish: 'tr',
      polish: 'pl',
      catalan: 'ca',
      dutch: 'nl',
      arabic: 'ar',
      swedish: 'sv',
      italian: 'it',
      indonesian: 'id',
      hindi: 'hi',
      finnish: 'fi',
      vietnamese: 'vi',
      hebrew: 'he',
      ukrainian: 'uk',
      greek: 'el',
      malay: 'ms',
      czech: 'cs',
      romanian: 'ro',
      danish: 'da',
      hungarian: 'hu',
      tamil: 'ta',
      norwegian: 'no',
      thai: 'th',
      urdu: 'ur',
      croatian: 'hr',
      bulgarian: 'bg',
      lithuanian: 'lt',
      latin: 'la',
      maori: 'mi',
      malayalam: 'ml',
      welsh: 'cy',
      slovak: 'sk',
      telugu: 'te',
      persian: 'fa',
      latvian: 'lv',
      bengali: 'bn',
      serbian: 'sr',
      azerbaijani: 'az',
      slovenian: 'sl',
      kannada: 'kn',
      estonian: 'et',
      macedonian: 'mk',
      breton: 'br',
      basque: 'eu',
      icelandic: 'is',
      armenian: 'hy',
      nepali: 'ne',
      mongolian: 'mn',
      bosnian: 'bs',
      kazakh: 'kk',
      albanian: 'sq',
      swahili: 'sw',
      galician: 'gl',
      marathi: 'mr',
      punjabi: 'pa',
      sinhala: 'si',
      khmer: 'km',
      shona: 'sn',
      yoruba: 'yo',
      somali: 'so',
      afrikaans: 'af',
      occitan: 'oc',
      georgian: 'ka',
      belarusian: 'be',
      tajik: 'tg',
      sindhi: 'sd',
      gujarati: 'gu',
      amharic: 'am',
      yiddish: 'yi',
      lao: 'lo',
      uzbek: 'uz',
      faroese: 'fo',
      haitian: 'ht',
      pashto: 'ps',
      turkmen: 'tk',
      nynorsk: 'nn',
      maltese: 'mt',
      sanskrit: 'sa',
      luxembourgish: 'lb',
      myanmar: 'my',
      tibetan: 'bo',
      tagalog: 'tl',
      malagasy: 'mg',
      assamese: 'as',
      tatar: 'tt',
      hawaiian: 'haw',
      lingala: 'ln',
      hausa: 'ha',
      bashkir: 'ba',
      javanese: 'jv',
      sundanese: 'su'
    };

    if (NAME_TO_CODE[raw]) return NAME_TO_CODE[raw];
    const short = raw.slice(0, 2);
    const aliases = { iw: 'he', ji: 'yi', nb: 'no', nn: 'no', cm: 'zh', zh: 'zh' };
    return aliases[short] || short;
  }

  /**
   * Whisper-style language detection (single decoder step), like HF PR #1541.
   * @returns {Promise<{appCode:string,whisperCode:string,tokenId:number}>}
   */
  async function detectLanguage(audio, hooks) {
    const asr = await ensurePipeline(hooks && hooks.onProgress, hooks && hooks.onLog);
    const model = asr.model;
    const processor = asr.processor;
    const gc = model.generation_config;
    if (!gc || !gc.is_multilingual || !gc.lang_to_id) {
      return { appCode: 'en', whisperCode: 'en', tokenId: -1 };
    }

    const Tensor = hfMod.Tensor;
    const maxSamples = 16000 * 30;
    const clip = audio.length > maxSamples ? audio.subarray(0, maxSamples) : audio;
    hooks && hooks.onLog && hooks.onLog('detect: encoding audio for language…');

    const feats = await processor(clip);
    const input_features = feats.input_features;
    const sot = gc.decoder_start_token_id;
    const decoder_input_ids = new Tensor('int64', BigInt64Array.from([BigInt(sot)]), [1, 1]);

    const outputs = await model({
      input_features: input_features,
      decoder_input_ids: decoder_input_ids
    });

    const logits = outputs.logits;
    // dims: [batch, seq, vocab] — score language tokens at the last decoder step
    const dims = logits.dims || [];
    const seqLen = dims[1] || 1;
    const vocab = dims[2] || 0;
    let flat = logits.data;
    if (logits.ort_tensor && typeof logits.ort_tensor.getData === 'function') {
      flat = await logits.ort_tensor.getData();
    }
    if (!flat || !vocab) {
      hooks && hooks.onLog && hooks.onLog('detect: logits unavailable → en');
      return { appCode: 'en', whisperCode: 'en', tokenId: -1 };
    }
    const offset = (seqLen - 1) * vocab;

    const langIds = new Set(Object.values(gc.lang_to_id).map(Number));
    let best = -Infinity;
    let bestId = -1;
    for (const id of langIds) {
      const score = Number(flat[offset + id]);
      if (score > best) {
        best = score;
        bestId = id;
      }
    }

    const idToLang = {};
    Object.keys(gc.lang_to_id).forEach(function (k) {
      idToLang[gc.lang_to_id[k]] = k;
    });
    const token = idToLang[bestId] || '<|en|>';
    const whisperCode = String(token).replace(/^<\|/, '').replace(/\|>$/, '');
    const appCode = whisperTokenToAppCode(whisperCode);
    hooks && hooks.onLog && hooks.onLog('detect: language=' + whisperCode + ' → ' + appCode);
    return { appCode: appCode || 'en', whisperCode: whisperCode || 'en', tokenId: bestId };
  }

  /**
   * @param {Float32Array} audio
   * @param {{onProgress?:Function,onLog?:Function,sourceLang?:string}} hooks
   */
  async function transcribe(audio, hooks) {
    const asr = await ensurePipeline(hooks && hooks.onProgress, hooks && hooks.onLog);
    let sourceApp = hooks && hooks.sourceLang;
    let detected = null;

    if (!sourceApp || sourceApp === 'auto') {
      detected = await detectLanguage(audio, hooks);
      sourceApp = detected.appCode;
    }

    const whisperLang = resolveWhisperLanguage(sourceApp) || detected && detected.whisperCode || sourceApp;
    hooks &&
      hooks.onLog &&
      hooks.onLog('main: transcribing frames=' + audio.length + ' lang=' + whisperLang);

    const result = await asr(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      task: 'transcribe',
      language: whisperLang
    });

    // SubVid-compatible: consumers read output.language (2-letter) via normalizeLanguageCode
    result.detected_language = sourceApp;
    result.detected_whisper = whisperLang;
    result.language = sourceApp;
    return result;
  }

  global.CaptionsAsr = {
    transcribe: transcribe,
    detectLanguage: detectLanguage,
    ensure: function (hooks) {
      return ensurePipeline(hooks && hooks.onProgress, hooks && hooks.onLog);
    },
    isReady: function () {
      return !!recognizer;
    },
    modelId: MODEL,
    resolveWhisperLanguage: resolveWhisperLanguage,
    whisperTokenToAppCode: whisperTokenToAppCode
  };
})(typeof window !== 'undefined' ? window : globalThis);
