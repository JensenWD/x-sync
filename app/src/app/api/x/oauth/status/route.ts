import { getXConnectionStatus } from '@/lib/x-api/oauth';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(getXConnectionStatus(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
