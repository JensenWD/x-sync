import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncJob, SyncStatus, XConnectionStatus } from '@/types';

export interface ReconciliationConfirmation {
  fingerprint: string;
  observed_count: number;
}

interface SyncErrorDetails {
  baseline_count: number;
  observed_count: number;
  archive_count: number;
  reconciliation_confirmation: ReconciliationConfirmation;
}

export class SyncRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
    public readonly details: SyncErrorDetails | null,
  ) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

export function useSyncStatus() {
  const queryClient = useQueryClient();
  const previousRevision = useRef<string | null>(null);
  const query = useQuery<SyncStatus>({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const response = await fetch('/api/sync/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load sync status');
      return response.json();
    },
    refetchInterval: (current) => (current.state.data?.in_progress ? 2000 : 10_000),
  });

  useEffect(() => {
    if (!query.data) return;
    const { job, last_synced_at } = query.data;
    const revision = `${last_synced_at}:${job?.id}:${job?.status}:${job?.progress_done}`;
    if (revision !== previousRevision.current) {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    }
    previousRevision.current = revision;
  }, [query.data, queryClient]);

  return query;
}

export function useXConnection() {
  return useQuery<XConnectionStatus>({
    queryKey: ['x-connection'],
    queryFn: async () => {
      const response = await fetch('/api/x/oauth/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load X connection status');
      return response.json();
    },
  });
}

export function useOfficialSync() {
  const queryClient = useQueryClient();
  return useMutation<
    SyncJob,
    SyncRequestError,
    { action?: 'official' | 'organize'; mode: 'incremental' | 'full'; reconciliation_confirmation?: ReconciliationConfirmation }
  >({
    mutationFn: async ({ action = 'official', mode, reconciliation_confirmation }) => {
      const response = await fetch('/api/x/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, mode, reconciliation_confirmation, request_id: crypto.randomUUID() }),
      });
      const result = await response.json().catch(() => null) as {
        code?: string;
        details?: SyncErrorDetails;
        error?: string;
        job?: SyncJob;
      } | null;
      if (!response.ok || !result?.job) {
        throw new SyncRequestError(
          result?.error ?? 'X bookmark sync failed.',
          result?.code ?? null,
          result?.details ?? null,
        );
      }
      return result.job;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sync-status'] }),
        queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
        queryClient.invalidateQueries({ queryKey: ['folders'] }),
        queryClient.invalidateQueries({ queryKey: ['tags'] }),
      ]);
    },
  });
}
