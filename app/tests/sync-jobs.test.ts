import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { SyncJobStore, type JobRequest } from '../src/lib/sync-jobs';
import { executeSyncJob, type JobHandlers } from '../src/lib/sync-job-runner';
import type { SyncRun } from '../src/types';

const request: JobRequest = { action: 'official', mode: 'incremental', reconciliation_confirmation: null };
const imported: SyncRun = { id: 1, requested_mode: 'incremental', mode: 'incremental', status: 'success',
  started_at: 1, heartbeat_at: 2, finished_at: 2, pages_fetched: 2, bookmarks_fetched: 51,
  bookmarks_inserted: 1, bookmarks_existing: 50, remote_removed: 0,
  stop_reason: 'known_boundary', error_code: null, error_message: null };
const organized = { status: 'success' as const, queued: 2, tagged: 2, assignments: 4, model: 'fixture', error: null };
function fixture() {
  const db = new Database(':memory:');
  db.exec(readFileSync(new URL('../drizzle/0009_background_sync.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE sync_runs (id INTEGER PRIMARY KEY, status TEXT, heartbeat_at INTEGER)');
  return { db, store: new SyncJobStore(db) };
}
function handlers(overrides: Partial<JobHandlers> = {}): JobHandlers {
  return { sync: async (_, start) => { start(1); return imported; }, notes: async () => ({ status: 'success' }),
    organize: async (progress) => { progress(0, 2); progress(2, 2); return organized; }, ...overrides };
}

test('enqueue is durable, request-bound, deduplicated, and claim is exclusive', () => {
  const { db, store } = fixture();
  const job = store.enqueue('request-00000001', request);
  assert.equal(new SyncJobStore(db).latest()?.id, job.id);
  assert.equal(store.enqueue('request-00000001', request).id, job.id);
  assert.throws(() => store.enqueue('request-00000001', { ...request, mode: 'full' }), /different job/);
  assert.equal(store.enqueue('request-00000002', request).id, job.id);
  assert.equal(store.claim('owner-a')?.id, job.id);
  assert.equal(store.claim('owner-b'), null);
  assert.throws(() => store.update(job.id, 'owner-b', { stage: 'organizing' }), /lease/);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM sync_jobs').get() as { count: number }).count, 1);
  assert.equal('input_json' in store.get(job.id), false);
  db.close();
});

test('worker pipeline records import, organization progress and final result independently of caller', async () => {
  const { db, store } = fixture();
  store.enqueue('request-00000001', request);
  const job = store.claim('worker')!;
  await executeSyncJob(store, job, 'worker', handlers({ organize: async (progress) => {
    assert.equal(new SyncJobStore(db).latest()?.stage, 'organizing');
    assert.equal(store.get(job.id).result?.sync?.bookmarks_inserted, 1);
    progress(1, 2);
    assert.equal(new SyncJobStore(db).get(job.id).progress_done, 1);
    progress(2, 2);
    return organized;
  } }));
  const complete = new SyncJobStore(db).latest()!;
  assert.equal(complete.status, 'success');
  assert.equal(complete.progress_done, 2);
  assert.equal(complete.result?.sync?.id, 1);
  assert.equal(complete.result?.auto_tag?.tagged, 2);
  assert.equal(store.enqueue('request-00000001', request).id, job.id); // lost response replay
  db.close();
});

test('organization failure keeps successful import and retry does not invoke X or notes', async () => {
  const { db, store } = fixture();
  store.enqueue('request-00000001', request);
  await executeSyncJob(store, store.claim('worker')!, 'worker', handlers({ organize: async (progress) => {
    progress(1, 2); throw new Error('sensitive untrusted output');
  } }));
  assert.equal(store.latest()?.status, 'partial');
  assert.equal(store.latest()?.result?.sync?.status, 'success');
  assert.equal(store.latest()?.progress_done, 1);
  assert.doesNotMatch(JSON.stringify(store.latest()), /sensitive/);
  store.enqueue('request-00000002', { ...request, action: 'organize' });
  await executeSyncJob(store, store.claim('worker')!, 'worker', handlers({
    sync: async () => { throw new Error('X must not be called'); },
    notes: async () => { throw new Error('Notes must not be called'); },
  }));
  assert.equal(store.latest()?.status, 'success');
  assert.equal(store.latest()?.result?.sync, null);
  db.close();
});

test('interrupted importing is not automatically replayed; completed import resumes local work', () => {
  for (const completed of [false, true]) {
    const { db, store } = fixture();
    const job = store.enqueue('request-00000001', request);
    store.claim('old-worker');
    store.update(job.id, 'old-worker', { sync_run_id: 1 });
    db.prepare('UPDATE sync_jobs SET updated_at = 10 WHERE id = ?').run(job.id);
    store.recover(() => completed ? JSON.stringify({ sync: imported, auto_tag: null }) : null, 100);
    assert.equal(store.latest()?.status, completed ? 'queued' : 'failed');
    assert.equal(store.latest()?.stage, completed ? 'notes' : 'importing');
    if (!completed) assert.equal(store.claim('new-worker'), null);
    db.close();
  }
});

test('fresh leases are untouched and crashed organization resumes with cumulative progress', async () => {
  const { db, store } = fixture();
  const job = store.enqueue('request-00000001', { ...request, action: 'organize' });
  store.claim('old-worker');
  store.recover(() => { throw new Error('fresh lease'); });
  assert.equal(store.latest()?.status, 'running');
  store.update(job.id, 'old-worker', { progress_done: 20, progress_total: 22 });
  db.prepare('UPDATE sync_jobs SET updated_at = 10 WHERE id = ?').run(job.id);
  store.recover(() => { throw new Error('organization must not recover an import'); }, 100);
  await executeSyncJob(store, store.claim('new-worker')!, 'new-worker', handlers());
  assert.equal(store.latest()?.status, 'success');
  assert.equal(store.latest()?.progress_done, 22);
  assert.equal(store.latest()?.progress_total, 22);
  db.close();
});

test('anomaly confirmation survives reload without automatic reconciliation', async () => {
  const { db, store } = fixture();
  store.enqueue('request-00000001', { ...request, mode: 'full' });
  const details = { baseline_count: 1000, observed_count: 10, archive_count: 990,
    reconciliation_confirmation: { fingerprint: 'a'.repeat(64), observed_count: 10 } };
  await executeSyncJob(store, store.claim('worker')!, 'worker', handlers({ sync: async () => {
    throw Object.assign(new Error('Quarantined; nothing archived'), { code: 'x_full_sync_anomaly', details });
  }, organize: async () => { throw new Error('must not organize'); } }));
  assert.equal(new SyncJobStore(db).latest()?.status, 'failed');
  assert.deepEqual(new SyncJobStore(db).latest()?.error_details, details);
  assert.equal(store.claim('worker'), null);
  db.close();
});
