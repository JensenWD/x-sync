'use client';

import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The two chip shapes the facet surfaces share: rounded collection pills
 * (sans, coloured dot) and squared tag chips (mono, count suffix). Keeping them
 * here is what makes the desktop facet bar, the mobile scroll rows, the tag
 * sheet and the filter summary read as one control set.
 */

interface CollectionChipProps {
  label: string;
  count?: number;
  color?: string | null;
  active?: boolean;
  showDot?: boolean;
  onClick?: () => void;
  className?: string;
}

export function CollectionChip({
  label,
  count,
  color,
  active = false,
  showDot = true,
  onClick,
  className,
}: CollectionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-[34px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors duration-150',
        'md:h-auto md:px-3.5 md:py-1.5 md:text-[13px]',
        active
          ? 'bg-primary font-medium text-primary-foreground'
          : 'border border-input-border text-text-secondary hover:border-[#3a3a3f] hover:text-text-primary',
        className,
      )}
    >
      {showDot && (
        <span
          className="size-[5px] shrink-0 rounded-full"
          style={{ backgroundColor: active ? 'currentColor' : (color ?? '#5c5c62') }}
        />
      )}
      {label}
      {count !== undefined && (
        <span className={active ? 'opacity-60' : 'text-muted-foreground'}>{count}</span>
      )}
    </button>
  );
}

interface TagChipProps {
  name: string;
  count?: number;
  active?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function TagChip({
  name,
  count,
  active = false,
  size = 'sm',
  onClick,
  onRemove,
  className,
}: TagChipProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center whitespace-nowrap border font-mono transition-colors duration-150',
        // sm carries 3a's 34px row metrics on a phone and 2a's compact chip at md+.
        size === 'sm'
          ? 'h-[34px] gap-1.5 rounded-[8px] px-[11px] text-[12px] md:h-auto md:rounded-[6px] md:px-[9px] md:py-[5px] md:text-[11px]'
          : 'h-[38px] gap-[7px] rounded-[9px] px-[13px] text-[13px]',
        active
          ? 'border-chip-active-border bg-chip-active text-chip-active-foreground'
          : size === 'sm'
            ? 'border-input-border text-text-tertiary hover:border-[#4a4a52] hover:text-text-primary'
            : 'border-[#26262a] text-text-secondary hover:border-[#4a4a52] hover:text-text-primary',
        className,
      )}
    >
      <button type="button" onClick={onClick} className="cursor-pointer outline-none">
        {name}
      </button>
      {count !== undefined && (
        <span className={active ? 'text-[#7d848c]' : 'text-text-faint'}>{count}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name} filter`}
          className="-mr-0.5 rounded text-[#7d848c] transition-colors hover:text-text-primary"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}
