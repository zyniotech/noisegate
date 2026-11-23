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

const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const HANDLE_RE = /\/@([^/?#&]+)/;

const DISCLOSURE_PHRASES = [
  'altered or synthetic content',
  'sound or visuals were significantly edited or digitally generated',
  'veränderte oder synthetische inhalte',
  'audio- oder visuelle inhalte wurden erheblich bearbeitet oder digital generiert',
  'contenu modifié ou synthétique',
  'contenido alterado o sintético',
  'conteúdo alterado ou sintético',
  'contenuti alterati o sintetici',
];

type YppSignal = 'ypp-memberships' | 'ypp-super-thanks' | 'ypp-super-chat' | 'ypp-shopping';

interface ExtractedCardInfo {
  channelId?: string;
  handle?: string;
  channelName?: string;
  videoId?: string;
}

interface WatchPageInfo {
  videoId?: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  hasOfficialDisclosure: boolean;
  disclosureSource?: 'watch-data';
  youtubeCategory?: string;
  hasPaidPromotion: boolean;
  yppSignals: YppSignal[];
  monetizationInspected: boolean;
}

interface ChannelPageInfo {
  urlPath: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  yppSignals: YppSignal[];
  monetizationInspected: boolean;
}

type PolymerElement = HTMLElement & {
  data?: unknown;
  __data?: { data?: unknown; item?: unknown };
  __dataHost?: { data?: unknown; __data?: { data?: unknown } };
  polymerController?: { data?: unknown };
  componentProps?: { data?: unknown } & Record<string, unknown>;
};

interface WindowWithYouTube extends Window {
  ytInitialData?: unknown;
  ytInitialPlayerResponse?: unknown;
}

const lastDataRef = new WeakMap<Element, unknown>();
let lastNavigateResponse: unknown = null;
let lastPlayerResponse: unknown = null;
let hasSpaNavigated = false;
let pendingNavTimer: number | null = null;
let lastSerializedWatchInfo = '';
let lastSerializedChannelInfo = '';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isVisibleEl(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden || el.closest('[hidden]')) return false;
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: false });
  }
  return el.getClientRects().length > 0;
}

function extractVideoIdFromUrl(href: string): string | undefined {
  try {
    const url = new URL(href, location.origin);
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;
    const pathMatch = url.pathname.match(/\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch?.[1]) return pathMatch[1];
  } catch {
  }
  return undefined;
}

function extractHandleFromPath(path?: unknown): string | undefined {
  if (typeof path !== 'string') return undefined;
  const m = path.match(HANDLE_RE);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]).toLowerCase();
    } catch {
      return m[1].toLowerCase();
    }
  }
  return undefined;
}

function getElementData(el: Element): unknown {
  const poly = el as PolymerElement;
  if (poly.data) return poly.data;
  if (poly.__data?.data) return poly.__data.data;
  if (poly.__data?.item) return poly.__data.item;
  if (poly.polymerController?.data) return poly.polymerController.data;
  if (poly.componentProps?.data) return poly.componentProps.data;
  if (poly.componentProps && isObj(poly.componentProps)) return poly.componentProps;
  if (poly.__dataHost?.data) return poly.__dataHost.data;
  return null;
}

