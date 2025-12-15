/**
 * DEX Data Service
 * Fetches liquidity pool data from major DEX platforms via Etherscan
 */

import {
  DEXConfig,
  DEX_CONFIGS,
  UNISWAP_V3_FEE_TIERS,
  LiquidityPool,
  PoolReserves,
  LiquidityLockInfo,
  KNOWN_LOCK_CONTRACTS,
  WETH_ADDRESS,
  ErrorAnnotation,
  DEXDataService as IDEXDataService,
} from "@/types/analytics";
import { cache, CacheKeys, CacheTTL } from "@/lib/cache";

// ABI function signatures for contract calls
const PAIR_CREATED_TOPIC =
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Function selectors
const GET_PAIR_SELECTOR = "0xe6a43905"; // getPair(address,address)
const GET_RESERVES_SELECTOR = "0x0902f1ac"; // getReserves()
const TOKEN0_SELECTOR = "0x0dfe1681"; // token0()
const TOKEN1_SELECTOR = "0xd21220a7"; // token1()
const BALANCE_OF_SELECTOR = "0x70a08231"; // balanceOf(address)
const TOTAL_SUPPLY_SELECTOR = "0x18160ddd"; // totalSupply()

// Lock contract function selectors (vary by contract)
// Team Finance: getUserLockForTokenAtIndex(address,address,uint256)
const TEAM_FINANCE_GET_LOCK_SELECTOR = "0x5c9302c9";
// Unicrypt: getLockedTokenAtIndex(address,uint256)
const UNICRYPT_GET_LOCK_SELECTOR = "0x8d8f2adb";
// UNCX: getUserLockForTokenAtIndex(address,address,uint256)
const UNCX_GET_LOCK_SELECTOR = "0x5c9302c9";
// PinkLock: getLock(uint256)
const PINKLOCK_GET_LOCK_SELECTOR = "0x7c3a00fd";

interface EtherscanCallParams {
  module: string;
  action: string;
  [key: string]: string;
}

