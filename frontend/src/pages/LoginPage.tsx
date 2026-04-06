import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/api/client';
import { AuthValidateSchema } from '@/types/api';

export function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, getIntendedPath } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Clave invalida');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const data = await apiClient.get('api/v1/auth/validate', {
        headers: { 'X-API-Key': apiKey },
      }).json();
      const result = AuthValidateSchema.parse(data);

      if (result.valid) {
        login(apiKey);
        const intended = getIntendedPath();
        navigate(intended ?? '/ots', { replace: true });
      }
    } catch (err) {
      if (err instanceof Error && 'response' in err) {
        const status = (err as { response: { status: number } }).response.status;
        if (status === 401) {
          setError('Clave invalida');
        } else {
          setError('Error de conexion. Intenta mas tarde.');
        }
      } else {
        setError('Sin conexion al servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-primary-dark">
      {/* Login content */}
      <div className="w-full max-w-sm px-6">
        {/* Logo + label */}
        <div className="mb-2 flex items-center gap-3">
          <img src="/kronos-logo.svg" alt="Kronos Mining" className="h-5 w-auto" />
          <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.3em] text-white/85">
            Lector de Planos
          </span>
        </div>

        {/* Divider */}
        <div className="mb-8 h-px w-[60px] bg-white/20" />

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Ingresa tu API key"
            autoComplete="off"
            aria-describedby={error ? 'login-error' : undefined}
            className="w-full rounded-none border border-white/[0.12] bg-white/[0.04] px-4 py-3 font-sans text-[15px] text-white outline-none transition-[border-color] duration-150 placeholder:text-white/30 focus:border-white/30"
          />

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full cursor-pointer rounded-none bg-accent px-6 py-3 font-sans text-sm font-bold uppercase tracking-[0.15em] text-white transition-colors duration-150 hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'Verificando...' : 'Entrar'}
          </button>

          {error && (
            <div
              id="login-error"
              role="alert"
              className="mt-4 rounded-none border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.08)] px-3 py-2 font-heading text-[11px] font-semibold text-[#F87171]"
            >
              {error}
            </div>
          )}
        </form>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 flex w-full justify-center py-6">
        <div className="flex items-center gap-4 font-heading text-[10px] font-semibold uppercase tracking-[0.25em] text-white/30">
          <span>Kronos Mining · Santiago, Chile</span>
          <span className="text-[6px] text-[rgba(255,120,0,0.6)]" aria-hidden="true">●</span>
          <span>Est. 2016</span>
        </div>
      </div>
    </div>
  );
}
