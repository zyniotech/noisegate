import { browser } from 'wxt/browser';
import {
  buildCanonicalChannelKey,
  normalizeChannelId,
  normalizeHandle,
} from './normalize';
import { mapYouTubeCategoryToTopic, normalizeYppSignal } from './taxonomy';
import type {
  CategoryId,
  ChannelDisclosureStats,
  ChannelProfile,
  ChannelRef,
  DisclosureRecord,
  LocalRule,
  LocalRuleAction,
  SubscribedListMeta,
  TopicId,
  UserSettings,
  YppSignalId,
} from './types';

export const STORAGE_KEYS = {
  settings: 'ng_settings',
  localRules: 'ng_local_rules',
  subscribedLists: 'ng_subscribed_lists',
  handleCache: 'ng_handle_cache',
  videoDisclosures: 'ng_video_disclosures',
  channelDisclosures: 'ng_channel_disclosures',
  channelProfiles: 'ng_channel_profiles',
  initialized: 'ng_initialized_v1',
} as const;

export const DEFAULT_SETTINGS: UserSettings = {
  enabled: true,
  disclosureAction: 'label',
  propagateChannelDisclosure: true,
  paidPromotionAction: 'label',
  monetizedAction: 'pass',
  showMonetizationIndicator: true,
  showTopicIndicator: true,
  topicRules: {},
  autoRefreshHours: 24,
  showCardHoverButton: true,
  communitySubmissionRepo: 'zyniotech/noisegate-lists',
};

const MAX_HANDLE_CACHE = 8000;
const MAX_VIDEO_DISCLOSURES = 3000;
const MAX_CHANNEL_PROFILES = 5000;

export async function getSettings(): Promise<UserSettings> {
  const res = await browser.storage.local.get(STORAGE_KEYS.settings);
  const stored = res[STORAGE_KEYS.settings] as Partial<UserSettings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    topicRules: { ...(stored?.topicRules ?? {}) },
  };
}

