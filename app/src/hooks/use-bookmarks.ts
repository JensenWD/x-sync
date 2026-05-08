import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { BookmarksResponse } from '@/types';

// Archiving (manual or bulk) can change folder/tag association counts and the
// untagged_count surfaced in sync-status, so all four query keys are
// invalidated together. Keep in one place so single + bulk + Undo paths stay
// in sync.
function invalidateAfterArchiveChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['bookmarks'] });
  qc.invalidateQueries({ queryKey: ['sync-status'] });
  qc.invalidateQueries({ queryKey: ['folders'] });
  qc.invalidateQueries({ queryKey: ['tags'] });
}

export interface BookmarkFilters {
  search?: string;
  folder_ids?: number[];
  tag_names?: string[];
  untagged?: boolean;
  range_days?: number | null;
  sort?: string;
  per_page?: number;
}

export function useBookmarks(filters: BookmarkFilters = {}) {
  const buildParams = (page: number) => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.folder_ids && filters.folder_ids.length > 0) {
      params.set('folder_id', filters.folder_ids.join(','));
    }
    if (filters.tag_names && filters.tag_names.length > 0) {
      params.set('tag', filters.tag_names.join(','));
    }
    if (filters.untagged) params.set('untagged', '1');
    if (filters.range_days) params.set('range_days', String(filters.range_days));
    if (filters.sort) params.set('sort', filters.sort);
    params.set('per_page', String(filters.per_page ?? 40));
    params.set('page', String(page));
    return params;
  };

  return useInfiniteQuery<BookmarksResponse>({
    queryKey: ['bookmarks', filters],
    queryFn: ({ pageParam }) =>
      fetch(`/api/bookmarks?${buildParams(pageParam as number)}`).then((r) => r.json()),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.current_page < lastPage.meta.last_page
        ? lastPage.meta.current_page + 1
        : undefined,
  });
}

function postBulk(body: Record<string, unknown>) {
  return fetch('/api/bookmarks/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

export function useArchiveBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/bookmarks/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: (_, id) => {
      invalidateAfterArchiveChange(queryClient);
      toast('Post archived', {
        action: {
          label: 'Undo',
          onClick: async () => {
            await postBulk({ action: 'unarchive', ids: [id] });
            invalidateAfterArchiveChange(queryClient);
          },
        },
      });
    },
  });
}

export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookmarkId, name }: { bookmarkId: number; name: string }) =>
      fetch(`/api/bookmarks/${bookmarkId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });
}

export function useRemoveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookmarkId, tagId }: { bookmarkId: number; tagId: number }) =>
      fetch(`/api/bookmarks/${bookmarkId}/tags?tag_id=${tagId}`, { method: 'DELETE' }).then((r) =>
        r.json(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });
}

interface AutoTagResponse {
  status: 'success' | 'aborted' | 'error';
  reason?: string;
  tag?: string;
  share?: number;
  tagged_count?: number;
  skipped_count?: number;
  tags_active?: string[];
  error?: string;
}

export function useAutoTag() {
  const queryClient = useQueryClient();
  return useMutation<AutoTagResponse, Error, number[] | undefined>({
    mutationFn: (bookmarkIds?: number[]) =>
      fetch('/api/bookmarks/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookmarkIds ? { bookmarkIds } : {}),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });

      // Surface every terminal state — the route's blast-radius abort and the
      // "no active tags" / "nothing met threshold" paths all return HTTP 200,
      // so without this the user would silently see no change after clicking
      // Auto-tag and assume the feature is broken.
      if (data?.status === 'aborted') {
        toast.error('Auto-tag aborted', {
          description: data.reason ?? 'Classifier refused to apply tags.',
        });
        return;
      }
      if (data?.status === 'error') {
        toast.error('Auto-tag failed', { description: data.error });
        return;
      }
      const tagged = data?.tagged_count ?? 0;
      if (tagged > 0) {
        toast(`Auto-tagged ${tagged} bookmark${tagged !== 1 ? 's' : ''}`);
      } else if ((data?.tags_active?.length ?? 0) < 2) {
        toast('Need ≥ 2 tags with 20+ manual examples each before auto-tag can run');
      } else {
        toast('No bookmarks crossed the confidence threshold');
      }
    },
    onError: (err) => {
      toast.error('Auto-tag failed', { description: err.message });
    },
  });
}

interface BulkArchiveParams {
  ids: number[];
}

interface BulkTagParams {
  ids: number[];
  tags: string[];
}

interface BulkFolderParams {
  ids: number[];
  folder_ids: number[];
}

export function useBulkArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids }: BulkArchiveParams) => postBulk({ action: 'archive', ids }),
    onSuccess: (_, { ids }) => {
      invalidateAfterArchiveChange(queryClient);
      const count = ids.length;
      toast(`${count} post${count !== 1 ? 's' : ''} archived`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await postBulk({ action: 'unarchive', ids });
            invalidateAfterArchiveChange(queryClient);
          },
        },
      });
    },
  });
}

export function useBulkAddTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, tags }: BulkTagParams) => postBulk({ action: 'add_tags', ids, tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
    },
  });
}

export function useBulkAddFolders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, folder_ids }: BulkFolderParams) =>
      postBulk({ action: 'add_folders', ids, folder_ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });
}
