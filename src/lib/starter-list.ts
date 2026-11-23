import type { FilterListV1 } from './types';

export const BUNDLED_STARTER_LIST_URL = 'bundled:aislist-test-sample';
export const BUNDLED_STARTER_LIST_ID = 'aislist-test-sample';

/**
 * Curated small test sample (~25 entries) drawn from Override92/AiSList
 * (https://github.com/Override92/AiSList, CC BY-NC 4.0) for immediate local testing
 * without bundling the full 70k+ upstream list.
 */
export const BUNDLED_AISLIST_TEST_SAMPLE: FilterListV1 = {
  schemaVersion: 1,
  listId: BUNDLED_STARTER_LIST_ID,
  name: 'AiSList Test Sample (25 Channels)',
  description:
    'Small curated test subset sampled from Override92/AiSList (blocklist + warnlist) for immediate verification on YouTube.',
  homepage: 'https://github.com/Override92/AiSList',
  license: 'CC BY-NC 4.0 (Upstream AiSList Sample)',
  updatedAt: '2026-11-22T00:00:00Z',
  channels: {},
  handles: {
    '@SuperCatLeague': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@MastersOfProphecy': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@AiDreamMaker': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@AIDreamCreations': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@BattleAI-z3r': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@ChickofHonor-l': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@ChickofHonor-3i': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@ChickofHonor-w8v': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@funnymeow1': {
      category: 'content-farm',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@Funnymeow8': {
      category: 'content-farm',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@Funnyyymeow': {
      category: 'content-farm',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@Greenchickss': {
      category: 'content-farm',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@BabyTVGreenChick': {
      category: 'content-farm',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@WadwalSaab-f1k1l': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList blocklist for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_blocklist.txt',
    },
    '@CinebotComedy': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@MakeTechFuture': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@ClassicWorldStories': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@Lost-Factory-Archives': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@OmegaClassicRecordsTV': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@AustraliaInsightTV': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@CrisisReportAussie': {
      category: 'synthetic-mass-upload',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@DigitalConsumer0': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@TheBeautifulGameExplainedd': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@TrumpetOfGlory': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
    '@ToonOfficialYT': {
      category: 'ai-synthetic',
      note: 'Sampled from AiSList warnlist (medium confidence) for testing.',
      evidenceUrl: 'https://github.com/Override92/AiSList/blob/main/AiSList/aislist_warnlist.txt',
    },
  },
};
