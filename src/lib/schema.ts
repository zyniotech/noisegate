import {
  isSafeLookupKey,
  normalizeChannelId,
  normalizeHandle,
  sanitizeHttpUrl,
} from './normalize';
import { normalizeObservableSignal, normalizeTopicId } from './taxonomy';
import type {
  ParsedFilterList,
  ParsedListEntry,
  RegistryListEntry,
  TopicId,
  TopicRuleAction,
} from './types';

export interface ParseResult {
  ok: true;
  list: ParsedFilterList;
  warnings: string[];
}

export interface ParseError {
  ok: false;
  error: string;
}

export type FilterListParseOutcome = ParseResult | ParseError;

const MAX_LIST_ENTRIES = 250_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugifyId(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!slug || !isSafeLookupKey(slug)) {
    return `list-${Date.now()}`;
  }
  return slug;
}

function parseTopicList(raw: unknown): TopicId[] {
  if (!Array.isArray(raw)) return [];
  const out: TopicId[] = [];
  const seen = new Set<TopicId>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = normalizeTopicId(item);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function parseSignalList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const s = normalizeObservableSignal(item);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export function parseJsonFilterList(rawJson: unknown): FilterListParseOutcome {
  if (!isRecord(rawJson)) {
    return { ok: false, error: 'Filter list JSON must be an object.' };
  }

  const version = rawJson.schemaVersion;
  if (version !== 1 && version !== 2) {
    return {
      ok: false,
      error: `Unsupported schemaVersion "${String(version)}". Expected 1 or 2.`,
    };
  }

  const rawListId = typeof rawJson.listId === 'string' ? rawJson.listId.trim() : '';
  const listId = isSafeLookupKey(rawListId) ? rawListId : slugifyId(rawListId);
  const name = typeof rawJson.name === 'string' ? rawJson.name.trim() : '';
  const updatedAt = typeof rawJson.updatedAt === 'string' ? rawJson.updatedAt.trim() : '';

  if (!listId) {
    return { ok: false, error: 'Missing required field "listId".' };
  }
  if (!name) {
    return { ok: false, error: 'Missing required field "name".' };
  }
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
    return { ok: false, error: 'Missing or invalid ISO date in "updatedAt".' };
  }

  const hasChannels = rawJson.channels !== undefined;
  const hasHandles = rawJson.handles !== undefined;

  if (!hasChannels && !hasHandles) {
    return {
      ok: false,
      error: 'Filter list must define at least "channels" or "handles".',
    };
  }

  if (hasChannels && !isRecord(rawJson.channels)) {
    return { ok: false, error: '"channels" must be an object keyed by YouTube channel ID (UC...).' };
  }
  if (hasHandles && !isRecord(rawJson.handles)) {
    return { ok: false, error: '"handles" must be an object keyed by YouTube @handle.' };
  }

  const entries: ParsedListEntry[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const ingestMap = (
    source: Record<string, unknown> | undefined,
    expectedType: 'channelId' | 'handle',
  ) => {
    if (!source) return;
    for (const [rawKey, rawEntry] of Object.entries(source)) {
      if (entries.length >= MAX_LIST_ENTRIES) {
        warnings.push(`Entry cap (${MAX_LIST_ENTRIES}) reached; remaining entries skipped.`);
        break;
      }

      if (!isSafeLookupKey(rawKey) || !isRecord(rawEntry)) {
        warnings.push(`Skipped malformed entry for "${rawKey}".`);
        continue;
      }

      const topics = parseTopicList(rawEntry.topics);
      const signals = parseSignalList(rawEntry.signals);

      let fallbackCategory = 'custom';
      if (topics.length > 0) {
        fallbackCategory = 'topic-match';
      } else if (signals.includes('yt-synthetic-disclosure')) {
        fallbackCategory = 'disclosure-detected';
      } else if (signals.includes('yt-paid-promotion')) {
        fallbackCategory = 'paid-promotion';
      } else if (signals.some((s) => s.startsWith('ypp-'))) {
        fallbackCategory = 'ypp-monetized';
      } else if (version === 1) {
        fallbackCategory = 'ai-synthetic';
      }

      const rawCat =
        typeof rawEntry.category === 'string' && rawEntry.category.trim()
          ? rawEntry.category.trim().slice(0, 64)
          : '';
      const category =
        rawCat && isSafeLookupKey(rawCat) ? rawCat : fallbackCategory;

      const note =
        typeof rawEntry.note === 'string' && rawEntry.note.trim()
          ? rawEntry.note.trim().slice(0, 280)
          : undefined;

      const evidenceUrl =
        typeof rawEntry.evidenceUrl === 'string'
          ? sanitizeHttpUrl(rawEntry.evidenceUrl)
          : undefined;

      const cid = normalizeChannelId(rawKey);
      if (cid) {
        const dedupeKey = `c:${cid}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          entries.push({
            keyType: 'channelId',
            key: cid,
            category,
            topics,
            signals,
            note,
            evidenceUrl,
          });
        }
        continue;
      }

      if (expectedType === 'handle' || rawKey.trim().startsWith('@')) {
        const handle = normalizeHandle(rawKey);
        if (handle) {
          const dedupeKey = `h:${handle}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            entries.push({
              keyType: 'handle',
              key: handle,
              category,
              topics,
              signals,
              note,
              evidenceUrl,
            });
          }
          continue;
        }
      }

      warnings.push(`Skipped invalid ${expectedType} key "${rawKey}".`);
    }
  };

  ingestMap(rawJson.channels as Record<string, unknown> | undefined, 'channelId');
  ingestMap(rawJson.handles as Record<string, unknown> | undefined, 'handle');

  return {
    ok: true,
    warnings,
    list: {
      format: version === 2 ? 'json-v2' : 'json-v1',
      listId,
      name,
      description:
        typeof rawJson.description === 'string'
          ? rawJson.description.trim().slice(0, 300)
          : undefined,
      homepage:
        typeof rawJson.homepage === 'string' ? sanitizeHttpUrl(rawJson.homepage) : undefined,
      submissionUrl:
        typeof rawJson.submissionUrl === 'string'
          ? sanitizeHttpUrl(rawJson.submissionUrl)
          : undefined,
      removalUrl:
        typeof rawJson.removalUrl === 'string'
          ? sanitizeHttpUrl(rawJson.removalUrl)
          : undefined,
      license:
        typeof rawJson.license === 'string' ? rawJson.license.trim().slice(0, 80) : undefined,
      updatedAt,
      entries,
    },
  };
}

