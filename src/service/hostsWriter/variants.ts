/**
 * Domain variant expansion (decision #12 + #13):
 *   - Block exactly what the user typed.
 *   - Auto-expand to include `www.` and `m.` siblings, but only when the
 *     user didn't already type a subdomain we recognise.
 *
 * Rules:
 *   - Lowercase + trim trailing dot.
 *   - For an apex domain like `youtube.com`, emit:
 *       youtube.com, www.youtube.com, m.youtube.com
 *   - For `www.youtube.com`, emit:
 *       www.youtube.com, youtube.com, m.youtube.com
 *   - For `m.youtube.com`, emit:
 *       m.youtube.com, youtube.com, www.youtube.com
 *   - For `mail.youtube.com` (an unrecognised subdomain), emit only itself.
 *     We don't auto-expand because the user was specific.
 *
 * Output is deduped and sorted for deterministic hosts-file output.
 */

const KNOWN_PREFIXES = ['www.', 'm.'];

export function expandVariants(input: string): string[] {
  const cleaned = sanitize(input);
  if (!cleaned) return [];

  const labels = cleaned.split('.');
  // We treat anything with 2 labels (a.b) as an apex; 3+ labels is "has subdomain".
  // For known prefixes (www., m.) on a 3+ label name, we still expand to siblings.
  if (labels.length < 2) return [];

  const matchedPrefix = KNOWN_PREFIXES.find((p) => cleaned.startsWith(p));
  if (matchedPrefix) {
    const apex = cleaned.slice(matchedPrefix.length);
    return apexAndSiblings(apex);
  }

  if (labels.length === 2) {
    return apexAndSiblings(cleaned);
  }

  // Has an unrecognised subdomain (e.g. mail.youtube.com): block exactly.
  return [cleaned];
}

function apexAndSiblings(apex: string): string[] {
  const out = new Set<string>([apex, ...KNOWN_PREFIXES.map((p) => p + apex)]);
  return [...out].sort();
}

function sanitize(input: string): string {
  let s = input.trim().toLowerCase();
  // Strip optional trailing dot (FQDN form).
  if (s.endsWith('.')) s = s.slice(0, -1);
  // Reject anything with a scheme, path, port, query, or whitespace.
  if (/[\s/?#:]/.test(s)) return '';
  // Must contain at least one dot.
  if (!s.includes('.')) return '';
  // Bare-hostname-ish guard.
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(s)) return '';
  return s;
}

/** Expand a list of user-entered sites into all hosts-file entries to write. */
export function expandAll(sites: string[]): string[] {
  const out = new Set<string>();
  for (const s of sites) {
    for (const v of expandVariants(s)) out.add(v);
  }
  return [...out].sort();
}
