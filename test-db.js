const { Client } = require("pg");

const client = new Client({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres.ubokbeiagpobhmikeyai:I1FzXCxBauHp8nNr@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false },
});

async function test() {
  try {
    console.log("Connecting to Supabase...");
    await client.connect();
    console.log("✅ Connected successfully!\n");

    // Test query
    const tokenCount = await client.query(
      'SELECT COUNT(*) as count FROM "TokenLaunch"'
    );
    console.log("TokenLaunch records:", tokenCount.rows[0].count);

    const walletCount = await client.query(
      'SELECT COUNT(*) as count FROM "WalletAnalysis"'
    );
    console.log("WalletAnalysis records:", walletCount.rows[0].count);

    const apiCount = await client.query(
      'SELECT COUNT(*) as count FROM "ApiRequest"'
    );
    console.log("ApiRequest records:", apiCount.rows[0].count);

    // Get recent tokens
    const tokens = await client.query(
      'SELECT symbol, outcome, blockchain FROM "TokenLaunch" ORDER BY "createdAt" DESC LIMIT 5'
    );
    if (tokens.rows.length > 0) {
      console.log("\nRecent tokens:");
      tokens.rows.forEach((t, i) =>
        console.log(
          `  ${i + 1}. ${t.symbol || "N/A"} - ${t.outcome} (${t.blockchain})`
        )
      );
    }

    console.log("\n✅ Supabase is working correctly!");
  } catch (err) {
    console.error("❌ Database error:", err.message);
  } finally {
    await client.end();
  }
}

test();
