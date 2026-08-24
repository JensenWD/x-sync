import assert from 'node:assert/strict';
import test from 'node:test';
import { stripAttachmentLinks } from '../src/lib/dashboard-bookmark';
import { ftsPrefixQuery, searchTokens } from '../src/lib/search-tokens';
import { normalizeHandle } from '../src/lib/x-handle';
import { compactCount } from '../src/lib/utils';
import type { PostLink } from '../src/types';

function link(url: string, kind: PostLink['kind']): PostLink {
  return { url, expanded_url: null, display_url: null, title: null, description: null, kind };
}

test('drops the shortlinks X appends for its own media and quote', () => {
  const text = 'the whole point https://t.co/real https://t.co/pic https://t.co/quote';
  const stripped = stripAttachmentLinks(text, [
    link('https://t.co/real', 'link'),
    link('https://t.co/pic', 'media'),
    link('https://t.co/quote', 'quote'),
  ]);

  assert.equal(stripped, 'the whole point https://t.co/real');
});

test('collapses the whitespace a dropped shortlink leaves behind', () => {
  const stripped = stripAttachmentLinks('first line\n\nhttps://t.co/pic', [
    link('https://t.co/pic', 'media'),
  ]);

  assert.equal(stripped, 'first line');
});

test('leaves a post with no entities exactly as X sent it', () => {
  const text = 'nothing to strip https://t.co/unknown';
  assert.equal(stripAttachmentLinks(text, []), text);
});

test('one tokenizer serves the FTS query and the highlighter', () => {
  assert.deepEqual(searchTokens('Local-First  SQLite!'), ['local', 'first', 'sqlite']);
  assert.deepEqual(searchTokens('repeat repeat'), ['repeat']);
  assert.deepEqual(searchTokens('   '), []);
  assert.deepEqual(searchTokens(''), []);
  assert.equal(ftsPrefixQuery(searchTokens('local first')), '"local"* AND "first"*');
  // A quote in the query must not escape the quoted term.
  assert.equal(ftsPrefixQuery(['a"b']), '"a""b"*');
});

test('one rule decides what an X handle is', () => {
  assert.equal(normalizeHandle('@levelsio'), 'levelsio');
  assert.equal(normalizeHandle(' levelsio '), 'levelsio');
  assert.equal(normalizeHandle('bad handle!'), null);
  assert.equal(normalizeHandle('a'.repeat(16)), null);
  assert.equal(normalizeHandle(null), null);
});

test('abbreviates engagement counts without inventing precision', () => {
  assert.equal(compactCount(0), '0');
  assert.equal(compactCount(999), '999');
  assert.equal(compactCount(1000), '1K');
  assert.equal(compactCount(4240), '4.2K');
  assert.equal(compactCount(91_000), '91K');
  assert.equal(compactCount(1_300_000), '1.3M');
});
