// Fixed-window, in-memory, per-client-IP limiter. Not shared across processes.
export function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const windows = new Map(); // ip -> { count, resetAt }

  return (req, res, next) => {
    const t = now();
    for (const [ip, window] of windows) if (window.resetAt <= t) windows.delete(ip);

    const window = windows.get(req.ip) ?? { count: 0, resetAt: t + windowMs };
    windows.set(req.ip, window);
    if (++window.count > limit) {
      res.set("Retry-After", String(Math.ceil((window.resetAt - t) / 1000)));
      res.status(429).json({ error: "Too many requests; slow down and try again shortly" });
      return;
    }
    next();
  };
}
