'use client';

import { type ReactNode } from 'react';
import { TagIcon, XIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TagCombobox } from '@/components/tag/tag-combobox';
import { useAddTag, useRemoveTag } from '@/hooks/use-bookmarks';
import type { Tag } from '@/types';

interface TagInputProps {
  bookmarkId: number;
  bookmarkTags: Tag[];
  /** Lets the reader's action bar render this as a labelled pill. */
  triggerClassName?: string;
  triggerContent?: ReactNode;
}

export function TagInput({
  bookmarkId,
  bookmarkTags,
  triggerClassName,
  triggerContent,
}: TagInputProps) {
  const addTag = useAddTag();
  const removeTag = useRemoveTag();

  return (
    <Popover>
      {/* base-ui Trigger renders as a <button> — style it directly */}
      <PopoverTrigger
        className={
          triggerClassName ??
          'p-1.5 rounded-md text-muted-foreground hover:text-text-primary hover:bg-secondary transition-colors'
        }
        title="Tags"
        onClick={(e) => e.stopPropagation()}
      >
        {triggerContent ?? <TagIcon className="w-3.5 h-3.5" />}
      </PopoverTrigger>

      <PopoverContent
        className="w-60 p-2 bg-popover border-border"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">
          Tags
        </p>
        <div className="flex flex-wrap gap-1 mb-2">
          {bookmarkTags.map((tag) => (
            <span
              key={tag.id}
              className="flex items-center gap-1 font-mono text-[11px] bg-chip-active border border-chip-active-border text-chip-active-foreground rounded-md px-2 py-0.5"
            >
              {tag.name}
              <button
                onClick={() => removeTag.mutate({ bookmarkId, tagId: tag.id })}
                aria-label={`Remove ${tag.name}`}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>

        <TagCombobox
          exclude={bookmarkTags.map((tag) => tag.name)}
          onCommit={(name) => addTag.mutate({ bookmarkId, name })}
          onBackspaceEmpty={() => {
            const last = bookmarkTags[bookmarkTags.length - 1];
            if (last) removeTag.mutate({ bookmarkId, tagId: last.id });
          }}
          hint="Press Enter or comma to add"
        />
      </PopoverContent>
    </Popover>
  );
}
