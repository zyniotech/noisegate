import { browser } from 'wxt/browser';
import { getCategoryMeta } from '@/lib/categories';
import { InPagePopoverManager } from '@/lib/inpage-popover';
import type {
  ContentBroadcast,
  EvaluateItem,
  RuntimeRequest,
  RuntimeResponse,
} from '@/lib/messages';
import {
  extractVideoId,
  formatHandle,
  normalizeChannelId,
  normalizeHandle,
  parseYouTubeChannelHref,
  sanitizeHttpUrl,
} from '@/lib/normalize';
import { createPhosphorSvg, type InPageIconName } from '@/lib/phosphor-svg';
import {
  formatMonetizationSummary,
  hasObservedYppSignals,
  normalizeYppSignal,
  TOPICS,
  YPP_SIGNAL_LABELS,
} from '@/lib/taxonomy';
import type {
  ChannelRef,
  PageStats,
  ResolvedDecision,
  UserSettings,
  YppSignalId,
} from '@/lib/types';

const CARD_SELECTOR = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-playlist-panel-video-renderer',
  'ytd-channel-renderer',
  'yt-lockup-view-model',
  'ytd-reel-item-renderer',
  'ytm-shorts-lockup-view-model',
].join(',');

const STYLE_ELEMENT_ID = 'noisegate-inpage-style';

const YPP_PRIORITY: Record<YppSignalId, number> = {
  'ypp-memberships': 0,
  'ypp-super-thanks': 1,
  'ypp-super-chat': 2,
  'ypp-shopping': 3,
  'ypp-partner': 4,
};

