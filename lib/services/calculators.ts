/**
 * Calculation utilities for token analytics
 * LiquidityCalculator, DevSellCalculator, HolderTracker
 */

import {
  LiquidityPool,
  TransferEvent,
  LiquidityCalculator as ILiquidityCalculator,
  DevSellCalculator as IDevSellCalculator,
  HolderTracker as IHolderTracker,
  isDEXRouter,
  isWETH,
  isStablecoin,
} from "@/types/analytics";
import { DEXDataService } from "./DEXDataService";
import { TokenDataService } from "./TokenDataService";

/**
 * LiquidityCalculator - Aggregates liquidity across pools and converts to USD
 */
export class LiquidityCalculator implements ILiquidityCalculator {
  private dexService: DEXDataService;
  private defaultEthPriceUsd: number;

  constructor(dexService: DEXDataService, defaultEthPriceUsd: number = 2000) {
    this.dexService = dexService;
    this.defaultEthPriceUsd = defaultEthPriceUsd;
  }

  /**
   * Calculate total initial liquidity for a token across all pools
   */
  async calculateInitialLiquidity(
    tokenAddress: string,
    pools: LiquidityPool[]
  ): Promise<number> {
    let totalLiquidityUsd = 0;

    for (const pool of pools) {
      try {
        const ethLiquidity = await this.dexService.getInitialLiquidity(
          pool.address,
          pool.createdAtBlock
        );
        const usdLiquidity = this.convertEthToUsd(ethLiquidity);
        totalLiquidityUsd += usdLiquidity;
      } catch (error) {
        console.warn(
          `Failed to get liquidity for pool ${pool.address}:`,
          error
        );
        // Continue with other pools
      }
    }

    return totalLiquidityUsd;
  }

  /**
   * Convert token amount to USD equivalent
   */
  async convertToUSD(
    tokenAddress: string,
    amount: string,
    atBlock: number
  ): Promise<number> {
    // For WETH, convert directly using ETH price
    if (isWETH(tokenAddress)) {
      const ethAmount = Number(amount) / 1e18;
      return this.convertEthToUsd(ethAmount);
    }

    // For stablecoins, use 1:1 conversion (adjust for decimals)
    if (isStablecoin(tokenAddress)) {
      // USDC/USDT have 6 decimals, DAI has 18
      const decimals = tokenAddress.toLowerCase().includes("6b17") ? 18 : 6;
      return Number(amount) / Math.pow(10, decimals);
    }

    // For other tokens, we'd need price oracle data
    // For now, return 0 as we can't determine price
    return 0;
  }

  /**
   * Convert ETH to USD
   */
  private convertEthToUsd(ethAmount: number): number {
    return ethAmount * this.defaultEthPriceUsd;
  }

  /**
   * Aggregate liquidity from multiple pools
   */
  aggregateLiquidity(liquidityAmounts: number[]): number {
    return liquidityAmounts.reduce((sum, amount) => sum + amount, 0);
  }
}

/**
 * DevSellCalculator - Calculates developer sell ratios
 */
export class DevSellCalculator implements IDevSellCalculator {
  private tokenService: TokenDataService;

  constructor(tokenService: TokenDataService) {
    this.tokenService = tokenService;
  }

  /**
   * Calculate dev sell ratio for a token creator
   * Returns ratio between 0 and 1
   */
  async calculateDevSellRatio(
    tokenAddress: string,
    creatorAddress: string
  ): Promise<number> {
    try {
      // Get creator's initial balance
      const initialBalance = await this.tokenService.getCreatorInitialBalance(
        tokenAddress,
        creatorAddress
      );

      if (initialBalance === "0" || BigInt(initialBalance) === BigInt(0)) {
        return 0; // No initial balance, can't calculate ratio
      }

      // Get all transfer events
      const transfers = await this.tokenService.getTransferEvents(tokenAddress);

      // Identify sell transactions from creator
      const sellTransfers = this.identifySellTransactions(
        transfers,
        creatorAddress
      );

      // Calculate total sold
      const totalSold = sellTransfers.reduce((sum, transfer) => {
        return sum + BigInt(transfer.value);
      }, BigInt(0));

      // Calculate ratio
      const ratio = Number(totalSold) / Number(BigInt(initialBalance));

      // Clamp to 0-1 range
      return Math.min(1, Math.max(0, ratio));
    } catch (error) {
      console.warn(`Failed to calculate dev sell ratio:`, error);
      return 0;
    }
  }

