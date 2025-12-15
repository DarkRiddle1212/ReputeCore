/**
 * Test script to verify full wallet analysis
 * Run with: node scripts/test-full-analysis.js
 */

require("dotenv").config();

const BASE_URL = "http://localhost:3000";

async function testFullAnalysis() {
  console.log("=== Full Analysis Test ===\n");

  // Test with a known token creator address
  // Using a random address that might have created tokens
  const testAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // Vitalik

  console.log(`Testing address: ${testAddress}\n`);

  try {
    console.log("Making API request...");
    const response = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        address: testAddress,
        forceRefresh: true,
      }),
    });

    const data = await response.json();

    console.log("\n=== Response ===");
    console.log("Status:", response.status);
    console.log("Score:", data.score);
    console.log("Wallet Info:", JSON.stringify(data.walletInfo, null, 2));
    console.log(
      "Token Summary:",
      JSON.stringify(data.tokenLaunchSummary, null, 2)
    );
    console.log("Notes:", data.notes);

    // Check if enhanced fields are populated
    if (data.tokenLaunchSummary && data.tokenLaunchSummary.tokens) {
      console.log("\n=== Token Details ===");
      for (const token of data.tokenLaunchSummary.tokens) {
        console.log(`\nToken: ${token.symbol || token.token}`);
        console.log(`  - initialLiquidity: ${token.initialLiquidity}`);
        console.log(`  - holdersAfter7Days: ${token.holdersAfter7Days}`);
        console.log(`  - liquidityLocked: ${token.liquidityLocked}`);
        console.log(`  - devSellRatio: ${token.devSellRatio}`);
      }
    }
  } catch (error) {
    console.error("Error:", error.message);
  }

  console.log("\n=== Test Complete ===");
}

testFullAnalysis().catch(console.error);
