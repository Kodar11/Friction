import { describe, expect, it } from 'vitest';
import { hasManagedRegion, renderManagedRegion, spliceManaged } from '../../src/service/hostsWriter/markers.js';
import { HOSTS_BEGIN, HOSTS_END } from '../../src/shared/constants.js';

const NOW = '2026-05-08T22:30:00Z';

const renderTwo = () =>
  renderManagedRegion({
    hosts: ['youtube.com', 'www.youtube.com'],
    now: NOW,
    activeGroupNames: ['Social'],
  });

describe('renderManagedRegion', () => {
  it('produces a region with markers, header, and 127.0.0.1 entries', () => {
    const out = renderTwo();
    expect(out.startsWith(HOSTS_BEGIN)).toBe(true);
    expect(out.trimEnd().endsWith(HOSTS_END)).toBe(true);
    expect(out).toContain('127.0.0.1 youtube.com');
    expect(out).toContain('127.0.0.1 www.youtube.com');
    expect(out).toContain('Currently blocking: Social');
  });

  it('shows (none) when no groups are active', () => {
    const out = renderManagedRegion({ hosts: [], now: NOW, activeGroupNames: [] });
    expect(out).toContain('Currently blocking: (none)');
  });
});

describe('spliceManaged: insert into a clean hosts file', () => {
  it('appends with a leading blank line', () => {
    const original = '127.0.0.1 localhost\n';
    const region = renderTwo();
    const next = spliceManaged(original, region);
    expect(next.startsWith('127.0.0.1 localhost\n')).toBe(true);
    expect(next).toContain(HOSTS_BEGIN);
    expect(next).toContain(HOSTS_END);
    expect(next.endsWith('\n')).toBe(true);
  });

  it('handles empty original', () => {
    const next = spliceManaged('', renderTwo());
    expect(next.trimStart().startsWith(HOSTS_BEGIN)).toBe(true);
  });
});

describe('spliceManaged: replace existing region', () => {
  it('replaces the region between markers, leaving outside content intact', () => {
    const before = '127.0.0.1 localhost\n# something else\n';
    const after = '\n# trailing comment\n';
    const original =
      before +
      '\n' +
      HOSTS_BEGIN +
      '\n# stale comment\n127.0.0.1 reddit.com\n' +
      HOSTS_END +
      after;

    const next = spliceManaged(original, renderTwo());
    // Outside content unchanged
    expect(next.startsWith(before)).toBe(true);
    expect(next.endsWith(after)).toBe(true);
    // New entries are present, stale ones gone
    expect(next).toContain('127.0.0.1 youtube.com');
    expect(next).not.toContain('reddit.com');
  });

  it('is idempotent (modulo identical region)', () => {
    const region = renderTwo();
    const original = '127.0.0.1 localhost\n';
    const once = spliceManaged(original, region);
    const twice = spliceManaged(once, region);
    expect(twice).toBe(once);
  });
});

describe('spliceManaged: removal', () => {
  it('removes markers and region when newRegion is null', () => {
    const original =
      '127.0.0.1 localhost\n\n' +
      HOSTS_BEGIN +
      '\n# managed\n127.0.0.1 youtube.com\n' +
      HOSTS_END +
      '\n';
    const next = spliceManaged(original, null);
    expect(next).not.toContain(HOSTS_BEGIN);
    expect(next).not.toContain('youtube.com');
    expect(next).toContain('127.0.0.1 localhost');
  });

  it('is a no-op when no region exists and we ask to remove', () => {
    const original = '127.0.0.1 localhost\n';
    expect(spliceManaged(original, null)).toBe(original);
  });
});

describe('spliceManaged: line endings', () => {
  it('preserves CRLF line endings', () => {
    const original = '127.0.0.1 localhost\r\n';
    const next = spliceManaged(original, renderTwo());
    expect(next.includes('\r\n')).toBe(true);
    // Should not have introduced any bare \n outside of segments we control
    const splitByCrlf = next.split('\r\n').join('');
    expect(splitByCrlf.includes('\n')).toBe(false);
  });
});

describe('spliceManaged: corrupt markers', () => {
  it('throws when only BEGIN is present', () => {
    const original = '127.0.0.1 localhost\n' + HOSTS_BEGIN + '\noops\n';
    expect(() => spliceManaged(original, renderTwo())).toThrow(/unpaired/);
  });
});

describe('hasManagedRegion', () => {
  it('detects region presence', () => {
    expect(hasManagedRegion('127.0.0.1 localhost\n')).toBe(false);
    const next = spliceManaged('127.0.0.1 localhost\n', renderTwo());
    expect(hasManagedRegion(next)).toBe(true);
  });
});
