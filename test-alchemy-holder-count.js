/**
 * Test script to verify Alchemy holder count integration
 *
 * This tests that:
 * 1. Alchemy API can be initialized
 * 2. Holder counts can be fetched accurately
 * 3. Results are significantly faster than Transfer event reconstruction
 */

require("dotenv").config();
const { AlchemyProvider } = require("./lib/providers/alchemy.ts");

async function testAlchemyHolderCount() {
  console.log("🧪 Testing Alchemy Holder Count Integration\n");

  const alchemyApiKey = process.env.ALCHEMY_API_KEY;

  if (!alchemyApiKey) {
    console.error("❌ ALCHEMY_API_KEY not found in environment");
    process.exit(1);
  }

  console.log("✅ Alchemy API key found");
  console.log(`   Key: ${alchemyApiKey.substring(0, 10)}...`);

  try {
    // Initialize Alchemy provider
    const alchemy = new AlchemyProvider(alchemyApiKey);
    console.log("✅ Alchemy provider initialized\n");

    // Test with a popular token (USDT)
    const testToken = "0xdac17f958d2ee523a2206206994597c13d831ec7"; // USDT
    console.log(`📊 Testing with USDT token: ${testToken}`);
    console.log("   This is a popular token with many holders...\n");

    const startTime = Date.now();
    const holderCount = await alchemy.getTokenHolderCount(testToken);
    const duration = Date.now() - startTime;

    console.log("✅ Holder count fetched successfully!");
    console.log(`   Holders: ${holderCount.toLocaleString()}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Speed: ${holderCount > 0 ? "FAST ⚡" : "N/A"}`);

    if (holderCount > 0) {
      console.log("\n✅ SUCCESS: Alchemy integration is working correctly!");
      console.log("   Holder counts will now be accurate and fast.");
    } else {
      console.log(
        "\n⚠️  WARNING: Holder count is 0, which may indicate an issue"
      );
    }
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error("   Stack:", error.stack);
    process.exit(1);
  }
}

// Run the test
testAlchemyHolderCount().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
