// Tests for provider system

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { BaseProvider, ProviderManager } from "../lib/providers";
import { WalletInfo, TokenSummary } from "@/types";

// Mock provider implementation for testing
class MockProvider extends BaseProvider {
  private shouldFail: boolean = false;
  private mockWalletInfo: WalletInfo = {
    createdAt: "2023-01-01T00:00:00Z",
    txCount: 100,
    age: "365 days",
  };
  private mockTokens: TokenSummary[] = [
    {
      token: "0x1234567890123456789012345678901234567890",
      name: "Test Token",
      symbol: "TEST",
      creator: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    },
  ];

  constructor(name: string, priority: number = 1) {
    super({
      name,
      priority,
      maxRequestsPerSecond: 10,
      maxRequestsPerMinute: 60,
    });
  }

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }

  async getWalletInfo(address: string): Promise<WalletInfo> {
    this.validateAddress(address);
    if (this.shouldFail) {
      throw new Error(`${this.name} provider failed`);
    }
    return this.mockWalletInfo;
  }

  async getTokensCreated(address: string): Promise<TokenSummary[]> {
    this.validateAddress(address);
    if (this.shouldFail) {
      throw new Error(`${this.name} provider failed`);
    }
    return this.mockTokens;
  }

  // Test helper methods
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setMockWalletInfo(walletInfo: WalletInfo): void {
    this.mockWalletInfo = walletInfo;
  }

  setMockTokens(tokens: TokenSummary[]): void {
    this.mockTokens = tokens;
  }
}

describe("BaseProvider", () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider("test-provider", 1);
  });

  describe("Address Validation", () => {
    it("should validate correct Ethereum addresses", async () => {
      const validAddress = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      await expect(provider.getWalletInfo(validAddress)).resolves.toBeDefined();
    });

    it("should reject invalid Ethereum addresses", async () => {
      const invalidAddresses = [
        "",
        "invalid",
        "0x123", // Too short
        "0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", // Invalid characters
        "742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6", // Missing 0x prefix
      ];

      for (const address of invalidAddresses) {
        await expect(provider.getWalletInfo(address)).rejects.toThrow();
      }
    });

    it("should normalize addresses to lowercase", async () => {
      const mixedCaseAddress = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const normalizedAddress = (provider as any).normalizeAddress(
        mixedCaseAddress
      );
      expect(normalizedAddress).toBe(mixedCaseAddress.toLowerCase());
    });
  });

  describe("Rate Limiting", () => {
    it("should track rate limit information", () => {
      const rateLimit = provider.getRateLimit();
      expect(rateLimit).toHaveProperty("remaining");
      expect(rateLimit).toHaveProperty("resetTime");
      expect(typeof rateLimit.remaining).toBe("number");
      expect(typeof rateLimit.resetTime).toBe("number");
    });

    it("should update rate limit from headers", () => {
      const headers = {
        "x-ratelimit-remaining": "50",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
        "x-ratelimit-limit": "100",
      };

      (provider as any).updateRateLimit(headers);
      const rateLimit = provider.getRateLimit();
      expect(rateLimit.remaining).toBe(50);
    });
  });

  describe("Health Status", () => {
    it("should return health status when available", async () => {
      const health = await provider.getHealthStatus();
      expect(health.name).toBe("test-provider");
      expect(health.available).toBe(true);
      expect(health.rateLimit).toBeDefined();
    });

    it("should return unhealthy status when provider fails", async () => {
      provider.setShouldFail(true);
      const health = await provider.getHealthStatus();
      expect(health.available).toBe(false);
      expect(health.lastError).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should return provider configuration", () => {
      const config = provider.getConfig();
      expect(config.name).toBe("test-provider");
      expect(config.priority).toBe(1);
      expect(config.maxRequestsPerSecond).toBe(10);
    });

    it("should return correct priority", () => {
      expect(provider.getPriority()).toBe(1);
    });
  });
});

