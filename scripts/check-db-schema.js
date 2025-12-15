// Check current database schema
const { PrismaClient } = require("../lib/generated/prisma/client");

async function checkSchema() {
  const prisma = new PrismaClient();

  try {
    console.log("🔍 Checking database schema...");

    // Check what tables exist
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;

    console.log("📋 Existing tables:");
    tables.forEach((table) => {
      console.log(`  - ${table.table_name}`);
    });

    // Check TokenLaunch table structure
    if (tables.some((t) => t.table_name === "TokenLaunch")) {
      console.log("\n🔍 TokenLaunch table columns:");
      const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'TokenLaunch' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `;

      columns.forEach((col) => {
        console.log(
          `  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`
        );
      });
    }

    // Check if WalletAnalysis exists
    if (tables.some((t) => t.table_name === "WalletAnalysis")) {
      console.log("\n✅ WalletAnalysis table exists");
    } else {
      console.log("\n❌ WalletAnalysis table missing");
    }

    // Check if ApiRequest exists
    if (tables.some((t) => t.table_name === "ApiRequest")) {
      console.log("✅ ApiRequest table exists");
    } else {
      console.log("❌ ApiRequest table missing");
    }
  } catch (error) {
    console.error("❌ Error checking schema:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
