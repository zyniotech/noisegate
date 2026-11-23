import type { ChannelRef } from './types';

const CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;
const CHANNEL_URL_ID_REGEX = /\/channel\/(UC[a-zA-Z0-9_-]{22})(?:[/?#]|$)/;
const HANDLE_URL_REGEX = /\/@([^/?#&]+)/;
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Validates and normalizes a canonical YouTube Channel ID (UC + 22 chars).
 */
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

/**
 * Normalizes a YouTube handle into a lowercase lookup key WITHOUT leading '@'.
 * Example: "@SuperCatLeague" -> "supercatleague", "/@PapaMeat/videos" -> "papameat"
 */
export function normalizeHandle(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let value = raw.trim();
  if (!value) return undefined;

  // Handle full URLs or paths like /@handle or https://youtube.com/@handle/videos
  const urlMatch = value.match(HANDLE_URL_REGEX);
  if (urlMatch?.[1]) {
    value = urlMatch[1];
  }

  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep original if malformed percent encoding
  }

  if (value.startsWith('@')) {
    value = value.slice(1);
  }

  value = value.split(/[/?#&\s]/)[0]?.trim() ?? '';
  if (!value || value.length > 100) return undefined;

  return value.toLowerCase();
}

/**
 * Formats a normalized handle for display with leading '@'.
 */
export function formatHandle(handle?: string | null): string | undefined {
  const normalized = normalizeHandle(handle);
  return normalized ? `@${normalized}` : undefined;
}

/**
 * Extracts channelId and/or handle from a YouTube href string.
 */
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

/**
 * Extracts a canonical 11-character YouTube video ID from a watch/shorts href or raw ID.
 */
export function extractVideoId(input?: string | null): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed, 'https://www.youtube.com');
    const vParam = url.searchParams.get('v');
    if (vParam && VIDEO_ID_REGEX.test(vParam)) {
      return vParam;
    }
    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch?.[1]) {
      return shortsMatch[1];
    }
    const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch?.[1]) {
      return embedMatch[1];
    }
  } catch {
    // Fallback regex for relative strings
    const fallbackV = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (fallbackV?.[1]) return fallbackV[1];
    const fallbackShort = trimmed.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (fallbackShort?.[1]) return fallbackShort[1];
  }

  return undefined;
}

/**
 * Builds the canonical rule key for a channel: prefers `UC...` channelId, falls back to `@handle`.
 */
export function buildCanonicalChannelKey(ref: ChannelRef): string | undefined {
  const id = normalizeChannelId(ref.channelId);
  if (id) return id;
  const handle = normalizeHandle(ref.handle);
  if (handle) return `@${handle}`;
  return undefined;
}

/**
 * Safe HTTP(S) URL validation for evidence links and filter list URLs.
 */
export function sanitizeHttpUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}
