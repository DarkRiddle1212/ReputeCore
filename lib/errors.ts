// Professional error handling system

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly requestId?: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = "INTERNAL_ERROR",
    requestId?: string,
    context?: Record<string, any>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    this.requestId = requestId;
    this.context = context;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      requestId: this.requestId,
      context: this.context,
      stack: this.stack,
    };
  }
}

export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(message: string, field?: string, requestId?: string) {
    super(message, 400, "VALIDATION_ERROR", requestId, { field });
    this.field = field;
  }
}

export class NetworkError extends AppError {
  public readonly provider?: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    provider?: string,
    originalError?: Error,
    requestId?: string
  ) {
    super(message, 503, "NETWORK_ERROR", requestId, { provider });
    this.provider = provider;
    this.originalError = originalError;
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter?: number;
  public readonly limit?: number;
  public readonly remaining?: number;
  public readonly resetTime?: number;

  constructor(
    message: string = "Rate limit exceeded",
    retryAfter?: number,
    limit?: number,
    remaining?: number,
    resetTime?: number,
    requestId?: string
  ) {
    const details: Record<string, any> = {};
    if (typeof retryAfter === "number") {
      details.retryAfter = retryAfter;
    }
    if (typeof limit === "number") {
      details.limit = limit;
    }
    if (typeof remaining === "number") {
      details.remaining = remaining;
    }
    if (typeof resetTime === "number") {
      details.resetTime = resetTime;
    }

    super(message, 429, "RATE_LIMIT_ERROR", requestId, details);
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.resetTime = resetTime;
  }
}

export class APIError extends AppError {
  public readonly provider: string;
  public readonly originalError?: Error;
  public readonly apiStatusCode?: number;

  constructor(
    message: string,
    provider: string,
    statusCode: number = 502,
    originalError?: Error,
    apiStatusCode?: number,
    requestId?: string
  ) {
    const details: Record<string, any> = {
      provider,
    };
    if (typeof apiStatusCode === "number") {
      details.apiStatusCode = apiStatusCode;
    }

    super(
      `${provider}: ${message}`,
      statusCode,
      "API_ERROR",
      requestId,
      details
    );
    this.provider = provider;
    this.originalError = originalError;
    this.apiStatusCode = apiStatusCode;
  }
}

// Solana-specific error classes (Requirement 7.1, 7.2, 7.3)
export class SolanaValidationError extends ValidationError {
  public readonly blockchain: "solana" = "solana";

  constructor(message: string, field?: string, requestId?: string) {
    super(message, field, requestId);
    this.name = "SolanaValidationError";
  }
}

export class SolanaRPCError extends APIError {
  public readonly blockchain: "solana" = "solana";
  public readonly rpcMethod?: string;

  constructor(
    message: string,
    provider: string,
    rpcMethod?: string,
    originalError?: Error,
    apiStatusCode?: number,
    requestId?: string
  ) {
    super(message, provider, 502, originalError, apiStatusCode, requestId);
    this.name = "SolanaRPCError";
    this.rpcMethod = rpcMethod;
    if (rpcMethod && this.context) {
      this.context.rpcMethod = rpcMethod;
    }
  }
}

export class SolanaProviderError extends NetworkError {
  public readonly blockchain: "solana" = "solana";

  constructor(
    message: string,
    provider?: string,
    originalError?: Error,
    requestId?: string
  ) {
    super(message, provider, originalError, requestId);
    this.name = "SolanaProviderError";
  }
}

export const ErrorMessages = {
  // Validation errors (400)
  INVALID_ADDRESS: "Invalid Ethereum address format",
  INVALID_SOLANA_ADDRESS: "Invalid Solana address format",
  INVALID_REQUEST_BODY: "Request body is malformed or missing required fields",
  INVALID_FORCE_REFRESH: "forceRefresh must be a boolean value",
  UNSUPPORTED_BLOCKCHAIN: "Blockchain not supported",

  // Rate limit errors (429)
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later",
  PROVIDER_RATE_LIMITED: "Blockchain data provider rate limit exceeded",

  // Network errors (503)
  NETWORK_UNAVAILABLE: "Network service temporarily unavailable",
  ALL_PROVIDERS_FAILED:
    "All blockchain data providers are currently unavailable",
  PROVIDER_TIMEOUT: "Request to blockchain data provider timed out",
  SOLANA_RPC_UNAVAILABLE: "Solana RPC endpoint is currently unavailable",

  // API errors (502)
  API_TIMEOUT: "Request timeout. Please try again",
  ETHERSCAN_ERROR: "Etherscan API returned an error",
  ALCHEMY_ERROR: "Alchemy API returned an error",
  HELIUS_ERROR: "Helius API returned an error",
  SOLANA_RPC_ERROR: "Solana RPC returned an error",
  PROVIDER_INVALID_RESPONSE:
    "Blockchain provider returned invalid response format",

  // Internal errors (500)
  INTERNAL_ERROR: "An unexpected error occurred",
  DATABASE_ERROR: "Database operation failed",
  CACHE_ERROR: "Cache operation failed",
  SCORING_ERROR: "Error occurred during trust score calculation",
  INSUFFICIENT_DATA: "Insufficient data to generate trust score",
} as const;

