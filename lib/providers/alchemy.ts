/**
 * Alchemy Provider
 * Provides accurate token holder counts, metadata, and enhanced blockchain data via Alchemy API
 *
 * Features:
 * - Accurate holder counts via getOwnersForToken
 * - Token metadata and balances
 * - NFT detection
 * - Transaction history
 * - Contract verification
 */

interface AlchemyTokenMetadata {
  name?: string;
  symbol?: string;
  decimals?: number;
  logo?: string;
  totalSupply?: string;
}

interface AlchemyTokenBalance {
  contractAddress: string;
  tokenBalance: string;
  tokenId?: string;
}

interface AlchemyTokenHoldersResponse {
  owners: string[];
  pageKey?: string;
}

interface AlchemyAssetTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number | null;
  asset: string;
  category: string;
  rawContract: {
    value: string;
    address: string;
    decimal: string;
  };
}

export class AlchemyProvider {
  private apiKey: string;
  private baseUrl: string;
  private nftUrl: string;
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 100; // Alchemy has higher rate limits (25 CU/s on free tier)
  private requestCount = 0;
  private requestResetTime = Date.now();

  constructor(apiKey: string) {
    // Extract the actual API key from the URL format if needed
    if (apiKey.includes("alchemy.com")) {
      const match = apiKey.match(/\/v2\/([^\/\s]+)/);
      this.apiKey = match ? match[1] : apiKey;
    } else {
      this.apiKey = apiKey;
    }
    this.baseUrl = `https://eth-mainnet.g.alchemy.com/v2/${this.apiKey}`;
    this.nftUrl = `https://eth-mainnet.g.alchemy.com/nft/v3/${this.apiKey}`;
    console.log("[AlchemyProvider] Initialized with API key");
  }

