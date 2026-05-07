// MAIN world content script — patches fetch AND XMLHttpRequest before X's scripts load.
// Declared in manifest with run_at: document_start, world: MAIN.

(function () {
  if (window.__xSyncInterceptInstalled) return;
  window.__xSyncInterceptInstalled = true;

  function findUserLegacy(result) {
    // X nests user data under several possible paths depending on the response version
    const paths = [
      result?.core?.user_results?.result?.legacy,
      result?.core?.user_result?.result?.legacy,
      result?.core?.user_results?.result?.core?.user_results?.result?.legacy,
      result?.author?.legacy,
      result?.user?.legacy,
    ];
    for (const p of paths) {
      if (p?.screen_name) return p;
    }

    // Brute-force: walk one level deep looking for an object with screen_name
    if (result?.core) {
      for (const key of Object.keys(result.core)) {
        const nested = result.core[key]?.result?.legacy;
        if (nested?.screen_name) return nested;
      }
    }
    return null;
  }

  function isVerified(result) {
    const user = result?.core?.user_results?.result
      ?? result?.core?.user_result?.result;
    return user?.is_blue_verified === true || user?.verified === true;
  }

  function extractTweetData(result) {
    try {
      if (result?.__typename === 'TweetWithVisibilityResults') {
        result = result.tweet;
      }

      const legacy = result?.legacy;
      if (!legacy) return null;

      const tweetId = result?.rest_id ?? legacy?.id_str;
      if (!tweetId) return null;

      const userLegacy = findUserLegacy(result);
      const screenName = userLegacy?.screen_name ?? '';
      const tweetUrl = screenName
        ? `https://x.com/${screenName}/status/${tweetId}`
        : `https://x.com/i/status/${tweetId}`;

      const mediaUrls = (legacy.entities?.media ?? []).map((m) => m.media_url_https);

      let quotedTweet = null;
      const quotedResult = result?.quoted_status_result?.result;
      if (quotedResult) {
        const ql = quotedResult?.legacy ?? quotedResult?.tweet?.legacy;
        const qul = findUserLegacy(quotedResult) ?? findUserLegacy(quotedResult?.tweet);
        if (ql && qul) {
          quotedTweet = {
            tweet_id: quotedResult.rest_id ?? quotedResult?.tweet?.rest_id,
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

      // View count is on the top-level result, not legacy
      const viewCount = parseInt(result?.views?.count, 10) || null;

      return {
        tweetId,
        fullText: legacy.full_text ?? '',
        authorName: userLegacy?.name ?? '',
        authorHandle: screenName,
        authorAvatar: userLegacy?.profile_image_url_https ?? null,
        authorVerified: isVerified(result),
        tweetUrl,
        mediaUrls: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
        quotedTweet: quotedTweet ? JSON.stringify(quotedTweet) : null,
        likeCount: legacy.favorite_count ?? 0,
        retweetCount: legacy.retweet_count ?? 0,
        replyCount: legacy.reply_count ?? 0,
        quoteCount: legacy.quote_count ?? 0,
        viewCount,
        bookmarkCount: legacy.bookmark_count ?? null,
        lang: legacy.lang ?? null,
        bookmarkedAt: createdAt,
        syncedAt: Math.floor(Date.now() / 1000),
      };
    } catch {
      return null;
    }
  }

  function parseBookmarkResponse(json) {
    const tweets = [];
    const instructions = json?.data?.bookmark_timeline_v2?.timeline?.instructions ?? [];

    for (const instruction of instructions) {
      const entries = instruction?.entries ?? [];
      for (const entry of entries) {
        const entryId = entry?.entryId ?? '';
        if (entryId.includes('cursor')) continue;
        const result = entry?.content?.itemContent?.tweet_results?.result;
        if (result) {
          const data = extractTweetData(result);
          if (data) tweets.push(data);
        }
      }
    }

    return tweets;
  }

  function isBookmarkUrl(url) {
    if (!url) return false;
    return (url.includes('/graphql/') || url.includes('/api/graphql/')) &&
      (url.includes('Bookmarks') || url.includes('bookmarks'));
  }

  function handleResponseJson(json, source) {
    try {
      const tweets = parseBookmarkResponse(json);
      console.log(`[x-sync] (${source}) parsed ${tweets.length} tweets`);
      if (tweets.length > 0) {
        window.postMessage({ type: '__X_SYNC_BOOKMARKS__', bookmarks: tweets }, '*');
      }
      if (tweets.length === 0) {
        window.postMessage({ type: '__X_SYNC_PAGE_EMPTY__' }, '*');
      }
    } catch {
      // Don't break the page
    }
  }

  // --- Patch fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? '';

    if (isBookmarkUrl(url)) {
      try {
        const clone = response.clone();
        const json = await clone.json();
        handleResponseJson(json, 'fetch');
      } catch {}
    }

    return response;
  };

  // --- Patch XMLHttpRequest ---
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__xSyncUrl = url;
    return originalXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isBookmarkUrl(this.__xSyncUrl)) {
      this.addEventListener('load', function () {
        try {
          const json = JSON.parse(this.responseText);
          handleResponseJson(json, 'xhr');
        } catch {}
      });
    }
    return originalXHRSend.apply(this, args);
  };

  console.log('[x-sync] fetch + XHR interceptor installed');
})();
