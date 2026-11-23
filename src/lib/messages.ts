import type {
  CategoryId,
  ChannelDisclosureStats,
  ChannelProfile,
  ChannelRef,
  FilterAction,
  LocalRule,
  LocalRuleAction,
  PageStats,
  RegistryListEntry,
  ResolvedDecision,
  SubscribedListMeta,
  TopicId,
  UserSettings,
  YppSignalId,
} from './types';

export interface EvaluateItem {
  requestId: string;
  channelId?: string;
  handle?: string;
  channelName?: string;
  videoId?: string;
}

export type RuntimeRequest =
  | {
      type: 'EVALUATE_BATCH';
      items: EvaluateItem[];
      handleMappings?: Array<{ handle?: string; channelId?: string }>;
    }
  | {
      type: 'REPORT_DISCLOSURE';
      videoId: string;
      channelId?: string;
      handle?: string;
      channelName?: string;
      source: 'watch-data' | 'watch-dom';
    }
  | {
      type: 'REPORT_CHANNEL_TELEMETRY';
      ref: ChannelRef;
      youtubeCategory?: string;
      yppSignals: YppSignalId[];
      monetizationInspected: boolean;
      hasPaidPromotion?: boolean;
    }
  | {
      type: 'SET_CHANNEL_TOPICS';
      ref: ChannelRef;
      topics: TopicId[] | undefined;
    }
  | {
      type: 'UPSERT_LOCAL_RULE';
      ref: ChannelRef;
      action: LocalRuleAction;
      category: CategoryId;
      topics?: TopicId[];
      note?: string;
    }
  | {
      type: 'REMOVE_LOCAL_RULE';
      ref: ChannelRef | { id: string };
    }
  | {
      type: 'UPDATE_PAGE_STATS';
      stats: PageStats;
    }
  | {
      type: 'GET_STATE_SNAPSHOT';
      tabId?: number;
    }
  | {
      type: 'UPDATE_SETTINGS';
      patch: Partial<UserSettings>;
    }
  | {
      type: 'ADD_FILTER_LIST';
      url: string;
      defaultAction: FilterAction;
      customName?: string;
    }
  | {
      type: 'UPDATE_FILTER_LIST';
      listId: string;
      patch: {
        enabled?: boolean;
        defaultAction?: FilterAction;
        name?: string;
      };
    }
  | {
      type: 'REMOVE_FILTER_LIST';
      listId: string;
    }
  | {
      type: 'REFRESH_FILTER_LIST';
      listId?: string;
    }
  | {
      type: 'RESTORE_STARTER_LIST';
    }
  | {
      type: 'FETCH_REGISTRY';
    }
  | {
      type: 'CLEAR_DISCLOSURES';
    }
  | {
      type: 'CLEAR_CHANNEL_PROFILES';
    }
  | {
      type: 'EXPORT_DATA';
    }
  | {
      type: 'IMPORT_DATA';
      payload: unknown;
      mode: 'merge' | 'replace';
    }
  | {
      type: 'TOGGLE_REVEAL_HIDDEN';
      tabId: number;
      reveal: boolean;
    };

export interface StateSnapshot {
  settings: UserSettings;
  localRules: LocalRule[];
  subscribedLists: SubscribedListMeta[];
  channelDisclosures: ChannelDisclosureStats[];
  channelProfiles: ChannelProfile[];
  totalVideoDisclosures: number;
  pageStats: PageStats | null;
}

export interface RegistrySnapshot {
  entries: RegistryListEntry[];
  source: 'live' | 'fallback';
}

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Messages sent from background -> content script */
export type ContentBroadcast =
  | { type: 'NOISEGATE_STATE_UPDATED' }
  | { type: 'NOISEGATE_SET_REVEAL_HIDDEN'; reveal: boolean };
