import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const tokenCount = await prisma.tokenLaunch.count();
    console.log("✅ Supabase connected via Prisma!");
    console.log("TokenLaunch count:", tokenCount);

    const walletCount = await prisma.walletAnalysis.count();
    console.log("WalletAnalysis count:", walletCount);

    const apiCount = await prisma.apiRequest.count();
    console.log("ApiRequest count:", apiCount);

    const recentTokens = await prisma.tokenLaunch.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { symbol: true, outcome: true, blockchain: true },
    });

    if (recentTokens.length > 0) {
      console.log("\nRecent tokens:");
      recentTokens.forEach((t, i) =>
        console.log(
          `  ${i + 1}. ${t.symbol || "N/A"} - ${t.outcome} (${t.blockchain})`
        )
      );
    }
  } catch (err) {
    console.log("❌ Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
