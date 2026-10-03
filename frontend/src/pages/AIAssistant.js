import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, User, Bot, Trash2, Plus, MessageSquare } from 'lucide-react';
import { AI } from '@/constants/testIds';
import api, { API_BASE } from '@/lib/api';
import { useI18n } from '@/i18n';


const SUGGESTED_QUERIES = [
  'ai.sq1', 'ai.sq2', 'ai.sq3', 'ai.sq4',
  'ai.sq5', 'ai.sq6', 'ai.sq7', 'ai.sq8',
];

export default function AIAssistant() {
  const { t } = useI18n();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setLoading(true);

    const userMsg = { role: 'user', content: msg, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsg = { role: 'assistant', content: '', id: Date.now() + 1, streaming: true };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const shopId = localStorage.getItem('nafamitra_shop');
      const response = await fetch(`${API_BASE}/assistant/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nafamitra_token')}`,
          ...(shopId ? { 'X-Shop-Id': shopId } : {}),
        },
        body: JSON.stringify({ message: msg, session_id: sessionId })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            fullContent += data;
            setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullContent, streaming: true } : m));
          }
        }
      }
      setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullContent, streaming: false } : m));
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: t('ai.error'), streaming: false } : m));
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    try {
      await api.delete(`/assistant/sessions/${sessionId}`);
    } catch {}
    const newSessionId = `session_${Date.now()}`;
    setSessionId(newSessionId);
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] animate-fadeInUp">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800" style={{fontFamily:'Outfit,sans-serif'}}>{t('nav.assistant')}</h1>
            <p className="text-xs text-slate-400">{t('ai.sub')}</p>
          </div>
        </div>
        <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50">
          <Plus className="w-4 h-4" />
          {t('ai.newChat')}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h3 className="font-bold text-slate-700 text-lg" style={{fontFamily:'Outfit,sans-serif'}}>{t('ai.brand')}</h3>
            <p className="text-slate-400 text-sm mt-1 max-w-sm">{t('ai.emptySub')}</p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {SUGGESTED_QUERIES.slice(0, 4).map((q, i) => (
                <button key={i} onClick={() => sendMessage(t(q))} className="text-left p-3 rounded-xl bg-slate-50 hover:bg-purple-50 hover:border-purple-200 border border-slate-100 text-sm text-slate-600 hover:text-purple-700 transition-colors">
                  {t(q)}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-emerald-500' : 'bg-gradient-to-br from-purple-600 to-indigo-600'}`}>
              {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
            </div>
            <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-emerald-500 text-white rounded-tr-sm' : 'bg-slate-50 text-slate-700 rounded-tl-sm border border-slate-100'}`}>
              {msg.content || (msg.streaming && <span className="inline-flex gap-1"><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'0s'}} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'0.15s'}} /><span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:'0.3s'}} /></span>)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Queries (when chat has messages) */}
      {messages.length > 0 && !loading && (
        <div className="flex gap-2 overflow-x-auto pb-2 flex-shrink-0">
          {SUGGESTED_QUERIES.slice(0, 4).map((q, i) => (
            <button key={i} onClick={() => sendMessage(t(q))} className="flex-shrink-0 text-xs bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-full hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-colors">
              {t(q)}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1 relative">
          <input
            data-testid={AI.chatInput}
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={t('ai.ph')}
            disabled={loading}
            className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 pr-12"
          />
        </div>
        <button
          data-testid={AI.sendBtn}
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white hover:opacity-90 transition-opacity disabled:opacity-40 flex-shrink-0"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
