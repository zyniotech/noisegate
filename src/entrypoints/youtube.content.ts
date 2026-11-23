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
import { createPhosphorSvg } from '@/lib/phosphor-svg';
import { formatMonetizationSummary, TOPICS } from '@/lib/taxonomy';
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
  'ytd-channel-renderer',
  'yt-lockup-view-model',
  'ytd-reel-item-renderer',
  'ytm-shorts-lockup-view-model',
].join(',');

const DOM_DISCLOSURE_PHRASES = [
  'altered or synthetic content',
  'sound or visuals were significantly edited or digitally generated',
  'veränderte oder synthetische inhalte',
  'audio- oder visuelle inhalte wurden erheblich bearbeitet oder digital generiert',
  'contenu modifié ou synthétique',
  'contenido alterado o sintético',
];

const STYLE_ELEMENT_ID = 'noisegate-inpage-style';

const INPAGE_CSS = `
  /* NoiseGate In-Page Styles — Ultramono Titanium Chrome, Semantic Signal Bars Only */
  [data-ng-card="1"] {
    position: relative;
  }

  [data-ng-state="label"],
  [data-ng-state="dim"] {
    border-left: 2px solid var(--ng-accent, #d97706) !important;
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
    display: block !important;
    opacity: 0.48;
    border-left: 2px dashed var(--ng-accent, #ef4444) !important;
    padding-left: 8px !important;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-ng-state="dim"],
    .ng-card-trigger,
    .ng-watch-action-btn,
    .ng-watch-inline-trigger {
      transition: none !important;
    }
  }

  /* Single-line editorial metadata signal row (zero pill badges) */
  .ng-signal-line {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    padding: 2px 0;
    font-size: 12px;
    line-height: 1.35;
    font-weight: 500;
    color: var(--yt-spec-text-secondary, #606060);
    max-width: 100%;
    overflow: hidden;
  }

  .ng-signal-line .ng-signal-icon {
    flex-shrink: 0;
    color: var(--ng-accent, #d97706);
    display: inline-flex;
    align-items: center;
  }

  .ng-signal-line .ng-signal-label {
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-signal-line .ng-signal-sep {
    opacity: 0.45;
    flex-shrink: 0;
  }

  .ng-signal-line .ng-signal-source {
    color: var(--yt-spec-text-secondary, #606060);
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .ng-signal-line .ng-signal-evidence {
    flex-shrink: 0;
    color: var(--yt-spec-text-secondary, #606060);
    display: inline-flex;
    align-items: center;
    opacity: 0.85;
    text-decoration: none;
    margin-left: 2px;
  }

  .ng-signal-line .ng-signal-evidence:hover {
    color: var(--yt-spec-text-primary, #0f0f0f);
    opacity: 1;
  }

  /* Subtle 1-click hover trigger on YouTube cards (Ultramono Titanium) */
  .ng-card-trigger {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 25;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(11, 14, 20, 0.88);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 4px 10px rgba(0, 0, 0, 0.35);
    color: #e2e8f0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    pointer-events: auto;
    backdrop-filter: blur(6px);
    transition: opacity 120ms ease-out, background-color 110ms ease, transform 90ms ease-out;
    padding: 0;
  }

  [data-ng-card="1"]:hover > .ng-card-trigger,
  [data-ng-card="1"]:focus-within > .ng-card-trigger,
  .ng-card-trigger:focus-visible {
    opacity: 1;
  }

  [data-ng-has-signal="1"] > .ng-card-trigger {
    opacity: 0.8;
    border-color: var(--ng-accent, #94a3b8);
    color: var(--ng-accent, #f8fafc);
  }

  [data-ng-has-signal="1"]:hover > .ng-card-trigger {
    opacity: 1;
  }

  .ng-card-trigger:hover {
    background: rgba(15, 18, 25, 0.96);
    color: #ffffff;
  }

  .ng-card-trigger:active {
    transform: scale(0.94);
  }

  html[data-ng-hide-triggers="1"] .ng-card-trigger {
    display: none !important;
  }

  /* Watch & Channel page neutral context strip */
  .ng-watch-bar,
  .ng-channel-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 10px 0 6px;
    padding: 8px 12px;
    border-left: 2px solid var(--ng-accent, #94a3b8);
    background: var(--yt-spec-badge-chip-background, rgba(128, 128, 128, 0.08));
    border-radius: 0 6px 6px 0;
    font-size: 12.5px;
    line-height: 1.4;
    color: var(--yt-spec-text-primary, #0f0f0f);
  }

  .ng-watch-bar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .ng-watch-bar-icon {
    flex-shrink: 0;
    color: var(--ng-accent, #94a3b8);
    display: inline-flex;
  }

  .ng-watch-bar-text {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }

  .ng-watch-bar-note {
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 12px;
  }

  .ng-watch-bar-meta {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 12px;
  }

  .ng-watch-action-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(128, 128, 128, 0.25));
    background: transparent;
    color: var(--yt-spec-text-primary, #0f0f0f);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 120ms ease, transform 90ms ease;
  }

  .ng-watch-action-btn:hover {
    background: var(--yt-spec-10-percent-layer, rgba(128, 128, 128, 0.16));
  }

  .ng-watch-action-btn:active {
    transform: scale(0.97);
  }

  .ng-watch-inline-trigger {
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid var(--yt-spec-10-percent-layer, rgba(128, 128, 128, 0.25));
    background: transparent;
    color: var(--yt-spec-text-secondary, #606060);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, transform 90ms ease;
  }

  .ng-watch-inline-trigger:hover {
    background: var(--yt-spec-10-percent-layer, rgba(128, 128, 128, 0.16));
    color: var(--yt-spec-text-primary, #0f0f0f);
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

async function sendRuntime<T>(request: RuntimeRequest): Promise<T> {
  const response = (await browser.runtime.sendMessage(request)) as
    | RuntimeResponse<T>
    | undefined;
  if (!response || !response.ok) {
    throw new Error(response?.error ?? 'Extension communication failed');
  }
  return response.data;
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    const popover = new InPagePopoverManager();
    const cardRecords = new WeakMap<HTMLElement, CardRecord>();
    const reportedDisclosures = new Set<string>();
    const reportedTelemetrySignatures = new Set<string>();

    let revealHidden = false;
    let scanTimer: number | null = null;
    let scanInFlight = false;
    let rescanQueued = false;
    let lastWatchBridgeInfo: WatchBridgeDetail | null = null;
    let lastChannelBridgeInfo: ChannelBridgeDetail | null = null;

    let cachedShowTriggers = true;
    let cachedShowMonetization = true;
    let cachedShowTopic = true;
    let cachedSubmissionRepo = 'zyniotech/noisegate-lists';

    function injectStyles(): void {
      if (document.getElementById(STYLE_ELEMENT_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ELEMENT_ID;
      style.textContent = INPAGE_CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function requestBridgeHydration(): void {
      document.dispatchEvent(new CustomEvent('noisegate:hydrate'));
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
          'ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string, .yt-content-metadata-view-model-wiz__metadata-row:first-child span',
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
        '#meta',
        '#channel-info',
        '.yt-lockup-metadata-view-model-wiz__text-container',
        '.yt-content-metadata-view-model-wiz',
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

      const meta = getCategoryMeta(decision.category);
      const accent =
        decision.category === 'topic-match' && decision.matchedTopic
          ? TOPICS[decision.matchedTopic]?.accentColor ?? meta.accentColor
          : meta.accentColor;

      const line = existing ?? document.createElement('div');
      line.className = 'ng-signal-line';
      line.style.setProperty('--ng-accent', accent);
      line.innerHTML = '';

      const iconWrap = document.createElement('span');
      iconWrap.className = 'ng-signal-icon';
      const iconName =
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

      line.appendChild(iconWrap);
      line.appendChild(labelSpan);
      line.appendChild(sep);
      line.appendChild(sourceSpan);

      const safeEvidence = sanitizeHttpUrl(decision.evidenceUrl);
      if (safeEvidence) {
        const link = document.createElement('a');
        link.className = 'ng-signal-evidence';
        link.href = safeEvidence;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.title = decision.note || 'Open source evidence';
        link.appendChild(createPhosphorSvg('arrow-square-out', 12));
        link.addEventListener('click', (e) => e.stopPropagation());
        line.appendChild(link);
      }

      if (decision.note) {
        line.title = `${decision.primaryLabel} (${decision.sourceName}) — ${decision.note}`;
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

      const howMade = document.querySelector('how-this-was-made-section-view-model');
      if (howMade && (howMade.textContent?.trim().length ?? 0) > 10) {
        return true;
      }

      const containers = [
        document.querySelector('ytd-structured-description-content-renderer'),
        document.querySelector('ytd-watch-metadata #description-inline-expander'),
        document.querySelector('ytd-watch-metadata #info-container'),
      ];

      for (const el of containers) {
        const text = el?.textContent?.toLowerCase();
        if (!text) continue;
        if (DOM_DISCLOSURE_PHRASES.some((phrase) => text.includes(phrase))) {
          return true;
        }
      }

      return false;
    }

    function extractWatchPageRef(): ChannelRef {
      const videoId = extractVideoId(location.href);
      let channelId = normalizeChannelId(lastWatchBridgeInfo?.channelId);
      let handle = normalizeHandle(lastWatchBridgeInfo?.handle);
      let channelName = lastWatchBridgeInfo?.channelName;

      if ((!channelId || !handle) && document.documentElement.dataset.ngWatchInfo) {
        try {
          const parsed = JSON.parse(
            document.documentElement.dataset.ngWatchInfo,
          ) as WatchBridgeDetail;
          if (!parsed.videoId || parsed.videoId === videoId) {
            if (!channelId) channelId = normalizeChannelId(parsed.channelId);
            if (!handle) handle = normalizeHandle(parsed.handle);
            if (!channelName) channelName = parsed.channelName;
          }
        } catch {
          // Ignore malformed JSON
        }
      }

      const owner = document.querySelector('ytd-watch-metadata ytd-video-owner-renderer');
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

    async function processWatchPage(): Promise<void> {
      if (!location.pathname.startsWith('/watch')) {
        document.querySelector('.ng-watch-bar')?.remove();
        document.querySelector('.ng-watch-inline-trigger')?.remove();
        return;
      }

      const ref = extractWatchPageRef();
      const videoId = ref.videoId;

      const bridgeInfo =
        lastWatchBridgeInfo && (!lastWatchBridgeInfo.videoId || lastWatchBridgeInfo.videoId === videoId)
          ? lastWatchBridgeInfo
          : null;

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
          // Non-fatal
        }
      }

      // Report neutral YPP monetization, paid promotion & YouTube topic category
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
            // Non-fatal
          }
        }
      }

      if (!ref.channelId && !ref.handle && !ref.videoId) return;

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
        return;
      }

      if (!decision) return;

      const ownerContainer = document.querySelector<HTMLElement>(
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

        trigger.innerHTML = '';
        trigger.appendChild(createPhosphorSvg('waveform', 14));
        const label = document.createElement('span');
        label.textContent =
          decision.action !== 'none'
            ? decision.action === 'allow'
              ? 'Trusted'
              : decision.primaryLabel
            : 'NoiseGate';
        trigger.appendChild(label);

        trigger.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPopoverFor(trigger!, ref, decision!);
        };
      }

      const titleContainer = document.querySelector<HTMLElement>(
        'ytd-watch-metadata #title',
      );
      const existingBar = document.querySelector<HTMLElement>('.ng-watch-bar');

      const hasActionOrDisclosure =
        decision.action === 'label' ||
        decision.action === 'dim' ||
        decision.action === 'hide' ||
        decision.hasOfficialDisclosure;

      const hasNeutralMeta =
        (cachedShowMonetization && decision.monetizationInspected) ||
        (cachedShowTopic && (decision.topics.length > 0 || Boolean(decision.rawYouTubeCategory))) ||
        decision.hasPaidPromotion;

      if ((!hasActionOrDisclosure && !hasNeutralMeta) || !titleContainer) {
        existingBar?.remove();
        return;
      }

      const meta = hasActionOrDisclosure
        ? getCategoryMeta(
            decision.category ||
              (decision.hasOfficialDisclosure ? 'disclosure-detected' : 'custom'),
          )
        : null;

      const barAccent =
        decision.category === 'topic-match' && decision.matchedTopic
          ? TOPICS[decision.matchedTopic]?.accentColor ?? '#94a3b8'
          : meta?.accentColor ?? '#94a3b8';

      const bar = existingBar ?? document.createElement('div');
      bar.className = 'ng-watch-bar';
      bar.style.setProperty('--ng-accent', barAccent);
      bar.innerHTML = '';

      const left = document.createElement('div');
      left.className = 'ng-watch-bar-left';

      const iconEl = document.createElement('span');
      iconEl.className = 'ng-watch-bar-icon';
      iconEl.appendChild(
        createPhosphorSvg(
          hasActionOrDisclosure
            ? decision.hasOfficialDisclosure && decision.origin === 'disclosure'
              ? 'sparkle'
              : meta!.icon
            : decision.observedYppSignals.length > 0
              ? 'currency-circle-dollar'
              : 'television',
          15,
        ),
      );

      const textWrap = document.createElement('div');
      textWrap.className = 'ng-watch-bar-text';

      if (hasActionOrDisclosure) {
        const strong = document.createElement('strong');
        strong.textContent =
          decision.action !== 'none' && decision.action !== 'allow'
            ? `${decision.primaryLabel} · ${decision.sourceName}`
            : 'YouTube Synthetic Disclosure Detected';
        textWrap.appendChild(strong);

        if (decision.note) {
          const noteSpan = document.createElement('span');
          noteSpan.className = 'ng-watch-bar-note';
          noteSpan.textContent = decision.note;
          textWrap.appendChild(noteSpan);
        }
      }

      // Append neutral factual Topic + YPP Monetization metadata
      const metaItems: string[] = [];
      if (cachedShowTopic) {
        const topicLabel =
          decision.topics[0]
            ? TOPICS[decision.topics[0]]?.label ?? decision.topics[0]
            : decision.rawYouTubeCategory;
        if (topicLabel) {
          metaItems.push(`Topic: ${topicLabel}`);
        }
      }
      if (cachedShowMonetization && decision.monetizationInspected) {
        metaItems.push(
          formatMonetizationSummary(
            decision.observedYppSignals,
            decision.monetizationInspected,
          ),
        );
      }
      if (decision.hasPaidPromotion) {
        metaItems.push('Paid promotion disclosed');
      }

      if (metaItems.length > 0) {
        const metaSpan = document.createElement('span');
        metaSpan.className = 'ng-watch-bar-meta';
        metaSpan.textContent =
          (hasActionOrDisclosure ? '· ' : '') + metaItems.join(' · ');
        textWrap.appendChild(metaSpan);
      }

      left.appendChild(iconEl);
      left.appendChild(textWrap);

      const manageBtn = document.createElement('button');
      manageBtn.type = 'button';
      manageBtn.className = 'ng-watch-action-btn';
      manageBtn.appendChild(createPhosphorSvg('waveform', 13));
      manageBtn.appendChild(document.createTextNode('Channel Controls'));
      manageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPopoverFor(manageBtn, ref, decision!);
      });

      bar.appendChild(left);
      bar.appendChild(manageBtn);

      if (!existingBar) {
        titleContainer.insertAdjacentElement('afterend', bar);
      }
    }

    async function processChannelPage(): Promise<void> {
      const isChannelPath =
        location.pathname.startsWith('/@') ||
        location.pathname.startsWith('/channel/') ||
        location.pathname.startsWith('/c/') ||
        location.pathname.startsWith('/user/');

      if (!isChannelPath) {
        document.querySelector('.ng-channel-bar')?.remove();
        return;
      }

      let chInfo = lastChannelBridgeInfo;
      if (!chInfo && document.documentElement.dataset.ngChannelInfo) {
        try {
          chInfo = JSON.parse(
            document.documentElement.dataset.ngChannelInfo,
          ) as ChannelBridgeDetail;
        } catch {
          // Ignore
        }
      }

      if (!chInfo || (!chInfo.channelId && !chInfo.handle)) return;

      const ref: ChannelRef = {
        channelId: normalizeChannelId(chInfo.channelId),
        handle: normalizeHandle(chInfo.handle),
        channelName: chInfo.channelName,
      };

      const yppSignals = chInfo.yppSignals ?? [];
      const chSig = `ch|${ref.channelId ?? ''}|${ref.handle ?? ''}|${yppSignals.join(',')}`;
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
          // Non-fatal
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
        return;
      }

      if (!decision) return;

      const headerHost = document.querySelector<HTMLElement>(
        'ytd-browse[page-subtype="channels"] #page-header, ytd-c4-tabbed-header-renderer #inner-header-container',
      );
      if (!headerHost) return;

      const existingBar = document.querySelector<HTMLElement>('.ng-channel-bar');
      const bar = existingBar ?? document.createElement('div');
      bar.className = 'ng-channel-bar';
      bar.style.setProperty(
        '--ng-accent',
        decision.action === 'allow'
          ? '#10b981'
          : decision.action !== 'none'
            ? getCategoryMeta(decision.category).accentColor
            : '#94a3b8',
      );
      bar.innerHTML = '';

      const left = document.createElement('div');
      left.className = 'ng-watch-bar-left';

      const iconEl = document.createElement('span');
      iconEl.className = 'ng-watch-bar-icon';
      iconEl.appendChild(createPhosphorSvg('waveform', 15));
      left.appendChild(iconEl);

      const parts: string[] = [];
      if (decision.action !== 'none') {
        parts.push(
          decision.action === 'allow'
            ? 'Trusted (Local Override)'
            : `${decision.primaryLabel} · ${decision.sourceName}`,
        );
      }
      if (cachedShowTopic) {
        const topicLabel = decision.topics[0]
          ? TOPICS[decision.topics[0]]?.label ?? decision.topics[0]
          : decision.rawYouTubeCategory;
        if (topicLabel) parts.push(`Topic: ${topicLabel}`);
      }
      if (cachedShowMonetization) {
        parts.push(
          formatMonetizationSummary(
            decision.observedYppSignals,
            decision.monetizationInspected,
          ),
        );
      }

      const textSpan = document.createElement('span');
      textSpan.className = 'ng-watch-bar-meta';
      textSpan.textContent = parts.join(' · ') || 'NoiseGate Channel Overview';
      left.appendChild(textSpan);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-watch-action-btn';
      btn.appendChild(createPhosphorSvg('tag', 13));
      btn.appendChild(document.createTextNode('Channel Controls'));
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openPopoverFor(btn, ref, decision!);
      });

      bar.appendChild(left);
      bar.appendChild(btn);

      if (!existingBar) {
        headerHost.insertAdjacentElement('afterend', bar);
      }
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
          // Ignore
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

        await processWatchPage();
        await processChannelPage();

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
          if (key && visibleChannelsMap.size < 18 && !visibleChannelsMap.has(key)) {
            visibleChannelsMap.set(key, {
              channelId: rec.ref.channelId,
              handle: rec.ref.handle,
              channelName:
                rec.ref.channelName || formatHandle(rec.ref.handle) || rec.ref.channelId || 'Channel',
              decision: d,
            });
          }
        }

        const visibleChannels = Array.from(visibleChannelsMap.values()).sort((a, b) => {
          const score = (act: ResolvedDecision['action']) =>
            act === 'hide' ? 4 : act === 'dim' ? 3 : act === 'label' ? 2 : act === 'allow' ? 1 : 0;
          return score(b.decision.action) - score(a.decision.action);
        });

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
        // Extension context may be reloading during dev
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
      const custom = evt as CustomEvent<WatchBridgeDetail>;
      if (custom.detail) {
        lastWatchBridgeInfo = custom.detail;
        scheduleScan(false, 120);
      }
    });

    document.addEventListener('noisegate:channel-info', (evt: Event) => {
      const custom = evt as CustomEvent<ChannelBridgeDetail>;
      if (custom.detail) {
        lastChannelBridgeInfo = custom.detail;
        scheduleScan(false, 120);
      }
    });

    window.addEventListener('yt-navigate-finish', () => {
      popover.close();
      lastWatchBridgeInfo = null;
      lastChannelBridgeInfo = null;
      scheduleScan(true, 180);
      window.setTimeout(() => scheduleScan(false, 50), 900);
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
                node.classList.contains('ng-signal-line') ||
                node.classList.contains('ng-card-trigger') ||
                node.classList.contains('ng-watch-bar') ||
                node.classList.contains('ng-channel-bar') ||
                node.id === 'noisegate-popover-host'
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
