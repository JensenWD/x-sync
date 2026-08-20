import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { bookmarkContentHash, libraryRevision } from './bookmark-content';
import { AgentContractError } from './agent-taxonomy';
import { queryBookmarks, type BookmarkQueryInput } from './bookmark-query';

const MAX_ENRICHMENT_BATCH = 100;
const MAX_EMBEDDING_DIMENSIONS = 3_072;
const MAX_SEMANTIC_CANDIDATES = 5_000;

function object(value: unknown, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentContractError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strictObject(value: unknown, field: string, allowed: readonly string[]) {
  const result = object(value, field);
  const allowedFields = new Set(allowed);
  const unknown = Object.keys(result).find((key) => !allowedFields.has(key));
  if (unknown) throw new AgentContractError(`Unknown ${field} field: ${unknown}`);
  return result;
}

function requestFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function recordedRequest(inputJson: string | null) {
  if (!inputJson) return null;
  try {
    return JSON.parse(inputJson) as {
      request_hash?: unknown;
      item_count?: unknown;
      bookmark_ids?: unknown;
    };
  } catch {
    return null;
  }
}

function text(value: unknown, field: string, maximum: number, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AgentContractError(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new AgentContractError(`${field} must be a string`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > maximum) {
    throw new AgentContractError(`${field} must contain 1 to ${maximum} characters`);
  }
  return normalized;
}

function positiveId(value: unknown, field: string) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new AgentContractError(`${field} must be a positive integer`);
  }
  return Number(value);
}

function jsonValue(value: unknown, field: string, maximumBytes: number) {
  if (value === undefined || value === null) return null;
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new AgentContractError(`${field} must be JSON-serializable`);
  }
  if (Buffer.byteLength(encoded, 'utf8') > maximumBytes) {
    throw new AgentContractError(`${field} is too large`);
  }
  return encoded;
}

function embedding(value: unknown, field = 'embedding') {
  if (value === undefined || value === null) return null;
  const input = strictObject(value, field, ['model', 'values']);
  const model = text(input.model, `${field}.model`, 150, true);
  if (!Array.isArray(input.values) || input.values.length === 0 || input.values.length > MAX_EMBEDDING_DIMENSIONS) {
    throw new AgentContractError(`${field}.values must contain 1 to ${MAX_EMBEDDING_DIMENSIONS} numbers`);
  }
  const values = input.values.map((item, index) => {
    const number = Number(item);
    if (!Number.isFinite(number)) throw new AgentContractError(`${field}.values[${index}] must be finite`);
    return number;
  });
  return { model, values };
}

function bookmarkForHash(sqlite: Database.Database, bookmarkId: number) {
  return sqlite
    .prepare(
      `SELECT tweet_id, full_text, author_name, author_handle, tweet_url,
              media_urls, media_metadata, quoted_tweet
       FROM bookmarks WHERE id = ?`,
    )
    .get(bookmarkId) as Parameters<typeof bookmarkContentHash>[0] | undefined;
}

