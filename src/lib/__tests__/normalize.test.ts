import { describe, expect, it } from 'vitest';
import {
  buildCanonicalChannelKey,
  extractVideoId,
  formatHandle,
  normalizeChannelId,
  normalizeHandle,
  parseYouTubeChannelHref,
  sanitizeHttpUrl,
} from '../normalize';

describe('normalize helpers', () => {
  it('validates canonical UC channel IDs and extracts from /channel/ URLs', () => {
    const validId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
    expect(normalizeChannelId(validId)).toBe(validId);
    expect(normalizeChannelId(`https://www.youtube.com/channel/${validId}/videos`)).toBe(validId);
    expect(normalizeChannelId('UCshort')).toBeUndefined();
    expect(normalizeChannelId('@SuperCatLeague')).toBeUndefined();
  });

  it('normalizes YouTube handles consistently to lowercase without @', () => {
    expect(normalizeHandle('@SuperCatLeague')).toBe('supercatleague');
    expect(normalizeHandle('/@MakeTechFuture/videos')).toBe('maketechfuture');
    expect(normalizeHandle('https://www.youtube.com/@PapaMeat?sub_confirmation=1')).toBe('papameat');
    expect(formatHandle('SuperCatLeague')).toBe('@supercatleague');
  });

  it('parses channel hrefs cleanly', () => {
    expect(parseYouTubeChannelHref('/@CinebotComedy')).toEqual({ handle: 'cinebotcomedy' });
    expect(parseYouTubeChannelHref('/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw')).toEqual({
      channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
    });
  });

  it('extracts video IDs from watch, shorts, and raw strings', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('/feed/subscriptions')).toBeUndefined();
  });

  it('prefers UC channel ID over handle when building canonical keys', () => {
    expect(
      buildCanonicalChannelKey({
        channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
        handle: '@GoogleDevelopers',
      }),
    ).toBe('UC_x5XG1OV2P6uZZ5FSM9Ttw');
    expect(buildCanonicalChannelKey({ handle: '@SuperCatLeague' })).toBe('@supercatleague');
  });

  it('rejects non-http(s) URLs in sanitizeHttpUrl', () => {
    expect(sanitizeHttpUrl('https://github.com/Override92/AiSList')).toBe(
      'https://github.com/Override92/AiSList',
    );
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeUndefined();
  });
});