const INPAGE_CSS = `
  .ng-signal-line,
  .ng-watch-bar,
  .ng-channel-bar,
  .ng-watch-inline-trigger {
    --ng-surface: #f8fafc;
    --ng-surface-subtle: #eef2f6;
    --ng-border: rgba(15, 23, 42, 0.14);
    --ng-border-strong: rgba(15, 23, 42, 0.25);
    --ng-top-highlight: rgba(255, 255, 255, 0.9);
    --ng-fg: #0f172a;
    --ng-fg-muted: #475569;
    --ng-fg-dim: #526075;
    --ng-btn-bg: #ffffff;
    --ng-btn-bg-hover: #e2e8f0;
    --ng-btn-border: rgba(15, 23, 42, 0.22);
    --ng-btn-fg: #0f172a;
    --ng-focus-ring: rgba(15, 23, 42, 0.65);
    --ng-positive: #065f46;
    --ng-positive-bg: rgba(4, 120, 87, 0.09);
    --ng-positive-border: rgba(4, 120, 87, 0.28);
    --ng-icon-color: color-mix(in srgb, var(--ng-accent, #475569) 76%, #0f172a);
    --ng-shadow: 0 1px 3px rgba(15, 23, 42, 0.07);
  }

  html[dark] .ng-signal-line,
  html[dark] .ng-watch-bar,
  html[dark] .ng-channel-bar,
  html[dark] .ng-watch-inline-trigger,
  ytd-app[dark] .ng-signal-line,
  ytd-app[dark] .ng-watch-bar,
  ytd-app[dark] .ng-channel-bar,
  ytd-app[dark] .ng-watch-inline-trigger,
  ytm-app[dark] .ng-signal-line,
  ytm-app[dark] .ng-watch-bar,
  ytm-app[dark] .ng-channel-bar,
  ytm-app[dark] .ng-watch-inline-trigger,
  body[dark] .ng-signal-line,
  body[dark] .ng-watch-bar,
  body[dark] .ng-channel-bar,
  body[dark] .ng-watch-inline-trigger,
  [dark] .ng-signal-line,
  [dark] .ng-watch-bar,
  [dark] .ng-channel-bar,
  [dark] .ng-watch-inline-trigger,
  html[data-ng-theme="dark"] .ng-signal-line,
  html[data-ng-theme="dark"] .ng-watch-bar,
  html[data-ng-theme="dark"] .ng-channel-bar,
  html[data-ng-theme="dark"] .ng-watch-inline-trigger {
    --ng-surface: #141821;
    --ng-surface-subtle: rgba(255, 255, 255, 0.06);
    --ng-border: rgba(255, 255, 255, 0.14);
    --ng-border-strong: rgba(255, 255, 255, 0.24);
    --ng-top-highlight: rgba(255, 255, 255, 0.08);
    --ng-fg: #f3f4f6;
    --ng-fg-muted: #b6c2d2;
    --ng-fg-dim: #9aa7b8;
    --ng-btn-bg: #1e2532;
    --ng-btn-bg-hover: #283142;
    --ng-btn-border: rgba(255, 255, 255, 0.20);
    --ng-btn-fg: #f8fafc;
    --ng-focus-ring: rgba(248, 250, 252, 0.72);
    --ng-positive: #34d399;
    --ng-positive-bg: rgba(16, 185, 129, 0.14);
    --ng-positive-border: rgba(52, 211, 153, 0.30);
    --ng-icon-color: color-mix(in srgb, var(--ng-accent, #94a3b8) 88%, #ffffff);
    --ng-shadow: 0 2px 6px rgba(0, 0, 0, 0.32);
  }

  @media (prefers-color-scheme: dark) {
    html:not([light]):not([data-ng-theme="light"]):not(:has(ytd-app:not([dark]))) .ng-signal-line,
    html:not([light]):not([data-ng-theme="light"]):not(:has(ytd-app:not([dark]))) .ng-watch-bar,
    html:not([light]):not([data-ng-theme="light"]):not(:has(ytd-app:not([dark]))) .ng-channel-bar,
    html:not([light]):not([data-ng-theme="light"]):not(:has(ytd-app:not([dark]))) .ng-watch-inline-trigger {
      --ng-surface: #141821;
      --ng-surface-subtle: rgba(255, 255, 255, 0.06);
      --ng-border: rgba(255, 255, 255, 0.14);
      --ng-border-strong: rgba(255, 255, 255, 0.24);
      --ng-top-highlight: rgba(255, 255, 255, 0.08);
      --ng-fg: #f3f4f6;
      --ng-fg-muted: #b6c2d2;
      --ng-fg-dim: #9aa7b8;
      --ng-btn-bg: #1e2532;
      --ng-btn-bg-hover: #283142;
      --ng-btn-border: rgba(255, 255, 255, 0.20);
      --ng-btn-fg: #f8fafc;
      --ng-focus-ring: rgba(248, 250, 252, 0.72);
      --ng-positive: #34d399;
      --ng-positive-bg: rgba(16, 185, 129, 0.14);
      --ng-positive-border: rgba(52, 211, 153, 0.30);
      --ng-icon-color: color-mix(in srgb, var(--ng-accent, #94a3b8) 88%, #ffffff);
      --ng-shadow: 0 2px 6px rgba(0, 0, 0, 0.32);
    }
  }

  [data-ng-card="1"] {
    position: relative;
  }

  [data-ng-state="label"],
  [data-ng-state="dim"] {
    box-shadow: inset 2px 0 0 var(--ng-accent, #d97706) !important;
    padding-left: 8px !important;
    box-sizing: border-box;
  }

  [data-ng-state="dim"] {
    opacity: 0.42;
    transition: opacity 150ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  [data-ng-state="dim"]:hover,
  [data-ng-state="dim"]:focus-within {
    opacity: 0.96;
  }

  [data-ng-state="hide"] {
    display: none !important;
  }

  html[data-ng-reveal-hidden="1"] [data-ng-state="hide"] {
    display: revert !important;
    opacity: 0.48;
    box-shadow: inset 2px 0 0 var(--ng-accent, #ef4444) !important;
    padding-left: 8px !important;
    box-sizing: border-box;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-ng-state="dim"],
    .ng-card-trigger,
    .ng-watch-action-btn,
    .ng-watch-inline-trigger {
      transition: none !important;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .ng-card-trigger {
      background: #0f1218 !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  }

  .ng-signal-line {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    padding: 2px 6px 2px 7px;
    border-left: 2px solid var(--ng-accent, #d97706);
    border-radius: 0 4px 4px 0;
    background: var(--ng-surface-subtle);
    font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    font-size: 12px;
    line-height: 1.35;
    min-height: 18px;
    font-weight: 500;
    color: var(--ng-fg-muted);
    max-width: 100%;
    overflow: hidden;
    box-sizing: border-box;
  }

  .ng-signal-line .ng-signal-icon {
    flex-shrink: 0;
    color: var(--ng-accent, #d97706);
    color: var(--ng-icon-color, var(--ng-accent, #d97706));
    display: inline-flex;
    align-items: center;
  }

  .ng-signal-line .ng-signal-label {
    color: var(--ng-fg);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-signal-line .ng-signal-sep {
    color: var(--ng-fg-dim);
    opacity: 0.72;
    flex-shrink: 0;
  }

  .ng-signal-line .ng-signal-source {
    color: var(--ng-fg-muted);
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .ng-signal-line .ng-signal-evidence {
    flex-shrink: 0;
    color: var(--ng-fg-muted);
    display: inline-flex;
    align-items: center;
    opacity: 0.9;
    text-decoration: none;
    margin-left: 2px;
    border-radius: 3px;
  }

  .ng-signal-line .ng-signal-evidence:hover {
    color: var(--ng-fg);
    opacity: 1;
  }

  .ng-signal-line .ng-signal-evidence:focus-visible {
    outline: 2px solid var(--ng-focus-ring);
    outline-offset: 1px;
  }

  .ng-card-trigger {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 25;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: rgba(12, 15, 22, 0.84);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 2px 8px rgba(0, 0, 0, 0.42);
    color: #f1f5f9;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    pointer-events: auto;
    backdrop-filter: blur(8px) saturate(130%);
    -webkit-backdrop-filter: blur(8px) saturate(130%);
    transition: opacity 120ms cubic-bezier(0.23, 1, 0.32, 1), background-color 110ms ease, border-color 110ms ease, transform 90ms cubic-bezier(0.23, 1, 0.32, 1);
    padding: 0;
  }

  [data-ng-card="1"]:hover > .ng-card-trigger,
  [data-ng-card="1"]:focus-within > .ng-card-trigger,
  .ng-card-trigger:focus-visible {
    opacity: 1;
  }

  [data-ng-has-signal="1"] > .ng-card-trigger {
    opacity: 0.9;
    border-color: var(--ng-accent, #94a3b8);
    box-shadow:
      inset 2px 0 0 var(--ng-accent, #94a3b8),
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      0 2px 8px rgba(0, 0, 0, 0.45);
    color: #f8fafc;
  }

  [data-ng-has-signal="1"]:hover > .ng-card-trigger {
    opacity: 1;
  }

  .ng-card-trigger:hover {
    background: rgba(15, 19, 28, 0.96);
    color: #ffffff;
  }

  .ng-card-trigger:active {
    transform: scale(0.94);
  }

  .ng-card-trigger:focus-visible {
    outline: 2px solid #f8fafc;
    outline-offset: 2px;
  }

  html[data-ng-hide-triggers="1"] .ng-card-trigger {
    display: none !important;
  }

  .ng-watch-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    width: 100%;
    margin: 10px 0 8px;
    padding: 8px 10px 8px 12px;
    border: 1px solid var(--ng-border);
    border-left: 2px solid var(--ng-accent, #94a3b8);
    border-radius: 2px 6px 6px 2px;
    background: var(--ng-surface);
    box-shadow: inset 0 1px 0 var(--ng-top-highlight), var(--ng-shadow);
    color: var(--ng-fg);
    font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    font-size: 12.5px;
    line-height: 1.4;
    box-sizing: border-box;
  }

  .ng-channel-bar {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    width: fit-content;
    max-width: 100%;
    margin: 10px 0 2px;
    padding: 6px 8px 6px 10px;
    border: 1px solid var(--ng-border);
    border-left: 2px solid var(--ng-accent, #94a3b8);
    border-radius: 2px 6px 6px 2px;
    background: var(--ng-surface);
    box-shadow: inset 0 1px 0 var(--ng-top-highlight), var(--ng-shadow);
    color: var(--ng-fg);
    font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    font-size: 12px;
    line-height: 1.35;
    box-sizing: border-box;
    align-self: flex-start;
  }

  .ng-channel-bar[data-ng-dock="standalone"] {
    max-width: min(1284px, calc(100% - 32px));
    margin: 8px 0 6px max(0px, calc((100% - 1284px) / 2));
  }

  .ng-watch-bar-left {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .ng-watch-bar-icon {
    flex-shrink: 0;
    color: var(--ng-accent, #94a3b8);
    color: var(--ng-icon-color, var(--ng-accent, #94a3b8));
    display: inline-flex;
    align-items: center;
  }

  .ng-watch-bar-text {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .ng-strip-strong {
    color: var(--ng-fg);
    font-weight: 600;
  }

  .ng-strip-sep {
    color: var(--ng-fg-dim);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .ng-strip-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--ng-fg-muted);
    font-weight: 500;
  }

  .ng-strip-muted {
    color: var(--ng-fg-muted);
    font-size: 12px;
  }

  .ng-watch-bar-note {
    color: var(--ng-fg-muted);
    font-size: 12px;
  }

  .ng-ypp-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.25;
  }

  .ng-ypp-tag.ng-ypp-positive {
    border: 1px solid var(--ng-positive-border);
    background: var(--ng-positive-bg);
    color: var(--ng-positive);
  }

  .ng-watch-action-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border-radius: 5px;
    border: 1px solid var(--ng-btn-border);
    background: var(--ng-btn-bg);
    box-shadow: inset 0 1px 0 var(--ng-top-highlight);
    color: var(--ng-btn-fg);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.005em;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms cubic-bezier(0.23, 1, 0.32, 1), border-color 120ms cubic-bezier(0.23, 1, 0.32, 1), color 120ms cubic-bezier(0.23, 1, 0.32, 1), transform 90ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .ng-watch-action-btn:hover {
    background: var(--ng-btn-bg-hover);
    border-color: var(--ng-border-strong);
  }

  .ng-watch-action-btn:active {
    transform: scale(0.97);
  }

  .ng-watch-action-btn:focus-visible,
  .ng-watch-inline-trigger:focus-visible {
    outline: 2px solid var(--ng-focus-ring);
    outline-offset: 2px;
  }

  .ng-watch-inline-trigger {
    margin-left: 8px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 32px;
    padding: 0 11px;
    border-radius: 6px;
    border: 1px solid var(--ng-btn-border);
    background: var(--ng-btn-bg);
    box-shadow: inset 0 1px 0 var(--ng-top-highlight);
    color: var(--ng-btn-fg);
    font-family: Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms cubic-bezier(0.23, 1, 0.32, 1), border-color 120ms cubic-bezier(0.23, 1, 0.32, 1), color 120ms cubic-bezier(0.23, 1, 0.32, 1), transform 90ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .ng-watch-inline-trigger[data-ng-active="1"] {
    border-left: 2px solid var(--ng-accent, #94a3b8);
  }

  .ng-watch-inline-trigger[data-ng-active="1"] svg {
    color: var(--ng-icon-color, var(--ng-accent, #94a3b8));
  }

  .ng-watch-inline-trigger:hover {
    background: var(--ng-btn-bg-hover);
    border-color: var(--ng-border-strong);
  }

  .ng-watch-inline-trigger:active {
    transform: scale(0.97);
  }
`;

