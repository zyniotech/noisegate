import { describe, expect, it } from 'vitest';
import {
  buildGitHubSubmissionUrl,
  formatMonetizationSummary,
  mapYouTubeCategoryToTopic,
} from '../taxonomy';

describe('taxonomy, monetization formatting & GitHub deep-links', () => {
  it('maps English and German YouTube categories to neutral topic IDs', () => {
    expect(mapYouTubeCategoryToTopic('Science & Technology')).toBe('science');
    expect(mapYouTubeCategoryToTopic('Wissenschaft & Technik')).toBe('science');
    expect(mapYouTubeCategoryToTopic('Gaming')).toBe('gaming');
    expect(mapYouTubeCategoryToTopic('Entertainment')).toBe('entertainment');
    expect(mapYouTubeCategoryToTopic('Unterhaltung')).toBe('entertainment');
  });

  it('formats YPP monetization signals factually without assumptions', () => {
    expect(formatMonetizationSummary([], false)).toBe('Not yet inspected');
    expect(formatMonetizationSummary([], true)).toBe('No public YPP signals observed');
    expect(formatMonetizationSummary(['ypp-memberships', 'ypp-super-thanks'], true)).toBe(
      'YPP signals: Memberships, Super Thanks',
    );
  });

  it('builds valid prefilled GitHub Issue submission URLs', () => {
    const url = buildGitHubSubmissionUrl(
      'https://github.com/zyniotech/noisegate-lists/issues/new?template=channel-entry.yml',
      {
        channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
        handle: 'GoogleDevelopers',
        channelName: 'Google for Developers',
        videoId: 'dQw4w9WgXcQ',
      },
      {
        topics: ['technology', 'education'],
        yppSignals: ['ypp-memberships'],
      },
    );

    expect(url).toBeDefined();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('channel_id')).toBe('UC_x5XG1OV2P6uZZ5FSM9Ttw');
    expect(parsed.searchParams.get('channel_handle')).toBe('@GoogleDevelopers');
    expect(parsed.searchParams.get('topics')).toBe('technology, education');
    expect(parsed.searchParams.get('signals')).toBe('ypp-memberships');
  });
});
