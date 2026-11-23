import type { YppSignalId } from '@/lib/types';

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
const JOIN_PATH_RE =
  /(?:^|\/(?:channel\/UC[a-zA-Z0-9_-]{22}|@[^/?#]+|c\/[^/?#]+|user\/[^/?#]+))\/join(?:$|[?#])/i;
const SPONSOR_PATH_RE = /\/sponsor(?:_channel)?(?:$|[/?#])/i;
const SPONSORSHIP_KEY_RE = /^sponsorships[A-Z]/;
const SPONSORSHIP_KEY_EXCLUDE_RE = /disabled|eligib/i;
const SPONSORSHIP_FIRST_MONTH_RE =
  /\b(?:im ersten monat|for the first month|first month|ersten monat|premier mois|primer mes|primo mese|primeiro m[êe]s|eerste maand)\b/i;
const SPONSORSHIP_PRICE_PERIOD_RE =
  /(?:\d[\d.,]*\s*(?:[$€£¥₩₹]|chf|usd|eur|gbp|cad|aud|pln|sek|nok|dkk|brl|mxn|try|inr|rub|jpy|krw|twd|hkd)\s*\/\s*(?:monat|month|mo|mois|mes|mese|maand|mies\.?|m[åa]nad|m[åa]ned|ay|месяц|か月|ヶ月|개월)|(?:[$€£¥₩₹]|chf|usd|eur|gbp|cad|aud)\s*\d[\d.,]*\s*\/\s*(?:monat|month|mo|mois|mes|mese|maand))/i;

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

const JOIN_BUTTON_LABELS = [
  'join',
  'join this channel',
  'see perks',
  'mitglied werden',
  'mitgliedschaft',
  'vorteile ansehen',
  'devenir membre',
  'rejoindre',
  'voir les avantages',
  'unirse',
  'unirme',
  'ver ventajas',
  'seja membro',
  'ver benefícios',
  'abbonati',
  'word lid',
  'dołącz',
  'dolacz',
  'bli medlem',
  'bli sponsor',
  'liity',
  'katıl',
  'стать спонсором',
  'メンバーになる',
  '가입',
  '加入頻道會員',
  '加入频道会员',
  'tham gia',
  'gabung',
  'bergabung',
  'สมัครสมาชิก',
];

const THANKS_BUTTON_LABELS = [
  'thanks',
  'super thanks',
  'danke',
  'merci',
  'gracias',
  'grazie',
  'valeu',
  'obrigado',
  'bedankt',
  'dziękuję',
  'dziekuje',
  'tack',
  'takk',
  'kiitos',
  'teşekkürler',
  'tesekkurler',
  'спасибо',
  'サンクス',
  '슈퍼 땡스',
  '超級感謝',
  '超级感谢',
  'cảm ơn',
  'terima kasih',
  'ขอบคุณ',
];

type YppSignal = YppSignalId;

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
  viewModel?: unknown;
  __data?: { data?: unknown; item?: unknown; viewModel?: unknown };
  __dataHost?: { data?: unknown; __data?: { data?: unknown } };
  polymerController?: { data?: unknown; viewModel?: unknown };
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
  if (poly.viewModel) return poly.viewModel;
  if (poly.__data?.data) return poly.__data.data;
  if (poly.__data?.item) return poly.__data.item;
  if (poly.__data?.viewModel) return poly.__data.viewModel;
  if (poly.polymerController?.data) return poly.polymerController.data;
  if (poly.polymerController?.viewModel) return poly.polymerController.viewModel;
  if (poly.componentProps?.data) return poly.componentProps.data;
  if (poly.componentProps && isObj(poly.componentProps)) return poly.componentProps;
  if (poly.__dataHost?.data) return poly.__dataHost.data;
  if (poly.__dataHost?.__data?.data) return poly.__dataHost.__data.data;
  return null;
}

function pushElementDataSources(el: Element, out: unknown[], seen: Set<unknown>): void {
  const poly = el as PolymerElement;
  const candidates = [
    poly.data,
    poly.viewModel,
    poly.__data?.data,
    poly.__data?.item,
    poly.__data?.viewModel,
    poly.polymerController?.data,
    poly.polymerController?.viewModel,
    poly.componentProps?.data,
    poly.componentProps,
    poly.__dataHost?.data,
    poly.__dataHost?.__data?.data,
  ];
  for (const c of candidates) {
    if (isObj(c) && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
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

function scanServiceTrackingMonetization(root: Record<string, unknown>): boolean | undefined {
  const responseContext = root.responseContext;
  if (!isObj(responseContext)) return undefined;
  const serviceParams = responseContext.serviceTrackingParams;
  if (!Array.isArray(serviceParams)) return undefined;

  let detected: boolean | undefined;
  for (const serviceEntry of serviceParams) {
    if (!isObj(serviceEntry)) continue;
    const params = serviceEntry.params;
    if (!Array.isArray(params)) continue;
    for (const param of params) {
      if (!isObj(param)) continue;
      if (param.key !== 'is_monetization_enabled') continue;
      const rawVal = param.value;
      if (rawVal === true || rawVal === 1) return true;
      if (rawVal === false || rawVal === 0) {
        detected = false;
        continue;
      }
      if (typeof rawVal === 'string') {
        const norm = rawVal.trim().toLowerCase();
        if (norm === 'true' || norm === '1') return true;
        if (norm === 'false' || norm === '0') detected = false;
      }
    }
  }
  return detected;
}

function isYouTubeUrlOrRelative(rawUrl: string): boolean {
  if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
    return !rawUrl.toLowerCase().startsWith('/redirect');
  }
  return /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?!redirect(?:$|[/?#]))/i.test(rawUrl);
}

function detectApiUrlSignals(rawUrl: string, isApiEndpoint: boolean, out: Set<YppSignal>): void {
  const trimmed = rawUrl.trim();
  if (!trimmed || !isYouTubeUrlOrRelative(trimmed)) return;
  const lower = trimmed.toLowerCase();

  if (
    lower.includes('get_sponsorships') ||
    lower.includes('sponsorships') ||
    JOIN_PATH_RE.test(lower) ||
    SPONSOR_PATH_RE.test(lower)
  ) {
    out.add('ypp-memberships');
  }

  if (
    lower.includes('super_thanks') ||
    lower.includes('superthanks') ||
    lower.includes('get_pdg_buy_flow') ||
    (isApiEndpoint && lower.includes('thanks'))
  ) {
    out.add('ypp-super-thanks');
  }

  if (lower.includes('super_chat')) {
    out.add('ypp-super-chat');
  }

  if (
    isApiEndpoint &&
    (lower.includes('/shopping') || lower.includes('shopping_') || lower.includes('merchandise'))
  ) {
    out.add('ypp-shopping');
  }

  if (
    isApiEndpoint &&
    (lower.includes('/ypc/') || lower.includes('/commerce/') || lower.includes('commerce_')) &&
    !lower.includes('premium') &&
    !lower.includes('offline') &&
    (lower.includes('sponsorship') ||
      lower.includes('membership') ||
      lower.includes('monetiz') ||
      lower.includes('creator') ||
      lower.includes('pdg') ||
      lower.includes('super_thanks') ||
      lower.includes('super_chat'))
  ) {
    out.add('ypp-partner');
  }
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

  if (scanServiceTrackingMonetization(root) === true) {
    result.yppSignals.add('ypp-partner');
  }

  const visited = new Set<unknown>();
  const stack: Array<{ node: Record<string, unknown>; depth: number }> = [
    { node: root, depth: 0 },
  ];

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    if (depth > 24 || visited.has(node)) continue;
    visited.add(node);
    if (visited.size > 20000) break;

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
      isObj(node.sponsorshipsPurchaseEndpoint) ||
      isObj(node.sponsorshipsExpandableMessageRenderer) ||
      isObj(node.sponsorshipsHeaderRenderer) ||
      isObj(node.sponsorshipsOfferingsRenderer) ||
      isObj(node.sponsorshipsTierRenderer) ||
      isObj(node.sponsorshipsPerkRenderer) ||
      isObj(node.sponsorshipsMembershipOfferedRenderer) ||
      isObj(node.getSponsorshipsOfferingsEndpoint)
    ) {
      result.yppSignals.add('ypp-memberships');
    }

    if (typeof node.commandUrl === 'string') {
      detectApiUrlSignals(node.commandUrl, true, result.yppSignals);
    }
    if (typeof node.apiUrl === 'string') {
      detectApiUrlSignals(node.apiUrl, true, result.yppSignals);
    }
    if (typeof node.url === 'string') {
      detectApiUrlSignals(node.url, false, result.yppSignals);
    }

    const urlEp = node.urlEndpoint;
    if (isObj(urlEp) && typeof urlEp.url === 'string') {
      detectApiUrlSignals(urlEp.url, false, result.yppSignals);
    }

    if (isObj(node.ypcGetOffersEndpoint)) {
      const serialized = JSON.stringify(node.ypcGetOffersEndpoint).toLowerCase();
      if (
        !serialized.includes('premium') &&
        !serialized.includes('offline') &&
        (serialized.includes('sponsorship') ||
          serialized.includes('membership') ||
          serialized.includes('super_thanks') ||
          serialized.includes('super_chat') ||
          serialized.includes('pdg'))
      ) {
        result.yppSignals.add('ypp-partner');
      }
    }

    for (const idField of ['panelIdentifier', 'targetId'] as const) {
      const idVal = node[idField];
      if (typeof idVal === 'string') {
        const lowerId = idVal.toLowerCase();
        if (lowerId.includes('sponsorships')) {
          result.yppSignals.add('ypp-memberships');
        } else if (lowerId.includes('super_thanks') || lowerId.includes('super-thanks')) {
          result.yppSignals.add('ypp-super-thanks');
        } else if (lowerId.includes('super_chat')) {
          result.yppSignals.add('ypp-super-chat');
        } else if (lowerId.includes('shopping')) {
          result.yppSignals.add('ypp-shopping');
        }
      }
    }

    const iconVal =
      typeof node.iconType === 'string'
        ? node.iconType
        : typeof node.iconName === 'string'
          ? node.iconName
          : typeof node.imageName === 'string'
            ? node.imageName
            : '';
    if (iconVal === 'SPONSORSHIPS') {
      result.yppSignals.add('ypp-memberships');
    } else if (iconVal === 'MONEY_HEART' || iconVal === 'SUPER_THANKS') {
      result.yppSignals.add('ypp-super-thanks');
    } else if (iconVal === 'SHOPPING_BAG') {
      result.yppSignals.add('ypp-shopping');
    } else if (iconVal === 'SUPER_CHAT' || iconVal === 'SUPER_STICKER') {
      result.yppSignals.add('ypp-super-chat');
    }

    if (
      isObj(node.pdgCommentsEntryPoint) ||
      isObj(node.superThanksButton) ||
      isObj(node.superThanksEndpoint) ||
      isObj(node.showSuperThanksDialogCommand)
    ) {
      result.yppSignals.add('ypp-super-thanks');
    }

    if (
      isObj(node.merchandiseShelfRenderer) ||
      isObj(node.productShelfRenderer) ||
      isObj(node.productListRenderer) ||
      isObj(node.shoppingOverlayRenderer) ||
      isObj(node.shoppingCarouselRenderer) ||
      isObj(node.shoppingTimelyActionRenderer)
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

    if (isObj(node.commandExecutorCommand) && Array.isArray(node.commandExecutorCommand.commands)) {
      for (const cmd of node.commandExecutorCommand.commands) {
        if (isObj(cmd)) {
          stack.push({ node: cmd, depth: depth + 1 });
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        SPONSORSHIP_KEY_RE.test(key) &&
        !SPONSORSHIP_KEY_EXCLUDE_RE.test(key) &&
        isObj(value)
      ) {
        result.yppSignals.add('ypp-memberships');
      }

      if (
        key === 'trackingParams' ||
        key === 'loggingDirectives' ||
        key === 'thumbnails' ||
        key === 'formats' ||
        key === 'adaptiveFormats' ||
        key === 'storyboards' ||
        key === 'captions' ||
        key === 'secondaryResults' ||
        key === 'relatedResults' ||
        key === 'adPlacements' ||
        key === 'adSlots' ||
        key === 'playerAds' ||
        key === 'adBreakHeartbeatParams' ||
        key === 'adBreakParams' ||
        key === 'topbar' ||
        key === 'guide' ||
        key === 'mealbarPromoRenderer' ||
        key === 'upsellDialogRenderer'
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

function matchesLocaleButtonText(raw: string | null | undefined, labels: readonly string[]): boolean {
  if (!raw) return false;
  const norm = raw.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!norm) return false;
  for (const label of labels) {
    if (norm === label || norm.startsWith(`${label} `) || norm.endsWith(` ${label}`)) {
      return true;
    }
    if ((label.includes(' ') || label.length >= 10) && norm.includes(label)) {
      return true;
    }
  }
  return false;
}

function hasSponsorshipPromoText(text: string | null | undefined): boolean {
  if (!text) return false;
  const norm = text.replace(/\s+/g, ' ').trim();
  if (!norm || norm.length > 220) return false;
  if (SPONSORSHIP_PRICE_PERIOD_RE.test(norm)) return true;
  if (SPONSORSHIP_FIRST_MONTH_RE.test(norm) && /\d/.test(norm)) return true;
  return false;
}

function detectDomYppAndPromo(
  signals: Set<YppSignal>,
  scope: 'watch' | 'channel',
): { hasPaidPromoDom: boolean } {
  const rootSelector =
    scope === 'watch'
      ? 'ytd-watch-flexy:not([hidden]), ytd-shorts:not([hidden])'
      : 'ytd-browse[page-subtype="channels"]:not([hidden]), ytm-browse:not([hidden])';

  const candidates = document.querySelectorAll(rootSelector);
  let container: Element | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    if (isVisibleEl(candidate)) {
      container = candidate;
      break;
    }
  }

  if (container) {
    if (scope === 'watch') {
      const watchSponsorSelectors = [
        '#sponsor-button ytd-button-renderer',
        '#sponsor-button button',
        '#sponsor-button a',
        'ytd-watch-metadata #owner a[href*="/sponsor"]',
        'ytd-watch-metadata #owner a[href$="/join"]',
        'ytd-watch-metadata #owner a[href*="/join?"]',
      ];
      for (const sel of watchSponsorSelectors) {
        const match = container.querySelector(sel);
        if (match && isVisibleEl(match)) {
          signals.add('ypp-memberships');
          break;
        }
      }

      if (!signals.has('ypp-memberships')) {
        const watchOwnerBtns = container.querySelectorAll(
          'ytd-watch-metadata #owner button, ytd-watch-metadata #sponsor-button button, ytd-watch-metadata #owner button-view-model button',
        );
        for (let i = 0; i < watchOwnerBtns.length; i++) {
          const btn = watchOwnerBtns[i]!;
          if (!isVisibleEl(btn)) continue;
          if (
            matchesLocaleButtonText(btn.textContent, JOIN_BUTTON_LABELS) ||
            matchesLocaleButtonText(btn.getAttribute('aria-label'), JOIN_BUTTON_LABELS)
          ) {
            signals.add('ypp-memberships');
            break;
          }
        }
      }

      const menuButtons = container.querySelectorAll(
        'ytd-watch-metadata ytd-menu-renderer button, ytd-watch-metadata ytd-menu-renderer a[role="button"], ytd-watch-metadata #actions button-view-model button, ytd-watch-metadata #actions yt-button-view-model button, ytd-reel-video-renderer[is-active] button-view-model button, ytd-reel-player-overlay-renderer #actions button',
      );
      for (let i = 0; i < menuButtons.length; i++) {
        const btn = menuButtons[i]!;
        if (!isVisibleEl(btn)) continue;
        const aria = btn.getAttribute('aria-label');
        const txt = btn.textContent;
        if (
          matchesLocaleButtonText(aria, THANKS_BUTTON_LABELS) ||
          matchesLocaleButtonText(txt, THANKS_BUTTON_LABELS)
        ) {
          signals.add('ypp-super-thanks');
          break;
        }
      }
    } else {
      const headerScope =
        container.querySelector(
          '#page-header, ytd-c4-tabbed-header-renderer, yt-page-header-renderer, yt-page-header-view-model, #inner-header-container',
        ) ?? container;

      const channelSponsorSelectors = [
        '#sponsor-button ytd-button-renderer',
        '#sponsor-button button',
        '#sponsor-button a',
        'yt-flexible-actions-view-model a[href$="/join"]',
        'yt-flexible-actions-view-model a[href*="/join?"]',
        'yt-flexible-actions-view-model a[href*="/join#"]',
        'yt-flexible-actions-view-model a[href*="/sponsor"]',
        'ytd-sponsorships-expandable-message-renderer',
        'ytd-sponsorships-offer-renderer',
        'ytd-sponsorships-tier-renderer',
        '[data-is-sponsorship]',
      ];

      for (const sel of channelSponsorSelectors) {
        const match = container.querySelector(sel);
        if (match && isVisibleEl(match)) {
          signals.add('ypp-memberships');
          break;
        }
      }

      if (!signals.has('ypp-memberships')) {
        const headerButtons = headerScope.querySelectorAll(
          'yt-flexible-actions-view-model button-view-model button, yt-flexible-actions-view-model button, yt-flexible-actions-view-model a[role="button"], #buttons ytd-button-renderer button, #buttons button-view-model button',
        );
        for (let i = 0; i < headerButtons.length; i++) {
          const btn = headerButtons[i]!;
          if (!isVisibleEl(btn)) continue;
          if (
            matchesLocaleButtonText(btn.textContent, JOIN_BUTTON_LABELS) ||
            matchesLocaleButtonText(btn.getAttribute('aria-label'), JOIN_BUTTON_LABELS)
          ) {
            signals.add('ypp-memberships');
            break;
          }
        }
      }

      if (!signals.has('ypp-memberships')) {
        const allHeaderEls = headerScope.querySelectorAll('*');
        for (let i = 0; i < allHeaderEls.length; i++) {
          const el = allHeaderEls[i]!;
          const tag = el.tagName.toLowerCase();
          if (
            (tag.startsWith('yt-sponsorships-') || tag.startsWith('ytd-sponsorships-')) &&
            isVisibleEl(el)
          ) {
            signals.add('ypp-memberships');
            break;
          }
        }
      }

      if (!signals.has('ypp-memberships')) {
        const promoCandidates = headerScope.querySelectorAll(
          'yt-flexible-actions-view-model, [class*="sponsorship"], yt-page-header-view-model span, yt-page-header-view-model yt-formatted-string, #inner-header-container yt-formatted-string',
        );
        for (let i = 0; i < promoCandidates.length; i++) {
          const el = promoCandidates[i]!;
          if (
            el.closest(
              'h1, #channel-name, yt-description-preview-view-model, #description, yt-tab-group-shape',
            ) ||
            !isVisibleEl(el)
          ) {
            continue;
          }
          if (hasSponsorshipPromoText(el.textContent)) {
            signals.add('ypp-memberships');
            break;
          }
        }
      }
    }

    const merchShelf = container.querySelector(
      'ytd-merch-shelf-renderer, ytd-product-shelf-renderer, ytd-product-list-renderer, yt-shopping-product-card-view-model, ytd-merch-shelf-item-renderer',
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
  const shortsEl = location.pathname.startsWith('/shorts/')
    ? document.querySelector(
        'ytd-shorts:not([hidden]) ytd-reel-video-renderer[is-active], ytd-shorts:not([hidden])',
      )
    : null;

  const seenSources = new Set<unknown>();
  const sources: unknown[] = [];
  for (const el of [watchMeta, ownerEl, watchFlexy, shortsEl]) {
    if (el) pushElementDataSources(el, sources, seenSources);
  }
  for (const rawSrc of [
    lastNavigateResponse,
    lastPlayerResponse,
    !hasSpaNavigated ? win.ytInitialData : null,
    !hasSpaNavigated ? win.ytInitialPlayerResponse : null,
  ]) {
    if (isObj(rawSrc) && !seenSources.has(rawSrc)) {
      seenSources.add(rawSrc);
      sources.push(rawSrc);
    }
  }

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
    monetizationInspected: Boolean(watchMeta || ownerEl || shortsEl || sources.length > 0),
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

function isStaleChannelMetadataSource(
  src: unknown,
  urlChannelId?: string,
  urlHandle?: string,
): boolean {
  if (!isObj(src) || !isObj(src.metadata) || !isObj(src.metadata.channelMetadataRenderer)) {
    return false;
  }
  const meta = src.metadata.channelMetadataRenderer;
  if (
    urlChannelId &&
    typeof meta.externalId === 'string' &&
    CHANNEL_ID_RE.test(meta.externalId) &&
    meta.externalId !== urlChannelId
  ) {
    return true;
  }
  if (urlHandle && typeof meta.vanityChannelUrl === 'string') {
    const metaHandle = extractHandleFromPath(meta.vanityChannelUrl);
    if (metaHandle && metaHandle !== urlHandle) {
      return true;
    }
  }
  return false;
}

function inspectChannelPage(): void {
  if (!isChannelPagePath(location.pathname)) {
    delete document.documentElement.dataset.ngChannelInfo;
    lastSerializedChannelInfo = '';
    return;
  }

  const win = window as WindowWithYouTube;
  const browseCandidates = document.querySelectorAll(
    'ytd-browse[page-subtype="channels"]:not([hidden]), ytm-browse:not([hidden])',
  );
  let browseEl: Element | null = null;
  for (let i = 0; i < browseCandidates.length; i++) {
    const candidate = browseCandidates[i]!;
    if (isVisibleEl(candidate)) {
      browseEl = candidate;
      break;
    }
  }
  if (!browseEl && browseCandidates.length > 0) {
    browseEl = browseCandidates[0]!;
  }

  const headerScope = browseEl ?? document;
  const headerElements = Array.from(
    headerScope.querySelectorAll(
      'ytd-c4-tabbed-header-renderer, yt-page-header-renderer, yt-page-header-view-model, yt-flexible-actions-view-model, yt-flexible-actions-view-model button-view-model',
    ),
  ).filter((el) => !el.closest('[hidden]') && !(el as HTMLElement).hidden);

  const seenSources = new Set<unknown>();
  const sources: unknown[] = [];
  for (const el of headerElements) {
    pushElementDataSources(el, sources, seenSources);
  }
  if (browseEl) {
    pushElementDataSources(browseEl, sources, seenSources);
  }
  for (const rawSrc of [lastNavigateResponse, !hasSpaNavigated ? win.ytInitialData : null]) {
    if (isObj(rawSrc) && !seenSources.has(rawSrc)) {
      seenSources.add(rawSrc);
      sources.push(rawSrc);
    }
  }

  let urlChannelId: string | undefined;
  let channelId: string | undefined;
  const urlHandle = extractHandleFromPath(location.pathname);
  let handle: string | undefined = urlHandle;
  let channelName: string | undefined;
  const yppSignals = new Set<YppSignal>();

  if (location.pathname.startsWith('/channel/')) {
    const seg = location.pathname.split('/')[2];
    if (seg && CHANNEL_ID_RE.test(seg)) {
      urlChannelId = seg;
      channelId = seg;
    }
  }

  for (const src of sources) {
    if (isStaleChannelMetadataSource(src, urlChannelId, urlHandle)) {
      continue;
    }
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
    if (isStaleChannelMetadataSource(src, urlChannelId, urlHandle)) {
      continue;
    }

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
    monetizationInspected: Boolean(headerElements.length > 0 || browseEl || sources.length > 0),
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

    window.addEventListener('yt-page-data-updated', (evt: Event) => {
      const custom = evt as CustomEvent<{
        pageData?: { response?: unknown; playerResponse?: unknown };
      }>;
      if (custom.detail?.pageData?.response) {
        lastNavigateResponse = custom.detail.pageData.response;
      }
      if (custom.detail?.pageData?.playerResponse) {
        lastPlayerResponse = custom.detail.pageData.playerResponse;
      }
      inspectAll();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inspectAll, { once: true });
    } else {
      inspectAll();
    }
  },
});
