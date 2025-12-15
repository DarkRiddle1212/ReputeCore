// Tests for cache manager

import { describe, it, expect, beforeEach } from "@jest/globals";
import { CacheManager, CacheKeys } from "../lib/cache";

describe("CacheManager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    cache = new CacheManager(5); // maxEntries = 5
  });

  describe("Basic Operations", () => {
    it("should set and get values", async () => {
      await cache.set("key1", "value1");
      const value = await cache.get("key1");
      expect(value).toBe("value1");
    });

    it("should return null for non-existent keys", async () => {
      const value = await cache.get("nonexistent");
      expect(value).toBeNull();
    });

    it("should delete values", async () => {
      await cache.set("key1", "value1");
      await cache.delete("key1");

      const value = await cache.get("key1");
      expect(value).toBeNull();
    });

    it("should clear all values", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      await cache.clear();

      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBeNull();
    });
  });

  describe("TTL and Expiration", () => {
    it("should expire values after TTL", async () => {
      await cache.set("key1", "value1", { ttl: 1 }); // 1 second TTL

      // Should exist immediately
      expect(await cache.get("key1")).toBe("value1");

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be expired
      expect(await cache.get("key1")).toBeNull();
    });

    it("should use default TTL when not specified", async () => {
      await cache.set("key1", "value1");

      // Should exist immediately
      expect(await cache.get("key1")).toBe("value1");
    });

    it("should handle custom TTL per key", async () => {
      await cache.set("short", "value1", { ttl: 1 });
      await cache.set("long", "value2", { ttl: 10 });

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await cache.get("short")).toBeNull();
      expect(await cache.get("long")).toBe("value2");
    });
  });

  describe("Size Limiting", () => {
    it("should enforce max size", async () => {
      // Cache has maxEntries of 5
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.set("key3", "value3");
      await cache.set("key4", "value4");
      await cache.set("key5", "value5");

      const stats = cache.getStats();
      expect(stats.size).toBe(5);

      // Adding 6th item should evict oldest
      await cache.set("key6", "value6");
      expect(cache.getStats().size).toBe(5);
    });

    it("should evict oldest entry when full", async () => {
      await cache.set("key1", "value1", { ttl: 1 });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cache.set("key2", "value2", { ttl: 10 });
      await cache.set("key3", "value3", { ttl: 10 });
      await cache.set("key4", "value4", { ttl: 10 });
      await cache.set("key5", "value5", { ttl: 10 });

      // key1 should be oldest (shortest TTL)
      await cache.set("key6", "value6", { ttl: 10 });

      expect(await cache.get("key1")).toBeNull();
      expect(await cache.get("key2")).toBe("value2");
    });
  });

  describe("Data Types", () => {
    it("should handle string values", async () => {
      await cache.set("key", "string value");
      expect(await cache.get("key")).toBe("string value");
    });

    it("should handle number values", async () => {
      await cache.set("key", 42);
      expect(await cache.get("key")).toBe(42);
    });

    it("should handle object values", async () => {
      const obj = { name: "test", value: 123 };
      await cache.set("key", obj);
      expect(await cache.get("key")).toEqual(obj);
    });

    it("should handle array values", async () => {
      const arr = [1, 2, 3, 4, 5];
      await cache.set("key", arr);
      expect(await cache.get("key")).toEqual(arr);
    });
  });

  describe("Statistics", () => {
    it("should return cache statistics", async () => {
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
    });

    it("should update size after operations", async () => {
      await cache.set("key1", "value1");
      expect(cache.getStats().size).toBe(1);

      await cache.set("key2", "value2");
      expect(cache.getStats().size).toBe(2);

      await cache.delete("key1");
      expect(cache.getStats().size).toBe(1);

      await cache.clear();
      expect(cache.getStats().size).toBe(0);
    });
  });
});

describe("Cache Keys", () => {
  describe("CacheKeys", () => {
    it("should generate consistent analysis keys", () => {
      const key1 = CacheKeys.analysis("0xABC123");
      const key2 = CacheKeys.analysis("0xABC123");
      expect(key1).toBe(key2);
    });

    it("should normalize addresses to lowercase", () => {
      const key1 = CacheKeys.analysis("0xABC123");
      const key2 = CacheKeys.analysis("0xabc123");
      expect(key1).toBe(key2);
    });

    it("should include analysis prefix", () => {
      const key = CacheKeys.analysis("0xabc123");
      expect(key).toContain("analysis:");
    });

    it("should generate wallet info keys", () => {
      const key = CacheKeys.walletInfo("0xabc123");
      expect(key).toContain("wallet:");
    });

    it("should generate token keys", () => {
      const key = CacheKeys.tokens("0xabc123");
      expect(key).toContain("tokens:");
    });
  });
});
