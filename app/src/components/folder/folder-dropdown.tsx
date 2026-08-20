'use client';

import { useState, type ReactNode } from 'react';
import { FolderIcon, PlusIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FOLDER_COLORS } from '@/components/folder/create-folder-popover';
import { useFolders, useCreateFolder, useAddToFolder, useRemoveFromFolder } from '@/hooks/use-folders';
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
  const [search, setSearch] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(FOLDER_COLORS[0]);

  const { data: folders = [] } = useFolders();
  const createFolder = useCreateFolder();
  const addToFolder = useAddToFolder();
  const removeFromFolder = useRemoveFromFolder();

  const activeIds = new Set(bookmarkFolders.map((f) => f.id));
  const filtered = folders.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase()),
  );

  function handleToggle(folder: Folder) {
    if (activeIds.has(folder.id)) {
      removeFromFolder.mutate({ folderId: folder.id, bookmarkId });
    } else {
      addToFolder.mutate({ folderId: folder.id, bookmarkId });
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    const folder = await createFolder.mutateAsync({ name: newName.trim(), color: newColor });
    addToFolder.mutate({ folderId: folder.id, bookmarkId });
    setNewName('');
    setAddingNew(false);
  }

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
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search collections…"
          className="h-7 text-xs bg-input border-input-border mb-1"
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {filtered.map((folder) => (
            <label
              key={folder.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-secondary text-sm text-text-primary"
            >
              <Checkbox
                checked={activeIds.has(folder.id)}
                onCheckedChange={() => handleToggle(folder)}
                className="border-border"
              />
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: folder.color ?? '#71767b' }}
              />
              <span className="truncate text-xs">{folder.name}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground italic">No collections found</p>
          )}
        </div>
        <div className="border-t border-border mt-1 pt-1">
          {!addingNew ? (
            <button
              onClick={() => setAddingNew(true)}
              className="flex items-center gap-1.5 px-2 py-1.5 w-full text-xs text-[#71767b] hover:text-text-primary rounded-md hover:bg-secondary"
            >
              <PlusIcon className="w-3 h-3" />
              New collection…
            </button>
          ) : (
            <div className="px-1 space-y-1.5">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setAddingNew(false);
                }}
                placeholder="Collection name"
                className="h-7 text-xs bg-input border-input-border"
              />
              <div className="flex gap-1 flex-wrap">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className="w-3.5 h-3.5 rounded-full"
                    style={{
                      backgroundColor: c,
                      outline: newColor === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-6 text-[11px] flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleCreate}
                  disabled={createFolder.isPending}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px]"
                  onClick={() => setAddingNew(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
