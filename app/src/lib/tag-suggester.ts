import 'server-only';
import natural from 'natural';
import { rawDb } from './db/client';

// =============================================================================
// TUNING GUIDE — read this before changing thresholds.
// =============================================================================
// Suggestions are produced by per-tag "signatures": discriminative terms (TF-IDF-
// style lift against the full bookmark corpus) plus a set of authors who've
// historically been tagged. A tag is suggested when a candidate bookmark
// crosses an evidence gate (see MIN_TERM_HITS).
//
// When the user reports problems, map the complaint to the right knob:
//
//   "Suggesting <tag> on tweets that aren't about <tag>" (false positives,
//      especially on a small/young tag) ─────────────────────────────────────
//      → Raise MIN_EXAMPLES (small corpora produce flaky signatures).
//      → Raise MIN_TERM_HITS to 3 (force more independent term agreement).
//      → Raise MIN_LIFT (demand more discrimination per term).
//      → Lower MAX_GLOBAL_DOC_FREQ (kill common English words from signals).
//      → Add the offending words to STOPWORDS_EXTRA below if they're generic
//        English/tweet noise the global cap doesn't catch.
//
//   "Suggesting <tag> way too often" (e.g. >40% of cards get the same tag) ──
//      → Raise MIN_TERM_HITS or MIN_TERM_TAG_RATE.
//      → Lower MAX_SUGGESTIONS only as a last resort — that hides good
//        suggestions instead of making them more accurate.
//      → Sanity-check: the tag's training set may itself be over-broad. Look
//        at what the user has manually tagged; if it spans many topics, that's
//        a corpus problem not an algorithm problem.
//
//   "Not suggesting <tag> when it obviously applies" (false negatives) ─────
//      → Lower MIN_LIFT (3.0 → 2.5) so weaker terms count.
//      → Raise MAX_GLOBAL_DOC_FREQ (0.10 → 0.15) to admit more terms.
//      → Lower MIN_TERM_TAG_RATE (0.15 → 0.10) for diverse tags like "tech".
//      → Last resort: drop MIN_TERM_HITS to 1 — but expect more false
//        positives. Prefer keeping it at 2.
//
//   "Not suggesting any tag at all" ────────────────────────────────────────
//      → Check the manual-tag corpus: tags need ≥ MIN_EXAMPLES bookmarks each
//        before they enter the signature map at all.
//      → If MIN_EXAMPLES feels too high for a personal user, dropping to 4
//        is reasonable — but expect more noise from tags with thin training.
//
//   "Suggestions stale after I added more tags" ───────────────────────────
//      → Not a tuning issue. The cache invalidates automatically via the
//        manual-tag signature (count + maxRowid) — see getSignatures().
//
//   "Want to suggest existing tags I haven't applied yet" ─────────────────
//      → That's exactly the current behaviour. existing_tag_names is filtered
//        out per-bookmark in suggestTagsForMany().
//
// To explore signatures interactively, write a one-off Node script that
// imports suggestTagsForMany and inspects the results. There used to be a
// scripts/probe-suggestions.ts; recreate it if you need it.
// =============================================================================

// [TUNE: false positives ↑, false negatives ↓] Minimum manual examples for a
// tag to be eligible for suggestions. Lower than the classifier's threshold
// (the user clicks to accept), but still high enough that a tag's signal set
// is statistically meaningful. Tags below this threshold are ignored entirely.
const MIN_EXAMPLES = 5;

// [TUNE: ↑ for noisier corpora] Term must appear in at least this many of a
// tag's bookmarks to count as signal. Prevents a single training tweet from
// dictating suggestions. Acts as an absolute floor under MIN_TERM_TAG_RATE.
const MIN_TERM_OCCURRENCES = 2;

// [TUNE: ↑ for fewer false positives, ↓ for fewer false negatives] Term must
// be at least this much more frequent inside the tag's corpus than in the
// full bookmark corpus (per-bookmark rate ratio) to count as discriminative
// signal. Lift is computed against ALL bookmarks (not just other manually-
// tagged ones) so common English words don't accidentally look distinctive
// when the manual-tag corpus is small.
const MIN_LIFT = 3.0;

// [TUNE: ↓ to kill more common-word noise] A term that appears in more than
// this fraction of the full bookmark corpus is too common to be useful signal
// regardless of its lift inside any one tag. Catches words like "should",
// "want", "here" that show up everywhere. Computed dynamically against the
// active-bookmarks count so it scales with corpus growth.
const MAX_GLOBAL_DOC_FREQ = 0.1;

// [TUNE: ↑ for stricter tags, ↓ for diverse tags like "tech"] On top of the
// absolute MIN_TERM_OCCURRENCES floor, require terms to occupy at least this
// fraction of the tag's own bookmarks. Keeps small-corpus tags from being
// defined by accidents (a single tweet contributing 50% of "signal"). Kept
// gentle (0.15) so topically-diverse tags still produce signal.
const MIN_TERM_TAG_RATE = 0.15;

