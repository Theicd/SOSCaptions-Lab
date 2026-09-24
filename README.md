# SOS Captions Lab

Whisper (browser) + Google Translate overlay captions. Video file is never burned-in.

## Live demo

**https://theicd.github.io/SOSCaptions-Lab/**

1. Wait for the green ✓ (model warm-up)
2. Upload a video or pick TEST1–4
3. Tap **תמלל**
4. Change subtitle language to translate
5. **העתק** in the editor copies the full transcript

Models download from Hugging Face on first use (~290MB for Whisper base) and cache in the browser.

## Local

```bash
npm install
npm start
# http://127.0.0.1:8899
```
