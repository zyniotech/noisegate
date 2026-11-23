import type { ChannelRef } from './types';

const CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;
const CHANNEL_URL_ID_REGEX = /\/channel\/(UC[a-zA-Z0-9_-]{22})(?:[/?#]|$)/;
const HANDLE_URL_REGEX = /\/@([^/?#&]+)/;
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const REPO_SLUG_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const INVALID_HANDLE_CHARS_REGEX = /[\s:;,"'<>\\`{}[\]()!]/;

const RESERVED_OBJECT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'tostring',
  'valueof',
  'hasownproperty',
  'isprototypeof',
  'propertyisenumerable',
  'tolocalestring',
]);

export function isSafeLookupKey(key: string): boolean {
  return !RESERVED_OBJECT_KEYS.has(key.toLowerCase());
}

export function isValidRepoSlug(slug?: string | null): boolean {
  if (!slug) return false;
  const trimmed = slug.trim();
  if (!REPO_SLUG_REGEX.test(trimmed)) return false;
  const [owner, repo] = trimmed.split('/');
  return Boolean(owner && repo && !owner.includes('..') && !repo.includes('..'));
}

export function normalizeChannelId(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (CHANNEL_ID_REGEX.test(trimmed)) {
    return trimmed;
  }
  const match = trimmed.match(CHANNEL_URL_ID_REGEX);
  if (match?.[1] && CHANNEL_ID_REGEX.test(match[1])) {
    return match[1];
  }
  return undefined;
}

export function normalizeHandle(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim();
  if (!value) return undefined;

  const urlMatch = value.match(HANDLE_URL_REGEX);
  if (urlMatch?.[1]) {
    value = urlMatch[1];
  } else if (
    /^https?:\/\//i.test(value) ||
    value.startsWith('//') ||
    /^(?:www\.|m\.)?youtu(?:be\.com|\.be)(?:\/|$)/i.test(value) ||
    value.startsWith('/')
  ) {
    return undefined;
  }

  try {
    value = decodeURIComponent(value);
  } catch {
  }

  if (value.startsWith('@')) {
    value = value.slice(1);
  }

  value = value.split(/[/?#&]/)[0]?.trim() ?? '';
  if (!value || value.length < 2 || value.length > 100) return undefined;
  if (INVALID_HANDLE_CHARS_REGEX.test(value)) return undefined;

  const normalized = value.toLowerCase();
  if (!isSafeLookupKey(normalized)) return undefined;

  return normalized;
}

export function formatHandle(handle?: string | null): string | undefined {
  const normalized = normalizeHandle(handle);
  return normalized ? `@${normalized}` : undefined;
}

export function parseYouTubeChannelHref(href?: string | null): {
  channelId?: string;
  handle?: string;
} {
  if (!href) return {};
  const channelId = normalizeChannelId(href);
  if (channelId) {
    return { channelId };
  }
  const handle = normalizeHandle(href);
  if (handle) {
    return { handle };
  }
  return {};
}

export function extractVideoId(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (VIDEO_ID_REGEX.test(trimmed) && isSafeLookupKey(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed, 'https://www.youtube.com');
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      const shortSeg = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
      if (VIDEO_ID_REGEX.test(shortSeg) && isSafeLookupKey(shortSeg)) {
        return shortSeg;
      }
    }
    const vParam = url.searchParams.get('v');
    if (vParam && VIDEO_ID_REGEX.test(vParam) && isSafeLookupKey(vParam)) {
      return vParam;
    }
    const pathMatch = url.pathname.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch?.[1] && isSafeLookupKey(pathMatch[1])) {
      return pathMatch[1];
    }
  } catch {
    const fallbackV = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (fallbackV?.[1] && isSafeLookupKey(fallbackV[1])) return fallbackV[1];
    const fallbackPath = trimmed.match(/\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
    if (fallbackPath?.[1] && isSafeLookupKey(fallbackPath[1])) return fallbackPath[1];
  }

  return undefined;
}

export function buildCanonicalChannelKey(ref: ChannelRef): string | undefined {
  const id = normalizeChannelId(ref.channelId);
  if (id) return id;
  const handle = normalizeHandle(ref.handle);
  if (handle) return `@${handle}`;
  return undefined;
}

function isDisallowedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1'
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

export function sanitizeHttpUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === 'https:' && !url.username && !url.password && url.hostname) {
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function sanitizePublicHttpsUrl(raw?: string | null): string | undefined {
  const safe = sanitizeHttpUrl(raw);
  if (!safe) return undefined;
  try {
    const parsed = new URL(safe);
    if (isDisallowedHostname(parsed.hostname)) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}
