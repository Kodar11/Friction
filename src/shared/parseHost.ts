/**
 * Lenient host parser. Accepts whatever a user is likely to paste — full
 * URLs, schemes, paths, ports, FQDNs, mixed case — and returns a clean,
 * lowercased hostname. Returns null if it can't extract one.
 *
 * Examples:
 *   youtube.com                              → youtube.com
 *   https://www.youtube.com/watch?v=foo      → www.youtube.com
 *   http://m.youtube.com:8080/path           → m.youtube.com
 *   YOUTUBE.com.                             → youtube.com
 *   https://user:pass@example.com/x          → example.com
 *   not a url                                → null
 *   localhost                                → null  (no dot — variant expansion needs at least one)
 *
 * The downstream variant expander (service/hostsWriter/variants.ts) is what
 * adds www./m. siblings at hosts-write time. We don't strip those prefixes
 * here — if the user explicitly typed `m.youtube.com`, save it as such, and
 * the expander will still emit www./bare/m sibling entries.
 */

const HOST_REGEX = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;

export function parseHost(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;

  // Strip scheme (http://, https://, file://, ssh:// …).
  s = s.replace(/^[a-z][a-z0-9+\-.]*:\/+/, '');
  // Strip user info (user:pass@host).
  const at = s.indexOf('@');
  if (at >= 0) s = s.slice(at + 1);
  // Cut off the path / query / fragment.
  s = s.split(/[/?#]/)[0];
  // Strip the port.
  s = s.split(':')[0];
  // Strip a trailing dot from FQDN form.
  s = s.replace(/\.$/, '');

  if (!s) return null;
  if (!s.includes('.')) return null;
  if (!HOST_REGEX.test(s)) return null;
  // Two or more labels, each non-empty.
  if (s.split('.').some((label) => label.length === 0)) return null;
  return s;
}
