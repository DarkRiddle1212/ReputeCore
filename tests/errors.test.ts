// Tests for error handling system

import { describe, it, expect } from "@jest/globals";
import {
  AppError,
  ValidationError,
  NetworkError,
  RateLimitError,
  APIError,
  ErrorMessages,
  ErrorCodes,
  isOperationalError,
  isValidationError,
  isNetworkError,
  isRateLimitError,
  isAPIError,
  formatErrorResponse,
  generateRequestId,
  createValidationError,
  createNetworkError,
  createRateLimitError,
  createAPIError,
} from "@/lib/errors";

describe("Error Handling System", () => {
  describe("AppError", () => {
    it("should create base error with all properties", () => {
      const requestId = "test-request-id";
      const context = { userId: "123", action: "analyze" };
      const error = new AppError(
        "Test error",
        400,
        "TEST_ERROR",
        requestId,
        context
      );

      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("TEST_ERROR");
      expect(error.requestId).toBe(requestId);
      expect(error.context).toEqual(context);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe("AppError");
    });

    it("should have default values", () => {
      const error = new AppError("Test error");

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.requestId).toBeUndefined();
      expect(error.context).toBeUndefined();
    });

    it("should serialize to JSON correctly", () => {
      const error = new AppError("Test error", 400, "TEST_ERROR", "req-123");
      const json = error.toJSON();

      expect(json).toMatchObject({
        name: "AppError",
        message: "Test error",
        statusCode: 400,
        code: "TEST_ERROR",
        requestId: "req-123",
      });
      expect(json.stack).toBeDefined();
    });
  });

  describe("ValidationError", () => {
    it("should create validation error with field", () => {
      const error = new ValidationError(
        "Invalid address",
        "address",
        "req-123"
      );

      expect(error.message).toBe("Invalid address");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.field).toBe("address");
      expect(error.requestId).toBe("req-123");
      expect(error.context?.field).toBe("address");
    });

    it("should work without field", () => {
      const error = new ValidationError("Invalid request");

      expect(error.field).toBeUndefined();
      expect(error.context?.field).toBeUndefined();
    });
  });

  describe("NetworkError", () => {
    it("should create network error with provider and original error", () => {
      const originalError = new Error("Connection refused");
      const error = new NetworkError(
        "Failed to connect",
        "etherscan",
        originalError,
        "req-123"
      );

      expect(error.message).toBe("Failed to connect");
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe("NETWORK_ERROR");
      expect(error.provider).toBe("etherscan");
      expect(error.originalError).toBe(originalError);
      expect(error.context?.provider).toBe("etherscan");
    });
  });

  describe("RateLimitError", () => {
    it("should create rate limit error with all details", () => {
      const error = new RateLimitError(
        "Rate limit exceeded",
        60, // retryAfter
        100, // limit
        0, // remaining
        1640995200, // resetTime
        "req-123"
      );

      expect(error.message).toBe("Rate limit exceeded");
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("RATE_LIMIT_ERROR");
      expect(error.retryAfter).toBe(60);
      expect(error.limit).toBe(100);
      expect(error.remaining).toBe(0);
      expect(error.resetTime).toBe(1640995200);
    });

    it("should use default message", () => {
      const error = new RateLimitError();
      expect(error.message).toBe("Rate limit exceeded");
    });
  });

  describe("APIError", () => {
    it("should create API error with provider prefix", () => {
      const originalError = new Error("Invalid API key");
      const error = new APIError(
        "Authentication failed",
        "etherscan",
        502,
        originalError,
        401,
        "req-123"
      );

      expect(error.message).toBe("etherscan: Authentication failed");
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe("API_ERROR");
      expect(error.provider).toBe("etherscan");
      expect(error.originalError).toBe(originalError);
      expect(error.apiStatusCode).toBe(401);
    });
  });

  describe("Error Type Checking", () => {
    it("should identify operational errors", () => {
      const appError = new AppError("Test");
      const regularError = new Error("Test");

      expect(isOperationalError(appError)).toBe(true);
      expect(isOperationalError(regularError)).toBe(false);
    });

    it("should identify specific error types", () => {
      const validationError = new ValidationError("Invalid");
      const networkError = new NetworkError("Network failed");
      const rateLimitError = new RateLimitError();
      const apiError = new APIError("API failed", "provider");
      const regularError = new Error("Regular");

      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(regularError)).toBe(false);

      expect(isNetworkError(networkError)).toBe(true);
      expect(isNetworkError(regularError)).toBe(false);

      expect(isRateLimitError(rateLimitError)).toBe(true);
      expect(isRateLimitError(regularError)).toBe(false);

      expect(isAPIError(apiError)).toBe(true);
      expect(isAPIError(regularError)).toBe(false);
    });
  });

  describe("Error Response Formatting", () => {
    it("should format AppError correctly", () => {
      const error = new ValidationError(
        "Invalid address",
        "address",
        "req-123"
      );
      const response = formatErrorResponse(error);

      expect(response).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid address",
          requestId: "req-123",
          details: { field: "address" },
        },
      });
    });

    it("should format regular Error with fallback", () => {
      const error = new Error("Unexpected error");
      const response = formatErrorResponse(error, "req-456");

      expect(response).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
          requestId: "req-456",
          details: {
            originalMessage: "Unexpected error",
          },
        },
      });
    });
  });

  describe("Request ID Generation", () => {
    it("should generate unique request IDs", () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("Error Factory Functions", () => {
    it("should create validation error", () => {
      const error = createValidationError("Invalid input", "field", "req-123");

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe("Invalid input");
      expect(error.field).toBe("field");
      expect(error.requestId).toBe("req-123");
    });

    it("should create network error", () => {
      const originalError = new Error("Connection failed");
      const error = createNetworkError("etherscan", originalError, "req-123");

      expect(error).toBeInstanceOf(NetworkError);
      expect(error.message).toBe(
        "Failed to connect to etherscan: Connection failed"
      );
      expect(error.provider).toBe("etherscan");
      expect(error.originalError).toBe(originalError);
    });

    it("should create rate limit error", () => {
      const error = createRateLimitError("etherscan", 60, "req-123");

      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe("Rate limit exceeded for etherscan");
      expect(error.retryAfter).toBe(60);
    });

    it("should create API error", () => {
      const originalError = new Error("API failed");
      const error = createAPIError(
        "etherscan",
        "Invalid response",
        400,
        originalError,
        "req-123"
      );

      expect(error).toBeInstanceOf(APIError);
      expect(error.message).toBe("etherscan: Invalid response");
      expect(error.provider).toBe("etherscan");
      expect(error.apiStatusCode).toBe(400);
      expect(error.originalError).toBe(originalError);
    });
  });

  describe("Error Messages and Codes", () => {
    it("should have all required error messages", () => {
      expect(ErrorMessages.INVALID_ADDRESS).toBeDefined();
      expect(ErrorMessages.RATE_LIMIT_EXCEEDED).toBeDefined();
      expect(ErrorMessages.NETWORK_UNAVAILABLE).toBeDefined();
      expect(ErrorMessages.INTERNAL_ERROR).toBeDefined();
    });

    it("should have all required error codes", () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBeDefined();
      expect(ErrorCodes.RATE_LIMIT_ERROR).toBeDefined();
      expect(ErrorCodes.NETWORK_ERROR).toBeDefined();
      expect(ErrorCodes.API_ERROR).toBeDefined();
      expect(ErrorCodes.INTERNAL_ERROR).toBeDefined();
    });
  });
});
