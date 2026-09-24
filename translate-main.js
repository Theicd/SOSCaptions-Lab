/**
 * Online translation for caption cues (no local NLLB download).
 * Primary: Google Translate free endpoint (same pattern as PIXEL-ISR / Theicd).
 * Fallback: MyMemory.
 * Optional NLLB only if CaptionsPolicy.nllbEnabled === true.
 */
(function (global) {
  'use strict';

  let translator = null;
  let ensurePromise = null;
  let nllbFailed = false;
  const MODEL =
    (global.CaptionsPolicy && global.CaptionsPolicy.nllbModel) || 'Xenova/nllb-200-distilled-600M';

  function nllbAllowed() {
    return !!(global.CaptionsPolicy && global.CaptionsPolicy.nllbEnabled);
  }

  /** Google Translate free client codes (PIXEL-ISR uses iw for Hebrew). */
  const GOOGLE_LANG = Object.freeze({
    en: 'en',
    he: 'iw',
    ar: 'ar',
    ru: 'ru',
    es: 'es',
    fr: 'fr',
    de: 'de',
    uk: 'uk',
    it: 'it',
    pt: 'pt',
    pl: 'pl',
    tr: 'tr',
    nl: 'nl',
    zh: 'zh-CN',
    ja: 'ja',
    ko: 'ko',
    hi: 'hi',
    fa: 'fa',
    yi: 'yi'
  });

  function googleLang(appCode) {
    const c = String(appCode || '').toLowerCase();
    return GOOGLE_LANG[c] || c;
  }

  function nllbCode(appLang) {
    const map = (global.CaptionsPolicy && global.CaptionsPolicy.nllbCodes) || {};
    return map[appLang] || null;
  }

  function appLangOk(code) {
    return /^[a-z]{2}$/i.test(String(code || ''));
  }

  async function ensurePipeline(onProgress, onLog) {
    if (!nllbAllowed()) throw new Error('nllb disabled');
    if (translator) return translator;
    if (nllbFailed) throw new Error('nllb unavailable');
    if (ensurePromise) return ensurePromise;

    ensurePromise = (async function () {
      onLog && onLog('nllb: loading ' + MODEL);
      const mod = await import('@huggingface/transformers');
      if (global.CaptionsHfEnv) await global.CaptionsHfEnv.configure(mod);
      const opts = global.CaptionsHfEnv
        ? global.CaptionsHfEnv.pipelineOptions(function (p) {
            onProgress && onProgress(p);
          })
        : {
            dtype: 'fp32',
            progress_callback: onProgress
          };
      translator = await mod.pipeline('translation', MODEL, opts);
      onLog && onLog('nllb: model ready');
      return translator;
    })();

    try {
      return await ensurePromise;
    } catch (err) {
      ensurePromise = null;
      nllbFailed = true;
      throw err;
    }
  }

  /**
   * PIXEL-ISR style: no API key, browser hits Google Translate gtx endpoint.
   */
  async function translateViaGoogle(text, srcApp, tgtApp, hooks) {
    const q = String(text || '').trim();
    if (!q) return '';
    const sl = googleLang(srcApp);
    const tl = googleLang(tgtApp);
    if (!sl || !tl) throw new Error('unsupported lang pair ' + srcApp + '→' + tgtApp);
    hooks && hooks.onLog && hooks.onLog('google: ' + srcApp + '→' + tgtApp);
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
      encodeURIComponent(sl) +
      '&tl=' +
      encodeURIComponent(tl) +
      '&dt=t&q=' +
      encodeURIComponent(q.slice(0, 4500));
    const res = await fetch(url);
    if (!res.ok) throw new Error('google HTTP ' + res.status);
    const data = await res.json();
    let translated = '';
    if (data && data[0] && Array.isArray(data[0])) {
      data[0].forEach(function (item) {
        if (item && item[0]) translated += item[0];
      });
    }
    translated = String(translated || '').trim();
    if (!translated) throw new Error('google empty');
    return translated;
  }

  async function translateViaMyMemory(text, srcApp, tgtApp, hooks) {
    const q = String(text || '').trim();
    if (!q) return '';
    if (!appLangOk(srcApp) || !appLangOk(tgtApp)) {
      throw new Error('unsupported lang pair ' + srcApp + '→' + tgtApp);
    }
    hooks && hooks.onLog && hooks.onLog('mymemory: ' + srcApp + '→' + tgtApp);
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(q.slice(0, 450)) +
      '&langpair=' +
      encodeURIComponent(srcApp + '|' + tgtApp);
    const res = await fetch(url);
    if (!res.ok) throw new Error('mymemory HTTP ' + res.status);
    const data = await res.json();
    const out =
      (data && data.responseData && data.responseData.translatedText) ||
      (data && data.matches && data.matches[0] && data.matches[0].translation) ||
      '';
    const translated = String(out || '').trim();
    if (!translated || /MYMEMORY WARNING/i.test(translated)) {
      throw new Error('mymemory empty/limit');
    }
    return translated;
  }

  async function translateViaNllb(text, srcApp, tgtApp, hooks) {
    if (!nllbAllowed()) throw new Error('nllb disabled');
    const src = nllbCode(srcApp);
    const tgt = nllbCode(tgtApp);
    if (!src || !tgt) throw new Error('unsupported lang pair ' + srcApp + '→' + tgtApp);
    const pipe = await ensurePipeline(hooks && hooks.onProgress, hooks && hooks.onLog);
    const out = await pipe(String(text || ''), { src_lang: src, tgt_lang: tgt });
    const row = Array.isArray(out) ? out[0] : out;
    return String((row && (row.translation_text || row.translationText)) || '').trim();
  }

  async function translateText(text, srcApp, tgtApp, hooks) {
    if (srcApp === tgtApp) return String(text || '');
    // 1) Google (PIXEL-ISR)  2) MyMemory  3) optional NLLB if policy allows
    try {
      return await translateViaGoogle(text, srcApp, tgtApp, hooks);
    } catch (gErr) {
      hooks &&
        hooks.onLog &&
        hooks.onLog('google fail → mymemory: ' + (gErr && gErr.message ? gErr.message : gErr));
    }
    try {
      return await translateViaMyMemory(text, srcApp, tgtApp, hooks);
    } catch (mmErr) {
      if (nllbAllowed() && !nllbFailed) {
        try {
          return await translateViaNllb(text, srcApp, tgtApp, hooks);
        } catch (nllbErr) {
          /* fall through */
        }
      }
      throw new Error(
        'תרגום נכשל: ' + (mmErr && mmErr.message ? mmErr.message : mmErr)
      );
    }
  }

  async function translateCues(cues, srcApp, tgtApp, hooks) {
    if (srcApp === tgtApp) {
      return (cues || []).map(function (c) {
        return Object.assign({}, c, {
          words: (c.words && c.words.slice()) || [{ text: c.text, start: c.start, end: c.end }]
        });
      });
    }
    hooks && hooks.onLog && hooks.onLog('translate provider=google→mymemory');
    const out = [];
    for (let i = 0; i < (cues || []).length; i++) {
      const c = cues[i];
      const pct = Math.round(10 + (i / Math.max(1, cues.length)) * 85);
      if (hooks && hooks.onCueProgress) {
        hooks.onCueProgress({ part: i, total: cues.length, pct: pct });
      }
      hooks &&
        hooks.onLog &&
        hooks.onLog('translate cue ' + (i + 1) + '/' + cues.length);
      const text = await translateText(c.text, srcApp, tgtApp, hooks);
      const words = evenlyWords(text, c.start, c.end);
      out.push({
        id: c.id,
        start: c.start,
        end: c.end,
        text: text || c.text,
        words: words,
        manual: false
      });
      if (hooks && hooks.onCueProgress) {
        hooks.onCueProgress({
          part: i + 1,
          total: cues.length,
          pct: Math.min(96, Math.round(10 + ((i + 1) / Math.max(1, cues.length)) * 85))
        });
      }
      // Soft rate-limit for free endpoints
      if (i + 1 < cues.length) {
        await new Promise(function (r) {
          setTimeout(r, 80);
        });
      }
    }
    return out;
  }

  function evenlyWords(text, start, end) {
    const parts = String(text || '')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return [{ text: text || '', start: start, end: end }];
    const dur = Math.max(0.2, end - start);
    return parts.map(function (p, i) {
      const s = start + (i / parts.length) * dur;
      const e = start + ((i + 1) / parts.length) * dur;
      return { text: p, start: s, end: e };
    });
  }

  global.CaptionsTranslate = {
    ensure: function (hooks) {
      if (!nllbAllowed()) return Promise.resolve(null);
      return ensurePipeline(hooks && hooks.onProgress, hooks && hooks.onLog).catch(function (err) {
        nllbFailed = true;
        throw err;
      });
    },
    translateText: translateText,
    translateCues: translateCues,
    nllbCode: nllbCode,
    isReady: function () {
      return true;
    },
    modelId: 'google-gtx+mymemory'
  };
})(typeof window !== 'undefined' ? window : globalThis);
