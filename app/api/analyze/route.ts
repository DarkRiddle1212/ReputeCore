// Professional API route with comprehensive error handling, caching, and monitoring

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { determineOutcome } from "@/lib/tokenHeuristics";
import { computeScore } from "@/lib/scoring";
import { providerManager } from "@/lib/providers";
import { cache, CacheKeys } from "@/lib/cache";
import { ValidationError, AppError, ErrorMessages } from "@/lib/errors";
import { processAddressInput } from "@/lib/validation";
import { validateTokenList } from "@/lib/validation/tokenValidation";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { aiSummaryService } from "@/lib/services/AISummaryService";

// Request validation schemas
const AnalyzeRequestSchema = z.object({
  address: z.string().min(3).max(100), // Increased to support Solana addresses
  forceRefresh: z.boolean().optional().default(false),
  tokens: z.array(z.string()).optional(), // Optional array of token addresses for manual analysis
});

const LegacyRequestSchema = z.object({
  signals: z
    .object({
      address: z.string().min(3).max(100), // Increased to support Solana addresses
    })
    .optional(),
});

// Response tracking for analytics
const trackRequest = async (
  address: string,
  success: boolean,
  duration: number,
  error?: string
) => {
  try {
    // TODO: Implement analytics tracking
    console.log(
      `Request: ${address}, Success: ${success}, Duration: ${duration}ms, Error: ${error || "none"}`
    );
  } catch (e) {
    console.warn("Analytics tracking failed:", e);
  }
};

