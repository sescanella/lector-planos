import { Badge } from '@/components/ui/badge';
import { getConfidenceLevel } from '@/lib/utils';

interface ConfidenceBadgeProps {
  score: number;
}

const levelConfig = {
  alta: { label: 'Alta', variant: 'success' as const },
  media: { label: 'Media', variant: 'warning' as const },
  baja: { label: 'Baja', variant: 'destructive' as const },
};

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(score);
  const config = levelConfig[level];

  return (
    <Badge variant={config.variant} title={`Confianza: ${(score * 100).toFixed(0)}%`}>
      {config.label} ({(score * 100).toFixed(0)}%)
    </Badge>
  );
}
