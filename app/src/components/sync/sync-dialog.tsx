'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  SyncRequestError,
  useOfficialSync,
  useSyncStatus,
  useXConnection,
} from '@/hooks/use-sync';
import { useSearchParams } from 'next/navigation';

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncDialog({ open, onOpenChange }: SyncDialogProps) {
  const [confirmFullSync, setConfirmFullSync] = useState(false);
  const searchParams = useSearchParams();
  const connection = useXConnection();
  const syncStatus = useSyncStatus();
  const sync = useOfficialSync();
  const connected = connection.data?.connected ?? false;
  const syncing = sync.isPending || Boolean(syncStatus.data?.in_progress);
  const activeRun = syncStatus.data?.active_run;
  const callbackError = searchParams.get('x_error');
  const reconciliationError =
    sync.error instanceof SyncRequestError && sync.error.code === 'x_full_sync_anomaly'
      ? sync.error.details
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary">Sync your X Bookmarks</DialogTitle>
          <DialogDescription className="text-text-secondary">
            Sign in through X, then pull new bookmarks or rescan your complete library.
          </DialogDescription>
        </DialogHeader>

        {callbackError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{callbackError}</AlertDescription>
          </Alert>
        )}

        {connection.isLoading ? (
          <div className="flex items-center gap-2 py-5 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking X connection…
          </div>
        ) : !connection.data?.configured ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>X OAuth is not configured on AgentMac.</AlertDescription>
          </Alert>
        ) : !connected ? (
          <div className="space-y-4 py-1">
            <p className="text-sm text-text-secondary">
              X will ask for read-only access to bookmarks, Posts, and account identity. The app
              cannot post, delete, or change bookmarks.
            </p>
            <a
              href="/api/x/oauth/start"
              className={cn(
                buttonVariants(),
                'w-full bg-[#1d9bf0] text-white hover:bg-[#1a8cd8]',
              )}
            >
              Connect X <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-text-primary">
                Connected as <strong>@{connection.data?.username}</strong>
              </span>
            </div>

            {sync.error && !reconciliationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{sync.error.message}</AlertDescription>
              </Alert>
            )}
            {reconciliationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <p>
                    X returned only {reconciliationError.observed_count} of the previous{' '}
                    {reconciliationError.baseline_count} bookmarks. Nothing was archived.
                  </p>
                  <p>
                    Confirm only if you want to archive the {reconciliationError.archive_count}{' '}
                    bookmarks missing from this repeated X result.
                  </p>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={syncing}
                    onClick={() =>
                      sync.mutate({
                        mode: 'full',
                        reconciliation_confirmation:
                          reconciliationError.reconciliation_confirmation,
                      })
                    }
                  >
                    Confirm reconciliation
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {sync.data && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Synced {sync.data.bookmarks_inserted} new and checked{' '}
                  {sync.data.bookmarks_existing} existing bookmarks.
                  {sync.data.remote_removed > 0 &&
                    ` Archived ${sync.data.remote_removed} no longer present on X.`}
                </AlertDescription>
              </Alert>
            )}

            {syncing && activeRun && (
              <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-text-secondary">
                Scanned {activeRun.bookmarks_fetched} bookmarks across {activeRun.pages_fetched}{' '}
                pages…
              </div>
            )}

            <Button
              className="w-full bg-[#1d9bf0] text-white hover:bg-[#1a8cd8]"
              disabled={syncing}
              onClick={() => {
                setConfirmFullSync(false);
                sync.mutate({ mode: 'incremental' });
              }}
            >
              {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
              {syncing ? 'Syncing bookmarks…' : 'Sync new bookmarks'}
            </Button>

            {confirmFullSync ? (
              <Alert>
                <RefreshCw className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <p>
                    This re-reads every bookmark and uses more X API credits. It restores anything
                    missing here and archives items no longer returned by X. Local tags and folders
                    stay intact.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[#1d9bf0] text-white hover:bg-[#1a8cd8]"
                      disabled={syncing}
                      onClick={() => {
                        setConfirmFullSync(false);
                        sync.mutate({ mode: 'full' });
                      }}
                    >
                      Resync everything
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncing}
                      onClick={() => setConfirmFullSync(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Button
                variant="outline"
                className="w-full border-border text-text-secondary"
                disabled={syncing}
                onClick={() => setConfirmFullSync(true)}
              >
                Resync entire library
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              New-only sync stops after two pages of known bookmarks. Entire-library sync follows
              every X continuation token using the reliable 50-item page size.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