export function parsePlainTextFilterList(
  rawText: string,
  sourceUrl?: string,
): FilterListParseOutcome {
  if (/^\s*</.test(rawText) || /@(media|import|keyframes|layer|charset)\b/i.test(rawText)) {
    return {
      ok: false,
      error: 'Response looks like HTML or CSS rather than a filter list.',
    };
  }

  const lines = rawText.split(/\r?\n/);
  let title = '';
  let description = '';
  let homepage = '';
  let license = '';
  let lastModified = '';

  const entries: ParsedListEntry[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('!') || line.startsWith('#')) {
      const comment = line.replace(/^[!#]\s*/, '');
      const titleMatch = comment.match(/^Title:\s*(.+)$/i);
      if (titleMatch?.[1]) {
        title = titleMatch[1].trim();
        continue;
      }
      const descMatch = comment.match(/^Description:\s*(.+)$/i);
      if (descMatch?.[1]) {
        description = descMatch[1].trim();
        continue;
      }
      const homeMatch = comment.match(/^Homepage:\s*(.+)$/i);
      if (homeMatch?.[1]) {
        homepage = homeMatch[1].trim();
        continue;
      }
      const licenseMatch = comment.match(/^License:\s*(.+)$/i);
      if (licenseMatch?.[1]) {
        license = licenseMatch[1].trim();
        continue;
      }
      const modMatch = comment.match(/^(?:Last Modified|Updated):\s*(.+)$/i);
      if (modMatch?.[1]) {
        lastModified = modMatch[1].trim();
        continue;
      }
      continue;
    }

    if (entries.length >= MAX_LIST_ENTRIES) {
      warnings.push(`Entry cap (${MAX_LIST_ENTRIES}) reached; remaining lines skipped.`);
      break;
    }

    if (line.includes('<') || line.includes('>') || line.includes('{') || line.includes('}')) {
      continue;
    }

    const token = line.split(/\s+/)[0] ?? '';
    const cid = normalizeChannelId(token);
    if (cid) {
      const dedupeKey = `c:${cid}`;
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        entries.push({
          keyType: 'channelId',
          key: cid,
          category: 'ai-synthetic',
          topics: [],
          signals: [],
        });
      }
      continue;
    }

    if (token.startsWith('@') || token.includes('/@')) {
      const handle = normalizeHandle(token);
      if (handle) {
        const dedupeKey = `h:${handle}`;
        if (!seen.has(dedupeKey)) {
          seen.add(dedupeKey);
          entries.push({
            keyType: 'handle',
            key: handle,
            category: 'ai-synthetic',
            topics: [],
            signals: [],
          });
        }
        continue;
      }
    }

    warnings.push(`Ignored unrecognized line: "${line.slice(0, 60)}"`);
  }

  if (entries.length === 0) {
    return {
      ok: false,
      error: 'No valid YouTube channel IDs (UC...) or @handles found in text list.',
    };
  }

  const fallbackName = sourceUrl
    ? sourceUrl.split('/').filter(Boolean).pop() ?? 'Text Filter List'
    : 'Text Filter List';

  const resolvedName = title || fallbackName;
  const listId = slugifyId(resolvedName);

  const isWarnlist = /warn/i.test(resolvedName);
  if (isWarnlist) {
    for (const entry of entries) {
      entry.note = 'Listed on community warnlist (review suggested).';
    }
  }

  const parsedDate =
    lastModified && !Number.isNaN(Date.parse(lastModified))
      ? new Date(lastModified).toISOString()
      : new Date().toISOString();

  return {
    ok: true,
    warnings,
    list: {
      format: 'plaintext-aislist',
      listId,
      name: resolvedName,
      description: description || undefined,
      homepage: sanitizeHttpUrl(homepage),
      license: license || undefined,
      updatedAt: parsedDate,
      entries,
    },
  };
}

