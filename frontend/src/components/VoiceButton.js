import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, X, CheckCircle, AlertCircle, Loader, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { VOICE } from '@/constants/testIds';
import api, { errMsg } from '@/lib/api';
import Modal from '@/components/Modal';


const STATES = { IDLE: 'idle', LISTENING: 'listening', TRANSCRIBING: 'transcribing', UNDERSTANDING: 'understanding', REVIEW: 'review', EXECUTING: 'executing', SUCCESS: 'success', ERROR: 'error' };

const SAMPLE_COMMANDS = [
  "Ramesh ka 500 ka bill banao",
  "Aaj ki total sales kitni hai?",
  "Dinesh ne 1000 rupaye cash jama kiye",
  "Kaunsa product low stock hai?",
  "Aaj ka profit kitna hai?"
];

export default function VoiceButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState(STATES.IDLE);
  const [transcription, setTranscription] = useState('');
  const [intentData, setIntentData] = useState(null);
  const [result, setResult] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = handleRecordingStop;
      mediaRecorder.start(200);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setState(STATES.LISTENING);
      setTimeout(() => { if (mediaRecorderRef.current?.state === 'recording') stopRecording(); }, 10000);
    } catch (err) {
      toast.error('Microphone access denied. Please allow microphone permissions.');
      setState(STATES.IDLE);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
  };

  const handleRecordingStop = async () => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    await processAudio(blob);
  };

  const processAudio = async (blob) => {
    setState(STATES.TRANSCRIBING);
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'voice.webm');
      const { data: sttData } = await api.post(`/voice/transcribe`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const text = sttData.transcription;
      setTranscription(text);
      setState(STATES.UNDERSTANDING);
      const { data: intentResult } = await api.post(`/voice/understand`, { transcription: text });
      setIntentData(intentResult);
      setState(STATES.REVIEW);
    } catch (err) {
      setState(STATES.ERROR);
      setResult({ error: 'Could not process voice command. Please try again.' });
    }
  };

  const handleConfirm = async () => {
    if (!intentData) return;
    setState(STATES.EXECUTING);
    try {
      const { data } = await api.post(`/voice/execute`, {
        intent: intentData.intent,
        entities: intentData,
        session_id: intentData.session_id
      });
      setResult(data);
      setState(STATES.SUCCESS);
      toast.success(data.message || 'Command executed successfully!');
    } catch (err) {
      setState(STATES.ERROR);
      setResult({ error: errMsg(err, 'Execution failed.') });
    }
  };

  const handleClose = () => {
    stopRecording();
    setIsOpen(false);
    setTimeout(() => { setState(STATES.IDLE); setTranscription(''); setIntentData(null); setResult(null); }, 300);
  };

  const trySampleCommand = async (cmd) => {
    setTranscription(cmd);
    setState(STATES.UNDERSTANDING);
    try {
      const { data: intentResult } = await api.post(`/voice/understand`, { transcription: cmd });
      setIntentData(intentResult);
      setState(STATES.REVIEW);
    } catch {
      setState(STATES.ERROR);
    }
  };

  const INTENT_LABELS = {
    CREATE_SALE: 'Create Sale', ADD_UDHAAR: 'Add Udhaar', RECORD_PAYMENT: 'Record Payment',
    CHECK_SALES: 'Check Sales', CHECK_PROFIT: 'Check Profit', CHECK_OUTSTANDING: 'Check Outstanding',
    CHECK_STOCK: 'Check Stock', ADD_PRODUCT: 'Add Product', ADD_CUSTOMER: 'Add Customer',
    SEARCH_CUSTOMER: 'Search Customer', GENERAL_QUERY: 'General Query'
  };

  const btnClass = {
    [STATES.IDLE]: 'bg-gradient-to-br from-purple-600 to-indigo-600 hover:scale-105',
    [STATES.LISTENING]: 'bg-red-500 ring-4 ring-red-300 pulse-ring',
    [STATES.TRANSCRIBING]: 'bg-purple-600',
    [STATES.UNDERSTANDING]: 'bg-purple-700',
    [STATES.REVIEW]: 'bg-indigo-600',
    [STATES.EXECUTING]: 'bg-purple-700',
    [STATES.SUCCESS]: 'bg-emerald-500 ring-4 ring-emerald-200',
    [STATES.ERROR]: 'bg-red-500'
  }[state] || 'bg-purple-600';

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          data-testid={VOICE.micBtn}
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg z-40 transition-all duration-200 ${btnClass} relative`}
          title="Voice Assistant"
        >
          <Mic className="w-6 h-6" />
        </button>
      )}

      {/* Voice Modal */}
      <Modal open={isOpen} onClose={handleClose} panelTestId={VOICE.modal} label="NafaMitra Voice" size="md">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm" style={{fontFamily:'Outfit,sans-serif'}}>NafaMitra Voice</p>
                  <p className="text-xs text-slate-400">Speak in Hindi, English or Hinglish</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Mic Button + Waveform */}
              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-200 relative ${isRecording ? 'bg-red-500 ring-4 ring-red-200' : 'bg-gradient-to-br from-purple-600 to-indigo-600 hover:scale-105'}`}
                >
                  {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                </button>

                {state === STATES.LISTENING && (
                  <div className="flex items-end gap-1 h-8">
                    {[...Array(7)].map((_, i) => (
                      <div key={i} className="voice-wave-bar w-1.5 bg-red-400 rounded-full" style={{animationDelay: `${i*0.08}s`, height: `${Math.random()*60+40}%`}} />
                    ))}
                  </div>
                )}

                <p className="text-sm font-medium text-slate-500 text-center">
                  {state === STATES.IDLE && 'Tap to start speaking'}
                  {state === STATES.LISTENING && 'Listening... tap to stop'}
                  {state === STATES.TRANSCRIBING && 'Transcribing audio...'}
                  {state === STATES.UNDERSTANDING && 'Understanding command...'}
                  {state === STATES.REVIEW && 'Review the command below'}
                  {state === STATES.EXECUTING && 'Executing command...'}
                  {state === STATES.SUCCESS && 'Command executed!'}
                  {state === STATES.ERROR && 'Something went wrong'}
                </p>
              </div>

              {/* Transcription Display */}
              {transcription && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">You said:</p>
                  <p data-testid={VOICE.transcription} className="text-slate-700 text-sm font-medium italic">"{transcription}"</p>
                </div>
              )}

              {/* Loading States */}
              {(state === STATES.TRANSCRIBING || state === STATES.UNDERSTANDING || state === STATES.EXECUTING) && (
                <div className="flex items-center gap-2 justify-center text-purple-600">
                  <Loader className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Processing...</span>
                </div>
              )}

              {/* Intent Review Card */}
              {state === STATES.REVIEW && intentData && (
                <div data-testid={VOICE.intentCard} className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Detected Intent</p>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                      {Math.round((intentData.confidence || 0.8) * 100)}% confident
                    </span>
                  </div>
                  <p className="font-bold text-purple-900 text-sm">{INTENT_LABELS[intentData.intent] || intentData.intent}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {intentData.customer_name && <div><span className="text-slate-400">Customer:</span> <strong>{intentData.customer_name}</strong></div>}
                    {intentData.amount && <div><span className="text-slate-400">Amount:</span> <strong className="font-mono">₹{intentData.amount}</strong></div>}
                    {intentData.payment_mode && <div><span className="text-slate-400">Payment:</span> <strong className="capitalize">{intentData.payment_mode}</strong></div>}
                    {intentData.product_name && <div><span className="text-slate-400">Product:</span> <strong>{intentData.product_name}</strong></div>}
                    {intentData.quantity && <div><span className="text-slate-400">Qty:</span> <strong>{intentData.quantity}</strong></div>}
                  </div>
                  {intentData.response_message && (
                    <div className="flex items-start gap-1.5 bg-white rounded-lg p-2">
                      <Volume2 className="w-3.5 h-3.5 text-purple-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-slate-600 italic">{intentData.response_message}</p>
                    </div>
                  )}
                  {intentData.requires_clarification && intentData.clarification_question && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <p className="text-xs text-amber-700 font-medium">{intentData.clarification_question}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Success Result */}
              {state === STATES.SUCCESS && result && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <p className="text-sm font-bold text-emerald-800">Success!</p>
                  </div>
                  <p className="text-sm text-emerald-700">{result.message}</p>
                  {result.data && result.data.total_sales !== undefined && (
                    <p className="text-2xl font-bold font-mono text-emerald-700 mt-2">₹{result.data.total_sales?.toFixed(0)}</p>
                  )}
                </div>
              )}

              {/* Error */}
              {state === STATES.ERROR && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{result?.error || 'An error occurred'}</p>
                </div>
              )}

              {/* Action Buttons */}
              {state === STATES.REVIEW && (
                <div className="flex gap-2">
                  <button data-testid={VOICE.cancelBtn} onClick={() => { setState(STATES.IDLE); setTranscription(''); setIntentData(null); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                    Cancel
                  </button>
                  <button data-testid={VOICE.confirmBtn} onClick={handleConfirm} className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700">
                    Confirm
                  </button>
                </div>
              )}

              {(state === STATES.SUCCESS || state === STATES.ERROR) && (
                <button onClick={() => { setState(STATES.IDLE); setTranscription(''); setIntentData(null); setResult(null); }} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">
                  Try Another Command
                </button>
              )}

              {/* Sample Commands */}
              {state === STATES.IDLE && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Try these commands:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_COMMANDS.map((cmd, i) => (
                      <button key={i} onClick={() => trySampleCommand(cmd)} className="text-xs bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-600 px-2.5 py-1 rounded-full transition-colors">
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
      </Modal>
    </>
  );
}
