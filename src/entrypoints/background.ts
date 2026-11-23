import { browser } from 'wxt/browser';
import {
  clearAllListEntries,
  deleteListEntries,
  getAllListEntries,
  getListEntries,
  saveListEntries,
} from '@/lib/idb';
import type {
  ContentBroadcast,
  RefreshListsOutcome,
  RegistrySnapshot,
  RuntimeRequest,
  RuntimeResponse,
  StateSnapshot,
} from '@/lib/messages';
import {
  buildCanonicalChannelKey,
  extractVideoId,
  isSafeLookupKey,
  normalizeChannelId,
  normalizeHandle,
  sanitizeHttpUrl,
  sanitizePublicHttpsUrl,
} from '@/lib/normalize';
import {
  BUNDLED_REGISTRY_ENTRIES,
  COMMUNITY_REGISTRY_FALLBACK_URL,
  COMMUNITY_REGISTRY_URL,
} from '@/lib/registry';
import { findMatchingLocalRule, resolveDecision } from '@/lib/resolver';
import {
  parseFilterListContent,
  parseJsonFilterList,
  parseRegistryJson,
} from '@/lib/schema';
import {
  BUNDLED_AISLIST_TEST_SAMPLE,
  BUNDLED_STARTER_LIST_ID,
  BUNDLED_STARTER_LIST_URL,
} from '@/lib/starter-list';
import {
  cacheHandleMappings,
  clearAllDisclosures,
  clearChannelProfiles,
  DEFAULT_SETTINGS,
  getChannelDisclosures,
  getChannelProfiles,
  getHandleCache,
  getLocalRules,
  getSettings,
  getSubscribedLists,
  getVideoDisclosures,
  recordChannelTelemetry,
  recordOfficialDisclosure,
  removeLocalRule,
  resetAllLocalData,
  sanitizeSettings,
  saveLocalRules,
  saveSubscribedLists,
  setManualChannelTopics,
  STORAGE_KEYS,
  updateSettings,
  upsertLocalRule,
  withStorageLock,
} from '@/lib/storage';
import { normalizeTopicId } from '@/lib/taxonomy';
import type {
  ChannelProfile,
  ListMatchSource,
  LocalRule,
  PageStats,
  ParsedListEntry,
  PersonalExportV1,
  ResolvedDecision,
  SubscribedListMeta,
  TopicId,
  TopicRuleAction,
  UserSettings,
} from '@/lib/types';

const REFRESH_ALARM_NAME = 'noisegate_refresh_lists';
const FETCH_TIMEOUT_MS = 15_000;

interface LookupIndex {
  byChannelId: Map<string, ListMatchSource[]>;
  byHandle: Map<string, ListMatchSource[]>;
}

let lookupIndex: LookupIndex = {
  byChannelId: new Map(),
  byHandle: new Map(),
};
let indexLoaded = false;
let initPromise: Promise<void> | null = null;
let rebuildGeneration = 0;

const tabStats = new Map<number, PageStats>();

function tabSessionKey(tabId: number): string {
  return `ng_tab_stats_${tabId}`;
}

async function setTabStats(tabId: number, stats: PageStats): Promise<void> {
  tabStats.set(tabId, stats);
  try {
    const sessionStore = (browser.storage as { session?: typeof browser.storage.local })
      .session;
    if (sessionStore) {
      await sessionStore.set({ [tabSessionKey(tabId)]: stats });
    }
  } catch {
  }
}

async function getTabStats(tabId: number): Promise<PageStats | null> {
  const mem = tabStats.get(tabId);
  if (mem) return mem;
  try {
    const sessionStore = (browser.storage as { session?: typeof browser.storage.local })
      .session;
    if (sessionStore) {
      const key = tabSessionKey(tabId);
      const res = await sessionStore.get(key);
      const stored = res[key] as PageStats | undefined;
      if (stored && typeof stored.scannedCards === 'number') {
        tabStats.set(tabId, stored);
        return stored;
      }
    }
  } catch {
  }
  return null;
}

async function deleteTabStats(tabId: number): Promise<void> {
  tabStats.delete(tabId);
  try {
    const sessionStore = (browser.storage as { session?: typeof browser.storage.local })
      .session;
    if (sessionStore) {
      await sessionStore.remove(tabSessionKey(tabId));
    }
  } catch {
  }
}

function addMatchToMap(
  map: Map<string, ListMatchSource[]>,
  key: string,
  match: ListMatchSource,
): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, [match]);
    return;
  }
  if (!existing.some((m) => m.listId === match.listId)) {
    existing.push(match);
  }
}

async function rebuildLookupIndex(): Promise<void> {
  return withStorageLock('lookupIndex', async () => {
    const myGen = ++rebuildGeneration;
    const lists = await getSubscribedLists();
    let allEntries: Record<string, ParsedListEntry[]> = Object.create(null);
    try {
      allEntries = await getAllListEntries();
    } catch {
      allEntries = Object.create(null);
    }

    if (myGen !== rebuildGeneration) return;

    const byChannelId = new Map<string, ListMatchSource[]>();
    const byHandle = new Map<string, ListMatchSource[]>();

    for (const list of lists) {
      if (!list.enabled) continue;
      const entries = Object.hasOwn(allEntries, list.id)
        ? allEntries[list.id] ?? []
        : [];
      for (const entry of entries) {
        const match: ListMatchSource = {
          listId: list.id,
          listName: list.name,
          action: list.defaultAction,
          category: entry.category,
          topics: entry.topics ?? [],
          signals: entry.signals ?? [],
          note: entry.note,
          evidenceUrl: entry.evidenceUrl,
          submissionUrl: list.submissionUrl,
          removalUrl: list.removalUrl,
        };
        if (entry.keyType === 'channelId') {
          addMatchToMap(byChannelId, entry.key, match);
        } else {
          addMatchToMap(byHandle, entry.key, match);
        }
      }
    }

    lookupIndex = { byChannelId, byHandle };
    indexLoaded = true;
  });
}

