import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ConfidenceBadge } from './ConfidenceBadge';

interface CajetinCardProps {
  metadata: Record<string, unknown>;
  confidence: number;
}

const fieldLabels: Record<string, string> = {
  drawing_number: 'N° Plano',
  revision: 'Revisión',
  date_created: 'Fecha',
  material_grade: 'Grado Material',
  pressure_rating: 'Presión',
  temperature_rating: 'Temperatura',
  total_weight: 'Peso Total',
  weight_unit: 'Unidad Peso',
  notes: 'Notas',
  ot: 'OT',
  of: 'OF',
  tag_spool: 'Tag Spool',
  diameter: 'Diámetro',
  client: 'Cliente',
  end_client: 'Cliente Final',
  line: 'Línea',
};

export function CajetinCard({ metadata, confidence }: CajetinCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Cajetín</CardTitle>
        <ConfidenceBadge score={confidence} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {Object.entries(metadata).map(([key, value]) => (
            <div key={key} className="flex justify-between py-1 border-b border-border/50">
              <dt className="text-muted-foreground text-sm">{fieldLabels[key] ?? key}</dt>
              <dd className="text-sm font-medium">{String(value ?? '-')}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