// [TUNE: cosmetic — rarely the right knob] Cap suggestions per bookmark so
// cards stay clean. Lowering this hides good suggestions; prefer fixing
// noise at the source via the thresholds above.
const MAX_SUGGESTIONS = 3;

// [TUNE: the most impactful knob — ↑ stricter, ↓ more eager] A tag is only
// suggested when (a) at least this many distinct signal terms match, or
// (b) one term matches AND the author is part of the tag's author set.
// Using absolute hit counts (rather than a normalised score) is what stops
// small-corpus tags from being falsely confident on a single coincidental
// word. Author-only matches are intentionally not enough — otherwise every
// tweet from a frequently-tagged handle would inherit every tag they've had.
const MIN_TERM_HITS = 2;

// Combine `natural`'s English stopword list with tweet/web noise that's
// unhelpful for topic discrimination. natural's set is hidden behind
// `(natural as unknown as { stopwords: string[] }).stopwords`.
const NATURAL_STOPWORDS = (natural as unknown as { stopwords: string[] }).stopwords ?? [];
const STOPWORDS = new Set<string>([
  ...NATURAL_STOPWORDS,
  // Common English words natural's list misses
  'without', 'going', 'getting', 'taking', 'telling', 'asking', 'looking',
  'using', 'trying', 'making', 'said', 'saying', 'says', 'thing', 'things',
  'really', 'actually', 'something', 'someone', 'anyone', 'everyone',
  'everything', 'anything', 'nothing', 'every', 'always', 'never', 'often',
  'just', 'even', 'still', 'maybe', 'probably', 'thats', 'theres', 'youre',
  'dont', 'doesnt', 'didnt', 'wont', 'cant', 'isnt', 'wasnt', 'arent',
  'going', 'gonna', 'wanna', 'havent', 'hasnt', 'shouldnt', 'wouldnt', 'couldnt',
  'good', 'great', 'best', 'better', 'bad', 'worse', 'big', 'small', 'new', 'old',
  'first', 'last', 'next', 'long', 'high', 'low', 'right', 'left',
  'simple', 'easy', 'hard', 'help', 'want', 'need', 'know', 'think', 'thinking',
  'see', 'look', 'come', 'came', 'goes', 'went', 'gone', 'put', 'let',
  'day', 'days', 'time', 'times', 'year', 'years', 'today', 'tomorrow',
  'yesterday', 'week', 'weeks', 'month', 'months', 'now', 'soon', 'later',
  'people', 'person', 'guys', 'folks', 'man', 'woman', 'guy',
  'world', 'life', 'lives', 'work', 'home', 'place', 'thing', 'stuff',
  // Tweet/web junk
  'http', 'https', 'com', 'www', 'twitter', 'rt', 'amp', 'via',
]);

interface TagSignature {
  tag: string;
  examples: number;
  // Term -> weight (lift, capped). Weights make terms with stronger lift count
  // for more in the score.
  terms: Map<string, number>;
  authors: Set<string>;
  // Sum of all term weights — used to normalise the score so tags with bigger
  // signal sets don't auto-dominate.
  signalMass: number;
}

interface TrainingRow {
  bookmark_id: number;
  full_text: string;
  author_handle: string;
  quoted_tweet: string | null;
  tag_name: string;
}

interface CachedSignatures {
  byTag: Map<string, TagSignature>;
  signature: { count: number; maxRowid: number };
}

let cached: CachedSignatures | null = null;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9@#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function buildText(fullText: string, quotedTweet: string | null): string {
  let text = fullText;
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

