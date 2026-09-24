/**
 * Phase 3 policy — multilingual Whisper + NLLB translation (overlay only).
 */
(function (global) {
  'use strict';

  const NLLB = Object.freeze({
    en: 'eng_Latn',
    he: 'heb_Hebr',
    ar: 'arb_Arab',
    ru: 'rus_Cyrl',
    es: 'spa_Latn',
    fr: 'fra_Latn',
    de: 'deu_Latn',
    uk: 'ukr_Cyrl',
    it: 'ita_Latn',
    pt: 'por_Latn',
    pl: 'pol_Latn',
    tr: 'tur_Latn',
    nl: 'nld_Latn',
    zh: 'zho_Hans',
    ja: 'jpn_Jpan',
    ko: 'kor_Hang',
    hi: 'hin_Deva',
    fa: 'pes_Arab',
    yi: 'ydd_Hebr'
  });

  /** Whisper `language` option values (null = auto-detect). */
  const WHISPER_LANG = Object.freeze({
    auto: null,
    en: 'english',
    he: 'hebrew',
    ar: 'arabic',
    ru: 'russian',
    es: 'spanish',
    fr: 'french',
    de: 'german',
    uk: 'ukrainian',
    it: 'italian',
    pt: 'portuguese',
    pl: 'polish',
    tr: 'turkish',
    nl: 'dutch',
    zh: 'chinese',
    ja: 'japanese',
    ko: 'korean',
    hi: 'hindi',
    fa: 'persian',
    yi: 'yiddish'
  });

  const DISPLAY_LANGS = Object.freeze([
    'en', 'he', 'ar', 'ru', 'es', 'fr', 'de', 'uk', 'it', 'pt', 'pl', 'tr', 'nl', 'zh', 'ja', 'ko', 'hi'
  ]);

  const CaptionsPolicy = Object.freeze({
    phase: 3,
    mode: 'whisper+nllb',
    burnIn: false,
    exportVideo: false,
    aiEnabled: true,
    whisperEnabled: true,
    nllbEnabled: false,
    sosWire: false,
    overlaySyncSource: 'video.currentTime',
    whisperModel: 'Xenova/whisper-base',
    nllbModel: 'Xenova/nllb-200-distilled-600M',
    nllbCodes: NLLB,
    whisperLanguages: WHISPER_LANG,
    sampleTestUrl: 'SAMPLE/TEST1.mp4',
    sampleLegacyUrl: 'VIDEO/smple.mp4',
    sampleVideos: Object.freeze([
      Object.freeze({ id: 'TEST1', url: 'SAMPLE/TEST1.mp4', label: 'T1' }),
      Object.freeze({ id: 'TEST2', url: 'SAMPLE/TEST2.mp4', label: 'T2' }),
      Object.freeze({ id: 'TEST3', url: 'SAMPLE/TEST3.mp4', label: 'T3' }),
      Object.freeze({ id: 'TEST4', url: 'SAMPLE/TEST4.mp4', label: 'T4' })
    ]),
    defaultStyle: 'classic',
    typingEffect: false,
    defaultDisplayMode: 'movie',
    displayModes: Object.freeze(['movie', 'typing']),
    wordTimestamps: true,
    defaultLanguage: 'en',
    defaultSourceLanguage: 'auto',
    supportedLanguages: DISPLAY_LANGS,
    rtlLanguages: Object.freeze(['he', 'ar', 'fa', 'yi']),
    styles: Object.freeze(['classic', 'boxed', 'karaoke', 'neon', 'minimal']),
    fontSizes: Object.freeze(['sm', 'md', 'lg', 'xl']),
    defaultFontSize: 'md',
    maxCaptionChars: 220,
    mockOnly: false,
    expectedTest1Keywords: Object.freeze(['tickles', 'going on'])
  });

  global.CaptionsPolicy = CaptionsPolicy;
})(typeof window !== 'undefined' ? window : globalThis);
