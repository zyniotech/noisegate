import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  Check,
  CheckCircle,
  CurrencyCircleDollar,
  DownloadSimple,
  EyeSlash,
  GitBranch,
  ListBullets,
  MagnifyingGlass,
  Megaphone,
  Plus,
  Prohibit,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Tag,
  Television,
  Trash,
  UploadSimple,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { browser } from 'wxt/browser';
import { TitaniumSelect, type TitaniumSelectOption } from '@/components/TitaniumSelect';
import { TitaniumSwitch } from '@/components/TitaniumSwitch';
import { getCategoryMeta, SELECTABLE_CATEGORIES } from '@/lib/categories';
import type {
  RefreshListsOutcome,
  RegistrySnapshot,
  StateSnapshot,
} from '@/lib/messages';
import {
  formatHandle,
  isValidRepoSlug,
  normalizeChannelId,
  normalizeHandle,
  parseYouTubeChannelHref,
  sanitizePublicHttpsUrl,
} from '@/lib/normalize';
import { BUNDLED_REGISTRY_ENTRIES } from '@/lib/registry';
import {
  fetchSnapshot,
  formatRelativeTime,
  sendRuntimeMessage,
} from '@/lib/runtime-client';
import { BUNDLED_STARTER_LIST_ID } from '@/lib/starter-list';
import {
  formatMonetizationSummary,
  getTopObservedCategory,
  hasObservedYppSignals,
  TOPIC_LIST,
  TOPICS,
  YPP_SIGNAL_LABELS,
} from '@/lib/taxonomy';
import type {
  CategoryId,
  FilterAction,
  LocalRule,
  LocalRuleAction,
  PersonalExportV1,
  RegistryListEntry,
  SubscribedListMeta,
  TopicId,
  TopicRuleAction,
} from '@/lib/types';

type TabKey = 'lists' | 'topics' | 'rules' | 'disclosures' | 'settings';