function extractFromCardData(root: unknown, maxDepth = 15): ExtractedCardInfo {
  const info: ExtractedCardInfo = {};
  if (!isObj(root)) return info;

  const visited = new Set<unknown>();
  const stack: Array<{ node: Record<string, unknown>; depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { node, depth } = current;
    if (depth > maxDepth || visited.has(node)) continue;
    visited.add(node);

    if (!info.videoId) {
      if (typeof node.videoId === 'string' && VIDEO_ID_RE.test(node.videoId)) {
        info.videoId = node.videoId;
      } else if (
        typeof node.contentId === 'string' &&
        VIDEO_ID_RE.test(node.contentId)
      ) {
        info.videoId = node.contentId;
      }
    }

    if (
      !info.channelId &&
      typeof node.channelId === 'string' &&
      CHANNEL_ID_RE.test(node.channelId)
    ) {
      info.channelId = node.channelId;
    }

    const browseEp = node.browseEndpoint;
    if (isObj(browseEp)) {
      if (
        !info.channelId &&
        typeof browseEp.browseId === 'string' &&
        CHANNEL_ID_RE.test(browseEp.browseId)
      ) {
        info.channelId = browseEp.browseId;
      }
      if (!info.handle && typeof browseEp.canonicalBaseUrl === 'string') {
        const h = extractHandleFromPath(browseEp.canonicalBaseUrl);
        if (h) info.handle = h;
      }
    }

    if (!info.channelName) {
      for (const field of ['shortBylineText', 'longBylineText', 'ownerText'] as const) {
        const byline = node[field];
        if (isObj(byline)) {
          if (typeof byline.simpleText === 'string' && byline.simpleText.trim()) {
            info.channelName = byline.simpleText.trim();
            break;
          }
          if (Array.isArray(byline.runs) && byline.runs.length > 0) {
            const firstRun = byline.runs[0];
            if (isObj(firstRun) && typeof firstRun.text === 'string' && firstRun.text.trim()) {
              info.channelName = firstRun.text.trim();
              break;
            }
          }
        }
      }
    }

    if (!info.channelName && Array.isArray(node.metadataRows) && node.metadataRows.length > 0) {
      const firstRow = node.metadataRows[0];
      if (
        isObj(firstRow) &&
        Array.isArray(firstRow.metadataParts) &&
        firstRow.metadataParts.length > 0
      ) {
        const firstPart = firstRow.metadataParts[0];
        if (
          isObj(firstPart) &&
          isObj(firstPart.text) &&
          typeof firstPart.text.content === 'string' &&
          firstPart.text.content.trim()
        ) {
          info.channelName = firstPart.text.content.trim();
        }
      }
    }

    if (info.channelId && info.handle && info.videoId && info.channelName) {
      break;
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        key === 'thumbnail' ||
        key === 'thumbnails' ||
        key === 'trackingParams' ||
        key === 'loggingDirectives' ||
        key === 'accessibility' ||
        key === 'badges' ||
        key === 'thumbnailOverlays' ||
        key === 'secondaryResults' ||
        key === 'engagementPanels' ||
        key === 'playerOverlays' ||
        key === 'contents'
      ) {
        continue;
      }

      if (Array.isArray(value)) {
        const limit = Math.min(value.length, 6);
        for (let i = 0; i < limit; i++) {
          const item = value[i];
          if (isObj(item)) {
            stack.push({ node: item, depth: depth + 1 });
          }
        }
      } else if (isObj(value)) {
        stack.push({ node: value, depth: depth + 1 });
      }
    }
  }

  return info;
}

function hydrateCard(el: Element): void {
  const data = getElementData(el);
  if (!data) return;

  if (lastDataRef.get(el) === data && el.getAttribute('data-ng-hydrated') === '1') {
    return;
  }

  const info = extractFromCardData(data, 15);
  lastDataRef.set(el, data);

  const htmlEl = el as HTMLElement;
  if (info.channelId) {
    htmlEl.dataset.ngChannelId = info.channelId;
  } else {
    delete htmlEl.dataset.ngChannelId;
  }

  if (info.handle) {
    htmlEl.dataset.ngHandle = info.handle;
  } else {
    delete htmlEl.dataset.ngHandle;
  }

  if (info.channelName) {
    htmlEl.dataset.ngChannelName = info.channelName;
  } else {
    delete htmlEl.dataset.ngChannelName;
  }

  if (info.videoId) {
    htmlEl.dataset.ngVideoId = info.videoId;
  } else {
    delete htmlEl.dataset.ngVideoId;
  }

  htmlEl.dataset.ngHydrated = '1';
}

function hydrateAllCards(): void {
  const nodes = document.querySelectorAll(CARD_SELECTOR);
  for (let i = 0; i < nodes.length; i++) {
    hydrateCard(nodes[i]!);
  }
}

interface TelemetryScanResult {
  hasOfficialDisclosure: boolean;
  hasPaidPromotion: boolean;
  yppSignals: Set<YppSignal>;
  youtubeCategory?: string;
}

