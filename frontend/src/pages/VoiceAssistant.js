import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Mic, MicOff, CheckCircle, AlertCircle, Loader, Volume2, History, Sparkles, X, ChevronRight } from 'lucide-react';
import api, { errMsg } from '@/lib/api';

const STATES = { IDLE: 'idle', LISTENING: 'listening', TRANSCRIBING: 'transcribing', UNDERSTANDING: 'understanding', REVIEW: 'review', EXECUTING: 'executing', SUCCESS: 'success', ERROR: 'error' };

const SAMPLE_COMMANDS = [
  { text: "Aaj ki total sales kitni hai?", desc: "Check today's sales" },
  { text: "Ramesh ka 500 rupaye ka bill banao", desc: "Create a bill" },
  { text: "Dinesh ne 1000 cash jama kiye", desc: "Record payment" },
  { text: "Kaunsa product low stock hai?", desc: "Check inventory" },
  { text: "Aaj ka profit kitna hai?", desc: "Check profit" },
  { text: "Total kitna udhaar baaki hai?", desc: "Check outstanding" },
];

export default function VoiceAssistant() {
  const [state, setState] = useState(STATES.IDLE);
  const [transcription, setTranscription] = useState('');
  const [intentData, setIntentData] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      const { data } = await api.get(`/voice/history`);
      setHistory(data || []);
    } catch {}
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = handleStop;
      mediaRecorder.start(200);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setState(STATES.LISTENING);
      setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording') stopRecording(); }, 10000);
    } catch (err) {
      toast.error('Microphone access denied!');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
  };

  const handleStop = async () => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    setState(STATES.TRANSCRIBING);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      const { data } = await api.post(`/voice/transcribe`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!data.transcription) {
        // Honest fallback: nothing was heard/transcribed — do not process empty text.
        setState(STATES.ERROR);
        setResult({ error: data.notice || 'No transcription available. Type your command as a sample instead.' });
        return;
      }
      setTranscription(data.transcription);
      await processText(data.transcription);
    } catch {
      setState(STATES.ERROR);
    }
  };

  const processText = async (text) => {
    setState(STATES.UNDERSTANDING);
    try {
      const { data } = await api.post(`/voice/understand`, { transcription: text });
      setIntentData(data);
      setState(STATES.REVIEW);
    } catch {
      setState(STATES.ERROR);
    }
  };

  const handleConfirm = async () => {
    setState(STATES.EXECUTING);
    try {
      const { data } = await api.post(`/voice/execute`, { intent: intentData.intent, entities: intentData, session_id: intentData.session_id });
      setResult(data);
      if (data.success === false) {
        setState(STATES.ERROR);
        return;
      }
      setState(STATES.SUCCESS);
      toast.success(data.message || 'Done!');
      loadHistory();
    } catch (err) {
      setState(STATES.ERROR);
      setResult({ error: errMsg(err, 'Execution failed') });
    }
  };

  const reset = () => { setState(STATES.IDLE); setTranscription(''); setIntentData(null); setResult(null); };

  const trySample = async (cmd) => {
    setTranscription(cmd);
    await processText(cmd);
  };

  const INTENT_LABELS = {
    CREATE_SALE: 'Create Sale', ADD_UDHAAR: 'Add Udhaar', RECORD_PAYMENT: 'Record Payment',
    CHECK_SALES: 'Check Today\'s Sales', CHECK_PROFIT: 'Check Est. Gross Margin',
    CHECK_OUTSTANDING: 'Check Outstanding', CHECK_STOCK: 'Check Low Stock',
    ADD_PRODUCT: 'Add Product', ADD_CUSTOMER: 'Add Customer', GENERAL_QUERY: 'General Query'
  };

  const micBtnClass = isRecording ? 'bg-red-500 ring-8 ring-red-200' : 'bg-gradient-to-br from-purple-600 to-indigo-600 hover:scale-105';

  return (
    <div className="space-y-5 animate-fadeInUp max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>Voice Assistant</h1>
        <p className="text-slate-500 text-sm mt-1">Speak in Hindi, English, or Hinglish</p>
      </div>

      {/* Main Voice Card */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-6">
        <div className="flex flex-col items-center gap-5">
          {/* Mic Button */}
          <div className="relative">
            <button onClick={isRecording ? stopRecording : startRecording} className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-2xl transition-all duration-300 relative ${micBtnClass}`}>
              {isRecording ? <MicOff className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
            </button>
            {isRecording && (
              <div className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping" />
            )}
          </div>

          {/* Waveform */}
          {state === STATES.LISTENING && (
            <div className="flex items-end gap-1 h-10">
              {[...Array(11)].map((_, i) => (
                <div key={i} className="voice-wave-bar w-2 bg-purple-400 rounded-full" style={{animationDelay: `${i * 0.07}s`, height: `${20 + Math.sin(i) * 15 + 15}px`}} />
              ))}
            </div>
          )}

          {/* Status Text */}
          <div className="text-center">
            {state === STATES.IDLE && <p className="text-purple-700 font-semibold">Tap the microphone to start</p>}
            {state === STATES.LISTENING && <p className="text-red-600 font-semibold animate-pulse">Listening... tap to stop</p>}
            {state === STATES.TRANSCRIBING && <div className="flex items-center gap-2 text-purple-600"><Loader className="w-4 h-4 animate-spin" /><span className="font-semibold">Transcribing audio...</span></div>}
            {state === STATES.UNDERSTANDING && <div className="flex items-center gap-2 text-purple-600"><Loader className="w-4 h-4 animate-spin" /><span className="font-semibold">Understanding command...</span></div>}
            {state === STATES.EXECUTING && <div className="flex items-center gap-2 text-purple-600"><Loader className="w-4 h-4 animate-spin" /><span className="font-semibold">Executing...</span></div>}
          </div>

          {/* Transcription */}
          {transcription && (
            <div className="w-full bg-white/80 rounded-xl p-3 border border-purple-100">
              <p className="text-xs text-purple-500 font-semibold uppercase tracking-wider mb-1">You said:</p>
              <p className="text-slate-700 font-medium italic">"{transcription}"</p>
            </div>
          )}

          {/* Intent Review */}
          {state === STATES.REVIEW && intentData && (
            <div className="w-full bg-white rounded-xl border border-purple-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <p className="font-bold text-purple-800">I Understood:</p>
                </div>
                <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-semibold">{Math.round((intentData.confidence || 0.8) * 100)}% confident</span>
              </div>
              <div className="bg-purple-50 rounded-xl p-3">
                <p className="text-lg font-bold text-purple-900">{INTENT_LABELS[intentData.intent] || intentData.intent}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {intentData.customer_name && <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-400 text-xs">Customer</span><p className="font-semibold">{intentData.customer_name}</p></div>}
                {intentData.amount && <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-400 text-xs">Amount</span><p className="font-bold font-mono text-emerald-600">₹{intentData.amount}</p></div>}
                {intentData.payment_mode && <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-400 text-xs">Payment</span><p className="font-semibold capitalize">{intentData.payment_mode}</p></div>}
                {intentData.product_name && <div className="bg-slate-50 rounded-lg p-2"><span className="text-slate-400 text-xs">Product</span><p className="font-semibold">{intentData.product_name}</p></div>}
              </div>
              {intentData.response_message && (
                <div className="flex items-start gap-2 bg-indigo-50 rounded-xl p-3">
                  <Volume2 className="w-4 h-4 text-indigo-500 mt-0.5" />
                  <p className="text-sm text-indigo-700 italic">{intentData.response_message}</p>
                </div>
              )}
              {intentData.requires_clarification && intentData.clarification_question && (
                <div className="flex items-start gap-2 bg-amber-50 rounded-xl p-3 border border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />
                  <p className="text-sm text-amber-800 font-medium">{intentData.clarification_question}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={reset} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50">Cancel</button>
                {!intentData.requires_clarification && (
                  <button onClick={handleConfirm} className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-semibold text-sm hover:bg-purple-700">Confirm & Execute</button>
                )}
              </div>
            </div>
          )}

          {/* Success */}
          {state === STATES.SUCCESS && result && (
            <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="font-bold text-emerald-800">Success!</p>
              </div>
              <p className="text-sm text-emerald-700">{result.message}</p>
              {result.data?.total_paise !== undefined && <p className="text-3xl font-bold font-mono text-emerald-700 mt-2">₹{Math.floor((result.data.total_paise || 0) / 100)}</p>}
              {result.data?.estimated_gross_margin_paise !== undefined && <p className="text-3xl font-bold font-mono text-emerald-700 mt-2">₹{Math.floor((result.data.estimated_gross_margin_paise || 0) / 100)}</p>}
              {result.data?.total_outstanding_paise !== undefined && <p className="text-3xl font-bold font-mono text-red-600 mt-2">₹{Math.floor((result.data.total_outstanding_paise || 0) / 100)}</p>}
              <button onClick={reset} className="w-full mt-3 py-2.5 rounded-xl border border-emerald-200 text-emerald-700 font-semibold text-sm hover:bg-emerald-100">Try Another Command</button>
            </div>
          )}

          {/* Error */}
          {state === STATES.ERROR && (
            <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700">{result?.error || 'Something went wrong'}</p>
                <button onClick={reset} className="mt-2 text-sm font-semibold text-red-600 hover:underline">Try Again</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sample Commands */}
      {state === STATES.IDLE && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Try These Commands</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SAMPLE_COMMANDS.map((cmd, i) => (
              <button key={i} onClick={() => trySample(cmd.text)} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-purple-50 hover:border-purple-200 border border-slate-100 text-left transition-colors">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{cmd.text}</p>
                  <p className="text-xs text-slate-400">{cmd.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Voice History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-50">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-700" style={{fontFamily:'Outfit,sans-serif'}}>Recent Commands</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {history.slice(0, 5).map((cmd, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-slate-600 italic flex-1">"{cmd.transcription}"</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cmd.execution_status === 'executed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>{cmd.execution_status}</span>
                </div>
                <p className="text-xs text-purple-600 font-semibold mt-1">{cmd.intent}</p>
                {cmd.demo_mode && <p className="text-xs text-amber-500 font-semibold">DEMO MODE</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
