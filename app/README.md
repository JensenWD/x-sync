# X Bookmarks

Private X bookmark dashboard backed by SQLite and synced through X OAuth and the official Bookmarks API.

## Access

- Local service: `http://127.0.0.1:3000`
- Tailnet: `https://agentmac.tailf5c3be.ts.net:3000`
- LaunchAgent: `com.johnny.x-sync`

The Next.js server listens on loopback only. Tailscale Serve owns Tailnet HTTPS exposure.

## Agent bookmark query API

Agents can search the local bookmark library without calling X or reading SQLite directly. The API is read-only and returns bookmark text, author data, media, quoted tweets, folders, tags, tweet timestamps, local import timestamps, sync state, and pagination metadata.

- Query endpoint: `GET` or `POST /api/agent/bookmarks`
- Machine-readable contract and current folder/tag facets: `GET /api/agent/bookmarks/schema`
- Default scope: active bookmarks only
- Maximum page size: 100

Simple GET query:

```bash
curl -sG 'http://127.0.0.1:3000/api/agent/bookmarks' \
  --data-urlencode 'q=AI agents' \
  --data-urlencode 'tag=research' \
  --data-urlencode 'limit=20'
```

Structured POST query:

```bash
curl -s 'http://127.0.0.1:3000/api/agent/bookmarks' \
  -H 'Content-Type: application/json' \
  --data '{"folder_names":["Work"],"tags_all":["ai","coding"],"has_media":true}'
```

GET supports `q`, `match`, repeated or comma-separated `author`, `folder_id`, `folder`, `tag`, `tag_all`, and `tweet_id` parameters, plus `has_media`, `has_quote`, `tweet_created_after`, `tweet_created_before`, `status`, `sort`, `limit`, and `offset`. POST uses the equivalent plural JSON fields documented by the schema endpoint.

## Sync behavior

- `auto`: full sync on an empty database or when the last full reconciliation is at least seven days old; incremental otherwise.
- `incremental`: scans from the newest page until it reaches two completely known pages.
- `full`: scans to the end, then archives local rows no longer present on X.

The official API importer requests the reliable 50-item page size and records each page in a durable SQLite run. Full reconciliation never hard-deletes bookmarks, tags, or folder associations, and an interrupted run never archives unseen rows. Local removal writes a hide tombstone that later syncs do not clear. The former browser extension is parked as a fallback and is not part of the normal workflow.

## Safe database commands

```bash
npm run db:generate
npm run db:migrate
```

`db:migrate` refuses to create a missing database, verifies integrity, makes a timestamped online backup under `data/backups/`, applies migrations, and verifies integrity again. `db:setup` also refuses to create a missing database. Use `npm run db:init` only for an intentional brand-new database.

## Verification

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

The parked Chrome extension fallback lives in `../extension`; normal sync uses the in-app X OAuth/API flow.
