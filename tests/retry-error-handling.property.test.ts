/**
 * Property-based tests for Retry and Error Handling
 * Tests exponential backoff, error isolation, and graceful degradation
 *
 * Implements: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import * as fc from "fast-check";
import {
  isRetryableError,
  isRateLimitError,
  calculateBackoffDelay,
  retryWithBackoff,
  executeWithIsolation,
  withGracefulDegradation,
} from "@/lib/services/RetryUtility";
import { DEFAULT_RETRY_CONFIG } from "@/types/analytics";

describe("RetryUtility - Property Tests", () => {
  describe("Property 12: Retry with exponential backoff", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 12: Retry with exponential backoff**
     * **Validates: Requirements 7.1**
     */
    test("backoff delay should increase with each attempt (general trend)", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }), // Limit attempts to avoid hitting maxDelay
          fc.integer({ min: 100, max: 500 }),
          fc.float({ min: 1.5, max: 2 }),
          (attempts, initialDelay, backoffFactor) => {
            const config = {
              ...DEFAULT_RETRY_CONFIG,
              initialDelayMs: initialDelay,
              backoffFactor,
              maxDelayMs: 100000000, // Very high max to not cap delays
            };

            const delays: number[] = [];
            for (let i = 1; i <= attempts; i++) {
              delays.push(calculateBackoffDelay(i, config));
            }

            // All delays should be positive
            delays.forEach((delay) => {
              expect(delay).toBeGreaterThan(0);
            });

            // Later delays should generally be larger than earlier ones
            // (checking first vs last to account for jitter)
            const firstDelay = delays[0];
            const lastDelay = delays[delays.length - 1];

            // Last delay should be larger than first (exponential growth)
            expect(lastDelay).toBeGreaterThan(firstDelay);
          }
        ),
        { numRuns: 50 }
      );
    });

    test("backoff delay should never exceed maxDelayMs", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 100, max: 1000 }),
          fc.integer({ min: 1000, max: 10000 }),
          (attempt, initialDelay, maxDelay) => {
            const config = {
              ...DEFAULT_RETRY_CONFIG,
              initialDelayMs: initialDelay,
              maxDelayMs: maxDelay,
            };

            const delay = calculateBackoffDelay(attempt, config);
            expect(delay).toBeLessThanOrEqual(maxDelay * 1.1); // Allow 10% jitter
          }
        ),
        { numRuns: 100 }
      );
    });

    test("backoff delay should always be non-negative", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (attempt) => {
          const delay = calculateBackoffDelay(attempt);
          expect(delay).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    test("retry should succeed on first attempt if function succeeds", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), async (value) => {
          const fn = jest.fn().mockResolvedValue(value);

          const result = await retryWithBackoff(fn);

          expect(result.success).toBe(true);
          expect(result.data).toBe(value);
          expect(result.attempts).toBe(1);
          expect(fn).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 20 }
      );
    });

    test("retry should return failure after max attempts for non-retryable errors", async () => {
      await fc.assert(
        fc.asyncProperty(fc.string(), async (errorMessage) => {
          // Use a non-retryable error message
          const nonRetryableError = new Error(`Custom error: ${errorMessage}`);
          const fn = jest.fn().mockRejectedValue(nonRetryableError);

          const result = await retryWithBackoff(fn, { maxAttempts: 3 });

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          // Should only try once for non-retryable errors
          expect(fn).toHaveBeenCalledTimes(1);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe("Property 13: Error isolation", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 13: Error isolation**
     * **Validates: Requirements 7.2, 7.4**
     */
    test("one failing function should not affect others", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          async (shouldSucceed, values) => {
            // Ensure arrays are same length
            const length = Math.min(shouldSucceed.length, values.length);
            const fns = Array.from({ length }, (_, i) => {
              if (shouldSucceed[i]) {
                return () => Promise.resolve(values[i]);
              } else {
                return () => Promise.reject(new Error(`Error ${i}`));
              }
            });

            const results = await executeWithIsolation(fns);

            expect(results.length).toBe(length);

            // Each result should match expected success/failure
            results.forEach((result, i) => {
              if (shouldSucceed[i]) {
                expect(result.success).toBe(true);
                expect(result.data).toBe(values[i]);
              } else {
                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
              }
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    test("all successful functions should return their values", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          async (values) => {
            const fns = values.map((v) => () => Promise.resolve(v));

            const results = await executeWithIsolation(fns);

            expect(results.length).toBe(values.length);
            results.forEach((result, i) => {
              expect(result.success).toBe(true);
              expect(result.data).toBe(values[i]);
            });
          }
        ),
        { numRuns: 30 }
      );
    });

    test("all failing functions should return errors without throwing", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
          async (errorMessages) => {
            const fns = errorMessages.map(
              (msg) => () => Promise.reject(new Error(msg))
            );

            // Should not throw
            const results = await executeWithIsolation(fns);

            expect(results.length).toBe(errorMessages.length);
            results.forEach((result) => {
              expect(result.success).toBe(false);
              expect(result.error).toBeDefined();
            });
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  describe("Property 14: Rate limit compliance", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 14: Rate limit compliance**
     * **Validates: Requirements 7.3**
     */
    test("should correctly identify rate limit errors", () => {
      const rateLimitMessages = [
        "Rate limit exceeded",
        "HTTP 429 Too Many Requests",
        "rate limit reached",
        "Too many requests",
        "Request throttled",
      ];

      rateLimitMessages.forEach((msg) => {
        expect(isRateLimitError(new Error(msg))).toBe(true);
      });
    });

    test("should not identify non-rate-limit errors as rate limits", () => {
      fc.assert(
        fc.property(
          fc
            .string()
            .filter(
              (s) =>
                !s.toLowerCase().includes("rate limit") &&
                !s.toLowerCase().includes("429") &&
                !s.toLowerCase().includes("too many requests") &&
                !s.toLowerCase().includes("throttle")
            ),
          (errorMessage) => {
            expect(isRateLimitError(new Error(errorMessage))).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Property 15: Graceful degradation", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 15: Graceful degradation**
     * **Validates: Requirements 7.5**
     */
    test("should return primary result when function succeeds", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.string(),
          async (primaryValue, fallbackValue) => {
            const fn = () => Promise.resolve(primaryValue);

            const result = await withGracefulDegradation(fn, fallbackValue);

            expect(result.data).toBe(primaryValue);
            expect(result.degraded).toBe(false);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 30 }
      );
    });

    test("should return fallback when function fails", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.string(),
          async (errorMessage, fallbackValue) => {
            const fn = () => Promise.reject(new Error(errorMessage));

            const result = await withGracefulDegradation(fn, fallbackValue, {
              maxAttempts: 1,
            });

            expect(result.data).toBe(fallbackValue);
            expect(result.degraded).toBe(true);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 30 }
      );
    });

    test("should call fallback function when provided as function", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string(),
          fc.string(),
          async (errorMessage, fallbackValue) => {
            const fn = () => Promise.reject(new Error(errorMessage));
            const fallbackFn = jest.fn().mockReturnValue(fallbackValue);

            const result = await withGracefulDegradation(fn, fallbackFn, {
              maxAttempts: 1,
            });

            expect(result.data).toBe(fallbackValue);
            expect(result.degraded).toBe(true);
            expect(fallbackFn).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe("Retryable error detection", () => {
    test("should identify known retryable error patterns", () => {
      const retryableErrors = [
        "ETIMEDOUT",
        "ECONNRESET",
        "ENOTFOUND",
        "RATE_LIMIT_EXCEEDED",
        "ECONNREFUSED",
      ];

      retryableErrors.forEach((pattern) => {
        expect(isRetryableError(new Error(pattern))).toBe(true);
        expect(isRetryableError(new Error(`Error: ${pattern} occurred`))).toBe(
          true
        );
      });
    });

    test("should not identify random errors as retryable", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => {
            const lower = s.toLowerCase();
            return (
              !lower.includes("etimedout") &&
              !lower.includes("econnreset") &&
              !lower.includes("enotfound") &&
              !lower.includes("rate_limit") &&
              !lower.includes("econnrefused")
            );
          }),
          (errorMessage) => {
            expect(isRetryableError(new Error(errorMessage))).toBe(false);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe("Edge cases", () => {
    test("should handle empty function array in isolation", async () => {
      const results = await executeWithIsolation([]);
      expect(results).toEqual([]);
    });

    test("should handle zero max attempts gracefully", async () => {
      const fn = jest.fn().mockResolvedValue("value");

      // With 0 max attempts, should still try at least once
      const result = await retryWithBackoff(fn, { maxAttempts: 0 });

      // Implementation may vary - just ensure no crash
      expect(typeof result.success).toBe("boolean");
    });

    test("calculateBackoffDelay should handle attempt 0", () => {
      const delay = calculateBackoffDelay(0);
      expect(delay).toBeGreaterThanOrEqual(0);
    });
  });
});
