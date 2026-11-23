import { describe, expect, it } from 'vitest';
import {
  buildCanonicalChannelKey,
  extractVideoId,
  formatHandle,
  isValidRepoSlug,
  normalizeChannelId,
  normalizeHandle,
  parseYouTubeChannelHref,
  sanitizeHttpUrl,
  sanitizePublicHttpsUrl,
} from '../normalize';

describe('normalize helpers', () => {
  it('validates canonical UC channel IDs and extracts from /channel/ URLs', () => {
    const validId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
    expect(normalizeChannelId(validId)).toBe(validId);
    expect(normalizeChannelId(`https://www.youtube.com/channel/${validId}/videos`)).toBe(validId);
    expect(normalizeChannelId('UCshort')).toBeUndefined();
    expect(normalizeChannelId('@SuperCatLeague')).toBeUndefined();
  });

  it('normalizes YouTube handles consistently and rejects non-handle URLs or prototype keys', () => {
    expect(normalizeHandle('@SuperCatLeague')).toBe('supercatleague');
    expect(normalizeHandle('/@MakeTechFuture/videos')).toBe('maketechfuture');
    expect(normalizeHandle('https://www.youtube.com/@PapaMeat?sub_confirmation=1')).toBe('papameat');
    expect(normalizeHandle('https://www.youtube.com/c/Veritasium')).toBeUndefined();
    expect(normalizeHandle('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(normalizeHandle('/user/SomeUser')).toBeUndefined();
    expect(normalizeHandle('@constructor')).toBeUndefined();
    expect(normalizeHandle('@toString')).toBeUndefined();
    expect(normalizeHandle('__proto__')).toBeUndefined();
    expect(formatHandle('SuperCatLeague')).toBe('@supercatleague');
  });

  it('parses channel hrefs cleanly without producing bogus @https handles', () => {
    expect(parseYouTubeChannelHref('/@CinebotComedy')).toEqual({ handle: 'cinebotcomedy' });
    expect(parseYouTubeChannelHref('/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw')).toEqual({
      channelId: 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
    });
    expect(parseYouTubeChannelHref('https://www.youtube.com/c/LegacyChannel')).toEqual({});
  });

  it('extracts video IDs from watch, shorts, live, and youtu.be URLs while rejecting prototype keys', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ?si=test')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('/feed/subscriptions')).toBeUndefined();
    expect(extractVideoId('constructor')).toBeUndefined();
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

  it('enforces HTTPS, strips credentials, and blocks private hosts in public URL validation', () => {
    expect(sanitizeHttpUrl('https://github.com/Override92/AiSList')).toBe(
      'https://github.com/Override92/AiSList',
    );
    expect(sanitizeHttpUrl('http://example.com/list.json')).toBeUndefined();
    expect(sanitizeHttpUrl('https://user:pass@github.com/list.json')).toBeUndefined();
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeUndefined();

    expect(sanitizePublicHttpsUrl('https://raw.githubusercontent.com/zyniotech/noisegate-lists/main/registry.json')).toBeDefined();
    expect(sanitizePublicHttpsUrl('https://localhost/test.json')).toBeUndefined();
    expect(sanitizePublicHttpsUrl('https://127.0.0.1/test.json')).toBeUndefined();
    expect(sanitizePublicHttpsUrl('https://192.168.1.50/test.json')).toBeUndefined();

    expect(isValidRepoSlug('zyniotech/noisegate-lists')).toBe(true);
    expect(isValidRepoSlug('https://github.com/zyniotech/noisegate-lists')).toBe(false);
    expect(isValidRepoSlug('zyniotech/../evil')).toBe(false);
  });
});