import type { BlockchainType } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  let address: string | undefined;
  let blockchain: BlockchainType | undefined;

  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(req);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: ErrorMessages.RATE_LIMIT_EXCEEDED,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimitResult.retryAfter?.toString() || "60",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetTime?.toString() || "",
          },
        }
      );
    }

    // Parse and validate request
    const json = await req.json();

    // Try modern schema first
    const modernParse = AnalyzeRequestSchema.safeParse(json);
    if (modernParse.success) {
      address = modernParse.data.address;
    } else {
      // Fall back to legacy schema
      const legacyParse = LegacyRequestSchema.safeParse(json);
      if (legacyParse.success && legacyParse.data.signals?.address) {
        address = legacyParse.data.signals.address;
      }
    }

    if (!address) {
      throw new ValidationError(ErrorMessages.INVALID_ADDRESS);
    }

    // Detect blockchain and validate address
    const addressValidation = processAddressInput(address);
    if (!addressValidation.valid || !addressValidation.blockchain) {
      throw new ValidationError(
        addressValidation.error || ErrorMessages.INVALID_ADDRESS
      );
    }

    const normalizedAddress = addressValidation.address!;
    blockchain = addressValidation.blockchain!;
    const forceRefresh = modernParse.success
      ? modernParse.data.forceRefresh
      : false;
    const rawTokens = modernParse.success ? modernParse.data.tokens : undefined;

    // Blockchain-specific token handling (Requirements 1.4, 5.3)
    let validatedTokens: string[] | undefined;
    if (rawTokens && rawTokens.length > 0) {
      console.log(
        `[API] Manual tokens provided: ${rawTokens.length} tokens for ${blockchain} address`
      );

      // For Solana: ignore manual tokens, use automatic discovery (Requirement 1.4, 5.3)
      if (blockchain === "solana") {
        console.log(
          `[API] Ignoring manual tokens for Solana - automatic discovery will be used`
        );
        validatedTokens = undefined;
      } else {
        // For Ethereum: validate and use manual tokens (Requirements 1.1, 1.3, 7.1, 7.2, 8.1, 8.2)
        console.log(`[API] Validating manual tokens for Ethereum analysis`);

        const tokenValidation = validateTokenList(rawTokens);
        if (!tokenValidation.valid) {
          // Return validation errors with specific details (Requirement 8.1, 8.2)
          throw new ValidationError(
            `Invalid token addresses: ${tokenValidation.errors.join(", ")}`
          );
        }

        validatedTokens = tokenValidation.tokens;
        console.log(
          `[API] Validated ${validatedTokens.length} unique tokens for manual Ethereum analysis`
        );
      }
    }

    // Log request start (Requirement 12.1)
    logger.requestStart(normalizedAddress, blockchain, requestId);
    console.log(
      `[API] Detected blockchain: ${blockchain} for address: ${normalizedAddress}`
    );

    // Check cache first (unless force refresh)
    // Implements: Requirement 13.3 - Return cached results without new API calls
    if (!forceRefresh) {
      const cacheKey = CacheKeys.analysis(normalizedAddress, blockchain);
      console.log(
        `[CACHE] Checking cache for key: "${cacheKey}" (${blockchain} address: ${normalizedAddress})`
      );
      const cachedResult = await cache.get<Record<string, any>>(cacheKey);
      if (cachedResult) {
        console.log(
          `[CACHE] Cache HIT for ${blockchain} address: ${normalizedAddress}`
        );
        console.log(`[CACHE] Cached data:`, {
          score: cachedResult.score,
          blockchain: cachedResult.blockchain,
          txCount: cachedResult.walletInfo?.txCount,
          tokens: cachedResult.tokenLaunchSummary?.totalLaunched,
        });

        // Log cache hit for performance metrics (Requirement 13.5)
        logger.trackCacheHit();
        logger.info("Cache hit", {
          requestId,
          walletAddress: normalizedAddress,
          blockchain,
          cacheKey,
        });

        await trackRequest(normalizedAddress, true, Date.now() - startTime);
        return NextResponse.json({
          ...cachedResult,
          cached: true,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log(
          `[CACHE] Cache MISS for address: ${normalizedAddress} (key: ${cacheKey})`
        );

        // Log cache miss for performance metrics (Requirement 13.5)
        logger.trackCacheMiss();
        logger.info("Cache miss", {
          requestId,
          walletAddress: normalizedAddress,
          blockchain,
          cacheKey,
        });
      }
    } else {
      console.log(
        `[CACHE] Force refresh requested for address: ${normalizedAddress} - bypassing cache`
      );
    }

    // Fetch data using provider manager
    console.log(`[API] Analyzing wallet: ${normalizedAddress}`);
    console.log(`[API] Request address normalized: ${normalizedAddress}`);

    // Track API call count for performance metrics (Requirement 13.5)
    const apiCallStart = Date.now();
    const [walletInfo, tokens] = await Promise.allSettled([
      providerManager.getWalletInfo(normalizedAddress, blockchain),
      providerManager.getTokensCreated(
        normalizedAddress,
        blockchain,
        forceRefresh,
        validatedTokens
      ),
    ]);
    const apiCallDuration = Date.now() - apiCallStart;

    // Log performance metrics
    logger.info("Provider data fetched", {
      requestId,
      duration: apiCallDuration,
      walletInfoStatus: walletInfo.status,
      tokensStatus: tokens.status,
    });

    // Handle results - check if providers actually failed vs returned empty data
    const walletInfoFailed = walletInfo.status === "rejected";
    const tokensFailed = tokens.status === "rejected";

    const walletData =
      walletInfo.status === "fulfilled"
        ? walletInfo.value
        : { createdAt: null, firstTxHash: null, txCount: 0, age: null };

    const tokenData = tokens.status === "fulfilled" ? tokens.value : [];

    console.log(
      `[API] Wallet info status: ${walletInfo.status}, Address: ${normalizedAddress}`
    );
    console.log(
      `[API] Wallet data for ${normalizedAddress}:`,
      JSON.stringify(walletData, null, 2)
    );
    console.log(
      `[API] Tokens status: ${tokens.status}, Address: ${normalizedAddress}`
    );
    console.log(
      `[API] Token data for ${normalizedAddress}:`,
      JSON.stringify(tokenData, null, 2)
    );

    if (walletInfoFailed) {
      console.error(
        `[API] Wallet info FAILED for ${normalizedAddress}:`,
        walletInfo.reason
      );
    }
    if (tokensFailed) {
      console.error(
        `[API] Tokens FAILED for ${normalizedAddress}:`,
        tokens.reason
      );
    }

    console.log(`Wallet info status:`, walletInfo.status);
    if (walletInfo.status === "rejected") {
      console.log(`Wallet info error:`, walletInfo.reason);
    }
    console.log(`Tokens status:`, tokens.status);
    if (tokens.status === "rejected") {
      console.log(`Tokens error:`, tokens.reason);
    }

    // Process token outcomes
    const tokenResults = tokenData.map((token) => {
      const { outcome, reason } = determineOutcome(token);
      return {
        ...token,
        outcome,
        reason,
      };
    });

    // Save to database (async, don't wait)
    // Implements: Requirements 1.5, 4.5, 9.1, 9.2 - Save enhanced metrics with blockchain
    Promise.all(
      tokenResults.map(async (token) => {
        try {
          // Check if record exists (with blockchain filter)
          const existing = await prisma.tokenLaunch.findFirst({
            where: {
              token: token.token,
              creator: normalizedAddress,
              blockchain, // Include blockchain in query
            },
          });

          if (existing) {
            // Update existing record with enhanced data
            await prisma.tokenLaunch.update({
              where: { id: existing.id },
              data: {
                outcome: token.outcome,
                reason: token.reason,
                // Enhanced fields (Requirement 1.5, 4.5)
                initialLiquidity: token.initialLiquidity,
                holdersAfter7Days: token.holdersAfter7Days,
                liquidityLocked: token.liquidityLocked,
                devSellRatio: token.devSellRatio,
                updatedAt: new Date(),
              },
            });
          } else {
            // Create new record with enhanced data (Requirement 9.1, 9.2)
            await prisma.tokenLaunch.create({
              data: {
                token: token.token,
                name: token.name,
                symbol: token.symbol,
                creator: normalizedAddress,
                blockchain, // Include blockchain field
                launchAt: token.launchAt
                  ? new Date(token.launchAt)
                  : new Date(),
                outcome: token.outcome,
                reason: token.reason,
                // Enhanced fields (Requirement 1.5, 4.5)
                initialLiquidity: token.initialLiquidity,
                holdersAfter7Days: token.holdersAfter7Days,
                liquidityLocked: token.liquidityLocked,
                devSellRatio: token.devSellRatio,
              },
            });
          }
        } catch (e) {
          console.warn(
            `Failed to save token ${token.token}:`,
            (e as Error).message
          );
        }
      })
    ).catch((e) => console.warn("Database save errors:", e));

    // Calculate trust score
    const scoring = computeScore(walletData, tokenResults);
    console.log(`Scoring result:`, scoring);

    // Determine discovery mode (Requirements 5.4, 5.5, 7.3)
    const discoveryMode: "manual" | "automatic" =
      validatedTokens && validatedTokens.length > 0 ? "manual" : "automatic";
    console.log(`[API] Discovery mode: ${discoveryMode}`);

    // Generate AI summary if enabled
    let aiSummary: string | null = null;
    console.log("[API] AI Service enabled:", aiSummaryService.isEnabled());
    if (aiSummaryService.isEnabled()) {
      console.log("[API] Attempting to generate AI summary...");
      try {
        // Extract data for AI summary
        const criticalRisks: string[] = [];
        const warnings: string[] = [];
        const positiveSignals: string[] = [];

        // Parse notes to extract categorized information
        let currentSection = "";
        for (const note of scoring.notes) {
          if (note === "CRITICAL RISKS:") {
            currentSection = "critical";
          } else if (note === "WARNINGS:") {
            currentSection = "warnings";
          } else if (note === "POSITIVE SIGNALS:") {
            currentSection = "positive";
          } else if (note === "ADDITIONAL INFO:" || note === "SUMMARY:") {
            currentSection = "";
          } else if (note.startsWith("  •")) {
            const text = note.replace("  • ", "");
            if (currentSection === "critical") criticalRisks.push(text);
            else if (currentSection === "warnings") warnings.push(text);
            else if (currentSection === "positive") positiveSignals.push(text);
          }
        }

        aiSummary = await aiSummaryService.generateSummary({
          score: scoring.score,
          walletAge: walletData.age || undefined,
          activity: walletData.txCount
            ? `${walletData.txCount} transactions`
            : undefined,
          criticalRisks,
          warnings,
          positiveSignals,
          tokenCount: tokenResults.length,
          confidence: scoring.confidence?.level || "UNKNOWN",
        });

        if (aiSummary) {
          console.log(
            "[API] ✅ AI summary generated successfully:",
            aiSummary.substring(0, 100) + "..."
          );
        } else {
          console.log("[API] ⚠️ AI summary returned null");
        }
      } catch (error) {
        console.error("[API] ❌ Failed to generate AI summary:", error);
        // Don't fail the request if AI summary fails
      }
    } else {
      console.log(
        "[API] ⚠️ AI Service is disabled - check GROQ_API_KEY in .env"
      );
    }

    // Prepare response
    console.log(
      "[API] Preparing response with aiSummary:",
      aiSummary ? "YES" : "NO"
    );
    const response = {
      score: Math.max(0, Math.min(100, scoring.score || 0)),
      blockchain, // Include detected blockchain type
      discoveryMode, // Indicate whether manual or automatic discovery was used
      aiSummary, // AI-generated summary (null if disabled or failed)
      breakdown: {
        walletAgeScore: scoring.breakdown.walletAgeScore || 0,
        activityScore: scoring.breakdown.activityScore || 0,
        tokenOutcomeScore: scoring.breakdown.tokenOutcomeScore || 0,
        heuristicsScore: scoring.breakdown.heuristicsScore || 0,
        final: Math.max(0, Math.min(100, scoring.score || 0)),
      },
      notes: scoring.notes || [],
      reason: "Deterministic score based on on-chain analysis",
      walletInfo: {
        createdAt: walletData.createdAt || null,
        firstTxHash: walletData.firstTxHash || null,
        txCount: walletData.txCount || 0,
        age: walletData.age || null,
      },
      tokenLaunchSummary: {
        totalLaunched: tokenResults.length,
        succeeded: tokenResults.filter((r) => r.outcome === "success").length,
        rugged: tokenResults.filter((r) => r.outcome === "rug").length,
        unknown: tokenResults.filter((r) => r.outcome === "unknown").length,
        tokens: tokenResults,
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        dataFreshness: forceRefresh ? "fresh" : ("cached" as const),
        providersUsed: (await providerManager.getProviderStatuses())
          .filter((p: any) => p.available)
          .map((p: any) => p.name),
        blockchain, // Also include in metadata for clarity
        discoveryMode, // Also include in metadata for clarity
      },
      // Include confidence level from scoring
      confidence: scoring.confidence,
    };

    console.log("Final response score:", response.score);
    console.log("Final response for address:", normalizedAddress, {
      score: response.score,
      txCount: response.walletInfo.txCount,
      tokens: response.tokenLaunchSummary.totalLaunched,
    });

    // Cache the result
    const cacheKey = CacheKeys.analysis(normalizedAddress, blockchain);
    console.log(
      `[CACHE] Storing result in cache with key: "${cacheKey}" for ${blockchain} address: ${normalizedAddress}`
    );
    console.log(`[CACHE] Storing data:`, {
      score: response.score,
      blockchain: response.blockchain,
      txCount: response.walletInfo.txCount,
      tokens: response.tokenLaunchSummary.totalLaunched,
    });
    await cache.set(cacheKey, response, { ttl: 300 }); // 5 minutes
    console.log(
      `[CACHE] Successfully cached result for ${blockchain} address: ${normalizedAddress}`
    );

    // Track successful request
    await trackRequest(normalizedAddress, true, Date.now() - startTime);

    // Log request completion (Requirement 12.1)
    logger.requestEnd(requestId, Date.now() - startTime, true);

    return NextResponse.json(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log error with full context (Requirement 12.4)
    logger.error("Request failed", error as Error, {
      requestId,
      walletAddress: address,
      blockchain,
      duration,
    });

    // Track failed request
    if (address) {
      await trackRequest(address, false, duration, (error as Error).message);
    }

    // Log request completion with failure
    logger.requestEnd(requestId, duration, false);

    // Handle different error types
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    // Log unexpected errors
    console.error("Unexpected analyze error:", error);

    return NextResponse.json(
      {
        error: ErrorMessages.INTERNAL_ERROR,
        code: "INTERNAL_ERROR",
        requestId,
      },
      { status: 500 }
    );
  }
}
