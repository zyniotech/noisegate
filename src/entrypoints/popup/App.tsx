import { useCallback, useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowSquareOut,
  CurrencyCircleDollar,
  Eye,
  EyeSlash,
  ListBullets,
  Prohibit,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Tag,
  Television,
  X,
} from '@phosphor-icons/react';
import { browser } from 'wxt/browser';
import { TitaniumSwitch } from '@/components/TitaniumSwitch';
import { getCategoryMeta } from '@/lib/categories';
import type { StateSnapshot } from '@/lib/messages';
import { formatHandle } from '@/lib/normalize';
import { fetchSnapshot, sendRuntimeMessage } from '@/lib/runtime-client';
import { TOPICS, YPP_SIGNAL_LABELS } from '@/lib/taxonomy';
import type { ChannelRef, LocalRuleAction } from '@/lib/types';

export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [activeTabId, setActiveTabId] = useState<number | undefined>(undefined);
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      const tabId = tab?.id;
      setActiveTabId(tabId);
      setActiveTabUrl(tab?.url ?? '');
      const data = await fetchSnapshot(tabId);
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NoiseGate state');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isYouTubeTab = activeTabUrl.includes('youtube.com');

  const handleToggleEnabled = async (nextEnabled: boolean) => {
    if (!snapshot) return;
    setBusyAction('toggle');
    try {
      await sendRuntimeMessage({
        type: 'UPDATE_SETTINGS',
        patch: { enabled: nextEnabled },
      });
      await load();
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleReveal = async () => {
    if (!snapshot?.pageStats || typeof activeTabId !== 'number') return;
    setBusyAction('reveal');
    try {
      await sendRuntimeMessage({
        type: 'TOGGLE_REVEAL_HIDDEN',
        tabId: activeTabId,
        reveal: !snapshot.pageStats.revealHidden,
      });
      setTimeout(() => void load(), 160);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRefreshLists = async () => {
    setBusyAction('refresh');
    try {
      await sendRuntimeMessage({ type: 'REFRESH_FILTER_LIST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleQuickRule = async (ref: ChannelRef, action: LocalRuleAction) => {
    const key = `${ref.channelId ?? ref.handle ?? ''}:${action}`;
    setBusyAction(key);
    try {
      await sendRuntimeMessage({
        type: 'UPSERT_LOCAL_RULE',
        ref,
        action,
        category: action === 'allow' ? 'verified-independent' : 'ai-synthetic',
      });
      setTimeout(() => void load(), 220);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update rule');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearRule = async (ref: ChannelRef) => {
    setBusyAction(`clear:${ref.channelId ?? ref.handle ?? ''}`);
    try {
      await sendRuntimeMessage({
        type: 'REMOVE_LOCAL_RULE',
        ref,
      });
      setTimeout(() => void load(), 220);
    } finally {
      setBusyAction(null);
    }
  };

  const openOptions = () => {
    void browser.runtime.openOptionsPage();
  };

  const openSampleTestSearch = (handle: string) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(handle)}`;
    void browser.tabs.create({ url });
  };

  const stats = snapshot?.pageStats;
  const enabledLists = snapshot?.subscribedLists.filter((l) => l.enabled) ?? [];
  const totalListEntries = enabledLists.reduce((acc, l) => acc + l.entryCount, 0);
  const activeTopicFiltersCount = Object.values(snapshot?.settings.topicRules ?? {}).filter(
    (act) => act && act !== 'pass',
  ).length;

  const scannedTotal = Math.max(1, stats?.scannedCards ?? 0);
  const labeledPct = stats ? (stats.labeledCount / scannedTotal) * 100 : 0;
  const dimmedPct = stats ? (stats.dimmedCount / scannedTotal) * 100 : 0;
  const hiddenPct = stats ? (stats.hiddenCount / scannedTotal) * 100 : 0;

  return (
    <div className="flex flex-col bg-[#090b0f] text-[#f3f4f6] select-none">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.18] to-transparent" />

      {/* Header — Ultramono Titanium */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-[#0c0f15]">
        <div className="flex items-center gap-2.5">
          <img
            src="/icon/48.png"
            alt="NoiseGate"
            className="w-7 h-7 block shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
          />
          <div>
            <h1 className="text-[13.5px] font-semibold tracking-[-0.015em] leading-none text-white">
              NoiseGate
            </h1>
            <p className="text-[11px] text-slate-400 mt-1 leading-none">
              {snapshot?.settings.enabled ? 'Active on YouTube' : 'Filtering paused'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <TitaniumSwitch
            size="sm"
            checked={snapshot?.settings.enabled ?? true}
            disabled={!snapshot || busyAction === 'toggle'}
            onChange={handleToggleEnabled}
            label="Toggle NoiseGate filtering"
          />

          <button
            type="button"
            onClick={openOptions}
            title="Open Settings & Filter Lists"
            aria-label="Open Settings & Filter Lists"
            className="w-7 h-7 rounded-md border border-white/[0.09] bg-[#131720] text-slate-300 hover:text-white hover:bg-[#1b212e] hover:border-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex items-center justify-center transition-[background-color,border-color,color,transform] duration-120 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.95] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer"
          >
            <SlidersHorizontal size={15} weight="regular" />
          </button>
        </div>
      </header>

      {error && (
        <div className="px-4 py-2 text-[11.5px] text-red-400 border-b border-red-500/20 bg-red-950/25">
          {error}
        </div>
      )}

      {/* Live Page Telemetry */}
      <section className="px-4 py-3 border-b border-white/[0.08] bg-[#0e1118]">
        {isYouTubeTab && stats ? (
          <>
            <div className="grid grid-cols-4 divide-x divide-white/[0.07]">
              <div className="pr-2">
                <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">
                  Scanned
                </div>
                <div className="text-[16px] font-semibold text-slate-100 tabular mt-0.5 leading-tight">
                  {stats.scannedCards}
                </div>
              </div>
              <div className="px-2.5">
                <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">
                  Labeled
                </div>
                <div
                  className={`text-[16px] font-semibold tabular mt-0.5 leading-tight ${
                    stats.labeledCount > 0 ? 'text-amber-400' : 'text-slate-600'
                  }`}
                >
                  {stats.labeledCount}
                </div>
              </div>
              <div className="px-2.5">
                <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">
                  Dimmed
                </div>
                <div
                  className={`text-[16px] font-semibold tabular mt-0.5 leading-tight ${
                    stats.dimmedCount > 0 ? 'text-orange-400' : 'text-slate-600'
                  }`}
                >
                  {stats.dimmedCount}
                </div>
              </div>
              <div className="pl-2.5">
                <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">
                  Hidden
                </div>
                <div
                  className={`text-[16px] font-semibold tabular mt-0.5 leading-tight ${
                    stats.hiddenCount > 0 ? 'text-red-400' : 'text-slate-600'
                  }`}
                >
                  {stats.hiddenCount}
                </div>
              </div>
            </div>

            <div
              className="mt-2.5 h-[2px] w-full bg-white/[0.07] overflow-hidden flex"
              aria-hidden="true"
            >
              {labeledPct > 0 && (
                <div className="h-full bg-amber-500/90" style={{ width: `${labeledPct}%` }} />
              )}
              {dimmedPct > 0 && (
                <div className="h-full bg-orange-500/90" style={{ width: `${dimmedPct}%` }} />
              )}
              {hiddenPct > 0 && (
                <div className="h-full bg-red-500/90" style={{ width: `${hiddenPct}%` }} />
              )}
            </div>

            {stats.hiddenCount > 0 && (
              <button
                type="button"
                onClick={handleToggleReveal}
                disabled={busyAction === 'reveal'}
                className="mt-2.5 w-full h-7 px-2.5 rounded-md border border-white/[0.11] bg-[#151a24] hover:bg-[#1c2330] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-[11.5px] text-slate-200 flex items-center justify-center gap-1.5 transition-[background-color,border-color,transform] duration-120 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer"
              >
                {stats.revealHidden ? (
                  <>
                    <EyeSlash size={14} weight="regular" />
                    <span>Re-hide filtered videos</span>
                  </>
                ) : (
                  <>
                    <Eye size={14} weight="regular" />
                    <span>Temporarily reveal {stats.hiddenCount} hidden</span>
                  </>
                )}
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[12px] text-slate-300 leading-relaxed">
              {isYouTubeTab
                ? 'Scroll or reload YouTube to scan feed cards.'
                : 'Open YouTube to inspect channels, topics, and monetization signals.'}
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => openSampleTestSearch('@SuperCatLeague')}
                className="h-7 px-2.5 rounded-md border border-white/[0.14] bg-[#161b25] hover:bg-[#1f2634] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-[11.5px] text-slate-100 flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer"
              >
                <ArrowSquareOut size={13} weight="regular" />
                <span>Test Sample Channel</span>
              </button>
              <button
                type="button"
                onClick={() => openSampleTestSearch('@MakeTechFuture')}
                className="h-7 px-2.5 rounded-md border border-white/[0.08] bg-[#11151d] hover:bg-[#191f2c] text-[11.5px] text-slate-300 flex items-center gap-1.5 transition-[background-color,border-color,transform] duration-120 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 cursor-pointer"
              >
                <ArrowSquareOut size={13} weight="regular" />
                <span>Test Warnlist Sample</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Channels on Current Page */}
      {isYouTubeTab && stats && stats.visibleChannels.length > 0 && (
        <section className="flex flex-col border-b border-white/[0.08]">
          <div className="px-4 py-2 flex items-center justify-between text-[10px] uppercase tracking-[0.06em] text-slate-500">
            <span>Channels on this page</span>
            <span className="tabular font-mono">{stats.visibleChannels.length}</span>
          </div>

          <div className="max-h-[214px] overflow-y-auto divide-y divide-white/[0.05]">
            {stats.visibleChannels.slice(0, 10).map((ch) => {
              const d = ch.decision;
              const meta = d.category ? getCategoryMeta(d.category) : null;
              const borderColor =
                d.action === 'allow'
                  ? '#10b981'
                  : d.action !== 'none' && meta
                    ? d.category === 'topic-match' && d.matchedTopic
                      ? TOPICS[d.matchedTopic]?.accentColor ?? meta.accentColor
                      : meta.accentColor
                    : 'transparent';

              const ref: ChannelRef = {
                channelId: ch.channelId,
                handle: ch.handle,
                channelName: ch.channelName,
              };

              const isLocal = d.origin === 'local';
              const topicName = d.topics[0] ? TOPICS[d.topics[0]]?.shortLabel : d.rawYouTubeCategory;
              const yppText =
                d.observedYppSignals.length > 0
                  ? d.observedYppSignals.map((s) => YPP_SIGNAL_LABELS[s] ?? s).join(', ')
                  : null;

              return (
                <div
                  key={ch.channelId ?? ch.handle ?? ch.channelName}
                  className="px-4 py-2 flex items-center justify-between gap-2 hover:bg-white/[0.025] transition-[background-color] duration-100"
                  style={{ borderLeft: `2px solid ${borderColor}` }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-medium text-slate-100 truncate">
                      {ch.channelName}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                      {d.action !== 'none' ? (
                        <>
                          <span className="text-slate-200">{d.primaryLabel}</span>
                          <span className="opacity-35">·</span>
                          <span className="truncate">{d.sourceName}</span>
                        </>
                      ) : topicName || yppText ? (
                        <>
                          {topicName && <span className="text-slate-300">{topicName}</span>}
                          {topicName && yppText && <span className="opacity-35">·</span>}
                          {yppText && (
                            <span className="inline-flex items-center gap-1 text-slate-400 truncate">
                              <CurrencyCircleDollar size={11} className="shrink-0" />
                              {yppText}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="font-mono text-[10.5px] text-slate-500">
                          {formatHandle(ch.handle) || ch.channelId || 'No signal'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {(
                      [
                        { act: 'label', title: 'Label', Icon: Tag, color: 'text-amber-400' },
                        { act: 'dim', title: 'Dim', Icon: EyeSlash, color: 'text-orange-400' },
                        { act: 'hide', title: 'Hide', Icon: Prohibit, color: 'text-red-400' },
                        {
                          act: 'allow',
                          title: 'Trust (Override)',
                          Icon: ShieldCheck,
                          color: 'text-emerald-400',
                        },
                      ] as const
                    ).map(({ act, title, Icon, color }) => {
                      const active = isLocal && d.action === act;
                      return (
                        <button
                          key={act}
                          type="button"
                          title={title}
                          aria-label={`${title} ${ch.channelName}`}
                          onClick={() => handleQuickRule(ref, act)}
                          className={`w-6 h-6 rounded flex items-center justify-center transition-[background-color,color,transform] duration-100 active:scale-[0.92] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer ${
                            active
                              ? `bg-white/[0.1] ${color}`
                              : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]'
                          }`}
                        >
                          <Icon size={13} weight={active ? 'fill' : 'regular'} />
                        </button>
                      );
                    })}

                    {isLocal && (
                      <button
                        type="button"
                        title="Remove local rule"
                        aria-label={`Remove local rule for ${ch.channelName}`}
                        onClick={() => handleClearRule(ref)}
                        className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-[background-color,color,transform] duration-100 active:scale-[0.92] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer"
                      >
                        <X size={12} weight="regular" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Summary Bar */}
      <section className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between text-[11.5px] text-slate-400 bg-[#0b0e13]">
        <div className="flex items-center gap-3 tabular">
          <span className="inline-flex items-center gap-1" title="Active filter lists">
            <ListBullets size={13} className="text-slate-500" />
            <span>
              <strong className="text-slate-200 font-medium">{enabledLists.length}</strong> (
              {totalListEntries.toLocaleString()})
            </span>
          </span>
          <span className="inline-flex items-center gap-1" title="Local personal rules">
            <Tag size={13} className="text-slate-500" />
            <span>
              <strong className="text-slate-200 font-medium">
                {snapshot?.localRules.length ?? 0}
              </strong>
            </span>
          </span>
          <span className="inline-flex items-center gap-1" title="Active Topic filters">
            <Television size={13} className="text-slate-500" />
            <span className="text-slate-200 font-medium">{activeTopicFiltersCount}</span>
          </span>
          <span className="inline-flex items-center gap-1" title="Observed official YT disclosures">
            <Sparkle size={13} className="text-sky-400" />
            <span className="text-slate-200 font-medium">
              {snapshot?.totalVideoDisclosures ?? 0}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={handleRefreshLists}
          disabled={busyAction === 'refresh'}
          title="Refresh subscribed filter lists"
          className="h-6 px-2 rounded border border-white/[0.09] bg-[#131720] hover:bg-[#1c2230] text-slate-200 flex items-center gap-1 text-[11px] transition-[background-color,border-color,transform] duration-120 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 cursor-pointer"
        >
          <ArrowsClockwise
            size={12}
            className={busyAction === 'refresh' ? 'animate-spin' : ''}
          />
          <span>Sync</span>
        </button>
      </section>

      {/* Footer */}
      <footer className="px-4 py-2.5 flex items-center justify-between bg-[#080a0e]">
        <span className="text-[11px] text-slate-500 font-mono">
          0 telemetry · local O(1)
        </span>
        <button
          type="button"
          onClick={openOptions}
          className="text-[11.5px] font-medium text-slate-200 hover:text-white inline-flex items-center gap-1 transition-[color] duration-120 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 rounded cursor-pointer"
        >
          <span>Topics, Lists & Rules</span>
          <ArrowSquareOut size={13} weight="regular" />
        </button>
      </footer>
    </div>
  );
}
