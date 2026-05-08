'use client';

import { useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { useAddTag } from '@/hooks/use-bookmarks';

interface SuggestedTagChipsProps {
  bookmarkId: number;
  suggestions: string[];
}

export function SuggestedTagChips({ bookmarkId, suggestions }: SuggestedTagChipsProps) {
  // Local-only dismissal — the suggestion is recomputed on next page fetch
  // anyway, so persisting "I don't want this tag" isn't worth the complexity.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set());
  const addTag = useAddTag();

  const visible = suggestions.filter((tag) => !dismissed.has(tag) && !accepted.has(tag));
  if (visible.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 mb-2"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-secondary)] font-semibold">
        Suggested
      </span>
      {visible.map((tag) => (
        <span
          key={tag}
          className="group/chip flex items-center gap-0.5 text-[12px] font-mono text-[var(--text-secondary)] border border-dashed border-white/20 rounded-full pl-1 pr-0.5 py-0.5 hover:border-[#1d9bf0] hover:text-[#1d9bf0] transition-colors"
        >
          <button
            type="button"
            onClick={() => {
              setAccepted((prev) => {
                const next = new Set(prev);
                next.add(tag);
                return next;
              });
              addTag.mutate({ bookmarkId, name: tag });
            }}
            className="flex items-center gap-0.5 px-1"
            title={`Add #${tag}`}
            aria-label={`Add tag ${tag}`}
          >
            <PlusIcon className="w-3 h-3" />
            <span>#{tag}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setDismissed((prev) => {
                const next = new Set(prev);
                next.add(tag);
                return next;
              })
            }
            className="p-0.5 rounded-full text-[var(--text-secondary)]/60 hover:text-[var(--text-secondary)]"
            title={`Dismiss suggestion`}
            aria-label={`Dismiss suggestion ${tag}`}
          >
            <XIcon className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
