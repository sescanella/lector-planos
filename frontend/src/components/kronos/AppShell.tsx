import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TechnicalFooter } from './TechnicalFooter';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const auth = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    auth.logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-primary-dark">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.12] bg-black/30 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 lg:px-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/kronos-logo.svg" alt="Kronos Mining" className="h-5 w-auto" />
            <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.3em] text-white/85">
              Kronos Mining
            </span>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 cursor-pointer border-none bg-transparent font-heading text-[11px] uppercase tracking-[0.15em] text-white/40 transition-colors duration-150 hover:text-white/60"
          >
            <LogOut size={16} strokeWidth={2} />
            CERRAR SESIÓN
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 lg:px-12 lg:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-12">
        <TechnicalFooter
          items={[
            'Lector de Planos · Kronos Mining',
            'v1.0.0',
            '2026',
          ]}
        />
      </footer>
    </div>
  );
}
