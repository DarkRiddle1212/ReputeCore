/**
 * Cache Manager Implementation
 *
 * Provides dual-layer caching with Redis (primary) and in-memory (fallback).
 * Automatically falls back to memory cache when Redis is unavailable.
 */

import { CacheOptions, CacheStats } from "@/types";

// ============================================================================
// Cache Configuration
// ============================================================================

export const CacheTTL = {
  ANALYSIS_RESULT: 300, // 5 minutes
  WALLET_INFO: 600, // 10 minutes
  TOKENS: 600, // 10 minutes
  SCORING: 300, // 5 minutes
  PROVIDER_HEALTH: 60, // 1 minute
  // Enhanced analytics TTLs (Requirement 9.1, 9.2, 9.3)
  LIQUIDITY: 86400, // 24 hours - liquidity data changes slowly
  HOLDER_COUNT: 3600, // 1 hour - holder counts change frequently
  DEV_SELL_RATIO: 21600, // 6 hours - dev sell ratio is relatively stable
  // Token verification TTL (Requirement 9.1 - Manual token analysis)
  VERIFICATION: 86400, // 24 hours - token creator doesn't change
} as const;

export const CacheKeys = {
  analysis: (address: string, blockchain: string = "ethereum") =>
    `analysis:${blockchain}:${address.toLowerCase()}`,
  walletInfo: (address: string, blockchain: string = "ethereum") =>
    `wallet:${blockchain}:${address.toLowerCase()}`,
  walletAge: (address: string, blockchain: string = "ethereum") =>
    `wallet-age:${blockchain}:${address.toLowerCase()}`,
  tokens: (address: string, blockchain: string = "ethereum") =>
    `tokens:${blockchain}:${address.toLowerCase()}`,
  scoring: (address: string, blockchain: string = "ethereum") =>
    `scoring:${blockchain}:${address.toLowerCase()}`,
  providerHealth: (provider: string) => `health:${provider}`,
  // Enhanced analytics cache keys (Requirement 9.1, 9.2, 9.3)
  liquidity: (tokenAddress: string, blockchain: string = "ethereum") =>
    `liquidity:${blockchain}:${tokenAddress.toLowerCase()}`,
  holderCount: (
    tokenAddress: string,
    timestamp: number,
    blockchain: string = "ethereum"
  ) => `holders:${blockchain}:${tokenAddress.toLowerCase()}:${timestamp}`,
  devSellRatio: (
    tokenAddress: string,
    creatorAddress: string,
    blockchain: string = "ethereum"
  ) =>
    `devsell:${blockchain}:${tokenAddress.toLowerCase()}:${creatorAddress.toLowerCase()}`,
  // Token verification cache key (Requirement 9.1 - Manual token analysis)
  verification: (
    tokenAddress: string,
    walletAddress: string,
    blockchain: string = "ethereum"
  ) =>
    `verification:${blockchain}:${tokenAddress.toLowerCase()}:${walletAddress.toLowerCase()}`,
} as const;

