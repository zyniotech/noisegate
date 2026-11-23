import { getCategoryMeta } from './categories';
import { normalizeChannelId, normalizeHandle } from './normalize';
import {
  getTopObservedCategory,
  mapYouTubeCategoryToTopic,
  normalizeYppSignal,
  TOPICS,
  YPP_SIGNAL_LABELS,
} from './taxonomy';
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
  TopicRuleAction,
  UserSettings,
  YppSignalId,
} from './types';

const ACTION_SEVERITY: Record<TopicRuleAction, number> = {
  pass: 0,
  label: 1,
  dim: 2,
  hide: 3,
};

const ORIGIN_TIE_BREAK: Record<'disclosure' | 'paid-promo' | 'topic' | 'list' | 'ypp', number> = {
  disclosure: 5,
  'paid-promo': 4,
  topic: 3,
  list: 2,
  ypp: 1,
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

export function findMatchingLocalRule(
  ref: ChannelRef,
  localRulesById: Record<string, LocalRule>,
  localRulesByHandle: Record<string, LocalRule>,
): LocalRule | undefined {
  const cid = normalizeChannelId(ref.channelId);
  if (cid && Object.hasOwn(localRulesById, cid)) {
    return localRulesById[cid];
  }
  const handle = normalizeHandle(ref.handle);
  if (handle && Object.hasOwn(localRulesByHandle, handle)) {
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
    if (Object.hasOwn(TOPICS, t) && !seen.has(t)) {
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

function collectEffectiveYppSignals(
  channelProfile: ChannelProfile | undefined,
  listMatches: ListMatchSource[],
): YppSignalId[] {
  const ordered: YppSignalId[] = [];
  const seen = new Set<YppSignalId>();
  for (const s of channelProfile?.yppSignals ?? []) {
    const norm = normalizeYppSignal(s);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      ordered.push(norm);
    }
  }
  for (const m of listMatches) {
    for (const rawSignal of m.signals) {
      const norm = normalizeYppSignal(rawSignal);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        ordered.push(norm);
      }
    }
  }
  return ordered;
}

interface CandidateOutcome {
  action: FilterAction;
  origin: Exclude<ResolvedDecision['origin'], 'none' | 'local'>;
  tieRank: number;
  category: string;
  primaryLabel: string;
  sourceName: string;
  note?: string;
  evidenceUrl?: string;
  matchedTopic?: TopicId;
}

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

  const sortedLists = [...listMatches].sort(
    (a, b) => ACTION_SEVERITY[b.action] - ACTION_SEVERITY[a.action],
  );

  const hasVideoDisclosure = Boolean(videoDisclosure);
  const disclosureVideoCount = channelDisclosure?.videoIds.length ?? (hasVideoDisclosure ? 1 : 0);
  const hasChannelDisclosure =
    settings.propagateChannelDisclosure && disclosureVideoCount > 0;
  const hasListSyntheticDisclosure = sortedLists.some((m) =>
    m.signals.includes('yt-synthetic-disclosure'),
  );
  const hasOfficialDisclosure =
    hasVideoDisclosure || hasChannelDisclosure || hasListSyntheticDisclosure;

  const topics = collectEffectiveTopics(localRule, sortedLists, channelProfile);
  const rawYouTubeCategory = getTopObservedCategory(
    channelProfile?.observedYouTubeCategories,
  );
  const observedYppSignals = collectEffectiveYppSignals(channelProfile, sortedLists);
  const monetizationInspected = Boolean(channelProfile?.monetizationInspected);

  const hasVideoPaidPromotion = Boolean(
    ref.videoId && channelProfile?.paidPromotionVideoIds.includes(ref.videoId),
  );
  const hasPaidPromotion = hasVideoPaidPromotion;

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
      listMatches: sortedLists,
      hasOfficialDisclosure,
      disclosureVideoCount,
      overrodeListCount: 0,
      ...baseMetadata,
    };
  }

  const actionableListCount = sortedLists.filter((m) => m.action !== 'pass').length;

  if (localRule) {
    if (localRule.action === 'allow') {
      return {
        action: 'allow',
        origin: 'local',
        category: localRule.category || 'verified-independent',
        primaryLabel: 'Trusted (Local Override)',
        sourceName: 'Local Rule',
        note: localRule.note,
        listMatches: sortedLists,
        hasOfficialDisclosure,
        disclosureVideoCount,
        overrodeListCount: actionableListCount,
        ...baseMetadata,
      };
    }

    const meta = getCategoryMeta(localRule.category);
    const localSeverity = ACTION_SEVERITY[localRule.action];
    const overriddenCount = sortedLists.filter(
      (m) => ACTION_SEVERITY[m.action] > localSeverity,
    ).length;

    return {
      action: localRule.action,
      origin: 'local',
      category: localRule.category,
      primaryLabel: meta.shortLabel,
      sourceName: 'Your Rule',
      note: localRule.note,
      listMatches: sortedLists,
      hasOfficialDisclosure,
      disclosureVideoCount,
      overrodeListCount: overriddenCount,
      ...baseMetadata,
    };
  }

  const candidates: CandidateOutcome[] = [];

  const actionableLists = sortedLists.filter((m) => m.action !== 'pass');
  if (actionableLists.length > 0) {
    const winner = actionableLists[0]!;
    const meta = getCategoryMeta(winner.category);
    const sourceSummary =
      actionableLists.length > 1
        ? `${winner.listName} (+${actionableLists.length - 1})`
        : winner.listName;

    const topicText =
      winner.topics.length > 0
        ? winner.topics
            .filter((t) => Object.hasOwn(TOPICS, t))
            .map((t) => TOPICS[t].shortLabel)
            .join(', ')
        : undefined;

    candidates.push({
      action: winner.action as FilterAction,
      origin: 'list',
      tieRank: ORIGIN_TIE_BREAK.list,
      category: winner.category,
      primaryLabel:
        winner.category === 'topic-match' && topicText ? topicText : meta.shortLabel,
      sourceName: sourceSummary,
      note: winner.note,
      evidenceUrl: winner.evidenceUrl,
    });
  }

  if (hasOfficialDisclosure) {
    const meta = getCategoryMeta('disclosure-detected');
    const safeDisclosureAction: FilterAction =
      settings.disclosureAction === 'dim' || settings.disclosureAction === 'hide'
        ? settings.disclosureAction
        : 'label';
    candidates.push({
      action: safeDisclosureAction,
      origin: 'disclosure',
      tieRank: ORIGIN_TIE_BREAK.disclosure,
      category: 'disclosure-detected',
      primaryLabel: meta.shortLabel,
      sourceName: 'YouTube Disclosure',
      note: hasVideoDisclosure
        ? 'YouTube disclosed altered or synthetic content on this video.'
        : hasChannelDisclosure
          ? `Official synthetic disclosure seen on ${disclosureVideoCount} video${disclosureVideoCount === 1 ? '' : 's'} from this channel.`
          : 'Community directory verified an official synthetic-content disclosure for this channel.',
    });
  }

  const rawMatchedTopic = mapYouTubeCategoryToTopic(rawYouTubeCategory);
  for (const topic of topics) {
    if (!Object.hasOwn(TOPICS, topic)) continue;
    const topicRules = settings.topicRules ?? {};
    const ruleAction = Object.hasOwn(topicRules, topic) ? topicRules[topic] : undefined;
    if (!ruleAction || ruleAction === 'pass' || !Object.hasOwn(ACTION_SEVERITY, ruleAction)) {
      continue;
    }
    const topicMeta = TOPICS[topic];
    candidates.push({
      action: ruleAction,
      origin: 'topic',
      tieRank: ORIGIN_TIE_BREAK.topic,
      category: 'topic-match',
      primaryLabel: topicMeta.label,
      sourceName: 'Topic Filter',
      note:
        rawYouTubeCategory && rawMatchedTopic === topic
          ? `Matched YouTube category "${rawYouTubeCategory}".`
          : `Channel categorized under ${topicMeta.label}.`,
      matchedTopic: topic,
    });
  }

  if (
    hasVideoPaidPromotion &&
    settings.paidPromotionAction !== 'pass' &&
    Object.hasOwn(ACTION_SEVERITY, settings.paidPromotionAction)
  ) {
    candidates.push({
      action: settings.paidPromotionAction,
      origin: 'signal',
      tieRank: ORIGIN_TIE_BREAK['paid-promo'],
      category: 'paid-promotion',
      primaryLabel: 'Paid Promotion',
      sourceName: 'YouTube Disclosure',
      note: 'Creator disclosed paid promotion on this video.',
    });
  }

  if (
    observedYppSignals.length > 0 &&
    settings.monetizedAction !== 'pass' &&
    Object.hasOwn(ACTION_SEVERITY, settings.monetizedAction)
  ) {
    const names = observedYppSignals.map((s) => YPP_SIGNAL_LABELS[s] ?? s).join(', ');
    candidates.push({
      action: settings.monetizedAction,
      origin: 'signal',
      tieRank: ORIGIN_TIE_BREAK.ypp,
      category: 'ypp-monetized',
      primaryLabel: 'YPP Monetized',
      sourceName: names,
      note: `Public YPP partner features observed: ${names}.`,
    });
  }

  if (candidates.length > 0) {
    candidates.sort(
      (a, b) =>
        ACTION_SEVERITY[b.action] - ACTION_SEVERITY[a.action] || b.tieRank - a.tieRank,
    );
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
