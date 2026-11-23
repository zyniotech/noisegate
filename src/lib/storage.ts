import { browser } from 'wxt/browser';
import {
  buildCanonicalChannelKey,
  extractVideoId,
  isSafeLookupKey,
  isValidRepoSlug,
  normalizeChannelId,
  normalizeHandle,
} from './normalize';
import {
  mapYouTubeCategoryToTopic,
  normalizeTopicId,
  normalizeYppSignal,
} from './taxonomy';
import type {
  CategoryId,
  ChannelDisclosureStats,
  ChannelProfile,
  ChannelRef,
  DisclosureRecord,
  FilterAction,
  LocalRule,
  LocalRuleAction,
  SubscribedListMeta,
  TopicId,
  TopicRuleAction,
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
const MAX_CHANNEL_DISCLOSURES = 3000;
const MAX_CHANNEL_PROFILES = 5000;

const locks = new Map<string, Promise<void>>();

export function withStorageLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const cleanup = next.then(
    () => {
      if (locks.get(key) === cleanup) locks.delete(key);
    },
    () => {
      if (locks.get(key) === cleanup) locks.delete(key);
    },
  );
  locks.set(key, cleanup);
  return next;
}

function toSafeRecord<T>(raw: unknown): Record<string, T> {
  const out = Object.create(null) as Record<string, T>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, T>)) {
    if (isSafeLookupKey(k)) {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeFilterAction(raw: unknown, fallback: FilterAction): FilterAction {
  return raw === 'label' || raw === 'dim' || raw === 'hide' ? raw : fallback;
}

function sanitizeTopicRuleAction(
  raw: unknown,
  fallback: TopicRuleAction,
): TopicRuleAction {
  return raw === 'pass' || raw === 'label' || raw === 'dim' || raw === 'hide'
    ? raw
    : fallback;
}

export function sanitizeTopicRulesMap(
  raw: unknown,
): Partial<Record<TopicId, TopicRuleAction>> {
  const out: Partial<Record<TopicId, TopicRuleAction>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const topic = normalizeTopicId(k);
    if (!topic) continue;
    if (v === 'pass' || v === 'label' || v === 'dim' || v === 'hide') {
      out[topic] = v;
    }
  }
  return out;
}

export function sanitizeSettings(raw: unknown): UserSettings {
  const s =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<UserSettings>)
      : {};
  const repo =
    typeof s.communitySubmissionRepo === 'string' &&
    isValidRepoSlug(s.communitySubmissionRepo)
      ? s.communitySubmissionRepo.trim()
      : DEFAULT_SETTINGS.communitySubmissionRepo;

  const hours =
    typeof s.autoRefreshHours === 'number' && Number.isFinite(s.autoRefreshHours)
      ? Math.max(1, Math.min(168, Math.round(s.autoRefreshHours)))
      : DEFAULT_SETTINGS.autoRefreshHours;

  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SETTINGS.enabled,
    disclosureAction: sanitizeFilterAction(
      s.disclosureAction,
      DEFAULT_SETTINGS.disclosureAction,
    ),
    propagateChannelDisclosure:
      typeof s.propagateChannelDisclosure === 'boolean'
        ? s.propagateChannelDisclosure
        : DEFAULT_SETTINGS.propagateChannelDisclosure,
    paidPromotionAction: sanitizeTopicRuleAction(
      s.paidPromotionAction,
      DEFAULT_SETTINGS.paidPromotionAction,
    ),
    monetizedAction: sanitizeTopicRuleAction(
      s.monetizedAction,
      DEFAULT_SETTINGS.monetizedAction,
    ),
    showMonetizationIndicator:
      typeof s.showMonetizationIndicator === 'boolean'
        ? s.showMonetizationIndicator
        : DEFAULT_SETTINGS.showMonetizationIndicator,
    showTopicIndicator:
      typeof s.showTopicIndicator === 'boolean'
        ? s.showTopicIndicator
        : DEFAULT_SETTINGS.showTopicIndicator,
    topicRules: sanitizeTopicRulesMap(s.topicRules),
    autoRefreshHours: hours,
    showCardHoverButton:
      typeof s.showCardHoverButton === 'boolean'
        ? s.showCardHoverButton
        : DEFAULT_SETTINGS.showCardHoverButton,
    communitySubmissionRepo: repo,
  };
}

