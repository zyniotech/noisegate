import { describe, expect, it } from 'vitest';
import {
  parseFilterListContent,
  parseJsonFilterList,
  parsePlainTextFilterList,
  parseRegistryJson,
} from '../schema';
import { BUNDLED_AISLIST_TEST_SAMPLE } from '../starter-list';

describe('filter list schema v1/v2, plain-text, and registry parsers', () => {
  it('validates the bundled AiSList test sample JSON v1 list', () => {
    const res = parseJsonFilterList(BUNDLED_AISLIST_TEST_SAMPLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.list.format).toBe('json-v1');
    expect(res.list.listId).toBe('aislist-test-sample');
    expect(res.list.entries.length).toBe(25);
  });

  it('parses NoiseGate JSON v2 lists with neutral topics, signals, and submission URLs', () => {
    const res = parseJsonFilterList({
      schemaVersion: 2,
      listId: 'open-topics',
      name: 'Open Channel Directory',
      submissionUrl: 'https://github.com/zyniotech/noisegate-lists/issues/new?template=channel-entry.yml',
      removalUrl: 'https://github.com/zyniotech/noisegate-lists/issues/new?template=correction.yml',
      updatedAt: '2026-11-23T00:00:00Z',
      channels: {
        UC_x5XG1OV2P6uZZ5FSM9Ttw: {
          topics: ['science', 'education', 'INVALID_TOPIC'],
          signals: ['ypp-memberships'],
          note: 'Public STEM tutorials',
          evidenceUrl: 'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw',
        },
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.list.format).toBe('json-v2');
    expect(res.list.submissionUrl).toContain('zyniotech/noisegate-lists');
    expect(res.list.entries[0]?.topics).toEqual(['science', 'education']);
    expect(res.list.entries[0]?.signals).toEqual(['ypp-memberships']);
    expect(res.list.entries[0]?.category).toBe('topic-match');
  });

  it('rejects unsupported schema versions', () => {
    const res = parseJsonFilterList({ schemaVersion: 99, listId: 'x', name: 'X', updatedAt: 'now' });
    expect(res.ok).toBe(false);
  });

  it('parses AiSList plain-text format with headers and deduplication', () => {
    const sample = `
! Title: AISList - Blocklist
! Description: Community-maintained list
! Homepage: https://aisloplist.com
! Last Modified: 2026-07-19
@SuperCatLeague
@supercatleague
UC_x5XG1OV2P6uZZ5FSM9Ttw
@MastersOfProphecy
    `;

    const res = parsePlainTextFilterList(sample);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.list.format).toBe('plaintext-aislist');
    expect(res.list.name).toBe('AISList - Blocklist');
    expect(res.list.entries).toHaveLength(3);
  });

  it('auto-detects JSON vs plain-text in parseFilterListContent', () => {
    const jsonRes = parseFilterListContent(JSON.stringify(BUNDLED_AISLIST_TEST_SAMPLE));
    expect(jsonRes.ok).toBe(true);
    if (jsonRes.ok) expect(jsonRes.list.format).toBe('json-v1');

    const txtRes = parseFilterListContent('! Title: Demo\n@SuperCatLeague\n');
    expect(txtRes.ok).toBe(true);
    if (txtRes.ok) expect(txtRes.list.format).toBe('plaintext-aislist');
  });

  it('parses open registry manifests safely', () => {
    const entries = parseRegistryJson({
      lists: [
        {
          id: 'open-topics',
          name: 'Open Channel Directory',
          description: 'Neutral topic directory',
          url: 'https://raw.githubusercontent.com/zyniotech/noisegate-lists/main/lists/starter-topics.json',
          defaultAction: 'pass',
          kind: 'topics',
          maintainer: 'zyniotech',
        },
        {
          id: 'bad-entry',
          name: 'Unsafe',
          url: 'javascript:alert(1)',
        },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('topics');
    expect(entries[0]?.defaultAction).toBe('pass');
  });

  it('rejects HTML/CSS captive portal responses and unsafe prototype keys', () => {
    const htmlRes = parseFilterListContent('<!doctype html><html><body>@media screen {}</body></html>');
    expect(htmlRes.ok).toBe(false);

    const cssRes = parseFilterListContent('@media (min-width: 600px) { .test { color: red; } }');
    expect(cssRes.ok).toBe(false);

    const protoList = parseJsonFilterList({
      schemaVersion: 2,
      listId: 'constructor',
      name: 'Safety Check',
      updatedAt: '2026-11-23T00:00:00Z',
      channels: {},
      handles: {
        '@constructor': { topics: ['science'] },
        '@toString': { signals: ['yt-paid-promotion'] },
      },
    });
    expect(protoList.ok).toBe(true);
    if (protoList.ok) {
      expect(protoList.list.entries).toHaveLength(0);
    }
  });

  it('infers disclosure-detected and paid-promotion categories accurately in Schema v2', () => {
    const res = parseJsonFilterList({
      schemaVersion: 2,
      listId: 'signals-test',
      name: 'Signals Test',
      updatedAt: '2026-11-23T00:00:00Z',
      channels: {
        'UCYO_jab_esuFRV4b17AJtAw': {
          signals: ['yt-synthetic-disclosure', 'invalid-signal'],
        },
        'UCHnyfMqiRRG1u-2MsSQLbXA': {
          signals: ['yt-paid-promotion'],
        },
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.list.entries[0]?.category).toBe('disclosure-detected');
    expect(res.list.entries[0]?.signals).toEqual(['yt-synthetic-disclosure']);
    expect(res.list.entries[1]?.category).toBe('paid-promotion');
  });
});
