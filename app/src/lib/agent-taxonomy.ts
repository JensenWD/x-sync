import type Database from 'better-sqlite3';
import { bookmarkContentHash, libraryRevision } from './bookmark-content';

const MAX_BATCH = 200;
const KINDS = new Set(['tag', 'folder']);
const OPERATIONS = new Set(['add', 'remove']);

type Kind = 'tag' | 'folder';
type Operation = 'add' | 'remove';

interface ProposalInput {
  bookmark_id?: unknown;
  kind?: unknown;
  operation?: unknown;
  target_id?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  content_hash?: unknown;
}

interface AssignmentRow {
  bookmark_id: number;
  kind: Kind;
  target_id: number;
  source: 'manual' | 'agent';
  agent_run_id: number | null;
  confidence: number | null;
  rationale: string | null;
  content_hash: string | null;
  created_at: number;
  updated_at: number;
}

export class AgentContractError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AgentContractError';
  }
}

function object(value: unknown, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentContractError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maximum: number, required = true) {
  if (value === undefined || value === null || value === '') {
    if (!required) return null;
    throw new AgentContractError(`${field} is required`);
  }
  if (typeof value !== 'string') throw new AgentContractError(`${field} must be a string`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new AgentContractError(`${field} must contain 1 to ${maximum} printable characters`);
  }
  return normalized;
}

function id(value: unknown, field: string) {
  if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new AgentContractError(`${field} must be a positive integer`);
  }
  return Number(value);
}

function boolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new AgentContractError('dry_run must be a boolean');
  return value;
}

function idList(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BATCH) {
    throw new AgentContractError(`${field} must contain between 1 and ${MAX_BATCH} IDs`);
  }
  return [...new Set(value.map((entry) => id(entry, field)))];
}

function currentBookmark(sqlite: Database.Database, bookmarkId: number) {
  return sqlite
    .prepare(
      `SELECT tweet_id, full_text, author_name, author_handle, tweet_url,
              media_urls, media_metadata, quoted_tweet
       FROM bookmarks WHERE id = ?`,
    )
    .get(bookmarkId) as
    | {
        tweet_id: string;
        full_text: string;
        author_name: string;
        author_handle: string;
        tweet_url: string;
        media_urls: string | null;
        media_metadata: string | null;
        quoted_tweet: string | null;
      }
    | undefined;
}

function target(sqlite: Database.Database, kind: Kind, targetId: number) {
  const table = kind === 'tag' ? 'tags' : 'folders';
  return sqlite.prepare(`SELECT id, name FROM ${table} WHERE id = ?`).get(targetId) as
    | { id: number; name: string }
    | undefined;
}

function associationExists(
  sqlite: Database.Database,
  kind: Kind,
  bookmarkId: number,
  targetId: number,
) {
  const table = kind === 'tag' ? 'bookmark_tags' : 'bookmark_folders';
  const targetColumn = kind === 'tag' ? 'tag_id' : 'folder_id';
  return Boolean(
    sqlite
      .prepare(`SELECT 1 FROM ${table} WHERE bookmark_id = ? AND ${targetColumn} = ?`)
      .get(bookmarkId, targetId),
  );
}

function assignment(
  sqlite: Database.Database,
  kind: Kind,
  bookmarkId: number,
  targetId: number,
) {
  return sqlite
    .prepare(
      `SELECT * FROM taxonomy_assignments
       WHERE bookmark_id = ? AND kind = ? AND target_id = ?`,
    )
    .get(bookmarkId, kind, targetId) as AssignmentRow | undefined;
}

