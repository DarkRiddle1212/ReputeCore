// ESM script to query database
import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString:
    "postgresql://postgres.ubokbeiagpobhmikeyai:I1FzXCxBauHp8nNr@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
});

async function main() {
  await client.connect();

  console.log("\n========== DATABASE SUMMARY ==========\n");

  // Count TokenLaunches
  const tokenCount = await client.query(
    'SELECT COUNT(*) as count FROM "TokenLaunch"'
  );
  console.log(`TokenLaunch records: ${tokenCount.rows[0].count}`);

  // Outcomes breakdown
  const outcomes = await client.query(
    'SELECT outcome, COUNT(*) as count FROM "TokenLaunch" GROUP BY outcome'
  );
  console.log("Outcomes:", outcomes.rows);

  // Blockchain breakdown
  const blockchains = await client.query(
    'SELECT blockchain, COUNT(*) as count FROM "TokenLaunch" GROUP BY blockchain'
  );
  console.log("Blockchains:", blockchains.rows);

  // Recent tokens
  console.log("\nRecent tokens:");
  const recentTokens = await client.query(
    'SELECT symbol, name, outcome, blockchain, creator FROM "TokenLaunch" ORDER BY "createdAt" DESC LIMIT 10'
  );
  recentTokens.rows.forEach((t, i) => {
    console.log(
      `${i + 1}. ${t.symbol || t.name || "Unknown"} | ${t.outcome} | ${t.blockchain} | ${t.creator?.slice(0, 15)}...`
    );
  });

  // WalletAnalysis count
  const walletCount = await client.query(
    'SELECT COUNT(*) as count FROM "WalletAnalysis"'
  );
  console.log(`\nWalletAnalysis records: ${walletCount.rows[0].count}`);

  // Recent analyses
  const recentAnalyses = await client.query(
    'SELECT address, score, blockchain FROM "WalletAnalysis" ORDER BY "lastAnalyzed" DESC LIMIT 5'
  );
  if (recentAnalyses.rows.length > 0) {
    console.log("Recent analyses:");
    recentAnalyses.rows.forEach((w, i) => {
      console.log(
        `${i + 1}. ${w.address?.slice(0, 20)}... | Score: ${w.score} | ${w.blockchain}`
      );
    });
  }

  // ApiRequest count
  const apiCount = await client.query(
    'SELECT COUNT(*) as count FROM "ApiRequest"'
  );
  console.log(`\nApiRequest records: ${apiCount.rows[0].count}`);

  console.log("\n=======================================\n");

  await client.end();
}

main().catch(console.error);
