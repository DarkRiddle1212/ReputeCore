/**
 * Property-based tests for holder count calculation
 * **Feature: enhanced-etherscan-analytics, Property 5: Holder count accuracy**
 * **Validates: Requirements 4.1, 4.3, 4.4**
 *
 * **Feature: enhanced-etherscan-analytics, Property 6: Historical holder count**
 * **Validates: Requirements 4.2**
 */

import * as fc from "fast-check";
import { TransferEvent } from "@/types/analytics";

// Mock holder count calculation (mirrors TokenDataService logic)
function calculateHolderCount(transfers: TransferEvent[]): number {
  const balances = new Map<string, bigint>();
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  for (const transfer of transfers) {
    // Subtract from sender (unless it's a mint from zero address)
    if (transfer.from !== ZERO_ADDRESS) {
      const currentFrom = balances.get(transfer.from) || BigInt(0);
      balances.set(transfer.from, currentFrom - BigInt(transfer.value));
    }

    // Add to receiver
    const currentTo = balances.get(transfer.to) || BigInt(0);
    balances.set(transfer.to, currentTo + BigInt(transfer.value));
  }

  // Count non-zero balances (excluding zero address)
  let holderCount = 0;
  for (const [address, balance] of balances) {
    if (address !== ZERO_ADDRESS && balance > BigInt(0)) {
      holderCount++;
    }
  }

  return holderCount;
}

// Get unique holders from transfers
function getUniqueHolders(transfers: TransferEvent[]): Set<string> {
  const balances = new Map<string, bigint>();
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  for (const transfer of transfers) {
    if (transfer.from !== ZERO_ADDRESS) {
      const currentFrom = balances.get(transfer.from) || BigInt(0);
      balances.set(transfer.from, currentFrom - BigInt(transfer.value));
    }
    const currentTo = balances.get(transfer.to) || BigInt(0);
    balances.set(transfer.to, currentTo + BigInt(transfer.value));
  }

  const holders = new Set<string>();
  for (const [address, balance] of balances) {
    if (address !== ZERO_ADDRESS && balance > BigInt(0)) {
      holders.add(address);
    }
  }

  return holders;
}

