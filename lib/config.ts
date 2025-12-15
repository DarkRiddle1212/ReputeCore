// Configuration management for environment variables

import { AppConfig } from "@/types";

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value || defaultValue!;
}

function getEnvVarOptional(name: string): string | undefined {
  return process.env[name];
}

function getEnvVarNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number`);
  }
  return parsed;
}

function getEnvVarBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

export const config: AppConfig = {
  database: {
    url: getEnvVar("DATABASE_URL"),
  },
  blockchain: {
    etherscanApiKey: getEnvVar("ETHERSCAN_API_KEY"),
    alchemyApiKey: getEnvVarOptional("ALCHEMY_API_KEY"),
    infuraProjectId: getEnvVarOptional("INFURA_PROJECT_ID"),
    heliusApiKey: getEnvVarOptional("HELIUS_API_KEY"),
  },
  cache: {
    redisUrl: getEnvVarOptional("REDIS_URL"),
    defaultTtl: 300, // 5 minutes
    maxMemoryEntries: 1000,
  },
  rateLimit: {
    requestsPerMinute: getEnvVarNumber("RATE_LIMIT_REQUESTS_PER_MINUTE", 60),
    requestsPerHour: getEnvVarNumber("RATE_LIMIT_REQUESTS_PER_HOUR", 1000),
  },
  features: {
    enableCaching: getEnvVarBoolean("ENABLE_CACHING", true),
    enableAnalytics: getEnvVarBoolean("ENABLE_ANALYTICS", true),
    enableMultiChain: getEnvVarBoolean("ENABLE_MULTI_CHAIN", false),
  },
};

// Validate configuration on startup
export function validateConfig(): void {
  // Check required environment variables
  if (!config.database.url) {
    throw new Error("DATABASE_URL is required");
  }

  if (!config.blockchain.etherscanApiKey) {
    throw new Error("ETHERSCAN_API_KEY is required");
  }

  // Validate rate limits
  if (config.rateLimit.requestsPerMinute <= 0) {
    throw new Error("RATE_LIMIT_REQUESTS_PER_MINUTE must be positive");
  }

  if (config.rateLimit.requestsPerHour <= 0) {
    throw new Error("RATE_LIMIT_REQUESTS_PER_HOUR must be positive");
  }

  console.log("✅ Configuration validated successfully");
}

// Export individual config sections for convenience
export const {
  database: databaseConfig,
  blockchain: blockchainConfig,
  cache: cacheConfig,
  rateLimit: rateLimitConfig,
  features: featureConfig,
} = config;
