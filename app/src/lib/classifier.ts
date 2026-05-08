import 'server-only';
import natural from 'natural';
import fs from 'fs';
import path from 'path';
import { rawDb } from './db/client';

// =============================================================================
// TUNING GUIDE — read this before changing thresholds.
// =============================================================================
// This is the AUTO-APPLY classifier (it writes rows to bookmark_tags with
// source='auto'). Mistakes here are user-visible and can be expensive to clean
// up — historical incident: with only one active class the previous "relative
// confidence" math always returned 1.0 and stamped `ai` on 862 bookmarks.
//
// For lower-stakes click-to-add suggestions, see lib/tag-suggester.ts.
//
// When the user reports problems, map the complaint to the right knob:
//
//   "Auto-tagger applied <tag> to a huge number of unrelated bookmarks" ────
//      → This is the runaway-labeller failure mode. MAX_TAG_SHARE should
//        have caught it; check why it didn't (e.g. share threshold too high).
//        Lower MAX_TAG_SHARE (0.30 → 0.20) for stricter blast-radius limits.
//      → Raise MIN_POSTERIOR (0.60 → 0.70) so the model has to be more
//        confident before applying anything.
//      → Raise MIN_MARGIN (1.5 → 2.0) so near-ties stay unapplied.
//      → To revert: DELETE FROM bookmark_tags WHERE source='auto'. Manual
//        tags (source='manual') are never touched by this code.
//
//   "Auto-tagger isn't tagging anything anymore" ─────────────────────────
//      → Check the manual-tag corpus: need ≥ MIN_ACTIVE_TAGS tags with
//        ≥ MIN_TRAINING_EXAMPLES manual examples each. Below that, the
//        classifier intentionally refuses to run (single-class degeneracy).
//      → If a recent training set is small but the user wants more eager
//        behaviour, lower MIN_TRAINING_EXAMPLES or MIN_POSTERIOR — but
//        understand the trade-off before doing so.
//
//   "Auto-tagger applied wrong tag to one specific bookmark" ─────────────
//      → Single-bookmark errors usually mean the model is genuinely confused
//        between two close classes. Raise MIN_MARGIN.
//      → If the user expects tag X but got tag Y, the corpus probably needs
//        more X examples — this isn't a tuning issue.
//
//   "Want auto-tagger to suggest, not apply" ─────────────────────────────
//      → That's exactly what lib/tag-suggester.ts does. Do not lower the
//        gates here to make this classifier "advisory" — it would still
//        write rows. Use the suggester instead.
//
//   "MIN_TRAINING_EXAMPLES feels too high" ───────────────────────────────
//      → This is the load-bearing safeguard. The previous value was 15 and
//        the runaway incident happened when one tag crossed it. 20 is a
//        reasonable floor for a personal corpus. Don't drop below 15.
//
//   "Bumped MIN_TRAINING_EXAMPLES — will this fix the runaway?" ──────────
//      → No. The runaway happens when ONE tag is the only one above the
//        threshold (single-class degeneracy). MIN_ACTIVE_TAGS=2 is the
//        actual fix — never remove that gate.
// =============================================================================

// [TUNE: ↑ for stricter] Per-tag manual examples needed to enter the active
// set. Don't drop below 15; see "Bumped MIN_TRAINING_EXAMPLES" above.
const MIN_TRAINING_EXAMPLES = 20;

// [DO NOT REMOVE] A Bayes classifier with a single class is degenerate — the
// relative confidence is always 1.0 and every input gets stamped with that one
// label. Refuse to train (and refuse to classify) until the user has built up
// at least two distinct tag corpora to discriminate between. This is the
// load-bearing fix for the historical "tagged everything as ai" incident.
const MIN_ACTIVE_TAGS = 2;

// [TUNE: ↑ for stricter, ↓ for more eager] Minimum absolute softmax posterior
// for the top class. Anything below this is considered "the model has no
// opinion" and the bookmark is left untagged. Computed via softmax over all
// class log-likelihoods — do NOT replace with the previous "relative to top
// class" math which always rounded to 1.0.
const MIN_POSTERIOR = 0.6;

// [TUNE: ↑ for stricter on near-ties] Top class must be at least this many
// times more probable than the runner-up. Catches cases where two tags are
// nearly tied and the model is really guessing.
const MIN_MARGIN = 1.5;

// [TUNE: ↓ for tighter blast-radius limits] Safety valve: if a single tag
// would be applied to more than this fraction of the candidate pool in one
// run, abort the entire run and return { aborted: { ... } }. The most common
// cause is a skewed training set (one tag dominates) producing a runaway
// labeller. This is the second line of defence after MIN_ACTIVE_TAGS.
const MAX_TAG_SHARE = 0.3;

