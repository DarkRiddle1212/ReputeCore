// types/analytics.ts
// Core types for enhanced Etherscan analytics

// ============================================================================
// DEX Configuration Types
// ============================================================================

export type DEXVersion = "v2" | "v3";

export interface DEXConfig {
  name: string;
  version: DEXVersion;
  factoryAddress: string;
  routerAddress: string;
  initCodeHash: string;
}

export const DEX_CONFIGS: DEXConfig[] = [
  {
    name: "Uniswap V2",
    version: "v2",
    factoryAddress: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    routerAddress: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    initCodeHash:
      "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f",
  },
  {
    name: "SushiSwap",
    version: "v2",
    factoryAddress: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    routerAddress: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
    initCodeHash:
      "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303",
  },
  {
    name: "Uniswap V3",
    version: "v3",
    factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    initCodeHash:
      "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54",
  },
];

// V3 fee tiers in basis points
export const UNISWAP_V3_FEE_TIERS = [500, 3000, 10000] as const;

// ============================================================================
// Lock Contract Configuration
// ============================================================================

export interface LockContractConfig {
  name: string;
  address: string;
}

export const KNOWN_LOCK_CONTRACTS: LockContractConfig[] = [
  {
    name: "Team Finance",
    address: "0xE2fE530C047f2d85298b07D9333C05737f1435fB",
  },
  { name: "Unicrypt", address: "0xDba68f07d1b7Ca219f78ae8582C213d975c25cAf" },
  { name: "UNCX v2", address: "0x663A5C229c09b049E36dCc11a9B0d4a8Eb9db214" },
  { name: "UNCX v3", address: "0xc77aab3c6D7dAb46248F3CC3033C856171878BD5" },
  { name: "PinkLock", address: "0x71B5759d73262FBb223956913ecF4ecC51057641" },
];

// DEX Router addresses for identifying sell transactions
export const DEX_ROUTER_ADDRESSES = [
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", // Uniswap V2 Router
  "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", // SushiSwap Router
  "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Uniswap V3 Router
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Uniswap Universal Router
];

// Common token addresses
export const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
export const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
export const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EescdeCB5BE3830";

// ============================================================================
// Liquidity Pool Types
// ============================================================================

export interface LiquidityPool {
  address: string;
  dex: string;
  version: DEXVersion;
  token0: string;
  token1: string;
  createdAtBlock: number;
  createdAtTimestamp?: number;
}

export interface PoolReserves {
  reserve0: string;
  reserve1: string;
  token0: string;
  token1: string;
  blockNumber: number;
}

export interface LiquidityLockInfo {
  isLocked: boolean;
  lockContract: string | null;
  lockContractName: string | null;
  unlockTime: number | null;
  lockedAmount: string | null;
  lockedPercentage: number | null;
}

// ============================================================================
// Token Transfer Types
// ============================================================================

export interface TransferEvent {
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp?: number;
}

export interface TokenCreationInfo {
  creator: string;
  creationBlock: number;
  creationTx: string;
  timestamp: number;
}

// ============================================================================
// Enhanced Token Summary
// ============================================================================

export interface EnhancedTokenSummary {
  // Basic info
  token: string;
  name: string | null;
  symbol: string | null;
  creator: string | null;
  launchAt: string | null;

  // Enhanced metrics (now properly populated)
  initialLiquidity: number | null;
  holdersAfter7Days: number | null;
  liquidityLocked: boolean | null;
  devSellRatio: number | null;

  // Additional metadata
  liquidityLockInfo: LiquidityLockInfo | null;
  pools: LiquidityPool[];
  dataCompleteness: number;
  lastUpdated: string;
  errors: ErrorAnnotation[];
}

// ============================================================================
// Error Handling Types
// ============================================================================

export interface ErrorAnnotation {
  metric: string;
  error: string;
  timestamp: string;
  retryable: boolean;
  code?: string;
}

export interface PartialResult<T> {
  data: T;
  errors: ErrorAnnotation[];
  dataCompleteness: number;
}

// ============================================================================
// Retry Configuration
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryableErrors: string[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  retryableErrors: [
    "ETIMEDOUT",
    "ECONNRESET",
    "ENOTFOUND",
    "RATE_LIMIT_EXCEEDED",
    "ECONNREFUSED",
  ],
};

// ============================================================================
// Cache Configuration
// ============================================================================

export interface CacheTTLConfig {
  liquidity: number;
  holderCount: number;
  devSellRatio: number;
  analysis: number;
}