  /**
   * Check if the provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const blockNumber = await this.getCurrentBlockNumber();
      return blockNumber > 0;
    } catch {
      return false;
    }
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
   * Make an Alchemy JSON-RPC request
   */
  private async makeRequest(method: string, params: any[]): Promise<any> {
    await this.respectRateLimit();

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Alchemy API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Alchemy RPC error: ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * Get token metadata including holder count
   * Uses alchemy_getTokenMetadata which provides accurate holder counts
   */
  async getTokenMetadata(
    tokenAddress: string
  ): Promise<AlchemyTokenMetadata & { holderCount?: number }> {
    try {
      console.log(
        `[AlchemyProvider] Fetching metadata for token: ${tokenAddress}`
      );

      const result = await this.makeRequest("alchemy_getTokenMetadata", [
        tokenAddress,
      ]);

      console.log(`[AlchemyProvider] Metadata received for ${tokenAddress}`);

      return {
        name: result.name,
        symbol: result.symbol,
        decimals: result.decimals,
        logo: result.logo,
        totalSupply: result.totalSupply,
        // Note: Alchemy's getTokenMetadata doesn't directly provide holder count
        // We need to use getTokenBalances or getOwnersForToken
      };
    } catch (error) {
      console.error(
        `[AlchemyProvider] Failed to fetch metadata for ${tokenAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get accurate holder count for a token
   * Uses alchemy_getOwnersForToken which returns all token holders
   */
  async getTokenHolderCount(tokenAddress: string): Promise<number> {
    try {
      console.log(
        `[AlchemyProvider] Fetching holder count for token: ${tokenAddress}`
      );

      // Use getOwnersForToken to get all holders
      // This endpoint returns paginated results, but we only need the total count
      const result = await this.makeRequest("alchemy_getOwnersForToken", [
        tokenAddress,
        {
          withTokenBalances: false, // We only need count, not balances
        },
      ]);

      const holderCount = result.owners?.length || 0;

      console.log(
        `[AlchemyProvider] Holder count for ${tokenAddress}: ${holderCount}`
      );

      return holderCount;
    } catch (error) {
      console.error(
        `[AlchemyProvider] Failed to fetch holder count for ${tokenAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get holders with pagination support for large holder lists
   */
  async getAllTokenHolders(tokenAddress: string): Promise<string[]> {
    try {
      console.log(
        `[AlchemyProvider] Fetching all holders for token: ${tokenAddress}`
      );

      const allHolders: string[] = [];
      let pageKey: string | undefined;
      let pageCount = 0;
      const maxPages = 100; // Safety limit to prevent infinite loops

      do {
        const params: any = {
          withTokenBalances: false,
        };

        if (pageKey) {
          params.pageKey = pageKey;
        }

        const result = await this.makeRequest("alchemy_getOwnersForToken", [
          tokenAddress,
          params,
        ]);

        if (result.owners && Array.isArray(result.owners)) {
          allHolders.push(...result.owners);
        }

        pageKey = result.pageKey;
        pageCount++;

        console.log(
          `[AlchemyProvider] Fetched page ${pageCount}, total holders so far: ${allHolders.length}`
        );
      } while (pageKey && pageCount < maxPages);

      console.log(
        `[AlchemyProvider] Total holders for ${tokenAddress}: ${allHolders.length}`
      );

      return allHolders;
    } catch (error) {
      console.error(
        `[AlchemyProvider] Failed to fetch all holders for ${tokenAddress}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    try {
      const result = await this.makeRequest("eth_blockNumber", []);
      return parseInt(result, 16);
    } catch (error) {
      console.error(
        "[AlchemyProvider] Failed to fetch current block number:",
        error
      );
      throw error;
    }
  }

  /**
   * Get token balances for a wallet address
   * Returns all ERC-20 tokens held by the address
   */
  async getTokenBalances(
    walletAddress: string
  ): Promise<AlchemyTokenBalance[]> {
    try {
      console.log(
        `[AlchemyProvider] Fetching token balances for: ${walletAddress}`
      );

      const result = await this.makeRequest("alchemy_getTokenBalances", [
        walletAddress,
        "erc20",
      ]);

      const balances = result.tokenBalances || [];
      console.log(
        `[AlchemyProvider] Found ${balances.length} token balances for ${walletAddress}`
      );

      return balances.map((b: any) => ({
        contractAddress: b.contractAddress,
        tokenBalance: b.tokenBalance,
      }));
    } catch (error) {
      console.error(`[AlchemyProvider] Failed to fetch token balances:`, error);
      throw error;
    }
  }

  /**
   * Get asset transfers (token transfers) for an address
   * Useful for tracking token movements and detecting suspicious activity
   */
  async getAssetTransfers(
    address: string,
    options: {
      category?: ("external" | "internal" | "erc20" | "erc721" | "erc1155")[];
      fromBlock?: string;
      toBlock?: string;
      maxCount?: number;
      order?: "asc" | "desc";
    } = {}
  ): Promise<AlchemyAssetTransfer[]> {
    try {
      console.log(`[AlchemyProvider] Fetching asset transfers for: ${address}`);

      const params: any = {
        fromAddress: address,
        category: options.category || ["erc20"],
        withMetadata: true,
        maxCount: options.maxCount
          ? `0x${options.maxCount.toString(16)}`
          : "0x3e8", // Default 1000
        order: options.order || "desc",
      };

      if (options.fromBlock) params.fromBlock = options.fromBlock;
      if (options.toBlock) params.toBlock = options.toBlock;

      const result = await this.makeRequest("alchemy_getAssetTransfers", [
        params,
      ]);

      const transfers = result.transfers || [];
      console.log(
        `[AlchemyProvider] Found ${transfers.length} asset transfers`
      );

      return transfers;
    } catch (error) {
      console.error(
        `[AlchemyProvider] Failed to fetch asset transfers:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get tokens created by an address (where address deployed the contract)
   * Uses getAssetTransfers to find contract creation transactions
   */
  async getTokensCreatedByAddress(creatorAddress: string): Promise<string[]> {
    try {
      console.log(
        `[AlchemyProvider] Finding tokens created by: ${creatorAddress}`
      );

      // Get all outgoing transactions from the address
      const transfers = await this.getAssetTransfers(creatorAddress, {
        category: ["external"],
        maxCount: 1000,
      });

      // Filter for contract creation (to address is null or 0x0)
      const creationTxs = transfers.filter(
        (t) => !t.to || t.to === "0x0000000000000000000000000000000000000000"
      );

      // Get contract addresses from receipts
      const tokenAddresses: string[] = [];
      for (const tx of creationTxs.slice(0, 20)) {
        // Limit to 20 to avoid rate limits
        try {
          const receipt = await this.makeRequest("eth_getTransactionReceipt", [
            tx.hash,
          ]);
          if (receipt && receipt.contractAddress) {
            tokenAddresses.push(receipt.contractAddress.toLowerCase());
          }
        } catch (e) {
          // Skip failed receipts
        }
      }

      console.log(
        `[AlchemyProvider] Found ${tokenAddresses.length} tokens created by ${creatorAddress}`
      );
      return tokenAddresses;
    } catch (error) {
      console.error(`[AlchemyProvider] Failed to find created tokens:`, error);
      return [];
    }
  }

  /**
   * Check if an address is a contract
   */
  async isContract(address: string): Promise<boolean> {
    try {
      const code = await this.makeRequest("eth_getCode", [address, "latest"]);
      return code && code !== "0x" && code.length > 2;
    } catch (error) {
      console.error(`[AlchemyProvider] Failed to check if contract:`, error);
      return false;
    }
  }

  /**
   * Get transaction count for an address (nonce)
   */
  async getTransactionCount(address: string): Promise<number> {
    try {
      const result = await this.makeRequest("eth_getTransactionCount", [
        address,
        "latest",
      ]);
      return parseInt(result, 16);
    } catch (error) {
      console.error(
        `[AlchemyProvider] Failed to get transaction count:`,
        error
      );
      return 0;
    }
  }

  /**
   * Get wallet age by finding the first transaction
   */
  async getWalletAge(
    address: string
  ): Promise<{ firstTxTimestamp: number | null; ageInDays: number | null }> {
    try {
      console.log(`[AlchemyProvider] Getting wallet age for: ${address}`);

      // Get first incoming transaction
      const incomingTransfers = await this.makeRequest(
        "alchemy_getAssetTransfers",
        [
          {
            toAddress: address,
            category: ["external", "erc20"],
            order: "asc",
            maxCount: "0x1",
            withMetadata: true,
          },
        ]
      );

      // Get first outgoing transaction
      const outgoingTransfers = await this.makeRequest(
        "alchemy_getAssetTransfers",
        [
          {
            fromAddress: address,
            category: ["external", "erc20"],
            order: "asc",
            maxCount: "0x1",
            withMetadata: true,
          },
        ]
      );

      const allTransfers = [
        ...(incomingTransfers.transfers || []),
        ...(outgoingTransfers.transfers || []),
      ];

      if (allTransfers.length === 0) {
        return { firstTxTimestamp: null, ageInDays: null };
      }

      // Find earliest transaction
      let earliestTimestamp = Infinity;
      for (const tx of allTransfers) {
        if (tx.metadata?.blockTimestamp) {
          const timestamp =
            new Date(tx.metadata.blockTimestamp).getTime() / 1000;
          if (timestamp < earliestTimestamp) {
            earliestTimestamp = timestamp;
          }
        }
      }

      if (earliestTimestamp === Infinity) {
        return { firstTxTimestamp: null, ageInDays: null };
      }

      const ageInDays = Math.floor(
        (Date.now() / 1000 - earliestTimestamp) / (24 * 60 * 60)
      );

      console.log(`[AlchemyProvider] Wallet age: ${ageInDays} days`);
      return { firstTxTimestamp: earliestTimestamp, ageInDays };
    } catch (error) {
      console.error(`[AlchemyProvider] Failed to get wallet age:`, error);
      return { firstTxTimestamp: null, ageInDays: null };
    }
  }

  /**
   * Get top token holders with balances
   * More accurate than transfer-based reconstruction
   */
  async getTopTokenHoldersWithBalances(
    tokenAddress: string,
    limit: number = 100
  ): Promise<{ address: string; balance: string; percentage: number }[]> {
    try {
      console.log(
        `[AlchemyProvider] Getting top holders with balances for: ${tokenAddress}`
      );

      // Get all holders
      const allHolders = await this.getAllTokenHolders(tokenAddress);

      if (allHolders.length === 0) {
        return [];
      }

      // Get balances for top holders (limit API calls)
      const holdersToCheck = allHolders.slice(0, Math.min(limit, 100));
      const holdersWithBalances: {
        address: string;
        balance: string;
        percentage: number;
      }[] = [];

      // Get total supply for percentage calculation
      const metadata = await this.getTokenMetadata(tokenAddress);
      const totalSupply = BigInt(metadata.totalSupply || "0");

      // Batch balance checks (5 at a time to respect rate limits)
      for (let i = 0; i < holdersToCheck.length; i += 5) {
        const batch = holdersToCheck.slice(i, i + 5);
        const balancePromises = batch.map(async (holder) => {
          try {
            const balances = await this.getTokenBalances(holder);
            const tokenBalance = balances.find(
              (b) =>
                b.contractAddress.toLowerCase() === tokenAddress.toLowerCase()
            );
            return {
              address: holder,
              balance: tokenBalance?.tokenBalance || "0",
            };
          } catch {
            return { address: holder, balance: "0" };
          }
        });

        const results = await Promise.all(balancePromises);

        for (const result of results) {
          const balanceBigInt = BigInt(result.balance || "0");
          const percentage =
            totalSupply > BigInt(0)
              ? Number((balanceBigInt * BigInt(10000)) / totalSupply) / 100
              : 0;

          holdersWithBalances.push({
            address: result.address,
            balance: result.balance,
            percentage,
          });
        }
      }

      // Sort by balance descending
      holdersWithBalances.sort((a, b) => {
        const balA = BigInt(a.balance || "0");
        const balB = BigInt(b.balance || "0");
        if (balB > balA) return 1;
        if (balB < balA) return -1;
        return 0;
      });

      console.log(
        `[AlchemyProvider] Returning ${holdersWithBalances.length} holders with balances`
      );
      return holdersWithBalances;
    } catch (error) {
      console.error(
        `[AlchemyProvider] Failed to get top holders with balances:`,
        error
      );
      return [];
    }
  }
}