async function seedBundledStarterList(): Promise<SubscribedListMeta> {
  const parsed = parseJsonFilterList(BUNDLED_AISLIST_TEST_SAMPLE);
  if (!parsed.ok) {
    throw new Error(`Bundled starter list invalid: ${parsed.error}`);
  }

  await saveListEntries(BUNDLED_STARTER_LIST_ID, parsed.list.entries);

  const meta: SubscribedListMeta = {
    id: BUNDLED_STARTER_LIST_ID,
    name: parsed.list.name,
    description: parsed.list.description,
    homepage: parsed.list.homepage,
    submissionUrl: parsed.list.submissionUrl,
    removalUrl: parsed.list.removalUrl,
    url: BUNDLED_STARTER_LIST_URL,
    kind: 'community',
    bundled: true,
    enabled: true,
    defaultAction: 'label',
    entryCount: parsed.list.entries.length,
    format: 'json-v1',
    lastFetchedAt: new Date().toISOString(),
    sourceUpdatedAt: parsed.list.updatedAt,
  };

  await withStorageLock('subscribedLists', async () => {
    const lists = await getSubscribedLists();
    const existingIdx = lists.findIndex((l) => l.id === BUNDLED_STARTER_LIST_ID);
    if (existingIdx >= 0) {
      lists[existingIdx] = {
        ...meta,
        enabled: lists[existingIdx]!.enabled,
        defaultAction: lists[existingIdx]!.defaultAction,
      };
    } else {
      lists.unshift(meta);
    }
    await saveSubscribedLists(lists);
  });

  return meta;
}

async function scheduleRefreshAlarm(force = false): Promise<void> {
  const settings = await getSettings();
  const hours = Math.max(1, Math.min(168, settings.autoRefreshHours || 24));
  const periodInMinutes = hours * 60;

  if (!force) {
    try {
      const existing = await browser.alarms.get(REFRESH_ALARM_NAME);
      if (existing && existing.periodInMinutes === periodInMinutes) {
        return;
      }
    } catch {
    }
  }

  await browser.alarms.clear(REFRESH_ALARM_NAME);
  await browser.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes });
}

async function ensureInitialized(): Promise<void> {
  if (indexLoaded) return;
  if (!initPromise) {
    initPromise = (async () => {
      const initFlag = await browser.storage.local.get(STORAGE_KEYS.initialized);
      if (!initFlag[STORAGE_KEYS.initialized]) {
        const existingSettings = await browser.storage.local.get(STORAGE_KEYS.settings);
        if (!existingSettings[STORAGE_KEYS.settings]) {
          await browser.storage.local.set({
            [STORAGE_KEYS.settings]: DEFAULT_SETTINGS,
          });
        }
        try {
          await seedBundledStarterList();
          await browser.storage.local.set({ [STORAGE_KEYS.initialized]: true });
        } catch {
        }
      } else {
        try {
          const lists = await getSubscribedLists();
          const bundledMeta = lists.find(
            (l) => l.bundled || l.id === BUNDLED_STARTER_LIST_ID,
          );
          if (bundledMeta) {
            const entries = await getListEntries(bundledMeta.id);
            if (entries.length === 0) {
              const parsed = parseJsonFilterList(BUNDLED_AISLIST_TEST_SAMPLE);
              if (parsed.ok) {
                await saveListEntries(bundledMeta.id, parsed.list.entries);
              }
            }
          }
        } catch {
        }
      }

      await rebuildLookupIndex();
      await scheduleRefreshAlarm(false);
    })().finally(() => {
      initPromise = null;
    });
  }
  await initPromise;
}

async function notifyYouTubeTabs(message: ContentBroadcast): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
    await Promise.allSettled(
      tabs
        .filter((t): t is typeof t & { id: number } => typeof t.id === 'number')
        .map((t) => browser.tabs.sendMessage(t.id, message)),
    );
  } catch {
  }
}

async function updateTabBadge(tabId: number, stats: PageStats): Promise<void> {
  try {
    const actionApi = browser.action ?? browser.browserAction;
    if (!actionApi) return;

    const flagged = stats.hiddenCount + stats.dimmedCount + stats.labeledCount;
    if (flagged > 0) {
      await actionApi.setBadgeText({
        tabId,
        text: flagged > 99 ? '99+' : String(flagged),
      });
      await actionApi.setBadgeBackgroundColor({
        tabId,
        color: stats.hiddenCount > 0 ? '#dc2626' : '#334155',
      });
    } else {
      await actionApi.setBadgeText({ tabId, text: '' });
    }
  } catch {
  }
}

