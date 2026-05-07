'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncDialog({ open, onOpenChange }: SyncDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Sync your X Bookmarks</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Syncing requires the X Bookmark Sync Chrome extension.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal list-inside space-y-2 text-sm text-text-secondary my-2">
          <li>
            Open{' '}
            <span className="font-mono text-xs bg-secondary px-1 rounded">x.com</span> and make
            sure you&apos;re logged in.
          </li>
          <li>Click the extension icon in your Chrome toolbar.</li>
          <li>
            Press <strong className="text-text-primary">Sync Bookmarks</strong>.
          </li>
          <li>
            Return to this dashboard — it refreshes automatically as bookmarks arrive.
          </li>
        </ol>
        <p className="text-xs text-muted-foreground mt-2">
          First sync of a large library can take 1–2 minutes. Subsequent syncs are fast (only new
          bookmarks are fetched).
        </p>
        <Button
          variant="outline"
          className="mt-2 w-full border-border text-text-primary"
          onClick={() => onOpenChange(false)}
        >
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}
