'use client';

import { Fragment, type ReactNode } from 'react';
import { toast } from 'sonner';
import { XIcon } from 'lucide-react';
import { TagChip } from './facet-chip';
import { useFolders } from '@/hooks/use-folders';
import { useLibraryFilters } from '@/hooks/use-library-filters';

function plural(count: number) {
  return count === 1 ? 'post' : 'posts';
}

/** "412 posts tagged design and ai, in Engineering" — the mobile 3b sentence. */
function describe({
  count,
  tags,
  joiner,
  folderName,
  search,
}: {
  count: number;
  tags: string[];
  joiner: string;
  folderName: string | null;
  search: string;
}): ReactNode {
  const clauses: ReactNode[] = [];
  if (tags.length > 0) {
    clauses.push(
      <Fragment key="tags">
        {' tagged '}
        {tags.map((tag, index) => (
          <Fragment key={tag}>
            {index > 0 && ` ${joiner} `}
            <em>{tag}</em>
          </Fragment>
        ))}
      </Fragment>,
    );
  }
  if (folderName) {
    clauses.push(
      <Fragment key="folder">
        {' in '}
        <em>{folderName}</em>
      </Fragment>,
    );
  }
  if (search) {
    clauses.push(
      <Fragment key="search">
        {' matching '}
        <em>{`“${search}”`}</em>
      </Fragment>,
    );
  }
  return (
    <>
      {count.toLocaleString()} {plural(count)}
      {clauses}
    </>
  );
}

/**
 * The result bar under the facet rows: how many posts the current facets leave,
 * which ones are doing the filtering, and how to undo or share them.
 */
export function FilterSummary({ resultCount }: { resultCount: number | undefined }) {
  const {
    search,
    folderId,
    tags,
    tagMode,
    hasFilters,
    setSearch,
    setFolder,
    toggleTag,
    clearFilters,
  } = useLibraryFilters();
  const { data: folders = [] } = useFolders();

  if (resultCount === undefined) return null;

  const folderName = folders.find((folder) => folder.id === folderId)?.name ?? null;
  const joiner = tagMode === 'any' ? 'or' : 'and';

  async function copyFilterLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Filter link copied');
    } catch {
      toast.error('Could not copy the filter link');
    }
  }

  return (
    <>
      {/* Desktop — 2a's result row. */}
      <div className="hidden items-center gap-2.5 border-b border-hairline px-8 py-[11px] md:flex">
        <span className="shrink-0 text-[13px] text-text-tertiary">
          {resultCount.toLocaleString()} {plural(resultCount)}
        </span>
        {hasFilters && <span className="shrink-0 text-[#3a3a3f]">·</span>}

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-none">
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-chip-active-border bg-chip-active px-[9px] py-[5px] text-[11px] text-chip-active-foreground"
            >
              {`“${search}”`}
              <XIcon className="size-3 text-[#7d848c]" />
            </button>
          )}
          {folderName && (
            <button
              type="button"
              onClick={() => setFolder(null)}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-chip-active-border bg-chip-active px-3 py-1 text-[11px] text-chip-active-foreground"
            >
              {folderName}
              <XIcon className="size-3 text-[#7d848c]" />
            </button>
          )}
          {tags.map((tag, index) => (
            <Fragment key={tag}>
              {index > 0 && (
                <span className="shrink-0 font-mono text-[10px] text-text-faint uppercase">
                  {joiner}
                </span>
              )}
              <TagChip name={tag} active onRemove={() => toggleTag(tag)} />
            </Fragment>
          ))}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 text-[12px] text-muted-foreground transition-colors hover:text-text-primary"
            >
              clear
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={copyFilterLink}
          className="ml-auto shrink-0 text-[12px] text-muted-foreground transition-colors hover:text-text-primary"
        >
          Copy filter link
        </button>
      </div>

      {/* Mobile — 3b's sentence. Unfiltered, 3a runs the tags row straight into
          the card list, so this row only exists once a facet is active. */}
      {hasFilters && (
        <div className="flex items-baseline justify-between gap-3 border-b border-hairline px-5 py-3.5 md:hidden">
          <span className="font-serif text-[16px] text-[#d6d6da]">
            {describe({ count: resultCount, tags, joiner, folderName, search })}
          </span>
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 text-[13px] text-muted-foreground"
          >
            clear
          </button>
        </div>
      )}
    </>
  );
}
