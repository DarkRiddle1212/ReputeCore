// Professional rate limiting system

import { NextRequest } from "next/server";
import { cache } from "./cache";

interface RateLimitResult {
  success: boolean;
  remaining?: number;
  resetTime?: number;
  retryAfter?: number;
}

interface RateLimitConfig {
  requests: number;
  window: number; // in seconds
  keyGenerator?: (req: NextRequest) => string;
}

const defaultConfig: RateLimitConfig = {
  requests: parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE || "60"),
  window: 60, // 1 minute
};

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIP = req.headers.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return "unknown";
}

function generateKey(req: NextRequest): string {
  const ip = getClientIP(req);
  const userAgent = req.headers.get("user-agent") || "unknown";

  // Create a more sophisticated key that considers both IP and user agent
  // This helps prevent abuse while allowing legitimate users
  return `rate_limit:${ip}:${Buffer.from(userAgent).toString("base64").slice(0, 10)}`;
}

export async function rateLimit(
  req: NextRequest,
  config: Partial<RateLimitConfig> = {}
): Promise<RateLimitResult> {
  const { requests, window, keyGenerator } = { ...defaultConfig, ...config };

  const key = keyGenerator ? keyGenerator(req) : generateKey(req);
  const now = Date.now();
  const windowStart = now - window * 1000;

  try {
    // Get current request count for this window
    const requestLog = (await cache.get<number[]>(key)) || [];

    // Filter out requests outside the current window
    const recentRequests = requestLog.filter(
      (timestamp) => timestamp > windowStart
    );

    // Check if limit exceeded
    if (recentRequests.length >= requests) {
      const oldestRequest = Math.min(...recentRequests);
      const retryAfter = Math.ceil(
        (oldestRequest + window * 1000 - now) / 1000
      );

      return {
        success: false,
        remaining: 0,
        resetTime: oldestRequest + window * 1000,
        retryAfter: Math.max(retryAfter, 1),
      };
    }

    // Add current request to log
    recentRequests.push(now);

    // Save updated log
    await cache.set(key, recentRequests, { ttl: window + 10 }); // Add buffer

    return {
      success: true,
      remaining: requests - recentRequests.length,
      resetTime: now + window * 1000,
    };
  } catch (error) {
    console.warn("Rate limiting error:", error);
    // On error, allow the request (fail open)
    return { success: true };
  }
}

// Specialized rate limiters
export const strictRateLimit = (req: NextRequest) =>
  rateLimit(req, { requests: 10, window: 60 });

export const apiRateLimit = (req: NextRequest) =>
  rateLimit(req, { requests: 100, window: 3600 }); // 100 per hour
