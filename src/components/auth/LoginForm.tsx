import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, AlertCircle, Eye, EyeOff, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const FAILED_ATTEMPTS_STORAGE_KEY = 'scout_login_failed_attempts';
const LOCKOUT_UNTIL_STORAGE_KEY = 'scout_login_lockout_until';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Proteção contra força bruta (Throttling)
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    try {
      const stored = sessionStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY);
      return stored ? parseInt(stored, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [lockoutRemaining, setLockoutRemaining] = useState<number>(() => {
    try {
      const until = sessionStorage.getItem(LOCKOUT_UNTIL_STORAGE_KEY);
      if (until) {
        const remainingMs = parseInt(until, 10) - Date.now();
        return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
      }
      return 0;
    } catch {
      return 0;
    }
  });

  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTimeout = searchParams.get('reason') === 'inactivity';

  // Temporizador para o bloqueio de força bruta
  useEffect(() => {
    if (lockoutRemaining <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          try {
            sessionStorage.removeItem(LOCKOUT_UNTIL_STORAGE_KEY);
          } catch {
            // Ignora
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleForgotPassword = async () => {
    setError(null);
    setResetMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Escreve primeiro o teu email no campo acima e clica novamente em "Esqueci-me da palavra-passe".');
      return;
    }
    if (!supabase) {
      setError('Supabase não está configurado.');
      return;
    }

    setIsSendingReset(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/set-password`,
      });

      if (resetError) {
        const msg = (resetError.message || '').toLowerCase();
        const status = (resetError as { status?: number }).status;
        if (status === 429 || msg.includes('rate limit') || msg.includes('too many') || msg.includes('seconds')) {
          setError('Pediste demasiados emails de recuperação. Aguarda alguns minutos e tenta novamente.');
          return;
        }
        // Outros erros: mensagem neutra para não revelar que emails existem
        console.warn('Erro ao pedir recuperação de palavra-passe:', resetError);
      }
      setResetMessage('Se o email estiver registado, vais receber um link para definir uma nova palavra-passe. Verifica também a pasta de spam.');
    } catch {
      setError('Não foi possível enviar o email de recuperação. Tenta novamente mais tarde.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemaining > 0) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const { error: loginError } = await login(email, password);

      if (loginError) {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        try {
          sessionStorage.setItem(FAILED_ATTEMPTS_STORAGE_KEY, newAttempts.toString());
        } catch {
          // Ignora
        }

        // Se exceder 4 ou 7 tentativas consecutivas, aplica bloqueio temporal
        if (newAttempts >= 7) {
          const lockSeconds = 60;
          const lockoutTime = Date.now() + lockSeconds * 1000;
          try {
            sessionStorage.setItem(LOCKOUT_UNTIL_STORAGE_KEY, lockoutTime.toString());
          } catch {
            // Ignora
          }
          setLockoutRemaining(lockSeconds);
          setError(
            'Demasiadas tentativas incorretas consecutivas. O acesso foi bloqueado por 60 segundos por motivos de segurança.'
          );
        } else if (newAttempts >= 4) {
          const lockSeconds = 30;
          const lockoutTime = Date.now() + lockSeconds * 1000;
          try {
            sessionStorage.setItem(LOCKOUT_UNTIL_STORAGE_KEY, lockoutTime.toString());
          } catch {
            // Ignora
          }
          setLockoutRemaining(lockSeconds);
          setError(
            'Demasiadas tentativas falhadas. O formulário está bloqueado por 30 segundos por proteção contra força bruta.'
          );
        } else {
          // Mensagem normal, com aviso se já falhou 2 ou 3 vezes
          const baseMsg = loginError.message || 'Erro ao iniciar sessão. Verifique as suas credenciais.';
          if (newAttempts >= 2) {
            setError(`${baseMsg} (Tentativa ${newAttempts} de 4 antes do bloqueio de segurança)`);
          } else {
            setError(baseMsg);
          }
        }
      } else {
        // Sucesso: limpar contadores
        try {
          sessionStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
          sessionStorage.removeItem(LOCKOUT_UNTIL_STORAGE_KEY);
        } catch {
          // Ignora
        }
        navigate('/admin');
      }
    } catch {
      setError('Ocorreu um erro inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLockedOut = lockoutRemaining > 0;

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-gray-100 dark:border-zinc-800">
      <div className="flex flex-col items-center mb-6">
        <div className="w-14 h-14 bg-scout-green/10 text-scout-green rounded-full flex items-center justify-center mb-3">
          <LogIn className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Iniciar Sessão</h2>
        <p className="text-gray-500 text-xs sm:text-sm mt-1 text-center">
          Acesso reservado aos chefes e animadores do Agrupamento 488
        </p>
      </div>

      {/* Aviso de Sessão Expirada por Inatividade */}
      {isTimeout && (
        <div className="mb-5 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-600/50 rounded-xl flex items-start gap-2.5">
          <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              Sessão Expirada
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5 leading-relaxed">
              A tua sessão foi encerrada após 30 minutos sem atividade para segurança da conta. Inicia sessão para continuar.
            </p>
          </div>
        </div>
      )}

      {/* Aviso de Bloqueio por Força Bruta */}
      {isLockedOut && (
        <div className="mb-5 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-500/50 rounded-xl flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              Bloqueio Temporário de Segurança
            </h4>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
              Por proteção contra tentativas automatizadas, aguarda{' '}
              <strong className="font-mono text-amber-900 dark:text-amber-100 font-bold">
                {lockoutRemaining}s
              </strong>{' '}
              para poderes submeter novamente.
            </p>
          </div>
        </div>
      )}

      {resetMessage && (
        <div className="mb-5 p-3.5 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/50 rounded-lg flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <p className="text-sm text-green-800 dark:text-green-300">{resetMessage}</p>
        </div>
      )}

      {/* Erro de credenciais normais */}
      {error && !isLockedOut && (
        <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-scout-green focus:border-scout-green outline-none transition-colors text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-zinc-800 disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-zinc-800/50"
            placeholder="o.teu.email@exemplo.pt"
            disabled={isSubmitting || isLockedOut}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1"
          >
            Palavra-passe
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 pr-10 border border-gray-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-scout-green focus:border-scout-green outline-none transition-colors text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-zinc-800 disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-zinc-800/50"
              placeholder="••••••••"
              disabled={isSubmitting || isLockedOut}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              disabled={isLockedOut}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer disabled:opacity-30"
              title={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isLockedOut}
          className={`w-full py-2.5 px-4 font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm mt-2 cursor-pointer ${
            isLockedOut
              ? 'bg-amber-600/80 text-white cursor-not-allowed opacity-90'
              : 'bg-scout-green hover:bg-scout-green/90 text-white disabled:opacity-70'
          }`}
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : isLockedOut ? (
            <>
              <Clock className="w-4 h-4 animate-spin text-white" />
              <span>Aguarde {lockoutRemaining}s...</span>
            </>
          ) : (
            'Entrar no Painel'
          )}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={isSubmitting || isSendingReset}
            className="text-xs text-scout-green hover:underline cursor-pointer disabled:opacity-50"
          >
            {isSendingReset ? 'A enviar...' : 'Esqueci-me da palavra-passe'}
          </button>
        </div>
      </form>
    </div>
  );
}
