import { browser } from 'wxt/browser';
import {
  deleteListEntries,
  getAllListEntries,
  saveListEntries,
} from '@/lib/idb';
import type {
  ContentBroadcast,
  RegistrySnapshot,
  RuntimeRequest,
  RuntimeResponse,
  StateSnapshot,
} from '@/lib/messages';
import {
  buildCanonicalChannelKey,
  normalizeChannelId,
  normalizeHandle,
  sanitizeHttpUrl,
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
  saveLocalRules,
  saveSubscribedLists,
  setManualChannelTopics,
  STORAGE_KEYS,
  updateSettings,
  upsertLocalRule,
} from '@/lib/storage';
import type {
  ChannelProfile,
  FilterAction,
  ListMatchSource,
  LocalRule,
  PageStats,
  ParsedListEntry,
  PersonalExportV1,
  ResolvedDecision,
  SubscribedListMeta,
  UserSettings,
} from '@/lib/types';

const REFRESH_ALARM_NAME = 'noisegate_refresh_lists';

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

const tabStats = new Map<number, PageStats>();

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
  const [lists, allEntries] = await Promise.all([
    getSubscribedLists(),
    getAllListEntries(),
  ]);

  const byChannelId = new Map<string, ListMatchSource[]>();
  const byHandle = new Map<string, ListMatchSource[]>();

  for (const list of lists) {
    if (!list.enabled) continue;
    const entries = allEntries[list.id] ?? [];
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
    url: BUNDLED_STARTER_LIST_URL,
    bundled: true,
    enabled: true,
    defaultAction: 'label',
    entryCount: parsed.list.entries.length,
    format: 'json-v1',
    lastFetchedAt: new Date().toISOString(),
    sourceUpdatedAt: parsed.list.updatedAt,
  };

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
  return meta;
}

async function scheduleRefreshAlarm(): Promise<void> {
  const settings = await getSettings();
  const hours = Math.max(1, Math.min(168, settings.autoRefreshHours || 24));
  await browser.alarms.clear(REFRESH_ALARM_NAME);
  await browser.alarms.create(REFRESH_ALARM_NAME, {
    periodInMinutes: hours * 60,
  });
}

