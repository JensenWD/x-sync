'use client';

import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreateFolder } from '@/hooks/use-folders';

export const FOLDER_COLORS = [
  '#8d8d95', '#c9a27a', '#7fa38c', '#8fa0c2',
  '#b08fa8', '#a89b7c', '#8aa3a8', '#5c5c62',
];

/** The "new collection" affordance at the end of the collections facet row. */
export function CreateFolderPopover() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const createFolder = useCreateFolder();

  async function submit() {
    if (!name.trim()) return;
    await createFolder.mutateAsync({ name: name.trim(), color });
    setName('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title="New collection"
        aria-label="New collection"
        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-input-border text-text-secondary transition-colors hover:border-[#3a3a3f] hover:text-text-primary"
      >
        <PlusIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-56 gap-2" align="start">
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          New collection
        </p>
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') setOpen(false);
          }}
          placeholder="Collection name"
          className="h-8 border-input-border bg-input text-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {FOLDER_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Colour ${option}`}
              onClick={() => setColor(option)}
              className="size-4 rounded-full"
              style={{
                backgroundColor: option,
                outline: color === option ? `2px solid ${option}` : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
        <Button
          size="sm"
          className="h-7 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
          onClick={submit}
          disabled={createFolder.isPending || !name.trim()}
        >
          Create
        </Button>
      </PopoverContent>
    </Popover>
  );
}
