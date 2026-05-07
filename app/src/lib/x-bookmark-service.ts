import 'server-only';
import { db, rawDb } from './db/client';
import { bookmarks, xCredentials } from './db/schema';
import { eq, sql } from 'drizzle-orm';

// Update queryId here when X rotates it (symptoms: sync returns 404)
const X_CONFIG = {
  queryId: 'tmd4FaovSNBQkbBKbzqJWg',
  bearerToken:
    'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I%2FejmhoHJX%2FJ%2BjbE9xmLIEnM4%3DcZgvhO88RWtdmmHvNFqFuDhp0OIiLl6jUAjQNQ7CJP2mfRVRZw',
  maxPages: 100,
  pageSize: 100,
};

const FEATURES = {
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: false,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  interactive_text_enabled: true,
  responsive_web_text_conversations_enabled: false,
  responsive_web_enhance_cards_enabled: false,
};

interface SyncStatus {
  in_progress: boolean;
  last_synced_at: number | null;
  total_bookmarks: number;
  last_error: string | null;
}

// Module-level singleton — persists across requests in the same server process
const syncStatus: SyncStatus = {
  in_progress: false,
  last_synced_at: null,
  total_bookmarks: 0,
  last_error: null,
};

export function getSyncStatus(): SyncStatus {
  return { ...syncStatus };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  try {
    const res = await fetch(url, options);
    return res;
  } catch {
    await sleep(2000);
    return fetch(url, options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTweetData(result: any) {
  try {
    const legacy = result?.legacy;
    const userLegacy = result?.core?.user_results?.result?.legacy;
    if (!legacy || !userLegacy) return null;

    const tweetId: string = result?.rest_id ?? legacy?.id_str;
    if (!tweetId) return null;

    const screenName: string = userLegacy.screen_name ?? '';
    const tweetUrl = `https://x.com/${screenName}/status/${tweetId}`;

    const mediaUrls: string[] = (legacy.entities?.media ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m.media_url_https as string,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quotedTweet: any = null;
    const quotedResult = result?.quoted_status_result?.result;
    if (quotedResult) {
      const ql = quotedResult.legacy;
      const qul = quotedResult.core?.user_results?.result?.legacy;
      if (ql && qul) {
        quotedTweet = {
          tweet_id: quotedResult.rest_id,
          full_text: ql.full_text,
          author_name: qul.name,
          author_handle: qul.screen_name,
          author_avatar: qul.profile_image_url_https,
        };
      }
    }

    const createdAt = legacy.created_at
      ? Math.floor(new Date(legacy.created_at).getTime() / 1000)
      : null;

    return {
      tweetId,
      fullText: legacy.full_text ?? '',
      authorName: userLegacy.name ?? '',
      authorHandle: screenName,
      authorAvatar: userLegacy.profile_image_url_https ?? null,
      tweetUrl,
      mediaUrls: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
      quotedTweet: quotedTweet ? JSON.stringify(quotedTweet) : null,
      bookmarkedAt: createdAt,
      syncedAt: Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

export async function syncBookmarks(authToken: string, ct0: string): Promise<number> {
  if (syncStatus.in_progress) return -1;

  syncStatus.in_progress = true;
  syncStatus.last_error = null;
  let totalSynced = 0;

  try {
    const headers = {
      Cookie: `auth_token=${authToken}; ct0=${ct0}`,
      'x-csrf-token': ct0,
      Authorization: `Bearer ${X_CONFIG.bearerToken}`,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-client-language': 'en',
      Referer: 'https://x.com/i/bookmarks',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    let cursor: string | null = null;
    let page = 0;

    while (page < X_CONFIG.maxPages) {
      const variables = {
        count: X_CONFIG.pageSize,
        includePromotedContent: false,
        ...(cursor ? { cursor } : {}),
      };
      const url =
        `https://x.com/i/api/graphql/${X_CONFIG.queryId}/Bookmarks` +
        `?variables=${encodeURIComponent(JSON.stringify(variables))}` +
        `&features=${encodeURIComponent(JSON.stringify(FEATURES))}`;

      const res = await fetchWithRetry(url, { headers });

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        console.error('[x-sync] X API error', {
          status: res.status,
          statusText: res.statusText,
          authTokenPreview: `${authToken.slice(0, 6)}…(${authToken.length})`,
          ct0Preview: `${ct0.slice(0, 6)}…(${ct0.length})`,
          body: bodyText.slice(0, 1000),
        });
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `X rejected the session (${res.status}). X said: ${bodyText.slice(0, 300) || '(empty body)'}`,
          );
        }
        if (res.status === 404) {
          throw new Error(
            'X GraphQL queryId may be outdated. Update X_CONFIG.queryId in x-bookmark-service.ts',
          );
        }
        throw new Error(`X API returned ${res.status}: ${res.statusText} — ${bodyText.slice(0, 300)}`);
      }

      const json = await res.json();
      const instructions: unknown[] =
        json?.data?.bookmark_timeline_v2?.timeline?.instructions ?? [];

      const tweets: ReturnType<typeof extractTweetData>[] = [];
      let nextCursor: string | null = null;

      for (const instruction of instructions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const entries: any[] = (instruction as any)?.entries ?? [];
        for (const entry of entries) {
          const entryId: string = entry?.entryId ?? '';
          if (entryId.includes('cursor-bottom')) {
            nextCursor = entry?.content?.value ?? null;
            continue;
          }
          const result = entry?.content?.itemContent?.tweet_results?.result;
          if (result) {
            const data = extractTweetData(result);
            if (data) tweets.push(data);
          }
        }
      }

      if (tweets.length > 0) {
        // Batch upsert
        const upsertStmt = rawDb.prepare(`
          INSERT INTO bookmarks
            (tweet_id, full_text, author_name, author_handle, author_avatar,
             tweet_url, media_urls, quoted_tweet, bookmarked_at, synced_at,
             created_at, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
          ON CONFLICT(tweet_id) DO UPDATE SET
            full_text    = excluded.full_text,
            author_name  = excluded.author_name,
            author_handle = excluded.author_handle,
            author_avatar = excluded.author_avatar,
            media_urls   = excluded.media_urls,
            quoted_tweet = excluded.quoted_tweet,
            synced_at    = excluded.synced_at,
            updated_at   = unixepoch()
        `);

        const upsertMany = rawDb.transaction(
          (rows: NonNullable<ReturnType<typeof extractTweetData>>[]) => {
            for (const row of rows) {
              upsertStmt.run(
                row.tweetId,
                row.fullText,
                row.authorName,
                row.authorHandle,
                row.authorAvatar,
                row.tweetUrl,
                row.mediaUrls,
                row.quotedTweet,
                row.bookmarkedAt,
                row.syncedAt,
              );
            }
          },
        );

        upsertMany(tweets.filter(Boolean) as NonNullable<ReturnType<typeof extractTweetData>>[]);
        totalSynced += tweets.length;
      }

      // Update running count in status
      const countRow = rawDb
        .prepare('SELECT COUNT(*) as cnt FROM bookmarks')
        .get() as { cnt: number };
      syncStatus.total_bookmarks = countRow.cnt;

      if (!nextCursor || tweets.length === 0) break;
      cursor = nextCursor;
      page++;
      if (page < X_CONFIG.maxPages) await sleep(500);
    }

    syncStatus.last_synced_at = Math.floor(Date.now() / 1000);

    // Persist credentials with user info (best-effort)
    try {
      await db
        .insert(xCredentials)
        .values({ authToken, ct0 })
        .onConflictDoUpdate({
          target: xCredentials.id,
          set: { authToken, ct0, updatedAt: sql`(unixepoch())` },
        });
    } catch {
      // non-fatal
    }

    return totalSynced;
  } catch (err) {
    syncStatus.last_error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    syncStatus.in_progress = false;
  }
}

export async function upsertCredentials(authToken: string, ct0: string) {
  const existing = await db.select().from(xCredentials).limit(1);
  if (existing.length === 0) {
    await db.insert(xCredentials).values({ authToken, ct0 });
  } else {
    await db
      .update(xCredentials)
      .set({ authToken, ct0, updatedAt: sql`(unixepoch())` })
      .where(eq(xCredentials.id, existing[0].id));
  }
}
