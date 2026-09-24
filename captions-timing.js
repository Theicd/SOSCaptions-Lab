/**
 * Group Whisper word chunks into readable caption cues + typing helpers.
 * Prefer ~sentence / silence breaks (SubVid-style), not one flash per word.
 */
(function (global) {
  'use strict';

  const SILENCE_BREAK_S = 0.7;
  const MAX_WORDS = 10;
  const MAX_CHARS = 52;
  const MIN_CUE_S = 1.15;
  const MIN_MERGE_S = 0.85;
  const MAX_CUE_S = 8.5;

  function normWord(t) {
    return String(t || '').replace(/\s+/g, ' ').trim();
  }

  function joinWord(prev, next) {
    const n = normWord(next);
    if (!n) return prev;
    if (!prev) return n;
    if (/^[,.!?;:'"]/.test(n)) return prev + n;
    return prev + ' ' + n;
  }

  function cueDuration(c) {
    return Math.max(0, (c.end || 0) - (c.start || 0));
  }

  /**
   * Clamp cues to media length, remove overlaps, drop zero-length.
   * Critical so movie-mode lines actually disappear after speech.
   */
  function clampTrackToMedia(cues, mediaDuration) {
    const lim =
      isFinite(mediaDuration) && mediaDuration > 0.2 ? Number(mediaDuration) : null;
    if (!cues || !cues.length) return [];

    const sorted = cues
      .map(function (c) {
        return {
          id: c.id,
          start: Math.max(0, Number(c.start) || 0),
          end: Math.max(0, Number(c.end) || 0),
          text: c.text,
          words: (c.words && c.words.slice()) || [],
          manual: !!c.manual
        };
      })
      .sort(function (a, b) {
        return a.start - b.start;
      });

    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i];
      if (c.end <= c.start) c.end = c.start + 0.4;
      if (lim != null) {
        c.start = Math.min(c.start, lim - 0.05);
        c.end = Math.min(c.end, lim);
      }
      // Cap runaway long cues (Whisper sometimes emits past EOF)
      if (c.end - c.start > MAX_CUE_S) c.end = c.start + MAX_CUE_S;
      if (i + 1 < sorted.length) {
        const next = sorted[i + 1];
        if (c.end > next.start - 0.02) {
          c.end = Math.max(c.start + 0.35, next.start - 0.02);
        }
      }
      if (c.words && c.words.length) {
        c.words[0].start = c.start;
        c.words[c.words.length - 1].end = c.end;
      }
    }

    return sorted
      .filter(function (c) {
        return c.text && c.end > c.start + 0.05 && (lim == null || c.start < lim);
      })
      .map(function (c, idx) {
        c.id = 'w' + (idx + 1);
        return c;
      });
  }

  /**
   * Merge cues that are too short to read into neighbors.
   * Prefer the nearer neighbor so we don't glue across long silence.
   */
  function mergeShortCues(cues, mediaDuration) {
    if (!cues || !cues.length) return [];
    if (cues.length === 1) return clampTrackToMedia(cues, mediaDuration);

    const out = cues.map(function (c) {
      return {
        id: c.id,
        start: c.start,
        end: c.end,
        text: c.text,
        words: (c.words && c.words.slice()) || []
      };
    });

    let i = 0;
    while (i < out.length) {
      const cur = out[i];
      if (cueDuration(cur) >= MIN_MERGE_S || out.length === 1) {
        i += 1;
        continue;
      }
      const gapPrev = i > 0 ? cur.start - out[i - 1].end : Number.POSITIVE_INFINITY;
      const gapNext =
        i + 1 < out.length ? out[i + 1].start - cur.end : Number.POSITIVE_INFINITY;
      const mergeNext = gapNext <= gapPrev && i + 1 < out.length;

      if (mergeNext) {
        const next = out[i + 1];
        next.start = Math.min(next.start, cur.start);
        next.text = joinWord(cur.text, next.text);
        next.words = (cur.words || []).concat(next.words || []);
        out.splice(i, 1);
        continue;
      }
      if (i > 0) {
        const prev = out[i - 1];
        prev.end = Math.max(prev.end, cur.end);
        prev.text = joinWord(prev.text, cur.text);
        prev.words = (prev.words || []).concat(cur.words || []);
        out.splice(i, 1);
        continue;
      }
      i += 1;
    }

    // Pad short cues for readability — never invent time past media / next cue
    const lim =
      isFinite(mediaDuration) && mediaDuration > 0.2 ? Number(mediaDuration) : null;
    for (let j = 0; j < out.length; j++) {
      const c = out[j];
      const hardCap =
        j + 1 < out.length
          ? out[j + 1].start - 0.04
          : lim != null
            ? lim
            : c.end;
      const wantEnd = Math.min(hardCap, Math.max(c.end, c.start + MIN_CUE_S));
      if (wantEnd > c.end) c.end = wantEnd;
    }

    return clampTrackToMedia(out, mediaDuration);
  }

  /**
   * @param {Array<{text:string,timestamp:number[]}>} chunks
   * @param {number} [mediaDuration]
   */
  function wordsToCues(chunks, mediaDuration) {
    const words = (chunks || [])
      .map(function (c, i) {
        const ts = c.timestamp || [0, 0];
        let start = Number(ts[0]);
        let end = Number(ts[1]);
        if (!isFinite(start)) start = 0;
        if (!isFinite(end) || end < start) end = start + 0.2;
        return {
          id: 'tw' + (i + 1),
          text: normWord(c.text),
          start: start,
          end: end
        };
      })
      .filter(function (w) {
        return !!w.text;
      });

    if (!words.length) return [];

    const cues = [];
    let cur = null;

    function pushCur() {
      if (!cur) return;
      cues.push(cur);
      cur = null;
    }

    words.forEach(function (w) {
      const gap = cur ? w.start - cur.end : 999;
      const nextText = cur ? joinWord(cur.text, w.text) : w.text;
      const nextWords = cur ? cur.words.length + 1 : 1;
      const silenceBreak = gap >= SILENCE_BREAK_S;
      const tooLong =
        cur && (nextWords > MAX_WORDS || nextText.length > MAX_CHARS);

      if (!cur || silenceBreak || tooLong) {
        pushCur();
        cur = {
          id: 'w' + (cues.length + 1),
          start: w.start,
          end: w.end,
          text: w.text,
          words: [w]
        };
      } else {
        cur.end = w.end;
        cur.text = nextText;
        cur.words.push(w);
      }
    });
    pushCur();

    return mergeShortCues(cues, mediaDuration);
  }

  /**
   * TikTok-like typing: reveal by word timing, characters within active word.
   */
  function typedTextForTime(cap, time) {
    if (!cap || !cap.text) return '';
    if (time < cap.start || time >= cap.end) return '';
    const words = cap.words;
    if (!words || !words.length) {
      const dur = Math.max(0.28, (cap.end - cap.start) * 0.5);
      const p = Math.min(1, Math.max(0, (time - cap.start) / dur));
      return cap.text.slice(0, Math.ceil(cap.text.length * p));
    }

    let out = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const raw = w.text;
      if (time < w.start) break;
      const space = out && !/^[,.!?;:'"]/.test(raw) ? ' ' : '';
      const wordDur = Math.max(0.06, w.end - w.start);
      if (time >= w.end - 0.001) {
        out += space + raw;
      } else {
        const p = Math.min(1, (time - w.start) / wordDur);
        const n = Math.max(1, Math.ceil(raw.length * p));
        out += space + raw.slice(0, n);
        break;
      }
    }
    return out;
  }

  /**
   * Normalize ASR pipeline result → cues (prefer word timestamps).
   */
  function asrResultToCues(result, fallbackDuration) {
    const mediaDur = Number(fallbackDuration) || 0;
    const chunks = (result && result.chunks) || [];
    const looksLikeWords =
      chunks.length > 0 &&
      chunks.every(function (c) {
        const t = normWord(c.text);
        return t.split(/\s+/).length <= 3;
      }) &&
      chunks.length >= 2;

    if (looksLikeWords) {
      const cues = wordsToCues(chunks, mediaDur);
      if (cues.length) return cues;
    }

    if (chunks.length) {
      const raw = chunks.map(function (c, i) {
        const ts = c.timestamp || [0, 0];
        let start = Number(ts[0]);
        let end = Number(ts[1]);
        if (!isFinite(start)) start = 0;
        if (!isFinite(end) || end <= start) end = start + 1.5;
        const text = normWord(c.text);
        return {
          id: 'w' + (i + 1),
          start: start,
          end: end,
          text: text,
          words: [{ id: 'tw' + (i + 1), text: text, start: start, end: end }]
        };
      });
      return mergeShortCues(raw, mediaDur);
    }

    const full = normWord(result && result.text);
    if (!full) return [];
    const dur = mediaDur > 0 ? mediaDur : 10;
    return clampTrackToMedia(
      [
        {
          id: 'w1',
          start: 0,
          end: Math.min(dur, 6),
          text: full,
          words: [{ id: 'tw1', text: full, start: 0, end: Math.min(dur, 6) }]
        }
      ],
      dur
    );
  }

  global.CaptionsTiming = {
    wordsToCues: wordsToCues,
    mergeShortCues: mergeShortCues,
    clampTrackToMedia: clampTrackToMedia,
    typedTextForTime: typedTextForTime,
    asrResultToCues: asrResultToCues
  };
})(typeof window !== 'undefined' ? window : globalThis);
