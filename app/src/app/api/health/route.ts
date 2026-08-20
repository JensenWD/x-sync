import { rawDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const quickCheck = rawDb.pragma('quick_check', { simple: true });
    const foreignKeyIssues = (rawDb.pragma('foreign_key_check') as unknown[]).length;
    const counts = rawDb
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM bookmarks) AS bookmarks_total,
           (SELECT COUNT(*) FROM bookmarks WHERE remote_present = 1 AND hidden_at IS NULL) AS bookmarks_active,
           (SELECT COUNT(*) FROM bookmarks_fts) AS bookmarks_fts,
           (SELECT COUNT(*) FROM bookmark_enrichments) AS enrichments,
           (SELECT COUNT(*) FROM taxonomy_proposals WHERE status = 'proposed') AS proposals_pending,
           (SELECT COUNT(*) FROM sync_runs WHERE status = 'running') AS syncs_running`,
      )
      .get() as Record<string, number>;
    const healthy =
      quickCheck === 'ok' &&
      foreignKeyIssues === 0 &&
      counts.bookmarks_total === counts.bookmarks_fts &&
      counts.syncs_running <= 1;
    return Response.json(
      {
        status: healthy ? 'healthy' : 'degraded',
        database: { quick_check: quickCheck, foreign_key_issues: foreignKeyIssues },
        counts,
        checked_at: new Date().toISOString(),
      },
      {
        status: healthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('Health check failed', error);
    return Response.json(
      { status: 'unhealthy', checked_at: new Date().toISOString() },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
