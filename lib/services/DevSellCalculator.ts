/**
 * Dev Sell Calculator
 * Calculates developer sell ratios from transaction history
 *
 * Implements: Requirements 3.1, 3.2, 3.3, 3.4
 */

import {
  TransferEvent,
  DevSellCalculator as IDevSellCalculator,
  isDEXRouter,
} from "@/types/analytics";
import { TokenDataService } from "./TokenDataService";
import { cache, CacheKeys, CacheTTL } from "@/lib/cache";

export class DevSellCalculator implements IDevSellCalculator {
  private tokenDataService: TokenDataService;

  constructor(tokenDataService: TokenDataService) {
    this.tokenDataService = tokenDataService;
  }

  /**
   * Calculate dev sell ratio for a token creator
   * Implements: Requirements 3.3, 3.4, 9.3 - Caching with 6h TTL
   *
   * @param tokenAddress - The token contract address
   * @param creatorAddress - The creator's wallet address
   * @returns Ratio of tokens sold (0-1)
   */
  async calculateDevSellRatio(
    tokenAddress: string,
    creatorAddress: string
  ): Promise<number> {
    // Check cache first (Requirement 9.4)
    const cacheKey = CacheKeys.devSellRatio(tokenAddress, creatorAddress);
    const cached = await cache.get<number>(cacheKey);
    if (cached !== null) {
      console.log(
        `[DevSellCalculator] Cache hit for dev sell ratio: ${tokenAddress}`
      );
      return cached;
    }

    // Get creator's initial balance (Requirement 3.2)
    const initialBalance = await this.tokenDataService.getCreatorInitialBalance(
      tokenAddress,
      creatorAddress
    );

    if (initialBalance === "0" || BigInt(initialBalance) === BigInt(0)) {
      // Cache zero result
      await cache.set(cacheKey, 0, { ttl: CacheTTL.DEV_SELL_RATIO });
      return 0;
    }

    // Get all transfer events for the token (Requirement 3.1)
    const transfers =
      await this.tokenDataService.getTransferEvents(tokenAddress);

    // Identify sell transactions (Requirement 3.3)
    const sellTransfers = this.identifySellTransactions(
      transfers,
      creatorAddress
    );

    // Calculate ratio (Requirement 3.4)
    const ratio = this.computeRatio(initialBalance, sellTransfers);

    // Cache the result (Requirement 9.3 - 6h TTL for dev sell ratio)
    await cache.set(cacheKey, ratio, { ttl: CacheTTL.DEV_SELL_RATIO });

    return ratio;
  }

  /**
   * Identify sell transactions to DEX routers
   * Implements: Requirement 3.3
   *
   * @param transfers - All transfer events for the token
   * @param creatorAddress - The creator's wallet address
   * @returns Array of transfers that are sells to DEX routers
   */
  identifySellTransactions(
    transfers: TransferEvent[],
    creatorAddress: string
  ): TransferEvent[] {
    const normalizedCreator = creatorAddress.toLowerCase();

    return transfers.filter((transfer) => {
      // Must be from the creator
      if (transfer.from.toLowerCase() !== normalizedCreator) {
        return false;
      }

      // Must be to a DEX router (sell transaction)
      return isDEXRouter(transfer.to);
    });
  }

  /**
   * Compute the sell ratio from initial balance and sell transfers
   *
   * @param initialBalance - Creator's initial token balance
   * @param sellTransfers - Array of sell transfers
   * @returns Ratio between 0 and 1
   */
  private computeRatio(
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

    // Clamp between 0 and 1 (can exceed 1 if creator bought more and sold)
    return Math.min(1, Math.max(0, ratio));
  }

  /**
   * Static method for calculating ratio (useful for testing)
   */
  static calculateRatio(
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

  /**
   * Static method for identifying sell transactions (useful for testing)
   */
  static identifySells(
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
}
