// Enhanced Etherscan provider with professional error handling

import { BaseProvider } from "./BaseProvider";
import {
  TokenSummary,
  WalletInfo,
  EnhancedTokenSummary,
  ErrorAnnotation,
} from "@/types";
import { APIError, NetworkError } from "@/lib/errors";
import { DEXDataService } from "@/lib/services/DEXDataService";
import { TokenDataService } from "@/lib/services/TokenDataService";
import { LiquidityCalculator } from "@/lib/services/LiquidityCalculator";
import { DevSellCalculator } from "@/lib/services/DevSellCalculator";
import { HolderTracker } from "@/lib/services/HolderTracker";
import { HoneypotDetector } from "@/lib/services/HoneypotDetector";
import { HolderConcentrationAnalyzer } from "@/lib/services/HolderConcentration";
import { cache } from "@/lib/cache";

/**
 * Retry configuration for API calls
 * Implements: Requirement 7.1
 */
const RETRY_CONFIG = {
  retries: 3,
  factor: 2,
  minTimeout: 2000,
  maxTimeout: 10000,
};

/**
 * Simple retry utility with exponential backoff
 * Implements: Requirement 7.1 - Exponential backoff retry
 */
const retry = async <T>(
  fn: () => Promise<T>,
  options: {
    retries: number;
    factor: number;
    minTimeout: number;
    maxTimeout: number;
    onFailedAttempt?: (error: any) => void;
  }
): Promise<T> => {
  let lastError: any;

  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (options.onFailedAttempt) {
        options.onFailedAttempt({
          attemptNumber: attempt,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (attempt <= options.retries) {
        // Exponential backoff: delay = minTimeout * (factor ^ (attempt - 1))
        const delay = Math.min(
          options.minTimeout * Math.pow(options.factor, attempt - 1),
          options.maxTimeout
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

export class EtherscanProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl = "https://api.etherscan.io/v2/api";
  private chainId = "1"; // Ethereum mainnet
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 400; // 400ms = 2.5 calls/sec (under Etherscan's 3/sec limit)

  // Enhanced analytics services
  private dexDataService: DEXDataService;
  private tokenDataService: TokenDataService;
  private liquidityCalculator: LiquidityCalculator;
  private devSellCalculator: DevSellCalculator;
  private holderTracker: HolderTracker;
  private honeypotDetector: HoneypotDetector;
  private holderConcentrationAnalyzer: HolderConcentrationAnalyzer;

  constructor(apiKey: string, alchemyApiKey?: string) {
    super({
      name: "Etherscan",
      priority: 1,
      maxRequestsPerSecond: 2, // Reduced to respect 3/sec limit
      maxRequestsPerMinute: 100,
      timeout: 15000, // Increased timeout to 15 seconds
    });
    this.apiKey = apiKey;

    // Initialize enhanced analytics services
    this.dexDataService = new DEXDataService(apiKey);
    this.tokenDataService = new TokenDataService(apiKey, alchemyApiKey);
    this.liquidityCalculator = new LiquidityCalculator(this.dexDataService);
    this.devSellCalculator = new DevSellCalculator(this.tokenDataService);
    this.holderTracker = new HolderTracker(this.tokenDataService);
    this.honeypotDetector = new HoneypotDetector(apiKey);
    this.holderConcentrationAnalyzer = new HolderConcentrationAnalyzer(
      apiKey,
      alchemyApiKey
    );
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.isWithinRateLimit()) {
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        // Use a simple balance check for availability - it's faster and more reliable
        const testAddress = "0x0000000000000000000000000000000000000000";
        const response = await fetch(
          `${this.baseUrl}?chainid=${this.chainId}&module=account&action=balance&address=${testAddress}&tag=latest&apikey=${this.apiKey}`,
          {
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (!response.ok) {
          return false;
        }

        const data = await response.json();
        // Check if we got a valid response (status '1' or '0' both indicate API is working)
        return data.status === "1" || data.status === "0";
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    } catch (error) {
      console.warn(
        `Etherscan availability check failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Respect rate limits by enforcing minimum delay between calls
   * Implements: Requirement 7.3 - Rate limit compliance
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const since = now - this.lastCallTime;
    if (since < this.RATE_LIMIT_DELAY_MS) {
      const waitTime = this.RATE_LIMIT_DELAY_MS - since;
      console.log(
        `[Etherscan] Rate limit: waiting ${waitTime}ms before next call`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastCallTime = Date.now();
  }

  /**
   * Handle rate limit errors by waiting for reset
   * Implements: Requirement 7.3 - Rate limit detection and waiting
   */
  private async handleRateLimit(retryAfter?: number): Promise<void> {
    // If retry-after header is provided, use it; otherwise wait 5 seconds
    const waitTime = retryAfter ? retryAfter * 1000 : 5000;
    console.warn(
      `[Etherscan] Rate limit hit, waiting ${waitTime}ms before retry`
    );
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  /**
   * Make an API request with retry logic and error handling
   * Implements: Requirements 7.1, 7.2, 7.3
   */
  private async makeRequest(params: Record<string, string>): Promise<any> {
    const url = new URL(this.baseUrl);
    url.searchParams.append("chainid", this.chainId);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    url.searchParams.append("apikey", this.apiKey);

    return retry(
      async () => {
        await this.respectRateLimit();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(url.toString(), {
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            if (response.status === 429) {
              // Rate limited - extract retry-after header if available
              const retryAfter = response.headers.get("retry-after");
              await this.handleRateLimit(
                retryAfter ? parseInt(retryAfter) : undefined
              );
              throw new APIError("Rate limit exceeded", "Etherscan", 429);
            }
            throw new APIError(
              `HTTP ${response.status}`,
              "Etherscan",
              response.status
            );
          }

          const data = await response.json();

          // Check for rate limit in response message
          if (data.message && data.message.includes("rate limit")) {
            await this.handleRateLimit();
            throw new APIError("Rate limit exceeded", "Etherscan", 429);
          }

          if (data.status === "0" && data.message === "NOTOK") {
            // Don't throw error for "No transactions found" - that's valid
            if (data.result && data.result.includes("No transactions found")) {
              return data; // Return empty result
            }
            throw new APIError(data.result || "API error", "Etherscan");
          }

          return data;
        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      },
      {
        ...RETRY_CONFIG,
        onFailedAttempt: (error: any) => {
          const isRateLimit =
            error.message?.includes("rate limit") ||
            error.message?.includes("429");
          if (isRateLimit) {
            console.warn(
              `[Etherscan] Rate limited on attempt ${error.attemptNumber}, waiting longer...`
            );
          } else {
            console.warn(
              `[Etherscan] Attempt ${error.attemptNumber} failed:`,
              error.message
            );
          }
        },
      }
    );
  }

  private async fetchTxReceipt(txHash: string): Promise<any> {
    if (!txHash) return null;
    const result = await this.makeRequest({
      module: "proxy",
      action: "eth_getTransactionReceipt",
      txhash: txHash,
    });
    return result?.result || null;
  }

  /**
   * Verifies if a wallet created a specific token contract
   * Fetches the token contract creation transaction and compares the creator
   *
   * Implements: Requirements 4.1, 4.4, 9.1 - Token creator verification with caching
   *
   * @param tokenAddress - The token contract address to verify
   * @param walletAddress - The wallet address to check as creator
   * @returns Verification result with creation details or error
   */
  async verifyTokenCreator(
    tokenAddress: string,
    walletAddress: string
  ): Promise<{
    isCreator: boolean;
    creationTx?: string;
    creationBlock?: number;
    error?: string;
  }> {
    try {
      const normalizedToken = tokenAddress.toLowerCase();
      const normalizedWallet = walletAddress.toLowerCase();

      // Check cache first (Requirement 9.1)
      const cacheKey = `verification:${normalizedToken}:${normalizedWallet}`;
      const cached = await cache.get<{
        isCreator: boolean;
        creationTx?: string;
        creationBlock?: number;
        error?: string;
      }>(cacheKey);

      if (cached !== null) {
        console.log(
          `[Etherscan] Verification cache hit for ${normalizedToken}:${normalizedWallet}`
        );
        return cached;
      }

      console.log(
        `[Etherscan] Verifying if ${normalizedWallet} created token ${normalizedToken}`
      );

      // Get contract creation transaction
      const contractData = await this.makeRequest({
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: normalizedToken,
      });

      // Check if we got valid data
      if (!contractData.result || contractData.result.length === 0) {
        console.warn(
          `[Etherscan] No contract creation data found for ${normalizedToken}`
        );
        const result = {
          isCreator: false,
          error: "Could not find contract creation transaction",
        };

        // Cache negative result (Requirement 9.1 - 24h TTL)
        await cache.set(cacheKey, result, { ttl: 86400 });
        return result;
      }

      const creationInfo = Array.isArray(contractData.result)
        ? contractData.result[0]
        : contractData.result;

      const creatorAddress = creationInfo.contractCreator?.toLowerCase();
      const creationTxHash = creationInfo.txHash;

      if (!creatorAddress) {
        console.warn(
          `[Etherscan] No creator address found for ${normalizedToken}`
        );
        const result = {
          isCreator: false,
          error: "Could not determine contract creator",
        };

        // Cache negative result (Requirement 9.1 - 24h TTL)
        await cache.set(cacheKey, result, { ttl: 86400 });
        return result;
      }

      const isCreator = creatorAddress === normalizedWallet;

      console.log(
        `[Etherscan] Verification result: ${isCreator ? "VERIFIED" : "NOT VERIFIED"} (creator: ${creatorAddress})`
      );

      const result = {
        isCreator,
        creationTx: creationTxHash,
        creationBlock: undefined, // Etherscan API doesn't return block number in this endpoint
      };

      // Cache result (Requirement 9.1 - 24h TTL)
      await cache.set(cacheKey, result, { ttl: 86400 });

      return result;
    } catch (error) {
      // Handle API errors gracefully - return unverified status
      // Don't cache errors as they might be transient
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[Etherscan] Verification failed for ${tokenAddress}:`,
        errorMessage
      );

      return {
        isCreator: false,
        error: `Verification failed: ${errorMessage}`,
      };
    }
  }

  async getWalletInfo(address: string): Promise<WalletInfo> {
    const normalizedAddress = this.normalizeAddress(address);
    console.log(
      `[Etherscan] getWalletInfo called with address: ${address}, normalized: ${normalizedAddress}`
    );

    return this.executeRequest(async () => {
      console.log(
        `[Etherscan] Making API request for wallet info: ${normalizedAddress}`
      );
      const txList = await this.makeRequest({
        module: "account",
        action: "txlist",
        address: normalizedAddress,
        startblock: "0",
        endblock: "99999999",
        sort: "asc",
      });

      console.log(`[Etherscan] API response for ${normalizedAddress}:`, {
        resultLength: Array.isArray(txList.result)
          ? txList.result.length
          : "not an array",
        status: txList.status,
      });

      if (!Array.isArray(txList.result) || txList.result.length === 0) {
        return {
          createdAt: null,
          firstTxHash: null,
          txCount: 0,
          age: null,
        };
      }

      const firstTx = txList.result[0];
      const txCount = txList.result.length;

      const createdAt = firstTx?.timeStamp
        ? new Date(Number(firstTx.timeStamp) * 1000).toISOString()
        : null;

      const age = createdAt ? this.formatAge(new Date(createdAt)) : null;

      return {
        createdAt,
        firstTxHash: firstTx?.hash ?? null,
        txCount,
        age,
      };
    }, "getWalletInfo");
  }

  async getTokensCreated(
    address: string,
    forceRefresh: boolean = false,
    manualTokens?: string[]
  ): Promise<TokenSummary[]> {
    const normalizedAddress = this.normalizeAddress(address);

    return this.executeRequest(async () => {
      // Handle manual tokens mode (Requirement 1.5, 5.2)
      if (manualTokens && manualTokens.length > 0) {
        console.log(
          `[Etherscan] Manual tokens mode: analyzing ${manualTokens.length} provided tokens`
        );
        return await this.analyzeManualTokens(manualTokens, normalizedAddress);
      }

      // Automatic discovery mode (Requirement 5.1)
      console.log(
        `[Etherscan] Automatic discovery mode: scanning for created contracts`
      );

      // Handle force refresh by clearing relevant caches (Requirement 9.5)
      if (forceRefresh) {
        console.log(
          `[Etherscan] Force refresh requested for ${normalizedAddress}, clearing caches...`
        );
        // Note: Individual service caches will be bypassed via their own force refresh logic
      }
      // Get token transactions
      const tokenTxs = await this.makeRequest({
        module: "account",
        action: "tokentx",
        address: normalizedAddress,
        startblock: "0",
        endblock: "99999999",
        sort: "asc",
      });

      // Get regular transactions to find contract creations
      const txList = await this.makeRequest({
        module: "account",
        action: "txlist",
        address: normalizedAddress,
        startblock: "0",
        endblock: "99999999",
        sort: "asc",
      });

      const tokens = new Map<string, TokenSummary>();

      // Store token metadata from token transactions for later use
      const tokenMetadata = new Map<
        string,
        { name: string | null; symbol: string | null; timestamp: string | null }
      >();

      // Process token transactions to get metadata (name, symbol)
      // Note: We don't add these directly as "created" tokens - we only use them for metadata
      if (Array.isArray(tokenTxs.result)) {
        tokenTxs.result.forEach((tx: any) => {
          const contractAddress = tx.contractAddress?.toLowerCase();
          if (contractAddress && !tokenMetadata.has(contractAddress)) {
            tokenMetadata.set(contractAddress, {
              name: tx.tokenName || null,
              symbol: tx.tokenSymbol || null,
              timestamp: tx.timeStamp
                ? new Date(Number(tx.timeStamp) * 1000).toISOString()
                : null,
            });
          }
        });
      }

      console.log(
        `[Etherscan] Found ${tokenMetadata.size} unique tokens in token transactions (metadata only)`
      );

      // Process contract creations - these are the actual tokens created by this wallet
      if (Array.isArray(txList.result)) {
        const contractCreations = txList.result.filter(
          (tx: any) =>
            (!tx.to ||
              tx.to === "0x0000000000000000000000000000000000000000") &&
            tx.input &&
            tx.input.length > 2
        );

        console.log(
          `[Etherscan] Found ${contractCreations.length} contract creation transactions`
        );

        // Limit receipt checks to avoid heavy rate usage
        const limitedCreations = contractCreations.slice(0, 20);

        for (const tx of limitedCreations) {
          try {
            const txHash = tx.hash || tx.transactionHash;
            const receipt = await this.fetchTxReceipt(txHash);
            const contractAddress = receipt?.contractAddress?.toLowerCase();

            if (
              contractAddress &&
              contractAddress !== "0x0000000000000000000000000000000000000000"
            ) {
              if (!tokens.has(contractAddress)) {
                // Get metadata from token transactions if available
                const metadata = tokenMetadata.get(contractAddress);

                tokens.set(contractAddress, {
                  token: contractAddress,
                  name: metadata?.name || null,
                  symbol: metadata?.symbol || null,
                  creator: normalizedAddress,
                  launchAt: tx.timeStamp
                    ? new Date(Number(tx.timeStamp) * 1000).toISOString()
                    : null,
                  // Enhanced fields - will be populated below
                  initialLiquidity: null,
                  holdersAfter7Days: null,
                  liquidityLocked: null,
                  devSellRatio: null,
                });

                console.log(
                  `[Etherscan] Found created contract: ${contractAddress} (${metadata?.symbol || "unknown"})`
                );
              }
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            console.warn(
              `[Etherscan] Failed to process contract creation for tx ${tx.hash}:`,
              errorMessage
            );
          }
        }
      }

      console.log(
        `[Etherscan] Total contracts created by wallet: ${tokens.size}`
      );

      // Enhance tokens with additional metrics
      console.log(
        `[Etherscan] Found ${tokens.size} tokens, starting enhancement...`
      );

      // Skip enhancement if no tokens found or if there are too many tokens (to avoid timeout)
      const tokenArray = Array.from(tokens.values());
      if (tokenArray.length === 0) {
        console.log(`[Etherscan] No tokens found, skipping enhancement.`);
        return tokenArray;
      }

      // Limit enhancement to first 5 tokens to avoid timeout
      const tokensToEnhance = tokenArray.slice(0, 5);
      const tokensToSkip = tokenArray.slice(5);

      console.log(
        `[Etherscan] Enhancing ${tokensToEnhance.length} tokens (skipping ${tokensToSkip.length} to avoid timeout)...`
      );

      const enhancedTokens = await this.enhanceTokensWithMetrics(
        tokensToEnhance,
        normalizedAddress
      );

      // Add skipped tokens without enhancement
      const allTokens = [...enhancedTokens, ...tokensToSkip];
      console.log(
        `[Etherscan] Enhancement complete. Returning ${allTokens.length} tokens (${enhancedTokens.length} enhanced).`
      );

      return allTokens;
    }, "getTokensCreated");
  }

  /**
   * Enhance tokens with liquidity, holder count, lock status, and dev sell ratio
   * Implements: Requirements 1.5, 4.5, 7.2, 7.4, 7.5
   *
   * Error isolation: Each metric is fetched independently, failures don't block other metrics
   */
  private async enhanceTokensWithMetrics(
    tokens: TokenSummary[],
    creatorAddress: string
  ): Promise<TokenSummary[]> {
    const enhancedTokens: TokenSummary[] = [];

    console.log(
      `[Etherscan] Enhancing ${tokens.length} tokens with metrics for creator: ${creatorAddress}`
    );

    for (const token of tokens) {
      const enhanced: TokenSummary = { ...token };
      const errors: ErrorAnnotation[] = [];

      console.log(
        `[Etherscan] Processing token: ${token.token} (${token.symbol || "unknown"})`
      );

      // Fetch liquidity data with error isolation
      try {
        console.log(
          `[Etherscan] Fetching liquidity data for ${token.token}...`
        );
        const liquidityResult = await this.fetchLiquidityData(token.token);
        enhanced.initialLiquidity = liquidityResult.liquidity;
        enhanced.liquidityLocked = liquidityResult.isLocked;
        console.log(
          `[Etherscan] Liquidity result for ${token.token}: liquidity=${liquidityResult.liquidity}, locked=${liquidityResult.isLocked}`
        );
        if (liquidityResult.error) {
          errors.push(liquidityResult.error);
        }
      } catch (error) {
        // Error isolation: Continue processing even if liquidity fetch fails
        console.warn(
          `[Etherscan] Failed to fetch liquidity for ${token.token}:`,
          error
        );
        errors.push(this.createErrorAnnotation("liquidity", error));
        enhanced.initialLiquidity = null;
        enhanced.liquidityLocked = null;
      }

      // Fetch holder count with error isolation
      try {
        if (token.launchAt) {
          const launchTimestamp = Math.floor(
            new Date(token.launchAt).getTime() / 1000
          );
          console.log(
            `[Etherscan] Fetching holder count for ${token.token} (launch: ${token.launchAt})...`
          );
          enhanced.holdersAfter7Days =
            await this.holderTracker.getHolderCountAfter7Days(
              token.token,
              launchTimestamp
            );
          console.log(
            `[Etherscan] Holder count for ${token.token}: ${enhanced.holdersAfter7Days}`
          );
        } else {
          console.log(
            `[Etherscan] Skipping holder count for ${token.token} - no launch date`
          );
        }
      } catch (error) {
        // Error isolation: Continue processing even if holder count fetch fails
        console.warn(
          `[Etherscan] Failed to fetch holder count for ${token.token}:`,
          error
        );
        errors.push(this.createErrorAnnotation("holderCount", error));
        enhanced.holdersAfter7Days = null;
      }

      // Calculate dev sell ratio with error isolation
      try {
        // Use the creator address from the token or the passed creatorAddress
        const tokenCreator = token.creator || creatorAddress;
        if (tokenCreator) {
          console.log(
            `[Etherscan] Calculating dev sell ratio for ${token.token} (creator: ${tokenCreator})...`
          );
          enhanced.devSellRatio =
            await this.devSellCalculator.calculateDevSellRatio(
              token.token,
              tokenCreator
            );
          console.log(
            `[Etherscan] Dev sell ratio for ${token.token}: ${enhanced.devSellRatio}`
          );
        } else {
          console.log(
            `[Etherscan] Skipping dev sell ratio for ${token.token} - no creator address`
          );
          enhanced.devSellRatio = null;
        }
      } catch (error) {
        // Error isolation: Continue processing even if dev sell calculation fails
        console.warn(
          `[Etherscan] Failed to calculate dev sell ratio for ${token.token}:`,
          error
        );
        errors.push(this.createErrorAnnotation("devSellRatio", error));
        enhanced.devSellRatio = null;
      }

      // Honeypot detection with error isolation
      try {
        console.log(
          `[Etherscan] Running honeypot detection for ${token.token}...`
        );
        const honeypotResult = await this.honeypotDetector.detectHoneypot(
          token.token
        );
        enhanced.isHoneypot = honeypotResult.isHoneypot;
        enhanced.honeypotReason = honeypotResult.honeypotReason;
        enhanced.honeypotRiskLevel = honeypotResult.riskLevel;
        console.log(
          `[Etherscan] Honeypot result for ${token.token}: isHoneypot=${honeypotResult.isHoneypot}, risk=${honeypotResult.riskLevel}`
        );
      } catch (error) {
        console.warn(
          `[Etherscan] Failed to detect honeypot for ${token.token}:`,
          error
        );
        errors.push(this.createErrorAnnotation("honeypot", error));
        enhanced.isHoneypot = null;
        enhanced.honeypotReason = null;
        enhanced.honeypotRiskLevel = null;
      }

      // Holder concentration analysis with error isolation
      try {
        console.log(
          `[Etherscan] Analyzing holder concentration for ${token.token}...`
        );
        const concentrationResult =
          await this.holderConcentrationAnalyzer.analyzeConcentration(
            token.token,
            token.creator || creatorAddress
          );
        enhanced.holderConcentrationRisk =
          concentrationResult.concentrationRisk;
        enhanced.top10HolderPercentage =
          concentrationResult.metrics.top10Percentage;
        console.log(
          `[Etherscan] Concentration result for ${token.token}: risk=${concentrationResult.concentrationRisk}, top10=${concentrationResult.metrics.top10Percentage}%`
        );
      } catch (error) {
        console.warn(
          `[Etherscan] Failed to analyze holder concentration for ${token.token}:`,
          error
        );
        errors.push(this.createErrorAnnotation("holderConcentration", error));
        enhanced.holderConcentrationRisk = null;
        enhanced.top10HolderPercentage = null;
      }

      // Attach error annotations if any errors occurred (graceful degradation)
      if (errors.length > 0) {
        (enhanced as any).errors = errors;
        console.log(
          `[Etherscan] Token ${token.token} had ${errors.length} errors during enhancement`
        );
      }

      console.log(
        `[Etherscan] Enhanced token ${token.token}: liquidity=${enhanced.initialLiquidity}, holders=${enhanced.holdersAfter7Days}, locked=${enhanced.liquidityLocked}, devSell=${enhanced.devSellRatio}, honeypot=${enhanced.isHoneypot}, concentration=${enhanced.holderConcentrationRisk}`
      );
      enhancedTokens.push(enhanced);
    }

    return enhancedTokens;
  }

  /**
   * Analyze manually provided tokens with verification and full metrics
   * Implements: Requirements 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5
   *
   * @param tokens - Array of token addresses to analyze
   * @param walletAddress - Wallet address to verify as creator
   * @returns Array of TokenSummary with verification metadata and metrics
   */
  private async analyzeManualTokens(
    tokens: string[],
    walletAddress: string
  ): Promise<TokenSummary[]> {
    const analyzedTokens: TokenSummary[] = [];

    console.log(
      `[Etherscan] Analyzing ${tokens.length} manual tokens for wallet: ${walletAddress}`
    );

    // Process tokens in parallel for verification (but sequentially for metrics to respect rate limits)
    for (const tokenAddress of tokens) {
      const normalizedToken = tokenAddress.toLowerCase();
      const normalizedWallet = walletAddress.toLowerCase();

      console.log(`[Etherscan] Processing manual token: ${normalizedToken}`);

      // Create base token summary
      const tokenSummary: TokenSummary = {
        token: normalizedToken,
        name: null,
        symbol: null,
        creator: normalizedWallet,
        launchAt: null,
        initialLiquidity: null,
        holdersAfter7Days: null,
        liquidityLocked: null,
        devSellRatio: null,
        verified: undefined,
        verificationWarning: undefined,
      };

      // Step 1: Verify token creator
      try {
        console.log(`[Etherscan] Verifying creator for ${normalizedToken}...`);
        const verificationResult = await this.verifyTokenCreator(
          normalizedToken,
          normalizedWallet
        );

        tokenSummary.verified = verificationResult.isCreator;

        if (!verificationResult.isCreator) {
          // Add warning if not verified
          if (verificationResult.error) {
            tokenSummary.verificationWarning = `Could not verify: ${verificationResult.error}`;
          } else {
            tokenSummary.verificationWarning =
              "Warning: This token was not created by the analyzed wallet";
          }
          console.log(
            `[Etherscan] Token ${normalizedToken} not verified: ${tokenSummary.verificationWarning}`
          );
        } else {
          console.log(
            `[Etherscan] Token ${normalizedToken} verified as created by ${normalizedWallet}`
          );
        }

        // Get creation timestamp if available
        if (verificationResult.creationTx) {
          try {
            const txData = await this.makeRequest({
              module: "proxy",
              action: "eth_getTransactionByHash",
              txhash: verificationResult.creationTx,
            });
            if (txData.result && txData.result.blockNumber) {
              const blockNumber = parseInt(txData.result.blockNumber, 16);
              const blockData = await this.makeRequest({
                module: "block",
                action: "getblockreward",
                blockno: blockNumber.toString(),
              });
              if (blockData.result && blockData.result.timeStamp) {
                tokenSummary.launchAt = new Date(
                  Number(blockData.result.timeStamp) * 1000
                ).toISOString();
              }
            }
          } catch (error) {
            console.warn(
              `[Etherscan] Could not fetch creation timestamp for ${normalizedToken}:`,
              error
            );
          }
        }
      } catch (error) {
        // Verification errors don't block analysis (Requirement 4.4)
        console.warn(
          `[Etherscan] Verification error for ${normalizedToken}:`,
          error
        );
        tokenSummary.verified = undefined;
        tokenSummary.verificationWarning =
          "Could not verify token creator due to API error";
      }

      // Step 2: Fetch token metadata (name, symbol)
      try {
        const tokenTxs = await this.makeRequest({
          module: "account",
          action: "tokentx",
          contractaddress: normalizedToken,
          address: normalizedWallet,
          startblock: "0",
          endblock: "99999999",
          page: "1",
          offset: "1",
          sort: "asc",
        });

        if (Array.isArray(tokenTxs.result) && tokenTxs.result.length > 0) {
          const tx = tokenTxs.result[0];
          tokenSummary.name = tx.tokenName || null;
          tokenSummary.symbol = tx.tokenSymbol || null;
          console.log(
            `[Etherscan] Found metadata for ${normalizedToken}: ${tokenSummary.symbol}`
          );
        }
      } catch (error) {
        console.warn(
          `[Etherscan] Could not fetch metadata for ${normalizedToken}:`,
          error
        );
      }

      analyzedTokens.push(tokenSummary);
    }

    // Step 3: Enhance all tokens with metrics (liquidity, holders, dev sell ratio)
    // Use the existing enhanceTokensWithMetrics method which has error isolation
    console.log(
      `[Etherscan] Enhancing ${analyzedTokens.length} manual tokens with metrics...`
    );
    const enhancedTokens = await this.enhanceTokensWithMetrics(
      analyzedTokens,
      walletAddress
    );

    console.log(
      `[Etherscan] Manual token analysis complete. Analyzed ${enhancedTokens.length} tokens.`
    );

    return enhancedTokens;
  }

  /**
   * Fetch liquidity data for a token including lock status
   */
  private async fetchLiquidityData(tokenAddress: string): Promise<{
    liquidity: number | null;
    isLocked: boolean | null;
    error?: ErrorAnnotation;
  }> {
    try {
      // Find liquidity pools
      const pools = await this.dexDataService.findLiquidityPools(tokenAddress);

      if (pools.length === 0) {
        return { liquidity: 0, isLocked: null };
      }

      // Calculate total initial liquidity
      const totalLiquidity =
        await this.liquidityCalculator.calculateInitialLiquidity(
          tokenAddress,
          pools
        );

      // Check lock status for the first pool (primary pool)
      let isLocked: boolean | null = null;
      if (pools.length > 0) {
        const lockInfo = await this.dexDataService.checkLiquidityLock(
          pools[0].address
        );
        isLocked = lockInfo.isLocked;
      }

      return { liquidity: totalLiquidity, isLocked };
    } catch (error) {
      return {
        liquidity: null,
        isLocked: null,
        error: this.createErrorAnnotation("liquidity", error),
      };
    }
  }

  /**
   * Create an error annotation for tracking partial failures
   */
  private createErrorAnnotation(
    metric: string,
    error: unknown
  ): ErrorAnnotation {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetryable = this.isRetryableError(errorMessage);

    return {
      metric,
      error: errorMessage,
      timestamp: new Date().toISOString(),
      retryable: isRetryable,
    };
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(errorMessage: string): boolean {
    const retryablePatterns = [
      "ETIMEDOUT",
      "ECONNRESET",
      "ENOTFOUND",
      "rate limit",
      "429",
      "ECONNREFUSED",
    ];
    return retryablePatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private formatAge(from: Date): string {
    const now = new Date();
    const diff = now.getTime() - from.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0)
      return `${years} year${years > 1 ? "s" : ""}, ${months % 12} month${months % 12 > 1 ? "s" : ""}`;
    if (months > 0) return `${months} month${months > 1 ? "s" : ""}`;
    if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    return `${seconds} seconds`;
  }
}