describe("ProviderManager", () => {
  let manager: ProviderManager;
  let provider1: MockProvider;
  let provider2: MockProvider;

  beforeEach(() => {
    manager = new ProviderManager({
      maxRetries: 2,
      retryDelay: 100,
      fallbackTimeout: 1000,
    });
    provider1 = new MockProvider("provider-1", 1);
    provider2 = new MockProvider("provider-2", 2);
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe("Provider Registration", () => {
    it("should register providers", () => {
      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      expect(manager.getProviderCount()).toBe(2);
      expect(manager.hasProvider("provider-1")).toBe(true);
      expect(manager.hasProvider("provider-2")).toBe(true);
    });

    it("should unregister providers", () => {
      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      manager.unregisterProvider("provider-1");

      expect(manager.getProviderCount()).toBe(1);
      expect(manager.hasProvider("provider-1")).toBe(false);
      expect(manager.hasProvider("provider-2")).toBe(true);
    });

    it("should sort providers by priority", () => {
      const provider3 = new MockProvider("provider-3", 0); // Highest priority

      manager.registerProvider(provider1); // Priority 1
      manager.registerProvider(provider2); // Priority 2
      manager.registerProvider(provider3); // Priority 0

      const providers = manager.getProviders();
      expect(providers[0].name).toBe("provider-3"); // Lowest number = highest priority
      expect(providers[1].name).toBe("provider-1");
      expect(providers[2].name).toBe("provider-2");
    });
  });

  describe("Wallet Info Retrieval", () => {
    it("should get wallet info from available provider", async () => {
      manager.registerProvider(provider1);

      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const walletInfo = await manager.getWalletInfo(address);

      expect(walletInfo).toBeDefined();
      expect(walletInfo.txCount).toBe(100);
    });

    it("should failover to next provider when first fails", async () => {
      provider1.setShouldFail(true);
      provider2.setMockWalletInfo({
        createdAt: "2023-06-01T00:00:00Z",
        txCount: 200,
        age: "180 days",
      });

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const walletInfo = await manager.getWalletInfo(address);

      expect(walletInfo.txCount).toBe(200); // Should get from provider2
    });

    it("should return default values when all providers fail", async () => {
      provider1.setShouldFail(true);
      provider2.setShouldFail(true);

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const walletInfo = await manager.getWalletInfo(address);

      expect(walletInfo.createdAt).toBeNull();
      expect(walletInfo.txCount).toBe(0);
    });
  });

  describe("Token Retrieval", () => {
    it("should get tokens from available provider", async () => {
      manager.registerProvider(provider1);

      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const tokens = await manager.getTokensCreated(address);

      expect(tokens).toHaveLength(1);
      expect(tokens[0].symbol).toBe("TEST");
    });

    it("should return empty array when all providers fail", async () => {
      provider1.setShouldFail(true);
      provider2.setShouldFail(true);

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const tokens = await manager.getTokensCreated(address);

      expect(tokens).toEqual([]);
    });
  });

  describe("Provider Status", () => {
    it("should get status of all providers", async () => {
      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      const statuses = await manager.getProviderStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0].name).toBe("provider-1"); // Higher priority first
      expect(statuses[0].available).toBe(true);
      expect(statuses[1].name).toBe("provider-2");
    });

    it("should show unavailable status for failed providers", async () => {
      provider1.setShouldFail(true);

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      const statuses = await manager.getProviderStatuses();

      expect(statuses[0].available).toBe(false);
      expect(statuses[1].available).toBe(true);
    });
  });

  describe("Health Checks", () => {
    it("should start and stop health checks", () => {
      expect(() => manager.startHealthChecks()).not.toThrow();
      expect(() => manager.stopHealthChecks()).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle no providers gracefully", async () => {
      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";

      const walletInfo = await manager.getWalletInfo(address);
      expect(walletInfo.createdAt).toBeNull();
      expect(walletInfo.txCount).toBe(0);
    });

    it("should handle provider timeout", async () => {
      // Create a provider that takes too long
      class SlowProvider extends MockProvider {
        async getWalletInfo(address: string): Promise<WalletInfo> {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
          return super.getWalletInfo(address);
        }
      }

      const slowProvider = new SlowProvider("slow-provider");
      manager = new ProviderManager({ fallbackTimeout: 500 }); // 500ms timeout
      manager.registerProvider(slowProvider);

      const address = "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6";
      const walletInfo = await manager.getWalletInfo(address);

      // Should return defaults due to timeout
      expect(walletInfo.createdAt).toBeNull();
      expect(walletInfo.txCount).toBe(0);
    });
  });
});