  /**
   * Identify transfers from creator to DEX routers (sells)
   */
  identifySellTransactions(
    transfers: TransferEvent[],
    creatorAddress: string
  ): TransferEvent[] {
    const normalizedCreator = creatorAddress.toLowerCase();

    return transfers.filter((transfer) => {
      // Transfer must be FROM the creator
      if (transfer.from.toLowerCase() !== normalizedCreator) {
        return false;
      }

      // Transfer must be TO a DEX router
      return isDEXRouter(transfer.to);
    });
  }

  /**
   * Calculate sell ratio from pre-fetched data
   */
  calculateRatioFromData(
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
}

/**
 * HolderTracker - Tracks holder counts over time
 */
export class HolderTracker implements IHolderTracker {
  private tokenService: TokenDataService;

  constructor(tokenService: TokenDataService) {
    this.tokenService = tokenService;
  }

  /**
   * Get holder count at a specific timestamp
   */
  async getHolderCountAtTime(
    tokenAddress: string,
    timestamp: number
  ): Promise<number> {
    return this.tokenService.getHolderCountAtTime(tokenAddress, timestamp);
  }

  /**
   * Get holder count 7 days after token launch
   */
  async getHolderCountAfter7Days(
    tokenAddress: string,
    launchTimestamp: number
  ): Promise<number> {
    return this.tokenService.getHolderCountAfter7Days(
      tokenAddress,
      launchTimestamp
    );
  }

  /**
   * Calculate holder count from transfer events
   */
  calculateHolderCountFromTransfers(transfers: TransferEvent[]): number {
    const balances = new Map<string, bigint>();
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    for (const transfer of transfers) {
      // Subtract from sender
      if (transfer.from !== ZERO_ADDRESS) {
        const currentFrom = balances.get(transfer.from) || BigInt(0);
        balances.set(transfer.from, currentFrom - BigInt(transfer.value));
      }

      // Add to receiver
      const currentTo = balances.get(transfer.to) || BigInt(0);
      balances.set(transfer.to, currentTo + BigInt(transfer.value));
    }

    // Count non-zero balances
    let holderCount = 0;
    for (const [address, balance] of balances) {
      if (address !== ZERO_ADDRESS && balance > BigInt(0)) {
        holderCount++;
      }
    }

    return holderCount;
  }

  /**
   * Get holder growth rate (holders gained per day)
   */
  async getHolderGrowthRate(
    tokenAddress: string,
    startTimestamp: number,
    endTimestamp: number
  ): Promise<number> {
    const startCount = await this.getHolderCountAtTime(
      tokenAddress,
      startTimestamp
    );
    const endCount = await this.getHolderCountAtTime(
      tokenAddress,
      endTimestamp
    );

    const daysDiff = (endTimestamp - startTimestamp) / (24 * 60 * 60);
    if (daysDiff <= 0) {
      return 0;
    }

    return (endCount - startCount) / daysDiff;
  }
}

/**
 * Create all calculator instances with shared services
 */
export function createCalculators(
  apiKey: string,
  ethPriceUsd: number = 2000,
  alchemyApiKey?: string
) {
  const dexService = new DEXDataService(apiKey);
  const tokenService = new TokenDataService(apiKey, alchemyApiKey);

  return {
    liquidityCalculator: new LiquidityCalculator(dexService, ethPriceUsd),
    devSellCalculator: new DevSellCalculator(tokenService),
    holderTracker: new HolderTracker(tokenService),
    dexService,
    tokenService,
  };
}