function normalizeProposal(
  sqlite: Database.Database,
  value: unknown,
  index: number,
) {
  const input = object(value, `proposals[${index}]`) as ProposalInput;
  const bookmarkId = id(input.bookmark_id, `proposals[${index}].bookmark_id`);
  if (typeof input.kind !== 'string' || !KINDS.has(input.kind)) {
    throw new AgentContractError(`proposals[${index}].kind must be tag or folder`);
  }
  const kind = input.kind as Kind;
  if (typeof input.operation !== 'string' || !OPERATIONS.has(input.operation)) {
    throw new AgentContractError(`proposals[${index}].operation must be add or remove`);
  }
  const operation = input.operation as Operation;
  const targetId = id(input.target_id, `proposals[${index}].target_id`);
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new AgentContractError(`proposals[${index}].confidence must be between 0 and 1`);
  }
  const rationale = text(input.rationale, `proposals[${index}].rationale`, 1_000, false);
  const contentHash = text(input.content_hash, `proposals[${index}].content_hash`, 64)!;
  if (!/^[a-f0-9]{64}$/u.test(contentHash)) {
    throw new AgentContractError(`proposals[${index}].content_hash must be a SHA-256 hash`);
  }
  const bookmark = currentBookmark(sqlite, bookmarkId);
  if (!bookmark) throw new AgentContractError(`Bookmark ${bookmarkId} was not found`, 404);
  const currentHash = bookmarkContentHash(bookmark);
  if (currentHash !== contentHash) {
    throw new AgentContractError(
      `Bookmark ${bookmarkId} changed after it was classified`,
      409,
      { bookmark_id: bookmarkId, expected_content_hash: contentHash, current_content_hash: currentHash },
    );
  }
  const resolvedTarget = target(sqlite, kind, targetId);
  if (!resolvedTarget) {
    throw new AgentContractError(`${kind} ${targetId} was not found; agents may only use the controlled taxonomy`, 404);
  }
  return {
    bookmark_id: bookmarkId,
    kind,
    operation,
    target_id: targetId,
    target_name: resolvedTarget.name,
    confidence,
    rationale,
    content_hash: contentHash,
  };
}

function proposalRows(sqlite: Database.Database, runId: number) {
  return sqlite
    .prepare('SELECT * FROM taxonomy_proposals WHERE run_id = ? ORDER BY id')
    .all(runId);
}

