import {
  extractVideoId,
  normalizeChannelId,
  normalizeHandle,
  sanitizeHttpUrl,
} from './normalize';
import type {
  ChannelRef,
  ObservableSignalId,
  TopicId,
  YppSignalId,
} from './types';

export interface TopicMeta {
  id: TopicId;
  label: string;
  shortLabel: string;
  description: string;
  accentColor: string;
}

export const TOPICS: Record<TopicId, TopicMeta> = {
  science: {
    id: 'science',
    label: 'Science',
    shortLabel: 'Science',
    description: 'Physics, biology, mathematics, space, and scientific explainers.',
    accentColor: '#38bdf8',
  },
  technology: {
    id: 'technology',
    label: 'Technology',
    shortLabel: 'Tech',
    description: 'Software, engineering, hardware, and technical reviews.',
    accentColor: '#60a5fa',
  },
  education: {
    id: 'education',
    label: 'Education & Tutorials',
    shortLabel: 'Education',
    description: 'Courses, lectures, structured how-to guides, and study material.',
    accentColor: '#34d399',
  },
  documentary: {
    id: 'documentary',
    label: 'Documentary & History',
    shortLabel: 'Documentary',
    description: 'Long-form essays, investigative features, and historical context.',
    accentColor: '#94a3b8',
  },
  entertainment: {
    id: 'entertainment',
    label: 'Entertainment & Comedy',
    shortLabel: 'Entertainment',
    description: 'Variety, comedy, film commentary, and general entertainment.',
    accentColor: '#a78bfa',
  },
  gaming: {
    id: 'gaming',
    label: 'Gaming & Esports',
    shortLabel: 'Gaming',
    description: 'Video game playthroughs, esports coverage, and game analysis.',
    accentColor: '#818cf8',
  },
  'news-politics': {
    id: 'news-politics',
    label: 'News & Politics',
    shortLabel: 'News & Politics',
    description: 'Current affairs, journalism, public policy, and commentary.',
    accentColor: '#fbbf24',
  },
  'finance-business': {
    id: 'finance-business',
    label: 'Finance & Business',
    shortLabel: 'Finance',
    description: 'Economics, personal finance, markets, and company analysis.',
    accentColor: '#2dd4bf',
  },
  music: {
    id: 'music',
    label: 'Music',
    shortLabel: 'Music',
    description: 'Performances, music production, recordings, and audio theory.',
    accentColor: '#f472b6',
  },
  sports: {
    id: 'sports',
    label: 'Sports & Fitness',
    shortLabel: 'Sports',
    description: 'Athletics, motorsport, training, and competitive sports.',
    accentColor: '#fb923c',
  },
  'lifestyle-vlogs': {
    id: 'lifestyle-vlogs',
    label: 'Lifestyle & Vlogs',
    shortLabel: 'Lifestyle',
    description: 'Daily vlogs, travel, automotive, crafts, and personal journals.',
    accentColor: '#cbd5e1',
  },
  'kids-family': {
    id: 'kids-family',
    label: 'Kids & Family',
    shortLabel: 'Kids & Family',
    description: 'Children programming, family entertainment, and youth learning.',
    accentColor: '#facc15',
  },
};

export const TOPIC_LIST: TopicMeta[] = Object.values(TOPICS);

const TOPIC_SET = new Set<string>(Object.keys(TOPICS));

export function normalizeTopicId(raw?: string | null): TopicId | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (TOPIC_SET.has(key)) {
    return key as TopicId;
  }
  return undefined;
}

const YOUTUBE_CATEGORY_TO_TOPIC: Record<string, TopicId> = {
  // Canonical YouTube microformat categories (English + common localized names)
  'science & technology': 'science',
  'wissenschaft & technik': 'science',
  science: 'science',
  technology: 'technology',
  education: 'education',
  bildung: 'education',
  gaming: 'gaming',
  spiele: 'gaming',
  entertainment: 'entertainment',
  unterhaltung: 'entertainment',
  comedy: 'entertainment',
  'film & animation': 'entertainment',
  'news & politics': 'news-politics',
  'nachrichten & politik': 'news-politics',
  music: 'music',
  musik: 'music',
  sports: 'sports',
  sport: 'sports',
  'people & blogs': 'lifestyle-vlogs',
  'menschen & blogs': 'lifestyle-vlogs',
  'howto & style': 'lifestyle-vlogs',
  'praktische tipps & styling': 'lifestyle-vlogs',
  'travel & events': 'lifestyle-vlogs',
  'reisen & events': 'lifestyle-vlogs',
  'autos & vehicles': 'lifestyle-vlogs',
  'autos & fahrzeuge': 'lifestyle-vlogs',
  'pets & animals': 'lifestyle-vlogs',
  'tiere': 'lifestyle-vlogs',
  'nonprofits & activism': 'documentary',
  'gemeinnützigkeit & aktivismus': 'documentary',
};

export function mapYouTubeCategoryToTopic(rawCategory?: string | null): TopicId | undefined {
  if (!rawCategory) return undefined;
  const cleaned = rawCategory.trim().toLowerCase();
  if (!cleaned) return undefined;
  if (Object.hasOwn(YOUTUBE_CATEGORY_TO_TOPIC, cleaned)) {
    return YOUTUBE_CATEGORY_TO_TOPIC[cleaned];
  }
  return normalizeTopicId(cleaned);
}

