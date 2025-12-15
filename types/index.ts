import { z } from "zod";

// Re-export analytics types
export * from "./analytics";

// ============================================================================
// Core Types
// ============================================================================

export type TokenLaunchOutcome = "success" | "rug" | "unknown";
export type TokenOutcome = TokenLaunchOutcome; // Alias for backward compatibility

export interface TokenSummary {
  token: string;
  name?: string | null;
  symbol?: string | null;
  creator?: string | null;
  launchAt?: string | null;
  initialLiquidity?: number | null;
  currentLiquidity?: number | null;
  holdersAfter7Days?: number | null;
  liquidityLocked?: boolean | null;
  devSellRatio?: number | null;
  verified?: boolean;
  verificationWarning?: string;
  // Honeypot detection fields
  isHoneypot?: boolean | null;
  honeypotReason?: string | null;
  honeypotRiskLevel?: "none" | "low" | "medium" | "high" | "critical" | null;
  // Holder concentration fields
  holderConcentrationRisk?: "low" | "medium" | "high" | "critical" | null;
  top10HolderPercentage?: number | null;
}

export interface TokenVerificationResult {
  tokenAddress: string;
  isCreator: boolean;
  creationTx?: string;
  creationBlock?: number;
  creationTimestamp?: string;
  error?: string;
}

export interface TokenLaunchSummary {
  totalLaunched: number;
  succeeded: number;
  rugged: number;
  unknown: number;
  tokens: (TokenSummary & {
    outcome?: TokenLaunchOutcome;
    reason?: string | null;
  })[];
}

export interface WalletInfo {
  createdAt: string | null;
  firstTxHash?: string | null;
  txCount: number;
  age?: string | null;
}

export interface ScoringResult {
  score: number;
  breakdown: {
    walletAgeScore: number;
    activityScore: number;
    tokenOutcomeScore: number;
    heuristicsScore: number;
    final: number;
  };
  notes: string[];
  confidence?: {
    level: "HIGH" | "MEDIUM" | "MEDIUM-LOW" | "LOW";
    reason: string;
    dataCompleteness: number;
  };
}

// ============================================================================
// Provider System Types
// ============================================================================

export interface ProviderStatus {
  name: string;
  available: boolean;
  rateLimit: {
    remaining: number;
    resetTime: number;
  };
  lastError?: string;
}