export function createTaxonomyProposals(sqlite: Database.Database, rawBody: unknown) {
  const body = object(rawBody);
  const runKey = text(body.idempotency_key, 'idempotency_key', 100);
  const existing = sqlite
    .prepare('SELECT * FROM agent_runs WHERE idempotency_key = ?')
    .get(runKey) as { id: number } | undefined;
  if (existing) {
    return { idempotent_replay: true, run_id: existing.id, proposals: proposalRows(sqlite, existing.id) };
  }
  const agentId = text(body.agent_id, 'agent_id', 100);
  const model = text(body.model, 'model', 150, false);
  const promptVersion = text(body.prompt_version, 'prompt_version', 100, false);
  const taxonomyVersion = text(body.taxonomy_version, 'taxonomy_version', 100, false);
  const dryRun = boolean(body.dry_run, false);
  if (!Array.isArray(body.proposals) || body.proposals.length === 0 || body.proposals.length > MAX_BATCH) {
    throw new AgentContractError(`proposals must contain between 1 and ${MAX_BATCH} items`);
  }
  const normalized = body.proposals.map((proposal, index) =>
    normalizeProposal(sqlite, proposal, index),
  );
  if (dryRun) {
    return {
      dry_run: true,
      library_revision: libraryRevision(sqlite),
      proposals: normalized,
    };
  }

  return sqlite.transaction(() => {
    const timestamp = Math.floor(Date.now() / 1_000);
    const run = sqlite
      .prepare(
        `INSERT INTO agent_runs
          (idempotency_key, kind, status, agent_id, model, prompt_version,
           taxonomy_version, library_revision, input_json, proposed_count,
           started_at, heartbeat_at, finished_at, created_at, updated_at)
         VALUES (?, 'taxonomy', 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get(
        runKey,
        agentId,
        model,
        promptVersion,
        taxonomyVersion,
        libraryRevision(sqlite),
        JSON.stringify({ proposal_count: normalized.length }),
        normalized.length,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
      ) as { id: number };
    const insert = sqlite.prepare(
      `INSERT INTO taxonomy_proposals
        (run_id, idempotency_key, bookmark_id, kind, operation, target_id,
         target_name, confidence, rationale, content_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
    );
    for (const [index, proposal] of normalized.entries()) {
      insert.run(
        run.id,
        `${runKey}:${index}`,
        proposal.bookmark_id,
        proposal.kind,
        proposal.operation,
        proposal.target_id,
        proposal.target_name,
        proposal.confidence,
        proposal.rationale,
        proposal.content_hash,
        timestamp,
        timestamp,
      );
    }
    return { idempotent_replay: false, run_id: run.id, proposals: proposalRows(sqlite, run.id) };
  }).immediate();
}

export function listTaxonomyProposals(sqlite: Database.Database, params: URLSearchParams) {
  const allowed = new Set(['status', 'run_id', 'bookmark_id', 'limit', 'offset']);
  const unknown = [...params.keys()].find((key) => !allowed.has(key));
  if (unknown) throw new AgentContractError(`Unknown query parameter: ${unknown}`);
  const status = params.get('status') ?? 'proposed';
  if (!['proposed', 'approved', 'rejected', 'applied', 'all'].includes(status)) {
    throw new AgentContractError('status must be proposed, approved, rejected, applied, or all');
  }
  const limit = params.has('limit') ? id(params.get('limit'), 'limit') : 50;
  const offset = params.has('offset') ? Number(params.get('offset')) : 0;
  if (limit > 200 || !Number.isSafeInteger(offset) || offset < 0) {
    throw new AgentContractError('limit must be 1 to 200 and offset must be a non-negative integer');
  }
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (status !== 'all') {
    conditions.push('p.status = ?');
    values.push(status);
  }
  if (params.has('run_id')) {
    conditions.push('p.run_id = ?');
    values.push(id(params.get('run_id'), 'run_id'));
  }
  if (params.has('bookmark_id')) {
    conditions.push('p.bookmark_id = ?');
    values.push(id(params.get('bookmark_id'), 'bookmark_id'));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = (sqlite.prepare(`SELECT COUNT(*) AS count FROM taxonomy_proposals p ${where}`).get(...values) as { count: number }).count;
  const rows = sqlite
    .prepare(
      `SELECT p.*, r.agent_id, r.model, r.prompt_version, r.taxonomy_version
       FROM taxonomy_proposals p JOIN agent_runs r ON r.id = p.run_id
       ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...values, limit, offset);
  return { data: rows, meta: { total, limit, offset, has_more: offset + rows.length < total } };
}

export function reviewTaxonomyProposals(sqlite: Database.Database, rawBody: unknown) {
  const body = object(rawBody);
  const proposalIds = idList(body.proposal_ids, 'proposal_ids');
  if (body.status !== 'approved' && body.status !== 'rejected') {
    throw new AgentContractError('status must be approved or rejected');
  }
  const note = text(body.note, 'note', 500, false);
  const placeholders = proposalIds.map(() => '?').join(', ');
  return sqlite.transaction(() => {
    const rows = sqlite
      .prepare(`SELECT id, status FROM taxonomy_proposals WHERE id IN (${placeholders})`)
      .all(...proposalIds) as { id: number; status: string }[];
    if (rows.length !== proposalIds.length) throw new AgentContractError('One or more proposals were not found', 404);
    const invalid = rows.filter((row) => row.status !== 'proposed' && row.status !== body.status);
    if (invalid.length > 0) {
      throw new AgentContractError('Only proposed items can be reviewed', 409, invalid);
    }
    const timestamp = Math.floor(Date.now() / 1_000);
    sqlite
      .prepare(
        `UPDATE taxonomy_proposals SET status = ?, review_note = ?, reviewed_at = ?, updated_at = ?
         WHERE id IN (${placeholders})`,
      )
      .run(body.status, note, timestamp, timestamp, ...proposalIds);
    const runIds = sqlite
      .prepare(`SELECT DISTINCT run_id FROM taxonomy_proposals WHERE id IN (${placeholders})`)
      .all(...proposalIds) as { run_id: number }[];
    for (const run of runIds) {
      sqlite
        .prepare(
          `UPDATE agent_runs SET rejected_count = (
             SELECT COUNT(*) FROM taxonomy_proposals WHERE run_id = ? AND status = 'rejected'
           ), updated_at = ? WHERE id = ?`,
        )
        .run(run.run_id, timestamp, run.run_id);
    }
    return { status: body.status, proposal_ids: proposalIds };
  }).immediate();
}

function planProposal(sqlite: Database.Database, proposal: Record<string, unknown>) {
  const bookmarkId = Number(proposal.bookmark_id);
  const kind = proposal.kind as Kind;
  const targetId = Number(proposal.target_id);
  const bookmark = currentBookmark(sqlite, bookmarkId);
  if (!bookmark) return { proposal, blocked: 'bookmark_missing' };
  if (bookmarkContentHash(bookmark) !== proposal.content_hash) {
    return { proposal, blocked: 'content_changed' };
  }
  if (!target(sqlite, kind, targetId)) return { proposal, blocked: 'taxonomy_target_missing' };
  const currentAssignment = assignment(sqlite, kind, bookmarkId, targetId) ?? null;
  const association = associationExists(sqlite, kind, bookmarkId, targetId);
  if (proposal.operation === 'remove' && currentAssignment?.source !== 'agent') {
    return { proposal, blocked: 'manual_assignment_protected', association, assignment: currentAssignment };
  }
  return { proposal, blocked: null, association, assignment: currentAssignment };
}

function insertAssociation(sqlite: Database.Database, kind: Kind, bookmarkId: number, targetId: number) {
  const table = kind === 'tag' ? 'bookmark_tags' : 'bookmark_folders';
  const targetColumn = kind === 'tag' ? 'tag_id' : 'folder_id';
  sqlite
    .prepare(`INSERT OR IGNORE INTO ${table} (bookmark_id, ${targetColumn}) VALUES (?, ?) `)
    .run(bookmarkId, targetId);
}

function deleteAssociation(sqlite: Database.Database, kind: Kind, bookmarkId: number, targetId: number) {
  const table = kind === 'tag' ? 'bookmark_tags' : 'bookmark_folders';
  const targetColumn = kind === 'tag' ? 'tag_id' : 'folder_id';
  sqlite
    .prepare(`DELETE FROM ${table} WHERE bookmark_id = ? AND ${targetColumn} = ?`)
    .run(bookmarkId, targetId);
}

export function applyTaxonomyProposals(sqlite: Database.Database, rawBody: unknown) {
  const body = object(rawBody);
  const proposalIds = idList(body.proposal_ids, 'proposal_ids');
  const dryRun = boolean(body.dry_run, true);
  const placeholders = proposalIds.map(() => '?').join(', ');
  const proposals = sqlite
    .prepare(`SELECT * FROM taxonomy_proposals WHERE id IN (${placeholders}) ORDER BY id`)
    .all(...proposalIds) as Record<string, unknown>[];
  if (proposals.length !== proposalIds.length) throw new AgentContractError('One or more proposals were not found', 404);
  const unapproved = proposals.filter((proposal) => proposal.status !== 'approved');
  if (unapproved.length > 0) {
    throw new AgentContractError('Only approved proposals can be applied', 409, unapproved.map((row) => row.id));
  }
  const plan = proposals.map((proposal) => planProposal(sqlite, proposal));
  const blocked = plan.filter((item) => item.blocked);
  if (dryRun || blocked.length > 0) {
    return { dry_run: dryRun, can_apply: blocked.length === 0, plan };
  }

  return sqlite.transaction(() => {
    const timestamp = Math.floor(Date.now() / 1_000);
    for (const item of plan) {
      const proposal = item.proposal;
      const bookmarkId = Number(proposal.bookmark_id);
      const targetId = Number(proposal.target_id);
      const kind = proposal.kind as Kind;
      const before = JSON.stringify({ association: item.association, assignment: item.assignment });
      if (proposal.operation === 'add') {
        insertAssociation(sqlite, kind, bookmarkId, targetId);
        if (item.assignment?.source !== 'manual') {
          sqlite
            .prepare(
              `INSERT INTO taxonomy_assignments
                (bookmark_id, kind, target_id, source, agent_run_id, confidence, rationale,
                 content_hash, created_at, updated_at)
               VALUES (?, ?, ?, 'agent', ?, ?, ?, ?, ?, ?)
               ON CONFLICT(bookmark_id, kind, target_id) DO UPDATE SET
                 source = CASE WHEN taxonomy_assignments.source = 'manual' THEN 'manual' ELSE 'agent' END,
                 agent_run_id = CASE WHEN taxonomy_assignments.source = 'manual' THEN taxonomy_assignments.agent_run_id ELSE excluded.agent_run_id END,
                 confidence = CASE WHEN taxonomy_assignments.source = 'manual' THEN taxonomy_assignments.confidence ELSE excluded.confidence END,
                 rationale = CASE WHEN taxonomy_assignments.source = 'manual' THEN taxonomy_assignments.rationale ELSE excluded.rationale END,
                 content_hash = CASE WHEN taxonomy_assignments.source = 'manual' THEN taxonomy_assignments.content_hash ELSE excluded.content_hash END,
                 updated_at = excluded.updated_at`,
            )
            .run(
              bookmarkId,
              kind,
              targetId,
              proposal.run_id,
              proposal.confidence,
              proposal.rationale,
              proposal.content_hash,
              timestamp,
              timestamp,
            );
        }
      } else {
        deleteAssociation(sqlite, kind, bookmarkId, targetId);
        sqlite
          .prepare(
            `DELETE FROM taxonomy_assignments
             WHERE bookmark_id = ? AND kind = ? AND target_id = ? AND source = 'agent'`,
          )
          .run(bookmarkId, kind, targetId);
      }
      const afterAssignment = assignment(sqlite, kind, bookmarkId, targetId) ?? null;
      const after = JSON.stringify({
        association: associationExists(sqlite, kind, bookmarkId, targetId),
        assignment: afterAssignment,
      });
      sqlite
        .prepare(
          `INSERT INTO taxonomy_events
            (proposal_id, agent_run_id, bookmark_id, kind, target_id, operation,
             before_json, after_json, applied_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          proposal.id,
          proposal.run_id,
          bookmarkId,
          kind,
          targetId,
          proposal.operation,
          before,
          after,
          timestamp,
        );
      sqlite
        .prepare(
          `UPDATE taxonomy_proposals
           SET status = 'applied', applied_at = ?, updated_at = ? WHERE id = ?`,
        )
        .run(timestamp, timestamp, proposal.id);
    }
    const runIds = [...new Set(proposals.map((proposal) => Number(proposal.run_id)))];
    for (const runId of runIds) {
      sqlite
        .prepare(
          `UPDATE agent_runs SET applied_count = (
             SELECT COUNT(*) FROM taxonomy_proposals WHERE run_id = ? AND status = 'applied'
           ), updated_at = ? WHERE id = ?`,
        )
        .run(runId, timestamp, runId);
    }
    return { dry_run: false, applied: proposalIds.length, proposal_ids: proposalIds };
  }).immediate();
}

