// Basic tests for type definitions and schemas

import { describe, it, expect } from "@jest/globals";
import {
  EthereumAddressSchema,
  AnalyzeRequestSchema,
  WalletInfoSchema,
  TokenSummarySchema,
  ScoringResultSchema,
  WEIGHT_SCHEMES,
  type WeightScheme,
  type ConfidenceLevel,
} from "@/types";

describe("Type Definitions", () => {
  describe("EthereumAddressSchema", () => {
    it("should validate correct Ethereum addresses", () => {
      const validAddresses = [
        "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        "0x0000000000000000000000000000000000000000",
        "0xffffffffffffffffffffffffffffffffffffffff",
      ];

      validAddresses.forEach((address) => {
        expect(() => EthereumAddressSchema.parse(address)).not.toThrow();
      });
    });

    it("should reject invalid Ethereum addresses", () => {
      const invalidAddresses = [
        "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b", // too short
        "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b66", // too long
        "742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6", // missing 0x
        "0xGGGd35Cc6634C0532925a3b8D4C9db96C4b4d8b6", // invalid characters
        "",
      ];

      invalidAddresses.forEach((address) => {
        expect(() => EthereumAddressSchema.parse(address)).toThrow();
      });
    });
  });

  describe("AnalyzeRequestSchema", () => {
    it("should validate correct analyze requests", () => {
      const validRequests = [
        {
          address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        },
        {
          address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
          forceRefresh: true,
        },
        {
          address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
          forceRefresh: false,
        },
      ];

      validRequests.forEach((request) => {
        expect(() => AnalyzeRequestSchema.parse(request)).not.toThrow();
      });
    });

    it("should set default forceRefresh to false", () => {
      const request = {
        address: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
      };

      const parsed = AnalyzeRequestSchema.parse(request);
      expect(parsed.forceRefresh).toBe(false);
    });
  });

  describe("WalletInfoSchema", () => {
    it("should validate wallet info with all fields", () => {
      const walletInfo = {
        createdAt: "2023-01-01T00:00:00Z",
        firstTxHash:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        txCount: 100,
        age: "365 days",
      };

      expect(() => WalletInfoSchema.parse(walletInfo)).not.toThrow();
    });

    it("should validate wallet info with minimal fields", () => {
      const walletInfo = {
        createdAt: null,
        txCount: 0,
      };

      expect(() => WalletInfoSchema.parse(walletInfo)).not.toThrow();
    });

    it("should reject negative transaction count", () => {
      const walletInfo = {
        createdAt: null,
        txCount: -1,
      };

      expect(() => WalletInfoSchema.parse(walletInfo)).toThrow();
    });
  });

  describe("TokenSummarySchema", () => {
    it("should validate token summary with all fields", () => {
      const tokenSummary = {
        token: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        name: "Test Token",
        symbol: "TEST",
        creator: "0x1234567890123456789012345678901234567890",
        launchAt: "2023-01-01T00:00:00Z",
        initialLiquidity: 1000,
        holdersAfter7Days: 200,
        liquidityLocked: true,
        devSellRatio: 0.25,
      };

      expect(() => TokenSummarySchema.parse(tokenSummary)).not.toThrow();
    });

    it("should reject invalid dev sell ratio", () => {
      const tokenSummary = {
        token: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
        devSellRatio: 1.5, // > 1.0
      };

      expect(() => TokenSummarySchema.parse(tokenSummary)).toThrow();
    });
  });

  describe("ScoringResultSchema", () => {
    it("should validate complete scoring result", () => {
      const scoringResult = {
        score: 75,
        breakdown: {
          walletAgeScore: 80,
          activityScore: 60,
          tokenOutcomeScore: 70,
          heuristicsScore: 90,
          final: 75,
        },
        notes: ["Wallet is 365+ days old", "High transaction activity"],
      };

      expect(() => ScoringResultSchema.parse(scoringResult)).not.toThrow();
    });

    it("should reject scores outside valid range", () => {
      const scoringResult = {
        score: 150, // > 100
        breakdown: {
          walletAgeScore: 80,
          activityScore: 60,
          tokenOutcomeScore: 70,
          heuristicsScore: 90,
          final: 75,
        },
        notes: [],
      };

      expect(() => ScoringResultSchema.parse(scoringResult)).toThrow();
    });
  });

  describe("Weight Schemes", () => {
    it("should have all required weight schemes", () => {
      const schemes: WeightScheme[] = [
        "no_tokens",
        "limited_data",
        "full_data",
      ];

      schemes.forEach((scheme) => {
        expect(WEIGHT_SCHEMES[scheme]).toBeDefined();
        const weights = WEIGHT_SCHEMES[scheme];

        // Check that weights sum to 1.0 (within floating point tolerance)
        const sum =
          weights.walletAge +
          weights.activity +
          weights.tokenOutcome +
          weights.heuristics;
        expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
      });
    });

    it("should have correct weight distributions", () => {
      // No tokens: age 60%, activity 40%, others 0%
      expect(WEIGHT_SCHEMES.no_tokens.walletAge).toBe(0.6);
      expect(WEIGHT_SCHEMES.no_tokens.activity).toBe(0.4);
      expect(WEIGHT_SCHEMES.no_tokens.tokenOutcome).toBe(0.0);
      expect(WEIGHT_SCHEMES.no_tokens.heuristics).toBe(0.0);

      // Full data: age 20%, activity 10%, outcome 35%, heuristics 35%
      expect(WEIGHT_SCHEMES.full_data.walletAge).toBe(0.2);
      expect(WEIGHT_SCHEMES.full_data.activity).toBe(0.1);
      expect(WEIGHT_SCHEMES.full_data.tokenOutcome).toBe(0.35);
      expect(WEIGHT_SCHEMES.full_data.heuristics).toBe(0.35);
    });
  });

  describe("Type Safety", () => {
    it("should enforce confidence level types", () => {
      const validLevels: ConfidenceLevel[] = ["HIGH", "MEDIUM", "MEDIUM-LOW"];

      // This test ensures TypeScript compilation - if types are wrong, it won't compile
      validLevels.forEach((level) => {
        expect(typeof level).toBe("string");
      });
    });
  });
});
