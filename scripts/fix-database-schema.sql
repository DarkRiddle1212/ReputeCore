-- Fix database schema by adding missing tables and columns
-- This script safely adds missing components without losing existing data

-- 1. Add missing updatedAt column to TokenLaunch table
ALTER TABLE "TokenLaunch" 
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Add missing columns to TokenLaunch for enhanced analysis
ALTER TABLE "TokenLaunch" 
ADD COLUMN IF NOT EXISTS "initialLiquidity" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "holdersAfter7Days" INTEGER,
ADD COLUMN IF NOT EXISTS "liquidityLocked" BOOLEAN,
ADD COLUMN IF NOT EXISTS "devSellRatio" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "marketCap" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "volume24h" DOUBLE PRECISION;

-- 3. Create indexes for TokenLaunch (skip unique constraint if it causes conflicts)
CREATE INDEX IF NOT EXISTS "TokenLaunch_creator_idx" ON "TokenLaunch"("creator");
CREATE INDEX IF NOT EXISTS "TokenLaunch_outcome_idx" ON "TokenLaunch"("outcome");
CREATE INDEX IF NOT EXISTS "TokenLaunch_launchAt_idx" ON "TokenLaunch"("launchAt");

-- 4. Create WalletAnalysis table
CREATE TABLE IF NOT EXISTS "WalletAnalysis" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "notes" TEXT[] NOT NULL,
    "lastAnalyzed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAnalysis_pkey" PRIMARY KEY ("id")
);

-- 5. Create unique constraint and indexes for WalletAnalysis
CREATE UNIQUE INDEX IF NOT EXISTS "WalletAnalysis_address_key" ON "WalletAnalysis"("address");
CREATE INDEX IF NOT EXISTS "WalletAnalysis_score_idx" ON "WalletAnalysis"("score");
CREATE INDEX IF NOT EXISTS "WalletAnalysis_lastAnalyzed_idx" ON "WalletAnalysis"("lastAnalyzed");

-- 6. Create ApiRequest table
CREATE TABLE IF NOT EXISTS "ApiRequest" (
    "id" TEXT NOT NULL,
    "address" TEXT,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "duration" INTEGER NOT NULL,
    "error" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiRequest_pkey" PRIMARY KEY ("id")
);

-- 7. Create indexes for ApiRequest
CREATE INDEX IF NOT EXISTS "ApiRequest_ipAddress_idx" ON "ApiRequest"("ipAddress");
CREATE INDEX IF NOT EXISTS "ApiRequest_timestamp_idx" ON "ApiRequest"("timestamp");
CREATE INDEX IF NOT EXISTS "ApiRequest_success_idx" ON "ApiRequest"("success");

-- 8. Add update trigger for updatedAt columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to TokenLaunch
DROP TRIGGER IF EXISTS update_tokenlaunches_updated_at ON "TokenLaunch";
CREATE TRIGGER update_tokenlaunches_updated_at 
    BEFORE UPDATE ON "TokenLaunch" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to WalletAnalysis  
DROP TRIGGER IF EXISTS update_walletanalysis_updated_at ON "WalletAnalysis";
CREATE TRIGGER update_walletanalysis_updated_at 
    BEFORE UPDATE ON "WalletAnalysis" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();