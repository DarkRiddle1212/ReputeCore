/**
 * Holder Tracker
 * Tracks holder counts over time for tokens
 *
 * Implements: Requirement 4.2
 */

import { HolderTracker as IHolderTracker } from "@/types/analytics";
import { TokenDataService } from "./TokenDataService";
import { cache, CacheKeys, CacheTTL } from "@/lib/cache";

// Seven days in seconds
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export class HolderTracker implements IHolderTracker {
  private tokenDataService: TokenDataService;

  constructor(tokenDataService: TokenDataService) {
    this.tokenDataService = tokenDataService;
  }

  /**
   * Get holder count at a specific timestamp
   * Implements: Requirement 4.2
   *
   * @param tokenAddress - The token contract address
   * @param timestamp - Unix timestamp to get holder count at
   * @returns Number of unique holders at that time
   */
  async getHolderCountAtTime(
    tokenAddress: string,
    timestamp: number
  ): Promise<number> {
    return this.tokenDataService.getHolderCountAtTime(tokenAddress, timestamp);
  }

  /**
   * Get holder count 7 days after token launch
   * Implements: Requirements 4.2, 9.2 - Caching with 1h TTL
   *
   * @param tokenAddress - The token contract address
   * @param launchTimestamp - Unix timestamp of token launch
   * @returns Number of unique holders 7 days after launch
   */
  async getHolderCountAfter7Days(
    tokenAddress: string,
    launchTimestamp: number
  ): Promise<number> {
    const targetTimestamp = launchTimestamp + SEVEN_DAYS_SECONDS;

    // Check if 7 days have passed
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const effectiveTimestamp =
      targetTimestamp > currentTimestamp ? currentTimestamp : targetTimestamp;

    // Check cache first (Requirement 9.4)
    const cacheKey = CacheKeys.holderCount(tokenAddress, effectiveTimestamp);
    const cached = await cache.get<number>(cacheKey);
    if (cached !== null) {
      console.log(
        `[HolderTracker] Cache hit for holder count: ${tokenAddress} at ${effectiveTimestamp}`
      );
      return cached;
    }

    // Fetch from blockchain
    const holderCount = await this.tokenDataService.getHolderCountAtTime(
      tokenAddress,
      effectiveTimestamp
    );

    // Cache the result (Requirement 9.2 - 1h TTL for holder count)
    await cache.set(cacheKey, holderCount, { ttl: CacheTTL.HOLDER_COUNT });

    return holderCount;
  }

  /**
   * Get holder count at current time
   *
   * @param tokenAddress - The token contract address
   * @returns Current number of unique holders
   */
  async getCurrentHolderCount(tokenAddress: string): Promise<number> {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return this.tokenDataService.getHolderCountAtTime(
      tokenAddress,
      currentTimestamp
    );
  }

  /**
   * Check if token is older than 7 days
   *
   * @param launchTimestamp - Unix timestamp of token launch
   * @returns True if token is older than 7 days
   */
  static isOlderThan7Days(launchTimestamp: number): boolean {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    return currentTimestamp - launchTimestamp >= SEVEN_DAYS_SECONDS;
  }

  /**
   * Calculate the timestamp 7 days after launch
   *
   * @param launchTimestamp - Unix timestamp of token launch
   * @returns Timestamp 7 days after launch
   */
  static get7DayTimestamp(launchTimestamp: number): number {
    return launchTimestamp + SEVEN_DAYS_SECONDS;
  }
}
