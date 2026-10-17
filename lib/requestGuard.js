// Blocks cross-site and DNS-rebinding requests to a local, login-free app.
// No CORS headers are ever set, so the custom-header requirement below can't
// be satisfied by a cross-origin page (it would need a preflight that fails).

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE = "vet-agent";

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function parseUrl(value) {
  try {
    return new URL(value, "http://invalid");
  } catch {
    return null;
  }
}

const hostnameOf = (host) => parseUrl(`//${host}`)?.hostname;

// Allowed hosts derive from the configured bind host plus ALLOWED_HOSTS
// (comma-separated, for reverse-proxy hostnames).
export function defaultAllowedHosts(env = process.env) {
  const extra = (env.ALLOWED_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);
  return [...LOOPBACK_HOSTS, ...(env.HOST ? [env.HOST] : []), ...extra];
}

export function createRequestGuard({ allowedHosts = defaultAllowedHosts() } = {}) {
  const allowed = new Set(allowedHosts.map((h) => hostnameOf(h)).filter(Boolean));

  return (req, res, next) => {
    const deny = (reason) => res.status(403).json({ error: reason });

    if (!allowed.has(hostnameOf(req.headers.host))) return deny("Host not allowed");

    if (req.path.startsWith("/api/")) {
      const source = req.headers.origin ?? req.headers.referer;
      if (source !== undefined && parseUrl(source)?.host !== req.headers.host) {
        return deny("Cross-origin request blocked");
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD" && req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      return deny(`Missing ${CSRF_HEADER} header`);
    }
    next();
  };
}
