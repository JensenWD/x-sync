'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { PostLink } from '@/types';

/** Fresh instances per call — a shared `g` regex carries `lastIndex` between renders. */
const urlPattern = () => /https?:\/\/\S+/gu;
const wordPattern = () => /[\p{L}\p{N}_]+/gu;
/** Sentence punctuation the URL pattern greedily swallows off the end of a link. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/u;

/** `https://www.nytimes.com/2026/…?utm=x` → `nytimes.com/2026/…` */
function prettyUrl(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//u, '').replace(/^www\./u, '');
  const trimmed = withoutScheme.replace(/\/$/u, '');
  return trimmed.length > 42 ? `${trimmed.slice(0, 41)}…` : trimmed;
}

/** Marks every word starting with one of the search tokens. */
function highlighted(text: string, tokens: string[], keyPrefix: string): ReactNode {
  if (tokens.length === 0 || !text) return text;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  const words = wordPattern();

  for (let match = words.exec(text); match; match = words.exec(text)) {
    const word = match[0];
    const folded = word.toLocaleLowerCase();
    if (!tokens.some((token) => folded.startsWith(token))) continue;
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(
      <mark
        key={`${keyPrefix}-mark-${match.index}`}
        className="rounded-[3px] bg-[#3a3520] px-0.5 text-[#f0e2a8]"
      >
        {word}
      </mark>,
    );
    cursor = match.index + word.length;
  }

  if (nodes.length === 0) return text;
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

interface PostTextProps {
  text: string;
  links?: PostLink[];
  /** Lowercased search tokens from `searchTokens()`. */
  tokens?: string[];
  /** Cards sit inside a click target, so their links must not open the reader too. */
  stopPropagation?: boolean;
  linkClassName?: string;
}

/**
 * Post text as something you can actually act on: `t.co` shortlinks resolved to
 * the destination they hide and rendered as links, and the words that matched
 * the current search marked in place.
 *
 * Returns inline nodes — the caller owns the surrounding block element.
 */
export function PostText({
  text,
  links = [],
  tokens = [],
  stopPropagation = false,
  linkClassName,
}: PostTextProps) {
  const byUrl = new Map(links.map((link) => [link.url, link]));
  const nodes: ReactNode[] = [];
  let cursor = 0;

  const urls = urlPattern();
  for (let match = urls.exec(text); match; match = urls.exec(text)) {
    const raw = match[0];
    // The URL pattern over-captures sentence punctuation, but a resolved link is
    // authoritative about where it ends — only trim what we cannot look up.
    const url = byUrl.has(raw) ? raw : raw.replace(TRAILING_PUNCTUATION, '');
    const trailing = raw.slice(url.length);
    const link = byUrl.get(url);

    if (match.index > cursor) {
      nodes.push(
        <Fragment key={`text-${cursor}`}>
          {highlighted(text.slice(cursor, match.index), tokens, `t${cursor}`)}
        </Fragment>,
      );
    }

    nodes.push(
      <a
        key={`link-${match.index}`}
        href={link?.expanded_url ?? url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={link?.title ?? link?.expanded_url ?? url}
        onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
        className={cn(
          'break-words text-[#8ab4f8] underline decoration-[#8ab4f8]/30 underline-offset-2',
          'transition-colors hover:decoration-[#8ab4f8]',
          linkClassName,
        )}
      >
        {link?.display_url ?? prettyUrl(url)}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    cursor = match.index + raw.length;
  }

  if (cursor < text.length) {
    nodes.push(
      <Fragment key={`text-${cursor}`}>
        {highlighted(text.slice(cursor), tokens, `t${cursor}`)}
      </Fragment>,
    );
  }

  return <>{nodes}</>;
}
