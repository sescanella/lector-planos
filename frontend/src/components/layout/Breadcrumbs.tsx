import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  path: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: 'Jobs', path: '/jobs' }];
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'jobs' && segments[1]) {
    crumbs.push({ label: `Job ${segments[1].slice(0, 8)}...`, path: `/jobs/${segments[1]}` });
    if (segments[2] === 'spools' && segments[3]) {
      crumbs.push({ label: `Spool ${segments[3].slice(0, 8)}...`, path: pathname });
    }
  }

  return crumbs;
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const crumbs = buildCrumbs(pathname);

  if (pathname === '/jobs' || pathname === '/login') return null;

  return (
    <nav aria-label="Navegación" className="mx-auto max-w-7xl px-4 py-2">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {crumbs.map((crumb, i) => (
          <li key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            {i < crumbs.length - 1 ? (
              <Link to={crumb.path} className="hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