export function parseFilterListContent(
  rawText: string,
  sourceUrl?: string,
): FilterListParseOutcome {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Filter list response is empty.' };
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parseJsonFilterList(parsed);
    } catch (err) {
      return {
        ok: false,
        error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'parse error'}`,
      };
    }
  }

  return parsePlainTextFilterList(trimmed, sourceUrl);
}

export function parseRegistryJson(rawJson: unknown): RegistryListEntry[] {
  if (!isRecord(rawJson) || !Array.isArray(rawJson.lists)) {
    return [];
  }

  const result: RegistryListEntry[] = [];
  for (const item of rawJson.lists) {
    if (!isRecord(item)) continue;
    const rawId = typeof item.id === 'string' ? item.id.trim() : '';
    const id = rawId && isSafeLookupKey(rawId) ? rawId : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const url = typeof item.url === 'string' ? sanitizeHttpUrl(item.url) : undefined;
    if (!id || !name || !url) continue;

    const kind: RegistryListEntry['kind'] =
      item.kind === 'topics' || item.kind === 'signals' ? item.kind : 'community';

    const action: TopicRuleAction =
      item.defaultAction === 'hide' ||
      item.defaultAction === 'dim' ||
      item.defaultAction === 'label' ||
      item.defaultAction === 'pass'
        ? item.defaultAction
        : kind === 'topics'
          ? 'pass'
          : 'label';

    result.push({
      id,
      name,
      description: typeof item.description === 'string' ? item.description.trim() : '',
      url,
      homepage: typeof item.homepage === 'string' ? sanitizeHttpUrl(item.homepage) : undefined,
      submissionUrl:
        typeof item.submissionUrl === 'string' ? sanitizeHttpUrl(item.submissionUrl) : undefined,
      removalUrl:
        typeof item.removalUrl === 'string' ? sanitizeHttpUrl(item.removalUrl) : undefined,
      defaultAction: action,
      kind,
      maintainer: typeof item.maintainer === 'string' ? item.maintainer.trim() : 'Community',
    });
  }

  return result;
}
