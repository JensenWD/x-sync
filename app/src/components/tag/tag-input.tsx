'use client';

import { useState, useRef } from 'react';
import { TagIcon, XIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTags } from '@/hooks/use-tags';
import { useAddTag, useRemoveTag } from '@/hooks/use-bookmarks';
import type { Tag } from '@/types';

interface TagInputProps {
  bookmarkId: number;
  bookmarkTags: Tag[];
}

export function TagInput({ bookmarkId, bookmarkTags }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = useTags();
  const addTag = useAddTag();
  const removeTag = useRemoveTag();

  const existingTagIds = new Set(bookmarkTags.map((t) => t.id));
  const suggestions = allTags.filter(
    (t) =>
      !existingTagIds.has(t.id) &&
      t.name.toLowerCase().startsWith(inputValue.toLowerCase()) &&
      inputValue.length > 0,
  );

  function commitTag(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    if (bookmarkTags.some((t) => t.name === trimmed)) return;
    addTag.mutate({ bookmarkId, name: trimmed });
    setInputValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag(inputValue);
    }
    if (e.key === 'Backspace' && inputValue === '' && bookmarkTags.length > 0) {
      const last = bookmarkTags[bookmarkTags.length - 1];
      removeTag.mutate({ bookmarkId, tagId: last.id });
    }
  }

  return (
    <Popover>
      {/* base-ui Trigger renders as a <button> — style it directly */}
      <PopoverTrigger
        className="p-3 sm:p-1.5 rounded-full sm:rounded-md text-[#71767b] hover:text-[#1d9bf0] hover:bg-secondary transition-colors"
        title="Tags"
        aria-label="Tags"
        onClick={(e) => e.stopPropagation()}
      >
        <TagIcon className="w-5 h-5 sm:w-3.5 sm:h-3.5" />
      </PopoverTrigger>

      <PopoverContent
        className="w-60 p-2 bg-popover border-border"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">
          Tags
        </p>
        {/* Existing tag chips */}
        <div className="flex flex-wrap gap-1 mb-2">
          {bookmarkTags.map((tag) => (
            <span
              key={tag.id}
              className="flex items-center gap-1 text-[11px] bg-secondary border border-border text-text-primary rounded-full px-2 py-0.5"
            >
              {tag.name}
              <button
                onClick={() => removeTag.mutate({ bookmarkId, tagId: tag.id })}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        {/* Input */}
        <div className="relative">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add tag…"
            className="w-full text-xs bg-secondary border border-border rounded-md px-2 py-1.5 text-text-primary placeholder:text-muted-foreground outline-none focus:border-[#1d9bf0]"
          />
          {/* Autocomplete suggestions */}
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
              {suggestions.slice(0, 6).map((tag) => (
                <button
                  key={tag.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitTag(tag.name);
                  }}
                  className="w-full text-left text-xs px-2 py-1.5 hover:bg-secondary text-text-primary"
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Press Enter or comma to add
        </p>
      </PopoverContent>
    </Popover>
  );
}
