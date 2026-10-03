/**
 * VoiceRequirementService — requirement capture interface.
 *
 * `dictate()` uses the browser's SpeechRecognition when available and
 * returns transcript text. This is DICTATION (browser speech), not AI —
 * callers must label it as such. When unavailable, `dictate()` rejects
 * with code 'unsupported' and the UI falls back to typing.
 *
 * The recognition object is never sent to a server from here; backend
 * AI processing (if ever enabled) plugs in behind this same interface.
 */

export function isDictationSupported() {
  return typeof window !== 'undefined'
    && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function dictate({ lang = 'mr-IN', timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      reject(new Error('unsupported'));
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rec.stop(); } catch { /* already stopped */ }
      fn(arg);
    };
    const timer = setTimeout(() => finish(reject, new Error('timeout')), timeoutMs);
    rec.onresult = (e) => finish(resolve, e.results[0][0].transcript.trim());
    rec.onerror = (e) => finish(reject, new Error(e.error || 'recognition-error'));
    rec.onend = () => finish(reject, new Error('no-speech'));
    try {
      rec.start();
    } catch (e) {
      finish(reject, e);
    }
  });
}
