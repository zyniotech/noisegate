export type FilterAction = 'label' | 'dim' | 'hide';

export type LocalRuleAction = FilterAction | 'allow';

export type TopicRuleAction = 'pass' | FilterAction;

export type TopicId =
  | 'science'
  | 'technology'
  | 'education'
  | 'documentary'
  | 'entertainment'
  | 'gaming'
  | 'news-politics'
  | 'finance-business'
  | 'music'
  | 'sports'
  | 'lifestyle-vlogs'
  | 'kids-family';

export type YppSignalId =
  | 'ypp-memberships'
  | 'ypp-super-thanks'
  | 'ypp-super-chat'
  | 'ypp-shopping';

export type ObservableSignalId =
  | YppSignalId
  | 'yt-paid-promotion'
  | 'yt-synthetic-disclosure';

export type CategoryId =
  | 'ai-synthetic'
  | 'synthetic-mass-upload'
  | 'content-farm'
  | 'reupload-compilation'
  | 'verified-independent'
  | 'disclosure-detected'
  | 'paid-promotion'
  | 'ypp-monetized'
  | 'topic-match'
  | 'custom';

export interface ChannelRef {
  channelId?: string;
  handle?: string;
  channelName?: string;
  videoId?: string;
}

export interface LocalRule {
  /** Canonical key: UC... channelId if known, else `@normalizedhandle` */
  id: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  action: LocalRuleAction;
  category: CategoryId;
  topics?: TopicId[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FilterListChannelEntry {
  category?: string;
  topics?: string[];
  signals?: string[];
  note?: string;
  evidenceUrl?: string;
}

/** Open NoiseGate Filter List JSON Schema v1 */
export interface FilterListV1 {
  schemaVersion: 1;
  listId: string;
  name: string;
  description?: string;
  homepage?: string;
  submissionUrl?: string;
  removalUrl?: string;
  license?: string;
  updatedAt: string;
  channels?: Record<string, FilterListChannelEntry>;
  handles?: Record<string, FilterListChannelEntry>;
}

/** Open NoiseGate Filter List JSON Schema v2 (Two-Axis: Neutral Topics + Observable Signals) */
export interface FilterListV2 {
  schemaVersion: 2;
  listId: string;
  name: string;
  description?: string;
  homepage?: string;
  submissionUrl?: string;
  removalUrl?: string;
  license?: string;
  updatedAt: string;
  channels?: Record<string, FilterListChannelEntry>;
  handles?: Record<string, FilterListChannelEntry>;
}

export interface ParsedListEntry {
  keyType: 'channelId' | 'handle';
  /** Normalized key: UC... as-is (case sensitive) or lowercase handle without leading '@' */
  key: string;
  category: string;
  topics: TopicId[];
  signals: string[];
  note?: string;
  evidenceUrl?: string;
}

export type FilterListFormat = 'json-v1' | 'json-v2' | 'plaintext-aislist';

export interface ParsedFilterList {
  format: FilterListFormat;
  listId: string;
  name: string;
  description?: string;
  homepage?: string;
  submissionUrl?: string;
  removalUrl?: string;
  license?: string;
  updatedAt: string;
  entries: ParsedListEntry[];
}

export interface SubscribedListMeta {
  id: string;
  name: string;
  description?: string;
  homepage?: string;
  submissionUrl?: string;
  removalUrl?: string;
  /** 'bundled:aislist-test-sample' for bundled starter list, else https:// URL */
  url: string;
  bundled?: boolean;
  enabled: boolean;
  defaultAction: FilterAction;
  entryCount: number;
  format: FilterListFormat;
  etag?: string;
  lastFetchedAt?: string;
  sourceUpdatedAt?: string;
  lastError?: string;
}

export interface DisclosureRecord {
  videoId: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  detectedAt: string;
  source: 'watch-data' | 'watch-dom';
}

export interface ChannelDisclosureStats {
  channelKey: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  videoIds: string[];
  lastDetectedAt: string;
}

export interface ChannelProfile {
  channelKey: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  /** Raw YouTube microformat categories observed across videos (e.g., { Gaming: 4 }) */
  observedYouTubeCategories: Record<string, number>;
  /** Canonical neutral topic IDs inferred from YouTube categories */
  observedTopics: TopicId[];
  /** Explicit user-set topic overrides (when defined, replaces inferred topics) */
  manualTopics?: TopicId[];
  /** Public YPP partner signals observed on Watch or Channel pages */
  yppSignals: YppSignalId[];
  /** True once at least one Watch or Channel page was inspected */
  monetizationInspected: boolean;
  /** Video IDs where YouTube's Paid Promotion overlay/disclosure was seen */
  paidPromotionVideoIds: string[];
  lastObservedAt: string;
}

export interface UserSettings {
  enabled: boolean;
  /** Default action applied to Layer 1 official YouTube synthetic disclosures */
  disclosureAction: FilterAction;
  /** Whether to also annotate other videos from a channel with detected disclosures */
  propagateChannelDisclosure: boolean;
  /** Action applied when YouTube's official Paid Promotion disclosure is present */
  paidPromotionAction: TopicRuleAction;
  /** Action applied when public YPP partner signals (Memberships/Super Thanks/etc.) are observed */
  monetizedAction: TopicRuleAction;
  /** Show factual YPP monetization metadata on Watch/Channel pages and Popover */
  showMonetizationIndicator: boolean;
  /** Show neutral topic category metadata on Watch/Channel pages and Popover */
  showTopicIndicator: boolean;
  /** Per-topic user filtering rule matrix (Pass / Label / Dim / Hide) */
  topicRules: Partial<Record<TopicId, TopicRuleAction>>;
  /** Refresh interval in hours for subscribed external lists */
  autoRefreshHours: number;
  /** Show subtle 1-click hover button on YouTube cards */
  showCardHoverButton: boolean;
  /** Default GitHub repository slug (owner/repo) for community metadata suggestions */
  communitySubmissionRepo: string;
}

export interface ListMatchSource {
  listId: string;
  listName: string;
  action: FilterAction;
  category: string;
  topics: TopicId[];
  signals: string[];
  note?: string;
  evidenceUrl?: string;
  submissionUrl?: string;
  removalUrl?: string;
}

export interface ResolvedDecision {
  /** Final UI action to perform, or 'allow' if explicitly trusted, or 'none' if untouched */
  action: FilterAction | 'allow' | 'none';
  origin: 'local' | 'list' | 'disclosure' | 'topic' | 'signal' | 'none';
  category: string;
  primaryLabel: string;
  sourceName: string;
  note?: string;
  evidenceUrl?: string;
  /** All matching community lists (useful for tooltip/details) */
  listMatches: ListMatchSource[];
  /** Whether Layer 1 detected an official YouTube disclosure on this video or channel */
  hasOfficialDisclosure: boolean;
  disclosureVideoCount: number;
  /** True when user explicitly set an Allow/Trust local override over matching list(s) */
  overrodeListCount: number;
  /** Combined neutral topics (manual > list > observed YouTube) */
  topics: TopicId[];
  /** Most frequently observed raw YouTube category label */
  rawYouTubeCategory?: string;
  /** Public YPP partner signals observed for this channel */
  observedYppSignals: YppSignalId[];
  /** True if Watch or Channel page has been inspected for YPP features */
  monetizationInspected: boolean;
  /** True if current video (or channel video) disclosed Paid Promotion */
  hasPaidPromotion: boolean;
  /** Matched topic if a Topic Rule Matrix rule triggered */
  matchedTopic?: TopicId;
}

export interface PageStats {
  url: string;
  scannedCards: number;
  labeledCount: number;
  dimmedCount: number;
  hiddenCount: number;
  disclosureCount: number;
  trustedCount: number;
  revealHidden: boolean;
  updatedAt: number;
  /** Recent channels currently visible on the active YouTube tab for quick popup controls */
  visibleChannels: Array<{
    channelId?: string;
    handle?: string;
    channelName: string;
    decision: ResolvedDecision;
  }>;
}

export interface RegistryListEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  homepage?: string;
  submissionUrl?: string;
  removalUrl?: string;
  defaultAction: FilterAction;
  kind: 'topics' | 'signals' | 'community';
  maintainer: string;
}

export interface PersonalExportV1 {
  schemaVersion: 1;
  exportedAt: string;
  app: 'NoiseGate';
  settings: UserSettings;
  localRules: LocalRule[];
  subscribedLists: Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    defaultAction: FilterAction;
    bundled?: boolean;
  }>;
}
