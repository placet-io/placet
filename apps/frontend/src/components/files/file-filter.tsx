'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Images' },
  { key: 'application/pdf', label: 'PDFs' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Audio' },
] as const;

interface FileFilterProps {
  active: string;
  onChange: (key: string) => void;
}

export const FileFilter = memo(function FileFilter({ active, onChange }: FileFilterProps) {
  return (
    <div className="flex gap-1">
      {FILTERS.map(({ key, label }) => (
        <Button
          key={key}
          variant={active === key ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange(key)}
          className={cn(
            'rounded-xl text-xs',
            active === key && 'bg-primary text-primary-foreground',
          )}
        >
          {label}
        </Button>
      ))}
    </div>
  );
});
