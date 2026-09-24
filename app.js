/**
 * SOS Captions Lab — Phase 2
 * Word-synced typing overlay + TikTok mobile chrome.
 */
(function () {
  'use strict';

  const policy = window.CaptionsPolicy;
  const mock = window.MockCaptions;
  const audioApi = window.CaptionsAudio;
  const timing = window.CaptionsTiming;

  if (!policy || !mock || !audioApi || !timing) {
    console.error('[captions-lab] missing deps');
    return;
  }

  /** @type {{id:string,start:number,end:number,text:string,words?:any[]}[]} */
  let track = [];
  let lang = policy.defaultLanguage;
  let style = policy.defaultStyle;
  let objectUrl = null;
  let sourceUrl = null;
  /** @type {File|null} */
  let uploadedFile = null;
  let raf = 0;
  let scrubbing = false;
  let asrBusy = false;
  let lastFullText = '';
  /** @type {'mock'|'whisper'|'empty'} */
  let trackSource = 'empty';
  /** Original ASR language (app code). */
  let sourceLang = 'en';
  /** Cached translation tracks by app lang. */
  let translationCache = Object.create(null);
  /** @type {any[]} */
  let originalTrack = [];
  let translateBusy = false;
  let pendingTranslateLang = null;
  let editorOpen = false;
  let styleSheetOpen = false;
  let activeCapId = null;
  /** @type {'movie'|'typing'} */
  let displayMode = policy.defaultDisplayMode === 'typing' ? 'typing' : 'movie';
  /** @type {'sm'|'md'|'lg'|'xl'} */
  let fontSize = policy.defaultFontSize || 'md';
  /** @type {'booting'|'loading'|'ready'|'error'} */
  let readyState = 'booting';
  let sizePreviewTimer = 0;
  /** In-memory debug lines (console + tests); never shown in UI. */
  const debugLines = [];

  const el = {
    video: document.getElementById('video'),
    overlay: document.getElementById('captionOverlay'),
    captionText: document.getElementById('captionText'),
    dropHint: document.getElementById('dropHint'),
    phoneFrame: document.getElementById('phoneFrame'),
    btnPlay: document.getElementById('btnPlay'),
    btnPause: document.getElementById('btnPause'),
    scrub: document.getElementById('scrub'),
    timeLabel: document.getElementById('timeLabel'),
    speedSelect: document.getElementById('speedSelect'),
    btnSample: document.getElementById('btnSample'),
    btnTest1: document.getElementById('btnTest1'),
    btnTranscribe: document.getElementById('btnTranscribe'),
    btnUpload: document.getElementById('btnUpload'),
    btnFloatUpload: document.getElementById('btnFloatUpload'),
    btnFloatSamples: document.getElementById('btnFloatSamples'),
    btnFloatTest1: document.getElementById('btnFloatTest1'),
    btnFloatTranscribe: document.getElementById('btnFloatTranscribe'),
    samplePicker: document.getElementById('samplePicker'),
    readyProgress: document.getElementById('readyProgress'),
    readyTimer: document.getElementById('readyTimer'),
    readyHint: document.getElementById('readyHint'),
    btnOpenStyle: document.getElementById('btnOpenStyle'),
    btnCloseStyle: document.getElementById('btnCloseStyle'),
    btnStyleToEditor: document.getElementById('btnStyleToEditor'),
    styleSheet: document.getElementById('styleSheet'),
    styleGrid: document.getElementById('styleGrid'),
    displayModeToggle: null,
    displayModeToggleSheet: document.getElementById('displayModeToggleSheet'),
    sizeChips: null,
    sizeChipsSheet: document.getElementById('sizeChipsSheet'),
    sizePreviewSample: null,
    sizePreviewSampleSheet: document.getElementById('sizePreviewSampleSheet'),
    sizePreviewBox: null,
    sizePreviewBoxSheet: document.getElementById('sizePreviewBoxSheet'),
    btnOpenEditor: document.getElementById('btnOpenEditor'),
    btnCloseEditor: document.getElementById('btnCloseEditor'),
    btnCopyCaptions: document.getElementById('btnCopyCaptions'),
    editorSheet: document.getElementById('editorSheet'),
    sheetBackdrop: document.getElementById('sheetBackdrop'),
    fileInput: document.getElementById('fileInput'),
    langSelect: document.getElementById('langSelect'),
    sourceLangSelect: document.getElementById('sourceLangSelect'),
    detectedLangLabel: document.getElementById('detectedLangLabel'),
    posSelect: document.getElementById('posSelect'),
    cardsScroll: document.getElementById('cardsScroll'),
    statusText: document.getElementById('statusText'),
    activeId: document.getElementById('activeId'),
    asrLog: document.getElementById('asrLog'),
    phaseBadge: document.getElementById('phaseBadge'),
    readyDot: document.getElementById('readyDot'),
    readyDotFloat: document.getElementById('readyDotFloat'),
    readyLabel: document.getElementById('readyLabel')
  };

  let loadPulseTimer = 0;
  let loadStartedAt = 0;
  /** Soft progress while ASR runs (Whisper inference has no real %). */
  let workPhase = '';
  let workBasePct = 0;
  let workExpectMs = 0;

  function fmtElapsed(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function setLoadProgress(pct, hint) {
    const n = Math.max(0, Math.min(99, Math.round(Number(pct) || 0)));
    if (el.readyProgress) {
      el.readyProgress.hidden = false;
      el.readyProgress.textContent = n + '%';
      el.readyProgress.setAttribute('data-pct', String(n));
      el.readyProgress.removeAttribute('data-mode');
    }
    if (el.readyDotFloat) {
      el.readyDotFloat.style.setProperty('--pct', String(n));
      el.readyDotFloat.title = (hint || 'עובד') + ' · ' + n + '%';
    }
    if (el.readyHint) {
      el.readyHint.textContent = hint || 'טוען…';
    }
    if (el.readyTimer && loadStartedAt) {
      el.readyTimer.hidden = false;
      el.readyTimer.textContent = fmtElapsed(Date.now() - loadStartedAt);
    }
  }

  function clearLoadProgress() {
    if (el.readyProgress) {
      el.readyProgress.hidden = true;
      el.readyProgress.textContent = '';
      el.readyProgress.removeAttribute('data-pct');
      el.readyProgress.removeAttribute('data-mode');
    }
    if (el.readyTimer) {
      el.readyTimer.hidden = true;
      el.readyTimer.textContent = '0:00';
    }
  }

  function stopLoadPulse() {
    if (loadPulseTimer) {
      clearInterval(loadPulseTimer);
      loadPulseTimer = 0;
    }
    workPhase = '';
    workBasePct = 0;
    workExpectMs = 0;
  }

  function tickWorkUi() {
    const elapsed = Date.now() - loadStartedAt;
    if (el.readyTimer) {
      el.readyTimer.hidden = false;
      el.readyTimer.textContent = fmtElapsed(elapsed);
    }
    let pct = workBasePct;
    if (workExpectMs > 0 && workPhase === 'transcribe') {
      const soft = workBasePct + (90 - workBasePct) * Math.min(0.95, elapsed / workExpectMs);
      pct = soft;
    } else if (workPhase === 'extract') {
      pct = Math.min(12, 3 + elapsed / 800);
    } else if (workPhase === 'detect') {
      pct = Math.min(22, 14 + elapsed / 1200);
    } else if (workPhase === 'translate') {
      pct = Math.min(95, workBasePct + elapsed / 400);
    } else if (workPhase === 'download') {
      // real % comes from onModelProgress; keep timer only
      pct = Number(el.readyProgress && el.readyProgress.getAttribute('data-pct')) || workBasePct;
    }
    if (workPhase !== 'download') {
      if (el.readyProgress) {
        el.readyProgress.hidden = false;
        const n = Math.max(1, Math.min(99, Math.round(pct)));
        el.readyProgress.textContent = n + '%';
        el.readyProgress.setAttribute('data-pct', String(n));
      }
      if (el.readyDotFloat) {
        el.readyDotFloat.style.setProperty('--pct', String(Math.max(1, Math.min(99, Math.round(pct)))));
      }
    }
    if (el.readyHint && workPhase) {
      const labels = {
        extract: 'מחלץ אודיו',
        detect: 'מזהה שפה',
        transcribe: 'מתמלל',
        translate: 'מתרגם',
        download: 'מוריד מודל'
      };
      const base = labels[workPhase] || workPhase;
      el.readyHint.textContent = base;
      if (el.readyDotFloat) {
        const pctTxt = el.readyProgress && !el.readyProgress.hidden ? el.readyProgress.textContent : '';
        const t = el.readyTimer ? el.readyTimer.textContent : '';
        el.readyDotFloat.title = base + (pctTxt ? ' · ' + pctTxt : '') + (t ? ' · ' + t : '');
      }
    }
  }

  function startLoadPulse(label, opts) {
    stopLoadPulse();
    loadStartedAt = Date.now();
    workPhase = (opts && opts.phase) || 'download';
    workBasePct = (opts && opts.basePct) || 1;
    workExpectMs = (opts && opts.expectMs) || 0;
    setReadyState('loading', label || 'טוען…');
    setLoadProgress(workBasePct, label || 'מתחבר…');
    tickWorkUi();
    loadPulseTimer = setInterval(tickWorkUi, 250);
  }

  function setWorkPhase(phase, basePct, expectMs) {
    workPhase = phase || workPhase;
    if (basePct != null) workBasePct = basePct;
    if (expectMs != null) workExpectMs = expectMs;
    if (!loadPulseTimer) {
      loadStartedAt = loadStartedAt || Date.now();
      loadPulseTimer = setInterval(tickWorkUi, 250);
    }
    setReadyState('loading');
    tickWorkUi();
  }

  function setReadyState(state, label) {
    readyState = state;
    [el.readyDot, el.readyDotFloat].forEach(function (dot) {
      if (!dot) return;
      dot.setAttribute('data-state', state);
      const tip =
        state === 'ready'
          ? 'מוכן'
          : state === 'loading'
            ? 'עובד…'
            : state === 'error'
              ? 'שגיאה בהכנה'
              : 'מאתחל…';
      dot.title = tip;
      dot.setAttribute('aria-label', 'סטטוס: ' + tip);
      if (state === 'ready') {
        dot.textContent = '✓';
        if (dot === el.readyDotFloat) {
          dot.title = 'מוכן';
          dot.style.removeProperty('--pct');
        }
      } else if (state === 'error') {
        dot.textContent = '!';
      } else {
        dot.textContent = '';
      }
    });
    if (el.readyLabel && label) el.readyLabel.textContent = label;
    if (el.readyHint) {
      if (state === 'ready') {
        el.readyHint.textContent = 'מוכן';
        el.readyHint.hidden = false;
        clearLoadProgress();
        stopLoadPulse();
      } else if (state === 'error') {
        el.readyHint.textContent = label || 'שגיאה';
        el.readyHint.hidden = false;
        clearLoadProgress();
        stopLoadPulse();
      } else if (label && !workPhase) {
        el.readyHint.textContent = label;
        el.readyHint.hidden = false;
      }
    }
  }

  function labLog(msg) {
    const line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    console.log('[captions-lab]', msg);
    debugLines.push(line);
    if (debugLines.length > 200) debugLines.splice(0, debugLines.length - 200);
  }

  function isRtl(code) {
    return policy.rtlLanguages.indexOf(code) !== -1;
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function findActive(time) {
    const t = Number(time) || 0;
    for (let i = 0; i < track.length; i++) {
      const c = track[i];
      if (t >= c.start && t < c.end) return c;
    }
    return null;
  }

  function setCaption(cap, time) {
    const textEl = el.captionText;
    if (!cap || !cap.text) {
      textEl.textContent = '';
      textEl.classList.add('empty');
      textEl.classList.remove('is-visible', 'is-typing');
      textEl.removeAttribute('data-cap-id');
      el.activeId.textContent = '—';
      activeCapId = null;
      highlightCard(null);
      return;
    }

    const t = time != null ? time : el.video.currentTime || 0;
    const useTyping = displayMode === 'typing' && !cap.manual;
    let shown;
    if (useTyping) {
      shown = timing.typedTextForTime(cap, t);
    } else {
      // Movie-style: full line only inside [start, end)
      shown = t >= cap.start && t < cap.end ? cap.text : '';
    }
    if (!shown) {
      // Past / before window → hide completely (do not stick)
      textEl.textContent = '';
      textEl.classList.add('empty');
      textEl.classList.remove('is-visible', 'is-typing');
      textEl.removeAttribute('data-cap-id');
      el.activeId.textContent = '—';
      if (activeCapId !== null) {
        activeCapId = null;
        highlightCard(null);
      }
      return;
    }

    const stillTyping =
      useTyping && shown.length < String(cap.text).length && t < cap.end;
    textEl.textContent = shown;
    textEl.classList.remove('empty');
    textEl.classList.add('is-visible');
    textEl.classList.toggle('is-typing', !!stillTyping);
    textEl.setAttribute('data-cap-id', cap.id);
    el.activeId.textContent = cap.id;
    if (activeCapId !== cap.id) {
      activeCapId = cap.id;
      highlightCard(cap.id);
    }
  }

  function highlightCard(id) {
    const cards = el.cardsScroll.querySelectorAll('.cap-card');
    cards.forEach(function (card) {
      card.classList.toggle('is-active', !!(id && card.getAttribute('data-id') === id));
    });
  }

  function syncFromClock() {
    const t = el.video.currentTime || 0;
    if (!scrubbing) el.scrub.value = String(t);
    const dur = el.video.duration;
    el.timeLabel.textContent = fmt(t) + ' / ' + (isFinite(dur) ? fmt(dur) : '0:00');
    setCaption(findActive(t), t);
  }

  function tick() {
    syncFromClock();
    if (!el.video.paused && !el.video.ended) raf = requestAnimationFrame(tick);
    else raf = 0;
  }

  function startTick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function setStatus(msg) {
    el.statusText.textContent = msg;
  }

  function enableTransport(on) {
    el.btnPlay.disabled = !on;
    el.btnPause.disabled = !on;
    el.scrub.disabled = !on;
    if (el.speedSelect) el.speedSelect.disabled = !on;
    const canAsr = on && !asrBusy && policy.whisperEnabled;
    if (el.btnTranscribe) el.btnTranscribe.disabled = !canAsr;
    if (el.btnFloatTranscribe) el.btnFloatTranscribe.disabled = !canAsr;
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function syncVideoLayout() {
    if (!el.video || !el.phoneFrame) return;
    const w = el.video.videoWidth || 0;
    const h = el.video.videoHeight || 0;
    let orient = 'square';
    if (w > 0 && h > 0) {
      const ar = w / h;
      if (ar < 0.9) orient = 'portrait';
      else if (ar > 1.1) orient = 'landscape';
      labLog(
        'video layout ' + w + 'x' + h + ' ar=' + ar.toFixed(3) + ' orient=' + orient
      );
    }
    el.phoneFrame.setAttribute('data-orient', orient);
    el.phoneFrame.setAttribute('data-fit', 'fit');
  }

  function loadSource(src, label) {
    // Do NOT revoke src itself — only the previous blob.
    if (objectUrl && objectUrl !== src) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (!String(src).startsWith('blob:')) {
      revokeUrl();
      uploadedFile = null;
    }

    sourceUrl = src;
    el.video.pause();
    el.video.removeAttribute('src');
    el.video.load();
    el.video.src = src;
    el.dropHint.hidden = true;
    enableTransport(true);
    setStatus(label || 'וידאו נטען');
    labLog('load source: ' + (String(src).startsWith('blob:') ? 'blob:' + (label || 'upload') : src));

    el.video.onerror = function () {
      const code = el.video.error && el.video.error.code;
      labLog('video error code=' + code);
      setStatus('שגיאת וידאו · נסה קובץ אחר');
    };

    el.video.addEventListener(
      'loadedmetadata',
      function onMeta() {
        el.scrub.max = String(el.video.duration || 0);
        el.scrub.value = '0';
        syncVideoLayout();
        syncFromClock();
        setStatus((label || 'וידאו') + ' · ' + fmt(el.video.duration));
        labLog(
          'metadata duration=' +
            el.video.duration +
            ' size=' +
            el.video.videoWidth +
            'x' +
            el.video.videoHeight
        );
      },
      { once: true }
    );
  }

  function loadFile(file) {
    const type = String(file && file.type || '');
    const name = String(file && file.name || '').toLowerCase();
    const okExt = /\.(mp4|webm|mov|mkv|m4v|mp3|wav|ogg|aac)$/i.test(name);
    const ok =
      file &&
      (type.startsWith('video/') || type.startsWith('audio/') || (!type && okExt) || okExt);
    if (!ok) {
      setStatus('קובץ לא נתמך');
      labLog('reject file type=' + type + ' name=' + (file && file.name));
      return;
    }
    revokeUrl();
    uploadedFile = file;
    objectUrl = URL.createObjectURL(file);
    loadSource(objectUrl, file.name || 'העלאה');
  }

  function enrichMockWords(rows) {
    return rows.map(function (r) {
      if (r.words && r.words.length) return r;
      const text = String(r.text || '');
      const parts = text.split(/(\s+)/).filter(Boolean);
      const words = [];
      const wordParts = parts.filter(function (x) {
        return !/^\s+$/.test(x);
      });
      const dur = Math.max(0.4, r.end - r.start);
      let i = 0;
      wordParts.forEach(function (p) {
        const start = r.start + (i / Math.max(1, wordParts.length)) * dur;
        const end = start + dur / Math.max(1, wordParts.length);
        words.push({ text: p, start: start, end: end });
        i++;
      });
      return Object.assign({}, r, { words: words });
    });
  }

  function setTrack(rows, source) {
    const mediaDur = el.video && isFinite(el.video.duration) ? el.video.duration : 0;
    let next = (rows || []).map(function (r, i) {
      return {
        id: r.id || 'c' + (i + 1),
        start: Number(r.start) || 0,
        end: Number(r.end) || 0,
        text: String(r.text || '').trim(),
        words: r.words || null,
        manual: !!r.manual
      };
    });
    if (timing.clampTrackToMedia && mediaDur > 0) {
      next = timing.clampTrackToMedia(next, mediaDur);
    }
    track = next;
    trackSource = source || 'whisper';
    renderCards();
    syncFromClock();
  }

  function loadSample() {
    loadSource(policy.sampleLegacyUrl || 'VIDEO/smple.mp4', 'דוגמה ישנה');
    setTrack(enrichMockWords(mock.getTrack('en')), 'mock');
    lang = 'en';
    el.overlay.setAttribute('dir', 'ltr');
  }

  function loadTest1() {
    loadSampleById('TEST1');
  }

  function loadSampleById(id) {
    const list = policy.sampleVideos || [];
    let item = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        item = list[i];
        break;
      }
    }
    if (!item) {
      loadSource(policy.sampleTestUrl || 'SAMPLE/TEST1.mp4', 'SAMPLE/TEST1');
    } else {
      loadSource(item.url, 'SAMPLE/' + item.id);
    }
    track = [];
    originalTrack = [];
    translationCache = Object.create(null);
    trackSource = 'empty';
    lastFullText = '';
    renderCards();
    setCaption(null);
    setStatus((item ? item.id : id) + ' נטען · לחץ תמלל');
    labLog((item ? item.id : id) + ' ready — press Transcribe');
    if (el.samplePicker) el.samplePicker.hidden = true;
  }

  function toggleSamplePicker() {
    if (!el.samplePicker) return;
    el.samplePicker.hidden = !el.samplePicker.hidden;
  }

  function syncBackdrop() {
    if (!el.sheetBackdrop) return;
    el.sheetBackdrop.hidden = !(editorOpen || styleSheetOpen);
  }

  function openEditor() {
    editorOpen = true;
    styleSheetOpen = false;
    if (el.styleSheet) {
      el.styleSheet.hidden = true;
      el.styleSheet.classList.remove('is-open');
    }
    if (el.editorSheet) el.editorSheet.classList.add('is-open');
    syncBackdrop();
  }

  function closeEditor() {
    editorOpen = false;
    if (el.editorSheet) el.editorSheet.classList.remove('is-open');
    syncBackdrop();
  }

  function openStyleSheet() {
    styleSheetOpen = true;
    editorOpen = false;
    if (el.editorSheet) el.editorSheet.classList.remove('is-open');
    if (el.styleSheet) {
      el.styleSheet.hidden = false;
      el.styleSheet.classList.add('is-open');
    }
    syncDisplayModeUI();
    syncStyleUI();
    syncBackdrop();
  }

  function closeStyleSheet() {
    styleSheetOpen = false;
    if (el.styleSheet) {
      el.styleSheet.hidden = true;
      el.styleSheet.classList.remove('is-open');
    }
    syncBackdrop();
  }

  function closeAllSheets() {
    closeEditor();
    closeStyleSheet();
  }

  function syncDisplayModeUI() {
    [el.displayModeToggle, el.displayModeToggleSheet].forEach(function (root) {
      if (!root) return;
      root.querySelectorAll('[data-display]').forEach(function (btn) {
        const on = btn.getAttribute('data-display') === displayMode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    });
    if (el.overlay) el.overlay.setAttribute('data-display', displayMode);
  }

  function applyDisplayMode(mode) {
    displayMode = mode === 'typing' ? 'typing' : 'movie';
    syncDisplayModeUI();
    syncFromClock();
    setStatus(
      displayMode === 'movie'
        ? 'הצגה: רגיל · כמו בסרט'
        : 'הצגה: הכתבה · מילה־מילה'
    );
  }

  function syncStyleUI() {
    if (el.styleGrid) {
      el.styleGrid.querySelectorAll('[data-style]').forEach(function (card) {
        card.classList.toggle('is-active', card.getAttribute('data-style') === style);
      });
    }
  }

  function onModelProgress(p, opts) {
    if (!p) return;
    const quiet = !!(opts && opts.quiet);
    // Background NLLB must NOT flip the green ready indicator back to spinner.
    if (!quiet) {
      if (!loadPulseTimer) {
        startLoadPulse('מוריד מודל', { phase: 'download', basePct: 1 });
      } else {
        workPhase = 'download';
        setReadyState('loading');
      }
    }
    if (p.status === 'progress' || p.status === 'progress_total') {
      const pct = Math.round(Number(p.progress) || 0);
      const file = String(p.file || p.name || '').split('/').pop() || 'קובץ';
      if (quiet && readyState === 'ready') {
        if (el.readyHint) el.readyHint.textContent = 'מוכן · תרגום ' + pct + '%';
        if (el.readyProgress) {
          el.readyProgress.hidden = false;
          el.readyProgress.textContent = pct + '%';
          el.readyProgress.setAttribute('data-mode', 'bg');
        }
        setStatus('תרגום ברקע: ' + pct + '% · ' + file);
      } else {
        workBasePct = pct;
        setLoadProgress(pct, 'מוריד ' + pct + '%');
        setStatus('מודל: ' + pct + '% · ' + file);
        if (el.readyLabel) el.readyLabel.textContent = 'מוריד ' + pct + '%';
        if (el.readyTimer && loadStartedAt) {
          el.readyTimer.hidden = false;
          el.readyTimer.textContent = fmtElapsed(Date.now() - loadStartedAt);
        }
      }
    } else if (p.status === 'initiate' || p.status === 'download') {
      if (quiet && readyState === 'ready') {
        if (el.readyHint) el.readyHint.textContent = 'מוכן · מכין תרגום…';
      } else {
        setLoadProgress(2, 'מתחיל הורדה…');
        setStatus('מודל: ' + p.status);
      }
    } else if (p.status === 'done') {
      if (!(quiet && readyState === 'ready')) {
        setLoadProgress(99, 'מכין מנוע…');
      }
    } else if (p.status && !quiet) {
      setStatus('מודל: ' + p.status);
      if (el.readyHint) el.readyHint.textContent = String(p.status);
    }
  }

  function onAsrProgress(p) {
    onModelProgress(p, { quiet: false });
  }

  function onBgTranslateProgress(p) {
    onModelProgress(p, { quiet: true });
  }

  async function reportHfCacheHealth() {
    try {
      if (typeof caches === 'undefined' || !caches) {
        labLog('cache health: Cache API unavailable (use http://127.0.0.1 for persistence)');
        return { ok: false, files: 0 };
      }
      const name = 'sos-captions-transformers-v1';
      const keys = await caches.keys();
      const has = keys.indexOf(name) !== -1;
      let files = 0;
      if (has) {
        const c = await caches.open(name);
        const reqs = await c.keys();
        files = reqs.length;
      }
      labLog('cache health: store=' + name + ' present=' + has + ' files=' + files);
      return { ok: has && files > 0, files: files };
    } catch (err) {
      labLog('cache health FAIL: ' + (err && err.message ? err.message : err));
      return { ok: false, files: 0 };
    }
  }

  async function warmAsr() {
    if (!window.CaptionsAsr) {
      setReadyState('error', 'ASR חסר');
      return;
    }
    setReadyState('loading', 'מכין מודל…');
    startLoadPulse('מכין מודל', { phase: 'download', basePct: 1 });
    const WARM_MS = 240000;
    try {
      const ensurePromise = window.CaptionsAsr.ensure({
        onProgress: onAsrProgress,
        onLog: labLog
      });
      const timed = Promise.race([
        ensurePromise,
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error('timeout ' + WARM_MS / 1000 + 's — בדוק רשת / HuggingFace'));
          }, WARM_MS);
        })
      ]);
      await timed;
      const health = await reportHfCacheHealth();
      setReadyState('ready', 'מוכן');
      setStatus(
        health.ok
          ? 'מודל מוכן · שמור בקאש הדפדפן'
          : 'מודל מוכן · בחר דוגמה → תמלל'
      );
      labLog('warm-up ready (whisper)');
      // NLLB (~600MB) is optional subtitle translation — NOT needed for same-language captions.
      // Do not preload. SubVid also loads translation only when subtitle lang ≠ audio lang.
      if (policy.nllbEnabled && window.CaptionsTranslate && window.CaptionsTranslate.ensure) {
        labLog('nllb enabled in policy but deferred until user asks for translation');
      }
    } catch (err) {
      const m = String(err && err.message ? err.message : err);
      setReadyState('error', 'שגיאה');
      setStatus('הכנה נכשלה: ' + m);
      if (el.readyHint) el.readyHint.textContent = 'כשל טעינה';
      labLog('warm-up FAIL: ' + m);
    } finally {
      stopLoadPulse();
    }
  }

  function registerShellSw() {
    if (!('serviceWorker' in navigator)) return;
    // Drop ancient broken shell caches that forced useBrowserCache=true.
    if (typeof caches !== 'undefined' && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) {
          if (
            k.indexOf('sos-captions-lab-shell-v1') === 0 ||
            k.indexOf('sos-captions-lab-shell-v2') === 0
          ) {
            caches.delete(k);
          }
        });
      });
    }
    navigator.serviceWorker.register('./sw.js').then(
      function (reg) {
        labLog('SW registered scope=' + reg.scope);
        if (reg.update) reg.update();
      },
      function (err) {
        labLog('SW register fail: ' + (err && err.message ? err.message : err));
      }
    );
  }

  async function transcribeAudio(audio) {
    if (!window.CaptionsAsr) throw new Error('CaptionsAsr missing');
    const srcSel =
      (el.sourceLangSelect && el.sourceLangSelect.value) || policy.defaultSourceLanguage || 'auto';
    return window.CaptionsAsr.transcribe(audio, {
      onProgress: onAsrProgress,
      onLog: labLog,
      sourceLang: srcSel
    });
  }

  async function runTranscribe() {
    if (asrBusy) return;
    if (!sourceUrl && !el.video.src) {
      setStatus('אין וידאו');
      return;
    }
    asrBusy = true;
    enableTransport(true);
    const jobStarted = Date.now();
    startLoadPulse('מחלץ אודיו', { phase: 'extract', basePct: 3 });
    setStatus('מחלץ אודיו…');
    labLog('ASR start');

    try {
      const url = sourceUrl || el.video.currentSrc || el.video.src;
      labLog('extract audio from ' + (uploadedFile ? 'File:' + uploadedFile.name : url));
      let audio;
      if (uploadedFile && window.CaptionsAudio.extractMono16kFromFile) {
        audio = await window.CaptionsAudio.extractMono16kFromFile(uploadedFile);
      } else if (uploadedFile) {
        const buf = await uploadedFile.arrayBuffer();
        audio = await audioApi.extractMono16k(buf);
      } else {
        audio = await audioApi.extractMono16kFromUrl(url);
      }
      const audioSec = audio.length / 16000;
      labLog('audio frames=' + audio.length + ' dur=' + audioSec.toFixed(2) + 's');
      // Whisper base on WASM is often ~2–6× realtime; soft ETA for the progress bar.
      const expectMs = Math.max(8000, Math.round(audioSec * 3500));
      setWorkPhase('transcribe', 18, expectMs);
      setStatus('מתמלל… · ' + audioSec.toFixed(0) + 'ש׳ אודיו');
      const result = await transcribeAudio(audio);
      lastFullText = String((result && result.text) || '').trim();
      labLog('ASR text: ' + lastFullText);

      const srcSel =
        (el.sourceLangSelect && el.sourceLangSelect.value) || policy.defaultSourceLanguage || 'auto';
      const detected =
        (result && (result.detected_language || result.language)) ||
        (srcSel !== 'auto' ? srcSel : 'en');
      sourceLang = String(detected).toLowerCase().slice(0, 2);
      if (policy.whisperLanguages && !(sourceLang in policy.whisperLanguages) && sourceLang !== 'auto') {
        // keep as-is if we have nllb code
        if (!(policy.nllbCodes && policy.nllbCodes[sourceLang])) sourceLang = 'en';
      }
      labLog('detected language=' + sourceLang + ' (audio select=' + srcSel + ')');
      if (el.detectedLangLabel) {
        el.detectedLangLabel.textContent = 'זוהה: ' + sourceLang;
        el.detectedLangLabel.hidden = false;
      }

      const mediaDur = el.video.duration || audioSec || 10;
      let rows = timing.asrResultToCues(result, mediaDur);
      if (timing.clampTrackToMedia) {
        rows = timing.clampTrackToMedia(rows, mediaDur);
      }
      if (!rows.length) throw new Error('empty transcript');
      labLog(
        'cues: ' +
          rows
            .map(function (r) {
              return r.id + '[' + r.start.toFixed(2) + '-' + r.end.toFixed(2) + ']';
            })
            .join(', ') +
          ' · media=' +
          mediaDur.toFixed(2) +
          's'
      );
      originalTrack = rows.map(function (r) {
        return Object.assign({}, r, { words: r.words ? r.words.slice() : null });
      });
      translationCache = Object.create(null);
      translationCache[sourceLang] = originalTrack;

      // SubVid-style: show selected subtitle language (translate if needed)
      const wantLang = (el.langSelect && el.langSelect.value) || sourceLang;
      lang = sourceLang;
      setTrack(originalTrack, 'whisper');
      el.overlay.setAttribute('dir', isRtl(sourceLang) ? 'rtl' : 'ltr');
      el.video.currentTime = Math.max(0, rows[0].start);
      syncFromClock();
      if (el.phaseBadge) el.phaseBadge.textContent = 'LIVE ASR';
      // TikTok UX (mobile + desktop): stay on fullscreen video
      closeAllSheets();

      const elapsedJob = fmtElapsed(Date.now() - jobStarted);
      labLog('applied ' + rows.length + ' cues · sourceLang=' + sourceLang + ' · took ' + elapsedJob);
      setReadyState('ready', 'מוכן');
      setStatus(
        'תמלול מוכן · ' +
          sourceLang +
          ' · ' +
          rows.length +
          ' מקטעים · ' +
          elapsedJob +
          (wantLang !== sourceLang ? ' →' + wantLang : '')
      );

      if (wantLang && wantLang !== sourceLang) {
        labLog('auto-translate to display lang ' + wantLang);
        await applyLang(wantLang);
      } else if (el.langSelect) {
        el.langSelect.value = sourceLang;
      }
    } catch (err) {
      const m = String(err && err.message ? err.message : err);
      labLog('ASR FAIL: ' + m);
      setReadyState('error', 'שגיאה');
      setStatus('שגיאת תמלול: ' + m);
      console.error('[captions-lab] ASR', err);
    } finally {
      asrBusy = false;
      stopLoadPulse();
      if (readyState === 'loading') setReadyState('ready', 'מוכן');
      enableTransport(!!el.video.src);
    }
  }

  async function applyLang(code) {
    const next = String(code || 'en');
    if (el.langSelect) el.langSelect.value = next;

    if (trackSource !== 'whisper' || !originalTrack.length) {
      lang = next;
      setTrack(enrichMockWords(mock.getTrack(next)), 'mock');
      el.overlay.setAttribute('dir', isRtl(next) ? 'rtl' : 'ltr');
      setStatus('שפה: ' + next + (isRtl(next) ? ' · RTL' : ' · LTR'));
      return;
    }

    if (next === sourceLang) {
      lang = next;
      setTrack(originalTrack, 'whisper');
      el.overlay.setAttribute('dir', isRtl(next) ? 'rtl' : 'ltr');
      setStatus('כתוביות מקור · ' + next);
      return;
    }

    if (translationCache[next]) {
      lang = next;
      setTrack(translationCache[next], 'whisper');
      el.overlay.setAttribute('dir', isRtl(next) ? 'rtl' : 'ltr');
      setStatus('תרגום · ' + sourceLang + '→' + next);
      return;
    }

    if (!window.CaptionsTranslate) {
      setStatus('תרגום לא זמין');
      return;
    }
    if (translateBusy) {
      pendingTranslateLang = next;
      return;
    }
    translateBusy = true;
    pendingTranslateLang = null;
    startLoadPulse('מתרגם', { phase: 'translate', basePct: 40 });
    setStatus('מתרגם ל־' + next + ' · Google (בלי מפתח)');
    labLog('translate ' + sourceLang + '→' + next + ' (google/mymemory)');
    try {
      const translated = await window.CaptionsTranslate.translateCues(
        originalTrack,
        sourceLang,
        next,
        {
          onLog: labLog
        }
      );
      const mediaDur = el.video.duration || 0;
      const clamped =
        timing.clampTrackToMedia && mediaDur
          ? timing.clampTrackToMedia(translated, mediaDur)
          : translated;
      translationCache[next] = clamped;
      // Ignore stale result if user already picked another language.
      if (pendingTranslateLang && pendingTranslateLang !== next) {
        labLog('translate stale skip lang=' + next + ' pending=' + pendingTranslateLang);
      } else {
        lang = next;
        setTrack(clamped, 'whisper');
        el.overlay.setAttribute('dir', isRtl(next) ? 'rtl' : 'ltr');
        setStatus('תרגום מוכן · ' + sourceLang + '→' + next);
        labLog('translate done cues=' + clamped.length + ' lang=' + next);
      }
      setReadyState('ready', 'מוכן');
    } catch (err) {
      const m = String(err && err.message ? err.message : err);
      labLog('translate FAIL: ' + m);
      const offline = /fetch|network|internet|disconnected|failed to fetch/i.test(m);
      setStatus(
        offline
          ? 'אין רשת לתרגום — בדוק אינטרנט ונסה שוב'
          : 'שגיאת תרגום: ' + m
      );
      if (el.langSelect && !pendingTranslateLang) el.langSelect.value = lang;
      setReadyState('ready', 'מוכן');
    } finally {
      translateBusy = false;
      stopLoadPulse();
      const queued = pendingTranslateLang;
      pendingTranslateLang = null;
      if (queued && queued !== lang) {
        applyLang(queued);
      }
    }
  }

  function syncSizeUI() {
    const map = { sm: '18px', md: '24px', lg: '32px', xl: '42px' };
    const px = map[fontSize] || map.md;
    [el.sizeChips, el.sizeChipsSheet].forEach(function (root) {
      if (!root) return;
      root.querySelectorAll('[data-size]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-size') === fontSize);
      });
    });
    [el.sizePreviewSample, el.sizePreviewSampleSheet].forEach(function (sample) {
      if (!sample) return;
      sample.style.fontSize = px;
      sample.parentElement && sample.parentElement.style.setProperty('--cap-preview-size', px);
    });
  }

  function flashSizePreviewOnVideo() {
    if (!el.captionText) return;
    const prev = el.captionText.textContent;
    const hadVisible = el.captionText.classList.contains('is-visible');
    const active = findActive(el.video.currentTime || 0);
    if (active && active.text) {
      syncFromClock();
      return;
    }
    el.captionText.textContent = 'Aa דוגמה';
    el.captionText.classList.remove('empty');
    el.captionText.classList.add('is-visible');
    if (sizePreviewTimer) clearTimeout(sizePreviewTimer);
    sizePreviewTimer = setTimeout(function () {
      if (!findActive(el.video.currentTime || 0)) {
        el.captionText.textContent = prev || '';
        el.captionText.classList.toggle('empty', !prev);
        el.captionText.classList.toggle('is-visible', !!hadVisible && !!prev);
      } else {
        syncFromClock();
      }
      sizePreviewTimer = 0;
    }, 1200);
  }

  function applyFontSize(size) {
    const allowed = policy.fontSizes || ['sm', 'md', 'lg', 'xl'];
    if (allowed.indexOf(size) === -1) return;
    fontSize = size;
    if (el.phoneFrame) el.phoneFrame.setAttribute('data-cap-size', size);
    syncSizeUI();
    flashSizePreviewOnVideo();
    setStatus('גודל: ' + size);
  }

  function applyStyle(name) {
    if (policy.styles.indexOf(name) === -1) return;
    style = name;
    const targets = [el.phoneFrame, el.sizePreviewBox, el.sizePreviewBoxSheet];
    targets.forEach(function (node) {
      if (!node) return;
      policy.styles.forEach(function (s) {
        node.classList.remove('cap-style-' + s);
      });
      node.classList.add('cap-style-' + name);
    });
    syncStyleUI();
    syncSizeUI();
    setStatus('סגנון: ' + name);
  }

  function applyPosition(pos) {
    el.overlay.setAttribute('data-position', pos);
  }

  function buildCaptionsExportText() {
    const lines = [];
    const modelId =
      (window.CaptionsAsr && window.CaptionsAsr.modelId) ||
      policy.whisperModel ||
      'whisper';
    const srcSel =
      (el.sourceLangSelect && el.sourceLangSelect.value) || policy.defaultSourceLanguage || 'auto';
    lines.push('SOS Captions Lab — תמלול');
    lines.push('model: ' + modelId);
    lines.push('audioLang: ' + sourceLang + ' (select=' + srcSel + ')');
    lines.push('displayLang: ' + lang);
    lines.push('cues: ' + track.length);
    lines.push('source: ' + trackSource);
    lines.push('');
    lines.push('—— שורות ——');
    track.forEach(function (cap, idx) {
      lines.push(
        '[' +
          (idx + 1) +
          '] ' +
          fmt(cap.start) +
          ' – ' +
          fmt(cap.end) +
          (cap.id ? ' · ' + cap.id : '')
      );
      lines.push(String(cap.text || '').trim());
      lines.push('');
    });
    lines.push('—— מלל רציף ——');
    lines.push(
      track
        .map(function (c) {
          return String(c.text || '').trim();
        })
        .filter(Boolean)
        .join(' ')
    );
    return lines.join('\n');
  }

  async function copyAllCaptions() {
    if (!track.length) {
      setStatus('אין מלל להעתקה');
      return;
    }
    const text = buildCaptionsExportText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setStatus('הועתק · ' + track.length + ' שורות');
      labLog('copied captions chars=' + text.length);
      if (el.btnCopyCaptions) {
        el.btnCopyCaptions.classList.add('is-done');
        el.btnCopyCaptions.textContent = 'הועתק ✓';
        setTimeout(function () {
          el.btnCopyCaptions.classList.remove('is-done');
          el.btnCopyCaptions.textContent = 'העתק';
        }, 1600);
      }
    } catch (err) {
      const m = String(err && err.message ? err.message : err);
      setStatus('העתקה נכשלה: ' + m);
      labLog('copy FAIL: ' + m);
    }
  }

  function renderCards() {
    const rtl = isRtl(lang);
    el.cardsScroll.innerHTML = '';
    if (!track.length) {
      const empty = document.createElement('div');
      empty.className = 'cards-empty';
      empty.setAttribute('data-testid', 'cards-empty');
      empty.textContent = 'אין כתוביות עדיין · תמלל וידאו ואז ערוך כאן';
      el.cardsScroll.appendChild(empty);
      return;
    }
    track.forEach(function (cap, idx) {
      const card = document.createElement('div');
      card.className = 'cap-card';
      card.setAttribute('data-id', cap.id);
      card.setAttribute('data-testid', 'cap-card-' + cap.id);
      card.setAttribute('dir', rtl ? 'rtl' : 'ltr');

      const meta = document.createElement('div');
      meta.className = 'meta';
      const metaLeft = document.createElement('span');
      metaLeft.textContent = '#' + (idx + 1) + ' · ' + cap.id;
      const metaRight = document.createElement('span');
      metaRight.textContent = '\u200E' + fmt(cap.start) + ' – ' + fmt(cap.end);
      metaRight.setAttribute('dir', 'ltr');
      const seekBtn = document.createElement('button');
      seekBtn.type = 'button';
      seekBtn.className = 'chip';
      seekBtn.textContent = '▶';
      seekBtn.setAttribute('data-testid', 'cap-seek-' + cap.id);
      seekBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!el.video.src) return;
        el.video.currentTime = cap.start + 0.02;
        syncFromClock();
      });
      meta.appendChild(metaLeft);
      meta.appendChild(metaRight);
      meta.appendChild(seekBtn);

      const ta = document.createElement('textarea');
      ta.value = cap.text;
      ta.setAttribute('data-testid', 'cap-edit-' + cap.id);
      ta.setAttribute('maxlength', String(policy.maxCaptionChars));
      ta.addEventListener('input', function () {
        cap.text = ta.value.slice(0, policy.maxCaptionChars);
        cap.manual = true;
        cap.words = [{ text: cap.text, start: cap.start, end: Math.max(cap.end, cap.start + 0.4) }];
        const active = findActive(el.video.currentTime || 0);
        if (active && active.id === cap.id) setCaption(cap, el.video.currentTime || 0);
      });

      card.appendChild(meta);
      card.appendChild(ta);
      el.cardsScroll.appendChild(card);
    });
  }

  el.btnPlay.addEventListener('click', function () {
    el.video.play().then(startTick).catch(function () {
      setStatus('נגינה נחסמה');
    });
  });
  el.btnPause.addEventListener('click', function () {
    el.video.pause();
    syncFromClock();
  });
  el.video.addEventListener('play', startTick);
  el.video.addEventListener('pause', syncFromClock);
  el.video.addEventListener('seeked', syncFromClock);
  el.video.addEventListener('timeupdate', function () {
    if (!raf) syncFromClock();
  });
  el.video.addEventListener('ended', function () {
    setCaption(null);
    syncFromClock();
    setStatus('הסתיים');
  });

  el.scrub.addEventListener('pointerdown', function () {
    scrubbing = true;
  });
  el.scrub.addEventListener('pointerup', function () {
    scrubbing = false;
  });
  el.scrub.addEventListener('input', function () {
    el.video.currentTime = Number(el.scrub.value);
    syncFromClock();
  });
  if (el.speedSelect) {
    el.speedSelect.addEventListener('change', function () {
      el.video.playbackRate = Number(el.speedSelect.value) || 1;
      setStatus('מהירות ' + el.video.playbackRate + '×');
    });
  }

  function triggerUpload() {
    el.fileInput.click();
  }

  if (el.btnUpload) el.btnUpload.addEventListener('click', triggerUpload);
  if (el.btnFloatUpload) el.btnFloatUpload.addEventListener('click', triggerUpload);
  el.dropHint.addEventListener('click', triggerUpload);
  el.fileInput.addEventListener('change', function () {
    const f = el.fileInput.files && el.fileInput.files[0];
    if (f) loadFile(f);
  });
  if (el.btnSample) el.btnSample.addEventListener('click', loadSample);
  if (el.btnTest1) el.btnTest1.addEventListener('click', loadTest1);
  if (el.btnFloatTest1) el.btnFloatTest1.addEventListener('click', loadTest1);
  if (el.btnFloatSamples) el.btnFloatSamples.addEventListener('click', toggleSamplePicker);
  if (el.samplePicker) {
    el.samplePicker.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-sample]');
      if (!btn) return;
      loadSampleById(btn.getAttribute('data-sample'));
    });
  }
  if (el.btnTranscribe) el.btnTranscribe.addEventListener('click', runTranscribe);
  if (el.btnFloatTranscribe) el.btnFloatTranscribe.addEventListener('click', runTranscribe);
  if (el.btnOpenStyle) el.btnOpenStyle.addEventListener('click', openStyleSheet);
  if (el.btnCloseStyle) el.btnCloseStyle.addEventListener('click', closeStyleSheet);
  if (el.btnStyleToEditor) {
    el.btnStyleToEditor.addEventListener('click', function () {
      closeStyleSheet();
      openEditor();
    });
  }
  if (el.btnOpenEditor) el.btnOpenEditor.addEventListener('click', openEditor);
  if (el.btnCloseEditor) el.btnCloseEditor.addEventListener('click', closeEditor);
  if (el.btnCopyCaptions) el.btnCopyCaptions.addEventListener('click', copyAllCaptions);
  if (el.styleSheet) {
    el.styleSheet.addEventListener('click', function (e) {
      if (e.target === el.styleSheet) closeStyleSheet();
    });
  }
  if (el.sheetBackdrop) el.sheetBackdrop.addEventListener('click', closeAllSheets);

  function bindDisplayToggle(root) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-display]');
      if (!btn) return;
      applyDisplayMode(btn.getAttribute('data-display'));
    });
  }
  bindDisplayToggle(el.displayModeToggle);
  bindDisplayToggle(el.displayModeToggleSheet);

  ;['dragenter', 'dragover'].forEach(function (ev) {
    el.dropHint.addEventListener(ev, function (e) {
      e.preventDefault();
      el.dropHint.classList.add('is-drag');
    });
  });
  ;['dragleave', 'drop'].forEach(function (ev) {
    el.dropHint.addEventListener(ev, function (e) {
      e.preventDefault();
      el.dropHint.classList.remove('is-drag');
    });
  });
  el.dropHint.addEventListener('drop', function (e) {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  el.langSelect.addEventListener('change', function () {
    applyLang(el.langSelect.value);
  });
  el.posSelect.addEventListener('change', function () {
    applyPosition(el.posSelect.value);
  });
  if (el.styleGrid) {
    el.styleGrid.addEventListener('click', function (e) {
      const card = e.target.closest('[data-style]');
      if (!card) return;
      applyStyle(card.getAttribute('data-style'));
    });
  }

  function bindSizeChips(root) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-size]');
      if (!btn) return;
      applyFontSize(btn.getAttribute('data-size'));
    });
  }
  bindSizeChips(el.sizeChips);
  bindSizeChips(el.sizeChipsSheet);

  window.CaptionsLab = {
    policy: policy,
    getLang: function () {
      return lang;
    },
    getStyle: function () {
      return style;
    },
    getDisplayMode: function () {
      return displayMode;
    },
    getFontSize: function () {
      return fontSize;
    },
    applyFontSize: applyFontSize,
    syncVideoLayout: syncVideoLayout,
    applyDisplayMode: applyDisplayMode,
    openStyleSheet: openStyleSheet,
    closeStyleSheet: closeStyleSheet,
    isStyleSheetOpen: function () {
      return styleSheetOpen;
    },
    getTrack: function () {
      return track.slice();
    },
    getTrackSource: function () {
      return trackSource;
    },
    getLastFullText: function () {
      return lastFullText;
    },
    getSourceLang: function () {
      return sourceLang;
    },
    getDetectedLabel: function () {
      return el.detectedLangLabel && !el.detectedLangLabel.hidden
        ? el.detectedLangLabel.textContent
        : '';
    },
    getTranslationCache: function () {
      return Object.keys(translationCache);
    },
    findActive: findActive,
    syncFromClock: syncFromClock,
    typedTextForTime: timing.typedTextForTime,
    applyLang: applyLang,
    applyStyle: applyStyle,
    loadSample: loadSample,
    loadTest1: loadTest1,
    loadSampleById: loadSampleById,
    runTranscribe: runTranscribe,
    openEditor: openEditor,
    closeEditor: closeEditor,
    isEditorOpen: function () {
      return editorOpen;
    },
    getActiveCaption: function () {
      return findActive(el.video.currentTime || 0);
    },
    getVideo: function () {
      return el.video;
    },
    getLogs: function () {
      return debugLines.join('\n');
    },
    getReadyState: function () {
      return readyState;
    },
    getOverlayText: function () {
      return el.captionText ? el.captionText.textContent : '';
    },
    warmAsr: warmAsr,
    _testInjectWhisperTrack: function (rows, src) {
      sourceLang = src || 'en';
      originalTrack = (rows || []).map(function (r) {
        return Object.assign({}, r);
      });
      translationCache = Object.create(null);
      translationCache[sourceLang] = originalTrack;
      lang = sourceLang;
      if (el.langSelect) el.langSelect.value = sourceLang;
      setTrack(originalTrack, 'whisper');
      el.overlay.setAttribute('dir', isRtl(sourceLang) ? 'rtl' : 'ltr');
    }
  };

  el.langSelect.value = policy.defaultLanguage;
  applyDisplayMode(displayMode);
  applyFontSize(fontSize);
  applyStyle(policy.defaultStyle);
  if (el.phoneFrame) el.phoneFrame.setAttribute('data-fit', 'fit');
  applyPosition('bottom');
  renderCards();
  enableTransport(false);
  closeAllSheets();
  setReadyState('booting', 'מאתחל…');
  setStatus('מכין מודל Whisper…');
  labLog(
    'phase ' +
      policy.phase +
      ' model=' +
      policy.whisperModel +
      ' nllb=' +
      (policy.nllbEnabled ? policy.nllbModel : 'off')
  );
  registerShellSw();
  warmAsr();
})();