function extractRootVideoId(root: Record<string, unknown>): string | undefined {
  if (isObj(root.videoDetails) && typeof root.videoDetails.videoId === 'string') {
    return root.videoDetails.videoId;
  }
  if (
    isObj(root.currentVideoEndpoint) &&
    isObj(root.currentVideoEndpoint.watchEndpoint) &&
    typeof root.currentVideoEndpoint.watchEndpoint.videoId === 'string'
  ) {
    return root.currentVideoEndpoint.watchEndpoint.videoId;
  }
  return undefined;
}

function scanTelemetrySignals(root: unknown, targetVideoId?: string): TelemetryScanResult {
  const result: TelemetryScanResult = {
    hasOfficialDisclosure: false,
    hasPaidPromotion: false,
    yppSignals: new Set<YppSignal>(),
  };

  if (!isObj(root)) return result;

  const rootVideoId = extractRootVideoId(root);
  if (targetVideoId && rootVideoId && rootVideoId !== targetVideoId) {
    return result;
  }

  if (isObj(root.microformat) && isObj(root.microformat.playerMicroformatRenderer)) {
    const mf = root.microformat.playerMicroformatRenderer;
    if (typeof mf.category === 'string' && mf.category.trim()) {
      result.youtubeCategory = mf.category.trim();
    }
  }

  const visited = new Set<unknown>();
  const stack: Array<{ node: Record<string, unknown>; depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > 15 || visited.has(node)) continue;
    visited.add(node);

    if (!result.hasOfficialDisclosure && isObj(node.howThisWasMadeSectionViewModel)) {
      const sectionStr = JSON.stringify(node.howThisWasMadeSectionViewModel).toLowerCase();
      if (
        sectionStr.length > 20 &&
        (DISCLOSURE_PHRASES.some((p) => sectionStr.includes(p)) ||
          sectionStr.includes('synthetic') ||
          sectionStr.includes('altered') ||
          sectionStr.includes('synthetisch'))
      ) {
        result.hasOfficialDisclosure = true;
      }
    }

    if (node.isAlteredContent === true || node.alteredOrSyntheticContent === true) {
      result.hasOfficialDisclosure = true;
    }

    if (isObj(node.paidContentOverlayRenderer) || node.hasPaidContentOverlay === true) {
      result.hasPaidPromotion = true;
    }

    if (
      isObj(node.sponsorButton) ||
      isObj(node.sponsorshipsOfferings) ||
      isObj(node.showSponsorshipsEngagementPanelCommand) ||
      isObj(node.sponsorshipsPurchaseEndpoint)
    ) {
      result.yppSignals.add('ypp-memberships');
    }

    if (
      typeof node.commandUrl === 'string' &&
      (node.commandUrl.includes('sponsorships') || /\/join(?:$|\?)/.test(node.commandUrl))
    ) {
      result.yppSignals.add('ypp-memberships');
    }

    const urlEp = node.urlEndpoint;
    if (isObj(urlEp) && typeof urlEp.url === 'string' && /\/join(?:$|\?)/.test(urlEp.url)) {
      result.yppSignals.add('ypp-memberships');
    }

    if (
      node.iconType === 'MONEY_HEART' ||
      node.iconName === 'MONEY_HEART' ||
      isObj(node.pdgCommentsEntryPoint) ||
      isObj(node.superThanksButton)
    ) {
      result.yppSignals.add('ypp-super-thanks');
    }

    if (
      isObj(node.merchandiseShelfRenderer) ||
      isObj(node.productShelfRenderer) ||
      isObj(node.productListRenderer) ||
      isObj(node.shoppingOverlayRenderer)
    ) {
      result.yppSignals.add('ypp-shopping');
    }

    if (
      isObj(node.liveChatPaidMessageRenderer) ||
      isObj(node.liveChatPaidStickerRenderer) ||
      isObj(node.liveChatTickerPaidMessageItemRenderer) ||
      isObj(node.liveChatProductButtonRenderer)
    ) {
      result.yppSignals.add('ypp-super-chat');
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        key === 'trackingParams' ||
        key === 'loggingDirectives' ||
        key === 'thumbnails' ||
        key === 'formats' ||
        key === 'adaptiveFormats' ||
        key === 'storyboards' ||
        key === 'captions' ||
        key === 'secondaryResults' ||
        key === 'relatedResults'
      ) {
        continue;
      }

      if (Array.isArray(value)) {
        const limit = Math.min(value.length, 40);
        for (let i = 0; i < limit; i++) {
          const item = value[i];
          if (isObj(item)) {
            stack.push({ node: item, depth: depth + 1 });
          }
        }
      } else if (isObj(value)) {
        stack.push({ node: value, depth: depth + 1 });
      }
    }
  }

  return result;
}

