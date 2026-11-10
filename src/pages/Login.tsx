import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function Login() {
  const { user, isAdmin, loading, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [user, isAdmin, loading, navigate]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-green-50/60 to-emerald-100/40">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-zinc-900 p-10 rounded-xl shadow-lg border border-gray-100">
        {user && !isAdmin && !loading ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Conta Sem Permissões</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              A tua conta ({user.email}) tem sessão iniciada, mas ainda não foi adicionada à lista de administradores na base de dados.
            </p>
            <button
              onClick={() => logout()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Terminar Sessão</span>
            </button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h2 className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
                Acesso Restrito
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Faz login para gerir o cancioneiro
              </p>
            </div>
            <LoginForm />
          </>
        )}
      </div>
    </div>
  );
}
