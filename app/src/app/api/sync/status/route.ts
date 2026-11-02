import { getSyncStatus } from '@/lib/x-bookmark-service';
import { rawDb } from '@/lib/db/client';
import { SyncJobStore } from '@/lib/sync-jobs';

export async function GET() {
  const status = getSyncStatus();
  const job = new SyncJobStore(rawDb).latest();
  return Response.json({ ...status, job, in_progress: status.in_progress ||
    job?.status === 'queued' || job?.status === 'running' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