export function storeEnrichments(sqlite: Database.Database, rawBody: unknown) {
  const body = strictObject(rawBody, 'body', [
    'idempotency_key',
    'agent_id',
    'model',
    'prompt_version',
    'dry_run',
    'items',
  ]);
  const runKey = text(body.idempotency_key, 'idempotency_key', 100, true);
  const agentId = text(body.agent_id, 'agent_id', 100, true);
  const runModel = text(body.model, 'model', 150);
  const promptVersion = text(body.prompt_version, 'prompt_version', 100);
  const dryRun = body.dry_run === undefined ? true : body.dry_run;
  if (typeof dryRun !== 'boolean') throw new AgentContractError('dry_run must be a boolean');
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ENRICHMENT_BATCH) {
    throw new AgentContractError(`items must contain between 1 and ${MAX_ENRICHMENT_BATCH} entries`);
  }

  const normalized = body.items.map((value, index) => {
    const item = strictObject(value, `items[${index}]`, [
      'bookmark_id',
      'content_hash',
      'status',
      'summary',
      'topics',
      'entities',
      'link_text',
      'media_text',
      'embedding',
      'error_message',
    ]);
    const bookmarkId = positiveId(item.bookmark_id, `items[${index}].bookmark_id`);
    const contentHash = text(item.content_hash, `items[${index}].content_hash`, 64, true)!;
    if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
      throw new AgentContractError(`items[${index}].content_hash must be a SHA-256 hash`);
    }
    if (item.status !== 'complete' && item.status !== 'failed') {
      throw new AgentContractError(`items[${index}].status must be complete or failed`);
    }
    const bookmark = bookmarkForHash(sqlite, bookmarkId);
    if (!bookmark) throw new AgentContractError(`Bookmark ${bookmarkId} was not found`, 404);
    const currentHash = bookmarkContentHash(bookmark);
    if (currentHash !== contentHash) {
      throw new AgentContractError(`Bookmark ${bookmarkId} changed before enrichment was saved`, 409, {
        bookmark_id: bookmarkId,
        expected_content_hash: contentHash,
        current_content_hash: currentHash,
      });
    }
    const vector = embedding(item.embedding, `items[${index}].embedding`);
    return {
      bookmark_id: bookmarkId,
      content_hash: contentHash,
      status: item.status,
      summary: text(item.summary, `items[${index}].summary`, 4_000),
      topics_json: jsonValue(item.topics, `items[${index}].topics`, 16_000),
      entities_json: jsonValue(item.entities, `items[${index}].entities`, 32_000),
      link_text: text(item.link_text, `items[${index}].link_text`, 50_000),
      media_text: text(item.media_text, `items[${index}].media_text`, 20_000),
      embedding_model: vector?.model ?? null,
      embedding_dimensions: vector?.values.length ?? null,
      embedding_json: vector ? JSON.stringify(vector.values) : null,
      error_message: text(item.error_message, `items[${index}].error_message`, 1_000),
    };
  });
  const bookmarkIds = normalized.map((item) => item.bookmark_id);
  if (new Set(bookmarkIds).size !== bookmarkIds.length) {
    throw new AgentContractError('items may contain each bookmark_id only once');
  }
  const requestHash = requestFingerprint({
    agent_id: agentId,
    model: runModel,
    prompt_version: promptVersion,
    items: normalized,
  });
  if (dryRun) return { dry_run: true, library_revision: libraryRevision(sqlite), items: normalized };

  const existing = sqlite
    .prepare('SELECT id, kind, input_json FROM agent_runs WHERE idempotency_key = ?')
    .get(runKey) as { id: number; kind: string; input_json: string | null } | undefined;
  if (existing) {
    const recorded = recordedRequest(existing.input_json);
    if (existing.kind !== 'enrichment' || recorded?.request_hash !== requestHash) {
      throw new AgentContractError(
        'idempotency_key was already used for a different agent request',
        409,
        { idempotency_key: runKey },
      );
    }
    return {
      dry_run: false,
      idempotent_replay: true,
      run_id: existing.id,
      stored: Number(recorded.item_count ?? 0),
      bookmark_ids: Array.isArray(recorded.bookmark_ids) ? recorded.bookmark_ids : [],
    };
  }

  return sqlite.transaction(() => {
    const timestamp = Math.floor(Date.now() / 1_000);
    const run = sqlite
      .prepare(
        `INSERT INTO agent_runs
          (idempotency_key, kind, status, agent_id, model, prompt_version,
           library_revision, input_json, started_at, heartbeat_at, finished_at,
           created_at, updated_at)
         VALUES (?, 'enrichment', 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get(
        runKey,
        agentId,
        runModel,
        promptVersion,
        libraryRevision(sqlite),
        JSON.stringify({
          request_hash: requestHash,
          item_count: normalized.length,
          bookmark_ids: bookmarkIds,
        }),
        timestamp,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
      ) as { id: number };
    const upsert = sqlite.prepare(
      `INSERT INTO bookmark_enrichments
        (bookmark_id, agent_run_id, content_hash, status, summary, topics_json,
         entities_json, link_text, media_text, embedding_model, embedding_dimensions,
         embedding_json, model, prompt_version, error_message, processed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bookmark_id) DO UPDATE SET
         agent_run_id = excluded.agent_run_id,
         content_hash = excluded.content_hash,
         status = excluded.status,
         summary = excluded.summary,
         topics_json = excluded.topics_json,
         entities_json = excluded.entities_json,
         link_text = excluded.link_text,
         media_text = excluded.media_text,
         embedding_model = excluded.embedding_model,
         embedding_dimensions = excluded.embedding_dimensions,
         embedding_json = excluded.embedding_json,
         model = excluded.model,
         prompt_version = excluded.prompt_version,
         error_message = excluded.error_message,
         processed_at = excluded.processed_at,
         updated_at = excluded.updated_at`,
    );
    for (const item of normalized) {
      upsert.run(
        item.bookmark_id,
        run.id,
        item.content_hash,
        item.status,
        item.summary,
        item.topics_json,
        item.entities_json,
        item.link_text,
        item.media_text,
        item.embedding_model,
        item.embedding_dimensions,
        item.embedding_json,
        runModel,
        promptVersion,
        item.error_message,
        timestamp,
        timestamp,
        timestamp,
      );
    }
    return {
      dry_run: false,
      idempotent_replay: false,
      run_id: run.id,
      stored: normalized.length,
      bookmark_ids: bookmarkIds,
    };
  }).immediate();
}

function cosine(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function semanticSearch(sqlite: Database.Database, rawBody: unknown) {
  const body = strictObject(rawBody, 'body', [
    'embedding_model',
    'embedding',
    'limit',
    'min_score',
    'lexical_q',
    'lexical_weight',
    'filters',
  ]);
  const queryVector = embedding(
    { model: body.embedding_model, values: body.embedding },
    'query_embedding',
  );
  if (!queryVector) throw new AgentContractError('embedding and embedding_model are required');
  const limit = body.limit === undefined ? 25 : positiveId(body.limit, 'limit');
  if (limit > 100) throw new AgentContractError('limit must be between 1 and 100');
  const minimumScore = body.min_score === undefined ? -1 : Number(body.min_score);
  if (!Number.isFinite(minimumScore) || minimumScore < -1 || minimumScore > 1) {
    throw new AgentContractError('min_score must be between -1 and 1');
  }
  const lexicalQuery = text(body.lexical_q, 'lexical_q', 500);
  const lexicalWeight = body.lexical_weight === undefined ? 0.2 : Number(body.lexical_weight);
  if (!Number.isFinite(lexicalWeight) || lexicalWeight < 0 || lexicalWeight > 1) {
    throw new AgentContractError('lexical_weight must be between 0 and 1');
  }
  const filters = body.filters === undefined ? {} : object(body.filters, 'filters');
  for (const forbidden of ['q', 'limit', 'offset', 'sort']) {
    if (forbidden in filters) throw new AgentContractError(`filters.${forbidden} is controlled by semantic search`);
  }

  const eligible: { id: number; tweet_id: string }[] = [];
  let offset = 0;
  let revision: string | null = null;
  while (eligible.length < MAX_SEMANTIC_CANDIDATES) {
    const page = queryBookmarks(sqlite, {
      ...(filters as BookmarkQueryInput),
      limit: 100,
      offset,
      if_revision: revision ?? (filters.if_revision as unknown),
      sort: 'bookmark_order',
    });
    revision ??= page.meta.library_revision;
    if (page.meta.total > MAX_SEMANTIC_CANDIDATES) {
      throw new AgentContractError(
        `Semantic search matched ${page.meta.total} bookmarks, above the ${MAX_SEMANTIC_CANDIDATES}-candidate safety limit; narrow filters before retrying`,
        422,
        { eligible_total: page.meta.total, candidate_limit: MAX_SEMANTIC_CANDIDATES },
      );
    }
    eligible.push(...page.data.map((bookmark) => ({ id: bookmark.id, tweet_id: bookmark.tweet_id })));
    if (!page.meta.has_more) break;
    offset = page.meta.next_offset ?? offset + 100;
  }
  if (eligible.length === 0) {
    return { data: [], meta: { library_revision: revision, eligible: 0, embedded: 0 } };
  }

  const scores: { id: number; tweet_id: string; semantic_score: number }[] = [];
  for (let start = 0; start < eligible.length; start += 500) {
    const chunk = eligible.slice(start, start + 500);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = sqlite
      .prepare(
        `SELECT be.bookmark_id, be.embedding_json
         FROM bookmark_enrichments be
         WHERE be.bookmark_id IN (${placeholders})
           AND be.status = 'complete'
           AND be.embedding_model = ?
           AND be.embedding_dimensions = ?
           AND be.embedding_json IS NOT NULL`,
      )
      .all(...chunk.map((item) => item.id), queryVector.model, queryVector.values.length) as {
        bookmark_id: number;
        embedding_json: string;
      }[];
    const tweetIds = new Map(chunk.map((item) => [item.id, item.tweet_id]));
    for (const row of rows) {
      const stored = JSON.parse(row.embedding_json) as number[];
      const semanticScore = cosine(queryVector.values, stored);
      if (semanticScore >= minimumScore) {
        scores.push({
          id: row.bookmark_id,
          tweet_id: tweetIds.get(row.bookmark_id) ?? '',
          semantic_score: semanticScore,
        });
      }
    }
  }

  let lexicalMatches = new Set<string>();
  if (lexicalQuery && scores.length > 0) {
    for (let start = 0; start < scores.length; start += 100) {
      const chunk = scores.slice(start, start + 100);
      const result = queryBookmarks(sqlite, {
        q: lexicalQuery,
        match: 'any',
        tweet_ids: chunk.map((item) => item.tweet_id),
        status: 'all',
        limit: 100,
        if_revision: revision,
      });
      lexicalMatches = new Set([...lexicalMatches, ...result.data.map((bookmark) => bookmark.tweet_id)]);
    }
  }
  const ranked = scores
    .map((item) => ({
      ...item,
      lexical_match: lexicalMatches.has(item.tweet_id),
      hybrid_score:
        item.semantic_score * (1 - (lexicalQuery ? lexicalWeight : 0)) +
        (lexicalMatches.has(item.tweet_id) ? lexicalWeight : 0),
    }))
    .sort((left, right) => right.hybrid_score - left.hybrid_score)
    .slice(0, limit);
  if (ranked.length === 0) {
    return {
      data: [],
      meta: { library_revision: revision, eligible: eligible.length, embedded: 0 },
    };
  }
  const details = queryBookmarks(sqlite, {
    tweet_ids: ranked.map((item) => item.tweet_id),
    status: 'all',
    limit: ranked.length,
    if_revision: revision,
  });
  const byTweetId = new Map(details.data.map((bookmark) => [bookmark.tweet_id, bookmark]));
  return {
    data: ranked.map((item) => ({
      ...byTweetId.get(item.tweet_id),
      semantic_score: item.semantic_score,
      lexical_match: item.lexical_match,
      hybrid_score: item.hybrid_score,
      score_provenance: {
        method: lexicalQuery ? 'cosine_plus_lexical_match' : 'cosine',
        embedding_model: queryVector.model,
        dimensions: queryVector.values.length,
        lexical_weight: lexicalQuery ? lexicalWeight : 0,
      },
    })),
    meta: {
      library_revision: revision,
      eligible: eligible.length,
      embedded: scores.length,
      candidate_limit: MAX_SEMANTIC_CANDIDATES,
    },
  };
}
