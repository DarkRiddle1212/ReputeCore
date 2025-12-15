/**
 * Holder Concentration Analyzer
 * Analyzes token holder distribution to detect concentration risks
 *
 * High concentration indicators:
 * - Top holder owns > 10% of supply
 * - Top 10 holders own > 50% of supply
 * - Dev wallet still holds large portion
 * - Suspicious wallet clustering
 */

import { cache } from "@/lib/cache";
import { AlchemyProvider } from "@/lib/providers/alchemy";

export interface HolderInfo {
  address: string;
  balance: string;
  percentage: number;
  isContract: boolean;
  label?: string;
}

export interface ConcentrationResult {
  totalHolders: number;
  totalSupply: string;
  topHolders: HolderInfo[];
  concentrationRisk: "low" | "medium" | "high" | "critical";
  riskReason: string | null;
  metrics: {
    top1Percentage: number;
    top5Percentage: number;
    top10Percentage: number;
    top20Percentage: number;
    giniCoefficient: number | null;
  };
  flags: ConcentrationFlag[];
}

export interface ConcentrationFlag {
  type: string;
  severity: "info" | "warning" | "danger";
  description: string;
  address?: string;
}

// Known contract types to label
const KNOWN_CONTRACTS: Record<string, string> = {
  "0x000000000000000000000000000000000000dead": "Burn Address",
  "0x0000000000000000000000000000000000000000": "Zero Address",
  // Uniswap
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f": "Uniswap V2 Factory",
  // Lock contracts
  "0xe2fe530c047f2d85298b07d9333c05737f1435fb": "Team Finance Lock",
  "0xdba68f07d1b7ca219f78ae8582c213d975c25caf": "Unicrypt Lock",
  "0x663a5c229c09b049e36dcc11a9b0d4a8eb9db214": "UNCX Lock",
};

export class HolderConcentrationAnalyzer {
  private apiKey: string;
  private alchemyProvider?: AlchemyProvider;
  private baseUrl = "https://api.etherscan.io/v2/api";
  private chainId = "1";
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 400;

  constructor(apiKey: string, alchemyApiKey?: string) {
    this.apiKey = apiKey;

    // Note: Alchemy's getOwnersForToken requires Growth plan ($49/mo)
    // Free tier doesn't support this method, so we use Etherscan Transfer events instead
    this.alchemyProvider = undefined;
    console.log(
      "[HolderConcentration] Using Etherscan Transfer events for holder analysis"
    );
  }

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

  private async makeRequest(params: Record<string, string>): Promise<any> {
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

    return response.json();
  }

