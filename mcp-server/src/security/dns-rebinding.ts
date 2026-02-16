/**
 * DNS rebinding attack protection
 *
 * Validates Host and Origin headers to prevent DNS rebinding attacks.
 * This is an opt-in security feature, disabled by default to allow local development.
 */

const ALLOWED_HOSTS = [
  'cachebash-922749444863.us-central1.run.app',
  'localhost',
  '127.0.0.1',
  '::1',
];

/**
 * Validate request headers for DNS rebinding protection
 */
export function validateRequestHeaders(
  host: string | undefined,
  origin: string | undefined,
  allowedOrigins: string[] = []
): { valid: boolean; error?: string } {
  // Check Host header
  if (!host) {
    return {
      valid: false,
      error: 'Missing Host header',
    };
  }

  // Extract hostname from Host (may include port)
  const hostname = host.split(':')[0];

  // Check if hostname is in allowed list
  const allowedHosts = [...ALLOWED_HOSTS, ...allowedOrigins];
  if (!allowedHosts.some(allowed => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
    return {
      valid: false,
      error: `Invalid Host header: ${hostname}`,
    };
  }

  // If Origin is present, validate it
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const originHostname = originUrl.hostname;

      if (!allowedHosts.some(allowed => originHostname === allowed || originHostname.endsWith(`.${allowed}`))) {
        return {
          valid: false,
          error: `Invalid Origin header: ${origin}`,
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: `Malformed Origin header: ${origin}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Check if a host is localhost
 */
export function isLocalhost(host: string): boolean {
  const hostname = host.split(':')[0];
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
