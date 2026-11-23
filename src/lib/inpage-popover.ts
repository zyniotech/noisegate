import { getCategoryMeta, SELECTABLE_CATEGORIES } from './categories';
import { formatHandle, isValidRepoSlug, sanitizeHttpUrl } from './normalize';
import { createPhosphorSvg } from './phosphor-svg';
import {
  DEFAULT_CORRECTION_ISSUE_URL,
  DEFAULT_SUBMISSION_ISSUE_URL,
} from './registry';
import {
  buildGitHubSubmissionUrl,
  formatMonetizationSummary,
  hasObservedYppSignals,
  TOPIC_LIST,
  TOPICS,
  YPP_SIGNAL_LABELS,
} from './taxonomy';
import type {
  CategoryId,
  ChannelRef,
  LocalRuleAction,
  ObservableSignalId,
  ResolvedDecision,
  TopicId,
} from './types';

export interface PopoverContext {
  anchor: HTMLElement;
  ref: ChannelRef;
  decision: ResolvedDecision;
  submissionRepo?: string;
  onSave: (payload: {
    ref: ChannelRef;
    action: LocalRuleAction;
    category: CategoryId;
    note?: string;
  }) => Promise<void>;
  onUpdateTopics: (ref: ChannelRef, topics: TopicId[] | undefined) => Promise<void>;
  onClear: (ref: ChannelRef) => Promise<void>;
}

const POPOVER_HOST_ID = 'noisegate-popover-host';

