/**
 * Token Data Service
 * Fetches token transfer events and holder information via Etherscan
 *
 * Implements: Requirements 3.1, 4.1
 */

import {
  TransferEvent,
  TokenCreationInfo,
  TokenDataService as ITokenDataService,
} from "@/types/analytics";
import { AlchemyProvider } from "@/lib/providers/alchemy";

// Transfer event signature: Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Maximum blocks per request to avoid timeouts
const MAX_BLOCKS_PER_REQUEST = 10000;

// Zero address for mint detection
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface EtherscanLogParams {
  module: string;
  action: string;
  address?: string;
  topic0?: string;
  fromBlock?: string;
  toBlock?: string;
  page?: string;
  offset?: string;
  [key: string]: string | undefined;
}

interface EtherscanLogResult {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  timeStamp: string;
  transactionHash: string;
  logIndex: string;
}

export class TokenDataService implements ITokenDataService {
  private apiKey: string;
  private baseUrl = "https://api.etherscan.io/v2/api";
  private chainId = "1";
  private lastCallTime = 0;
  private readonly RATE_LIMIT_DELAY_MS = 400;
  private alchemyProvider?: AlchemyProvider;

  constructor(apiKey: string, alchemyApiKey?: string) {
    this.apiKey = apiKey;

    // Note: Alchemy's getOwnersForToken requires Growth plan ($49/mo)
    // Free tier doesn't support this method, so we use Etherscan Transfer events instead
    // Keeping alchemyProvider disabled to avoid failed API call overhead
    this.alchemyProvider = undefined;
    console.log(
      "[TokenDataService] Using Etherscan Transfer event method for holder counts"
    );
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
  private async makeRequest(params: EtherscanLogParams): Promise<any> {
    await this.respectRateLimit();

    const url = new URL(this.baseUrl);
    url.searchParams.append("chainid", this.chainId);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        url.searchParams.append(key, value);
      }
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
   * Decode address from log topic (32 bytes padded)
   */
  private decodeAddressFromTopic(topic: string): string {
    if (!topic || topic.length < 66) {
      return ZERO_ADDRESS;
    }
    return "0x" + topic.slice(-40).toLowerCase();
  }

  /**
   * Decode uint256 value from log data
   */
  private decodeValueFromData(data: string): string {
    if (!data || data === "0x") {
      return "0";
    }
    try {
      return BigInt(data).toString();
    } catch {
      return "0";
    }
  }

  /**
   * Parse a raw log into a TransferEvent
   */
  private parseTransferLog(log: EtherscanLogResult): TransferEvent {
    return {
      from: this.decodeAddressFromTopic(log.topics[1]),
      to: this.decodeAddressFromTopic(log.topics[2]),
      value: this.decodeValueFromData(log.data),
      blockNumber: parseInt(log.blockNumber, 16),
      transactionHash: log.transactionHash,
      logIndex: parseInt(log.logIndex, 16),
      timestamp: parseInt(log.timeStamp, 16) || undefined,
    };
  }

  /**
   * Get transfer events for a token with block range chunking
   * Implements: Requirement 3.1
   */
  async getTransferEvents(
    tokenAddress: string,
    fromBlock?: number,
    toBlock?: number
  ): Promise<TransferEvent[]> {
    const allTransfers: TransferEvent[] = [];
    const normalizedToken = tokenAddress.toLowerCase();

    console.log(
      `[TokenDataService] Getting transfer events for token: ${normalizedToken}`
    );

    // Get current block if toBlock not specified
    let endBlock = toBlock;
    if (!endBlock) {
      const blockResult = await this.makeRequest({
        module: "proxy",
        action: "eth_blockNumber",
      });
      endBlock = parseInt(blockResult.result, 16);
      console.log(`[TokenDataService] Current block: ${endBlock}`);
    }

    const startBlock = fromBlock || 0;
    console.log(
      `[TokenDataService] Fetching transfers from block ${startBlock} to ${endBlock}`
    );

    // Limit the number of chunks to avoid excessive API calls
    const maxChunks = 5; // Limit to 5 chunks (50,000 blocks)
    let chunksProcessed = 0;

    // Chunk requests to avoid timeouts (10,000 blocks per request)
    for (
      let currentStart = startBlock;
      currentStart <= endBlock && chunksProcessed < maxChunks;
      currentStart += MAX_BLOCKS_PER_REQUEST
    ) {
      const currentEnd = Math.min(
        currentStart + MAX_BLOCKS_PER_REQUEST - 1,
        endBlock
      );
      chunksProcessed++;

      try {
        console.log(
          `[TokenDataService] Fetching chunk ${chunksProcessed}/${maxChunks}: blocks ${currentStart}-${currentEnd}`
        );
        const result = await this.makeRequest({
          module: "logs",
          action: "getLogs",
          address: normalizedToken,
          topic0: TRANSFER_EVENT_SIGNATURE,
          fromBlock: "0x" + currentStart.toString(16),
          toBlock: "0x" + currentEnd.toString(16),
        });

        if (result.result && Array.isArray(result.result)) {
          const transfers = result.result.map((log: EtherscanLogResult) =>
            this.parseTransferLog(log)
          );
          allTransfers.push(...transfers);
          console.log(
            `[TokenDataService] Found ${transfers.length} transfers in chunk ${chunksProcessed}`
          );
        }
      } catch (error) {
        console.warn(
          `[TokenDataService] Failed to fetch transfers for blocks ${currentStart}-${currentEnd}:`,
          error
        );
        // Continue with next chunk
      }
    }

    console.log(
      `[TokenDataService] Total transfers found for ${normalizedToken}: ${allTransfers.length}`
    );
    return allTransfers;
  }

  /**
   * Calculate holder count at a specific block
   * Implements: Requirements 4.1, 4.3, 4.4
   *
   * Uses Alchemy API for current holder count (fast and accurate)
   * Falls back to Transfer event reconstruction for historical counts or if Alchemy unavailable
   */
  async getHolderCount(
    tokenAddress: string,
    atBlock?: number
  ): Promise<number> {
    // If no specific block requested and Alchemy is available, use it for current holder count
    if (!atBlock && this.alchemyProvider) {
      try {
        console.log(
          `[TokenDataService] Using Alchemy for current holder count: ${tokenAddress}`
        );
        const holderCount =
          await this.alchemyProvider.getTokenHolderCount(tokenAddress);
        console.log(
          `[TokenDataService] Alchemy returned ${holderCount} holders for ${tokenAddress}`
        );
        return holderCount;
      } catch (error) {
        console.warn(
          `[TokenDataService] Alchemy failed, falling back to Transfer events:`,
          error
        );
        // Fall through to Transfer event method
      }
    }

    // If specific block requested or Alchemy unavailable, use Transfer event reconstruction
    // This is slower but works for historical data
    console.log(
      `[TokenDataService] Using Transfer event reconstruction for holder count at block ${atBlock || "current"}`
    );

    // Get current block if not specified
    const targetBlock = atBlock || (await this.getCurrentBlock());

    // Get all transfers up to the specified block
    const transfers = await this.getTransferEvents(
      tokenAddress,
      0,
      targetBlock
    );

    // Calculate balances
    const balances = this.calculateBalances(transfers);

    // Count non-zero balances (excluding zero address)
    return this.countHolders(balances);
  }

  /**
   * Get current block number
   */
  private async getCurrentBlock(): Promise<number> {
    try {
      const result = await this.makeRequest({
        module: "proxy",
        action: "eth_blockNumber",
      });
      return parseInt(result.result, 16);
    } catch (error) {
      console.error("[TokenDataService] Failed to get current block:", error);
      return 0;
    }
  }

  /**
   * Calculate address balances from transfer events
   */
  calculateBalances(transfers: TransferEvent[]): Map<string, bigint> {
    const balances = new Map<string, bigint>();

    for (const transfer of transfers) {
      const from = transfer.from.toLowerCase();
      const to = transfer.to.toLowerCase();
      const value = BigInt(transfer.value);

      // Subtract from sender (if not zero address - mints)
      if (from !== ZERO_ADDRESS) {
        const currentFrom = balances.get(from) || BigInt(0);
        balances.set(from, currentFrom - value);
      }

      // Add to receiver (if not zero address - burns)
      if (to !== ZERO_ADDRESS) {
        const currentTo = balances.get(to) || BigInt(0);
        balances.set(to, currentTo + value);
      }
    }

    return balances;
  }

  /**
   * Count unique holders with non-zero balance
   */
  countHolders(balances: Map<string, bigint>): number {
    let count = 0;
    for (const [address, balance] of balances) {
      // Exclude zero address and addresses with zero or negative balance
      if (address !== ZERO_ADDRESS && balance > BigInt(0)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get token creation info (creator, block, timestamp)
   * Implements: Requirement 3.2
   */
  async getTokenCreationInfo(
    tokenAddress: string
  ): Promise<TokenCreationInfo | null> {
    try {
      const result = await this.makeRequest({
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: tokenAddress.toLowerCase(),
      });

      if (result.result && result.result.length > 0) {
        const creation = result.result[0];
        const txHash = creation.txHash;
        const creator = creation.contractCreator.toLowerCase();

        // Get transaction receipt for block number
        const receipt = await this.makeRequest({
          module: "proxy",
          action: "eth_getTransactionReceipt",
          txhash: txHash,
        });

        let creationBlock = 0;
        if (receipt.result && receipt.result.blockNumber) {
          creationBlock = parseInt(receipt.result.blockNumber, 16);
        }

        // Get block timestamp
        let timestamp = 0;
        if (creationBlock > 0) {
          const blockInfo = await this.makeRequest({
            module: "proxy",
            action: "eth_getBlockByNumber",
            tag: "0x" + creationBlock.toString(16),
            boolean: "false",
          });

          if (blockInfo.result && blockInfo.result.timestamp) {
            timestamp = parseInt(blockInfo.result.timestamp, 16);
          }
        }

        return {
          creator,
          creationBlock,
          creationTx: txHash,
          timestamp,
        };
      }
    } catch (error) {
      console.warn(`Failed to get creation info for ${tokenAddress}:`, error);
    }

    return null;
  }

  /**
   * Get creator's initial token balance
   * Implements: Requirement 3.2
   */
  async getCreatorInitialBalance(
    tokenAddress: string,
    creator: string
  ): Promise<string> {
    const creationInfo = await this.getTokenCreationInfo(tokenAddress);
    if (!creationInfo) {
      return "0";
    }

    // Get transfers in the creation block and a few blocks after
    // to capture initial distribution
    const transfers = await this.getTransferEvents(
      tokenAddress,
      creationInfo.creationBlock,
      creationInfo.creationBlock + 10
    );

    // Calculate creator's balance from initial transfers
    let balance = BigInt(0);
    const normalizedCreator = creator.toLowerCase();

    for (const transfer of transfers) {
      if (transfer.to.toLowerCase() === normalizedCreator) {
        balance += BigInt(transfer.value);
      }
      if (transfer.from.toLowerCase() === normalizedCreator) {
        balance -= BigInt(transfer.value);
      }
    }

    return balance.toString();
  }

  /**
   * Get block number for a specific timestamp
   * Implements: Requirement 4.2
   */
  async getBlockNumberByTimestamp(
    timestamp: number,
    closest: "before" | "after" = "before"
  ): Promise<number> {
    try {
      const result = await this.makeRequest({
        module: "block",
        action: "getblocknobytime",
        timestamp: timestamp.toString(),
        closest,
      });

      if (result.result) {
        return parseInt(result.result, 10);
      }
    } catch (error) {
      console.warn(
        `Failed to get block number for timestamp ${timestamp}:`,
        error
      );
    }

    return 0;
  }

  /**
   * Get holder count at a specific timestamp
   * Implements: Requirement 4.2
   */
  async getHolderCountAtTime(
    tokenAddress: string,
    timestamp: number
  ): Promise<number> {
    // Check if timestamp is current (within last 5 minutes)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const isCurrentTime = Math.abs(currentTimestamp - timestamp) < 300; // 5 minutes

    // If requesting current time and Alchemy available, use it
    if (isCurrentTime && this.alchemyProvider) {
      try {
        console.log(
          `[TokenDataService] Using Alchemy for current holder count (timestamp: ${timestamp})`
        );
        return await this.alchemyProvider.getTokenHolderCount(tokenAddress);
      } catch (error) {
        console.warn(
          `[TokenDataService] Alchemy failed for current time, falling back to block-based method:`,
          error
        );
      }
    }

    // For historical timestamps, use block-based method
    const blockNumber = await this.getBlockNumberByTimestamp(
      timestamp,
      "before"
    );
    if (blockNumber === 0) {
      return 0;
    }
    return this.getHolderCount(tokenAddress, blockNumber);
  }

  /**
   * Get holder count 7 days after token launch
   * Implements: Requirement 4.2
   */
  async getHolderCountAfter7Days(
    tokenAddress: string,
    launchTimestamp: number
  ): Promise<number> {
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    const targetTimestamp = launchTimestamp + sevenDaysInSeconds;

    // Check if 7 days have passed
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (targetTimestamp > currentTimestamp) {
      // Token is less than 7 days old, return current holder count
      return this.getHolderCountAtTime(tokenAddress, currentTimestamp);
    }

    return this.getHolderCountAtTime(tokenAddress, targetTimestamp);
  }
}
