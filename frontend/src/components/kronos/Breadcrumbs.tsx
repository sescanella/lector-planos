import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-2 font-heading text-[11px] font-normal">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;

        return (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span className="text-white/20" aria-hidden="true">
                ›
              </span>
            )}
            {item.href && !isLast ? (
              <Link
                to={item.href}
                className="text-white/40 hover:text-white/60 hover:underline cursor-pointer"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-white/60">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