const POPOVER_CSS = `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  * {
    box-sizing: border-box;
  }

  button,
  input,
  select {
    font-family: inherit;
  }

  .ng-backdrop {
    position: fixed;
    inset: 0;
    pointer-events: auto;
    background: transparent;
  }

  .ng-panel {
    position: fixed;
    width: 348px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    border-radius: 10px;
    border: 1px solid var(--ng-border);
    background: var(--ng-bg-translucent);
    backdrop-filter: blur(18px) saturate(135%);
    -webkit-backdrop-filter: blur(18px) saturate(135%);
    color: var(--ng-fg);
    box-shadow:
      inset 0 1px 0 var(--ng-top-highlight),
      0 22px 48px -12px var(--ng-drop-shadow),
      0 4px 12px var(--ng-drop-shadow-sm);
    pointer-events: auto;
    transform-origin: var(--ng-origin, top right);
    animation: ng-enter 140ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
  }

  .ng-panel[data-closing="true"] {
    pointer-events: none;
    animation: ng-exit 100ms cubic-bezier(0.23, 1, 0.32, 1) forwards;
  }

  @keyframes ng-enter {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes ng-exit {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.97);
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .ng-panel {
      background: var(--ng-bg-solid);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
  }

  @media (prefers-contrast: more) {
    .ng-panel {
      background: var(--ng-bg-solid);
      border-color: var(--ng-border-focus);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ng-panel,
    .ng-panel[data-closing="true"] {
      animation: none !important;
      transition: none !important;
    }
  }

  .ng-panel[data-theme="dark"] {
    --ng-bg-solid: #0f1218;
    --ng-bg-translucent: rgba(15, 18, 26, 0.96);
    --ng-bg-subtle: rgba(255, 255, 255, 0.045);
    --ng-bg-hover: rgba(255, 255, 255, 0.095);
    --ng-segment-track: rgba(7, 9, 13, 0.72);
    --ng-segment-active: #1f2737;
    --ng-border: rgba(255, 255, 255, 0.13);
    --ng-border-subtle: rgba(255, 255, 255, 0.08);
    --ng-top-highlight: rgba(255, 255, 255, 0.09);
    --ng-border-focus: rgba(248, 250, 252, 0.72);
    --ng-drop-shadow: rgba(0, 0, 0, 0.65);
    --ng-drop-shadow-sm: rgba(0, 0, 0, 0.32);
    --ng-fg: #f3f4f6;
    --ng-fg-muted: #b6c2d2;
    --ng-fg-dim: #9aa7b8;
    --ng-link: #cbd5e1;
    --ng-danger: #f87171;
    --ng-positive: #34d399;
    --ng-positive-bg: rgba(16, 185, 129, 0.13);
    --ng-positive-border: rgba(52, 211, 153, 0.30);
    --ng-input-bg: #131823;
  }

  .ng-panel[data-theme="light"] {
    --ng-bg-solid: #ffffff;
    --ng-bg-translucent: rgba(255, 255, 255, 0.97);
    --ng-bg-subtle: #f4f6f9;
    --ng-bg-hover: #e2e8f0;
    --ng-segment-track: #edf1f5;
    --ng-segment-active: #ffffff;
    --ng-border: rgba(15, 23, 42, 0.14);
    --ng-border-subtle: rgba(15, 23, 42, 0.08);
    --ng-top-highlight: rgba(255, 255, 255, 0.9);
    --ng-border-focus: rgba(15, 23, 42, 0.65);
    --ng-drop-shadow: rgba(15, 23, 42, 0.18);
    --ng-drop-shadow-sm: rgba(15, 23, 42, 0.08);
    --ng-fg: #0f172a;
    --ng-fg-muted: #475569;
    --ng-fg-dim: #526075;
    --ng-link: #1e293b;
    --ng-danger: #b91c1c;
    --ng-positive: #065f46;
    --ng-positive-bg: rgba(4, 120, 87, 0.09);
    --ng-positive-border: rgba(4, 120, 87, 0.28);
    --ng-input-bg: #ffffff;
  }

  .ng-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--ng-border);
  }

  .ng-title-group {
    min-width: 0;
    flex: 1;
  }

  .ng-title-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .ng-channel-name {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-state-tag {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    border: 1px solid var(--ng-border);
    border-left: 2px solid var(--state-accent, var(--ng-fg-muted));
    background: var(--ng-bg-subtle);
    color: var(--ng-fg);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
  }

  .ng-channel-meta {
    margin-top: 3px;
    font-size: 11px;
    color: var(--ng-fg-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-close-btn {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--ng-fg-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, border-color 110ms ease, transform 90ms ease-out;
  }

  .ng-close-btn:hover {
    background: var(--ng-bg-hover);
    border-color: var(--ng-border-subtle);
    color: var(--ng-fg);
  }

  .ng-close-btn:active {
    transform: scale(0.93);
  }

  .ng-close-btn:focus-visible,
  .ng-profile-topic-select:focus-visible,
  .ng-clear-btn:focus-visible,
  .ng-evidence-link:focus-visible,
  .ng-community-link:focus-visible,
  .ng-seg-btn:focus-visible {
    outline: 2px solid var(--ng-border-focus);
    outline-offset: 1px;
  }

  .ng-body {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .ng-group-box {
    border: 1px solid var(--ng-border);
    border-radius: 7px;
    background: var(--ng-bg-subtle);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .ng-profile-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11.5px;
    line-height: 1.35;
  }

  .ng-profile-left {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ng-fg);
    font-weight: 500;
    min-width: 0;
  }

  .ng-profile-left svg {
    color: var(--ng-fg-muted);
  }

  .ng-profile-left span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-profile-topic-select {
    height: 26px;
    padding: 0 7px;
    border-radius: 5px;
    border: 1px solid var(--ng-border);
    background: var(--ng-input-bg);
    color: var(--ng-fg);
    font-size: 11.5px;
    max-width: 156px;
  }

  .ng-signals {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--ng-border-subtle);
  }

  .ng-signal-item {
    border-left: 2px solid var(--item-accent, #94a3b8);
    padding: 3px 0 3px 9px;
    font-size: 11.5px;
    line-height: 1.4;
  }

  .ng-signal-head {
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 600;
    color: var(--ng-fg);
  }

  .ng-signal-source {
    color: var(--ng-fg-muted);
    font-weight: 400;
  }

  .ng-signal-note {
    margin-top: 2px;
    color: var(--ng-fg-muted);
  }

  .ng-evidence-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 3px;
    color: var(--ng-link);
    text-decoration: none;
    font-size: 11px;
    font-weight: 500;
    border-radius: 4px;
  }

  .ng-evidence-link:hover {
    color: var(--ng-fg);
    text-decoration: underline;
  }

  .ng-monetization-box {
    border: 1px solid var(--ng-border);
    border-radius: 7px;
    background: var(--ng-bg-subtle);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .ng-monetization-box.is-positive {
    border-color: var(--ng-positive-border);
    background: var(--ng-positive-bg);
  }

  .ng-monetization-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--ng-fg);
  }

  .ng-monetization-box.is-positive .ng-monetization-head {
    color: var(--ng-positive);
  }

  .ng-monetization-sub {
    font-size: 11px;
    line-height: 1.35;
    color: var(--ng-fg-muted);
  }

  .ng-ypp-features {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .ng-ypp-feature-tag {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    border-radius: 4px;
    border: 1px solid var(--ng-positive-border);
    background: var(--ng-bg-solid);
    color: var(--ng-positive);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1;
  }

  .ng-promo-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
    padding-top: 5px;
    border-top: 1px solid var(--ng-border-subtle);
    font-size: 11px;
    color: var(--ng-fg-muted);
  }

  .ng-section-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .ng-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ng-fg-dim);
  }

  .ng-kbd-hint {
    font-size: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    color: var(--ng-fg-dim);
  }

  .ng-segmented-bar {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 2px;
    padding: 3px;
    border-radius: 7px;
    border: 1px solid var(--ng-border);
    background: var(--ng-segment-track);
  }

  .ng-seg-btn {
    appearance: none;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--ng-fg-muted);
    padding: 7px 2px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 110ms cubic-bezier(0.23, 1, 0.32, 1), border-color 110ms cubic-bezier(0.23, 1, 0.32, 1), color 110ms cubic-bezier(0.23, 1, 0.32, 1), transform 90ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .ng-seg-btn:hover:not(:disabled) {
    background: var(--ng-bg-hover);
    color: var(--ng-fg);
  }

  .ng-seg-btn:disabled,
  .ng-clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ng-seg-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ng-seg-btn[data-active="true"] {
    border-color: var(--btn-accent, var(--ng-border));
    background: var(--ng-segment-active);
    color: var(--btn-accent-fg, var(--ng-fg));
    font-weight: 600;
    box-shadow: inset 0 1px 0 var(--ng-top-highlight), 0 1px 2px var(--ng-drop-shadow-sm);
  }

  .ng-field-group {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .ng-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ng-field-label {
    font-size: 10.5px;
    font-weight: 500;
    color: var(--ng-fg-muted);
  }

  .ng-select,
  .ng-input {
    width: 100%;
    height: 31px;
    padding: 0 9px;
    border-radius: 6px;
    border: 1px solid var(--ng-border);
    background: var(--ng-input-bg);
    color: var(--ng-fg);
    font-size: 12px;
    outline: none;
    transition: border-color 120ms ease;
  }

  .ng-input::placeholder {
    color: var(--ng-fg-dim);
    opacity: 1;
  }

  .ng-select:focus,
  .ng-input:focus {
    border-color: var(--ng-border-focus);
  }

  .ng-community-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--ng-border);
    font-size: 11px;
    flex-wrap: wrap;
  }

  .ng-community-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ng-link);
    text-decoration: none;
    font-weight: 500;
    border-radius: 4px;
    transition: color 100ms ease;
  }

  .ng-community-link:hover {
    color: var(--ng-fg);
    text-decoration: underline;
  }

  .ng-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--ng-border);
  }

  .ng-status-text {
    font-size: 11px;
    color: var(--ng-fg-muted);
  }

  .ng-clear-btn {
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ng-danger);
    font-size: 11.5px;
    font-weight: 500;
    padding: 4px 7px;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 110ms ease, transform 90ms ease-out;
  }

  .ng-clear-btn:hover:not(:disabled) {
    background: var(--ng-bg-hover);
  }

  .ng-clear-btn:active:not(:disabled) {
    transform: scale(0.96);
  }
`;

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

