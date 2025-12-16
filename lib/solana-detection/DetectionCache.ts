/**
 * DetectionCache - LRU cache for token detection results
 *
 * Provides efficient caching with configurable TTL and LRU eviction
 * to speed up repeated wallet analyses.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import {
  DetectionResult,
  CachedResult,
  CacheConfig,
  DetectionCacheStats,
  DEFAULT_CACHE_CONFIG,
} from "./types";

/**
 * LRU cache entry with access tracking
 */
interface CacheEntry {
  result: CachedResult;
  lastAccessed: number;
}

/**
 * LRU cache for detection results with configurable TTL and max entries
 */
export class DetectionCache {
  private cache: Map<string, CacheEntry>;
  private config: CacheConfig;
  private stats: DetectionCacheStats;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      ...DEFAULT_CACHE_CONFIG,
      ...config,
    };
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
    };
  }

  /**
   * Get cached result for a wallet address (Requirement 5.2)
   *
   * @param walletAddress - The wallet address to look up
   * @returns Cached result if valid, null if not found or expired
   */
  get(walletAddress: string): CachedResult | null {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const entry = this.cache.get(normalizedAddress);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();

    // Check if entry has expired
    if (now > entry.result.expiresAt) {
      // Remove expired entry
      this.cache.delete(normalizedAddress);
      this.stats.size = this.cache.size;
      this.stats.misses++;
      return null;
    }

    // Update last accessed time for LRU tracking
    entry.lastAccessed = now;
    this.stats.hits++;

    return entry.result;
  }

  /**
   * Cache detection result for a wallet address (Requirement 5.1)
   *
   * @param walletAddress - The wallet address to cache
   * @param result - The detection result to cache
   * @param ttl - Optional TTL in milliseconds (uses default if not provided)
   */
  set(
    walletAddress: string,
    result: DetectionResult,
    ttl?: number
  ): void {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const now = Date.now();
    const effectiveTtl = ttl ?? this.config.defaultTtlMs;

    const cachedResult: CachedResult = {
      result,
      cachedAt: now,
      expiresAt: now + effectiveTtl,
    };

    const entry: CacheEntry = {
      result: cachedResult,
      lastAccessed: now,
    };

    // Check if we need to evict before adding
    if (!this.cache.has(normalizedAddress) && this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(normalizedAddress, entry);
    this.stats.size = this.cache.size;
  }

  /**
   * Invalidate cached result for a wallet address (Requirement 5.3)
   * Used when force refresh is requested
   *
   * @param walletAddress - The wallet address to invalidate
   * @returns true if entry was removed, false if not found
   */
  invalidate(walletAddress: string): boolean {
    const normalizedAddress = this.normalizeAddress(walletAddress);
    const deleted = this.cache.delete(normalizedAddress);
    this.stats.size = this.cache.size;
    return deleted;
  }

  /**
   * Evict the least recently used entry (Requirement 5.4)
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find the least recently accessed entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
      this.stats.size = this.cache.size;
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Current cache statistics
   */
  getStats(): DetectionCacheStats {
    return { ...this.stats };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Remove all expired entries
   *
   * @returns Number of entries removed
   */
  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.result.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    this.stats.size = this.cache.size;
    return removed;
  }

  /**
   * Normalize wallet address for consistent cache keys
   */
  private normalizeAddress(address: string): string {
    return address.trim();
  }

  /**
   * Check if a wallet address has a valid cached result
   *
   * @param walletAddress - The wallet address to check
   * @returns true if valid cached result exists
   */
  has(walletAddress: string): boolean {
    return this.get(walletAddress) !== null;
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Default cache instance with standard configuration
 */
export const detectionCache = new DetectionCache();