function getCorpusSignature(): { count: number; maxRowid: number } {
  const row = rawDb
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(MAX(rowid), 0) AS max_rowid
       FROM bookmark_tags
       WHERE source = 'manual'`,
    )
    .get() as { count: number; max_rowid: number };
  return { count: row.count, maxRowid: row.max_rowid };
}

function buildSignatures(): CachedSignatures {
  const sig = getCorpusSignature();

  // Global doc-frequency baseline computed over EVERY active bookmark, not just
  // the manually-tagged subset. Without this, common English words ("should",
  // "want", "here") look distinctive purely because the manual-tag corpus is
  // tiny — they only need to appear in 1–2 of a small tag's bookmarks to clear
  // a permissive lift threshold computed against an even smaller "outside" set.
  interface CorpusRow {
    id: number;
    full_text: string;
    quoted_tweet: string | null;
  }
  const corpus = rawDb
    .prepare(
      `SELECT id, full_text, quoted_tweet
       FROM bookmarks
       WHERE archived_at IS NULL`,
    )
    .all() as CorpusRow[];

  const globalDocFreq = new Map<string, number>();
  for (const row of corpus) {
    const seen = new Set<string>();
    for (const term of tokenize(buildText(row.full_text, row.quoted_tweet))) {
      if (seen.has(term)) continue;
      seen.add(term);
      globalDocFreq.set(term, (globalDocFreq.get(term) ?? 0) + 1);
    }
  }
  const totalDocs = corpus.length || 1;
  const maxAllowedDf = Math.floor(totalDocs * MAX_GLOBAL_DOC_FREQ);

  const rows = rawDb
    .prepare(
      `SELECT bt.bookmark_id, b.full_text, b.author_handle, b.quoted_tweet, t.name AS tag_name
       FROM bookmark_tags bt
       JOIN bookmarks b ON b.id = bt.bookmark_id
       JOIN tags t ON t.id = bt.tag_id
       WHERE bt.source = 'manual'`,
    )
    .all() as TrainingRow[];

  // Group by tag — same bookmark may appear in multiple tags' groups.
  const byTagRows = new Map<string, TrainingRow[]>();
  for (const row of rows) {
    const list = byTagRows.get(row.tag_name) ?? [];
    list.push(row);
    byTagRows.set(row.tag_name, list);
  }

  const byTag = new Map<string, TagSignature>();

  for (const [tag, tagRows] of byTagRows) {
    const examples = tagRows.length;
    if (examples < MIN_EXAMPLES) continue;

    const tagBookmarkIds = new Set(tagRows.map((r) => r.bookmark_id));
    const inTagTermBookmarks = new Map<string, Set<number>>();
    const authors = new Set<string>();

    for (const row of tagRows) {
      authors.add(row.author_handle.toLowerCase());
      const seen = new Set<string>();
      for (const term of tokenize(buildText(row.full_text, row.quoted_tweet))) {
        if (seen.has(term)) continue;
        seen.add(term);
        const bucket = inTagTermBookmarks.get(term) ?? new Set<number>();
        bucket.add(row.bookmark_id);
        inTagTermBookmarks.set(term, bucket);
      }
    }

    const minTermHitsForTag = Math.max(
      MIN_TERM_OCCURRENCES,
      Math.ceil(examples * MIN_TERM_TAG_RATE),
    );

    const terms = new Map<string, number>();
    let signalMass = 0;
    for (const [term, inSet] of inTagTermBookmarks) {
      if (inSet.size < minTermHitsForTag) continue;
      const globalDf = globalDocFreq.get(term) ?? 0;
      // Hard cap: too-common terms can never be tag signal.
      if (globalDf > maxAllowedDf) continue;

      const inRate = inSet.size / tagBookmarkIds.size;
      // Outside-tag rate uses the full corpus minus this tag's bookmarks.
      const outsideCount = globalDf - inSet.size;
      const outsideTotal = totalDocs - tagBookmarkIds.size;
      const outRate = outsideTotal > 0 ? (outsideCount + 0.5) / (outsideTotal + 1) : 1;
      const lift = inRate / outRate;
      if (lift < MIN_LIFT) continue;
      const weight = Math.min(lift, 5);
      terms.set(term, weight);
      signalMass += weight;
    }

    if (terms.size === 0 && authors.size === 0) continue;

    byTag.set(tag, { tag, examples, terms, authors, signalMass });
  }

  return { byTag, signature: sig };
}

function getSignatures(): CachedSignatures {
  const sig = getCorpusSignature();
  if (cached && cached.signature.count === sig.count && cached.signature.maxRowid === sig.maxRowid) {
    return cached;
  }
  cached = buildSignatures();
  return cached;
}

interface SuggestionInput {
  id: number;
  full_text: string;
  author_handle: string;
  quoted_tweet: string | null;
  existing_tag_names: Set<string>;
}

export function suggestTagsForMany(inputs: SuggestionInput[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (inputs.length === 0) return result;

  const { byTag } = getSignatures();
  if (byTag.size === 0) return result;

  for (const input of inputs) {
    const text = buildText(input.full_text, input.quoted_tweet);
    const tokens = new Set(tokenize(text));
    const handle = input.author_handle.toLowerCase();
    if (tokens.size === 0 && !handle) continue;

    const scored: Array<{ tag: string; score: number }> = [];
    for (const sig of byTag.values()) {
      if (input.existing_tag_names.has(sig.tag)) continue;

      let weightedHit = 0;
      let termHits = 0;
      for (const [term, weight] of sig.terms) {
        if (tokens.has(term)) {
          weightedHit += weight;
          termHits++;
        }
      }
      const authorMatch = sig.authors.has(handle);

      // Hard gate on absolute evidence — either two distinct content matches,
      // or one content match plus a known-from-this-tag author. Author alone
      // is intentionally not enough; otherwise any tweet from a frequently-
      // tagged handle would inherit every tag that handle has ever had.
      const passes =
        termHits >= MIN_TERM_HITS || (termHits >= 1 && authorMatch);
      if (!passes) continue;

      // Score breaks ties for the top-N cap; the actual decision was the gate.
      const score = weightedHit + (authorMatch ? 1 : 0);
      scored.push({ tag: sig.tag, score });
    }

    if (scored.length === 0) continue;
    scored.sort((a, b) => b.score - a.score);
    result.set(
      input.id,
      scored.slice(0, MAX_SUGGESTIONS).map((s) => s.tag),
    );
  }

  return result;
}
