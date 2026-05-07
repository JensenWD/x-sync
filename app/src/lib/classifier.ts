import 'server-only';
import natural from 'natural';
import fs from 'fs';
import path from 'path';
import { rawDb } from './db/client';

const MIN_TRAINING_EXAMPLES = 15;
const CONFIDENCE_THRESHOLD = 0.7;
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

  if (activeTags.length === 0) return null;

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

  if (classifications.length === 0) return [];

  // natural returns log probabilities; convert to relative confidence
  const maxVal = classifications[0].value;
  const results: ClassificationResult[] = [];

  for (const c of classifications) {
    const confidence = Math.exp(c.value - maxVal);
    if (confidence >= CONFIDENCE_THRESHOLD) {
      results.push({ tag: c.label, confidence });
    }
  }

  return results;
}

interface AutoTagResult {
  taggedCount: number;
  skippedCount: number;
  activeTags: string[];
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
      // Apply top 2 tags max
      for (const result of results.slice(0, 2)) {
        const tagRow = getOrCreateTag.get(result.tag) as { id: number };
        insertAutoTag.run(bookmark.id, tagRow.id);
      }
      taggedCount++;
    }
  });

  applyTags();

  return { taggedCount, skippedCount, activeTags: model.activeTags };
}
