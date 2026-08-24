'use client';

import { type ReactNode } from 'react';
import { FolderIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FolderPickerBody } from '@/components/folder/folder-picker';
import { useAddToFolder, useRemoveFromFolder } from '@/hooks/use-folders';
import type { Folder } from '@/types';

interface FolderDropdownProps {
  bookmarkId: number;
  bookmarkFolders: Folder[];
  /** Lets the reader's action bar render this as a labelled pill. */
  triggerClassName?: string;
  triggerContent?: ReactNode;
}

export function FolderDropdown({
  bookmarkId,
  bookmarkFolders,
  triggerClassName,
  triggerContent,
}: FolderDropdownProps) {
  const addToFolder = useAddToFolder();
  const removeFromFolder = useRemoveFromFolder();
  const activeIds = new Set(bookmarkFolders.map((folder) => folder.id));

  return (
    <Popover>
      {/* base-ui Trigger renders as a <button> — style it directly */}
      <PopoverTrigger
        className={
          triggerClassName ??
          'p-1.5 rounded-md text-muted-foreground hover:text-text-primary hover:bg-secondary transition-colors'
        }
        title="Collections"
        onClick={(e) => e.stopPropagation()}
      >
        {triggerContent ?? <FolderIcon className="w-3.5 h-3.5" />}
      </PopoverTrigger>

      <PopoverContent
        className="w-52 p-1 bg-popover border-border"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <FolderPickerBody
          activeIds={activeIds}
          onPick={(folder) =>
            activeIds.has(folder.id)
              ? removeFromFolder.mutate({ folderId: folder.id, bookmarkId })
              : addToFolder.mutate({ folderId: folder.id, bookmarkIds: [bookmarkId] })
          }
        />
      </PopoverContent>
    </Popover>
  );
}
