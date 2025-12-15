// Tests for rate limiting middleware

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  checkRateLimit,
  createRateLimitMiddleware,
  resetRateLimit,
  clearAllRateLimits,
  RATE_LIMITS,
} from "../lib/middleware/rateLimit";

// Mock NextRequest for testing
function createMockRequest(
  url: string,
  options?: { headers?: Record<string, string> }
): any {
  const headers = new Map<string, string>();
  if (options?.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });
  }

  return {
    url,
    ip: undefined,
    headers: {
      get: (name: string) => headers.get(name) || null,
    },
  };
}

describe("Rate Limiting", () => {
  beforeEach(() => {
    clearAllRateLimits();
  });

  describe("checkRateLimit", () => {
    it("should allow requests within rate limit", async () => {
      const req = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.1" },
      });

      const config = {
        windowMs: 60000,
        maxRequests: 10,
      };

      const result = await checkRateLimit(req, config);

      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
      expect(result.retryAfter).toBeUndefined();
    });

    it("should reject requests exceeding rate limit", async () => {
      const req = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.2" },
      });

      const config = {
        windowMs: 60000,
        maxRequests: 3,
      };

      await checkRateLimit(req, config);
      await checkRateLimit(req, config);
      await checkRateLimit(req, config);

      const result = await checkRateLimit(req, config);

      expect(result.success).toBe(false);
      expect(result.limit).toBe(3);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should use custom key generator", async () => {
      const req = createMockRequest("http://localhost:3000/api/test");

      const config = {
        windowMs: 60000,
        maxRequests: 10,
        keyGenerator: () => "custom:key:123",
      };

      const result1 = await checkRateLimit(req, config);
      const result2 = await checkRateLimit(req, config);

      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(8);
    });

    it("should handle missing IP address", async () => {
      const req = createMockRequest("http://localhost:3000/api/test");

      const config = {
        windowMs: 60000,
        maxRequests: 10,
      };

      const result = await checkRateLimit(req, config);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("should track remaining requests correctly", async () => {
      const req = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.3" },
      });

      const config = {
        windowMs: 60000,
        maxRequests: 5,
      };

      const result1 = await checkRateLimit(req, config);
      expect(result1.remaining).toBe(4);

      const result2 = await checkRateLimit(req, config);
      expect(result2.remaining).toBe(3);

      const result3 = await checkRateLimit(req, config);
      expect(result3.remaining).toBe(2);
    });
  });

  describe("createRateLimitMiddleware", () => {
    it("should create middleware function", () => {
      const middleware = createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 10,
      });

      expect(middleware).toBeInstanceOf(Function);
    });
  });

  describe("Rate Limit Configurations", () => {
    it("should have correct default rate limits", () => {
      expect(RATE_LIMITS.ANALYSIS.windowMs).toBe(60 * 60 * 1000);
      expect(RATE_LIMITS.STATUS.windowMs).toBe(60 * 60 * 1000);
      expect(RATE_LIMITS.DEFAULT.windowMs).toBe(15 * 60 * 1000);

      expect(typeof RATE_LIMITS.ANALYSIS.maxRequests).toBe("number");
      expect(typeof RATE_LIMITS.STATUS.maxRequests).toBe("number");
      expect(typeof RATE_LIMITS.DEFAULT.maxRequests).toBe("number");
    });

    it("should have positive rate limits", () => {
      expect(RATE_LIMITS.ANALYSIS.maxRequests).toBeGreaterThan(0);
      expect(RATE_LIMITS.STATUS.maxRequests).toBeGreaterThan(0);
      expect(RATE_LIMITS.DEFAULT.maxRequests).toBeGreaterThan(0);
    });
  });

  describe("Rate Limit Management", () => {
    it("should reset rate limits for a key", async () => {
      const req = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.7" },
      });

      const config = {
        windowMs: 60000,
        maxRequests: 2,
      };

      await checkRateLimit(req, config);
      await checkRateLimit(req, config);

      resetRateLimit("rate_limit:192.168.1.7");

      const result = await checkRateLimit(req, config);
      expect(result.remaining).toBe(1);
    });

    it("should clear all rate limits", async () => {
      const req1 = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.8" },
      });
      const req2 = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.9" },
      });

      const config = { windowMs: 60000, maxRequests: 5 };

      await checkRateLimit(req1, config);
      await checkRateLimit(req2, config);

      clearAllRateLimits();

      const result1 = await checkRateLimit(req1, config);
      const result2 = await checkRateLimit(req2, config);

      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(4);
    });
  });

  describe("Edge Cases", () => {
    it("should calculate correct reset time", async () => {
      const now = Date.now();
      const windowMs = 60000;
      const window = Math.floor(now / windowMs);
      const expectedResetTime = (window + 1) * windowMs;

      const req = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.10" },
      });

      const config = { windowMs, maxRequests: 10 };
      const result = await checkRateLimit(req, config);

      expect(result.resetTime).toBeCloseTo(expectedResetTime, -2);
    });

    it("should not allow remaining to go negative", async () => {
      const req = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.11" },
      });

      const config = { windowMs: 60000, maxRequests: 2 };

      await checkRateLimit(req, config);
      await checkRateLimit(req, config);
      await checkRateLimit(req, config);
      const result = await checkRateLimit(req, config);

      expect(result.remaining).toBe(0);
    });

    it("should handle different IPs independently", async () => {
      const req1 = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.12" },
      });
      const req2 = createMockRequest("http://localhost:3000/api/test", {
        headers: { "x-forwarded-for": "192.168.1.13" },
      });

      const config = { windowMs: 60000, maxRequests: 5 };

      await checkRateLimit(req1, config);
      await checkRateLimit(req1, config);

      const result1 = await checkRateLimit(req1, config);
      const result2 = await checkRateLimit(req2, config);

      expect(result1.remaining).toBe(2);
      expect(result2.remaining).toBe(4);
    });
  });
});
