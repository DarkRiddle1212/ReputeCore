// Base provider class with common functionality

import { BlockchainProvider, WalletInfo, TokenSummary } from "@/types";
import { logError } from "../errors";

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}

export interface ProviderConfig {
  name: string;
  priority: number;
  maxRequestsPerSecond?: number;
  maxRequestsPerMinute?: number;
  timeout?: number;
}

export abstract class BaseProvider implements BlockchainProvider {
  public readonly name: string;
  public readonly priority: number;
  protected readonly config: ProviderConfig;
  protected rateLimitInfo: RateLimitInfo;
  protected lastRequestTime: number = 0;
  protected requestQueue: Array<() => Promise<void>> = [];
  protected isProcessingQueue: boolean = false;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.priority = config.priority;
    this.config = config;
    this.rateLimitInfo = {
      remaining: config.maxRequestsPerMinute || 60,
      resetTime: Date.now() + 60000, // Reset in 1 minute
      limit: config.maxRequestsPerMinute || 60,
    };
  }

  /**
   * Check if the provider is currently available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Get wallet information for a given address
   */
  abstract getWalletInfo(address: string): Promise<WalletInfo>;

  /**
   * Get tokens created by a given address
   */
  abstract getTokensCreated(address: string): Promise<TokenSummary[]>;

  /**
   * Get current rate limit information
   */
  getRateLimit(): { remaining: number; resetTime: number } {
    return {
      remaining: this.rateLimitInfo.remaining,
      resetTime: this.rateLimitInfo.resetTime,
    };
  }

  /**
   * Update rate limit information from API response headers
   */
  protected updateRateLimit(headers: Record<string, string>): void {
    try {
      // Common rate limit header patterns
      const remaining =
        headers["x-ratelimit-remaining"] ||
        headers["ratelimit-remaining"] ||
        headers["x-rate-limit-remaining"];

      const reset =
        headers["x-ratelimit-reset"] ||
        headers["ratelimit-reset"] ||
        headers["x-rate-limit-reset"];

      const limit =
        headers["x-ratelimit-limit"] ||
        headers["ratelimit-limit"] ||
        headers["x-rate-limit-limit"];

      if (remaining) {
        this.rateLimitInfo.remaining = parseInt(remaining, 10);
      }

      if (reset) {
        // Handle both Unix timestamp and seconds-until-reset formats
        const resetValue = parseInt(reset, 10);
        this.rateLimitInfo.resetTime =
          resetValue > 1000000000
            ? resetValue * 1000 // Unix timestamp in seconds
            : Date.now() + resetValue * 1000; // Seconds until reset
      }

      if (limit) {
        this.rateLimitInfo.limit = parseInt(limit, 10);
      }
    } catch (error) {
      logError(error as Error, {
        component: "BaseProvider",
        operation: "updateRateLimit",
        provider: this.name,
      });
    }
  }

  /**
   * Check if we're within rate limits
   */
  protected isWithinRateLimit(): boolean {
    const now = Date.now();

    // Reset rate limit if time has passed
    if (now >= this.rateLimitInfo.resetTime) {
      this.rateLimitInfo.remaining = this.rateLimitInfo.limit;
      this.rateLimitInfo.resetTime = now + 60000; // Reset in 1 minute
    }

    return this.rateLimitInfo.remaining > 0;
  }

  /**
   * Wait for rate limit to reset if necessary
   */
  protected async waitForRateLimit(): Promise<void> {
    if (!this.isWithinRateLimit()) {
      const waitTime = Math.max(0, this.rateLimitInfo.resetTime - Date.now());
      if (waitTime > 0) {
        console.warn(
          `⏳ Rate limit reached for ${this.name}, waiting ${Math.ceil(waitTime / 1000)}s`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * Enforce minimum time between requests
   */
  protected async enforceRequestSpacing(): Promise<void> {
    const minInterval = this.config.maxRequestsPerSecond
      ? 1000 / this.config.maxRequestsPerSecond
      : 100; // Default 100ms between requests

    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Execute a request with rate limiting and error handling
   */
  protected async executeRequest<T>(
    requestFn: () => Promise<T>,
    operation: string
  ): Promise<T> {
    try {
      // Wait for rate limit if necessary
      await this.waitForRateLimit();

      // Enforce request spacing
      await this.enforceRequestSpacing();

      // Decrement rate limit counter
      if (this.rateLimitInfo.remaining > 0) {
        this.rateLimitInfo.remaining--;
      }

      // Execute the request
      const result = await requestFn();

      return result;
    } catch (error) {
      logError(error as Error, {
        component: "BaseProvider",
        operation,
        provider: this.name,
      });
      throw error;
    }
  }

  /**
   * Validate Ethereum address format
   */
  protected validateAddress(address: string): void {
    if (!address || typeof address !== "string") {
      throw new Error("Address is required and must be a string");
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error("Invalid Ethereum address format");
    }
  }

  /**
   * Normalize Ethereum address to lowercase
   */
  protected normalizeAddress(address: string): string {
    this.validateAddress(address);
    return address.toLowerCase();
  }

  /**
   * Get provider health status
   */
  async getHealthStatus(): Promise<{
    name: string;
    available: boolean;
    rateLimit: RateLimitInfo;
    lastError?: string;
  }> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        return {
          name: this.name,
          available: false,
          rateLimit: this.rateLimitInfo,
          lastError: "Provider is not available",
        };
      }
      return {
        name: this.name,
        available,
        rateLimit: this.rateLimitInfo,
      };
    } catch (error) {
      return {
        name: this.name,
        available: false,
        rateLimit: this.rateLimitInfo,
        lastError: (error as Error).message,
      };
    }
  }

  /**
   * Get provider priority (lower number = higher priority)
   */
  getPriority(): number {
    return this.priority;
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    return { ...this.config };
  }
}
