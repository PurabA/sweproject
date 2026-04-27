import { useEffect, useState } from 'react';

/**
 * Browser SpeechRecognition for clinical documentation (Chrome/Edge).
 */
export default function VoiceNotes({ value, onChange, disabled }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    setSupported(!!SR);
  }, []);

  const toggle = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript;
      onChange(value ? `${value.trim()} ${text}` : text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentation</span>
      {!supported ? (
        <span className="text-xs text-amber-800">Speech recognition is not available in this browser.</span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            listening ? 'bg-rose-600 text-white shadow-sm hover:bg-rose-700' : 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50'
          }`}
        >
          {listening ? 'Stop dictation' : 'Dictate to notes'}
        </button>
      )}
    </div>
  );
}
