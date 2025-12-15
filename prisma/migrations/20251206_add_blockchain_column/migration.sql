-- Add blockchain column to TokenLaunch table
-- This migration adds support for multi-chain (Ethereum and Solana)

-- Add blockchain column with default value
ALTER TABLE "TokenLaunch" ADD COLUMN IF NOT EXISTS "blockchain" TEXT NOT NULL DEFAULT 'ethereum';

-- Add blockchain column to WalletAnalysis table
ALTER TABLE "WalletAnalysis" ADD COLUMN IF NOT EXISTS "blockchain" TEXT NOT NULL DEFAULT 'ethereum';

-- Clean up duplicates before adding unique constraint
-- Keep the most recent record for each (token, creator) combination
DELETE FROM "TokenLaunch"
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY token, creator ORDER BY "createdAt" DESC) as rn
    FROM "TokenLaunch"
  ) t
  WHERE t.rn > 1
);

-- Drop old unique constraint if it exists
ALTER TABLE "TokenLaunch" DROP CONSTRAINT IF EXISTS "TokenLaunch_token_creator_key";

-- Add new composite unique constraint with blockchain
ALTER TABLE "TokenLaunch" ADD CONSTRAINT "token_creator_blockchain" UNIQUE ("token", "creator", "blockchain");

-- Drop old unique constraint on WalletAnalysis if it exists
ALTER TABLE "WalletAnalysis" DROP CONSTRAINT IF EXISTS "WalletAnalysis_address_key";

-- Add new unique constraint with blockchain
ALTER TABLE "WalletAnalysis" ADD CONSTRAINT "WalletAnalysis_address_blockchain_key" UNIQUE ("address", "blockchain");

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "TokenLaunch_creator_blockchain_idx" ON "TokenLaunch"("creator", "blockchain");
CREATE INDEX IF NOT EXISTS "TokenLaunch_blockchain_idx" ON "TokenLaunch"("blockchain");
CREATE INDEX IF NOT EXISTS "WalletAnalysis_blockchain_idx" ON "WalletAnalysis"("blockchain");

-- Add comment
COMMENT ON COLUMN "TokenLaunch"."blockchain" IS 'Blockchain type: ethereum or solana';
COMMENT ON COLUMN "WalletAnalysis"."blockchain" IS 'Blockchain type: ethereum or solana';
