import { describe, expect, it } from 'vitest';
import { parseHost } from '../../src/shared/parseHost.js';

describe('parseHost', () => {
  it('passes through bare hostnames', () => {
    expect(parseHost('youtube.com')).toBe('youtube.com');
    expect(parseHost('news.ycombinator.com')).toBe('news.ycombinator.com');
  });

  it('lowercases and trims', () => {
    expect(parseHost('  YouTube.COM  ')).toBe('youtube.com');
  });

  it('strips scheme', () => {
    expect(parseHost('https://youtube.com')).toBe('youtube.com');
    expect(parseHost('http://youtube.com')).toBe('youtube.com');
    expect(parseHost('//youtube.com')).toBeNull(); // no scheme letter
  });

  it('strips path / query / fragment', () => {
    expect(parseHost('youtube.com/watch?v=abc')).toBe('youtube.com');
    expect(parseHost('https://www.youtube.com/watch?v=abc#t=10')).toBe('www.youtube.com');
  });

  it('strips port', () => {
    expect(parseHost('m.youtube.com:8080')).toBe('m.youtube.com');
    expect(parseHost('https://m.youtube.com:8080/path')).toBe('m.youtube.com');
  });

  it('strips user info', () => {
    expect(parseHost('https://user:pass@example.com/x')).toBe('example.com');
  });

  it('strips trailing dot from FQDN', () => {
    expect(parseHost('youtube.com.')).toBe('youtube.com');
  });

  it('rejects single-label inputs', () => {
    expect(parseHost('localhost')).toBeNull();
    expect(parseHost('intranet')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(parseHost('')).toBeNull();
    expect(parseHost('   ')).toBeNull();
    expect(parseHost('not a url')).toBeNull();
    expect(parseHost('!!')).toBeNull();
    expect(parseHost('.com')).toBeNull(); // empty first label
    expect(parseHost('com.')).toBeNull(); // single label after stripping trailing dot
  });
});
