import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type Database from 'better-sqlite3';
import {
  collectTrackedCommunityNoteIds,
  recordCommunityNotesFailure,
  replaceCommunityNotes,
} from './store';
import { readRelevantNotes, readRelevantStatuses } from './tsv';

const execFileAsync = promisify(execFile);
const CHECK_TTL_SECONDS = 6 * 60 * 60;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_AGE_DAYS = 4;
const MAX_SHARDS = 16;

type Dataset = 'notes' | 'noteStatusHistory';

interface RemoteShard {
  dataset: Dataset;
  index: number;
  url: string;
  etag: string | null;
  contentLength: number | null;
  filename: string;
}

interface CacheManifest {
  version: 1;
  snapshotDate: string;
  shards: RemoteShard[];
}

interface CommunityNotesStateRow {
  snapshot_date: string | null;
  last_checked_at: number | null;
  last_refreshed_at: number | null;
  tracked_hash: string | null;
  notes_imported: number;
  helpful_notes: number;
  last_error: string | null;
}

export interface CommunityNotesRefreshResult {
  status: 'success' | 'skipped' | 'failed';
  snapshot_date: string | null;
  notes_imported: number;
  helpful_notes: number;
  downloaded_files: number;
  reused_files: number;
  error: string | null;
}

function cacheDirectory() {
  const configured = process.env.X_SYNC_COMMUNITY_NOTES_DIR;
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), 'data', 'community-notes');
}

function manifestPath(directory: string) {
  return path.join(directory, 'manifest.json');
}

function readManifest(directory: string): CacheManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath(directory), 'utf8')) as CacheManifest;
    return parsed.version === 1 && Array.isArray(parsed.shards) ? parsed : null;
  } catch {
    return null;
  }
}

function writeManifest(directory: string, manifest: CacheManifest) {
  const target = manifestPath(directory);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
}

function datePath(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}

function datasetFilename(dataset: Dataset, index: number) {
  const base = dataset === 'notes' ? 'notes' : 'noteStatusHistory';
  return `${base}-${String(index).padStart(5, '0')}.zip`;
}

function datasetUrl(snapshotDate: string, dataset: Dataset, index: number) {
  return `https://ton.twimg.com/birdwatch-public-data/${snapshotDate}/${dataset}/${datasetFilename(dataset, index)}`;
}

async function head(url: string, fetchImpl: typeof fetch) {
  return fetchImpl(url, {
    method: 'HEAD',
    signal: AbortSignal.timeout(30_000),
    cache: 'no-store',
  });
}

async function latestSnapshotDate(now: Date, fetchImpl: typeof fetch) {
  for (let offset = 0; offset <= MAX_SNAPSHOT_AGE_DAYS; offset += 1) {
    const candidate = new Date(now);
    candidate.setUTCDate(candidate.getUTCDate() - offset);
    const snapshotDate = datePath(candidate);
    const [notes, statuses] = await Promise.all([
      head(datasetUrl(snapshotDate, 'notes', 0), fetchImpl),
      head(datasetUrl(snapshotDate, 'noteStatusHistory', 0), fetchImpl),
    ]);
    if (notes.ok && statuses.ok) return snapshotDate;
    if (![notes.status, statuses.status].every((status) => status === 404 || status === 200)) {
      throw new Error(
        `Community Notes snapshot check failed with HTTP ${notes.status}/${statuses.status}`,
      );
    }
  }
  throw new Error('No Community Notes public snapshot was available in the last four days');
}

