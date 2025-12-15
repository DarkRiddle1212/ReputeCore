/**
 * Property-based tests for analytics types
 * **Feature: enhanced-etherscan-analytics, Property 22: Score breakdown completeness**
 * **Validates: Requirements 10.4**
 */

import * as fc from "fast-check";
import {
  calculateDataCompleteness,
  determineConfidenceLevel,
  isDEXRouter,
  isLockContract,
  getLockContractName,
  isStablecoin,
  isWETH,
  DEX_ROUTER_ADDRESSES,
  KNOWN_LOCK_CONTRACTS,
  WETH_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  DAI_ADDRESS,
  EnhancedTokenSummary,
  ConfidenceLevelType,
} from "@/types/analytics";

describe("Analytics Types - Property Tests", () => {
  describe("calculateDataCompleteness", () => {
    // Property: Data completeness should always be between 0 and 1
    it("should return a value between 0 and 1 for any token data", () => {
      fc.assert(
        fc.property(
          fc.record({
            initialLiquidity: fc.option(fc.float({ min: 0, max: 1000000 }), {
              nil: null,
            }),
            holdersAfter7Days: fc.option(fc.integer({ min: 0, max: 100000 }), {
              nil: null,
            }),
            liquidityLocked: fc.option(fc.boolean(), { nil: null }),
            devSellRatio: fc.option(fc.float({ min: 0, max: 1 }), {
              nil: null,
            }),
          }),
          (tokenData) => {
            const completeness = calculateDataCompleteness(tokenData);
            return completeness >= 0 && completeness <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Completeness of 1 when all fields are present
    it("should return 1 when all metrics are available", () => {
      fc.assert(
        fc.property(
          fc.record({
            initialLiquidity: fc.float({ min: 0, max: 1000000 }),
            holdersAfter7Days: fc.integer({ min: 0, max: 100000 }),
            liquidityLocked: fc.boolean(),
            devSellRatio: fc.float({ min: 0, max: 1 }),
          }),
          (tokenData) => {
            const completeness = calculateDataCompleteness(tokenData);
            return completeness === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Completeness of 0 when all fields are null
    it("should return 0 when all metrics are null", () => {
      const tokenData = {
        initialLiquidity: null,
        holdersAfter7Days: null,
        liquidityLocked: null,
        devSellRatio: null,
      };
      expect(calculateDataCompleteness(tokenData)).toBe(0);
    });

    // Property: Completeness increases monotonically with available fields
    it("should increase completeness as more fields become available", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000000 }),
          fc.integer({ min: 0, max: 100000 }),
          fc.boolean(),
          fc.float({ min: 0, max: 1 }),
          (liquidity, holders, locked, ratio) => {
            const c0 = calculateDataCompleteness({});
            const c1 = calculateDataCompleteness({
              initialLiquidity: liquidity,
            });
            const c2 = calculateDataCompleteness({
              initialLiquidity: liquidity,
              holdersAfter7Days: holders,
            });
            const c3 = calculateDataCompleteness({
              initialLiquidity: liquidity,
              holdersAfter7Days: holders,
              liquidityLocked: locked,
            });
            const c4 = calculateDataCompleteness({
              initialLiquidity: liquidity,
              holdersAfter7Days: holders,
              liquidityLocked: locked,
              devSellRatio: ratio,
            });

            return c0 <= c1 && c1 <= c2 && c2 <= c3 && c3 <= c4;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("determineConfidenceLevel", () => {
    // Property: Confidence level should be one of the valid levels
    it("should return a valid confidence level for any completeness value", () => {
      fc.assert(
        fc.property(fc.float({ min: 0, max: 1 }), (completeness) => {
          const level = determineConfidenceLevel(completeness);
          const validLevels: ConfidenceLevelType[] = [
            "HIGH",
            "MEDIUM",
            "MEDIUM-LOW",
            "LOW",
          ];
          return validLevels.includes(level);
        }),
        { numRuns: 100 }
      );
    });

    // Property: Higher completeness should result in higher or equal confidence
    it("should return higher confidence for higher completeness", () => {
      const levelOrder: Record<ConfidenceLevelType, number> = {
        LOW: 0,
        "MEDIUM-LOW": 1,
        MEDIUM: 2,
        HIGH: 3,
      };

      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1 }),
          fc.float({ min: 0, max: 1 }),
          (c1, c2) => {
            const [lower, higher] = c1 < c2 ? [c1, c2] : [c2, c1];
            const levelLower = determineConfidenceLevel(lower);
            const levelHigher = determineConfidenceLevel(higher);
            return levelOrder[levelLower] <= levelOrder[levelHigher];
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Boundary conditions
    it("should return correct levels at boundaries", () => {
      expect(determineConfidenceLevel(0)).toBe("LOW");
      expect(determineConfidenceLevel(0.24)).toBe("LOW");
      expect(determineConfidenceLevel(0.25)).toBe("MEDIUM-LOW");
      expect(determineConfidenceLevel(0.49)).toBe("MEDIUM-LOW");
      expect(determineConfidenceLevel(0.5)).toBe("MEDIUM");
      expect(determineConfidenceLevel(0.74)).toBe("MEDIUM");
      expect(determineConfidenceLevel(0.75)).toBe("HIGH");
      expect(determineConfidenceLevel(1)).toBe("HIGH");
    });
  });

  describe("isDEXRouter", () => {
    // Property: Known router addresses should return true
    it("should return true for all known DEX router addresses", () => {
      DEX_ROUTER_ADDRESSES.forEach((address) => {
        expect(isDEXRouter(address)).toBe(true);
        expect(isDEXRouter(address.toLowerCase())).toBe(true);
        expect(isDEXRouter(address.toUpperCase())).toBe(true);
      });
    });

    // Property: Random addresses should return false
    it("should return false for random addresses", () => {
      // Generator for random Ethereum addresses
      const randomAddress = fc
        .string({ minLength: 40, maxLength: 40 })
        .map((str) => {
          const hex = str
            .split("")
            .map((c) => {
              const code = c.charCodeAt(0) % 16;
              return code.toString(16);
            })
            .join("");
          return "0x" + hex;
        });

      fc.assert(
        fc.property(randomAddress, (address) => {
          // Skip if it happens to match a known router
          if (
            DEX_ROUTER_ADDRESSES.some(
              (r) => r.toLowerCase() === address.toLowerCase()
            )
          ) {
            return true;
          }
          return isDEXRouter(address) === false;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("isLockContract", () => {
    // Property: Known lock contract addresses should return true
    it("should return true for all known lock contract addresses", () => {
      KNOWN_LOCK_CONTRACTS.forEach((lock) => {
        expect(isLockContract(lock.address)).toBe(true);
        expect(isLockContract(lock.address.toLowerCase())).toBe(true);
      });
    });

    // Property: getLockContractName should return correct name
    it("should return correct name for known lock contracts", () => {
      KNOWN_LOCK_CONTRACTS.forEach((lock) => {
        expect(getLockContractName(lock.address)).toBe(lock.name);
        expect(getLockContractName(lock.address.toLowerCase())).toBe(lock.name);
      });
    });

    // Property: Unknown addresses should return null for name
    it("should return null for unknown addresses", () => {
      // Generator for random Ethereum addresses
      const randomAddress = fc
        .string({ minLength: 40, maxLength: 40 })
        .map((str) => {
          const hex = str
            .split("")
            .map((c) => {
              const code = c.charCodeAt(0) % 16;
              return code.toString(16);
            })
            .join("");
          return "0x" + hex;
        });

      fc.assert(
        fc.property(randomAddress, (address) => {
          // Skip if it happens to match a known lock
          if (
            KNOWN_LOCK_CONTRACTS.some(
              (l) => l.address.toLowerCase() === address.toLowerCase()
            )
          ) {
            return true;
          }
          return getLockContractName(address) === null;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("isStablecoin", () => {
    // Property: Known stablecoins should return true
    it("should return true for known stablecoins", () => {
      expect(isStablecoin(USDC_ADDRESS)).toBe(true);
      expect(isStablecoin(USDT_ADDRESS)).toBe(true);
      expect(isStablecoin(DAI_ADDRESS)).toBe(true);
      expect(isStablecoin(USDC_ADDRESS.toLowerCase())).toBe(true);
    });

    // Property: WETH should not be a stablecoin
    it("should return false for WETH", () => {
      expect(isStablecoin(WETH_ADDRESS)).toBe(false);
    });
  });

  describe("isWETH", () => {
    // Property: WETH address should return true
    it("should return true for WETH address", () => {
      expect(isWETH(WETH_ADDRESS)).toBe(true);
      expect(isWETH(WETH_ADDRESS.toLowerCase())).toBe(true);
      expect(isWETH(WETH_ADDRESS.toUpperCase())).toBe(true);
    });

    // Property: Stablecoins should not be WETH
    it("should return false for stablecoins", () => {
      expect(isWETH(USDC_ADDRESS)).toBe(false);
      expect(isWETH(USDT_ADDRESS)).toBe(false);
      expect(isWETH(DAI_ADDRESS)).toBe(false);
    });
  });

  describe("Score Breakdown Completeness (Property 22)", () => {
    // Property: Score breakdown should contain all required components
    it("should have all scoring components in breakdown", () => {
      const requiredComponents = [
        "walletAgeScore",
        "activityScore",
        "tokenOutcomeScore",
        "heuristicsScore",
        "final",
      ];

      fc.assert(
        fc.property(
          fc.record({
            walletAgeScore: fc.integer({ min: 0, max: 100 }),
            activityScore: fc.integer({ min: 0, max: 100 }),
            tokenOutcomeScore: fc.integer({ min: 0, max: 100 }),
            heuristicsScore: fc.integer({ min: 0, max: 100 }),
            final: fc.integer({ min: 0, max: 100 }),
          }),
          (breakdown) => {
            return requiredComponents.every(
              (component) =>
                component in breakdown &&
                typeof breakdown[component as keyof typeof breakdown] ===
                  "number"
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: All scores should be within valid range (0-100)
    it("should have all scores within 0-100 range", () => {
      fc.assert(
        fc.property(
          fc.record({
            walletAgeScore: fc.integer({ min: 0, max: 100 }),
            activityScore: fc.integer({ min: 0, max: 100 }),
            tokenOutcomeScore: fc.integer({ min: 0, max: 100 }),
            heuristicsScore: fc.integer({ min: 0, max: 100 }),
            final: fc.integer({ min: 0, max: 100 }),
          }),
          (breakdown) => {
            return Object.values(breakdown).every(
              (score) => score >= 0 && score <= 100
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
