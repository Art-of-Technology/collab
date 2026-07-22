import dns from 'dns';
import net from 'net';

/**
 * SSRF protection helpers.
 *
 * Server-side fetches to user-supplied URLs (webhook targets, JWKS URIs, etc.)
 * must be validated *by resolved IP*, not just by hostname string matching.
 * Hostname string checks miss cloud metadata (169.254.169.254), 0.0.0.0,
 * IPv6 loopback/ULA (::1, fc00::/7), decimal/octal encoded IPs, and
 * DNS-rebinding tricks.
 *
 * `assertSafeUrl` resolves the host and throws if it maps to a private,
 * loopback, link-local, or otherwise disallowed range. Callers should fetch
 * with `redirect: 'manual'` (or otherwise disable redirects) so a safe URL
 * cannot 3xx to an internal one after this check.
 */

const resolve4 = (host: string): Promise<string[]> =>
  new Promise((resolvePromise) => {
    dns.resolve4(host, (err, addresses) => resolvePromise(err ? [] : addresses));
  });

const resolve6 = (host: string): Promise<string[]> =>
  new Promise((resolvePromise) => {
    dns.resolve6(host, (err, addresses) => resolvePromise(err ? [] : addresses));
  });

function ipv4ToParts(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

/**
 * Returns true when an IPv4 address is in a private, loopback, link-local,
 * cloud-metadata, or otherwise non-public range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ipv4ToParts(ip);
  if (!parts) return true; // Unparseable -> treat as unsafe
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8 (incl. 0.0.0.0)
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24 (test)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

/**
 * Returns true when an IPv6 address is loopback, link-local, unique-local,
 * unspecified, or an IPv4-mapped/compatible address in a private v4 range.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().split('%')[0]; // strip zone id

  if (lower === '::1' || lower === '::') return true; // loopback / unspecified

  // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible -> validate the v4 part
  const v4Match = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Match) return isPrivateIPv4(v4Match[1]);

  const firstHextet = lower.split(':')[0];
  const head = parseInt(firstHextet || '0', 16);

  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

export function isDisallowedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP literal -> unsafe
}

export interface AssertSafeUrlOptions {
  /** Allowed URL protocols. Defaults to https only. */
  allowedProtocols?: string[];
}

/**
 * Validates a user-supplied URL for server-side fetching.
 * Throws an Error when the protocol is not allowed or the host resolves to a
 * private / loopback / link-local / metadata address.
 */
export async function assertSafeUrl(
  rawUrl: string,
  options: AssertSafeUrlOptions = {}
): Promise<URL> {
  const { allowedProtocols = ['https:'] } = options;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(`URL protocol not allowed: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Reject obvious hostnames outright before resolving.
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('URL host is not allowed');
  }

  // If the host is already an IP literal, validate it directly.
  if (net.isIP(hostname)) {
    if (isDisallowedIp(hostname)) {
      throw new Error('URL resolves to a disallowed IP range');
    }
    return url;
  }

  // Resolve the hostname and reject if ANY resolved address is disallowed.
  const [v4, v6] = await Promise.all([resolve4(hostname), resolve6(hostname)]);
  const addresses = [...v4, ...v6];

  if (addresses.length === 0) {
    throw new Error('URL host could not be resolved');
  }

  if (addresses.some((addr) => isDisallowedIp(addr))) {
    throw new Error('URL resolves to a disallowed IP range');
  }

  return url;
}

/** Non-throwing variant. */
export async function isSafeUrl(
  rawUrl: string,
  options?: AssertSafeUrlOptions
): Promise<boolean> {
  try {
    await assertSafeUrl(rawUrl, options);
    return true;
  } catch {
    return false;
  }
}
