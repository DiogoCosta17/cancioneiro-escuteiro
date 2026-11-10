import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const Footer: React.FC = () => {
  const { user } = useAuth();

  return (
    <footer className="bg-gray-50 dark:bg-zinc-900/50 border-t border-gray-200 dark:border-zinc-800 py-6 mt-auto">
      <div className="container mx-auto px-4 text-center">
        <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">Cancioneiro • Agrupamento 488 - Mafra</p>
        <p className="text-gray-400 text-xs">Sempre Alerta para Servir ⚜️</p>
        
        {/* Acesso discreto para dirigentes (apenas visível se não estiver autenticado) */}
        {!user && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
            <Link 
              to="/login" 
              className="inline-flex items-center text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-400 transition-colors gap-1 opacity-60 hover:opacity-100"
              title="Acesso de Dirigentes"
            >
              <Lock className="w-3 h-3" />
              <span>Área de Dirigentes</span>
            </Link>
          </div>
        )}
      </div>
    </footer>
  );
};
