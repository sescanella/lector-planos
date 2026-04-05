import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/api/client';
import { AuthValidateSchema } from '@/types/api';

export function LoginPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, getIntendedPath } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Ingresa una API key');
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
        navigate(intended ?? '/jobs', { replace: true });
      }
    } catch (err) {
      if (err instanceof Error && 'response' in err) {
        const status = (err as { response: { status: number } }).response.status;
        if (status === 401) {
          setError('API key inválida');
        } else {
          setError('Error de conexión. Intenta más tarde.');
        }
      } else {
        setError('Sin conexión al servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2">
            <span className="font-heading text-3xl font-bold text-primary">Blueprint</span>
            <span className="font-heading text-3xl font-bold text-accent">AI</span>
          </div>
          <CardTitle className="text-lg">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="api-key" className="text-sm font-medium">
                API Key
              </label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="Ingresa tu API key"
                  autoComplete="off"
                  aria-describedby={error ? 'login-error' : undefined}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Ocultar API key' : 'Mostrar API key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && (
              <p id="login-error" className="text-sm text-error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
