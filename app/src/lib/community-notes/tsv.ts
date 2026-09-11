import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import type {
  PublicCommunityNote,
  PublicCommunityNoteStatus,
  TrackedCommunityNoteIds,
} from './store';

function epochSeconds(value: string | undefined): number | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  const milliseconds = Number(value);
  return Number.isSafeInteger(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

function boolean(value: string | undefined): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

function fieldIndexes(header: string, required: string[]) {
  const columns = header.replace(/\r$/u, '').split('\t');
  const indexes = new Map(columns.map((name, index) => [name, index]));
  for (const field of required) {
    if (!indexes.has(field)) throw new Error(`Community Notes TSV is missing ${field}`);
  }
  return indexes;
}

async function readZipLines(path: string, onLine: (line: string, first: boolean) => void) {
  // `unzip -p` streams a multi-gigabyte TSV without holding the archive or its
  // decompressed contents in memory. Cache paths are generated internally.
  const child = spawn('unzip', ['-p', path], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-2000);
  });
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let first = true;
  for await (const line of lines) {
    onLine(line, first);
    first = false;
  }
  const code = await exit;
  if (code !== 0) throw new Error(`Could not read Community Notes ZIP: ${stderr || `exit ${code}`}`);
}

export async function readRelevantNotes(
  zipPaths: string[],
  tracked: TrackedCommunityNoteIds,
) {
  const notes = new Map<string, PublicCommunityNote>();
  for (const path of zipPaths) {
    let indexes: Map<string, number> | null = null;
    await readZipLines(path, (line, first) => {
      if (first) {
        indexes = fieldIndexes(line, [
          'noteId',
          'createdAtMillis',
          'tweetId',
          'classification',
          'trustworthySources',
          'summary',
          'isMediaNote',
        ]);
        return;
      }
      // Avoid allocating 24 fields for every row in the cumulative archive.
      const firstTab = line.indexOf('\t');
      if (firstTab === -1) return;
      const noteId = line.slice(0, firstTab);
      const secondTab = line.indexOf('\t', firstTab + 1);
      const thirdTab = secondTab === -1 ? -1 : line.indexOf('\t', secondTab + 1);
      const fourthTab = thirdTab === -1 ? -1 : line.indexOf('\t', thirdTab + 1);
      if (thirdTab === -1 || fourthTab === -1) return;
      const tweetId = line.slice(thirdTab + 1, fourthTab);
      if (!tracked.tweetIds.has(tweetId) && !tracked.matchedNoteIds.has(noteId)) return;

      const fields = line.replace(/\r$/u, '').split('\t');
      const at = (name: string) => fields[indexes?.get(name) ?? -1];
      const summary = at('summary');
      if (!/^\d{1,19}$/u.test(noteId) || !/^\d{1,19}$/u.test(tweetId) || !summary) return;
      notes.set(noteId, {
        noteId,
        tweetId,
        summary,
        classification: at('classification') || null,
        trustworthySources: boolean(at('trustworthySources')),
        isMediaNote: boolean(at('isMediaNote')) ?? false,
        isCollaborativeNote: boolean(at('isCollaborativeNote')) ?? false,
        createdAt: epochSeconds(at('createdAtMillis')),
      });
    });
  }
  return notes;
}

export async function readRelevantStatuses(
  zipPaths: string[],
  noteIds: Set<string>,
) {
  const statuses = new Map<string, PublicCommunityNoteStatus>();
  for (const path of zipPaths) {
    let indexes: Map<string, number> | null = null;
    await readZipLines(path, (line, first) => {
      if (first) {
        indexes = fieldIndexes(line, [
          'noteId',
          'timestampMillisOfCurrentStatus',
          'currentStatus',
        ]);
        return;
      }
      const firstTab = line.indexOf('\t');
      if (firstTab === -1) return;
      const noteId = line.slice(0, firstTab);
      if (!noteIds.has(noteId)) return;
      const fields = line.replace(/\r$/u, '').split('\t');
      const at = (name: string) => fields[indexes?.get(name) ?? -1];
      statuses.set(noteId, {
        currentStatus: at('currentStatus') || 'NEEDS_MORE_RATINGS',
        updatedAt: epochSeconds(at('timestampMillisOfCurrentStatus')),
      });
    });
  }
  return statuses;
}

// Kept exported for small fixture tests that do not need ZIP tooling.
export async function readTextLines(path: string) {
  const lines: string[] = [];
  const input = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of input) lines.push(line);
  return lines;
}