function detectDomYppAndPromo(
  signals: Set<YppSignal>,
  scope: 'watch' | 'channel',
): { hasPaidPromoDom: boolean } {
  const rootSelector =
    scope === 'watch'
      ? 'ytd-watch-flexy:not([hidden]), ytd-shorts:not([hidden])'
      : 'ytd-browse[page-subtype="channels"]:not([hidden])';

  const container = document.querySelector(rootSelector);
  if (container && isVisibleEl(container)) {
    const sponsorSelectors =
      scope === 'watch'
        ? [
            '#sponsor-button ytd-button-renderer',
            '#sponsor-button button',
            'a[href*="/sponsor"]',
            'a[href$="/join"]',
          ]
        : [
            '#sponsor-button ytd-button-renderer',
            '#sponsor-button button',
            'yt-flexible-actions-view-model a[href$="/join"]',
            'yt-flexible-actions-view-model a[href*="/join?"]',
          ];

    for (const sel of sponsorSelectors) {
      const match = container.querySelector(sel);
      if (match && isVisibleEl(match)) {
        signals.add('ypp-memberships');
        break;
      }
    }

    if (scope === 'watch') {
      const thanksBtn = container.querySelector(
        'ytd-watch-metadata ytd-menu-renderer button[aria-label*="Thanks" i], ytd-watch-metadata ytd-menu-renderer button[aria-label*="Super Thanks" i], ytd-watch-metadata ytd-menu-renderer button[aria-label*="Danke" i], ytd-watch-metadata ytd-menu-renderer button[aria-label*="Merci" i], ytd-watch-metadata ytd-menu-renderer button[aria-label*="Gracias" i]',
      );
      if (thanksBtn && isVisibleEl(thanksBtn)) {
        signals.add('ypp-super-thanks');
      }
    }

    const merchShelf = container.querySelector(
      'ytd-merch-shelf-renderer, ytd-product-shelf-renderer, yt-shopping-product-card-view-model',
    );
    if (merchShelf && isVisibleEl(merchShelf)) {
      signals.add('ypp-shopping');
    }
  }

  let hasPaidPromoDom = false;
  if (scope === 'watch') {
    const paidOverlay = document.querySelector(
      '#movie_player .ytp-paid-content-overlay',
    );
    if (
      paidOverlay &&
      isVisibleEl(paidOverlay) &&
      (paidOverlay.textContent?.trim().length ?? 0) > 2
    ) {
      hasPaidPromoDom = true;
    }
  }

  return { hasPaidPromoDom };
}

function dispatchWatchInfo(detail: WatchPageInfo): void {
  const serialized = JSON.stringify(detail);
  document.documentElement.dataset.ngWatchInfo = serialized;
  if (serialized === lastSerializedWatchInfo) return;
  lastSerializedWatchInfo = serialized;
  document.dispatchEvent(new CustomEvent('noisegate:watch-info', { detail: serialized }));
}

function dispatchChannelInfo(detail: ChannelPageInfo): void {
  const serialized = JSON.stringify(detail);
  document.documentElement.dataset.ngChannelInfo = serialized;
  if (serialized === lastSerializedChannelInfo) return;
  lastSerializedChannelInfo = serialized;
  document.dispatchEvent(new CustomEvent('noisegate:channel-info', { detail: serialized }));
}

