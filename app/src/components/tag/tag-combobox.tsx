'use client';

import { useState } from 'react';
import { useTags } from '@/hooks/use-tags';

/**
 * Type a tag, or pick one you already use.
 *
 * Shared by the per-post tag popover and the bulk selection bar — the two
 * differ only in what committing a name does, so that is the one thing the
 * caller supplies. Names are lowercased here because that is how they are
 * stored, and the suggestion list hides what the target already carries.
 */
export function TagCombobox({
  exclude = [],
  onCommit,
  onBackspaceEmpty,
  placeholder = 'Add tag…',
  hint,
}: {
  exclude?: string[];
  onCommit: (name: string) => void;
  onBackspaceEmpty?: () => void;
  placeholder?: string;
  hint?: string;
}) {
  const [value, setValue] = useState('');
  const { data: allTags = [] } = useTags();

  const needle = value.trim().toLocaleLowerCase();
  const excluded = new Set(exclude);
  const suggestions = needle
    ? allTags.filter((tag) => !excluded.has(tag.name) && tag.name.startsWith(needle)).slice(0, 6)
    : [];

  function commit(name: string) {
    const normalized = name.trim().toLocaleLowerCase();
    if (!normalized || excluded.has(normalized)) return;
    onCommit(normalized);
    setValue('');
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit(value);
          }
          if (event.key === 'Backspace' && value === '') onBackspaceEmpty?.();
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-input-border bg-input px-2 py-1.5 font-mono text-xs text-text-primary outline-none placeholder:text-muted-foreground focus:border-[#3a3a41]"
      />

      {suggestions.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-0.5 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                commit(tag.name);
              }}
              className="flex w-full items-center justify-between px-2 py-1.5 text-left font-mono text-xs text-text-primary hover:bg-secondary"
            >
              {tag.name}
              {tag.bookmark_count !== undefined && (
                <span className="text-text-faint">{tag.bookmark_count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {hint && <p className="mt-1.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
