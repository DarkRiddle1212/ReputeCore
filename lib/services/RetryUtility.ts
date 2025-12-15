/**
 * Retry Utility
 * Provides exponential backoff retry logic for API calls
 *
 * Implements: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import {
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  ErrorAnnotation,
} from "@/types/analytics";

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: ErrorAnnotation;
  attempts: number;
  totalDelayMs: number;
}

export interface RetryOptions extends Partial<RetryConfig> {
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Check if an error is retryable based on error message patterns
 * Implements: Requirement 7.1
 */
export function isRetryableError(
  error: Error | string,
  patterns: string[] = DEFAULT_RETRY_CONFIG.retryableErrors
): boolean {
  const errorMessage = typeof error === "string" ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();

  return patterns.some((pattern) =>
    lowerMessage.includes(pattern.toLowerCase())
  );
}

/**
 * Check if an error is a rate limit error
 * Implements: Requirement 7.3
 */
export function isRateLimitError(error: Error | string): boolean {
  const errorMessage = typeof error === "string" ? error : error.message;
  const lowerMessage = errorMessage.toLowerCase();

  return (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("429") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("throttle")
  );
}

/**
 * Calculate delay for exponential backoff
 * Implements: Requirement 7.1
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const baseDelay =
    config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  // Add jitter (±10%) to prevent thundering herd
  const jitter = baseDelay * 0.1 * (Math.random() * 2 - 1);
  const delay = Math.min(baseDelay + jitter, config.maxDelayMs);
  return Math.max(0, Math.round(delay));
}

/**
 * Execute a function with exponential backoff retry
 * Implements: Requirements 7.1, 7.2
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Promise resolving to retry result
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...options,
  };

  let lastError: Error | null = null;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attempt,
        totalDelayMs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = options.shouldRetry
        ? options.shouldRetry(lastError)
        : isRetryableError(lastError, config.retryableErrors);

      if (!shouldRetry || attempt >= config.maxAttempts) {
        break;
      }

      // Calculate delay
      const delayMs = calculateBackoffDelay(attempt, config);
      totalDelayMs += delayMs;

      // Call onRetry callback if provided
      if (options.onRetry) {
        options.onRetry(attempt, lastError, delayMs);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    success: false,
    error: createErrorAnnotation("retry", lastError),
    attempts: config.maxAttempts,
    totalDelayMs,
  };
}

/**
 * Execute a function with rate limit handling
 * Implements: Requirement 7.3
 *
 * @param fn - Async function to execute
 * @param rateLimitDelayMs - Delay when rate limited (default: 60 seconds)
 * @param maxRateLimitRetries - Maximum rate limit retries (default: 3)
 * @returns Promise resolving to result
 */
export async function withRateLimitHandling<T>(
  fn: () => Promise<T>,
  rateLimitDelayMs: number = 60000,
  maxRateLimitRetries: number = 3
): Promise<T> {
  let rateLimitRetries = 0;

  while (rateLimitRetries < maxRateLimitRetries) {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (isRateLimitError(err)) {
        rateLimitRetries++;
        if (rateLimitRetries >= maxRateLimitRetries) {
          throw new Error(
            `Rate limit exceeded after ${maxRateLimitRetries} retries`
          );
        }
        console.warn(
          `Rate limited, waiting ${rateLimitDelayMs / 1000}s before retry ${rateLimitRetries}/${maxRateLimitRetries}`
        );
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelayMs));
      } else {
        throw err;
      }
    }
  }

  throw new Error("Unexpected end of rate limit handling loop");
}

/**
 * Execute multiple functions with error isolation
 * Implements: Requirements 7.2, 7.4
 *
 * @param fns - Array of async functions to execute
 * @returns Promise resolving to array of results (success or error)
 */
export async function executeWithIsolation<T>(
  fns: Array<() => Promise<T>>
): Promise<Array<{ success: boolean; data?: T; error?: ErrorAnnotation }>> {
  const results = await Promise.allSettled(fns.map((fn) => fn()));

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return { success: true, data: result.value };
    } else {
      return {
        success: false,
        error: createErrorAnnotation(`operation_${index}`, result.reason),
      };
    }
  });
}

/**
 * Execute a function with graceful degradation
 * Implements: Requirement 7.5
 *
 * @param fn - Primary async function
 * @param fallback - Fallback value or function
 * @param options - Retry options
 * @returns Promise resolving to result or fallback
 */
export async function withGracefulDegradation<T>(
  fn: () => Promise<T>,
  fallback: T | (() => T),
  options: RetryOptions = {}
): Promise<{ data: T; degraded: boolean; error?: ErrorAnnotation }> {
  const result = await retryWithBackoff(fn, options);

  if (result.success && result.data !== undefined) {
    return { data: result.data, degraded: false };
  }

  const fallbackData =
    typeof fallback === "function" ? (fallback as () => T)() : fallback;
  return {
    data: fallbackData,
    degraded: true,
    error: result.error,
  };
}

/**
 * Create an error annotation from an error
 */
function createErrorAnnotation(
  metric: string,
  error: Error | null
): ErrorAnnotation {
  const errorMessage = error?.message || "Unknown error";
  return {
    metric,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    retryable: error ? isRetryableError(error) : false,
  };
}

/**
 * Batch execute functions with concurrency limit
 * Implements: Requirement 7.3 (rate limit compliance)
 *
 * @param fns - Array of async functions
 * @param concurrency - Maximum concurrent executions
 * @param delayBetweenMs - Delay between batches
 * @returns Promise resolving to array of results
 */
export async function batchExecute<T>(
  fns: Array<() => Promise<T>>,
  concurrency: number = 3,
  delayBetweenMs: number = 100
): Promise<Array<{ success: boolean; data?: T; error?: ErrorAnnotation }>> {
  const results: Array<{
    success: boolean;
    data?: T;
    error?: ErrorAnnotation;
  }> = [];

  for (let i = 0; i < fns.length; i += concurrency) {
    const batch = fns.slice(i, i + concurrency);
    const batchResults = await executeWithIsolation(batch);
    results.push(...batchResults);

    // Add delay between batches to respect rate limits
    if (i + concurrency < fns.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenMs));
    }
  }

  return results;
}