export class DEXDataService implements IDEXDataService {
  private apiKey: string;
  private baseUrl = "https://api.etherscan.io/v2/api";
  private chainId = "1";
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 400;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Respect rate limits between API calls
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const since = now - this.lastCallTime;
    if (since < this.RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.RATE_LIMIT_DELAY_MS - since)
      );
    }
    this.lastCallTime = Date.now();
  }

  /**
   * Make an Etherscan API request
   */
  private async makeRequest(params: EtherscanCallParams): Promise<any> {
    await this.respectRateLimit();

    const url = new URL(this.baseUrl);
    url.searchParams.append("chainid", this.chainId);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    url.searchParams.append("apikey", this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Etherscan API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Call a contract function via Etherscan proxy
   */
  private async callContract(to: string, data: string): Promise<string> {
    const result = await this.makeRequest({
      module: "proxy",
      action: "eth_call",
      to,
      data,
      tag: "latest",
    });

    if (result.error) {
      throw new Error(result.error.message || "Contract call failed");
    }

    return result.result;
  }

  /**
   * Encode address for contract call
   */
  private encodeAddress(address: string): string {
    return address.toLowerCase().replace("0x", "").padStart(64, "0");
  }

  /**
   * Decode address from contract response
   */
  private decodeAddress(hex: string): string {
    if (!hex || hex === "0x" || hex.length < 66) {
      return "0x0000000000000000000000000000000000000000";
    }
    return "0x" + hex.slice(-40).toLowerCase();
  }

  /**
   * Find all liquidity pools for a token across supported DEXes
   * Implements: Requirements 9.1, 9.4 - Caching with 24h TTL
   */
  async findLiquidityPools(tokenAddress: string): Promise<LiquidityPool[]> {
    const normalizedToken = tokenAddress.toLowerCase();

    // Check cache first (Requirement 9.4)
    const cacheKey = CacheKeys.liquidity(normalizedToken);
    const cached = await cache.get<LiquidityPool[]>(cacheKey);
    if (cached) {
      console.log(
        `[DEXDataService] Cache hit for liquidity pools: ${normalizedToken}`
      );
      return cached;
    }

    const pools: LiquidityPool[] = [];
    console.log(
      `[DEXDataService] Finding liquidity pools for token: ${normalizedToken}`
    );

    for (const dex of DEX_CONFIGS) {
      try {
        console.log(
          `[DEXDataService] Querying ${dex.name} (${dex.version}) for token ${normalizedToken}...`
        );
        if (dex.version === "v2") {
          const pool = await this.findV2Pool(normalizedToken, dex);
          if (pool) {
            console.log(
              `[DEXDataService] Found V2 pool on ${dex.name}: ${pool.address}`
            );
            pools.push(pool);
          } else {
            console.log(`[DEXDataService] No V2 pool found on ${dex.name}`);
          }
        } else if (dex.version === "v3") {
          const v3Pools = await this.findV3Pools(normalizedToken, dex);
          console.log(
            `[DEXDataService] Found ${v3Pools.length} V3 pools on ${dex.name}`
          );
          pools.push(...v3Pools);
        }
      } catch (error) {
        console.warn(
          `[DEXDataService] Failed to query ${dex.name} for token ${tokenAddress}:`,
          error
        );
        // Continue with other DEXes
      }
    }

    console.log(
      `[DEXDataService] Total pools found for ${normalizedToken}: ${pools.length}`
    );

    // Cache the result (Requirement 9.1 - 24h TTL for liquidity)
    await cache.set(cacheKey, pools, { ttl: CacheTTL.LIQUIDITY });

    return pools;
  }

  /**
   * Find V2-style pool (Uniswap V2, SushiSwap)
   */
  private async findV2Pool(
    tokenAddress: string,
    dex: DEXConfig
  ): Promise<LiquidityPool | null> {
    // Query getPair(token, WETH)
    const callData =
      GET_PAIR_SELECTOR +
      this.encodeAddress(tokenAddress) +
      this.encodeAddress(WETH_ADDRESS);

    try {
      const result = await this.callContract(dex.factoryAddress, callData);
      const pairAddress = this.decodeAddress(result);

      // Check if pair exists (not zero address)
      if (pairAddress === "0x0000000000000000000000000000000000000000") {
        return null;
      }

      // Get token0 and token1 from the pair
      const token0Result = await this.callContract(
        pairAddress,
        TOKEN0_SELECTOR
      );
      const token1Result = await this.callContract(
        pairAddress,
        TOKEN1_SELECTOR
      );

      const token0 = this.decodeAddress(token0Result);
      const token1 = this.decodeAddress(token1Result);

      // Get creation block from pair creation event
      const creationBlock = await this.getPoolCreationBlock(
        pairAddress,
        dex.factoryAddress
      );

      return {
        address: pairAddress,
        dex: dex.name,
        version: dex.version,
        token0,
        token1,
        createdAtBlock: creationBlock,
      };
    } catch (error) {
      console.warn(`Failed to find V2 pool on ${dex.name}:`, error);
      return null;
    }
  }

  /**
   * Find V3-style pools (Uniswap V3) - checks multiple fee tiers
   */
  private async findV3Pools(
    tokenAddress: string,
    dex: DEXConfig
  ): Promise<LiquidityPool[]> {
    const pools: LiquidityPool[] = [];

    for (const fee of UNISWAP_V3_FEE_TIERS) {
      try {
        // getPool(tokenA, tokenB, fee)
        const callData =
          "0x1698ee82" + // getPool selector
          this.encodeAddress(tokenAddress) +
          this.encodeAddress(WETH_ADDRESS) +
          fee.toString(16).padStart(64, "0");

        const result = await this.callContract(dex.factoryAddress, callData);
        const poolAddress = this.decodeAddress(result);

        if (poolAddress !== "0x0000000000000000000000000000000000000000") {
          const creationBlock = await this.getPoolCreationBlock(
            poolAddress,
            dex.factoryAddress
          );

          pools.push({
            address: poolAddress,
            dex: `${dex.name} (${fee / 10000}%)`,
            version: dex.version,
            token0: tokenAddress.toLowerCase(),
            token1: WETH_ADDRESS.toLowerCase(),
            createdAtBlock: creationBlock,
          });
        }
      } catch (error) {
        console.warn(`Failed to find V3 pool with fee ${fee}:`, error);
      }
    }

    return pools;
  }

  /**
   * Get the block number when a pool was created
   */
  private async getPoolCreationBlock(
    poolAddress: string,
    factoryAddress: string
  ): Promise<number> {
    try {
      // Get contract creation transaction
      const result = await this.makeRequest({
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: poolAddress,
      });

      if (result.result && result.result.length > 0) {
        const txHash = result.result[0].txHash;

        // Get transaction receipt to find block number
        const receipt = await this.makeRequest({
          module: "proxy",
          action: "eth_getTransactionReceipt",
          txhash: txHash,
        });

        if (receipt.result && receipt.result.blockNumber) {
          return parseInt(receipt.result.blockNumber, 16);
        }
      }
    } catch (error) {
      console.warn(
        `Failed to get creation block for pool ${poolAddress}:`,
        error
      );
    }

    return 0; // Return 0 if we can't determine creation block
  }

  /**
   * Get initial liquidity at pool creation
   */
  async getInitialLiquidity(
    poolAddress: string,
    creationBlock: number
  ): Promise<number> {
    try {
      // Get reserves at creation block (or shortly after)
      const targetBlock = creationBlock > 0 ? creationBlock + 1 : "latest";

      const result = await this.makeRequest({
        module: "proxy",
        action: "eth_call",
        to: poolAddress,
        data: GET_RESERVES_SELECTOR,
        tag:
          typeof targetBlock === "number"
            ? "0x" + targetBlock.toString(16)
            : targetBlock,
      });

      if (result.result && result.result !== "0x") {
        const reserves = this.decodeReserves(result.result);
        // Return the WETH reserve as initial liquidity (in ETH)
        return reserves.wethReserve;
      }
    } catch (error) {
      console.warn(
        `Failed to get initial liquidity for pool ${poolAddress}:`,
        error
      );
    }

    return 0;
  }

  /**
   * Get current pool reserves
   */
  async getPoolReserves(poolAddress: string): Promise<PoolReserves> {
    const reservesResult = await this.callContract(
      poolAddress,
      GET_RESERVES_SELECTOR
    );
    const token0Result = await this.callContract(poolAddress, TOKEN0_SELECTOR);
    const token1Result = await this.callContract(poolAddress, TOKEN1_SELECTOR);

    const decoded = this.decodeReserves(reservesResult);

    return {
      reserve0: decoded.reserve0.toString(),
      reserve1: decoded.reserve1.toString(),
      token0: this.decodeAddress(token0Result),
      token1: this.decodeAddress(token1Result),
      blockNumber: 0, // Would need separate call to get current block
    };
  }

  /**
   * Decode reserves from getReserves() response
   */
  private decodeReserves(hex: string): {
    reserve0: bigint;
    reserve1: bigint;
    wethReserve: number;
  } {
    if (!hex || hex === "0x" || hex.length < 130) {
      return { reserve0: BigInt(0), reserve1: BigInt(0), wethReserve: 0 };
    }

    // getReserves returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
    const reserve0 = BigInt("0x" + hex.slice(2, 66));
    const reserve1 = BigInt("0x" + hex.slice(66, 130));

    // Convert to ETH (assuming 18 decimals)
    const wethReserve = Number(reserve1) / 1e18;

    return { reserve0, reserve1, wethReserve };
  }

  /**
   * Convert ETH amount to USD using a default ETH price
   * In production, this would fetch real-time price from an oracle or API
   */
  convertEthToUsd(ethAmount: number, ethPriceUsd: number = 2000): number {
    return ethAmount * ethPriceUsd;
  }

  /**
   * Get liquidity in USD for a pool
   */
  async getLiquidityInUsd(
    poolAddress: string,
    creationBlock: number,
    ethPriceUsd: number = 2000
  ): Promise<number> {
    const ethLiquidity = await this.getInitialLiquidity(
      poolAddress,
      creationBlock
    );
    return this.convertEthToUsd(ethLiquidity, ethPriceUsd);
  }

  /**
   * Get total supply of LP tokens
   */
  private async getTotalSupply(poolAddress: string): Promise<bigint> {
    try {
      const result = await this.callContract(
        poolAddress,
        TOTAL_SUPPLY_SELECTOR
      );
      if (result && result !== "0x") {
        return BigInt(result);
      }
    } catch (error) {
      console.warn(
        `Failed to get total supply for pool ${poolAddress}:`,
        error
      );
    }
    return BigInt(0);
  }

  /**
   * Try to extract unlock time from a lock contract
   * Different lock contracts have different ABIs, so we try multiple approaches
   */
  private async tryGetUnlockTime(
    lockContractAddress: string,
    lockContractName: string,
    poolAddress: string
  ): Promise<number | null> {
    try {
      // Try to get lock info based on contract type
      // Most lock contracts store locks indexed by token address

      if (
        lockContractName === "Team Finance" ||
        lockContractName.startsWith("UNCX")
      ) {
        // Team Finance and UNCX use getUserLockForTokenAtIndex
        // We query index 0 to get the first lock
        const callData =
          TEAM_FINANCE_GET_LOCK_SELECTOR +
          this.encodeAddress(poolAddress) + // token address
          this.encodeAddress(poolAddress) + // user (often same as token for LP locks)
          "0".padStart(64, "0"); // index 0

        const result = await this.callContract(lockContractAddress, callData);
        if (result && result.length >= 130) {
          // Lock struct typically has unlockTime as one of the first fields
          // Try to extract timestamp (usually at offset 64 or 128)
          const possibleTimestamp = BigInt("0x" + result.slice(66, 130));
          const timestamp = Number(possibleTimestamp);

          // Validate it looks like a reasonable timestamp (after 2020, before 2100)
          if (timestamp > 1577836800 && timestamp < 4102444800) {
            return timestamp;
          }
        }
      } else if (lockContractName === "Unicrypt") {
        // Unicrypt uses getLockedTokenAtIndex
        const callData =
          UNICRYPT_GET_LOCK_SELECTOR +
          this.encodeAddress(poolAddress) +
          "0".padStart(64, "0"); // index 0

        const result = await this.callContract(lockContractAddress, callData);
        if (result && result.length >= 130) {
          // Try to extract unlock time
          const possibleTimestamp = BigInt("0x" + result.slice(66, 130));
          const timestamp = Number(possibleTimestamp);

          if (timestamp > 1577836800 && timestamp < 4102444800) {
            return timestamp;
          }
        }
      } else if (lockContractName === "PinkLock") {
        // PinkLock uses getLock with lock ID
        // We'd need to find the lock ID first, which is complex
        // For now, return null and rely on balance check
        return null;
      }
    } catch (error) {
      console.warn(
        `Failed to get unlock time from ${lockContractName}:`,
        error
      );
    }

    return null;
  }

  /**
   * Determine if lock is currently active based on unlock time
   */
  private isLockActive(unlockTime: number | null): boolean {
    if (unlockTime === null) {
      // If we can't determine unlock time but found locked tokens,
      // assume it's locked (conservative approach)
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return unlockTime > currentTime;
  }

  /**
   * Check if liquidity is locked in a known lock contract
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  async checkLiquidityLock(poolAddress: string): Promise<LiquidityLockInfo> {
    // Get total supply for percentage calculation
    const totalSupply = await this.getTotalSupply(poolAddress);

    for (const lockContract of KNOWN_LOCK_CONTRACTS) {
      try {
        // Check LP token balance in lock contract (Requirement 2.1)
        const balanceData =
          BALANCE_OF_SELECTOR + this.encodeAddress(lockContract.address);
        const balanceResult = await this.callContract(poolAddress, balanceData);

        if (balanceResult && balanceResult !== "0x") {
          const balance = BigInt(balanceResult);

          if (balance > BigInt(0)) {
            // Found locked liquidity - now get unlock time (Requirement 2.2)
            const unlockTime = await this.tryGetUnlockTime(
              lockContract.address,
              lockContract.name,
              poolAddress
            );

            // Determine if lock is active based on expiration (Requirements 2.3, 2.4)
            const isCurrentlyLocked = this.isLockActive(unlockTime);

            // Calculate locked percentage
            let lockedPercentage: number | null = null;
            if (totalSupply > BigInt(0)) {
              lockedPercentage =
                Number((balance * BigInt(10000)) / totalSupply) / 100;
            }

            return {
              isLocked: isCurrentlyLocked,
              lockContract: lockContract.address,
              lockContractName: lockContract.name,
              unlockTime: unlockTime,
              lockedAmount: balance.toString(),
              lockedPercentage: lockedPercentage,
            };
          }
        }
      } catch (error) {
        console.warn(
          `Failed to check lock contract ${lockContract.name}:`,
          error
        );
      }
    }

    // No lock contract detected (Requirement 2.5)
    return {
      isLocked: false,
      lockContract: null,
      lockContractName: null,
      unlockTime: null,
      lockedAmount: null,
      lockedPercentage: null,
    };
  }
}
