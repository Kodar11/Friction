import { describe, expect, it } from 'vitest';
import { expandAll, expandVariants } from '../../src/service/hostsWriter/variants.js';

describe('expandVariants', () => {
  it('apex domain expands to bare + www + m', () => {
    expect(expandVariants('youtube.com')).toEqual([
      'm.youtube.com',
      'www.youtube.com',
      'youtube.com',
    ]);
  });

  it('www. prefix expands to siblings', () => {
    expect(expandVariants('www.youtube.com')).toEqual([
      'm.youtube.com',
      'www.youtube.com',
      'youtube.com',
    ]);
  });

  it('m. prefix expands to siblings', () => {
    expect(expandVariants('m.youtube.com')).toEqual([
      'm.youtube.com',
      'www.youtube.com',
      'youtube.com',
    ]);
  });

  it('unrecognised subdomain blocks exactly that hostname', () => {
    expect(expandVariants('mail.youtube.com')).toEqual(['mail.youtube.com']);
  });

  it('strips trailing dot and is case-insensitive', () => {
    expect(expandVariants('YouTube.COM.')).toEqual([
      'm.youtube.com',
      'www.youtube.com',
      'youtube.com',
    ]);
  });

  it('rejects malformed input', () => {
    expect(expandVariants('https://youtube.com')).toEqual([]);
    expect(expandVariants('youtube.com/path')).toEqual([]);
    expect(expandVariants('youtube.com:443')).toEqual([]);
    expect(expandVariants('localhost')).toEqual([]);
    expect(expandVariants('')).toEqual([]);
    expect(expandVariants('   ')).toEqual([]);
  });
});

describe('expandAll', () => {
  it('dedupes across inputs', () => {
    const out = expandAll(['youtube.com', 'm.youtube.com', 'instagram.com']);
    expect(out).toEqual([
      'instagram.com',
      'm.instagram.com',
      'm.youtube.com',
      'www.instagram.com',
      'www.youtube.com',
      'youtube.com',
    ]);
  });

  it('drops malformed entries silently', () => {
    expect(expandAll(['youtube.com', 'not a host'])).toEqual([
      'm.youtube.com',
      'www.youtube.com',
      'youtube.com',
    ]);
  });
});