function inspectWatchPage(): void {
  const isWatchOrShorts =
    location.pathname.startsWith('/watch') || location.pathname.startsWith('/shorts/');
  if (!isWatchOrShorts) {
    delete document.documentElement.dataset.ngWatchInfo;
    lastSerializedWatchInfo = '';
    return;
  }

  const urlVideoId = extractVideoIdFromUrl(location.href);
  const win = window as WindowWithYouTube;

  const watchFlexy = document.querySelector('ytd-watch-flexy:not([hidden])');
  const watchMeta = watchFlexy?.querySelector('ytd-watch-metadata') ?? null;
  const ownerEl = watchMeta?.querySelector('ytd-video-owner-renderer') ?? null;

  const sources: unknown[] = [
    watchMeta ? getElementData(watchMeta) : null,
    ownerEl ? getElementData(ownerEl) : null,
    watchFlexy ? getElementData(watchFlexy) : null,
    lastNavigateResponse,
    lastPlayerResponse,
    !hasSpaNavigated ? win.ytInitialData : null,
    !hasSpaNavigated ? win.ytInitialPlayerResponse : null,
  ].filter(Boolean);

  let channelId: string | undefined;
  let handle: string | undefined;
  let channelName: string | undefined;
  let hasOfficialDisclosure = false;
  let hasPaidPromotion = false;
  let youtubeCategory: string | undefined;
  const yppSignals = new Set<YppSignal>();

  const playerSources = [
    lastPlayerResponse,
    !hasSpaNavigated ? win.ytInitialPlayerResponse : null,
  ].filter(isObj);

  for (const ps of playerSources) {
    const vd = isObj(ps.videoDetails) ? ps.videoDetails : null;
    if (vd && (!urlVideoId || vd.videoId === urlVideoId)) {
      if (typeof vd.channelId === 'string' && CHANNEL_ID_RE.test(vd.channelId)) {
        channelId = vd.channelId;
      }
      if (typeof vd.author === 'string' && vd.author.trim()) {
        channelName = vd.author.trim();
      }
      if (
        isObj(ps.microformat) &&
        isObj(ps.microformat.playerMicroformatRenderer) &&
        typeof ps.microformat.playerMicroformatRenderer.category === 'string'
      ) {
        youtubeCategory = ps.microformat.playerMicroformatRenderer.category.trim();
      }
    }
  }

  for (const src of sources) {
    if (!channelId || !handle || !channelName) {
      const extracted = extractFromCardData(src, 12);
      if (!channelId && extracted.channelId) channelId = extracted.channelId;
      if (!handle && extracted.handle) handle = extracted.handle;
      if (!channelName && extracted.channelName) channelName = extracted.channelName;
    }

    const scan = scanTelemetrySignals(src, urlVideoId);
    if (scan.hasOfficialDisclosure) hasOfficialDisclosure = true;
    if (scan.hasPaidPromotion) hasPaidPromotion = true;
    if (!youtubeCategory && scan.youtubeCategory) youtubeCategory = scan.youtubeCategory;
    for (const sig of scan.yppSignals) yppSignals.add(sig);
  }

  const domChecks = detectDomYppAndPromo(yppSignals, 'watch');
  if (domChecks.hasPaidPromoDom) hasPaidPromotion = true;

  dispatchWatchInfo({
    videoId: urlVideoId,
    channelId,
    handle,
    channelName,
    hasOfficialDisclosure,
    disclosureSource: hasOfficialDisclosure ? 'watch-data' : undefined,
    youtubeCategory,
    hasPaidPromotion,
    yppSignals: Array.from(yppSignals),
    monetizationInspected: Boolean(watchMeta || ownerEl || sources.length > 0),
  });
}

function isChannelPagePath(pathname: string): boolean {
  return (
    pathname.startsWith('/@') ||
    pathname.startsWith('/channel/') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/user/')
  );
}