const MODEL_PATH = path.join(process.cwd(), 'data', 'classifier.json');

interface TrainingRow {
  full_text: string;
  author_handle: string;
  quoted_tweet: string | null;
  tag_name: string;
}

interface ClassificationResult {
  tag: string;
  confidence: number;
}

// Identifies a training corpus by manual-tag count + max rowid. Two corpora with
// the same signature are guaranteed to produce the same model, so we can skip
// retraining when nothing's changed.
interface TrainingSignature {
  count: number;
  maxRowid: number;
}

interface CachedModel {
  classifier: natural.BayesClassifier;
  activeTags: string[];
  signature: TrainingSignature;
}

let cachedModel: CachedModel | null = null;

function buildInputText(fullText: string, authorHandle: string, quotedTweet: string | null): string {
  let text = `${fullText} @${authorHandle}`;
  if (quotedTweet) {
    try {
      const qt = JSON.parse(quotedTweet);
      if (qt.full_text) text += ` ${qt.full_text}`;
    } catch {
      // ignore malformed quoted tweet JSON
    }
  }
  return text;
}

function getTrainingSignature(): TrainingSignature {
  const row = rawDb
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(MAX(rowid), 0) AS max_rowid
       FROM bookmark_tags
       WHERE source = 'manual'`,
    )
    .get() as { count: number; max_rowid: number };
  return { count: row.count, maxRowid: row.max_rowid };
}

function loadModelFromDisk(): { classifier: natural.BayesClassifier; activeTags: string[] } | null {
  if (!fs.existsSync(MODEL_PATH)) return null;
  try {
    const raw = fs.readFileSync(MODEL_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const classifier = natural.BayesClassifier.restore(parsed.model ?? parsed);
    const activeTags: string[] = parsed.activeTags ?? [];
    return { classifier, activeTags };
  } catch {
    return null;
  }
}

function saveModelToDisk(classifier: natural.BayesClassifier, activeTags: string[]): void {
  const dir = path.dirname(MODEL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    MODEL_PATH,
    JSON.stringify({ model: classifier, activeTags }),
  );
}

function trainClassifier(signature: TrainingSignature): CachedModel | null {
  const rows = rawDb
    .prepare(
      `SELECT b.full_text, b.author_handle, b.quoted_tweet, t.name as tag_name
       FROM bookmark_tags bt
       JOIN bookmarks b ON b.id = bt.bookmark_id
       JOIN tags t ON t.id = bt.tag_id
       WHERE bt.source = 'manual'`,
    )
    .all() as TrainingRow[];

  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    tagCounts.set(row.tag_name, (tagCounts.get(row.tag_name) ?? 0) + 1);
  }

  const activeTags = [...tagCounts.entries()]
    .filter(([, count]) => count >= MIN_TRAINING_EXAMPLES)
    .map(([name]) => name);

  if (activeTags.length < MIN_ACTIVE_TAGS) return null;

  const activeSet = new Set(activeTags);
  const classifier = new natural.BayesClassifier();

  for (const row of rows) {
    if (!activeSet.has(row.tag_name)) continue;
    const text = buildInputText(row.full_text, row.author_handle, row.quoted_tweet);
    classifier.addDocument(text, row.tag_name);
  }

  classifier.train();
  saveModelToDisk(classifier, activeTags);

  return { classifier, activeTags, signature };
}

// Returns a trained model, retraining only if the manual-tag corpus has changed
// since the last cached training. On cold start, hydrates from disk if present.
function getModel(): CachedModel | null {
  const signature = getTrainingSignature();

  if (
    cachedModel &&
    cachedModel.signature.count === signature.count &&
    cachedModel.signature.maxRowid === signature.maxRowid
  ) {
    return cachedModel;
  }

  // Try disk cache before retraining (e.g. after a server restart with no new tags)
  if (!cachedModel) {
    const disk = loadModelFromDisk();
    if (disk) {
      cachedModel = { ...disk, signature };
      // Don't return yet — if signature has moved on, we still need to retrain
    }
  }

  if (
    cachedModel &&
    cachedModel.signature.count === signature.count &&
    cachedModel.signature.maxRowid === signature.maxRowid
  ) {
    return cachedModel;
  }

  cachedModel = trainClassifier(signature);
  return cachedModel;
}

function classifyWith(
  classifier: natural.BayesClassifier,
  fullText: string,
  authorHandle: string,
  quotedTweet: string | null,
): ClassificationResult[] {
  const text = buildInputText(fullText, authorHandle, quotedTweet);
  const classifications = classifier.getClassifications(text) as Array<{
    label: string;
    value: number;
  }>;

  if (classifications.length < 2) return [];

  // natural returns raw log-likelihoods. Normalise to a proper posterior via
  // softmax so we can apply an *absolute* threshold (the previous "relative to
  // top class" approach made the top class always score 1.0).
  const maxVal = classifications[0].value;
  let denom = 0;
  const expScores = classifications.map((c) => {
    const e = Math.exp(c.value - maxVal);
    denom += e;
    return e;
  });

  const top = { label: classifications[0].label, posterior: expScores[0] / denom };
  const second = { posterior: expScores[1] / denom };

  if (top.posterior < MIN_POSTERIOR) return [];
  if (second.posterior > 0 && top.posterior / second.posterior < MIN_MARGIN) return [];

  return [{ tag: top.label, confidence: top.posterior }];
}

interface AutoTagResult {
  taggedCount: number;
  skippedCount: number;
  activeTags: string[];
  aborted?: { reason: string; tag: string; share: number };
}

export function runAutoTag(bookmarkIds?: number[]): AutoTagResult {
  const model = getModel();

  if (!model) {
    return { taggedCount: 0, skippedCount: 0, activeTags: [] };
  }

  // Find bookmarks that have no manual tags (candidates for auto-tagging)
  let candidates: Array<{
    id: number;
    full_text: string;
    author_handle: string;
    quoted_tweet: string | null;
  }>;

  if (bookmarkIds && bookmarkIds.length > 0) {
    const placeholders = bookmarkIds.map(() => '?').join(',');
    candidates = rawDb
      .prepare(
        `SELECT b.id, b.full_text, b.author_handle, b.quoted_tweet
         FROM bookmarks b
         WHERE b.id IN (${placeholders})
           AND NOT EXISTS (
             SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id AND bt.source = 'manual'
           )`,
      )
      .all(...bookmarkIds) as typeof candidates;
  } else {
    candidates = rawDb
      .prepare(
        `SELECT b.id, b.full_text, b.author_handle, b.quoted_tweet
         FROM bookmarks b
         WHERE NOT EXISTS (
           SELECT 1 FROM bookmark_tags bt WHERE bt.bookmark_id = b.id AND bt.source = 'manual'
         )`,
      )
      .all() as typeof candidates;
  }

  if (candidates.length === 0) {
    return { taggedCount: 0, skippedCount: 0, activeTags: model.activeTags };
  }

  // Pre-classify outside the write transaction so we don't hold the SQLite lock
  // while doing CPU-bound Bayesian work.
  const decisions = candidates.map((bookmark) => ({
    bookmark,
    results: classifyWith(
      model.classifier,
      bookmark.full_text,
      bookmark.author_handle,
      bookmark.quoted_tweet,
    ),
  }));

  // Blast-radius guard: if a single tag would land on more than MAX_TAG_SHARE of
  // candidates, the model is almost certainly mis-calibrated (e.g. one tag's
  // training set dominates the others). Refuse to apply anything and report
  // back so the user can decide what to do.
  const proposedCounts = new Map<string, number>();
  for (const { results } of decisions) {
    for (const r of results) {
      proposedCounts.set(r.tag, (proposedCounts.get(r.tag) ?? 0) + 1);
    }
  }
  for (const [tag, count] of proposedCounts) {
    const share = count / candidates.length;
    if (share > MAX_TAG_SHARE) {
      return {
        taggedCount: 0,
        skippedCount: 0,
        activeTags: model.activeTags,
        aborted: {
          reason: `tag "${tag}" would be applied to ${(share * 100).toFixed(0)}% of candidates (limit ${MAX_TAG_SHARE * 100}%)`,
          tag,
          share,
        },
      };
    }
  }

  const getOrCreateTag = rawDb.prepare(
    `INSERT INTO tags (name, created_at) VALUES (?, unixepoch())
     ON CONFLICT(name) DO UPDATE SET name = excluded.name
     RETURNING id`,
  );

  const insertAutoTag = rawDb.prepare(
    `INSERT INTO bookmark_tags (bookmark_id, tag_id, source) VALUES (?, ?, 'auto')
     ON CONFLICT(bookmark_id, tag_id) DO NOTHING`,
  );

  const clearAutoTags = rawDb.prepare(
    `DELETE FROM bookmark_tags WHERE bookmark_id = ? AND source = 'auto'`,
  );

  let taggedCount = 0;
  let skippedCount = 0;

  const applyTags = rawDb.transaction(() => {
    for (const { bookmark, results } of decisions) {
      if (results.length === 0) {
        skippedCount++;
        continue;
      }
      clearAutoTags.run(bookmark.id);
      for (const result of results) {
        const tagRow = getOrCreateTag.get(result.tag) as { id: number };
        insertAutoTag.run(bookmark.id, tagRow.id);
      }
      taggedCount++;
    }
  });

  applyTags();

  return { taggedCount, skippedCount, activeTags: model.activeTags };
}