export const CACHE_TTL_SECONDS: CacheTTLConfig = {
  liquidity: 86400, // 24 hours
  holderCount: 3600, // 1 hour
  devSellRatio: 21600, // 6 hours
  analysis: 300, // 5 minutes (existing)
};

// ============================================================================
// Confidence Level Types
// ============================================================================

export type ConfidenceLevelType = "HIGH" | "MEDIUM" | "MEDIUM-LOW" | "LOW";

export interface ConfidenceResult {
  level: ConfidenceLevelType;
  reason: string;
  dataCompleteness: number;
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface DEXDataService {
  findLiquidityPools(tokenAddress: string): Promise<LiquidityPool[]>;
  getInitialLiquidity(
    poolAddress: string,
    creationBlock: number
  ): Promise<number>;
  getPoolReserves(poolAddress: string): Promise<PoolReserves>;
  checkLiquidityLock(poolAddress: string): Promise<LiquidityLockInfo>;
}

export interface TokenDataService {
  getTransferEvents(
    tokenAddress: string,
    fromBlock?: number,
    toBlock?: number
  ): Promise<TransferEvent[]>;
  getHolderCount(tokenAddress: string, atBlock: number): Promise<number>;
  getTokenCreationInfo(tokenAddress: string): Promise<TokenCreationInfo | null>;
  getCreatorInitialBalance(
    tokenAddress: string,
    creator: string
  ): Promise<string>;
}

export interface LiquidityCalculator {
  calculateInitialLiquidity(
    tokenAddress: string,
    pools: LiquidityPool[]
  ): Promise<number>;
  convertToUSD(
    tokenAddress: string,
    amount: string,
    atBlock: number
  ): Promise<number>;
}

export interface DevSellCalculator {
  calculateDevSellRatio(
    tokenAddress: string,
    creatorAddress: string
  ): Promise<number>;
  identifySellTransactions(
    transfers: TransferEvent[],
    creatorAddress: string
  ): TransferEvent[];
}

export interface HolderTracker {
  getHolderCountAtTime(
    tokenAddress: string,
    timestamp: number
  ): Promise<number>;
  getHolderCountAfter7Days(
    tokenAddress: string,
    launchTimestamp: number
  ): Promise<number>;
}

// ============================================================================
// Scoring Types
// ============================================================================

export interface HeuristicsResult {
  score: number;
  notes: string[];
  penaltiesApplied: number;
  bonusesApplied: number;
}

export interface EnhancedScoringWeights {
  walletAge: number;
  activity: number;
  tokenOutcome: number;
  heuristics: number;
}

export interface EnhancedScoringResult {
  score: number;
  breakdown: {
    walletAgeScore: number;
    activityScore: number;
    tokenOutcomeScore: number;
    heuristicsScore: number;
    final: number;
  };
  weights: EnhancedScoringWeights;
  notes: string[];
  confidence: ConfidenceResult;
  dataCompleteness: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate data completeness for an enhanced token summary
 */
export function calculateDataCompleteness(
  token: Partial<EnhancedTokenSummary>
): number {
  const metrics = [
    token.initialLiquidity,
    token.holdersAfter7Days,
    token.liquidityLocked,
    token.devSellRatio,
  ];

  const availableCount = metrics.filter(
    (m) => m !== null && m !== undefined
  ).length;
  return availableCount / metrics.length;
}

/**
 * Determine confidence level based on data completeness
 */
export function determineConfidenceLevel(
  completeness: number
): ConfidenceLevelType {
  if (completeness >= 0.75) return "HIGH";
  if (completeness >= 0.5) return "MEDIUM";
  if (completeness >= 0.25) return "MEDIUM-LOW";
  return "LOW";
}

/**
 * Check if an address is a known DEX router
 */
export function isDEXRouter(address: string): boolean {
  return DEX_ROUTER_ADDRESSES.some(
    (router) => router.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Check if an address is a known lock contract
 */
export function isLockContract(address: string): boolean {
  return KNOWN_LOCK_CONTRACTS.some(
    (lock) => lock.address.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Get lock contract name by address
 */
export function getLockContractName(address: string): string | null {
  const lock = KNOWN_LOCK_CONTRACTS.find(
    (l) => l.address.toLowerCase() === address.toLowerCase()
  );
  return lock?.name ?? null;
}

/**
 * Check if a token is a stablecoin
 */
export function isStablecoin(address: string): boolean {
  const stablecoins = [USDC_ADDRESS, USDT_ADDRESS, DAI_ADDRESS];
  return stablecoins.some(
    (stable) => stable.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Check if a token is WETH
 */
export function isWETH(address: string): boolean {
  return WETH_ADDRESS.toLowerCase() === address.toLowerCase();
}