// ============================================================================
// Memory Cache Implementation
// ============================================================================

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache: Map<string, MemoryCacheEntry<any>>;
  private maxEntries: number;
  private hits: number;
  private misses: number;

  constructor(maxEntries: number = 1000) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.hits = 0;
    this.misses = 0;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttl: number): void {
    // Enforce size limit using LRU
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      // Remove oldest entry (first in map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const expiresAt = Date.now() + ttl * 1000;
    this.cache.set(key, { value, expiresAt });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(prefix?: string): void {
    if (prefix) {
      // Clear only keys with prefix
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  getStats(): { hits: number; misses: number; size: number } {
    // Clean up expired entries before reporting size
    this.cleanup();
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================================================
// Redis Cache Implementation
// ============================================================================

class RedisCache {
  private client: any; // Redis client type
  private connected: boolean;
  private hits: number;
  private misses: number;

  constructor() {
    this.connected = false;
    this.hits = 0;
    this.misses = 0;
  }

  async connect(url?: string): Promise<void> {
    try {
      // Only attempt Redis connection if URL is provided
      if (!url) {
        console.log("[Cache] No Redis URL provided, using memory cache only");
        return;
      }

      // Dynamic import of ioredis client
      const Redis = (await import("ioredis")).default;
      this.client = new Redis(url);

      this.client.on("error", (err: Error) => {
        console.error("[Cache] Redis error:", err.message);
        this.connected = false;
      });

      this.client.on("connect", () => {
        console.log("[Cache] Redis connected");
        this.connected = true;
      });

      // ioredis connects automatically, just wait for it
      await this.client.ping();
      this.connected = true;
    } catch (error) {
      console.log("[Cache] Redis not available, using memory cache fallback");
      this.connected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.disconnect();
        this.connected = false;
      } catch (error) {
        console.error("[Cache] Error disconnecting from Redis:", error);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);

      if (!value) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error("[Cache] Redis get error:", error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
    } catch (error) {
      console.error("[Cache] Redis set error:", error);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      console.error("[Cache] Redis delete error:", error);
    }
  }

  async clear(prefix?: string): Promise<void> {
    if (!this.connected || !this.client) {
      return;
    }

    try {
      if (prefix) {
        // Scan and delete keys with prefix
        const keys = await this.client.keys(`${prefix}*`);
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } else {
        await this.client.flushdb();
      }
    } catch (error) {
      console.error("[Cache] Redis clear error:", error);
    }
  }

  getStats(): { hits: number; misses: number } {
    return {
      hits: this.hits,
      misses: this.misses,
    };
  }
}

// ============================================================================
// Cache Manager (Dual-Layer)
// ============================================================================

export class CacheManager {
  private memoryCache: MemoryCache;
  private redisCache: RedisCache;
  private initialized: boolean;

  constructor(maxMemoryEntries: number = 1000) {
    this.memoryCache = new MemoryCache(maxMemoryEntries);
    this.redisCache = new RedisCache();
    this.initialized = false;
  }

  /**
   * Initialize the cache manager with Redis connection
   */
  async initialize(redisUrl?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.redisCache.connect(redisUrl);
    this.initialized = true;
  }

  /**
   * Get value from cache (checks Redis first, then memory)
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key, options?.prefix);

    // Try Redis first
    if (this.redisCache.isConnected()) {
      const redisValue = await this.redisCache.get<T>(fullKey);
      if (redisValue !== null) {
        // Also store in memory cache for faster subsequent access
        const ttl = options?.ttl || CacheTTL.ANALYSIS_RESULT;
        this.memoryCache.set(fullKey, redisValue, ttl);
        return redisValue;
      }
    }

    // Fallback to memory cache
    return this.memoryCache.get<T>(fullKey);
  }

  /**
   * Set value in cache (stores in both Redis and memory)
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options?.prefix);
    const ttl = options?.ttl || CacheTTL.ANALYSIS_RESULT;

    // Store in both caches
    this.memoryCache.set(fullKey, value, ttl);

    if (this.redisCache.isConnected()) {
      await this.redisCache.set(fullKey, value, ttl);
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, options?: CacheOptions): Promise<void> {
    const fullKey = this.buildKey(key, options?.prefix);

    this.memoryCache.delete(fullKey);

    if (this.redisCache.isConnected()) {
      await this.redisCache.delete(fullKey);
    }
  }

  /**
   * Clear cache (optionally by prefix)
   */
  async clear(prefix?: string): Promise<void> {
    this.memoryCache.clear(prefix);

    if (this.redisCache.isConnected()) {
      await this.redisCache.clear(prefix);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const memoryStats = this.memoryCache.getStats();
    const redisStats = this.redisCache.getStats();

    return {
      memoryHits: memoryStats.hits,
      memoryMisses: memoryStats.misses,
      redisHits: redisStats.hits,
      redisMisses: redisStats.misses,
      memorySize: memoryStats.size,
    };
  }

  /**
   * Shutdown cache manager
   */
  async shutdown(): Promise<void> {
    await this.redisCache.disconnect();
  }

  /**
   * Build full cache key with optional prefix
   */
  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager();

    // Auto-initialize with environment variable if available
    // Use setTimeout to avoid blocking module initialization
    if (typeof process !== "undefined" && process.env.REDIS_URL) {
      setTimeout(() => {
        cacheManagerInstance?.initialize(process.env.REDIS_URL).catch((err) => {
          console.log(
            "[Cache] Failed to initialize Redis, using memory cache only"
          );
        });
      }, 0);
    }
  }

  return cacheManagerInstance;
}

// Export singleton instance for convenience
export const cache = getCacheManager();