  /**
   * Analyze holder concentration for a token
   */
  async analyzeConcentration(
    tokenAddress: string,
    creatorAddress?: string
  ): Promise<ConcentrationResult> {
    const normalizedToken = tokenAddress.toLowerCase();
    const normalizedCreator = creatorAddress?.toLowerCase();

    // Check cache first
    const cacheKey = `concentration:${normalizedToken}`;
    const cached = await cache.get<ConcentrationResult>(cacheKey);
    if (cached) {
      console.log(`[HolderConcentration] Cache hit for ${normalizedToken}`);
      return cached;
    }

    console.log(`[HolderConcentration] Analyzing token: ${normalizedToken}`);

    const flags: ConcentrationFlag[] = [];
    let topHolders: HolderInfo[] = [];
    let totalSupply = "0";
    let totalHolders = 0;

    try {
      // Get total supply
      totalSupply = await this.getTotalSupply(normalizedToken);

      // Get top holders using Alchemy if available, otherwise use transfer analysis
      if (this.alchemyProvider) {
        const holdersData =
          await this.getTopHoldersFromAlchemy(normalizedToken);
        topHolders = holdersData.holders;
        totalHolders = holdersData.totalCount;
      } else {
        const holdersData =
          await this.getTopHoldersFromTransfers(normalizedToken);
        topHolders = holdersData.holders;
        totalHolders = holdersData.totalCount;
      }

      // Calculate percentages
      const totalSupplyBigInt = BigInt(totalSupply);
      if (totalSupplyBigInt > BigInt(0)) {
        topHolders = topHolders.map((holder) => ({
          ...holder,
          percentage:
            Number(
              (BigInt(holder.balance) * BigInt(10000)) / totalSupplyBigInt
            ) / 100,
        }));
      }

      // Label known addresses and check if contract
      topHolders = await this.labelHolders(topHolders, normalizedCreator);

      // Generate flags based on analysis
      flags.push(...this.generateFlags(topHolders, normalizedCreator));
    } catch (error) {
      console.warn(`[HolderConcentration] Analysis failed:`, error);
      flags.push({
        type: "analysis_failed",
        severity: "warning",
        description: "Could not complete holder concentration analysis",
      });
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(topHolders);

    // Determine risk level
    const { concentrationRisk, riskReason } = this.evaluateRisk(metrics, flags);

    const result: ConcentrationResult = {
      totalHolders,
      totalSupply,
      topHolders: topHolders.slice(0, 20), // Return top 20
      concentrationRisk,
      riskReason,
      metrics,
      flags,
    };

    // Cache for 1 hour
    await cache.set(cacheKey, result, { ttl: 3600 });

    return result;
  }

  /**
   * Get total supply of token
   */
  private async getTotalSupply(tokenAddress: string): Promise<string> {
    try {
      const result = await this.makeRequest({
        module: "stats",
        action: "tokensupply",
        contractaddress: tokenAddress,
      });

      if (result.result) {
        return result.result;
      }
    } catch (error) {
      console.warn(`[HolderConcentration] Failed to get total supply:`, error);
    }

    return "0";
  }

  /**
   * Get top holders using Alchemy API with balances
   */
  private async getTopHoldersFromAlchemy(tokenAddress: string): Promise<{
    holders: HolderInfo[];
    totalCount: number;
  }> {
    if (!this.alchemyProvider) {
      throw new Error("Alchemy provider not available");
    }

    try {
      // Use the new method that gets holders with balances
      const holdersWithBalances =
        await this.alchemyProvider.getTopTokenHoldersWithBalances(
          tokenAddress,
          100
        );

      // Get total holder count
      const allHolders =
        await this.alchemyProvider.getAllTokenHolders(tokenAddress);

      const holders: HolderInfo[] = holdersWithBalances.map((h) => ({
        address: h.address.toLowerCase(),
        balance: h.balance,
        percentage: h.percentage,
        isContract: false,
      }));

      console.log(
        `[HolderConcentration] Alchemy returned ${holders.length} holders with balances (total: ${allHolders.length})`
      );

      return {
        holders,
        totalCount: allHolders.length,
      };
    } catch (error) {
      console.warn(
        `[HolderConcentration] Alchemy failed, falling back to transfers:`,
        error
      );
      return this.getTopHoldersFromTransfers(tokenAddress);
    }
  }

  /**
   * Get top holders by analyzing transfer events
   */
  private async getTopHoldersFromTransfers(tokenAddress: string): Promise<{
    holders: HolderInfo[];
    totalCount: number;
  }> {
    const balances = new Map<string, bigint>();
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    try {
      // Get token transfers
      const result = await this.makeRequest({
        module: "account",
        action: "tokentx",
        contractaddress: tokenAddress,
        page: "1",
        offset: "10000", // Get up to 10k transfers
        sort: "asc",
      });

      if (!result.result || !Array.isArray(result.result)) {
        return { holders: [], totalCount: 0 };
      }

      // Calculate balances from transfers
      for (const tx of result.result) {
        const from = tx.from.toLowerCase();
        const to = tx.to.toLowerCase();
        const value = BigInt(tx.value || "0");

        if (from !== ZERO_ADDRESS) {
          const current = balances.get(from) || BigInt(0);
          balances.set(from, current - value);
        }

        if (to !== ZERO_ADDRESS) {
          const current = balances.get(to) || BigInt(0);
          balances.set(to, current + value);
        }
      }

      // Filter positive balances and sort by balance
      const holders: HolderInfo[] = [];
      for (const [address, balance] of balances) {
        if (balance > BigInt(0)) {
          holders.push({
            address,
            balance: balance.toString(),
            percentage: 0,
            isContract: false,
          });
        }
      }

      // Sort by balance descending
      holders.sort((a, b) => {
        const balA = BigInt(a.balance);
        const balB = BigInt(b.balance);
        if (balB > balA) return 1;
        if (balB < balA) return -1;
        return 0;
      });

      return {
        holders: holders.slice(0, 100),
        totalCount: holders.length,
      };
    } catch (error) {
      console.warn(`[HolderConcentration] Transfer analysis failed:`, error);
      return { holders: [], totalCount: 0 };
    }
  }

  /**
   * Label holders with known addresses and check if they're contracts
   */
  private async labelHolders(
    holders: HolderInfo[],
    creatorAddress?: string
  ): Promise<HolderInfo[]> {
    const labeled: HolderInfo[] = [];

    for (const holder of holders) {
      const address = holder.address.toLowerCase();
      let label = KNOWN_CONTRACTS[address];
      let isContract = false;

      // Check if it's the creator
      if (creatorAddress && address === creatorAddress) {
        label = "Token Creator";
      }

      // Check if it's a contract (has code)
      try {
        const result = await this.makeRequest({
          module: "proxy",
          action: "eth_getCode",
          address: holder.address,
          tag: "latest",
        });

        if (
          result.result &&
          result.result !== "0x" &&
          result.result.length > 2
        ) {
          isContract = true;
          if (!label) {
            // Check if it looks like a liquidity pool
            if (result.result.length > 1000) {
              label = "Contract (possibly LP)";
            } else {
              label = "Contract";
            }
          }
        }
      } catch (error) {
        // Ignore errors, assume not a contract
      }

      labeled.push({
        ...holder,
        isContract,
        label,
      });
    }

    return labeled;
  }

  /**
   * Generate flags based on holder analysis
   */
  private generateFlags(
    holders: HolderInfo[],
    creatorAddress?: string
  ): ConcentrationFlag[] {
    const flags: ConcentrationFlag[] = [];

    if (holders.length === 0) {
      return flags;
    }

    // Check top holder concentration
    const top1 = holders[0];
    if (
      top1 &&
      top1.percentage > 50 &&
      !top1.label?.includes("Burn") &&
      !top1.label?.includes("Lock")
    ) {
      flags.push({
        type: "extreme_concentration",
        severity: "danger",
        description: `Top holder owns ${top1.percentage.toFixed(1)}% of supply`,
        address: top1.address,
      });
    } else if (
      top1 &&
      top1.percentage > 20 &&
      !top1.label?.includes("Burn") &&
      !top1.label?.includes("Lock")
    ) {
      flags.push({
        type: "high_concentration",
        severity: "warning",
        description: `Top holder owns ${top1.percentage.toFixed(1)}% of supply`,
        address: top1.address,
      });
    }

    // Check if creator still holds significant amount
    if (creatorAddress) {
      const creatorHolder = holders.find((h) => h.address === creatorAddress);
      if (creatorHolder && creatorHolder.percentage > 10) {
        flags.push({
          type: "creator_holding",
          severity: "warning",
          description: `Token creator still holds ${creatorHolder.percentage.toFixed(1)}% of supply`,
          address: creatorAddress,
        });
      }
    }

    // Check top 10 concentration
    const top10Percentage = holders
      .slice(0, 10)
      .reduce((sum, h) => sum + h.percentage, 0);
    if (top10Percentage > 80) {
      flags.push({
        type: "top10_concentration",
        severity: "danger",
        description: `Top 10 holders control ${top10Percentage.toFixed(1)}% of supply`,
      });
    } else if (top10Percentage > 60) {
      flags.push({
        type: "top10_concentration",
        severity: "warning",
        description: `Top 10 holders control ${top10Percentage.toFixed(1)}% of supply`,
      });
    }

    // Check for suspicious patterns (multiple wallets with similar balances)
    const suspiciousClusters = this.detectSuspiciousClusters(holders);
    if (suspiciousClusters.length > 0) {
      flags.push({
        type: "suspicious_clustering",
        severity: "warning",
        description: `Detected ${suspiciousClusters.length} groups of wallets with suspiciously similar balances`,
      });
    }

    return flags;
  }

  /**
   * Detect suspicious wallet clusters (wallets with very similar balances)
   */
  private detectSuspiciousClusters(holders: HolderInfo[]): string[][] {
    const clusters: string[][] = [];
    const tolerance = 0.01; // 1% tolerance

    // Group wallets by similar percentage
    const grouped = new Map<number, string[]>();

    for (const holder of holders) {
      if (holder.percentage < 0.1) continue; // Skip tiny holders

      const roundedPct = Math.round(holder.percentage * 100) / 100;
      const existing = grouped.get(roundedPct) || [];
      existing.push(holder.address);
      grouped.set(roundedPct, existing);
    }

    // Find groups with 3+ wallets at same percentage
    for (const [pct, addresses] of grouped) {
      if (addresses.length >= 3) {
        clusters.push(addresses);
      }
    }

    return clusters;
  }

  /**
   * Calculate concentration metrics
   */
  private calculateMetrics(
    holders: HolderInfo[]
  ): ConcentrationResult["metrics"] {
    const top1Percentage = holders[0]?.percentage || 0;
    const top5Percentage = holders
      .slice(0, 5)
      .reduce((sum, h) => sum + h.percentage, 0);
    const top10Percentage = holders
      .slice(0, 10)
      .reduce((sum, h) => sum + h.percentage, 0);
    const top20Percentage = holders
      .slice(0, 20)
      .reduce((sum, h) => sum + h.percentage, 0);

    // Calculate Gini coefficient (measure of inequality)
    let giniCoefficient: number | null = null;
    if (holders.length > 1) {
      const percentages = holders
        .map((h) => h.percentage)
        .sort((a, b) => a - b);
      const n = percentages.length;
      const mean = percentages.reduce((a, b) => a + b, 0) / n;

      if (mean > 0) {
        let sumDiff = 0;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            sumDiff += Math.abs(percentages[i] - percentages[j]);
          }
        }
        giniCoefficient = sumDiff / (2 * n * n * mean);
      }
    }

