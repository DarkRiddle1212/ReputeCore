/**
 * Script to apply database migrations
 * Run this when database connection is available
 */

import { PrismaClient } from "@/lib/generated/prisma/client";

const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log("Checking database connection...");
    await prisma.$connect();
    console.log("✓ Database connected");

    console.log("\nApplying migration: add_blockchain_column");

    // Check if blockchain column already exists
    const result = (await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'TokenLaunch' 
      AND column_name = 'blockchain'
    `) as any[];

    if (result.length > 0) {
      console.log("✓ blockchain column already exists");
    } else {
      console.log("Adding blockchain column...");

      // Add blockchain column to TokenLaunch
      await prisma.$executeRaw`
        ALTER TABLE "TokenLaunch" 
        ADD COLUMN "blockchain" TEXT NOT NULL DEFAULT 'ethereum'
      `;
      console.log("✓ Added blockchain column to TokenLaunch");

      // Add blockchain column to WalletAnalysis
      await prisma.$executeRaw`
        ALTER TABLE "WalletAnalysis" 
        ADD COLUMN "blockchain" TEXT NOT NULL DEFAULT 'ethereum'
      `;
      console.log("✓ Added blockchain column to WalletAnalysis");

      // Drop old unique constraints
      await prisma.$executeRaw`
        ALTER TABLE "TokenLaunch" 
        DROP CONSTRAINT IF EXISTS "TokenLaunch_token_creator_key"
      `;

      await prisma.$executeRaw`
        ALTER TABLE "WalletAnalysis" 
        DROP CONSTRAINT IF EXISTS "WalletAnalysis_address_key"
      `;
      console.log("✓ Dropped old unique constraints");

      // Add new composite unique constraints
      await prisma.$executeRaw`
        ALTER TABLE "TokenLaunch" 
        ADD CONSTRAINT "token_creator_blockchain" 
        UNIQUE ("token", "creator", "blockchain")
      `;

      await prisma.$executeRaw`
        ALTER TABLE "WalletAnalysis" 
        ADD CONSTRAINT "WalletAnalysis_address_blockchain_key" 
        UNIQUE ("address", "blockchain")
      `;
      console.log("✓ Added new unique constraints with blockchain");

      // Add indexes
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "TokenLaunch_creator_blockchain_idx" 
        ON "TokenLaunch"("creator", "blockchain")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "TokenLaunch_blockchain_idx" 
        ON "TokenLaunch"("blockchain")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "WalletAnalysis_blockchain_idx" 
        ON "WalletAnalysis"("blockchain")
      `;
      console.log("✓ Added indexes for blockchain columns");
    }

    console.log("\n✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration();
