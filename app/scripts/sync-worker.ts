import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { mkdirSync, watch } from 'node:fs';
import path from 'node:path';
import { SyncJobStore } from '../src/lib/sync-jobs';
import { executeSyncJob } from '../src/lib/sync-job-runner';
import { BookmarkSyncStore } from '../src/lib/x-sync/store';
import { autoTagMissingBookmarks } from '../src/lib/auto-tag';

async function main() {
  loadEnvConfig(process.cwd());
  const { rawDb } = await import('../src/lib/db/client');
  rawDb.pragma('busy_timeout = 5000');
  const { syncOfficialBookmarks } = await import('../src/lib/x-api/sync');
  const { refreshCommunityNotes } = await import('../src/lib/community-notes/cache');
  const store = new SyncJobStore(rawDb);
  const owner = randomUUID();
  let busy = false;
  async function drain() {
    if (busy) return;
    busy = true;
    try {
      store.recover((job) => {
        if (job.sync_run_id === null) return null;
        const syncs = new BookmarkSyncStore(rawDb);
        const run = syncs.getRun(job.sync_run_id);
        if (run.status === 'success') return JSON.stringify({ sync: syncs.getRunResult(run.id), auto_tag: null });
        if (run.status === 'running') syncs.failRun(run.id, 'import_interrupted', 'Background import was interrupted; no automatic X retry.', Math.floor(Date.now() / 1000));
        return null;
      });
      let job;
      while ((job = store.claim(owner))) {
        console.log(JSON.stringify({ event: 'job_started', job_id: job.id, stage: job.stage }));
        const heartbeat = setInterval(() => {
          try { store.heartbeat(job!.id, owner); }
          catch { console.error('Sync worker lost its lease; exiting safely.'); process.exit(1); }
        }, 10_000);
        try {
          await executeSyncJob(store, job, owner, {
            sync: (request, onStart) => syncOfficialBookmarks(request.mode, request.reconciliation_confirmation, onStart),
            notes: () => refreshCommunityNotes(rawDb),
            organize: (progress) => autoTagMissingBookmarks(rawDb, undefined, progress),
          });
        } finally { clearInterval(heartbeat); }
        console.log(JSON.stringify({ event: 'job_finished', job_id: job.id, status: store.get(job.id).status }));
      }
    } finally { busy = false; }
  }
  const wakeDir = path.join(path.dirname(rawDb.name), 'sync-worker');
  mkdirSync(wakeDir, { recursive: true, mode: 0o700 });
  const trigger = () => void drain().catch(() => { console.error('Sync worker failed; supervisor will restart it.'); process.exit(1); });
  watch(wakeDir, trigger);
  // Queue reads only: this timer never creates jobs or speculatively calls X.
  setInterval(trigger, 15_000);
  console.log('Sync worker ready (explicitly queued jobs only).');
  trigger();
}
main().catch((error) => {
  console.error('Sync worker startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});
