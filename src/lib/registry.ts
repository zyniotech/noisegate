import type { RegistryListEntry } from './types';

export const COMMUNITY_REGISTRY_URL =
  'https://cdn.jsdelivr.net/gh/zyniotech/noisegate-lists@main/registry.json';

export const COMMUNITY_REGISTRY_FALLBACK_URL =
  'https://raw.githubusercontent.com/zyniotech/noisegate-lists/main/registry.json';

export const DEFAULT_SUBMISSION_ISSUE_URL =
  'https://github.com/zyniotech/noisegate-lists/issues/new?template=channel-entry.yml';

export const DEFAULT_CORRECTION_ISSUE_URL =
  'https://github.com/zyniotech/noisegate-lists/issues/new?template=correction.yml';

/**
 * Fallback directory used when offline or before initial registry fetch completes.
 */
export const BUNDLED_REGISTRY_ENTRIES: RegistryListEntry[] = [
  {
    id: 'open-channel-topics',
    name: 'Open Channel Directory: Neutral Topics & Signals (JSON v2)',
    description:
      'Community-maintained, source-backed directory categorizing channels by neutral topics (Science, Technology, Education, Gaming, Music) and verifiable disclosures.',
    url: 'https://raw.githubusercontent.com/zyniotech/noisegate-lists/main/lists/starter-topics.json',
    homepage: 'https://github.com/zyniotech/noisegate-lists',
    submissionUrl: DEFAULT_SUBMISSION_ISSUE_URL,
    removalUrl: DEFAULT_CORRECTION_ISSUE_URL,
    defaultAction: 'pass',
    kind: 'topics',
    maintainer: 'zyniotech / Community',
  },
  {
    id: 'synthetic-disclosures',
    name: 'Verified Synthetic Disclosures Directory (JSON v2)',
    description:
      'Curated directory reserved strictly for channels with verifiable official YouTube synthetic-content disclosures.',
    url: 'https://raw.githubusercontent.com/zyniotech/noisegate-lists/main/lists/synthetic-disclosures.json',
    homepage: 'https://github.com/zyniotech/noisegate-lists',
    submissionUrl: DEFAULT_SUBMISSION_ISSUE_URL,
    removalUrl: DEFAULT_CORRECTION_ISSUE_URL,
    defaultAction: 'label',
    kind: 'signals',
    maintainer: 'zyniotech / Community',
  },
  {
    id: 'aislist-warnlist',
    name: 'AiSList: Community Warnlist (Plain-Text, ~1.3k Channels)',
    description: 'Medium-confidence AI channels maintained upstream by Override92/AiSList.',
    url: 'https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_warnlist.txt',
    homepage: 'https://github.com/Override92/AiSList',
    defaultAction: 'label',
    kind: 'community',
    maintainer: 'Override92',
  },
  {
    id: 'aislist-blocklist',
    name: 'AiSList: Full Blocklist (Plain-Text, ~70k Channels)',
    description: 'High-confidence AI channels maintained upstream by Override92/AiSList.',
    url: 'https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt',
    homepage: 'https://github.com/Override92/AiSList',
    defaultAction: 'dim',
    kind: 'community',
    maintainer: 'Override92',
  },
];
