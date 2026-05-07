'use client';

import { useState } from 'react';
import {
  ArchiveIcon,
  FolderIcon,
  Loader2,
  SparklesIcon,
  TagIcon,
  XIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useFolders } from '@/hooks/use-folders';
import { useTags } from '@/hooks/use-tags';
import {
  useAutoTag,
  useBulkAddFolders,
  useBulkAddTags,
  useBulkArchive,
} from '@/hooks/use-bookmarks';
import { useSelection } from './selection-context';
import { ArchiveBookmarkDialog } from './archive-bookmark-dialog';
import { cn } from '@/lib/utils';

export function BulkActionBar() {
  const { selectedIds, size, clear } = useSelection();
  const ids = [...selectedIds];

  const [archiveOpen, setArchiveOpen] = useState(false);

  const bulkArchive = useBulkArchive();
  const bulkTags = useBulkAddTags();
  const bulkFolders = useBulkAddFolders();
  const autoTag = useAutoTag();

  if (size === 0) return null;

  async function handleArchive() {
    await bulkArchive.mutateAsync({ ids });
    clear();
    setArchiveOpen(false);
  }

  async function handleAutoTag() {
    await autoTag.mutateAsync(ids);
  }

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-30 pointer-events-none w-full sm:w-auto px-2 sm:px-0"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 1.5rem)' }}
      >
        <div
          className="pointer-events-auto mx-auto flex items-center gap-1 px-2 py-1.5 rounded-full bg-popover/95 backdrop-blur-md border border-[var(--card-border)] shadow-[0_10px_40px_rgba(0,0,0,0.6)] w-fit max-w-full"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <button
            onClick={clear}
            className="flex items-center gap-1.5 px-3 h-9 sm:h-8 rounded-full text-[13px] text-text-primary hover:bg-secondary/60 transition-colors shrink-0"
            title="Clear selection (Esc)"
            aria-label={`Clear ${size} selected`}
          >
            <XIcon className="w-3.5 h-3.5" />
            <span className="font-mono">{size}</span>
            <span className="text-text-secondary hidden sm:inline">selected</span>
          </button>

          <span className="w-px h-5 bg-[var(--card-border)] mx-0.5" />

          <BulkTagsPopover
            ids={ids}
            disabled={bulkTags.isPending}
            isPending={bulkTags.isPending}
            onApplied={() => clear()}
          />

          <BulkFoldersPopover
            ids={ids}
            disabled={bulkFolders.isPending}
            isPending={bulkFolders.isPending}
            onApplied={() => clear()}
          />

          <button
            onClick={handleAutoTag}
            disabled={autoTag.isPending}
            className="flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full text-[13px] text-text-primary hover:bg-secondary/60 disabled:opacity-50 transition-colors shrink-0"
            title="Auto-tag selected"
            aria-label="Auto-tag selected"
          >
            {autoTag.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Auto-tag</span>
          </button>

          <button
            onClick={() => setArchiveOpen(true)}
            disabled={bulkArchive.isPending}
            className="flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full text-[13px] text-text-primary hover:bg-[#f4212e]/15 hover:text-[#f4212e] disabled:opacity-50 transition-colors shrink-0"
            title="Archive selected"
            aria-label="Archive selected"
          >
            <ArchiveIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Archive</span>
          </button>
        </div>
      </div>

      <ArchiveBookmarkDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onConfirm={handleArchive}
        isPending={bulkArchive.isPending}
      />
    </>
  );
}

