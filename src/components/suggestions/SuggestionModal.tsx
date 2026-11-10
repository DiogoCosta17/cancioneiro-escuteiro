import React, { useState, useEffect } from 'react';
import { X, Play, ExternalLink, Send, CheckCircle2, Music2, User } from 'lucide-react';
import { useSuggestions } from '../../hooks/useSuggestions';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SuggestionModal({ isOpen, onClose }: SuggestionModalProps) {
  const { submitSuggestion } = useSuggestions();

  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [chordsUrl, setChordsUrl] = useState('');
  const [suggestedByName, setSuggestedByName] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  // Reset form when modal opens (render-time state synchronization)
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setTitle('');
      setYoutubeUrl('');
      setChordsUrl('');
      setSuggestedByName('');
      setNotes('');
      setErrorMessage('');
      setIsSuccess(false);
    }
  }

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Por favor, indica o nome da música.');
      return;
    }

    if (youtubeUrl.trim() && !/^https?:\/\//i.test(youtubeUrl.trim())) {
      setErrorMessage('O link do YouTube deve começar por http:// ou https://');
      return;
    }

    if (chordsUrl.trim() && !/^https?:\/\//i.test(chordsUrl.trim())) {
      setErrorMessage('O link dos acordes deve começar por http:// ou https://');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    const { success, error } = await submitSuggestion({
      title: title.trim().slice(0, 150),
      youtube_url: youtubeUrl.trim() ? youtubeUrl.trim().slice(0, 300) : undefined,
      chords_url: chordsUrl.trim() ? chordsUrl.trim().slice(0, 300) : undefined,
      suggested_by_name: suggestedByName.trim() ? suggestedByName.trim().slice(0, 100) : undefined,
      notes: notes.trim() ? notes.trim().slice(0, 1000) : undefined,
    });

    setIsSubmitting(false);

    if (success) {
      setIsSuccess(true);
    } else {
      setErrorMessage(
        error?.message || 'Ocorreu um erro ao enviar a sugestão. Verifica a ligação e tenta novamente.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="suggestion-modal-title">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-100 dark:border-zinc-800 animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-[#2d5016] to-[#3a681d] px-6 py-5 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
                <Music2 className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 id="suggestion-modal-title" className="text-lg font-bold leading-tight">Sugerir um Cântico</h3>
                <p className="text-xs text-green-100/80">Ajuda a enriquecer o cancioneiro do agrupamento</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              title="Fechar"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            {isSuccess ? (
              <div className="py-6 text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-950/60 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto border-2 border-green-300 dark:border-green-800 shadow-sm animate-in zoom-in duration-300">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Sugestão Enviada com Sucesso! 🎶
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
                    Muito obrigado pela tua contribuição! A sugestão foi registada na caixa dos dirigentes para posterior inclusão no cancioneiro.
                  </p>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setTitle('');
                      setYoutubeUrl('');
                      setChordsUrl('');
                      setNotes('');
                      setIsSuccess(false);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Sugerir outro cântico
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-sm font-bold text-white transition-colors cursor-pointer shadow-sm"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMessage && (
                  <div className="p-3 text-xs bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300 flex items-start gap-2">
                    <span className="font-bold">•</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Nome do Cântico */}
                <div>
                  <label htmlFor="suggestion-title" className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Nome do Cântico <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      autoFocus
                      id="suggestion-title"
                      maxLength={150}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow shadow-xs"
                    />
                  </div>
                </div>

                {/* Link do YouTube (Opcional) */}
                <div>
                  <label htmlFor="suggestion-youtube" className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Link do YouTube <span className="text-gray-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-red-500">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                    <input
                      type="url"
                      id="suggestion-youtube"
                      maxLength={300}
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      className="w-full pl-9.5 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow shadow-xs"
                    />
                  </div>
                </div>

                {/* Link para Acordes (Opcional) */}
                <div>
                  <label htmlFor="suggestion-chords" className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Link para Acordes <span className="text-gray-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-500">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                    <input
                      type="url"
                      id="suggestion-chords"
                      maxLength={300}
                      value={chordsUrl}
                      onChange={(e) => setChordsUrl(e.target.value)}
                      className="w-full pl-9.5 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow shadow-xs"
                    />
                  </div>
                </div>

                {/* O teu Nome (Opcional) */}
                <div>
                  <label htmlFor="suggestion-name" className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    O teu Nome <span className="text-gray-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      id="suggestion-name"
                      maxLength={100}
                      value={suggestedByName}
                      onChange={(e) => setSuggestedByName(e.target.value)}
                      className="w-full pl-9.5 pr-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow shadow-xs"
                    />
                  </div>
                </div>

                {/* Observações ou Momento sugerido (Opcional) */}
                <div>
                  <label htmlFor="suggestion-notes" className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                    Observações ou Momento <span className="text-gray-400 font-normal lowercase">(opcional)</span>
                  </label>
                  <div className="relative">
                    <textarea
                      rows={2}
                      placeholder="Ex: Cântico de comunhão, ou cântico para fogo de conselho..."
                      id="suggestion-notes"
                      maxLength={1000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow shadow-xs resize-none"
                    />
                  </div>
                </div>

                {/* Botoes de Ação */}
                <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-zinc-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !title.trim()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>A enviar...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Sugestão</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