export async function updateSettings(
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const current = await getSettings();
  const next: UserSettings = {
    ...current,
    ...patch,
    topicRules: patch.topicRules ? { ...patch.topicRules } : current.topicRules,
  };
  await browser.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

export async function getLocalRules(): Promise<LocalRule[]> {
  const res = await browser.storage.local.get(STORAGE_KEYS.localRules);
  const stored = res[STORAGE_KEYS.localRules] as LocalRule[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

export async function saveLocalRules(rules: LocalRule[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.localRules]: rules });
}

export async function upsertLocalRule(input: {
  ref: ChannelRef;
  action: LocalRuleAction;
  category: CategoryId;
  topics?: TopicId[];
  note?: string;
}): Promise<LocalRule> {
  const cid = normalizeChannelId(input.ref.channelId);
  const handle = normalizeHandle(input.ref.handle);
  const canonicalId = buildCanonicalChannelKey({ channelId: cid, handle });

  if (!canonicalId) {
    throw new Error('Cannot save local rule without a valid channelId or handle.');
  }

  const rules = await getLocalRules();
  const now = new Date().toISOString();

  const existingIndex = rules.findIndex(
    (r) =>
      r.id === canonicalId ||
      (cid && r.channelId === cid) ||
      (handle && r.handle === handle),
  );

  const existing = existingIndex >= 0 ? rules[existingIndex] : undefined;
  const merged: LocalRule = {
    id: canonicalId,
    channelId: cid ?? existing?.channelId,
    handle: handle ?? existing?.handle,
    channelName: input.ref.channelName?.trim() || existing?.channelName,
    action: input.action,
    category: input.category,
    topics: input.topics ?? existing?.topics,
    note: input.note?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const filtered = rules.filter((_, idx) => idx !== existingIndex);
  const deduped = filtered.filter(
    (r) =>
      r.id !== merged.id &&
      !(merged.channelId && r.channelId === merged.channelId) &&
      !(merged.handle && r.handle === merged.handle),
  );

  deduped.unshift(merged);
  await saveLocalRules(deduped);
  return merged;
}

export async function removeLocalRule(ref: ChannelRef | { id: string }): Promise<boolean> {
  const rules = await getLocalRules();
  const idMatch = 'id' in ref ? ref.id : undefined;
  const cid = 'channelId' in ref ? normalizeChannelId(ref.channelId) : undefined;
  const handle = 'handle' in ref ? normalizeHandle(ref.handle) : undefined;

  const next = rules.filter((r) => {
    if (idMatch && r.id === idMatch) return false;
    if (cid && (r.id === cid || r.channelId === cid)) return false;
    if (handle && (r.id === `@${handle}` || r.handle === handle)) return false;
    return true;
  });

  if (next.length === rules.length) return false;
  await saveLocalRules(next);
  return true;
}

export async function getSubscribedLists(): Promise<SubscribedListMeta[]> {
  const res = await browser.storage.local.get(STORAGE_KEYS.subscribedLists);
  const stored = res[STORAGE_KEYS.subscribedLists] as SubscribedListMeta[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

export async function saveSubscribedLists(lists: SubscribedListMeta[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.subscribedLists]: lists });
}

export async function getHandleCache(): Promise<Record<string, string>> {
  const res = await browser.storage.local.get(STORAGE_KEYS.handleCache);
  const stored = res[STORAGE_KEYS.handleCache] as Record<string, string> | undefined;
  return stored && typeof stored === 'object' ? stored : {};
}

export async function cacheHandleMappings(
  pairs: Array<{ handle?: string; channelId?: string }>,
): Promise<void> {
  const validPairs: Array<[string, string]> = [];
  for (const pair of pairs) {
    const h = normalizeHandle(pair.handle);
    const cid = normalizeChannelId(pair.channelId);
    if (h && cid) {
      validPairs.push([h, cid]);
    }
  }
  if (validPairs.length === 0) return;

  const cache = await getHandleCache();
  let changed = false;

  for (const [h, cid] of validPairs) {
    if (cache[h] !== cid) {
      cache[h] = cid;
      changed = true;
    }
  }

  if (!changed) return;

  const keys = Object.keys(cache);
  if (keys.length > MAX_HANDLE_CACHE) {
    const excess = keys.length - MAX_HANDLE_CACHE;
    for (let i = 0; i < excess; i++) {
      const k = keys[i];
      if (k) delete cache[k];
    }
  }

  await browser.storage.local.set({ [STORAGE_KEYS.handleCache]: cache });
}

export async function getVideoDisclosures(): Promise<Record<string, DisclosureRecord>> {
  const res = await browser.storage.local.get(STORAGE_KEYS.videoDisclosures);
  const stored = res[STORAGE_KEYS.videoDisclosures] as
    | Record<string, DisclosureRecord>
    | undefined;
  return stored && typeof stored === 'object' ? stored : {};
}

export async function getChannelDisclosures(): Promise<
  Record<string, ChannelDisclosureStats>
> {
  const res = await browser.storage.local.get(STORAGE_KEYS.channelDisclosures);
  const stored = res[STORAGE_KEYS.channelDisclosures] as
    | Record<string, ChannelDisclosureStats>
    | undefined;
  return stored && typeof stored === 'object' ? stored : {};
}

export async function recordOfficialDisclosure(input: {
  videoId: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  source: 'watch-data' | 'watch-dom';
}): Promise<DisclosureRecord> {
  const cid = normalizeChannelId(input.channelId);
  const handle = normalizeHandle(input.handle);
  const now = new Date().toISOString();

  const [videoMap, channelMap] = await Promise.all([
    getVideoDisclosures(),
    getChannelDisclosures(),
  ]);

  const record: DisclosureRecord = {
    videoId: input.videoId,
    channelId: cid,
    handle,
    channelName: input.channelName?.trim() || undefined,
    detectedAt: videoMap[input.videoId]?.detectedAt ?? now,
    source: input.source,
  };

  videoMap[input.videoId] = record;

  const vKeys = Object.keys(videoMap);
  if (vKeys.length > MAX_VIDEO_DISCLOSURES) {
    const sorted = vKeys.sort((a, b) =>
      (videoMap[a]?.detectedAt ?? '').localeCompare(videoMap[b]?.detectedAt ?? ''),
    );
    const toRemove = sorted.slice(0, vKeys.length - MAX_VIDEO_DISCLOSURES);
    for (const k of toRemove) delete videoMap[k];
  }

  const channelKey = buildCanonicalChannelKey({ channelId: cid, handle });
  if (channelKey) {
    const existing = channelMap[channelKey];
    const videoIds = new Set(existing?.videoIds ?? []);
    videoIds.add(input.videoId);
    channelMap[channelKey] = {
      channelKey,
      channelId: cid ?? existing?.channelId,
      handle: handle ?? existing?.handle,
      channelName: input.channelName?.trim() || existing?.channelName,
      videoIds: Array.from(videoIds).slice(-50),
      lastDetectedAt: now,
    };

    if (cid && handle && channelMap[`@${handle}`]) {
      const oldHandleStats = channelMap[`@${handle}`]!;
      for (const vid of oldHandleStats.videoIds) {
        videoIds.add(vid);
      }
      channelMap[channelKey].videoIds = Array.from(videoIds).slice(-50);
      delete channelMap[`@${handle}`];
    }
  }

  await browser.storage.local.set({
    [STORAGE_KEYS.videoDisclosures]: videoMap,
    [STORAGE_KEYS.channelDisclosures]: channelMap,
  });

  if (cid && handle) {
    await cacheHandleMappings([{ handle, channelId: cid }]);
  }

  return record;
}

export async function clearAllDisclosures(): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.videoDisclosures]: {},
    [STORAGE_KEYS.channelDisclosures]: {},
  });
}

// ============================================================================
// Channel Profiles (Observed Neutral Topics & Hard YPP Monetization Signals)
// ============================================================================

export async function getChannelProfiles(): Promise<Record<string, ChannelProfile>> {
  const res = await browser.storage.local.get(STORAGE_KEYS.channelProfiles);
  const stored = res[STORAGE_KEYS.channelProfiles] as
    | Record<string, ChannelProfile>
    | undefined;
  return stored && typeof stored === 'object' ? stored : {};
}

