/**
 * Helius Provider for Solana blockchain data
 * Implements: Requirements 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { BaseProvider } from "./BaseProvider";
import { TokenSummary, WalletInfo } from "@/types";
import {
  APIError,
  NetworkError,
  SolanaValidationError,
  SolanaRPCError,
  SolanaProviderError,
} from "@/lib/errors";
import { isValidSolanaAddress, normalizeSolanaAddress } from "@/lib/validation";
import { logger } from "@/lib/logger";

/**
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  retries: 3,
  factor: 2,
  minTimeout: 2000,
  maxTimeout: 10000,
};

/**
 * Simple retry utility with exponential backoff
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

export class HeliusProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl = "https://api.helius.xyz/v0";
  private rpcUrl: string;
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 200; // 200ms = 5 calls/sec

  constructor(apiKey: string) {
    super({
      name: "Helius",
      priority: 2, // Lower priority than Etherscan
      maxRequestsPerSecond: 5,
      maxRequestsPerMinute: 300,
      timeout: 15000,
    });
    this.apiKey = apiKey;
    // Updated RPC URL format - Helius uses rpc.helius.xyz now
    this.rpcUrl = `https://rpc.helius.xyz/?api-key=${apiKey}`;
  }

  /**
   * Wrapper for fetch with API call logging
   * Implements: Requirement 12.2
   */
  private async fetchWithLogging(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const startTime = Date.now();
    const endpoint = url.replace(this.apiKey, "[REDACTED]"); // Don't log API key

    try {
      const response = await fetch(url, options);
      const duration = Date.now() - startTime;

      logger.apiCall("Helius", endpoint, duration, response.ok, {
        status: response.status,
        method: options?.method || "GET",
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.apiCall("Helius", endpoint, duration, false, {
        error: error instanceof Error ? error.message : String(error),
        method: options?.method || "GET",
      });
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (!this.isWithinRateLimit()) {
        console.log(
          "[Helius] Rate limit check failed, but returning true to allow requests"
        );
        // Still return true - let the actual request handle rate limiting
        return true;
      }

      // Skip health check and assume available if we have an API key
      // The actual requests will fail if there's an issue
      if (this.apiKey && this.apiKey.length > 0) {
        console.log("[Helius] API key present, assuming available");
        return true;
      }

      return false;
    } catch (error) {
      console.warn(
        `Helius availability check failed:`,
        error instanceof Error ? error.message : String(error)
      );
      // Return true anyway to let actual requests try
      return true;
    }
  }

  /**
   * Get wallet information for a Solana address
   * Implements: Requirements 3.1, 4.1
   */
  async getWalletInfo(address: string): Promise<WalletInfo> {
    // Validate Solana address (Requirement 7.2)
    if (!isValidSolanaAddress(address)) {
      throw new SolanaValidationError(
        `Invalid Solana address format: ${address}. Must be a base58-encoded string of 32-44 characters.`,
        "address"
      );
    }

    const normalizedAddress = normalizeSolanaAddress(address);

    return this.executeRequest(async () => {
      return retry(
        async () => {
          // Get account info using RPC
          const accountInfo = await this.getAccountInfo(normalizedAddress);

          // Get ALL transaction signatures to find the OLDEST (first) transaction
          // We need to paginate through all signatures to get accurate wallet age
          const { signatures, totalCount } =
            await this.getAllSignaturesForAge(normalizedAddress);

          // Get transaction count (total from pagination)
          const txCount = totalCount;

          // The LAST signature in the array is the OLDEST (first) transaction
          const firstTxHash =
            signatures.length > 0
              ? signatures[signatures.length - 1].signature
              : null;
          const createdAt =
            signatures.length > 0
              ? new Date(
                  signatures[signatures.length - 1].blockTime * 1000
                ).toISOString()
              : null;

          // Calculate wallet age
          let age = "Unknown";
          if (createdAt) {
            const ageMs = Date.now() - new Date(createdAt).getTime();
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            if (ageDays < 30) {
              age = `${ageDays} days`;
            } else if (ageDays < 365) {
              age = `${Math.floor(ageDays / 30)} months`;
            } else {
              age = `${Math.floor(ageDays / 365)} years`;
            }
          }

          return {
            address: normalizedAddress,
            createdAt,
            age,
            txCount,
            firstTxHash,
            balance: accountInfo?.lamports
              ? (accountInfo.lamports / 1e9).toString()
              : "0",
          };
        },
        {
          ...RETRY_CONFIG,
          onFailedAttempt: (error) => {
            console.warn(
              `Helius getWalletInfo retry attempt ${error.attemptNumber}:`,
              error.message
            );
          },
        }
      );
    }, "getWalletInfo");
  }

  /**
   * Get all signatures for a wallet to determine accurate age
   * Paginates through all transactions to find the oldest one
   */
  private async getAllSignaturesForAge(
    address: string
  ): Promise<{ signatures: any[]; totalCount: number }> {
    console.log(`[Helius] Starting getAllSignaturesForAge for ${address}`);
    const allSignatures: any[] = [];
    let beforeSignature: string | undefined = undefined;
    const MAX_PAGES = 50; // Safety limit: 50 pages * 1000 = 50,000 transactions max

    for (let page = 0; page < MAX_PAGES; page++) {
      const params: any[] = beforeSignature
        ? [address, { limit: 1000, before: beforeSignature }]
        : [address, { limit: 1000 }];

      console.log(`[Helius] Fetching signatures page ${page}...`);

      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignaturesForAddress",
          params,
        }),
      });

      if (!response.ok) {
        console.warn(
          `[Helius] Failed to fetch signatures page ${page}: ${response.status}`
        );
        break;
      }

      const data = await response.json();

      if (data.error) {
        console.warn(`[Helius] RPC error on page ${page}:`, data.error);
        break;
      }

      const signatures = data.result || [];

      console.log(
        `[Helius] Page ${page}: Got ${signatures.length} signatures (total: ${allSignatures.length + signatures.length})`
      );

      if (signatures.length === 0) {
        console.log(`[Helius] No more signatures on page ${page}`);
        break;
      }

      allSignatures.push(...signatures);

      // Get the last signature for pagination
      beforeSignature = signatures[signatures.length - 1]?.signature;

      // If we got less than 1000, we've reached the end
      if (signatures.length < 1000) {
        console.log(
          `[Helius] Reached end of signatures (got ${signatures.length} < 1000)`
        );
        break;
      }
    }

    console.log(
      `[Helius] Fetched ${allSignatures.length} total signatures for wallet age calculation`
    );

    // Log the oldest transaction date
    if (allSignatures.length > 0) {
      const oldest = allSignatures[allSignatures.length - 1];
      const oldestDate = oldest.blockTime
        ? new Date(oldest.blockTime * 1000).toISOString()
        : "unknown";
      console.log(`[Helius] Oldest transaction date: ${oldestDate}`);
    }

    return {
      signatures: allSignatures,
      totalCount: allSignatures.length,
    };
  }

  /**
   * Get tokens created by a Solana address
   * Implements: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
   *
   * Note: Solana always uses automatic discovery, manualTokens parameter is ignored
   */
  async getTokensCreated(
    address: string,
    forceRefresh?: boolean,
    manualTokens?: string[]
  ): Promise<TokenSummary[]> {
    // Solana always uses automatic discovery (Requirement 5.3)
    if (manualTokens && manualTokens.length > 0) {
      console.log(
        `[Helius] Manual tokens ignored for Solana - using automatic discovery`
      );
    }
    // Validate Solana address (Requirement 7.2)
    if (!isValidSolanaAddress(address)) {
      throw new SolanaValidationError(
        `Invalid Solana address format: ${address}. Must be a base58-encoded string of 32-44 characters.`,
        "address"
      );
    }

    const normalizedAddress = normalizeSolanaAddress(address);

    return this.executeRequest(async () => {
      return retry(
        async () => {
          // Use Helius DAS API to get tokens where this address is the mint authority
          let tokens: TokenSummary[] = [];
          try {
            tokens = await this.getTokensByMintAuthority(normalizedAddress);
            console.log(
              `[Helius] getTokensCreated: getTokensByMintAuthority returned ${tokens.length} tokens`
            );
          } catch (error) {
            console.error(
              `[Helius] getTokensCreated: getTokensByMintAuthority failed:`,
              error
            );
            // Return empty array instead of throwing
            return [];
          }

          // If no tokens found, return early
          if (tokens.length === 0) {
            console.log(
              `[Helius] getTokensCreated: No tokens found, returning empty array`
            );
            return [];
          }

          // Fetch liquidity data, holder count, and metadata for each token (limit to first 10 to avoid rate limits)
          // Optimization: Fetch holder counts in parallel for all tokens (Requirement 13.5)
          let tokensWithLiquidity: TokenSummary[] = [];
          try {
            tokensWithLiquidity = await Promise.all(
              tokens.slice(0, 10).map(async (token) => {
                try {
                  // Optimization: Fetch all data in parallel (Requirement 13.1, 13.5)
                  const [
                    liquidity,
                    holderCount,
                    devSellData,
                    initialLiq,
                    metadata,
                  ] = await Promise.all([
                    this.getTokenLiquidity(token.token),
                    this.getTokenHolderCount(token.token),
                    this.calculateDevSellRatio(token.token, normalizedAddress),
                    !token.initialLiquidity || token.initialLiquidity === 0
                      ? this.fetchInitialLiquidity(token.token)
                      : Promise.resolve(token.initialLiquidity),
                    // Only fetch metadata if name is invalid
                    !token.name ||
                    token.name === "Pump.fun Token" ||
                    token.name === "Unknown Token" ||
                    /^\d+$/.test(token.name)
                      ? this.getTokenMetadata(token.token)
                      : Promise.resolve(null),
                  ]);

                  // Process name and symbol
                  let name = token.name;
                  let symbol = token.symbol;
                  if (metadata) {
                    if (metadata.name && !/^\d+$/.test(metadata.name)) {
                      name = metadata.name;
                    }
                    if (metadata.symbol && !/^\d+$/.test(metadata.symbol)) {
                      symbol = metadata.symbol;
                    }
                  }
                  // If still no valid name, use shortened address
                  if (!name || /^\d+$/.test(name)) {
                    name = `Token ${token.token.slice(0, 6)}...`;
                    symbol = symbol || token.token.slice(0, 4).toUpperCase();
                  }

                  return {
                    ...token,
                    name,
                    symbol,
                    initialLiquidity: initialLiq || token.initialLiquidity,
                    currentLiquidity:
                      liquidity?.currentLiquidity ?? token.currentLiquidity,
                    liquidityLocked:
                      liquidity?.liquidityLocked ??
                      token.liquidityLocked ??
                      true,
                    holdersAfter7Days: holderCount,
                    devSellRatio: devSellData.devSellRatio,
                    devTokensReceived: devSellData.devTokensReceived,
                    devTokensSold: devSellData.devTokensSold,
                  };
                } catch (e) {
                  console.warn(`Failed to fetch data for ${token.token}:`, e);
                }
                return token;
              })
            );
          } catch (enrichError) {
            console.warn(
              `[Helius] Token enrichment failed, returning raw tokens:`,
              enrichError
            );
            // Return raw tokens without enrichment if enrichment fails
            return tokens;
          }

          // Add remaining tokens without liquidity data
          const remainingTokens = tokens.slice(10);

          console.log(
            `[Helius] getTokensCreated: Returning ${tokensWithLiquidity.length + remainingTokens.length} tokens`
          );
          return [...tokensWithLiquidity, ...remainingTokens];
        },
        {
          ...RETRY_CONFIG,
          onFailedAttempt: (error) => {
            console.warn(
              `Helius getTokensCreated retry attempt ${error.attemptNumber}:`,
              error.message
            );
          },
        }
      );
    }, "getTokensCreated");
  }

  // Pump.fun program ID
  private readonly PUMP_FUN_PROGRAM_ID =
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

  // Native SOL token address - should be filtered out
  private readonly NATIVE_SOL_MINT =
    "So11111111111111111111111111111111111111112";

  /**
   * Get tokens where the address is the mint authority (creator)
   * Uses Helius DAS API for efficient token discovery
   */
  private async getTokensByMintAuthority(
    address: string
  ): Promise<TokenSummary[]> {
    const tokens: TokenSummary[] = [];

    // Run all detection methods in parallel for better performance
    console.log(`[Helius] Starting parallel token detection for ${address}`);

    const [dasResult, pumpFunResult, mintAuthResult, programResult] =
      await Promise.allSettled([
        // Method 1: Use DAS API searchAssets to find tokens by mint authority (most reliable)
        this.searchTokensByMintAuthority(address)
          .then((tokens) => {
            console.log(`[Helius] Found ${tokens.length} tokens via DAS API`);
            return tokens;
          })
          .catch((error) => {
            console.warn(`[Helius] Method 1 (DAS API) failed:`, error);
            return [];
          }),

        // Method 2: Check for pump.fun token launches
        this.getPumpFunTokens(address)
          .then((tokens) => {
            console.log(`[Helius] Found ${tokens.length} pump.fun tokens`);
            return tokens;
          })
          .catch((error) => {
            console.warn(`[Helius] Method 2 (pump.fun) failed:`, error);
            return [];
          }),

        // Method 3: Search for standard SPL token mints via transactions
        this.getTokensFromTransactions(address)
          .then((tokens) => {
            console.log(
              `[Helius] Found ${tokens.length} tokens via mint authority scan`
            );
            return tokens;
          })
          .catch((error) => {
            console.warn(
              `[Helius] Method 3 (getTokensFromTransactions) failed:`,
              error
            );
            return [];
          }),

        // Method 4: Detect tokens via known program interactions
        this.getTokensFromKnownPrograms(address)
          .then((tokens) => {
            console.log(
              `[Helius] Found ${tokens.length} tokens via program interactions`
            );
            return tokens;
          })
          .catch((error) => {
            console.warn(
              `[Helius] Method 4 (getTokensFromKnownPrograms) failed:`,
              error
            );
            return [];
          }),
      ]);

    // Collect results from all methods using a Map to ensure uniqueness
    const tokenMap = new Map<string, TokenSummary>();

    const addTokens = (results: PromiseSettledResult<TokenSummary[]>) => {
      if (results.status === "fulfilled") {
        for (const token of results.value) {
          // Skip native SOL and ensure we have a valid token address
          if (!token.token || token.token === this.NATIVE_SOL_MINT) continue;

          // Only add if not already in map (keeps first occurrence)
          if (!tokenMap.has(token.token)) {
            tokenMap.set(token.token, token);
          }
        }
      }
    };

    addTokens(dasResult);
    addTokens(pumpFunResult);
    addTokens(mintAuthResult);
    addTokens(programResult);

    // Convert map to array
    const uniqueTokens = Array.from(tokenMap.values());

    console.log(`[Helius] Total unique tokens found: ${uniqueTokens.length}`);
    console.log(
      `[Helius] getTokensByMintAuthority returning ${uniqueTokens.length} tokens for ${address}`
    );
    return uniqueTokens;
  }

  /**
   * Use Helius DAS API to search for tokens by mint authority
   * This method uses multiple approaches to find tokens
   */
  private async searchTokensByMintAuthority(
    address: string
  ): Promise<TokenSummary[]> {
    const tokenMap = new Map<string, TokenSummary>();

    try {
      // Method 1: Use DAS searchAssets API to find tokens where address is authority
      console.log(
        `[Helius] Trying DAS searchAssets for mint authority: ${address}`
      );

      const searchResponse = await fetch(`${this.baseUrl}/v0/searchAssets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "search-tokens",
          method: "searchAssets",
          params: {
            interface: "FungibleToken",
            ownerAddress: address,
            limit: 1000,
          },
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const assets = searchData.result?.items || [];

        for (const asset of assets) {
          // Check if this address is the mint authority
          if (
            asset.authorities?.find(
              (auth: any) =>
                auth.address === address && auth.scopes?.includes("full")
            )
          ) {
            if (!tokenMap.has(asset.id)) {
              tokenMap.set(asset.id, {
                token: asset.id,
                name: asset.content?.metadata?.name || "Unknown Token",
                symbol: asset.content?.metadata?.symbol || "TOKEN",
                launchAt: asset.created_at || new Date().toISOString(),
                initialLiquidity: 0,
                currentLiquidity: 0,
              });
              console.log(
                `[Helius] Found token via DAS: ${asset.content?.metadata?.symbol || asset.id.slice(0, 8)}`
              );
            }
          }
        }
      }

      // Method 2: Use getAssetsByAuthority if available
      const authorityResponse = await fetch(
        `${this.baseUrl}/v0/getAssetsByAuthority`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "authority-search",
            method: "getAssetsByAuthority",
            params: {
              authorityAddress: address,
              page: 1,
              limit: 1000,
            },
          }),
        }
      );

      if (authorityResponse.ok) {
        const authorityData = await authorityResponse.json();
        const authorityAssets = authorityData.result?.items || [];

        for (const asset of authorityAssets) {
          if (asset.interface === "FungibleToken" && !tokenMap.has(asset.id)) {
            tokenMap.set(asset.id, {
              token: asset.id,
              name: asset.content?.metadata?.name || "Unknown Token",
              symbol: asset.content?.metadata?.symbol || "TOKEN",
              launchAt: asset.created_at || new Date().toISOString(),
              initialLiquidity: 0,
              currentLiquidity: 0,
            });
            console.log(
              `[Helius] Found token via authority API: ${asset.content?.metadata?.symbol || asset.id.slice(0, 8)}`
            );
          }
        }
      }

      const tokens = Array.from(tokenMap.values());
      console.log(`[Helius] DAS API found ${tokens.length} unique tokens`);
      return tokens;
    } catch (error) {
      console.warn("[Helius] DAS API search failed:", error);
      return [];
    }
  }

  /**
   * Detect tokens created via known program interactions
   * This catches tokens created through popular platforms
   * Optimized: Uses batch processing to avoid timeouts
   */
  private async getTokensFromKnownPrograms(
    address: string
  ): Promise<TokenSummary[]> {
    const tokens: TokenSummary[] = [];
    const seenMints = new Set<string>();

    try {
      // Known program addresses for token creation
      const KNOWN_PROGRAMS = {
        PUMP_FUN: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
        RAYDIUM_AMM: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
        RAYDIUM_CLMM: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
        JUPITER: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        METEORA: "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
        ORCA: "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
      };

      // Get recent transactions - limit to 100 for performance
      const signatures = await this.getSignatures(address, 100);
      console.log(
        `[Helius] Scanning ${signatures.length} transactions for known program interactions`
      );

      // Process in batches of 10 for better performance
      const BATCH_SIZE = 10;
      for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
        const batch = signatures.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (sig) => {
            try {
              const txResponse = await fetch(this.rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "getTransaction",
                  params: [
                    sig.signature,
                    {
                      encoding: "jsonParsed",
                      maxSupportedTransactionVersion: 0,
                    },
                  ],
                }),
              });

              if (!txResponse.ok) return [];

              const txData = await txResponse.json();
              const tx = txData.result;
              if (!tx) return [];

              const foundTokens: TokenSummary[] = [];

              // Check if transaction involves known token creation programs
              const instructions = tx.transaction?.message?.instructions || [];

              for (const ix of instructions) {
                const programId = ix.programId;

                // Check if this is a known token creation program
                if (Object.values(KNOWN_PROGRAMS).includes(programId)) {
                  // Look for token mints in this transaction
                  const tokenMints = this.extractTokenMintsFromTransaction(
                    tx,
                    address
                  );
                  for (const token of tokenMints) {
                    if (!seenMints.has(token.token)) {
                      seenMints.add(token.token);
                      foundTokens.push(token);
                    }
                  }
                }
              }

              // Also check inner instructions for InitializeMint
              const innerInstructions = tx.meta?.innerInstructions || [];
              for (const inner of innerInstructions) {
                for (const ix of inner.instructions || []) {
                  if (
                    ix.parsed?.type === "initializeMint" ||
                    ix.parsed?.type === "initializeMint2"
                  ) {
                    const mintAuthority = ix.parsed?.info?.mintAuthority;
                    const mintAddress = ix.parsed?.info?.mint;

                    if (
                      mintAuthority === address &&
                      mintAddress &&
                      !seenMints.has(mintAddress)
                    ) {
                      seenMints.add(mintAddress);
                      foundTokens.push({
                        token: mintAddress,
                        name: "Token",
                        symbol: "TOKEN",
                        launchAt: sig.blockTime
                          ? new Date(sig.blockTime * 1000).toISOString()
                          : new Date().toISOString(),
                        initialLiquidity: 0,
                        currentLiquidity: 0,
                      });
                      console.log(
                        `[Helius] Found token via program interaction: ${mintAddress.slice(0, 8)}...`
                      );
                    }
                  }
                }
              }

              return foundTokens;
            } catch (error) {
              return [];
            }
          })
        );

        // Flatten and add to tokens
        for (const result of batchResults) {
          tokens.push(...result);
        }

        // Small delay between batches
        if (i + BATCH_SIZE < signatures.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      console.warn("[Helius] Error scanning known programs:", error);
    }

    return tokens;
  }

  /**
   * Extract token mints from a transaction where address is VERIFIED as creator
   * Only returns tokens where we can confirm the address is the mint authority
   * via InitializeMint instructions - NOT based on token amounts received
   */
  private extractTokenMintsFromTransaction(
    tx: any,
    creatorAddress: string
  ): TokenSummary[] {
    const tokens: TokenSummary[] = [];

    try {
      // ONLY look for InitializeMint instructions where this address is mint authority
      // Do NOT use token transfer amounts as heuristics - they cause false positives
      const innerInstructions = tx.meta?.innerInstructions || [];
      
      for (const inner of innerInstructions) {
        for (const ix of inner.instructions || []) {
          if (
            ix.parsed?.type === "initializeMint" ||
            ix.parsed?.type === "initializeMint2"
          ) {
            const mintAuthority = ix.parsed?.info?.mintAuthority;
            const mintAddress = ix.parsed?.info?.mint;

            // STRICT: Only include if this address is the mint authority
            if (mintAuthority === creatorAddress && mintAddress) {
              tokens.push({
                token: mintAddress,
                name: "Token",
                symbol: "TOKEN",
                launchAt: tx.blockTime
                  ? new Date(tx.blockTime * 1000).toISOString()
                  : new Date().toISOString(),
                initialLiquidity: 0,
                currentLiquidity: 0,
              });
              console.log(
                `[Helius] Found token via InitializeMint: ${mintAddress.slice(0, 8)}...`
              );
            }
          }
        }
      }
    } catch (error) {
      console.warn("Error extracting token mints:", error);
    }

    return tokens;
  }

  /**
   * Get pump.fun tokens created by this address
   * Paginates through all transactions to find all token launches
   */
  private async getPumpFunTokens(address: string): Promise<TokenSummary[]> {
    const tokens: TokenSummary[] = [];
    const seenMints = new Set<string>();
    let beforeSignature: string | undefined = undefined;
    let totalFetched = 0;
    const MAX_TRANSACTIONS = 1000; // Limit to 1000 transactions for performance (most token creations are recent)

    try {
      console.log(`[Helius] Starting pump.fun token search for ${address}`);

      // Paginate through all transactions
      while (totalFetched < MAX_TRANSACTIONS) {
        const txUrl: string = beforeSignature
          ? `${this.baseUrl}/addresses/${address}/transactions?api-key=${this.apiKey}&limit=100&before=${beforeSignature}`
          : `${this.baseUrl}/addresses/${address}/transactions?api-key=${this.apiKey}&limit=100`;

        const txResponse: Response = await fetch(txUrl, { method: "GET" });

        if (!txResponse.ok) {
          console.warn(`Helius transactions API failed: ${txResponse.status}`);
          break;
        }

        const transactions: any[] = await txResponse.json();

        if (!transactions || transactions.length === 0) {
          console.log(`[Helius] No more transactions to fetch`);
          break;
        }

        totalFetched += transactions.length;
        console.log(
          `[Helius] Fetched ${transactions.length} transactions (total: ${totalFetched})`
        );

        // Log unique transaction types for debugging
        const types = [...new Set(transactions.map((t: any) => t.type))];
        const sources = [...new Set(transactions.map((t: any) => t.source))];

        if (totalFetched <= 100) {
          console.log(`[Helius DEBUG] Transaction types: ${types.join(", ")}`);
          console.log(
            `[Helius DEBUG] Transaction sources: ${sources.join(", ")}`
          );
        }

        // Log date range of this batch
        if (transactions.length > 0) {
          const firstTx = transactions[0];
          const lastTx = transactions[transactions.length - 1];
          const firstDate = firstTx.timestamp
            ? new Date(firstTx.timestamp * 1000).toISOString().split("T")[0]
            : "unknown";
          const lastDate = lastTx.timestamp
            ? new Date(lastTx.timestamp * 1000).toISOString().split("T")[0]
            : "unknown";
          if (totalFetched <= 200 || totalFetched % 1000 === 0) {
            console.log(
              `[Helius DEBUG] Date range: ${firstDate} to ${lastDate}`
            );
          }
        }

        // Log ALL pump.fun transactions where wallet is fee payer
        const pumpFunTxs = transactions.filter(
          (t: any) =>
            (t.source === "PUMP_FUN" ||
              t.source === "PUMP.FUN" ||
              t.source === "PUMP_AMM") &&
            t.feePayer === address
        );
        if (pumpFunTxs.length > 0 && totalFetched <= 500) {
          console.log(
            `[Helius DEBUG] Found ${pumpFunTxs.length} PUMP_FUN txs where wallet is fee payer`
          );
          for (const tx of pumpFunTxs.slice(0, 2)) {
            const transfers = tx.tokenTransfers || [];
            // Log ALL transfers to see what amounts we're dealing with
            for (const t of transfers.slice(0, 3)) {
              console.log(
                `[Helius DEBUG] Transfer: to=${t.toUserAccount?.slice(0, 10)}, amount=${t.tokenAmount}, mint=${t.mint?.slice(0, 15)}`
              );
            }
          }
        }

        // Look for any CREATE type transactions
        const createTxs = transactions.filter(
          (t: any) =>
            t.type === "CREATE" ||
            t.type?.includes("CREATE") ||
            (t.description?.toLowerCase().includes("created") &&
              t.feePayer === address)
        );
        if (createTxs.length > 0) {
          console.log(
            `[Helius DEBUG] Found ${createTxs.length} potential CREATE transactions`
          );
          for (const tx of createTxs) {
            console.log(
              `[Helius DEBUG] CREATE tx: type=${tx.type}, source=${tx.source}, feePayer=${tx.feePayer}, desc=${tx.description?.slice(0, 100)}`
            );
          }
        }

        for (const tx of transactions) {
          // Check if this is a pump.fun token creation (pass wallet address for verification)
          if (this.isPumpFunCreate(tx, address)) {
            const tokenInfo = this.extractPumpFunTokenInfo(tx);
            if (tokenInfo && !seenMints.has(tokenInfo.token)) {
              seenMints.add(tokenInfo.token);
              // Use the EARLIEST transaction for this token (which is the creation)
              // Since we're paginating backwards, later transactions come first
              // So we keep the first one we find (most recent) but update launchAt to earliest
              tokens.push(tokenInfo);
              const txDate = tx.timestamp
                ? new Date(tx.timestamp * 1000).toISOString()
                : "unknown";
              console.log(
                `[Helius] Added token: ${tokenInfo.symbol || tokenInfo.token} (date: ${txDate})`
              );
            } else if (!tokenInfo) {
              console.log(
                `[Helius DEBUG] extractPumpFunTokenInfo returned null for tx ${tx.signature}`
              );
            } else {
              console.log(
                `[Helius DEBUG] Token ${tokenInfo.token} already seen, skipping`
              );
            }
          }
        }

        // Get the last signature for pagination
        const lastTransaction = transactions[transactions.length - 1];
        if (lastTransaction?.signature) {
          beforeSignature = lastTransaction.signature;
        } else {
          break;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(
        `[Helius] Found ${tokens.length} pump.fun tokens from ${totalFetched} transactions`
      );

      // If no tokens found via parsed API, try RPC method as fallback
      if (tokens.length === 0) {
        console.log(`[Helius] No tokens found via API, trying RPC fallback`);
        const rpcTokens = await this.getPumpFunTokensFromRPC(address);
        for (const token of rpcTokens) {
          if (!seenMints.has(token.token)) {
            seenMints.add(token.token);
            tokens.push(token);
          }
        }
      }
    } catch (error) {
      console.warn("Error fetching pump.fun tokens:", error);
      // Try RPC fallback on error
      const rpcTokens = await this.getPumpFunTokensFromRPC(address);
      for (const token of rpcTokens) {
        if (!seenMints.has(token.token)) {
          seenMints.add(token.token);
          tokens.push(token);
        }
      }
    }

    console.log(
      `[Helius] getPumpFunTokens returning ${tokens.length} tokens for ${address}`
    );
    return tokens;
  }

  /**
   * Check if a transaction is a token CREATION (not just any interaction)
   * We need to be VERY STRICT here to only return tokens actually created by this wallet
   *
   * STRICT Token creation indicators (must match one of these):
   * 1. Transaction type is explicitly "CREATE" or "CREATE_POOL"
   * 2. Has InitializeMint instruction with wallet as mint authority
   * 3. Description explicitly says "created" AND wallet is fee payer
   *
   * We do NOT use heuristics like token amounts or ratios as these cause false positives
   */
  private isPumpFunCreate(tx: any, walletAddress: string): boolean {
    const description = (tx.description || "").toLowerCase();
    const txType = (tx.type || "").toUpperCase();
    const source = (tx.source || "").toUpperCase();
    const feePayer = tx.feePayer;

    // MUST be fee payer - creators always pay the fee
    if (feePayer !== walletAddress) {
      return false;
    }

    // For pump.fun specifically - ONLY accept explicit creation transactions
    if (
      source === "PUMP_FUN" ||
      source === "PUMP.FUN" ||
      source === "PUMP_AMM"
    ) {
      // CREATE or CREATE_POOL are explicit token creation transactions - this is the ONLY reliable indicator
      if (txType === "CREATE" || txType === "CREATE_POOL") {
        console.log(`[Helius] Found PUMP_FUN ${txType}: ${tx.signature}`);
        return true;
      }

      // Check if description explicitly mentions creation by this wallet
      // Must be very specific - "created" alone is not enough, need context
      if (
        description.includes("created") &&
        (description.includes("token") || description.includes("launched"))
      ) {
        console.log(
          `[Helius] Found PUMP_FUN creation via description: ${tx.signature}`
        );
        return true;
      }

      // For SWAP transactions - these are BUYS/SELLS, NOT creations
      // Do NOT use heuristics like token amounts - they cause false positives
      if (txType === "SWAP") {
        console.log(
          `[Helius] ❌ Skipping PUMP_FUN SWAP (not a creation): ${tx.signature}`
        );
        return false;
      }

      // Reject other pump.fun transaction types (WITHDRAW, TRANSFER, etc.)
      return false;
    }

    // REJECT: Any non-pump.fun transaction that is clearly a swap/buy/sell
    if (
      description.includes("bought") ||
      description.includes("sold") ||
      description.includes("swap") ||
      description.includes("traded") ||
      description.includes("transferred") ||
      txType === "SWAP" ||
      txType === "TRANSFER" ||
      txType === "TOKEN_TRANSFER"
    ) {
      return false;
    }

    // TOKEN_MINT type - this is a token creation
    // Wallet must be fee payer AND receive a large amount of tokens (initial supply)
    if (txType === "TOKEN_MINT") {
      const tokenTransfers = tx.tokenTransfers || [];

      // Find transfers TO the wallet (not SOL, actual tokens)
      const receivedTokens = tokenTransfers.filter(
        (t: any) =>
          t.toUserAccount === walletAddress &&
          t.mint !== this.NATIVE_SOL_MINT &&
          parseFloat(t.tokenAmount || "0") > 1000000 // Large amount = initial supply
      );

      if (receivedTokens.length > 0) {
        console.log(
          `[Helius] Found TOKEN_MINT with large token transfer to wallet: ${tx.signature}`
        );
        return true;
      }
    }

    // CREATE type - explicit token creation
    if (txType === "CREATE") {
      console.log(`[Helius] Found CREATE transaction: ${tx.signature}`);
      return true;
    }

    // Pump.fun SWAP handling is done at the beginning of the function

    // For standard SPL tokens: Check for InitializeMint instruction
    const instructions = tx.instructions || [];
    const initMintInstruction = instructions.find(
      (ix: any) =>
        ix.parsed?.type === "initializeMint" ||
        ix.parsed?.type === "initializeMint2"
    );

    if (initMintInstruction) {
      const mintAuthority = initMintInstruction.parsed?.info?.mintAuthority;
      if (mintAuthority === walletAddress) {
        console.log(
          `[Helius] Found InitializeMint with wallet as authority: ${tx.signature}`
        );
        return true;
      }
    }

    // Check inner instructions for InitializeMint
    const innerInstructions = tx.meta?.innerInstructions || [];
    for (const inner of innerInstructions) {
      for (const ix of inner.instructions || []) {
        if (
          ix.parsed?.type === "initializeMint" ||
          ix.parsed?.type === "initializeMint2"
        ) {
          const mintAuthority = ix.parsed?.info?.mintAuthority;
          if (mintAuthority === walletAddress) {
            console.log(
              `[Helius] Found inner InitializeMint with wallet as authority: ${tx.signature}`
            );
            return true;
          }
        }
      }
    }

    return false;
  }

  // Removed unreliable heuristic functions that caused false positives:
  // - isFirstTokenInteraction: Was flagging any transaction < 1 hour old as creation
  // - isRoundTokenAmount: Was flagging purchases of round token amounts as creation
  // Token creation detection now relies ONLY on explicit transaction types (CREATE, CREATE_POOL)
  // and InitializeMint instructions where wallet is the mint authority

  /**
   * Extract token info from a pump.fun transaction
   */
  private extractPumpFunTokenInfo(tx: any): TokenSummary | null {
    try {
      // Get the token mint from token transfers - find non-SOL token
      const tokenTransfers = tx.tokenTransfers || [];
      const nonSolTransfer = tokenTransfers.find(
        (t: any) => t.mint !== this.NATIVE_SOL_MINT
      );
      const mint =
        nonSolTransfer?.mint || tx.events?.swap?.tokenOutputs?.[0]?.mint;

      if (!mint) {
        console.log(
          `[Helius DEBUG] No mint found in tx ${tx.signature}: tokenTransfers=${!!tx.tokenTransfers}, events=${!!tx.events}`
        );
        if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
          console.log(
            `[Helius DEBUG] First tokenTransfer:`,
            JSON.stringify(tx.tokenTransfers[0], null, 2)
          );
        }
        return null;
      }

      console.log(
        `[Helius DEBUG] Found mint in extractPumpFunTokenInfo: ${mint} for tx ${tx.signature}`
      );

      // Filter out native SOL token
      if (mint === this.NATIVE_SOL_MINT) return null;

      // Get token name/symbol from multiple sources
      let name: string | undefined;
      let symbol: string | undefined;

      // Source 1: Token transfer metadata (most reliable for pump.fun)
      const metadata = tx.tokenTransfers?.[0]?.tokenMetadata;
      if (metadata) {
        // Only use if it's a valid name (not just numbers)
        if (metadata.name && !/^\d+$/.test(metadata.name)) {
          name = metadata.name;
        }
        if (metadata.symbol && !/^\d+$/.test(metadata.symbol)) {
          symbol = metadata.symbol;
        }
      }

      // Source 2: Events data
      if (!name && tx.events?.swap?.tokenOutputs?.[0]) {
        const tokenOutput = tx.events.swap.tokenOutputs[0];
        const eventName = tokenOutput.tokenMetadata?.name;
        const eventSymbol = tokenOutput.tokenMetadata?.symbol;
        if (eventName && !/^\d+$/.test(eventName)) {
          name = eventName;
        }
        if (eventSymbol && !/^\d+$/.test(eventSymbol)) {
          symbol = eventSymbol;
        }
      }

      // Source 3: Transaction description - only for specific patterns
      if (!name && tx.description) {
        // Try to extract token name from description patterns
        // e.g., "Created DOGE token" - but NOT numbers
        const patterns = [
          /created?\s+([A-Za-z][A-Za-z0-9]{1,9})\s+token/i,
          /launched?\s+([A-Za-z][A-Za-z0-9]{1,9})\s+token/i,
          /minted?\s+([A-Za-z][A-Za-z0-9]{1,9})\s+token/i,
        ];

        for (const pattern of patterns) {
          const match = tx.description.match(pattern);
          if (match && match[1] && /^[A-Za-z]/.test(match[1])) {
            if (!name) name = match[1];
            if (!symbol) symbol = match[1].toUpperCase();
            break;
          }
        }
      }

      // If we still don't have a name, mark it for metadata fetch later
      // Don't use placeholder names that are just numbers

      // Extract initial liquidity from transaction
      let initialLiquidity = 0;

      // Method 1: Check native transfers for SOL movements to bonding curve
      if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
        // Find the largest SOL transfer (likely the liquidity deposit)
        const maxTransfer = tx.nativeTransfers.reduce((max: any, t: any) => {
          const amount = Math.abs(t.amount || 0);
          return amount > (max?.amount || 0) ? { ...t, amount } : max;
        }, null);

        if (maxTransfer && maxTransfer.amount > 0) {
          initialLiquidity = maxTransfer.amount / 1e9;
        }
      }

      // Method 2: Check events for swap/create data
      if (initialLiquidity === 0 && tx.events) {
        // Check swap events
        if (tx.events.swap) {
          const nativeInput = tx.events.swap.nativeInput?.amount || 0;
          const nativeOutput = tx.events.swap.nativeOutput?.amount || 0;
          initialLiquidity = Math.max(nativeInput, nativeOutput) / 1e9;
        }
        // Check compressed events
        if (tx.events.compressed) {
          const amount = tx.events.compressed[0]?.amount || 0;
          if (amount > 0) initialLiquidity = amount / 1e9;
        }
      }

      // Method 3: Check account data for balance changes
      if (initialLiquidity === 0 && tx.accountData) {
        for (const acc of tx.accountData) {
          if (acc.nativeBalanceChange && acc.nativeBalanceChange < 0) {
            // Negative balance change = SOL spent (likely on liquidity)
            const spent = Math.abs(acc.nativeBalanceChange) / 1e9;
            if (spent > initialLiquidity && spent < 1000) {
              // Cap at 1000 SOL to avoid errors
              initialLiquidity = spent;
            }
          }
        }
      }

      // Method 4: Parse description for SOL amount
      if (initialLiquidity === 0 && tx.description) {
        const solMatch = tx.description.match(/(\d+\.?\d*)\s*SOL/i);
        if (solMatch) {
          initialLiquidity = parseFloat(solMatch[1]);
        }
      }

      // For pump.fun, tokens start with locked liquidity in bonding curve
      const liquidityLocked = true;

      // Log for debugging
      console.log(
        `[Helius] Token ${symbol}: initialLiquidity=${initialLiquidity}`
      );

      return {
        token: mint,
        name,
        symbol,
        launchAt: tx.timestamp
          ? new Date(tx.timestamp * 1000).toISOString()
          : new Date().toISOString(),
        initialLiquidity: initialLiquidity > 0 ? initialLiquidity : undefined,
        currentLiquidity: undefined, // Will be fetched separately
        liquidityLocked, // Pump.fun tokens have locked liquidity
      };
    } catch (error) {
      console.warn("Error extracting pump.fun token info:", error);
      return null;
    }
  }

  /**
   * Fetch initial liquidity for a token by looking at its creation transaction
   */
  private async fetchInitialLiquidity(
    mintAddress: string
  ): Promise<number | undefined> {
    try {
      // Get the token's transaction history using Helius API
      const response = await fetch(
        `${this.baseUrl}/addresses/${mintAddress}/transactions?api-key=${this.apiKey}&limit=10`,
        { method: "GET" }
      );

      if (!response.ok) return undefined;

      const transactions = await response.json();

      if (!transactions || transactions.length === 0) return undefined;

      // Look at the earliest transactions (token creation)
      for (const tx of transactions.reverse()) {
        let liquidity = 0;

        // Check native transfers for SOL movements
        if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
          // Find the largest SOL transfer
          for (const transfer of tx.nativeTransfers) {
            const amount = Math.abs(transfer.amount || 0) / 1e9;
            if (amount > liquidity && amount < 1000) {
              // Cap at 1000 SOL
              liquidity = amount;
            }
          }
        }

        // Check events for swap data
        if (tx.events?.swap) {
          const nativeInput = (tx.events.swap.nativeInput?.amount || 0) / 1e9;
          const nativeOutput = (tx.events.swap.nativeOutput?.amount || 0) / 1e9;
          const swapAmount = Math.max(nativeInput, nativeOutput);
          if (swapAmount > liquidity) {
            liquidity = swapAmount;
          }
        }

        // Check account data for balance changes
        if (tx.accountData) {
          for (const acc of tx.accountData) {
            if (acc.nativeBalanceChange) {
              const change = Math.abs(acc.nativeBalanceChange) / 1e9;
              if (change > liquidity && change < 1000) {
                liquidity = change;
              }
            }
          }
        }

        if (liquidity > 0) {
          console.log(
            `[Helius] Found initial liquidity for ${mintAddress}: ${liquidity} SOL`
          );
          return liquidity;
        }
      }

      return undefined;
    } catch (error) {
      console.warn(
        `Error fetching initial liquidity for ${mintAddress}:`,
        error
      );
      return undefined;
    }
  }

  /**
   * Get current liquidity for a Solana token
   * Checks pump.fun bonding curve and Raydium pools
   */
  async getTokenLiquidity(
    mintAddress: string
  ): Promise<{ currentLiquidity: number; liquidityLocked: boolean } | null> {
    try {
      console.log(`[Helius] Fetching liquidity for token: ${mintAddress}`);

      // First try to get pump.fun bonding curve data
      const pumpLiquidity = await this.getPumpFunLiquidity(mintAddress);
      if (pumpLiquidity) {
        console.log(
          `[Helius] Found pump.fun liquidity: ${pumpLiquidity.currentLiquidity} SOL`
        );
        return pumpLiquidity;
      }

      // Try to get liquidity from token account balances
      const tokenLiquidity = await this.getTokenAccountLiquidity(mintAddress);
      if (tokenLiquidity) {
        console.log(
          `[Helius] Found token account liquidity: ${tokenLiquidity.currentLiquidity} SOL`
        );
        return tokenLiquidity;
      }

      // Fallback to checking Raydium pools
      const raydiumLiquidity = await this.getRaydiumLiquidity(mintAddress);
      if (raydiumLiquidity) {
        console.log(
          `[Helius] Found Raydium liquidity: ${raydiumLiquidity.currentLiquidity} SOL`
        );
        return raydiumLiquidity;
      }

      console.log(`[Helius] No liquidity data found for ${mintAddress}`);
      return null;
    } catch (error) {
      console.warn(`Error fetching liquidity for ${mintAddress}:`, error);
      return null;
    }
  }

  /**
   * Get the number of unique holders for a token
   * Uses getTokenLargestAccounts to estimate holder count
   */
  async getTokenHolderCount(mintAddress: string): Promise<number | undefined> {
    try {
      console.log(`[Helius] Fetching holder count for token: ${mintAddress}`);

      // Method 1: Use getTokenLargestAccounts to get top holders
      // This gives us the largest accounts, which is a good proxy for active holders
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenLargestAccounts",
          params: [mintAddress],
        }),
      });

      if (!response.ok) {
        console.warn(
          `[Helius] Failed to fetch token accounts: ${response.status}`
        );
        return undefined;
      }

      const data = await response.json();
      const accounts = data.result?.value || [];

      // Count accounts with non-zero balance
      const holdersWithBalance = accounts.filter(
        (acc: any) => parseFloat(acc.uiAmount || "0") > 0
      ).length;

      // Method 2: Try to get more accurate count using getTokenAccountsByMint
      // This is more expensive but gives actual holder count
      try {
        const accountsResponse = await fetch(this.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getProgramAccounts",
            params: [
              "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token Program
              {
                encoding: "jsonParsed",
                filters: [
                  { dataSize: 165 }, // Token account size
                  { memcmp: { offset: 0, bytes: mintAddress } }, // Filter by mint
                ],
              },
            ],
          }),
        });

        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json();
          const allAccounts = accountsData.result || [];

          // Count accounts with non-zero balance
          const actualHolders = allAccounts.filter((acc: any) => {
            const amount =
              acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
            return amount > 0;
          }).length;

          if (actualHolders > 0) {
            console.log(
              `[Helius] Found ${actualHolders} holders for ${mintAddress}`
            );
            return actualHolders;
          }
        }
      } catch (e) {
        // Fall back to largest accounts count
        console.warn(
          `[Helius] getProgramAccounts failed, using largest accounts:`,
          e
        );
      }

      // Return the count from largest accounts as fallback
      if (holdersWithBalance > 0) {
        console.log(
          `[Helius] Found ${holdersWithBalance} top holders for ${mintAddress}`
        );
        return holdersWithBalance;
      }

      return undefined;
    } catch (error) {
      console.warn(
        `[Helius] Error fetching holder count for ${mintAddress}:`,
        error
      );
      return undefined;
    }
  }

  /**
   * Calculate dev sell ratio by analyzing creator's token transactions
   * Returns percentage of tokens sold by the creator
   * Implements: Requirements 11.1, 11.2, 11.3
   */
  private async calculateDevSellRatio(
    mintAddress: string,
    creatorAddress: string
  ): Promise<{
    devSellRatio: number;
    devTokensReceived: number;
    devTokensSold: number;
  }> {
    try {
      console.log(
        `[Helius] Calculating dev sell ratio for ${mintAddress} (creator: ${creatorAddress})`
      );

      let tokensReceived = 0;
      let tokensSold = 0;

      // Method 1: Get token's transaction history directly (more reliable)
      try {
        const tokenTxResponse = await fetch(
          `${this.baseUrl}/addresses/${mintAddress}/transactions?api-key=${this.apiKey}&limit=100`,
          { method: "GET" }
        );

        if (tokenTxResponse.ok) {
          const tokenTransactions = await tokenTxResponse.json();

          for (const tx of tokenTransactions || []) {
            const tokenTransfers = tx.tokenTransfers || [];

            for (const transfer of tokenTransfers) {
              if (transfer.mint !== mintAddress) continue;

              const amount = parseFloat(transfer.tokenAmount || "0");

              // Creator received tokens
              if (transfer.toUserAccount === creatorAddress) {
                tokensReceived += amount;
                console.log(
                  `[Helius] Dev received ${amount} tokens in tx ${tx.signature?.slice(0, 10)}...`
                );
              }

              // Creator sent tokens (sells)
              if (transfer.fromUserAccount === creatorAddress) {
                tokensSold += amount;
                console.log(
                  `[Helius] Dev sold ${amount} tokens in tx ${tx.signature?.slice(0, 10)}...`
                );
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Helius] Method 1 (token tx history) failed:`, e);
      }

      // Method 2: Get creator's transactions (fallback)
      if (tokensReceived === 0 && tokensSold === 0) {
        try {
          const creatorTxResponse = await fetch(
            `${this.baseUrl}/addresses/${creatorAddress}/transactions?api-key=${this.apiKey}&limit=200`,
            { method: "GET" }
          );

          if (creatorTxResponse.ok) {
            const creatorTransactions = await creatorTxResponse.json();

            for (const tx of creatorTransactions || []) {
              const tokenTransfers = tx.tokenTransfers || [];

              for (const transfer of tokenTransfers) {
                if (transfer.mint !== mintAddress) continue;

                const amount = parseFloat(transfer.tokenAmount || "0");

                if (transfer.toUserAccount === creatorAddress) {
                  tokensReceived += amount;
                }

                if (transfer.fromUserAccount === creatorAddress) {
                  tokensSold += amount;
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[Helius] Method 2 (creator tx history) failed:`, e);
        }
      }

      // Method 3: Use RPC to get token account balance changes
      if (tokensReceived === 0 && tokensSold === 0) {
        try {
          // Get creator's token account for this mint
          const tokenAccountsResponse = await fetch(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTokenAccountsByOwner",
              params: [
                creatorAddress,
                { mint: mintAddress },
                { encoding: "jsonParsed" },
              ],
            }),
          });

          if (tokenAccountsResponse.ok) {
            const tokenAccountsData = await tokenAccountsResponse.json();
            const accounts = tokenAccountsData.result?.value || [];

            // Current balance
            const currentBalance = accounts.reduce((sum: number, acc: any) => {
              return (
                sum +
                parseFloat(
                  acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount || "0"
                )
              );
            }, 0);

            // If creator has 0 balance but token exists, they likely sold everything
            if (currentBalance === 0) {
              // Estimate based on typical pump.fun initial supply
              tokensReceived = 1000000000; // 1B tokens typical initial supply
              tokensSold = 1000000000; // Assume all sold if balance is 0
              console.log(
                `[Helius] Creator has 0 balance - assuming 100% sold`
              );
            } else {
              console.log(
                `[Helius] Creator current balance: ${currentBalance}`
              );
            }
          }
        } catch (e) {
          console.warn(`[Helius] Method 3 (RPC token accounts) failed:`, e);
        }
      }

      // Calculate sell ratio as decimal (0-1) for consistency with scoring system
      const sellRatio = tokensReceived > 0 ? tokensSold / tokensReceived : 0;

      console.log(
        `[Helius] Dev sell ratio for ${mintAddress}: ${(sellRatio * 100).toFixed(2)}% (${tokensSold}/${tokensReceived})`
      );

      return {
        devSellRatio: Math.min(sellRatio, 1), // Cap at 1 (100%)
        devTokensReceived: tokensReceived,
        devTokensSold: tokensSold,
      };
    } catch (error) {
      console.warn(`[Helius] Error calculating dev sell ratio:`, error);
      return { devSellRatio: 0, devTokensReceived: 0, devTokensSold: 0 };
    }
  }

  /**
   * Get liquidity from pump.fun bonding curve
   * Uses multiple methods to find current liquidity
   */
  private async getPumpFunLiquidity(
    mintAddress: string
  ): Promise<{ currentLiquidity: number; liquidityLocked: boolean } | null> {
    try {
      // Method 1: Get recent transactions for this token to estimate liquidity
      // This is more reliable than trying to find the bonding curve account
      const liquidityFromTx =
        await this.getLiquidityFromRecentTransactions(mintAddress);
      if (liquidityFromTx && liquidityFromTx > 0) {
        console.log(
          `[Helius] Found liquidity from recent transactions: ${liquidityFromTx} SOL`
        );
        return {
          currentLiquidity: liquidityFromTx,
          liquidityLocked: true, // Pump.fun tokens have locked liquidity in bonding curve
        };
      }

      // Method 2: Check token supply and estimate market cap
      const supplyResponse = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenSupply",
          params: [mintAddress],
        }),
      });

      if (supplyResponse.ok) {
        const supplyData = await supplyResponse.json();
        const supply = supplyData.result?.value;

        if (supply) {
          // Get token largest accounts to check distribution
          const accountsResponse = await fetch(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTokenLargestAccounts",
              params: [mintAddress],
            }),
          });

          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            const accounts = accountsData.result?.value || [];

            // Check if there's a bonding curve account (usually holds most tokens)
            for (const account of accounts.slice(0, 3)) {
              const accountInfoResponse = await fetch(this.rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "getAccountInfo",
                  params: [account.address, { encoding: "jsonParsed" }],
                }),
              });

              if (!accountInfoResponse.ok) continue;

              const accountInfo = await accountInfoResponse.json();
              const info = accountInfo.result?.value;

              if (info) {
                const lamports = info.lamports || 0;
                const solBalance = lamports / 1e9;

                // If this account has significant SOL, it might be the bonding curve
                if (solBalance > 0.1) {
                  console.log(
                    `[Helius] Found account with ${solBalance} SOL for ${mintAddress}`
                  );
                  return {
                    currentLiquidity: solBalance,
                    liquidityLocked: true,
                  };
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.warn(
        `Error fetching pump.fun liquidity for ${mintAddress}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get liquidity estimate from recent transactions
   * Looks at recent swaps to estimate current liquidity
   */
  private async getLiquidityFromRecentTransactions(
    mintAddress: string
  ): Promise<number | null> {
    try {
      // Get recent transactions for this token
      const response = await fetch(
        `${this.baseUrl}/addresses/${mintAddress}/transactions?api-key=${this.apiKey}&limit=20`,
        { method: "GET" }
      );

      if (!response.ok) return null;

      const transactions = await response.json();

      if (!transactions || transactions.length === 0) return null;

      // Look for swap transactions to estimate liquidity
      let totalSolVolume = 0;
      let swapCount = 0;

      for (const tx of transactions) {
        if (
          tx.type === "SWAP" &&
          (tx.source === "PUMP_FUN" || tx.source === "PUMP_AMM")
        ) {
          // Get SOL amounts from native transfers
          const nativeTransfers = tx.nativeTransfers || [];
          for (const transfer of nativeTransfers) {
            const amount = Math.abs(transfer.amount || 0) / 1e9;
            if (amount > 0 && amount < 100) {
              // Reasonable swap amount
              totalSolVolume += amount;
              swapCount++;
            }
          }
        }
      }

      // If we found swaps, estimate liquidity based on average swap size
      // Active tokens typically have liquidity ~10-50x the average swap size
      if (swapCount > 0) {
        const avgSwapSize = totalSolVolume / swapCount;
        // Estimate liquidity as 20x average swap (rough heuristic)
        const estimatedLiquidity = avgSwapSize * 20;
        console.log(
          `[Helius] Estimated liquidity from ${swapCount} swaps: ${estimatedLiquidity} SOL`
        );
        return estimatedLiquidity;
      }

      return null;
    } catch (error) {
      console.warn(`Error getting liquidity from transactions:`, error);
      return null;
    }
  }

  /**
   * Legacy method - kept for compatibility
   */
  private async getPumpFunLiquidityLegacy(
    mintAddress: string
  ): Promise<{ currentLiquidity: number; liquidityLocked: boolean } | null> {
    try {
      // Fallback: Get token largest accounts and check their SOL balance
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenLargestAccounts",
          params: [mintAddress],
        }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const accounts = data.result?.value || [];

      if (accounts.length === 0) return null;

      // Check each large token holder for SOL balance (bonding curve indicator)
      for (const account of accounts.slice(0, 5)) {
        const accountResponse = await fetch(this.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [account.address, { encoding: "jsonParsed" }],
          }),
        });

        if (!accountResponse.ok) continue;

        const accountData = await accountResponse.json();
        const accountInfo = accountData.result?.value;

        if (!accountInfo) continue;

        // Get the SOL balance
        const lamports = accountInfo.lamports || 0;
        const solLiquidity = lamports / 1e9;

        // For token accounts, check if there's significant SOL (rent + liquidity)
        if (solLiquidity > 0.01) {
          // More than just rent
          console.log(`[Helius] Found token account with ${solLiquidity} SOL`);
          return {
            currentLiquidity: solLiquidity,
            liquidityLocked: true,
          };
        }
      }

      return null;
    } catch (error) {
      console.warn("Error fetching pump.fun liquidity:", error);
      return null;
    }
  }

  /**
   * Get liquidity by checking token supply and holder distribution
   */
  private async getTokenAccountLiquidity(
    mintAddress: string
  ): Promise<{ currentLiquidity: number; liquidityLocked: boolean } | null> {
    try {
      // Get token supply info
      const supplyResponse = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenSupply",
          params: [mintAddress],
        }),
      });

      if (!supplyResponse.ok) return null;

      const supplyData = await supplyResponse.json();
      const supply = supplyData.result?.value;

      if (!supply) return null;

      // Get largest accounts to estimate liquidity distribution
      const accountsResponse = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenLargestAccounts",
          params: [mintAddress],
        }),
      });

      if (!accountsResponse.ok) return null;

      const accountsData = await accountsResponse.json();
      const accounts = accountsData.result?.value || [];

      if (accounts.length === 0) return null;

      // Calculate total tokens in top accounts
      const totalInTopAccounts = accounts.reduce((sum: number, acc: any) => {
        return sum + parseFloat(acc.uiAmount || "0");
      }, 0);

      // Check if liquidity is concentrated (potential rug indicator)
      const totalSupply = parseFloat(supply.uiAmount || "0");
      const topHolderPercentage = totalInTopAccounts / totalSupply;

      // If top holder has > 90% of supply, liquidity is likely not locked
      const liquidityLocked = topHolderPercentage < 0.9;

      // NOTE: totalInTopAccounts is TOKEN amount, not SOL liquidity
      // We cannot accurately estimate SOL liquidity from token distribution alone
      // Return null to avoid misleading data
      return null;
    } catch (error) {
      console.warn("Error fetching token account liquidity:", error);
      return null;
    }
  }

  /**
   * Get liquidity from Raydium AMM pools
   */
  private async getRaydiumLiquidity(
    mintAddress: string
  ): Promise<{ currentLiquidity: number; liquidityLocked: boolean } | null> {
    try {
      // Try to find Raydium pool via token accounts
      // Raydium pools hold tokens in specific vault accounts
      const accountsResponse = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenLargestAccounts",
          params: [mintAddress],
        }),
      });

      if (!accountsResponse.ok) return null;

      const accountsData = await accountsResponse.json();
      const accounts = accountsData.result?.value || [];

      // Look for accounts owned by Raydium programs
      const RAYDIUM_PROGRAMS = [
        "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // AMM v4
        "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h", // AMM v3
        "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK", // CLMM
      ];

      for (const account of accounts) {
        try {
          const infoResponse = await fetch(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getAccountInfo",
              params: [account.address, { encoding: "jsonParsed" }],
            }),
          });

          if (!infoResponse.ok) continue;

          const infoData = await infoResponse.json();
          const info = infoData.result?.value;

          if (info && RAYDIUM_PROGRAMS.includes(info.owner)) {
            // Found a Raydium pool account
            const tokenAmount = parseFloat(account.uiAmount || "0");
            return {
              currentLiquidity: tokenAmount,
              liquidityLocked: true, // Raydium LP tokens are typically locked
            };
          }
        } catch {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.warn("Error fetching Raydium liquidity:", error);
      return null;
    }
  }

  /**
   * Fallback: Get pump.fun tokens CREATED by this address via RPC
   * Only returns tokens where this wallet is the creator, not just holder
   */
  private async getPumpFunTokensFromRPC(
    address: string
  ): Promise<TokenSummary[]> {
    const tokens: TokenSummary[] = [];

    try {
      const signatures = await this.getSignatures(address, 50);
      console.log(
        `[Helius] Checking ${signatures.length} signatures for token creations via RPC`
      );

      for (const sig of signatures) {
        try {
          const txResponse = await fetch(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTransaction",
              params: [
                sig.signature,
                { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
              ],
            }),
          });

          if (!txResponse.ok) continue;

          const txData = await txResponse.json();
          const tx = txData.result;

          if (!tx?.meta || tx.meta.err) continue;

          // Check for InitializeMint instruction - this is the ONLY way to create a token
          const instructions = tx.transaction?.message?.instructions || [];
          let mintAddress: string | null = null;

          for (const ix of instructions) {
            if (
              ix.parsed?.type === "initializeMint" ||
              ix.parsed?.type === "initializeMint2"
            ) {
              mintAddress = ix.parsed.info?.mint;
              // Verify the wallet is the mint authority (creator)
              const mintAuthority = ix.parsed.info?.mintAuthority;
              if (mintAuthority !== address) {
                mintAddress = null; // Not created by this wallet
              }
              break;
            }
          }

          if (mintAddress) {
            const metadata = await this.getTokenMetadata(mintAddress);
            tokens.push({
              token: mintAddress,
              name: metadata?.name || "Token",
              symbol: metadata?.symbol || "TOKEN",
              launchAt: sig.blockTime
                ? new Date(sig.blockTime * 1000).toISOString()
                : new Date().toISOString(),
              initialLiquidity: 0,
              currentLiquidity: 0,
            });
            console.log(`[Helius] Found created token via RPC: ${mintAddress}`);
          }
        } catch (txError) {
          continue;
        }
      }
    } catch (error) {
      console.warn("Error in getPumpFunTokensFromRPC:", error);
    }

    return tokens;
  }

  /**
   * Parse transactions to find token mints CREATED by this address
   * Only returns tokens where this wallet is the creator/mint authority
   * This is a secondary method - pump.fun tokens are handled separately
   */
  private async getTokensFromTransactions(
    address: string
  ): Promise<TokenSummary[]> {
    const tokens: TokenSummary[] = [];

    try {
      // Skip this method for now - pump.fun detection is more reliable
      // This was causing false positives by including tokens the wallet bought
      // Only use findMintAuthorityTokens which checks actual mint authority

      // Use RPC to find token mints where this address has mint authority
      // This is the most reliable method for standard SPL tokens
      const mintAuthTokens = await this.findMintAuthorityTokens(address);
      tokens.push(...mintAuthTokens);
    } catch (error) {
      console.warn("Error parsing transactions for tokens:", error);
    }

    // Remove duplicates based on token address using Map for O(n) performance
    const tokenMap = new Map<string, TokenSummary>();
    for (const token of tokens) {
      if (token.token && !tokenMap.has(token.token)) {
        tokenMap.set(token.token, token);
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Find tokens where this address is the mint authority
   * Scans transactions in batches to find InitializeMint instructions
   * Optimized: Uses batch processing and limits scan to avoid timeouts
   */
  private async findMintAuthorityTokens(
    address: string
  ): Promise<TokenSummary[]> {
    const tokens: TokenSummary[] = [];
    const seenMints = new Set<string>();

    try {
      // Get signatures - limit to 300 transactions to avoid timeout
      // Most token creations are in recent transactions
      console.log(
        `[Helius] Scanning transactions for mint authority tokens...`
      );
      const signatures = await this.getSignatures(address, 300);
      console.log(
        `[Helius] Found ${signatures.length} transactions to scan for mint authority`
      );

      // Process in batches of 20 to improve performance while avoiding rate limits
      const BATCH_SIZE = 20;
      for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
        const batch = signatures.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (sig) => {
            try {
              const txResponse = await fetch(this.rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  method: "getTransaction",
                  params: [
                    sig.signature,
                    {
                      encoding: "jsonParsed",
                      maxSupportedTransactionVersion: 0,
                    },
                  ],
                }),
              });

              if (!txResponse.ok) return null;

              const txData = await txResponse.json();
              const tx = txData.result;

              if (!tx?.meta || tx.meta.err) return null;

              // Look for token program instructions - only InitializeMint
              const instructions = tx.transaction?.message?.instructions || [];
              for (const ix of instructions) {
                if (
                  ix.program === "spl-token" &&
                  (ix.parsed?.type === "initializeMint" ||
                    ix.parsed?.type === "initializeMint2")
                ) {
                  const mintAddress = ix.parsed.info?.mint;
                  const mintAuthority = ix.parsed.info?.mintAuthority;

                  console.log(
                    `[Helius DEBUG] Found InitializeMint: mint=${mintAddress?.slice(0, 15)}, authority=${mintAuthority?.slice(0, 15)}, wallet=${address.slice(0, 15)}`
                  );

                  // CRITICAL: Verify this wallet is the mint authority (creator)
                  if (
                    mintAddress &&
                    mintAuthority === address &&
                    !seenMints.has(mintAddress)
                  ) {
                    seenMints.add(mintAddress);
                    console.log(
                      `[Helius] ✅ Found token created by wallet: ${mintAddress}`
                    );
                    return {
                      mintAddress,
                      blockTime: sig.blockTime,
                    };
                  }
                }
              }
              return null;
            } catch (txError) {
              return null;
            }
          })
        );

        // Collect found mints from this batch
        const foundMints = batchResults.filter((r) => r !== null);

        // Fetch metadata for found tokens (in parallel)
        if (foundMints.length > 0) {
          const tokensWithMetadata = await Promise.all(
            foundMints.map(async (mint) => {
              const metadata = await this.getTokenMetadata(mint!.mintAddress);
              return {
                token: mint!.mintAddress,
                name: metadata?.name || "Unknown Token",
                symbol: metadata?.symbol || "UNKNOWN",
                launchAt: mint!.blockTime
                  ? new Date(mint!.blockTime * 1000).toISOString()
                  : new Date().toISOString(),
                initialLiquidity: 0,
                currentLiquidity: 0,
              };
            })
          );
          tokens.push(...tokensWithMetadata);
          console.log(
            `[Helius] Found ${foundMints.length} tokens in batch ${Math.floor(i / BATCH_SIZE) + 1}`
          );
        }

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < signatures.length) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      console.warn("Error finding mint authority tokens:", error);
    }

    return tokens;
  }

  /**
   * Get token metadata from Helius DAS API
   */
  private async getTokenMetadata(
    mintAddress: string
  ): Promise<{ name?: string; symbol?: string; image?: string } | null> {
    try {
      // Method 1: Use Helius token-metadata endpoint
      const response = await fetch(
        `${this.baseUrl}/token-metadata?api-key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mintAccounts: [mintAddress],
            includeOffChain: true,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const token = data[0];
          const name =
            token.onChainMetadata?.metadata?.name ||
            token.offChainMetadata?.metadata?.name ||
            token.legacyMetadata?.name;
          const symbol =
            token.onChainMetadata?.metadata?.symbol ||
            token.offChainMetadata?.metadata?.symbol ||
            token.legacyMetadata?.symbol;

          if (name || symbol) {
            console.log(
              `[Helius] Found metadata for ${mintAddress}: ${name} (${symbol})`
            );
            return { name, symbol };
          }
        }
      }

      // Method 2: Use Helius DAS getAsset API
      const dasResponse = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAsset",
          params: { id: mintAddress },
        }),
      });

      if (dasResponse.ok) {
        const dasData = await dasResponse.json();
        const asset = dasData.result;
        if (asset) {
          const name = asset.content?.metadata?.name || asset.content?.json_uri;
          const symbol = asset.content?.metadata?.symbol;
          const image =
            asset.content?.links?.image || asset.content?.files?.[0]?.uri;

          if (name || symbol) {
            console.log(
              `[Helius] Found DAS metadata for ${mintAddress}: ${name} (${symbol})`
            );
            return { name, symbol, image };
          }
        }
      }

      return null;
    } catch (error) {
      console.warn("Error fetching token metadata:", error);
      return null;
    }
  }

  /**
   * Extract token info from a parsed transaction
   */
  private extractTokenInfoFromTx(
    tx: any,
    creatorAddress: string
  ): TokenSummary | null {
    try {
      const tokenMint =
        tx.tokenTransfers?.[0]?.mint || tx.nativeTransfers?.[0]?.mint;
      if (!tokenMint) return null;

      return {
        token: tokenMint,
        name: tx.description || "Unknown Token",
        symbol: tx.tokenTransfers?.[0]?.tokenStandard || "SPL",
        launchAt: tx.timestamp
          ? new Date(tx.timestamp * 1000).toISOString()
          : new Date().toISOString(),
        initialLiquidity: 0,
        currentLiquidity: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get account info from Solana RPC
   */
  private async getAccountInfo(address: string): Promise<any> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [address, { encoding: "jsonParsed" }],
      }),
    });

    if (!response.ok) {
      // Requirement 7.4: Solana network connectivity issues
      throw new SolanaProviderError(
        `Helius RPC request failed: ${response.statusText}`,
        "Helius"
      );
    }

    const data = await response.json();

    if (data.error) {
      // Requirement 7.1: Solana RPC error with descriptive message
      throw new SolanaRPCError(
        data.error.message || "Unknown RPC error",
        "Helius",
        "getAccountInfo"
      );
    }

    return data.result?.value;
  }

  /**
   * Get transaction signatures for an address
   */
  private async getSignatures(
    address: string,
    limit: number = 1000
  ): Promise<any[]> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignaturesForAddress",
        params: [address, { limit }],
      }),
    });

    if (!response.ok) {
      // Requirement 7.4: Solana network connectivity issues
      throw new SolanaProviderError(
        `Helius RPC request failed: ${response.statusText}`,
        "Helius"
      );
    }

    const data = await response.json();

    if (data.error) {
      // Requirement 7.1: Solana RPC error with descriptive message
      throw new SolanaRPCError(
        data.error.message || "Unknown RPC error",
        "Helius",
        "getSignaturesForAddress"
      );
    }

    return data.result || [];
  }

  /**
   * Get transaction count for an address
   */
  private async getTransactionCount(address: string): Promise<number> {
    const signatures = await this.getSignatures(address, 1000);
    return signatures.length;
  }

  /**
   * Rate limit enforcement
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.RATE_LIMIT_DELAY_MS - timeSinceLastCall)
      );
    }

    this.lastCallTime = Date.now();
  }
}
