// Cache manager with Redis and in-memory fallback

import { logError } from "../errors";

export interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items in memory cache
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheManager {
  private memoryCache: Map<string, CacheEntry<any>>;
  private maxSize: number;
  private defaultTTL: number;

  constructor(config: CacheConfig = { ttl: 5 * 60 * 1000, maxSize: 1000 }) {
    this.memoryCache = new Map();
    this.maxSize = config.maxSize || 1000;
    this.defaultTTL = config.ttl;

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // Check memory cache
      const entry = this.memoryCache.get(key);

      if (!entry) {
        return null;
      }

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key);
        return null;
      }

      return entry.value as T;
    } catch (error) {
      logError(error as Error, {
        component: "CacheManager",
        operation: "get",
        key,
      });
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      // Enforce max size
      if (this.memoryCache.size >= this.maxSize) {
        this.evictOldest();
      }

      const expiresAt = Date.now() + (ttl || this.defaultTTL);

      this.memoryCache.set(key, {
        value,
        expiresAt,
      });

      return true;
    } catch (error) {
      logError(error as Error, {
        component: "CacheManager",
        operation: "set",
        key,
      });
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      return this.memoryCache.delete(key);
    } catch (error) {
      logError(error as Error, {
        component: "CacheManager",
        operation: "delete",
        key,
      });
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<boolean> {
    try {
      this.memoryCache.clear();
      return true;
    } catch (error) {
      logError(error as Error, {
        component: "CacheManager",
        operation: "clear",
      });
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number;
  } {
    return {
      size: this.memoryCache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.memoryCache.delete(key);
    }
  }

  /**
   * Evict oldest entry when max size is reached
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }
}

// Singleton instance
let cacheInstance: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheInstance) {
    cacheInstance = new CacheManager({
      ttl: 5 * 60 * 1000, // 5 minutes
      maxSize: 1000,
    });
  }
  return cacheInstance;
}

/**
 * Generate cache key for wallet analysis
 */
export function generateWalletCacheKey(address: string): string {
  return `wallet:${address.toLowerCase()}`;
}

/**
 * Generate cache key for token data
 */
export function generateTokenCacheKey(tokenAddress: string): string {
  return `token:${tokenAddress.toLowerCase()}`;
}

/**
 * Generate cache key for provider data
 */
export function generateProviderCacheKey(
  provider: string,
  address: string
): string {
  return `provider:${provider}:${address.toLowerCase()}`;
}
