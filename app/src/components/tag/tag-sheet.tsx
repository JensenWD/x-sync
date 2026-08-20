'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TagChip } from '@/components/layout/facet-chip';
import { useTags } from '@/hooks/use-tags';
import { type TagMode, useLibraryFilters } from '@/hooks/use-library-filters';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types';

interface TagSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resultCount: number | undefined;
}

/**
 * 3b — the mobile home for the long tail of tags. Selections apply live, so the
 * confirm button just dismisses the sheet with the count it will reveal.
 */
export function TagSheet({ open, onOpenChange, resultCount }: TagSheetProps) {
  const { tags, tagMode, toggleTag, setTags, setTagMode } = useLibraryFilters();
  const { data: allTags = [] } = useTags();
  const [query, setQuery] = useState('');

  const selected = useMemo<Tag[]>(
    () => tags.map((name) => allTags.find((tag) => tag.name === name) ?? { id: -1, name }),
    [tags, allTags],
  );

  const available = useMemo(() => {
    const active = new Set(tags);
    const needle = query.trim().toLowerCase();
    return allTags
      .filter((tag) => !active.has(tag.name))
      .filter((tag) => !needle || tag.name.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          (b.bookmark_count ?? 0) - (a.bookmark_count ?? 0) || a.name.localeCompare(b.name),
      );
  }, [allTags, tags, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // 3b dims the library behind the sheet rather than blurring it.
        overlayClassName="bg-black/65 supports-backdrop-filter:backdrop-blur-none"
        animation="data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-full"
        className={cn(
          'top-auto bottom-0 left-0 flex max-h-[85vh] max-w-none translate-x-0 translate-y-0 flex-col sm:max-w-none',
          'gap-0 rounded-t-[22px] rounded-b-none border-t border-[#2a2a2e] bg-[#141417] p-0 ring-0',
          'pb-[max(34px,env(safe-area-inset-bottom))] shadow-[0_-30px_60px_-20px_#000]',
        )}
      >
        <span className="mx-auto mt-2 h-1 w-[38px] shrink-0 rounded-full bg-[#33333a]" />

        <div className="flex shrink-0 items-baseline justify-between px-5 pt-3.5 pb-3">
          <DialogTitle className="font-serif text-[20px] font-normal text-text-primary">
            Tags
          </DialogTitle>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[12px] text-[#8a8a90]">
              {tags.length} selected
            </span>
            {tags.length > 0 && (
              <button
                type="button"
                onClick={() => setTags([])}
                className="font-mono text-[12px] text-muted-foreground"
              >
                clear
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 px-5 pb-3.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="find a tag…"
            aria-label="Find a tag"
            className="h-11 w-full rounded-[12px] border border-[#2a2a2e] bg-[#1b1b1e] px-3.5 font-mono text-[14px] text-text-primary outline-none placeholder:text-[#75757b] focus:border-[#3a3a41]"
          />
        </div>

        {tags.length > 1 && (
          <div className="flex shrink-0 items-center gap-2 px-5 pb-3 font-mono text-[11px]">
            <span className="text-muted-foreground">match</span>
            {(['all', 'any'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTagMode(option as TagMode)}
                className={cn(
                  'rounded px-2.5 py-1 transition-colors',
                  tagMode === option
                    ? 'bg-chip-active text-chip-active-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="flex flex-wrap gap-2">
            {selected.map((tag) => (
              <TagChip
                key={`on-${tag.name}`}
                name={tag.name}
                count={tag.bookmark_count}
                size="md"
                active
                onClick={() => toggleTag(tag.name)}
              />
            ))}
            {available.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                count={tag.bookmark_count}
                size="md"
                onClick={() => toggleTag(tag.name)}
              />
            ))}
            {selected.length === 0 && available.length === 0 && (
              <p className="py-2 font-serif text-[15px] italic text-muted-foreground">
                {allTags.length === 0 ? 'No tags yet.' : 'No tag matches that.'}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 px-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-[50px] w-full rounded-[13px] bg-primary text-[15px] font-semibold text-primary-foreground"
          >
            {resultCount === undefined
              ? 'Done'
              : `Show ${resultCount.toLocaleString()} ${resultCount === 1 ? 'post' : 'posts'}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
