'use client';

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FOLDER_COLORS } from '@/components/folder/create-folder-popover';
import { useCreateFolder, useFolders } from '@/hooks/use-folders';
import type { Folder } from '@/types';

/**
 * The collections picker itself — search, the list, and creating one inline.
 *
 * Shared by the per-post dropdown and the bulk selection bar so the two cannot
 * drift: `activeIds` turns the rows into checkboxes that toggle membership,
 * and omitting it gives a plain pick list for callers that only ever add.
 * A folder created here is handed straight to `onPick`, so "create and file"
 * is one gesture in both places.
 */
export function FolderPickerBody({
  activeIds,
  onPick,
}: {
  activeIds?: ReadonlySet<number>;
  onPick: (folder: Folder) => void;
}) {
  const [search, setSearch] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(FOLDER_COLORS[0]);

  const { data: folders = [] } = useFolders();
  const createFolder = useCreateFolder();

  const needle = search.trim().toLowerCase();
  const matching = folders.filter((folder) => folder.name.toLowerCase().includes(needle));

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const folder = await createFolder.mutateAsync({ name, color: newColor });
    setNewName('');
    setAddingNew(false);
    onPick(folder);
  }

  return (
    <>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search collections…"
        className="mb-1 h-7 border-input-border bg-input text-xs"
      />

      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {matching.map((folder) =>
          activeIds ? (
            <label
              key={folder.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-primary hover:bg-secondary"
            >
              <Checkbox
                checked={activeIds.has(folder.id)}
                onCheckedChange={() => onPick(folder)}
                className="border-border"
              />
              <FolderRowLabel folder={folder} />
            </label>
          ) : (
            <button
              key={folder.id}
              type="button"
              onClick={() => onPick(folder)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-secondary"
            >
              <FolderRowLabel folder={folder} />
            </button>
          ),
        )}
        {matching.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground italic">No collections found</p>
        )}
      </div>

      <div className="mt-1 border-t border-border pt-1">
        {!addingNew ? (
          <button
            type="button"
            onClick={() => setAddingNew(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-[#71767b] hover:bg-secondary hover:text-text-primary"
          >
            <PlusIcon className="size-3" />
            New collection…
          </button>
        ) : (
          <div className="space-y-1.5 px-1">
            <Input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreate();
                if (event.key === 'Escape') setAddingNew(false);
              }}
              placeholder="Collection name"
              className="h-7 border-input-border bg-input text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  aria-label={`Use ${color}`}
                  className="size-3.5 rounded-full"
                  style={{
                    backgroundColor: color,
                    outline: newColor === color ? `2px solid ${color}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-6 flex-1 bg-primary text-[11px] text-primary-foreground hover:bg-primary/90"
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
    </>
  );
}

function FolderRowLabel({ folder }: { folder: Folder }) {
  return (
    <>
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: folder.color ?? '#71767b' }}
      />
      <span className="truncate text-xs">{folder.name}</span>
    </>
  );
}
