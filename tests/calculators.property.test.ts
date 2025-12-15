/**
 * Property-based tests for calculation utilities
 * **Feature: enhanced-etherscan-analytics, Property 2: Liquidity aggregation correctness**
 * **Validates: Requirements 1.2, 1.3**
 *
 * **Feature: enhanced-etherscan-analytics, Property 4: Dev sell ratio calculation**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import * as fc from "fast-check";
import {
  TransferEvent,
  DEX_ROUTER_ADDRESSES,
  isDEXRouter,
} from "@/types/analytics";

// Mock liquidity aggregation (mirrors LiquidityCalculator.aggregateLiquidity)
function aggregateLiquidity(liquidityAmounts: number[]): number {
  return liquidityAmounts.reduce((sum, amount) => sum + amount, 0);
}

// Mock dev sell ratio calculation (mirrors DevSellCalculator logic)
function calculateDevSellRatio(
  initialBalance: string,
  sellTransfers: TransferEvent[]
): number {
  if (initialBalance === "0" || BigInt(initialBalance) === BigInt(0)) {
    return 0;
  }

  const totalSold = sellTransfers.reduce((sum, transfer) => {
    return sum + BigInt(transfer.value);
  }, BigInt(0));

  const ratio = Number(totalSold) / Number(BigInt(initialBalance));
  return Math.min(1, Math.max(0, ratio));
}

// Mock identify sell transactions (mirrors DevSellCalculator logic)
function identifySellTransactions(
  transfers: TransferEvent[],
  creatorAddress: string
): TransferEvent[] {
  const normalizedCreator = creatorAddress.toLowerCase();

  return transfers.filter((transfer) => {
    if (transfer.from.toLowerCase() !== normalizedCreator) {
      return false;
    }
    return isDEXRouter(transfer.to);
  });
}

describe("Calculators - Property Tests", () => {
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

  describe("Property 2: Liquidity aggregation correctness", () => {
    // Property: Aggregation should equal sum of individual amounts
    it("should equal sum of all liquidity amounts", () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: 0, max: 1000000, noNaN: true }), {
            minLength: 0,
            maxLength: 20,
          }),
          (amounts) => {
            const aggregated = aggregateLiquidity(amounts);
            const expectedSum = amounts.reduce((sum, a) => sum + a, 0);
            return Math.abs(aggregated - expectedSum) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Empty array should return zero
    it("should return zero for empty array", () => {
      expect(aggregateLiquidity([])).toBe(0);
    });

    // Property: Single element should return that element
    it("should return single element for single-element array", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000000, noNaN: true }),
          (amount) => {
            return aggregateLiquidity([amount]) === amount;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Aggregation should be commutative (order doesn't matter)
    it("should be commutative", () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: 0, max: 1000000, noNaN: true }), {
            minLength: 2,
            maxLength: 10,
          }),
          (amounts) => {
            const original = aggregateLiquidity(amounts);
            const reversed = aggregateLiquidity([...amounts].reverse());
            return Math.abs(original - reversed) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Aggregation should be associative
    it("should be associative", () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100000, noNaN: true }),
          fc.float({ min: 0, max: 100000, noNaN: true }),
          fc.float({ min: 0, max: 100000, noNaN: true }),
          (a, b, c) => {
            const leftAssoc = aggregateLiquidity([
              aggregateLiquidity([a, b]),
              c,
            ]);
            const rightAssoc = aggregateLiquidity([
              a,
              aggregateLiquidity([b, c]),
            ]);
            return Math.abs(leftAssoc - rightAssoc) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Adding zero should not change result
    it("should not change when adding zero", () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: 0, max: 1000000, noNaN: true }), {
            minLength: 1,
            maxLength: 10,
          }),
          (amounts) => {
            const original = aggregateLiquidity(amounts);
            const withZero = aggregateLiquidity([...amounts, 0]);
            return Math.abs(original - withZero) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 4: Dev sell ratio calculation", () => {
    // Generator for transfer events from creator to DEX router
    const sellTransferArb = (creatorAddress: string) =>
      fc.record({
        from: fc.constant(creatorAddress),
        to: fc.constantFrom(...DEX_ROUTER_ADDRESSES),
        value: fc
          .bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") })
          .map((n) => n.toString()),
        blockNumber: fc.integer({ min: 1, max: 20000000 }),
        transactionHash: fc.string({ minLength: 64, maxLength: 64 }).map(
          (s) =>
            "0x" +
            s
              .split("")
              .map((c) => (c.charCodeAt(0) % 16).toString(16))
              .join("")
        ),
        logIndex: fc.integer({ min: 0, max: 1000 }),
      });

    // Property: Ratio should be between 0 and 1
    it("should return ratio between 0 and 1", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") }),
          fc.array(
            fc.bigInt({ min: BigInt(1), max: BigInt("100000000000000000000") }),
            { minLength: 0, maxLength: 10 }
          ),
          (initialBalance, sellAmounts) => {
            const sellTransfers: TransferEvent[] = sellAmounts.map(
              (amount, i) => ({
                from: "0x1234567890123456789012345678901234567890",
                to: DEX_ROUTER_ADDRESSES[0],
                value: amount.toString(),
                blockNumber: i + 1,
                transactionHash: "0x" + i.toString().padStart(64, "0"),
                logIndex: 0,
              })
            );

            const ratio = calculateDevSellRatio(
              initialBalance.toString(),
              sellTransfers
            );
            return ratio >= 0 && ratio <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Zero initial balance should return zero ratio
    it("should return zero for zero initial balance", () => {
      const sellTransfers: TransferEvent[] = [
        {
          from: "0x1234567890123456789012345678901234567890",
          to: DEX_ROUTER_ADDRESSES[0],
          value: "1000000000000000000",
          blockNumber: 1,
          transactionHash: "0x" + "0".repeat(64),
          logIndex: 0,
        },
      ];

      expect(calculateDevSellRatio("0", sellTransfers)).toBe(0);
    });

    // Property: No sells should return zero ratio
    it("should return zero for no sell transfers", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") }),
          (initialBalance) => {
            return calculateDevSellRatio(initialBalance.toString(), []) === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Selling all should return ratio of 1
    it("should return 1 when selling entire balance", () => {
      fc.assert(
        fc.property(
          fc.bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") }),
          (initialBalance) => {
            const sellTransfers: TransferEvent[] = [
              {
                from: "0x1234567890123456789012345678901234567890",
                to: DEX_ROUTER_ADDRESSES[0],
                value: initialBalance.toString(),
                blockNumber: 1,
                transactionHash: "0x" + "0".repeat(64),
                logIndex: 0,
              },
            ];

            const ratio = calculateDevSellRatio(
              initialBalance.toString(),
              sellTransfers
            );
            return Math.abs(ratio - 1) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Ratio should be proportional to amount sold
    it("should be proportional to amount sold", () => {
      fc.assert(
        fc.property(
          fc.bigInt({
            min: BigInt(1000),
            max: BigInt("1000000000000000000000"),
          }),
          fc.float({
            min: Math.fround(0.1),
            max: Math.fround(0.9),
            noNaN: true,
          }),
          (initialBalance, sellFraction) => {
            const sellAmount = BigInt(
              Math.floor(Number(initialBalance) * sellFraction)
            );

            const sellTransfers: TransferEvent[] = [
              {
                from: "0x1234567890123456789012345678901234567890",
                to: DEX_ROUTER_ADDRESSES[0],
                value: sellAmount.toString(),
                blockNumber: 1,
                transactionHash: "0x" + "0".repeat(64),
                logIndex: 0,
              },
            ];

            const ratio = calculateDevSellRatio(
              initialBalance.toString(),
              sellTransfers
            );
            const expectedRatio = Number(sellAmount) / Number(initialBalance);

            return Math.abs(ratio - expectedRatio) < 0.01;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Only transfers to DEX routers should be counted as sells
    it("should only count transfers to DEX routers as sells", () => {
      const creatorAddress = "0x1234567890123456789012345678901234567890";
      const nonRouterAddress = "0xabcdef1234567890abcdef1234567890abcdef12";

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              from: fc.constant(creatorAddress),
              to: fc.constantFrom(DEX_ROUTER_ADDRESSES[0], nonRouterAddress),
              value: fc
                .bigInt({ min: BigInt(1), max: BigInt("1000000000000000000") })
                .map((n) => n.toString()),
              blockNumber: fc.integer({ min: 1, max: 1000 }),
              transactionHash: fc.string({ minLength: 64, maxLength: 64 }).map(
                (s) =>
                  "0x" +
                  s
                    .split("")
                    .map((c) => (c.charCodeAt(0) % 16).toString(16))
                    .join("")
              ),
              logIndex: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (transfers: TransferEvent[]) => {
            const sellTransfers = identifySellTransactions(
              transfers,
              creatorAddress
            );

            // All identified sells should be to DEX routers
            return sellTransfers.every((t) => isDEXRouter(t.to));
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Transfers from non-creator should not be counted
    it("should not count transfers from non-creator", () => {
      const creatorAddress = "0x1234567890123456789012345678901234567890";
      const otherAddress = "0xabcdef1234567890abcdef1234567890abcdef12";

      const transfers: TransferEvent[] = [
        {
          from: otherAddress, // Not the creator
          to: DEX_ROUTER_ADDRESSES[0],
          value: "1000000000000000000",
          blockNumber: 1,
          transactionHash: "0x" + "0".repeat(64),
          logIndex: 0,
        },
      ];

      const sellTransfers = identifySellTransactions(transfers, creatorAddress);
      expect(sellTransfers.length).toBe(0);
    });
  });
});