export const ErrorCodes = {
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_ADDRESS_FORMAT: "INVALID_ADDRESS_FORMAT",
  INVALID_SOLANA_ADDRESS: "INVALID_SOLANA_ADDRESS",
  INVALID_REQUEST_FORMAT: "INVALID_REQUEST_FORMAT",
  UNSUPPORTED_BLOCKCHAIN: "UNSUPPORTED_BLOCKCHAIN",

  // Rate limiting
  RATE_LIMIT_ERROR: "RATE_LIMIT_ERROR",
  CLIENT_RATE_LIMITED: "CLIENT_RATE_LIMITED",
  PROVIDER_RATE_LIMITED: "PROVIDER_RATE_LIMITED",

  // Network
  NETWORK_ERROR: "NETWORK_ERROR",
  CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
  CONNECTION_REFUSED: "CONNECTION_REFUSED",
  SOLANA_RPC_UNAVAILABLE: "SOLANA_RPC_UNAVAILABLE",

  // API
  API_ERROR: "API_ERROR",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  INVALID_API_RESPONSE: "INVALID_API_RESPONSE",
  SOLANA_RPC_ERROR: "SOLANA_RPC_ERROR",
  HELIUS_ERROR: "HELIUS_ERROR",

  // Internal
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
  SCORING_ERROR: "SCORING_ERROR",
} as const;

// Error type checking utilities
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

export function isValidationError(error: Error): error is ValidationError {
  return error instanceof ValidationError;
}

export function isNetworkError(error: Error): error is NetworkError {
  return error instanceof NetworkError;
}

export function isRateLimitError(error: Error): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isAPIError(error: Error): error is APIError {
  return error instanceof APIError;
}

export function isSolanaValidationError(
  error: Error
): error is SolanaValidationError {
  return error instanceof SolanaValidationError;
}

export function isSolanaRPCError(error: Error): error is SolanaRPCError {
  return error instanceof SolanaRPCError;
}

export function isSolanaProviderError(
  error: Error
): error is SolanaProviderError {
  return error instanceof SolanaProviderError;
}

// Error response formatting
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, any>;
  };
}

export function formatErrorResponse(
  error: Error,
  requestId?: string
): ErrorResponse {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        requestId: error.requestId || requestId,
        details: error.context,
      },
    };
  }

  // Handle unexpected errors
  return {
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: ErrorMessages.INTERNAL_ERROR,
      requestId,
      details: {
        originalMessage: error.message,
      },
    },
  };
}

// Error logging utilities
export function logError(error: Error, context?: Record<string, any>): void {
  const logData = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
  };

  if (error instanceof AppError) {
    logData.error = {
      ...logData.error,
      ...error.toJSON(),
    };
  }

  console.error("Application Error:", JSON.stringify(logData, null, 2));
}

// Request ID generation
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Error factory functions for common scenarios
export function createValidationError(
  message: string,
  field?: string,
  requestId?: string
): ValidationError {
  return new ValidationError(message, field, requestId);
}

export function createNetworkError(
  provider: string,
  originalError?: Error,
  requestId?: string
): NetworkError {
  const message = originalError
    ? `Failed to connect to ${provider}: ${originalError.message}`
    : `Network error with ${provider}`;
  return new NetworkError(message, provider, originalError, requestId);
}

export function createRateLimitError(
  provider?: string,
  retryAfter?: number,
  requestId?: string
): RateLimitError {
  const message = provider
    ? `Rate limit exceeded for ${provider}`
    : ErrorMessages.RATE_LIMIT_EXCEEDED;
  return new RateLimitError(
    message,
    retryAfter,
    undefined,
    undefined,
    undefined,
    requestId
  );
}

export function createAPIError(
  provider: string,
  message: string,
  apiStatusCode?: number,
  originalError?: Error,
  requestId?: string
): APIError {
  return new APIError(
    message,
    provider,
    502,
    originalError,
    apiStatusCode,
    requestId
  );
}

// Solana-specific error factory functions (Requirement 7.4)
export function createSolanaValidationError(
  message: string,
  field?: string,
  requestId?: string
): SolanaValidationError {
  return new SolanaValidationError(message, field, requestId);
}

export function createSolanaRPCError(
  provider: string,
  message: string,
  rpcMethod?: string,
  originalError?: Error,
  apiStatusCode?: number,
  requestId?: string
): SolanaRPCError {
  return new SolanaRPCError(
    message,
    provider,
    rpcMethod,
    originalError,
    apiStatusCode,
    requestId
  );
}

export function createSolanaProviderError(
  provider: string,
  originalError?: Error,
  requestId?: string
): SolanaProviderError {
  const message = originalError
    ? `Failed to connect to Solana provider ${provider}: ${originalError.message}`
    : `Solana provider ${provider} error`;
  return new SolanaProviderError(message, provider, originalError, requestId);
}
