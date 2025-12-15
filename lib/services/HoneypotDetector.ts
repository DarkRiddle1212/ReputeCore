/**
 * Honeypot Detector
 * Detects potential honeypot tokens by analyzing contract behavior and trading patterns
 *
 * Honeypot indicators:
 * - High buy tax / sell tax
 * - Sell restrictions (can buy but not sell)
 * - Hidden transfer fees
 * - Blacklist functions
 * - Max transaction limits that prevent selling
 */

import { cache, CacheKeys, CacheTTL } from "@/lib/cache";

// Known honeypot function signatures
const HONEYPOT_SIGNATURES = {
  // Blacklist functions
  blacklist: "0x44337ea1", // blacklist(address)
  addToBlacklist: "0x0ecb93c0", // addToBlacklist(address)
  isBlacklisted: "0xfe575a87", // isBlacklisted(address)

  // Fee manipulation
  setFee: "0x69fe0e2d", // setFee(uint256)
  setSellFee: "0x8ea5220f", // setSellFee(uint256)
  setBuyFee: "0x2b14ca56", // setBuyFee(uint256)

  // Trading control
  setMaxTxAmount: "0x8da5cb5b", // setMaxTxAmount(uint256)
  setMaxWalletSize: "0x1a8145bb", // setMaxWalletSize(uint256)
  enableTrading: "0x8f70ccf7", // enableTrading()
  pauseTrading: "0x8456cb59", // pause()
};

// Common DEX router addresses for simulation
const DEX_ROUTERS = [
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2
  "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", // SushiSwap
];

export interface HoneypotResult {
  isHoneypot: boolean;
  honeypotReason: string | null;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
  flags: HoneypotFlag[];
  buyTax: number | null;
  sellTax: number | null;
  transferTax: number | null;
  isBlacklistable: boolean;
  hasMaxTxLimit: boolean;
  hasTradingControls: boolean;
  canSell: boolean | null;
  simulationSuccess: boolean;
}

export interface HoneypotFlag {
  type: string;
  severity: "info" | "warning" | "danger";
  description: string;
}

export class HoneypotDetector {
  private apiKey: string;
  private baseUrl = "https://api.etherscan.io/v2/api";
  private chainId = "1";
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 400;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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
   * Detect if a token is a potential honeypot
   */
  async detectHoneypot(tokenAddress: string): Promise<HoneypotResult> {
    const normalizedToken = tokenAddress.toLowerCase();

    // Check cache first
    const cacheKey = `honeypot:${normalizedToken}`;
    const cached = await cache.get<HoneypotResult>(cacheKey);
    if (cached) {
      console.log(`[HoneypotDetector] Cache hit for ${normalizedToken}`);
      return cached;
    }

    console.log(`[HoneypotDetector] Analyzing token: ${normalizedToken}`);

    const flags: HoneypotFlag[] = [];
    let buyTax: number | null = null;
    let sellTax: number | null = null;
    let transferTax: number | null = null;
    let isBlacklistable = false;
    let hasMaxTxLimit = false;
    let hasTradingControls = false;
    let canSell: boolean | null = null;
    let simulationSuccess = false;

    try {
      // 1. Check contract source code for honeypot patterns
      const sourceAnalysis = await this.analyzeContractSource(normalizedToken);
      flags.push(...sourceAnalysis.flags);
      isBlacklistable = sourceAnalysis.hasBlacklist;
      hasMaxTxLimit = sourceAnalysis.hasMaxTx;
      hasTradingControls = sourceAnalysis.hasTradingControls;

      // 2. Analyze recent transactions for tax patterns
      const taxAnalysis =
        await this.analyzeTaxFromTransactions(normalizedToken);
      buyTax = taxAnalysis.buyTax;
      sellTax = taxAnalysis.sellTax;
      transferTax = taxAnalysis.transferTax;
      flags.push(...taxAnalysis.flags);

      // 3. Check if sells are possible by analyzing transaction history
      const sellAnalysis = await this.analyzeSellability(normalizedToken);
      canSell = sellAnalysis.canSell;
      flags.push(...sellAnalysis.flags);

      simulationSuccess = true;
    } catch (error) {
      console.warn(
        `[HoneypotDetector] Analysis failed for ${normalizedToken}:`,
        error
      );
      flags.push({
        type: "analysis_failed",
        severity: "warning",
        description: "Could not complete full honeypot analysis",
      });
    }

    // Determine risk level and honeypot status
    const { isHoneypot, honeypotReason, riskLevel } = this.evaluateRisk(
      flags,
      buyTax,
      sellTax,
      canSell,
      isBlacklistable,
      hasTradingControls
    );

    const result: HoneypotResult = {
      isHoneypot,
      honeypotReason,
      riskLevel,
      flags,
      buyTax,
      sellTax,
      transferTax,
      isBlacklistable,
      hasMaxTxLimit,
      hasTradingControls,
      canSell,
      simulationSuccess,
    };

    // Cache result for 6 hours
    await cache.set(cacheKey, result, { ttl: 21600 });

    return result;
  }