export async function recordChannelTelemetry(input: {
  ref: ChannelRef;
  youtubeCategory?: string;
  yppSignals: YppSignalId[];
  monetizationInspected: boolean;
  hasPaidPromotion?: boolean;
}): Promise<ChannelProfile | null> {
  const cid = normalizeChannelId(input.ref.channelId);
  const handle = normalizeHandle(input.ref.handle);
  const channelKey = buildCanonicalChannelKey({ channelId: cid, handle });
  if (!channelKey) return null;

  const profiles = await getChannelProfiles();
  const handleFallbackKey = handle ? `@${handle}` : undefined;
  const existing =
    profiles[channelKey] ?? (handleFallbackKey ? profiles[handleFallbackKey] : undefined);

  const now = new Date().toISOString();
  const observedYouTubeCategories: Record<string, number> = {
    ...(existing?.observedYouTubeCategories ?? {}),
  };

  const rawCat = input.youtubeCategory?.trim();
  if (rawCat) {
    observedYouTubeCategories[rawCat] = (observedYouTubeCategories[rawCat] ?? 0) + 1;
  }

  // Derive sorted observedTopics from accumulated YouTube categories
  const topicCounts = new Map<TopicId, number>();
  for (const [catName, count] of Object.entries(observedYouTubeCategories)) {
    const mapped = mapYouTubeCategoryToTopic(catName);
    if (mapped) {
      topicCounts.set(mapped, (topicCounts.get(mapped) ?? 0) + count);
    }
  }
  const observedTopics = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const signalSet = new Set<YppSignalId>(existing?.yppSignals ?? []);
  for (const s of input.yppSignals) {
    const norm = normalizeYppSignal(s);
    if (norm) signalSet.add(norm);
  }

  const paidPromoSet = new Set<string>(existing?.paidPromotionVideoIds ?? []);
  if (input.hasPaidPromotion && input.ref.videoId) {
    paidPromoSet.add(input.ref.videoId);
  }

  const nextProfile: ChannelProfile = {
    channelKey,
    channelId: cid ?? existing?.channelId,
    handle: handle ?? existing?.handle,
    channelName: input.ref.channelName?.trim() || existing?.channelName,
    observedYouTubeCategories,
    observedTopics,
    manualTopics: existing?.manualTopics,
    yppSignals: Array.from(signalSet),
    monetizationInspected:
      Boolean(existing?.monetizationInspected) || input.monetizationInspected,
    paidPromotionVideoIds: Array.from(paidPromoSet).slice(-40),
    lastObservedAt: now,
  };

  profiles[channelKey] = nextProfile;
  if (cid && handleFallbackKey && profiles[handleFallbackKey]) {
    delete profiles[handleFallbackKey];
  }

  // Cap total stored profiles
  const keys = Object.keys(profiles);
  if (keys.length > MAX_CHANNEL_PROFILES) {
    const oldest = keys.sort((a, b) =>
      (profiles[a]?.lastObservedAt ?? '').localeCompare(profiles[b]?.lastObservedAt ?? ''),
    );
    const dropCount = keys.length - MAX_CHANNEL_PROFILES;
    for (let i = 0; i < dropCount; i++) {
      const k = oldest[i];
      if (k) delete profiles[k];
    }
  }

  await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: profiles });

  if (cid && handle) {
    await cacheHandleMappings([{ handle, channelId: cid }]);
  }

  return nextProfile;
}

export async function setManualChannelTopics(
  ref: ChannelRef,
  topics: TopicId[] | undefined,
): Promise<ChannelProfile | null> {
  const cid = normalizeChannelId(ref.channelId);
  const handle = normalizeHandle(ref.handle);
  const channelKey = buildCanonicalChannelKey({ channelId: cid, handle });
  if (!channelKey) return null;

  const profiles = await getChannelProfiles();
  const handleFallbackKey = handle ? `@${handle}` : undefined;
  const existing =
    profiles[channelKey] ?? (handleFallbackKey ? profiles[handleFallbackKey] : undefined);

  const nextProfile: ChannelProfile = {
    channelKey,
    channelId: cid ?? existing?.channelId,
    handle: handle ?? existing?.handle,
    channelName: ref.channelName?.trim() || existing?.channelName,
    observedYouTubeCategories: existing?.observedYouTubeCategories ?? {},
    observedTopics: existing?.observedTopics ?? [],
    manualTopics: topics,
    yppSignals: existing?.yppSignals ?? [],
    monetizationInspected: existing?.monetizationInspected ?? false,
    paidPromotionVideoIds: existing?.paidPromotionVideoIds ?? [],
    lastObservedAt: new Date().toISOString(),
  };

  profiles[channelKey] = nextProfile;
  if (cid && handleFallbackKey && profiles[handleFallbackKey]) {
    delete profiles[handleFallbackKey];
  }

  await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: profiles });
  return nextProfile;
}

export async function clearChannelProfiles(): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: {} });
}