function BulkTagsPopover({
  ids,
  disabled,
  isPending,
  onApplied,
}: {
  ids: number[];
  disabled: boolean;
  isPending: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [staged, setStaged] = useState<string[]>([]);
  const { data: tags = [] } = useTags();
  const bulkTags = useBulkAddTags();

  const stagedSet = new Set(staged.map((s) => s.toLowerCase()));
  const suggestions = tags
    .filter(
      (t) =>
        !stagedSet.has(t.name.toLowerCase()) &&
        (input === '' || t.name.toLowerCase().includes(input.toLowerCase())),
    )
    .slice(0, 6);

  function commit(name: string) {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    if (stagedSet.has(trimmed)) return;
    setStaged((prev) => [...prev, trimmed]);
    setInput('');
  }

  async function apply() {
    if (staged.length === 0 && input.trim()) commit(input);
    const finalTags = [
      ...staged,
      ...(input.trim() && !stagedSet.has(input.trim().toLowerCase())
        ? [input.trim().toLowerCase()]
        : []),
    ];
    if (finalTags.length === 0) return;
    await bulkTags.mutateAsync({ ids, tags: finalTags });
    setStaged([]);
    setInput('');
    setOpen(false);
    onApplied();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full text-[13px] text-text-primary hover:bg-secondary/60 disabled:opacity-50 transition-colors shrink-0',
        )}
        title="Add tags to selection"
        aria-label="Add tags to selection"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TagIcon className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">Tag</span>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 bg-popover border-border" align="center" side="top">
        <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">
          Add tags to {ids.length} bookmark{ids.length === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap gap-1 mb-2">
          {staged.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 text-[11px] bg-secondary border border-border text-text-primary rounded-full px-2 py-0.5"
            >
              {name}
              <button
                onClick={() => setStaged((prev) => prev.filter((s) => s !== name))}
                className="text-muted-foreground hover:text-destructive"
              >
                <XIcon className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              if (input.trim()) commit(input);
              else if (staged.length > 0) apply();
            }
            if (e.key === 'Backspace' && input === '' && staged.length > 0) {
              setStaged((prev) => prev.slice(0, -1));
            }
          }}
          placeholder="Tag name…"
          className="h-7 text-xs bg-secondary border-border"
        />
        {suggestions.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(tag.name);
                }}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-secondary text-text-primary"
              >
                {tag.name}
                <span className="ml-1.5 text-muted-foreground font-mono">
                  {tag.bookmark_count}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-2 gap-1">
          <Button
            size="sm"
            className="h-7 text-xs bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white"
            disabled={bulkTags.isPending || (staged.length === 0 && !input.trim())}
            onClick={apply}
          >
            {bulkTags.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BulkFoldersPopover({
  ids,
  disabled,
  isPending,
  onApplied,
}: {
  ids: number[];
  disabled: boolean;
  isPending: boolean;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const { data: folders = [] } = useFolders();
  const bulkFolders = useBulkAddFolders();

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function apply() {
    if (picked.size === 0) return;
    await bulkFolders.mutateAsync({ ids, folder_ids: [...picked] });
    setPicked(new Set());
    setOpen(false);
    onApplied();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="flex items-center gap-1.5 h-9 sm:h-8 px-3 rounded-full text-[13px] text-text-primary hover:bg-secondary/60 disabled:opacity-50 transition-colors shrink-0"
        title="Add to folders"
        aria-label="Add to folders"
      >
        {isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FolderIcon className="w-3.5 h-3.5" />
        )}
        <span className="hidden sm:inline">Folder</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 bg-popover border-border" align="center" side="top">
        <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-semibold">
          Add {ids.length} bookmark{ids.length === 1 ? '' : 's'} to…
        </p>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {folders.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-secondary text-sm text-text-primary"
            >
              <Checkbox
                checked={picked.has(f.id)}
                onCheckedChange={() => toggle(f.id)}
                className="border-border"
              />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: f.color ?? '#71767b' }}
              />
              <span className="truncate text-xs flex-1">{f.name}</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {f.bookmark_count}
              </span>
            </label>
          ))}
          {folders.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground italic">
              No folders yet — create one in the sidebar.
            </p>
          )}
        </div>
        <div className="flex justify-end mt-2 gap-1">
          <Button
            size="sm"
            className="h-7 text-xs bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white"
            disabled={bulkFolders.isPending || picked.size === 0}
            onClick={apply}
          >
            {bulkFolders.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Apply'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
