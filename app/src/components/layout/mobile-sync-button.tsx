'use client';

import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { SyncDialog } from '@/components/sync/sync-dialog';
import { useSyncStatus } from '@/hooks/use-sync';

export function MobileSyncButton() {
  const [open, setOpen] = useState(false);
  const { data: syncStatus } = useSyncStatus();
  const syncing = !!syncStatus?.in_progress;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={syncing ? 'Sync in progress' : 'Sync bookmarks'}
        className="flex items-center justify-center w-11 h-11 rounded-md text-[var(--text-secondary)] hover:text-[#1d9bf0] hover:bg-secondary transition-colors"
      >
        {syncing ? (
          <Loader2 className="w-5 h-5 animate-spin text-[#1d9bf0]" />
        ) : (
          <RefreshCw className="w-5 h-5" />
        )}
      </button>
      <SyncDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