const ACTION_OPTIONS: Array<{ value: FilterAction; label: string }> = [
  { value: 'label', label: 'Label' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

const LIST_ACTION_OPTIONS: Array<TitaniumSelectOption<TopicRuleAction>> = [
  { value: 'pass', label: 'Pass (Meta only)' },
  { value: 'label', label: 'Label' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

const TOPIC_RULE_OPTIONS: Array<TitaniumSelectOption<TopicRuleAction>> = [
  { value: 'pass', label: 'Pass' },
  { value: 'label', label: 'Label' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

const MONETIZED_ACTION_OPTIONS: Array<TitaniumSelectOption<TopicRuleAction>> =
  TOPIC_RULE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.value === 'pass' ? `${opt.label} (Neutral info only - Recommended)` : opt.label,
  }));

const LOCAL_RULE_ACTION_OPTIONS: Array<TitaniumSelectOption<LocalRuleAction>> = [
  { value: 'label', label: 'Label' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
  { value: 'allow', label: 'Trust (Override)' },
];

const CATEGORY_OPTIONS: Array<TitaniumSelectOption<CategoryId>> = SELECTABLE_CATEGORIES.map(
  (c) => ({ value: c.id as CategoryId, label: c.shortLabel }),
);

const AUTO_REFRESH_OPTIONS: Array<TitaniumSelectOption> = [
  { value: '6', label: 'Every 6 hours' },
  { value: '12', label: 'Every 12 hours' },
  { value: '24', label: 'Every 24 hours' },
  { value: '72', label: 'Every 3 days' },
  { value: '168', label: 'Weekly' },
];

const IMPORT_MODE_OPTIONS: Array<TitaniumSelectOption<'merge' | 'replace'>> = [
  { value: 'merge', label: 'Merge' },
  { value: 'replace', label: 'Replace' },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>('lists');
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [registry, setRegistry] = useState<RegistrySnapshot>({
    entries: BUNDLED_REGISTRY_ENTRIES,
    source: 'fallback',
  });
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [reloadingIndex, setReloadingIndex] = useState(false);

  const [listUrl, setListUrl] = useState('');
  const [listName, setListName] = useState('');
  const [listAction, setListAction] = useState<TopicRuleAction>('label');

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleFilter, setRuleFilter] = useState<LocalRuleAction | 'all'>('all');
  const [newRuleTarget, setNewRuleTarget] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<LocalRuleAction>('label');
  const [newRuleCategory, setNewRuleCategory] = useState<CategoryId>('ai-synthetic');
  const [newRuleNote, setNewRuleNote] = useState('');

  const [profileSearch, setProfileSearch] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const repoInitializedRef = useRef(false);
  const storageTimerRef = useRef<number | null>(null);

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showNotice = useCallback((kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await fetchSnapshot(undefined, true);
      setSnapshot(data);
      setLoadFailed(false);
      if (!repoInitializedRef.current) {
        setRepoInput(data.settings.communitySubmissionRepo);
        repoInitializedRef.current = true;
      }
    } catch (err) {
      setLoadFailed(true);
      showNotice('error', err instanceof Error ? err.message : 'Failed to load state');
    }
  }, [showNotice]);

  const loadRegistry = useCallback(
    async (explicit = false) => {
      if (explicit) setReloadingIndex(true);
      try {
        const res = await sendRuntimeMessage<RegistrySnapshot>({ type: 'FETCH_REGISTRY' });
        setRegistry(res);
        if (explicit && res.source === 'fallback') {
          showNotice(
            'error',
            'Could not reach live community registry. Showing built-in index.',
          );
        } else if (explicit) {
          showNotice('ok', 'Community directory index updated.');
        }
      } catch (err) {
        if (explicit) {
          showNotice(
            'error',
            err instanceof Error ? err.message : 'Could not reload community registry.',
          );
        }
      } finally {
        if (explicit) setReloadingIndex(false);
      }
    },
    [showNotice],
  );

  useEffect(() => {
    void reload();
    void loadRegistry(false);

    const handleStorageChange = () => {
      if (storageTimerRef.current !== null) {
        window.clearTimeout(storageTimerRef.current);
      }
      storageTimerRef.current = window.setTimeout(() => {
        storageTimerRef.current = null;
        void reload();
      }, 150);
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      if (storageTimerRef.current !== null) {
        window.clearTimeout(storageTimerRef.current);
      }
    };
  }, [reload, loadRegistry]);

  const subscribedUrls = useMemo(
    () => new Set((snapshot?.subscribedLists ?? []).map((l) => l.url)),
    [snapshot?.subscribedLists],
  );

  const subscribedIds = useMemo(
    () => new Set((snapshot?.subscribedLists ?? []).map((l) => l.id)),
    [snapshot?.subscribedLists],
  );

  const hasStarterList = useMemo(
    () =>
      (snapshot?.subscribedLists ?? []).some(
        (l) => l.bundled || l.id === BUNDLED_STARTER_LIST_ID,
      ),
    [snapshot?.subscribedLists],
  );

  const totalActiveEntries = useMemo(
    () =>
      (snapshot?.subscribedLists ?? [])
        .filter((l) => l.enabled)
        .reduce((acc, l) => acc + l.entryCount, 0),
    [snapshot?.subscribedLists],
  );

  const activeTopicFiltersCount = useMemo(
    () =>
      Object.values(snapshot?.settings.topicRules ?? {}).filter(
        (a) => a && a !== 'pass',
      ).length,
    [snapshot?.settings.topicRules],
  );

  const filteredRules = useMemo(() => {
    const list = snapshot?.localRules ?? [];
    const q = ruleSearch.trim().toLowerCase();
    return list.filter((r) => {
      if (ruleFilter !== 'all' && r.action !== ruleFilter) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        (r.channelName ?? '').toLowerCase().includes(q) ||
        (r.handle ?? '').toLowerCase().includes(q) ||
        (r.channelId ?? '').toLowerCase().includes(q) ||
        (r.note ?? '').toLowerCase().includes(q)
      );
    });
  }, [snapshot?.localRules, ruleFilter, ruleSearch]);

  const filteredProfiles = useMemo(() => {
    const list = snapshot?.channelProfiles ?? [];
    const q = profileSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (prof) =>
        (prof.channelName ?? '').toLowerCase().includes(q) ||
        (prof.handle ?? '').toLowerCase().includes(q) ||
        (prof.channelId ?? '').toLowerCase().includes(q) ||
        prof.channelKey.toLowerCase().includes(q) ||
        prof.observedTopics.some((t) =>
          (TOPICS[t]?.label ?? t).toLowerCase().includes(q),
        ) ||
        prof.yppSignals.some((s) =>
          (YPP_SIGNAL_LABELS[s] ?? s).toLowerCase().includes(q),
        ) ||
        formatMonetizationSummary(prof.yppSignals, prof.monetizationInspected)
          .toLowerCase()
          .includes(q),
    );
  }, [snapshot?.channelProfiles, profileSearch]);

  const ensureHostPermission = useCallback(async (safeUrl: string): Promise<void> => {
    try {
      const origin = `${new URL(safeUrl).origin}/*`;
      if (
        origin === 'https://raw.githubusercontent.com/*' ||
        origin === 'https://cdn.jsdelivr.net/*'
      ) {
        return;
      }
      const permApi = browser.permissions;
      if (!permApi) return;
      const already = await permApi.contains({ origins: [origin] });
      if (!already) {
        const granted = await permApi.request({ origins: [origin] });
        if (!granted) {
          throw new Error(
            `Permission denied for ${new URL(safeUrl).hostname}. External custom list requires host permission.`,
          );
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Permission denied')) {
        throw err;
      }
    }
  }, []);

  const handleAddList = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = listUrl.trim();
    if (!trimmedUrl) {
      showNotice('error', 'Please enter a filter list HTTPS URL.');
      return;
    }
    const safeUrl = sanitizePublicHttpsUrl(trimmedUrl);
    if (!safeUrl) {
      showNotice('error', 'Please enter a valid public HTTPS URL.');
      return;
    }

    setBusy('add-list');
    setNotice(null);
    try {
      await ensureHostPermission(safeUrl);
      const added = await sendRuntimeMessage<SubscribedListMeta>({
        type: 'ADD_FILTER_LIST',
        url: safeUrl,
        defaultAction: listAction,
        customName: listName.trim() || undefined,
      });
      setListUrl('');
      setListName('');
      await reload();
      showNotice(
        'ok',
        `Subscribed to "${added.name}" (${added.entryCount.toLocaleString()} entries, ${added.format}).`,
      );
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Failed to add filter list');
    } finally {
      setBusy(null);
    }
  };

  const handleSubscribeRegistry = async (entry: RegistryListEntry) => {
    setBusy(`registry:${entry.url}`);
    setNotice(null);
    try {
      await ensureHostPermission(entry.url);
      const added = await sendRuntimeMessage<SubscribedListMeta>({
        type: 'ADD_FILTER_LIST',
        url: entry.url,
        listId: entry.id,
        defaultAction: entry.defaultAction,
        customName: entry.name,
        kind: entry.kind,
        submissionUrl: entry.submissionUrl,
        removalUrl: entry.removalUrl,
      });
      await reload();
      showNotice(
        'ok',
        `Subscribed to "${added.name}" (${added.entryCount.toLocaleString()} entries).`,
      );
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Failed to fetch community list');
    } finally {
      setBusy(null);
    }
  };

  const handleUpdateList = async (
    listId: string,
    patch: { enabled?: boolean; defaultAction?: TopicRuleAction },
  ) => {
    setBusy(`list:${listId}`);
    try {
      await sendRuntimeMessage({ type: 'UPDATE_FILTER_LIST', listId, patch });
      await reload();
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not update list');
    } finally {
      setBusy(null);
    }
  };

  const handleRemoveList = async (list: SubscribedListMeta) => {
    const key = `remove-list:${list.id}`;
    if (confirmKey !== key) {
      setConfirmKey(key);
      return;
    }
    setConfirmKey(null);
    setBusy(`remove:${list.id}`);
    try {
      await sendRuntimeMessage({ type: 'REMOVE_FILTER_LIST', listId: list.id });
      await reload();
      showNotice('ok', `Removed "${list.name}".`);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not remove list');
    } finally {
      setBusy(null);
    }
  };

  const handleRefreshLists = async (listId?: string) => {
    setBusy(listId ? `refresh:${listId}` : 'refresh-all');
    setNotice(null);
    try {
      const outcome = await sendRuntimeMessage<RefreshListsOutcome>({
        type: 'REFRESH_FILTER_LIST',
        listId,
      });
      await reload();
      if (outcome && outcome.failedCount > 0) {
        const firstErr = outcome.errors[0];
        showNotice(
          'error',
          firstErr
            ? `${outcome.failedCount} list(s) failed to refresh (${firstErr.name}: ${firstErr.error}).`
            : `${outcome.failedCount} list(s) failed to refresh.`,
        );
      } else {
        showNotice('ok', listId ? 'Filter list refreshed.' : 'All active filter lists refreshed.');
      }
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreStarter = async () => {
    setBusy('restore-starter');
    try {
      await sendRuntimeMessage({ type: 'RESTORE_STARTER_LIST' });
      await reload();
      showNotice('ok', 'Restored bundled AiSList Test Sample (25 channels).');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Failed to restore starter list');
    } finally {
      setBusy(null);
    }
  };

  const handleAddLocalRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newRuleTarget.trim();
    if (!raw) return;

    const parsedHref = parseYouTubeChannelHref(raw);
    let channelId = parsedHref.channelId ?? normalizeChannelId(raw);
    let handle = parsedHref.handle;

    if (!channelId && !handle) {
      if (!raw.includes('/') && !raw.includes(':')) {
        handle = normalizeHandle(raw);
      }
    }

    if (!channelId && !handle) {
      showNotice(
        'error',
        'Please enter a valid YouTube @handle, UC... channel ID, or /channel/UC... /@handle URL.',
      );
      return;
    }

    setBusy('add-rule');
    setNotice(null);
    try {
      await sendRuntimeMessage({
        type: 'UPSERT_LOCAL_RULE',
        ref: { channelId, handle },
        action: newRuleAction,
        category: newRuleAction === 'allow' ? 'verified-independent' : newRuleCategory,
        note: newRuleNote.trim() || undefined,
      });
      setNewRuleTarget('');
      setNewRuleNote('');
      await reload();
      showNotice('ok', 'Local channel rule saved. Overrides subscribed lists.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Invalid channel ID or @handle');
    } finally {
      setBusy(null);
    }
  };

  const handleUpdateRuleAction = async (rule: LocalRule, action: LocalRuleAction) => {
    setBusy(`rule:${rule.id}`);
    try {
      await sendRuntimeMessage({
        type: 'UPSERT_LOCAL_RULE',
        ref: {
          channelId: rule.channelId,
          handle: rule.handle,
          channelName: rule.channelName,
        },
        action,
        category:
          action === 'allow'
            ? 'verified-independent'
            : rule.category === 'verified-independent'
              ? 'custom'
              : rule.category,
        note: rule.note,
      });
      await reload();
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not update rule');
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    setBusy(`del-rule:${ruleId}`);
    try {
      await sendRuntimeMessage({
        type: 'REMOVE_LOCAL_RULE',
        ref: { id: ruleId },
      });
      await reload();
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not delete rule');
    } finally {
      setBusy(null);
    }
  };

  const handleSettingPatch = async (patch: Record<string, unknown>): Promise<boolean> => {
    setBusy('settings');
    try {
      await sendRuntimeMessage({ type: 'UPDATE_SETTINGS', patch });
      await reload();
      return true;
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not save setting');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleSaveRepoSlug = async () => {
    const cleaned = repoInput.trim() || 'zyniotech/noisegate-lists';
    if (!isValidRepoSlug(cleaned)) {
      showNotice(
        'error',
        'Repository slug must use "owner/repo" format (e.g. zyniotech/noisegate-lists).',
      );
      return;
    }
    const ok = await handleSettingPatch({ communitySubmissionRepo: cleaned });
    if (ok) {
      setRepoInput(cleaned);
      showNotice('ok', `Saved community repo: ${cleaned}`);
    }
  };

  const handleTopicRuleChange = async (topicId: TopicId, action: TopicRuleAction) => {
    if (!snapshot || busy !== null) return;
    const nextTopicRules = { ...snapshot.settings.topicRules };
    if (action === 'pass') {
      delete nextTopicRules[topicId];
    } else {
      nextTopicRules[topicId] = action;
    }
    setSnapshot((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, topicRules: nextTopicRules } } : prev,
    );
    await handleSettingPatch({ topicRules: nextTopicRules });
  };

  const handleResetAllTopics = async () => {
    const ok = await handleSettingPatch({ topicRules: {} });
    if (ok) {
      showNotice('ok', 'All topic filters reset to Pass.');
    }
  };

  const handleClearDisclosures = async () => {
    if (confirmKey !== 'clear-disclosures') {
      setConfirmKey('clear-disclosures');
      return;
    }
    setConfirmKey(null);
    setBusy('clear-disclosures');
    try {
      await sendRuntimeMessage({ type: 'CLEAR_DISCLOSURES' });
      await reload();
      showNotice('ok', 'Cleared locally cached YouTube disclosure records.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not clear disclosures');
    } finally {
      setBusy(null);
    }
  };

  const handleClearProfiles = async () => {
    if (confirmKey !== 'clear-profiles') {
      setConfirmKey('clear-profiles');
      return;
    }
    setConfirmKey(null);
    setBusy('clear-profiles');
    try {
      await sendRuntimeMessage({ type: 'CLEAR_CHANNEL_PROFILES' });
      await reload();
      showNotice(
        'ok',
        'Cleared locally observed channel topic and monetization profiles.',
      );
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Could not clear profiles');
    } finally {
      setBusy(null);
    }
  };

  const handleResetAllData = async () => {
    if (confirmKey !== 'reset-all') {
      setConfirmKey('reset-all');
      return;
    }
    setConfirmKey(null);
    setBusy('reset-all');
    try {
      await sendRuntimeMessage({ type: 'RESET_ALL_DATA' });
      repoInitializedRef.current = false;
      await reload();
      showNotice('ok', 'All local rules, profiles, disclosures, and custom lists were reset.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setBusy('export');
    try {
      const payload = await sendRuntimeMessage<PersonalExportV1>({ type: 'EXPORT_DATA' });
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `noisegate-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showNotice('ok', 'Exported local rules, settings, and subscribed lists.');
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (
      importMode === 'replace' &&
      !window.confirm(
        'Replace mode overwrites all existing local rules, settings, and subscribed lists with the imported file. Continue?',
      )
    ) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setBusy('import');
    setNotice(null);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = await sendRuntimeMessage<{
        importedRules: number;
        importedLists: number;
        failedLists?: string[];
      }>({
        type: 'IMPORT_DATA',
        payload: parsed,
        mode: importMode,
      });
      repoInitializedRef.current = false;
      await reload();
      if (result.failedLists && result.failedLists.length > 0) {
        showNotice(
          'error',
          `Imported ${result.importedRules} rules and ${result.importedLists} lists, but ${result.failedLists.length} remote list(s) failed to download.`,
        );
      } else {
        showNotice(
          'ok',
          `Imported ${result.importedRules} local rules and ${result.importedLists} filter lists (${importMode}).`,
        );
      }
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const settings = snapshot?.settings;

  return (
    <div className="min-h-[100dvh] bg-[#090b0f] text-[#f3f4f6]">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />

      <header className="border-b border-white/[0.08] bg-[#0d1016]">
        <div className="max-w-[980px] mx-auto px-4 sm:px-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
            <div className="flex items-center gap-3.5">
              <img
                src="/icon/128.png"
                alt="NoiseGate"
                className="w-9 h-9 block shrink-0 drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
              />
              <div>
                <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-white leading-tight">
                  NoiseGate
                </h1>
                <p className="text-[12.5px] text-slate-300 mt-0.5">
                  Neutral channel signals, topic controls, and transparent filter lists.
                </p>
              </div>
            </div>

            {settings && (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-md border border-white/[0.08] bg-[#121620] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <span className="text-[12px] font-medium text-slate-200">
                  {settings.enabled ? 'Filtering Active' : 'Filtering Paused'}
                </span>
                <TitaniumSwitch
                  size="sm"
                  checked={settings.enabled}
                  disabled={busy === 'settings'}
                  onChange={(checked) => handleSettingPatch({ enabled: checked })}
                  label="Enable or pause NoiseGate filtering"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-0 sm:divide-x sm:divide-white/[0.07] border-t border-white/[0.06] py-3 mb-2 text-[12px]">
            <div className="sm:pr-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Observed Profiles</span>
              <span className="font-mono text-slate-100 tabular">
                {snapshot?.channelProfiles.length ?? 0}
              </span>
            </div>
            <div className="sm:px-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Topic Filters</span>
              <span className="font-mono text-slate-100 tabular">
                {activeTopicFiltersCount}
              </span>
            </div>
            <div className="sm:px-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Local Rules</span>
              <span className="font-mono text-slate-100 tabular">
                {snapshot?.localRules.length ?? 0}
              </span>
            </div>
            <div className="sm:pl-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-400">Active List Entries</span>
              <span className="font-mono text-slate-100 tabular">
                {totalActiveEntries.toLocaleString()}
              </span>
            </div>
          </div>

          <nav
            role="tablist"
            aria-label="NoiseGate sections"
            className="flex items-center gap-5 sm:gap-6 -mb-px text-[13px] border-t border-white/[0.06] pt-3 overflow-x-auto no-scrollbar whitespace-nowrap"
          >
            {(
              [
                {
                  key: 'lists',
                  label: 'Filter Lists',
                  count: snapshot?.subscribedLists.length ?? 0,
                  Icon: ListBullets,
                },
                {
                  key: 'topics',
                  label: 'Topics & Signals',
                  count: activeTopicFiltersCount,
                  Icon: Television,
                },
                {
                  key: 'rules',
                  label: 'Local Rules',
                  count: snapshot?.localRules.length ?? 0,
                  Icon: Tag,
                },
                {
                  key: 'disclosures',
                  label: 'YouTube Disclosures',
                  count: snapshot?.totalVideoDisclosures ?? 0,
                  Icon: Sparkle,
                },
                {
                  key: 'settings',
                  label: 'Settings & Backup',
                  count: null,
                  Icon: SlidersHorizontal,
                },
              ] as const
            ).map(({ key, label, count, Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTab(key);
                    setNotice(null);
                    setConfirmKey(null);
                  }}
                  className={`pb-3 shrink-0 flex items-center gap-2 border-b-2 transition-[color,border-color] duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-t cursor-pointer ${
                    active
                      ? 'border-white text-white font-medium'
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  <Icon size={15} weight={active ? 'fill' : 'regular'} />
                  <span>{label}</span>
                  {count !== null && (
                    <span className="text-[11px] font-mono text-slate-400 tabular">{count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-[980px] mx-auto px-4 sm:px-6 py-7" role="tabpanel">
        {notice && (
          <div
            role="alert"
            aria-live="polite"
            className={`mb-6 px-4 py-2.5 border-l-2 text-[13px] flex items-start sm:items-center justify-between gap-3 ${
              notice.kind === 'error'
                ? 'border-red-500 bg-red-950/30 text-red-200'
                : 'border-slate-300 bg-white/[0.04] text-slate-100'
            }`}
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              {notice.kind === 'error' ? (
                <WarningCircle size={15} className="shrink-0 text-red-400 mt-0.5 sm:mt-0" />
              ) : (
                <CheckCircle size={15} className="shrink-0 text-slate-300 mt-0.5 sm:mt-0" />
              )}
              <span className="break-words min-w-0">{notice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs text-slate-300 hover:text-white shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded px-1 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {loadFailed && !snapshot && (
          <div className="border border-white/[0.08] rounded-lg bg-[#10131a] p-6 flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="text-[13px] text-slate-300">
              Failed to load NoiseGate extension data from background worker.
            </div>
            <button
              type="button"
              onClick={() => void reload()}
              className="h-8 px-3 rounded-md bg-[#f8fafc] text-[#0a0c10] font-semibold text-[12px] cursor-pointer"
            >
              Retry Load
            </button>
          </div>
        )}

        {tab === 'lists' && (
          <div className="space-y-8">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Subscribe to an External Filter List
                </h2>
                <p className="text-[12px] text-slate-300 mt-0.5">
                  Supports NoiseGate JSON v1/v2 and plain-text AiSList format (
                  <code className="text-slate-100 font-mono">@handle</code> or{' '}
                  <code className="text-slate-100 font-mono">UC...</code> per line).
                </p>
              </div>

              <form onSubmit={handleAddList} className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-4">
                <input
                  type="text"
                  required
                  value={listUrl}
                  onChange={(e) => setListUrl(e.target.value)}
                  aria-label="Filter list HTTPS URL"
                  placeholder="https://raw.githubusercontent.com/.../list.json or .txt"
                  className="md:col-span-5 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-400 transition-[border-color] duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                />
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  aria-label="Optional custom list label"
                  placeholder="Label (optional)"
                  className="md:col-span-3 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-400 transition-[border-color] duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                />
                <div className="md:col-span-2">
                  <TitaniumSelect
                    value={listAction}
                    options={LIST_ACTION_OPTIONS}
                    onChange={setListAction}
                    ariaLabel="Default action for list"
                    triggerPrefix="Action: "
                    align="right"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy === 'add-list'}
                  className="md:col-span-2 h-9 px-3 rounded-md bg-[#f8fafc] hover:bg-slate-200 text-[#0a0c10] font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-[background-color,transform,opacity] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10131a] disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={15} weight="bold" />
                  <span>{busy === 'add-list' ? 'Loading...' : 'Subscribe'}</span>
                </button>
              </form>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-300">
                  Subscribed Lists
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {!hasStarterList && (
                    <button
                      type="button"
                      onClick={handleRestoreStarter}
                      disabled={busy === 'restore-starter'}
                      className="h-7 px-2.5 rounded-md border border-white/[0.1] bg-[#141821] hover:bg-[#1c2230] text-[12px] text-slate-200 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 cursor-pointer"
                    >
                      Restore 25-Channel Test Sample
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRefreshLists()}
                    disabled={busy === 'refresh-all'}
                    className="h-7 px-2.5 rounded-md border border-white/[0.1] bg-[#141821] hover:bg-[#1c2230] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] text-[12px] text-slate-200 inline-flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 cursor-pointer"
                  >
                    <ArrowsClockwise
                      size={13}
                      className={busy === 'refresh-all' ? 'animate-spin' : ''}
                    />
                    <span>{busy === 'refresh-all' ? 'Refreshing...' : 'Refresh All'}</span>
                  </button>
                </div>
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
                {(snapshot?.subscribedLists ?? []).length === 0 ? (
                  <div className="p-6 text-[13px] text-slate-300">
                    No filter lists subscribed yet. Add a JSON or plain-text list URL above, or
                    subscribe from the Open Community Directory below.
                  </div>
                ) : (
                  (snapshot?.subscribedLists ?? []).map((list) => {
                    const stripeColor = !list.enabled
                      ? 'rgba(255,255,255,0.07)'
                      : list.defaultAction === 'hide'
                        ? '#ef4444'
                        : list.defaultAction === 'dim'
                          ? '#ea580c'
                          : list.defaultAction === 'label'
                            ? '#d97706'
                            : '#94a3b8';

                    const formatLabel =
                      list.format === 'json-v2'
                        ? 'JSON v2'
                        : list.format === 'json-v1'
                          ? 'JSON v1'
                          : 'Plain-Text';

                    const confirmingRemove = confirmKey === `remove-list:${list.id}`;

                    return (
                      <div
                        key={list.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.015] transition-[background-color] duration-100"
                        style={{ borderLeft: `2px solid ${stripeColor}` }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <TitaniumSwitch
                              size="sm"
                              checked={list.enabled}
                              disabled={busy === `list:${list.id}`}
                              onChange={(checked) => handleUpdateList(list.id, { enabled: checked })}
                              label={`Enable ${list.name}`}
                            />
                            <span
                              className={`text-[14px] font-medium truncate ${
                                list.enabled ? 'text-white' : 'text-slate-300'
                              }`}
                            >
                              {list.name}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400 uppercase shrink-0">
                              {formatLabel}
                            </span>
                            {list.bundled && (
                              <span className="text-[11px] font-mono text-slate-300 shrink-0">
                                · Bundled Sample
                              </span>
                            )}
                          </div>

                          {list.description && (
                            <p className="text-[12px] text-slate-300 mt-1.5 pl-0 sm:pl-11">
                              {list.description}
                            </p>
                          )}

                          <div className="mt-1 pl-0 sm:pl-11 text-[11px] font-mono text-slate-400 truncate" title={list.url}>
                            {list.url}
                          </div>

                          <div className="mt-1.5 pl-0 sm:pl-11 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-400 tabular">
                            <span>
                              <strong className="text-slate-200 font-medium">
                                {list.entryCount.toLocaleString()}
                              </strong>{' '}
                              entries
                            </span>
                            <span>Synced {formatRelativeTime(list.lastFetchedAt)}</span>
                            {list.homepage && (
                              <a
                                href={list.homepage}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-[color] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 rounded"
                              >
                                <span>Source</span>
                                <ArrowSquareOut size={12} />
                              </a>
                            )}
                            {list.submissionUrl && (
                              <a
                                href={list.submissionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-[color] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 rounded"
                              >
                                <GitBranch size={12} />
                                <span>Suggest Entry</span>
                              </a>
                            )}
                            {list.lastError && (
                              <span className="text-red-300 inline-flex items-center gap-1">
                                <Warning size={12} />
                                {list.lastError}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-0 shrink-0">
                          <TitaniumSelect
                            value={list.defaultAction}
                            options={LIST_ACTION_OPTIONS}
                            disabled={busy === `list:${list.id}`}
                            onChange={(nextAction) =>
                              handleUpdateList(list.id, { defaultAction: nextAction })
                            }
                            ariaLabel={`Default action for ${list.name}`}
                            size="sm"
                            fullWidth={false}
                            align="right"
                          />

                          <button
                            type="button"
                            title="Refresh this list"
                            aria-label={`Refresh ${list.name}`}
                            onClick={() => handleRefreshLists(list.id)}
                            disabled={busy === `refresh:${list.id}`}
                            className="w-8 h-8 rounded-md border border-white/[0.08] bg-[#151923] hover:bg-[#1e2432] text-slate-300 flex items-center justify-center transition-[background-color,border-color,transform] duration-120 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer"
                          >
                            <ArrowsClockwise
                              size={14}
                              className={busy === `refresh:${list.id}` ? 'animate-spin' : ''}
                            />
                          </button>

                          {confirmingRemove ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleRemoveList(list)}
                                disabled={busy === `remove:${list.id}`}
                                className="h-8 px-2.5 rounded-md border border-red-500/50 bg-red-950/60 text-red-200 text-[11.5px] font-medium hover:bg-red-900/60 cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmKey(null)}
                                className="h-8 px-2 rounded-md border border-white/[0.1] bg-[#151923] text-slate-300 text-[11.5px] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              title="Remove list"
                              aria-label={`Remove ${list.name}`}
                              onClick={() => handleRemoveList(list)}
                              disabled={busy === `remove:${list.id}`}
                              className="w-8 h-8 rounded-md border border-white/[0.08] bg-[#151923] hover:bg-red-950/50 hover:border-red-500/40 text-slate-300 hover:text-red-300 flex items-center justify-center transition-[background-color,border-color,color,transform] duration-120 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 cursor-pointer"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-300">
                    Open Community Directory (Opt-In)
                  </h2>
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    Static, GitHub-reviewed JSON v2 and plain-text lists (
                    {registry.source === 'live'
                      ? 'synced from zyniotech/noisegate-lists'
                      : 'built-in index'}
                    ).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={reloadingIndex}
                  onClick={() => void loadRegistry(true)}
                  className="h-7 px-2.5 rounded-md border border-white/[0.09] bg-[#141821] hover:bg-[#1c2230] text-[12px] text-slate-200 inline-flex items-center gap-1.5 transition-[background-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer"
                >
                  <ArrowsClockwise
                    size={12}
                    className={reloadingIndex ? 'animate-spin' : ''}
                  />
                  <span>{reloadingIndex ? 'Reloading...' : 'Reload Index'}</span>
                </button>
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
                {registry.entries.map((entry) => {
                  const alreadyAdded =
                    subscribedUrls.has(entry.url) || subscribedIds.has(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.015] transition-[background-color] duration-100"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[13.5px] font-medium text-slate-100">
                            {entry.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 uppercase">
                            {entry.kind}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-300 mt-0.5">
                          {entry.description}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-1 flex flex-wrap items-center gap-x-3">
                          <span>Maintainer: {entry.maintainer}</span>
                          {entry.submissionUrl && (
                            <a
                              href={entry.submissionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-300 hover:text-white inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 rounded"
                            >
                              <GitBranch size={11} />
                              <span>Contribute via GitHub</span>
                            </a>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyAdded || busy === `registry:${entry.url}`}
                        onClick={() => handleSubscribeRegistry(entry)}
                        className={`h-8 px-3 rounded-md border text-[12px] font-medium shrink-0 inline-flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 ${
                          alreadyAdded
                            ? 'border-white/[0.1] text-slate-300 bg-white/[0.03] cursor-default'
                            : 'border-white/[0.14] bg-[#161b25] hover:bg-[#202736] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-white cursor-pointer'
                        }`}
                      >
                        {alreadyAdded ? (
                          <>
                            <Check size={13} />
                            <span>Subscribed</span>
                          </>
                        ) : (
                          <>
                            <Plus size={13} />
                            <span>
                              {busy === `registry:${entry.url}` ? 'Fetching...' : 'Subscribe'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {tab === 'topics' && settings && (
          <div className="space-y-8">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] overflow-hidden">
              <div className="p-5 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                    Neutral Channel Topic Controls
                  </h2>
                  <p className="text-[12.5px] text-slate-300 mt-0.5">
                    Topics come automatically from YouTube metadata as you browse, from your manual
                    channel tags, or from subscribed Topic Directories. Choose what passes through
                    your feed.
                  </p>
                </div>

                {activeTopicFiltersCount > 0 && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleResetAllTopics}
                    className="h-8 px-3 rounded-md border border-white/[0.11] bg-[#161b25] hover:bg-[#1f2634] text-[12px] text-slate-200 transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer"
                  >
                    Reset All to Pass
                  </button>
                )}
              </div>

              <div className="divide-y divide-white/[0.06]">
                {TOPIC_LIST.map((topic) => {
                  const currentAction: TopicRuleAction =
                    settings.topicRules?.[topic.id] ?? 'pass';
                  return (
                    <div
                      key={topic.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.015] transition-[background-color] duration-100"
                      style={{
                        borderLeft:
                          currentAction !== 'pass'
                            ? `2px solid ${topic.accentColor}`
                            : '2px solid transparent',
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-white">
                          {topic.label}
                        </div>
                        <div className="text-[12px] text-slate-300 mt-0.5">
                          {topic.description}
                        </div>
                      </div>

                      <div
                        role="group"
                        aria-label={`Filter action for ${topic.label}`}
                        className="inline-flex items-center p-0.5 rounded-md border border-white/[0.08] bg-[#0a0c10] text-[12px] shrink-0"
                      >
                        {TOPIC_RULE_OPTIONS.map((opt) => {
                          const active = currentAction === opt.value;
                          const activeColorClass =
                            opt.value === 'hide'
                              ? 'text-red-400'
                              : opt.value === 'dim'
                                ? 'text-orange-400'
                                : opt.value === 'label'
                                  ? 'text-amber-400'
                                  : 'text-white';
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={active}
                              disabled={busy !== null}
                              onClick={() => void handleTopicRuleChange(topic.id, opt.value)}
                              className={`h-7 px-2.5 rounded-[5px] transition-[background-color,color] duration-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer ${
                                active
                                  ? `bg-[#1c2230] ${activeColorClass} font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`
                                  : 'text-slate-400 hover:text-slate-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Monetization & Commercial Signals (Neutral Observations)
                </h2>
                <p className="text-[12.5px] text-slate-300 mt-0.5">
                  Because YouTube places ads even on non-partner channels, NoiseGate never guesses
                  monetization from ad playback and never claims a channel is unmonetized. It only
                  reports verifiable YouTube Partner Program signals (Partner status, Memberships,
                  Super Thanks, Super Chat, Shopping) and official creator Paid Promotion disclosures.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-white/[0.07]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <CurrencyCircleDollar size={18} className="text-slate-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13px] font-medium text-slate-100">
                        Show YPP Monetization Info on Watch & Channel pages
                      </div>
                      <div className="text-[12px] text-slate-300 mt-0.5">
                        Displays observed Partner status and features factually on Watch and Channel
                        pages and in the channel popover.
                      </div>
                    </div>
                  </div>
                  <TitaniumSwitch
                    checked={settings.showMonetizationIndicator}
                    disabled={busy === 'settings'}
                    onChange={(checked) =>
                      handleSettingPatch({ showMonetizationIndicator: checked })
                    }
                    label="Show factual monetization indicator"
                  />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2.5">
                    <Television size={18} className="text-slate-300 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13px] font-medium text-slate-100">
                        Show Topic Category on Watch & Channel pages
                      </div>
                      <div className="text-[12px] text-slate-300 mt-0.5">
                        Displays the detected or manually assigned topic category neutrally.
                      </div>
                    </div>
                  </div>
                  <TitaniumSwitch
                    checked={settings.showTopicIndicator}
                    disabled={busy === 'settings'}
                    onChange={(checked) => handleSettingPatch({ showTopicIndicator: checked })}
                    label="Show topic category indicator"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/[0.07]">
                <div className="flex flex-col gap-1.5 text-[12.5px]">
                  <span className="text-slate-200 font-medium inline-flex items-center gap-1.5">
                    <CurrencyCircleDollar size={14} className="text-slate-300" />
                    <span>Feed Action when YPP Monetization signals are observed</span>
                  </span>
                  <TitaniumSelect
                    value={settings.monetizedAction}
                    options={MONETIZED_ACTION_OPTIONS}
                    disabled={busy === 'settings'}
                    onChange={(nextAction) =>
                      handleSettingPatch({ monetizedAction: nextAction })
                    }
                    ariaLabel="Feed Action when YPP Monetization signals are observed"
                  />
                </div>

                <div className="flex flex-col gap-1.5 text-[12.5px]">
                  <span className="text-slate-200 font-medium inline-flex items-center gap-1.5">
                    <Megaphone size={14} className="text-slate-300" />
                    <span>Feed Action when Paid Promotion is disclosed</span>
                  </span>
                  <TitaniumSelect
                    value={settings.paidPromotionAction}
                    options={TOPIC_RULE_OPTIONS}
                    disabled={busy === 'settings'}
                    onChange={(nextAction) =>
                      handleSettingPatch({ paidPromotionAction: nextAction })
                    }
                    ariaLabel="Feed Action when Paid Promotion is disclosed"
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-300">
                  Locally Observed Channel Profiles ({snapshot?.channelProfiles.length ?? 0})
                </h2>

                <div className="flex flex-wrap items-center gap-2">
                  {(snapshot?.channelProfiles.length ?? 0) > 0 && (
                    <>
                      <div className="relative">
                        <MagnifyingGlass
                          size={14}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          value={profileSearch}
                          onChange={(e) => setProfileSearch(e.target.value)}
                          aria-label="Search observed channel profiles"
                          placeholder="Filter profiles..."
                          className="h-7 pl-8 pr-2.5 w-44 rounded-md border border-white/[0.09] bg-[#10131a] text-[12px] text-white placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                        />
                      </div>

                      {confirmKey === 'clear-profiles' ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleClearProfiles}
                            disabled={busy === 'clear-profiles'}
                            className="h-7 px-2.5 rounded-md border border-red-500/50 bg-red-950/60 text-red-200 text-[12px] font-medium cursor-pointer"
                          >
                            Confirm Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmKey(null)}
                            className="h-7 px-2 rounded-md border border-white/[0.1] bg-[#141821] text-slate-300 text-[12px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleClearProfiles}
                          disabled={busy === 'clear-profiles'}
                          className="h-7 px-2.5 rounded-md border border-white/[0.1] text-slate-300 hover:text-red-300 hover:border-red-500/40 text-[12px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 cursor-pointer"
                        >
                          Clear Profiles Cache
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
                {filteredProfiles.length === 0 ? (
                  <div className="p-6 text-[13px] text-slate-300">
                    {(snapshot?.channelProfiles.length ?? 0) === 0
                      ? 'No channel profiles cached yet. Open any YouTube video or channel page and NoiseGate will record its topic category and observable YPP signals locally.'
                      : 'No cached channel profiles match your search filter.'}
                  </div>
                ) : (
                  <>
                    {filteredProfiles.slice(0, 40).map((prof) => {
                      const effectiveTopics = prof.manualTopics ?? prof.observedTopics;
                      const rawCat = getTopObservedCategory(prof.observedYouTubeCategories);
                      const topicStr =
                        effectiveTopics.length > 0
                          ? effectiveTopics.map((t) => TOPICS[t]?.label ?? t).join(', ')
                          : rawCat ?? 'Unclassified';
                      const hasYpp = hasObservedYppSignals(prof.yppSignals);
                      const yppSummary = formatMonetizationSummary(
                        prof.yppSignals,
                        prof.monetizationInspected,
                      );

                      return (
                        <div
                          key={prof.channelKey}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[13.5px] font-medium text-white truncate">
                                {prof.channelName || formatHandle(prof.handle) || prof.channelKey}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400 truncate">
                                {[formatHandle(prof.handle), prof.channelId]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </div>
                            <div className="text-[12px] text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-slate-100">{topicStr}</span>
                              <span className="opacity-40">·</span>
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  hasYpp ? 'text-emerald-300' : 'text-slate-400'
                                }`}
                              >
                                <CurrencyCircleDollar
                                  size={13}
                                  weight="regular"
                                  className={
                                    hasYpp ? 'text-emerald-400 shrink-0' : 'text-slate-400 shrink-0'
                                  }
                                  aria-hidden="true"
                                />
                                <span>{yppSummary}</span>
                              </span>
                              {prof.paidPromotionVideoIds.length > 0 && (
                                <>
                                  <span className="opacity-40">·</span>
                                  <span className="inline-flex items-center gap-1 text-slate-300">
                                    <Megaphone
                                      size={12}
                                      weight="regular"
                                      className="text-slate-400 shrink-0"
                                      aria-hidden="true"
                                    />
                                    <span>{prof.paidPromotionVideoIds.length} paid promo</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-400 tabular shrink-0">
                            {formatRelativeTime(prof.lastObservedAt)}
                          </div>
                        </div>
                      );
                    })}
                    {filteredProfiles.length > 40 && (
                      <div className="px-4 py-2 text-[11.5px] text-slate-400 bg-[#0d1016]">
                        Showing most recent 40 of {filteredProfiles.length} matching profiles. Use the filter box above to narrow results.
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'rules' && (
          <div className="space-y-6">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                Add Local Channel Rule
              </h2>
              <p className="text-[12px] text-slate-300 mt-0.5">
                Local rules always take precedence over subscribed lists, topic rules, and signals
                (including Trust overrides).
              </p>

              <form
                onSubmit={handleAddLocalRule}
                className="grid grid-cols-1 md:grid-cols-12 gap-2.5 mt-4"
              >
                <input
                  type="text"
                  required
                  value={newRuleTarget}
                  onChange={(e) => setNewRuleTarget(e.target.value)}
                  aria-label="YouTube handle, UC channel ID, or channel URL"
                  placeholder="@handle, UC... ID, or channel URL"
                  className="md:col-span-4 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-400 transition-[border-color] duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                />
                <div className="md:col-span-2">
                  <TitaniumSelect
                    value={newRuleAction}
                    options={LOCAL_RULE_ACTION_OPTIONS}
                    onChange={setNewRuleAction}
                    ariaLabel="Local rule action"
                  />
                </div>
                <div className="md:col-span-2">
                  <TitaniumSelect
                    value={newRuleAction === 'allow' ? 'verified-independent' : newRuleCategory}
                    options={CATEGORY_OPTIONS}
                    onChange={setNewRuleCategory}
                    disabled={newRuleAction === 'allow'}
                    ariaLabel="Local rule category"
                  />
                </div>
                <input
                  type="text"
                  value={newRuleNote}
                  onChange={(e) => setNewRuleNote(e.target.value)}
                  aria-label="Optional local note"
                  placeholder="Optional note..."
                  className="md:col-span-2 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-400 transition-[border-color] duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                />
                <button
                  type="submit"
                  disabled={busy === 'add-rule'}
                  className="md:col-span-2 h-9 px-3 rounded-md bg-[#f8fafc] hover:bg-slate-200 text-[#0a0c10] font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 transition-[background-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={14} weight="bold" />
                  <span>Save Rule</span>
                </button>
              </form>
            </section>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <MagnifyingGlass
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  aria-label="Search local channel rules"
                  placeholder="Search channels, handles, or notes..."
                  className="w-full h-8 pl-9 pr-3 rounded-md border border-white/[0.09] bg-[#10131a] text-[12.5px] text-white placeholder:text-slate-400 transition-[border-color] duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                />
              </div>

              <div
                role="group"
                aria-label="Filter rules by action"
                className="inline-flex flex-wrap items-center p-0.5 rounded-md border border-white/[0.08] bg-[#0d1016] text-[12px]"
              >
                {(['all', 'label', 'dim', 'hide', 'allow'] as const).map((key) => {
                  const active = ruleFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setRuleFilter(key)}
                      className={`h-7 px-2.5 rounded-[5px] transition-[background-color,color] duration-120 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 cursor-pointer ${
                        active
                          ? 'bg-[#1c2230] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {key === 'all'
                        ? 'All'
                        : key === 'allow'
                          ? 'Trust'
                          : key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
              {filteredRules.length === 0 ? (
                <div className="p-6 text-[13px] text-slate-300">
                  No local rules match your current filter. Use the hover trigger on any YouTube
                  card or add a channel above.
                </div>
              ) : (
                filteredRules.map((rule) => {
                  const meta = getCategoryMeta(rule.category);
                  const accent = rule.action === 'allow' ? '#10b981' : meta.accentColor;

                  return (
                    <div
                      key={rule.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.015] transition-[background-color] duration-100"
                      style={{ borderLeft: `2px solid ${accent}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-medium text-white truncate">
                            {rule.channelName || formatHandle(rule.handle) || rule.id}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 truncate">
                            {[formatHandle(rule.handle), rule.channelId].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-300 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span className="text-slate-200">
                            {rule.action === 'allow' ? 'Trust (Local Override)' : meta.label}
                          </span>
                          {rule.note && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="break-words min-w-0">{rule.note}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {(
                          [
                            { act: 'label', label: 'Label', Icon: Tag, cls: 'text-amber-400' },
                            { act: 'dim', label: 'Dim', Icon: EyeSlash, cls: 'text-orange-400' },
                            { act: 'hide', label: 'Hide', Icon: Prohibit, cls: 'text-red-400' },
                            {
                              act: 'allow',
                              label: 'Trust',
                              Icon: ShieldCheck,
                              cls: 'text-emerald-400',
                            },
                          ] as const
                        ).map(({ act, label, Icon, cls }) => {
                          const active = rule.action === act;
                          const channelLabel = rule.channelName || rule.id;
                          return (
                            <button
                              key={act}
                              type="button"
                              title={label}
                              aria-label={`${label} ${channelLabel}`}
                              aria-pressed={active}
                              disabled={busy !== null}
                              onClick={() => handleUpdateRuleAction(rule, act)}
                              className={`h-7 px-2 rounded border text-[11.5px] inline-flex items-center gap-1 transition-[background-color,border-color,color,transform] duration-110 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer ${
                                active
                                  ? `border-white/20 bg-white/[0.09] ${cls} font-medium`
                                  : 'border-white/[0.06] bg-transparent text-slate-300 hover:text-white hover:bg-white/[0.04]'
                              }`}
                            >
                              <Icon size={13} weight={active ? 'fill' : 'regular'} />
                              <span className="hidden md:inline">{label}</span>
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          title="Delete rule"
                          aria-label={`Delete rule for ${rule.channelName || rule.id}`}
                          disabled={busy !== null}
                          onClick={() => handleDeleteRule(rule.id)}
                          className="w-7 h-7 rounded border border-white/[0.07] text-slate-300 hover:text-red-300 hover:border-red-500/40 flex items-center justify-center transition-[border-color,color,transform] duration-110 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-50 cursor-pointer ml-1"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === 'disclosures' && settings && (
          <div className="space-y-6">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-4">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Layer 1: Official YouTube Synthetic Disclosures
                </h2>
                <p className="text-[12.5px] text-slate-300 mt-1">
                  When you open a YouTube video carrying the official{' '}
                  <em className="text-slate-100">"Altered or synthetic content"</em> disclosure,
                  NoiseGate flags it immediately and caches the video and channel locally so you
                  recognize it across feeds with zero extra network calls.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-white/[0.07]">
                <div className="flex flex-col gap-1.5 text-[12.5px]">
                  <span className="text-slate-200 font-medium">Action on disclosed content</span>
                  <TitaniumSelect
                    value={settings.disclosureAction}
                    options={ACTION_OPTIONS}
                    disabled={busy === 'settings'}
                    onChange={(nextAction) =>
                      handleSettingPatch({ disclosureAction: nextAction })
                    }
                    ariaLabel="Action on disclosed content"
                  />
                </div>

                <div className="flex items-start justify-between gap-4 pt-2 sm:pt-5">
                  <div>
                    <span className="text-[12.5px] text-slate-100 font-medium block">
                      Show channel disclosure indicator in feeds
                    </span>
                    <span className="text-slate-300 text-[11.5px]">
                      Annotate other videos from a channel after observing a disclosed video.
                    </span>
                  </div>
                  <TitaniumSwitch
                    checked={settings.propagateChannelDisclosure}
                    disabled={busy === 'settings'}
                    onChange={(checked) =>
                      handleSettingPatch({ propagateChannelDisclosure: checked })
                    }
                    label="Propagate channel disclosure indicator to feeds"
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-300">
                  {(() => {
                    const total = snapshot?.totalVideoDisclosures ?? 0;
                    return `Locally Observed Disclosures (${total} ${total === 1 ? 'video' : 'videos'})`;
                  })()}
                </h2>
                {(snapshot?.totalVideoDisclosures ?? 0) > 0 && (
                  confirmKey === 'clear-disclosures' ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleClearDisclosures}
                        disabled={busy === 'clear-disclosures'}
                        className="h-7 px-2.5 rounded-md border border-red-500/50 bg-red-950/60 text-red-200 text-[12px] font-medium cursor-pointer"
                      >
                        Confirm Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmKey(null)}
                        className="h-7 px-2 rounded-md border border-white/[0.1] bg-[#141821] text-slate-300 text-[12px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleClearDisclosures}
                      disabled={busy === 'clear-disclosures'}
                      className="h-7 px-2.5 rounded-md border border-red-500/30 text-red-300 hover:bg-red-950/30 text-[12px] transition-[background-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 cursor-pointer"
                    >
                      Clear Cache
                    </button>
                  )
                )}
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
                {(snapshot?.channelDisclosures ?? []).length === 0 ? (
                  <div className="p-6 text-[13px] text-slate-300">
                    No official YouTube synthetic disclosures observed yet. Watch any video carrying
                    YouTube's "Altered or synthetic content" label and it will appear here
                    automatically.
                  </div>
                ) : (
                  (snapshot?.channelDisclosures ?? []).map((ch) => (
                    <div
                      key={ch.channelKey}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4"
                      style={{ borderLeft: '2px solid #38bdf8' }}
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-white truncate">
                          {ch.channelName || formatHandle(ch.handle) || ch.channelKey}
                        </div>
                        <div className="text-[11.5px] font-mono text-slate-400 mt-0.5 truncate">
                          {[formatHandle(ch.handle), ch.channelId].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="sm:text-right text-[12px] text-slate-300 tabular shrink-0">
                        <div className="text-sky-400 font-medium">
                          {ch.videoIds.length} disclosed video
                          {ch.videoIds.length === 1 ? '' : 's'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Last seen {formatRelativeTime(ch.lastDetectedAt)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'settings' && settings && (
          <div className="space-y-6">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-4">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                General Preferences
              </h2>

              <div className="space-y-4 pt-3 border-t border-white/[0.07]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[13px] text-slate-100 font-medium">
                      Show 1-click NoiseGate button on YouTube card hover
                    </div>
                    <div className="text-slate-300 text-[12px] mt-0.5">
                      Displays a subtle corner trigger when hovering over video cards to inspect or
                      label a channel in one click.
                    </div>
                  </div>
                  <TitaniumSwitch
                    checked={settings.showCardHoverButton}
                    disabled={busy === 'settings'}
                    onChange={(checked) => handleSettingPatch({ showCardHoverButton: checked })}
                    label="Show card hover button on YouTube"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-slate-100">
                      Background list auto-refresh interval
                    </div>
                    <div className="text-[12px] text-slate-300 mt-0.5">
                      Periodic check for external subscribed filter lists via browser alarms (uses
                      ETag conditional requests).
                    </div>
                  </div>
                  <div className="w-full sm:w-44 shrink-0">
                    <TitaniumSelect
                      value={String(settings.autoRefreshHours)}
                      options={AUTO_REFRESH_OPTIONS}
                      disabled={busy === 'settings'}
                      ariaLabel="Background list auto-refresh interval"
                      size="sm"
                      align="right"
                      onChange={(val) =>
                        handleSettingPatch({ autoRefreshHours: Number(val) })
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-slate-100">
                      Community GitHub repository for metadata suggestions
                    </div>
                    <div className="text-[12px] text-slate-300 mt-0.5">
                      Default <code className="font-mono text-slate-200">owner/repo</code> opened by
                      "Suggest metadata on GitHub" in the channel popover.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    <input
                      type="text"
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                      aria-label="Community GitHub repository owner/repo slug"
                      placeholder="zyniotech/noisegate-lists"
                      className="h-8 flex-1 sm:flex-none sm:w-56 px-2.5 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[12px] font-mono text-white placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/55"
                    />
                    <button
                      type="button"
                      disabled={busy === 'settings'}
                      onClick={() => void handleSaveRepoSlug()}
                      className="h-8 px-3 rounded-md border border-white/[0.12] bg-[#161b25] hover:bg-[#202736] text-[12px] text-white shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-4">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Local Export & Import (JSON)
                </h2>
                <p className="text-[12.5px] text-slate-300 mt-0.5">
                  All rules live locally in your browser. Export your configuration anytime or
                  import a NoiseGate backup or Filter List JSON v1/v2 file.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={busy === 'export'}
                  className="h-9 px-4 rounded-md border border-white/[0.14] bg-[#161b25] hover:bg-[#202736] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-[13px] text-white font-medium inline-flex items-center gap-2 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 disabled:opacity-50 cursor-pointer"
                >
                  <DownloadSimple size={15} />
                  <span>Export JSON Backup</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <TitaniumSelect
                    value={importMode}
                    options={IMPORT_MODE_OPTIONS}
                    onChange={setImportMode}
                    ariaLabel="Import mode"
                    fullWidth={false}
                    triggerPrefix="Import Mode: "
                  />

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportFile}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy === 'import'}
                    className="h-9 px-4 rounded-md bg-[#f8fafc] hover:bg-slate-200 text-[#0a0c10] text-[13px] font-semibold inline-flex items-center gap-2 transition-[background-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 cursor-pointer"
                  >
                    <UploadSimple size={15} weight="bold" />
                    <span>{busy === 'import' ? 'Importing...' : 'Import JSON'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-medium text-slate-100">
                    Reset All Local Extension Data
                  </div>
                  <div className="text-[12px] text-slate-300 mt-0.5">
                    Clears all local rules, observed profiles, disclosure caches, subscribed external
                    lists, and restores defaults.
                  </div>
                </div>
                {confirmKey === 'reset-all' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleResetAllData()}
                      disabled={busy === 'reset-all'}
                      className="h-8 px-3 rounded-md border border-red-500/50 bg-red-950/60 hover:bg-red-900/60 text-red-200 text-[12px] font-medium cursor-pointer"
                    >
                      {busy === 'reset-all' ? 'Resetting...' : 'Confirm Full Reset'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmKey(null)}
                      className="h-8 px-2.5 rounded-md border border-white/[0.1] bg-[#141821] text-slate-300 text-[12px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleResetAllData()}
                    disabled={busy !== null}
                    className="h-8 px-3 rounded-md border border-red-500/35 text-red-300 hover:bg-red-950/35 text-[12px] font-medium shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 disabled:opacity-50 cursor-pointer"
                  >
                    Reset Everything
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
