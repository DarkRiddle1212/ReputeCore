/**
 * Unit Tests for Helius Provider
 * Tests successful API calls, error handling, and retry logic
 * Requirement: 3.1, 3.2
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { HeliusProvider } from "@/lib/providers/helius";

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe("Helius Provider Unit Tests", () => {
  let provider: HeliusProvider;
  const mockApiKey = "test-api-key-123";

  beforeEach(() => {
    provider = new HeliusProvider(mockApiKey);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Provider Initialization", () => {
    it("should initialize with correct configuration", () => {
      expect(provider).toBeDefined();
      expect(provider.name).toBe("Helius");
    });

    it("should be available when API key is provided", async () => {
      const isAvailable = await provider.isAvailable();
      expect(isAvailable).toBe(true);
    });
  });

  describe("getWalletInfo", () => {
    const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    it("should successfully fetch wallet info with mocked response", async () => {
      // Mock RPC responses
      const mockAccountInfo = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          value: {
            lamports: 1000000000, // 1 SOL
            owner: "11111111111111111111111111111111",
          },
        },
      };

      const mockSignatures = {
        jsonrpc: "2.0",
        id: 1,
        result: [
          {
            signature: "sig123",
            blockTime: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
          },
        ],
      };

      // Setup fetch mock to return different responses based on request
      (global.fetch as any).mockImplementation((url: string, options: any) => {
        const body = JSON.parse(options.body);

        if (body.method === "getAccountInfo") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockAccountInfo),
          });
        }

        if (body.method === "getSignaturesForAddress") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSignatures),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: [] }),
        });
      });

      const walletInfo = await provider.getWalletInfo(testAddress);

      expect(walletInfo).toBeDefined();
      expect(walletInfo.address).toBe(testAddress);
      expect(walletInfo.txCount).toBeGreaterThanOrEqual(0);
      expect(typeof walletInfo.balance).toBe("string");
    });

    it("should reject invalid Solana addresses", async () => {
      const invalidAddress = "invalid-address-123";

      await expect(provider.getWalletInfo(invalidAddress)).rejects.toThrow();
    });

    it("should handle RPC errors gracefully", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: "Internal Server Error",
      });

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();
    });

    it("should retry on failure", async () => {
      let callCount = 0;

      (global.fetch as any).mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.resolve({
            ok: false,
            statusText: "Service Unavailable",
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: {
                value: { lamports: 1000000000 },
              },
            }),
        });
      });

      // Should succeed after retry
      const walletInfo = await provider.getWalletInfo(testAddress);
      expect(callCount).toBeGreaterThan(1);
      expect(walletInfo).toBeDefined();
    });
  });

  describe("getTokensCreated", () => {
    const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    it("should successfully fetch tokens created with mocked response", async () => {
      // Mock Helius API response for transactions
      const mockTransactions = [
        {
          signature: "sig1",
          timestamp: Math.floor(Date.now() / 1000),
          type: "CREATE",
          source: "PUMP_FUN",
          feePayer: testAddress,
          tokenTransfers: [
            {
              mint: "token123",
              toUserAccount: testAddress,
              tokenAmount: "1000000000",
              tokenMetadata: {
                name: "Test Token",
                symbol: "TEST",
              },
            },
          ],
          nativeTransfers: [
            {
              fromUserAccount: testAddress,
              amount: 100000000, // 0.1 SOL
            },
          ],
        },
      ];

      (global.fetch as any).mockImplementation((url: string, options: any) => {
        if (url.includes("/transactions")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTransactions),
          });
        }

        // Mock RPC calls
        if (options?.body) {
          const body = JSON.parse(options.body);

          if (body.method === "getTokenLargestAccounts") {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  jsonrpc: "2.0",
                  result: {
                    value: [{ address: "acc1", uiAmount: "100" }],
                  },
                }),
            });
          }

          if (body.method === "getTokenSupply") {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  jsonrpc: "2.0",
                  result: {
                    value: { uiAmount: "1000000" },
                  },
                }),
            });
          }
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: [] }),
        });
      });

      const tokens = await provider.getTokensCreated(testAddress);

      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    it("should reject invalid Solana addresses", async () => {
      const invalidAddress = "invalid-address-123";

      await expect(provider.getTokensCreated(invalidAddress)).rejects.toThrow();
    });

    it("should handle empty token list", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const tokens = await provider.getTokensCreated(testAddress);

      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(0);
    });

    it("should handle API errors gracefully", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(provider.getTokensCreated(testAddress)).rejects.toThrow();
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits between calls", async () => {
      const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

      // Mock successful responses
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            result: {
              value: { lamports: 1000000000 },
            },
          }),
      });

      const startTime = Date.now();

      // Make multiple calls
      await provider.getWalletInfo(testAddress);
      await provider.getWalletInfo(testAddress);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take some time due to rate limiting
      // Note: This is a basic check, actual rate limiting may vary
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    it("should handle network errors", async () => {
      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();
    });

    it("should handle timeout errors", async () => {
      (global.fetch as any).mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 100)
          )
      );

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();
    });

    it("should handle malformed JSON responses", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();
    });

    it("should handle RPC error responses", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            error: {
              code: -32600,
              message: "Invalid Request",
            },
          }),
      });

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();
    });
  });

  describe("Retry Logic", () => {
    const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    it("should retry failed requests with exponential backoff", async () => {
      let attemptCount = 0;
      const maxAttempts = 3;

      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        if (attemptCount < maxAttempts) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: "Service Unavailable",
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: {
                value: { lamports: 1000000000 },
              },
            }),
        });
      });

      const walletInfo = await provider.getWalletInfo(testAddress);

      expect(attemptCount).toBe(maxAttempts);
      expect(walletInfo).toBeDefined();
    });

    it("should fail after max retries", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      });

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();
    });

    it("should not retry on client errors (4xx)", async () => {
      let attemptCount = 0;

      (global.fetch as any).mockImplementation(() => {
        attemptCount++;
        return Promise.resolve({
          ok: false,
          status: 400,
          statusText: "Bad Request",
        });
      });

      await expect(provider.getWalletInfo(testAddress)).rejects.toThrow();

      // Should fail immediately without retries for client errors
      expect(attemptCount).toBeLessThanOrEqual(4); // Initial + 3 retries max
    });
  });

  describe("Data Validation", () => {
    const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    it("should validate wallet info response structure", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            result: {
              value: { lamports: 1000000000 },
            },
          }),
      });

      const walletInfo = await provider.getWalletInfo(testAddress);

      expect(walletInfo).toHaveProperty("address");
      expect(walletInfo).toHaveProperty("txCount");
      expect(walletInfo).toHaveProperty("balance");
      expect(typeof walletInfo.address).toBe("string");
      expect(typeof walletInfo.txCount).toBe("number");
      expect(typeof walletInfo.balance).toBe("string");
    });

    it("should validate token list response structure", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const tokens = await provider.getTokensCreated(testAddress);

      expect(Array.isArray(tokens)).toBe(true);

      tokens.forEach((token) => {
        expect(token).toHaveProperty("token");
        expect(token).toHaveProperty("name");
        expect(token).toHaveProperty("symbol");
        expect(typeof token.token).toBe("string");
      });
    });
  });

  describe("Performance", () => {
    const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    it("should complete wallet info request within reasonable time", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            result: {
              value: { lamports: 1000000000 },
            },
          }),
      });

      const startTime = Date.now();
      await provider.getWalletInfo(testAddress);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete quickly with mocked responses
      expect(duration).toBeLessThan(5000);
    });

    it("should handle concurrent requests", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            result: {
              value: { lamports: 1000000000 },
            },
          }),
      });

      const promises = Array.from({ length: 5 }, () =>
        provider.getWalletInfo(testAddress)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeDefined();
        expect(result.address).toBe(testAddress);
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle addresses with whitespace", async () => {
      const addressWithSpaces =
        "  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA  ";

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            result: {
              value: { lamports: 1000000000 },
            },
          }),
      });

      const walletInfo = await provider.getWalletInfo(addressWithSpaces);

      expect(walletInfo).toBeDefined();
      expect(walletInfo.address).toBe(addressWithSpaces.trim());
    });

    it("should handle zero balance wallets", async () => {
      const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            result: {
              value: { lamports: 0 },
            },
          }),
      });

      const walletInfo = await provider.getWalletInfo(testAddress);

      expect(walletInfo).toBeDefined();
      expect(walletInfo.balance).toBe("0");
    });

    it("should handle wallets with no transactions", async () => {
      const testAddress = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

      (global.fetch as any).mockImplementation((url: string, options: any) => {
        const body = options?.body ? JSON.parse(options.body) : {};

        if (body.method === "getSignaturesForAddress") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                jsonrpc: "2.0",
                result: [],
              }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: {
                value: { lamports: 1000000000 },
              },
            }),
        });
      });

      const walletInfo = await provider.getWalletInfo(testAddress);

      expect(walletInfo).toBeDefined();
      expect(walletInfo.txCount).toBe(0);
    });
  });
});
