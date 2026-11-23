import { describe, expect, it } from 'vitest';
import {
  buildGitHubSubmissionUrl,
  formatMonetizationSummary,
  hasObservedYppSignals,
  mapYouTubeCategoryToTopic,
  normalizeObservableSignal,
  normalizeYppSignal,
  YPP_SIGNAL_LABELS,
} from '../taxonomy';

describe('taxonomy, monetization formatting & GitHub deep-links', () => {
  it('maps English and German YouTube categories to neutral topic IDs', () => {
    expect(mapYouTubeCategoryToTopic('Science & Technology')).toBe('science');
    expect(mapYouTubeCategoryToTopic('Wissenschaft & Technik')).toBe('science');
    expect(mapYouTubeCategoryToTopic('Gaming')).toBe('gaming');
    expect(mapYouTubeCategoryToTopic('Entertainment')).toBe('entertainment');
    expect(mapYouTubeCategoryToTopic('Unterhaltung')).toBe('entertainment');
  });

  it('normalizes ypp-partner alongside concrete YPP signals', () => {
    expect(YPP_SIGNAL_LABELS['ypp-partner']).toBe('Partner (Monetized)');
    expect(normalizeYppSignal('ypp-partner')).toBe('ypp-partner');
    expect(normalizeYppSignal(' YPP-MEMBERSHIPS ')).toBe('ypp-memberships');
    expect(normalizeObservableSignal('ypp-partner')).toBe('ypp-partner');
    expect(hasObservedYppSignals([])).toBe(false);
    expect(hasObservedYppSignals(undefined)).toBe(false);
    expect(hasObservedYppSignals(['ypp-partner'])).toBe(true);
    expect(hasObservedYppSignals(['ypp-memberships'])).toBe(true);
  });

  it('formats YPP monetization signals factually without false non-monetized claims', () => {
    expect(formatMonetizationSummary([], false)).toBe('Not yet inspected on Watch or Channel page');
    expect(formatMonetizationSummary([], true)).toBe('YPP status not publicly shown');
    expect(formatMonetizationSummary(['ypp-partner'], true)).toBe('YPP: Monetized (Partner)');
    expect(formatMonetizationSummary(['ypp-memberships', 'ypp-super-thanks'], true)).toBe(
      'YPP: Monetized (Memberships, Super Thanks)',
    );
    expect(
      formatMonetizationSummary(['ypp-partner', 'ypp-super-thanks', 'ypp-memberships'], true),
    ).toBe('YPP: Monetized (Memberships, Super Thanks)');
    expect(
      formatMonetizationSummary(['ypp-memberships', 'ypp-memberships', 'ypp-shopping'], true),
    ).toBe('YPP: Monetized (Memberships, Shopping)');
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
        yppSignals: ['ypp-partner', 'ypp-memberships'],
      },
    );

    expect(url).toBeDefined();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('channel_id')).toBe('UC_x5XG1OV2P6uZZ5FSM9Ttw');
    expect(parsed.searchParams.get('channel_handle')).toBe('@GoogleDevelopers');
    expect(parsed.searchParams.get('topics')).toBe('technology, education');
    expect(parsed.searchParams.get('signals')).toBe('ypp-partner, ypp-memberships');
  });

  it('overwrites wrong template params, uses handle evidence fallback, and maps raw categories cleanly', () => {
    const url = buildGitHubSubmissionUrl(
      'https://github.com/zyniotech/noisegate-lists/issues/new?template=correction.yml',
      {
        handle: 'mkbhd',
        channelName: 'Marques Brownlee',
      },
      {
        rawYouTubeCategory: 'Wissenschaft & Technik',
        yppSignals: ['yt-paid-promotion', 'ypp-shopping'],
        template: 'channel-entry.yml',
      },
    );
    expect(url).toBeDefined();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get('template')).toBe('channel-entry.yml');
    expect(parsed.searchParams.get('evidence_url')).toBe('https://www.youtube.com/@mkbhd');
    expect(parsed.searchParams.get('topics')).toBe('science');
    expect(parsed.searchParams.get('signals')).toBe('yt-paid-promotion, ypp-shopping');
  });
});
