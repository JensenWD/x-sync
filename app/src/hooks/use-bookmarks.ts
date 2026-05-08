import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { BookmarksResponse } from '@/types';

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
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      toast('Post archived', {
        action: {
          label: 'Undo',
          onClick: async () => {
            await postBulk({ action: 'unarchive', ids: [id] });
            queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
            queryClient.invalidateQueries({ queryKey: ['sync-status'] });
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

export function useAutoTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookmarkIds?: number[]) =>
      fetch('/api/bookmarks/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookmarkIds ? { bookmarkIds } : {}),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
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
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      const count = ids.length;
      toast(`${count} post${count !== 1 ? 's' : ''} archived`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await postBulk({ action: 'unarchive', ids });
            queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
            queryClient.invalidateQueries({ queryKey: ['sync-status'] });
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['tags'] });
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