function makeUniqueListId(baseId: string, usedIds: Set<string>): string {
  const clean = isSafeLookupKey(baseId) && baseId.trim() ? baseId.trim() : 'custom-list';
  if (!usedIds.has(clean)) return clean;
  const suffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 6)
      : Math.random().toString(36).slice(2, 8);
  return `${clean}-${suffix}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAndStoreExternalList(
  url: string,
  options: {
    existingId?: string;
    listId?: string;
    defaultAction: TopicRuleAction;
    enabled: boolean;
    customName?: string;
    kind?: 'topics' | 'signals' | 'community';
    submissionUrl?: string;
    removalUrl?: string;
    skipBroadcast?: boolean;
  },
): Promise<SubscribedListMeta> {
  const safeUrl = sanitizePublicHttpsUrl(url);
  if (!safeUrl) {
    throw new Error('Please enter a valid public HTTPS URL.');
  }

  const response = await fetchWithTimeout(safeUrl, {
    cache: 'no-cache',
    headers: { Accept: 'application/json, text/plain, */*' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
  }

  const rawText = await response.text();
  const parsed = parseFilterListContent(rawText, safeUrl);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const safeSubmission = sanitizeHttpUrl(options.submissionUrl);
  const safeRemoval = sanitizeHttpUrl(options.removalUrl);
  const responseEtag = response.headers.get('etag') ?? undefined;

  const meta = await withStorageLock('subscribedLists', async () => {
    const lists = await getSubscribedLists();
    const existingByUrl = lists.find((l) => l.url === safeUrl);
    const existingByBundledAlias =
      options.listId === BUNDLED_STARTER_LIST_ID
        ? lists.find((l) => l.id === BUNDLED_STARTER_LIST_ID)
        : undefined;
    const existingTarget = existingByUrl ?? existingByBundledAlias;

    let listId = options.existingId ?? existingTarget?.id;
    if (!listId) {
      const requestedId = options.listId?.trim() || parsed.list.listId;
      const used = new Set(lists.map((l) => l.id));
      listId = makeUniqueListId(requestedId, used);
    }

    await saveListEntries(listId, parsed.list.entries);

    const nextMeta: SubscribedListMeta = {
      id: listId,
      name: options.customName?.trim() || existingTarget?.name || parsed.list.name,
      description: parsed.list.description ?? existingTarget?.description,
      homepage: parsed.list.homepage ?? existingTarget?.homepage,
      submissionUrl: parsed.list.submissionUrl ?? safeSubmission ?? existingTarget?.submissionUrl,
      removalUrl: parsed.list.removalUrl ?? safeRemoval ?? existingTarget?.removalUrl,
      url: safeUrl,
      kind: options.kind ?? existingTarget?.kind,
      bundled: false,
      enabled: options.enabled,
      defaultAction: options.defaultAction,
      entryCount: parsed.list.entries.length,
      format: parsed.list.format,
      etag: responseEtag,
      lastFetchedAt: new Date().toISOString(),
      sourceUpdatedAt: parsed.list.updatedAt,
      lastError: undefined,
    };

    const existingIdx = lists.findIndex((l) => l.id === listId || l.url === safeUrl);
    if (existingIdx >= 0) {
      lists[existingIdx] = nextMeta;
    } else {
      lists.push(nextMeta);
    }

    await saveSubscribedLists(lists);
    return nextMeta;
  });

  await rebuildLookupIndex();
  if (!options.skipBroadcast) {
    await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
  }
  return meta;
}

interface RefreshCandidateResult {
  id: string;
  patch: Partial<SubscribedListMeta>;
  entries?: ParsedListEntry[];
  changed: boolean;
  error?: string;
}

async function refreshLists(targetListId?: string): Promise<RefreshListsOutcome> {
  const initialLists = await getSubscribedLists();
  const candidates = initialLists.filter((list) =>
    targetListId ? list.id === targetListId : list.enabled,
  );

  const results = new Map<string, RefreshCandidateResult>();
  const errors: Array<{ listId: string; name: string; error: string }> = [];

  for (const list of candidates) {
    if (list.bundled || list.url === BUNDLED_STARTER_LIST_URL) {
      const parsed = parseJsonFilterList(BUNDLED_AISLIST_TEST_SAMPLE);
      if (parsed.ok) {
        results.set(list.id, {
          id: list.id,
          entries: parsed.list.entries,
          changed: true,
          patch: {
            entryCount: parsed.list.entries.length,
            lastFetchedAt: new Date().toISOString(),
            lastError: undefined,
          },
        });
      }
      continue;
    }

    const safeUrl = sanitizePublicHttpsUrl(list.url);
    if (!safeUrl) {
      const errMsg = 'Blocked non-HTTPS or private filter list URL.';
      errors.push({ listId: list.id, name: list.name, error: errMsg });
      results.set(list.id, {
        id: list.id,
        changed: false,
        error: errMsg,
        patch: { lastError: errMsg },
      });
      continue;
    }

    try {
      const cachedEntries = await getListEntries(list.id).catch(() => []);
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, */*',
      };
      if (list.etag && cachedEntries.length > 0) {
        headers['If-None-Match'] = list.etag;
      }

      const response = await fetchWithTimeout(safeUrl, {
        cache: 'no-cache',
        headers,
      });

      if (response.status === 304) {
        results.set(list.id, {
          id: list.id,
          changed: false,
          patch: {
            lastFetchedAt: new Date().toISOString(),
            lastError: undefined,
          },
        });
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const rawText = await response.text();
      const parsed = parseFilterListContent(rawText, safeUrl);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      results.set(list.id, {
        id: list.id,
        entries: parsed.list.entries,
        changed: true,
        patch: {
          entryCount: parsed.list.entries.length,
          format: parsed.list.format,
          description: parsed.list.description ?? list.description,
          homepage: parsed.list.homepage ?? list.homepage,
          submissionUrl: parsed.list.submissionUrl ?? list.submissionUrl,
          removalUrl: parsed.list.removalUrl ?? list.removalUrl,
          etag: response.headers.get('etag') ?? undefined,
          sourceUpdatedAt: parsed.list.updatedAt,
          lastFetchedAt: new Date().toISOString(),
          lastError: undefined,
        },
      });
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Request timed out'
            : err.message
          : 'Fetch failed';
      errors.push({ listId: list.id, name: list.name, error: errMsg });
      results.set(list.id, {
        id: list.id,
        changed: false,
        error: errMsg,
        patch: { lastError: errMsg },
      });
    }
  }

  let anyContentChanged = false;

  const updated = await withStorageLock('subscribedLists', async () => {
    const latestLists = await getSubscribedLists();
    const merged: SubscribedListMeta[] = [];

    for (const current of latestLists) {
      const outcome = results.get(current.id);
      if (!outcome) {
        merged.push(current);
        continue;
      }
      if (outcome.entries) {
        await saveListEntries(current.id, outcome.entries);
        anyContentChanged = true;
      }
      merged.push({
        ...current,
        ...outcome.patch,
      });
    }

    await saveSubscribedLists(merged);
    return merged;
  });

  if (anyContentChanged) {
    await rebuildLookupIndex();
    await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
  }

  return {
    lists: updated,
    failedCount: errors.length,
    errors,
  };
}

async function handleFetchRegistry(): Promise<RegistrySnapshot> {
  for (const url of [COMMUNITY_REGISTRY_URL, COMMUNITY_REGISTRY_FALLBACK_URL]) {
    try {
      const res = await fetchWithTimeout(url, {
        cache: 'no-cache',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const json: unknown = await res.json();
      const entries = parseRegistryJson(json);
      if (entries.length > 0) {
        return { entries, source: 'live' };
      }
    } catch {
    }
  }
  return { entries: BUNDLED_REGISTRY_ENTRIES, source: 'fallback' };
}

function findProfileForChannel(
  profiles: Record<string, ChannelProfile>,
  cid?: string,
  handle?: string,
  channelKey?: string,
): ChannelProfile | undefined {
  if (cid && Object.hasOwn(profiles, cid)) return profiles[cid];
  if (handle && Object.hasOwn(profiles, `@${handle}`)) {
    return profiles[`@${handle}`];
  }
  if (channelKey && Object.hasOwn(profiles, channelKey)) {
    return profiles[channelKey];
  }
  return undefined;
}

async function handleEvaluateBatch(
  req: Extract<RuntimeRequest, { type: 'EVALUATE_BATCH' }>,
): Promise<Record<string, ResolvedDecision>> {
  await ensureInitialized();

  if (Array.isArray(req.handleMappings) && req.handleMappings.length > 0) {
    await cacheHandleMappings(req.handleMappings);
  }

  const [
    settings,
    localRules,
    handleCache,
    videoDisclosures,
    channelDisclosures,
    channelProfiles,
  ] = await Promise.all([
    getSettings(),
    getLocalRules(),
    getHandleCache(),
    getVideoDisclosures(),
    getChannelDisclosures(),
    getChannelProfiles(),
  ]);

  const localById = Object.create(null) as Record<string, LocalRule>;
  const localByHandle = Object.create(null) as Record<string, LocalRule>;
  for (const rule of localRules) {
    const cid = normalizeChannelId(rule.channelId ?? rule.id);
    if (cid) localById[cid] = rule;
    const h = normalizeHandle(rule.handle ?? rule.id);
    if (h) localByHandle[h] = rule;
  }

  const results: Record<string, ResolvedDecision> = {};
  const items = Array.isArray(req.items) ? req.items : [];

  for (const item of items) {
    if (!item || typeof item.requestId !== 'string' || !isSafeLookupKey(item.requestId)) {
      continue;
    }

    const normalizedHandle = normalizeHandle(item.handle);
    let normalizedCid = normalizeChannelId(item.channelId);

    if (
      !normalizedCid &&
      normalizedHandle &&
      Object.hasOwn(handleCache, normalizedHandle)
    ) {
      normalizedCid = handleCache[normalizedHandle];
    }

    const combinedMatches: ListMatchSource[] = [];
    const seenListIds = new Set<string>();

    if (normalizedCid) {
      const cidMatches = lookupIndex.byChannelId.get(normalizedCid);
      if (cidMatches) {
        for (const m of cidMatches) {
          if (!seenListIds.has(m.listId)) {
            seenListIds.add(m.listId);
            combinedMatches.push(m);
          }
        }
      }
    }

    if (normalizedHandle) {
      const handleMatches = lookupIndex.byHandle.get(normalizedHandle);
      if (handleMatches) {
        for (const m of handleMatches) {
          if (!seenListIds.has(m.listId)) {
            seenListIds.add(m.listId);
            combinedMatches.push(m);
          }
        }
      }
    }

    const localRule = findMatchingLocalRule(
      { channelId: normalizedCid, handle: normalizedHandle },
      localById,
      localByHandle,
    );

    const safeVideoId = extractVideoId(item.videoId);
    const videoDisclosure =
      safeVideoId && Object.hasOwn(videoDisclosures, safeVideoId)
        ? videoDisclosures[safeVideoId]
        : undefined;

    const channelKey = buildCanonicalChannelKey({
      channelId: normalizedCid,
      handle: normalizedHandle,
    });

    const channelDisclosure =
      (normalizedCid && Object.hasOwn(channelDisclosures, normalizedCid)
        ? channelDisclosures[normalizedCid]
        : undefined) ??
      (normalizedHandle && Object.hasOwn(channelDisclosures, `@${normalizedHandle}`)
        ? channelDisclosures[`@${normalizedHandle}`]
        : undefined) ??
      (channelKey && Object.hasOwn(channelDisclosures, channelKey)
        ? channelDisclosures[channelKey]
        : undefined);

    const channelProfile = findProfileForChannel(
      channelProfiles,
      normalizedCid,
      normalizedHandle,
      channelKey,
    );

    results[item.requestId] = resolveDecision({
      ref: {
        channelId: normalizedCid,
        handle: normalizedHandle,
        channelName:
          typeof item.channelName === 'string' ? item.channelName : undefined,
        videoId: safeVideoId,
      },
      settings,
      localRule,
      listMatches: combinedMatches,
      videoDisclosure,
      channelDisclosure,
      channelProfile,
    });
  }

  return results;
}

async function handleGetSnapshot(
  tabId?: number,
  includeDetails = true,
): Promise<StateSnapshot> {
  await ensureInitialized();

  let targetTabId = tabId;
  if (typeof targetTabId !== 'number') {
    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    targetTabId = activeTabs[0]?.id;
  }

  const [settings, localRules, subscribedLists, videoDisclosuresMap, pageStats] =
    await Promise.all([
      getSettings(),
      getLocalRules(),
      getSubscribedLists(),
      getVideoDisclosures(),
      typeof targetTabId === 'number' ? getTabStats(targetTabId) : Promise.resolve(null),
    ]);

  let channelDisclosures = [] as StateSnapshot['channelDisclosures'];
  let channelProfiles = [] as StateSnapshot['channelProfiles'];

  if (includeDetails) {
    const [channelDisclosuresMap, channelProfilesMap] = await Promise.all([
      getChannelDisclosures(),
      getChannelProfiles(),
    ]);

    channelDisclosures = Object.values(channelDisclosuresMap).sort((a, b) =>
      b.lastDetectedAt.localeCompare(a.lastDetectedAt),
    );
    channelProfiles = Object.values(channelProfilesMap).sort((a, b) =>
      b.lastObservedAt.localeCompare(a.lastObservedAt),
    );
  }

  return {
    settings,
    localRules,
    subscribedLists,
    channelDisclosures,
    channelProfiles,
    totalVideoDisclosures: Object.keys(videoDisclosuresMap).length,
    pageStats,
  };
}

async function handleExportData(): Promise<PersonalExportV1> {
  const [settings, localRules, subscribedLists, channelProfilesMap] = await Promise.all([
    getSettings(),
    getLocalRules(),
    getSubscribedLists(),
    getChannelProfiles(),
  ]);

  const manualChannelTopics = Object.values(channelProfilesMap)
    .filter((p) => p.manualTopics && p.manualTopics.length > 0)
    .map((p) => ({
      channelKey: p.channelKey,
      channelId: p.channelId,
      handle: p.handle,
      channelName: p.channelName,
      topics: p.manualTopics!,
    }));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: 'NoiseGate',
    settings,
    localRules,
    subscribedLists: subscribedLists.map((l) => ({
      id: l.id,
      name: l.name,
      url: l.url,
      enabled: l.enabled,
      defaultAction: l.defaultAction,
      kind: l.kind,
      submissionUrl: l.submissionUrl,
      removalUrl: l.removalUrl,
      bundled: l.bundled,
    })),
    manualChannelTopics:
      manualChannelTopics.length > 0 ? manualChannelTopics : undefined,
  };
}

async function handleImportData(
  payload: unknown,
  mode: 'merge' | 'replace',
): Promise<{ importedRules: number; importedLists: number; failedLists: string[] }> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Import file must be a valid JSON object.');
  }

  const obj = payload as Record<string, unknown>;

  if (
    (obj.schemaVersion === 1 || obj.schemaVersion === 2) &&
    (obj.channels || obj.handles) &&
    !obj.localRules
  ) {
    const parsed = parseJsonFilterList(obj);
    if (!parsed.ok) throw new Error(parsed.error);

    await withStorageLock('localRules', async () => {
      const existing = mode === 'replace' ? [] : await getLocalRules();
      const now = new Date().toISOString();
      const converted: LocalRule[] = parsed.list.entries.map((e: ParsedListEntry) => ({
        id: e.keyType === 'channelId' ? e.key : `@${e.key}`,
        channelId: e.keyType === 'channelId' ? e.key : undefined,
        handle: e.keyType === 'handle' ? e.key : undefined,
        action: 'label',
        category: (e.category as LocalRule['category']) || 'ai-synthetic',
        topics: e.topics.length > 0 ? e.topics : undefined,
        note: e.note,
        createdAt: now,
        updatedAt: now,
      }));

      const byId = new Map<string, LocalRule>();
      for (const r of existing) byId.set(r.id, r);
      for (const r of converted) byId.set(r.id, r);
      await saveLocalRules(Array.from(byId.values()));
    });

    await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
    return {
      importedRules: parsed.list.entries.length,
      importedLists: 0,
      failedLists: [],
    };
  }

  if (obj.schemaVersion !== 1 || (obj.app !== 'NoiseGate' && obj.app !== 'TubeSignal')) {
    throw new Error(
      'Unrecognized backup format. Expected NoiseGate export v1 or Filter List JSON v1/v2.',
    );
  }

  let importedRules = 0;
  let importedLists = 0;
  const failedLists: string[] = [];

  if (obj.settings && typeof obj.settings === 'object' && !Array.isArray(obj.settings)) {
    if (mode === 'replace') {
      const sanitized = sanitizeSettings(obj.settings);
      await withStorageLock('settings', async () => {
        await browser.storage.local.set({ [STORAGE_KEYS.settings]: sanitized });
      });
    } else {
      const raw = obj.settings as Partial<UserSettings>;
      const patch: Partial<UserSettings> = {};
      if (typeof raw.enabled === 'boolean') patch.enabled = raw.enabled;
      if (raw.disclosureAction !== undefined) patch.disclosureAction = raw.disclosureAction;
      if (typeof raw.propagateChannelDisclosure === 'boolean') {
        patch.propagateChannelDisclosure = raw.propagateChannelDisclosure;
      }
      if (raw.paidPromotionAction !== undefined) {
        patch.paidPromotionAction = raw.paidPromotionAction;
      }
      if (raw.monetizedAction !== undefined) {
        patch.monetizedAction = raw.monetizedAction;
      }
      if (typeof raw.showMonetizationIndicator === 'boolean') {
        patch.showMonetizationIndicator = raw.showMonetizationIndicator;
      }
      if (typeof raw.showTopicIndicator === 'boolean') {
        patch.showTopicIndicator = raw.showTopicIndicator;
      }
      if (raw.topicRules && typeof raw.topicRules === 'object' && !Array.isArray(raw.topicRules)) {
        patch.topicRules = raw.topicRules;
      }
      if (typeof raw.autoRefreshHours === 'number') {
        patch.autoRefreshHours = raw.autoRefreshHours;
      }
      if (typeof raw.showCardHoverButton === 'boolean') {
        patch.showCardHoverButton = raw.showCardHoverButton;
      }
      if (typeof raw.communitySubmissionRepo === 'string') {
        patch.communitySubmissionRepo = raw.communitySubmissionRepo;
      }
      await updateSettings(patch);
    }
    await scheduleRefreshAlarm(true);
  }

  if (Array.isArray(obj.localRules)) {
    await withStorageLock('localRules', async () => {
      const existing = mode === 'replace' ? [] : await getLocalRules();
      const byId = new Map<string, LocalRule>();
      for (const r of existing) byId.set(r.id, r);

      for (const rawRule of obj.localRules as unknown[]) {
        if (!rawRule || typeof rawRule !== 'object') continue;
        const r = rawRule as Partial<LocalRule>;
        const cid = normalizeChannelId(r.channelId ?? r.id);
        const handle = normalizeHandle(r.handle ?? r.id);
        const id = buildCanonicalChannelKey({ channelId: cid, handle });
        if (!id) continue;
        const action =
          r.action === 'label' ||
          r.action === 'dim' ||
          r.action === 'hide' ||
          r.action === 'allow'
            ? r.action
            : 'label';
        const validTopics = Array.isArray(r.topics)
          ? r.topics
              .map((t) => (typeof t === 'string' ? normalizeTopicId(t) : undefined))
              .filter((t): t is TopicId => Boolean(t))
          : undefined;
        const safeCategory =
          typeof r.category === 'string' &&
          r.category.trim() &&
          isSafeLookupKey(r.category.trim())
            ? (r.category.trim() as LocalRule['category'])
            : 'custom';

        for (const [k, prev] of byId.entries()) {
          if (
            k === id ||
            (cid && prev.channelId === cid) ||
            (handle && prev.handle === handle)
          ) {
            byId.delete(k);
          }
        }

        byId.set(id, {
          id,
          channelId: cid,
          handle,
          channelName:
            typeof r.channelName === 'string' ? r.channelName : undefined,
          action,
          category: safeCategory,
          topics: validTopics && validTopics.length > 0 ? validTopics : undefined,
          note: typeof r.note === 'string' ? r.note : undefined,
          createdAt:
            typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        importedRules++;
      }

      await saveLocalRules(Array.from(byId.values()));
    });
  }

  if (Array.isArray(obj.manualChannelTopics)) {
    for (const rawItem of obj.manualChannelTopics) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const item = rawItem as {
        channelId?: string;
        handle?: string;
        channelName?: string;
        topics?: unknown;
      };
      if (!Array.isArray(item.topics)) continue;
      const validTopics = item.topics
        .map((t) => (typeof t === 'string' ? normalizeTopicId(t) : undefined))
        .filter((t): t is TopicId => Boolean(t));
      if (validTopics.length > 0) {
        await setManualChannelTopics(
          {
            channelId: item.channelId,
            handle: item.handle,
            channelName: item.channelName,
          },
          validTopics,
        );
      }
    }
  }

  if (Array.isArray(obj.subscribedLists)) {
    interface PreparedRemoteList {
      meta: SubscribedListMeta;
      entries: ParsedListEntry[];
    }
    const preparedRemotes: PreparedRemoteList[] = [];
    let bundledConfig: Partial<SubscribedListMeta> | null = null;

    for (const rawList of obj.subscribedLists) {
      if (!rawList || typeof rawList !== 'object') continue;
      const l = rawList as Partial<SubscribedListMeta>;
      const action: TopicRuleAction =
        l.defaultAction === 'hide' ||
        l.defaultAction === 'dim' ||
        l.defaultAction === 'pass'
          ? l.defaultAction
          : 'label';

      if (l.bundled || l.url === BUNDLED_STARTER_LIST_URL) {
        bundledConfig = { ...l, defaultAction: action };
      } else if (typeof l.url === 'string') {
        const safeUrl = sanitizePublicHttpsUrl(l.url);
        if (!safeUrl) {
          failedLists.push(l.url);
          continue;
        }
        try {
          const response = await fetchWithTimeout(safeUrl, {
            cache: 'no-cache',
            headers: { Accept: 'application/json, text/plain, */*' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const rawText = await response.text();
          const parsed = parseFilterListContent(rawText, safeUrl);
          if (!parsed.ok) throw new Error(parsed.error);

          preparedRemotes.push({
            entries: parsed.list.entries,
            meta: {
              id: l.id && isSafeLookupKey(l.id) ? l.id : parsed.list.listId,
              name: l.name?.trim() || parsed.list.name,
              description: parsed.list.description,
              homepage: parsed.list.homepage,
              submissionUrl:
                parsed.list.submissionUrl ?? sanitizeHttpUrl(l.submissionUrl),
              removalUrl: parsed.list.removalUrl ?? sanitizeHttpUrl(l.removalUrl),
              url: safeUrl,
              kind: l.kind,
              bundled: false,
              enabled: l.enabled ?? true,
              defaultAction: action,
              entryCount: parsed.list.entries.length,
              format: parsed.list.format,
              etag: response.headers.get('etag') ?? undefined,
              lastFetchedAt: new Date().toISOString(),
              sourceUpdatedAt: parsed.list.updatedAt,
            },
          });
        } catch {
          failedLists.push(safeUrl);
        }
      }
    }

    const oldLists = mode === 'replace' ? await getSubscribedLists() : [];
    const oldIdsToDelete =
      mode === 'replace'
        ? oldLists
            .filter(
              (o) =>
                !o.bundled &&
                !preparedRemotes.some((p) => p.meta.id === o.id || p.meta.url === o.url),
            )
            .map((o) => o.id)
        : [];

    for (const oldId of oldIdsToDelete) {
      await deleteListEntries(oldId);
    }

    await withStorageLock('subscribedLists', async () => {
      const base = mode === 'replace' ? [] : await getSubscribedLists();
      const used = new Set(base.map((x) => x.id));

      for (const remote of preparedRemotes) {
        const existingIdx = base.findIndex(
          (x) => x.url === remote.meta.url || x.id === remote.meta.id,
        );
        if (existingIdx >= 0) {
          const keepId = base[existingIdx]!.id;
          await saveListEntries(keepId, remote.entries);
          base[existingIdx] = { ...remote.meta, id: keepId };
        } else {
          const finalId = makeUniqueListId(remote.meta.id, used);
          used.add(finalId);
          await saveListEntries(finalId, remote.entries);
          base.push({ ...remote.meta, id: finalId });
        }
        importedLists++;
      }

      await saveSubscribedLists(base);
    });

    if (bundledConfig) {
      await seedBundledStarterList();
      await withStorageLock('subscribedLists', async () => {
        const current = await getSubscribedLists();
        const idx = current.findIndex((x) => x.id === BUNDLED_STARTER_LIST_ID);
        if (idx >= 0) {
          current[idx]!.enabled = bundledConfig!.enabled ?? true;
          current[idx]!.defaultAction = bundledConfig!.defaultAction ?? 'label';
          await saveSubscribedLists(current);
        }
      });
      importedLists++;
    }
  }

  await rebuildLookupIndex();
  await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
  return { importedRules, importedLists, failedLists };
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void ensureInitialized().catch(() => {});
  });

  browser.runtime.onStartup.addListener(() => {
    void ensureInitialized().catch(() => {});
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM_NAME) {
      void ensureInitialized()
        .then(() => refreshLists())
        .catch(() => {});
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void deleteTabStats(tabId);
  });

  browser.runtime.onMessage.addListener(
    (
      message: unknown,
      sender: { tab?: { id?: number } },
      sendResponse: (response: RuntimeResponse) => void,
    ) => {
      const req = message as RuntimeRequest | undefined;
      if (!req || typeof req !== 'object' || typeof req.type !== 'string') {
        return false;
      }

      const handle = async (): Promise<RuntimeResponse> => {
        await ensureInitialized();

        switch (req.type) {
          case 'EVALUATE_BATCH': {
            const data = await handleEvaluateBatch(req);
            return { ok: true, data };
          }

          case 'REPORT_DISCLOSURE': {
            const record = await recordOfficialDisclosure({
              videoId: req.videoId,
              channelId: req.channelId,
              handle: req.handle,
              channelName: req.channelName,
              source: req.source,
            });
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: record };
          }

          case 'REPORT_CHANNEL_TELEMETRY': {
            const profile = await recordChannelTelemetry({
              ref: req.ref,
              youtubeCategory: req.youtubeCategory,
              yppSignals: Array.isArray(req.yppSignals) ? req.yppSignals : [],
              monetizationInspected: Boolean(req.monetizationInspected),
              hasPaidPromotion: Boolean(req.hasPaidPromotion),
            });
            if (profile) {
              await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            }
            return { ok: true, data: profile };
          }

          case 'SET_CHANNEL_TOPICS': {
            const profile = await setManualChannelTopics(req.ref, req.topics);
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: profile };
          }

          case 'UPSERT_LOCAL_RULE': {
            const rule = await upsertLocalRule({
              ref: req.ref,
              action: req.action,
              category: req.category,
              topics: req.topics,
              note: req.note,
            });
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: rule };
          }

          case 'REMOVE_LOCAL_RULE': {
            const removed = await removeLocalRule(req.ref);
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: { removed } };
          }

          case 'UPDATE_PAGE_STATS': {
            const tabId = sender.tab?.id;
            if (typeof tabId === 'number') {
              await setTabStats(tabId, req.stats);
              await updateTabBadge(tabId, req.stats);
            }
            return { ok: true, data: true };
          }

          case 'GET_STATE_SNAPSHOT': {
            const snapshot = await handleGetSnapshot(
              req.tabId,
              req.includeDetails ?? true,
            );
            return { ok: true, data: snapshot };
          }

          case 'UPDATE_SETTINGS': {
            const next = await updateSettings(req.patch);
            if (typeof req.patch.autoRefreshHours === 'number') {
              await scheduleRefreshAlarm(true);
            }
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: next };
          }

          case 'ADD_FILTER_LIST': {
            const meta = await fetchAndStoreExternalList(req.url, {
              listId: req.listId,
              defaultAction: req.defaultAction,
              enabled: true,
              customName: req.customName,
              kind: req.kind,
              submissionUrl: req.submissionUrl,
              removalUrl: req.removalUrl,
            });
            return { ok: true, data: meta };
          }

          case 'UPDATE_FILTER_LIST': {
            const updatedMeta = await withStorageLock('subscribedLists', async () => {
              const lists = await getSubscribedLists();
              const idx = lists.findIndex((l) => l.id === req.listId);
              if (idx < 0) return null;
              const current = lists[idx]!;
              const next: SubscribedListMeta = {
                ...current,
                enabled: req.patch.enabled ?? current.enabled,
                defaultAction: req.patch.defaultAction ?? current.defaultAction,
                name: req.patch.name?.trim() || current.name,
              };
              lists[idx] = next;
              await saveSubscribedLists(lists);
              return next;
            });
            if (!updatedMeta) {
              return { ok: false, error: 'Filter list not found.' };
            }
            await rebuildLookupIndex();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: updatedMeta };
          }

          case 'REMOVE_FILTER_LIST': {
            const removed = await withStorageLock('subscribedLists', async () => {
              const lists = await getSubscribedLists();
              const next = lists.filter((l) => l.id !== req.listId);
              await saveSubscribedLists(next);
              return next.length !== lists.length;
            });
            await deleteListEntries(req.listId);
            await rebuildLookupIndex();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: { removed } };
          }

          case 'REFRESH_FILTER_LIST': {
            const outcome = await refreshLists(req.listId);
            return { ok: true, data: outcome };
          }

          case 'RESTORE_STARTER_LIST': {
            const meta = await seedBundledStarterList();
            await rebuildLookupIndex();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: meta };
          }

          case 'FETCH_REGISTRY': {
            const registry = await handleFetchRegistry();
            return { ok: true, data: registry };
          }

          case 'CLEAR_DISCLOSURES': {
            await clearAllDisclosures();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: true };
          }

          case 'CLEAR_CHANNEL_PROFILES': {
            await clearChannelProfiles();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: true };
          }

          case 'RESET_ALL_DATA': {
            await resetAllLocalData();
            await clearAllListEntries();
            await withStorageLock('subscribedLists', async () => {
              await saveSubscribedLists([]);
            });
            await seedBundledStarterList();
            await rebuildLookupIndex();
            await scheduleRefreshAlarm(true);
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: true };
          }

          case 'EXPORT_DATA': {
            const payload = await handleExportData();
            return { ok: true, data: payload };
          }

          case 'IMPORT_DATA': {
            const result = await handleImportData(req.payload, req.mode);
            return { ok: true, data: result };
          }

          case 'TOGGLE_REVEAL_HIDDEN': {
            try {
              await browser.tabs.sendMessage(req.tabId, {
                type: 'NOISEGATE_SET_REVEAL_HIDDEN',
                reveal: req.reveal,
              } satisfies ContentBroadcast);
            } catch {
            }
            return { ok: true, data: true };
          }

          default:
            return { ok: false, error: 'Unknown request type.' };
        }
      };

      void handle()
        .then((res) => {
          try {
            sendResponse(res);
          } catch {
          }
        })
        .catch((err) => {
          try {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          } catch {
          }
        });

      return true;
    },
  );
});
