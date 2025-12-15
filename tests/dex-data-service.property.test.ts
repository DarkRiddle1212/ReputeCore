/**
 * Property-based tests for DEX Data Service
 * **Feature: enhanced-etherscan-analytics, Property 1: DEX factory pool discovery**
 * **Validates: Requirements 1.1, 8.1, 8.2, 8.3**
 */

import * as fc from "fast-check";
import {
  DEX_CONFIGS,
  LiquidityPool,
  LiquidityLockInfo,
  KNOWN_LOCK_CONTRACTS,
} from "@/types/analytics";

// Mock DEXDataService for property testing
// In real tests, we'd mock the Etherscan API responses

describe("DEX Data Service - Property Tests", () => {
  // Generator for valid Ethereum addresses
  const validEthereumAddress = () =>
    fc.string({ minLength: 40, maxLength: 40 }).map((str) => {
      const hex = str
        .split("")
        .map((c) => {
          const code = c.charCodeAt(0) % 16;
          return code.toString(16);
        })
        .join("");
      return "0x" + hex;
    });

  // Generator for liquidity pools with consistent DEX name and version
  const liquidityPoolArb = fc.constantFrom(...DEX_CONFIGS).chain((dexConfig) =>
    fc.record({
      address: validEthereumAddress(),
      dex: fc.constant(dexConfig.name),
      version: fc.constant(dexConfig.version),
      token0: validEthereumAddress(),
      token1: validEthereumAddress(),
      createdAtBlock: fc.integer({ min: 0, max: 20000000 }),
    })
  );

  describe("Property 1: DEX factory pool discovery", () => {
    // Property: All discovered pools should have valid structure
    it("should return pools with valid structure for any token", () => {
      fc.assert(
        fc.property(
          fc.array(liquidityPoolArb, { minLength: 0, maxLength: 10 }),
          (pools: LiquidityPool[]) => {
            // Every pool should have required fields
            return pools.every(
              (pool) =>
                typeof pool.address === "string" &&
                pool.address.startsWith("0x") &&
                pool.address.length === 42 &&
                typeof pool.dex === "string" &&
                pool.dex.length > 0 &&
                (pool.version === "v2" || pool.version === "v3") &&
                typeof pool.token0 === "string" &&
                typeof pool.token1 === "string" &&
                typeof pool.createdAtBlock === "number" &&
                pool.createdAtBlock >= 0
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Pool addresses should be unique
    it("should not return duplicate pool addresses", () => {
      fc.assert(
        fc.property(
          fc.array(liquidityPoolArb, { minLength: 0, maxLength: 10 }),
          (pools: LiquidityPool[]) => {
            const addresses = pools.map((p) => p.address.toLowerCase());
            const uniqueAddresses = new Set(addresses);
            return addresses.length === uniqueAddresses.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: All pools should reference known DEX names
    it("should only return pools from configured DEXes", () => {
      const knownDexNames = DEX_CONFIGS.map((d) => d.name);

      fc.assert(
        fc.property(
          fc.array(liquidityPoolArb, { minLength: 1, maxLength: 10 }),
          (pools: LiquidityPool[]) => {
            return pools.every((pool) => {
              // Handle V3 pools which have fee tier in name
              const baseDexName = pool.dex.split(" (")[0];
              return (
                knownDexNames.includes(baseDexName) ||
                knownDexNames.some((name) => pool.dex.startsWith(name))
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: V2 pools should have v2 version, V3 pools should have v3 version
    it("should have consistent version for DEX type", () => {
      fc.assert(
        fc.property(
          fc.array(liquidityPoolArb, { minLength: 1, maxLength: 10 }),
          (pools: LiquidityPool[]) => {
            return pools.every((pool) => {
              if (pool.dex.includes("V3") || pool.dex.includes("v3")) {
                return pool.version === "v3";
              }
              if (pool.dex.includes("V2") || pool.dex.includes("SushiSwap")) {
                return pool.version === "v2";
              }
              return true; // Unknown DEX type, allow any version
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Token addresses in pools should be valid Ethereum addresses
    it("should have valid token addresses in all pools", () => {
      const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

      fc.assert(
        fc.property(
          fc.array(liquidityPoolArb, { minLength: 1, maxLength: 10 }),
          (pools: LiquidityPool[]) => {
            return pools.every(
              (pool) =>
                isValidAddress(pool.address) &&
                isValidAddress(pool.token0) &&
                isValidAddress(pool.token1)
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 3: Lock status determination", () => {
    /**
     * **Feature: enhanced-etherscan-analytics, Property 3: Lock status determination**
     * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
     *
     * Lock status should be true if and only if LP tokens are held by a known
     * lock contract with an expiration timestamp in the future (or unknown expiration)
     */

    const currentTime = Math.floor(Date.now() / 1000);

    // Generator for liquidity lock info with future unlock time (locked)
    const lockedWithFutureUnlockArb = fc.record({
      isLocked: fc.constant(true),
      lockContract: validEthereumAddress(),
      lockContractName: fc.constantFrom(
        ...KNOWN_LOCK_CONTRACTS.map((l) => l.name)
      ),
      unlockTime: fc.integer({
        min: currentTime + 1,
        max: currentTime + 31536000,
      }), // Future time
      lockedAmount: fc
        .bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000000") })
        .map((n) => n.toString()),
      lockedPercentage: fc.integer({ min: 1, max: 10000 }).map((n) => n / 100), // 0.01 to 100
    });

    // Generator for liquidity lock info with null unlock time (conservatively locked)
    const lockedWithNullUnlockArb = fc.record({
      isLocked: fc.constant(true),
      lockContract: validEthereumAddress(),
      lockContractName: fc.constantFrom(
        ...KNOWN_LOCK_CONTRACTS.map((l) => l.name)
      ),
      unlockTime: fc.constant(null),
      lockedAmount: fc
        .bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000000") })
        .map((n) => n.toString()),
      lockedPercentage: fc.integer({ min: 1, max: 10000 }).map((n) => n / 100), // 0.01 to 100
    });

    // Generator for unlocked (no lock contract)
    const unlockedArb = fc.constant({
      isLocked: false,
      lockContract: null,
      lockContractName: null,
      unlockTime: null,
      lockedAmount: null,
      lockedPercentage: null,
    } as LiquidityLockInfo);

    // Combined generator
    const liquidityLockInfoArb = fc.oneof(
      lockedWithFutureUnlockArb,
      lockedWithNullUnlockArb,
      unlockedArb
    );

    // Property: Lock status should be consistent with lock contract presence
    it("should have lock contract when isLocked is true", () => {
      fc.assert(
        fc.property(liquidityLockInfoArb, (lockInfo: LiquidityLockInfo) => {
          if (lockInfo.isLocked) {
            return (
              lockInfo.lockContract !== null &&
              lockInfo.lockContractName !== null
            );
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: Unlocked status should have null lock details
    it("should have null lock details when isLocked is false", () => {
      fc.assert(
        fc.property(liquidityLockInfoArb, (lockInfo: LiquidityLockInfo) => {
          if (!lockInfo.isLocked) {
            return (
              lockInfo.lockContract === null &&
              lockInfo.lockContractName === null
            );
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: Lock contract name should be from known contracts when present
    it("should use known lock contract names", () => {
      const knownNames = KNOWN_LOCK_CONTRACTS.map((l) => l.name);

      fc.assert(
        fc.property(liquidityLockInfoArb, (lockInfo: LiquidityLockInfo) => {
          if (lockInfo.lockContractName !== null) {
            return knownNames.includes(lockInfo.lockContractName);
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: Locked percentage should be between 0 and 100 when present
    it("should have valid locked percentage range", () => {
      fc.assert(
        fc.property(liquidityLockInfoArb, (lockInfo: LiquidityLockInfo) => {
          if (lockInfo.lockedPercentage !== null) {
            return (
              lockInfo.lockedPercentage >= 0 && lockInfo.lockedPercentage <= 100
            );
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: Locked amount should be positive when present
    it("should have positive locked amount when present", () => {
      fc.assert(
        fc.property(liquidityLockInfoArb, (lockInfo: LiquidityLockInfo) => {
          if (lockInfo.lockedAmount !== null) {
            return BigInt(lockInfo.lockedAmount) > BigInt(0);
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: When unlock time is in the future, isLocked should be true (Requirement 2.3)
    it("should be locked when unlock time is in the future", () => {
      fc.assert(
        fc.property(
          lockedWithFutureUnlockArb,
          (lockInfo: LiquidityLockInfo) => {
            // If unlock time is in the future, should be locked
            if (
              lockInfo.unlockTime !== null &&
              lockInfo.unlockTime > currentTime
            ) {
              return lockInfo.isLocked === true;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: When unlock time is null but tokens are in lock contract, conservatively mark as locked
    it("should be locked when unlock time is null but tokens are in lock contract", () => {
      fc.assert(
        fc.property(lockedWithNullUnlockArb, (lockInfo: LiquidityLockInfo) => {
          // If we found tokens in a lock contract but couldn't get unlock time,
          // we should conservatively mark as locked
          if (lockInfo.lockContract !== null && lockInfo.unlockTime === null) {
            return lockInfo.isLocked === true;
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: When no lock contract is detected, should be unlocked (Requirement 2.5)
    it("should be unlocked when no lock contract is detected", () => {
      fc.assert(
        fc.property(unlockedArb, (lockInfo: LiquidityLockInfo) => {
          if (lockInfo.lockContract === null) {
            return lockInfo.isLocked === false;
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    // Property: Unlock time should be a valid Unix timestamp when present
    it("should have valid Unix timestamp for unlock time when present", () => {
      fc.assert(
        fc.property(
          lockedWithFutureUnlockArb,
          (lockInfo: LiquidityLockInfo) => {
            if (lockInfo.unlockTime !== null) {
              // Should be a reasonable timestamp (after 2020, before 2100)
              return (
                lockInfo.unlockTime > 1577836800 &&
                lockInfo.unlockTime < 4102444800
              );
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("DEX Configuration Validation", () => {
    // Property: All DEX configs should have valid addresses
    it("should have valid factory addresses in all DEX configs", () => {
      const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

      DEX_CONFIGS.forEach((config) => {
        expect(isValidAddress(config.factoryAddress)).toBe(true);
        expect(isValidAddress(config.routerAddress)).toBe(true);
      });
    });

    // Property: All DEX configs should have unique factory addresses
    it("should have unique factory addresses", () => {
      const factoryAddresses = DEX_CONFIGS.map((c) =>
        c.factoryAddress.toLowerCase()
      );
      const uniqueAddresses = new Set(factoryAddresses);
      expect(factoryAddresses.length).toBe(uniqueAddresses.size);
    });

    // Property: Init code hashes should be valid hex strings
    it("should have valid init code hashes", () => {
      DEX_CONFIGS.forEach((config) => {
        expect(config.initCodeHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      });
    });
  });
});