async function ensureInitialized(): Promise<void> {
  if (indexLoaded) return;
  if (!initPromise) {
    initPromise = (async () => {
      const initFlag = await browser.storage.local.get(STORAGE_KEYS.initialized);
      if (!initFlag[STORAGE_KEYS.initialized]) {
        await browser.storage.local.set({
          [STORAGE_KEYS.settings]: DEFAULT_SETTINGS,
          [STORAGE_KEYS.initialized]: true,
        });
        await seedBundledStarterList();
      } else {
        const lists = await getSubscribedLists();
        const bundledMeta = lists.find((l) => l.bundled || l.id === BUNDLED_STARTER_LIST_ID);
        if (bundledMeta) {
          const allEntries = await getAllListEntries();
          if (!allEntries[bundledMeta.id] || allEntries[bundledMeta.id]!.length === 0) {
            const parsed = parseJsonFilterList(BUNDLED_AISLIST_TEST_SAMPLE);
            if (parsed.ok) {
              await saveListEntries(bundledMeta.id, parsed.list.entries);
            }
          }
        }
      }

      await rebuildLookupIndex();
      await scheduleRefreshAlarm();
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
    // Ignore when no YouTube tabs are open
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
    // Tab might have closed
  }
}

async function fetchAndStoreExternalList(
  url: string,
  options: {
    existingId?: string;
    defaultAction: FilterAction;
    enabled: boolean;
    customName?: string;
  },
): Promise<SubscribedListMeta> {
  const safeUrl = sanitizeHttpUrl(url);
  if (!safeUrl) {
    throw new Error('Please enter a valid http(s) URL.');
  }

  const response = await fetch(safeUrl, {
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

  const lists = await getSubscribedLists();
  let listId = options.existingId || parsed.list.listId;

  if (!options.existingId) {
    const conflict = lists.find((l) => l.id === listId && l.url !== safeUrl);
    if (conflict) {
      listId = `${listId}-${Date.now().toString(36).slice(-4)}`;
    }
  }

  await saveListEntries(listId, parsed.list.entries);

  const meta: SubscribedListMeta = {
    id: listId,
    name: options.customName?.trim() || parsed.list.name,
    description: parsed.list.description,
    homepage: parsed.list.homepage,
    submissionUrl: parsed.list.submissionUrl,
    removalUrl: parsed.list.removalUrl,
    url: safeUrl,
    bundled: false,
    enabled: options.enabled,
    defaultAction: options.defaultAction,
    entryCount: parsed.list.entries.length,
    format: parsed.list.format,
    etag: response.headers.get('etag') ?? undefined,
    lastFetchedAt: new Date().toISOString(),
    sourceUpdatedAt: parsed.list.updatedAt,
    lastError: undefined,
  };

  const existingIdx = lists.findIndex((l) => l.id === listId || l.url === safeUrl);
  if (existingIdx >= 0) {
    lists[existingIdx] = meta;
  } else {
    lists.push(meta);
  }

  await saveSubscribedLists(lists);
  await rebuildLookupIndex();
  await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
  return meta;
}

async function refreshLists(targetListId?: string): Promise<SubscribedListMeta[]> {
  const lists = await getSubscribedLists();
  const updated: SubscribedListMeta[] = [];

  for (const list of lists) {
    if (targetListId && list.id !== targetListId) {
      updated.push(list);
      continue;
    }
    if (!targetListId && !list.enabled) {
      updated.push(list);
      continue;
    }

    if (list.bundled || list.url === BUNDLED_STARTER_LIST_URL) {
      const parsed = parseJsonFilterList(BUNDLED_AISLIST_TEST_SAMPLE);
      if (parsed.ok) {
        await saveListEntries(list.id, parsed.list.entries);
        updated.push({
          ...list,
          entryCount: parsed.list.entries.length,
          lastFetchedAt: new Date().toISOString(),
          lastError: undefined,
        });
      } else {
        updated.push(list);
      }
      continue;
    }

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json, text/plain, */*',
      };
      if (list.etag) {
        headers['If-None-Match'] = list.etag;
      }

      const response = await fetch(list.url, {
        cache: 'no-cache',
        headers,
      });

      if (response.status === 304) {
        updated.push({
          ...list,
          lastFetchedAt: new Date().toISOString(),
          lastError: undefined,
        });
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rawText = await response.text();
      const parsed = parseFilterListContent(rawText, list.url);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      await saveListEntries(list.id, parsed.list.entries);
      updated.push({
        ...list,
        entryCount: parsed.list.entries.length,
        format: parsed.list.format,
        description: parsed.list.description ?? list.description,
        homepage: parsed.list.homepage ?? list.homepage,
        submissionUrl: parsed.list.submissionUrl ?? list.submissionUrl,
        removalUrl: parsed.list.removalUrl ?? list.removalUrl,
        etag: response.headers.get('etag') ?? list.etag,
        sourceUpdatedAt: parsed.list.updatedAt,
        lastFetchedAt: new Date().toISOString(),
        lastError: undefined,
      });
    } catch (err) {
      updated.push({
        ...list,
        lastError: err instanceof Error ? err.message : 'Fetch failed',
      });
    }
  }

  await saveSubscribedLists(updated);
  await rebuildLookupIndex();
  await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
  return updated;
}

async function handleFetchRegistry(): Promise<RegistrySnapshot> {
  for (const url of [COMMUNITY_REGISTRY_URL, COMMUNITY_REGISTRY_FALLBACK_URL]) {
    try {
      const res = await fetch(url, {
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
      // Try fallback
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
  if (cid && profiles[cid]) return profiles[cid];
  if (handle && profiles[`@${handle}`]) return profiles[`@${handle}`];
  if (channelKey && profiles[channelKey]) return profiles[channelKey];
  return undefined;
}

async function handleEvaluateBatch(
  req: Extract<RuntimeRequest, { type: 'EVALUATE_BATCH' }>,
): Promise<Record<string, ResolvedDecision>> {
  await ensureInitialized();

  if (req.handleMappings && req.handleMappings.length > 0) {
    void cacheHandleMappings(req.handleMappings);
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

  const localById: Record<string, LocalRule> = {};
  const localByHandle: Record<string, LocalRule> = {};
  for (const rule of localRules) {
    if (rule.channelId) localById[rule.channelId] = rule;
    if (rule.handle) localByHandle[rule.handle] = rule;
    if (rule.id.startsWith('UC')) localById[rule.id] = rule;
    if (rule.id.startsWith('@')) localByHandle[rule.id.slice(1)] = rule;
  }

  const results: Record<string, ResolvedDecision> = {};

  for (const item of req.items) {
    const normalizedHandle = normalizeHandle(item.handle);
    let normalizedCid = normalizeChannelId(item.channelId);

    if (!normalizedCid && normalizedHandle && handleCache[normalizedHandle]) {
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

    const videoDisclosure = item.videoId ? videoDisclosures[item.videoId] : undefined;
    const channelKey = buildCanonicalChannelKey({
      channelId: normalizedCid,
      handle: normalizedHandle,
    });
    const channelDisclosure =
      (normalizedCid ? channelDisclosures[normalizedCid] : undefined) ??
      (normalizedHandle ? channelDisclosures[`@${normalizedHandle}`] : undefined) ??
      (channelKey ? channelDisclosures[channelKey] : undefined);

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
        channelName: item.channelName,
        videoId: item.videoId,
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

async function handleGetSnapshot(tabId?: number): Promise<StateSnapshot> {
  await ensureInitialized();
  const [
    settings,
    localRules,
    subscribedLists,
    channelDisclosuresMap,
    videoDisclosuresMap,
    channelProfilesMap,
  ] = await Promise.all([
    getSettings(),
    getLocalRules(),
    getSubscribedLists(),
    getChannelDisclosures(),
    getVideoDisclosures(),
    getChannelProfiles(),
  ]);

  const channelDisclosures = Object.values(channelDisclosuresMap).sort((a, b) =>
    b.lastDetectedAt.localeCompare(a.lastDetectedAt),
  );

  const channelProfiles = Object.values(channelProfilesMap).sort((a, b) =>
    b.lastObservedAt.localeCompare(a.lastObservedAt),
  );

  let pageStats: PageStats | null = null;
  if (typeof tabId === 'number') {
    pageStats = tabStats.get(tabId) ?? null;
  } else {
    const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeId = activeTabs[0]?.id;
    if (typeof activeId === 'number') {
      pageStats = tabStats.get(activeId) ?? null;
    }
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
  const [settings, localRules, subscribedLists] = await Promise.all([
    getSettings(),
    getLocalRules(),
    getSubscribedLists(),
  ]);

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
      bundled: l.bundled,
    })),
  };
}

async function handleImportData(
  payload: unknown,
  mode: 'merge' | 'replace',
): Promise<{ importedRules: number; importedLists: number }> {
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
    await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
    return { importedRules: converted.length, importedLists: 0 };
  }

  if (obj.schemaVersion !== 1 || (obj.app !== 'NoiseGate' && obj.app !== 'TubeSignal')) {
    throw new Error(
      'Unrecognized backup format. Expected NoiseGate export v1 or Filter List JSON v1/v2.',
    );
  }

  let importedRules = 0;
  let importedLists = 0;

  if (obj.settings && typeof obj.settings === 'object') {
    const s = obj.settings as Partial<UserSettings>;
    await updateSettings({
      enabled: typeof s.enabled === 'boolean' ? s.enabled : undefined,
      disclosureAction: s.disclosureAction,
      propagateChannelDisclosure:
        typeof s.propagateChannelDisclosure === 'boolean'
          ? s.propagateChannelDisclosure
          : undefined,
      paidPromotionAction: s.paidPromotionAction,
      monetizedAction: s.monetizedAction,
      showMonetizationIndicator:
        typeof s.showMonetizationIndicator === 'boolean'
          ? s.showMonetizationIndicator
          : undefined,
      showTopicIndicator:
        typeof s.showTopicIndicator === 'boolean' ? s.showTopicIndicator : undefined,
      topicRules:
        s.topicRules && typeof s.topicRules === 'object' ? s.topicRules : undefined,
      autoRefreshHours:
        typeof s.autoRefreshHours === 'number' ? s.autoRefreshHours : undefined,
      showCardHoverButton:
        typeof s.showCardHoverButton === 'boolean' ? s.showCardHoverButton : undefined,
    });
  }

  if (Array.isArray(obj.localRules)) {
    const existing = mode === 'replace' ? [] : await getLocalRules();
    const byId = new Map<string, LocalRule>();
    for (const r of existing) byId.set(r.id, r);

    for (const rawRule of obj.localRules) {
      if (!rawRule || typeof rawRule !== 'object') continue;
      const r = rawRule as Partial<LocalRule>;
      const cid = normalizeChannelId(r.channelId ?? r.id);
      const handle = normalizeHandle(r.handle ?? r.id);
      const id = buildCanonicalChannelKey({ channelId: cid, handle });
      if (!id) continue;
      const action =
        r.action === 'label' || r.action === 'dim' || r.action === 'hide' || r.action === 'allow'
          ? r.action
          : 'label';
      byId.set(id, {
        id,
        channelId: cid,
        handle,
        channelName: typeof r.channelName === 'string' ? r.channelName : undefined,
        action,
        category: r.category ?? 'custom',
        topics: Array.isArray(r.topics) ? r.topics : undefined,
        note: typeof r.note === 'string' ? r.note : undefined,
        createdAt: r.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      importedRules++;
    }

    await saveLocalRules(Array.from(byId.values()));
  }

  if (Array.isArray(obj.subscribedLists)) {
    if (mode === 'replace') {
      const current = await getSubscribedLists();
      for (const old of current) {
        await deleteListEntries(old.id);
      }
      await saveSubscribedLists([]);
    }

    for (const rawList of obj.subscribedLists) {
      if (!rawList || typeof rawList !== 'object') continue;
      const l = rawList as Partial<SubscribedListMeta>;
      const action: FilterAction =
        l.defaultAction === 'hide' || l.defaultAction === 'dim' ? l.defaultAction : 'label';

      if (l.bundled || l.url === BUNDLED_STARTER_LIST_URL) {
        await seedBundledStarterList();
        const current = await getSubscribedLists();
        const idx = current.findIndex((x) => x.id === BUNDLED_STARTER_LIST_ID);
        if (idx >= 0) {
          current[idx]!.enabled = l.enabled ?? true;
          current[idx]!.defaultAction = action;
          await saveSubscribedLists(current);
        }
        importedLists++;
      } else if (typeof l.url === 'string' && sanitizeHttpUrl(l.url)) {
        try {
          await fetchAndStoreExternalList(l.url, {
            defaultAction: action,
            enabled: l.enabled ?? true,
            customName: l.name,
          });
          importedLists++;
        } catch {
          // Keep going if one remote list fails during import
        }
      }
    }
  }

  await rebuildLookupIndex();
  await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
  return { importedRules, importedLists };
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void ensureInitialized();
  });

  browser.runtime.onStartup.addListener(() => {
    void ensureInitialized();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM_NAME) {
      void ensureInitialized().then(() => refreshLists());
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabStats.delete(tabId);
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
              yppSignals: req.yppSignals,
              monetizationInspected: req.monetizationInspected,
              hasPaidPromotion: req.hasPaidPromotion,
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
              tabStats.set(tabId, req.stats);
              await updateTabBadge(tabId, req.stats);
            }
            return { ok: true, data: true };
          }

          case 'GET_STATE_SNAPSHOT': {
            const snapshot = await handleGetSnapshot(req.tabId);
            return { ok: true, data: snapshot };
          }

          case 'UPDATE_SETTINGS': {
            const next = await updateSettings(req.patch);
            if (typeof req.patch.autoRefreshHours === 'number') {
              await scheduleRefreshAlarm();
            }
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: next };
          }

          case 'ADD_FILTER_LIST': {
            const meta = await fetchAndStoreExternalList(req.url, {
              defaultAction: req.defaultAction,
              enabled: true,
              customName: req.customName,
            });
            return { ok: true, data: meta };
          }

          case 'UPDATE_FILTER_LIST': {
            const lists = await getSubscribedLists();
            const idx = lists.findIndex((l) => l.id === req.listId);
            if (idx < 0) {
              return { ok: false, error: 'Filter list not found.' };
            }
            const current = lists[idx]!;
            lists[idx] = {
              ...current,
              enabled: req.patch.enabled ?? current.enabled,
              defaultAction: req.patch.defaultAction ?? current.defaultAction,
              name: req.patch.name?.trim() || current.name,
            };
            await saveSubscribedLists(lists);
            await rebuildLookupIndex();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: lists[idx] };
          }

          case 'REMOVE_FILTER_LIST': {
            const lists = await getSubscribedLists();
            const next = lists.filter((l) => l.id !== req.listId);
            await saveSubscribedLists(next);
            await deleteListEntries(req.listId);
            await rebuildLookupIndex();
            await notifyYouTubeTabs({ type: 'NOISEGATE_STATE_UPDATED' });
            return { ok: true, data: { removed: next.length !== lists.length } };
          }

          case 'REFRESH_FILTER_LIST': {
            const updated = await refreshLists(req.listId);
            return { ok: true, data: updated };
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
              // Tab may not have content script loaded
            }
            return { ok: true, data: true };
          }

          default:
            return { ok: false, error: 'Unknown request type.' };
        }
      };

      void handle()
        .then((res) => sendResponse(res))
        .catch((err) => {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });

      return true;
    },
  );
});