function inspectChannelPage(): void {
  if (!isChannelPagePath(location.pathname)) {
    delete document.documentElement.dataset.ngChannelInfo;
    lastSerializedChannelInfo = '';
    return;
  }

  const win = window as WindowWithYouTube;
  const browseEl = document.querySelector('ytd-browse[page-subtype="channels"]:not([hidden])');
  const headerEl = browseEl?.querySelector(
    'ytd-c4-tabbed-header-renderer, yt-page-header-renderer, yt-page-header-view-model',
  ) ?? null;

  const sources: unknown[] = [
    headerEl ? getElementData(headerEl) : null,
    browseEl ? getElementData(browseEl) : null,
    lastNavigateResponse,
    !hasSpaNavigated ? win.ytInitialData : null,
  ].filter(Boolean);

  let channelId: string | undefined;
  let handle: string | undefined = extractHandleFromPath(location.pathname);
  let channelName: string | undefined;
  const yppSignals = new Set<YppSignal>();

  if (location.pathname.startsWith('/channel/')) {
    const seg = location.pathname.split('/')[2];
    if (seg && CHANNEL_ID_RE.test(seg)) channelId = seg;
  }

  for (const src of sources) {
    if (isObj(src) && isObj(src.metadata) && isObj(src.metadata.channelMetadataRenderer)) {
      const meta = src.metadata.channelMetadataRenderer;
      if (!channelId && typeof meta.externalId === 'string' && CHANNEL_ID_RE.test(meta.externalId)) {
        channelId = meta.externalId;
      }
      if (!channelName && typeof meta.title === 'string') {
        channelName = meta.title.trim();
      }
      if (!handle && typeof meta.vanityChannelUrl === 'string') {
        const h = extractHandleFromPath(meta.vanityChannelUrl);
        if (h) handle = h;
      }
    }
  }

  for (const src of sources) {
    if (!channelId || !handle || !channelName) {
      const extracted = extractFromCardData(src, 12);
      if (!channelId && extracted.channelId) channelId = extracted.channelId;
      if (!handle && extracted.handle) handle = extracted.handle;
      if (!channelName && extracted.channelName) channelName = extracted.channelName;
    }

    const scan = scanTelemetrySignals(src);
    for (const sig of scan.yppSignals) yppSignals.add(sig);
  }

  detectDomYppAndPromo(yppSignals, 'channel');

  if (!channelId && !handle) return;

  dispatchChannelInfo({
    urlPath: location.pathname,
    channelId,
    handle,
    channelName,
    yppSignals: Array.from(yppSignals),
    monetizationInspected: Boolean(headerEl || browseEl || sources.length > 0),
  });
}

function inspectAll(): void {
  hydrateAllCards();
  inspectWatchPage();
  inspectChannelPage();
}

function clearBridgeRouteCache(): void {
  lastNavigateResponse = null;
  lastPlayerResponse = null;
  lastSerializedWatchInfo = '';
  lastSerializedChannelInfo = '';
  delete document.documentElement.dataset.ngWatchInfo;
  delete document.documentElement.dataset.ngChannelInfo;
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*', '*://m.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    document.addEventListener('noisegate:hydrate', () => {
      inspectAll();
    });

    window.addEventListener('yt-navigate-start', () => {
      hasSpaNavigated = true;
      if (pendingNavTimer !== null) {
        window.clearTimeout(pendingNavTimer);
        pendingNavTimer = null;
      }
      clearBridgeRouteCache();
    });

    window.addEventListener('popstate', () => {
      hasSpaNavigated = true;
      if (pendingNavTimer !== null) {
        window.clearTimeout(pendingNavTimer);
        pendingNavTimer = null;
      }
      clearBridgeRouteCache();
      pendingNavTimer = window.setTimeout(inspectAll, 250);
    });

    window.addEventListener('yt-navigate-finish', (evt: Event) => {
      hasSpaNavigated = true;
      const custom = evt as CustomEvent<{
        response?: { response?: unknown; playerResponse?: unknown };
      }>;
      if (custom.detail?.response?.response) {
        lastNavigateResponse = custom.detail.response.response;
      } else if (custom.detail?.response) {
        lastNavigateResponse = custom.detail.response;
      } else {
        lastNavigateResponse = null;
      }

      if (custom.detail?.response?.playerResponse) {
        lastPlayerResponse = custom.detail.response.playerResponse;
      } else {
        lastPlayerResponse = null;
      }

      if (pendingNavTimer !== null) {
        window.clearTimeout(pendingNavTimer);
      }
      inspectAll();
      pendingNavTimer = window.setTimeout(() => {
        pendingNavTimer = null;
        inspectAll();
      }, 450);
    });

    window.addEventListener('yt-page-data-updated', () => {
      inspectAll();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inspectAll, { once: true });
    } else {
      inspectAll();
    }
  },
});
