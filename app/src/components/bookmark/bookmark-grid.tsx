'use client';

import type { UseQueryResult } from '@tanstack/react-query';
import { BookmarkXIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { BookmarkCard } from './bookmark-card';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import { useLibraryScroll } from '@/hooks/use-library-scroll';
import { cn } from '@/lib/utils';
import type { BookmarksResponse } from '@/types';

/**
 * The reading surface: balanced masonry columns on desktop (2a), a single
 * column on a phone (3a). Cards never split across a column break.
 */
export function BookmarkGrid({ query }: { query: UseQueryResult<BookmarksResponse> }) {
  const { search, folderId, tags, tagMode, sort, hasFilters, page, postId, setPage } =
    useLibraryFilters();
  const { data, isLoading, isFetching } = query;
  const bookmarks = data?.data ?? [];
  const meta = data?.meta;
  const viewKey = JSON.stringify({ search, folderId, tags, tagMode, sort, page });
  const contentVersion = `${meta?.total ?? 0}:${bookmarks.map((bookmark) => bookmark.id).join(',')}`;
  const { scrollRef, rememberScroll } = useLibraryScroll(
    viewKey,
    postId !== null,
    contentVersion,
  );

  const columns =
    'columns-1 gap-x-5 md:columns-2 xl:columns-3 [&>*]:mb-3.5 md:[&>*]:mb-5 [&>*]:break-inside-avoid';

  return (
    <div
      ref={scrollRef}
      data-library-scroll
      onScroll={rememberScroll}
      className="flex-1 overflow-y-auto px-5 pt-3 pb-16 md:px-8 md:pt-4 md:pb-8"
    >
      {isLoading ? (
        <div className={columns}>
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-44 w-full rounded-[14px] bg-card md:rounded-[12px]"
            />
          ))}
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
          <BookmarkXIcon className="size-9 text-muted-foreground" />
          <p className="font-serif text-[18px] text-text-secondary">
            {hasFilters
              ? 'Nothing matches these facets.'
              : 'No posts here yet — connect X and sync.'}
          </p>
        </div>
      ) : (
        <>
          <div className={cn(columns, isFetching && 'opacity-70 transition-opacity')}>
            {bookmarks.map((bookmark) => (
              <BookmarkCard key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>

          {meta && meta.last_page > 1 && (
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-4">
              <span className="font-mono text-[11px] text-muted-foreground">
                {meta.current_page} / {meta.last_page}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-full border border-input-border px-3.5 py-1.5 text-[13px] text-text-secondary transition-colors enabled:hover:border-[#3a3a3f] enabled:hover:text-text-primary disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={page >= meta.last_page}
                  onClick={() => setPage(page + 1)}
                  className="rounded-full border border-input-border px-3.5 py-1.5 text-[13px] text-text-secondary transition-colors enabled:hover:border-[#3a3a3f] enabled:hover:text-text-primary disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
