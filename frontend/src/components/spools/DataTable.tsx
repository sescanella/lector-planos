import { useState, useMemo } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isLowConfidence } from '@/lib/utils';
import { PAGE_SIZE } from '@/constants';

interface DataTableProps {
  label: string;
  columns: { key: string; header: string }[];
  rows: Array<{ id: string; data: Record<string, unknown>; confidence: number }>;
  sortable?: boolean;
  onCorrect?: (rowId: string, field: string, originalValue: string) => void;
}

export function DataTable({ label, columns, rows, sortable = false, onCorrect }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = String(a.data[sortKey] ?? '');
      const bVal = String(b.data[sortKey] ?? '');
      const cmp = aVal.localeCompare(bVal, 'es', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, sorted.length);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={label}>
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map(col => (
                <th key={col.key} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                  {sortable ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.header}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map(row => (
              <tr key={row.id} className="border-b">
                {columns.map(col => {
                  const value = String(row.data[col.key] ?? '');
                  const lowConf = isLowConfidence(row.confidence);
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2 group/cell relative ${lowConf ? 'bg-red-50 text-error' : ''}`}
                    >
                      <span>{value}</span>
                      {onCorrect && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover/cell:opacity-100 transition-opacity"
                          title={`Corregir ${col.header}`}
                          onClick={() => onCorrect(row.id, col.key, value)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted-foreground">
                  Sin datos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground">
          <span>Mostrando {start}-{end} de {sorted.length}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
