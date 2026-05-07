import { syncBookmarks, getSyncStatus, upsertCredentials } from '@/lib/x-bookmark-service';
import { NextRequest } from 'next/server';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { auth_token, ct0 } = (body as Record<string, string>) ?? {};
  if (!auth_token || !ct0) {
    return Response.json({ error: 'auth_token and ct0 are required' }, { status: 400 });
  }

  const status = getSyncStatus();
  if (status.in_progress) {
    return Response.json({ status: 'already_running' });
  }

  try {
    await upsertCredentials(auth_token, ct0);
    const synced_count = await syncBookmarks(auth_token, ct0);
    return Response.json({ status: 'success', synced_count });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ status: 'error', error: message }, { status: 500 });
  }
}