export function rollbackTaxonomyEvents(sqlite: Database.Database, rawBody: unknown) {
  const body = object(rawBody);
  const eventIds = idList(body.event_ids, 'event_ids');
  const dryRun = boolean(body.dry_run, true);
  const placeholders = eventIds.map(() => '?').join(', ');
  const events = sqlite
    .prepare(`SELECT * FROM taxonomy_events WHERE id IN (${placeholders}) ORDER BY id DESC`)
    .all(...eventIds) as Record<string, unknown>[];
  if (events.length !== eventIds.length) throw new AgentContractError('One or more events were not found', 404);
  const alreadyReverted = events.filter((event) => event.reverted_at !== null);
  if (alreadyReverted.length > 0) throw new AgentContractError('One or more events were already reverted', 409);
  if (dryRun) return { dry_run: true, can_rollback: true, events };

  return sqlite.transaction(() => {
    const timestamp = Math.floor(Date.now() / 1_000);
    for (const event of events) {
      const before = JSON.parse(String(event.before_json)) as {
        association: boolean;
        assignment: AssignmentRow | null;
      };
      const kind = event.kind as Kind;
      const bookmarkId = Number(event.bookmark_id);
      const targetId = Number(event.target_id);
      if (before.association) insertAssociation(sqlite, kind, bookmarkId, targetId);
      else deleteAssociation(sqlite, kind, bookmarkId, targetId);
      sqlite
        .prepare('DELETE FROM taxonomy_assignments WHERE bookmark_id = ? AND kind = ? AND target_id = ?')
        .run(bookmarkId, kind, targetId);
      if (before.assignment) {
        sqlite
          .prepare(
            `INSERT INTO taxonomy_assignments
              (bookmark_id, kind, target_id, source, agent_run_id, confidence, rationale,
               content_hash, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            before.assignment.bookmark_id,
            before.assignment.kind,
            before.assignment.target_id,
            before.assignment.source,
            before.assignment.agent_run_id,
            before.assignment.confidence,
            before.assignment.rationale,
            before.assignment.content_hash,
            before.assignment.created_at,
            timestamp,
          );
      }
      sqlite.prepare('UPDATE taxonomy_events SET reverted_at = ? WHERE id = ?').run(timestamp, event.id);
      if (event.proposal_id) {
        sqlite
          .prepare(
            `UPDATE taxonomy_proposals
             SET status = 'approved', applied_at = NULL, updated_at = ? WHERE id = ?`,
          )
          .run(timestamp, event.proposal_id);
      }
    }
    return { dry_run: false, rolled_back: eventIds.length, event_ids: eventIds };
  }).immediate();
}
