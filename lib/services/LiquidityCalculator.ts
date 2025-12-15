/**
 * Liquidity Calculator
 * Calculates and aggregates liquidity across multiple pools
 *
 * Implements: Requirements 1.2, 1.3
 */

import {
  LiquidityPool,
  LiquidityCalculator as ILiquidityCalculator,
  WETH_ADDRESS,
  USDC_ADDRESS,
  USDT_ADDRESS,
  DAI_ADDRESS,
} from "@/types/analytics";
import { DEXDataService } from "./DEXDataService";

// Default ETH price in USD (would be fetched from oracle in production)
const DEFAULT_ETH_PRICE_USD = 2000;

// Stablecoin decimals
const STABLECOIN_DECIMALS: Record<string, number> = {
  [USDC_ADDRESS.toLowerCase()]: 6,
  [USDT_ADDRESS.toLowerCase()]: 6,
  [DAI_ADDRESS.toLowerCase()]: 18,
};

export class LiquidityCalculator implements ILiquidityCalculator {
  private dexDataService: DEXDataService;
  private ethPriceUsd: number;

  constructor(
    dexDataService: DEXDataService,
    ethPriceUsd: number = DEFAULT_ETH_PRICE_USD
  ) {
    this.dexDataService = dexDataService;
    this.ethPriceUsd = ethPriceUsd;
  }

  /**
   * Set ETH price for USD conversions
   */
  setEthPrice(priceUsd: number): void {
    this.ethPriceUsd = priceUsd;
  }

  /**
   * Calculate total initial liquidity across all pools for a token
   * Implements: Requirement 1.3
   *
   * @param tokenAddress - The token contract address
   * @param pools - Array of liquidity pools for the token
   * @returns Total initial liquidity in USD
   */
  async calculateInitialLiquidity(
    tokenAddress: string,
    pools: LiquidityPool[]
  ): Promise<number> {
    if (pools.length === 0) {
      return 0;
    }

    let totalLiquidityUsd = 0;

    for (const pool of pools) {
      try {
        const liquidityEth = await this.dexDataService.getInitialLiquidity(
          pool.address,
          pool.createdAtBlock
        );

        // Convert ETH to USD
        const liquidityUsd = this.convertEthToUsd(liquidityEth);
        totalLiquidityUsd += liquidityUsd;
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
   * Convert ETH amount to USD
   */
  convertEthToUsd(ethAmount: number): number {
    return ethAmount * this.ethPriceUsd;
  }

  /**
   * Convert token amount to USD equivalent
   * Implements: Requirement 8.5
   *
   * @param tokenAddress - The token contract address
   * @param amount - The token amount as a string (to handle large numbers)
   * @param atBlock - The block number for historical price lookup
   * @returns USD equivalent value
   */
  async convertToUSD(
    tokenAddress: string,
    amount: string,
    atBlock: number
  ): Promise<number> {
    const normalizedToken = tokenAddress.toLowerCase();
    const amountBigInt = BigInt(amount);

    // Check if it's WETH
    if (normalizedToken === WETH_ADDRESS.toLowerCase()) {
      const ethAmount = Number(amountBigInt) / 1e18;
      return this.convertEthToUsd(ethAmount);
    }

    // Check if it's a stablecoin
    const stablecoinDecimals = STABLECOIN_DECIMALS[normalizedToken];
    if (stablecoinDecimals !== undefined) {
      // Stablecoins are 1:1 with USD
      return Number(amountBigInt) / Math.pow(10, stablecoinDecimals);
    }

    // For other tokens, we'd need to look up the price
    // This would require querying DEX pools for the token's price
    // For now, return 0 as we can't determine the price
    console.warn(`Cannot determine USD value for token ${tokenAddress}`);
    return 0;
  }

  /**
   * Aggregate liquidity values from multiple sources
   * This is a pure function useful for testing
   *
   * @param liquidityValues - Array of liquidity values in USD
   * @returns Total aggregated liquidity
   */
  static aggregateLiquidity(liquidityValues: number[]): number {
    return liquidityValues.reduce((sum, value) => sum + value, 0);
  }

  /**
   * Check if a token is a stablecoin
   */
  static isStablecoin(tokenAddress: string): boolean {
    const normalized = tokenAddress.toLowerCase();
    return normalized in STABLECOIN_DECIMALS;
  }

  /**
   * Check if a token is WETH
   */
  static isWETH(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === WETH_ADDRESS.toLowerCase();
  }
}