export async function getSettings(): Promise<UserSettings> {
  const res = await browser.storage.local.get(STORAGE_KEYS.settings);
  return sanitizeSettings(res[STORAGE_KEYS.settings]);
}

export async function updateSettings(
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  return withStorageLock('settings', async () => {
    const current = await getSettings();
    const cleanedPatch: Partial<UserSettings> = {};
    if (typeof patch.enabled === 'boolean') cleanedPatch.enabled = patch.enabled;
    if (patch.disclosureAction !== undefined) {
      cleanedPatch.disclosureAction = sanitizeFilterAction(
        patch.disclosureAction,
        current.disclosureAction,
      );
    }
    if (typeof patch.propagateChannelDisclosure === 'boolean') {
      cleanedPatch.propagateChannelDisclosure = patch.propagateChannelDisclosure;
    }
    if (patch.paidPromotionAction !== undefined) {
      cleanedPatch.paidPromotionAction = sanitizeTopicRuleAction(
        patch.paidPromotionAction,
        current.paidPromotionAction,
      );
    }
    if (patch.monetizedAction !== undefined) {
      cleanedPatch.monetizedAction = sanitizeTopicRuleAction(
        patch.monetizedAction,
        current.monetizedAction,
      );
    }
    if (typeof patch.showMonetizationIndicator === 'boolean') {
      cleanedPatch.showMonetizationIndicator = patch.showMonetizationIndicator;
    }
    if (typeof patch.showTopicIndicator === 'boolean') {
      cleanedPatch.showTopicIndicator = patch.showTopicIndicator;
    }
    if (patch.topicRules !== undefined) {
      cleanedPatch.topicRules = sanitizeTopicRulesMap(patch.topicRules);
    }
    if (
      typeof patch.autoRefreshHours === 'number' &&
      Number.isFinite(patch.autoRefreshHours)
    ) {
      cleanedPatch.autoRefreshHours = Math.max(
        1,
        Math.min(168, Math.round(patch.autoRefreshHours)),
      );
    }
    if (typeof patch.showCardHoverButton === 'boolean') {
      cleanedPatch.showCardHoverButton = patch.showCardHoverButton;
    }
    if (
      typeof patch.communitySubmissionRepo === 'string' &&
      isValidRepoSlug(patch.communitySubmissionRepo)
    ) {
      cleanedPatch.communitySubmissionRepo = patch.communitySubmissionRepo.trim();
    }

    const next = sanitizeSettings({
      ...current,
      ...cleanedPatch,
      topicRules: cleanedPatch.topicRules ?? current.topicRules,
    });
    await browser.storage.local.set({ [STORAGE_KEYS.settings]: next });
    return next;
  });
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
  return withStorageLock('localRules', async () => {
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
    const validTopics = input.topics
      ? input.topics.map((t) => normalizeTopicId(t)).filter((t): t is TopicId => Boolean(t))
      : existing?.topics;

    const merged: LocalRule = {
      id: canonicalId,
      channelId: cid ?? existing?.channelId,
      handle: handle ?? existing?.handle,
      channelName: input.ref.channelName?.trim() || existing?.channelName,
      action: input.action,
      category:
        typeof input.category === 'string' &&
        input.category.trim() &&
        isSafeLookupKey(input.category.trim())
          ? (input.category.trim() as CategoryId)
          : existing?.category ?? 'custom',
      topics: validTopics && validTopics.length > 0 ? validTopics : undefined,
      note: input.note?.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const deduped = rules.filter(
      (r, idx) =>
        idx !== existingIndex &&
        r.id !== merged.id &&
        !(merged.channelId && r.channelId === merged.channelId) &&
        !(merged.handle && r.handle === merged.handle),
    );

    deduped.unshift(merged);
    await saveLocalRules(deduped);
    return merged;
  });
}

export async function removeLocalRule(ref: ChannelRef | { id: string }): Promise<boolean> {
  return withStorageLock('localRules', async () => {
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
  });
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
  return toSafeRecord<string>(res[STORAGE_KEYS.handleCache]);
}

export async function cacheHandleMappings(
  pairs: Array<{ handle?: string; channelId?: string }>,
): Promise<void> {
  const validPairs: Array<[string, string]> = [];
  for (const pair of pairs) {
    const h = normalizeHandle(pair.handle);
    const cid = normalizeChannelId(pair.channelId);
    if (h && cid && isSafeLookupKey(h)) {
      validPairs.push([h, cid]);
    }
  }
  if (validPairs.length === 0) return;

  await withStorageLock('handleCache', async () => {
    const cache = await getHandleCache();
    let changed = false;

    for (const [h, cid] of validPairs) {
      if (!Object.hasOwn(cache, h) || cache[h] !== cid) {
        if (Object.hasOwn(cache, h)) {
          delete cache[h];
        }
        cache[h] = cid;
        changed = true;
      }
    }

    if (!changed) return;

    const plain: Record<string, string> = {};
    const keys = Object.keys(cache);
    const startIdx = Math.max(0, keys.length - MAX_HANDLE_CACHE);
    for (let i = startIdx; i < keys.length; i++) {
      const k = keys[i];
      if (k && isSafeLookupKey(k) && typeof cache[k] === 'string') {
        plain[k] = cache[k]!;
      }
    }

    await browser.storage.local.set({ [STORAGE_KEYS.handleCache]: plain });
  });
}

export async function getVideoDisclosures(): Promise<Record<string, DisclosureRecord>> {
  const res = await browser.storage.local.get(STORAGE_KEYS.videoDisclosures);
  return toSafeRecord<DisclosureRecord>(res[STORAGE_KEYS.videoDisclosures]);
}

export async function getChannelDisclosures(): Promise<
  Record<string, ChannelDisclosureStats>
> {
  const res = await browser.storage.local.get(STORAGE_KEYS.channelDisclosures);
  return toSafeRecord<ChannelDisclosureStats>(res[STORAGE_KEYS.channelDisclosures]);
}

export async function recordOfficialDisclosure(input: {
  videoId: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  source: 'watch-data' | 'watch-dom';
}): Promise<DisclosureRecord> {
  const safeVideoId = extractVideoId(input.videoId);
  if (!safeVideoId) {
    throw new Error('Invalid videoId for official disclosure');
  }
  const cid = normalizeChannelId(input.channelId);
  const handle = normalizeHandle(input.handle);
  const now = new Date().toISOString();

  const record = await withStorageLock('disclosures', async () => {
    const [videoMap, channelMap] = await Promise.all([
      getVideoDisclosures(),
      getChannelDisclosures(),
    ]);

    const nextRecord: DisclosureRecord = {
      videoId: safeVideoId,
      channelId: cid,
      handle,
      channelName: input.channelName?.trim() || undefined,
      detectedAt:
        Object.hasOwn(videoMap, safeVideoId) && videoMap[safeVideoId]
          ? videoMap[safeVideoId]!.detectedAt
          : now,
      source: input.source,
    };

    videoMap[safeVideoId] = nextRecord;

    const vKeys = Object.keys(videoMap);
    if (vKeys.length > MAX_VIDEO_DISCLOSURES) {
      const sorted = vKeys.sort((a, b) =>
        (videoMap[a]?.detectedAt ?? '').localeCompare(videoMap[b]?.detectedAt ?? ''),
      );
      const toRemove = sorted.slice(0, vKeys.length - MAX_VIDEO_DISCLOSURES);
      for (const k of toRemove) delete videoMap[k];
    }

    const channelKey = buildCanonicalChannelKey({ channelId: cid, handle });
    if (channelKey && isSafeLookupKey(channelKey)) {
      const existing = Object.hasOwn(channelMap, channelKey)
        ? channelMap[channelKey]
        : undefined;
      const legacyKey = cid && handle ? `@${handle}` : undefined;
      const legacyStats =
        legacyKey && Object.hasOwn(channelMap, legacyKey)
          ? channelMap[legacyKey]
          : undefined;

      const mergedIds = new Set<string>();
      for (const oldVid of legacyStats?.videoIds ?? []) {
        if (isSafeLookupKey(oldVid)) mergedIds.add(oldVid);
      }
      for (const curVid of existing?.videoIds ?? []) {
        if (isSafeLookupKey(curVid)) mergedIds.add(curVid);
      }
      mergedIds.add(safeVideoId);

      channelMap[channelKey] = {
        channelKey,
        channelId: cid ?? existing?.channelId ?? legacyStats?.channelId,
        handle: handle ?? existing?.handle ?? legacyStats?.handle,
        channelName:
          input.channelName?.trim() || existing?.channelName || legacyStats?.channelName,
        videoIds: Array.from(mergedIds).slice(-50),
        lastDetectedAt: now,
      };

      if (legacyKey && legacyStats) {
        delete channelMap[legacyKey];
      }
    }

    const cKeys = Object.keys(channelMap);
    if (cKeys.length > MAX_CHANNEL_DISCLOSURES) {
      const sorted = cKeys.sort((a, b) =>
        (channelMap[a]?.lastDetectedAt ?? '').localeCompare(
          channelMap[b]?.lastDetectedAt ?? '',
        ),
      );
      const toRemove = sorted.slice(0, cKeys.length - MAX_CHANNEL_DISCLOSURES);
      for (const k of toRemove) delete channelMap[k];
    }

    await browser.storage.local.set({
      [STORAGE_KEYS.videoDisclosures]: { ...videoMap },
      [STORAGE_KEYS.channelDisclosures]: { ...channelMap },
    });

    return nextRecord;
  });

  if (cid && handle) {
    await cacheHandleMappings([{ handle, channelId: cid }]);
  }

  return record;
}

export async function clearAllDisclosures(): Promise<void> {
  await withStorageLock('disclosures', async () => {
    await browser.storage.local.set({
      [STORAGE_KEYS.videoDisclosures]: {},
      [STORAGE_KEYS.channelDisclosures]: {},
    });
  });
}

export async function getChannelProfiles(): Promise<Record<string, ChannelProfile>> {
  const res = await browser.storage.local.get(STORAGE_KEYS.channelProfiles);
  return toSafeRecord<ChannelProfile>(res[STORAGE_KEYS.channelProfiles]);
}

function evictChannelProfiles(profiles: Record<string, ChannelProfile>): void {
  const keys = Object.keys(profiles);
  if (keys.length <= MAX_CHANNEL_PROFILES) return;

  const evictable = keys
    .filter((k) => {
      const p = profiles[k];
      return !(p?.manualTopics && p.manualTopics.length > 0);
    })
    .sort((a, b) =>
      (profiles[a]?.lastObservedAt ?? '').localeCompare(
        profiles[b]?.lastObservedAt ?? '',
      ),
    );

  let remaining = keys.length - MAX_CHANNEL_PROFILES;
  for (const k of evictable) {
    if (remaining <= 0) break;
    delete profiles[k];
    remaining--;
  }

  if (remaining > 0) {
    const fallbackOldest = Object.keys(profiles).sort((a, b) =>
      (profiles[a]?.lastObservedAt ?? '').localeCompare(
        profiles[b]?.lastObservedAt ?? '',
      ),
    );
    for (let i = 0; i < remaining && i < fallbackOldest.length; i++) {
      const k = fallbackOldest[i];
      if (k) delete profiles[k];
    }
  }
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
  if (!channelKey || !isSafeLookupKey(channelKey)) return null;

  const nextProfile = await withStorageLock('channelProfiles', async () => {
    const profiles = await getChannelProfiles();
    const handleFallbackKey = handle ? `@${handle}` : undefined;
    const existing =
      (Object.hasOwn(profiles, channelKey) ? profiles[channelKey] : undefined) ??
      (handleFallbackKey && Object.hasOwn(profiles, handleFallbackKey)
        ? profiles[handleFallbackKey]
        : undefined);

    const now = new Date().toISOString();
    const observedYouTubeCategories: Record<string, number> = {};
    if (existing?.observedYouTubeCategories) {
      for (const [k, count] of Object.entries(existing.observedYouTubeCategories)) {
        if (isSafeLookupKey(k) && typeof count === 'number' && Number.isFinite(count)) {
          observedYouTubeCategories[k] = count;
        }
      }
    }

    const rawCat = input.youtubeCategory?.trim();
    if (rawCat && isSafeLookupKey(rawCat)) {
      const prev = Object.hasOwn(observedYouTubeCategories, rawCat)
        ? observedYouTubeCategories[rawCat]!
        : 0;
      observedYouTubeCategories[rawCat] = prev + 1;
    }

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

    const signalSet = new Set<YppSignalId>();
    for (const s of existing?.yppSignals ?? []) {
      const norm = normalizeYppSignal(s);
      if (norm) signalSet.add(norm);
    }
    for (const s of input.yppSignals) {
      const norm = normalizeYppSignal(s);
      if (norm) signalSet.add(norm);
    }

    const paidPromoSet = new Set<string>(existing?.paidPromotionVideoIds ?? []);
    const safeVideoId = extractVideoId(input.ref.videoId);
    if (input.hasPaidPromotion && safeVideoId) {
      paidPromoSet.add(safeVideoId);
    }

    const profile: ChannelProfile = {
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

    profiles[channelKey] = profile;
    if (cid && handleFallbackKey && Object.hasOwn(profiles, handleFallbackKey)) {
      delete profiles[handleFallbackKey];
    }

    evictChannelProfiles(profiles);
    await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: { ...profiles } });
    return profile;
  });

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
  if (!channelKey || !isSafeLookupKey(channelKey)) return null;

  const sanitizedTopics =
    topics !== undefined
      ? Array.from(
          new Set(
            topics
              .map((t) => normalizeTopicId(t))
              .filter((t): t is TopicId => Boolean(t)),
          ),
        )
      : undefined;

  return withStorageLock('channelProfiles', async () => {
    const profiles = await getChannelProfiles();
    const handleFallbackKey = handle ? `@${handle}` : undefined;
    const existing =
      (Object.hasOwn(profiles, channelKey) ? profiles[channelKey] : undefined) ??
      (handleFallbackKey && Object.hasOwn(profiles, handleFallbackKey)
        ? profiles[handleFallbackKey]
        : undefined);

    const nextProfile: ChannelProfile = {
      channelKey,
      channelId: cid ?? existing?.channelId,
      handle: handle ?? existing?.handle,
      channelName: ref.channelName?.trim() || existing?.channelName,
      observedYouTubeCategories: existing?.observedYouTubeCategories ?? {},
      observedTopics: existing?.observedTopics ?? [],
      manualTopics:
        sanitizedTopics && sanitizedTopics.length > 0 ? sanitizedTopics : undefined,
      yppSignals: existing?.yppSignals ?? [],
      monetizationInspected: existing?.monetizationInspected ?? false,
      paidPromotionVideoIds: existing?.paidPromotionVideoIds ?? [],
      lastObservedAt: new Date().toISOString(),
    };

    profiles[channelKey] = nextProfile;
    if (cid && handleFallbackKey && Object.hasOwn(profiles, handleFallbackKey)) {
      delete profiles[handleFallbackKey];
    }

    evictChannelProfiles(profiles);
    await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: { ...profiles } });
    return nextProfile;
  });
}

export async function clearChannelProfiles(): Promise<void> {
  await withStorageLock('channelProfiles', async () => {
    await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: {} });
  });
}

export async function resetAllLocalData(): Promise<void> {
  await Promise.all([
    withStorageLock('settings', async () => {
      await browser.storage.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    }),
    withStorageLock('localRules', async () => {
      await browser.storage.local.set({ [STORAGE_KEYS.localRules]: [] });
    }),
    withStorageLock('handleCache', async () => {
      await browser.storage.local.set({ [STORAGE_KEYS.handleCache]: {} });
    }),
    withStorageLock('disclosures', async () => {
      await browser.storage.local.set({
        [STORAGE_KEYS.videoDisclosures]: {},
        [STORAGE_KEYS.channelDisclosures]: {},
      });
    }),
    withStorageLock('channelProfiles', async () => {
      await browser.storage.local.set({ [STORAGE_KEYS.channelProfiles]: {} });
    }),
  ]);
}
