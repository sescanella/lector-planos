import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

export function Header() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-surface">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/jobs" className="flex items-center gap-2">
          <span className="font-heading text-xl font-bold text-primary">Blueprint</span>
          <span className="font-heading text-xl font-bold text-accent">AI</span>
        </Link>
        {isAuthenticated && (
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" />
            Salir
          </Button>
        )}
      </div>
    </header>
  );
}
