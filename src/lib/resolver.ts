import { getCategoryMeta } from './categories';
import { normalizeChannelId, normalizeHandle } from './normalize';
import { getTopObservedCategory, TOPICS, YPP_SIGNAL_LABELS } from './taxonomy';
import type {
  ChannelDisclosureStats,
  ChannelProfile,
  ChannelRef,
  DisclosureRecord,
  FilterAction,
  ListMatchSource,
  LocalRule,
  ResolvedDecision,
  TopicId,
  UserSettings,
} from './types';

const ACTION_SEVERITY: Record<FilterAction, number> = {
  label: 1,
  dim: 2,
  hide: 3,
};

export interface ResolveInput {
  ref: ChannelRef;
  settings: UserSettings;
  localRule?: LocalRule;
  listMatches: ListMatchSource[];
  videoDisclosure?: DisclosureRecord;
  channelDisclosure?: ChannelDisclosureStats;
  channelProfile?: ChannelProfile;
}

/**
 * Finds the best matching local rule for a channel reference.
 * Prefers exact UC... channelId match over @handle match.
 */
export function findMatchingLocalRule(
  ref: ChannelRef,
  localRulesById: Record<string, LocalRule>,
  localRulesByHandle: Record<string, LocalRule>,
): LocalRule | undefined {
  const cid = normalizeChannelId(ref.channelId);
  if (cid && localRulesById[cid]) {
    return localRulesById[cid];
  }
  const handle = normalizeHandle(ref.handle);
  if (handle && localRulesByHandle[handle]) {
    return localRulesByHandle[handle];
  }
  return undefined;
}

function collectEffectiveTopics(
  localRule: LocalRule | undefined,
  listMatches: ListMatchSource[],
  channelProfile: ChannelProfile | undefined,
): TopicId[] {
  const ordered: TopicId[] = [];
  const seen = new Set<TopicId>();
  const add = (t: TopicId) => {
    if (!seen.has(t)) {
      seen.add(t);
      ordered.push(t);
    }
  };

  if (channelProfile?.manualTopics !== undefined) {
    for (const t of channelProfile.manualTopics) add(t);
    return ordered;
  }

  if (localRule?.topics) {
    for (const t of localRule.topics) add(t);
  }
  if (channelProfile?.observedTopics) {
    for (const t of channelProfile.observedTopics) add(t);
  }
  for (const m of listMatches) {
    for (const t of m.topics) add(t);
  }

  return ordered;
}

interface CandidateOutcome {
  action: FilterAction;
  origin: Exclude<ResolvedDecision['origin'], 'none' | 'local'>;
  category: string;
  primaryLabel: string;
  sourceName: string;
  note?: string;
  evidenceUrl?: string;
  matchedTopic?: TopicId;
}

/**
 * Deterministic neutral multi-layer conflict resolver:
 * 1. Local channel rules ALWAYS win over lists, topics, and signals (including Trust/Allow).
 * 2. Otherwise evaluate all enabled rule sources (Community Lists, Layer 1 Official Disclosures,
 *    Topic Rule Matrix, Paid Promotion rule, YPP Monetization rule) and apply the strictest
 *    configured action (`Hide > Dim > Label`), while preserving complete factual metadata.
 */
