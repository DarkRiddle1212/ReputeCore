// Test the updated Etherscan provider
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

async function testProviderFix() {
  const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
  console.log("=== Testing Etherscan Provider Fix ===");
  console.log("API Key loaded:", ETHERSCAN_API_KEY ? "YES" : "NO");

  // Test address with known transactions (Vitalik)
  const testAddress = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

  // Test V2 API directly
  console.log("\n--- Testing V2 API ---");
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${testAddress}&startblock=0&endblock=99999999&page=1&offset=5&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    console.log("Status:", response.status);
    console.log("Response status:", data.status);
    console.log("Response message:", data.message);
    console.log(
      "Number of transactions:",
      Array.isArray(data.result) ? data.result.length : 0
    );

    if (
      data.status === "1" &&
      Array.isArray(data.result) &&
      data.result.length > 0
    ) {
      console.log("✅ V2 API is working!");
      console.log("First transaction:", {
        hash: data.result[0].hash,
        timestamp: data.result[0].timeStamp,
        from: data.result[0].from,
        to: data.result[0].to,
      });
    } else {
      console.log("❌ V2 API returned unexpected result");
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

testProviderFix().catch(console.error);
