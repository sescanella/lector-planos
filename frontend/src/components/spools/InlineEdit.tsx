import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  onCancel: () => void;
}

export function InlineEdit({ value, onSave, onCancel }: InlineEditProps) {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editValue !== value) {
        onSave(editValue);
      } else {
        onCancel();
      }
    }
    if (e.key === 'Escape') {
      onCancel();
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        ref={inputRef}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 text-sm"
        aria-label="Valor corregido"
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => { if (editValue !== value) onSave(editValue); else onCancel(); }}
        aria-label="Confirmar"
      >
        <Check className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onCancel}
        aria-label="Cancelar edición"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
