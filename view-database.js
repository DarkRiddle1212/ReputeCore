// Script to view database contents
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("\n========== DATABASE CONTENTS ==========\n");

  // Get TokenLaunch records
  console.log("--- TOKEN LAUNCHES ---");
  const tokenLaunches = await prisma.tokenLaunch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(`Total records: ${tokenLaunches.length}`);

  if (tokenLaunches.length > 0) {
    // Summary by outcome
    const outcomes = tokenLaunches.reduce((acc, t) => {
      acc[t.outcome] = (acc[t.outcome] || 0) + 1;
      return acc;
    }, {});
    console.log("Outcomes:", outcomes);

    // Summary by blockchain
    const blockchains = tokenLaunches.reduce((acc, t) => {
      acc[t.blockchain] = (acc[t.blockchain] || 0) + 1;
      return acc;
    }, {});
    console.log("Blockchains:", blockchains);

    console.log("\nRecent tokens:");
    tokenLaunches.slice(0, 10).forEach((t, i) => {
      console.log(
        `${i + 1}. ${t.symbol || t.name || t.token.slice(0, 10)} | ${t.outcome} | ${t.blockchain} | Creator: ${t.creator.slice(0, 10)}...`
      );
    });
  }

  // Get WalletAnalysis records
  console.log("\n--- WALLET ANALYSES ---");
  const walletAnalyses = await prisma.walletAnalysis.findMany({
    orderBy: { lastAnalyzed: "desc" },
    take: 20,
  });
  console.log(`Total records: ${walletAnalyses.length}`);

  if (walletAnalyses.length > 0) {
    console.log("\nRecent analyses:");
    walletAnalyses.slice(0, 10).forEach((w, i) => {
      console.log(
        `${i + 1}. ${w.address.slice(0, 15)}... | Score: ${w.score} | ${w.blockchain} | Analyzed: ${w.analysisCount}x`
      );
    });
  }

  // Get ApiRequest records
  console.log("\n--- API REQUESTS ---");
  const apiRequests = await prisma.apiRequest.findMany({
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  console.log(`Total records: ${apiRequests.length}`);

  if (apiRequests.length > 0) {
    const successCount = apiRequests.filter((r) => r.success).length;
    console.log(
      `Success rate: ${successCount}/${apiRequests.length} (${Math.round((successCount / apiRequests.length) * 100)}%)`
    );

    console.log("\nRecent requests:");
    apiRequests.slice(0, 5).forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.address?.slice(0, 15) || "N/A"}... | ${r.success ? "✓" : "✗"} | ${r.duration}ms | ${r.timestamp.toISOString().slice(0, 19)}`
      );
    });
  }

  console.log("\n========================================\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
