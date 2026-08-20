import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const facetBar = read('../src/components/layout/facet-bar.tsx');
const facetChip = read('../src/components/layout/facet-chip.tsx');
const filterSummary = read('../src/components/layout/filter-summary.tsx');
const filters = read('../src/hooks/use-library-filters.ts');
const bookmarkHooks = read('../src/hooks/use-bookmarks.ts');
const bookmarkGrid = read('../src/components/bookmark/bookmark-grid.tsx');
const libraryScroll = read('../src/hooks/use-library-scroll.ts');
const folderRoute = read('../src/app/api/folders/route.ts');
const tagRoute = read('../src/app/api/tags/route.ts');
const topBar = read('../src/components/layout/library-top-bar.tsx');

test('the redesigned library exposes the complete sort menu on desktop and mobile', () => {
  assert.match(filters, /bookmarked_at_asc:\s*'Oldest'/);
  assert.equal(facetBar.match(/<SortMenu\s+sort=\{sort\}\s+onSelect=\{setSort\}/g)?.length, 2);
});

test('the search and facet stack keeps the compact redesign metrics', () => {
  assert.match(topBar, /px-8 py-3 md:flex/);
  assert.match(topBar, /px-5 pt-3 md:hidden/);
  assert.match(topBar, /mt-2\.5 flex h-10/);
  assert.match(facetBar, /px-8 pt-2 pb-2 md:flex/);
  assert.match(facetBar, /border-hairline bg-surface px-8 py-1\.5 md:flex/);
  assert.match(facetBar, /border-hairline px-5 pt-2 pb-2\.5 md:hidden/);
  assert.match(facetChip, /h-\[34px\].*px-3.*text-\[13px\]/);
  assert.match(filterSummary, /border-hairline px-8 py-1\.5 md:flex/);
});

test('reader navigation preserves the filtered grid scroll position', () => {
  assert.match(filters, /preserveScroll\?: boolean/);
  assert.match(filters, /router\.push\(href, \{ scroll: false \}\)/);
  assert.match(filters, /router\.replace\(href, \{ scroll: false \}\)/);
  assert.match(bookmarkGrid, /data-library-scroll/);
  assert.match(bookmarkGrid, /useLibraryScroll\([\s\S]*viewKey,[\s\S]*postId !== null,[\s\S]*contentVersion/);
  assert.match(libraryScroll, /positions\.set\(viewKey, event\.currentTarget\.scrollTop\)/);
  assert.match(libraryScroll, /node\.scrollTop = saved/);
  assert.match(libraryScroll, /\[contentVersion, readerOpen, viewKey\]/);
});

test('in-app removal refreshes active-only collection and tag counts', () => {
  for (const queryKey of ['folders', 'tags', 'sync-status']) {
    assert.match(
      bookmarkHooks,
      new RegExp(`invalidateQueries\\(\\{ queryKey: \\['${queryKey}'\\] \\}\\)`),
    );
  }
  assert.match(folderRoute, /getFolderFacets\(rawDb\)/);
  assert.match(tagRoute, /getTagFacets\(rawDb\)/);
});
