import { normalizeChannelId, normalizeHandle, sanitizeHttpUrl } from './normalize';
import { normalizeTopicId } from './taxonomy';
import type {
  FilterAction,
  ParsedFilterList,
  ParsedListEntry,
  RegistryListEntry,
  TopicId,
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
  return slug || `list-${Date.now()}`;
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
    const s = item.trim().toLowerCase().slice(0, 64);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Validates and parses a NoiseGate JSON v1 or v2 filter list.
 */
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

  const listId = typeof rawJson.listId === 'string' ? rawJson.listId.trim() : '';
  const name = typeof rawJson.name === 'string' ? rawJson.name.trim() : '';
  const updatedAt = typeof rawJson.updatedAt === 'string' ? rawJson.updatedAt.trim() : '';

  if (!listId) {
    return { ok: false, error: 'Missing required field "listId".' };
  }
  if (!name) {
    return { ok: false, error: 'Missing required field "name".' };
  }
  if (!updatedAt) {
    return { ok: false, error: 'Missing required field "updatedAt".' };
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

      if (!isRecord(rawEntry)) {
        warnings.push(`Skipped malformed entry for "${rawKey}".`);
        continue;
      }

      const topics = parseTopicList(rawEntry.topics);
      const signals = parseSignalList(rawEntry.signals);

      let fallbackCategory = 'custom';
      if (signals.some((s) => s.includes('synthetic'))) {
        fallbackCategory = 'ai-synthetic';
      } else if (signals.some((s) => s.includes('farm'))) {
        fallbackCategory = 'content-farm';
      } else if (signals.some((s) => s.includes('reupload'))) {
        fallbackCategory = 'reupload-compilation';
      } else if (topics.length > 0) {
        fallbackCategory = 'topic-match';
      } else if (signals.some((s) => s.startsWith('ypp-'))) {
        fallbackCategory = 'ypp-monetized';
      } else if (version === 1) {
        fallbackCategory = 'ai-synthetic';
      }

      const category =
        typeof rawEntry.category === 'string' && rawEntry.category.trim()
          ? rawEntry.category.trim().slice(0, 64)
          : fallbackCategory;

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

/**
 * Parses uBlock / AiSList-style plain-text filter lists.
 */
export function parsePlainTextFilterList(
  rawText: string,
  sourceUrl?: string,
): FilterListParseOutcome {
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
      updatedAt: lastModified || new Date().toISOString(),
      entries,
    },
  };
}

/**
 * Auto-detects JSON v1/v2 vs. plain-text (AiSList) filter list content.
 */
export function parseFilterListContent(
  rawText: string,
  sourceUrl?: string,
): FilterListParseOutcome {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Filter list response is empty.' };
  }

  if (trimmed.startsWith('{')) {
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

/**
 * Validates an open NoiseGate Registry JSON manifest.
 */
export function parseRegistryJson(rawJson: unknown): RegistryListEntry[] {
  if (!isRecord(rawJson) || !Array.isArray(rawJson.lists)) {
    return [];
  }

  const result: RegistryListEntry[] = [];
  for (const item of rawJson.lists) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const url = typeof item.url === 'string' ? sanitizeHttpUrl(item.url) : undefined;
    if (!id || !name || !url) continue;

    const action: FilterAction =
      item.defaultAction === 'hide' || item.defaultAction === 'dim'
        ? item.defaultAction
        : 'label';

    const kind: RegistryListEntry['kind'] =
      item.kind === 'topics' || item.kind === 'signals' ? item.kind : 'community';

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
