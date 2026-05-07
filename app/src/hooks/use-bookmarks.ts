import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookmarksResponse } from '@/types';

interface BookmarkFilters {
  search?: string;
  folder_id?: number | null;
  tag?: string | null;
  sort?: string;
  per_page?: number;
}

export function useBookmarks(filters: BookmarkFilters = {}) {
  const buildParams = (page: number) => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.folder_id) params.set('folder_id', String(filters.folder_id));
    if (filters.tag) params.set('tag', filters.tag);
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

export function useArchiveBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetch(`/api/bookmarks/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookmarks'] }),
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
    },
  });
}