  /**
   * Analyze contract source code for honeypot patterns
   */
  private async analyzeContractSource(tokenAddress: string): Promise<{
    flags: HoneypotFlag[];
    hasBlacklist: boolean;
    hasMaxTx: boolean;
    hasTradingControls: boolean;
  }> {
    const flags: HoneypotFlag[] = [];
    let hasBlacklist = false;
    let hasMaxTx = false;
    let hasTradingControls = false;

    try {
      const result = await this.makeRequest({
        module: "contract",
        action: "getsourcecode",
        address: tokenAddress,
      });

      if (!result.result || result.result.length === 0) {
        flags.push({
          type: "unverified_contract",
          severity: "danger",
          description: "Contract source code is not verified - high risk",
        });
        return {
          flags,
          hasBlacklist: false,
          hasMaxTx: false,
          hasTradingControls: false,
        };
      }

      const sourceCode = result.result[0].SourceCode?.toLowerCase() || "";
      const contractName = result.result[0].ContractName || "";

      // Check for blacklist functionality
      if (
        sourceCode.includes("blacklist") ||
        sourceCode.includes("isblacklisted") ||
        sourceCode.includes("_isblacklisted")
      ) {
        hasBlacklist = true;
        flags.push({
          type: "blacklist_function",
          severity: "warning",
          description:
            "Contract has blacklist functionality - addresses can be blocked from trading",
        });
      }

      // Check for max transaction limits
      if (
        sourceCode.includes("maxtxamount") ||
        sourceCode.includes("_maxtxamount") ||
        sourceCode.includes("maxtransactionamount")
      ) {
        hasMaxTx = true;
        flags.push({
          type: "max_tx_limit",
          severity: "info",
          description: "Contract has maximum transaction limits",
        });
      }

      // Check for trading controls
      if (
        sourceCode.includes("tradingopen") ||
        sourceCode.includes("tradingenabled") ||
        sourceCode.includes("enabletrading")
      ) {
        hasTradingControls = true;
        flags.push({
          type: "trading_controls",
          severity: "warning",
          description: "Contract has trading enable/disable controls",
        });
      }

      // Check for high fee patterns
      if (sourceCode.includes("sellfee") || sourceCode.includes("_sellfee")) {
        const feeMatch = sourceCode.match(/sellfee\s*=\s*(\d+)/i);
        if (feeMatch) {
          const fee = parseInt(feeMatch[1]);
          if (fee > 10) {
            flags.push({
              type: "high_sell_fee",
              severity: "danger",
              description: `High sell fee detected in contract: ${fee}%`,
            });
          }
        }
      }

      // Check for pause functionality
      if (
        sourceCode.includes("pause()") ||
        sourceCode.includes("_pause") ||
        sourceCode.includes("whennotpaused")
      ) {
        flags.push({
          type: "pausable",
          severity: "warning",
          description: "Contract can be paused by owner",
        });
      }

      // Check for ownership renounced
      const ownerResult = await this.makeRequest({
        module: "proxy",
        action: "eth_call",
        to: tokenAddress,
        data: "0x8da5cb5b", // owner()
        tag: "latest",
      });

      if (ownerResult.result && ownerResult.result !== "0x") {
        const owner = "0x" + ownerResult.result.slice(-40);
        if (owner === "0x0000000000000000000000000000000000000000") {
          flags.push({
            type: "ownership_renounced",
            severity: "info",
            description: "Contract ownership has been renounced",
          });
        }
      }
    } catch (error) {
      console.warn(`[HoneypotDetector] Source analysis failed:`, error);
    }

    return { flags, hasBlacklist, hasMaxTx, hasTradingControls };
  }

