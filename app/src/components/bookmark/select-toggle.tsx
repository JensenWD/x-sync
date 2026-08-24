'use client';

import { CheckSquareIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The way into (and out of) bulk organizing. One control rendered at both
 * breakpoints — inline in the desktop result row, as a compact button in the
 * mobile facet row, which is the only entry point a phone has because there is
 * no hover to reveal the card checkboxes.
 *
 * Mirrors the `compact` idiom the facet bar's sort menu already uses.
 */
export function SelectToggle({
  selecting,
  onToggle,
  compact = false,
}: {
  selecting: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selecting}
      aria-label={selecting ? 'Stop selecting posts' : 'Select posts'}
      title="Select posts to file in bulk (x)"
      className={cn(
        'flex shrink-0 items-center gap-1.5 transition-colors',
        compact
          ? cn(
              'h-[34px] justify-center rounded-[8px] border px-2.5',
              selecting
                ? 'border-chip-active-border bg-chip-active text-chip-active-foreground'
                : 'border-input-border bg-[#17171a] text-text-secondary',
            )
          : cn(
              'text-[12px] hover:text-text-primary',
              selecting ? 'text-text-primary' : 'text-muted-foreground',
            ),
      )}
    >
      <CheckSquareIcon className="size-3.5" />
      {!compact && (selecting ? 'Done' : 'Select')}
    </button>
  );
}