export class InPagePopoverManager {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private scrollHandler: ((e: Event) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private fullscreenHandler: (() => void) | null = null;
  private closeTimer: number | null = null;
  private lastAnchor: HTMLElement | null = null;
  private openToken = 0;

  private getMountRoot(): HTMLElement {
    if (document.fullscreenElement instanceof HTMLElement) {
      return document.fullscreenElement;
    }
    return document.body || document.documentElement;
  }

  private ensureHost(): ShadowRoot {
    const mountRoot = this.getMountRoot();
    if (this.host && this.shadow && this.host.parentElement === mountRoot) {
      return this.shadow;
    }

    const existing = document.getElementById(POPOVER_HOST_ID);
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = POPOVER_HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = POPOVER_CSS;
    shadow.appendChild(style);

    mountRoot.appendChild(host);
    this.host = host;
    this.shadow = shadow;
    return shadow;
  }

  private removeListeners(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, true);
      this.scrollHandler = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.fullscreenHandler) {
      document.removeEventListener('fullscreenchange', this.fullscreenHandler);
      this.fullscreenHandler = null;
    }
  }

  private clearDomImmediate(): void {
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.removeListeners();
    if (this.shadow) {
      const style = this.shadow.querySelector('style');
      this.shadow.replaceChildren();
      if (style) this.shadow.appendChild(style);
    }
  }

  public close(restoreFocus = false): void {
    this.openToken++;
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.removeListeners();

    const anchorToRestore = restoreFocus ? this.lastAnchor : null;
    this.lastAnchor = null;

    const panel = this.shadow?.querySelector<HTMLElement>('.ng-panel');
    if (!panel) {
      this.clearDomImmediate();
      if (anchorToRestore && anchorToRestore.isConnected) {
        anchorToRestore.focus();
      }
      return;
    }
    panel.dataset.closing = 'true';
    this.closeTimer = window.setTimeout(() => {
      this.clearDomImmediate();
      if (anchorToRestore && anchorToRestore.isConnected) {
        anchorToRestore.focus();
      }
    }, 105);
  }

  public open(ctx: PopoverContext): void {
    this.clearDomImmediate();
    const myToken = ++this.openToken;
    this.lastAnchor = ctx.anchor;

    const shadow = this.ensureHost();
    const isDark = detectYouTubeDarkMode();

    const backdrop = document.createElement('div');
    backdrop.className = 'ng-backdrop';
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close(false);
    });

    const panel = document.createElement('div');
    panel.className = 'ng-panel';
    panel.dataset.theme = isDark ? 'dark' : 'light';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'NoiseGate Channel Controls');
    panel.tabIndex = -1;
    panel.addEventListener('click', (e) => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'ng-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'ng-title-group';

    const titleRow = document.createElement('div');
    titleRow.className = 'ng-title-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'ng-channel-name';
    nameEl.textContent =
      ctx.ref.channelName ||
      formatHandle(ctx.ref.handle) ||
      ctx.ref.channelId ||
      'YouTube Channel';
    titleRow.appendChild(nameEl);

    if (ctx.decision.action !== 'none') {
      const stateTag = document.createElement('span');
      stateTag.className = 'ng-state-tag';
      const stateAccent =
        ctx.decision.action === 'allow'
          ? isDark
            ? '#34d399'
            : '#065f46'
          : getCategoryMeta(ctx.decision.category).accentColor;
      stateTag.style.setProperty('--state-accent', stateAccent);
      stateTag.textContent =
        ctx.decision.action === 'allow' ? 'Trusted' : ctx.decision.primaryLabel;
      titleRow.appendChild(stateTag);
    }

    const metaParts: string[] = [];
    const dispHandle = formatHandle(ctx.ref.handle);
    if (dispHandle) metaParts.push(dispHandle);
    if (ctx.ref.channelId) metaParts.push(ctx.ref.channelId);

    const metaEl = document.createElement('div');
    metaEl.className = 'ng-channel-meta';
    metaEl.textContent = metaParts.join(' · ') || 'Channel ID pending';

    titleGroup.appendChild(titleRow);
    titleGroup.appendChild(metaEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ng-close-btn';
    closeBtn.title = 'Close (Esc)';
    closeBtn.setAttribute('aria-label', 'Close channel menu');
    closeBtn.appendChild(createPhosphorSvg('x', 14));
    closeBtn.addEventListener('click', () => this.close(true));

    header.appendChild(titleGroup);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'ng-body';

    const statusGroup = document.createElement('div');
    statusGroup.className = 'ng-group-box';

    const topicRow = document.createElement('div');
    topicRow.className = 'ng-profile-row';
    const topicLeft = document.createElement('div');
    topicLeft.className = 'ng-profile-left';
    topicLeft.appendChild(createPhosphorSvg('television', 13));
    const topicTxt = document.createElement('span');
    topicTxt.textContent = ctx.decision.rawYouTubeCategory
      ? `Topic (${ctx.decision.rawYouTubeCategory})`
      : 'Channel Topic';
    topicLeft.appendChild(topicTxt);

    const topicSelect = document.createElement('select');
    topicSelect.className = 'ng-profile-topic-select';
    topicSelect.setAttribute('aria-label', 'Assign channel topic locally');

    const autoOpt = document.createElement('option');
    autoOpt.value = '';
    const autoLabel = ctx.decision.topics[0]
      ? `Auto (${TOPICS[ctx.decision.topics[0]]?.shortLabel ?? ctx.decision.topics[0]})`
      : 'Auto / None';
    autoOpt.textContent = autoLabel;
    topicSelect.appendChild(autoOpt);

    const currentTopic = ctx.decision.topics[0] ?? '';
    for (const topic of TOPIC_LIST) {
      const opt = document.createElement('option');
      opt.value = topic.id;
      opt.textContent = topic.label;
      if (topic.id === currentTopic) opt.selected = true;
      topicSelect.appendChild(opt);
    }

    topicRow.appendChild(topicLeft);
    topicRow.appendChild(topicSelect);
    statusGroup.appendChild(topicRow);

    if (
      ctx.decision.listMatches.length > 0 ||
      ctx.decision.hasOfficialDisclosure
    ) {
      const signalsWrap = document.createElement('div');
      signalsWrap.className = 'ng-signals';

      if (ctx.decision.hasOfficialDisclosure) {
        const item = document.createElement('div');
        item.className = 'ng-signal-item';
        item.style.setProperty('--item-accent', isDark ? '#38bdf8' : '#0284c7');

        const head = document.createElement('div');
        head.className = 'ng-signal-head';
        head.appendChild(createPhosphorSvg('sparkle', 13));
        const txt = document.createElement('span');
        txt.textContent =
          ctx.decision.disclosureVideoCount > 1
            ? `Official YT Synthetic Disclosure (${ctx.decision.disclosureVideoCount} videos)`
            : 'Official YT Synthetic Disclosure';
        head.appendChild(txt);
        item.appendChild(head);
        signalsWrap.appendChild(item);
      }

      for (const match of ctx.decision.listMatches) {
        const meta = getCategoryMeta(match.category);
        const item = document.createElement('div');
        item.className = 'ng-signal-item';
        item.style.setProperty('--item-accent', meta.accentColor);

        const head = document.createElement('div');
        head.className = 'ng-signal-head';
        head.appendChild(createPhosphorSvg(meta.icon, 13));
        const labelSpan = document.createElement('span');
        labelSpan.textContent = meta.shortLabel;
        const srcSpan = document.createElement('span');
        srcSpan.className = 'ng-signal-source';
        srcSpan.textContent = `· ${match.listName} (${match.action === 'pass' ? 'meta' : match.action})`;
        head.appendChild(labelSpan);
        head.appendChild(srcSpan);
        item.appendChild(head);

        if (match.note) {
          const noteEl = document.createElement('div');
          noteEl.className = 'ng-signal-note';
          noteEl.textContent = match.note;
          item.appendChild(noteEl);
        }

        const safeEvidence = sanitizeHttpUrl(match.evidenceUrl);
        if (safeEvidence) {
          const link = document.createElement('a');
          link.className = 'ng-evidence-link';
          link.href = safeEvidence;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.appendChild(createPhosphorSvg('arrow-square-out', 12));
          link.appendChild(document.createTextNode('View source evidence'));
          item.appendChild(link);
        }

        signalsWrap.appendChild(item);
      }

      if (signalsWrap.childElementCount > 0) {
        statusGroup.appendChild(signalsWrap);
      }
    }

    body.appendChild(statusGroup);

    const hasYpp = hasObservedYppSignals(ctx.decision.observedYppSignals);
    const monetizeBox = document.createElement('div');
    monetizeBox.className = hasYpp ? 'ng-monetization-box is-positive' : 'ng-monetization-box';

    const monetizeHead = document.createElement('div');
    monetizeHead.className = 'ng-monetization-head';
    monetizeHead.appendChild(createPhosphorSvg('currency-circle-dollar', 14));
    const monetizeTitle = document.createElement('span');
    monetizeTitle.textContent = formatMonetizationSummary(
      ctx.decision.observedYppSignals,
      ctx.decision.monetizationInspected,
    );
    monetizeHead.appendChild(monetizeTitle);
    monetizeBox.appendChild(monetizeHead);

    if (hasYpp) {
      const featuresRow = document.createElement('div');
      featuresRow.className = 'ng-ypp-features';
      for (const sig of ctx.decision.observedYppSignals) {
        const tag = document.createElement('span');
        tag.className = 'ng-ypp-feature-tag';
        tag.textContent = YPP_SIGNAL_LABELS[sig] ?? sig;
        featuresRow.appendChild(tag);
      }
      monetizeBox.appendChild(featuresRow);
    } else {
      const monetizeSub = document.createElement('div');
      monetizeSub.className = 'ng-monetization-sub';
      monetizeSub.textContent = ctx.decision.monetizationInspected
        ? 'YPP features not shown on this view'
        : 'Open a Watch or Channel page to inspect YPP features';
      monetizeBox.appendChild(monetizeSub);
    }

    if (ctx.decision.hasPaidPromotion) {
      const promoRow = document.createElement('div');
      promoRow.className = 'ng-promo-row';
      promoRow.appendChild(createPhosphorSvg('megaphone', 13));
      const promoTxt = document.createElement('span');
      promoTxt.textContent = 'Paid promotion disclosed by creator';
      promoRow.appendChild(promoTxt);
      monetizeBox.appendChild(promoRow);
    }

    body.appendChild(monetizeBox);

    const defaultCategory: CategoryId =
      ctx.decision.origin === 'local' &&
      SELECTABLE_CATEGORIES.some((c) => c.id === ctx.decision.category)
        ? (ctx.decision.category as CategoryId)
        : 'ai-synthetic';

    const fieldGroup = document.createElement('div');
    fieldGroup.className = 'ng-field-group';

    const catField = document.createElement('div');
    catField.className = 'ng-field';
    const catLabel = document.createElement('label');
    catLabel.className = 'ng-field-label';
    catLabel.htmlFor = 'ng-pop-category';
    catLabel.textContent = 'Rule category';
    const catSelect = document.createElement('select');
    catSelect.id = 'ng-pop-category';
    catSelect.className = 'ng-select';
    for (const cat of SELECTABLE_CATEGORIES) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      if (cat.id === defaultCategory) opt.selected = true;
      catSelect.appendChild(opt);
    }
    catField.appendChild(catLabel);
    catField.appendChild(catSelect);

    const noteField = document.createElement('div');
    noteField.className = 'ng-field';
    const noteLabel = document.createElement('label');
    noteLabel.className = 'ng-field-label';
    noteLabel.htmlFor = 'ng-pop-note';
    noteLabel.textContent = 'Local note';
    const noteInput = document.createElement('input');
    noteInput.id = 'ng-pop-note';
    noteInput.type = 'text';
    noteInput.className = 'ng-input';
    noteInput.placeholder = 'Optional note stored locally';
    noteInput.maxLength = 180;
    noteInput.value = ctx.decision.origin === 'local' ? ctx.decision.note ?? '' : '';
    noteField.appendChild(noteLabel);
    noteField.appendChild(noteInput);

    fieldGroup.appendChild(catField);
    fieldGroup.appendChild(noteField);

    const actionsSection = document.createElement('div');
    const secRow = document.createElement('div');
    secRow.className = 'ng-section-row';
    const secLabel = document.createElement('div');
    secLabel.className = 'ng-section-label';
    secLabel.textContent = '1-Click Local Rule';
    const kbdHint = document.createElement('div');
    kbdHint.className = 'ng-kbd-hint';
    kbdHint.textContent = '0-4 · Esc';
    secRow.appendChild(secLabel);
    secRow.appendChild(kbdHint);
    actionsSection.appendChild(secRow);

    const segmentedBar = document.createElement('div');
    segmentedBar.className = 'ng-segmented-bar';
    segmentedBar.setAttribute('role', 'group');
    segmentedBar.setAttribute('aria-label', '1-Click Local Rule');

    const statusText = document.createElement('span');
    statusText.className = 'ng-status-text';
    statusText.textContent =
      ctx.decision.origin === 'local'
        ? `Local rule active (${ctx.decision.action === 'allow' ? 'Trust' : ctx.decision.action})`
        : 'Local rules always override lists';

    const currentLocalAction =
      ctx.decision.origin === 'local' ? ctx.decision.action : undefined;

    let isSubmitting = false;
    const actionButtons: HTMLButtonElement[] = [];
    let clearBtn: HTMLButtonElement | null = null;

    const setBusyState = (busy: boolean) => {
      isSubmitting = busy;
      for (const b of actionButtons) b.disabled = busy;
      if (clearBtn) clearBtn.disabled = busy;
    };

    const triggerSave = async (action: LocalRuleAction) => {
      if (isSubmitting) return;
      setBusyState(true);
      statusText.textContent = 'Saving...';
      try {
        const chosenCat: CategoryId =
          action === 'allow'
            ? 'verified-independent'
            : (catSelect.value as CategoryId);
        await ctx.onSave({
          ref: ctx.ref,
          action,
          category: chosenCat,
          note: noteInput.value.trim() || undefined,
        });
        if (this.openToken === myToken) {
          this.close(true);
        }
      } catch {
        if (this.openToken === myToken) {
          statusText.textContent = 'Could not save rule';
          setBusyState(false);
        }
      }
    };

    const triggerClear = async () => {
      if (isSubmitting) return;
      if (ctx.decision.origin !== 'local') {
        if (ctx.decision.action === 'none') {
          this.close(true);
        } else {
          statusText.textContent = 'Active via list or signal; choose Trust to override';
        }
        return;
      }
      setBusyState(true);
      statusText.textContent = 'Removing...';
      try {
        await ctx.onClear(ctx.ref);
        if (this.openToken === myToken) {
          this.close(true);
        }
      } catch {
        if (this.openToken === myToken) {
          statusText.textContent = 'Could not remove rule';
          setBusyState(false);
        }
      }
    };

    const segmentDefs: Array<{
      id: 'pass' | LocalRuleAction;
      label: string;
      icon: 'check' | 'tag' | 'eye-slash' | 'prohibit' | 'shield-check';
      accentDark: string;
      accentLight: string;
    }> = [
      { id: 'pass', label: 'Pass', icon: 'check', accentDark: '#e2e8f0', accentLight: '#0f172a' },
      { id: 'label', label: 'Label', icon: 'tag', accentDark: '#fbbf24', accentLight: '#b45309' },
      { id: 'dim', label: 'Dim', icon: 'eye-slash', accentDark: '#fb923c', accentLight: '#c2410c' },
      { id: 'hide', label: 'Hide', icon: 'prohibit', accentDark: '#f87171', accentLight: '#b91c1c' },
      { id: 'allow', label: 'Trust', icon: 'shield-check', accentDark: '#34d399', accentLight: '#065f46' },
    ];

    for (const def of segmentDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-seg-btn';
      btn.style.setProperty('--btn-accent', isDark ? def.accentDark : def.accentLight);
      btn.style.setProperty('--btn-accent-fg', isDark ? def.accentDark : def.accentLight);

      const isActive =
        def.id === 'pass'
          ? ctx.decision.origin !== 'local' && ctx.decision.action === 'none'
          : currentLocalAction === def.id;

      if (isActive) {
        btn.dataset.active = 'true';
      }
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.appendChild(createPhosphorSvg(def.icon, 15));
      const span = document.createElement('span');
      span.textContent = def.label;
      btn.appendChild(span);

      if (def.id === 'pass') {
        btn.addEventListener('click', () => void triggerClear());
      } else {
        const localAction = def.id;
        btn.addEventListener('click', () => void triggerSave(localAction));
      }
      actionButtons.push(btn);
      segmentedBar.appendChild(btn);
    }

    actionsSection.appendChild(segmentedBar);
    body.appendChild(actionsSection);
    body.appendChild(fieldGroup);

    const allObservableSignals: ObservableSignalId[] = [...ctx.decision.observedYppSignals];
    if (ctx.decision.hasPaidPromotion) {
      allObservableSignals.push('yt-paid-promotion');
    }
    if (ctx.decision.hasOfficialDisclosure) {
      allObservableSignals.push('yt-synthetic-disclosure');
    }

    const firstListSubmission = ctx.decision.listMatches.find((m) => m.submissionUrl)?.submissionUrl;
    const firstListRemoval = ctx.decision.listMatches.find((m) => m.removalUrl)?.removalUrl;
    const hasConfiguredSlug = isValidRepoSlug(ctx.submissionRepo);
    const repoBase = hasConfiguredSlug
      ? `https://github.com/${ctx.submissionRepo!.trim()}/issues/new?template=channel-entry.yml`
      : DEFAULT_SUBMISSION_ISSUE_URL;
    const correctionBase = hasConfiguredSlug
      ? `https://github.com/${ctx.submissionRepo!.trim()}/issues/new?template=correction.yml`
      : DEFAULT_CORRECTION_ISSUE_URL;

    let suggestLink: HTMLAnchorElement | null = null;
    const computeSuggestHref = (activeTopics: TopicId[]) =>
      buildGitHubSubmissionUrl(firstListSubmission ?? repoBase, ctx.ref, {
        topics: activeTopics,
        yppSignals: allObservableSignals,
        rawYouTubeCategory: ctx.decision.rawYouTubeCategory,
        template: 'channel-entry.yml',
      });

    const suggestHref = computeSuggestHref(ctx.decision.topics);

    const correctionTarget =
      firstListRemoval ??
      (ctx.decision.listMatches.some((m) => m.submissionUrl)
        ? correctionBase
        : undefined);

    const correctionHref = correctionTarget
      ? buildGitHubSubmissionUrl(correctionTarget, ctx.ref, {
          topics: ctx.decision.topics,
          yppSignals: allObservableSignals,
          template: 'correction.yml',
        })
      : undefined;

    if (suggestHref) {
      const commRow = document.createElement('div');
      commRow.className = 'ng-community-row';

      suggestLink = document.createElement('a');
      suggestLink.className = 'ng-community-link';
      suggestLink.href = suggestHref;
      suggestLink.target = '_blank';
      suggestLink.rel = 'noopener noreferrer';
      suggestLink.appendChild(createPhosphorSvg('git-branch', 12));
      suggestLink.appendChild(document.createTextNode('Suggest metadata on GitHub'));
      commRow.appendChild(suggestLink);

      if (correctionHref && ctx.decision.listMatches.length > 0) {
        const corrLink = document.createElement('a');
        corrLink.className = 'ng-community-link';
        corrLink.href = correctionHref;
        corrLink.target = '_blank';
        corrLink.rel = 'noopener noreferrer';
        corrLink.appendChild(document.createTextNode('Request correction'));
        commRow.appendChild(corrLink);
      }

      body.appendChild(commRow);
    }

    topicSelect.addEventListener('change', async () => {
      const val = topicSelect.value as TopicId | '';
      const nextTopics: TopicId[] | undefined = val ? [val] : undefined;
      topicSelect.disabled = true;
      statusText.textContent = 'Updating topic...';
      try {
        await ctx.onUpdateTopics(ctx.ref, nextTopics);
        if (this.openToken === myToken) {
          if (val && Object.hasOwn(TOPICS, val)) {
            autoOpt.textContent = `Auto (${TOPICS[val].shortLabel})`;
          }
          if (suggestLink) {
            const updatedHref = computeSuggestHref(nextTopics ?? ctx.decision.topics);
            if (updatedHref) suggestLink.href = updatedHref;
          }
          statusText.textContent = val ? 'Topic set locally' : 'Topic set to auto';
        }
      } catch {
        if (this.openToken === myToken) {
          statusText.textContent = 'Could not update topic';
        }
      } finally {
        if (this.openToken === myToken) {
          topicSelect.disabled = false;
        }
      }
    });

    const footer = document.createElement('div');
    footer.className = 'ng-footer';
    footer.appendChild(statusText);

    if (ctx.decision.origin === 'local') {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ng-clear-btn';
      clearBtn.textContent = 'Remove rule';
      clearBtn.addEventListener('click', () => void triggerClear());
      footer.appendChild(clearBtn);
    }

    body.appendChild(footer);
    panel.appendChild(body);

    panel.style.visibility = 'hidden';
    shadow.appendChild(backdrop);
    shadow.appendChild(panel);

    const rect = ctx.anchor.getBoundingClientRect();
    const measured = panel.getBoundingClientRect();
    const panelWidth = Math.max(260, measured.width || 348);
    const panelHeight = Math.max(200, measured.height || 380);

    let originX: 'left' | 'right' = 'right';
    let left = rect.right - panelWidth;
    if (left < 12) {
      left = Math.max(12, rect.left);
      originX = 'left';
    }
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelWidth - 12);
      originX = 'right';
    }

    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 18);
    const spaceAbove = Math.max(0, rect.top - 18);

    let originY: 'top' | 'bottom' = 'top';
    let top: number;
    let maxHeight: number;

    if (panelHeight <= spaceBelow || spaceBelow >= spaceAbove) {
      originY = 'top';
      top = Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - Math.min(panelHeight, window.innerHeight - 24) - 12));
      maxHeight = Math.max(180, window.innerHeight - top - 12);
    } else {
      originY = 'bottom';
      const usedHeight = Math.min(panelHeight, spaceAbove);
      top = Math.max(12, rect.top - usedHeight - 6);
      maxHeight = Math.max(180, rect.top - top - 6);
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.maxHeight = `${Math.round(maxHeight)}px`;
    panel.style.setProperty('--ng-origin', `${originY} ${originX}`);
    panel.style.visibility = '';

    closeBtn.focus();

    this.scrollHandler = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (panel.contains(target) || shadow.contains(target))) {
        return;
      }
      this.close(false);
    };
    window.addEventListener('scroll', this.scrollHandler, true);

    this.resizeHandler = () => {
      this.close(false);
    };
    window.addEventListener('resize', this.resizeHandler);

    this.fullscreenHandler = () => {
      this.close(false);
    };
    document.addEventListener('fullscreenchange', this.fullscreenHandler);

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        return;
      }

      if (e.key === 'Tab') {
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]',
          ),
        );
        if (focusables.length > 0) {
          const first = focusables[0]!;
          const last = focusables[focusables.length - 1]!;
          const active = shadow.activeElement;
          if (e.shiftKey) {
            if (!active || active === first || !panel.contains(active)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (!active || active === last || !panel.contains(active)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const activeInShadow = shadow.activeElement;
      if (
        activeInShadow instanceof HTMLInputElement ||
        activeInShadow instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        e.stopPropagation();
        void triggerClear();
        return;
      }
      const keyMap: Record<string, LocalRuleAction> = {
        '1': 'label',
        '2': 'dim',
        '3': 'hide',
        '4': 'allow',
      };
      const mapped = keyMap[e.key];
      if (mapped) {
        e.preventDefault();
        e.stopPropagation();
        void triggerSave(mapped);
      }
    };
    window.addEventListener('keydown', this.keydownHandler, true);
  }
}
