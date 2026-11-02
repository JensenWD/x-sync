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
  const job = syncStatus.data?.job;
  const completed = job?.status === 'success' || job?.status === 'partial';
  const imported = completed ? job?.result?.sync : null;
  const autoTag = completed ? job?.result?.auto_tag : null;
  const savedError = job?.status === 'failed' ? job.error_message : null;
  const callbackError = searchParams.get('x_error');
  const reconciliationError =
    sync.error instanceof SyncRequestError && sync.error.code === 'x_full_sync_anomaly'
      ? sync.error.details
      : job?.status === 'failed' && job.error_code === 'x_full_sync_anomaly'
        ? job.error_details : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border w-[calc(100%-2rem)] max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 font-serif text-[19px] font-medium text-text-primary">
            Sync your X Bookmarks
          </DialogTitle>
          <DialogDescription className="text-text-secondary">
            Once queued, you can leave this page. Importing and organization continue on AgentMac.
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
                'w-full bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              Connect X <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
            <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-text-primary">
                Connected as <strong>@{connection.data?.username}</strong>
              </span>
            </div>
        )}
          <div className="space-y-4 py-1">
            {(sync.error || savedError) && !reconciliationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{sync.error?.message ?? savedError}</AlertDescription>
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
            {imported && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  Synced {imported.bookmarks_inserted} new and checked{' '}
                  {imported.bookmarks_existing} existing bookmarks.
                  {imported.remote_removed > 0 && ` Archived ${imported.remote_removed} no longer present on X.`}
                </AlertDescription>
              </Alert>
            )}
            {(autoTag?.status === 'success' || autoTag?.status === 'skipped') && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{autoTag.status === 'skipped' ? 'Everything is already organized.'
                    : `Organized ${job?.progress_done ?? autoTag.tagged} bookmarks. Your library is ready.`}</AlertDescription>
              </Alert>
            )}
            {autoTag?.status === 'failed' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Saved bookmarks are safe. Organization stopped after {job?.progress_done ?? 0} of{' '}
                  {job?.progress_total ?? 0} bookmarks. Retry organization below—no X sync needed.
                </AlertDescription>
              </Alert>
            )}
            {syncing && (
              <div role="status" className="space-y-2 rounded-md border border-border bg-secondary/30 px-3 py-3 text-sm text-text-secondary">
                <p className="font-medium text-text-primary">
                  {sync.isPending ? 'Starting background job…' : job?.status === 'queued' ? 'Queued on AgentMac…'
                    : job?.stage === 'notes' ? 'Refreshing Community Notes…'
                    : job?.stage === 'organizing' ? 'Organizing bookmarks…' : 'Importing bookmarks…'}
                </p>
                {job?.stage === 'importing' && activeRun && <p>Scanned {activeRun.bookmarks_fetched} bookmarks across {activeRun.pages_fetched} pages.</p>}
                {job?.stage === 'organizing' && job.progress_total > 0 && <>
                  <progress aria-label="Bookmarks organized" value={job.progress_done} max={job.progress_total} className="w-full" />
                  <p>{job.progress_done} of {job.progress_total} organized</p>
                </>}
                <p className="text-xs">You can close this dialog, leave the page, or lock your phone. This job continues on AgentMac. Reopen Sync to check progress.</p>
                <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Continue browsing</Button>
              </div>
            )}

            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={syncing || !connected}
              onClick={() => {
                setConfirmFullSync(false);
                sync.mutate({ mode: 'incremental' });
              }}
            >
              {syncing && <Loader2 className="h-4 w-4 animate-spin" />}
              {syncing ? 'Background job running…' : 'Sync new bookmarks'}
            </Button>

            <Button variant="outline" className="w-full" disabled={syncing}
              onClick={() => sync.mutate({ action: 'organize', mode: 'incremental' })}>
              {autoTag?.status === 'failed' ? 'Retry organization' : 'Organize remaining bookmarks'}
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
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={syncing || !connected}
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
                disabled={syncing || !connected}
                onClick={() => setConfirmFullSync(true)}
              >
                Resync entire library
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              New-only sync stops after one page of known bookmarks. Entire-library sync follows
              every X continuation token using the reliable 50-item page size. New bookmarks are
              automatically organized in the background after either sync completes. Organization-only retries do not call the X API.
            </p>
          </div>
      </DialogContent>
    </Dialog>
  );
}