export interface BlockchainProvider {
  name: string;
  priority: number;
  isAvailable(): Promise<boolean>;
  getWalletInfo(address: string): Promise<WalletInfo>;
  getTokensCreated(
    address: string,
    forceRefresh?: boolean,
    manualTokens?: string[]
  ): Promise<TokenSummary[]>;
  getRateLimit(): { remaining: number; resetTime: number };
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export interface CacheStats {
  memoryHits: number;
  memoryMisses: number;
  redisHits: number;
  redisMisses: number;
  memorySize: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  database: {
    url: string;
  };
  blockchain: {
    etherscanApiKey: string;
    alchemyApiKey?: string;
    infuraProjectId?: string;
    heliusApiKey?: string;
  };
  cache: {
    redisUrl?: string;
    defaultTtl: number;
    maxMemoryEntries: number;
  };
  rateLimit: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  features: {
    enableCaching: boolean;
    enableAnalytics: boolean;
    enableMultiChain: boolean;
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface AnalyzeRequest {
  address: string;
  forceRefresh?: boolean;
  tokens?: string[]; // Optional array of token addresses for manual analysis (Ethereum only)
}

export interface ResponseMetadata {
  analyzedAt: string;
  processingTime: number;
  dataFreshness: "cached" | "fresh";
  providersUsed: string[];
  cached?: boolean;
  blockchain?: "ethereum" | "solana";
  discoveryMode?: "manual" | "automatic";
}

export interface AnalyzeResponseData {
  score: number;
  blockchain?: "ethereum" | "solana";
  discoveryMode?: "manual" | "automatic";
  breakdown: {
    walletAgeScore: number;
    activityScore: number;
    tokenOutcomeScore: number;
    heuristicsScore: number;
    final: number;
  };
  notes: string[];
  reason: string;
  walletInfo: WalletInfo;
  tokenLaunchSummary: TokenLaunchSummary;
  metadata: ResponseMetadata;
  confidence?: {
    level: "HIGH" | "MEDIUM" | "MEDIUM-LOW" | "LOW";
    reason: string;
    dataCompleteness: number;
  };
}

// ============================================================================
// Zod Validation Schemas
// ============================================================================

// Ethereum address validation
export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format");

// Request schemas
export const AnalyzeRequestSchema = z.object({
  address: EthereumAddressSchema,
  forceRefresh: z.boolean().optional().default(false),
  tokens: z.array(z.string()).optional(), // Optional array of token addresses
});

// Token summary schema
export const TokenSummarySchema = z.object({
  token: z.string(),
  name: z.string().nullable().optional(),
  symbol: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  launchAt: z.string().nullable().optional(),
  initialLiquidity: z.number().nullable().optional(),
  currentLiquidity: z.number().nullable().optional(),
  holdersAfter7Days: z.number().nullable().optional(),
  liquidityLocked: z.boolean().nullable().optional(),
  devSellRatio: z.number().min(0).max(1).nullable().optional(),
});

// Wallet info schema
export const WalletInfoSchema = z.object({
  createdAt: z.string().nullable(),
  firstTxHash: z.string().nullable().optional(),
  txCount: z.number().int().nonnegative(),
  age: z.string().nullable().optional(),
});

// Scoring result schema
export const ScoringResultSchema = z.object({
  score: z.number().min(0).max(100),
  breakdown: z.object({
    walletAgeScore: z.number().min(0).max(100),
    activityScore: z.number().min(0).max(100),
    tokenOutcomeScore: z.number().min(0).max(100),
    heuristicsScore: z.number().min(0).max(100),
    final: z.number().min(0).max(100),
  }),
  notes: z.array(z.string()),
});

// Token launch summary schema
export const TokenLaunchSummarySchema = z.object({
  totalLaunched: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  rugged: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  tokens: z.array(
    TokenSummarySchema.extend({
      outcome: z.enum(["success", "rug", "unknown"]).optional(),
      reason: z.string().nullable().optional(),
    })
  ),
});

// Response metadata schema
export const ResponseMetadataSchema = z.object({
  analyzedAt: z.string(),
  processingTime: z.number().nonnegative(),
  dataFreshness: z.enum(["cached", "fresh"]),
  providersUsed: z.array(z.string()),
  cached: z.boolean().optional(),
  blockchain: z.enum(["ethereum", "solana"]).optional(),
});

// Complete response schema
export const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  blockchain: z.enum(["ethereum", "solana"]).optional(),
  discoveryMode: z.enum(["manual", "automatic"]).optional(),
  breakdown: z.object({
    walletAgeScore: z.number().min(0).max(100),
    activityScore: z.number().min(0).max(100),
    tokenOutcomeScore: z.number().min(0).max(100),
    heuristicsScore: z.number().min(0).max(100),
    final: z.number().min(0).max(100),
  }),
  notes: z.array(z.string()),
  reason: z.string(),
  walletInfo: WalletInfoSchema,
  tokenLaunchSummary: TokenLaunchSummarySchema,
  metadata: ResponseMetadataSchema,
  confidence: z
    .object({
      level: z.enum(["HIGH", "MEDIUM", "MEDIUM-LOW", "LOW"]),
      reason: z.string(),
      dataCompleteness: z.number(),
    })
    .optional(),
});

// Error response schema
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

// Inferred types from schemas
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export interface AnalysisHistoryItem {
  address: string;
  timestamp: number;
  result: AnalyzeResponse;
}

// ============================================================================
// Utility Types
// ============================================================================

// Weight schemes for dynamic scoring
export type WeightScheme = "no_tokens" | "limited_data" | "full_data";

export interface ScoringWeights {
  walletAge: number;
  activity: number;
  tokenOutcome: number;
  heuristics: number;
}

export const WEIGHT_SCHEMES: Record<WeightScheme, ScoringWeights> = {
  no_tokens: {
    walletAge: 0.6,
    activity: 0.4,
    tokenOutcome: 0.0,
    heuristics: 0.0,
  },
  limited_data: {
    walletAge: 0.5,
    activity: 0.3,
    tokenOutcome: 0.1,
    heuristics: 0.1,
  },
  full_data: {
    walletAge: 0.2,
    activity: 0.1,
    tokenOutcome: 0.35,
    heuristics: 0.35,
  },
};

// Confidence levels
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "MEDIUM-LOW";

// Token outcome classification result
export interface TokenOutcomeResult {
  outcome: TokenLaunchOutcome;
  reason: string;
}

// Scoring component results
export interface ScoringComponents {
  walletAge: {
    score: number;
    note: string;
  };
  activity: {
    score: number;
    note: string;
  };
  tokenOutcome: {
    score: number;
    note: string;
  };
  heuristics: {
    score: number;
    note: string;
  };
  confidence: {
    level: ConfidenceLevel;
    note: string;
  };
}
