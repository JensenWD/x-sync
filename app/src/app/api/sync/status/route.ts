import { getSyncStatus } from '@/lib/x-bookmark-service';

export async function GET() {
  return Response.json(getSyncStatus(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