interface WatchBridgeDetail {
  videoId?: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  hasOfficialDisclosure: boolean;
  disclosureSource?: 'watch-data';
  youtubeCategory?: string;
  hasPaidPromotion?: boolean;
  yppSignals?: YppSignalId[];
  monetizationInspected?: boolean;
}

interface ChannelBridgeDetail {
  urlPath?: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  yppSignals?: YppSignalId[];
  monetizationInspected?: boolean;
}

interface CardRecord {
  ref: ChannelRef;
  decision: ResolvedDecision;
  signature: string;
}

function detectYouTubeDarkMode(): boolean {
  if (
    document.documentElement.hasAttribute('dark') ||
    Boolean(document.querySelector('ytd-app[dark], ytm-app[dark], body[dark]'))
  ) {
    return true;
  }
  if (document.documentElement.hasAttribute('light')) {
    return false;
  }
  if (document.querySelector('ytd-app, ytm-app')) {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncThemeAttribute(): void {
  const next = detectYouTubeDarkMode() ? 'dark' : 'light';
  if (document.documentElement.dataset.ngTheme !== next) {
    document.documentElement.dataset.ngTheme = next;
  }
}

function formatYppStripLabel(signals: readonly YppSignalId[]): string {
  const unique = Array.from(
    new Set(
      signals
        .map((s) => normalizeYppSignal(s))
        .filter((s): s is YppSignalId => Boolean(s)),
    ),
  );
  const concrete = unique
    .filter((s) => s !== 'ypp-partner')
    .sort((a, b) => YPP_PRIORITY[a] - YPP_PRIORITY[b]);
  if (concrete.length > 0) {
    const names = concrete.map((s) => YPP_SIGNAL_LABELS[s] ?? s).join(', ');
    return `YPP · Monetized · ${names}`;
  }
  return 'YPP · Monetized · Partner';
}

function parseBridgeDetail<T>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    return raw as T;
  }
  return null;
}

async function sendRuntime<T>(request: RuntimeRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(request)) as
    | RuntimeResponse<T>
    | undefined;
  if (!response || !response.ok) {
    throw new Error(response?.error ?? 'Extension communication failed');
  }
  return response.data;
}

