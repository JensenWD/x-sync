# x-sync

Local X (Twitter) bookmark manager. A Chrome extension intercepts bookmark data from x.com and syncs it to a Next.js dashboard backed by SQLite.

## Architecture

```
extension/          Chrome MV3 extension (vanilla JS)
├── intercept.js    MAIN world script — patches fetch + XHR on x.com to capture bookmark API responses
├── content.js      ISOLATED world script — relays intercepted data to service worker, auto-scrolls bookmarks page
├── background.js   Service worker — orchestrates sync flow, collects bookmarks, POSTs to dashboard
├── popup.js        Extension popup UI — triggers sync, shows progress
└── manifest.json   MV3 manifest with two content_scripts (MAIN + ISOLATED worlds)

app/                Next.js 16 dashboard (React 19, Tailwind v4, shadcn base-nova, Drizzle ORM)
├── src/app/        Single page + API routes
├── src/components/ UI components (bookmark cards, sidebar, folders, tags)
├── src/hooks/      React Query hooks for data fetching
├── src/lib/        DB client, bookmark service, utils
└── data/           SQLite database (bookmarks.db)
```

### Sync flow

1. User clicks "Sync" in extension popup
2. Service worker opens/reloads `x.com/i/bookmarks`
3. `intercept.js` (MAIN world, `document_start`) has already patched `window.fetch` and `XMLHttpRequest.prototype.send`
4. X's own JS fetches bookmarks via GraphQL XHR — interceptor clones each response and extracts tweet data
5. Intercepted tweets are sent via `window.postMessage` to `content.js` (ISOLATED world)
6. `content.js` relays each bookmark individually to the service worker via `chrome.runtime.sendMessage`
7. `content.js` auto-scrolls the page to trigger more fetches until no more results
8. When scrolling completes, service worker POSTs accumulated bookmarks to `localhost:3000/api/x/sync` in batches of 200
9. The Next.js route upserts bookmarks into SQLite

### Why this architecture

We tried several approaches before arriving at this design:

- **Server-side cookie replay** — Extension sent `auth_token`/`ct0` cookies to the Next.js server, which called X's GraphQL API directly. Failed with 401 because X validates session origin (IP/fingerprint mismatch).
- **Extension service worker fetch** — `background.js` called X's API with cookies from `chrome.cookies`. Same 401 — service worker fetch is cross-origin.
- **MAIN world direct fetch** — Injected script made fetch calls in x.com's page context. X still rejected with 401 — likely additional request signing beyond cookies.
- **MAIN world fetch + direct dashboard POST** — Interceptor fetched from X and POSTed to localhost. CORS blocked the localhost POST from x.com origin.

The current approach (passive interception) works because we never make our own requests to X. We intercept responses to requests X's own JavaScript makes, which are always authenticated.

## Extension constraints

### Chrome MV3 worlds

- `intercept.js` runs in **MAIN world** — has access to the page's `window.fetch`/`XMLHttpRequest` but NOT `chrome.runtime`
- `content.js` runs in **ISOLATED world** — has access to `chrome.runtime` but NOT the page's JS globals
- Communication between worlds: `window.postMessage` (MAIN → ISOLATED) and `chrome.runtime.sendMessage` (ISOLATED → service worker)

### Message size limits

`chrome.runtime.sendMessage` has payload size limits. Send bookmarks **one at a time** from content script to service worker, not in bulk arrays. The service worker accumulates them in memory and batches the dashboard POST.

### Content Security Policy

x.com's CSP blocks inline scripts. Do NOT use `script.textContent = '...'` injection. Use either:
- Manifest-declared `content_scripts` with `"world": "MAIN"` (preferred — runs at `document_start`)
- `<script src="chrome-extension://...">` for web-accessible resources

### Script re-injection

Content scripts re-inject on every navigation. Use an `__xSyncInterceptInstalled` guard on `window` to prevent double-patching fetch/XHR.

### X's GraphQL API

- X uses **XMLHttpRequest** (not fetch) for bookmark API calls
- Endpoint pattern: `/i/api/graphql/{queryId}/Bookmarks`
- The `queryId` rotates periodically — if sync stops finding bookmarks, the queryId in the URL will have changed
- User data lives at `result.core.user_results.result.legacy` but X may nest it differently — use fallback paths
- View count is on `result.views.count`, not in `legacy`
- Engagement metrics: `legacy.favorite_count`, `legacy.retweet_count`, `legacy.reply_count`, `legacy.quote_count`, `legacy.bookmark_count`

## Dashboard patterns

### Styling

- Always-dark theme, no light mode. Colors defined as CSS variables in `globals.css`
- X's design language: `#1d9bf0` accent, `#e7e9ea` text, `#71767b` secondary text, `#0f0f0f` background
- Tailwind v4 with `@theme inline` in CSS — no `tailwind.config` file
- shadcn "base-nova" style on Base UI (not Radix)
- Timeline layout: single column, `max-w-[600px]`, centered with side borders

