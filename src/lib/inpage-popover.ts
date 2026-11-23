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
  TOPIC_LIST,
  TOPICS,
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
    width: 332px;
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
      0 22px 48px -12px rgba(0, 0, 0, 0.62),
      0 4px 12px rgba(0, 0, 0, 0.28);
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

  @media (prefers-reduced-motion: reduce) {
    .ng-panel,
    .ng-panel[data-closing="true"] {
      animation: none !important;
      transition: none !important;
    }
  }

  .ng-panel[data-theme="dark"] {
    --ng-bg-solid: #0f1218;
    --ng-bg-translucent: rgba(14, 17, 24, 0.96);
    --ng-bg-subtle: rgba(24, 29, 39, 0.9);
    --ng-bg-hover: rgba(36, 43, 57, 0.96);
    --ng-border: rgba(255, 255, 255, 0.13);
    --ng-top-highlight: rgba(255, 255, 255, 0.09);
    --ng-border-focus: rgba(248, 250, 252, 0.62);
    --ng-fg: #f3f4f6;
    --ng-fg-muted: #94a3b8;
    --ng-fg-dim: #94a3b8;
    --ng-link: #cbd5e1;
    --ng-danger: #f87171;
  }

  .ng-panel[data-theme="light"] {
    --ng-bg-solid: #ffffff;
    --ng-bg-translucent: rgba(255, 255, 255, 0.97);
    --ng-bg-subtle: #f4f5f7;
    --ng-bg-hover: #e5e9f0;
    --ng-border: rgba(15, 23, 42, 0.14);
    --ng-top-highlight: rgba(255, 255, 255, 0.8);
    --ng-border-focus: rgba(15, 23, 42, 0.56);
    --ng-fg: #0f172a;
    --ng-fg-muted: #475569;
    --ng-fg-dim: #475569;
    --ng-link: #1e293b;
    --ng-danger: #b91c1c;
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
  }

  .ng-channel-name {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-channel-meta {
    margin-top: 2px;
    font-size: 11px;
    color: var(--ng-fg-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-close-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--ng-fg-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 110ms ease, color 110ms ease, transform 90ms ease-out;
  }

  .ng-close-btn:hover {
    background: var(--ng-bg-hover);
    color: var(--ng-fg);
  }

  .ng-close-btn:active {
    transform: scale(0.93);
  }

  .ng-close-btn:focus-visible,
  .ng-profile-topic-select:focus-visible,
  .ng-clear-btn:focus-visible,
  .ng-evidence-link:focus-visible,
  .ng-community-link:focus-visible {
    outline: 2px solid var(--ng-border-focus);
    outline-offset: 1px;
  }

  .ng-body {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  .ng-profile-box {
    border: 1px solid var(--ng-border);
    border-radius: 7px;
    background: var(--ng-bg-subtle);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    color: var(--ng-fg-muted);
    min-width: 0;
  }

  .ng-profile-left span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ng-profile-topic-select {
    height: 24px;
    padding: 0 6px;
    border-radius: 5px;
    border: 1px solid var(--ng-border);
    background: var(--ng-bg-solid);
    color: var(--ng-fg);
    font-size: 11px;
    max-width: 148px;
  }

  .ng-signals {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ng-signal-item {
    border-left: 2px solid var(--item-accent, #94a3b8);
    padding: 4px 0 4px 9px;
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

  .ng-actions-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .ng-action-btn {
    appearance: none;
    border: 1px solid var(--ng-border);
    border-radius: 7px;
    background: var(--ng-bg-subtle);
    color: var(--ng-fg);
    padding: 8px 4px;
    font-size: 11.5px;
    font-weight: 500;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    box-shadow: inset 0 1px 0 var(--ng-top-highlight);
    transition: background-color 110ms ease, border-color 110ms ease, color 110ms ease, transform 90ms ease-out;
  }

  .ng-action-btn:hover:not(:disabled) {
    background: var(--ng-bg-hover);
  }

  .ng-action-btn:disabled,
  .ng-clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ng-action-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ng-action-btn:focus-visible {
    outline: 2px solid var(--ng-border-focus);
    outline-offset: 1px;
  }

  .ng-action-btn[data-active="true"] {
    border-color: var(--btn-accent, #f8fafc);
    background: var(--ng-bg-hover);
    color: var(--btn-accent-fg, var(--btn-accent, #f8fafc));
  }

  .ng-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ng-select,
  .ng-input {
    width: 100%;
    height: 31px;
    padding: 0 9px;
    border-radius: 6px;
    border: 1px solid var(--ng-border);
    background: var(--ng-bg-subtle);
    color: var(--ng-fg);
    font-size: 12px;
    outline: none;
    transition: border-color 120ms ease;
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
    padding-top: 6px;
    border-top: 1px solid var(--ng-border);
    font-size: 11px;
    flex-wrap: wrap;
  }

  .ng-community-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ng-fg-muted);
    text-decoration: none;
    font-weight: 500;
    border-radius: 4px;
    transition: color 100ms ease;
  }

  .ng-community-link:hover {
    color: var(--ng-fg);
  }

  .ng-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid var(--ng-border);
  }

  .ng-status-text {
    font-size: 11px;
    color: var(--ng-fg-muted);
  }

  .ng-clear-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ng-danger);
    font-size: 11.5px;
    font-weight: 500;
    padding: 4px 6px;
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

    const hasYtApp = Boolean(document.querySelector('ytd-app'));
    const isDark = hasYtApp
      ? document.documentElement.hasAttribute('dark')
      : window.matchMedia('(prefers-color-scheme: dark)').matches;

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

    const nameEl = document.createElement('div');
    nameEl.className = 'ng-channel-name';
    nameEl.textContent =
      ctx.ref.channelName ||
      formatHandle(ctx.ref.handle) ||
      ctx.ref.channelId ||
      'YouTube Channel';

    const metaParts: string[] = [];
    const dispHandle = formatHandle(ctx.ref.handle);
    if (dispHandle) metaParts.push(dispHandle);
    if (ctx.ref.channelId) metaParts.push(ctx.ref.channelId);

    const metaEl = document.createElement('div');
    metaEl.className = 'ng-channel-meta';
    metaEl.textContent = metaParts.join(' · ') || 'Channel ID pending';

    titleGroup.appendChild(nameEl);
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

    const profileBox = document.createElement('div');
    profileBox.className = 'ng-profile-box';

    const monetizeRow = document.createElement('div');
    monetizeRow.className = 'ng-profile-row';
    const monetizeLeft = document.createElement('div');
    monetizeLeft.className = 'ng-profile-left';
    monetizeLeft.appendChild(createPhosphorSvg('currency-circle-dollar', 13));
    const monetizeText = document.createElement('span');
    monetizeText.textContent = formatMonetizationSummary(
      ctx.decision.observedYppSignals,
      ctx.decision.monetizationInspected,
    );
    monetizeLeft.appendChild(monetizeText);
    monetizeRow.appendChild(monetizeLeft);
    profileBox.appendChild(monetizeRow);

    if (ctx.decision.hasPaidPromotion) {
      const promoRow = document.createElement('div');
      promoRow.className = 'ng-profile-row';
      const promoLeft = document.createElement('div');
      promoLeft.className = 'ng-profile-left';
      promoLeft.appendChild(createPhosphorSvg('megaphone', 13));
      const promoTxt = document.createElement('span');
      promoTxt.textContent = 'Paid promotion disclosed by creator';
      promoLeft.appendChild(promoTxt);
      promoRow.appendChild(promoLeft);
      profileBox.appendChild(promoRow);
    }

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
    profileBox.appendChild(topicRow);

    body.appendChild(profileBox);

    if (
      ctx.decision.listMatches.length > 0 ||
      ctx.decision.hasOfficialDisclosure
    ) {
      const signalsWrap = document.createElement('div');
      signalsWrap.className = 'ng-signals';

      if (ctx.decision.hasOfficialDisclosure) {
        const item = document.createElement('div');
        item.className = 'ng-signal-item';
        item.style.setProperty('--item-accent', '#38bdf8');

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
        body.appendChild(signalsWrap);
      }
    }

    const defaultCategory: CategoryId =
      ctx.decision.origin === 'local' &&
      SELECTABLE_CATEGORIES.some((c) => c.id === ctx.decision.category)
        ? (ctx.decision.category as CategoryId)
        : 'ai-synthetic';

    const fieldWrap = document.createElement('div');
    fieldWrap.className = 'ng-field';

    const catSelect = document.createElement('select');
    catSelect.className = 'ng-select';
    catSelect.setAttribute('aria-label', 'Category');
    for (const cat of SELECTABLE_CATEGORIES) {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      if (cat.id === defaultCategory) opt.selected = true;
      catSelect.appendChild(opt);
    }

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'ng-input';
    noteInput.placeholder = 'Optional note (stored locally)...';
    noteInput.setAttribute('aria-label', 'Optional local note');
    noteInput.maxLength = 180;
    noteInput.value = ctx.decision.origin === 'local' ? ctx.decision.note ?? '' : '';

    fieldWrap.appendChild(catSelect);
    fieldWrap.appendChild(noteInput);

    const actionsSection = document.createElement('div');
    const secRow = document.createElement('div');
    secRow.className = 'ng-section-row';
    const secLabel = document.createElement('div');
    secLabel.className = 'ng-section-label';
    secLabel.textContent = '1-Click Local Action';
    const kbdHint = document.createElement('div');
    kbdHint.className = 'ng-kbd-hint';
    kbdHint.textContent = '1-4 · Esc';
    secRow.appendChild(secLabel);
    secRow.appendChild(kbdHint);
    actionsSection.appendChild(secRow);

    const grid = document.createElement('div');
    grid.className = 'ng-actions-grid';

    const statusText = document.createElement('span');
    statusText.className = 'ng-status-text';
    statusText.textContent =
      ctx.decision.origin === 'local'
        ? `Local rule active (${ctx.decision.action === 'allow' ? 'Trust' : ctx.decision.action})`
        : 'Local rules always override lists';

    const actionDefs: Array<{
      action: LocalRuleAction;
      label: string;
      icon: 'tag' | 'eye-slash' | 'prohibit' | 'shield-check';
      accentDark: string;
      accentLight: string;
    }> = [
      { action: 'label', label: 'Label', icon: 'tag', accentDark: '#fbbf24', accentLight: '#b45309' },
      { action: 'dim', label: 'Dim', icon: 'eye-slash', accentDark: '#fb923c', accentLight: '#c2410c' },
      { action: 'hide', label: 'Hide', icon: 'prohibit', accentDark: '#f87171', accentLight: '#b91c1c' },
      { action: 'allow', label: 'Trust', icon: 'shield-check', accentDark: '#34d399', accentLight: '#047857' },
    ];

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

    for (const def of actionDefs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-action-btn';
      btn.style.setProperty('--btn-accent', isDark ? def.accentDark : def.accentLight);
      btn.style.setProperty('--btn-accent-fg', isDark ? def.accentDark : def.accentLight);
      const isActive = currentLocalAction === def.action;
      if (isActive) {
        btn.dataset.active = 'true';
      }
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.appendChild(createPhosphorSvg(def.icon, 16));
      const span = document.createElement('span');
      span.textContent = def.label;
      btn.appendChild(span);

      btn.addEventListener('click', () => void triggerSave(def.action));
      actionButtons.push(btn);
      grid.appendChild(btn);
    }

    actionsSection.appendChild(grid);
    body.appendChild(actionsSection);
    body.appendChild(fieldWrap);

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
          statusText.textContent = val ? `Topic set locally` : 'Topic set to auto';
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
      clearBtn.addEventListener('click', async () => {
        if (isSubmitting) return;
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
      });
      footer.appendChild(clearBtn);
    }

    body.appendChild(footer);
    panel.appendChild(body);

    panel.style.visibility = 'hidden';
    shadow.appendChild(backdrop);
    shadow.appendChild(panel);

    const rect = ctx.anchor.getBoundingClientRect();
    const measured = panel.getBoundingClientRect();
    const panelWidth = Math.max(240, measured.width || 332);
    const panelHeight = Math.max(200, measured.height || 360);

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