function findChannelBarMount(browseRoot: Element): {
  host: HTMLElement;
  position: 'append' | 'afterend';
  dockVariant: 'inline' | 'column' | 'standalone';
} | null {
  const headlineInfo = browseRoot.querySelector<HTMLElement>(
    [
      'yt-page-header-view-model .yt-page-header-view-model__page-header-headline-info',
      'yt-page-header-view-model .yt-page-header-view-model-wiz__page-header-headline-info',
    ].join(', '),
  );
  if (headlineInfo) {
    const viewModel = headlineInfo.closest<HTMLElement>(
      'yt-page-header-view-model, yt-page-header-view-model-wiz',
    );
    const actions = viewModel?.querySelector<HTMLElement>(
      'yt-flexible-actions-view-model',
    );
    if (actions && !headlineInfo.contains(actions) && viewModel) {
      return { host: viewModel, position: 'append', dockVariant: 'column' };
    }
    return { host: headlineInfo, position: 'append', dockVariant: 'inline' };
  }

  const pageHeaderViewModel = browseRoot.querySelector<HTMLElement>(
    'yt-page-header-view-model, yt-page-header-view-model-wiz',
  );
  if (pageHeaderViewModel) {
    return { host: pageHeaderViewModel, position: 'append', dockVariant: 'column' };
  }

  const legacyMeta = browseRoot.querySelector<HTMLElement>(
    'ytd-c4-tabbed-header-renderer #inner-header-container #meta',
  );
  if (legacyMeta) {
    return { host: legacyMeta, position: 'append', dockVariant: 'inline' };
  }

  const legacyInner = browseRoot.querySelector<HTMLElement>(
    'ytd-c4-tabbed-header-renderer #inner-header-container',
  );
  if (legacyInner) {
    return { host: legacyInner, position: 'afterend', dockVariant: 'standalone' };
  }

  const pageHeaderFallback = browseRoot.querySelector<HTMLElement>('#page-header');
  if (pageHeaderFallback) {
    return { host: pageHeaderFallback, position: 'afterend', dockVariant: 'standalone' };
  }

  return null;
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    const popover = new InPagePopoverManager();
    const cardRecords = new WeakMap<HTMLElement, CardRecord>();
    const reportedDisclosures = new Set<string>();
    const reportedTelemetrySignatures = new Set<string>();

    let revealHidden = false;
    let scanTimer: number | null = null;
    let navFallbackTimer: number | null = null;
    let scanInFlight = false;
    let rescanQueued = false;
    let hydratingFromScan = false;
    let lastWatchBridgeInfo: WatchBridgeDetail | null = null;
    let lastChannelBridgeInfo: ChannelBridgeDetail | null = null;

    let cachedShowTriggers = true;
    let cachedShowMonetization = true;
    let cachedShowTopic = true;
    let cachedSubmissionRepo = 'zyniotech/noisegate-lists';

    function injectStyles(): void {
      syncThemeAttribute();
      if (document.getElementById(STYLE_ELEMENT_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ELEMENT_ID;
      style.textContent = INPAGE_CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function requestBridgeHydration(): void {
      hydratingFromScan = true;
      try {
        document.dispatchEvent(new CustomEvent('noisegate:hydrate'));
      } finally {
        hydratingFromScan = false;
      }
    }

    function openPopoverFor(
      anchor: HTMLElement,
      ref: ChannelRef,
      decision: ResolvedDecision,
    ): void {
      popover.open({
        anchor,
        ref,
        decision,
        submissionRepo: cachedSubmissionRepo,
        onSave: async (payload) => {
          await sendRuntime({
            type: 'UPSERT_LOCAL_RULE',
            ref: payload.ref,
            action: payload.action,
            category: payload.category,
            note: payload.note,
          });
          scheduleScan(true);
        },
        onUpdateTopics: async (targetRef, topics) => {
          await sendRuntime({
            type: 'SET_CHANNEL_TOPICS',
            ref: targetRef,
            topics,
          });
          scheduleScan(true);
        },
        onClear: async (targetRef) => {
          await sendRuntime({
            type: 'REMOVE_LOCAL_RULE',
            ref: targetRef,
          });
          scheduleScan(true);
        },
      });
    }

    function extractCardRef(card: HTMLElement): ChannelRef {
      let channelId = normalizeChannelId(card.dataset.ngChannelId);
      let handle = normalizeHandle(card.dataset.ngHandle);
      let channelName = card.dataset.ngChannelName?.trim() || undefined;
      let videoId = extractVideoId(card.dataset.ngVideoId);

      if (!channelId || !handle || !channelName) {
        const channelAnchors = card.querySelectorAll<HTMLAnchorElement>(
          'a[href*="/@"], a[href*="/channel/UC"], ytd-channel-name a',
        );
        for (let i = 0; i < channelAnchors.length; i++) {
          const anchor = channelAnchors[i]!;
          const href = anchor.getAttribute('href');
          const parsed = parseYouTubeChannelHref(href);
          if (!channelId && parsed.channelId) channelId = parsed.channelId;
          if (!handle && parsed.handle) handle = parsed.handle;
          const text = anchor.textContent?.trim();
          if (!channelName && text && !text.startsWith('@') && text.length < 100) {
            channelName = text;
          }
          if (channelId && handle && channelName) break;
        }
      }

      if (!channelName) {
        const nameNode = card.querySelector<HTMLElement>(
          [
            'ytd-channel-name yt-formatted-string',
            '#channel-name yt-formatted-string',
            '#channel-title yt-formatted-string',
            '.yt-content-metadata-view-model__metadata-row:first-child span',
            '.yt-content-metadata-view-model-wiz__metadata-row:first-child span',
          ].join(', '),
        );
        const text = nameNode?.textContent?.trim();
        if (text) channelName = text;
      }

      if (!videoId) {
        const videoAnchor = card.querySelector<HTMLAnchorElement>(
          'a[href*="/watch?v="], a[href*="/shorts/"]',
        );
        if (videoAnchor) {
          videoId = extractVideoId(videoAnchor.getAttribute('href'));
        }
      }

      return { channelId, handle, channelName, videoId };
    }

    function findMetadataHost(card: HTMLElement): HTMLElement | null {
      const candidates = [
        'ytd-video-meta-block #metadata',
        'ytd-video-meta-block',
        '#info-section',
        '#meta',
        '#channel-info',
        '.yt-lockup-metadata-view-model__text-container',
        '.yt-content-metadata-view-model',
        '.yt-lockup-metadata-view-model-wiz__text-container',
        '.yt-content-metadata-view-model-wiz',
        '.shortsLockupViewModelHostMetadataContainer',
        '#details',
      ];
      for (const selector of candidates) {
        const el = card.querySelector<HTMLElement>(selector);
        if (el) return el;
      }
      return card;
    }

    function renderSignalLine(card: HTMLElement, decision: ResolvedDecision): void {
      const existing = card.querySelector<HTMLElement>('.ng-signal-line');

      const shouldShowLine =
        decision.action === 'label' ||
        decision.action === 'dim' ||
        (decision.action === 'hide' && revealHidden);

      if (!shouldShowLine) {
        existing?.remove();
        return;
      }

      const renderSig = `${decision.action}|${decision.category}|${decision.primaryLabel}|${decision.sourceName}|${decision.evidenceUrl ?? ''}|${decision.note ?? ''}`;
      if (existing && existing.dataset.ngRenderSig === renderSig) {
        return;
      }

      const meta = getCategoryMeta(decision.category);
      const accent =
        decision.category === 'topic-match' && decision.matchedTopic
          ? TOPICS[decision.matchedTopic]?.accentColor ?? meta.accentColor
          : meta.accentColor;

      const line = existing ?? document.createElement('div');
      line.className = 'ng-signal-line';
      line.dataset.ngRenderSig = renderSig;
      line.style.setProperty('--ng-accent', accent);

      const iconWrap = document.createElement('span');
      iconWrap.className = 'ng-signal-icon';
      const iconName: InPageIconName =
        decision.action === 'hide'
          ? 'prohibit'
          : decision.action === 'dim'
            ? 'eye-slash'
            : meta.icon;
      iconWrap.appendChild(createPhosphorSvg(iconName, 13));

      const labelSpan = document.createElement('span');
      labelSpan.className = 'ng-signal-label';
      labelSpan.textContent =
        decision.action === 'hide'
          ? `Hidden: ${decision.primaryLabel}`
          : decision.primaryLabel;

      const sep = document.createElement('span');
      sep.className = 'ng-signal-sep';
      sep.textContent = '·';

      const sourceSpan = document.createElement('span');
      sourceSpan.className = 'ng-signal-source';
      sourceSpan.textContent = decision.sourceName;

      const children: Node[] = [iconWrap, labelSpan, sep, sourceSpan];

      const safeEvidence = sanitizeHttpUrl(decision.evidenceUrl);
      if (safeEvidence) {
        const link = document.createElement('a');
        link.className = 'ng-signal-evidence';
        link.href = safeEvidence;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = decision.note || 'Open source evidence';
        link.setAttribute('aria-label', 'Open source evidence');
        link.appendChild(createPhosphorSvg('arrow-square-out', 12));
        link.addEventListener('click', (e) => e.stopPropagation());
        children.push(link);
      }

      line.replaceChildren(...children);

      if (decision.note) {
        line.title = `${decision.primaryLabel} (${decision.sourceName}) - ${decision.note}`;
      } else {
        line.title = `${decision.primaryLabel} (${decision.sourceName})`;
      }

      if (!existing) {
        const host = findMetadataHost(card);
        host?.appendChild(line);
      }
    }

    function ensureCardTrigger(card: HTMLElement): void {
      if (card.querySelector(':scope > .ng-card-trigger')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-card-trigger';
      btn.title = 'NoiseGate: Inspect channel, topic, monetization, or set rule';
      btn.setAttribute('aria-label', 'NoiseGate channel controls');
      btn.appendChild(createPhosphorSvg('waveform', 14));

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const record = cardRecords.get(card);
        const ref = record?.ref ?? extractCardRef(card);
        const decision: ResolvedDecision = record?.decision ?? {
          action: 'none',
          origin: 'none',
          category: '',
          primaryLabel: '',
          sourceName: '',
          listMatches: [],
          hasOfficialDisclosure: false,
          disclosureVideoCount: 0,
          overrodeListCount: 0,
          topics: [],
          observedYppSignals: [],
          monetizationInspected: false,
          hasPaidPromotion: false,
        };

        openPopoverFor(btn, ref, decision);
      });

      card.appendChild(btn);
    }

    function applyCardDecision(
      card: HTMLElement,
      _ref: ChannelRef,
      decision: ResolvedDecision,
    ): void {
      card.dataset.ngCard = '1';

      if (decision.action === 'label' || decision.action === 'dim' || decision.action === 'hide') {
        const meta = getCategoryMeta(decision.category);
        const accent =
          decision.category === 'topic-match' && decision.matchedTopic
            ? TOPICS[decision.matchedTopic]?.accentColor ?? meta.accentColor
            : meta.accentColor;
        card.dataset.ngState = decision.action;
        card.dataset.ngHasSignal = '1';
        card.style.setProperty('--ng-accent', accent);
      } else if (decision.action === 'allow') {
        delete card.dataset.ngState;
        card.dataset.ngHasSignal = '1';
        card.style.setProperty('--ng-accent', '#10b981');
      } else {
        delete card.dataset.ngState;
        delete card.dataset.ngHasSignal;
        card.style.removeProperty('--ng-accent');
      }

      renderSignalLine(card, decision);
      ensureCardTrigger(card);
    }

    function collectTopLevelCards(): HTMLElement[] {
      const all = Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR));
      return all.filter((el) => {
        const parent = el.parentElement;
        if (!parent) return true;
        return !parent.closest(CARD_SELECTOR);
      });
    }

    function detectWatchDomDisclosure(): boolean {
      if (!location.pathname.startsWith('/watch')) return false;

      const watchFlexy = document.querySelector('ytd-watch-flexy:not([hidden])');
      const scope = watchFlexy ?? document;
      const howMade = scope.querySelector('how-this-was-made-section-view-model');
      if (howMade && (howMade.textContent?.trim().length ?? 0) > 10) {
        return true;
      }

      return false;
    }

    function readWatchBridgeDetail(urlVideoId?: string): WatchBridgeDetail | null {
      const candidate =
        lastWatchBridgeInfo ??
        parseBridgeDetail<WatchBridgeDetail>(document.documentElement.dataset.ngWatchInfo);
      if (!candidate) return null;
      if (candidate.videoId && urlVideoId && candidate.videoId !== urlVideoId) {
        return null;
      }
      return candidate;
    }

    function extractWatchPageRef(): ChannelRef {
      const videoId = extractVideoId(location.href);
      const bridgeInfo = readWatchBridgeDetail(videoId);
      let channelId = normalizeChannelId(bridgeInfo?.channelId);
      let handle = normalizeHandle(bridgeInfo?.handle);
      let channelName = bridgeInfo?.channelName;

      const owner = document.querySelector(
        'ytd-watch-flexy:not([hidden]) ytd-watch-metadata ytd-video-owner-renderer',
      );
      if (owner) {
        const link = owner.querySelector<HTMLAnchorElement>(
          'ytd-channel-name a, a[href*="/@"], a[href*="/channel/UC"]',
        );
        if (link) {
          const parsedHref = parseYouTubeChannelHref(link.getAttribute('href'));
          if (!channelId && parsedHref.channelId) channelId = parsedHref.channelId;
          if (!handle && parsedHref.handle) handle = parsedHref.handle;
          if (!channelName && link.textContent?.trim()) {
            channelName = link.textContent.trim();
          }
        }
      }

      return { videoId, channelId, handle, channelName };
    }

    function appendSegmentSep(container: HTMLElement): void {
      if (container.childElementCount > 0) {
        const sep = document.createElement('span');
        sep.className = 'ng-strip-sep';
        sep.textContent = '·';
        container.appendChild(sep);
      }
    }

    function appendYppIndicator(
      container: HTMLElement,
      decision: ResolvedDecision,
      unverifiedLabel: string,
    ): void {
      if (hasObservedYppSignals(decision.observedYppSignals)) {
        appendSegmentSep(container);
        const tag = document.createElement('span');
        tag.className = 'ng-ypp-tag ng-ypp-positive';
        tag.title = formatMonetizationSummary(
          decision.observedYppSignals,
          decision.monetizationInspected,
        );
        tag.appendChild(createPhosphorSvg('currency-circle-dollar', 13));
        const text = document.createElement('span');
        text.textContent = formatYppStripLabel(decision.observedYppSignals);
        tag.appendChild(text);
        container.appendChild(tag);
        return;
      }

      if (unverifiedLabel) {
        appendSegmentSep(container);
        const muted = document.createElement('span');
        muted.className = 'ng-strip-muted';
        muted.title = formatMonetizationSummary([], decision.monetizationInspected);
        muted.textContent = unverifiedLabel;
        container.appendChild(muted);
      }
    }

    async function processWatchPage(): Promise<{
      channelId?: string;
      handle?: string;
      channelName: string;
      decision: ResolvedDecision;
    } | null> {
      if (!location.pathname.startsWith('/watch')) {
        document.querySelectorAll('.ng-watch-bar').forEach((el) => el.remove());
        document.querySelectorAll('.ng-watch-inline-trigger').forEach((el) => el.remove());
        return null;
      }

      const ref = extractWatchPageRef();
      const videoId = ref.videoId;
      const bridgeInfo = readWatchBridgeDetail(videoId);

      const bridgeDisclosure = Boolean(bridgeInfo?.hasOfficialDisclosure);
      const domDisclosure = detectWatchDomDisclosure();

      if (videoId && (bridgeDisclosure || domDisclosure) && !reportedDisclosures.has(videoId)) {
        reportedDisclosures.add(videoId);
        try {
          await sendRuntime({
            type: 'REPORT_DISCLOSURE',
            videoId,
            channelId: ref.channelId,
            handle: ref.handle,
            channelName: ref.channelName,
            source: bridgeDisclosure ? 'watch-data' : 'watch-dom',
          });
        } catch {
        }
      }

      if ((ref.channelId || ref.handle) && bridgeInfo) {
        const yppSignals = bridgeInfo.yppSignals ?? [];
        const telSig = [
          ref.channelId ?? '',
          ref.handle ?? '',
          videoId ?? '',
          bridgeInfo.youtubeCategory ?? '',
          bridgeInfo.hasPaidPromotion ? '1' : '0',
          yppSignals.join(','),
          bridgeInfo.monetizationInspected ? '1' : '0',
        ].join('|');

        if (!reportedTelemetrySignatures.has(telSig)) {
          reportedTelemetrySignatures.add(telSig);
          try {
            await sendRuntime({
              type: 'REPORT_CHANNEL_TELEMETRY',
              ref,
              youtubeCategory: bridgeInfo.youtubeCategory,
              yppSignals,
              monetizationInspected: Boolean(bridgeInfo.monetizationInspected),
              hasPaidPromotion: Boolean(bridgeInfo.hasPaidPromotion),
            });
          } catch {
          }
        }
      }

      if (!ref.channelId && !ref.handle && !ref.videoId) {
        document.querySelectorAll('.ng-watch-bar').forEach((el) => el.remove());
        document.querySelectorAll('.ng-watch-inline-trigger').forEach((el) => el.remove());
        return null;
      }

      let decision: ResolvedDecision | undefined;
      try {
        const evalMap = await sendRuntime<Record<string, ResolvedDecision>>({
          type: 'EVALUATE_BATCH',
          items: [
            {
              requestId: 'watch',
              channelId: ref.channelId,
              handle: ref.handle,
              channelName: ref.channelName,
              videoId: ref.videoId,
            },
          ],
          handleMappings:
            ref.channelId && ref.handle
              ? [{ channelId: ref.channelId, handle: ref.handle }]
              : undefined,
        });
        decision = evalMap.watch;
      } catch {
        return null;
      }

      if (!decision) return null;

      const watchFlexy = document.querySelector('ytd-watch-flexy:not([hidden])');
      const ownerContainer = watchFlexy?.querySelector<HTMLElement>(
        'ytd-watch-metadata #owner',
      );
      if (ownerContainer) {
        let trigger = ownerContainer.querySelector<HTMLButtonElement>(
          '.ng-watch-inline-trigger',
        );
        if (!trigger) {
          trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.className = 'ng-watch-inline-trigger';
          ownerContainer.appendChild(trigger);
        }

        const triggerText =
          decision.action !== 'none'
            ? decision.action === 'allow'
              ? 'Trusted'
              : decision.primaryLabel
            : 'NoiseGate';

        const triggerAccent =
          decision.action === 'allow'
            ? '#10b981'
            : decision.action !== 'none'
              ? decision.category === 'topic-match' && decision.matchedTopic
                ? TOPICS[decision.matchedTopic]?.accentColor ?? getCategoryMeta(decision.category).accentColor
                : getCategoryMeta(decision.category).accentColor
              : '';

        if (triggerAccent) {
          trigger.dataset.ngActive = '1';
          trigger.style.setProperty('--ng-accent', triggerAccent);
        } else {
          delete trigger.dataset.ngActive;
          trigger.style.removeProperty('--ng-accent');
        }

        if (trigger.dataset.ngTriggerText !== triggerText) {
          trigger.dataset.ngTriggerText = triggerText;
          const label = document.createElement('span');
          label.textContent = triggerText;
          trigger.replaceChildren(createPhosphorSvg('waveform', 14), label);
        }

        trigger.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPopoverFor(trigger!, ref, decision!);
        };
      }

      const titleContainer = watchFlexy?.querySelector<HTMLElement>(
        'ytd-watch-metadata #title',
      );
      const existingBar = watchFlexy?.querySelector<HTMLElement>('.ng-watch-bar') ?? null;

      const hasActionOrDisclosure =
        decision.action === 'label' ||
        decision.action === 'dim' ||
        decision.action === 'hide' ||
        decision.action === 'allow' ||
        decision.hasOfficialDisclosure;

      const hasYpp = hasObservedYppSignals(decision.observedYppSignals);
      const topicMeta = decision.topics[0] ? TOPICS[decision.topics[0]] : undefined;
      const topicShort = topicMeta?.shortLabel ?? decision.rawYouTubeCategory;
      const topicFull = topicMeta?.label ?? decision.rawYouTubeCategory;

      const hasNeutralMeta =
        (cachedShowMonetization && hasYpp) ||
        (cachedShowTopic && Boolean(topicShort)) ||
        decision.hasPaidPromotion;

      if ((!hasActionOrDisclosure && !hasNeutralMeta) || !titleContainer) {
        existingBar?.remove();
        return {
          channelId: ref.channelId,
          handle: ref.handle,
          channelName:
            ref.channelName || formatHandle(ref.handle) || ref.channelId || 'Channel',
          decision,
        };
      }

      const meta = hasActionOrDisclosure
        ? getCategoryMeta(
            decision.category ||
              (decision.hasOfficialDisclosure ? 'disclosure-detected' : 'custom'),
          )
        : null;

      const barAccent =
        decision.action === 'allow'
          ? '#10b981'
          : decision.category === 'topic-match' && decision.matchedTopic
            ? TOPICS[decision.matchedTopic]?.accentColor ?? '#94a3b8'
            : meta?.accentColor ?? '#94a3b8';

      const barSig = [
        ref.channelId ?? '',
        ref.handle ?? '',
        decision.action,
        decision.category,
        decision.primaryLabel,
        decision.sourceName,
        decision.note ?? '',
        cachedShowTopic ? topicShort ?? '' : '',
        cachedShowMonetization ? decision.observedYppSignals.join(',') : '',
        cachedShowMonetization && decision.monetizationInspected ? '1' : '0',
        decision.hasPaidPromotion ? '1' : '0',
        barAccent,
      ].join('::');

      const bar = existingBar ?? document.createElement('div');
      bar.className = 'ng-watch-bar';

      if (bar.dataset.ngBarSig !== barSig) {
        bar.dataset.ngBarSig = barSig;
        bar.style.setProperty('--ng-accent', barAccent);

        const left = document.createElement('div');
        left.className = 'ng-watch-bar-left';

        const leadIcon: InPageIconName = hasActionOrDisclosure
          ? decision.action === 'allow'
            ? 'shield-check'
            : decision.action === 'hide'
              ? 'prohibit'
              : decision.action === 'dim'
                ? 'eye-slash'
                : decision.hasOfficialDisclosure && decision.origin === 'disclosure'
                  ? 'sparkle'
                  : meta!.icon
          : hasYpp
            ? 'currency-circle-dollar'
            : 'television';

        const iconEl = document.createElement('span');
        iconEl.className = 'ng-watch-bar-icon';
        iconEl.appendChild(createPhosphorSvg(leadIcon, 15));
        left.appendChild(iconEl);

        const textWrap = document.createElement('div');
        textWrap.className = 'ng-watch-bar-text';

        if (hasActionOrDisclosure) {
          const strong = document.createElement('strong');
          strong.className = 'ng-strip-strong';
          strong.textContent =
            decision.action === 'allow'
              ? 'Trusted'
              : decision.action !== 'none'
                ? decision.primaryLabel
                : 'YouTube Synthetic Disclosure Detected';
          textWrap.appendChild(strong);

          if (decision.action !== 'none' && decision.sourceName) {
            appendSegmentSep(textWrap);
            const src = document.createElement('span');
            src.className = 'ng-strip-muted';
            src.textContent = decision.sourceName;
            textWrap.appendChild(src);
          }

          if (decision.note) {
            appendSegmentSep(textWrap);
            const noteSpan = document.createElement('span');
            noteSpan.className = 'ng-watch-bar-note';
            noteSpan.textContent = decision.note;
            textWrap.appendChild(noteSpan);
          }
        }

        if (cachedShowTopic && topicShort) {
          appendSegmentSep(textWrap);
          const topicEl = document.createElement('span');
          topicEl.className = 'ng-strip-item';
          if (topicFull) topicEl.title = `Topic: ${topicFull}`;
          topicEl.appendChild(createPhosphorSvg('television', 13));
          const topicText = document.createElement('span');
          topicText.textContent = topicShort;
          topicEl.appendChild(topicText);
          textWrap.appendChild(topicEl);
        }

        if (cachedShowMonetization) {
          appendYppIndicator(
            textWrap,
            decision,
            decision.monetizationInspected ? 'YPP: Unverified' : '',
          );
        }

        if (decision.hasPaidPromotion) {
          appendSegmentSep(textWrap);
          const promoEl = document.createElement('span');
          promoEl.className = 'ng-strip-item';
          promoEl.appendChild(createPhosphorSvg('megaphone', 13));
          const promoText = document.createElement('span');
          promoText.textContent = 'Paid promotion';
          promoEl.appendChild(promoText);
          textWrap.appendChild(promoEl);
        }

        left.appendChild(textWrap);

        const manageBtn = document.createElement('button');
        manageBtn.type = 'button';
        manageBtn.className = 'ng-watch-action-btn';
        manageBtn.appendChild(createPhosphorSvg('waveform', 13));
        const btnText = document.createElement('span');
        btnText.textContent = 'Channel Controls';
        manageBtn.appendChild(btnText);
        manageBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPopoverFor(manageBtn, ref, decision!);
        });

        bar.replaceChildren(left, manageBtn);
      } else {
        const manageBtn = bar.querySelector<HTMLButtonElement>('.ng-watch-action-btn');
        if (manageBtn) {
          manageBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopoverFor(manageBtn, ref, decision!);
          };
        }
      }

      if (!existingBar) {
        titleContainer.insertAdjacentElement('afterend', bar);
      }

      return {
        channelId: ref.channelId,
        handle: ref.handle,
        channelName:
          ref.channelName || formatHandle(ref.handle) || ref.channelId || 'Channel',
        decision,
      };
    }

    async function processChannelPage(): Promise<{
      channelId?: string;
      handle?: string;
      channelName: string;
      decision: ResolvedDecision;
    } | null> {
      const isChannelPath =
        location.pathname.startsWith('/@') ||
        location.pathname.startsWith('/channel/') ||
        location.pathname.startsWith('/c/') ||
        location.pathname.startsWith('/user/');

      if (!isChannelPath) {
        document.querySelectorAll('.ng-channel-bar').forEach((el) => el.remove());
        return null;
      }

      let chInfo = lastChannelBridgeInfo;
      if (!chInfo && document.documentElement.dataset.ngChannelInfo) {
        chInfo = parseBridgeDetail<ChannelBridgeDetail>(
          document.documentElement.dataset.ngChannelInfo,
        );
      }

      if (chInfo?.urlPath && chInfo.urlPath !== location.pathname) {
        chInfo = null;
      }

      if (!chInfo || (!chInfo.channelId && !chInfo.handle)) {
        document.querySelectorAll('.ng-channel-bar').forEach((el) => el.remove());
        return null;
      }

      const ref: ChannelRef = {
        channelId: normalizeChannelId(chInfo.channelId),
        handle: normalizeHandle(chInfo.handle),
        channelName: chInfo.channelName,
      };

      const yppSignals = chInfo.yppSignals ?? [];
      const chSig = `ch|${ref.channelId ?? ''}|${ref.handle ?? ''}|${yppSignals.join(',')}|${chInfo.monetizationInspected ? '1' : '0'}`;
      if (!reportedTelemetrySignatures.has(chSig)) {
        reportedTelemetrySignatures.add(chSig);
        try {
          await sendRuntime({
            type: 'REPORT_CHANNEL_TELEMETRY',
            ref,
            yppSignals,
            monetizationInspected: Boolean(chInfo.monetizationInspected),
          });
        } catch {
        }
      }

      let decision: ResolvedDecision | undefined;
      try {
        const evalMap = await sendRuntime<Record<string, ResolvedDecision>>({
          type: 'EVALUATE_BATCH',
          items: [
            {
              requestId: 'channel',
              channelId: ref.channelId,
              handle: ref.handle,
              channelName: ref.channelName,
            },
          ],
          handleMappings:
            ref.channelId && ref.handle
              ? [{ channelId: ref.channelId, handle: ref.handle }]
              : undefined,
        });
        decision = evalMap.channel;
      } catch {
        return null;
      }

      if (!decision) return null;

      const browseRoot = document.querySelector(
        'ytd-browse[page-subtype="channels"]:not([hidden])',
      );
      if (!browseRoot) return null;

      const mount = findChannelBarMount(browseRoot);
      if (!mount) return null;

      const accentColor =
        decision.action === 'allow'
          ? '#10b981'
          : decision.action !== 'none'
            ? decision.category === 'topic-match' && decision.matchedTopic
              ? TOPICS[decision.matchedTopic]?.accentColor ?? getCategoryMeta(decision.category).accentColor
              : getCategoryMeta(decision.category).accentColor
            : '#94a3b8';

      const topicMeta = decision.topics[0] ? TOPICS[decision.topics[0]] : undefined;
      const topicShort = topicMeta?.shortLabel ?? decision.rawYouTubeCategory;
      const topicFull = topicMeta?.label ?? decision.rawYouTubeCategory;
      const hasYpp = hasObservedYppSignals(decision.observedYppSignals);

      const chBarSig = [
        ref.channelId ?? '',
        ref.handle ?? '',
        accentColor,
        decision.action,
        decision.category,
        decision.primaryLabel,
        decision.sourceName,
        cachedShowTopic ? topicShort ?? '' : '',
        cachedShowMonetization ? decision.observedYppSignals.join(',') : '',
        cachedShowMonetization && decision.monetizationInspected ? '1' : '0',
      ].join('::');

      const allBars = Array.from(document.querySelectorAll<HTMLElement>('.ng-channel-bar'));
      let existingBar: HTMLElement | null = null;
      for (const candidate of allBars) {
        if (!existingBar && browseRoot.contains(candidate)) {
          existingBar = candidate;
        } else {
          candidate.remove();
        }
      }

      const bar = existingBar ?? document.createElement('div');
      bar.className = 'ng-channel-bar';
      bar.dataset.ngDock = mount.dockVariant;

      if (bar.dataset.ngBarSig !== chBarSig) {
        bar.dataset.ngBarSig = chBarSig;
        bar.style.setProperty('--ng-accent', accentColor);

        const left = document.createElement('div');
        left.className = 'ng-watch-bar-left';

        const meta =
          decision.action !== 'none' && decision.action !== 'allow'
            ? getCategoryMeta(decision.category)
            : null;
        const leadIcon: InPageIconName =
          decision.action === 'allow'
            ? 'shield-check'
            : decision.action === 'hide'
              ? 'prohibit'
              : decision.action === 'dim'
                ? 'eye-slash'
                : meta
                  ? meta.icon
                  : 'waveform';

        const iconEl = document.createElement('span');
        iconEl.className = 'ng-watch-bar-icon';
        iconEl.appendChild(createPhosphorSvg(leadIcon, 14));
        left.appendChild(iconEl);

        const segments = document.createElement('div');
        segments.className = 'ng-watch-bar-text';

        const statusStrong = document.createElement('strong');
        statusStrong.className = 'ng-strip-strong';
        statusStrong.textContent =
          decision.action === 'allow'
            ? 'Trusted'
            : decision.action !== 'none'
              ? decision.primaryLabel
              : 'NoiseGate';
        segments.appendChild(statusStrong);

        if (decision.action !== 'none' && decision.sourceName) {
          appendSegmentSep(segments);
          const srcSpan = document.createElement('span');
          srcSpan.className = 'ng-strip-muted';
          srcSpan.textContent = decision.sourceName;
          segments.appendChild(srcSpan);
        }

        if (cachedShowTopic && topicShort) {
          appendSegmentSep(segments);
          const topicEl = document.createElement('span');
          topicEl.className = 'ng-strip-item';
          if (topicFull) topicEl.title = `Topic: ${topicFull}`;
          topicEl.appendChild(createPhosphorSvg('television', 13));
          const topicText = document.createElement('span');
          topicText.textContent = topicShort;
          topicEl.appendChild(topicText);
          segments.appendChild(topicEl);
        }

        if (cachedShowMonetization) {
          const fallbackLabel =
            decision.monetizationInspected
              ? 'YPP: Unverified'
              : decision.action === 'none'
                ? 'Ready'
                : 'YPP: Pending';
          appendYppIndicator(segments, decision, fallbackLabel);
        } else if (decision.action === 'none' && !topicShort && !hasYpp) {
          appendSegmentSep(segments);
          const readyEl = document.createElement('span');
          readyEl.className = 'ng-strip-muted';
          readyEl.textContent = 'Ready';
          segments.appendChild(readyEl);
        }

        left.appendChild(segments);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ng-watch-action-btn';
        btn.appendChild(createPhosphorSvg('waveform', 13));
        const btnText = document.createElement('span');
        btnText.textContent = 'Channel Controls';
        btn.appendChild(btnText);
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPopoverFor(btn, ref, decision!);
        });

        bar.replaceChildren(left, btn);
      } else {
        const btn = bar.querySelector<HTMLButtonElement>('.ng-watch-action-btn');
        if (btn) {
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openPopoverFor(btn, ref, decision!);
          };
        }
      }

      if (mount.position === 'append') {
        if (bar.parentElement !== mount.host) {
          mount.host.appendChild(bar);
        }
      } else if (
        bar.previousElementSibling !== mount.host ||
        bar.parentElement !== mount.host.parentElement
      ) {
        mount.host.insertAdjacentElement('afterend', bar);
      }

      return {
        channelId: ref.channelId,
        handle: ref.handle,
        channelName:
          ref.channelName || formatHandle(ref.handle) || ref.channelId || 'Channel',
        decision,
      };
    }

    async function runScan(forceAll = false): Promise<void> {
      if (scanInFlight) {
        rescanQueued = true;
        return;
      }
      scanInFlight = true;

      try {
        injectStyles();
        requestBridgeHydration();

        try {
          const settingsRes = await browser.storage.local.get('ng_settings');
          const s = settingsRes.ng_settings as Partial<UserSettings> | undefined;
          cachedShowTriggers = s?.showCardHoverButton ?? true;
          cachedShowMonetization = s?.showMonetizationIndicator ?? true;
          cachedShowTopic = s?.showTopicIndicator ?? true;
          cachedSubmissionRepo = s?.communitySubmissionRepo || 'zyniotech/noisegate-lists';

          if (cachedShowTriggers) {
            delete document.documentElement.dataset.ngHideTriggers;
          } else {
            document.documentElement.dataset.ngHideTriggers = '1';
          }
        } catch {
        }

        const cards = collectTopLevelCards();
        const batchItems: EvaluateItem[] = [];
        const batchCardMap = new Map<string, { card: HTMLElement; ref: ChannelRef; sig: string }>();
        const handleMappings: Array<{ handle?: string; channelId?: string }> = [];

        let idx = 0;
        for (const card of cards) {
          const ref = extractCardRef(card);
          if (!ref.channelId && !ref.handle && !ref.videoId) continue;

          if (ref.channelId && ref.handle) {
            handleMappings.push({ channelId: ref.channelId, handle: ref.handle });
          }

          const sig = `${ref.channelId ?? ''}|${ref.handle ?? ''}|${ref.videoId ?? ''}`;
          const prev = cardRecords.get(card);

          if (!forceAll && prev && prev.signature === sig) {
            if (prev.decision.action === 'hide') {
              renderSignalLine(card, prev.decision);
            }
            continue;
          }

          const reqId = `c${idx++}`;
          batchItems.push({
            requestId: reqId,
            channelId: ref.channelId,
            handle: ref.handle,
            channelName: ref.channelName,
            videoId: ref.videoId,
          });
          batchCardMap.set(reqId, { card, ref, sig });
        }

        if (batchItems.length > 0) {
          const decisions = await sendRuntime<Record<string, ResolvedDecision>>({
            type: 'EVALUATE_BATCH',
            items: batchItems,
            handleMappings: handleMappings.length > 0 ? handleMappings : undefined,
          });

          for (const [reqId, entry] of batchCardMap.entries()) {
            const decision = decisions[reqId];
            if (!decision) continue;
            cardRecords.set(entry.card, {
              ref: entry.ref,
              decision,
              signature: entry.sig,
            });
            applyCardDecision(entry.card, entry.ref, decision);
          }
        }

        const [watchVisible, channelVisible] = await Promise.all([
          processWatchPage(),
          processChannelPage(),
        ]);

        let labeledCount = 0;
        let dimmedCount = 0;
        let hiddenCount = 0;
        let disclosureCount = 0;
        let trustedCount = 0;

        const visibleChannelsMap = new Map<
          string,
          {
            channelId?: string;
            handle?: string;
            channelName: string;
            decision: ResolvedDecision;
          }
        >();

        for (const ownerItem of [watchVisible, channelVisible]) {
          if (ownerItem) {
            const key = ownerItem.channelId ?? ownerItem.handle;
            if (key && !visibleChannelsMap.has(key)) {
              visibleChannelsMap.set(key, ownerItem);
            }
          }
        }

        for (const card of cards) {
          const rec = cardRecords.get(card);
          if (!rec) continue;
          const d = rec.decision;
          if (d.action === 'label') labeledCount++;
          else if (d.action === 'dim') dimmedCount++;
          else if (d.action === 'hide') hiddenCount++;
          else if (d.action === 'allow') trustedCount++;
          if (d.hasOfficialDisclosure) disclosureCount++;

          const key = rec.ref.channelId ?? rec.ref.handle;
          if (key && !visibleChannelsMap.has(key)) {
            visibleChannelsMap.set(key, {
              channelId: rec.ref.channelId,
              handle: rec.ref.handle,
              channelName:
                rec.ref.channelName || formatHandle(rec.ref.handle) || rec.ref.channelId || 'Channel',
              decision: d,
            });
          }
        }

        const score = (act: ResolvedDecision['action']) =>
          act === 'hide' ? 4 : act === 'dim' ? 3 : act === 'label' ? 2 : act === 'allow' ? 1 : 0;

        const sortedVisible = Array.from(visibleChannelsMap.values()).sort(
          (a, b) => score(b.decision.action) - score(a.decision.action),
        );
        const visibleChannels = sortedVisible.slice(0, 18);

        const stats: PageStats = {
          url: location.href,
          scannedCards: cards.length,
          labeledCount,
          dimmedCount,
          hiddenCount,
          disclosureCount,
          trustedCount,
          revealHidden,
          updatedAt: Date.now(),
          visibleChannels,
        };

        await sendRuntime({
          type: 'UPDATE_PAGE_STATS',
          stats,
        });
      } catch {
      } finally {
        scanInFlight = false;
        if (rescanQueued) {
          rescanQueued = false;
          scheduleScan(false);
        }
      }
    }

    function scheduleScan(forceAll = false, delayMs = 150): void {
      if (scanTimer !== null) {
        window.clearTimeout(scanTimer);
      }
      scanTimer = window.setTimeout(() => {
        scanTimer = null;
        void runScan(forceAll);
      }, delayMs);
    }

    document.addEventListener('noisegate:watch-info', (evt: Event) => {
      const parsed = parseBridgeDetail<WatchBridgeDetail>((evt as CustomEvent).detail);
      if (parsed) {
        lastWatchBridgeInfo = parsed;
        if (!hydratingFromScan) {
          scheduleScan(false, 120);
        }
      }
    });

    document.addEventListener('noisegate:channel-info', (evt: Event) => {
      const parsed = parseBridgeDetail<ChannelBridgeDetail>((evt as CustomEvent).detail);
      if (parsed) {
        lastChannelBridgeInfo = parsed;
        if (!hydratingFromScan) {
          scheduleScan(false, 120);
        }
      }
    });

    window.addEventListener('yt-navigate-start', () => {
      popover.close(false);
      lastWatchBridgeInfo = null;
      lastChannelBridgeInfo = null;
      if (navFallbackTimer !== null) {
        window.clearTimeout(navFallbackTimer);
        navFallbackTimer = null;
      }
      document.querySelectorAll('.ng-watch-bar').forEach((el) => el.remove());
      document.querySelectorAll('.ng-watch-inline-trigger').forEach((el) => el.remove());
      document.querySelectorAll('.ng-channel-bar').forEach((el) => el.remove());
    });

    window.addEventListener('popstate', () => {
      popover.close(false);
      lastWatchBridgeInfo = null;
      lastChannelBridgeInfo = null;
      scheduleScan(true, 180);
    });

    window.addEventListener('yt-navigate-finish', () => {
      popover.close(false);
      lastWatchBridgeInfo = parseBridgeDetail<WatchBridgeDetail>(
        document.documentElement.dataset.ngWatchInfo,
      );
      lastChannelBridgeInfo = parseBridgeDetail<ChannelBridgeDetail>(
        document.documentElement.dataset.ngChannelInfo,
      );
      if (navFallbackTimer !== null) {
        window.clearTimeout(navFallbackTimer);
      }
      scheduleScan(true, 180);
      navFallbackTimer = window.setTimeout(() => {
        navFallbackTimer = null;
        scheduleScan(false, 50);
      }, 900);
    });

    window.addEventListener('yt-page-data-updated', () => {
      scheduleScan(false, 200);
    });

    browser.runtime.onMessage.addListener((message: unknown) => {
      const msg = message as ContentBroadcast | undefined;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'NOISEGATE_STATE_UPDATED') {
        scheduleScan(true, 60);
      } else if (msg.type === 'NOISEGATE_SET_REVEAL_HIDDEN') {
        revealHidden = Boolean(msg.reveal);
        if (revealHidden) {
          document.documentElement.dataset.ngRevealHidden = '1';
        } else {
          delete document.documentElement.dataset.ngRevealHidden;
        }
        scheduleScan(true, 40);
      }
    });

    const themeObserver = new MutationObserver(() => {
      syncThemeAttribute();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['dark', 'light'],
    });
    const ytAppNode = document.querySelector('ytd-app, ytm-app');
    if (ytAppNode) {
      themeObserver.observe(ytAppNode, {
        attributes: true,
        attributeFilter: ['dark'],
      });
    }
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', syncThemeAttribute);

    const targetRoot = document.querySelector('ytd-app') ?? document.body;
    const observer = new MutationObserver((mutations) => {
      let relevant = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i]!;
        if (m.addedNodes.length > 0) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node instanceof HTMLElement) {
              if (
                node.closest(
                  '.ng-signal-line, .ng-card-trigger, .ng-watch-bar, .ng-channel-bar, .ng-watch-inline-trigger, #noisegate-popover-host',
                )
              ) {
                continue;
              }
              relevant = true;
              break;
            }
          }
        }
        if (relevant) break;
      }

      if (relevant) {
        scheduleScan(false, 180);
      }
    });

    observer.observe(targetRoot, { childList: true, subtree: true });

    injectStyles();
    scheduleScan(true, 120);
  },
});
