// Rate limiting middleware for wallet trust scoring API

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: any) => string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export const RATE_LIMITS = {
  ANALYSIS: {
    windowMs: 60 * 60 * 1000,
    maxRequests: parseInt(process.env.ANALYSIS_RATE_LIMIT || "100"),
  },
  STATUS: {
    windowMs: 60 * 60 * 1000,
    maxRequests: parseInt(process.env.STATUS_RATE_LIMIT || "1000"),
  },
  DEFAULT: {
    windowMs: 15 * 60 * 1000,
    maxRequests: parseInt(process.env.DEFAULT_RATE_LIMIT || "200"),
  },
} as const;

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function defaultKeyGenerator(req: any): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0] : req.ip || "unknown";
  return `rate_limit:${ip}`;
}

export async function checkRateLimit(
  req: any,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;
  const key = keyGenerator(req);
  const now = Date.now();
  const window = Math.floor(now / config.windowMs);
  const storeKey = `${key}:${window}`;

  let entry = rateLimitStore.get(storeKey);

  if (!entry) {
    entry = {
      count: 0,
      resetTime: (window + 1) * config.windowMs,
    };
    rateLimitStore.set(storeKey, entry);
  }

  entry.count++;

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const retryAfter =
    entry.count > config.maxRequests
      ? Math.ceil((entry.resetTime - now) / 1000)
      : undefined;

  cleanupOldEntries(now);

  return {
    success: entry.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining,
    resetTime: entry.resetTime,
    retryAfter,
  };
}

function cleanupOldEntries(now: number): void {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async (req: any): Promise<any | null> => {
    const result = await checkRateLimit(req, config);

    if (!result.success) {
      const { NextResponse } = await import("next/server");

      const headers = new Headers();
      headers.set("X-RateLimit-Limit", result.limit.toString());
      headers.set("X-RateLimit-Remaining", result.remaining.toString());
      headers.set(
        "X-RateLimit-Reset",
        Math.ceil(result.resetTime / 1000).toString()
      );

      if (result.retryAfter) {
        headers.set("Retry-After", result.retryAfter.toString());
      }

      return new NextResponse(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Too many requests. Limit: ${result.limit} requests per hour.`,
          retryAfter: result.retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...Object.fromEntries(headers.entries()),
          },
        }
      );
    }

    return null;
  };
}

export function resetRateLimit(key: string): void {
  for (const storeKey of rateLimitStore.keys()) {
    if (storeKey.startsWith(key)) {
      rateLimitStore.delete(storeKey);
    }
  }
}

export function clearAllRateLimits(): void {
  rateLimitStore.clear();
}