    return {
      top1Percentage,
      top5Percentage,
      top10Percentage,
      top20Percentage,
      giniCoefficient,
    };
  }

  /**
   * Evaluate overall concentration risk
   */
  private evaluateRisk(
    metrics: ConcentrationResult["metrics"],
    flags: ConcentrationFlag[]
  ): {
    concentrationRisk: ConcentrationResult["concentrationRisk"];
    riskReason: string | null;
  } {
    let riskScore = 0;
    const reasons: string[] = [];

    // Score based on top holder percentage
    if (metrics.top1Percentage > 50) {
      riskScore += 40;
      reasons.push(`Single holder owns ${metrics.top1Percentage.toFixed(1)}%`);
    } else if (metrics.top1Percentage > 20) {
      riskScore += 20;
      reasons.push(`Top holder owns ${metrics.top1Percentage.toFixed(1)}%`);
    } else if (metrics.top1Percentage > 10) {
      riskScore += 10;
    }

    // Score based on top 10 concentration
    if (metrics.top10Percentage > 80) {
      riskScore += 30;
      reasons.push(`Top 10 control ${metrics.top10Percentage.toFixed(1)}%`);
    } else if (metrics.top10Percentage > 60) {
      riskScore += 15;
    }

    // Add points for danger flags
    const dangerFlags = flags.filter((f) => f.severity === "danger").length;
    const warningFlags = flags.filter((f) => f.severity === "warning").length;
    riskScore += dangerFlags * 15;
    riskScore += warningFlags * 5;

    // Determine risk level
    let concentrationRisk: ConcentrationResult["concentrationRisk"];
    if (riskScore >= 60) {
      concentrationRisk = "critical";
    } else if (riskScore >= 40) {
      concentrationRisk = "high";
    } else if (riskScore >= 20) {
      concentrationRisk = "medium";
    } else {
      concentrationRisk = "low";
    }

    const riskReason = reasons.length > 0 ? reasons.join("; ") : null;

    return { concentrationRisk, riskReason };
  }
}
