/**
 * Performance Tests for Multi-Chain Wallet Analysis
 * Tests performance characteristics and benchmarks
 * Requirement: 8.1, 8.3
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { POST } from "@/app/api/analyze/route";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache";

describe("Performance Tests", () => {
  const testAddresses = {
    ethereum: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    solana: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  };

  beforeAll(async () => {
    // Clear cache before performance tests
    await cache.clear();
  });

  describe("Solana Wallet Analysis Performance", () => {
    it("should complete Solana analysis within acceptable time", async () => {
      const startTime = performance.now();

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testAddresses.solana,
          forceRefresh: true,
        }),
      });

      const response = await POST(request);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);

      console.log(`✅ Solana analysis completed in ${duration.toFixed(2)}ms`);
    }, 35000);

    it("should serve cached Solana results quickly", async () => {
      // First request to populate cache
      const request1 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testAddresses.solana }),
      });

      await POST(request1);

      // Second request (should hit cache)
      const startTime = performance.now();

      const request2 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testAddresses.solana }),
      });

      const response = await POST(request2);
      const endTime = performance.now();
      const duration = endTime - startTime;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(true);

      // Cached response should be very fast (< 1 second)
      expect(duration).toBeLessThan(1000);

      console.log(`✅ Cached Solana result served in ${duration.toFixed(2)}ms`);
    }, 35000);
  });

  describe("Ethereum Wallet Analysis Performance", () => {
    it("should complete Ethereum analysis within acceptable time", async () => {
      const startTime = performance.now();

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testAddresses.ethereum,
          forceRefresh: true,
        }),
      });

      const response = await POST(request);
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);

      console.log(`✅ Ethereum analysis completed in ${duration.toFixed(2)}ms`);
    }, 35000);

    it("should serve cached Ethereum results quickly", async () => {
      // First request to populate cache
      const request1 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testAddresses.ethereum }),
      });

      await POST(request1);

      // Second request (should hit cache)
      const startTime = performance.now();

      const request2 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testAddresses.ethereum }),
      });

      const response = await POST(request2);
      const endTime = performance.now();
      const duration = endTime - startTime;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.cached).toBe(true);

      // Cached response should be very fast (< 1 second)
      expect(duration).toBeLessThan(1000);

      console.log(
        `✅ Cached Ethereum result served in ${duration.toFixed(2)}ms`
      );
    }, 35000);
  });

  describe("Performance Comparison", () => {
    it("should have comparable performance between Ethereum and Solana", async () => {
      // Measure Ethereum performance
      const ethStartTime = performance.now();
      const ethRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testAddresses.ethereum,
          forceRefresh: true,
        }),
      });
      const ethResponse = await POST(ethRequest);
      const ethEndTime = performance.now();
      const ethDuration = ethEndTime - ethStartTime;

      expect(ethResponse.status).toBe(200);

      // Measure Solana performance
      const solStartTime = performance.now();
      const solRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testAddresses.solana,
          forceRefresh: true,
        }),
      });
      const solResponse = await POST(solRequest);
      const solEndTime = performance.now();
      const solDuration = solEndTime - solStartTime;

      expect(solResponse.status).toBe(200);

      // Performance should be within 2x of each other
      const ratio =
        Math.max(ethDuration, solDuration) / Math.min(ethDuration, solDuration);
      expect(ratio).toBeLessThan(2);

      console.log(`✅ Performance comparison:`);
      console.log(`   Ethereum: ${ethDuration.toFixed(2)}ms`);
      console.log(`   Solana: ${solDuration.toFixed(2)}ms`);
      console.log(`   Ratio: ${ratio.toFixed(2)}x`);
    }, 70000);
  });

  describe("Concurrent Request Performance", () => {
    it("should handle concurrent Ethereum requests efficiently", async () => {
      const concurrentCount = 5;
      const startTime = performance.now();

      const requests = Array.from({ length: concurrentCount }, () => {
        const request = new NextRequest("http://localhost:3000/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: testAddresses.ethereum }),
        });
        return POST(request);
      });

      const responses = await Promise.all(requests);
      const endTime = performance.now();
      const duration = endTime - startTime;

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(35000);

      console.log(
        `✅ ${concurrentCount} concurrent Ethereum requests completed in ${duration.toFixed(2)}ms`
      );
      console.log(
        `   Average: ${(duration / concurrentCount).toFixed(2)}ms per request`
      );
    }, 40000);

    it("should handle concurrent Solana requests efficiently", async () => {
      const concurrentCount = 5;
      const startTime = performance.now();

      const requests = Array.from({ length: concurrentCount }, () => {
        const request = new NextRequest("http://localhost:3000/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: testAddresses.solana }),
        });
        return POST(request);
      });

      const responses = await Promise.all(requests);
      const endTime = performance.now();
      const duration = endTime - startTime;

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(35000);

      console.log(
        `✅ ${concurrentCount} concurrent Solana requests completed in ${duration.toFixed(2)}ms`
      );
      console.log(
        `   Average: ${(duration / concurrentCount).toFixed(2)}ms per request`
      );
    }, 40000);

    it("should handle mixed blockchain concurrent requests", async () => {
      const startTime = performance.now();

      const requests = [
        ...Array.from({ length: 3 }, () => {
          const request = new NextRequest("http://localhost:3000/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: testAddresses.ethereum }),
          });
          return POST(request);
        }),
        ...Array.from({ length: 3 }, () => {
          const request = new NextRequest("http://localhost:3000/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: testAddresses.solana }),
          });
          return POST(request);
        }),
      ];

      const responses = await Promise.all(requests);
      const endTime = performance.now();
      const duration = endTime - startTime;

      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(40000);

      console.log(
        `✅ 6 mixed blockchain concurrent requests completed in ${duration.toFixed(2)}ms`
      );
      console.log(`   Average: ${(duration / 6).toFixed(2)}ms per request`);
    }, 45000);
  });

  describe("Cache Performance", () => {
    it("should demonstrate significant performance improvement with caching", async () => {
      // First request (uncached)
      const uncachedStartTime = performance.now();
      const uncachedRequest = new NextRequest(
        "http://localhost:3000/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: testAddresses.solana,
            forceRefresh: true,
          }),
        }
      );
      const uncachedResponse = await POST(uncachedRequest);
      const uncachedEndTime = performance.now();
      const uncachedDuration = uncachedEndTime - uncachedStartTime;

      expect(uncachedResponse.status).toBe(200);

      // Second request (cached)
      const cachedStartTime = performance.now();
      const cachedRequest = new NextRequest(
        "http://localhost:3000/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: testAddresses.solana }),
        }
      );
      const cachedResponse = await POST(cachedRequest);
      const cachedEndTime = performance.now();
      const cachedDuration = cachedEndTime - cachedStartTime;
      const cachedData = await cachedResponse.json();

      expect(cachedResponse.status).toBe(200);
      expect(cachedData.cached).toBe(true);

      // Cached should be significantly faster
      const speedup = uncachedDuration / cachedDuration;
      expect(speedup).toBeGreaterThan(2); // At least 2x faster

      console.log(`✅ Cache performance improvement:`);
      console.log(`   Uncached: ${uncachedDuration.toFixed(2)}ms`);
      console.log(`   Cached: ${cachedDuration.toFixed(2)}ms`);
      console.log(`   Speedup: ${speedup.toFixed(2)}x`);
    }, 40000);
  });

  describe("Load Testing", () => {
    it("should handle sustained load of mixed requests", async () => {
      const requestCount = 10;
      const startTime = performance.now();

      const results: number[] = [];

      for (let i = 0; i < requestCount; i++) {
        const address =
          i % 2 === 0 ? testAddresses.ethereum : testAddresses.solana;
        const reqStartTime = performance.now();

        const request = new NextRequest("http://localhost:3000/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });

        const response = await POST(request);
        const reqEndTime = performance.now();

        expect(response.status).toBe(200);
        results.push(reqEndTime - reqStartTime);
      }

      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDuration = results.reduce((a, b) => a + b, 0) / results.length;
      const maxDuration = Math.max(...results);
      const minDuration = Math.min(...results);

      console.log(`✅ Load test completed:`);
      console.log(`   Total requests: ${requestCount}`);
      console.log(`   Total time: ${totalDuration.toFixed(2)}ms`);
      console.log(`   Average: ${avgDuration.toFixed(2)}ms`);
      console.log(`   Min: ${minDuration.toFixed(2)}ms`);
      console.log(`   Max: ${maxDuration.toFixed(2)}ms`);

      // Average should be reasonable (most will hit cache)
      expect(avgDuration).toBeLessThan(5000);
    }, 120000);
  });
});