### Database

- SQLite via `better-sqlite3` + Drizzle ORM
- `rawDb` is the direct better-sqlite3 instance for performance-critical batch operations
- `db` is the Drizzle instance for typed queries
- Upserts use `ON CONFLICT(tweet_id) DO UPDATE` to handle re-syncs
- FTS5 virtual table `bookmarks_fts` for full-text search

### API routes

- `POST /api/x/sync` — accepts `{ bookmarks: [...] }`, upserts into DB
- `GET /api/bookmarks` — paginated, filterable, sortable bookmark list with folder/tag joins (see "URL filter contract")
- `POST /api/bookmarks/bulk` — single endpoint for all multi-bookmark mutations. Body is `{ ids: number[], action, ... }` where `action` is the discriminator: `'archive' | 'add_tags' | 'add_folders'` (extra payload: `tags: string[]` or `folder_ids: number[]`). All branches run inside a `rawDb.transaction()` and return `{ ok: true, added | archived }` counts. React Query wrappers: `useBulkArchive`, `useBulkAddTags`, `useBulkAddFolders` in `use-bookmarks.ts`.
- CRUD routes for folders, tags, bookmark-tag/folder associations
- `GET /api/sync/status` returns `{ in_progress, last_synced_at, total_bookmarks, untagged_count, last_error }`. Both counts are restricted to non-archived bookmarks; `untagged_count` is bookmarks with zero rows in `bookmark_tags`.

### URL filter contract

The bookmark list is driven entirely by URL search params — sidebar, toolbar, and chips all read/write the same params so reloads and shares preserve state.

- `folder_id` and `tag` are **comma-separated lists** (e.g. `?folder_id=1,3&tag=ai,research`). Use `parseStringList`/`parseIdList` from `lib/url-params.ts` to read them — keep all callers on the shared helpers so semantics stay aligned.
- Semantics: `folder_id` is **any-of** (bookmark in ANY listed folder matches); `tag` is **all-of** (bookmark must have EVERY listed tag — implemented as a `COUNT(DISTINCT name) = N` subquery).
- `untagged=1` filters to bookmarks with no tags. Sidebar treats `untagged`, `folder_id`, and `tag` as mutually exclusive — selecting one clears the others.
- Date range: the URL uses `range` with an id (`1d`, `7d`, `30d`, `90d`, `365d`, or absent for "all time"). The grid resolves the id against the `DATE_RANGES` table and passes `range_days` (integer day count) to the API. The API only accepts `range_days`; do not introduce raw timestamp params.
- Sidebar multi-select: cmd/ctrl-click on a folder or tag toggles it in the list; plain click replaces the current selection (or clears it if it was already the only entry).

### Selection model

- `SelectionProvider` (`bookmark/selection-context.tsx`) wraps the grid in `BookmarkGrid`. Any descendant calls `useSelection()` to read/mutate the selection set — do not lift this state higher or duplicate it.
- `selectionMode` is **derived** (`selectedIds.size > 0`); never set it independently. `BulkActionBar` simply returns `null` when size is 0.
- Grid clears selection on any filter change (search, folders, tags, untagged, range, sort) and on Escape — selected ids may not exist in the new result set.

### Card click semantics

`BookmarkCard` is a clickable surface:

- In `selectionMode`, card click toggles selection. Otherwise it opens the tweet on x.com — left click via `onClick`, middle click via `onAuxClick` (so browsers' native "open in new tab" works on the whole card).
- Card activation is suppressed when (a) the user clicked an interactive child or (b) `window.getSelection()` has non-empty text (so users can highlight tweet copy).
- "Interactive child" is detected by `closest('a, button, input, [role="checkbox"], [data-slot="checkbox"]')`. New interactive controls inside a card must either match that selector or call `e.stopPropagation()` on their handler. Wrapper rows that contain multiple controls (folder chips, engagement metrics, manage buttons) put `onClick={(e) => e.stopPropagation()}` on the row itself.

## Things to avoid

- **Never make direct API calls to X** — they will be rejected. Only intercept X's own traffic.
- **Never use inline script injection** on x.com — CSP will block it.
- **Never send large payloads through `chrome.runtime.sendMessage`** — send items individually.
- **Never use `fetch` from content scripts to localhost** — CORS blocks it. Route through the service worker.
- **Never assume X uses `fetch`** — they use XMLHttpRequest. Always patch both.
- **Never hardcode the GraphQL `queryId`** — it rotates. The interceptor matches URL patterns, not specific IDs.
- **Never clear, drop, truncate, or delete data from the database** — `data/bookmarks.db` is the user's personal bookmark archive. Never run destructive SQL (`DELETE FROM bookmarks`, `DROP TABLE`, `TRUNCATE`, etc.) or delete the database file.
