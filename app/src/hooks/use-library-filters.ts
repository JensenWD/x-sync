'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { normalizeHandle } from '@/lib/x-handle';

export type TagMode = 'all' | 'any';

export const SORT_LABELS: Record<string, string> = {
  bookmarked_at_desc: 'Newest',
  bookmarked_at_asc: 'Oldest',
  author_asc: 'Author A–Z',
  likes_desc: 'Most liked',
};

/** Keys that reset pagination when they change. */
const FILTER_KEYS = ['search', 'folder_id', 'tags', 'tag', 'tag_mode', 'author'] as const;

/**
 * The reader is opened with a history push so the platform back gesture closes
 * it. This tracks whether *this* session pushed it, so a deep link straight to
 * `?post=…` closes by rewriting the URL instead of leaving the app.
 */
let readerPushedHistory = false;

function readTags(params: URLSearchParams): string[] {
  const raw = [...params.getAll('tags'), ...params.getAll('tag')]
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(raw)];
}

/**
 * Single source of truth for the library's facet state. Everything lives in the
 * URL so a filtered view is linkable, and every consumer (facet bar, summary,
 * grid, reader) reads the same values.
 */
export function useLibraryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const rawFolderId = searchParams.get('folder_id');
  const folderId = rawFolderId && /^\d+$/.test(rawFolderId) ? Number(rawFolderId) : null;
  const tagMode: TagMode = searchParams.get('tag_mode') === 'any' ? 'any' : 'all';
  const sort = searchParams.get('sort') ?? 'bookmarked_at_desc';
  const rawPage = searchParams.get('page');
  const page = rawPage && /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;
  const author = normalizeHandle(searchParams.get('author')) ?? '';
  const rawPostId = searchParams.get('post');
  const postId = rawPostId && /^\d+$/.test(rawPostId) ? Number(rawPostId) : null;

  const tags = useMemo(
    () => readTags(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const write = useCallback(
    (
      mutate: (params: URLSearchParams) => void,
      options: { push?: boolean; keepPage?: boolean; preserveScroll?: boolean } = {},
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      const before = FILTER_KEYS.map((key) => next.getAll(key).join('|')).join('\u0000');
      mutate(next);
      const after = FILTER_KEYS.map((key) => next.getAll(key).join('|')).join('\u0000');
      if (!options.keepPage && before !== after) next.delete('page');
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (options.push) {
        if (options.preserveScroll) router.push(href, { scroll: false });
        else router.push(href);
      } else if (options.preserveScroll) router.replace(href, { scroll: false });
      else router.replace(href);
    },
    [pathname, router, searchParams],
  );

  const setTags = useCallback(
    (nextTags: string[]) => {
      write((params) => {
        params.delete('tag');
        if (nextTags.length > 0) params.set('tags', nextTags.join(','));
        else {
          params.delete('tags');
          params.delete('tag_mode');
        }
      });
    },
    [write],
  );

  const setAuthor = useCallback(
    (handle: string | null) =>
      write((params) => {
        const normalized = handle === null ? null : normalizeHandle(handle);
        if (normalized) params.set('author', normalized);
        else params.delete('author');
      }),
    [write],
  );

  /**
   * Everything that narrows the result set, in one string. The selection resets
   * on it and the grid keys its remembered scroll position off it plus the page,
   * so a new facet only has to be added to `FILTER_KEYS` to be accounted for.
   */
  const filterSignature = FILTER_KEYS.map((key) => searchParams.getAll(key).join('|')).join('\u0000');

  return {
    search,
    folderId,
    filterSignature,
    tags,
    tagMode,
    author,
    sort,
    page,
    postId,
    hasFilters: Boolean(search || folderId || tags.length > 0 || author),

    setSearch: useCallback(
      (value: string) =>
        write((params) => {
          if (value) params.set('search', value);
          else params.delete('search');
        }),
      [write],
    ),

    setFolder: useCallback(
      (id: number | null) =>
        write((params) => {
          if (id === null) params.delete('folder_id');
          else params.set('folder_id', String(id));
        }),
      [write],
    ),

    setTags,

    setAuthor,

    /** Clicking the handle you are already filtered to takes the filter off again. */
    toggleAuthor: useCallback(
      (handle: string) => setAuthor(author === handle ? null : handle),
      [author, setAuthor],
    ),

    toggleTag: useCallback(
      (name: string) =>
        setTags(tags.includes(name) ? tags.filter((t) => t !== name) : [...tags, name]),
      [setTags, tags],
    ),

    setTagMode: useCallback(
      (mode: TagMode) =>
        write((params) => {
          if (mode === 'any') params.set('tag_mode', 'any');
          else params.delete('tag_mode');
        }),
      [write],
    ),

    setSort: useCallback(
      (value: string) =>
        write((params) => {
          if (value === 'bookmarked_at_desc') params.delete('sort');
          else params.set('sort', value);
        }),
      [write],
    ),

    setPage: useCallback(
      (value: number) =>
        write(
          (params) => {
            if (value <= 1) params.delete('page');
            else params.set('page', String(value));
          },
          { keepPage: true },
        ),
      [write],
    ),

    clearFilters: useCallback(
      () =>
        write((params) => {
          for (const key of FILTER_KEYS) params.delete(key);
        }),
      [write],
    ),

    openPost: useCallback(
      (id: number) => {
        readerPushedHistory = true;
        write((params) => params.set('post', String(id)), {
          push: true,
          keepPage: true,
          preserveScroll: true,
        });
      },
      [write],
    ),

    /**
     * Stepping between posts inside the reader replaces the entry rather than
     * pushing one, so a single back gesture still returns to the grid instead
     * of walking back through everything you paged past.
     */
    replacePost: useCallback(
      (id: number) =>
        write((params) => params.set('post', String(id)), {
          keepPage: true,
          preserveScroll: true,
        }),
      [write],
    ),

    closePost: useCallback(() => {
      if (readerPushedHistory) {
        readerPushedHistory = false;
        router.back();
        return;
      }
      write((params) => params.delete('post'), { keepPage: true, preserveScroll: true });
    }, [router, write]),
  };
}
