import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setIntendedPath } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    setIntendedPath(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
