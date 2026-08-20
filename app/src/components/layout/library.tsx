'use client';

import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BookmarkGrid } from '@/components/bookmark/bookmark-grid';
import { BookmarkReader } from '@/components/bookmark/bookmark-reader';
import { FacetBar } from './facet-bar';
import { FilterSummary } from './filter-summary';
import { LibraryTopBar } from './library-top-bar';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import { useSyncStatus } from '@/hooks/use-sync';

/**
 * Desktop follows 2a — header, collections row, tags row, result row, masonry —
 * and the same stack collapses into 3a's phone layout. The query lives here so
 * the facet bar, the summary and the tag sheet all agree on the result count.
 */
export function Library() {
  const { search, folderId, tags, tagMode, sort, page } = useLibraryFilters();
  const { data: syncStatus } = useSyncStatus();

  const query = useBookmarks({
    search: search || undefined,
    folder_id: folderId,
    tags,
    tag_mode: tagMode,
    sort,
    page,
    per_page: 40,
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <LibraryTopBar />
      <FacetBar resultCount={query.data?.meta.total} />
      <FilterSummary resultCount={query.data?.meta.total} />

      {syncStatus?.last_error && (
        <Alert variant="destructive" className="mx-5 mt-3 px-3 py-2 md:mx-8">
          <AlertCircle className="size-3.5" />
          <AlertDescription className="text-xs leading-tight">
            {syncStatus.last_error}
          </AlertDescription>
        </Alert>
      )}

      <BookmarkGrid query={query} />
      <BookmarkReader />
    </div>
  );
}
