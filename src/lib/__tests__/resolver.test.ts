import { describe, expect, it } from 'vitest';
import { resolveDecision } from '../resolver';
import type {
  ChannelProfile,
  ListMatchSource,
  LocalRule,
  UserSettings,
} from '../types';

const BASE_SETTINGS: UserSettings = {
  enabled: true,
  disclosureAction: 'label',
  propagateChannelDisclosure: true,
  paidPromotionAction: 'label',
  monetizedAction: 'pass',
  showMonetizationIndicator: true,
  showTopicIndicator: true,
  topicRules: {},
  autoRefreshHours: 24,
  showCardHoverButton: true,
  communitySubmissionRepo: 'zyniotech/noisegate-lists',
};

const LIST_LABEL: ListMatchSource = {
  listId: 'warnlist',
  listName: 'Warnlist',
  action: 'label',
  category: 'ai-synthetic',
  topics: [],
  signals: [],
};

const LIST_HIDE: ListMatchSource = {
  listId: 'blocklist',
  listName: 'Blocklist',
  action: 'hide',
  category: 'content-farm',
  topics: [],
  signals: [],
};

describe('3-layer & topic/signal conflict resolver', () => {
  it('picks strictest action across multiple community lists (Hide > Dim > Label)', () => {
    const decision = resolveDecision({
      ref: { handle: 'supercatleague' },
      settings: BASE_SETTINGS,
      listMatches: [LIST_LABEL, LIST_HIDE],
    });

    expect(decision.action).toBe('hide');
    expect(decision.origin).toBe('list');
    expect(decision.sourceName).toBe('Blocklist (+1)');
    expect(decision.listMatches).toHaveLength(2);
  });

  it('allows local Trust/Allow rule to override community lists and topic filters', () => {
    const localAllow: LocalRule = {
      id: '@supercatleague',
      handle: 'supercatleague',
      action: 'allow',
      category: 'verified-independent',
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    };

    const profile: ChannelProfile = {
      channelKey: '@supercatleague',
      observedYouTubeCategories: { Gaming: 2 },
      observedTopics: ['gaming'],
      yppSignals: ['ypp-memberships'],
      monetizationInspected: true,
      paidPromotionVideoIds: [],
      lastObservedAt: '2026-11-23T00:00:00Z',
    };

    const decision = resolveDecision({
      ref: { handle: 'supercatleague' },
      settings: { ...BASE_SETTINGS, topicRules: { gaming: 'hide' } },
      localRule: localAllow,
      listMatches: [LIST_HIDE],
      channelProfile: profile,
    });

    expect(decision.action).toBe('allow');
    expect(decision.origin).toBe('local');
    expect(decision.overrodeListCount).toBe(1);
    expect(decision.topics).toEqual(['gaming']);
    expect(decision.observedYppSignals).toEqual(['ypp-memberships']);
  });

  it('applies user-configured Topic Rule Matrix without framing', () => {
    const profile: ChannelProfile = {
      channelKey: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      observedYouTubeCategories: { Gaming: 4 },
      observedTopics: ['gaming'],
      yppSignals: [],
      monetizationInspected: true,
      paidPromotionVideoIds: [],
      lastObservedAt: '2026-11-23T00:00:00Z',
    };

    const decision = resolveDecision({
      ref: { channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' },
      settings: {
        ...BASE_SETTINGS,
        topicRules: { gaming: 'dim', science: 'pass' },
      },
      listMatches: [],
      channelProfile: profile,
    });

    expect(decision.action).toBe('dim');
    expect(decision.origin).toBe('topic');
    expect(decision.matchedTopic).toBe('gaming');
    expect(decision.primaryLabel).toBe('Gaming & Esports');
  });

  it('keeps observed YPP monetization neutral (action=none) by default, while surfacing metadata', () => {
    const profile: ChannelProfile = {
      channelKey: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      observedYouTubeCategories: { 'Science & Technology': 1 },
      observedTopics: ['science'],
      yppSignals: ['ypp-memberships', 'ypp-super-thanks'],
      monetizationInspected: true,
      paidPromotionVideoIds: [],
      lastObservedAt: '2026-11-23T00:00:00Z',
    };

    const decision = resolveDecision({
      ref: { channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' },
      settings: BASE_SETTINGS,
      listMatches: [],
      channelProfile: profile,
    });

    expect(decision.action).toBe('none');
    expect(decision.monetizationInspected).toBe(true);
    expect(decision.observedYppSignals).toEqual(['ypp-memberships', 'ypp-super-thanks']);
  });

  it('labels or dims Paid Promotion when present on the video', () => {
    const profile: ChannelProfile = {
      channelKey: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      observedYouTubeCategories: {},
      observedTopics: [],
      yppSignals: [],
      monetizationInspected: true,
      paidPromotionVideoIds: ['dQw4w9WgXcQ'],
      lastObservedAt: '2026-11-23T00:00:00Z',
    };

    const decision = resolveDecision({
      ref: { videoId: 'dQw4w9WgXcQ', channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' },
      settings: { ...BASE_SETTINGS, paidPromotionAction: 'label' },
      listMatches: [],
      channelProfile: profile,
    });

    expect(decision.action).toBe('label');
    expect(decision.origin).toBe('signal');
    expect(decision.hasPaidPromotion).toBe(true);
  });

  it('applies Layer 1 official YouTube disclosure when no stricter rule matches', () => {
    const decision = resolveDecision({
      ref: { videoId: 'dQw4w9WgXcQ', channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' },
      settings: { ...BASE_SETTINGS, disclosureAction: 'dim' },
      listMatches: [],
      videoDisclosure: {
        videoId: 'dQw4w9WgXcQ',
        channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
        detectedAt: '2026-11-23T00:00:00Z',
        source: 'watch-data',
      },
    });

    expect(decision.action).toBe('dim');
    expect(decision.origin).toBe('disclosure');
    expect(decision.hasOfficialDisclosure).toBe(true);
  });

  it('returns none when extension is globally paused', () => {
    const decision = resolveDecision({
      ref: { handle: 'supercatleague' },
      settings: { ...BASE_SETTINGS, enabled: false },
      listMatches: [LIST_HIDE],
    });

    expect(decision.action).toBe('none');
  });
});
