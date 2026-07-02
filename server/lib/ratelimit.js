// Fixed-window in-memory rate limiter. For multi-instance production deploys,
// replace the store with Redis (interface kept minimal on purpose).
const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 30, key = (req) => req.ip, name = 'rl' }) {
  return (req, res, next) => {
    const now = Date.now();
    const k = `${name}:${key(req)}`;
    let b = buckets.get(k);
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(k, b); }
    b.count += 1;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}

// occasional cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60_000).unref();