async function discoverShards(
  snapshotDate: string,
  dataset: Dataset,
  fetchImpl: typeof fetch,
) {
  const shards: RemoteShard[] = [];
  for (let index = 0; index < MAX_SHARDS; index += 1) {
    const url = datasetUrl(snapshotDate, dataset, index);
    const response = await head(url, fetchImpl);
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`${dataset} shard check returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get('content-length'));
    shards.push({
      dataset,
      index,
      url,
      etag: response.headers.get('etag'),
      contentLength: Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : null,
      filename: datasetFilename(dataset, index),
    });
  }
  if (shards.length === 0) throw new Error(`Community Notes ${dataset} snapshot has no shards`);
  if (shards.length === MAX_SHARDS) throw new Error(`Community Notes ${dataset} exceeded ${MAX_SHARDS} shards`);
  return shards;
}

async function verifyZip(file: string) {
  await execFileAsync('unzip', ['-tqq', file], { timeout: 2 * 60 * 1000 });
}

async function ensureShard(
  directory: string,
  shard: RemoteShard,
  previous: RemoteShard | undefined,
  fetchImpl: typeof fetch,
) {
  const target = path.join(directory, shard.filename);
  const stat = fs.existsSync(target) ? fs.statSync(target) : null;
  const unchanged =
    stat?.isFile() &&
    previous?.etag &&
    shard.etag &&
    previous.etag === shard.etag &&
    (shard.contentLength === null || stat.size === shard.contentLength);
  if (unchanged) return { path: target, downloaded: false };

  const response = await fetchImpl(shard.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok || !response.body) {
    throw new Error(`Community Notes download returned HTTP ${response.status}`);
  }
  const temporary = `${target}.tmp-${process.pid}`;
  try {
    const input = Readable.fromWeb(response.body as never);
    await pipeline(input, fs.createWriteStream(temporary, { mode: 0o600 }));
    const size = fs.statSync(temporary).size;
    if (shard.contentLength !== null && size !== shard.contentLength) {
      throw new Error(
        `Community Notes ${shard.filename} was truncated (${size}/${shard.contentLength} bytes)`,
      );
    }
    await verifyZip(temporary);
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return { path: target, downloaded: true };
}

async function prepareSnapshot(
  snapshotDate: string,
  directory: string,
  fetchImpl: typeof fetch,
) {
  const previousManifest = readManifest(directory);
  const shards = [
    ...(await discoverShards(snapshotDate, 'notes', fetchImpl)),
    ...(await discoverShards(snapshotDate, 'noteStatusHistory', fetchImpl)),
  ];
  const previousByFilename = new Map(
    (previousManifest?.shards ?? []).map((shard) => [shard.filename, shard]),
  );
  const prepared: { shard: RemoteShard; path: string; downloaded: boolean }[] = [];
  for (const shard of shards) {
    const result = await ensureShard(
      directory,
      shard,
      previousByFilename.get(shard.filename),
      fetchImpl,
    );
    prepared.push({ shard, ...result });
  }
  writeManifest(directory, { version: 1, snapshotDate, shards });
  const keep = new Set(shards.map((shard) => shard.filename));
  for (const name of fs.readdirSync(directory)) {
    if (name.endsWith('.zip') && !keep.has(name)) fs.unlinkSync(path.join(directory, name));
  }
  return prepared;
}

async function importPreparedSnapshot(
  sqlite: Database.Database,
  snapshotDate: string,
  trackedHash: string,
  tracked: ReturnType<typeof collectTrackedCommunityNoteIds>,
  prepared: { shard: RemoteShard; path: string; downloaded: boolean }[],
  now: number,
) {
  const notePaths = prepared
    .filter((item) => item.shard.dataset === 'notes')
    .map((item) => item.path);
  const statusPaths = prepared
    .filter((item) => item.shard.dataset === 'noteStatusHistory')
    .map((item) => item.path);
  const notes = await readRelevantNotes(notePaths, tracked);
  const statuses = await readRelevantStatuses(statusPaths, new Set(notes.keys()));
  return replaceCommunityNotes(sqlite, snapshotDate, trackedHash, notes, statuses, now);
}

function state(sqlite: Database.Database): CommunityNotesStateRow | null {
  return (
    (sqlite.prepare('SELECT * FROM community_notes_state WHERE id = 1').get() as
      | CommunityNotesStateRow
      | undefined) ?? null
  );
}

function resultFromState(
  status: 'skipped' | 'failed',
  row: CommunityNotesStateRow | null,
  error: string | null = null,
): CommunityNotesRefreshResult {
  return {
    status,
    snapshot_date: row?.snapshot_date?.replaceAll('/', '-') ?? null,
    notes_imported: row?.notes_imported ?? 0,
    helpful_notes: row?.helpful_notes ?? 0,
    downloaded_files: 0,
    reused_files: 0,
    error,
  };
}

export async function refreshCommunityNotes(
  sqlite: Database.Database,
  options: { force?: boolean; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<CommunityNotesRefreshResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const nowDate = options.now ?? new Date();
  const now = Math.floor(nowDate.getTime() / 1000);
  const directory = cacheDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const tracked = collectTrackedCommunityNoteIds(sqlite);
  const prior = state(sqlite);
  const manifest = readManifest(directory);

  try {
    const recentlyChecked =
      !options.force &&
      prior?.last_checked_at &&
      now - prior.last_checked_at < CHECK_TTL_SECONDS &&
      !prior.last_error;
    if (recentlyChecked && prior.tracked_hash === tracked.hash) {
      return resultFromState('skipped', prior);
    }

    let snapshotDate: string;
    let prepared: { shard: RemoteShard; path: string; downloaded: boolean }[];
    if (recentlyChecked && manifest && prior?.snapshot_date === manifest.snapshotDate) {
      snapshotDate = manifest.snapshotDate;
      prepared = manifest.shards.map((shard) => ({
        shard,
        path: path.join(directory, shard.filename),
        downloaded: false,
      }));
      for (const item of prepared) {
        if (!fs.existsSync(item.path)) throw new Error(`Cached ${item.shard.filename} is missing`);
      }
    } else {
      snapshotDate = await latestSnapshotDate(nowDate, fetchImpl);
      if (
        !options.force &&
        prior?.snapshot_date === snapshotDate &&
        prior.tracked_hash === tracked.hash &&
        !prior.last_error
      ) {
        sqlite
          .prepare(
            `UPDATE community_notes_state
             SET last_checked_at = ?, last_error = NULL, updated_at = ? WHERE id = 1`,
          )
          .run(now, now);
        return resultFromState('skipped', { ...prior, last_checked_at: now });
      }
      prepared = await prepareSnapshot(snapshotDate, directory, fetchImpl);
    }

    const imported = await importPreparedSnapshot(
      sqlite,
      snapshotDate,
      tracked.hash,
      tracked,
      prepared,
      now,
    );
    return {
      status: 'success',
      snapshot_date: snapshotDate.replaceAll('/', '-'),
      notes_imported: imported.notesImported,
      helpful_notes: imported.helpfulNotes,
      downloaded_files: prepared.filter((item) => item.downloaded).length,
      reused_files: prepared.filter((item) => !item.downloaded).length,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Community Notes refresh failed';
    recordCommunityNotesFailure(sqlite, message, now);
    return resultFromState('failed', state(sqlite), message);
  }
}
