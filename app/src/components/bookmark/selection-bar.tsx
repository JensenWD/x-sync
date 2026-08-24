'use client';

import { toast } from 'sonner';
import { FolderIcon, TagIcon, XIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FolderPickerBody } from '@/components/folder/folder-picker';
import { TagCombobox } from '@/components/tag/tag-combobox';
import { useAddToFolder } from '@/hooks/use-folders';
import { useBulkAddTag } from '@/hooks/use-bookmarks';
import type { Selection } from '@/hooks/use-selection';

const ACTION =
  'flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] text-[#c8c8ce] transition-colors hover:bg-[#212127]';

/**
 * The bulk lane. Filing a library one post at a time through the reader is what
 * leaves most of it unsorted, so a selection gets the same two organizing
 * actions — through the same pickers — in one request each.
 */
export function SelectionBar({ selection }: { selection: Selection }) {
  const addToFolder = useAddToFolder();
  const bulkAddTag = useBulkAddTag();

  const bookmarkIds = [...selection.selected];
  const count = bookmarkIds.length;
  const noun = count === 1 ? 'post' : 'posts';
  const pending = addToFolder.isPending || bulkAddTag.isPending;

  async function fileInto(folderId: number, name: string) {
    try {
      await addToFolder.mutateAsync({ folderId, bookmarkIds });
      toast.success(`${count} ${noun} added to ${name}`);
      selection.exit();
    } catch {
      toast.error(`Could not add ${count} ${noun} to ${name}`);
    }
  }

  async function applyTag(name: string) {
    try {
      await bulkAddTag.mutateAsync({ bookmarkIds, name });
      toast.success(`${count} ${noun} tagged ${name}`);
      selection.exit();
    } catch {
      toast.error(`Could not tag ${count} ${noun}`);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-[18px] border border-[#2a2a2e] bg-[#17171aee] p-2 backdrop-blur-lg scrollbar-none">
        <span className="shrink-0 pr-1 pl-2 text-[13px] whitespace-nowrap text-text-primary tabular-nums">
          {count} selected
        </span>

        <Popover>
          <PopoverTrigger className={ACTION} disabled={pending}>
            <FolderIcon className="size-3.5" />
            Collection
          </PopoverTrigger>
          <PopoverContent align="center" side="top" className="w-56 border-border bg-popover p-1">
            <FolderPickerBody onPick={(folder) => fileInto(folder.id, folder.name)} />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger className={ACTION} disabled={pending}>
            <TagIcon className="size-3.5" />
            Tag
          </PopoverTrigger>
          <PopoverContent align="center" side="top" className="w-56 border-border bg-popover p-2">
            <TagCombobox
              onCommit={applyTag}
              placeholder="Add tag to selection…"
              hint="Press Enter to apply"
            />
          </PopoverContent>
        </Popover>

        <button type="button" onClick={selection.selectPage} className={ACTION}>
          {selection.pageFullySelected ? 'Deselect page' : 'Select page'}
        </button>

        <button
          type="button"
          onClick={selection.exit}
          aria-label="Clear selection"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-[#212127] hover:text-text-primary"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
