import 'server-only';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { rawDb } from './db/client';
import { SyncJobStore, type JobRequest } from './sync-jobs';

export function enqueueSyncJob(requestId: string, request: JobRequest) {
  const job = new SyncJobStore(rawDb).enqueue(requestId, request);
  // Durable DB commit first; a lost wake event is covered by the local queue read.
  try {
    const wakeDir = path.join(path.dirname(rawDb.name), 'sync-worker');
    mkdirSync(wakeDir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(wakeDir, 'wake'), String(job.id), { mode: 0o600 });
  } catch { /* The supervised worker also checks the durable queue. */ }
  return job;
}
