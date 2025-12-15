// Property-based tests for error response structure

import { describe, it, expect } from "@jest/globals";
import * as fc from "fast-check";
import {
  AppError,
  ValidationError,
  NetworkError,
  RateLimitError,
  APIError,
  formatErrorResponse,
  ErrorResponse,
  generateRequestId,
} from "@/lib/errors";

describe("Error Response Structure Properties", () => {
  // Generator for request IDs
  const requestIdGen = fc.option(
    fc
      .string({ minLength: 10, maxLength: 50 })
      .filter((s) => s.trim().length > 0)
  );

  // Generator for HTTP status codes
  const statusCodeGen = fc.constantFrom(400, 401, 403, 404, 429, 500, 502, 503);

  // Generator for error codes
  const errorCodeGen = fc.constantFrom(
    "VALIDATION_ERROR",
    "NETWORK_ERROR",
    "RATE_LIMIT_ERROR",
    "API_ERROR",
    "INTERNAL_ERROR"
  );

  // Generator for error messages
  const messageGen = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0);

  // Generator for context objects
  const contextGen = fc.option(
    fc.record({
      field: fc.option(fc.string()),
      provider: fc.option(fc.string()),
      retryAfter: fc.option(fc.nat()),
      limit: fc.option(fc.nat()),
      remaining: fc.option(fc.nat()),
    })
  );

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should always include required fields for AppError instances", () => {
    fc.assert(
      fc.property(
        messageGen,
        statusCodeGen,
        errorCodeGen,
        requestIdGen,
        contextGen,
        (message, statusCode, code, requestId, context) => {
          const error = new AppError(
            message,
            statusCode,
            code,
            requestId || undefined,
            context || undefined
          );
          const response = formatErrorResponse(error, requestId || undefined);

          // Verify response structure
          expect(response).toHaveProperty("error");
          expect(typeof response.error).toBe("object");
          expect(response.error).not.toBeNull();

          // Verify required fields
          expect(response.error).toHaveProperty("code");
          expect(response.error).toHaveProperty("message");
          expect(typeof response.error.code).toBe("string");
          expect(typeof response.error.message).toBe("string");

          // Code and message should be non-empty
          expect(response.error.code.trim().length).toBeGreaterThan(0);
          expect(response.error.message.trim().length).toBeGreaterThan(0);

          // Should match the original error
          expect(response.error.code).toBe(code);
          expect(response.error.message).toBe(message);

          // RequestId should be present if provided
          if (requestId) {
            expect(response.error).toHaveProperty("requestId");
            expect(response.error.requestId).toBe(requestId);
          }

          // Context should be present if provided
          if (context) {
            expect(response.error).toHaveProperty("details");
            expect(response.error.details).toEqual(context);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should handle ValidationError with proper structure", () => {
    fc.assert(
      fc.property(
        messageGen,
        fc.option(fc.string()),
        requestIdGen,
        (message, field, requestId) => {
          const error = new ValidationError(
            message,
            field || undefined,
            requestId || undefined
          );
          const response = formatErrorResponse(error, requestId || undefined);

          // Basic structure
          expect(response).toHaveProperty("error");
          expect(response.error).toHaveProperty("code");
          expect(response.error).toHaveProperty("message");

          // ValidationError specific
          expect(response.error.code).toBe("VALIDATION_ERROR");
          expect(response.error.message).toBe(message);

          // Field should be in details if provided
          if (field) {
            expect(response.error).toHaveProperty("details");
            expect(response.error.details).toHaveProperty("field");
            expect(response.error.details.field).toBe(field);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should handle NetworkError with proper structure", () => {
    fc.assert(
      fc.property(
        messageGen,
        fc.option(fc.string()),
        requestIdGen,
        (message, provider, requestId) => {
          const error = new NetworkError(
            message,
            provider || undefined,
            undefined,
            requestId || undefined
          );
          const response = formatErrorResponse(error, requestId || undefined);

          // Basic structure
          expect(response).toHaveProperty("error");
          expect(response.error).toHaveProperty("code");
          expect(response.error).toHaveProperty("message");

          // NetworkError specific
          expect(response.error.code).toBe("NETWORK_ERROR");
          expect(response.error.message).toBe(message);

          // Provider should be in details if provided
          if (provider) {
            expect(response.error).toHaveProperty("details");
            expect(response.error.details).toHaveProperty("provider");
            expect(response.error.details.provider).toBe(provider);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should handle RateLimitError with proper structure", () => {
    fc.assert(
      fc.property(
        fc.option(messageGen),
        fc.option(fc.nat()),
        requestIdGen,
        (message, retryAfter, requestId) => {
          const error = new RateLimitError(
            message !== null ? message : undefined,
            retryAfter !== null ? retryAfter : undefined,
            undefined,
            undefined,
            undefined,
            requestId !== null ? requestId : undefined
          );
          const response = formatErrorResponse(
            error,
            requestId !== null ? requestId : undefined
          );

          // Basic structure
          expect(response).toHaveProperty("error");
          expect(response.error).toHaveProperty("code");
          expect(response.error).toHaveProperty("message");

          // RateLimitError specific
          expect(response.error.code).toBe("RATE_LIMIT_ERROR");
          expect(typeof response.error.message).toBe("string");
          expect(response.error.message.trim().length).toBeGreaterThan(0);

          // RetryAfter should be in details if provided
          if (retryAfter !== undefined && retryAfter !== null) {
            expect(response.error).toHaveProperty("details");
            expect(response.error.details).toHaveProperty("retryAfter");
            expect(response.error.details.retryAfter).toBe(retryAfter);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should handle APIError with proper structure", () => {
    fc.assert(
      fc.property(
        messageGen,
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.option(fc.nat()),
        requestIdGen,
        (message, provider, apiStatusCode, requestId) => {
          const error = new APIError(
            message,
            provider,
            502,
            undefined,
            apiStatusCode !== null ? apiStatusCode : undefined,
            requestId !== null ? requestId : undefined
          );
          const response = formatErrorResponse(
            error,
            requestId !== null ? requestId : undefined
          );

          // Basic structure
          expect(response).toHaveProperty("error");
          expect(response.error).toHaveProperty("code");
          expect(response.error).toHaveProperty("message");

          // APIError specific
          expect(response.error.code).toBe("API_ERROR");
          expect(response.error.message).toBe(`${provider}: ${message}`);

          // Provider should be in details
          expect(response.error).toHaveProperty("details");
          expect(response.error.details).toHaveProperty("provider");
          expect(response.error.details.provider).toBe(provider);

          // API status code should be in details if provided
          if (apiStatusCode !== undefined && apiStatusCode !== null) {
            expect(response.error.details).toHaveProperty("apiStatusCode");
            expect(response.error.details.apiStatusCode).toBe(apiStatusCode);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should handle unexpected errors with safe fallback structure", () => {
    fc.assert(
      fc.property(messageGen, requestIdGen, (message, requestId) => {
        // Create a regular Error (not AppError)
        const error = new Error(message);
        const response = formatErrorResponse(error, requestId || undefined);

        // Basic structure should still be present
        expect(response).toHaveProperty("error");
        expect(response.error).toHaveProperty("code");
        expect(response.error).toHaveProperty("message");

        // Should use fallback values
        expect(response.error.code).toBe("INTERNAL_ERROR");
        expect(response.error.message).toBe("An unexpected error occurred");

        // Should include original message in details
        expect(response.error).toHaveProperty("details");
        expect(response.error.details).toHaveProperty("originalMessage");
        expect(response.error.details.originalMessage).toBe(message);

        // RequestId should be included if provided
        if (requestId) {
          expect(response.error.requestId).toBe(requestId);
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should maintain consistent structure across all error types", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // AppError
          fc.record({
            type: fc.constant("AppError"),
            message: messageGen,
            statusCode: statusCodeGen,
            code: errorCodeGen,
            requestId: requestIdGen,
            context: contextGen,
          }),
          // ValidationError
          fc.record({
            type: fc.constant("ValidationError"),
            message: messageGen,
            field: fc.option(fc.string()),
            requestId: requestIdGen,
          }),
          // NetworkError
          fc.record({
            type: fc.constant("NetworkError"),
            message: messageGen,
            provider: fc.option(fc.string()),
            requestId: requestIdGen,
          }),
          // RateLimitError
          fc.record({
            type: fc.constant("RateLimitError"),
            message: fc.option(messageGen),
            retryAfter: fc.option(fc.nat()),
            requestId: requestIdGen,
          }),
          // APIError
          fc.record({
            type: fc.constant("APIError"),
            message: messageGen,
            provider: fc.string({ minLength: 1, maxLength: 50 }),
            apiStatusCode: fc.option(fc.nat()),
            requestId: requestIdGen,
          }),
          // Regular Error
          fc.record({
            type: fc.constant("Error"),
            message: messageGen,
            requestId: requestIdGen,
          })
        ),
        (errorSpec) => {
          let error: Error;

          switch (errorSpec.type) {
            case "AppError":
              error = new AppError(
                errorSpec.message,
                errorSpec.statusCode,
                errorSpec.code,
                errorSpec.requestId || undefined,
                errorSpec.context || undefined
              );
              break;
            case "ValidationError":
              error = new ValidationError(
                errorSpec.message,
                errorSpec.field || undefined,
                errorSpec.requestId || undefined
              );
              break;
            case "NetworkError":
              error = new NetworkError(
                errorSpec.message,
                errorSpec.provider || undefined,
                undefined,
                errorSpec.requestId || undefined
              );
              break;
            case "RateLimitError":
              error = new RateLimitError(
                errorSpec.message || undefined,
                errorSpec.retryAfter || undefined,
                undefined,
                undefined,
                undefined,
                errorSpec.requestId || undefined
              );
              break;
            case "APIError":
              error = new APIError(
                errorSpec.message,
                errorSpec.provider,
                502,
                undefined,
                errorSpec.apiStatusCode || undefined,
                errorSpec.requestId || undefined
              );
              break;
            default:
              error = new Error(errorSpec.message);
          }

          const response = formatErrorResponse(
            error,
            errorSpec.requestId || undefined
          );

          // All responses must have consistent structure
          expect(response).toHaveProperty("error");
          expect(typeof response.error).toBe("object");
          expect(response.error).not.toBeNull();

          // Required fields
          expect(response.error).toHaveProperty("code");
          expect(response.error).toHaveProperty("message");
          expect(typeof response.error.code).toBe("string");
          expect(typeof response.error.message).toBe("string");
          expect(response.error.code.trim().length).toBeGreaterThan(0);
          expect(response.error.message.trim().length).toBeGreaterThan(0);

          // Optional fields should be correct type if present
          if (response.error.requestId !== undefined) {
            expect(typeof response.error.requestId).toBe("string");
          }

          if (response.error.details !== undefined) {
            expect(typeof response.error.details).toBe("object");
            expect(response.error.details).not.toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: wallet-trust-scoring, Property 12: Error response structure
  it("should preserve error information without data loss", () => {
    fc.assert(
      fc.property(
        messageGen,
        statusCodeGen,
        errorCodeGen,
        requestIdGen,
        (message, statusCode, code, requestId) => {
          const error = new AppError(
            message,
            statusCode,
            code,
            requestId || undefined
          );
          const response = formatErrorResponse(error, requestId || undefined);

          // No information should be lost in formatting
          expect(response.error.message).toBe(message);
          expect(response.error.code).toBe(code);

          if (requestId) {
            expect(response.error.requestId).toBe(requestId);
          }

          // Response should be serializable
          expect(() => JSON.stringify(response)).not.toThrow();

          // Serialized response should be parseable
          const serialized = JSON.stringify(response);
          const parsed = JSON.parse(serialized);
          expect(parsed.error.code).toBe(code);
          expect(parsed.error.message).toBe(message);
        }
      ),
      { numRuns: 100 }
    );
  });
});
