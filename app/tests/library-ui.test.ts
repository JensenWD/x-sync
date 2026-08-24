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
const bookmarkCard = read('../src/components/bookmark/bookmark-card.tsx');
const bookmarkReader = read('../src/components/bookmark/bookmark-reader.tsx');
const bookmarkRoute = read('../src/app/api/bookmarks/route.ts');
const gridKeyboard = read('../src/hooks/use-grid-keyboard.ts');
const library = read('../src/components/layout/library.tsx');
const postMedia = read('../src/components/bookmark/post-media.tsx');
const selectionBar = read('../src/components/bookmark/selection-bar.tsx');
const selection = read('../src/hooks/use-selection.ts');
const folderDropdown = read('../src/components/folder/folder-dropdown.tsx');
const tagInput = read('../src/components/tag/tag-input.tsx');
const dashboardBookmark = read('../src/lib/dashboard-bookmark.ts');
const xHandle = read('../src/lib/x-handle.ts');

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

test('the author facet is linkable and filters server-side', () => {
  assert.match(filters, /'tag_mode', 'author'\]/);
  assert.match(filters, /toggleAuthor:/);
  assert.match(bookmarkHooks, /params\.set\('author', filters\.author\)/);
  assert.match(bookmarkRoute, /lower\(b\.author_handle\) = \?/);
  // One definition of a handle, shared by the route that serves the link and
  // the hook that produces it.
  assert.match(xHandle, /\^\[A-Za-z0-9_\]\{1,15\}\$/);
  assert.match(bookmarkRoute, /X_HANDLE_PATTERN/);
  assert.match(filters, /normalizeHandle/);
  // The handle button itself is written once and shared by card and reader.
  assert.match(bookmarkCard, /export function AuthorHandle/);
  assert.match(bookmarkReader, /<AuthorHandle/);
});

test('the grid and the reader split the keyboard rather than both claiming it', () => {
  assert.match(gridKeyboard, /case 'j':/);
  assert.match(gridKeyboard, /case 'k':/);
  assert.match(gridKeyboard, /case 'x':/);
  assert.match(gridKeyboard, /case 'Enter':/);
  assert.match(gridKeyboard, /data-library-search/);
  assert.match(bookmarkGrid, /enabled: postId === null/);
  // Focus is the only cursor — no second index to fall out of sync with it.
  assert.doesNotMatch(gridKeyboard, /useRef/);
  // Each surface listens on the node it owns; the reader's keys are the
  // dialog's, so no window-level capture listener is needed to beat it.
  assert.match(bookmarkReader, /onKeyDown={onKeyDown}/);
  assert.doesNotMatch(bookmarkReader, /addEventListener/);
  assert.match(bookmarkReader, /event\.key === 'ArrowRight'/);
  assert.match(bookmarkReader, /event\.key === 'ArrowLeft'/);
  // Stepping replaces the history entry so one back gesture still exits the reader.
  assert.match(filters, /replacePost:/);
  assert.match(bookmarkReader, /replacePost\(nextId\)/);
});

test('a bulk organize action is one request, not one per post', () => {
  assert.match(bookmarkHooks, /'\/api\/tags\/bookmarks'/);
  assert.match(selectionBar, /bulkAddTag\.mutateAsync\(\{ bookmarkIds, name \}\)/);
  assert.match(selectionBar, /addToFolder\.mutateAsync\(\{ folderId, bookmarkIds \}\)/);
  // One picker each, shared with the single-post controls so they cannot drift.
  for (const source of [selectionBar, folderDropdown]) {
    assert.match(source, /<FolderPickerBody/);
  }
  for (const source of [selectionBar, tagInput]) {
    assert.match(source, /<TagCombobox/);
  }
  // Both breakpoints need a way in: hover reveals it on desktop, a toggle on a phone.
  assert.match(filterSummary, /<SelectToggle/);
  assert.match(facetBar, /<SelectToggle/);
  // Whether checkboxes are pinned open is the selection's own state, so no
  // surface can disagree with another about it.
  assert.match(selection, /visible/);
  assert.match(library, /selection\.visible/);
});

test('media keeps the ratio it was shot at and is capped rather than cropped by default', () => {
  assert.match(postMedia, /aspectRatio: ratio \?\? FALLBACK_RATIO/);
  assert.match(postMedia, /naturalWidth \/ naturalHeight/);
  assert.match(postMedia, /max-h-\[640px\]/);
  assert.match(postMedia, /max-h-\[78svh\]/);
  assert.match(postMedia, /overflow-hidden/);
  // Videos play in the reader and stay a still with a play badge on a card.
  assert.match(postMedia, /playable: false/);
  assert.match(postMedia, /item\.playback_url/);
});

test('search marks what it matched and links resolve to their destination', () => {
  // The highlighter and the SQL take their terms from the same tokenizer.
  assert.match(bookmarkGrid, /searchTokens\(search\)/);
  assert.match(bookmarkReader, /searchTokens\(search\)/);
  assert.match(bookmarkRoute, /ftsPrefixQuery\(tokens\)/);
  for (const source of [bookmarkCard, bookmarkReader]) {
    assert.match(source, /<PostText/);
  }
  // Attachment shortlinks are stripped once when the row is decoded, not in
  // each view that renders it.
  assert.match(dashboardBookmark, /export function stripAttachmentLinks/);
  for (const source of [bookmarkCard, bookmarkReader]) {
    assert.doesNotMatch(source, /stripAttachmentLinks/);
  }
});
