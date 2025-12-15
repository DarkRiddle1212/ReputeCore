// Database repository functions for wallet trust scoring

import { prisma } from "./prisma";
import { TokenOutcome } from "../../types";

/**
 * Check if database connection is working
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
}

export interface TokenLaunchData {
  token: string;
  name?: string;
  symbol?: string;
  creator: string;
  blockchain?: string; // "ethereum" | "solana"
  launchAt: Date;
  outcome: TokenOutcome;
  reason?: string;
  initialLiquidity?: number;
  holdersAfter7Days?: number;
  liquidityLocked?: boolean;
  devSellRatio?: number;
  marketCap?: number;
  volume24h?: number;
}

export interface WalletAnalysisData {
  address: string;
  blockchain?: string; // "ethereum" | "solana"
  score: number;
  breakdown: any;
  notes: string[];
}

/**
 * Save or update a token launch record
 * @param data Token launch data including blockchain type
 */
export async function saveTokenLaunch(data: TokenLaunchData): Promise<void> {
  try {
    const blockchain = data.blockchain || "ethereum";
    const normalizedCreator = data.creator.toLowerCase();

    // Try to find existing record by token, creator, and blockchain
    const existing = await prisma.tokenLaunch.findFirst({
      where: {
        token: data.token,
        creator: normalizedCreator,
        blockchain,
      },
    });

    if (existing) {
      // Update existing record
      await prisma.tokenLaunch.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          symbol: data.symbol,
          launchAt: data.launchAt,
          outcome: data.outcome,
          reason: data.reason,
          initialLiquidity: data.initialLiquidity,
          holdersAfter7Days: data.holdersAfter7Days,
          liquidityLocked: data.liquidityLocked,
          devSellRatio: data.devSellRatio,
          marketCap: data.marketCap,
          volume24h: data.volume24h,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new record
      await prisma.tokenLaunch.create({
        data: {
          token: data.token,
          name: data.name,
          symbol: data.symbol,
          creator: normalizedCreator,
          blockchain,
          launchAt: data.launchAt,
          outcome: data.outcome,
          reason: data.reason,
          initialLiquidity: data.initialLiquidity,
          holdersAfter7Days: data.holdersAfter7Days,
          liquidityLocked: data.liquidityLocked,
          devSellRatio: data.devSellRatio,
          marketCap: data.marketCap,
          volume24h: data.volume24h,
        },
      });
    }
  } catch (error) {
    console.error("Failed to save token launch:", error);
    throw error;
  }
}

/**
 * Save multiple token launches asynchronously
 */
export async function saveTokenLaunches(
  tokens: TokenLaunchData[]
): Promise<void> {
  const promises = tokens.map((token) => saveTokenLaunch(token));
  await Promise.allSettled(promises);
}

/**
 * Get token launches by creator address
 * @param creator Creator wallet address
 * @param blockchain Optional blockchain filter ("ethereum" | "solana")
 * @returns Array of token launches filtered by creator and optionally by blockchain
 */
export async function getTokenLaunchesByCreator(
  creator: string,
  blockchain?: string
) {
  return prisma.tokenLaunch.findMany({
    where: {
      creator: creator.toLowerCase(),
      ...(blockchain && { blockchain }),
    },
    orderBy: { launchAt: "desc" },
  });
}

/**
 * Get token launch statistics for a creator
 * @param creator Creator wallet address
 * @param blockchain Optional blockchain filter ("ethereum" | "solana")
 * @returns Statistics about token launches (total, successful, rugs, rates)
 */
export async function getCreatorStats(creator: string, blockchain?: string) {
  const tokens = await getTokenLaunchesByCreator(creator, blockchain);

  const total = tokens.length;
  const successful = tokens.filter((t) => t.outcome === "success").length;
  const rugs = tokens.filter((t) => t.outcome === "rug").length;
  const unknown = tokens.filter((t) => t.outcome === "unknown").length;

  return {
    total,
    successful,
    rugs,
    unknown,
    successRate: total > 0 ? successful / total : 0,
    rugRate: total > 0 ? rugs / total : 0,
  };
}

/**
 * Save or update wallet analysis
 * @param data Wallet analysis data including blockchain type
 */
export async function saveWalletAnalysis(
  data: WalletAnalysisData
): Promise<void> {
  try {
    const blockchain = data.blockchain || "ethereum";
    const normalizedAddress = data.address.toLowerCase();

    const existing = await prisma.walletAnalysis.findUnique({
      where: {
        address_blockchain: {
          address: normalizedAddress,
          blockchain,
        },
      },
    });

    if (existing) {
      await prisma.walletAnalysis.update({
        where: {
          address_blockchain: {
            address: normalizedAddress,
            blockchain,
          },
        },
        data: {
          score: data.score,
          breakdown: data.breakdown,
          notes: data.notes,
          lastAnalyzed: new Date(),
          analysisCount: existing.analysisCount + 1,
        },
      });
    } else {
      await prisma.walletAnalysis.create({
        data: {
          address: normalizedAddress,
          blockchain,
          score: data.score,
          breakdown: data.breakdown,
          notes: data.notes,
        },
      });
    }
  } catch (error) {
    console.error("Failed to save wallet analysis:", error);
    throw error;
  }
}

/**
 * Get wallet analysis by address
 * @param address Wallet address
 * @param blockchain Optional blockchain type ("ethereum" | "solana"), defaults to "ethereum"
 * @returns Wallet analysis record or null if not found
 */
export async function getWalletAnalysis(address: string, blockchain?: string) {
  const blockchainType = blockchain || "ethereum";
  return prisma.walletAnalysis.findUnique({
    where: {
      address_blockchain: {
        address: address.toLowerCase(),
        blockchain: blockchainType,
      },
    },
  });
}

/**
 * Log API request
 */
export async function logApiRequest(data: {
  address?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  duration: number;
  error?: string;
}): Promise<void> {
  try {
    await prisma.apiRequest.create({
      data: {
        address: data.address?.toLowerCase(),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        success: data.success,
        duration: data.duration,
        error: data.error,
      },
    });
  } catch (error) {
    console.error("Failed to log API request:", error);
    // Don't throw - logging failures shouldn't break the API
  }
}

/**
 * Get API usage statistics
 */
export async function getApiStats(timeRange: "hour" | "day" | "week" = "day") {
  const now = new Date();
  const startTime = new Date();

  switch (timeRange) {
    case "hour":
      startTime.setHours(now.getHours() - 1);
      break;
    case "day":
      startTime.setDate(now.getDate() - 1);
      break;
    case "week":
      startTime.setDate(now.getDate() - 7);
      break;
  }

  const requests = await prisma.apiRequest.findMany({
    where: {
      timestamp: { gte: startTime },
    },
  });

  const total = requests.length;
  const successful = requests.filter((r) => r.success).length;
  const failed = requests.filter((r) => !r.success).length;
  const avgDuration =
    total > 0 ? requests.reduce((sum, r) => sum + r.duration, 0) / total : 0;

  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? successful / total : 0,
    avgDuration: Math.round(avgDuration),
    timeRange,
  };
}