export const YPP_SIGNAL_LABELS: Record<YppSignalId, string> = {
  'ypp-partner': 'Partner (Monetized)',
  'ypp-memberships': 'Memberships',
  'ypp-super-thanks': 'Super Thanks',
  'ypp-super-chat': 'Super Chat',
  'ypp-shopping': 'Shopping',
};

const YPP_SIGNAL_PRIORITY: Record<YppSignalId, number> = {
  'ypp-memberships': 0,
  'ypp-super-thanks': 1,
  'ypp-super-chat': 2,
  'ypp-shopping': 3,
  'ypp-partner': 4,
};

const VALID_YPP_SIGNALS = new Set<string>(Object.keys(YPP_SIGNAL_LABELS));
const VALID_OBSERVABLE_SIGNALS = new Set<string>([
  ...VALID_YPP_SIGNALS,
  'yt-paid-promotion',
  'yt-synthetic-disclosure',
]);

export function normalizeYppSignal(raw?: string | null): YppSignalId | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return VALID_YPP_SIGNALS.has(key) ? (key as YppSignalId) : undefined;
}

export function normalizeObservableSignal(raw?: string | null): ObservableSignalId | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return VALID_OBSERVABLE_SIGNALS.has(key) ? (key as ObservableSignalId) : undefined;
}

export function hasObservedYppSignals(signals?: readonly YppSignalId[] | null): boolean {
  if (!Array.isArray(signals) || signals.length === 0) return false;
  return signals.some((s) => Boolean(normalizeYppSignal(s)));
}

export function formatMonetizationSummary(
  signals: readonly YppSignalId[],
  inspected: boolean,
): string {
  const unique = Array.from(
    new Set(
      signals
        .map((s) => normalizeYppSignal(s))
        .filter((s): s is YppSignalId => Boolean(s)),
    ),
  );
  if (unique.length > 0) {
    const concrete = unique
      .filter((s) => s !== 'ypp-partner')
      .sort((a, b) => YPP_SIGNAL_PRIORITY[a] - YPP_SIGNAL_PRIORITY[b]);
    if (concrete.length > 0) {
      const names = concrete.map((s) => YPP_SIGNAL_LABELS[s] ?? s).join(', ');
      return `YPP: Monetized (${names})`;
    }
    return 'YPP: Monetized (Partner)';
  }
  if (inspected) {
    return 'YPP status not publicly shown';
  }
  return 'Not yet inspected on Watch or Channel page';
}

export function getTopObservedCategory(
  counts: Record<string, number> | undefined,
): string | undefined {
  if (!counts) return undefined;
  let bestKey: string | undefined;
  let bestCount = 0;
  for (const [k, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = k;
    }
  }
  return bestKey;
}

export function buildGitHubSubmissionUrl(
  baseSubmissionUrl: string,
  ref: ChannelRef,
  options?: {
    topics?: TopicId[];
    yppSignals?: Array<ObservableSignalId | string>;
    rawYouTubeCategory?: string;
    template?: 'channel-entry.yml' | 'correction.yml';
  },
): string | undefined {
  const safeBase = sanitizeHttpUrl(baseSubmissionUrl);
  if (!safeBase) return undefined;

  try {
    const url = new URL(safeBase);
    if (options?.template) {
      url.searchParams.set('template', options.template);
    }

    const cid = normalizeChannelId(ref.channelId);
    if (cid) {
      url.searchParams.set('channel_id', cid);
    }

    const normHandle = normalizeHandle(ref.handle);
    let displayHandle: string | undefined;
    if (normHandle) {
      const rawTrimmed = ref.handle?.trim() ?? '';
      const rawStripped = rawTrimmed.startsWith('@') ? rawTrimmed.slice(1) : rawTrimmed;
      displayHandle =
        rawStripped && rawStripped.toLowerCase() === normHandle
          ? `@${rawStripped}`
          : `@${normHandle}`;
      url.searchParams.set('channel_handle', displayHandle);
    }

    if (ref.channelName?.trim()) {
      url.searchParams.set('channel_name', ref.channelName.trim().slice(0, 120));
    }

    const vid = extractVideoId(ref.videoId);
    if (vid) {
      url.searchParams.set('evidence_url', `https://www.youtube.com/watch?v=${vid}`);
    } else if (cid) {
      url.searchParams.set('evidence_url', `https://www.youtube.com/channel/${cid}`);
    } else if (displayHandle) {
      url.searchParams.set('evidence_url', `https://www.youtube.com/${displayHandle}`);
    }

    const validTopics = (options?.topics ?? [])
      .map((t) => normalizeTopicId(t))
      .filter((t): t is TopicId => Boolean(t));
    const uniqueTopics = Array.from(new Set(validTopics));

    if (uniqueTopics.length > 0) {
      url.searchParams.set('topics', uniqueTopics.join(', '));
    } else if (options?.rawYouTubeCategory) {
      const mapped = mapYouTubeCategoryToTopic(options.rawYouTubeCategory);
      if (mapped) {
        url.searchParams.set('topics', mapped);
      }
    }

    const validSignals = (options?.yppSignals ?? [])
      .map((s) => normalizeObservableSignal(s))
      .filter((s): s is ObservableSignalId => Boolean(s));
    const uniqueSignals = Array.from(new Set(validSignals));
    if (uniqueSignals.length > 0) {
      url.searchParams.set('signals', uniqueSignals.join(', '));
    }

    return url.toString();
  } catch {
    return undefined;
  }
}
