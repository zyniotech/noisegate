import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  CaretDown,
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
import { TitaniumSwitch } from '@/components/TitaniumSwitch';
import { getCategoryMeta, SELECTABLE_CATEGORIES } from '@/lib/categories';
import type { RegistrySnapshot, StateSnapshot } from '@/lib/messages';
import { formatHandle, parseYouTubeChannelHref } from '@/lib/normalize';
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
  TOPIC_LIST,
  TOPICS,
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

const TOPIC_RULE_OPTIONS: Array<{ value: TopicRuleAction; label: string }> = [
  { value: 'pass', label: 'Pass' },
  { value: 'label', label: 'Label' },
  { value: 'dim', label: 'Dim' },
  { value: 'hide', label: 'Hide' },
];

const SELECT_CLASS =
  'appearance-none w-full h-9 pl-3 pr-8 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white transition-[border-color] duration-120 focus:outline-none focus:border-white/50 disabled:opacity-40 cursor-pointer';

const SELECT_SM_CLASS =
  'appearance-none h-8 pl-2.5 pr-7 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[12px] text-slate-100 transition-[border-color] duration-120 focus:outline-none focus:border-white/50 cursor-pointer';

export default function App() {
  const [tab, setTab] = useState<TabKey>('lists');
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [registry, setRegistry] = useState<RegistrySnapshot>({
    entries: BUNDLED_REGISTRY_ENTRIES,
    source: 'fallback',
  });
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [listUrl, setListUrl] = useState('');
  const [listName, setListName] = useState('');
  const [listAction, setListAction] = useState<FilterAction>('label');

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleFilter, setRuleFilter] = useState<LocalRuleAction | 'all'>('all');
  const [newRuleTarget, setNewRuleTarget] = useState('');
  const [newRuleAction, setNewRuleAction] = useState<LocalRuleAction>('label');
  const [newRuleCategory, setNewRuleCategory] = useState<CategoryId>('ai-synthetic');
  const [newRuleNote, setNewRuleNote] = useState('');

  const [repoInput, setRepoInput] = useState('');

  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showNotice = useCallback((kind: 'ok' | 'error', text: string) => {
    setNotice({ kind, text });
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await fetchSnapshot();
      setSnapshot(data);
      setRepoInput(data.settings.communitySubmissionRepo);
    } catch (err) {
      showNotice('error', err instanceof Error ? err.message : 'Failed to load state');
    }
  }, [showNotice]);

  const loadRegistry = useCallback(async () => {
    try {
      const res = await sendRuntimeMessage<RegistrySnapshot>({ type: 'FETCH_REGISTRY' });
      setRegistry(res);
    } catch {
      // Keep bundled fallback
    }
  }, []);

  useEffect(() => {
    void reload();
    void loadRegistry();
  }, [reload, loadRegistry]);

  const subscribedUrls = useMemo(
    () => new Set((snapshot?.subscribedLists ?? []).map((l) => l.url)),
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

  const handleAddList = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = listUrl.trim();
    if (!trimmedUrl) return;
    setBusy('add-list');
    setNotice(null);
    try {
      const added = await sendRuntimeMessage<SubscribedListMeta>({
        type: 'ADD_FILTER_LIST',
        url: trimmedUrl,
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
      const added = await sendRuntimeMessage<SubscribedListMeta>({
        type: 'ADD_FILTER_LIST',
        url: entry.url,
        defaultAction: entry.defaultAction,
        customName: entry.name,
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
    patch: { enabled?: boolean; defaultAction?: FilterAction },
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
      await sendRuntimeMessage({ type: 'REFRESH_FILTER_LIST', listId });
      await reload();
      showNotice('ok', listId ? 'Filter list refreshed.' : 'All active filter lists refreshed.');
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
    const channelId = parsedHref.channelId ?? (raw.startsWith('UC') ? raw : undefined);
    const handle =
      parsedHref.handle ??
      (!channelId ? (raw.startsWith('@') ? raw : `@${raw}`) : undefined);

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
        category: action === 'allow' ? 'verified-independent' : rule.category,
        note: rule.note,
      });
      await reload();
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
    } finally {
      setBusy(null);
    }
  };

  const handleSettingPatch = async (patch: Record<string, unknown>) => {
    setBusy('settings');
    try {
      await sendRuntimeMessage({ type: 'UPDATE_SETTINGS', patch });
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const handleTopicRuleChange = async (topicId: TopicId, action: TopicRuleAction) => {
    if (!snapshot) return;
    const nextTopicRules = { ...snapshot.settings.topicRules };
    if (action === 'pass') {
      delete nextTopicRules[topicId];
    } else {
      nextTopicRules[topicId] = action;
    }
    await handleSettingPatch({ topicRules: nextTopicRules });
  };

  const handleResetAllTopics = async () => {
    await handleSettingPatch({ topicRules: {} });
    showNotice('ok', 'All topic filters reset to Pass.');
  };

  const handleClearDisclosures = async () => {
    setBusy('clear-disclosures');
    try {
      await sendRuntimeMessage({ type: 'CLEAR_DISCLOSURES' });
      await reload();
      showNotice('ok', 'Cleared locally cached YouTube disclosure records.');
    } finally {
      setBusy(null);
    }
  };

  const handleClearProfiles = async () => {
    setBusy('clear-profiles');
    try {
      await sendRuntimeMessage({ type: 'CLEAR_CHANNEL_PROFILES' });
      await reload();
      showNotice('ok', 'Cleared locally observed channel topic and monetization profiles.');
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
      a.click();
      URL.revokeObjectURL(url);
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
    setBusy('import');
    setNotice(null);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const result = await sendRuntimeMessage<{
        importedRules: number;
        importedLists: number;
      }>({
        type: 'IMPORT_DATA',
        payload: parsed,
        mode: importMode,
      });
      await reload();
      showNotice(
        'ok',
        `Imported ${result.importedRules} local rules and ${result.importedLists} filter lists (${importMode}).`,
      );
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

      {/* Top Shell — Ultramono Titanium */}
      <header className="border-b border-white/[0.08] bg-[#0d1016]">
        <div className="max-w-[980px] mx-auto px-6 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
            <div className="flex items-center gap-3.5">
              <img
                src="/icon/48.png"
                alt="NoiseGate"
                className="w-9 h-9 block shrink-0 drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
              />
              <div>
                <h1 className="text-[18px] font-semibold tracking-[-0.02em] text-white leading-tight">
                  NoiseGate
                </h1>
                <p className="text-[12.5px] text-slate-400 mt-0.5">
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

          {/* 3-Layer + Topics Instrumentation Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.07] border-t border-white/[0.06] py-3 mb-2 text-[12px]">
            <div className="pr-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-500">Observed Profiles</span>
              <span className="font-mono text-slate-200 tabular">
                {snapshot?.channelProfiles.length ?? 0}
              </span>
            </div>
            <div className="px-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-500">Topic Filters</span>
              <span className="font-mono text-slate-200 tabular">
                {activeTopicFiltersCount}
              </span>
            </div>
            <div className="px-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-500">Local Rules</span>
              <span className="font-mono text-slate-200 tabular">
                {snapshot?.localRules.length ?? 0}
              </span>
            </div>
            <div className="pl-4 flex items-baseline justify-between gap-2">
              <span className="text-slate-500">Active List Entries</span>
              <span className="font-mono text-slate-200 tabular">
                {totalActiveEntries.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Flat Underlined Navigation Tabs */}
          <nav className="flex flex-wrap items-center gap-6 -mb-px text-[13px] border-t border-white/[0.06] pt-3">
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
                  onClick={() => {
                    setTab(key);
                    setNotice(null);
                  }}
                  className={`pb-3 flex items-center gap-2 border-b-2 transition-[color,border-color] duration-120 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 rounded-t cursor-pointer ${
                    active
                      ? 'border-white text-white font-medium'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon size={15} weight={active ? 'fill' : 'regular'} />
                  <span>{label}</span>
                  {count !== null && (
                    <span className="text-[11px] font-mono text-slate-500 tabular">{count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[980px] mx-auto px-6 py-7">
        {notice && (
          <div
            className={`mb-6 px-4 py-2.5 border-l-2 text-[13px] flex items-center justify-between gap-3 ${
              notice.kind === 'error'
                ? 'border-red-500 bg-red-950/25 text-red-300'
                : 'border-slate-300 bg-white/[0.04] text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {notice.kind === 'error' ? (
                <WarningCircle size={15} className="shrink-0 text-red-400" />
              ) : (
                <CheckCircle size={15} className="shrink-0 text-slate-300" />
              )}
              <span className="truncate">{notice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs text-slate-400 hover:text-white shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: FILTER LISTS & OPEN REGISTRY */}
        {tab === 'lists' && (
          <div className="space-y-8">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Subscribe to an External Filter List
                </h2>
                <p className="text-[12px] text-slate-400 mt-0.5">
                  Supports NoiseGate JSON v1/v2 and plain-text AiSList format (
                  <code className="text-slate-200 font-mono">@handle</code> or{' '}
                  <code className="text-slate-200 font-mono">UC...</code> per line).
                </p>
              </div>

              <form onSubmit={handleAddList} className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-4">
                <input
                  type="url"
                  required
                  value={listUrl}
                  onChange={(e) => setListUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/.../list.json or .txt"
                  className="md:col-span-6 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-500 transition-[border-color] duration-120 focus:outline-none focus:border-white/50"
                />
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder="Custom label (optional)"
                  className="md:col-span-2 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-500 transition-[border-color] duration-120 focus:outline-none focus:border-white/50"
                />
                <div className="relative md:col-span-2">
                  <select
                    value={listAction}
                    onChange={(e) => setListAction(e.target.value as FilterAction)}
                    aria-label="Default action for list"
                    className={SELECT_CLASS}
                  >
                    {ACTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Action: {opt.label}
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={13}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy === 'add-list'}
                  className="md:col-span-2 h-9 px-3 rounded-md bg-[#f8fafc] hover:bg-slate-200 text-[#0a0c10] font-semibold text-[13px] flex items-center justify-center gap-1.5 transition-[background-color,transform,opacity] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10131a] disabled:opacity-50 cursor-pointer"
                >
                  <Plus size={15} weight="bold" />
                  <span>{busy === 'add-list' ? 'Loading...' : 'Subscribe'}</span>
                </button>
              </form>
            </section>

            {/* Subscribed Lists */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                  Subscribed Lists
                </h2>
                <div className="flex items-center gap-2">
                  {!hasStarterList && (
                    <button
                      type="button"
                      onClick={handleRestoreStarter}
                      disabled={busy === 'restore-starter'}
                      className="h-7 px-2.5 rounded-md border border-white/[0.1] bg-[#141821] hover:bg-[#1c2230] text-[12px] text-slate-200 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] cursor-pointer"
                    >
                      Restore 25-Channel Test Sample
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRefreshLists()}
                    disabled={busy === 'refresh-all'}
                    className="h-7 px-2.5 rounded-md border border-white/[0.1] bg-[#141821] hover:bg-[#1c2230] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] text-[12px] text-slate-200 inline-flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer"
                  >
                    <ArrowsClockwise
                      size={13}
                      className={busy === 'refresh-all' ? 'animate-spin' : ''}
                    />
                    <span>Refresh All</span>
                  </button>
                </div>
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden">
                {(snapshot?.subscribedLists ?? []).length === 0 ? (
                  <div className="p-6 text-[13px] text-slate-400">
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
                          : '#cbd5e1';

                    const formatLabel =
                      list.format === 'json-v2'
                        ? 'JSON v2'
                        : list.format === 'json-v1'
                          ? 'JSON v1'
                          : 'Plain-Text';

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
                              onChange={(checked) => handleUpdateList(list.id, { enabled: checked })}
                              label={`Enable ${list.name}`}
                            />
                            <span
                              className={`text-[14px] font-medium truncate ${
                                list.enabled ? 'text-white' : 'text-slate-400'
                              }`}
                            >
                              {list.name}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 uppercase shrink-0">
                              {formatLabel}
                            </span>
                            {list.bundled && (
                              <span className="text-[11px] font-mono text-slate-400 shrink-0">
                                · Bundled Sample
                              </span>
                            )}
                          </div>

                          {list.description && (
                            <p className="text-[12px] text-slate-400 mt-1.5 pl-11">
                              {list.description}
                            </p>
                          )}

                          <div className="mt-1.5 pl-11 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-slate-500 tabular">
                            <span>
                              <strong className="text-slate-300 font-medium">
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
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-[color] duration-100"
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
                                className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-[color] duration-100"
                              >
                                <GitBranch size={12} />
                                <span>Suggest Entry</span>
                              </a>
                            )}
                            {list.lastError && (
                              <span className="text-red-400 inline-flex items-center gap-1">
                                <Warning size={12} />
                                {list.lastError}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-11 sm:pl-0 shrink-0">
                          <div className="relative">
                            <select
                              value={list.defaultAction}
                              onChange={(e) =>
                                handleUpdateList(list.id, {
                                  defaultAction: e.target.value as FilterAction,
                                })
                              }
                              aria-label={`Default action for ${list.name}`}
                              className={SELECT_SM_CLASS}
                            >
                              {ACTION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <CaretDown
                              size={12}
                              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                          </div>

                          <button
                            type="button"
                            title="Refresh this list"
                            aria-label={`Refresh ${list.name}`}
                            onClick={() => handleRefreshLists(list.id)}
                            disabled={busy === `refresh:${list.id}`}
                            className="w-8 h-8 rounded-md border border-white/[0.08] bg-[#151923] hover:bg-[#1e2432] text-slate-300 flex items-center justify-center transition-[background-color,border-color,transform] duration-120 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer"
                          >
                            <ArrowsClockwise
                              size={14}
                              className={busy === `refresh:${list.id}` ? 'animate-spin' : ''}
                            />
                          </button>

                          <button
                            type="button"
                            title="Remove list"
                            aria-label={`Remove ${list.name}`}
                            onClick={() => handleRemoveList(list)}
                            disabled={busy === `remove:${list.id}`}
                            className="w-8 h-8 rounded-md border border-white/[0.08] bg-[#151923] hover:bg-red-950/50 hover:border-red-500/40 text-slate-400 hover:text-red-400 flex items-center justify-center transition-[background-color,border-color,color,transform] duration-120 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/50 cursor-pointer"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Open Community Directory (Zero-Cost GitHub / CDN Registry) */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                    Open Community Directory (Opt-In)
                  </h2>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Static, GitHub-reviewed JSON v2 and plain-text lists ({registry.source === 'live' ? 'synced from zyniotech/noisegate-lists' : 'built-in index'}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadRegistry()}
                  className="h-7 px-2.5 rounded-md border border-white/[0.09] bg-[#141821] hover:bg-[#1c2230] text-[12px] text-slate-300 inline-flex items-center gap-1.5 transition-[background-color,transform] duration-120 active:scale-[0.97] cursor-pointer"
                >
                  <ArrowsClockwise size={12} />
                  <span>Reload Index</span>
                </button>
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
                {registry.entries.map((entry) => {
                  const alreadyAdded = subscribedUrls.has(entry.url);
                  return (
                    <div
                      key={entry.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.015] transition-[background-color] duration-100"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13.5px] font-medium text-slate-100">
                            {entry.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 uppercase">
                            {entry.kind}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-400 mt-0.5">
                          {entry.description}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-1 flex flex-wrap items-center gap-x-3">
                          <span>Maintainer: {entry.maintainer}</span>
                          {entry.submissionUrl && (
                            <a
                              href={entry.submissionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-400 hover:text-white inline-flex items-center gap-1"
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
                        className={`h-8 px-3 rounded-md border text-[12px] font-medium shrink-0 inline-flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 ${
                          alreadyAdded
                            ? 'border-white/[0.1] text-slate-400 bg-white/[0.03] cursor-default'
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

        {/* TAB 2: NEUTRAL TOPICS & COMMERCIAL/DISCLOSURE SIGNALS */}
        {tab === 'topics' && settings && (
          <div className="space-y-8">
            {/* Topic Rule Matrix */}
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] overflow-hidden">
              <div className="p-5 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                    Neutral Channel Topic Controls
                  </h2>
                  <p className="text-[12.5px] text-slate-400 mt-0.5">
                    Topics come automatically from YouTube metadata as you browse, from your manual
                    channel tags, or from subscribed Topic Directories. Choose what passes through
                    your feed.
                  </p>
                </div>

                {activeTopicFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetAllTopics}
                    className="h-8 px-3 rounded-md border border-white/[0.11] bg-[#161b25] hover:bg-[#1f2634] text-[12px] text-slate-200 transition active:scale-[0.97] cursor-pointer"
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
                        <div className="text-[12px] text-slate-400 mt-0.5">
                          {topic.description}
                        </div>
                      </div>

                      <div className="inline-flex items-center p-0.5 rounded-md border border-white/[0.08] bg-[#0a0c10] text-[12px] shrink-0">
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
                              onClick={() => void handleTopicRuleChange(topic.id, opt.value)}
                              className={`h-7 px-2.5 rounded-[5px] transition-[background-color,color] duration-110 cursor-pointer ${
                                active
                                  ? `bg-[#1c2230] ${activeColorClass} font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`
                                  : 'text-slate-500 hover:text-slate-200'
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

            {/* Monetization & Paid Promotion Controls */}
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-5">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Monetization & Commercial Signals (Neutral Observations)
                </h2>
                <p className="text-[12.5px] text-slate-400 mt-0.5">
                  Because YouTube places ads even on non-partner channels, NoiseGate only reports
                  verifiable public YouTube Partner Program features (Memberships, Super Thanks,
                  Super Chat, Shopping) and official creator Paid Promotion disclosures.
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
                      <div className="text-[12px] text-slate-400 mt-0.5">
                        Displays observed Partner features factually beneath the video title and
                        in the channel popover.
                      </div>
                    </div>
                  </div>
                  <TitaniumSwitch
                    checked={settings.showMonetizationIndicator}
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
                      <div className="text-[12px] text-slate-400 mt-0.5">
                        Displays the detected or manually assigned topic category neutrally.
                      </div>
                    </div>
                  </div>
                  <TitaniumSwitch
                    checked={settings.showTopicIndicator}
                    onChange={(checked) => handleSettingPatch({ showTopicIndicator: checked })}
                    label="Show topic category indicator"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/[0.07]">
                <label className="flex flex-col gap-1.5 text-[12.5px]">
                  <span className="text-slate-300 font-medium inline-flex items-center gap-1.5">
                    <CurrencyCircleDollar size={14} className="text-slate-400" />
                    <span>Feed Action when YPP Monetization signals are observed</span>
                  </span>
                  <div className="relative">
                    <select
                      value={settings.monetizedAction}
                      onChange={(e) =>
                        handleSettingPatch({
                          monetizedAction: e.target.value as TopicRuleAction,
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {TOPIC_RULE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                          {opt.value === 'pass' ? ' (Neutral info only — Recommended)' : ''}
                        </option>
                      ))}
                    </select>
                    <CaretDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5 text-[12.5px]">
                  <span className="text-slate-300 font-medium inline-flex items-center gap-1.5">
                    <Megaphone size={14} className="text-slate-400" />
                    <span>Feed Action when Paid Promotion is disclosed</span>
                  </span>
                  <div className="relative">
                    <select
                      value={settings.paidPromotionAction}
                      onChange={(e) =>
                        handleSettingPatch({
                          paidPromotionAction: e.target.value as TopicRuleAction,
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {TOPIC_RULE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <CaretDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>
              </div>
            </section>

            {/* Locally Observed Channel Profiles */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                  Locally Observed Channel Profiles ({snapshot?.channelProfiles.length ?? 0})
                </h2>
                {(snapshot?.channelProfiles.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleClearProfiles}
                    disabled={busy === 'clear-profiles'}
                    className="h-7 px-2.5 rounded-md border border-white/[0.1] text-slate-300 hover:text-red-400 hover:border-red-500/40 text-[12px] transition cursor-pointer"
                  >
                    Clear Profiles Cache
                  </button>
                )}
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
                {(snapshot?.channelProfiles ?? []).length === 0 ? (
                  <div className="p-6 text-[13px] text-slate-400">
                    No channel profiles cached yet. Open any YouTube video or channel page and
                    NoiseGate will record its topic category and observable YPP features locally.
                  </div>
                ) : (
                  (snapshot?.channelProfiles ?? []).slice(0, 40).map((prof) => {
                    const effectiveTopics = prof.manualTopics ?? prof.observedTopics;
                    const rawCat = getTopObservedCategory(prof.observedYouTubeCategories);
                    const topicStr =
                      effectiveTopics.length > 0
                        ? effectiveTopics.map((t) => TOPICS[t]?.label ?? t).join(', ')
                        : rawCat ?? 'Unclassified';

                    return (
                      <div
                        key={prof.channelKey}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-medium text-white truncate">
                              {prof.channelName || formatHandle(prof.handle) || prof.channelKey}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 truncate">
                              {[formatHandle(prof.handle), prof.channelId]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                          <div className="text-[12px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                            <span className="text-slate-200">{topicStr}</span>
                            <span className="opacity-35">·</span>
                            <span>
                              {formatMonetizationSummary(
                                prof.yppSignals,
                                prof.monetizationInspected,
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 tabular shrink-0">
                          {formatRelativeTime(prof.lastObservedAt)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: LOCAL RULES */}
        {tab === 'rules' && (
          <div className="space-y-6">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                Add Local Channel Rule
              </h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
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
                  placeholder="@handle, UC... ID, or channel URL"
                  className="md:col-span-4 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-500 transition-[border-color] duration-120 focus:outline-none focus:border-white/50"
                />
                <div className="relative md:col-span-2">
                  <select
                    value={newRuleAction}
                    onChange={(e) => setNewRuleAction(e.target.value as LocalRuleAction)}
                    className={SELECT_CLASS}
                  >
                    <option value="label">Label</option>
                    <option value="dim">Dim</option>
                    <option value="hide">Hide</option>
                    <option value="allow">Trust (Override)</option>
                  </select>
                  <CaretDown
                    size={13}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
                <div className="relative md:col-span-2">
                  <select
                    value={newRuleCategory}
                    onChange={(e) => setNewRuleCategory(e.target.value as CategoryId)}
                    disabled={newRuleAction === 'allow'}
                    className={SELECT_CLASS}
                  >
                    {SELECTABLE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel}
                      </option>
                    ))}
                  </select>
                  <CaretDown
                    size={13}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
                <input
                  type="text"
                  value={newRuleNote}
                  onChange={(e) => setNewRuleNote(e.target.value)}
                  placeholder="Optional note..."
                  className="md:col-span-2 h-9 px-3 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[13px] text-white placeholder:text-slate-500 transition-[border-color] duration-120 focus:outline-none focus:border-white/50"
                />
                <button
                  type="submit"
                  disabled={busy === 'add-rule'}
                  className="md:col-span-2 h-9 px-3 rounded-md bg-[#f8fafc] hover:bg-slate-200 text-[#0a0c10] font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 transition-[background-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 cursor-pointer"
                >
                  <Plus size={14} weight="bold" />
                  <span>Save Rule</span>
                </button>
              </form>
            </section>

            {/* Filter & Segmented Control */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <MagnifyingGlass
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  placeholder="Search channels, handles, or notes..."
                  className="w-full h-8 pl-9 pr-3 rounded-md border border-white/[0.09] bg-[#10131a] text-[12.5px] text-white placeholder:text-slate-500 transition-[border-color] duration-120 focus:outline-none focus:border-white/50"
                />
              </div>

              <div className="inline-flex items-center p-0.5 rounded-md border border-white/[0.08] bg-[#0d1016] text-[12px]">
                {(['all', 'label', 'dim', 'hide', 'allow'] as const).map((key) => {
                  const active = ruleFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setRuleFilter(key)}
                      className={`h-7 px-2.5 rounded-[5px] transition-[background-color,color] duration-120 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer ${
                        active
                          ? 'bg-[#1c2230] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {key === 'all'
                        ? 'All'
                        : key === 'allow'
                          ? 'Trusted'
                          : key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
              {filteredRules.length === 0 ? (
                <div className="p-6 text-[13px] text-slate-400">
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
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-medium text-white truncate">
                            {rule.channelName || formatHandle(rule.handle) || rule.id}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 truncate">
                            {[formatHandle(rule.handle), rule.channelId].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <div className="text-[12px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span className="text-slate-300">
                            {rule.action === 'allow' ? 'Trusted Override' : meta.label}
                          </span>
                          {rule.note && (
                            <>
                              <span className="opacity-40">·</span>
                              <span>{rule.note}</span>
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
                          return (
                            <button
                              key={act}
                              type="button"
                              title={label}
                              onClick={() => handleUpdateRuleAction(rule, act)}
                              className={`h-7 px-2 rounded border text-[11.5px] inline-flex items-center gap-1 transition-[background-color,border-color,color,transform] duration-110 active:scale-[0.95] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer ${
                                active
                                  ? `border-white/20 bg-white/[0.09] ${cls} font-medium`
                                  : 'border-white/[0.06] bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
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
                          onClick={() => handleDeleteRule(rule.id)}
                          className="w-7 h-7 rounded border border-white/[0.07] text-slate-400 hover:text-red-400 hover:border-red-500/40 flex items-center justify-center transition-[border-color,color,transform] duration-110 active:scale-[0.94] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/50 cursor-pointer ml-1"
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

        {/* TAB 4: OFFICIAL YOUTUBE DISCLOSURES (LAYER 1) */}
        {tab === 'disclosures' && settings && (
          <div className="space-y-6">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-4">
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                  Layer 1: Official YouTube Synthetic Disclosures
                </h2>
                <p className="text-[12.5px] text-slate-400 mt-1">
                  When you open a YouTube video carrying the official{' '}
                  <em className="text-slate-200">"Altered or synthetic content"</em> disclosure,
                  NoiseGate flags it immediately and caches the video and channel locally so you
                  recognize it across feeds with zero extra network calls.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-3 border-t border-white/[0.07]">
                <label className="flex flex-col gap-1.5 text-[12.5px]">
                  <span className="text-slate-300 font-medium">Action on disclosed content</span>
                  <div className="relative">
                    <select
                      value={settings.disclosureAction}
                      onChange={(e) =>
                        handleSettingPatch({
                          disclosureAction: e.target.value as FilterAction,
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      {ACTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <CaretDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </label>

                <div className="flex items-start justify-between gap-4 pt-2 sm:pt-5">
                  <div>
                    <span className="text-[12.5px] text-slate-200 font-medium block">
                      Show channel disclosure indicator in feeds
                    </span>
                    <span className="text-slate-400 text-[11.5px]">
                      Annotate other videos from a channel after observing a disclosed video.
                    </span>
                  </div>
                  <TitaniumSwitch
                    checked={settings.propagateChannelDisclosure}
                    onChange={(checked) =>
                      handleSettingPatch({ propagateChannelDisclosure: checked })
                    }
                    label="Propagate channel disclosure indicator to feeds"
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-slate-400">
                  Locally Observed Disclosures ({snapshot?.totalVideoDisclosures ?? 0} videos)
                </h2>
                {(snapshot?.totalVideoDisclosures ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleClearDisclosures}
                    disabled={busy === 'clear-disclosures'}
                    className="h-7 px-2.5 rounded-md border border-red-500/30 text-red-400 hover:bg-red-950/30 text-[12px] transition-[background-color,transform] duration-120 active:scale-[0.97] cursor-pointer"
                  >
                    Clear Cache
                  </button>
                )}
              </div>

              <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-[#10131a] overflow-hidden">
                {(snapshot?.channelDisclosures ?? []).length === 0 ? (
                  <div className="p-6 text-[13px] text-slate-400">
                    No official YouTube synthetic disclosures observed yet. Watch any video carrying
                    YouTube's "Altered or synthetic content" label and it will appear here
                    automatically.
                  </div>
                ) : (
                  (snapshot?.channelDisclosures ?? []).map((ch) => (
                    <div
                      key={ch.channelKey}
                      className="p-3.5 flex items-center justify-between gap-4"
                      style={{ borderLeft: '2px solid #38bdf8' }}
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-medium text-white truncate">
                          {ch.channelName || formatHandle(ch.handle) || ch.channelKey}
                        </div>
                        <div className="text-[11.5px] font-mono text-slate-500 mt-0.5">
                          {[formatHandle(ch.handle), ch.channelId].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-right text-[12px] text-slate-400 tabular shrink-0">
                        <div className="text-sky-400 font-medium">
                          {ch.videoIds.length} disclosed video
                          {ch.videoIds.length === 1 ? '' : 's'}
                        </div>
                        <div className="text-[11px] text-slate-500">
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

        {/* TAB 5: SETTINGS & BACKUP */}
        {tab === 'settings' && settings && (
          <div className="space-y-6">
            <section className="border border-white/[0.08] rounded-lg bg-[#10131a] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] p-5 space-y-4">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-white">
                General Preferences
              </h2>

              <div className="space-y-4 pt-3 border-t border-white/[0.07]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[13px] text-slate-100 font-medium">
                      Show 1-click NoiseGate button on YouTube card hover
                    </div>
                    <div className="text-slate-400 text-[12px] mt-0.5">
                      Displays a subtle corner trigger when hovering over video cards to inspect or
                      label a channel in one click.
                    </div>
                  </div>
                  <TitaniumSwitch
                    checked={settings.showCardHoverButton}
                    onChange={(checked) => handleSettingPatch({ showCardHoverButton: checked })}
                    label="Show card hover button on YouTube"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/[0.06]">
                  <div>
                    <div className="text-[13px] font-medium text-slate-100">
                      Background list auto-refresh interval
                    </div>
                    <div className="text-[12px] text-slate-400 mt-0.5">
                      Periodic check for external subscribed filter lists via browser alarms (uses
                      ETag conditional requests).
                    </div>
                  </div>
                  <div className="relative w-40 shrink-0">
                    <select
                      value={settings.autoRefreshHours}
                      onChange={(e) =>
                        handleSettingPatch({ autoRefreshHours: Number(e.target.value) })
                      }
                      className={SELECT_SM_CLASS + ' w-full'}
                    >
                      <option value={6}>Every 6 hours</option>
                      <option value={12}>Every 12 hours</option>
                      <option value={24}>Every 24 hours</option>
                      <option value={72}>Every 3 days</option>
                      <option value={168}>Weekly</option>
                    </select>
                    <CaretDown
                      size={12}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                  <div>
                    <div className="text-[13px] font-medium text-slate-100">
                      Community GitHub repository for metadata suggestions
                    </div>
                    <div className="text-[12px] text-slate-400 mt-0.5">
                      Default <code className="font-mono text-slate-300">owner/repo</code> opened by
                      "Suggest metadata on GitHub" in the channel popover.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="text"
                      value={repoInput}
                      onChange={(e) => setRepoInput(e.target.value)}
                      placeholder="zyniotech/noisegate-lists"
                      className="h-8 w-52 px-2.5 rounded-md border border-white/[0.1] bg-[#0a0c10] text-[12px] font-mono text-white focus:outline-none focus:border-white/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cleaned = repoInput.trim() || 'zyniotech/noisegate-lists';
                        void handleSettingPatch({ communitySubmissionRepo: cleaned });
                        showNotice('ok', `Saved community repo: ${cleaned}`);
                      }}
                      className="h-8 px-3 rounded-md border border-white/[0.12] bg-[#161b25] hover:bg-[#202736] text-[12px] text-white cursor-pointer"
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
                <p className="text-[12.5px] text-slate-400 mt-0.5">
                  All rules live locally in your browser. Export your configuration anytime or
                  import a NoiseGate backup or Filter List JSON v1/v2 file.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={busy === 'export'}
                  className="h-9 px-4 rounded-md border border-white/[0.14] bg-[#161b25] hover:bg-[#202736] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-[13px] text-white font-medium inline-flex items-center gap-2 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer"
                >
                  <DownloadSimple size={15} />
                  <span>Export JSON Backup</span>
                </button>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                      aria-label="Import mode"
                      className={SELECT_CLASS + ' w-auto'}
                    >
                      <option value="merge">Import Mode: Merge</option>
                      <option value="replace">Import Mode: Replace</option>
                    </select>
                    <CaretDown
                      size={13}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>

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
                    className="h-9 px-4 rounded-md bg-[#f8fafc] hover:bg-slate-200 text-[#0a0c10] text-[13px] font-semibold inline-flex items-center gap-2 transition-[background-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 cursor-pointer"
                  >
                    <UploadSimple size={15} weight="bold" />
                    <span>{busy === 'import' ? 'Importing...' : 'Import JSON'}</span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
