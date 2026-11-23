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
  componentProps?: { data?: unknown };
};

interface WindowWithYouTube extends Window {
  ytInitialData?: unknown;
  ytInitialPlayerResponse?: unknown;
}

const lastDataRef = new WeakMap<Element, unknown>();
let lastNavigateResponse: unknown = null;
let lastPlayerResponse: unknown = null;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
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
  if (poly.__dataHost?.data) return poly.__dataHost.data;
  return null;
}

function extractFromCardData(root: unknown): ExtractedCardInfo {
  const info: ExtractedCardInfo = {};
  if (!isObj(root)) return info;

  const visited = new Set<unknown>();
  const stack: Array<{ node: Record<string, unknown>; depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { node, depth } = current;
    if (depth > 9 || visited.has(node)) continue;
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
      if (isObj(firstRow) && Array.isArray(firstRow.metadataParts) && firstRow.metadataParts.length > 0) {
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
        key === 'menu' ||
        key === 'accessibility' ||
        key === 'badges' ||
        key === 'thumbnailOverlays'
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

  const info = extractFromCardData(data);
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

function scanTelemetrySignals(root: unknown, targetVideoId?: string): TelemetryScanResult {
  const result: TelemetryScanResult = {
    hasOfficialDisclosure: false,
    hasPaidPromotion: false,
    yppSignals: new Set<YppSignal>(),
  };

  if (!isObj(root)) return result;

  // Quick check for microformat category & videoId match on player responses
  if (isObj(root.microformat) && isObj(root.microformat.playerMicroformatRenderer)) {
    const mf = root.microformat.playerMicroformatRenderer;
    const vd = isObj(root.videoDetails) ? root.videoDetails : null;
    const matchesVideo =
      !targetVideoId || !vd || vd.videoId === targetVideoId;
    if (matchesVideo && typeof mf.category === 'string' && mf.category.trim()) {
      result.youtubeCategory = mf.category.trim();
    }
  }

  const visited = new Set<unknown>();
  const stack: Array<{ node: Record<string, unknown>; depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > 14 || visited.has(node)) continue;
    visited.add(node);

    // 1. Official YouTube altered/synthetic disclosure
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

    // 2. Official Paid Promotion disclosure
    if (isObj(node.paidContentOverlayRenderer) || node.hasPaidContentOverlay === true) {
      result.hasPaidPromotion = true;
    }

    // 3. Hard YPP Partner Monetization signals (never inferred from ads!)
    if (isObj(node.sponsorButton) || isObj(node.sponsorshipsOfferings)) {
      result.yppSignals.add('ypp-memberships');
    }
    if (
      isObj(node.showSponsorshipsEngagementPanelCommand) ||
      isObj(node.sponsorshipsPurchaseEndpoint)
    ) {
      result.yppSignals.add('ypp-memberships');
    }

    // Super Thanks / Pdg money heart action button
    if (node.iconType === 'MONEY_HEART' || node.iconName === 'MONEY_HEART') {
      result.yppSignals.add('ypp-super-thanks');
    }
    if (
      isObj(node.pdgCommentsEntryPoint) ||
      isObj(node.superThanksButton) ||
      (typeof node.commandUrl === 'string' && node.commandUrl.includes('sponsorships'))
    ) {
      if (typeof node.commandUrl === 'string' && node.commandUrl.includes('sponsorships')) {
        result.yppSignals.add('ypp-memberships');
      } else {
        result.yppSignals.add('ypp-super-thanks');
      }
    }

    // YouTube Shopping / Merch Shelf
    if (isObj(node.merchandiseShelfRenderer) || isObj(node.productShelfRenderer)) {
      result.yppSignals.add('ypp-shopping');
    }

    // Live chat Super Chat / Super Stickers
    if (
      isObj(node.liveChatPaidMessageRenderer) ||
      isObj(node.liveChatPaidStickerRenderer) ||
      isObj(node.liveChatTickerPaidMessageItemRenderer)
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
        key === 'secondaryResults'
      ) {
        continue;
      }

      if (typeof value === 'string') {
        if (!result.hasOfficialDisclosure && value.length >= 20 && value.length <= 260) {
          const lower = value.toLowerCase();
          if (DISCLOSURE_PHRASES.some((p) => lower.includes(p))) {
            result.hasOfficialDisclosure = true;
          }
        }
      } else if (Array.isArray(value)) {
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

function detectDomYppAndPromo(signals: Set<YppSignal>): { hasPaidPromoDom: boolean } {
  // Join / Channel Memberships button rendered in DOM
  const sponsorBtn = document.querySelector(
    'ytd-watch-metadata #sponsor-button ytd-button-renderer, ytd-c4-tabbed-header-renderer #sponsor-button ytd-button-renderer, yt-flexible-actions-view-model button[aria-label*="Join"], ytd-video-owner-renderer #sponsor-button button',
  );
  if (sponsorBtn) {
    signals.add('ypp-memberships');
  }

  // Super Thanks button rendered in action bar
  const thanksBtn = document.querySelector(
    'ytd-watch-metadata ytd-menu-renderer button[aria-label*="Thanks" i], ytd-watch-metadata ytd-menu-renderer button[aria-label*="Super Thanks" i], ytd-watch-metadata ytd-menu-renderer button[aria-label*="Danke" i]',
  );
  if (thanksBtn) {
    signals.add('ypp-super-thanks');
  }

  // Shopping / Merch shelf
  const merchShelf = document.querySelector(
    'ytd-merch-shelf-renderer, ytd-product-shelf-renderer',
  );
  if (merchShelf) {
    signals.add('ypp-shopping');
  }

  // Paid promotion overlay
  const paidOverlay = document.querySelector('.ytp-paid-content-overlay');
  const hasPaidPromoDom = Boolean(
    paidOverlay && (paidOverlay.textContent?.trim().length ?? 0) > 2,
  );

  return { hasPaidPromoDom };
}

function inspectWatchPage(): void {
  if (!location.pathname.startsWith('/watch')) return;

  const urlVideoId = new URLSearchParams(location.search).get('v') ?? undefined;
  const win = window as WindowWithYouTube;

  const watchFlexy = document.querySelector('ytd-watch-flexy');
  const watchMeta = document.querySelector('ytd-watch-metadata');
  const ownerEl = document.querySelector('ytd-video-owner-renderer');

  const sources: unknown[] = [
    watchMeta ? getElementData(watchMeta) : null,
    ownerEl ? getElementData(ownerEl) : null,
    watchFlexy ? getElementData(watchFlexy) : null,
    lastNavigateResponse,
    lastPlayerResponse,
    win.ytInitialData,
    win.ytInitialPlayerResponse,
  ].filter(Boolean);

  let channelId: string | undefined;
  let handle: string | undefined;
  let channelName: string | undefined;
  let hasOfficialDisclosure = false;
  let hasPaidPromotion = false;
  let youtubeCategory: string | undefined;
  const yppSignals = new Set<YppSignal>();

  for (const src of sources) {
    if (!channelId || !handle || !channelName) {
      const extracted = extractFromCardData(src);
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

  // Explicitly verify playerResponse.videoDetails
  const playerSources = [lastPlayerResponse, win.ytInitialPlayerResponse].filter(isObj);
  for (const ps of playerSources) {
    if (isObj(ps.videoDetails)) {
      const vd = ps.videoDetails;
      if (!urlVideoId || vd.videoId === urlVideoId) {
        if (typeof vd.channelId === 'string' && CHANNEL_ID_RE.test(vd.channelId)) {
          channelId = vd.channelId;
        }
        if (typeof vd.author === 'string' && !channelName) {
          channelName = vd.author;
        }
      }
    }
    if (isObj(ps.microformat) && isObj(ps.microformat.playerMicroformatRenderer)) {
      const mf = ps.microformat.playerMicroformatRenderer;
      const vd = isObj(ps.videoDetails) ? ps.videoDetails : null;
      if ((!urlVideoId || !vd || vd.videoId === urlVideoId) && typeof mf.category === 'string') {
        youtubeCategory = mf.category.trim();
      }
    }
  }

  const domChecks = detectDomYppAndPromo(yppSignals);
  if (domChecks.hasPaidPromoDom) hasPaidPromotion = true;

  const detail: WatchPageInfo = {
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
  };

  document.documentElement.dataset.ngWatchInfo = JSON.stringify(detail);
  document.dispatchEvent(new CustomEvent('noisegate:watch-info', { detail }));
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
  if (!isChannelPagePath(location.pathname)) return;

  const win = window as WindowWithYouTube;
  const browseEl = document.querySelector('ytd-browse[page-subtype="channels"]');
  const headerEl = document.querySelector(
    'ytd-c4-tabbed-header-renderer, yt-page-header-renderer, yt-page-header-view-model',
  );

  const sources: unknown[] = [
    headerEl ? getElementData(headerEl) : null,
    browseEl ? getElementData(browseEl) : null,
    lastNavigateResponse,
    win.ytInitialData,
  ].filter(Boolean);

  let channelId: string | undefined;
  let handle: string | undefined = extractHandleFromPath(location.pathname);
  let channelName: string | undefined;
  const yppSignals = new Set<YppSignal>();

  for (const src of sources) {
    if (!channelId || !handle || !channelName) {
      const extracted = extractFromCardData(src);
      if (!channelId && extracted.channelId) channelId = extracted.channelId;
      if (!handle && extracted.handle) handle = extracted.handle;
      if (!channelName && extracted.channelName) channelName = extracted.channelName;
    }

    // Check channel metadata header fields explicitly
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

    const scan = scanTelemetrySignals(src);
    for (const sig of scan.yppSignals) yppSignals.add(sig);
  }

  detectDomYppAndPromo(yppSignals);

  if (!channelId && location.pathname.startsWith('/channel/')) {
    const seg = location.pathname.split('/')[2];
    if (seg && CHANNEL_ID_RE.test(seg)) channelId = seg;
  }

  if (!channelId && !handle) return;

  const detail: ChannelPageInfo = {
    channelId,
    handle,
    channelName,
    yppSignals: Array.from(yppSignals),
    monetizationInspected: Boolean(headerEl || browseEl || sources.length > 0),
  };

  document.documentElement.dataset.ngChannelInfo = JSON.stringify(detail);
  document.dispatchEvent(new CustomEvent('noisegate:channel-info', { detail }));
}

function inspectAll(): void {
  hydrateAllCards();
  inspectWatchPage();
  inspectChannelPage();
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    document.addEventListener('noisegate:hydrate', () => {
      inspectAll();
    });

    window.addEventListener('yt-navigate-finish', (evt: Event) => {
      const custom = evt as CustomEvent<{
        response?: { response?: unknown; playerResponse?: unknown };
      }>;
      if (custom.detail?.response?.response) {
        lastNavigateResponse = custom.detail.response.response;
      } else if (custom.detail?.response) {
        lastNavigateResponse = custom.detail.response;
      }
      if (custom.detail?.response?.playerResponse) {
        lastPlayerResponse = custom.detail.response.playerResponse;
      }

      inspectAll();
      setTimeout(inspectAll, 450);
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
