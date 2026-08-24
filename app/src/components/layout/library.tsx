'use client';

import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BookmarkGrid } from '@/components/bookmark/bookmark-grid';
import { BookmarkReader } from '@/components/bookmark/bookmark-reader';
import { SelectionBar } from '@/components/bookmark/selection-bar';
import { FacetBar } from './facet-bar';
import { FilterSummary } from './filter-summary';
import { LibraryTopBar } from './library-top-bar';
import { useBookmarks } from '@/hooks/use-bookmarks';
import { useLibraryFilters } from '@/hooks/use-library-filters';
import { useSelection } from '@/hooks/use-selection';
import { useSyncStatus } from '@/hooks/use-sync';

/**
 * Desktop follows 2a — header, collections row, tags row, result row, masonry —
 * and the same stack collapses into 3a's phone layout. The query lives here so
 * the facet bar, the summary, the tag sheet, the selection and the reader all
 * agree on one result set: the reader steps through it, the selection is
 * scoped to it.
 */
export function Library() {
  const { search, folderId, tags, tagMode, author, sort, page, filterSignature } =
    useLibraryFilters();
  const { data: syncStatus } = useSyncStatus();

  const query = useBookmarks({
    search: search || undefined,
    folder_id: folderId,
    tags,
    tag_mode: tagMode,
    author: author || undefined,
    sort,
    page,
    per_page: 40,
  });

  const orderedIds = useMemo(
    () => (query.data?.data ?? []).map((bookmark) => bookmark.id),
    [query.data],
  );
  const selection = useSelection(orderedIds, filterSignature);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <LibraryTopBar />
      <FacetBar
        resultCount={query.data?.meta.total}
        selecting={selection.visible}
        onToggleSelecting={selection.togglePinned}
      />
      <FilterSummary
        resultCount={query.data?.meta.total}
        selecting={selection.visible}
        onToggleSelecting={selection.togglePinned}
      />

      {syncStatus?.last_error && (
        <Alert variant="destructive" className="mx-5 mt-3 px-3 py-2 md:mx-8">
          <AlertCircle className="size-3.5" />
          <AlertDescription className="text-xs leading-tight">
            {syncStatus.last_error}
          </AlertDescription>
        </Alert>
      )}

      <BookmarkGrid query={query} selection={selection} />
      <BookmarkReader orderedIds={orderedIds} />

      {selection.active && <SelectionBar selection={selection} />}
    </div>
  );
}