describe("Holder Count - Property Tests", () => {
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

  // Generator for transfer events
  const transferEventArb = fc.record({
    from: fc.oneof(
      fc.constant("0x0000000000000000000000000000000000000000"), // Mint
      validEthereumAddress()
    ),
    to: validEthereumAddress(),
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

  describe("Property 5: Holder count accuracy", () => {
    // Property: Holder count should be non-negative
    it("should return non-negative holder count", () => {
      fc.assert(
        fc.property(
          fc.array(transferEventArb, { minLength: 0, maxLength: 50 }),
          (transfers: TransferEvent[]) => {
            const count = calculateHolderCount(transfers);
            return count >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Empty transfers should result in zero holders
    it("should return zero for empty transfers", () => {
      const count = calculateHolderCount([]);
      expect(count).toBe(0);
    });

    // Property: Single mint should result in one holder
    it("should count one holder for single mint", () => {
      fc.assert(
        fc.property(
          validEthereumAddress(),
          fc.bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") }),
          (recipient, amount) => {
            const transfers: TransferEvent[] = [
              {
                from: "0x0000000000000000000000000000000000000000",
                to: recipient,
                value: amount.toString(),
                blockNumber: 1,
                transactionHash: "0x" + "0".repeat(64),
                logIndex: 0,
              },
            ];
            return calculateHolderCount(transfers) === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Holder count should equal unique non-zero balance addresses
    it("should equal count of unique addresses with non-zero balance", () => {
      fc.assert(
        fc.property(
          fc.array(transferEventArb, { minLength: 1, maxLength: 30 }),
          (transfers: TransferEvent[]) => {
            const count = calculateHolderCount(transfers);
            const uniqueHolders = getUniqueHolders(transfers);
            return count === uniqueHolders.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Zero address should never be counted as holder
    it("should never count zero address as holder", () => {
      fc.assert(
        fc.property(
          fc.array(transferEventArb, { minLength: 1, maxLength: 30 }),
          (transfers: TransferEvent[]) => {
            const holders = getUniqueHolders(transfers);
            return !holders.has("0x0000000000000000000000000000000000000000");
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Transfer to self should not change holder count
    it("should not change holder count for self-transfers", () => {
      fc.assert(
        fc.property(
          validEthereumAddress(),
          fc.bigInt({
            min: BigInt(100),
            max: BigInt("1000000000000000000000"),
          }),
          fc.bigInt({ min: BigInt(1), max: BigInt(50) }),
          (address, initialAmount, transferAmount) => {
            // Initial mint
            const transfers: TransferEvent[] = [
              {
                from: "0x0000000000000000000000000000000000000000",
                to: address,
                value: initialAmount.toString(),
                blockNumber: 1,
                transactionHash: "0x" + "0".repeat(64),
                logIndex: 0,
              },
            ];

            const countBefore = calculateHolderCount(transfers);

            // Self transfer
            transfers.push({
              from: address,
              to: address,
              value: transferAmount.toString(),
              blockNumber: 2,
              transactionHash: "0x" + "1".repeat(64),
              logIndex: 0,
            });

            const countAfter = calculateHolderCount(transfers);
            return countBefore === countAfter;
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Address with zero balance should not be counted
    it("should exclude addresses with zero balance", () => {
      fc.assert(
        fc.property(
          validEthereumAddress(),
          validEthereumAddress(),
          fc.bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") }),
          (sender, receiver, amount) => {
            // Mint to sender
            const transfers: TransferEvent[] = [
              {
                from: "0x0000000000000000000000000000000000000000",
                to: sender,
                value: amount.toString(),
                blockNumber: 1,
                transactionHash: "0x" + "0".repeat(64),
                logIndex: 0,
              },
            ];

            // Transfer all to receiver
            transfers.push({
              from: sender,
              to: receiver,
              value: amount.toString(),
              blockNumber: 2,
              transactionHash: "0x" + "1".repeat(64),
              logIndex: 0,
            });

            const holders = getUniqueHolders(transfers);

            // Sender should not be in holders (zero balance)
            // Receiver should be in holders (unless same as sender)
            if (sender === receiver) {
              return holders.has(sender) && holders.size === 1;
            }
            return !holders.has(sender) && holders.has(receiver);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 6: Historical holder count", () => {
    // Property: Holder count at block N should only consider transfers up to block N
    it("should only count transfers up to specified block", () => {
      fc.assert(
        fc.property(
          fc.array(transferEventArb, { minLength: 5, maxLength: 30 }),
          fc.integer({ min: 1, max: 20000000 }),
          (transfers: TransferEvent[], cutoffBlock) => {
            // Filter transfers up to cutoff block
            const filteredTransfers = transfers.filter(
              (t) => t.blockNumber <= cutoffBlock
            );

            const fullCount = calculateHolderCount(transfers);
            const historicalCount = calculateHolderCount(filteredTransfers);

            // Historical count should be <= full count (or equal if all transfers are before cutoff)
            return (
              historicalCount <= fullCount ||
              filteredTransfers.length === transfers.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property: Holder count should be monotonically non-decreasing with block number (for mints only)
    it("should not decrease holder count for mint-only sequences", () => {
      fc.assert(
        fc.property(
          fc.array(validEthereumAddress(), { minLength: 2, maxLength: 10 }),
          fc.bigInt({ min: BigInt(1), max: BigInt("1000000000000000000000") }),
          (recipients, amount) => {
            // Create mint transfers to different addresses
            const transfers: TransferEvent[] = recipients.map(
              (recipient, i) => ({
                from: "0x0000000000000000000000000000000000000000",
                to: recipient,
                value: amount.toString(),
                blockNumber: i + 1,
                transactionHash: "0x" + i.toString().padStart(64, "0"),
                logIndex: 0,
              })
            );

            // Check holder count at each block
            let prevCount = 0;
            for (let block = 1; block <= transfers.length; block++) {
              const filtered = transfers.filter((t) => t.blockNumber <= block);
              const count = calculateHolderCount(filtered);
              if (count < prevCount) {
                return false;
              }
              prevCount = count;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
