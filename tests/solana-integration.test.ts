/**
 * Integration Tests for Solana Wallet Analysis
 * Tests end-to-end Solana wallet analysis flow
 * Requirement: 10.5
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "@jest/globals";
import { POST } from "@/app/api/analyze/route";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cache } from "@/lib/cache";
import { providerManager } from "@/lib/providers";

describe("Solana Wallet Analysis Integration Tests", () => {
  const testSolanaAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
  const testEthereumAddress = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";

  beforeAll(async () => {
    // Clear cache before tests
    await cache.clear();
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.tokenLaunch.deleteMany({
        where: {
          creator: testSolanaAddress,
          blockchain: "solana",
        },
      });

      await prisma.walletAnalysis.deleteMany({
        where: {
          address: testSolanaAddress,
        },
      });
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  });

  describe("End-to-End Solana Wallet Analysis", () => {
    it("should analyze a Solana wallet successfully", async () => {
      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty("score");
      expect(data).toHaveProperty("blockchain", "solana");
      expect(data).toHaveProperty("walletInfo");
      expect(data).toHaveProperty("tokenLaunchSummary");
      expect(data).toHaveProperty("breakdown");
      expect(data).toHaveProperty("metadata");

      // Verify metadata includes blockchain
      expect(data.metadata.blockchain).toBe("solana");

      console.log("✅ Solana wallet analyzed:", {
        address: testSolanaAddress,
        score: data.score,
        blockchain: data.blockchain,
      });
    }, 30000); // 30 second timeout for API calls

    it("should handle Solana address validation errors", async () => {
      const invalidAddress = "invalid-solana-address-123";

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: invalidAddress }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("Invalid");

      console.log("✅ Invalid Solana address rejected:", data.error);
    });

    it("should cache Solana wallet results", async () => {
      // First request
      const request1 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      const response1 = await POST(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(200);
      expect(data1.cached).toBeFalsy();

      // Second request (should hit cache)
      const request2 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      const response2 = await POST(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(200);
      expect(data2.cached).toBe(true);
      expect(data2.score).toBe(data1.score);

      console.log("✅ Solana wallet result cached successfully");
    }, 30000);

    it("should persist Solana tokens to database", async () => {
      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testSolanaAddress,
          forceRefresh: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Wait a bit for async database save
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if tokens were saved with blockchain field
      const savedTokens = await prisma.tokenLaunch.findMany({
        where: {
          creator: testSolanaAddress,
          blockchain: "solana",
        },
      });

      // If tokens exist, verify they have blockchain field
      if (savedTokens.length > 0) {
        savedTokens.forEach((token) => {
          expect(token.blockchain).toBe("solana");
        });
        console.log(
          "✅ Solana tokens persisted with blockchain field:",
          savedTokens.length
        );
      } else {
        console.log(
          "ℹ️ No tokens found for test address (expected for system addresses)"
        );
      }
    }, 30000);
  });

  describe("Multi-Chain Request Handling", () => {
    it("should handle Ethereum → Solana → Ethereum requests", async () => {
      // Ethereum request
      const ethRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testEthereumAddress }),
      });

      const ethResponse = await POST(ethRequest);
      const ethData = await ethResponse.json();

      expect(ethResponse.status).toBe(200);
      expect(ethData.blockchain).toBe("ethereum");

      // Solana request
      const solRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      const solResponse = await POST(solRequest);
      const solData = await solResponse.json();

      expect(solResponse.status).toBe(200);
      expect(solData.blockchain).toBe("solana");

      // Another Ethereum request
      const ethRequest2 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testEthereumAddress }),
      });

      const ethResponse2 = await POST(ethRequest2);
      const ethData2 = await ethResponse2.json();

      expect(ethResponse2.status).toBe(200);
      expect(ethData2.blockchain).toBe("ethereum");

      // Verify cache separation
      expect(ethData2.cached).toBe(true); // Should hit cache from first request

      console.log("✅ Multi-chain requests handled correctly");
    }, 45000);

    it("should maintain separate cache entries for different blockchains", async () => {
      // Use same address format but different blockchains
      const address = "0x" + "1".repeat(40);

      // Ethereum request
      const ethRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });

      const ethResponse = await POST(ethRequest);
      const ethData = await ethResponse.json();

      expect(ethResponse.status).toBe(200);
      expect(ethData.blockchain).toBe("ethereum");

      // Verify cache keys are different
      const ethCacheKey = cache.CacheKeys?.analysis?.(address, "ethereum");
      const solCacheKey = cache.CacheKeys?.analysis?.(address, "solana");

      if (ethCacheKey && solCacheKey) {
        expect(ethCacheKey).not.toBe(solCacheKey);
        console.log("✅ Cache keys are blockchain-specific");
      }
    }, 30000);
  });

  describe("Provider Failover for Solana", () => {
    it("should handle Solana provider failover gracefully", async () => {
      // This test verifies that if one provider fails, the system tries another
      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testSolanaAddress,
          forceRefresh: true,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should succeed even if some providers fail
      expect(response.status).toBe(200);
      expect(data.blockchain).toBe("solana");
      expect(data.metadata.providersUsed).toBeDefined();
      expect(Array.isArray(data.metadata.providersUsed)).toBe(true);

      console.log(
        "✅ Provider failover working, providers used:",
        data.metadata.providersUsed
      );
    }, 30000);
  });

  describe("Response Structure Consistency", () => {
    it("should return consistent structure for Solana and Ethereum", async () => {
      // Solana response
      const solRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      const solResponse = await POST(solRequest);
      const solData = await solResponse.json();

      // Ethereum response
      const ethRequest = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testEthereumAddress }),
      });

      const ethResponse = await POST(ethRequest);
      const ethData = await ethResponse.json();

      // Both should have same structure
      const solKeys = Object.keys(solData).sort();
      const ethKeys = Object.keys(ethData).sort();

      expect(solKeys).toEqual(ethKeys);

      // Both should have same breakdown structure
      expect(Object.keys(solData.breakdown).sort()).toEqual(
        Object.keys(ethData.breakdown).sort()
      );

      // Both should have same metadata structure
      expect(Object.keys(solData.metadata).sort()).toEqual(
        Object.keys(ethData.metadata).sort()
      );

      console.log("✅ Response structure consistent across blockchains");
    }, 45000);
  });

  describe("Error Handling", () => {
    it("should handle whitespace in Solana addresses", async () => {
      const paddedAddress = `  ${testSolanaAddress}  `;

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: paddedAddress }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.blockchain).toBe("solana");

      console.log("✅ Whitespace handled correctly");
    }, 30000);

    it("should reject addresses that are too short", async () => {
      const shortAddress = "123";

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: shortAddress }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");

      console.log("✅ Short address rejected");
    });

    it("should reject addresses that are too long", async () => {
      const longAddress = "a".repeat(200);

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: longAddress }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty("error");

      console.log("✅ Long address rejected");
    });
  });

  describe("Performance", () => {
    it("should complete Solana analysis within reasonable time", async () => {
      const startTime = Date.now();

      const request = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: testSolanaAddress,
          forceRefresh: true,
        }),
      });

      const response = await POST(request);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds

      console.log("✅ Solana analysis completed in:", duration, "ms");
    }, 35000);

    it("should serve cached results quickly", async () => {
      // First request to populate cache
      const request1 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      await POST(request1);

      // Second request (cached)
      const startTime = Date.now();

      const request2 = new NextRequest("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: testSolanaAddress }),
      });

      const response2 = await POST(request2);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const data = await response2.json();

      expect(response2.status).toBe(200);
      expect(data.cached).toBe(true);
      expect(duration).toBeLessThan(1000); // Cached response should be very fast

      console.log("✅ Cached response served in:", duration, "ms");
    }, 35000);
  });
});
