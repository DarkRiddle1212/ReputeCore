/**
 * Structured logging utility for wallet analysis
 * Implements: Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  walletAddress?: string;
  blockchain?: string;
  provider?: string;
  endpoint?: string;
  duration?: number;
  [key: string]: any;
}

/**
 * Performance metrics for tracking API calls and cache efficiency
 * Implements: Requirement 13.5
 */
export interface PerformanceMetrics {
  apiCallCount: number;
  cacheHits: number;
  cacheMisses: number;
  totalDuration: number;
  providerCalls: Record<string, number>;
}

class Logger {
  private isDevelopment: boolean;
  private requestId: string | null = null;
  private metrics: PerformanceMetrics = {
    apiCallCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalDuration: 0,
    providerCalls: {},
  };

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== "production";
  }

  /**
   * Reset performance metrics for a new request
   */
  resetMetrics() {
    this.metrics = {
      apiCallCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalDuration: 0,
      providerCalls: {},
    };
  }

  /**
   * Get current performance metrics
   * Implements: Requirement 13.5
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Track cache hit
   */
  trackCacheHit() {
    this.metrics.cacheHits++;
  }

  /**
   * Track cache miss
   */
  trackCacheMiss() {
    this.metrics.cacheMisses++;
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total : 0;
  }

  /**
   * Set request ID for tracing
   */
  setRequestId(id: string) {
    this.requestId = id;
  }

  /**
   * Clear request ID
   */
  clearRequestId() {
    this.requestId = null;
  }

  /**
   * Format log message with context
   */
  private format(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): string {
    const timestamp = new Date().toISOString();
    const reqId = context?.requestId || this.requestId || "no-req-id";

    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] [${reqId}] ${message}${contextStr}`;
  }

  /**
   * Log debug message (only in development)
   */
  debug(message: string, context?: LogContext) {
    if (this.isDevelopment) {
      console.log(this.format("debug", message, context));
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext) {
    console.log(this.format("info", message, context));
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext) {
    console.warn(this.format("warn", message, context));
  }

  /**
   * Log error message with stack trace
   */
  error(message: string, error?: Error, context?: LogContext) {
    const errorContext = {
      ...context,
      error: error?.message,
      stack: error?.stack,
    };
    console.error(this.format("error", message, errorContext));
  }

  /**
   * Log API call with performance metrics
   * Implements: Requirement 12.2, 13.5
   */
  apiCall(
    provider: string,
    endpoint: string,
    duration: number,
    success: boolean,
    context?: LogContext
  ) {
    // Track metrics
    this.metrics.apiCallCount++;
    this.metrics.totalDuration += duration;
    this.metrics.providerCalls[provider] =
      (this.metrics.providerCalls[provider] || 0) + 1;

    const status = success ? "SUCCESS" : "FAILED";
    this.info(`API Call: ${provider} ${endpoint} - ${status}`, {
      ...context,
      provider,
      endpoint,
      duration,
      success,
    });
  }

  /**
   * Log request start
   * Implements: Requirement 12.1
   */
  requestStart(walletAddress: string, blockchain: string, requestId: string) {
    this.setRequestId(requestId);
    this.info("Request started", {
      requestId,
      walletAddress,
      blockchain,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log request end with performance metrics
   * Implements: Requirement 13.5
   */
  requestEnd(requestId: string, duration: number, success: boolean) {
    const metrics = this.getMetrics();
    this.info("Request completed", {
      requestId,
      duration,
      success,
      apiCallCount: metrics.apiCallCount,
      cacheHitRate: this.getCacheHitRate().toFixed(2),
      providerCalls: metrics.providerCalls,
    });
    this.clearRequestId();
    this.resetMetrics();
  }

  /**
   * Log score calculation details
   * Implements: Requirement 12.3
   */
  scoreCalculation(component: string, score: number, context?: LogContext) {
    this.debug(`Score component: ${component} = ${score}`, context);
  }

  /**
   * Log heuristics matching
   * Implements: Requirement 12.5
   */
  heuristicsMatch(rule: string, confidence: number, context?: LogContext) {
    this.debug(`Heuristic matched: ${rule}`, {
      ...context,
      rule,
      confidence,
    });
  }
}

// Export singleton instance
export const logger = new Logger();