export function resolveDecision(input: ResolveInput): ResolvedDecision {
  const {
    ref,
    settings,
    localRule,
    listMatches,
    videoDisclosure,
    channelDisclosure,
    channelProfile,
  } = input;

  const hasVideoDisclosure = Boolean(videoDisclosure);
  const disclosureVideoCount = channelDisclosure?.videoIds.length ?? (hasVideoDisclosure ? 1 : 0);
  const hasChannelDisclosure =
    settings.propagateChannelDisclosure && disclosureVideoCount > 0;
  const hasOfficialDisclosure = hasVideoDisclosure || hasChannelDisclosure;

  const topics = collectEffectiveTopics(localRule, listMatches, channelProfile);
  const rawYouTubeCategory = getTopObservedCategory(
    channelProfile?.observedYouTubeCategories,
  );
  const observedYppSignals = channelProfile?.yppSignals ?? [];
  const monetizationInspected = Boolean(channelProfile?.monetizationInspected);

  const hasVideoPaidPromotion = Boolean(
    ref.videoId && channelProfile?.paidPromotionVideoIds.includes(ref.videoId),
  );
  const hasPaidPromotion =
    hasVideoPaidPromotion || (channelProfile?.paidPromotionVideoIds.length ?? 0) > 0;

  const baseMetadata = {
    topics,
    rawYouTubeCategory,
    observedYppSignals,
    monetizationInspected,
    hasPaidPromotion,
  };

  if (!settings.enabled) {
    return {
      action: 'none',
      origin: 'none',
      category: '',
      primaryLabel: '',
      sourceName: '',
      listMatches,
      hasOfficialDisclosure,
      disclosureVideoCount,
      overrodeListCount: 0,
      ...baseMetadata,
    };
  }

  // Layer 2: Local rule ALWAYS takes precedence (including Allow / Trust override)
  if (localRule) {
    if (localRule.action === 'allow') {
      return {
        action: 'allow',
        origin: 'local',
        category: localRule.category || 'verified-independent',
        primaryLabel: 'Trusted (Local Override)',
        sourceName: 'Local Rule',
        note: localRule.note,
        listMatches,
        hasOfficialDisclosure,
        disclosureVideoCount,
        overrodeListCount: listMatches.length,
        ...baseMetadata,
      };
    }

    const meta = getCategoryMeta(localRule.category);
    return {
      action: localRule.action,
      origin: 'local',
      category: localRule.category,
      primaryLabel: meta.shortLabel,
      sourceName: 'Your Rule',
      note: localRule.note,
      listMatches,
      hasOfficialDisclosure,
      disclosureVideoCount,
      overrodeListCount: 0,
      ...baseMetadata,
    };
  }

  const candidates: CandidateOutcome[] = [];

  // Layer 3: Community filter lists
  const sortedLists = [...listMatches].sort(
    (a, b) => ACTION_SEVERITY[b.action] - ACTION_SEVERITY[a.action],
  );
  if (sortedLists.length > 0) {
    const winner = sortedLists[0]!;
    const meta = getCategoryMeta(winner.category);
    const sourceSummary =
      sortedLists.length > 1
        ? `${winner.listName} (+${sortedLists.length - 1})`
        : winner.listName;

    const topicText =
      winner.topics.length > 0
        ? winner.topics.map((t) => TOPICS[t]?.shortLabel ?? t).join(', ')
        : undefined;

    candidates.push({
      action: winner.action,
      origin: 'list',
      category: winner.category,
      primaryLabel:
        winner.category === 'topic-match' && topicText ? topicText : meta.shortLabel,
      sourceName: sourceSummary,
      note: winner.note,
      evidenceUrl: winner.evidenceUrl,
    });
  }

  // Layer 1: Official YouTube "Altered or synthetic content" disclosure
  if (hasOfficialDisclosure) {
    const meta = getCategoryMeta('disclosure-detected');
    candidates.push({
      action: settings.disclosureAction,
      origin: 'disclosure',
      category: 'disclosure-detected',
      primaryLabel: meta.shortLabel,
      sourceName: 'YouTube Disclosure',
      note: hasVideoDisclosure
        ? 'YouTube disclosed altered or synthetic content on this video.'
        : `Official synthetic disclosure seen on ${disclosureVideoCount} video${disclosureVideoCount === 1 ? '' : 's'} from this channel.`,
    });
  }

  // Topic Rule Matrix (Neutral user-controlled category filtering: Gaming, Entertainment, etc.)
  for (const topic of topics) {
    const ruleAction = settings.topicRules?.[topic];
    if (!ruleAction || ruleAction === 'pass') continue;
    const topicMeta = TOPICS[topic];
    candidates.push({
      action: ruleAction,
      origin: 'topic',
      category: 'topic-match',
      primaryLabel: topicMeta.label,
      sourceName: 'Topic Filter',
      note: rawYouTubeCategory
        ? `Matched YouTube category "${rawYouTubeCategory}".`
        : `Channel categorized under ${topicMeta.label}.`,
      matchedTopic: topic,
    });
  }

  // Official Paid Promotion signal
  if (hasVideoPaidPromotion && settings.paidPromotionAction !== 'pass') {
    candidates.push({
      action: settings.paidPromotionAction,
      origin: 'signal',
      category: 'paid-promotion',
      primaryLabel: 'Paid Promotion',
      sourceName: 'YouTube Disclosure',
      note: 'Creator disclosed paid promotion on this video.',
    });
  }

  // Observed YPP Partner monetization signals (only acts if user chose Label/Dim/Hide; default is Pass)
  if (observedYppSignals.length > 0 && settings.monetizedAction !== 'pass') {
    const names = observedYppSignals.map((s) => YPP_SIGNAL_LABELS[s] ?? s).join(', ');
    candidates.push({
      action: settings.monetizedAction,
      origin: 'signal',
      category: 'ypp-monetized',
      primaryLabel: 'YPP Monetized',
      sourceName: names,
      note: `Public YPP partner features observed: ${names}.`,
    });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => ACTION_SEVERITY[b.action] - ACTION_SEVERITY[a.action]);
    const winner = candidates[0]!;
    return {
      action: winner.action,
      origin: winner.origin,
      category: winner.category,
      primaryLabel: winner.primaryLabel,
      sourceName: winner.sourceName,
      note: winner.note,
      evidenceUrl: winner.evidenceUrl,
      matchedTopic: winner.matchedTopic,
      listMatches: sortedLists,
      hasOfficialDisclosure,
      disclosureVideoCount,
      overrodeListCount: 0,
      ...baseMetadata,
    };
  }

  return {
    action: 'none',
    origin: 'none',
    category: '',
    primaryLabel: '',
    sourceName: '',
    listMatches: sortedLists,
    hasOfficialDisclosure,
    disclosureVideoCount,
    overrodeListCount: 0,
    ...baseMetadata,
  };
}
