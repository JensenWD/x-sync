'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateFolderPopover } from '@/components/folder/create-folder-popover';
import { SelectToggle } from '@/components/bookmark/select-toggle';
import { TagSheet } from '@/components/tag/tag-sheet';
import { CollectionChip, TagChip } from './facet-chip';
import { useFolders } from '@/hooks/use-folders';
import { useTags } from '@/hooks/use-tags';
import { useSyncStatus } from '@/hooks/use-sync';
import { SORT_LABELS, type TagMode, useLibraryFilters } from '@/hooks/use-library-filters';
import { cn } from '@/lib/utils';
import type { Tag } from '@/types';

const ROW_LABEL = 'shrink-0 font-serif text-[14px] italic text-muted-foreground';

function SortMenu({
  sort,
  onSelect,
  compact = false,
}: {
  sort: string;
  onSelect: (value: string) => void;
  compact?: boolean;
}) {
  const label = SORT_LABELS[sort] ?? SORT_LABELS.bookmarked_at_desc;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Sort saved posts: ${label}`}
        className={cn(
          'flex shrink-0 items-center gap-1 transition-colors hover:text-text-primary',
          compact
            ? 'h-[34px] rounded-[8px] border border-input-border bg-[#17171a] px-2.5 font-mono text-[12px] text-text-secondary'
            : 'text-[13px] text-muted-foreground',
        )}
      >
        {label}
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-border bg-popover">
        {Object.entries(SORT_LABELS).map(([value, label]) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onSelect(value)}
            className={cn(
              'cursor-pointer text-[13px]',
              sort === value ? 'text-text-primary' : 'text-text-secondary',
            )}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeToggle({
  mode,
  onChange,
  enabled,
}: {
  mode: TagMode;
  onChange: (mode: TagMode) => void;
  enabled: boolean;
}) {
  return (
    <div
      className={cn('ml-2 flex shrink-0 items-center gap-1 font-mono text-[10px]', !enabled && 'opacity-45')}
      title={
        enabled
          ? 'all — posts carrying every selected tag. any — posts carrying at least one.'
          : 'Select two or more tags to combine them'
      }
    >
      {(['all', 'any'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={!enabled}
          onClick={() => onChange(option)}
          className={cn(
            'rounded px-2 py-1 transition-colors',
            mode === option
              ? 'bg-chip-active text-chip-active-foreground'
              : 'text-muted-foreground enabled:hover:bg-[#17171a]',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * 2a's facet bar on desktop — collections on row one, tags on row two — and
 * 3a's two horizontally scrolling rows on mobile, where the long tail of tags
 * moves into a sheet reached from the row's leading control.
 */
export function FacetBar({
  resultCount,
  selecting,
  onToggleSelecting,
}: {
  resultCount: number | undefined;
  selecting: boolean;
  onToggleSelecting: () => void;
}) {
  const { folderId, tags, tagMode, sort, setFolder, toggleTag, setTagMode, setSort } =
    useLibraryFilters();
  const { data: folders = [] } = useFolders();
  const { data: allTags = [] } = useTags();
  const { data: syncStatus } = useSyncStatus();
  const [tagFilter, setTagFilter] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const selected = useMemo<Tag[]>(
    () =>
      tags.map(
        (name) => allTags.find((tag) => tag.name === name) ?? { id: -1, name },
      ),
    [tags, allTags],
  );

  // Most-used tags first: in a single row, that is what earns the space.
  const available = useMemo(() => {
    const active = new Set(tags);
    const needle = tagFilter.trim().toLowerCase();
    return allTags
      .filter((tag) => !active.has(tag.name))
      .filter((tag) => !needle || tag.name.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          (b.bookmark_count ?? 0) - (a.bookmark_count ?? 0) || a.name.localeCompare(b.name),
      );
  }, [allTags, tags, tagFilter]);

  const totalSaved = syncStatus?.total_bookmarks;
  const allLabel = totalSaved === undefined ? 'All' : `All · ${totalSaved}`;

  const collectionChips = (
    <>
      <CollectionChip
        label={allLabel}
        showDot={false}
        active={folderId === null}
        onClick={() => setFolder(null)}
      />
      {folders.map((folder) => (
        <CollectionChip
          key={folder.id}
          label={folder.name}
          count={folder.bookmark_count}
          color={folder.color}
          active={folderId === folder.id}
          onClick={() => setFolder(folderId === folder.id ? null : folder.id)}
        />
      ))}
    </>
  );

  // 3a gives the active mobile chips an explicit × because the phone has no
  // separate result row to strip a facet from; 2a keeps that job in its own row.
  const tagChips = (withRemove: boolean) => (
    <>
      {selected.map((tag) => (
        <TagChip
          key={`on-${tag.name}`}
          name={tag.name}
          count={tag.bookmark_count}
          active
          onClick={() => toggleTag(tag.name)}
          onRemove={withRemove ? () => toggleTag(tag.name) : undefined}
        />
      ))}
      {available.map((tag) => (
        <TagChip
          key={tag.id}
          name={tag.name}
          count={tag.bookmark_count}
          onClick={() => toggleTag(tag.name)}
        />
      ))}
    </>
  );

  return (
    <>
      {/* Desktop row one — collections. */}
      <div className="hidden items-center gap-2 px-8 pt-2 pb-2 md:flex">
        <span className={cn(ROW_LABEL, 'mr-1.5')}>collections</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
          {collectionChips}
          <CreateFolderPopover />
        </div>
        <div className="ml-4">
          <SortMenu sort={sort} onSelect={setSort} />
        </div>
      </div>

      {/* Desktop row two — tags, with inline narrowing and the any/all joiner. */}
      <div className="hidden items-center gap-2 border-b border-hairline bg-surface px-8 py-1.5 md:flex">
        <span className={cn(ROW_LABEL, 'mr-1.5')}>tags</span>
        <input
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          placeholder="filter tags…"
          aria-label="Filter the tag list"
          className="w-[150px] shrink-0 rounded-[6px] border border-[#26262a] bg-[#17171a] px-2.5 py-1 font-mono text-[11px] text-text-primary outline-none transition-colors placeholder:text-text-faint focus:border-[#3a3a41]"
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
          {allTags.length === 0 ? (
            <span className="font-serif text-[13px] italic text-muted-foreground">
              no tags yet
            </span>
          ) : (
            tagChips(false)
          )}
        </div>
        <ModeToggle mode={tagMode} onChange={setTagMode} enabled={tags.length > 1} />
      </div>

      {/* Mobile row one — collections. A phone has no hover to reveal the card
          checkboxes, so this is where a bulk selection is started. */}
      <div className="flex items-center gap-2 px-5 pt-2.5 md:hidden">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-none">
          {collectionChips}
        </div>
        <SelectToggle selecting={selecting} onToggle={onToggleSelecting} compact />
        <SortMenu sort={sort} onSelect={setSort} compact />
      </div>

      {/* Mobile row two — tags, with the sheet behind the leading control. */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none border-b border-hairline px-5 pt-2 pb-2.5 md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-[8px] border border-[#2a2a2e] bg-[#17171a] px-3 font-mono text-[12px] text-[#c8c8ce]"
        >
          <SearchIcon className="size-3.5" />
          tags
          {tags.length > 0 && <span className="text-[#7d848c]">{tags.length}</span>}
        </button>
        {tagChips(true)}
      </div>

      <TagSheet open={sheetOpen} onOpenChange={setSheetOpen} resultCount={resultCount} />
    </>
  );
}