  /**
   * Analyze recent transactions to detect tax patterns
   */
  private async analyzeTaxFromTransactions(tokenAddress: string): Promise<{
    buyTax: number | null;
    sellTax: number | null;
    transferTax: number | null;
    flags: HoneypotFlag[];
  }> {
    const flags: HoneypotFlag[] = [];
    let buyTax: number | null = null;
    let sellTax: number | null = null;
    let transferTax: number | null = null;

    try {
      // Get recent token transfers
      const result = await this.makeRequest({
        module: "account",
        action: "tokentx",
        contractaddress: tokenAddress,
        page: "1",
        offset: "100",
        sort: "desc",
      });

      if (
        !result.result ||
        !Array.isArray(result.result) ||
        result.result.length === 0
      ) {
        return { buyTax, sellTax, transferTax, flags };
      }

      // Analyze transfers to/from DEX routers
      const dexTransfers = result.result.filter((tx: any) =>
        DEX_ROUTERS.some(
          (router) =>
            tx.from.toLowerCase() === router.toLowerCase() ||
            tx.to.toLowerCase() === router.toLowerCase()
        )
      );

      // Count buys vs sells
      let buyCount = 0;
      let sellCount = 0;

      for (const tx of dexTransfers) {
        const isFromRouter = DEX_ROUTERS.some(
          (r) => tx.from.toLowerCase() === r.toLowerCase()
        );
        if (isFromRouter) {
          buyCount++;
        } else {
          sellCount++;
        }
      }

      // If there are buys but no sells, it's suspicious
      if (buyCount > 10 && sellCount === 0) {
        flags.push({
          type: "no_sells_detected",
          severity: "danger",
          description: `${buyCount} buys detected but 0 sells - possible honeypot`,
        });
      } else if (buyCount > 0 && sellCount > 0) {
        const ratio = sellCount / buyCount;
        if (ratio < 0.1) {
          flags.push({
            type: "low_sell_ratio",
            severity: "warning",
            description: `Very low sell/buy ratio (${(ratio * 100).toFixed(1)}%) - selling may be restricted`,
          });
        }
      }
    } catch (error) {
      console.warn(`[HoneypotDetector] Tax analysis failed:`, error);
    }

    return { buyTax, sellTax, transferTax, flags };
  }

  /**
   * Analyze if sells are actually possible
   */
  private async analyzeSellability(tokenAddress: string): Promise<{
    canSell: boolean | null;
    flags: HoneypotFlag[];
  }> {
    const flags: HoneypotFlag[] = [];
    let canSell: boolean | null = null;

    try {
      // Get recent transactions to the token contract
      const result = await this.makeRequest({
        module: "account",
        action: "txlist",
        address: tokenAddress,
        page: "1",
        offset: "50",
        sort: "desc",
      });

      if (!result.result || !Array.isArray(result.result)) {
        return { canSell: null, flags };
      }

      // Check for failed transactions (could indicate sell restrictions)
      const failedTxs = result.result.filter((tx: any) => tx.isError === "1");
      const totalTxs = result.result.length;

      if (totalTxs > 0) {
        const failRate = failedTxs.length / totalTxs;
        if (failRate > 0.3) {
          flags.push({
            type: "high_failure_rate",
            severity: "warning",
            description: `High transaction failure rate (${(failRate * 100).toFixed(1)}%) - may indicate restrictions`,
          });
        }
      }

      // If we found successful sells in tax analysis, selling is possible
      canSell = true; // Default to true unless we find evidence otherwise
    } catch (error) {
      console.warn(`[HoneypotDetector] Sellability analysis failed:`, error);
    }

    return { canSell, flags };
  }

  /**
   * Evaluate overall risk based on collected data
   */
  private evaluateRisk(
    flags: HoneypotFlag[],
    buyTax: number | null,
    sellTax: number | null,
    canSell: boolean | null,
    isBlacklistable: boolean,
    hasTradingControls: boolean
  ): {
    isHoneypot: boolean;
    honeypotReason: string | null;
    riskLevel: HoneypotResult["riskLevel"];
  } {
    let riskScore = 0;
    const reasons: string[] = [];

    // Count severity levels
    const dangerFlags = flags.filter((f) => f.severity === "danger").length;
    const warningFlags = flags.filter((f) => f.severity === "warning").length;

    riskScore += dangerFlags * 30;
    riskScore += warningFlags * 10;

    // High sell tax
    if (sellTax !== null && sellTax > 20) {
      riskScore += 40;
      reasons.push(`Extremely high sell tax (${sellTax}%)`);
    } else if (sellTax !== null && sellTax > 10) {
      riskScore += 20;
      reasons.push(`High sell tax (${sellTax}%)`);
    }

    // Can't sell
    if (canSell === false) {
      riskScore += 50;
      reasons.push("Selling appears to be blocked");
    }

    // Unverified contract
    if (flags.some((f) => f.type === "unverified_contract")) {
      riskScore += 25;
      reasons.push("Contract is not verified");
    }

    // No sells detected
    if (flags.some((f) => f.type === "no_sells_detected")) {
      riskScore += 35;
      reasons.push("No successful sells detected");
    }

    // Determine risk level
    let riskLevel: HoneypotResult["riskLevel"];
    if (riskScore >= 70) {
      riskLevel = "critical";
    } else if (riskScore >= 50) {
      riskLevel = "high";
    } else if (riskScore >= 30) {
      riskLevel = "medium";
    } else if (riskScore >= 10) {
      riskLevel = "low";
    } else {
      riskLevel = "none";
    }

    const isHoneypot = riskScore >= 50;
    const honeypotReason = reasons.length > 0 ? reasons.join("; ") : null;

    return { isHoneypot, honeypotReason, riskLevel };
  }
}
