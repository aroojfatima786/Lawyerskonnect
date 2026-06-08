type Bucket = { count: number; resetAt: number };

export class RequestRateLimiter {
  private static buckets = new Map<string, Bucket>();

  static consume(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || now > current.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    this.buckets.set(key, current);
    return true;
  }
}
