import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ZodError } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CajetinCard } from '@/components/spools/CajetinCard';
import { DataTable } from '@/components/spools/DataTable';
import { ConfidenceBadge } from '@/components/spools/ConfidenceBadge';
import { InlineEdit } from '@/components/spools/InlineEdit';
import { SpoolDataErrorBoundary } from '@/components/ErrorBoundary';
import { useSpool, useCorrection } from '@/api/spools';
import { toast } from '@/hooks/useToast';
import { parseApiError } from '@/api/client';

const materialColumns = [
  { key: 'item', header: 'ITEM' },
  { key: 'diameter', header: 'DIAM.' },
  { key: 'code', header: 'CÓDIGO' },
  { key: 'description', header: 'DESCRIPCIÓN' },
  { key: 'quantity', header: 'CANTIDAD' },
  { key: 'heat_number', header: 'N COLADA' },
];

const weldColumns = [
  { key: 'weld_number', header: 'N SOLD.' },
  { key: 'diameter', header: 'DIAM.' },
  { key: 'weld_type', header: 'TIPO SOLD.' },
  { key: 'wps', header: 'WPS' },
  { key: 'weld_date', header: 'FECHA SOLDADURA' },
  { key: 'welder', header: 'SOLDADOR' },
  { key: 'inspection_date', header: 'FECHA INSP. VISUAL' },
  { key: 'result', header: 'RESULTADO' },
];

const cutColumns = [
  { key: 'cut_number', header: 'N CORTE' },
  { key: 'diameter', header: 'DIAM.' },
  { key: 'length', header: 'LARGO' },
  { key: 'end_1', header: 'EXTREMO 1' },
  { key: 'end_2', header: 'EXTREMO 2' },
];

export function SpoolDetailPage() {
  const { spoolId, jobId } = useParams<{ spoolId: string; jobId: string }>();
  const navigate = useNavigate();
  const { data: spool, isLoading, error } = useSpool(spoolId ?? '');
  const correction = useCorrection(spoolId ?? '');

  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string; original: string; fieldType: 'material' | 'union' | 'cut' } | null>(null);

  const handleCorrectMaterial = useCallback((rowId: string, field: string, originalValue: string) => {
    setEditingCell({ rowId, field, original: originalValue, fieldType: 'material' });
  }, []);

  const handleCorrectUnion = useCallback((rowId: string, field: string, originalValue: string) => {
    setEditingCell({ rowId, field, original: originalValue, fieldType: 'union' });
  }, []);

  const handleCorrectCut = useCallback((rowId: string, field: string, originalValue: string) => {
    setEditingCell({ rowId, field, original: originalValue, fieldType: 'cut' });
  }, []);

  const handleSave = useCallback(async (newValue: string) => {
    if (!editingCell || !spoolId) return;
    try {
      await correction.mutateAsync({
        field_type: editingCell.fieldType,
        field_id: editingCell.rowId,
        original_value: editingCell.original,
        corrected_value: newValue,
        correction_type: 'modify',
      });
      toast({ title: 'Corrección guardada', variant: 'default' });
    } catch (err) {
      toast({ title: 'Error al guardar', description: parseApiError(err), variant: 'destructive' });
    }
    setEditingCell(null);
  }, [editingCell, spoolId, correction]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !spool) {
    const isZodError = error instanceof ZodError;
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <h2 className="font-heading text-xl font-bold mb-2">
          {isZodError ? 'Error de formato' : 'No encontrado'}
        </h2>
        <p className="text-muted-foreground mb-4">
          {isZodError
            ? 'El servidor devolvió datos con un formato inesperado. Intenta recargar la página.'
            : 'El spool no existe o fue eliminado.'}
        </p>
        <Button variant="outline" onClick={() => navigate(jobId ? `/jobs/${jobId}` : '/jobs')}>
          Volver
        </Button>
      </div>
    );
  }

  const materials = spool.materials.map(m => ({
    id: m.material_id,
    data: m.raw_data as Record<string, unknown>,
    confidence: m.confidence_score,
  }));

  const welds = spool.unions.map(u => ({
    id: u.union_id,
    data: u.raw_data as Record<string, unknown>,
    confidence: u.confidence_score,
  }));

  const cuts = spool.cuts.map(c => ({
    id: c.cut_id,
    data: c.raw_data as Record<string, unknown>,
    confidence: c.confidence_score,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">
            Spool {spool.spool_number ?? spool.spool_id.slice(0, 8)}
          </h1>
        </div>
        <ConfidenceBadge score={spool.confidence_score} />
      </div>

      {/* Inline edit overlay */}
      {editingCell && (
        <Card className="border-accent">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-2">
              Corrigiendo campo <strong>{editingCell.field}</strong> — valor original: "{editingCell.original}"
            </p>
            <InlineEdit
              value={editingCell.original}
              onSave={handleSave}
              onCancel={() => setEditingCell(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* Cajetín */}
      {spool.metadata && (
        <CajetinCard
          metadata={spool.metadata.raw_data}
          confidence={spool.metadata.confidence_score}
        />
      )}

      {/* Materiales */}
      <SpoolDataErrorBoundary>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Materiales</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              label="Materiales del spool"
              columns={materialColumns}
              rows={materials}
              sortable
              onCorrect={handleCorrectMaterial}
            />
          </CardContent>
        </Card>
      </SpoolDataErrorBoundary>

      {/* Soldaduras */}
      <SpoolDataErrorBoundary>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Soldaduras</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              label="Soldaduras del spool"
              columns={weldColumns}
              rows={welds}
              sortable
              onCorrect={handleCorrectUnion}
            />
          </CardContent>
        </Card>
      </SpoolDataErrorBoundary>

      {/* Cortes */}
      <SpoolDataErrorBoundary>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cortes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              label="Cortes del spool"
              columns={cutColumns}
              rows={cuts}
              sortable
              onCorrect={handleCorrectCut}
            />
          </CardContent>
        </Card>
      </SpoolDataErrorBoundary>
    </div>
  );
}
