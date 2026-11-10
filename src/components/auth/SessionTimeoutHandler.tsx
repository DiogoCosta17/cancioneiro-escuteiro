import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ACTIVITY_STORAGE_KEY } from '../../hooks/useAuth';
import { ShieldAlert, Clock, LogOut, CheckCircle2 } from 'lucide-react';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const WARNING_BEFORE_MS = 2 * 60 * 1000;      // Aviso 2 minutos antes (aos 28 min)
const THROTTLE_ACTIVITY_MS = 5 * 1000;        // Regista atividade a cada 5 segundos

export function SessionTimeoutHandler() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(120);

  const lastRecordedActivityRef = useRef<number>(0);
  const isLoggingOutRef = useRef<boolean>(false);

  // Regista nova atividade e sincroniza entre separadores
  const recordActivity = useCallback(() => {
    const now = Date.now();
    if (lastRecordedActivityRef.current === 0) {
      lastRecordedActivityRef.current = now;
    }
    // Apenas grava se passaram pelo menos 5s para evitar impacto de performance com mousemove
    if (now - lastRecordedActivityRef.current >= THROTTLE_ACTIVITY_MS) {
      lastRecordedActivityRef.current = now;
      try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString());
      } catch {
        // Ignora quota de storage
      }
    }
  }, []);

  // Força reset da atividade (ao carregar em "Manter Sessão Ativa")
  const extendSession = useCallback(() => {
    const now = Date.now();
    lastRecordedActivityRef.current = now;
    try {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString());
    } catch {
      // Ignora erro
    }
    setShowWarning(false);
    setSecondsRemaining(120);
  }, []);

  // Encerra a sessão por inatividade
  const handleTimeoutLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    setShowWarning(false);

    try {
      localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    } catch {
      // Ignora erro
    }

    try {
      await logout();
    } catch (err) {
      console.error('Erro ao terminar sessão por inatividade:', err);
    } finally {
      isLoggingOutRef.current = false;
      navigate('/login?reason=inactivity', { replace: true });
    }
  }, [logout, navigate]);

  // Listener de eventos do utilizador enquanto estiver autenticado
  useEffect(() => {
    if (!user || !isAdmin) {
      return;
    }

    if (lastRecordedActivityRef.current === 0) {
      lastRecordedActivityRef.current = Date.now();
    }

    // Verificar se já existia atividade gravada anteriormente (ex: ao reabrir o browser/telefone após fechar)
    try {
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (raw) {
        const lastSavedTime = Number(raw);
        if (!isNaN(lastSavedTime)) {
          const timeElapsed = Date.now() - lastSavedTime;
          if (timeElapsed >= INACTIVITY_TIMEOUT_MS) {
            // Já passaram 30 minutos ou mais desde que fechou ou suspendeu o browser
            handleTimeoutLogout();
            return;
          }
          // Ainda dentro da janela de validade: restaura o tempo real da última interação
          lastRecordedActivityRef.current = lastSavedTime;
        }
      } else {
        // Primeira inicialização logo após login
        const now = Date.now();
        lastRecordedActivityRef.current = now;
        localStorage.setItem(ACTIVITY_STORAGE_KEY, now.toString());
      }
    } catch {
      // Ignora erro de storage
    }

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleUserInteraction = () => {
      // Se o modal de aviso NÃO estiver visível, interações normais renovam a sessão
      if (!showWarning) {
        recordActivity();
      }
    };

    // Escutar eventos de atividade
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserInteraction, { passive: true });
    });

    // Escutar alterações de atividade feitas noutros separadores abertos
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === ACTIVITY_STORAGE_KEY && e.newValue) {
        const remoteTime = Number(e.newValue);
        if (!isNaN(remoteTime)) {
          lastRecordedActivityRef.current = remoteTime;
          // Se outro separador renovou a sessão, fecha o aviso neste separador
          const timeSince = Date.now() - remoteTime;
          if (timeSince < INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS) {
            setShowWarning(false);
          }
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Temporizador principal (avaliação a cada 1 segundo)
    const interval = setInterval(() => {
      let storedTime = lastRecordedActivityRef.current;
      try {
        const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
        if (raw) {
          const parsed = Number(raw);
          if (!isNaN(parsed) && parsed > storedTime) {
            storedTime = parsed;
            lastRecordedActivityRef.current = parsed;
          }
        }
      } catch {
        // Fallback para ref
      }

      const currentTime = Date.now();
      const elapsed = currentTime - storedTime;
      const timeLeftMs = INACTIVITY_TIMEOUT_MS - elapsed;

      if (timeLeftMs <= 0) {
        // Tempo de inatividade esgotado
        handleTimeoutLogout();
      } else if (timeLeftMs <= WARNING_BEFORE_MS) {
        // Falta menos de 2 minutos: mostra o modal e atualiza contagem decrescente
        const secs = Math.max(1, Math.ceil(timeLeftMs / 1000));
        setSecondsRemaining(secs);
        setShowWarning(true);
      } else {
        // Sessão ainda tem mais de 2 minutos
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 1000);

    // Quando o utilizador volta ao separador após o dispositivo estar bloqueado, suspenso ou noutra app
    const handleResumeCheck = () => {
      let lastTime = lastRecordedActivityRef.current;
      try {
        const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
        if (raw) {
          const parsed = Number(raw);
          if (!isNaN(parsed)) lastTime = parsed;
        }
      } catch {
        // Ignora
      }

      if (Date.now() - lastTime >= INACTIVITY_TIMEOUT_MS) {
        handleTimeoutLogout();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResumeCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleResumeCheck);
    window.addEventListener('focus', handleResumeCheck);

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserInteraction);
      });
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleResumeCheck);
      window.removeEventListener('focus', handleResumeCheck);
      clearInterval(interval);
    };
  }, [user, isAdmin, showWarning, recordActivity, handleTimeoutLogout]);

  // Se não houver utilizador ou não estiver no aviso, não renderiza nada
  if (!user || !isAdmin || !showWarning) {
    return null;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedCountdown = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-500/40 rounded-2xl shadow-2xl p-6 sm:p-7 text-center relative overflow-hidden">
        {/* Barra superior de alerta */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600" />

        {/* Ícone com animação de pulsação suave */}
        <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center ring-8 ring-amber-50 dark:ring-amber-900/20">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>

        <h3 id="inactivity-modal-title" className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Aviso de Inatividade
        </h3>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
          Não detetámos atividade recente. Por motivos de segurança, a tua sessão de administrador será encerrada em:
        </p>

        {/* Relógio decrescente em destaque */}
        <div className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-amber-50 dark:bg-zinc-800/80 border border-amber-200 dark:border-amber-500/30 rounded-xl mb-6">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span className="font-mono text-2xl font-black text-amber-700 dark:text-amber-300 tracking-wider">
            {formattedCountdown}
          </span>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={extendSession}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-scout-green hover:bg-scout-green-light text-white font-bold rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Manter Sessão</span>
          </button>

          <button
            type="button"
            onClick={handleTimeoutLogout}
            className="inline-flex items-center justify-center gap-2 py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors cursor-pointer text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair Agora</span>
          </button>
        </div>
      </div>
    </div>
  );
}
